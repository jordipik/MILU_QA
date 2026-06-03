#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUT_DIR = "esquemas_pos_circulos"
DEFAULT_URL_BASE = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02"

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from generate_esquema_pos import process_record
from python_lib.engine_constants import DEFAULT_EXP_IMAGENES, ENGINE_FILES
from python_lib.json_io import load_engine_json, save_engine_json


def has_value(value: Any) -> bool:
    return value is not None and str(value).strip() != ""


def has_esquema_pos_link(record: Dict[str, Any]) -> bool:
    return any(
        has_value(record.get(key))
        for key in ("esquemas_circulos_all", "esquemas_circulos", "ruta_esquemas_pos")
    )


def build_schema_url(filename: str, url_base: str) -> str:
    return f"{url_base.rstrip('/')}/{filename}"


def merge_exp_imagenes(existing: Any, ruta_foto: Any, ruta_esquemas_pos: Any) -> str:
    candidates: List[str] = []

    for raw in (existing, ruta_foto, ruta_esquemas_pos):
        if not has_value(raw):
            continue
        parts = [part.strip() for part in str(raw).split(",") if part.strip()]
        candidates.extend(parts)

    deduped: List[str] = []
    seen = set()
    for item in candidates:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    if deduped:
        return ", ".join(deduped)
    return DEFAULT_EXP_IMAGENES


def make_process_args(engine: str, row_id: str, pdf: str, out_dir: str, write_images: bool, overwrite: bool) -> SimpleNamespace:
    return SimpleNamespace(
        engine=engine,
        id=row_id,
        pdf=pdf,
        out_dir=out_dir,
        dry_run=not write_images,
        write_images=write_images,
        overwrite=overwrite,
        page_offset=-1,
        dpi=200,
        format="webp",
        quality=90,
        out_report=None,
        without_circle=False,
        frame_pad_pt=0.5,
        auto_frame_pad_pt=20.0,
        pos_fallback_pad_pt=45.0,
        ocr=True,
        auto_red_frames=False,
        preprocess_min_width_ratio=0.5,
        preprocess_border_width=2.0,
        source_page_hint=None,
        pos_hint=None,
        part_no_hint=None,
        designation_hint=None,
        prefer_manual_framed_pdf=True,
    )


def resolve_engines(engine_arg: Optional[str], all_engines: bool) -> List[str]:
    if all_engines:
        return [name.removeprefix("engine_").removesuffix(".json") for name in ENGINE_FILES]
    if engine_arg:
        return [engine_arg]
    raise ValueError("Debes indicar --engine <modelo> o --all-engines")


def process_engine(
    engine: str,
    out_dir: str,
    url_base: str,
    write_images: bool,
    overwrite: bool,
    write_json: bool,
    limit: int,
) -> Dict[str, Any]:
    engine_path = ROOT_DIR / f"engine_{engine}.json"
    if not engine_path.exists():
        return {
            "engine": engine,
            "status": "error",
            "reason": f"No existe {engine_path.name}",
        }

    rows = load_engine_json(engine_path)
    missing_indexes = [idx for idx, row in enumerate(rows) if isinstance(row, dict) and not has_esquema_pos_link(row)]

    if limit > 0:
        missing_indexes = missing_indexes[:limit]

    result = {
        "engine": engine,
        "status": "ok",
        "rows_total": len(rows),
        "rows_missing_before": len(missing_indexes),
        "processed": 0,
        "generated": 0,
        "already_exists": 0,
        "linked": 0,
        "skipped": 0,
        "errors": 0,
        "details": [],
    }

    changed = False
    pdf_hint = f"{engine}_clean_marcos_mod.pdf"

    for row_index in missing_indexes:
        row = rows[row_index]
        row_id = str(row.get("ID") or "").strip()
        if not row_id:
            result["skipped"] += 1
            result["details"].append({
                "row_index": row_index,
                "id": None,
                "status": "skipped",
                "reason": "Registro sin ID",
            })
            continue

        args = make_process_args(
            engine=engine,
            row_id=row_id,
            pdf=pdf_hint,
            out_dir=out_dir,
            write_images=write_images,
            overwrite=overwrite,
        )
        report = process_record(args)
        status = str(report.get("status") or "").strip()
        filename = str(report.get("filename") or "").strip()

        result["processed"] += 1

        if status == "generated":
            result["generated"] += 1
        elif status == "already_exists":
            result["already_exists"] += 1
        elif status in {"missing_data", "pos_not_found", "no_red_boxes", "error"}:
            result["errors"] += 1
        else:
            result["skipped"] += 1

        linked_now = False
        if status in {"generated", "already_exists"} and filename:
            ruta = build_schema_url(filename, url_base)
            row["esquemas_circulos_all"] = filename
            row["esquemas_circulos"] = filename
            row["ruta_esquemas_pos"] = ruta
            row["exp_imagenes"] = merge_exp_imagenes(row.get("exp_imagenes"), row.get("ruta_foto"), ruta)
            changed = True
            linked_now = True
            result["linked"] += 1

        result["details"].append({
            "row_index": row_index,
            "id": row_id,
            "status": status,
            "filename": filename or None,
            "linked": linked_now,
            "reason": report.get("reason"),
        })

    if write_json and changed:
        save_engine_json(engine_path, rows)

    result["json_updated"] = bool(write_json and changed)
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Genera y vincula esquemas POS faltantes en engine_*.json"
    )
    parser.add_argument("--engine", default=None, help="Modelo de engine, por ejemplo 12V4000M40A")
    parser.add_argument("--all-engines", action="store_true", help="Procesa los 9 motores")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="Directorio de salida de imagenes")
    parser.add_argument("--url-base", default=DEFAULT_URL_BASE, help="Base URL para ruta_esquemas_pos")
    parser.add_argument("--write-images", action=argparse.BooleanOptionalAction, default=True, help="Genera imagenes en disco")
    parser.add_argument("--overwrite", action="store_true", help="Sobrescribe imagen si ya existe")
    parser.add_argument("--write-json", action=argparse.BooleanOptionalAction, default=True, help="Actualiza engine_*.json")
    parser.add_argument("--limit", type=int, default=0, help="Limita registros por motor (0 = sin limite)")
    parser.add_argument(
        "--report",
        default="tmp_generate_missing_esquema_pos_batch_report.json",
        help="Ruta del reporte JSON",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    engines = resolve_engines(args.engine, args.all_engines)

    all_reports = []
    for engine in engines:
        report = process_engine(
            engine=engine,
            out_dir=args.out_dir,
            url_base=args.url_base,
            write_images=bool(args.write_images),
            overwrite=bool(args.overwrite),
            write_json=bool(args.write_json),
            limit=max(0, int(args.limit or 0)),
        )
        all_reports.append(report)
        print(
            f"[batch-esquema-pos] {engine}: missing={report.get('rows_missing_before', 0)} "
            f"processed={report.get('processed', 0)} linked={report.get('linked', 0)} errors={report.get('errors', 0)}"
        )

    summary = {
        "generated_at": dt.datetime.utcnow().isoformat() + "Z",
        "engines": engines,
        "write_images": bool(args.write_images),
        "write_json": bool(args.write_json),
        "results": all_reports,
    }

    report_path = Path(args.report)
    if not report_path.is_absolute():
        report_path = ROOT_DIR / report_path
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[batch-esquema-pos] Reporte: {report_path}")

    has_errors = any((item.get("errors", 0) > 0) for item in all_reports)
    return 1 if has_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
