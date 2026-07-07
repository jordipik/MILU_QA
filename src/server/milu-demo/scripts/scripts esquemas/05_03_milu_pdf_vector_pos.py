#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
05_02_milu_pdf_vector_pos.py

Paso 05_02 (QA desde PDF vectorial):
- Lee el PDF (vectorial) con PyMuPDF
- Encuentra marcos rojos (anotaciones Square/Circle con stroke rojo)
- Para cada marco:
    A) Extrae POS desde TEXTO vectorial dentro del marco (page.get_text("words"))
    B) Fallback OCR azul si no hay texto POS
- Exporta:
    - CSV + XLSX con detecciones
    - 1 PNG por marco con TODAS las POS marcadas (allpos) en la raíz de --out

Nombre salida imagen:
    <PDFROOT>-<PAGE:04d>-<BOX:02d>-allpos.png
Ej:
    12V4000M40A-0012-01-allpos.png
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

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


# -----------------------
# Regex / parsing POS
# -----------------------
NUM_RE = re.compile(r"^\d+$")
STRIP_PUNCT = ",;:.()[]{}"
_SPLIT_RE = re.compile(r"[\n\r\t,;]+")

def split_pos_candidates(text: str) -> List[str]:
    """Saca candidatos POS desde texto (maneja listas '10 15', '10,15', saltos de línea, etc.)."""
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
            # aquí nos centramos en dígitos puros para POS
            if NUM_RE.match(p):
                out.append(p)
            else:
                # si viene algo sucio tipo "155-" o "155." lo limpiamos a dígitos
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
    """
    Convierte un spec tipo "1-3,8,10-12" en un set de páginas 1-based.
    Devuelve None si spec es None, "" o "all" (significa todas).
    Nota: páginas fuera de rango se ignoran silenciosamente.
    """
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
    """Rectángulos de anotaciones Square/Circle con stroke rojo."""
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
    """Convierte a máscara (texto azul -> negro, fondo -> blanco) en L, luego RGB."""
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
    """OCR por tokens (image_to_data) devolviendo coords en la imagen ORIGINAL."""
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

def draw_circle(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, width: int = 6):
    cx = x + w / 2.0
    cy = y + h / 2.0
    r = max(w, h) * 0.9
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 0, 0), width=width)


# -----------------------
# Render clip del PDF
# -----------------------
def render_clip(page: fitz.Page, rect: fitz.Rect, dpi: int) -> Image.Image:
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, clip=rect, alpha=False)
    return Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")


