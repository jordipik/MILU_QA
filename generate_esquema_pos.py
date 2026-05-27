#!/usr/bin/env python3
from __future__ import annotations

import argparse
import io
import json
import math
import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import fitz
from PIL import Image, ImageDraw, ImageFilter

try:
    import pytesseract
except Exception:
    pytesseract = None


ROOT_DIR = Path(__file__).resolve().parent
DIST_DIR = ROOT_DIR / "dist" / "milu_publish"
DEFAULT_OUT_DIR = "esquemas_pos_circulos"
DEFAULT_REPORT = "missing_pdf_image_one_report.json"
NUM_RE = re.compile(r"^\d+$")
STRIP_PUNCT = ",;:.()[]{}"
SPLIT_RE = re.compile(r"[\n\r\t,;]+")
FILENAME_RE = re.compile(r"^(?P<engine>.+)-(?P<page>\d{4})-(?P<box>\d{2})-(?P<pos>\d+)\.[A-Za-z0-9]+$")


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


def normalize_pos(text: Any) -> Optional[str]:
    if text is None:
        return None
    value = str(text).strip()
    if not value:
        return None
    if NUM_RE.match(value):
        return value
    digits = re.sub(r"\D", "", value)
    return digits or None


def split_pos_candidates(text: str) -> List[str]:
    if not text:
        return []
    out: List[str] = []
    for chunk in SPLIT_RE.split(text):
        chunk = (chunk or "").strip().strip(STRIP_PUNCT).strip()
        if not chunk:
            continue
        for part in chunk.split():
            part = part.strip().strip(STRIP_PUNCT)
            if not part:
                continue
            pos = normalize_pos(part)
            if pos:
                out.append(pos)
    return out


def rect_union(rects: Sequence[fitz.Rect]) -> fitz.Rect:
    result = fitz.Rect(rects[0])
    for rect in rects[1:]:
        result |= rect
    return result


def expand_rect(rect: fitz.Rect, pad: float) -> fitz.Rect:
    return fitz.Rect(rect.x0 - pad, rect.y0 - pad, rect.x1 + pad, rect.y1 + pad)


def merge_overlapping(rects: Sequence[fitz.Rect], pad: float = 8.0) -> List[fitz.Rect]:
    merged: List[fitz.Rect] = []
    for rect in rects:
        candidate = fitz.Rect(rect)
        placed = False
        for idx, current in enumerate(merged):
            if expand_rect(current, pad).intersects(expand_rect(candidate, pad)):
                merged[idx] = current | candidate
                placed = True
                break
        if not placed:
            merged.append(candidate)

    changed = True
    while changed:
        changed = False
        new_rects: List[fitz.Rect] = []
        for rect in merged:
            joined = False
            for idx, current in enumerate(new_rects):
                if expand_rect(current, pad).intersects(expand_rect(rect, pad)):
                    new_rects[idx] = current | rect
                    joined = True
                    changed = True
                    break
            if not joined:
                new_rects.append(rect)
        merged = new_rects
    return merged


def get_image_rects(page: fitz.Page, min_area: float = 20000.0) -> List[fitz.Rect]:
    rects: List[fitz.Rect] = []
    for info in page.get_images(full=True):
        xref = info[0]
        for rect in page.get_image_rects(xref):
            if rect.get_area() >= min_area:
                rects.append(fitz.Rect(rect))
    return rects


def get_text_spans(page: fitz.Page) -> List[Tuple[fitz.Rect, str]]:
    spans: List[Tuple[fitz.Rect, str]] = []
    page_dict = page.get_text("dict")
    for block in page_dict.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = (span.get("text") or "").strip()
                if text:
                    spans.append((fitz.Rect(span["bbox"]), text))
    return spans


def get_scheme_boxes(page: fitz.Page, pad: float = 12.0, cluster_pad: float = 16.0, min_img_area: float = 20000.0) -> List[fitz.Rect]:
    img_rects = get_image_rects(page, min_area=min_img_area)
    if not img_rects:
        return []

    spans = get_text_spans(page)
    clusters = merge_overlapping(img_rects, pad=cluster_pad)
    boxes: List[fitz.Rect] = []

    for cluster in clusters:
        include_rects = [fitz.Rect(cluster)]
        nearby = expand_rect(cluster, max(pad, 12.0))
        for rect, text in spans:
            is_short = len(text) <= 8 or normalize_pos(text) is not None
            if is_short and nearby.intersects(rect):
                include_rects.append(rect)
        boxes.append(expand_rect(rect_union(include_rects), pad))

    boxes.sort(key=lambda rect: (round(rect.y0, 2), round(rect.x0, 2)))
    return boxes


