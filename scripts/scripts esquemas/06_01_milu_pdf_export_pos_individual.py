#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
06_01_milu_pdf_export_pos_individual.py

Paso 06 (EXPORT por POS distinta, marco completo):
- Lee PDF vectorial con PyMuPDF
- Encuentra marcos rojos (Square/Circle con stroke rojo)
- Para cada marco:
    A) Extrae POS desde TEXTO vectorial dentro del marco (page.get_text("words"))
    B) Fallback OCR azul si no hay POS por texto (opcional)
- Exporta:
    - 1 imagen POR CADA POS DISTINCTA, usando el recorte del marco COMPLETO (incluye borde del marco)
    - En cada imagen se marcan SOLO las ocurrencias de esa POS
- Exporta CSV/XLSX con índice

CAMBIO:
✅ Guarda TODO (IMÁGENES + CSV + XLSX) dentro de una carpeta con el nombre del “libro”
   out_base/
     <LIBRO>/
       imágenes...
       <LIBRO>_06_pos_distinct_fullbox.csv
       <LIBRO>_06_pos_distinct_fullbox.xlsx

NOTA:
- Este archivo está listo para Windows (sin “triple comillas” envolviendo el script).
- Por defecto exporta WEBP.
"""

from __future__ import annotations

import argparse
import io
import math
import re
from pathlib import Path
from typing import Dict, List, Optional, Set

import fitz  # PyMuPDF
import pandas as pd
import pytesseract
from PIL import Image, ImageDraw, ImageFilter

# Si no lo pasas por --tesseract, deja aquí tu ruta (Windows):
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


# -----------------------
# Regex / parsing POS
# -----------------------
NUM_RE = re.compile(r"^\d+$")
STRIP_PUNCT = ",;:.()[]{}"
_SPLIT_RE = re.compile(r"[\n\r\t,;]+")


def split_pos_candidates(text: str) -> List[str]:
    if not text:
        return []
    chunks = _SPLIT_RE.split(text)
    out: List[str] = []
    for c in chunks:
        c = (c or "").strip().strip(STRIP_PUNCT).strip()
        if not c:
            continue
        for p in c.split():
            p = p.strip().strip(STRIP_PUNCT)
            if not p:
                continue
            if NUM_RE.match(p):
                out.append(p)
            else:
                p2 = re.sub(r"\D", "", p)
                if p2 and NUM_RE.match(p2):
                    out.append(p2)
    return out


def normalize_digits(text: str) -> Optional[str]:
    if not text:
        return None
    t = text.strip()
    if not t:
        return None
    if NUM_RE.match(t):
        return t
    t2 = re.sub(r"\D", "", t)
    return t2 if t2 else None


# -----------------------
# Filtro de páginas
# -----------------------
def parse_pages_spec(spec: Optional[str], max_pages: int) -> Optional[Set[int]]:
    if spec is None:
        return None
    s = spec.strip().lower()
    if not s or s in {"all", "*"}:
        return None

    pages: Set[int] = set()
    for part in s.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            a = a.strip()
            b = b.strip()
            if not a.isdigit() or not b.isdigit():
                raise ValueError(f"Spec de páginas inválido: {part!r}")
            start = int(a)
            end = int(b)
            if start > end:
                start, end = end, start
            for p in range(start, end + 1):
                if 1 <= p <= max_pages:
                    pages.add(p)
        else:
            if not part.isdigit():
                raise ValueError(f"Spec de páginas inválido: {part!r}")
            p = int(part)
            if 1 <= p <= max_pages:
                pages.add(p)

    return pages


def should_process_page(page_num_1based: int, allowed_pages: Optional[Set[int]]) -> bool:
    return allowed_pages is None or page_num_1based in allowed_pages


# -----------------------
# Marcos rojos
# -----------------------
def get_red_boxes(page: fitz.Page, tol: float = 0.15) -> List[fitz.Rect]:
    rects: List[fitz.Rect] = []
    annots = page.annots()
    if not annots:
        return rects
    for a in annots:
        if a.type[0] != 4:  # Square/Circle
            continue
        colors = a.colors or {}
        stroke = colors.get("stroke")
        if stroke is None:
            continue
        r, g, b = stroke
        if r > g + tol and r > b + tol:
            rects.append(a.rect)
    return rects


# -----------------------
# OCR azul (fallback)
# -----------------------
def preprocess_for_ocr_blue(
    img_rgb: Image.Image,
    blue_bmin: int = 110,
    blue_delta: int = 35,
    dilate: int = 0,
) -> Image.Image:
    img = img_rgb.convert("RGB")
    w, h = img.size
    px = img.load()

    out = Image.new("L", (w, h), 255)
    out_px = out.load()

    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if b >= blue_bmin and (b - max(r, g)) >= blue_delta:
                out_px[x, y] = 0

    for _ in range(max(0, int(dilate))):
        out = out.filter(ImageFilter.MaxFilter(3))

    return out.convert("RGB")


def upscale_image(img: Image.Image, scale: float) -> Image.Image:
    if scale <= 1.0:
        return img
    w, h = img.size
    return img.resize((int(w * scale), int(h * scale)), resample=Image.BICUBIC)


def run_ocr_tokens(
    img_rgb: Image.Image,
    min_conf: int,
    psm: int,
    upscale: float,
    blue_bmin: int,
    blue_delta: int,
    dilate: int,
) -> List[Dict]:
    img_for_ocr = preprocess_for_ocr_blue(img_rgb, blue_bmin=blue_bmin, blue_delta=blue_delta, dilate=dilate)
    img_for_ocr = upscale_image(img_for_ocr, upscale)

    config = f"--oem 3 --psm {psm} -c tessedit_char_whitelist=0123456789"
    data = pytesseract.image_to_data(img_for_ocr, output_type=pytesseract.Output.DICT, config=config)

    tokens: List[Dict] = []
    n = len(data.get("text", []))
    for i in range(n):
        text = (data["text"][i] or "").strip()
        if not text:
            continue
        try:
            conf = int(float(data["conf"][i]))
        except Exception:
            conf = -1
        if conf < min_conf:
            continue

        x = int(data["left"][i])
        y = int(data["top"][i])
        w = int(data["width"][i])
        h = int(data["height"][i])

        if upscale > 1.0:
            x = int(x / upscale)
            y = int(y / upscale)
            w = int(w / upscale)
            h = int(h / upscale)

        tokens.append({"text": text, "conf": conf, "x": x, "y": y, "w": w, "h": h})
    return tokens


def dedup_matches(matches: List[Dict], dedup_px: int) -> List[Dict]:
    if dedup_px <= 0 or len(matches) <= 1:
        return matches

    ms = sorted(matches, key=lambda m: m.get("conf", -1), reverse=True)
    kept: List[Dict] = []

    for m in ms:
        cx = m["x"] + m["w"] / 2.0
        cy = m["y"] + m["h"] / 2.0

        ok = True
        for k in kept:
            kx = k["x"] + k["w"] / 2.0
            ky = k["y"] + k["h"] / 2.0
            if math.hypot(cx - kx, cy - ky) < dedup_px:
                ok = False
                break
        if ok:
            kept.append(m)

    return sorted(kept, key=lambda m: (m["y"], m["x"]))


# -----------------------
# (Opcional) Recolor: cambia stroke rojo a blanco ANTES de renderizar
#   OJO: esto modifica el PDF en memoria (NO lo guarda a disco).
# -----------------------
def recolor_page_red_frames(page: fitz.Page, new_rgb=(1, 1, 1), tol=0.15):
    ann = page.first_annot
    while ann:
        if ann.type[0] == 4:
            colors = ann.colors or {}
            stroke = colors.get("stroke")
            if stroke:
                r, g, b = stroke
                if r > g + tol and r > b + tol:
                    ann.set_colors(stroke=new_rgb)
                    ann.update()
        ann = ann.next


# -----------------------
# Render
# -----------------------
def render_clip(page: fitz.Page, rect: fitz.Rect, dpi: int) -> Image.Image:
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, clip=rect, alpha=False)
    return Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")


def draw_circle(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, width: int = 6):
    cx = x + w / 2.0
    cy = y + h / 2.0
    r = max(w, h) * 0.9
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 0, 0), width=width)


# -----------------------
# Main
# -----------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="PDF vectorial con marcos rojos")

    # Carpeta base de salida (dentro crearemos subcarpeta por libro)
    ap.add_argument("--out", default="06-POS", help="Carpeta base salida (se creará subcarpeta por libro)")

    ap.add_argument("--pages", default=None, help="Páginas (1-based). Ej: '1-3,8,10-12' o 'all'")

    # Render
    ap.add_argument("--dpi", type=int, default=300, help="DPI para render")

    # Detección (clip interno) -> para NO meter la línea roja en OCR y búsqueda
    ap.add_argument("--shrink", type=float, default=1.0, help="Encoger marco (puntos PDF) para detección (evitar línea roja)")

    # Export (clip externo) -> para que SALGA el marco (si no recoloreas)
    ap.add_argument("--frame-pad-pt", type=float, default=0.0,
                    help="Expandir el recorte del marco (puntos PDF) al exportar (para ver mejor el borde)")

    ap.add_argument("--circle-width", type=int, default=6, help="Grosor del círculo")

    # Salida imagen (por defecto WEBP)
    ap.add_argument("--img-format", default="webp", help="Formato: webp, png, jpg, jpeg, tiff (default: webp)")
    ap.add_argument("--quality", type=int, default=92, help="Calidad para JPG/WEBP (1-100)")

    # OCR fallback
    ap.add_argument("--use-ocr-fallback", action="store_true", help="Si no hay POS por texto, usar OCR azul")
    ap.add_argument("--min-conf", type=int, default=18)
    ap.add_argument("--psm-list", default="6,11")
    ap.add_argument("--upscale", type=float, default=3.0)
    ap.add_argument("--blue-bmin", type=int, default=110)
    ap.add_argument("--blue-delta", type=int, default=35)
    ap.add_argument("--dilate", type=int, default=0)
    ap.add_argument("--dedup-px", type=int, default=16)

    ap.add_argument("--tesseract", default=None, help="Ruta a tesseract.exe (si no está en PATH)")

    # Opcional: si quieres recolorear marcos rojos a blanco antes de renderizar
    ap.add_argument("--recolor-frames-white", action="store_true",
                    help="Si se activa, cambia el stroke rojo a blanco antes de renderizar (en memoria).")

    args = ap.parse_args()

    if args.tesseract:
        pytesseract.pytesseract.tesseract_cmd = args.tesseract

    if args.use_ocr_fallback:
        try:
            _ = pytesseract.get_tesseract_version()
        except Exception:
            raise SystemExit(
                "[ERROR] No se encuentra tesseract.exe. "
                "Instala Tesseract o pasa --tesseract \"C:\\ruta\\tesseract.exe\"."
            )

    pdf_path = args.pdf

    # “Libro” = pdf_root (mismo criterio que ya usabas)
    pdf_root = pdf_path.stem.split("_")[0]

    # Base OUT + subcarpeta por libro
    out_base = Path(args.out)
    out_dir = out_base / pdf_root
    out_dir.mkdir(parents=True, exist_ok=True)

    img_format = args.img_format.lower().strip(".")
    if img_format == "jpeg":
        img_format = "jpg"

    psm_list = [int(x.strip()) for x in args.psm_list.split(",") if x.strip()]

    doc = fitz.open(pdf_path)
    allowed_pages = parse_pages_spec(args.pages, max_pages=len(doc))

    rows: List[Dict] = []
    total_boxes = 0
    total_exports = 0

    for page_idx in range(len(doc)):
        page_num = page_idx + 1
        if not should_process_page(page_num, allowed_pages):
            continue

        page = doc.load_page(page_idx)

        # 1) detecta marcos rojos con color original
        boxes = get_red_boxes(page)
        if not boxes:
            continue

        # 2) opcional: recolorea a blanco ANTES de renderizar
        if args.recolor_frames_white:
            recolor_page_red_frames(page, new_rgb=(1, 1, 1))  # blanco

        # 3) texto vectorial para detección
        words = page.get_text("words")
        zoom = args.dpi / 72.0

        for box_i, box in enumerate(boxes, start=1):
            total_boxes += 1

            # Clip externo: incluye borde (export)
            clip_outer = fitz.Rect(
                box.x0 - args.frame_pad_pt,
                box.y0 - args.frame_pad_pt,
                box.x1 + args.frame_pad_pt,
                box.y1 + args.frame_pad_pt,
            )

            # Clip interno: detección (evita pillar línea)
            clip_inner = fitz.Rect(
                box.x0 + args.shrink,
                box.y0 + args.shrink,
                box.x1 - args.shrink,
                box.y1 - args.shrink,
            )

            # Offset px entre inner y outer (para convertir coords OCR de inner a outer)
            dx_px = int(round((clip_inner.x0 - clip_outer.x0) * zoom))
            dy_px = int(round((clip_inner.y0 - clip_outer.y0) * zoom))

            # --- A) texto vectorial dentro del clip interno ---
            items: List[Dict] = []
            for x0, y0, x1, y1, w, *_ in words:
                r = fitz.Rect(x0, y0, x1, y1)
                if not clip_inner.contains(r):
                    continue
                for cand in split_pos_candidates(w):
                    items.append({
                        "pos": cand,
                        "source": "TEXT",
                        "conf": None,
                        "rect_pdf": r,
                    })

            # --- B) OCR azul fallback si no hay POS por texto ---
            if not items and args.use_ocr_fallback:
                img_inner = render_clip(page, clip_inner, dpi=args.dpi)

                toks_all: List[Dict] = []
                for psm in psm_list:
                    toks_all.extend(run_ocr_tokens(
                        img_rgb=img_inner,
                        min_conf=args.min_conf,
                        psm=psm,
                        upscale=max(1.0, args.upscale),
                        blue_bmin=args.blue_bmin,
                        blue_delta=args.blue_delta,
                        dilate=args.dilate,
                    ))

                dets_raw: List[Dict] = []
                for t in toks_all:
                    pos = normalize_digits(t.get("text", ""))
                    if pos:
                        dets_raw.append({**t, "pos": pos})

                dets = dedup_matches(dets_raw, args.dedup_px)

                for d in dets:
                    items.append({
                        "pos": d["pos"],
                        "source": "OCR",
                        "conf": d.get("conf"),
                        "px_inner": (d["x"], d["y"], d["w"], d["h"]),
                    })

            if not items:
                continue

            # Agrupar por POS (distinct)
            by_pos: Dict[str, List[Dict]] = {}
            for it in items:
                by_pos.setdefault(it["pos"], []).append(it)

            # Render del marco COMPLETO (con borde)
            img_outer_base = render_clip(page, clip_outer, dpi=args.dpi)

            for pos, group in by_pos.items():
                img_out = img_outer_base.copy()
                draw = ImageDraw.Draw(img_out)

                # Marcar solo ocurrencias de esa POS
                for it in group:
                    if it["source"] == "OCR":
                        x, y, w, h = it["px_inner"]
                        x += dx_px
                        y += dy_px
                        draw_circle(draw, x, y, w, h, width=args.circle_width)
                    else:
                        r = it["rect_pdf"]
                        x0p = (r.x0 - clip_outer.x0) * zoom
                        y0p = (r.y0 - clip_outer.y0) * zoom
                        x1p = (r.x1 - clip_outer.x0) * zoom
                        y1p = (r.y1 - clip_outer.y0) * zoom
                        x = int(min(x0p, x1p))
                        y = int(min(y0p, y1p))
                        w = int(abs(x1p - x0p))
                        h = int(abs(y1p - y0p))
                        draw_circle(draw, x, y, w, h, width=args.circle_width)

                # Guardar imagen
                out_name = f"{pdf_root}-{page_num:04d}-{box_i:02d}-{pos}.{img_format}"
                out_path = out_dir / out_name

                fmt = img_format.lower()
                save_kwargs = {}

                if fmt in {"jpg", "jpeg"}:
                    img_out = img_out.convert("RGB")
                    save_kwargs["quality"] = int(max(1, min(args.quality, 100)))
                    save_kwargs["optimize"] = True
                    pil_fmt = "JPEG"

                elif fmt == "webp":
                    save_kwargs["quality"] = int(max(1, min(args.quality, 100)))
                    save_kwargs["method"] = 6
                    pil_fmt = "WEBP"

                elif fmt == "png":
                    save_kwargs["compress_level"] = 6
                    pil_fmt = "PNG"

                else:
                    pil_fmt = fmt.upper()

                img_out.save(out_path, format=pil_fmt, **save_kwargs)

                total_exports += 1
                rows.append({
                    "pdf": pdf_path.name,
                    "book": pdf_root,
                    "page": page_num,
                    "box": box_i,
                    "pos": pos,
                    "count_in_box": len(group),
                    "source_mix": ",".join(sorted(set(g["source"] for g in group))),
                    "dpi": args.dpi,
                    "shrink": args.shrink,
                    "frame_pad_pt": args.frame_pad_pt,
                    "img_format": img_format,
                    "out_image": out_name,
                })
                print(f"[{page_num:04d}/{len(doc):04d}] -> {out_name}")

    doc.close()

    # Export índice dentro de la carpeta del libro (sin sobrescribir otros libros)
    df = pd.DataFrame(rows)
    csv_path = out_dir / f"{pdf_root}_06_pos_distinct_fullbox.csv"
    xlsx_path = out_dir / f"{pdf_root}_06_pos_distinct_fullbox.xlsx"
    df.to_csv(csv_path, index=False, encoding="utf-8-sig")
    df.to_excel(xlsx_path, index=False)

    print("\n--- RESUMEN 06 ---")
    print(f"PDF: {pdf_path}")
    print(f"Libro: {pdf_root}")
    print(f"Marcos: {total_boxes}")
    print(f"Imagenes exportadas (POS distintas): {total_exports}")
    print(f"OUT (base): {out_base}")
    print(f"OUT (libro): {out_dir}")
    print(f"CSV: {csv_path}")
    print(f"XLSX: {xlsx_path}")


if __name__ == "__main__":
    main()
