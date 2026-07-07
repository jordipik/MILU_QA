#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Añadir automáticamente cuadrados rojos (anotaciones) alrededor
de las imágenes GRANDES de un PDF MTU.

Nueva lógica:
- En lugar de filtrar por área mínima (min-area),
  se filtra por ANCHO relativo de la imagen:
  se marca una imagen cuando su ancho >= (min_width_ratio * ancho_pagina).
  Por defecto, min_width_ratio = 0.5  (50% del ancho de la página).

Además:
- Fusiona los rectángulos que se solapan o son contiguos (con un pequeño margen).
- Dibuja UN SOLO cuadro que engloba cada grupo de rectángulos.

Uso:
    python milu_add_red_boxes_big_images.py \
        --input  12V4000M53.pdf \
        --output 12V4000M53_red_boxes.pdf \
        --min-width-ratio 0.5

Dependencias:
    pip install pymupdf
"""

import argparse
from pathlib import Path
import fitz  # PyMuPDF


def merge_contiguous_rects(rects, pad=4.0):
    """
    Fusiona rectángulos que se solapan o están muy cerca (contiguos).

    pad: margen que se añade alrededor de cada rectángulo para facilitar
         que se consideren "contiguos" aunque solo se toquen o casi se toquen.
    """
    if not rects:
        return []

    merged = []

    # Primera pasada: inserta cada rectángulo fusionándolo con los que toque
    for r in rects:
        r_exp = r + (-pad, -pad, pad, pad)  # lo agrandamos un pelín
        colocado = False

        for i, m in enumerate(merged):
            # Si se cruzan (considerando el pad), los unimos
            if m.intersects(r_exp):
                merged[i] = m | r  # unión de ambos rectángulos
                colocado = True
                break

        if not colocado:
            merged.append(r)

    # Segunda pasada: por si han quedado grupos que todavía pueden fusionarse
    changed = True
    while changed:
        changed = False
        nuevo = []
        for r in merged:
            unido = False
            for j, m in enumerate(nuevo):
                if m.intersects(r + (-pad, -pad, pad, pad)):
                    nuevo[j] = m | r
                    unido = True
                    changed = True
                    break
            if not unido:
                nuevo.append(r)
        merged = nuevo

    return merged


def add_red_boxes_to_pdf(
    input_pdf: Path,
    output_pdf: Path,
    min_width_ratio: float = 0.5,
    border_width: float = 2.0,
):
    """
    Dibuja recuadros rojos alrededor de imágenes cuyo ANCHO es
    al menos min_width_ratio * ancho_de_la_página.
    """
    doc = fitz.open(input_pdf)
    total_boxes = 0

    for page in doc:
        image_rects = []

        page_width = page.rect.width

        # 1) Detectar imágenes de la página
        for info in page.get_images(full=True):
            xref = info[0]
            for r in page.get_image_rects(xref):
                # Criterio: ancho de la imagen respecto al ancho de la página
                if r.width >= page_width * min_width_ratio:
                    image_rects.append(r)

        # 2) Fusionar rectángulos contiguos/solapados
        merged_rects = merge_contiguous_rects(image_rects, pad=4.0)

        # 3) Crear anotaciones rectangulares (blancas y más grandes)

        expand = 3.0  # ≈ 12 px (en puntos PDF)

        for rect in merged_rects:
            # Agrandar el rectángulo
            big_rect = rect + (-expand, -expand, expand, expand)

            annot = page.add_rect_annot(big_rect)
            annot.set_colors({"stroke": (1, 0, 0)})  # rojo
            annot.set_border({"width": border_width})
            annot.update()
            total_boxes += 1


    # 4) Guardar PDF nuevo
    doc.save(output_pdf)
    doc.close()
    print(
        f"[OK] Guardado: {output_pdf}  "
        f"(cuadros creados: {total_boxes}, min_width_ratio={min_width_ratio})"
    )


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Añade cuadrados rojos alrededor de imágenes grandes en un PDF, "
            "definidas por su ancho relativo a la página."
        )
    )
    parser.add_argument(
        "--input",
        required=True,
        help="PDF de entrada (por ejemplo 12V4000M53.pdf)",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="PDF de salida con anotaciones (por ejemplo 12V4000M53_red_boxes.pdf)",
    )
    parser.add_argument(
        "--min-width-ratio",
        type=float,
        default=0.5,
        help=(
            "Fracción mínima del ancho de la página que debe ocupar la imagen "
            "para considerarse 'grande' (por defecto 0.5 = 50%%)"
        ),
    )
    parser.add_argument(
        "--border-width",
        type=float,
        default=2.0,
        help="Grosor de la línea del recuadro rojo (por defecto 2.0)",
    )

    args = parser.parse_args()

    add_red_boxes_to_pdf(
        input_pdf=Path(args.input),
        output_pdf=Path(args.output),
        min_width_ratio=args.min_width_ratio,
        border_width=args.border_width,
    )


if __name__ == "__main__":
    main()
