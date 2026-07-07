#!/usr/bin/env python3
"""
Auditoría MILU vs export de WordPress.

Uso:
  python milu_audit_wordpress_vs_milu.py \
    --new milu_wp_new_import.csv \
    --superseded milu_wp_superseded_import.csv \
    --wordpress product-export.csv \
    --out audit_wp

Genera:
  - milu_comparacion_por_libro.csv
  - milu_no_localizados_en_wordpress.csv
  - milu_solo_wordpress.csv
  - milu_resumen_auditoria.md
  - milu_comparacion_wordpress_por_libro.xlsx  (si hay soporte xlsx interno)
"""
from __future__ import annotations
import argparse, csv, os, re, zipfile, html
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

BOOKS = [
    "12V4000M40A", "12V4000M53", "12V4000M70",
    "16V4000M61", "16V4000M73L", "16V4000M73", "16V4000M90",
    "20V4000M93L", "20V4000M93",
]
DISPLAY_BOOKS = [
    "12V4000M40A", "12V4000M53", "12V4000M70",
    "16V4000M61", "16V4000M73", "16V4000M73L", "16V4000M90",
    "20V4000M93", "20V4000M93L",
]

def norm_pn(value: str | None) -> str:
    s = (value or "").strip().upper()
    s = re.sub(r"\s+", "", s)
    return s.replace("/", "-")

def read_csv_auto(path: str | Path) -> list[dict[str, str]]:
    path = Path(path)
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        sample = f.read(4096)
        f.seek(0)
        delimiter = ";" if sample.count(";") > sample.count(",") else ","
        return list(csv.DictReader(f, delimiter=delimiter))

def get_field(row: dict[str, str], *names: str) -> str:
    lower = {k.lower(): k for k in row.keys()}
    for name in names:
        key = lower.get(name.lower())
        if key is not None:
            return row.get(key, "") or ""
    return ""

def detect_book(row: dict[str, str]) -> str:
    haystack = " | ".join([
        get_field(row, "exp_motor"), get_field(row, "PAG"), get_field(row, "Id"), get_field(row, "sku"), get_field(row, "post_title"),
    ])
    for book in BOOKS:  # L antes que no-L para no confundir 16V4000M73L con 16V4000M73
        if book in haystack:
            return book
    return "SIN_LIBRO"

def load_milu_rows(new_path: str, superseded_path: str) -> list[dict[str, str]]:
    rows = []
    for kind, path in [("New", new_path), ("Superseded", superseded_path)]:
        for row in read_csv_auto(path):
            pn = get_field(row, "pn", "sku")
            row2 = dict(row)
            row2["_tipo"] = kind
            row2["_pn"] = pn
            row2["_pn_norm"] = norm_pn(pn)
            row2["_libro"] = detect_book(row)
            rows.append(row2)
    return rows

def load_wp_rows(wp_path: str) -> list[dict[str, str]]:
    rows = []
    for row in read_csv_auto(wp_path):
        sku = get_field(row, "sku", "SKU")
        row2 = dict(row)
        row2["_sku"] = sku
        row2["_sku_norm"] = norm_pn(sku)
        rows.append(row2)
    return rows

def write_csv(path: Path, rows: list[dict[str, object]], headers: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=headers)
        w.writeheader()
        for r in rows:
            w.writerow({h: r.get(h, "") for h in headers})

def col_name(n: int) -> str:
    s = ""
    while n:
        n, rem = divmod(n - 1, 26)
        s = chr(65 + rem) + s
    return s

