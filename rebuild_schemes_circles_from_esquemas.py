#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import fitz
from PIL import Image, ImageDraw

from generate_esquema_pos import (
    detect_pos_items_all,
    draw_circle,
    expand_box_in_page,
    normalize_pos,
    render_clip,
    resolve_pdf_path,
    save_image,
    token_matches_target_pos,
)
from python_lib.json_io import load_engine_json, save_engine_json
from rebuild_assets_for_record import (
    EngineContext,
    find_record_indexes,
    join_csv,
    resolve_engine_asset_dirs,
    resolve_engine_json,
    resolve_engines,
    set_if_changed,
    split_csv,
)

ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_BASE_DIR = "esquemas"
DEFAULT_POS_DIR = "esquemas_pos_circulos"
DEFAULT_URL_BASE = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02"
POS_EXT = "webp"


def _normalize_key(value: Any) -> str:
    return str(value or "").strip().lower()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Recalcula campos de esquemas_circulos usando SOLO el campo esquemas + POS."
    )

    parser.add_argument("--engine", default=None, help="Modelo, por ejemplo 12V4000M40A")
    parser.add_argument("--id", default=None, help="ID de registro")
    parser.add_argument("--all-book", action="store_true", help="Procesa todo el engine indicado")
    parser.add_argument("--all", action="store_true", help="Procesa todos los engines")
    parser.add_argument("--limit", type=int, default=0, help="Limita registros por engine (0 = sin limite)")

    parser.add_argument("--write", action="store_true", help="Guarda cambios en JSON y genera imagenes")
    parser.add_argument("--dry-run", action="store_true", help="No guarda cambios ni imagenes")
    parser.add_argument("--force-regenerate", action="store_true", help="Regenera imagenes aunque existan")
    parser.add_argument("--base-dir", default=DEFAULT_BASE_DIR, help="Carpeta base de esquemas")
    parser.add_argument("--pos-dir", default=DEFAULT_POS_DIR, help="Carpeta de salida de esquemas con circulo")
    parser.add_argument("--url-base", default=DEFAULT_URL_BASE, help="Base URL para ruta_esquemas_pos")

    parser.add_argument(
        "--ocr",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Activa OCR cuando no hay coincidencias en texto (default: True)",
    )
    parser.add_argument("--dpi", type=int, default=200, help="DPI de render")
    parser.add_argument("--quality", type=int, default=90, help="Calidad WEBP")
    parser.add_argument("--frame-pad-pt", type=float, default=0.5, help="Margen de recorte")
    parser.add_argument("--pos-fallback-pad-pt", type=float, default=45.0, help="Margen extra para fallback POS")

    parser.add_argument(
        "--update-exp-imagenes",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Actualiza exp_imagenes usando ruta_foto + ruta_esquemas_pos (default: False)",
    )
    parser.add_argument(
        "--report",
        default="tmp_rebuild_schemes_circles_from_esquemas_report.json",
        help="Ruta del reporte JSON",
    )
    parser.add_argument(
        "--prefer-manual-framed-pdf",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Prioriza pdf/03-Libros_Marcos_modificados_a_mano",
    )
    parser.add_argument(
        "--overrides-json",
        default="",
        help="JSON opcional con overrides manuales de deteccion POS",
    )

    return parser


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.write and args.dry_run:
        parser.error("No puedes combinar --write y --dry-run")

    if not args.write:
        args.dry_run = True

    if args.id and args.all:
        parser.error("--id y --all son excluyentes")
    if args.id and args.all_book:
        parser.error("--id y --all-book son excluyentes")
    if args.all and args.all_book:
        parser.error("--all y --all-book son excluyentes")

    if args.id and not args.engine:
        parser.error("Para --id debes indicar --engine")
    if args.all_book and not args.engine:
        parser.error("Para --all-book debes indicar --engine")
    if not args.id and not args.all_book and not args.all:
        parser.error("Debes usar uno de estos modos: --id, --all-book o --all")

    return args


def pick_pos(row: Dict[str, Any]) -> Optional[str]:
    return normalize_pos(row.get("pos_final"))


def parse_base_scheme_filename(token: str) -> Optional[Tuple[str, int, int, str]]:
    name = Path(str(token or "").strip()).name
    if not name:
        return None

    stem = Path(name).stem
    parts = stem.split("-")
    if len(parts) < 3:
        return None

    box_raw = parts[-1]
    page_raw = parts[-2]
    engine = "-".join(parts[:-2])

    if not engine or not page_raw.isdigit() or not box_raw.isdigit():
        return None

    page_num = int(page_raw)
    box_index = int(box_raw)
    if page_num < 1 or box_index < 1:
        return None

    return engine, page_num, box_index, name