def preprocess_for_ocr_blue(img_rgb: Image.Image, blue_bmin: int = 110, blue_delta: int = 35, dilate: int = 0) -> Image.Image:
    img = img_rgb.convert("RGB")
    width, height = img.size
    pixels = img.load()
    out = Image.new("L", (width, height), 255)
    out_pixels = out.load()

    for y in range(height):
        for x in range(width):
            red, green, blue = pixels[x, y]
            if blue >= blue_bmin and (blue - max(red, green)) >= blue_delta:
                out_pixels[x, y] = 0

    for _ in range(max(0, int(dilate))):
        out = out.filter(ImageFilter.MaxFilter(3))

    return out.convert("RGB")


def upscale_image(img: Image.Image, scale: float) -> Image.Image:
    if scale <= 1.0:
        return img
    width, height = img.size
    return img.resize((int(width * scale), int(height * scale)), resample=Image.BICUBIC)


def run_ocr_tokens(
    img_rgb: Image.Image,
    min_conf: int = 18,
    psm_list: Sequence[int] = (6, 11),
    upscale: float = 3.0,
    blue_bmin: int = 110,
    blue_delta: int = 35,
    dilate: int = 0,
) -> List[Dict[str, Any]]:
    if pytesseract is None:
        return []
    try:
        _ = pytesseract.get_tesseract_version()
    except Exception:
        return []

    img_for_ocr = preprocess_for_ocr_blue(img_rgb, blue_bmin=blue_bmin, blue_delta=blue_delta, dilate=dilate)
    img_for_ocr = upscale_image(img_for_ocr, upscale)
    tokens: List[Dict[str, Any]] = []

    for psm in psm_list:
        config = f"--oem 3 --psm {psm} -c tessedit_char_whitelist=0123456789"
        data = pytesseract.image_to_data(img_for_ocr, output_type=pytesseract.Output.DICT, config=config)
        count = len(data.get("text", []))
        for idx in range(count):
            text = (data["text"][idx] or "").strip()
            if not text:
                continue
            try:
                conf = int(float(data["conf"][idx]))
            except Exception:
                conf = -1
            if conf < min_conf:
                continue

            x = int(data["left"][idx])
            y = int(data["top"][idx])
            width = int(data["width"][idx])
            height = int(data["height"][idx])

            if upscale > 1.0:
                x = int(x / upscale)
                y = int(y / upscale)
                width = int(width / upscale)
                height = int(height / upscale)

            pos = normalize_pos(text)
            if pos:
                tokens.append({
                    "pos": pos,
                    "source": "OCR",
                    "conf": conf,
                    "px": (x, y, width, height),
                })
    return dedup_matches(tokens, dedup_px=16)


def dedup_matches(matches: Sequence[Dict[str, Any]], dedup_px: int) -> List[Dict[str, Any]]:
    if dedup_px <= 0 or len(matches) <= 1:
        return list(matches)

    ordered = sorted(matches, key=lambda item: item.get("conf", -1), reverse=True)
    kept: List[Dict[str, Any]] = []

    for item in ordered:
        x, y, width, height = item["px"]
        cx = x + width / 2.0
        cy = y + height / 2.0
        keep = True
        for other in kept:
            ox, oy, ow, oh = other["px"]
            ocx = ox + ow / 2.0
            ocy = oy + oh / 2.0
            if math.hypot(cx - ocx, cy - ocy) < dedup_px:
                keep = False
                break
        if keep:
            kept.append(item)

    return sorted(kept, key=lambda item: (item["px"][1], item["px"][0]))


def draw_circle(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, height: int, line_width: int = 6) -> None:
    cx = x + width / 2.0
    cy = y + height / 2.0
    radius = max(width, height) * 0.9
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=(255, 0, 0), width=line_width)


def render_clip(page: fitz.Page, rect: fitz.Rect, dpi: int) -> Image.Image:
    zoom = dpi / 72.0
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=rect, alpha=False)
    return Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")


def parse_expected_filename(value: Optional[str]) -> Optional[Dict[str, Any]]:
    if not value:
        return None
    parts = [part.strip() for part in str(value).split(",") if part.strip()]
    if not parts:
        return None
    filename = Path(parts[0]).name
    match = FILENAME_RE.match(filename)
    if not match:
        return None
    return {
        "engine": match.group("engine"),
        "page": int(match.group("page")),
        "box": int(match.group("box")),
        "pos": match.group("pos"),
        "filename": filename,
    }


