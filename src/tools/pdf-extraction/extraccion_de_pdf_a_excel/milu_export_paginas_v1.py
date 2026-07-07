#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Genera una imagen por cada página de todos los PDFs de una carpeta.

- Nombre de archivo de salida: <nombre_pdf>_001.png, <nombre_pdf>_002.png, ...
- Todas las imágenes se guardan en una única carpeta de salida.

Uso:
  python milu_export_paginas_v1.py --input ./carpeta_pdfs --output ./carpeta_imagenes --dpi 200
"""

import argparse
from pathlib import Path

import fitz  # PyMuPDF


def export_pages_as_images(pdf_path: Path, out_dir: Path, dpi: int = 200):
    """Convierte todas las páginas de un PDF en imágenes PNG."""
    doc = fitz.open(pdf_path)
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)

    base_name = pdf_path.stem  # nombre del archivo sin .pdf

    for i, page in enumerate(doc, start=1):
        pix = page.get_pixmap(matrix=mat, alpha=False)
        out_name = f"{base_name}_{i:03d}.png"
        out_path = out_dir / out_name
        pix.save(out_path)
        print(f"[OK] {pdf_path.name} -> {out_name}")

    doc.close()


def main():
    ap = argparse.ArgumentParser(description="Exportar una imagen por página de todos los PDFs de una carpeta.")
    ap.add_argument("--input", required=True, help="Carpeta con PDFs de entrada")
    ap.add_argument("--output", required=True, help="Carpeta donde se guardarán todas las imágenes")
    ap.add_argument("--dpi", type=int, default=200, help="Resolución de salida (por defecto 200)")
    args = ap.parse_args()

    in_dir = Path(args.input)
    out_dir = Path(args.output)

    if not in_dir.is_dir():
        raise SystemExit(f"La carpeta de entrada no existe: {in_dir}")

    out_dir.mkdir(parents=True, exist_ok=True)

    pdf_files = sorted(p for p in in_dir.iterdir() if p.suffix.lower() == ".pdf")
    if not pdf_files:
        raise SystemExit(f"No se han encontrado PDFs en: {in_dir}")

    print(f"Encontrados {len(pdf_files)} PDF(s) en {in_dir}")
    print(f"Las imágenes se guardarán en: {out_dir}\n")

    for pdf in pdf_files:
        print(f"Procesando {pdf.name}...")
        try:
            export_pages_as_images(pdf, out_dir, dpi=args.dpi)
        except Exception as e:
            print(f"[AVISO] Error procesando {pdf.name}: {e}")

    print("\nProceso terminado.")


if __name__ == "__main__":
    main()