def derive_circle_filename(base_name: str, pos_value: str) -> str:
    stem = Path(base_name).stem
    return f"{stem}-{pos_value}.{POS_EXT}"


def asset_exists_in_dirs(filename: str, lookup_dirs: Sequence[Path]) -> bool:
    return any((directory / filename).exists() for directory in lookup_dirs)


def filter_items_by_target_pos(items: Sequence[Dict[str, Any]], target_pos: str) -> List[Dict[str, Any]]:
    return [item for item in items if token_matches_target_pos(str(item.get("pos") or ""), target_pos)]


def detect_pos_items_for_box(
    context: EngineContext,
    page_num: int,
    box: fitz.Rect,
    target_pos: str,
    dpi: int,
    frame_pad_pt: float,
    pos_fallback_pad_pt: float,
    enable_ocr: bool,
) -> List[Dict[str, Any]]:
    page = context.doc.load_page(page_num - 1)

    clip_outer = expand_box_in_page(fitz.Rect(box), page.rect, frame_pad_pt)
    clip_inner = fitz.Rect(clip_outer.x0 + 1.0, clip_outer.y0 + 1.0, clip_outer.x1 - 1.0, clip_outer.y1 - 1.0)
    if clip_inner.x1 <= clip_inner.x0 or clip_inner.y1 <= clip_inner.y0:
        clip_inner = fitz.Rect(clip_outer)

    items = context.get_pos_items_for_clip(page_num, clip_inner, dpi=int(dpi), enable_ocr=bool(enable_ocr))
    items = filter_items_by_target_pos(items, target_pos)
    if items:
        return items

    pads = [
        float(pos_fallback_pad_pt),
        max(float(pos_fallback_pad_pt), 120.0),
    ]
    tried_rects = set()

    for pad in pads:
        clip_fallback = expand_box_in_page(clip_outer, page.rect, pad)
        key = (
            round(clip_fallback.x0, 2),
            round(clip_fallback.y0, 2),
            round(clip_fallback.x1, 2),
            round(clip_fallback.y1, 2),
        )
        if key in tried_rects:
            continue
        tried_rects.add(key)

        all_items = context.get_pos_items_for_clip(page_num, clip_fallback, dpi=int(dpi), enable_ocr=bool(enable_ocr))
        candidate_items = filter_items_by_target_pos(all_items, target_pos)
        if not candidate_items:
            continue

        safe_clip = expand_box_in_page(clip_outer, page.rect, 18.0)
        safe_items: List[Dict[str, Any]] = []
        ocr_items: List[Dict[str, Any]] = []
        for item in candidate_items:
            if str(item.get("source") or "") == "OCR":
                ocr_items.append(item)
                continue
            if str(item.get("source") or "") != "TEXT":
                continue
            rect = item.get("rect_pdf")
            if rect is None:
                continue
            cx = (float(rect.x0) + float(rect.x1)) / 2.0
            cy = (float(rect.y0) + float(rect.y1)) / 2.0
            if safe_clip.x0 <= cx <= safe_clip.x1 and safe_clip.y0 <= cy <= safe_clip.y1:
                safe_items.append(item)

        if safe_items:
            return safe_items

        # Si el texto embebido del PDF no coincide, permitimos fallback por OCR
        # para no perder POS claramente visibles en la imagen del esquema.
        if ocr_items:
            return ocr_items

    return []


def render_pos_image(
    page: fitz.Page,
    box: fitz.Rect,
    items: Sequence[Dict[str, Any]],
    frame_pad_pt: float,
    dpi: int,
) -> Image.Image:
    clip_outer = expand_box_in_page(fitz.Rect(box), page.rect, frame_pad_pt)
    clip_inner = fitz.Rect(clip_outer.x0 + 1.0, clip_outer.y0 + 1.0, clip_outer.x1 - 1.0, clip_outer.y1 - 1.0)
    if clip_inner.x1 <= clip_inner.x0 or clip_inner.y1 <= clip_inner.y0:
        clip_inner = fitz.Rect(clip_outer)

    image = render_clip(page, clip_outer, dpi=dpi)
    draw = ImageDraw.Draw(image)
    zoom = dpi / 72.0
    dx_px = int(round((clip_inner.x0 - clip_outer.x0) * zoom))
    dy_px = int(round((clip_inner.y0 - clip_outer.y0) * zoom))

    for item in items:
        source = str(item.get("source") or "")
        if source in {"OCR", "MANUAL_OCR_INNER"}:
            x, y, width, height = item["px"]
            draw_circle(draw, x + dx_px, y + dy_px, width, height, line_width=6)
            continue
        if source == "MANUAL_OCR_OUTER":
            x, y, width, height = item["px"]
            draw_circle(draw, x, y, width, height, line_width=6)
            continue

        rect = item["rect_pdf"]
        x0 = int((rect.x0 - clip_outer.x0) * zoom)
        y0 = int((rect.y0 - clip_outer.y0) * zoom)
        x1 = int((rect.x1 - clip_outer.x0) * zoom)
        y1 = int((rect.y1 - clip_outer.y0) * zoom)
        draw_circle(draw, min(x0, x1), min(y0, y1), abs(x1 - x0), abs(y1 - y0), line_width=6)

    return image


