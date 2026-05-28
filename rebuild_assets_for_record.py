#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import fitz
from PIL import Image, ImageDraw

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from generate_esquema_pos import (
    coerce_int,
    detect_pos_items,
    draw_circle,
    expand_box_in_page,
    get_scheme_boxes,
    normalize_pos,
    render_clip,
    resolve_pdf_path,
    save_image,
)
from python_lib.engine_constants import ENGINE_FILES
from python_lib.json_io import load_engine_json, save_engine_json

DEFAULT_BASE_DIR = "esquemas"
DEFAULT_POS_DIR = "esquemas_pos_circulos"
DEFAULT_URL_BASE = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02"
BASE_EXT = "png"
POS_EXT = "webp"
POS_NAME_RE = re.compile(r"^(?P<engine>.+)-(?P<page>\d{4})-(?P<box>\d{2})-(?P<pos>\d+)\.[A-Za-z0-9]+$")
BASE_NAME_RE = re.compile(r"^(?P<engine>.+)-(?P<page>\d{4})-(?P<box>\d{2})\.[A-Za-z0-9]+$")
HEADER_MARGIN_PTS = 12.0
HEADER_RATIO_FALLBACK = 0.28


def split_csv(value: Any) -> List[str]:
    raw = str(value or "")
    return [part.strip() for part in raw.replace(";", ",").split(",") if part.strip()]


def join_csv(values: Sequence[str]) -> str:
    return " , ".join(values)


def merge_exp_imagenes(existing: Any, ruta_foto: Any, ruta_esquemas_pos: Any) -> str:
    merged: List[str] = []
    seen = set()
    for raw in (existing, ruta_foto, ruta_esquemas_pos):
        for token in split_csv(raw):
            key = token.lower()
            if key in seen:
                continue
            seen.add(key)
            merged.append(token)
    return ", ".join(merged)


def set_if_changed(row: Dict[str, Any], key: str, value: Any) -> bool:
    previous = row.get(key)
    previous_text = "" if previous is None else str(previous)
    next_text = "" if value is None else str(value)
    if previous_text == next_text:
        return False
    row[key] = value
    return True


def resolve_engine_json(engine: str) -> Path:
    model = engine.removeprefix("engine_").removesuffix(".json")
    path = ROOT_DIR / f"engine_{model}.json"
    if not path.exists():
        raise FileNotFoundError(f"No existe {path.name}")
    return path


def resolve_engines(engine: Optional[str], all_engines: bool) -> List[str]:
    if all_engines:
        return [name.removeprefix("engine_").removesuffix(".json") for name in ENGINE_FILES]
    if not engine:
        raise ValueError("Debes indicar --engine o --all")
    return [engine.removeprefix("engine_").removesuffix(".json")]


def parse_pos_filename(filename: str) -> Optional[Dict[str, Any]]:
    match = POS_NAME_RE.match(Path(filename).name)
    if not match:
        return None
    return {
        "engine": match.group("engine"),
        "page": int(match.group("page")),
        "box": int(match.group("box")),
        "pos": match.group("pos"),
        "filename": Path(filename).name,
    }


def collect_existing_pos_from_json(record: Dict[str, Any], engine: str, pos_value: str, pos_dir: Path) -> List[str]:
    out: List[str] = []
    seen = set()
    sources = [
        *split_csv(record.get("esquemas_circulos_all")),
        *split_csv(record.get("esquemas_circulos")),
        *split_csv(record.get("ruta_esquemas_pos")),
    ]
    for token in sources:
        name = Path(token).name
        parsed = parse_pos_filename(name)
        if not parsed:
            continue
        if parsed["engine"] != engine or parsed["pos"] != pos_value:
            continue
        path = pos_dir / name
        if not path.exists():
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def choose_tried_pages(source_page: Optional[int], page_offset: int) -> List[int]:
    if source_page is None:
        return []
    pages: List[int] = []
    seen = set()
    for candidate in (source_page, source_page + page_offset):
        if candidate < 1 or candidate in seen:
            continue
        seen.add(candidate)
        pages.append(candidate)
    return pages


def normalize_bom_value(raw: Any) -> str:
    token = str(raw or "").strip().upper()
    if not token:
        return ""
    return re.sub(r"[^A-Z0-9]", "", token)


