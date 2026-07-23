#!/usr/bin/env python3
import json
import re
import sys
import zipfile
from io import BytesIO
from html import escape


MAX_SHEET_NAME = 31


def repair_mojibake(value):
    text = str(value if value is not None else "")
    if any(marker in text for marker in ("Ã", "Â", "â", "�")):
        try:
            text = text.encode("cp1252", errors="ignore").decode("utf-8", errors="ignore")
        except Exception:
            pass
    return (
        text
        .replace("â‚¬", "€")
        .replace("â,¬", "€")
        .replace("â¬", "€")
        .replace("Â·", "·")
        .replace("Âº", "º")
        .replace("Âª", "ª")
        .replace("�", "")
    )


def clean(value):
    return re.sub(r"\s+", " ", repair_mojibake(value)).strip()


def format_amount(value, suffix="EUR"):
    text = clean(value)
    if not text:
        return ""
    text = text.replace("€", "EUR").replace("  ", " ")
    if re.search(r"\b(EUR|USD|GBP)\b", text, re.I):
        return text
    try:
        number = float(str(value).replace(",", "."))
        formatted = f"{number:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return f"{formatted} {suffix}".strip()
    except Exception:
        return text


def find_group_value(groups, section, labels, fallback=""):
    labels_normalized = {clean(label).lower() for label in labels}
    for field in groups.get(section, []):
        if clean(field.get("label")).lower() in labels_normalized:
            return clean(field.get("value"))
    return clean(fallback)


def safe_sheet_name(name, used):
    base = re.sub(r"[\[\]:*?/\\]", " ", clean(name) or "Hoja").strip()[:MAX_SHEET_NAME]
    if not base:
        base = "Hoja"
    candidate = base
    index = 2
    while candidate.lower() in used:
        suffix = f" {index}"
        candidate = f"{base[:MAX_SHEET_NAME - len(suffix)]}{suffix}"
        index += 1
    used.add(candidate.lower())
    return candidate


def column_name(index):
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def cell_ref(row, col):
    return f"{column_name(col)}{row}"


def xml_text(value):
    return escape(str(value if value is not None else ""), quote=False)


def sheet_xml(rows, merges=None, hyperlinks=None, widths=None):
    merges = merges or []
    hyperlinks = hyperlinks or []
    widths = widths or []
    max_col = max([len(row) for row in rows] + [1])
    if not widths:
        widths = [18] * max_col

    cols = "".join(
        f'<col min="{index}" max="{index}" width="{width}" customWidth="1"/>'
        for index, width in enumerate(widths, start=1)
    )
    body = []
    for row_index, row in enumerate(rows, start=1):
        height = row[0].get("height") if row and isinstance(row[0], dict) else None
        row_attrs = f' r="{row_index}"'
        if height:
            row_attrs += f' ht="{height}" customHeight="1"'
        cells = []
        for col_index, cell in enumerate(row, start=1):
            if cell is None:
                continue
            value = cell.get("value", "") if isinstance(cell, dict) else cell
            style = cell.get("style", 0) if isinstance(cell, dict) else 0
            ref = cell_ref(row_index, col_index)
            cells.append(
                f'<c r="{ref}" s="{style}" t="inlineStr"><is><t>{xml_text(value)}</t></is></c>'
            )
        body.append(f"<row{row_attrs}>{''.join(cells)}</row>")

    merge_xml = ""
    if merges:
        merge_xml = f'<mergeCells count="{len(merges)}">{"".join(f"<mergeCell ref=\"{ref}\"/>" for ref in merges)}</mergeCells>'

    hyperlink_xml = ""
    if hyperlinks:
        hyperlink_xml = "<hyperlinks>" + "".join(
            f'<hyperlink ref="{escape(link["ref"])}" location="{escape(link["location"])}" display="{escape(link["display"])}"/>'
            for link in hyperlinks
        ) + "</hyperlinks>"

    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>
  <cols>{cols}</cols>
  <sheetData>{''.join(body)}</sheetData>
  {merge_xml}
  {hyperlink_xml}
</worksheet>'''


def styles_xml():
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="6">
    <font><sz val="11"/><color rgb="FF0F172A"/><name val="Aptos"/></font>
    <font><b/><sz val="26"/><color rgb="FF0F172A"/><name val="Aptos Display"/></font>
    <font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FF2563EB"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FF475569"/><name val="Aptos"/></font>
    <font><b/><sz val="16"/><color rgb="FF0F172A"/><name val="Aptos Display"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE0F2FE"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFDDE7F3"/></left>
      <right style="thin"><color rgb="FFDDE7F3"/></right>
      <top style="thin"><color rgb="FFDDE7F3"/></top>
      <bottom style="thin"><color rgb="FFDDE7F3"/></bottom>
      <diagonal/>
    </border>
    <border>
      <bottom style="medium"><color rgb="FF2563EB"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyFont="1"/>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyFont="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="0" fontId="5" fillId="5" borderId="2" xfId="0" applyFill="1" applyBorder="1" applyFont="1"/>
    <xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>'''