def build_report(
    record_id: str,
    engine: str,
    source_page: Optional[int],
    tried_pages: Sequence[int],
    pos: Optional[str],
    status: str,
    filename: Optional[str] = None,
    output_path: Optional[Path] = None,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "id": record_id,
        "engine": engine,
        "source_page": source_page,
        "tried_pages": list(tried_pages),
        "pos": pos,
        "status": status,
        "filename": filename,
        "output_path": str(output_path) if output_path else None,
        "reason": reason,
    }


def resolve_engine_json_path(engine: str) -> Path:
    model = engine.removeprefix("engine_").removesuffix(".json")
    return ROOT_DIR / f"engine_{model}.json"


def resolve_pdf_path(pdf_arg: str) -> Path:
    candidate = Path(pdf_arg)
    search_paths: List[Path] = []

    if candidate.is_absolute():
        search_paths.append(candidate)
    else:
        search_paths.extend([
            ROOT_DIR / candidate,
            Path.cwd() / candidate,
            ROOT_DIR / "pdf" / candidate.name,
            DIST_DIR / "pdf" / candidate.name,
        ])

    for path in search_paths:
        if path.exists() and path.is_file():
            return path
    raise FileNotFoundError(f"No se encontró el PDF: {pdf_arg}")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def iter_records(data: Any) -> Iterable[Dict[str, Any]]:
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                yield item
    else:
        raise ValueError(f"JSON no soportado en {data!r}")


def find_root_record(records: Sequence[Dict[str, Any]], target_id: str) -> Optional[Dict[str, Any]]:
    for record in records:
        if str(record.get("ID", "")).strip() == target_id:
            return record
    return None


