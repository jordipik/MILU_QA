#!/usr/bin/env python3
"""Compare original engine JSON files with normalized outputs.

Generates:
- docs/field_registry_functional_compare.md
- data/normalized/compare_normalized_summary.json
"""

from __future__ import annotations

import json
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
NORMALIZED_DIR = REPO_ROOT / "data" / "normalized"
REGISTRY_PATH = REPO_ROOT / "data" / "field_registry.json"
REPORT_MD_PATH = REPO_ROOT / "docs" / "field_registry_functional_compare.md"
SUMMARY_JSON_PATH = NORMALIZED_DIR / "compare_normalized_summary.json"

CRITICAL_FIELDS = [
    "pn_final",
    "pos_final",
    "designation_final",
    "qty_final",
    "qty_units_final",
    "weight_final",
    "measure_final",
    "norma_final",
    "model_type_final",
    "qa_revision_estado",
    "qa_revision_accion",
    "ruta_foto",
    "ruta_esquemas_pos",
]

LEGACY_STATUS_VALUES = {
    "OK_GESA",
    "OK_SUST_NEW",
    "OK_SUST_OLD",
    "EMPTY",
    "BEST_MATCH",
    "MATCH_CATALOGO",
}


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def normalize_action(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = "".join(ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch))
    if text in ("copiar", "copy"):
        return "copy"
    if text in ("anadir", "add"):
        return "add"
    if text in ("eliminar", "delete"):
        return "delete"
    return text


