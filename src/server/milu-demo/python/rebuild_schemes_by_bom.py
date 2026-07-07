#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from generate_esquema_pos import resolve_pdf_path
from python_lib.json_io import load_engine_json, save_engine_json
from rebuild_assets_for_record import (
    EngineContext,
    build_shared_base_assets_for_targets,
    find_record_indexes,
    get_header_clip_rect,
    join_csv,
    normalize_bom_value,
    resolve_engine_asset_dirs,
    resolve_engine_json,
    resolve_engines,
    set_if_changed,
)

ROOT_DIR = Path(__file__).resolve().parent
HEADER_BOM_LINE_RE = re.compile(r"(?i)BOM\s*[- ]?\s*No\.?\s*[:：]?\s*(.*)")
HEADER_BOM_LABEL_RE = re.compile(r"(?i)\bBOM\s*[- ]?\s*No\.?\b")
TOKEN_RE = re.compile(r"[A-Z0-9][A-Z0-9._/-]*")
MIN_BOM_LEN = 6


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Recalcula SOLO el campo esquemas por BOM (sin tocar otros campos)."
    )
    parser.add_argument("--engine", default=None, help="Modelo, por ejemplo 12V4000M40A")
    parser.add_argument("--id", default=None, help="ID de registro")
    parser.add_argument("--all-book", action="store_true", help="Procesa todo el engine indicado")
    parser.add_argument("--all", action="store_true", help="Procesa todos los engines")
    parser.add_argument("--limit", type=int, default=0, help="Limita registros por engine (0 = sin limite)")

    parser.add_argument("--write", action="store_true", help="Guarda cambios en JSON y genera esquemas faltantes")
    parser.add_argument("--dry-run", action="store_true", help="No guarda cambios ni genera archivos")
    parser.add_argument("--force-regenerate", action="store_true", help="Regenera esquemas base aunque existan")
    parser.add_argument("--base-dir", default="esquemas", help="Carpeta base de esquemas")
    parser.add_argument("--page-offset", type=int, default=0, help="Aceptado por compatibilidad; no se usa en el matching por BOM")
    parser.add_argument("--report", default="tmp_rebuild_schemes_by_bom_report.json", help="Ruta del reporte JSON")

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


def pick_row_bom(row: Dict[str, Any]) -> str:
    for key in ("bom_final", "BOM-No.", "bom_pdf"):
        normalized = normalize_bom_value(row.get(key))
        if normalized:
            return normalized
    return ""


def pick_record_page(row: Dict[str, Any]) -> Optional[int]:
    for key in ("Source Page", "source_page", "PAG", "page", "source_page_num"):
        raw = row.get(key)
        if raw is None:
            continue
        try:
            page = int(str(raw).strip())
        except (TypeError, ValueError):
            continue
        if page > 0:
            return page
    return None


def collect_targets_for_pages(context: EngineContext, pages: Sequence[int]) -> List[Tuple[int, List[Any]]]:
    targets: List[Tuple[int, List[Any]]] = []
    for page_num in pages:
        boxes = context.get_boxes(page_num)
        if boxes:
            targets.append((page_num, boxes))
    return targets


def extract_boms_from_header_text(header_text: str) -> List[str]:
    lines = [line.strip() for line in (header_text or "").replace("\r", "").split("\n")]
    boms: List[str] = []
    seen = set()

    for idx, line in enumerate(lines):
        if not line:
            continue
        match = HEADER_BOM_LINE_RE.search(line)
        if not match:
            continue

        chunks = [match.group(1) or ""]
        if idx + 1 < len(lines):
            next_line = lines[idx + 1]
            if next_line and not HEADER_BOM_LABEL_RE.search(next_line):
                chunks.append(next_line)

        raw = " ".join(chunks).upper()
        for token in TOKEN_RE.findall(raw):
            normalized = normalize_bom_value(token)
            if not normalized:
                continue
            if len(normalized) < MIN_BOM_LEN:
                continue
            if not any(ch.isdigit() for ch in normalized):
                continue
            if normalized in seen:
                continue
            seen.add(normalized)
            boms.append(normalized)

    return boms


def extract_page_boms(context: EngineContext, page_num: int) -> List[str]:
    boxes = context.get_boxes(page_num)
    if not boxes:
        return []

    page = context.doc.load_page(page_num - 1)
    clip = get_header_clip_rect(page, boxes)
    header_text = page.get_text("text", clip=clip) or ""

    boms = extract_boms_from_header_text(header_text)
    if boms:
        return boms

    fallback = normalize_bom_value((context.get_page_meta(page_num) or {}).get("bom"))
    return [fallback] if fallback else []


