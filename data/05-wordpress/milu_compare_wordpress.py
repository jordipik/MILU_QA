#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
milu_compare_wordpress.py

Compara uno o varios CSV de exportación MILU contra un CSV exportado de WordPress
y genera estadísticas por libro/motor:
- Total MILU
- New / Superseded
- Encontrados en WordPress
- No localizados en export WordPress
- Cobertura
- Productos que están solo en WordPress

Uso:
  python milu_compare_wordpress.py \
    --wp product-export-2026-06-18-01-51-12.csv \
    --milu milu_wp_new_import.csv milu_wp_superseded_import.csv \
    --out-dir ./audit_wp

Si solo tienes New:
  python milu_compare_wordpress.py --wp product-export.csv --milu milu_wp_new_import.csv --out-dir ./audit_wp
"""

import argparse
import csv
import os
import re
from collections import Counter, defaultdict
from pathlib import Path

ENGINES = [
    "12V4000M40A",
    "12V4000M53",
    "12V4000M70",
    "16V4000M61",
    "16V4000M73",
    "16V4000M73L",
    "16V4000M90",
    "20V4000M93",
    "20V4000M93L",
]

SHORT_TO_ENGINE = {
    "12VM40A": "12V4000M40A",
    "12VM53": "12V4000M53",
    "12VM70": "12V4000M70",
    "16VM61": "16V4000M61",
    "16VM73": "16V4000M73",
    "16VM73L": "16V4000M73L",
    "16VM90": "16V4000M90",
    "20VM93": "20V4000M93",
    "20VM93L": "20V4000M93L",
}


def sniff_delimiter(path: Path) -> str:
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as f:
        sample = f.read(4096)
    # Los CSV de MILU suelen ir con ; y los exports WP suelen ir con ,
    if sample.count(";") > sample.count(","):
        return ";"
    return ","


def norm_pn(value: str) -> str:
    """Normalización conservadora para comparar PN/SKU."""
    if value is None:
        return ""
    value = str(value).strip().upper()
    value = re.sub(r"\s+", "", value)
    return value


def detect_kind(path: Path, row: dict) -> str:
    """New/Superseded a partir del nombre de fichero o columnas."""
    name = path.name.lower()
    if "superseded" in name:
        return "Superseded"
    if "new" in name:
        return "New"

    for col in ("SUST_TIPO", "type", "post_title", "product_type"):
        val = (row.get(col) or "").strip().lower()
        if val == "superseded":
            return "Superseded"
        if val == "new":
            return "New"

    return "Milu"


def detect_origin(row: dict) -> str:
    """
    Intenta diferenciar Real PDF vs Sintético si el CSV contiene alguna pista.
    Si no existe columna explícita, devuelve 'No informado'.
    """
    joined = " ".join(str(row.get(c, "")) for c in row.keys()).lower()
    idv = (row.get("Id") or row.get("id") or "").strip().lower()

    synthetic_cols = [
        "synthetic", "is_synthetic", "source_type", "origen", "origin",
        "milu_origin", "record_origin", "tipo_origen"
    ]
    for col in synthetic_cols:
        if col in row:
            val = str(row.get(col) or "").strip().lower()
            if val in ("1", "true", "yes", "si", "sí", "synthetic", "sintetico", "sintético"):
                return "Sintético MILU"
            if val in ("0", "false", "no", "real", "pdf"):
                return "PDF real"

    if idv.startswith(("syn", "synth", "synthetic", "sint")):
        return "Sintético MILU"

    # En algunos exports el New sintético se identifica por no tener página/posición real.
    # No forzamos esta regla para evitar falsos positivos.
    if "synthetic" in joined or "sintético" in joined or "sintetico" in joined:
        return "Sintético MILU"

    return "No informado"


def detect_engine(row: dict) -> str:
    """
    Libro principal del artículo.
    Prioridad:
    1) Id RB-<LIBRO>-...
    2) Campos con libro explícito
    3) Primer motor detectado en PAG / exp_motor / tax:product_cat
    """
    candidates = [
        row.get("Id") or row.get("id") or "",
        row.get("source_book") or "",
        row.get("book") or "",
        row.get("libro") or "",
        row.get("exp_motor") or "",
        row.get("PAG") or "",
        row.get("tax:product_cat") or "",
    ]
    text = " | ".join(str(c) for c in candidates)

    # Prioridad especial Id: evita multicontar PNs consolidados en varios motores.
    idv = str(row.get("Id") or row.get("id") or "")
    for engine in ENGINES:
        if engine in idv:
            return engine

    for engine in ENGINES:
        if engine in text:
            return engine

    for short, engine in SHORT_TO_ENGINE.items():
        if short in text:
            return engine

    return "SIN_LIBRO"


def read_milu(paths):
    records = []
    seen_keys = Counter()

    for path in paths:
        path = Path(path)
        delimiter = sniff_delimiter(path)
        with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            if not reader.fieldnames:
                continue

            # Buscar columna PN.
            lowered = {c.lower(): c for c in reader.fieldnames}
            pn_col = (
                lowered.get("pn")
                or lowered.get("sku")
                or lowered.get("part_number")
                or lowered.get("partnumber")
            )
            if not pn_col:
                raise ValueError(f"No encuentro columna PN/SKU en {path}")

            for row in reader:
                pn = norm_pn(row.get(pn_col))
                if not pn:
                    continue

                kind = detect_kind(path, row)
                engine = detect_engine(row)
                origin = detect_origin(row)
                raw_id = row.get("Id") or row.get("id") or ""

                key = (pn, kind)
                seen_keys[key] += 1

                records.append({
                    "pn": pn,
                    "kind": kind,
                    "engine": engine,
                    "origin": origin,
                    "source_file": path.name,
                    "id": raw_id,
                    "designation": row.get("designation") or row.get("post_title") or "",
                    "raw": row,
                })

    return records


def read_wordpress(path):
    path = Path(path)
    delimiter = sniff_delimiter(path)
    wp = {}
    duplicate_counter = Counter()

    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        if not reader.fieldnames:
            return wp, duplicate_counter

        lowered = {c.lower(): c for c in reader.fieldnames}
        sku_col = lowered.get("sku") or lowered.get("pn") or lowered.get("post_name")
        if not sku_col:
            raise ValueError(f"No encuentro columna sku en {path}")

        for row in reader:
            sku = norm_pn(row.get(sku_col))
            if not sku:
                continue
            duplicate_counter[sku] += 1
            if sku not in wp:
                wp[sku] = {
                    "sku": sku,
                    "post_title": row.get("post_title", ""),
                    "post_status": row.get("post_status", ""),
                    "product_cat": row.get("tax:product_cat", ""),
                    "product_page_url": row.get("product_page_url", ""),
                }

    return wp, duplicate_counter


def write_csv(path, rows, fieldnames):
    path = Path(path)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wp", required=True, help="CSV exportado desde WordPress/WooCommerce")
    parser.add_argument("--milu", nargs="+", required=True, help="Uno o varios CSV de exportación MILU")
    parser.add_argument("--out-dir", default="milu_audit_wp", help="Carpeta de salida")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    milu_records = read_milu(args.milu)
    wp_by_sku, wp_dup_counter = read_wordpress(args.wp)
    milu_by_pn = defaultdict(list)
    for rec in milu_records:
        milu_by_pn[rec["pn"]].append(rec)

    rows_by_book = []
    books = ENGINES + sorted({r["engine"] for r in milu_records if r["engine"] not in ENGINES})

    for book in books:
        subset = [r for r in milu_records if r["engine"] == book]
        if not subset:
            continue

        total = len(subset)
        new_total = sum(1 for r in subset if r["kind"] == "New")
        superseded_total = sum(1 for r in subset if r["kind"] == "Superseded")
        pdf_real = sum(1 for r in subset if r["origin"] == "PDF real")
        synthetic = sum(1 for r in subset if r["origin"] == "Sintético MILU")
        not_informed = sum(1 for r in subset if r["origin"] == "No informado")
        found = sum(1 for r in subset if r["pn"] in wp_by_sku)
        missing = total - found
        coverage = (found / total * 100) if total else 0

        rows_by_book.append({
            "Libro": book,
            "Total MILU": total,
            "New": new_total,
            "Superseded": superseded_total,
            "PDF reales": pdf_real,
            "Sintéticos MILU": synthetic,
            "Origen no informado": not_informed,
            "En WordPress": found,
            "No localizados en export WP": missing,
            "Cobertura %": round(coverage, 2),
        })

    total_milu = len(milu_records)
    found_total = sum(1 for r in milu_records if r["pn"] in wp_by_sku)
    missing_total = total_milu - found_total

    rows_by_book.append({
        "Libro": "TOTAL",
        "Total MILU": total_milu,
        "New": sum(1 for r in milu_records if r["kind"] == "New"),
        "Superseded": sum(1 for r in milu_records if r["kind"] == "Superseded"),
        "PDF reales": sum(1 for r in milu_records if r["origin"] == "PDF real"),
        "Sintéticos MILU": sum(1 for r in milu_records if r["origin"] == "Sintético MILU"),
        "Origen no informado": sum(1 for r in milu_records if r["origin"] == "No informado"),
        "En WordPress": found_total,
        "No localizados en export WP": missing_total,
        "Cobertura %": round(found_total / total_milu * 100, 2) if total_milu else 0,
    })

    missing_rows = []
    for r in milu_records:
        if r["pn"] not in wp_by_sku:
            missing_rows.append({
                "pn": r["pn"],
                "kind": r["kind"],
                "engine": r["engine"],
                "origin": r["origin"],
                "id": r["id"],
                "designation": r["designation"],
                "source_file": r["source_file"],
            })

    milu_pns = set(milu_by_pn.keys())
    only_wp_rows = []
    for sku, info in sorted(wp_by_sku.items()):
        if sku not in milu_pns:
            only_wp_rows.append({
                "sku": sku,
                "post_title": info["post_title"],
                "post_status": info["post_status"],
                "product_cat": info["product_cat"],
                "product_page_url": info["product_page_url"],
            })

    write_csv(
        out_dir / "milu_comparacion_por_libro.csv",
        rows_by_book,
        ["Libro", "Total MILU", "New", "Superseded", "PDF reales", "Sintéticos MILU",
         "Origen no informado", "En WordPress", "No localizados en export WP", "Cobertura %"]
    )
    write_csv(
        out_dir / "milu_no_localizados_en_wordpress.csv",
        missing_rows,
        ["pn", "kind", "engine", "origin", "id", "designation", "source_file"]
    )
    write_csv(
        out_dir / "milu_solo_wordpress.csv",
        only_wp_rows,
        ["sku", "post_title", "post_status", "product_cat", "product_page_url"]
    )

    md = []
    md.append("# Comparativa MILU vs WordPress por libro\n")
    md.append("## Resumen general\n")
    md.append(f"- CSV MILU procesados: {len(args.milu)}")
    md.append(f"- Registros MILU: {total_milu}")
    md.append(f"- PN únicos MILU: {len(milu_pns)}")
    md.append(f"- SKU únicos WordPress: {len(wp_by_sku)}")
    md.append(f"- Encontrados en WordPress: {found_total}")
    md.append(f"- No localizados en export WP: {missing_total}")
    md.append(f"- Cobertura: {round(found_total / total_milu * 100, 2) if total_milu else 0}%")
    md.append(f"- Solo en WordPress: {len(only_wp_rows)}\n")
    md.append("## Por libro\n")
    headers = ["Libro", "Total MILU", "New", "Superseded", "En WordPress", "No localizados en export WP", "Cobertura %"]
    md.append("| " + " | ".join(headers) + " |")
    md.append("|" + "|".join(["---"] + ["---:"] * (len(headers)-1)) + "|")
    for row in rows_by_book:
        md.append("| " + " | ".join(str(row[h]) for h in headers) + " |")

    (out_dir / "milu_comparacion_wordpress_por_libro.md").write_text("\n".join(md), encoding="utf-8")

    print("OK")
    print(f"Salida: {out_dir}")
    print(f"- milu_comparacion_por_libro.csv")
    print(f"- milu_no_localizados_en_wordpress.csv")
    print(f"- milu_solo_wordpress.csv")
    print(f"- milu_comparacion_wordpress_por_libro.md")


if __name__ == "__main__":
    main()