def make_cell(value, style=0, height=None):
    cell = {"value": value, "style": style}
    if height:
        cell["height"] = height
    return cell


def grouped_fields(invoice):
    groups = {}
    for field in invoice.get("fields") or []:
        section = clean(field.get("section")) or "Otros"
        label = clean(field.get("label"))
        value = clean(field.get("value"))
        if not label or not value:
            continue
        groups.setdefault(section, [])
        key = (label.lower(), value.lower())
        if key not in {(clean(item.get("label")).lower(), clean(item.get("value")).lower()) for item in groups[section]}:
            groups[section].append({"label": label, "value": value})
    return groups


def add_sheet(sheets, name, rows, merges=None, hyperlinks=None, widths=None):
    sheets.append({
        "name": name,
        "xml": sheet_xml(rows, merges=merges, hyperlinks=hyperlinks, widths=widths),
    })


def invoice_from_record(record):
    if not isinstance(record, dict):
        return {}, {}
    invoice = record.get("invoice")
    if isinstance(invoice, dict):
        return invoice, record
    return record, record


def first_clean(*values):
    for value in values:
        text = clean(value)
        if text:
            return text
    return ""


def invoice_summary(record):
    invoice, source = invoice_from_record(record)
    groups = grouped_fields(invoice)
    supplier = invoice.get("supplier") or {}
    customer = invoice.get("customer") or {}
    amounts = invoice.get("amounts") or {}
    payment = invoice.get("payment") or {}
    line_items = invoice.get("lineItems") or []

    subtotal = format_amount(first_clean(
        amounts.get("subtotal"),
        find_group_value(groups, "Importes", ["Subtotal"]),
    ))
    tax = format_amount(first_clean(
        amounts.get("tax"),
        amounts.get("iva"),
        amounts.get("taxes"),
        find_group_value(groups, "Importes", ["IVA / impuestos", "IVA", "Impuestos"]),
    ))
    total = format_amount(first_clean(
        amounts.get("total"),
        find_group_value(groups, "Importes", ["Total"]),
    ))

    return {
        "number": first_clean(invoice.get("invoiceNumber"), invoice.get("number"), source.get("name"), source.get("id")),
        "fileName": first_clean(source.get("fileName"), invoice.get("fileName")),
        "date": first_clean(invoice.get("date"), find_group_value(groups, "Factura", ["Fecha", "Data"])),
        "dueDate": first_clean(invoice.get("dueDate"), find_group_value(groups, "Factura", ["Vencimiento", "Vence"])),
        "customer": first_clean(customer.get("name"), find_group_value(groups, "Cliente", ["Nombre"])),
        "supplier": first_clean(supplier.get("name"), find_group_value(groups, "Emisor", ["Nombre"])),
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
        "iban": first_clean(payment.get("iban"), find_group_value(groups, "Pago", ["IBAN", "Cuenta de pago"])),
        "lineCount": len(line_items),
        "lineItems": line_items,
    }