def make_minimal_xlsx(path: Path, sheets: dict[str, list[list[object]]]) -> None:
    # XLSX básico creado con librería estándar. Suficiente para tablas simples.
    def cell_xml(r: int, c: int, value: object) -> str:
        ref = f"{col_name(c)}{r}"
        if value is None:
            return f'<c r="{ref}"/>'
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return f'<c r="{ref}"><v>{value}</v></c>'
        text = html.escape(str(value), quote=False)
        return f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>'
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
''' + "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, len(sheets)+1)) + "</Types>")
        z.writestr("_rels/.rels", '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>''')
        z.writestr("xl/_rels/workbook.xml.rels", '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
''' + "".join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, len(sheets)+1)) + f'<Relationship Id="rId{len(sheets)+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        z.writestr("xl/workbook.xml", '''<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
''' + "".join(f'<sheet name="{html.escape(name[:31])}" sheetId="{i}" r:id="rId{i}"/>' for i, name in enumerate(sheets, 1)) + "</sheets></workbook>")
        z.writestr("xl/styles.xml", '''<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>''')
        for i, (name, data) in enumerate(sheets.items(), 1):
            rows_xml = []
            for r_idx, row in enumerate(data, 1):
                cells = "".join(cell_xml(r_idx, c_idx, v) for c_idx, v in enumerate(row, 1))
                rows_xml.append(f'<row r="{r_idx}">{cells}</row>')
            z.writestr(f"xl/worksheets/sheet{i}.xml", '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + "".join(rows_xml) + '</sheetData></worksheet>')

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--new", required=True)
    ap.add_argument("--superseded", required=True)
    ap.add_argument("--wordpress", required=True)
    ap.add_argument("--out", default="audit_wp")
    args = ap.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)

    milu = load_milu_rows(args.new, args.superseded)
    wp = load_wp_rows(args.wordpress)
    wp_skus = {r["_sku_norm"] for r in wp if r.get("_sku_norm")}
    milu_skus = {r["_pn_norm"] for r in milu if r.get("_pn_norm")}

    counts = defaultdict(Counter)
    missing = []
    for r in milu:
        b = r["_libro"]
        found = r["_pn_norm"] in wp_skus
        counts[b][r["_tipo"]] += 1
        counts[b]["Total MILU"] += 1
        counts[b]["En WordPress"] += int(found)
        counts[b]["No localizados"] += int(not found)
        if not found:
            missing.append({
                "tipo": r["_tipo"], "libro": b, "pn": r["_pn"], "pn_normalizado": r["_pn_norm"],
                "designation": get_field(r, "designation"), "new_pn_relacionado": get_field(r, "new_pn_relacionado"),
                "PAG": get_field(r, "PAG"), "Id": get_field(r, "Id"),
            })

    comparativa = []
    total = Counter()
    for b in DISPLAY_BOOKS + (["SIN_LIBRO"] if "SIN_LIBRO" in counts else []):
        c = counts[b]
        if not c: continue
        coverage = round((c["En WordPress"] / c["Total MILU"] * 100), 2) if c["Total MILU"] else 0
        row = {
            "Libro": b, "New": c["New"], "Superseded": c["Superseded"], "Total MILU": c["Total MILU"],
            "En WordPress": c["En WordPress"], "No localizados": c["No localizados"], "Cobertura %": coverage,
        }
        comparativa.append(row)
        total.update(c)
    comparativa.append({
        "Libro": "TOTAL", "New": total["New"], "Superseded": total["Superseded"], "Total MILU": total["Total MILU"],
        "En WordPress": total["En WordPress"], "No localizados": total["No localizados"],
        "Cobertura %": round(total["En WordPress"] / total["Total MILU"] * 100, 2) if total["Total MILU"] else 0,
    })

    solo_wp = []
    for r in wp:
        sku_norm = r.get("_sku_norm")
        if sku_norm and sku_norm not in milu_skus:
            solo_wp.append({
                "sku": get_field(r, "sku"), "sku_normalizado": sku_norm, "post_title": get_field(r, "post_title"),
                "post_status": get_field(r, "post_status"), "ID": get_field(r, "ID"),
            })

    write_csv(out / "milu_comparacion_por_libro.csv", comparativa, ["Libro", "New", "Superseded", "Total MILU", "En WordPress", "No localizados", "Cobertura %"])
    write_csv(out / "milu_no_localizados_en_wordpress.csv", missing, ["tipo", "libro", "pn", "pn_normalizado", "designation", "new_pn_relacionado", "PAG", "Id"])
    write_csv(out / "milu_solo_wordpress.csv", solo_wp, ["sku", "sku_normalizado", "post_title", "post_status", "ID"])

    md = []
    md.append(f"# Auditoría MILU vs WordPress\n")
    md.append(f"Generado: {datetime.now().isoformat(timespec='seconds')}\n")
    md.append("## Resumen\n")
    md.append(f"- New MILU: {total['New']}\n- Superseded MILU: {total['Superseded']}\n- Total MILU: {total['Total MILU']}\n- Encontrados en WordPress: {total['En WordPress']}\n- No localizados: {total['No localizados']}\n- Cobertura: {comparativa[-1]['Cobertura %']}%\n- Solo en WordPress: {len(solo_wp)}\n")
    md.append("\n## Comparativa por libro\n")
    md.append("| Libro | New | Superseded | Total MILU | En WordPress | No localizados | Cobertura % |\n")
    md.append("|---|---:|---:|---:|---:|---:|---:|\n")
    for r in comparativa:
        md.append(f"| {r['Libro']} | {r['New']} | {r['Superseded']} | {r['Total MILU']} | {r['En WordPress']} | {r['No localizados']} | {r['Cobertura %']} |\n")
    (out / "milu_resumen_auditoria.md").write_text("".join(md), encoding="utf-8")

    xlsx_sheets = {
        "Resumen": [["Métrica", "Valor"], ["New MILU", total["New"]], ["Superseded MILU", total["Superseded"]], ["Total MILU", total["Total MILU"]], ["Encontrados en WordPress", total["En WordPress"]], ["No localizados", total["No localizados"]], ["Cobertura %", comparativa[-1]["Cobertura %"]], ["Solo en WordPress", len(solo_wp)]],
        "Comparativa por libro": [["Libro", "New", "Superseded", "Total MILU", "En WordPress", "No localizados", "Cobertura %"]] + [[r["Libro"], r["New"], r["Superseded"], r["Total MILU"], r["En WordPress"], r["No localizados"], r["Cobertura %"]] for r in comparativa],
        "No localizados": [["tipo", "libro", "pn", "pn_normalizado", "designation", "new_pn_relacionado", "PAG", "Id"]] + [[r.get(k, "") for k in ["tipo", "libro", "pn", "pn_normalizado", "designation", "new_pn_relacionado", "PAG", "Id"]] for r in missing[:50000]],
        "Solo WordPress": [["sku", "sku_normalizado", "post_title", "post_status", "ID"]] + [[r.get(k, "") for k in ["sku", "sku_normalizado", "post_title", "post_status", "ID"]] for r in solo_wp[:50000]],
    }
    make_minimal_xlsx(out / "milu_comparacion_wordpress_por_libro.xlsx", xlsx_sheets)
    print(f"OK. Auditoría generada en: {out}")
    print(f"Total MILU={total['Total MILU']} | En WordPress={total['En WordPress']} | No localizados={total['No localizados']} | Cobertura={comparativa[-1]['Cobertura %']}% | Solo WP={len(solo_wp)}")

if __name__ == "__main__":
    main()