def build_page_bom_map(context: EngineContext) -> Dict[int, List[str]]:
    page_bom_map: Dict[int, List[str]] = {}
    for page_num in range(1, len(context.doc) + 1):
        boms = extract_page_boms(context, page_num)
        if boms:
            page_bom_map[page_num] = boms
    return page_bom_map


def build_bom_groups(
    page_bom_map: Dict[int, List[str]],
) -> Dict[str, List[List[int]]]:
    bom_pages: Dict[str, List[int]] = {}
    for page_num in sorted(page_bom_map.keys()):
        for bom in page_bom_map[page_num]:
            bom_pages.setdefault(bom, []).append(page_num)

    bom_groups: Dict[str, List[List[int]]] = {}
    for bom, pages in bom_pages.items():
        unique_pages = sorted(set(pages))
        groups: List[List[int]] = []
        current: List[int] = []
        prev_signature: Optional[Tuple[str, ...]] = None

        for page_num in unique_pages:
            page_signature = tuple(sorted(page_bom_map.get(page_num, [])))
            if not current:
                current = [page_num]
                prev_signature = page_signature
                continue

            prev_page = current[-1]
            # Split group if page is not consecutive OR the full BOM signature changed.
            if page_num == prev_page + 1 and page_signature == prev_signature:
                current.append(page_num)
                prev_signature = page_signature
                continue

            groups.append(current)
            current = [page_num]
            prev_signature = page_signature

        if current:
            groups.append(current)

        bom_groups[bom] = groups

    return bom_groups


def build_bom_group_assets(
    engine: str,
    context: EngineContext,
    args: argparse.Namespace,
    base_output_dir: Path,
    base_lookup_dirs: Sequence[Path],
    bom_groups: Dict[str, List[List[int]]],
    relevant_boms: Set[str],
) -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {}
    builder_args = SimpleNamespace(
        write=bool(args.write),
        dry_run=bool(args.dry_run),
        force_regenerate=bool(args.force_regenerate),
        only_sync_json=False,
        frame_pad_pt=0.5,
        dpi=200,
    )

    for bom, groups in bom_groups.items():
        if relevant_boms and bom not in relevant_boms:
            continue
        built_groups: List[Dict[str, Any]] = []
        for pages in groups:
            selected_targets = collect_targets_for_pages(context, pages)
            schemes, generated = build_shared_base_assets_for_targets(
                engine,
                context,
                selected_targets,
                builder_args,
                base_output_dir,
                base_lookup_dirs,
            )
            built_groups.append(
                {
                    "pages": list(pages),
                    "schemes": list(schemes),
                    "schemes_generated": int(generated),
                }
            )
        out[bom] = built_groups

    return out


def choose_group_for_record(
    record_page: int,
    groups: Sequence[Dict[str, Any]],
) -> Tuple[Optional[Dict[str, Any]], str, str]:
    for group in groups:
        pages = [int(p) for p in group.get("pages", [])]
        if record_page in pages:
            return group, "OK", "record_page_in_group"

    nearest_group: Optional[Dict[str, Any]] = None
    nearest_score: Optional[Tuple[int, int]] = None
    for group in groups:
        pages = [int(p) for p in group.get("pages", [])]
        if not pages:
            continue
        dist = min(abs(record_page - p) for p in pages)
        score = (dist, min(pages))
        if nearest_score is None or score < nearest_score:
            nearest_score = score
            nearest_group = group

    if nearest_group is None:
        return None, "MISS_BOM_NOT_FOUND", "no_groups_available"

    return nearest_group, "WARN_BOM_GROUP_BY_NEAREST_PAGE", "nearest_group_by_record_page"