def build_invoice_batch_workbook(payload, records):
    project = payload.get("project") or {}
    used_names = set()
    sheets = []
    project_name = clean(project.get("name")) or "Proyecto"

    summary_rows = [
        [make_cell("Facturas importadas", 1), None, None, None, None, None, None, None, None, None],
        [make_cell(project_name, 4), None, None, None, None, None, None, None, None, None],
        [make_cell("", 0, 10), None, None, None, None, None, None, None, None, None],
        [
            make_cell("Factura", 3),
            make_cell("Fecha", 3),
            make_cell("Vencimiento", 3),
            make_cell("Cliente", 3),
            make_cell("Emisor", 3),
            make_cell("Subtotal", 3),
            make_cell("IVA", 3),
            make_cell("Total", 3),
            make_cell("IBAN", 3),
            make_cell("Lineas", 3),
        ],
    ]
    line_rows = [
        [make_cell("Lineas de factura", 1), None, None, None, None, None, None],
        [make_cell(project_name, 4), None, None, None, None, None, None],
        [make_cell("", 0, 10), None, None, None, None, None, None],
        [
            make_cell("Factura", 3),
            make_cell("Linea", 3),
            make_cell("Descripcion", 3),
            make_cell("Cantidad", 3),
            make_cell("Unidad", 3),
            make_cell("Precio ud.", 3),
            make_cell("Total", 3),
        ],
    ]

    for record in records:
        summary = invoice_summary(record)
        invoice_number = summary["number"] or "-"
        summary_rows.append([
            make_cell(invoice_number, 5),
            make_cell(summary["date"] or "-", 5),
            make_cell(summary["dueDate"] or "-", 5),
            make_cell(summary["customer"] or "-", 5),
            make_cell(summary["supplier"] or "-", 5),
            make_cell(summary["subtotal"] or "-", 5),
            make_cell(summary["tax"] or "-", 5),
            make_cell(summary["total"] or "-", 5),
            make_cell(summary["iban"] or "-", 5),
            make_cell(summary["lineCount"], 5),
        ])

        if summary["lineItems"]:
            for index, item in enumerate(summary["lineItems"], start=1):
                line_rows.append([
                    make_cell(invoice_number, 5),
                    make_cell(index, 5),
                    make_cell(clean(item.get("description")) or "-", 5),
                    make_cell(clean(item.get("quantity")) or "-", 5),
                    make_cell(clean(item.get("unit")) or "-", 5),
                    make_cell(clean(item.get("unitPrice")) or "-", 5),
                    make_cell(clean(item.get("total")) or "-", 5),
                ])
        else:
            line_rows.append([
                make_cell(invoice_number, 5),
                make_cell("-", 5),
                make_cell("Sin lineas detectadas", 5),
                make_cell("-", 5),
                make_cell("-", 5),
                make_cell("-", 5),
                make_cell("-", 5),
            ])

    add_sheet(
        sheets,
        safe_sheet_name("Facturas", used_names),
        summary_rows,
        merges=["A1:J1", "A2:J2"],
        widths=[22, 16, 16, 34, 34, 18, 18, 18, 34, 12],
    )
    add_sheet(
        sheets,
        safe_sheet_name("Lineas", used_names),
        line_rows,
        merges=["A1:F1", "A2:F2"],
        widths=[22, 10, 70, 16, 18, 18],
    )
    return sheets


