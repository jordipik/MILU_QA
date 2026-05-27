#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

import fitz


ROOT_DIR = Path(__file__).resolve().parents[1]

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from generate_esquema_pos import get_scheme_boxes, resolve_pdf_path


def load_json_array(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"JSON invalido en {path.name}: se esperaba una lista")
    rows: List[Dict[str, Any]] = []
    for item in data:
        if isinstance(item, dict):
            rows.append(item)
    return rows


def save_json_array(path: Path, rows: Sequence[Dict[str, Any]]) -> None:
    path.write_text(json.dumps(list(rows), ensure_ascii=False, indent=2), encoding="utf-8")


def coerce_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except Exception:
        return None


def resolve_engine_json(engine: str) -> Path:
    model = engine.removeprefix("engine_").removesuffix(".json")
    path = ROOT_DIR / f"engine_{model}.json"
    if not path.exists():
        raise FileNotFoundError(f"No existe {path.name} en la raiz")
    return path


def build_schema_names_by_page(engine_model: str, pdf_path: Path, ext: str, page_offset: int) -> Dict[int, List[str]]:
    ext_clean = ext.lower().lstrip(".")
    mapping: Dict[int, List[str]] = {}

    doc = fitz.open(pdf_path)
    try:
        for page_index in range(len(doc)):
            page = doc.load_page(page_index)
            source_page = page_index + 1 + page_offset
            if source_page < 1:
                continue

            boxes = get_scheme_boxes(page)
            if not boxes:
                continue

            names: List[str] = []
            for box_index, _ in enumerate(boxes, start=1):
                names.append(f"{engine_model}-{source_page:04d}-{box_index:02d}.{ext_clean}")
            mapping[source_page] = names
    finally:
        doc.close()

    return mapping


def split_tokens(value: Any) -> List[str]:
    raw = str(value or "")
    return [part.strip() for part in raw.replace(";", ",").split(",") if part.strip()]


def update_rows(
    rows: List[Dict[str, Any]],
    page_to_schemas: Dict[int, List[str]],
    overwrite: bool,
    only_empty: bool,
) -> Dict[str, Any]:
    report = {
        "rows_total": len(rows),
        "rows_with_source_page": 0,
        "rows_updated": 0,
        "rows_kept_existing": 0,
        "rows_without_match": 0,
        "examples_without_match": [],
    }

    for idx, row in enumerate(rows):
        source_page = coerce_int(row.get("Source Page") or row.get("page4"))
        if source_page is None:
            continue
        report["rows_with_source_page"] += 1

        matches = page_to_schemas.get(source_page, [])
        if not matches:
            report["rows_without_match"] += 1
            if len(report["examples_without_match"]) < 20:
                report["examples_without_match"].append({
                    "row_index": idx,
                    "id": str(row.get("ID") or "").strip() or None,
                    "source_page": source_page,
                })
            continue

        current_tokens = split_tokens(row.get("esquemas"))
        if current_tokens and not overwrite:
            report["rows_kept_existing"] += 1
            continue

        if only_empty and current_tokens:
            report["rows_kept_existing"] += 1
            continue

        new_value = ", ".join(matches)
        if str(row.get("esquemas") or "").strip() != new_value:
            row["esquemas"] = new_value
            report["rows_updated"] += 1

    return report


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rellena el campo 'esquemas' en engine_MODEL.json detectando esquemas por pagina del PDF"
    )
    parser.add_argument("--engine", required=True, help="Modelo engine, por ejemplo 20V4000M93L")
    parser.add_argument("--pdf", required=True, help="Ruta o nombre del PDF del motor")
    parser.add_argument("--image-ext", default="png", help="Extension usada en nombres de esquemas")
    parser.add_argument("--page-offset", type=int, default=0, help="Offset para Source Page respecto al indice del PDF")
    parser.add_argument("--overwrite", action="store_true", help="Sobrescribe esquemas aunque ya tenga valor")
    parser.add_argument("--only-empty", action="store_true", help="Actualiza solo registros con esquemas vacio")
    parser.add_argument("--write", action="store_true", help="Escribe cambios en engine_MODEL.json")
    parser.add_argument("--report", default="tmp_fill_engine_esquemas_from_pdf_report.json", help="Ruta de reporte JSON")
    parser.add_argument(
        "--prefer-manual-framed-pdf",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Prioriza pdf/03-Libros_Marcos_modificados_a_mano si existe",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)

    engine_model = str(args.engine).removeprefix("engine_").removesuffix(".json")
    engine_json = resolve_engine_json(engine_model)
    pdf_path = resolve_pdf_path(
        str(args.pdf),
        engine=engine_model,
        prefer_manual_framed_pdf=bool(args.prefer_manual_framed_pdf),
    )

    rows = load_json_array(engine_json)
    page_to_schemas = build_schema_names_by_page(
        engine_model=engine_model,
        pdf_path=pdf_path,
        ext=str(args.image_ext),
        page_offset=int(args.page_offset),
    )

    report = {
        "engine": engine_model,
        "engine_json": str(engine_json),
        "pdf": str(pdf_path),
        "pages_with_schemes": len(page_to_schemas),
        "total_scheme_files": sum(len(items) for items in page_to_schemas.values()),
        "write": bool(args.write),
    }
    report.update(
        update_rows(
            rows=rows,
            page_to_schemas=page_to_schemas,
            overwrite=bool(args.overwrite),
            only_empty=bool(args.only_empty),
        )
    )

    if args.write:
        save_json_array(engine_json, rows)

    report_path = Path(args.report)
    if not report_path.is_absolute():
        report_path = ROOT_DIR / report_path
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"[fill-esquemas] Reporte: {report_path}")
    if args.write:
        print(f"[fill-esquemas] JSON actualizado: {engine_json}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
