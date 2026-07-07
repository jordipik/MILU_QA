#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import io
import re
import csv
import argparse
from pathlib import Path
from typing import Optional, Dict, Any, List, Iterable, Tuple

import fitz  # PyMuPDF
from PIL import Image


# ============================================================
# CONFIG (defaults)
# ============================================================
EXPORT_IMAGES_DEFAULT = False     # False: solo índices; True: exporta PNGs
WRITE_CSV_DEFAULT = True
WRITE_XLSX_DEFAULT = True         # <- NUEVO: escribir Excel (por PDF y global)
ADD_META_TO_FILENAME_DEFAULT = True

# Margen (en puntos PDF) para cortar la cabecera antes del primer marco rojo
HEADER_MARGIN_PTS_DEFAULT = 12.0

# Fallback si una página no tiene marcos rojos
HEADER_RATIO_FALLBACK = 0.28

BOOK_OVERRIDE_DEFAULT = None


# ============================================================
# 1) Detectar marcos rojos (anotaciones Square/Circle con trazo rojo)
# ============================================================
def get_red_boxes(page, tol=0.15) -> List[fitz.Rect]:
    """
    Devuelve rectángulos (fitz.Rect) de anotaciones tipo Square/Circle
    cuyo trazo (stroke) es "rojo".
    """
    rects: List[fitz.Rect] = []
    annots = page.annots()
    if not annots:
        return rects

    for a in annots:
        # type[0] == 4  → Square/Circle
        if a.type[0] != 4:
            continue

        colors = a.colors or {}
        stroke = colors.get("stroke")
        if stroke is None:
            continue

        r, g, b = stroke
        if r > g + tol and r > b + tol:
            rects.append(a.rect)

    return rects


# ============================================================
# 2) Inferir "libro" desde el nombre del PDF
# ============================================================
def infer_book_from_pdf_name(pdf_path: Path) -> str:
    stem = pdf_path.stem
    stem = re.sub(r"(?i)(_clean_marcos|_marcos|_clean|_esquemas)$", "", stem).strip()

    parts = stem.split("_")
    if len(parts) >= 2 and len(parts[0]) >= 6:
        return parts[0]
    return stem


# ============================================================
# 3) Lectura de cabecera sin “contaminación”
# ============================================================
def get_header_clip_rect(page_obj, red_boxes: List[fitz.Rect], header_margin_pts: float) -> fitz.Rect:
    r = page_obj.rect

    if red_boxes:
        min_y0 = min(b.y0 for b in red_boxes)
        y1 = max(r.y0, min_y0 - header_margin_pts)
        y1 = max(y1, r.y0 + r.height * 0.08)
        return fitz.Rect(r.x0, r.y0, r.x1, y1)

    return fitz.Rect(r.x0, r.y0, r.x1, r.y0 + r.height * HEADER_RATIO_FALLBACK)


def _normalize_text_keep_newlines(txt: str) -> str:
    txt = txt.replace("\r\n", "\n").replace("\r", "\n")
    txt = re.sub(r"[ \t]+", " ", txt)
    txt = re.sub(r"\n{3,}", "\n\n", txt).strip()
    return txt


def _extract_after_label(header_text: str, label_regex: str) -> Optional[str]:
    pattern = re.compile(rf"(?i)\b{label_regex}\b\s*[:：]?\s*(.*)")
    lines = header_text.split("\n")

    for i, line in enumerate(lines):
        m = pattern.search(line)
        if not m:
            continue

        tail = (m.group(1) or "").strip()
        nxt1 = lines[i + 1].strip() if i + 1 < len(lines) else ""
        nxt2 = lines[i + 2].strip() if i + 2 < len(lines) else ""

        chunk_lines = []
        if tail:
            chunk_lines.append(tail)
        if nxt1:
            chunk_lines.append(nxt1)
        if nxt2:
            chunk_lines.append(nxt2)

        if not chunk_lines:
            return None

        chunk = " ".join(chunk_lines).strip()
        chunk = re.sub(r"\s{2,}", " ", chunk)
        return chunk if chunk else None

    return None