def build_exp_imagenes(ruta_foto: Any, ruta_esquemas_pos: str) -> str:
    merged: List[str] = []
    seen = set()

    for raw in (ruta_foto, ruta_esquemas_pos):
        for token in split_csv(raw):
            key = token.lower()
            if key in seen:
                continue
            seen.add(key)
            merged.append(token)

    return ", ".join(merged)


def load_manual_overrides(path_value: str) -> Dict[Tuple[str, str, str], List[Dict[str, Any]]]:
    if not str(path_value or "").strip():
        return {}

    path = Path(path_value)
    if not path.is_absolute():
        path = ROOT_DIR / path
    if not path.exists():
        return {}

    raw = json.loads(path.read_text(encoding="utf-8"))
    entries: List[Dict[str, Any]]
    if isinstance(raw, list):
        entries = raw
    elif isinstance(raw, dict) and isinstance(raw.get("overrides"), list):
        entries = list(raw.get("overrides") or [])
    else:
        return {}

    indexed: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        rid = _normalize_key(entry.get("id"))
        base_name = Path(str(entry.get("base") or "").strip()).name.lower()
        pos_value = _normalize_key(entry.get("pos"))
        if not rid or not base_name or not pos_value:
            continue

        item = entry.get("item")
        if isinstance(item, dict):
            items = [item]
        else:
            items = [x for x in (entry.get("items") or []) if isinstance(x, dict)]
        if not items:
            continue

        normalized_items: List[Dict[str, Any]] = []
        for item_data in items:
            rect = item_data.get("rect_pdf")
            px = item_data.get("px")
            if isinstance(rect, (list, tuple)) and len(rect) == 4:
                normalized_items.append(
                    {
                        "source": "MANUAL_RECT",
                        "rect_pdf": fitz.Rect(float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3])),
                    }
                )
                continue
            if isinstance(px, (list, tuple)) and len(px) == 4:
                normalized_items.append(
                    {
                        "source": "MANUAL_OCR_INNER",
                        "px": (int(px[0]), int(px[1]), int(px[2]), int(px[3])),
                    }
                )

        if not normalized_items:
            continue

        key = (rid, base_name, pos_value)
        indexed[key] = normalized_items

    return indexed


def get_manual_override_items(
    overrides: Dict[Tuple[str, str, str], List[Dict[str, Any]]],
    record_id: str,
    base_name: str,
    pos_value: str,
) -> List[Dict[str, Any]]:
    if not overrides:
        return []
    key = (_normalize_key(record_id), Path(base_name).name.lower(), _normalize_key(pos_value))
    return list(overrides.get(key) or [])


def apply_derived_fields(
    row: Dict[str, Any],
    next_one: str,
) -> bool:
    # Este script solo debe actualizar esquemas_circulos.
    return set_if_changed(row, "esquemas_circulos", next_one)