def to_id(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    return False


def record_id(record: Dict[str, Any], normalized: bool) -> str:
    if normalized:
        return to_id(record.get("id_excel") if "id_excel" in record else record.get("ID"))
    return to_id(record.get("ID"))


def build_map(records: List[Dict[str, Any]], normalized: bool) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for record in records:
        rid = record_id(record, normalized=normalized)
        if not rid:
            continue
        if rid not in out:
            out[rid] = record
    return out


def compare_value(a: Any, b: Any) -> bool:
    return a == b


def normalize_text_for_compare(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split()).lower()


def compare_semantic_text(a: Any, b: Any) -> bool:
    return normalize_text_for_compare(a) == normalize_text_for_compare(b)


def first_non_empty(*values: Any) -> Any:
    for value in values:
        if not is_empty(value):
            return value
    return None


def load_add_fields() -> List[str]:
    if not REGISTRY_PATH.exists():
        return []
    registry = read_json(REGISTRY_PATH)
    fields = registry.get("fields", []) if isinstance(registry, dict) else []
    out = []
    for field in fields:
        if normalize_action(field.get("action")) == "add":
            new_name = str(field.get("new_name") or "").strip()
            if new_name:
                out.append(new_name)
    return sorted(set(out))


def compare_engine(source_path: Path, normalized_path: Path, add_fields: List[str]) -> Dict[str, Any]:
    source_rows = read_json(source_path)
    normalized_rows = read_json(normalized_path)

    if not isinstance(source_rows, list) or not isinstance(normalized_rows, list):
        raise ValueError(f"Invalid JSON array in {source_path.name} or {normalized_path.name}")

    source_map = build_map(source_rows, normalized=False)
    normalized_map = build_map(normalized_rows, normalized=True)

    source_ids = set(source_map.keys())
    normalized_ids = set(normalized_map.keys())
    shared_ids = sorted(source_ids & normalized_ids)

    missing_in_normalized = sorted(source_ids - normalized_ids)
    missing_in_source = sorted(normalized_ids - source_ids)

    differences = Counter()
    status_legacy_moved_or_ignored_count = 0

    for rid in shared_ids:
        src = source_map[rid]
        norm = normalized_map[rid]
        ignored_legacy_status = False

        for field in CRITICAL_FIELDS:
            if not compare_value(src.get(field), norm.get(field)):
                differences[field] += 1

        src_subst = src.get("sust_status")
        norm_subst_excel = norm.get("is_subst_excel")
        norm_subst_final = norm.get("is_subst_final")
        if not is_empty(src_subst) and not is_empty(norm_subst_excel):
            if not compare_value(src_subst, norm_subst_excel):
                differences["is_subst_excel_vs_sust_status"] += 1
        if not is_empty(src_subst) and not is_empty(norm_subst_final):
            if not compare_value(src_subst, norm_subst_final):
                differences["is_subst_final_vs_sust_status"] += 1

        src_hier = src.get("sust_hierarchie")
        src_status = src.get("status")
        norm_hier_excel = norm.get("hierarchie_excel")
        norm_hier_final = norm.get("hierarchie_final")

        # Compare hierarchy semantically: source of truth is sust_hierarchie only.
        src_status_text = str(src_status).strip() if not is_empty(src_status) else ""
        src_status_is_legacy = src_status_text in LEGACY_STATUS_VALUES
        norm_hier_excel_text = str(norm_hier_excel).strip() if not is_empty(norm_hier_excel) else ""
        norm_hier_excel_is_legacy = norm_hier_excel_text in LEGACY_STATUS_VALUES
        status_matches_norm_hier = (
            not is_empty(src_status)
            and not is_empty(norm_hier_excel)
            and compare_semantic_text(src_status, norm_hier_excel)
        )

        if not is_empty(src_hier):
            if status_matches_norm_hier:
                ignored_legacy_status = True
            elif norm_hier_excel_is_legacy:
                ignored_legacy_status = True
            elif not compare_semantic_text(src_hier, norm_hier_excel):
                differences["hierarchie_excel_vs_source"] += 1
        elif is_empty(norm_hier_excel):
            # Both missing/empty is acceptable when sust_hierarchie is absent.
            pass
        elif not is_empty(src_status):
            # If sust_hierarchie is absent and status exists, status is legacy/debug
            # and must not be used as hierarchy source-of-truth.
            ignored_legacy_status = True
        elif norm_hier_excel_is_legacy:
            ignored_legacy_status = True
        else:
            differences["hierarchie_excel_vs_source"] += 1

        # Legacy operational status values are not hierarchy source-of-truth.
        if is_empty(src_hier) and src_status_is_legacy:
            ignored_legacy_status = True

        if ignored_legacy_status:
            status_legacy_moved_or_ignored_count += 1

        if not is_empty(src_hier) and not is_empty(norm_hier_final):
            if not compare_value(src_hier, norm_hier_final):
                differences["hierarchie_final_vs_source"] += 1

    legacy_counter = Counter()
    legacy_total = 0
    for row in normalized_rows:
        legacy = row.get("_legacy")
        if not isinstance(legacy, dict):
            continue
        for key, value in legacy.items():
            if is_empty(value):
                continue
            legacy_counter[key] += 1
            legacy_total += 1

    new_fields_null = Counter()
    for row in normalized_rows:
        for field in add_fields:
            if field not in row or row.get(field) is None:
                new_fields_null[field] += 1

    no_pn_final = 0
    empty_qa_estado = 0
    empty_qa_accion = 0
    ruta_esquemas_diff = 0
    ruta_foto_diff = 0

    for rid in shared_ids:
        src = source_map[rid]
        norm = normalized_map[rid]

        if is_empty(norm.get("pn_final")):
            no_pn_final += 1
        if is_empty(norm.get("qa_revision_estado")):
            empty_qa_estado += 1
        if is_empty(norm.get("qa_revision_accion")):
            empty_qa_accion += 1
        if src.get("ruta_esquemas_pos") != norm.get("ruta_esquemas_pos"):
            ruta_esquemas_diff += 1
        if src.get("ruta_foto") != norm.get("ruta_foto"):
            ruta_foto_diff += 1

    functional_diff_fields = {k: v for k, v in sorted(differences.items()) if v > 0}

    verdict_ok = (
        len(missing_in_normalized) == 0
        and len(missing_in_source) == 0
        and len(functional_diff_fields) == 0
        and ruta_esquemas_diff == 0
        and ruta_foto_diff == 0
        and empty_qa_estado == 0
        and empty_qa_accion == 0
    )

    return {
        "engine": source_path.name,
        "source_file": str(source_path),
        "normalized_file": str(normalized_path),
        "records_source": len(source_rows),
        "records_normalized": len(normalized_rows),
        "record_count_diff": len(normalized_rows) - len(source_rows),
        "ids_source": len(source_ids),
        "ids_normalized": len(normalized_ids),
        "ids_shared": len(shared_ids),
        "ids_missing_in_normalized": len(missing_in_normalized),
        "ids_missing_in_source": len(missing_in_source),
        "missing_id_examples_in_normalized": missing_in_normalized[:20],
        "missing_id_examples_in_source": missing_in_source[:20],
        "legacy_fields_moved_total": legacy_total,
        "legacy_fields_moved_top": legacy_counter.most_common(15),
        "new_fields_with_null_total": int(sum(new_fields_null.values())),
        "new_fields_with_null_top": new_fields_null.most_common(15),
        "functional_field_differences": functional_diff_fields,
        "records_without_pn_final": no_pn_final,
        "records_with_empty_qa_revision_estado": empty_qa_estado,
        "records_with_empty_qa_revision_accion": empty_qa_accion,
        "records_with_ruta_esquemas_pos_diff": ruta_esquemas_diff,
        "records_with_ruta_foto_diff": ruta_foto_diff,
        "status_legacy_moved_or_ignored_count": status_legacy_moved_or_ignored_count,
        "validation": {
            "pn_final": "OK" if differences.get("pn_final", 0) == 0 else f"FAIL ({differences.get('pn_final', 0)})",
            "pos_final": "OK" if differences.get("pos_final", 0) == 0 else f"FAIL ({differences.get('pos_final', 0)})",
            "designation_final": "OK" if differences.get("designation_final", 0) == 0 else f"FAIL ({differences.get('designation_final', 0)})",
            "qty_final": "OK" if differences.get("qty_final", 0) == 0 else f"FAIL ({differences.get('qty_final', 0)})",
            "qty_units_final": "OK" if differences.get("qty_units_final", 0) == 0 else f"FAIL ({differences.get('qty_units_final', 0)})",
            "weight_final": "OK" if differences.get("weight_final", 0) == 0 else f"FAIL ({differences.get('weight_final', 0)})",
            "measure_final": "OK" if differences.get("measure_final", 0) == 0 else f"FAIL ({differences.get('measure_final', 0)})",
            "norma_final": "OK" if differences.get("norma_final", 0) == 0 else f"FAIL ({differences.get('norma_final', 0)})",
            "model_type_final": "OK" if differences.get("model_type_final", 0) == 0 else f"FAIL ({differences.get('model_type_final', 0)})",
            "qa_revision_estado": "OK" if differences.get("qa_revision_estado", 0) == 0 else f"FAIL ({differences.get('qa_revision_estado', 0)})",
            "qa_revision_accion": "OK" if differences.get("qa_revision_accion", 0) == 0 else f"FAIL ({differences.get('qa_revision_accion', 0)})",
            "ruta_foto": "OK" if differences.get("ruta_foto", 0) == 0 else f"FAIL ({differences.get('ruta_foto', 0)})",
            "ruta_esquemas_pos": "OK" if differences.get("ruta_esquemas_pos", 0) == 0 else f"FAIL ({differences.get('ruta_esquemas_pos', 0)})",
            "is_subst_excel_vs_sust_status": "OK" if differences.get("is_subst_excel_vs_sust_status", 0) == 0 else f"FAIL ({differences.get('is_subst_excel_vs_sust_status', 0)})",
            "is_subst_final_vs_sust_status": "OK" if differences.get("is_subst_final_vs_sust_status", 0) == 0 else f"FAIL ({differences.get('is_subst_final_vs_sust_status', 0)})",
            "hierarchie_excel_vs_source": "OK" if differences.get("hierarchie_excel_vs_source", 0) == 0 else f"FAIL ({differences.get('hierarchie_excel_vs_source', 0)})",
            "hierarchie_final_vs_source": "OK" if differences.get("hierarchie_final_vs_source", 0) == 0 else f"FAIL ({differences.get('hierarchie_final_vs_source', 0)})",
        },
        "verdict": "OK" if verdict_ok else "CHECK",
    }


def render_markdown(summary: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append("# Field Registry Functional Compare")
    lines.append("")
    lines.append(f"Date: {date.today().isoformat()}")
    lines.append("")
    lines.append("## Global")
    lines.append("")
    lines.append(f"- engines compared: {summary['engines_compared']}")
    lines.append(f"- engines OK: {summary['engines_ok']}")
    lines.append(f"- engines CHECK: {summary['engines_check']}")
    lines.append(f"- total source records: {summary['total_records_source']}")
    lines.append(f"- total normalized records: {summary['total_records_normalized']}")
    lines.append(f"- total record count diff: {summary['total_record_count_diff']}")
    lines.append(f"- total ids missing in normalized: {summary['total_ids_missing_in_normalized']}")
    lines.append(f"- total ids missing in source: {summary['total_ids_missing_in_source']}")
    lines.append(f"- total legacy moved fields: {summary['total_legacy_fields_moved']}")
    lines.append(f"- total new fields with null: {summary['total_new_fields_with_null']}")
    lines.append(f"- total records without pn_final: {summary['total_records_without_pn_final']}")
    lines.append(f"- total records with empty qa_revision_estado: {summary['total_records_with_empty_qa_revision_estado']}")
    lines.append(f"- total records with empty qa_revision_accion: {summary['total_records_with_empty_qa_revision_accion']}")
    lines.append(f"- total records with ruta_esquemas_pos diff: {summary['total_records_with_ruta_esquemas_pos_diff']}")
    lines.append(f"- total records with ruta_foto diff: {summary['total_records_with_ruta_foto_diff']}")
    lines.append(f"- total status_legacy_moved_or_ignored_count: {summary['total_status_legacy_moved_or_ignored_count']}")
    lines.append("")

    for engine in summary["engines"]:
        lines.append(f"## {engine['engine']}")
        lines.append("")
        lines.append(f"- verdict: {engine['verdict']}")
        lines.append(f"- records source: {engine['records_source']}")
        lines.append(f"- records normalized: {engine['records_normalized']}")
        lines.append(f"- record count diff: {engine['record_count_diff']}")
        lines.append(f"- ids source: {engine['ids_source']}")
        lines.append(f"- ids normalized: {engine['ids_normalized']}")
        lines.append(f"- ids shared: {engine['ids_shared']}")
        lines.append(f"- ids missing in normalized: {engine['ids_missing_in_normalized']}")
        lines.append(f"- ids missing in source: {engine['ids_missing_in_source']}")
        lines.append(f"- legacy fields moved total: {engine['legacy_fields_moved_total']}")
        lines.append(f"- new fields with null total: {engine['new_fields_with_null_total']}")

        field_diff = engine.get("functional_field_differences") or {}
        if field_diff:
            diff_text = ", ".join([f"{k} ({v})" for k, v in sorted(field_diff.items())])
            lines.append(f"- functional fields with differences: {diff_text}")
        else:
            lines.append("- functional fields with differences: (none)")

        lines.append(f"- records without pn_final: {engine['records_without_pn_final']}")
        lines.append(f"- records with empty qa_revision_estado: {engine['records_with_empty_qa_revision_estado']}")
        lines.append(f"- records with empty qa_revision_accion: {engine['records_with_empty_qa_revision_accion']}")
        lines.append(f"- records with ruta_esquemas_pos diff: {engine['records_with_ruta_esquemas_pos_diff']}")
        lines.append(f"- records with ruta_foto diff: {engine['records_with_ruta_foto_diff']}")
        lines.append(f"- status_legacy_moved_or_ignored_count: {engine['status_legacy_moved_or_ignored_count']}")

        validation = engine.get("validation", {})
        lines.append("- critical validation:")
        for key in [
            "pn_final",
            "pos_final",
            "designation_final",
            "qty_final",
            "qty_units_final",
            "weight_final",
            "measure_final",
            "norma_final",
            "model_type_final",
            "qa_revision_estado",
            "qa_revision_accion",
            "ruta_foto",
            "ruta_esquemas_pos",
            "is_subst_excel_vs_sust_status",
            "is_subst_final_vs_sust_status",
            "hierarchie_excel_vs_source",
            "hierarchie_final_vs_source",
        ]:
            lines.append(f"  - {key}: {validation.get(key, 'N/A')}")

        lines.append("")

    return "\n".join(lines) + "\n"


def main() -> int:
    source_files = sorted(REPO_ROOT.glob("engine_*.json"))
    add_fields = load_add_fields()

    engines: List[Dict[str, Any]] = []
    missing_normalized: List[str] = []

    for source_path in source_files:
        normalized_path = NORMALIZED_DIR / f"{source_path.stem}.normalized.json"
        if not normalized_path.exists():
            missing_normalized.append(normalized_path.name)
            continue

        result = compare_engine(source_path=source_path, normalized_path=normalized_path, add_fields=add_fields)
        engines.append(result)

    if missing_normalized:
        raise FileNotFoundError(
            "Missing normalized files: " + ", ".join(missing_normalized)
        )

    total_records_source = sum(item["records_source"] for item in engines)
    total_records_normalized = sum(item["records_normalized"] for item in engines)

    summary = {
        "engines_compared": len(engines),
        "engines_ok": sum(1 for item in engines if item["verdict"] == "OK"),
        "engines_check": sum(1 for item in engines if item["verdict"] != "OK"),
        "total_records_source": total_records_source,
        "total_records_normalized": total_records_normalized,
        "total_record_count_diff": total_records_normalized - total_records_source,
        "total_ids_missing_in_normalized": sum(item["ids_missing_in_normalized"] for item in engines),
        "total_ids_missing_in_source": sum(item["ids_missing_in_source"] for item in engines),
        "total_legacy_fields_moved": sum(item["legacy_fields_moved_total"] for item in engines),
        "total_new_fields_with_null": sum(item["new_fields_with_null_total"] for item in engines),
        "total_records_without_pn_final": sum(item["records_without_pn_final"] for item in engines),
        "total_records_with_empty_qa_revision_estado": sum(item["records_with_empty_qa_revision_estado"] for item in engines),
        "total_records_with_empty_qa_revision_accion": sum(item["records_with_empty_qa_revision_accion"] for item in engines),
        "total_records_with_ruta_esquemas_pos_diff": sum(item["records_with_ruta_esquemas_pos_diff"] for item in engines),
        "total_records_with_ruta_foto_diff": sum(item["records_with_ruta_foto_diff"] for item in engines),
        "total_status_legacy_moved_or_ignored_count": sum(item["status_legacy_moved_or_ignored_count"] for item in engines),
        "engines": engines,
    }

    write_json(SUMMARY_JSON_PATH, summary)
    write_text(REPORT_MD_PATH, render_markdown(summary))

    print(f"Wrote summary JSON: {SUMMARY_JSON_PATH}")
    print(f"Wrote markdown report: {REPORT_MD_PATH}")
    print(f"Engines compared: {summary['engines_compared']} | OK: {summary['engines_ok']} | CHECK: {summary['engines_check']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