def resolve_legacy_record(engine_json_path: Path, records: Sequence[Dict[str, Any]], target_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    dist_path = DIST_DIR / engine_json_path.name
    if not dist_path.exists():
        return None, None

    try:
        dist_records = list(iter_records(load_json(dist_path)))
    except Exception:
        return None, None

    legacy_record = None
    for record in dist_records:
        if str(record.get("ID", "")).strip() == target_id:
            legacy_record = record
            break
    if legacy_record is None:
        return None, None

    legacy_pos = normalize_pos(legacy_record.get("pos_final") or legacy_record.get("POS"))
    legacy_page = coerce_int(legacy_record.get("Source Page"))
    legacy_designation = str(legacy_record.get("DESIGNATION") or "").strip().lower()
    candidates = []

    for record in records:
        if normalize_pos(record.get("pos_final") or record.get("POS")) != legacy_pos:
            continue
        if coerce_int(record.get("Source Page")) != legacy_page:
            continue
        designation = str(record.get("DESIGNATION") or "").strip().lower()
        if legacy_designation and designation != legacy_designation:
            continue
        candidates.append(record)

    if len(candidates) == 1:
        resolved = candidates[0]
        return resolved, f"ID legacy {target_id} resuelto a {resolved.get('ID')} usando dist/milu_publish"
    return None, None


def detect_pos_items(page: fitz.Page, clip_inner: fitz.Rect, target_pos: str, dpi: int) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    words = page.get_text("words")
    for x0, y0, x1, y1, word, *_ in words:
        rect = fitz.Rect(x0, y0, x1, y1)
        if not clip_inner.contains(rect):
            continue
        for candidate in split_pos_candidates(word):
            if candidate == target_pos:
                items.append({
                    "pos": candidate,
                    "source": "TEXT",
                    "conf": None,
                    "rect_pdf": rect,
                })

    if items:
        return items

    ocr_items = run_ocr_tokens(render_clip(page, clip_inner, dpi=dpi))
    return [item for item in ocr_items if item["pos"] == target_pos]


def choose_match(matches: Sequence[Dict[str, Any]], record: Dict[str, Any]) -> Dict[str, Any]:
    expected = parse_expected_filename(record.get("esquemas_circulos")) or parse_expected_filename(record.get("ruta_esquemas_pos"))
    if expected:
        for match in matches:
            if match["page"] == expected["page"] and match["box"] == expected["box"]:
                match["selection_reason"] = f"usado box esperado {expected['box']:02d} desde metadatos"
                return match

    selected = sorted(matches, key=lambda item: (item["page"], item["box"]))[0]
    if len(matches) > 1:
        selected["selection_reason"] = f"se encontraron {len(matches)} boxes; se usa el primero"
    else:
        selected["selection_reason"] = "box unico encontrado"
    return selected


def save_image(image: Image.Image, output_path: Path, img_format: str, quality: int) -> None:
    fmt = img_format.lower().strip(".")
    save_kwargs: Dict[str, Any] = {}
    if fmt == "jpeg":
        fmt = "jpg"

    if fmt == "jpg":
        image = image.convert("RGB")
        save_kwargs["quality"] = max(1, min(100, int(quality)))
        save_kwargs["optimize"] = True
        pil_fmt = "JPEG"
    elif fmt == "webp":
        save_kwargs["quality"] = max(1, min(100, int(quality)))
        save_kwargs["method"] = 6
        pil_fmt = "WEBP"
    elif fmt == "png":
        save_kwargs["compress_level"] = 6
        pil_fmt = "PNG"
    else:
        pil_fmt = fmt.upper()
    image.save(output_path, format=pil_fmt, **save_kwargs)


def process_record(args: argparse.Namespace) -> Dict[str, Any]:
    engine_json_path = resolve_engine_json_path(args.engine)
    if not engine_json_path.exists():
        raise FileNotFoundError(f"No existe {engine_json_path.name} en la raiz")

    records = list(iter_records(load_json(engine_json_path)))
    target_id = str(args.id).strip()
    record = find_root_record(records, target_id)
    resolve_reason = None
    if record is None:
        record, resolve_reason = resolve_legacy_record(engine_json_path, records, target_id)
    if record is None:
        return build_report(target_id, args.engine, None, [], None, "missing_data", reason="ID no encontrado en engine raiz")

    source_page = coerce_int(record.get("Source Page"))
    pos_value = normalize_pos(record.get("pos_final") or record.get("POS"))
    engine_model = str(record.get("engine_model") or args.engine).strip() or args.engine
    if source_page is None or pos_value is None:
        return build_report(target_id, engine_model, source_page, [], pos_value, "missing_data", reason="Falta Source Page o POS/pos_final")

    pdf_path = resolve_pdf_path(args.pdf)
    out_dir = ROOT_DIR / args.out_dir if not Path(args.out_dir).is_absolute() else Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    tried_pages: List[int] = []
    seen = set()
    for candidate in (source_page + args.page_offset, source_page):
        if candidate < 1 or candidate in seen:
            continue
        seen.add(candidate)
        tried_pages.append(candidate)

    print(f"[INFO] Engine JSON: {engine_json_path.name}")
    print(f"[INFO] PDF: {pdf_path}")
    print(f"[INFO] Registro: ID={target_id} engine={engine_model} source_page={source_page} pos={pos_value}")
    if resolve_reason:
        print(f"[INFO] {resolve_reason}")
    print(f"[INFO] Paginas a probar: {tried_pages}")

    doc = fitz.open(pdf_path)
    matches: List[Dict[str, Any]] = []
    no_boxes_pages: List[int] = []

    try:
        for page_num in tried_pages:
            if page_num < 1 or page_num > len(doc):
                print(f"[WARN] Pagina fuera de rango: {page_num}")
                continue
            page = doc.load_page(page_num - 1)
            boxes = get_scheme_boxes(page)
            if not boxes:
                no_boxes_pages.append(page_num)
                print(f"[WARN] Pagina {page_num:04d}: no se detectaron esquemas")
                continue

            print(f"[INFO] Pagina {page_num:04d}: {len(boxes)} esquema(s) candidato(s)")
            for box_index, box in enumerate(boxes, start=1):
                clip_outer = fitz.Rect(box)
                clip_inner = fitz.Rect(
                    clip_outer.x0 + 1.0,
                    clip_outer.y0 + 1.0,
                    clip_outer.x1 - 1.0,
                    clip_outer.y1 - 1.0,
                )
                if clip_inner.x1 <= clip_inner.x0 or clip_inner.y1 <= clip_inner.y0:
                    clip_inner = fitz.Rect(clip_outer)

                items = detect_pos_items(page, clip_inner, pos_value, dpi=args.dpi)
                if not items:
                    continue

                matches.append({
                    "page": page_num,
                    "box": box_index,
                    "box_rect": clip_outer,
                    "clip_inner": clip_inner,
                    "items": items,
                })
                print(f"[INFO] Pagina {page_num:04d} box {box_index:02d}: POS {pos_value} encontrada ({','.join(sorted(set(item['source'] for item in items)))})")
    finally:
        doc.close()

    if not matches:
        if no_boxes_pages and len(no_boxes_pages) == len(tried_pages):
            return build_report(target_id, engine_model, source_page, tried_pages, pos_value, "no_red_boxes", reason="No se detectaron esquemas en las paginas probadas")
        return build_report(target_id, engine_model, source_page, tried_pages, pos_value, "pos_not_found", reason="No se encontro la POS dentro de los esquemas detectados")

    selected = choose_match(matches, record)
    selected_page = selected["page"]
    selected_box = selected["box"]
    filename = f"{engine_model}-{selected_page:04d}-{selected_box:02d}-{pos_value}.{args.format.lower().strip('.')}"
    output_path = out_dir / filename

    reason_parts = [selected.get("selection_reason") or ""]
    if resolve_reason:
        reason_parts.append(resolve_reason)
    reason = "; ".join(part for part in reason_parts if part)

    if output_path.exists() and not args.overwrite:
        return build_report(target_id, engine_model, source_page, tried_pages, pos_value, "already_exists", filename=filename, output_path=output_path, reason=reason or "El archivo ya existe")

    if args.dry_run and not args.write_images:
        return build_report(target_id, engine_model, source_page, tried_pages, pos_value, "generated", filename=filename, output_path=output_path, reason=(reason + "; dry-run, no se escribio imagen").strip("; "))

    doc = fitz.open(pdf_path)
    try:
        page = doc.load_page(selected_page - 1)
        clip_outer = selected["box_rect"]
        clip_inner = selected["clip_inner"]
        image = render_clip(page, clip_outer, dpi=args.dpi)
        draw = ImageDraw.Draw(image)
        zoom = args.dpi / 72.0
        dx_px = int(round((clip_inner.x0 - clip_outer.x0) * zoom))
        dy_px = int(round((clip_inner.y0 - clip_outer.y0) * zoom))

        for item in selected["items"]:
            if item["source"] == "OCR":
                x, y, width, height = item["px"]
                draw_circle(draw, x + dx_px, y + dy_px, width, height, line_width=6)
            else:
                rect = item["rect_pdf"]
                x0 = int((rect.x0 - clip_outer.x0) * zoom)
                y0 = int((rect.y0 - clip_outer.y0) * zoom)
                x1 = int((rect.x1 - clip_outer.x0) * zoom)
                y1 = int((rect.y1 - clip_outer.y0) * zoom)
                draw_circle(draw, min(x0, x1), min(y0, y1), abs(x1 - x0), abs(y1 - y0), line_width=6)

        save_image(image, output_path, img_format=args.format, quality=args.quality)
    finally:
        doc.close()

    return build_report(target_id, engine_model, source_page, tried_pages, pos_value, "generated", filename=filename, output_path=output_path, reason=reason or "Imagen generada")


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Genera una sola imagen esquema_pos para un registro concreto de engine_*.json")
    parser.add_argument("--engine", required=True, help="Modelo de engine, por ejemplo 12V4000M40A")
    parser.add_argument("--id", required=True, help="ID exacto del registro")
    parser.add_argument("--pdf", required=True, help="Ruta al PDF original")
    parser.add_argument("--out-dir", default=DEFAULT_OUT_DIR, help="Carpeta de salida")
    parser.add_argument("--dry-run", action="store_true", help="Calcula el resultado sin escribir imagen")
    parser.add_argument("--write-images", action="store_true", help="Escribe la imagen de salida")
    parser.add_argument("--overwrite", action="store_true", help="Sobrescribir si el archivo ya existe")
    parser.add_argument("--page-offset", type=int, default=-1, help="Offset inicial respecto a Source Page")
    parser.add_argument("--dpi", type=int, default=200, help="DPI de render")
    parser.add_argument("--format", default="webp", help="Formato de salida, por defecto webp")
    parser.add_argument("--quality", type=int, default=90, help="Calidad para WEBP/JPG")
    parser.add_argument("--out-report", default=None, help="Ruta opcional al JSON de reporte")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    if not args.dry_run and not args.write_images:
        print("[INFO] No se indico accion explicita; se activa dry-run por defecto")
        args.dry_run = True

    try:
        report = process_record(args)
    except Exception as exc:
        report = build_report(str(args.id), str(args.engine), None, [], None, "error", reason=str(exc))

    out_report = Path(args.out_report) if args.out_report else None
    if out_report is not None:
        if not out_report.is_absolute():
            out_report = ROOT_DIR / out_report
        out_report.parent.mkdir(parents=True, exist_ok=True)
        out_report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[INFO] Reporte JSON: {out_report}")

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] in {"generated", "already_exists"} else 1


if __name__ == "__main__":
    sys.exit(main())