def process_record(
    row: Dict[str, Any],
    engine: str,
    context: EngineContext,
    args: argparse.Namespace,
    pos_output_dir: Path,
    pos_lookup_dirs: Sequence[Path],
    manual_overrides: Dict[Tuple[str, str, str], List[Dict[str, Any]]],
) -> Dict[str, Any]:
    record_id = str(row.get("ID") or "").strip()
    pn_value = str(row.get("PART NO.") or row.get("pn_final") or "").strip()
    pos_value = pick_pos(row)
    esquemas_raw = "" if row.get("esquemas") is None else str(row.get("esquemas"))

    previous_c = "" if row.get("esquemas_circulos") is None else str(row.get("esquemas_circulos"))
    previous_c_all = "" if row.get("esquemas_circulos_all") is None else str(row.get("esquemas_circulos_all"))
    previous_ruta = "" if row.get("ruta_esquemas_pos") is None else str(row.get("ruta_esquemas_pos"))

    report = {
        "id": record_id,
        "pn": pn_value,
        "pos": pos_value or "",
        "esquemas": esquemas_raw,
        "previous_esquemas_circulos": previous_c,
        "previous_esquemas_circulos_all": previous_c_all,
        "next_esquemas_circulos": "",
        "next_esquemas_circulos_all": "",
        "previous_ruta_esquemas_pos": previous_ruta,
        "next_ruta_esquemas_pos": "",
        "status": "ERROR",
        "generated": [],
        "reused": [],
        "missing": [],
        "reason": "",
        "changed": False,
        "manual_override_used": False,
    }

    base_tokens = split_csv(esquemas_raw)
    if not base_tokens:
        changed = False
        if args.write:
            changed = apply_derived_fields(row, next_one="")
        report["status"] = "MISS_NO_ESQUEMAS"
        report["reason"] = "Campo esquemas vacio"
        report["changed"] = bool(changed)
        return report

    if not pos_value:
        changed = False
        if args.write:
            changed = apply_derived_fields(row, next_one="")
        report["status"] = "MISS_NO_POS"
        report["reason"] = "pos_final no disponible"
        report["changed"] = bool(changed)
        return report

    valid_outputs: List[str] = []
    missing_reasons: List[str] = []

    for base_token in base_tokens:
        parsed = parse_base_scheme_filename(base_token)
        if parsed is None:
            missing_name = derive_circle_filename(Path(base_token).name or "invalid", pos_value)
            report["missing"].append(missing_name)
            missing_reasons.append(f"esquema base invalido: {base_token}")
            continue

        base_engine, page_num, box_index, base_name = parsed
        target_name = derive_circle_filename(base_name, pos_value)

        if base_engine != engine:
            report["missing"].append(target_name)
            missing_reasons.append(f"engine de esquema no coincide: {base_name}")
            continue

        if asset_exists_in_dirs(target_name, pos_lookup_dirs) and not bool(args.force_regenerate):
            report["reused"].append(target_name)
            valid_outputs.append(target_name)
            continue

        boxes = context.get_boxes(page_num)
        if not boxes or box_index > len(boxes):
            report["missing"].append(target_name)
            missing_reasons.append(f"box no disponible en pagina {page_num:04d} para {base_name}")
            continue

        box = boxes[box_index - 1]
        manual_items = get_manual_override_items(manual_overrides, record_id=record_id, base_name=base_name, pos_value=pos_value)
        if manual_items:
            items = manual_items
            report["manual_override_used"] = True
        else:
            items = detect_pos_items_for_box(
                context=context,
                page_num=page_num,
                box=box,
                target_pos=pos_value,
                dpi=int(args.dpi),
                frame_pad_pt=float(args.frame_pad_pt),
                pos_fallback_pad_pt=float(args.pos_fallback_pad_pt),
                enable_ocr=bool(args.ocr),
            )
        if not items:
            report["missing"].append(target_name)
            missing_reasons.append(f"POS {pos_value} no encontrada en esquema {base_name}")
            continue

        if args.write:
            page = context.doc.load_page(page_num - 1)
            image = render_pos_image(
                page=page,
                box=box,
                items=items,
                frame_pad_pt=float(args.frame_pad_pt),
                dpi=int(args.dpi),
            )
            output_path = pos_output_dir / target_name
            save_image(image, output_path, img_format=POS_EXT, quality=int(args.quality))

        report["generated"].append(target_name)
        valid_outputs.append(target_name)

    dedup_valid: List[str] = []
    seen = set()
    for name in valid_outputs:
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        dedup_valid.append(name)

    next_all = join_csv(dedup_valid)
    next_one = dedup_valid[0] if dedup_valid else ""
    next_url = f"{args.url_base.rstrip('/')}/{next_one}" if next_one else ""

    report["next_esquemas_circulos_all"] = next_all
    report["next_esquemas_circulos"] = next_one
    report["next_ruta_esquemas_pos"] = next_url

    changed = False
    if args.write:
        changed = apply_derived_fields(row, next_one=next_one)

    report["changed"] = bool(changed)

    if not dedup_valid:
        report["status"] = "MISS_POS_NOT_FOUND_IN_SCHEME"
        report["reason"] = "; ".join(missing_reasons) if missing_reasons else "No se genero ningun esquema con POS"
        return report

    if report["missing"]:
        report["status"] = "WARN_PARTIAL"
        report["reason"] = "; ".join(missing_reasons)
        return report

    report["status"] = "OK"
    report["reason"] = "Todos los esquemas base de esquemas procesados correctamente"
    return report