def normalize_fgfgs_value(raw: Any) -> str:
    token = str(raw or "").strip().upper()
    if not token:
        return ""
    numbers = re.findall(r"\d+", token)
    if len(numbers) >= 2:
        return f"{int(numbers[0])}-{int(numbers[1])}"
    if len(numbers) == 1:
        return f"{int(numbers[0])}"
    return ""


def get_header_clip_rect(page_obj: fitz.Page, red_boxes: Sequence[fitz.Rect], header_margin_pts: float = HEADER_MARGIN_PTS) -> fitz.Rect:
    page_rect = page_obj.rect
    if red_boxes:
        min_y0 = min(box.y0 for box in red_boxes)
        y1 = max(page_rect.y0, min_y0 - header_margin_pts)
        y1 = max(y1, page_rect.y0 + page_rect.height * 0.08)
        return fitz.Rect(page_rect.x0, page_rect.y0, page_rect.x1, y1)
    return fitz.Rect(page_rect.x0, page_rect.y0, page_rect.x1, page_rect.y0 + page_rect.height * HEADER_RATIO_FALLBACK)


def extract_after_label(header_text: str, label_regex: str) -> Optional[str]:
    pattern = re.compile(rf"(?i)\b{label_regex}\b\s*[:：]?\s*(.*)")
    lines = header_text.split("\n")
    for idx, line in enumerate(lines):
        match = pattern.search(line)
        if not match:
            continue
        parts = [(match.group(1) or "").strip()]
        if idx + 1 < len(lines):
            parts.append(lines[idx + 1].strip())
        if idx + 2 < len(lines):
            parts.append(lines[idx + 2].strip())
        joined = " ".join(part for part in parts if part)
        joined = re.sub(r"\s{2,}", " ", joined).strip()
        return joined or None
    return None


