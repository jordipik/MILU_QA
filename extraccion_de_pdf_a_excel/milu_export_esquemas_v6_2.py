import re
import csv
import fitz  # PyMuPDF
from pathlib import Path
import argparse
from collections import defaultdict

# Heurística para detectar etiquetas cortas (números) pegadas al esquema
NUM_RE = re.compile(r"^\s*[\d\-–—\.]+[A-Za-z0-9\-–—\.]*\s*$")


# -------------------------------
# 1) Detección y parseo del BOM
# -------------------------------

def parse_bom(text: str):
    """
    Intenta extraer el BOM desde el texto completo de una página.
    Es tolerante con variaciones de formato:
      - BOM No.: 123.12345
      - BOM-No: X00014067
      - BOM No  A-001-004
      - BOM: 123.12345
      - etc.
    """
    if not text:
        return None

    # Normalizamos guiones largos a guion normal
    norm = text.replace("\u2013", "-").replace("\u2014", "-")

    # 1) Formato MTU típico: 123.12345 con preferencia
    m = re.search(
        r"BOM\s*-?\s*No\.?\s*[:\-]?\s*([0-9]{3}\.[0-9]{5})",
        norm,
        re.IGNORECASE,
    )
    if m:
        return m.group(1).strip()

    # 2) Formato general con "No"
    #    Ejemplos: X00014067, A-001-004, ABC_123, 12.345
    m2 = re.search(
        r"BOM\s*-?\s*No\.?\s*[:\-]?\s*([A-Za-z0-9\.\-_]+)",
        norm,
        re.IGNORECASE,
    )
    if m2:
        return m2.group(1).strip()

    # 3) Formato sin "No", solo "BOM:"
    m3 = re.search(
        r"BOM\s*[:\-]\s*([A-Za-z0-9\.\-_]+)",
        norm,
        re.IGNORECASE,
    )
    if m3:
        return m3.group(1).strip()

    return None


def extract_bom(page):
    """
    Extrae BOM de la página usando parse_bom() y devuelve (bom_raw, bom_formatted) o (None, None).
    """
    txt = page.get_text("text")
    raw = parse_bom(txt)
    if not raw:
        return None, None

    # Normalización del BOM para usar como nombre de archivo:
    #  - Sólo permitimos A-Z a-z 0-9 . _ -
    safe = re.sub(r"[^A-Za-z0-9\.\-_]+", "-", raw)
    # Cambiamos puntos por guiones para el nombre de archivo
    formatted = safe.replace(".", "-").strip("-")

    if not formatted:
        return raw, None

    return raw, formatted


# -------------------------------
# 2) Utilidades de geometría
# -------------------------------

def rect_union(rects):
    r = None
    for x in rects:
        r = x if r is None else r | x
    return r


def expand(rect, p):
    return fitz.Rect(rect.x0 - p, rect.y0 - p, rect.x1 + p, rect.y1 + p)


def merge_overlapping(rects, pad=8):
    """
    Agrupa rectángulos (imágenes) cercanos entre sí para formar un único esquema.
    """
    out = []
    for r in rects:
        r_exp = expand(r, pad)
        merged = False
        for i in range(len(out)):
            if expand(out[i], pad).intersects(r_exp):
                out[i] = out[i] | r
                merged = True
                break
        if not merged:
            out.append(r)

    # Segunda pasada para asegurarnos de que no quedan grupos solapados
    changed = True
    while changed:
        changed = False
        new = []
        for r in out:
            hit = False
            for j in range(len(new)):
                if expand(new[j], pad).intersects(expand(r, pad)):
                    new[j] = new[j] | r
                    hit = True
                    changed = True
                    break
            if not hit:
                new.append(r)
        out = new
    return out


# -------------------------------
# 3) Extracción de imágenes/texto
# -------------------------------

def get_image_rects(page, min_area=0):
    """
    Devuelve los rectángulos de las imágenes de la página cuyo área >= min_area.
    """
    rects = []
    for info in page.get_images(full=True):
        xref = info[0]
        for r in page.get_image_rects(xref):
            if r.get_area() >= min_area:
                rects.append(r)
    return rects


def get_text_spans_rects(page):
    """
    Devuelve lista de (Rect, texto) para cada 'span' de texto de la página.
    """
    spans = []
    d = page.get_text("dict")
    for b in d.get("blocks", []):
        for l in b.get("lines", []):
            for s in l.get("spans", []):
                rect = fitz.Rect(s["bbox"])
                text = s.get("text", "").strip()
                if text:
                    spans.append((rect, text))
    return spans


# -------------------------------
# 4) Recorte de esquemas
# -------------------------------

def crop_schemes_from_page(page, dpi=300, min_img_area=20000, pad=12, cluster_pad=16):
    """
    Localiza bloques de imágenes que forman un esquema y los recorta,
    incluyendo etiquetas cercanas (números, cortos).
    """
    img_rects = get_image_rects(page, min_area=min_img_area)
    if not img_rects:
        return []

    # Agrupar imágenes cercanas en "clusters" de esquema
    clusters = merge_overlapping(img_rects, pad=cluster_pad)
    spans = get_text_spans_rects(page)
    results = []

    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)

    for cluster in clusters:
        cluster_rect = fitz.Rect(cluster)

        # Incluir etiquetas cortas cercanas
        nearby_pad = max(pad, 12)
        include_rects = [cluster_rect]

        for r, t in spans:
            short = len(t) <= 8 or NUM_RE.match(t)
            if short and expand(cluster_rect, nearby_pad).intersects(r):
                include_rects.append(r)

        final_rect = rect_union(include_rects)
        final_rect = expand(final_rect, pad)

        pix = page.get_pixmap(matrix=mat, clip=final_rect, alpha=False)
        results.append((pix, final_rect))

    return results