def _pick_bom_candidate(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None

    s = raw.strip()
    s = re.sub(r"^[\.\:\;\,\-]+", "", s).strip()

    tokens = re.findall(r"[0-9A-Za-z][0-9A-Za-z\.\-_\/]*", s)
    if not tokens:
        return None

    def digit_count(t: str) -> int:
        return len(re.findall(r"\d", t))

    tokens_sorted = sorted(tokens, key=lambda t: (digit_count(t), len(t)), reverse=True)
    best = tokens_sorted[0].strip()
    return best if best else None


def _pick_fgfgs_candidate(raw: Optional[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    if not raw:
        return None, None, None

    s = raw.strip()
    s = re.sub(r"^[\.\:\;\,\-]+", "", s).strip()
    s = re.sub(r"(?i)\b(FG\s*/\s*FGS)\b", "", s).strip()
    s = re.sub(r"\s{2,}", " ", s).strip()

    m = re.search(r"\b(\d{1,4})\b\s*[-/ ]\s*\b(\d{1,4})\b", s)
    if m:
        fg = m.group(1)
        fgs = m.group(2)
        return fg, fgs, f"{fg} {fgs}"

    m1 = re.search(r"\b(\d{1,4})\b", s)
    if m1:
        fg = m1.group(1)
        return fg, None, fg

    return None, None, s if s else None


def extract_page_meta(page_obj, red_boxes: List[fitz.Rect], header_margin_pts: float) -> Dict[str, Optional[str]]:
    clip = get_header_clip_rect(page_obj, red_boxes, header_margin_pts)
    header = page_obj.get_text("text", clip=clip) or ""
    header = _normalize_text_keep_newlines(header)

    fgfgs_raw = _extract_after_label(header, r"FG\s*/\s*FGS")
    bom_raw = _extract_after_label(header, r"BOM\s*[- ]?\s*No\.?")

    fg, fgs, fgfgs_clean = _pick_fgfgs_candidate(fgfgs_raw)
    bom_clean = _pick_bom_candidate(bom_raw)

    return {"fgfgs_raw": fgfgs_clean, "fg": fg, "fgs": fgs, "bom_no": bom_clean}


# ============================================================
# 4) Export / listado por PDF
# ============================================================
def _write_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["libro", "pdf", "page_num", "schema_idx", "fg", "fgs", "fgfgs_raw", "bom_no", "png"],
        )
        w.writeheader()
        w.writerows(rows)


def _write_xlsx(path: Path, rows: List[Dict[str, Any]]) -> None:
    # Requiere: pip install pandas openpyxl
    import pandas as pd
    df = pd.DataFrame(rows)
    # orden de columnas “bonito”
    cols = ["libro", "pdf", "page_num", "schema_idx", "fg", "fgs", "fgfgs_raw", "bom_no", "png"]
    df = df[[c for c in cols if c in df.columns]]
    df.to_excel(path, index=False)


def export_schemes_or_list_only(
    pdf_path: Path,
    out_dir: Path,
    dpi: int = 300,
    shrink: float = 1.0,
    page: Optional[int] = None,      # 1..N
    export_images: bool = True,
    write_csv: bool = True,
    write_xlsx: bool = True,         # <- NUEVO
    add_meta_to_filename: bool = True,
    book_override: Optional[str] = None,
    header_margin_pts: float = HEADER_MARGIN_PTS_DEFAULT,
    quiet: bool = False,             # <- NUEVO: si no quieres spam en consola
) -> Dict[str, Any]:
    """
    - Detecta marcos rojos (esquemas).
    - Si export_images=True: exporta PNG por marco rojo.
    - Prepara filas para CSV/XLSX (por PDF).
    """
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)

    libro = book_override if book_override else infer_book_from_pdf_name(pdf_path)

    rows: List[Dict[str, Any]] = []
    exported = 0
    detected = 0

    if page is not None:
        if page < 1 or page > len(doc):
            doc.close()
            raise SystemExit(f"[ERROR] --page {page} fuera de rango. El PDF tiene {len(doc)} páginas.")
        page_indices = [page - 1]
    else:
        page_indices = range(len(doc))

    if not quiet:
        print(f"\n=== PDF: {pdf_path.name} | Libro: {libro} | páginas={len(doc)} ===")

    for page_idx in page_indices:
        page_obj = doc.load_page(page_idx)
        page_num = page_idx + 1

        boxes = get_red_boxes(page_obj)
        if not boxes:
            continue

        meta = extract_page_meta(page_obj, boxes, header_margin_pts)

        for schema_idx, box in enumerate(boxes, start=1):
            detected += 1

            base = f"{libro}-{page_num:04d}-{schema_idx:02d}"
            fname = None

            if export_images:
                clip_rect = box + (shrink, shrink, -shrink, -shrink)
                pix = page_obj.get_pixmap(matrix=mat, clip=clip_rect, alpha=False)
                img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")

                # nombre con o sin sufijo
                if add_meta_to_filename:
                    suffix_parts = []
                    if meta.get("fgfgs_raw"):
                        safe_fgfgs = re.sub(r"[^0-9A-Za-z\.\-_]+", "_", meta["fgfgs_raw"]).strip("_")
                        if safe_fgfgs:
                            suffix_parts.append(f"FGS{safe_fgfgs}")
                    if meta.get("bom_no"):
                        safe_bom = re.sub(r"[^0-9A-Za-z\.\-_]+", "_", meta["bom_no"]).strip("_")
                        if safe_bom:
                            suffix_parts.append(f"BOM{safe_bom}")

                    suffix = "__" + "__".join(suffix_parts) if suffix_parts else ""
                    fname = f"{base}{suffix}.png"
                else:
                    fname = f"{base}.png"

                out_path = out_dir / fname
                img.save(out_path, format="PNG")
                exported += 1

            rows.append({
                "libro": libro,
                "pdf": pdf_path.name,
                "page_num": page_num,
                "schema_idx": schema_idx,
                "fg": meta.get("fg"),
                "fgs": meta.get("fgs"),
                "fgfgs_raw": meta.get("fgfgs_raw"),
                "bom_no": meta.get("bom_no"),
                "png": fname,  # None si no export_images
            })

            # ---- NUEVO: progreso por esquema en consola
            if not quiet:
                if export_images:
                    print(f"[ESQ] {libro} p{page_num:04d} esq{schema_idx:02d}  -> {fname}")
                else:
                    print(f"[ESQ] {libro} p{page_num:04d} esq{schema_idx:02d}  (solo índice)")

    # Guardar índice por PDF
    csv_path = out_dir / "index.csv"
    xlsx_path = out_dir / "index.xlsx"

    if write_csv:
        _write_csv(csv_path, rows)

    if write_xlsx:
        try:
            _write_xlsx(xlsx_path, rows)
        except Exception as e:
            if not quiet:
                print(f"[WARN] No se pudo escribir XLSX por-PDF ({xlsx_path.name}). "
                      f"Instala pandas+openpyxl o revisa error: {e}")

    doc.close()

    if not quiet:
        print(f"[INFO] Esquemas detectados: {detected}")
        if export_images:
            print(f"[INFO] Imágenes exportadas: {exported}")
        else:
            print(f"[INFO] Export imágenes: NO (solo listado)")
        print(f"[INFO] Carpeta salida: {out_dir}")
        if write_csv:
            print(f"[INFO] CSV índice: {csv_path.name}")
        if write_xlsx:
            print(f"[INFO] XLSX índice: {xlsx_path.name}")

    return {
        "pdf": str(pdf_path),
        "libro": libro,
        "out_dir": str(out_dir),
        "detected": detected,
        "exported": exported,
        "rows": rows,
        "csv_path": str(csv_path) if write_csv else None,
        "xlsx_path": str(xlsx_path) if write_xlsx else None,
    }


# ============================================================
# 5) Procesar carpeta de PDFs
# ============================================================
def iter_pdfs(input_path: Path) -> Iterable[Path]:
    if input_path.is_file():
        yield input_path
        return
    for p in sorted(input_path.glob("*.pdf")):
        if p.is_file():
            yield p


def process_many_pdfs(
    input_path: Path,
    out_root: Path,
    dpi: int,
    shrink: float,
    export_images: bool,
    write_csv: bool,
    write_xlsx: bool,                # <- NUEVO
    add_meta_to_filename: bool,
    book_override: Optional[str],
    header_margin_pts: float,
    quiet: bool,                     # <- NUEVO
) -> None:
    out_root.mkdir(parents=True, exist_ok=True)

    all_rows: List[Dict[str, Any]] = []

    for pdf in iter_pdfs(input_path):
        subdir = out_root / f"{pdf.stem}_esquemas"
        result = export_schemes_or_list_only(
            pdf_path=pdf,
            out_dir=subdir,
            dpi=dpi,
            shrink=shrink,
            page=None,
            export_images=export_images,
            write_csv=write_csv,
            write_xlsx=write_xlsx,
            add_meta_to_filename=add_meta_to_filename,
            book_override=book_override,
            header_margin_pts=header_margin_pts,
            quiet=quiet,
        )
        all_rows.extend(result["rows"])

    # Índice global
    if write_csv:
        index_all = out_root / "index_all.csv"
        _write_csv(index_all, all_rows)
        if not quiet:
            print(f"\n[INFO] CSV global: {index_all}")
            print(f"[INFO] Filas totales: {len(all_rows)}")

    if write_xlsx:
        index_all_xlsx = out_root / "index_all.xlsx"
        try:
            _write_xlsx(index_all_xlsx, all_rows)
            if not quiet:
                print(f"[INFO] XLSX global: {index_all_xlsx}")
        except Exception as e:
            if not quiet:
                print(f"[WARN] No se pudo escribir XLSX global ({index_all_xlsx.name}). "
                      f"Instala pandas+openpyxl o revisa error: {e}")


# ============================================================
# 6) CLI
# ============================================================
def main():
    ap = argparse.ArgumentParser(
        description="Exporta PNG por marco rojo (o solo lista) y extrae FG/FGS y BOM-No evitando contaminarse con números del esquema."
    )
    ap.add_argument("input", type=Path, help="PDF de entrada o carpeta con PDFs")
    ap.add_argument("--out", type=Path, default=None, help="Carpeta raíz de salida (por defecto junto al input)")

    ap.add_argument("--dpi", type=int, default=300, help="Resolución de salida (si exportas imágenes)")
    ap.add_argument("--shrink", type=float, default=1.0, help="Puntos para encoger el marco y evitar la línea roja")

    ap.add_argument("--book", type=str, default=BOOK_OVERRIDE_DEFAULT, help="Forzar nombre de libro (opcional)")
    ap.add_argument("--header-margin", type=float, default=HEADER_MARGIN_PTS_DEFAULT,
                    help="Margen (pts) para cortar cabecera antes del primer marco rojo")

    # Switches
    ap.add_argument("--export-images", action="store_true", help="Exportar PNGs (por defecto NO)")
    ap.add_argument("--no-csv", action="store_true", help="No escribir CSVs")
    ap.add_argument("--no-xlsx", action="store_true", help="No escribir XLSX (por defecto SI)")
    ap.add_argument("--no-meta-filename", action="store_true", help="No añadir FG/FGS y BOM al nombre del PNG")
    ap.add_argument("--quiet", action="store_true", help="Reduce salida por consola (sin detalle por esquema)")

    args = ap.parse_args()

    export_images = args.export_images if args.export_images is True else EXPORT_IMAGES_DEFAULT
    write_csv = WRITE_CSV_DEFAULT and (not args.no_csv)
    write_xlsx = WRITE_XLSX_DEFAULT and (not args.no_xlsx)
    add_meta_to_filename = ADD_META_TO_FILENAME_DEFAULT and (not args.no_meta_filename)

    input_path = args.input

    if args.out:
        out_root = args.out
    else:
        if input_path.is_file():
            out_root = input_path.parent / f"{input_path.stem}_OUTPUT"
        else:
            out_root = input_path / "_OUTPUT"

    process_many_pdfs(
        input_path=input_path,
        out_root=out_root,
        dpi=args.dpi,
        shrink=args.shrink,
        export_images=export_images,
        write_csv=write_csv,
        write_xlsx=write_xlsx,
        add_meta_to_filename=add_meta_to_filename,
        book_override=args.book,
        header_margin_pts=args.header_margin,
        quiet=args.quiet,
    )


if __name__ == "__main__":
    main()