def pick_bom_candidate(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    token = re.sub(r"^[\.\:\;\,\-]+", "", raw.strip())
    matches = re.findall(r"[0-9A-Za-z][0-9A-Za-z\.\-_\/]*", token)
    if not matches:
        return None
    matches = sorted(matches, key=lambda t: (len(re.findall(r"\d", t)), len(t)), reverse=True)
    return matches[0].strip() or None


def pick_fgfgs_candidate(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    token = raw.strip()
    token = re.sub(r"^[\.\:\;\,\-]+", "", token).strip()
    token = re.sub(r"(?i)\b(FG\s*/\s*FGS)\b", "", token).strip()
    token = re.sub(r"\s{2,}", " ", token).strip()
    match = re.search(r"\b(\d{1,4})\b\s*[-/ ]\s*\b(\d{1,4})\b", token)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    single = re.search(r"\b(\d{1,4})\b", token)
    if single:
        return single.group(1)
    return token or None


def extract_page_header_meta(page_obj: fitz.Page, red_boxes: Sequence[fitz.Rect]) -> Dict[str, str]:
    clip = get_header_clip_rect(page_obj, red_boxes)
    header = page_obj.get_text("text", clip=clip) or ""
    header = header.replace("\r\n", "\n").replace("\r", "\n")
    header = re.sub(r"[ \t]+", " ", header)
    header = re.sub(r"\n{3,}", "\n\n", header).strip()

    fgfgs_raw = extract_after_label(header, r"FG\s*/\s*FGS")
    bom_raw = extract_after_label(header, r"BOM\s*[- ]?\s*No\.?")

    fgfgs = pick_fgfgs_candidate(fgfgs_raw)
    bom = pick_bom_candidate(bom_raw)
    return {
        "fgfgs": normalize_fgfgs_value(fgfgs),
        "bom": normalize_bom_value(bom),
    }


def extract_row_meta(row: Dict[str, Any]) -> Dict[str, str]:
    fgfgs_candidates = [
        row.get("fg_fgs_final"),
        row.get("FG/FGS"),
        row.get("fg_fgs_pdf"),
    ]
    bom_candidates = [
        row.get("bom_final"),
        row.get("BOM-No."),
        row.get("bom_pdf"),
    ]

    row_fgfgs = ""
    for raw in fgfgs_candidates:
        row_fgfgs = normalize_fgfgs_value(raw)
        if row_fgfgs:
            break

    row_bom = ""
    for raw in bom_candidates:
        row_bom = normalize_bom_value(raw)
        if row_bom:
            break

    return {"fgfgs": row_fgfgs, "bom": row_bom}


def infer_preferred_page_from_row(row: Dict[str, Any], engine: str) -> Optional[int]:
    candidates = [
        *split_csv(row.get("esquemas")),
        *split_csv(row.get("esquemas_circulos_all")),
        *split_csv(row.get("esquemas_circulos")),
        *split_csv(row.get("ruta_esquemas_pos")),
    ]

    for token in candidates:
        name = Path(token).name
        parsed_pos = parse_pos_filename(name)
        if parsed_pos and parsed_pos["engine"] == engine:
            return int(parsed_pos["page"])
        parsed_base = BASE_NAME_RE.match(name)
        if parsed_base and parsed_base.group("engine") == engine:
            return int(parsed_base.group("page"))
    return None


def render_base_image(page: fitz.Page, box: fitz.Rect, frame_pad_pt: float, dpi: int) -> Image.Image:
    clip = expand_box_in_page(fitz.Rect(box), page.rect, frame_pad_pt)
    return render_clip(page, clip, dpi=dpi)


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
        if item.get("source") == "OCR":
            x, y, width, height = item["px"]
            draw_circle(draw, x + dx_px, y + dy_px, width, height, line_width=6)
            continue
        rect = item["rect_pdf"]
        x0 = int((rect.x0 - clip_outer.x0) * zoom)
        y0 = int((rect.y0 - clip_outer.y0) * zoom)
        x1 = int((rect.x1 - clip_outer.x0) * zoom)
        y1 = int((rect.y1 - clip_outer.y0) * zoom)
        draw_circle(draw, min(x0, x1), min(y0, y1), abs(x1 - x0), abs(y1 - y0), line_width=6)

    return image


def find_record_indexes(rows: Sequence[Dict[str, Any]], target_id: Optional[str], all_book: bool, book: Optional[str]) -> List[int]:
    if target_id:
        target = str(target_id).strip()
        for idx, row in enumerate(rows):
            if str(row.get("ID") or "").strip() == target:
                return [idx]
        return []

    if all_book:
        if not book:
            return list(range(len(rows)))

        book_norm = str(book).strip().lower()

        def matches_book(row: Dict[str, Any]) -> bool:
            candidates = [
                row.get("source_file"),
                row.get("book_set"),
                row.get("engine_model"),
            ]
            for candidate in candidates:
                if str(candidate or "").strip().lower() == book_norm:
                    return True
            return False

        return [idx for idx, row in enumerate(rows) if matches_book(row)]

    return []


class EngineContext:
    def __init__(self, engine: str, pdf_path: Path) -> None:
        self.engine = engine
        self.pdf_path = pdf_path
        self.doc = fitz.open(pdf_path)
        self.page_boxes_cache: Dict[int, List[fitz.Rect]] = {}
        self.page_meta_cache: Dict[int, Dict[str, str]] = {}

    def close(self) -> None:
        self.doc.close()

    def get_boxes(self, page_num: int) -> List[fitz.Rect]:
        if page_num in self.page_boxes_cache:
            return self.page_boxes_cache[page_num]
        if page_num < 1 or page_num > len(self.doc):
            self.page_boxes_cache[page_num] = []
            return []
        page = self.doc.load_page(page_num - 1)
        boxes = get_scheme_boxes(page)
        self.page_boxes_cache[page_num] = boxes
        return boxes

    def get_page_meta(self, page_num: int) -> Dict[str, str]:
        if page_num in self.page_meta_cache:
            return self.page_meta_cache[page_num]
        boxes = self.get_boxes(page_num)
        if not boxes:
            self.page_meta_cache[page_num] = {"fgfgs": "", "bom": ""}
            return self.page_meta_cache[page_num]
        page = self.doc.load_page(page_num - 1)
        meta = extract_page_header_meta(page, boxes)
        self.page_meta_cache[page_num] = meta
        return meta

    def find_best_page_for_row(self, row: Dict[str, Any], source_page: int) -> Optional[int]:
        row_meta = extract_row_meta(row)
        row_fgfgs = row_meta["fgfgs"]
        row_bom = row_meta["bom"]
        if not row_fgfgs and not row_bom:
            return None

        best_page: Optional[int] = None
        best_score = -10**9

        for page_num in range(1, len(self.doc) + 1):
            boxes = self.get_boxes(page_num)
            if not boxes:
                continue

            meta = self.get_page_meta(page_num)
            page_fgfgs = meta.get("fgfgs") or ""
            page_bom = meta.get("bom") or ""

            score = 0
            if row_fgfgs and page_fgfgs:
                if row_fgfgs == page_fgfgs:
                    score += 80
                else:
                    continue

            if row_bom and page_bom:
                if row_bom == page_bom:
                    score += 120
                else:
                    continue

            if row_fgfgs and row_bom:
                score += 20

            score -= abs(page_num - source_page)

            if score > best_score:
                best_score = score
                best_page = page_num

        return best_page


def process_record(
    row: Dict[str, Any],
    engine: str,
    context: EngineContext,
    args: argparse.Namespace,
    base_dir: Path,
    pos_dir: Path,
) -> Dict[str, Any]:
    row_id = str(row.get("ID") or "").strip() or None
    source_page = coerce_int(row.get("Source Page") or row.get("page4"))
    pos_value = normalize_pos(row.get("pos_final") or row.get("POS"))

    result = {
        "engine": engine,
        "id": row_id,
        "source_page": source_page,
        "schemes_found": 0,
        "schemes_generated": 0,
        "pos_found": 0,
        "pos_generated": 0,
        "json_updated": False,
        "status": "ok",
        "logs": [],
    }

    if row_id is None:
        result["status"] = "skip"
        result["logs"].append("[MISS] registro sin ID")
        return result

    if source_page is None:
        result["status"] = "skip"
        result["logs"].append("[MISS] Source Page no disponible")
        return result

    tried_pages = choose_tried_pages(source_page, int(args.page_offset))
    preferred_page = infer_preferred_page_from_row(row, engine)
    if preferred_page is not None and preferred_page not in tried_pages:
        tried_pages = [preferred_page, *tried_pages]
    elif preferred_page is not None:
        tried_pages = [preferred_page, *[p for p in tried_pages if p != preferred_page]]

    selected_page: Optional[int] = None
    boxes: List[fitz.Rect] = []

    for page_num in tried_pages:
        boxes = context.get_boxes(page_num)
        if boxes:
            selected_page = page_num
            break

    if selected_page is None:
        inferred_page = context.find_best_page_for_row(row, source_page)
        if inferred_page is not None:
            boxes = context.get_boxes(inferred_page)
            if boxes:
                selected_page = inferred_page
                result["logs"].append(f"[AUTO] pagina esquema inferida por metadatos FG/BOM: {inferred_page}")

    if selected_page is None:
        result["status"] = "skip"
        result["logs"].append("[MISS] no se detectaron esquemas en paginas candidatas")
        return result

    page = context.doc.load_page(selected_page - 1)
    result["schemes_found"] = len(boxes)

    present_base: List[str] = []
    for box_index, box in enumerate(boxes, start=1):
        filename = f"{engine}-{selected_page:04d}-{box_index:02d}.{BASE_EXT}"
        path = base_dir / filename
        exists = path.exists()

        if exists and not args.force_regenerate:
            result["logs"].append(f"[OK] esquema existente: {filename}")
            present_base.append(filename)
            continue

        if args.only_sync_json:
            if exists:
                present_base.append(filename)
            continue

        action_gen = (not exists) or args.force_regenerate
        if action_gen:
            if bool(args.write):
                image = render_base_image(page, box, frame_pad_pt=float(args.frame_pad_pt), dpi=int(args.dpi))
                save_image(image, path, img_format=BASE_EXT, quality=95)
            result["schemes_generated"] += 1
            result["logs"].append(f"[GEN] esquema generado: {filename}")
            present_base.append(filename)

    expected_esquemas = join_csv(present_base)
    changed_base = set_if_changed(row, "esquemas", expected_esquemas)
    if changed_base:
        result["logs"].append("[SYNC] json esquemas actualizado")

    present_pos: List[str] = []
    pos_match_objects: List[Tuple[int, fitz.Rect, List[Dict[str, Any]]]] = []

    if pos_value is None:
        result["logs"].append("[MISS] pos no encontrado: pos_final/POS vacio")
    else:
        for box_index, box in enumerate(boxes, start=1):
            clip_outer = expand_box_in_page(fitz.Rect(box), page.rect, float(args.frame_pad_pt))
            clip_inner = fitz.Rect(clip_outer.x0 + 1.0, clip_outer.y0 + 1.0, clip_outer.x1 - 1.0, clip_outer.y1 - 1.0)
            if clip_inner.x1 <= clip_inner.x0 or clip_inner.y1 <= clip_inner.y0:
                clip_inner = fitz.Rect(clip_outer)

            items = detect_pos_items(page, clip_inner, pos_value, dpi=int(args.dpi))
            if not items:
                # Escala de fallback: algunos POS quedan fuera del marco inicial del esquema.
                pads = [
                    float(args.pos_fallback_pad_pt),
                    max(float(args.pos_fallback_pad_pt), 120.0),
                    max(float(args.pos_fallback_pad_pt), 260.0),
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
                    items = detect_pos_items(page, clip_fallback, pos_value, dpi=int(args.dpi))
                    if items:
                        break
            if not items:
                continue
            pos_match_objects.append((box_index, box, items))

        result["pos_found"] = len(pos_match_objects)

        if not pos_match_objects:
            fallback_existing = collect_existing_pos_from_json(row, engine, pos_value, pos_dir)
            if fallback_existing:
                present_pos.extend(fallback_existing)
                for name in fallback_existing:
                    result["logs"].append(f"[OK] esquema_pos existente: {name}")
            else:
                result["logs"].append("[MISS] pos no encontrado")

        for box_index, box, items in pos_match_objects:
            filename = f"{engine}-{selected_page:04d}-{box_index:02d}-{pos_value}.{POS_EXT}"
            path = pos_dir / filename
            exists = path.exists()

            if exists and not args.force_regenerate:
                result["logs"].append(f"[OK] esquema_pos existente: {filename}")
                present_pos.append(filename)
                continue

            if args.only_sync_json:
                if exists:
                    present_pos.append(filename)
                continue

            action_gen = (not exists) or args.force_regenerate
            if action_gen:
                if bool(args.write):
                    image = render_pos_image(
                        page,
                        box,
                        items,
                        frame_pad_pt=float(args.frame_pad_pt),
                        dpi=int(args.dpi),
                    )
                    save_image(image, path, img_format=POS_EXT, quality=int(args.quality))
                result["pos_generated"] += 1
                result["logs"].append(f"[GEN] esquema_pos generado: {filename}")
                present_pos.append(filename)

    dedup_pos: List[str] = []
    seen_pos = set()
    for name in present_pos:
        key = name.lower()
        if key in seen_pos:
            continue
        seen_pos.add(key)
        dedup_pos.append(name)

    main_pos = dedup_pos[0] if dedup_pos else ""
    main_url = f"{args.url_base.rstrip('/')}/{main_pos}" if main_pos else ""

    changed_pos = False
    changed_pos = set_if_changed(row, "esquemas_circulos_all", join_csv(dedup_pos)) or changed_pos
    changed_pos = set_if_changed(row, "esquemas_circulos", main_pos) or changed_pos
    changed_pos = set_if_changed(row, "ruta_esquemas_pos", main_url) or changed_pos
    if main_url:
        next_exp = merge_exp_imagenes(row.get("exp_imagenes"), row.get("ruta_foto"), main_url)
        changed_pos = set_if_changed(row, "exp_imagenes", next_exp) or changed_pos

    if changed_pos:
        result["logs"].append("[SYNC] json POS actualizado")

    result["json_updated"] = bool(changed_base or changed_pos)

    return result


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rebuild incremental de esquemas y esquemas POS")

    parser.add_argument("--engine", default=None, help="Modelo, por ejemplo 12V4000M40A")
    parser.add_argument("--id", default=None, help="ID de registro para modo registro unico")
    parser.add_argument("--all-book", action="store_true", help="Procesa todo el libro (engine) o un sub-book")
    parser.add_argument("--book", default=None, help="Filtro opcional por source_file/book_set/engine_model")
    parser.add_argument("--all", action="store_true", help="Procesa todos los engines")
    parser.add_argument("--limit", type=int, default=0, help="Limita registros procesados por engine (0 = sin limite)")

    parser.add_argument("--write", action="store_true", help="Persiste cambios (JSON e imagenes)")
    parser.add_argument("--dry-run", action="store_true", help="No persiste cambios")
    parser.add_argument("--force-regenerate", action="store_true", help="Regenera imagenes aunque existan")
    parser.add_argument("--only-sync-json", action="store_true", help="Solo sincroniza JSON segun archivos existentes")

    parser.add_argument("--base-dir", default=DEFAULT_BASE_DIR, help="Carpeta para esquemas base")
    parser.add_argument("--pos-dir", default=DEFAULT_POS_DIR, help="Carpeta para esquemas POS")
    parser.add_argument("--url-base", default=DEFAULT_URL_BASE, help="Base URL para ruta_esquemas_pos")

    parser.add_argument("--page-offset", type=int, default=0, help="Offset alternativo sobre Source Page")
    parser.add_argument("--dpi", type=int, default=200, help="DPI de render")
    parser.add_argument("--quality", type=int, default=90, help="Calidad WEBP POS")
    parser.add_argument("--frame-pad-pt", type=float, default=0.5, help="Margen de recorte en puntos")
    parser.add_argument("--pos-fallback-pad-pt", type=float, default=45.0, help="Margen extra para fallback de deteccion POS")

    parser.add_argument("--report", default="tmp_rebuild_assets_for_record_report.json", help="Ruta de reporte JSON")
    parser.add_argument(
        "--prefer-manual-framed-pdf",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Prioriza pdf/03-Libros_Marcos_modificados_a_mano",
    )

    args = parser.parse_args(argv)

    if args.write and args.dry_run:
        parser.error("No puedes combinar --write y --dry-run")

    if not args.write:
        args.dry_run = True

    if args.id and args.all_book:
        parser.error("--id y --all-book son excluyentes")
    if args.id and args.all:
        parser.error("--id y --all son excluyentes")
    if args.all_book and args.all:
        parser.error("--all-book y --all son excluyentes")

    if args.id and not args.engine:
        parser.error("Para --id debes indicar --engine")
    if args.all_book and not args.engine:
        parser.error("Para --all-book debes indicar --engine")
    if not args.id and not args.all_book and not args.all:
        parser.error("Debes usar uno de estos modos: --id, --all-book o --all")

    return args


def process_engine(engine: str, args: argparse.Namespace) -> Dict[str, Any]:
    engine_json = resolve_engine_json(engine)
    rows = load_engine_json(engine_json)

    indexes = find_record_indexes(rows, target_id=args.id, all_book=bool(args.all_book or args.all), book=args.book)
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

    pdf_hint = f"{engine}_clean_marcos_mod.pdf"
    pdf_path = resolve_pdf_path(pdf_hint, engine=engine, prefer_manual_framed_pdf=bool(args.prefer_manual_framed_pdf))

    base_dir = ROOT_DIR / args.base_dir if not Path(args.base_dir).is_absolute() else Path(args.base_dir)
    pos_dir = ROOT_DIR / args.pos_dir if not Path(args.pos_dir).is_absolute() else Path(args.pos_dir)
    base_dir.mkdir(parents=True, exist_ok=True)
    pos_dir.mkdir(parents=True, exist_ok=True)

    context = EngineContext(engine=engine, pdf_path=pdf_path)
    changed_any = False

    report_rows: List[Dict[str, Any]] = []
    try:
        for idx in indexes:
            row = rows[idx]
            row_report = process_record(row, engine, context, args, base_dir=base_dir, pos_dir=pos_dir)
            report_rows.append(row_report)
            changed_any = changed_any or bool(row_report.get("json_updated"))

            rec = row_report
            print(f"[RECORD] engine={engine} id={rec.get('id')} source_page={rec.get('source_page')}")
            for line in rec.get("logs", []):
                print(line)
    finally:
        context.close()

    if args.write and changed_any:
        save_engine_json(engine_json, rows)

    return {
        "engine": engine,
        "status": "ok",
        "pdf": str(pdf_path),
        "records_total": len(rows),
        "records_processed": len(report_rows),
        "json_updated": bool(args.write and changed_any),
        "records": report_rows,
    }


def build_global_summary(engine_reports: Sequence[Dict[str, Any]], write: bool) -> Dict[str, Any]:
    records = [record for engine_report in engine_reports for record in engine_report.get("records", [])]
    return {
        "write": bool(write),
        "engines": [report.get("engine") for report in engine_reports],
        "records_processed": len(records),
        "schemes_found": sum(int(record.get("schemes_found", 0)) for record in records),
        "schemes_generated": sum(int(record.get("schemes_generated", 0)) for record in records),
        "pos_found": sum(int(record.get("pos_found", 0)) for record in records),
        "pos_generated": sum(int(record.get("pos_generated", 0)) for record in records),
        "records_with_json_update": sum(1 for record in records if record.get("json_updated")),
        "engine_reports": list(engine_reports),
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    engines = resolve_engines(args.engine, bool(args.all))

    engine_reports: List[Dict[str, Any]] = []
    has_error = False

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
        engine_reports.append(report)
        if report.get("status") != "ok":
            has_error = True

    summary = build_global_summary(engine_reports, write=bool(args.write))

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