def recalc_record_esquemas_by_bom_group(
    row: Dict[str, Any],
    bom_group_assets: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    record_id = str(row.get("ID") or "").strip()
    record_page = pick_record_page(row)
    bom = pick_row_bom(row)

    previous_esquemas = "" if row.get("esquemas") is None else str(row.get("esquemas"))
    next_esquemas = ""
    selected_group_pages: List[int] = []
    selected_group_schemes: List[str] = []
    reason = ""

    bom_groups_raw = [
        list(group.get("pages", []))
        for group in bom_group_assets.get(bom, [])
    ]

    if not bom:
        changed = set_if_changed(row, "esquemas", next_esquemas)
        return {
            "id": record_id,
            "bom": bom,
            "record_page": record_page,
            "status": "MISS_NO_BOM",
            "previous_esquemas": previous_esquemas,
            "next_esquemas": next_esquemas,
            "bom_groups": [],
            "selected_group_pages": selected_group_pages,
            "selected_group_schemes": selected_group_schemes,
            "reason": "BOM no disponible",
            "changed": bool(changed),
        }

    groups_for_bom = bom_group_assets.get(bom, [])
    if not groups_for_bom:
        changed = set_if_changed(row, "esquemas", next_esquemas)
        return {
            "id": record_id,
            "bom": bom,
            "record_page": record_page,
            "status": "MISS_BOM_NOT_FOUND",
            "previous_esquemas": previous_esquemas,
            "next_esquemas": next_esquemas,
            "bom_groups": [],
            "selected_group_pages": selected_group_pages,
            "selected_group_schemes": selected_group_schemes,
            "reason": f"BOM no encontrado en mapa de PDF: {bom}",
            "changed": bool(changed),
        }

    if record_page is None:
        changed = set_if_changed(row, "esquemas", next_esquemas)
        return {
            "id": record_id,
            "bom": bom,
            "record_page": record_page,
            "status": "MISS_NO_PAGE_FOR_GROUP",
            "previous_esquemas": previous_esquemas,
            "next_esquemas": next_esquemas,
            "bom_groups": bom_groups_raw,
            "selected_group_pages": selected_group_pages,
            "selected_group_schemes": selected_group_schemes,
            "reason": "No hay página de referencia para elegir grupo",
            "changed": bool(changed),
        }

    selected_group, status, reason = choose_group_for_record(record_page, groups_for_bom)
    if selected_group:
        selected_group_pages = list(selected_group.get("pages", []))
        selected_group_schemes = list(selected_group.get("schemes", []))
        next_esquemas = join_csv(selected_group_schemes)
    else:
        next_esquemas = ""
        status = "MISS_BOM_NOT_FOUND"
        reason = "No hay grupo seleccionable"

    changed = set_if_changed(row, "esquemas", next_esquemas)

    return {
        "id": record_id,
        "bom": bom,
        "record_page": record_page,
        "status": status,
        "previous_esquemas": previous_esquemas,
        "next_esquemas": next_esquemas,
        "bom_groups": bom_groups_raw,
        "selected_group_pages": selected_group_pages,
        "selected_group_schemes": selected_group_schemes,
        "reason": reason,
        "changed": bool(changed),
    }


def process_engine(engine: str, args: argparse.Namespace) -> Dict[str, Any]:
    engine_json = resolve_engine_json(engine)
    rows = load_engine_json(engine_json)

    if args.id:
        indexes = find_record_indexes(rows, target_id=args.id, all_book=False, book=None)
        if not indexes:
            return {
                "engine": engine,
                "records_processed": 0,
                "records_changed": 0,
                "records_skipped_no_bom": 0,
                "records_miss_no_pages": 0,
                "schemes_found": 0,
                "schemes_generated": 0,
                "records": [
                    {
                        "id": args.id,
                        "bom": "",
                        "record_page": None,
                        "status": "ERROR_ID_NOT_FOUND",
                        "previous_esquemas": "",
                        "next_esquemas": "",
                        "bom_groups": [],
                        "selected_group_pages": [],
                        "selected_group_schemes": [],
                        "reason": f"ID no encontrado: {args.id}",
                        "changed": False,
                    }
                ],
            }
    else:
        indexes = list(range(len(rows)))

    if int(args.limit or 0) > 0:
        indexes = indexes[: int(args.limit)]

    pdf_hint = f"{engine}_clean_marcos_mod.pdf"
    pdf_path = resolve_pdf_path(
        pdf_hint,
        engine=engine,
        prefer_manual_framed_pdf=True,
    )

    base_dir = ROOT_DIR / args.base_dir if not Path(args.base_dir).is_absolute() else Path(args.base_dir)
    base_dir.mkdir(parents=True, exist_ok=True)

    base_output_dir, _pos_output_dir, base_lookup_dirs, _pos_lookup_dirs = resolve_engine_asset_dirs(base_dir, ROOT_DIR / "esquemas_pos_circulos", engine)
    base_output_dir.mkdir(parents=True, exist_ok=True)

    report_records: List[Dict[str, Any]] = []
    changed_any = False

    context = EngineContext(engine=engine, pdf_path=pdf_path)
    try:
        page_bom_map = build_page_bom_map(context)
        bom_groups = build_bom_groups(page_bom_map)
        relevant_boms = {
            pick_row_bom(rows[idx])
            for idx in indexes
            if pick_row_bom(rows[idx])
        }
        bom_group_assets = build_bom_group_assets(
            engine=engine,
            context=context,
            args=args,
            base_output_dir=base_output_dir,
            base_lookup_dirs=base_lookup_dirs,
            bom_groups=bom_groups,
            relevant_boms=relevant_boms,
        )

        for idx in indexes:
            row = rows[idx]
            rec = recalc_record_esquemas_by_bom_group(
                row=row,
                bom_group_assets=bom_group_assets,
            )
            report_records.append(rec)
            if rec.get("changed"):
                changed_any = True

            print(f"[RECORD] engine={engine} id={rec.get('id')} status={rec.get('status')}")
            print(f"[REASON] {rec.get('reason')}")
            if rec.get("bom"):
                print(f"[BOM] {rec.get('bom')}")
            if rec.get("selected_group_pages"):
                pages_label = ",".join(str(p) for p in rec.get("selected_group_pages", []))
                print(f"[GROUP] pages={pages_label}")
    finally:
        context.close()

    if args.write and changed_any:
        save_engine_json(engine_json, rows)

    records_changed = sum(1 for rec in report_records if rec.get("changed"))
    records_skipped_no_bom = sum(1 for rec in report_records if rec.get("status") == "MISS_NO_BOM")
    records_miss_no_pages = sum(1 for rec in report_records if rec.get("status") == "MISS_BOM_NOT_FOUND")
    records_miss_no_page_for_group = sum(1 for rec in report_records if rec.get("status") == "MISS_NO_PAGE_FOR_GROUP")
    records_warn_nearest_group = sum(1 for rec in report_records if rec.get("status") == "WARN_BOM_GROUP_BY_NEAREST_PAGE")
    schemes_found = sum(len(rec.get("selected_group_schemes") or []) for rec in report_records)
    schemes_generated = sum(
        sum(int(group.get("schemes_generated", 0)) for group in groups)
        for groups in bom_group_assets.values()
    )

    return {
        "engine": engine,
        "records_processed": len(report_records),
        "records_changed": records_changed,
        "records_skipped_no_bom": records_skipped_no_bom,
        "records_miss_no_pages": records_miss_no_pages,
        "records_miss_no_page_for_group": records_miss_no_page_for_group,
        "records_warn_nearest_group": records_warn_nearest_group,
        "schemes_found": schemes_found,
        "schemes_generated": schemes_generated,
        "records": report_records,
    }


def build_global_report(engine_reports: Sequence[Dict[str, Any]], args: argparse.Namespace) -> Dict[str, Any]:
    return {
        "write": bool(args.write),
        "dry_run": bool(args.dry_run),
        "force_regenerate": bool(args.force_regenerate),
        "criteria": "BOM_ONLY",
        "engines": [report.get("engine") for report in engine_reports],
        "engine_reports": list(engine_reports),
        "totals": {
            "records_processed": sum(int(report.get("records_processed", 0)) for report in engine_reports),
            "records_changed": sum(int(report.get("records_changed", 0)) for report in engine_reports),
            "records_skipped_no_bom": sum(int(report.get("records_skipped_no_bom", 0)) for report in engine_reports),
            "records_miss_no_pages": sum(int(report.get("records_miss_no_pages", 0)) for report in engine_reports),
            "records_miss_no_page_for_group": sum(int(report.get("records_miss_no_page_for_group", 0)) for report in engine_reports),
            "records_warn_nearest_group": sum(int(report.get("records_warn_nearest_group", 0)) for report in engine_reports),
            "schemes_found": sum(int(report.get("schemes_found", 0)) for report in engine_reports),
            "schemes_generated": sum(int(report.get("schemes_generated", 0)) for report in engine_reports),
        },
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)

    engines = resolve_engines(args.engine, args.all)
    if not args.all and args.engine:
        engine_single = args.engine.removeprefix("engine_").removesuffix(".json")
        engines = [engine_single]

    engine_reports: List[Dict[str, Any]] = []

    for engine in engines:
        local_args = argparse.Namespace(**vars(args))
        if args.id:
            local_args.all_book = False
        elif args.all:
            local_args.all_book = True

        report = process_engine(engine, local_args)
        engine_reports.append(report)

    global_report = build_global_report(engine_reports, args)

    report_path = Path(args.report)
    if not report_path.is_absolute():
        report_path = ROOT_DIR / report_path
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(global_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"[REPORT] {report_path}")
    print(json.dumps(global_report["totals"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