# -------------------------------
# 5) Procesar PDF completo
# -------------------------------

def process_pdf(pdf_path: Path, out_dir: Path,
                dpi=300, min_img_area=20000, pad=12, cluster_pad=16):
    """
    Recorre todas las páginas del PDF, recorta los esquemas y exporta:
      - PNGs de los esquemas
      - CSV con metadatos (BOM, página, rectángulo, etc.)
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / f"{pdf_path.stem}_esquemas.csv"

    doc = fitz.open(pdf_path)
    exported = 0

    last_bom_raw = None
    last_bom_fmt = None

    # Para evitar sobrescrituras: contador por BOM formateado
    bom_counts = defaultdict(int)

    with csv_path.open("w", newline="", encoding="utf-8") as fcsv:
        writer = csv.writer(fcsv, delimiter=",")
        writer.writerow([
            "pdf", "page", "diag_index",
            "bom_raw", "bom_formatted",
            "filename",
            "rect_x0_pt", "rect_y0_pt", "rect_x1_pt", "rect_y1_pt",
            "dpi", "width_px", "height_px"
        ])

        for i, page in enumerate(doc, start=1):
            # Intentamos extraer BOM de la página actual
            bom_raw, bom_fmt = extract_bom(page)

            if bom_fmt:
                # Si hay BOM nuevo, lo guardamos como "último"
                last_bom_raw, last_bom_fmt = bom_raw, bom_fmt
            else:
                # Si no hay BOM en esta página, reutilizamos el último detectado (si existe)
                bom_raw, bom_fmt = last_bom_raw, last_bom_fmt

            crops = crop_schemes_from_page(
                page,
                dpi=dpi,
                min_img_area=min_img_area,
                pad=pad,
                cluster_pad=cluster_pad
            )
            if not crops:
                continue

            for j, (pix, rect) in enumerate(crops, start=1):
                # Nombre de archivo:
                #  - Si tenemos BOM formateado, lo usamos como base,
                #    añadiendo sufijos _02, _03... si hay varios esquemas.
                #  - Si no hay BOM conocido (ni actual ni heredado),
                #    usamos NO-BOM_p####_diag_## como último recurso.
                if bom_fmt:
                    base = bom_fmt
                    bom_counts[base] += 1
                    suffix = "" if bom_counts[base] == 1 else f"_{bom_counts[base]:02d}"
                    fname = f"{base}{suffix}.png"
                else:
                    # Caso realmente extremo: ninguna página anterior tenía BOM detectable
                    fname = f"NO-BOM_p{i:04d}_diag_{j:02d}.png"

                (out_dir / fname).write_bytes(pix.tobytes("png"))
                exported += 1

                writer.writerow([
                    pdf_path.name, i, j,
                    bom_raw or "", bom_fmt or "",
                    fname,
                    round(rect.x0, 2), round(rect.y0, 2),
                    round(rect.x1, 2), round(rect.y1, 2),
                    dpi, pix.width, pix.height
                ])

                print(
                    f"[OK] {fname}  (p{i:04d} diag{j:02d})  "
                    f"rect=({rect.x0:.1f},{rect.y0:.1f},{rect.x1:.1f},{rect.y1:.1f})"
                )

    doc.close()

    if exported == 0:
        print(
            f"[!] {pdf_path.name}: no se detectaron esquemas "
            f"(ajusta --min-img-area / --cluster-pad)."
        )
    else:
        print(
            f"[INFO] {pdf_path.name}: {exported} recortes exportados. "
            f"CSV: {csv_path.name}"
        )


# -------------------------------
# 6) main() / CLI
# -------------------------------

def main():
    ap = argparse.ArgumentParser(
        description="Exportar SOLO esquemas (imagen + números) desde PDFs."
    )
    ap.add_argument("pdf", type=Path, help="Archivo PDF de entrada")
    ap.add_argument("--out", type=Path, default=None, help="Carpeta de salida")
    ap.add_argument("--dpi", type=int, default=300, help="Resolución de salida")
    ap.add_argument(
        "--min-img-area",
        type=int,
        default=20000,
        help="Área mínima (pt^2) para contar una imagen como parte de esquema",
    )
    ap.add_argument(
        "--pad",
        type=float,
        default=12,
        help="Padding del recorte (pt)",
    )
    ap.add_argument(
        "--cluster-pad",
        type=float,
        default=16,
        help="Distancia para agrupar imágenes cercanas (pt)",
    )
    args = ap.parse_args()

    out = args.out if args.out else args.pdf.parent / f"{args.pdf.stem}_esquemas"
    process_pdf(
        args.pdf,
        out,
        dpi=args.dpi,
        min_img_area=args.min_img_area,
        pad=args.pad,
        cluster_pad=args.cluster_pad,
    )


if __name__ == "__main__":
    main()