def build_workbook(payload):
    invoices = payload.get("invoices") or []
    if invoices and not payload.get("invoice"):
        return build_invoice_batch_workbook(payload, invoices)

    invoice = payload.get("invoice") or {}
    project = payload.get("project") or {}
    file_name = clean(payload.get("fileName") or invoice.get("fileName") or "factura.pdf")
    supplier = invoice.get("supplier") or {}
    customer = invoice.get("customer") or {}
    amounts = invoice.get("amounts") or {}
    groups = grouped_fields(invoice)
    used_names = set()
    sheets = []

    cover_name = safe_sheet_name("Facturas", used_names)
    section_sheet_names = {}
    for section in groups:
        section_sheet_names[section] = safe_sheet_name(section, used_names)
    if invoice.get("lineItems"):
        section_sheet_names["Lineas"] = safe_sheet_name("Lineas", used_names)

    company = clean(supplier.get("name")) or clean(customer.get("name")) or clean(project.get("name")) or "Empresa"
    title = "Facturas"
    invoice_number = clean(invoice.get("invoiceNumber"))
    invoice_date = clean(invoice.get("date"))
    due_date = clean(invoice.get("dueDate"))
    subtotal = format_amount(find_group_value(groups, "Importes", ["Subtotal"], amounts.get("subtotal")))
    tax = format_amount(find_group_value(groups, "Importes", ["IVA / impuestos", "Impuestos"], amounts.get("tax")))
    total = format_amount(find_group_value(groups, "Importes", ["Total"], amounts.get("total")))
    subtitle = f"{company} - {invoice_number or file_name}"

    cover_rows = [
        [make_cell("", 0, 10), None, None, None, None],
        [make_cell("ALENTIO ATLAS", 3), None, None, None, None],
        [make_cell(title, 1, 44), None, None, None, None],
        [make_cell(subtitle, 4, 25), None, None, None, None],
        [make_cell("", 0, 12), None, None, None, None],
        [make_cell("FACTURA", 3), make_cell("FECHA", 3), make_cell("TOTAL", 3), make_cell("EMISOR", 3), make_cell("CLIENTE", 3)],
        [
            make_cell(invoice_number or "-", 5, 38),
            make_cell(invoice_date or "-", 5),
            make_cell(total or "-", 5),
            make_cell(clean(supplier.get("name")) or "-", 5),
            make_cell(clean(customer.get("name")) or "-", 5),
        ],
        [make_cell("", 0, 12), None, None, None, None],
        [make_cell("Resumen del documento", 6), None, None, None, None],
        [make_cell("Archivo", 4), make_cell(file_name, 5), make_cell("Proyecto", 4), make_cell(clean(project.get("name")), 5), None],
        [make_cell("Subtotal", 4), make_cell(subtotal or "-", 5), make_cell("IVA / impuestos", 4), make_cell(tax or "-", 5), None],
        [make_cell("Total", 4), make_cell(total or "-", 5), make_cell("Vencimiento", 4), make_cell(due_date or "-", 5), None],
        [make_cell("", 0, 12), None, None, None, None],
        [make_cell("Tarjetas detectadas", 6), None, None, None, None],
        [make_cell("Seccion", 3), make_cell("Abrir", 3), make_cell("Contenido", 3), None, None],
    ]
    cover_merges = [
        "A2:E2",
        "A3:E3",
        "A4:E4",
        "A9:E9",
        "B10:E10",
        "B11:E11",
        "B12:E12",
        "A14:E14",
        "C15:E15",
    ]
    cover_links = []
    row_index = 16
    for section, sheet_name in section_sheet_names.items():
        if section == "Lineas":
            count = f"{len(invoice.get('lineItems') or [])} lineas"
        elif section == "Extraccion":
            count = "Informe tecnico"
        else:
            count = f"{len(groups.get(section, []))} campos"
        cover_rows.append([
            make_cell(section, 2, 24),
            make_cell(f"Ir a {section}", 7),
            make_cell(count, 5),
            None,
            None,
        ])
        cover_merges.append(f"C{row_index}:E{row_index}")
        cover_links.append({"ref": f"B{row_index}", "location": f"'{sheet_name}'!A1", "display": f"Ir a {section}"})
        row_index += 1
    add_sheet(sheets, cover_name, cover_rows, merges=cover_merges, hyperlinks=cover_links, widths=[22, 22, 22, 36, 36])

    for section, fields in groups.items():
        rows = [
            [make_cell(section, 1), None],
            [make_cell("Campo", 3), make_cell("Valor", 3)],
        ]
        for field in fields:
            rows.append([make_cell(field["label"], 4), make_cell(field["value"], 5)])
        add_sheet(sheets, section_sheet_names[section], rows, merges=["A1:B1"], widths=[26, 72])

    line_items = invoice.get("lineItems") or []
    if line_items:
        rows = [
            [make_cell("Lineas detectadas", 1), None, None, None, None],
            [make_cell("Descripcion", 3), make_cell("Cantidad", 3), make_cell("Unidad", 3), make_cell("Precio ud.", 3), make_cell("Total", 3)],
        ]
        for item in line_items:
            rows.append([
                make_cell(clean(item.get("description")), 5),
                make_cell(clean(item.get("quantity")), 5),
                make_cell(clean(item.get("unit")), 5),
                make_cell(clean(item.get("unitPrice")), 5),
                make_cell(clean(item.get("total")), 5),
            ])
        add_sheet(sheets, section_sheet_names["Lineas"], rows, merges=["A1:E1"], widths=[64, 16, 14, 18, 18])

    return sheets


def build_xlsx(payload):
    sheets = build_workbook(payload)
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml(len(sheets)))
        zf.writestr("_rels/.rels", root_rels_xml())
        zf.writestr("xl/workbook.xml", workbook_xml(sheets))
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml(len(sheets)))
        zf.writestr("xl/styles.xml", styles_xml())
        for index, sheet in enumerate(sheets, start=1):
            zf.writestr(f"xl/worksheets/sheet{index}.xml", sheet["xml"])
    return buffer.getvalue()


def content_types_xml(sheet_count):
    sheets = "".join(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index in range(1, sheet_count + 1)
    )
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  {sheets}
</Types>'''


def root_rels_xml():
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''


def workbook_xml(sheets):
    entries = "".join(
        f'<sheet name="{escape(sheet["name"])}" sheetId="{index}" r:id="rId{index}"/>'
        for index, sheet in enumerate(sheets, start=1)
    )
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>{entries}</sheets>
</workbook>'''


def workbook_rels_xml(sheet_count):
    entries = "".join(
        f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        for index in range(1, sheet_count + 1)
    )
    style_id = sheet_count + 1
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {entries}
  <Relationship Id="rId{style_id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    sys.stdout.buffer.write(build_xlsx(payload))


if __name__ == "__main__":
    main()
