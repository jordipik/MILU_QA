#!/usr/bin/env python3
"""Multi-engine PDF table extractor for Alentio projects.

The script is intentionally defensive: every optional engine reports its own
status, timing and problems, and the best usable result is returned.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


HEADER_HINTS = {
    "item": ["ITEM", "POS", "POSITION"],
    "partNo": ["PART NO", "PART NO.", "PART NUMBER", "PN", "P/N"],
    "references": ["REFERENCES", "REFERENCE", "REF"],
    "model_type": ["MODEL/TYPE", "MODEL TYPE", "MODEL"],
    "qty": ["QTY", "QTY.", "QUANTITY", "CANT"],
    "description": ["DESCRIPTION", "DESIGNATION", "DESC"],
    "notes": ["NOTES", "NOTE", "STANDARD", "ERRORS", "ERRORES", "REMARKS"],
}

PREFERRED_ORDER = ["item", "partNo", "references", "qty", "description", "notes"]


@dataclass
class EngineRun:
    name: str
    started: float
    status: str = "not_run"
    tables_detected: int = 0
    rows_extracted: int = 0
    precision: float = 0.0
    problems: Optional[List[str]] = None

    def done(self, status: str, result: Optional[Dict[str, Any]] = None, problems: Optional[List[str]] = None) -> Dict[str, Any]:
        self.status = status
        self.problems = list(problems or self.problems or [])
        if result:
            self.tables_detected = int(result.get("tablesDetected") or 0)
            self.rows_extracted = len(result.get("rows") or [])
            self.precision = float(result.get("precision") or 0)
        return {
            "name": self.name,
            "status": self.status,
            "tablesDetected": self.tables_detected,
            "rowsExtracted": self.rows_extracted,
            "precision": round(self.precision, 4),
            "processMs": round((time.perf_counter() - self.started) * 1000),
            "problems": self.problems,
        }


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def norm(value: Any) -> str:
    return clean_text(value).upper().replace(":", "").replace(".", "")


def import_optional(module_name: str):
    try:
        return importlib.import_module(module_name), None
    except Exception as exc:  # pragma: no cover - depends on runtime env
        return None, str(exc)


def column_key_from_label(label: str, index: int) -> str:
    label_norm = norm(label)
    for key, hints in HEADER_HINTS.items():
        if any(hint.replace(".", "") in label_norm for hint in hints):
            return key
    slug = re.sub(r"[^a-z0-9]+", "_", clean_text(label).lower()).strip("_")
    return slug[:42] or f"col_{index + 1}"


def normalize_columns(labels: Sequence[str]) -> List[Dict[str, Any]]:
    columns = []
    seen = set()
    for index, label in enumerate(labels):
        text = clean_text(label)
        if not text:
            text = f"Columna {index + 1}"
        key = column_key_from_label(text, index)
        base = key
        suffix = 2
        while key in seen:
            key = f"{base}_{suffix}"
            suffix += 1
        seen.add(key)
        columns.append({"key": key, "label": text.upper(), "dynamic": True})
    return columns


def score_rows(rows: Sequence[Dict[str, Any]], columns: Sequence[Dict[str, Any]]) -> float:
    if not rows or not columns:
        return 0.0
    known_columns = {column["key"] for column in columns}
    filled_cells = 0
    total_cells = max(1, len(rows) * len(columns))
    rows_with_anchor = 0
    rows_with_three_values = 0
    for row in rows:
        cells = row.get("cells") or {}
        values = [clean_text(cells.get(key)) for key in known_columns]
        filled = [value for value in values if value]
        filled_cells += len(filled)
        if clean_text(cells.get("partNo") or cells.get("part_no") or cells.get("item") or row.get("partNo")):
            rows_with_anchor += 1
        if len(filled) >= 3:
            rows_with_three_values += 1
    density = filled_cells / total_cells
    anchor = rows_with_anchor / max(1, len(rows))
    shape = rows_with_three_values / max(1, len(rows))
    return min(0.99, (density * 0.35) + (anchor * 0.35) + (shape * 0.30))


def make_result(engine: str, columns: List[Dict[str, Any]], rows: List[Dict[str, Any]], page_count: int, problems: Optional[List[str]] = None) -> Dict[str, Any]:
    precision = score_rows(rows, columns)
    table_pages = len({int(row.get("page") or 0) for row in rows if row.get("page")})
    return {
        "engine": engine,
        "pageCount": page_count,
        "tablesDetected": table_pages,
        "rows": rows,
        "columns": columns,
        "headerLabels": {column["key"]: column["label"] for column in columns},
        "precision": precision,
        "problems": list(problems or []),
    }


def row_from_cells(page: int, row_index: int, columns: Sequence[Dict[str, Any]], values: Sequence[Any]) -> Optional[Dict[str, Any]]:
    cells = {}
    for column, value in zip(columns, values):
        text = clean_text(value)
        if text:
            cells[column["key"]] = text
    if len(cells) < 2:
        return None
    return {
        "id": f"p{page}-r{row_index}",
        "page": str(page),
        "cells": cells,
        "status": "Pendiente",
        "edited": False,
    }


def looks_like_part_number(value: Any) -> bool:
    text = clean_text(value).upper()
    return bool(re.search(r"\d", text) and re.fullmatch(r"[A-Z0-9./_-]{5,}", text))


def looks_like_quantity(value: Any) -> bool:
    text = clean_text(value)
    return bool(re.fullmatch(r"\d{1,4}(?:[.,]\d{1,3})?", text))


def looks_like_unit(value: Any) -> bool:
    text = norm(value)
    return text in {"PC", "PCS", "PCE", "EA", "ST", "SET", "KG", "KGM", "GRM", "G", "TO"}


def looks_like_weight(value: Any) -> bool:
    text = clean_text(value).upper()
    return bool(re.fullmatch(r"\d+(?:[.,]\d+)?\s*(?:KG|KGM|GRM|G|TO)", text))


def looks_like_measurement(value: Any) -> bool:
    text = clean_text(value).upper()
    return bool(re.search(r"\b(?:M|A|D|AB|ID|L)\s*[=.-]?\s*\d", text) or re.search(r"\d+\s*X\s*\d+", text))


def looks_like_standard_or_error(value: Any) -> bool:
    text = clean_text(value).upper()
    return bool(re.match(r"^(DIN|ISO|MMN|MTN|MBN|N\d|REPARACION|ERROR)", text))


def looks_like_model(value: Any) -> bool:
    text = clean_text(value).upper()
    if not text:
        return False
    if re.fullmatch(r"12V[A-Z0-9./_-]*", text):
        return True
    if re.fullmatch(r"(?:BR|GR|EMB|EMU|EPROM|EEPROM|MEM|KPT|KPSE|LSAM)[A-Z0-9./_ -]*", text):
        return True
    if re.fullmatch(r"[A-Z]{1,4}\s?\d{1,5}[A-Z0-9./_ -]*", text) and len(text.split()) <= 3:
        return True
    return False


def append_cell(cells: Dict[str, str], target: str, value: Any) -> None:
    text = clean_text(value)
    if not text:
        return
    current = clean_text(cells.get(target))
    cells[target] = clean_text(f"{current} {text}" if current else text)


def merge_geometry(target: Dict[str, Any], source: Dict[str, Any]) -> Dict[str, Any]:
    if not target:
        return dict(source or {})
    if not source:
        return dict(target or {})
    return {
        "page": target.get("page") or source.get("page"),
        "x1": min(float(target.get("x1", 0)), float(source.get("x1", 0))),
        "x2": max(float(target.get("x2", 0)), float(source.get("x2", 0))),
        "y1": min(float(target.get("y1", 0)), float(source.get("y1", 0))),
        "y2": max(float(target.get("y2", 0)), float(source.get("y2", 0))),
        "pageWidth": target.get("pageWidth") or source.get("pageWidth"),
        "pageHeight": target.get("pageHeight") or source.get("pageHeight"),
    }


def move_cell(row: Dict[str, Any], source: str, target: str) -> None:
    cells = row.get("cells") or {}
    value = clean_text(cells.get(source))
    if not value:
        return
    append_cell(cells, target, value)
    cells.pop(source, None)
    geometries = row.get("cellGeometry") or {}
    if source in geometries:
        geometries[target] = merge_geometry(geometries.get(target), geometries.get(source))
        geometries.pop(source, None)


def split_weight_unit(row: Dict[str, Any], number_key: str, unit_key: str) -> None:
    cells = row.get("cells") or {}
    number = clean_text(cells.get(number_key))
    unit = clean_text(cells.get(unit_key))
    if not number or not unit:
        return
    if not re.fullmatch(r"\d+(?:[.,]\d+)?", number) or not looks_like_unit(unit):
        return
    cells["weight"] = clean_text(f"{number} {unit}")
    geometries = row.get("cellGeometry") or {}
    geometries["weight"] = merge_geometry(geometries.get(number_key), geometries.get(unit_key))
    cells.pop(number_key, None)
    cells.pop(unit_key, None)
    geometries.pop(number_key, None)
    geometries.pop(unit_key, None)


def split_combined_cell(row: Dict[str, Any], source: str, patterns: Sequence[Tuple[re.Pattern[str], Sequence[str]]]) -> None:
    cells = row.get("cells") or {}
    value = clean_text(cells.get(source))
    if not value:
        return
    for pattern, targets in patterns:
        match = pattern.match(value)
        if not match:
            continue
        groups = [clean_text(group) for group in match.groups()]
        if len(groups) != len(targets):
            continue
        for target, group in zip(targets, groups):
            if group:
                append_cell(cells, target, group)
        if source not in targets:
            cells.pop(source, None)
        geometries = row.get("cellGeometry") or {}
        if source in geometries:
            for target, group in zip(targets, groups):
                if group:
                    geometries[target] = merge_geometry(geometries.get(target), geometries.get(source))
            geometries.pop(source, None)
        return


def extract_trailing_quantity(row: Dict[str, Any], source: str) -> None:
    cells = row.get("cells") or {}
    if clean_text(cells.get("qty")):
        return
    value = clean_text(cells.get(source))
    if not value:
        return
    match = re.match(r"^(.+?)\s+(\d{1,4})$", value)
    if not match:
        return
    prefix = clean_text(match.group(1))
    qty = clean_text(match.group(2))
    if not prefix or not (clean_text(cells.get("units")) or clean_text(cells.get("model_type")) or clean_text(cells.get("model")) or clean_text(cells.get("weight"))):
        return
    cells[source] = prefix
    cells["qty"] = qty
    geometries = row.get("cellGeometry") or {}
    if source in geometries:
        geometries["qty"] = merge_geometry(geometries.get("qty"), geometries.get(source))


def clean_extracted_cells(cells: Dict[str, str]) -> Dict[str, str]:
    cleaned = dict(cells)

    item = clean_text(cleaned.get("item"))
    part_no = clean_text(cleaned.get("partNo"))
    if item and not part_no:
        match = re.match(r"^(\d{1,4}[A-Z]?)\s+([A-Z0-9][A-Z0-9./_-]{4,})$", item, flags=re.I)
        if match:
            cleaned["item"] = match.group(1)
            cleaned["partNo"] = match.group(2)

    description = clean_text(cleaned.get("description"))
    model = clean_text(cleaned.get("model_type"))
    if description and not model:
        match = re.match(r"^(.+?)\s+(12V[A-Z0-9./_-]{2,})$", description, flags=re.I)
        if match:
            cleaned["description"] = clean_text(match.group(1))
            cleaned["model_type"] = clean_text(match.group(2))
        else:
            match = re.match(r"^(.+?)\s+((?:EEPROM|EPROM|EMB|EMU|KPT|KPSE|BR|GR|LSAM)\b.+)$", description, flags=re.I)
            if match:
                cleaned["description"] = clean_text(match.group(1))
                cleaned["model_type"] = clean_text(match.group(2))

    return cleaned


def model_key_for(cells: Dict[str, str]) -> str:
    return "model_type" if "model_type" in cells or "model" not in cells else "model"


def repair_row_cells_and_geometry(row: Dict[str, Any]) -> Dict[str, Any]:
    row["cells"] = clean_extracted_cells(row.get("cells") or {})
    cells = row["cells"]
    model_key = model_key_for(cells)

    split_combined_cell(row, "units_weight", [
        (re.compile(r"^(PC|PCS|PCE|EA|ST|SET)\s+(\d+(?:[.,]\d+)?\s*(?:KG|KGM|GRM|G|TO))$", re.I), ("units", "weight")),
    ])
    split_combined_cell(row, "fn_measurement", [
        (re.compile(r"^(EM|MN|KE|AB)\s+(.+)$", re.I), ("fn", "measurement")),
    ])
    split_combined_cell(row, "units_weight_fn_measurement", [
        (re.compile(r"^(PC|PCS|PCE|EA|ST|SET)\s+(\d+(?:[.,]\d+)?\s*(?:KG|KGM|GRM|G|TO))\s+(.+)$", re.I), ("units", "weight", "measurement")),
        (re.compile(r"^(PC|PCS|PCE|EA|ST|SET)\s+(.+)$", re.I), ("units", "measurement")),
    ])

    model = clean_text(cells.get(model_key))
    description = clean_text(cells.get("description"))
    if model and description:
        model_with_prefix = re.match(r"^(.+?)\s+(12V[A-Z0-9./_-]+)$", model, flags=re.I)
        if model_with_prefix:
            append_cell(cells, "description", model_with_prefix.group(1))
            cells[model_key] = clean_text(model_with_prefix.group(2))
        elif not looks_like_model(model) and not looks_like_measurement(model):
            move_cell(row, model_key, "description")
        extract_trailing_quantity(row, "description")

    qty = clean_text(cells.get("qty"))
    if qty and not looks_like_quantity(qty):
        if looks_like_measurement(qty):
            move_cell(row, "qty", "measurement")
        elif clean_text(cells.get(model_key)):
            move_cell(row, "qty", model_key)
        else:
            move_cell(row, "qty", "description")

    units = clean_text(cells.get("units"))
    if units and not looks_like_unit(units):
        if looks_like_measurement(units):
            move_cell(row, "units", "measurement")
        elif looks_like_weight(units):
            move_cell(row, "units", "weight")
        elif clean_text(cells.get("description")) and not looks_like_model(units) and not looks_like_standard_or_error(units):
            move_cell(row, "units", "description")

    split_weight_unit(row, "weight", "fn")
    split_weight_unit(row, "weight", "measurement")
    split_weight_unit(row, "units", "weight")

    weight = clean_text(cells.get("weight"))
    if weight and not looks_like_weight(weight):
        parts = weight.split()
        if len(parts) >= 2 and looks_like_unit(parts[-1]) and re.fullmatch(r"\d+(?:[.,]\d+)?", parts[-2]):
            cells["weight"] = clean_text(" ".join(parts[-2:]))
            prefix = clean_text(" ".join(parts[:-2]))
            if prefix:
                append_cell(cells, "measurement" if looks_like_measurement(prefix) else "description", prefix)

    standard = clean_text(cells.get("standard") or cells.get("notes"))
    standard_key = "standard" if "standard" in cells else "notes"
    if standard:
        match = re.match(r"^(\d+(?:[.,]\d+)?\s*(?:KG|KGM|GRM|G|TO))\s+(.+)$", standard, flags=re.I)
        if match and not clean_text(cells.get("weight")):
            cells["weight"] = clean_text(match.group(1))
            cells[standard_key] = clean_text(match.group(2))

    extract_trailing_quantity(row, "description")
    extract_trailing_quantity(row, model_key)

    return row


def is_probably_data_cells(cells: Dict[str, str]) -> bool:
    text = norm(" ".join(cells.values()))
    if not text:
        return False
    if any(token in text for token in [
        "COPYRIGHT",
        "ALL RIGHTS RESERVED",
        "BUSINESS PORTAL",
        "ONLINE PRINT",
        "PAGE ",
        "EQUI TYPE",
        "SERIAL NUMBER",
        "PRODUCT TYPE",
        "BOM-NO",
    ]):
        return False

    item = clean_text(cells.get("item"))
    part_no = clean_text(cells.get("partNo"))
    description = clean_text(cells.get("description"))
    qty = clean_text(cells.get("qty"))
    has_item = bool(re.fullmatch(r"\d{1,4}[A-Z]?", item))
    has_part_no = looks_like_part_number(part_no)
    has_description = bool(description and re.search(r"[A-Z]{2,}", description.upper()))
    has_qty = bool(re.fullmatch(r"\d+(?:[.,]\d+)?", qty))

    return (has_item and (has_part_no or has_description or has_qty)) or (has_part_no and has_description)


def detect_header_from_words(words: Sequence[Tuple[float, float, float, float, str, int, int, int]], page_width: float) -> Optional[Dict[str, Any]]:
    lines = group_words_by_line(words)
    best = None
    for line_index, line in enumerate(lines):
        text = norm(" ".join(word[4] for word in line))
        hits = sum(1 for hints in HEADER_HINTS.values() if any(h.replace(".", "") in text for h in hints))
        if hits < 3:
            continue
        coverage = (max(word[2] for word in line) - min(word[0] for word in line)) / max(1.0, page_width)
        score = hits * 4 + coverage
        if not best or score > best["score"]:
            best = {"score": score, "lineIndex": line_index, "line": line, "lines": lines}
    if not best:
        return None

    raw_clusters = cluster_header_words(best["line"])
    if len(raw_clusters) < 3:
        return None

    labels = [clean_text(" ".join(word[4] for word in cluster)) for cluster in raw_clusters]
    normalized_columns = normalize_columns(labels)
    columns = []
    for index, cluster in enumerate(raw_clusters):
        columns.append({
            **normalized_columns[index],
            "left": min(word[0] for word in cluster),
            "right": max(word[2] for word in cluster),
            "center": (min(word[0] for word in cluster) + max(word[2] for word in cluster)) / 2,
        })

    columns = build_column_bounds(columns, page_width)
    return {
        "lineIndex": best["lineIndex"],
        "columns": columns,
        "lines": best["lines"],
        "headerBottom": max(word[3] for word in best["line"]),
    }


def group_words_by_line(words: Sequence[Tuple[float, float, float, float, str, int, int, int]]) -> List[List[Tuple[float, float, float, float, str, int, int, int]]]:
    lines: List[List[Tuple[float, float, float, float, str, int, int, int]]] = []
    for word in sorted(words, key=lambda item: ((item[1] + item[3]) / 2, item[0])):
        center_y = (word[1] + word[3]) / 2
        target = None
        for line in lines:
            line_center = sum((item[1] + item[3]) / 2 for item in line) / len(line)
            if abs(line_center - center_y) <= 4.5:
                target = line
                break
        if target is None:
            target = []
            lines.append(target)
        target.append(word)
    return [sorted(line, key=lambda item: item[0]) for line in lines]


def cluster_header_words(line: Sequence[Tuple[float, float, float, float, str, int, int, int]]) -> List[List[Tuple[float, float, float, float, str, int, int, int]]]:
    clusters: List[List[Tuple[float, float, float, float, str, int, int, int]]] = []
    for word in sorted(line, key=lambda item: item[0]):
        if not clusters:
            clusters.append([word])
            continue
        previous = clusters[-1][-1]
        gap = word[0] - previous[2]
        candidate = norm(" ".join([*(item[4] for item in clusters[-1]), word[4]]))
        if candidate in {"PART NO", "PART NUMBER", "MODEL TYPE"} or gap <= 6:
            clusters[-1].append(word)
        else:
            clusters.append([word])
    return clusters


def build_column_bounds(columns: List[Dict[str, Any]], page_width: float) -> List[Dict[str, Any]]:
    ordered = sorted(columns, key=lambda column: column["left"])
    for index, column in enumerate(ordered):
        prev_col = ordered[index - 1] if index else None
        next_col = ordered[index + 1] if index + 1 < len(ordered) else None
        x1 = ((prev_col["right"] + column["left"]) / 2) if prev_col else max(0, column["left"] - 8)
        x2 = ((column["right"] + next_col["left"]) / 2) if next_col else min(page_width, column["right"] + 80)
        column["x1"] = x1
        column["x2"] = x2
    return ordered


def assign_word_to_column(word: Tuple[float, float, float, float, str, int, int, int], columns: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    left, _, right, _, _, *_ = word
    center = (left + right) / 2
    overlaps = []
    for column in columns:
        overlap = max(0.0, min(right, column["x2"]) - max(left, column["x1"]))
        distance = abs(center - column["center"])
        if overlap > 0:
            overlaps.append((overlap, -distance, column))
    if overlaps:
        return sorted(overlaps, reverse=True)[0][2]
    return min(columns, key=lambda column: abs(center - column["center"])) if columns else None


def run_pymupdf(pdf_path: Path) -> Tuple[Dict[str, Any], List[str]]:
    fitz, import_error = import_optional("fitz")
    if not fitz:
        raise RuntimeError(f"PyMuPDF no disponible: {import_error}")

    doc = fitz.open(str(pdf_path))
    all_rows: List[Dict[str, Any]] = []
    detected_columns: List[Dict[str, Any]] = []
    problems: List[str] = []
    row_count = 0

    for page_index, page in enumerate(doc, start=1):
        words = page.get_text("words") or []
        if not words:
            continue
        header = detect_header_from_words(words, float(page.rect.width))
        if not header:
            continue
        columns = header["columns"]
        if len(columns) > len(detected_columns):
            detected_columns = columns

        for line in header["lines"][header["lineIndex"] + 1:]:
            line_text = norm(" ".join(word[4] for word in line))
            if not line_text:
                continue
            if line_text.startswith("SERVICE OPTIONS"):
                problems.append(f"Pagina {page_index}: seccion Service Options detectada.")
                continue
            if any(token in line_text for token in ["COPYRIGHT", "ALL RIGHTS RESERVED"]):
                continue

            values_by_key = {column["key"]: [] for column in columns}
            geometry_by_key = {}
            for word in line:
                if word[1] <= header["headerBottom"] + 1:
                    continue
                column = assign_word_to_column(word, columns)
                if not column:
                    continue
                values_by_key[column["key"]].append(word[4])
                geometry_by_key.setdefault(column["key"], []).append(word)

            values = [clean_text(" ".join(values_by_key[column["key"]])) for column in columns]
            row = row_from_cells(page_index, row_count + 1, columns, values)
            if not row:
                continue

            cell_geometry = {}
            for key, cell_words in geometry_by_key.items():
                if not cell_words:
                    continue
                cell_geometry[key] = {
                    "page": page_index,
                    "x1": min(word[0] for word in cell_words),
                    "x2": max(word[2] for word in cell_words),
                    "y1": min(word[1] for word in cell_words),
                    "y2": max(word[3] for word in cell_words),
                    "pageWidth": float(page.rect.width),
                    "pageHeight": float(page.rect.height),
                }
            row["cellGeometry"] = cell_geometry
            row = repair_row_cells_and_geometry(row)
            if not is_probably_data_cells(row["cells"]):
                continue
            row_count += 1
            all_rows.append(row)

    columns = [
        {key: value for key, value in column.items() if key in {"key", "label", "dynamic"}}
        for column in detected_columns
    ]
    return make_result("pymupdf", columns, all_rows, len(doc), problems), problems


def rows_from_dataframe(table: Any, page: int, offset: int) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    values = table.values.tolist() if hasattr(table, "values") else []
    rows = [[clean_text(cell) for cell in row] for row in values if any(clean_text(cell) for cell in row)]
    if len(rows) < 2:
        return [], []
    columns = normalize_columns(rows[0])
    output = []
    for index, values_row in enumerate(rows[1:], start=offset):
        row = row_from_cells(page, index, columns, values_row)
        if row:
            output.append(row)
    return columns, output


def run_pdfplumber(pdf_path: Path) -> Tuple[Dict[str, Any], List[str]]:
    pdfplumber, import_error = import_optional("pdfplumber")
    if not pdfplumber:
        raise RuntimeError(f"pdfplumber no disponible: {import_error}")
    rows: List[Dict[str, Any]] = []
    columns: List[Dict[str, Any]] = []
    problems: List[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_index, page in enumerate(pdf.pages, start=1):
            tables = page.extract_tables() or []
            for table in tables:
                clean_table = [[clean_text(cell) for cell in row] for row in table if row and any(clean_text(cell) for cell in row)]
                if len(clean_table) < 2:
                    continue
                page_columns = normalize_columns(clean_table[0])
                if len(page_columns) > len(columns):
                    columns = page_columns
                for values in clean_table[1:]:
                    row = row_from_cells(page_index, len(rows) + 1, page_columns, values)
                    if row:
                        rows.append(row)
    return make_result("pdfplumber", columns, rows, len(pdf.pages), problems), problems


def run_camelot(pdf_path: Path) -> Tuple[Dict[str, Any], List[str]]:
    camelot, import_error = import_optional("camelot")
    if not camelot:
        raise RuntimeError(f"Camelot no disponible: {import_error}")
    rows: List[Dict[str, Any]] = []
    columns: List[Dict[str, Any]] = []
    problems: List[str] = []
    for flavor in ("lattice", "stream"):
        try:
            tables = camelot.read_pdf(str(pdf_path), pages="all", flavor=flavor)
        except Exception as exc:
            problems.append(f"Camelot {flavor}: {exc}")
            continue
        for table_index, table in enumerate(tables, start=1):
            page_columns, page_rows = rows_from_dataframe(table.df, table_index, len(rows) + 1)
            if len(page_columns) > len(columns):
                columns = page_columns
            rows.extend(page_rows)
        if rows:
            break
    return make_result("camelot", columns, rows, 0, problems), problems


def run_tabula(pdf_path: Path) -> Tuple[Dict[str, Any], List[str]]:
    tabula, import_error = import_optional("tabula")
    if not tabula:
        raise RuntimeError(f"Tabula no disponible: {import_error}")
    tables = tabula.read_pdf(str(pdf_path), pages="all", multiple_tables=True)
    rows: List[Dict[str, Any]] = []
    columns: List[Dict[str, Any]] = []
    for table_index, table in enumerate(tables or [], start=1):
        page_columns, page_rows = rows_from_dataframe(table, table_index, len(rows) + 1)
        if len(page_columns) > len(columns):
            columns = page_columns
        rows.extend(page_rows)
    return make_result("tabula", columns, rows, 0), []


def pick_best(results: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    usable = [result for result in results if result.get("rows")]
    if not usable:
        return make_result("none", [], [], 0, ["Ningun motor devolvio filas utiles."])
    return sorted(
        usable,
        key=lambda result: (float(result.get("precision") or 0), len(result.get("rows") or []), result.get("tablesDetected") or 0),
        reverse=True,
    )[0]


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--project", default="")
    parser.add_argument("--file-name", default="")
    args = parser.parse_args(argv)

    pdf_path = Path(args.pdf)
    started = time.perf_counter()
    engine_reports = []
    engine_results = []

    primary_runners = [
        ("pymupdf", run_pymupdf),
        ("pdfplumber", run_pdfplumber),
    ]
    heavy_runners = [
        ("camelot", run_camelot),
        ("tabula", run_tabula),
    ]
    full_benchmark = os.getenv("PDF_EXTRACTOR_FULL_BENCHMARK", "").strip().lower() in {"1", "true", "yes"}

    for name, runner in primary_runners:
        run = EngineRun(name=name, started=time.perf_counter(), problems=[])
        try:
            result, problems = runner(pdf_path)
            engine_results.append(result)
            engine_reports.append(run.done("ok" if result.get("rows") else "empty", result, problems))
        except Exception as exc:
            engine_reports.append(run.done("unavailable", None, [str(exc)]))

    has_primary_result = any(result.get("rows") for result in engine_results)
    if full_benchmark or not has_primary_result:
        for name, runner in heavy_runners:
            run = EngineRun(name=name, started=time.perf_counter(), problems=[])
            try:
                result, problems = runner(pdf_path)
                engine_results.append(result)
                engine_reports.append(run.done("ok" if result.get("rows") else "empty", result, problems))
            except Exception as exc:
                engine_reports.append(run.done("unavailable", None, [str(exc)]))
    else:
        for name, _runner in heavy_runners:
            engine_reports.append({
                "name": name,
                "status": "skipped",
                "tablesDetected": 0,
                "rowsExtracted": 0,
                "precision": 0.0,
                "processMs": 0,
                "problems": ["Omitido porque un motor rapido ya devolvio filas. Activa PDF_EXTRACTOR_FULL_BENCHMARK=true para auditar todos los motores."],
            })

    vision_endpoint = os.getenv("PDF_EXTRACTOR_VISION_ENDPOINT", "").strip()
    engine_reports.append({
        "name": "llm_vision",
        "status": "configured" if vision_endpoint else "skipped",
        "tablesDetected": 0,
        "rowsExtracted": 0,
        "precision": 0.0,
        "processMs": 0,
        "problems": [] if vision_endpoint else [
            "Motor IA/Vision no configurado. Define PDF_EXTRACTOR_VISION_ENDPOINT para integrarlo como ultimo recurso."
        ],
    })

    best = pick_best(engine_results)
    report = {
        "projectId": args.project,
        "fileName": args.file_name or pdf_path.name,
        "selectedEngine": best.get("engine"),
        "tablesDetected": int(best.get("tablesDetected") or 0),
        "rowsExtracted": len(best.get("rows") or []),
        "precision": round(float(best.get("precision") or 0), 4),
        "processMs": round((time.perf_counter() - started) * 1000),
        "problems": best.get("problems") or [],
        "engines": engine_reports,
    }
    payload = {
        "report": report,
        "workspace": {
            "fileName": args.file_name or pdf_path.name,
            "pageCount": int(best.get("pageCount") or 0),
            "columns": best.get("columns") or [],
            "headerLabels": best.get("headerLabels") or {},
            "rows": best.get("rows") or [],
            "extractionReport": report,
        },
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