def process_engine(engine: str, args: argparse.Namespace) -> Dict[str, Any]:
    engine_json = resolve_engine_json(engine)
    rows = load_engine_json(engine_json)

    indexes = find_record_indexes(rows, target_id=args.id, all_book=bool(args.all_book or args.all), book=None)
    if int(args.limit or 0) > 0:
        indexes = indexes[: int(args.limit)]

    if args.id and not indexes:
        return {
            "engine": engine,
            "status": "error",
            "reason": f"ID no encontrado: {args.id}",
            "records": [],
            "json_updated": False,
        }

    base_dir = ROOT_DIR / args.base_dir if not Path(args.base_dir).is_absolute() else Path(args.base_dir)
    pos_dir = ROOT_DIR / args.pos_dir if not Path(args.pos_dir).is_absolute() else Path(args.pos_dir)
    base_dir.mkdir(parents=True, exist_ok=True)
    pos_dir.mkdir(parents=True, exist_ok=True)

    _, pos_output_dir, _, pos_lookup_dirs = resolve_engine_asset_dirs(base_dir, pos_dir, engine)
    pos_output_dir.mkdir(parents=True, exist_ok=True)

    pdf_hint = f"{engine}_clean_marcos_mod.pdf"
    pdf_path = resolve_pdf_path(pdf_hint, engine=engine, prefer_manual_framed_pdf=bool(args.prefer_manual_framed_pdf))

    changed_any = False
    record_reports: List[Dict[str, Any]] = []
    manual_overrides = load_manual_overrides(str(args.overrides_json or ""))

    context = EngineContext(engine=engine, pdf_path=pdf_path)
    try:
        for idx in indexes:
            row = rows[idx]
            rec_report = process_record(
                row=row,
                engine=engine,
                context=context,
                args=args,
                pos_output_dir=pos_output_dir,
                pos_lookup_dirs=pos_lookup_dirs,
                manual_overrides=manual_overrides,
            )
            record_reports.append(rec_report)
            changed_any = changed_any or bool(rec_report.get("changed"))

            print(
                f"[RECORD] engine={engine} id={rec_report.get('id')} "
                f"status={rec_report.get('status')} generated={len(rec_report.get('generated', []))} "
                f"reused={len(rec_report.get('reused', []))} missing={len(rec_report.get('missing', []))} "
                f"manual={bool(rec_report.get('manual_override_used'))}"
            )
    finally:
        context.close()

    if args.write and changed_any:
        save_engine_json(engine_json, rows)

    status_counts: Dict[str, int] = {}
    for rec in record_reports:
        key = str(rec.get("status") or "ERROR")
        status_counts[key] = status_counts.get(key, 0) + 1

    return {
        "engine": engine,
        "status": "ok",
        "records_processed": len(record_reports),
        "json_updated": bool(args.write and changed_any),
        "status_counts": status_counts,
        "records": record_reports,
    }


def build_summary(engine_reports: Sequence[Dict[str, Any]], args: argparse.Namespace) -> Dict[str, Any]:
    records = [record for report in engine_reports for record in report.get("records", [])]

    totals: Dict[str, int] = {}
    for rec in records:
        key = str(rec.get("status") or "ERROR")
        totals[key] = totals.get(key, 0) + 1

    return {
        "write": bool(args.write),
        "dry_run": bool(args.dry_run),
        "force_regenerate": bool(args.force_regenerate),
        "ocr": bool(args.ocr),
        "engines": [report.get("engine") for report in engine_reports],
        "records_processed": len(records),
        "records_changed": sum(1 for rec in records if rec.get("changed")),
        "totals_by_status": totals,
        "generated_total": sum(len(rec.get("generated", [])) for rec in records),
        "reused_total": sum(len(rec.get("reused", [])) for rec in records),
        "missing_total": sum(len(rec.get("missing", [])) for rec in records),
        "engine_reports": list(engine_reports),
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    engines = resolve_engines(args.engine, bool(args.all))

    has_error = False
    engine_reports: List[Dict[str, Any]] = []

    for engine in engines:
        try:
            report = process_engine(engine, args)
        except Exception as exc:
            report = {
                "engine": engine,
                "status": "error",
                "reason": str(exc),
                "records": [],
                "json_updated": False,
            }
            has_error = True

        if report.get("status") != "ok":
            has_error = True

        engine_reports.append(report)

    summary = build_summary(engine_reports, args)

    report_path = Path(args.report)
    if not report_path.is_absolute():
        report_path = ROOT_DIR / report_path
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"[REPORT] {report_path}")

    return 1 if has_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