# -----------------------
# Main
# -----------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="PDF vectorial con marcos rojos")
    ap.add_argument("--out", default="05-Revision_POS", help="Carpeta salida")
    ap.add_argument("--dpi", type=int, default=300, help="Render DPI para el recorte del marco")

    ap.add_argument("--shrink", type=float, default=1.0, help="Encoger el marco (puntos PDF) para no incluir la línea roja")
    ap.add_argument("--circle-width", type=int, default=6)
    ap.add_argument("--dedup-px", type=int, default=16)

    # NUEVO: filtro de páginas (1-based)
    ap.add_argument(
        "--pages",
        default=None,
        help="Páginas a procesar (1-based). Ej: '1-3,8,10-12' o 'all' (default: all)"
    )

    # OCR fallback params
    ap.add_argument("--use-ocr-fallback", action="store_true", help="Si no hay POS por texto, usar OCR azul")
    ap.add_argument("--min-conf", type=int, default=18)
    ap.add_argument("--psm-list", default="6,11")
    ap.add_argument("--upscale", type=float, default=3.0)
    ap.add_argument("--blue-bmin", type=int, default=110)
    ap.add_argument("--blue-delta", type=int, default=35)
    ap.add_argument("--dilate", type=int, default=0)

    ap.add_argument("--tesseract", default=None, help="Ruta a tesseract.exe (si no está en PATH)")

    args = ap.parse_args()

    if args.tesseract:
        pytesseract.pytesseract.tesseract_cmd = args.tesseract

    # fail fast if tesseract missing (solo si se va a usar OCR fallback)
    if args.use_ocr_fallback:
        try:
            _ = pytesseract.get_tesseract_version()
        except Exception:
            raise SystemExit(
                "[ERROR] No se encuentra tesseract.exe. "
                "Instala Tesseract o pasa --tesseract \"C:\\ruta\\tesseract.exe\"."
            )

    pdf_path = args.pdf
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    pdf_root = pdf_path.stem.split("_")[0]
    psm_list = [int(x.strip()) for x in args.psm_list.split(",") if x.strip()]

    rows: List[Dict] = []
    doc = fitz.open(pdf_path)

    # NUEVO: set de páginas permitidas
    allowed_pages = parse_pages_spec(args.pages, max_pages=len(doc))

    total_boxes = 0
    total_pos = 0

    for page_idx in range(len(doc)):
        page_num = page_idx + 1

        if not should_process_page(page_num, allowed_pages):
            continue

        # NUEVO: mensaje ligero por consola
        print(f"[{pdf_path.name}] Página {page_num:04d}/{len(doc):04d} — exportando…")

        page = doc.load_page(page_idx)

        boxes = get_red_boxes(page)
        if not boxes:
            continue

        # words 1 vez por página
        words = page.get_text("words")  # x0,y0,x1,y1, word, block, line, wordno

        for box_i, box in enumerate(boxes, start=1):
            total_boxes += 1

            # encoger marco para no pillar la línea roja
            clip = fitz.Rect(
                box.x0 + args.shrink,
                box.y0 + args.shrink,
                box.x1 - args.shrink,
                box.y1 - args.shrink
            )

            # --------- Método A: texto vectorial dentro del marco ---------
            pos_items: List[Dict] = []
            for x0, y0, x1, y1, w, *_ in words:
                r = fitz.Rect(x0, y0, x1, y1)
                if not clip.contains(r):
                    continue
                for cand in split_pos_candidates(w):
                    pos_items.append({
                        "pos": cand,
                        "source": "TEXT",
                        "conf": None,
                        "rect": r,
                    })

            # --------- Método B: OCR azul fallback ---------
            if not pos_items and args.use_ocr_fallback:
                img = render_clip(page, clip, dpi=args.dpi)

                toks_all: List[Dict] = []
                for psm in psm_list:
                    toks_all.extend(run_ocr_tokens(
                        img_rgb=img,
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
                    pos_items.append({
                        "pos": d["pos"],
                        "source": "OCR",
                        "conf": d.get("conf"),
                        "px": (d["x"], d["y"], d["w"], d["h"]),
                    })

            # --------- Export QA image (allpos) ---------
            img_clip = render_clip(page, clip, dpi=args.dpi)
            draw = ImageDraw.Draw(img_clip)

            if pos_items:
                if pos_items[0].get("source") == "OCR":
                    # círculos con bbox de OCR (en px)
                    for it in pos_items:
                        x, y, w, h = it["px"]
                        draw_circle(draw, x, y, w, h, width=args.circle_width)
                else:
                    # texto vectorial: convertimos rect PDF -> px dentro del clip
                    zoom = args.dpi / 72.0
                    for it in pos_items:
                        r = it["rect"]
                        x0p = (r.x0 - clip.x0) * zoom
                        y0p = (r.y0 - clip.y0) * zoom
                        x1p = (r.x1 - clip.x0) * zoom
                        y1p = (r.y1 - clip.y0) * zoom
                        x = int(min(x0p, x1p))
                        y = int(min(y0p, y1p))
                        w = int(abs(x1p - x0p))
                        h = int(abs(y1p - y0p))
                        draw_circle(draw, x, y, w, h, width=args.circle_width)

            out_name = f"{pdf_root}-{page_num:04d}-{box_i:02d}-allpos.png"
            img_clip.save(out_dir / out_name)

            # --------- Rows ---------
            if not pos_items:
                rows.append({
                    "pdf": pdf_path.name,
                    "page": page_num,
                    "box": box_i,
                    "pos": None,
                    "source": "NONE",
                    "conf": None,
                    "out_image": out_name,
                })
                continue

            for it in pos_items:
                total_pos += 1
                rows.append({
                    "pdf": pdf_path.name,
                    "page": page_num,
                    "box": box_i,
                    "pos": it["pos"],
                    "source": it["source"],
                    "conf": it.get("conf"),
                    "out_image": out_name,
                })

    doc.close()

    df = pd.DataFrame(rows)
    csv_path = out_dir / "05_02_pdf_vector_pos.csv"
    xlsx_path = out_dir / "05_02_pdf_vector_pos.xlsx"
    df.to_csv(csv_path, index=False, encoding="utf-8-sig")
    df.to_excel(xlsx_path, index=False)

    print("\n--- RESUMEN 05_02 ---")
    print(f"PDF: {pdf_path}")
    print(f"Marcos: {total_boxes}")
    print(f"POS detectadas: {total_pos}")
    print(f"OUT: {out_dir}")
    print(f"CSV: {csv_path}")
    print(f"XLSX: {xlsx_path}")

if __name__ == "__main__":
    main()
