#!/usr/bin/env python3
import argparse
import csv
import importlib.util
import io
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from pathlib import Path
from tempfile import TemporaryDirectory


EURO_TOKEN_RE = r"(?:EUR|EUROS?|\u20ac|€|â‚¬|�)"
CURRENCY_TOKEN_RE = rf"(?:{EURO_TOKEN_RE}|USD|US\$|\$|DOLLARS?)"
MONEY_NUMBER_PATTERN = (
    r"-?(?:"
    r"\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?"
    r"|"
    r"\d+(?:[.,]\d{1,2})?"
    r")"
)

MONEY_RE = re.compile(
    rf"(?<![\w\d])"
    rf"(?:{CURRENCY_TOKEN_RE}\s*)?"
    rf"({MONEY_NUMBER_PATTERN})"
    rf"(?:\s*{CURRENCY_TOKEN_RE})?"
    rf"(?![\w\d])",
    re.I,
)
MONTH_NAMES = (
    r"enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|"
    r"gener|febrer|mar[cç]|abril|maig|juny|juliol|agost|setembre|octubre|novembre|desembre|"
    r"january|february|march|april|may|june|july|august|september|october|november|december|"
    r"januar|februar|m[aä]rz|april|mai|juni|juli|august|september|oktober|november|dezember|"
    r"janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre|"
    r"gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|"
    r"janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro"
)
DATE_PATTERN = rf"(?:\d{{1,2}}[./-]\d{{1,2}}[./-]\d{{2,4}}|\d{{4}}[./-]\d{{1,2}}[./-]\d{{1,2}}|\d{{1,2}}\.?(?:\s+de)?\s+(?:{MONTH_NAMES})(?:\s+de|,)?\s+\d{{2,4}}|(?:{MONTH_NAMES})\s+\d{{1,2}}(?:st|nd|rd|th)?[,]?\s+\d{{2,4}}|\d{{4}}年\s*\d{{1,2}}月\s*\d{{1,2}}日?)"
DATE_RE = re.compile(rf"(?<!\w)({DATE_PATTERN})(?!\w)", re.I)
DATE_PLACEHOLDER_RE = re.compile(r"^(?:[dxym]{1,4}[./-]){2}[dxym]{1,4}$", re.I)
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
TAX_ID_RE = re.compile(r"\b(?:NIF|CIF|VAT|IVA|TAX\s*ID|TIN|CNPJ|RFC|USt-IdNr\.?)[:\s-]*([A-Z0-9][A-Z0-9 .-]{5,24})", re.I)
IBAN_RE = re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b")


def clean(value):
    text = str(value or "")
    replacements = {
        "â‚¬": "€",
        "Â€": "€",
        "â‚": "€",
        "Ã¡": "á",
        "Ã©": "é",
        "Ã­": "í",
        "Ã³": "ó",
        "Ãº": "ú",
        "Ã±": "ñ",
        "Ã€": "À",
        "Ã‰": "É",
        "Ã‘": "Ñ",
        "�": "",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return re.sub(r"\s+", " ", text).strip()


def strip_accents(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(char for char in text if not unicodedata.combining(char))


def normalize_key(value):
    return re.sub(r"[^A-Z0-9]+", "", strip_accents(clean(value)).upper())


def normalize_header_key(value):
    """Normaliza encabezados conservando alfabetos CJK, no solo caracteres latinos."""
    return re.sub(r"[^A-Z0-9\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]+", "", strip_accents(clean(value)).upper())


def normalize_label_text(value):
    return re.sub(r"[\s:：#\-–—.]+", "", strip_accents(clean(value)).lower())


def is_latin_text(value):
    return bool(re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]", clean(value)))


def detect_language(text):
    sample = clean(text)[:12000]
    if not sample:
        return {"code": "unknown", "name": LANGUAGE_NAMES["unknown"], "confidence": 0, "engine": "empty"}

    for module_name in ["langdetect", "langid"]:
        try:
            module = __import__(module_name)
            if module_name == "langdetect":
                code = module.detect(sample)
                return {
                    "code": code,
                    "name": LANGUAGE_NAMES.get(code, code.upper()),
                    "confidence": 0.88,
                    "engine": module_name,
                }
            code, score = module.classify(sample)
            return {
                "code": code,
                "name": LANGUAGE_NAMES.get(code, code.upper()),
                "confidence": max(0.55, min(0.95, float(score) if isinstance(score, (int, float)) and score <= 1 else 0.82)),
                "engine": module_name,
            }
        except Exception:
            pass

    script_checks = [
        ("zh", r"[\u4e00-\u9fff]"),
        ("ja", r"[\u3040-\u30ff]"),
        ("ko", r"[\uac00-\ud7af]"),
        ("ar", r"[\u0600-\u06ff]"),
        ("ru", r"[\u0400-\u04ff]"),
    ]
    script_scores = {code: len(re.findall(pattern, sample)) for code, pattern in script_checks}
    script_code, script_count = max(script_scores.items(), key=lambda item: item[1])
    if script_count >= 8:
        return {
            "code": script_code,
            "name": LANGUAGE_NAMES.get(script_code, script_code.upper()),
            "confidence": min(0.92, 0.6 + script_count / max(len(sample), 1)),
            "engine": "script",
        }

    lowered = f" {strip_accents(sample).lower()} "
    keyword_sets = {
        "es": [" factura ", " numero ", " fecha ", " proveedor ", " cliente ", " vencimiento ", " importe ", " mercancia "],
        "en": [" invoice ", " number ", " date ", " supplier ", " customer ", " total ", " due ", " goods "],
        "fr": [" facture ", " numero ", " date ", " fournisseur ", " client ", " total ", " marchandises "],
        "de": [" rechnung ", " nummer ", " datum ", " lieferant ", " kunde ", " gesamt ", " waren "],
        "it": [" fattura ", " numero ", " data ", " fornitore ", " cliente ", " totale ", " merce "],
        "pt": [" fatura ", " numero ", " data ", " fornecedor ", " cliente ", " total ", " mercadoria "],
        "ca": [" factura ", " numero ", " data ", " proveidor ", " client ", " venciment ", " import "],
        "nl": [" factuur ", " nummer ", " datum ", " leverancier ", " klant ", " totaal "],
    }
    scores = {
        code: sum(lowered.count(keyword) for keyword in keywords)
        for code, keywords in keyword_sets.items()
    }
    code, score = max(scores.items(), key=lambda item: item[1])
    if score > 0:
        return {
            "code": code,
            "name": LANGUAGE_NAMES.get(code, code.upper()),
            "confidence": min(0.86, 0.48 + score * 0.08),
            "engine": "keywords",
        }
    return {"code": "unknown", "name": LANGUAGE_NAMES["unknown"], "confidence": 0.25, "engine": "fallback"}


LANGUAGE_NAMES = {
    "es": "Español",
    "en": "Ingles",
    "fr": "Frances",
    "de": "Aleman",
    "it": "Italiano",
    "pt": "Portugues",
    "ca": "Catalan",
    "nl": "Neerlandes",
    "zh": "Chino",
    "ja": "Japones",
    "ko": "Coreano",
    "ar": "Arabe",
    "ru": "Ruso",
    "unknown": "No detectado",
}


FIELD_SECTION_ORDER = [
    "FACTURA",
    "EMISOR",
    "CLIENTE",
    "FISCAL",
    "CONTACTO",
    "PAGO",
    "IMPORTES",
    "MERCANCIA",
    "ADUANAS",
    "COMERCIO",
]


PRIORITY_INVOICE_FIELD_SPECS = [
    {
        "section": "Factura",
        "label": "Numero de factura",
        "canonical": "invoiceNumber",
        "aliases": [
            "Numero de factura", "Número de factura", "Nº factura", "Num. factura",
            "Núm. factura", "Factura no", "Factura numero", "Invoice number",
            "Invoice no", "Invoice #", "No invoice", "Document number",
            "Numéro de facture", "Numero fattura", "Número da fatura",
            "Rechnungsnummer", "Factuurnummer", "发票号码", "发票号", "請求書番号",
            "송장 번호", "رقم الفاتورة", "Номер счета",
        ],
    },
    {
        "section": "Emisor",
        "label": "Proveedor / razon social",
        "canonical": "supplierBusinessName",
        "aliases": [
            "Proveedor", "Razon social", "Razón social", "Nombre proveedor",
            "Empresa proveedora", "Supplier", "Vendor", "Seller", "Exporter",
            "Exportador", "Company name",
            "Fournisseur", "Raison sociale", "Fornitore", "Ragione sociale",
            "Fornecedor", "Razao social", "Lieferant", "Firmenname",
            "Leverancier", "供应商", "卖方", "회사명", "المورد", "Поставщик",
        ],
    },
    {
        "section": "Mercancia",
        "label": "Descripcion de la mercancia",
        "canonical": "goodsDescription",
        "aliases": [
            "Descripcion de la mercancia", "Descripción de la mercancía",
            "Descripcion mercancia", "Mercancia", "Goods description",
            "Description of goods", "Commodity description", "Product description",
            "Description des marchandises", "Descrizione merce",
            "Descricao da mercadoria", "Warenbeschreibung", "商品描述", "货物描述",
            "品名", "상품 설명", "وصف البضاعة", "Описание товара",
        ],
    },
    {
        "section": "Mercancia",
        "label": "Cantidades",
        "canonical": "quantity",
        "aliases": [
            "Cantidades", "Cantidad", "Qty", "Quantity", "Unidades", "Units",
            "Quantite", "Quantité", "Quantita", "Quantidade", "Menge", "Aantal",
            "数量", "個数", "수량", "الكمية", "Количество",
        ],
    },
    {
        "section": "Aduanas",
        "label": "Fraccion arancelaria",
        "canonical": "tariffCode",
        "aliases": [
            "Fraccion arancelaria", "Fracción arancelaria", "Partida arancelaria",
            "Codigo arancelario", "Código arancelario", "HS code", "HS tariff",
            "Tariff code", "Taric", "Commodity code",
            "Code tarifaire", "Code douanier", "Codice doganale",
            "Codigo pautal", "Zolltarifnummer", "HS编码", "海关编码",
            "関税分類", "관세 코드", "رمز التعرفة", "Код ТН ВЭД",
        ],
    },
    {
        "section": "Mercancia",
        "label": "Precios unitarios",
        "canonical": "unitPrice",
        "aliases": [
            "Precios unitarios", "Precio unitario", "Precio ud", "Precio unidad",
            "Unit price", "Unit value", "Price per unit", "Preu", "Precio",
            "Prix unitaire", "Prezzo unitario", "Preco unitario",
            "Einzelpreis", "Unitprijs", "单价", "単価", "단가", "سعر الوحدة",
            "Цена за единицу",
        ],
    },
    {
        "section": "Aduanas",
        "label": "Pais de origen",
        "canonical": "countryOfOrigin",
        "aliases": [
            "Pais de origen", "País de origen", "Origen", "Country of origin",
            "Origin country", "Made in", "Origin",
            "Pays d'origine", "Paese di origine", "Pais de origem",
            "Ursprungsland", "Land van oorsprong", "原产国", "原產地",
            "原産国", "원산지", "بلد المنشأ", "Страна происхождения",
        ],
    },
    {
        "section": "Aduanas",
        "label": "Datos del exportador autorizado",
        "canonical": "authorizedExporter",
        "aliases": [
            "Datos del exportador autorizado", "Exportador autorizado",
            "Authorized exporter", "Approved exporter", "Exporter authorization",
            "Numero de exportador autorizado", "Nº exportador autorizado",
            "Exportateur autorise", "Exportateur autorisé", "Esportatore autorizzato",
            "Exportador autorizado", "Ermachtigter Ausfuhrer",
            "Ermächtigter Ausführer", "授权出口商", "承認輸出者",
            "인증수출자", "المصدر المعتمد", "Уполномоченный экспортер",
        ],
    },
    {
        "section": "Comercio",
        "label": "Incoterm",
        "canonical": "incoterm",
        "aliases": [
            "Incoterm", "Incoterms", "Trade term", "Delivery term", "Terminos de entrega",
            "Conditions de livraison", "Termini di consegna", "Lieferbedingungen",
            "贸易术语", "インコタームズ", "인코텀즈", "شروط التسليم", "Инкотермс",
        ],
    },
    {
        "section": "Aduanas",
        "label": "Unidad de medida",
        "canonical": "tariffUnit",
        "aliases": [
            "Unidad de medida", "Unidad tarifaria", "Unidad de medida tarifaria",
            "Unit of measure", "Measure unit", "Tariff unit", "Customs unit",
            "Unite de mesure", "Unité de mesure", "Unita di misura",
            "Unidade de medida", "Masseinheit", "Maßeinheit", "计量单位",
            "単位", "측정 단위", "وحدة القياس", "Единица измерения",
        ],
    },
    {
        "section": "Aduanas",
        "label": "Valor en aduana",
        "canonical": "customsValue",
        "aliases": [
            "Valor en aduana", "Valores aduanales", "Valor aduanal",
            "Customs value", "Customs valuation", "Value for customs",
            "Valor declarado", "Declared value",
            "Valeur en douane", "Valore doganale", "Valor aduaneiro",
            "Zollwert", "Douanewaarde", "海关价值", "完税价格", "課税価格",
            "관세 가격", "القيمة الجمركية", "Таможенная стоимость",
        ],
    },
]


def parse_amount(value):
    text = clean(value)
    text = re.sub(CURRENCY_TOKEN_RE, "", text, flags=re.I)
    text = text.replace("\u00a0", "").replace(" ", "")
    text = re.sub(r"[^0-9,.\-]", "", text)

    if not text or text in {"-", ".", ","}:
        return None

    negative = text.startswith("-")
    text = text.lstrip("-")

    comma_count = text.count(",")
    dot_count = text.count(".")

    if comma_count and dot_count:
        # El último separador suele ser el separador decimal.
        if text.rfind(",") > text.rfind("."):
            # Europeo: 1.234,56
            text = text.replace(".", "").replace(",", ".")
        else:
            # Inglés/EE. UU.: 1,234.56
            text = text.replace(",", "")

    elif comma_count:
        parts = text.split(",")

        if comma_count > 1:
            # 1,234,567 o 1,234,567,89
            if len(parts[-1]) in {1, 2}:
                text = "".join(parts[:-1]) + "." + parts[-1]
            else:
                text = "".join(parts)
        elif len(parts[-1]) == 3 and len(parts[0]) <= 3:
            # 1,653 normalmente representa miles.
            text = "".join(parts)
        else:
            # 239,00
            text = text.replace(",", ".")

    elif dot_count:
        parts = text.split(".")

        if dot_count > 1:
            # 1.234.567 o 1.234.567.89
            if len(parts[-1]) in {1, 2}:
                text = "".join(parts[:-1]) + "." + parts[-1]
            else:
                text = "".join(parts)
        elif len(parts[-1]) == 3 and len(parts[0]) <= 3:
            # 1.653 normalmente representa miles.
            text = "".join(parts)

    try:
        amount = float(text)
        return round(-amount if negative else amount, 2)
    except (TypeError, ValueError):
        return None


def format_amount(value, currency="EUR"):
    amount = parse_amount(value) if not isinstance(value, (int, float)) else round(float(value), 2)
    if amount is None:
        return clean(value)
    currency = clean(currency) or detect_currency(str(value)) or "EUR"
    text = f"{amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{text} {currency}".strip()


def detect_currency(text):
    text = clean(text)
    usd_count = len(re.findall(r"\bUSD\b|US\$|\$", text, re.I))
    eur_count = len(re.findall(EURO_TOKEN_RE, text, re.I))
    if usd_count > eur_count:
        return "USD"
    if eur_count:
        return "EUR"
    return ""


def normalize_iban(value):
    text = clean(value).upper()
    match = IBAN_RE.search(text)
    if not match:
        return ""
    iban = re.sub(r"[^A-Z0-9]", "", match.group(0))
    return iban if 15 <= len(iban) <= 34 else ""


def normalize_phone(value):
    raw = clean(value)
    if not raw or DATE_RE.search(raw) or MONEY_RE.search(raw):
        return ""
    match = PHONE_RE.search(raw)
    if not match:
        return ""
    phone = match.group(0)
    digits = re.sub(r"\D", "", phone)
    if len(digits) < 9 or len(digits) > 15:
        return ""
    if re.fullmatch(r"\d{1,2}[-.]\d{1,2}[-.]\d{2,4}", phone.strip()):
        return ""
    return f"+{digits}" if phone.strip().startswith("+") else digits


def value_has_currency(value):
    return bool(re.search(CURRENCY_TOKEN_RE, clean(value), re.I))


def extract_clean_date(value):
    text = clean(value)
    for match in DATE_RE.finditer(text):
        candidate = clean(match.group(1))
        if not DATE_PLACEHOLDER_RE.fullmatch(candidate.replace("a", "y")):
            return candidate
    return ""


def find_first_iban(text):
    for match in IBAN_RE.finditer(text or ""):
        iban = normalize_iban(match.group(0))
        if iban:
            return iban
    return ""


def find_first_phone(text):
    for match in PHONE_RE.finditer(text or ""):
        phone = normalize_phone(match.group(0))
        if phone:
            return phone
    return ""


def canonical_label(section, label):
    key = normalize_key(f"{section} {label}")
    section_key = normalize_key(section)
    if section_key == "IMPORTES":
        if any(token in key for token in ["SUBTOTAL", "BASE"]):
            return "subtotal"
        if any(token in key for token in ["IMPUESTOS", "IVA", "VAT", "TAX"]):
            return "tax"
        if "TOTAL" in key:
            return "total"
    checks = [
        ("invoiceNumber", ["NUMFACTURA", "NUMERODEFACTURA", "NUMEROFACTURA", "INVOICENUMBER", "INVOICENO", "FACTURANO"]),
        ("date", ["FECHA", "DATA", "INVOICEDATE"]),
        ("dueDate", ["VENCIMIENTO", "VENCIMENT", "DUEDATE", "PAYMENTDUE"]),
        ("taxId", ["NIF", "CIF", "VAT", "DNI", "TAXID", "IVA"]),
        ("email", ["EMAIL", "EMAIL", "MAIL"]),
        ("phone", ["TELEFONO", "TELEFON", "PHONE", "TEL"]),
        ("iban", ["IBAN"]),
        ("paymentMethod", ["METODOPAGO", "FORMADEPAGO", "FORMADEPAGAMENT", "PAYMENTMETHOD"]),
        ("subtotal", ["SUBTOTAL", "BASEIMPONIBLE", "BASE"]),
        ("tax", ["IMPUESTOS", "IVAIMPUESTOS", "IVA", "VAT", "TAX"]),
        ("total", ["TOTALFACTURA", "GRANDTOTAL", "TOTALDUE", "IMPORTETOTAL", "TOTAL"]),
        ("currency", ["MONEDA", "CURRENCY"]),
        ("type", ["TIPO", "TYPE"]),
        ("name", ["NOMBRE", "NAME"]),
        ("address", ["DIRECCION", "ADDRESS"]),
        ("supplierBusinessName", ["PROVEEDOR", "RAZONSOCIAL", "SUPPLIER", "VENDOR", "SELLER", "EXPORTADOR", "COMPANYNAME"]),
        ("goodsDescription", ["DESCRIPCIONDELAMERCANCIA", "DESCRIPCIONMERCANCIA", "MERCANCIA", "GOODSDESCRIPTION", "DESCRIPTIONOFGOODS", "COMMODITYDESCRIPTION", "PRODUCTDESCRIPTION"]),
        ("quantity", ["CANTIDADES", "CANTIDAD", "QTY", "QUANTITY", "UNIDADES", "UNITS"]),
        ("tariffCode", ["FRACCIONARANCELARIA", "PARTIDAARANCELARIA", "CODIGOARANCELARIO", "HSCODE", "HSTARIFF", "TARIFFCODE", "TARIC", "COMMODITYCODE"]),
        ("unitPrice", ["PRECIOSUNITARIOS", "PRECIOUNITARIO", "PRECIOUD", "PRECIOUNIDAD", "UNITPRICE", "UNITVALUE", "PRICEPERUNIT"]),
        ("countryOfOrigin", ["PAISDEORIGEN", "ORIGEN", "COUNTRYOFORIGIN", "ORIGINCOUNTRY", "MADEIN"]),
        ("authorizedExporter", ["DATOSDELEXPORTADORAUTORIZADO", "EXPORTADORAUTORIZADO", "AUTHORIZEDEXPORTER", "APPROVEDEXPORTER", "EXPORTERAUTHORIZATION", "NUMERODEEXPORTADORAUTORIZADO"]),
        ("incoterm", ["INCOTERM", "INCOTERMS", "TRADETERM", "DELIVERYTERM", "TERMINOSDEENTREGA"]),
        ("tariffUnit", ["UNIDADDEMEDIDA", "UNIDADTARIFARIA", "UNIDADDEMEDIDATARIFARIA", "UNITOFMEASURE", "MEASUREUNIT", "TARIFFUNIT", "CUSTOMSUNIT"]),
        ("customsValue", ["VALORENADUANA", "VALORESADUANALES", "VALORADUANAL", "CUSTOMSVALUE", "CUSTOMSVALUATION", "VALUEFORCUSTOMS", "VALORDECLARADO", "DECLAREDVALUE"]),
    ]
    for canonical, tokens in checks:
        if any(token in key for token in tokens):
            return canonical
    return key or normalize_key(label)


def field_score(field):
    value = clean(field.get("value"))
    confidence = float(field.get("confidence") or 0)
    has_box = 0.16 if field.get("sourceBox") else 0
    canonical = canonical_label(field.get("section"), field.get("label"))
    if canonical == "address":
        concise = min(len(value), 180) / 900
    else:
        concise = 0.1 if 0 < len(value) <= 90 else 0
    return confidence + has_box + concise - (len(value) / 10000)


def dedupe_fields(fields):
    best = {}
    for field in fields:
        if not clean(field.get("label")) or not clean(field.get("value")):
            continue
        key = (
            normalize_key(field.get("section")),
            canonical_label(field.get("section"), field.get("label")),
            normalize_key(field.get("value")),
        )
        current = best.get(key)
        if not current or field_score(field) > field_score(current):
            best[key] = field

    by_slot = {}
    for field in best.values():
        slot = (normalize_key(field.get("section")), canonical_label(field.get("section"), field.get("label")))
        current = by_slot.get(slot)
        if not current or field_score(field) > field_score(current):
            by_slot[slot] = field

    return sorted(by_slot.values(), key=lambda item: (
        FIELD_SECTION_ORDER.index(normalize_key(item.get("section")))
        if normalize_key(item.get("section")) in FIELD_SECTION_ORDER else 99,
        item.get("label", "")
    ))


def prettify_field(field):
    labels = {
        "invoiceNumber": "Numero de factura",
        "date": "Fecha",
        "dueDate": "Vencimiento",
        "taxId": "NIF / VAT",
        "email": "Email",
        "phone": "Telefono",
        "iban": "IBAN",
        "paymentMethod": "Forma de pago",
        "subtotal": "Subtotal",
        "tax": "IVA / impuestos",
        "total": "Total",
        "currency": "Moneda",
        "type": "Tipo",
        "name": "Nombre",
        "address": "Direccion",
        "supplierBusinessName": "Proveedor / razon social",
        "goodsDescription": "Descripcion de la mercancia",
        "quantity": "Cantidades",
        "tariffCode": "Fraccion arancelaria",
        "unitPrice": "Precios unitarios",
        "countryOfOrigin": "Pais de origen",
        "authorizedExporter": "Datos del exportador autorizado",
        "incoterm": "Incoterm",
        "tariffUnit": "Unidad de medida",
        "customsValue": "Valor en aduana",
    }
    canonical = canonical_label(field.get("section"), field.get("label"))
    if canonical in labels:
        field = {**field, "label": labels[canonical]}
    return field


def filter_invoice_fields(fields, invoice):
    invoice_currency = clean(invoice.get("currency")) or "EUR"
    party_values = []
    for party_key in ["supplier", "customer"]:
        party = invoice.get(party_key) or {}
        party_values.extend([party.get("taxId"), party.get("email"), party.get("phone")])
    for field in fields:
        if normalize_key(field.get("section")) in {"EMISOR", "CLIENTE"}:
            if canonical_label(field.get("section"), field.get("label")) in {"taxId", "email", "phone"}:
                party_values.append(field.get("value"))
    normalized_party_values = {normalize_key(value) for value in party_values if clean(value)}

    filtered = []
    for field in fields:
        section = normalize_key(field.get("section"))
        canonical = canonical_label(field.get("section"), field.get("label"))
        value = clean(field.get("value"))
        value_key = normalize_key(value)
        if canonical == "invoiceNumber":
            invoice_number = clean(invoice.get("invoiceNumber"))
            if invoice_number and normalize_key(field.get("value")) != normalize_key(invoice_number):
                continue
        if canonical in {"date", "dueDate"}:
            normalized_date = extract_clean_date(value)
            if not normalized_date:
                continue
            field = {**field, "value": normalized_date}
        if canonical == "phone":
            normalized_phone = normalize_phone(value)
            if not normalized_phone:
                continue
            field = {**field, "value": normalized_phone}
        if canonical == "iban":
            normalized_iban = normalize_iban(value)
            if not normalized_iban:
                continue
            field = {**field, "value": normalized_iban}
        if section == "IMPORTES" and canonical in {"subtotal", "tax", "total"} and not MONEY_RE.search(field.get("value") or ""):
            continue
        if section == "IMPORTES" and canonical in {"subtotal", "tax", "total"}:
            amount = parse_amount(field.get("value"))
            if amount is None:
                continue
            field = {**field, "value": format_amount(amount, invoice_currency)}
        if section == "IMPORTES" and canonical in {"subtotal", "tax"}:
            amount = parse_amount(field.get("value"))
            total = invoice.get("amounts", {}).get("total")
            if amount is None:
                continue
            if total is not None and amount == total:
                original_key = normalize_key(f"{field.get('label')} {field.get('value')}")
                if canonical == "subtotal" and not any(token in original_key for token in ["SUBTOTAL", "BASE"]):
                    continue
                if canonical == "tax" and not any(token in original_key for token in ["IVA", "VAT", "TAX", "IMPUEST"]):
                    continue
        if section in {"FISCAL", "CONTACTO"} and canonical in {"taxId", "email", "phone"} and any(
            value_key in party_value or party_value in value_key
            for party_value in normalized_party_values
        ):
            continue
        filtered.append(prettify_field(field))
    return filtered


def read_with_pymupdf(pdf_path):
    import fitz

    doc = fitz.open(pdf_path)
    pages = []
    for index, page in enumerate(doc, start=1):
        blocks = page.get_text("blocks") or []
        words = page.get_text("words") or []
        page_area = max(1.0, float(page.rect.width) * float(page.rect.height))
        image_area = 0.0
        for image in page.get_images(full=True):
            try:
                for rect in page.get_image_rects(image[0]):
                    image_area += max(0.0, float(rect.width) * float(rect.height))
            except Exception:
                pass
        block_text = "\n".join(clean(block[4]) for block in blocks if len(block) > 4 and clean(block[4]))
        pages.append({
            "page": index,
            "text": page.get_text("text") or "",
            "blockText": block_text,
            "blocks": blocks,
            "words": [
                {
                    "text": clean(word[4]) if len(word) > 4 else "",
                    "x1": float(word[0] or 0),
                    "y1": float(word[1] or 0),
                    "x2": float(word[2] or 0),
                    "y2": float(word[3] or 0),
                }
                for word in words
                if len(word) > 4 and clean(word[4])
            ],
            "tables": [],
            "width": float(page.rect.width),
            "height": float(page.rect.height),
            "imageCoverage": min(1.0, image_area / page_area),
        })
    page_count = len(doc)
    doc.close()
    return pages, page_count


def read_with_pdfplumber(pdf_path):
    import pdfplumber

    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            tables = []
            try:
                tables = page.extract_tables() or []
            except Exception:
                tables = []
            pages.append({
                "page": index,
                "text": page.extract_text() or "",
                "blockText": "",
                "blocks": [],
                "words": [],
                "tables": tables,
                "width": float(page.width or 0),
                "height": float(page.height or 0),
            })
        return pages, len(pdf.pages)


def parse_tesseract_tsv(tsv_text, page_number, width, height):
    rows = list(csv.DictReader(io.StringIO(tsv_text), delimiter="\t"))
    words = []
    line_parts = {}
    for row in rows:
        text = clean(row.get("text"))
        if not text:
            continue
        try:
            confidence = float(row.get("conf") or -1)
        except Exception:
            confidence = -1
        if confidence < 15:
            continue
        left = float(row.get("left") or 0)
        top = float(row.get("top") or 0)
        word_width = float(row.get("width") or 0)
        word_height = float(row.get("height") or 0)
        line_key = (
            int(row.get("block_num") or 0),
            int(row.get("par_num") or 0),
            int(row.get("line_num") or 0),
        )
        word = {
            "text": text,
            "x1": left,
            "y1": top,
            "x2": left + word_width,
            "y2": top + word_height,
        }
        words.append(word)
        line_parts.setdefault(line_key, []).append(word)

    text_lines = []
    for _, line_words in sorted(line_parts.items(), key=lambda item: (min(w["y1"] for w in item[1]), min(w["x1"] for w in item[1]))):
        ordered = sorted(line_words, key=lambda item: item["x1"])
        text_lines.append(clean(" ".join(word["text"] for word in ordered)))

    return {
        "page": page_number,
        "text": "\n".join(line for line in text_lines if line),
        "blockText": "",
        "blocks": [],
        "words": words,
        "tables": [],
        "width": float(width or 0),
        "height": float(height or 0),
    }


def run_tesseract_cli(image_path, lang):
    tesseract_bin = os.environ.get("TESSERACT_CMD") or shutil.which("tesseract")
    if not tesseract_bin:
        common_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]
        tesseract_bin = next((path for path in common_paths if Path(path).exists()), None)
    if not tesseract_bin:
        return ""
    command = [tesseract_bin, str(image_path), "stdout", "-l", lang, "--psm", "6", "tsv"]
    local_tessdata = Path(__file__).with_name("tessdata")
    if local_tessdata.exists() and "spa" in lang and "+" not in lang:
        command.extend(["--tessdata-dir", str(local_tessdata)])
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
        timeout=60,
    )
    if completed.returncode != 0:
        return ""
    return completed.stdout


def read_with_ocr(pdf_path):
    import fitz
    from PIL import Image

    lang = os.environ.get("INVOICE_OCR_LANG", "spa+eng")
    dpi = int(os.environ.get("INVOICE_OCR_DPI", "220"))
    has_pytesseract = importlib.util.find_spec("pytesseract") is not None
    tesseract_bin = os.environ.get("TESSERACT_CMD") or shutil.which("tesseract")
    if not tesseract_bin:
        common_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]
        tesseract_bin = next((path for path in common_paths if Path(path).exists()), None)
    if not has_pytesseract and not tesseract_bin:
        raise RuntimeError("OCR no disponible. Instala Tesseract o pytesseract para facturas escaneadas.")

    pytesseract = None
    if has_pytesseract:
        import pytesseract as pytesseract_module
        pytesseract = pytesseract_module
        if os.environ.get("TESSERACT_CMD"):
            pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]

    doc = fitz.open(pdf_path)
    pages = []
    with TemporaryDirectory(prefix="alentio-invoice-ocr-") as tmpdir:
        tmpdir_path = Path(tmpdir)
        for index, page in enumerate(doc, start=1):
            matrix = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            image = Image.open(io.BytesIO(pix.tobytes("png")))
            image_width, image_height = image.size
            pdf_width = float(page.rect.width)
            pdf_height = float(page.rect.height)
            tsv_text = ""
            if pytesseract:
                try:
                    tsv_text = pytesseract.image_to_data(image, lang=lang, config="--psm 6")
                except Exception:
                    tsv_text = ""
            if not tsv_text:
                image_path = tmpdir_path / f"page-{index}.png"
                image.save(image_path)
                tsv_text = run_tesseract_cli(image_path, lang)
                if not tsv_text and "spa" in lang:
                    tsv_text = run_tesseract_cli(image_path, "spa")
                if not tsv_text and "+" in lang:
                    tsv_text = run_tesseract_cli(image_path, "eng")
            ocr_page = parse_tesseract_tsv(tsv_text, index, image_width, image_height)
            scale_x = pdf_width / max(1, float(image_width))
            scale_y = pdf_height / max(1, float(image_height))
            for word in ocr_page.get("words") or []:
                word["x1"] = float(word["x1"]) * scale_x
                word["x2"] = float(word["x2"]) * scale_x
                word["y1"] = float(word["y1"]) * scale_y
                word["y2"] = float(word["y2"]) * scale_y
            ocr_page["width"] = pdf_width
            ocr_page["height"] = pdf_height
            pages.append(ocr_page)
    page_count = len(doc)
    doc.close()
    return pages, page_count

def read_with_rapidocr(pdf_path):
    import fitz
    import numpy as np
    from PIL import Image
    from rapidocr import RapidOCR

    print(
        "[INVOICE OCR] RapidOCR iniciado",
        file=sys.stderr,
        flush=True,
    )

    engine = RapidOCR()

    dpi = int(
        os.environ.get(
            "RAPID_OCR_DPI",
            "160",
        )
    )

    doc = fitz.open(pdf_path)
    pages = []

    for page_number, page in enumerate(doc, start=1):
        scale = dpi / 72

        pix = page.get_pixmap(
            matrix=fitz.Matrix(scale, scale),
            alpha=False,
        )

        image = Image.open(
            io.BytesIO(
                pix.tobytes("png")
            )
        ).convert("RGB")

        image_array = np.asarray(image)

        result = engine(
            image_array,
            use_det=True,
            use_cls=True,
            use_rec=True,
        )

        raw_boxes = getattr(result, "boxes", None)
        raw_texts = getattr(result, "txts", None)
        raw_scores = getattr(result, "scores", None)

        boxes = (
            raw_boxes.tolist()
            if hasattr(raw_boxes, "tolist")
            else list(raw_boxes)
            if raw_boxes is not None
            else []
        )

        texts = (
            raw_texts.tolist()
            if hasattr(raw_texts, "tolist")
            else list(raw_texts)
            if raw_texts is not None
            else []
        )

        scores = (
            raw_scores.tolist()
            if hasattr(raw_scores, "tolist")
            else list(raw_scores)
            if raw_scores is not None
            else []
        )

        pdf_width = float(page.rect.width)
        pdf_height = float(page.rect.height)

        image_width = max(1, image.width)
        image_height = max(1, image.height)

        scale_x = pdf_width / image_width
        scale_y = pdf_height / image_height

        words = []
        text_rows = []

        for index, raw_text in enumerate(texts):
            text = clean(raw_text)

            if not text:
                continue

            box = (
                boxes[index]
                if index < len(boxes)
                else None
            )

            score = (
                scores[index]
                if index < len(scores)
                else None
            )

            points = (
                box.tolist()
                if hasattr(box, "tolist")
                else box
            )

            x_values = []
            y_values = []

            for point in points or []:
                if (
                    isinstance(point, (list, tuple))
                    and len(point) >= 2
                ):
                    x_values.append(float(point[0]))
                    y_values.append(float(point[1]))

            if x_values and y_values:
                x1 = min(x_values) * scale_x
                y1 = min(y_values) * scale_y
                x2 = max(x_values) * scale_x
                y2 = max(y_values) * scale_y
            else:
                x1 = y1 = x2 = y2 = 0.0

            words.append({
                "text": text,
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "confidence": (
                    float(score)
                    if score is not None
                    else None
                ),
            })

            text_rows.append({
                "text": text,
                "x1": x1,
                "y1": y1,
            })

        # Ordenar el texto por posición visual.
        text_rows.sort(
            key=lambda item: (
                round(item["y1"] / 5) * 5,
                item["x1"],
            )
        )

        page_text = "\n".join(
            item["text"]
            for item in text_rows
        )

        pages.append({
            "page": page_number,
            "text": page_text,
            "blockText": "",
            "blocks": [],
            "words": words,
            "tables": [],
            "width": pdf_width,
            "height": pdf_height,
            "imageCoverage": 1.0,
        })

    page_count = len(doc)
    doc.close()

    print(
        f"[INVOICE OCR] RapidOCR terminado: "
        f"{page_count} páginas",
        file=sys.stderr,
        flush=True,
    )

    return pages, page_count

def read_pdf(pdf_path):
    problems = []
    engines = []
    page_sets = []
    page_count = 0

    try:
        pages, count = read_with_pymupdf(pdf_path)
        page_sets.append(("pymupdf", pages))
        page_count = max(page_count, count)
        engines.append({"name": "pymupdf", "status": "ok"})
    except Exception as exc:
        problems.append(f"PyMuPDF no pudo leer el PDF: {exc}")
        engines.append({"name": "pymupdf", "status": "error", "problems": [str(exc)]})

    try:
        pages, count = read_with_pdfplumber(pdf_path)
        page_sets.append(("pdfplumber", pages))
        page_count = max(page_count, count)
        engines.append({"name": "pdfplumber", "status": "ok"})
    except Exception as exc:
        problems.append(f"pdfplumber no pudo leer el PDF: {exc}")
        engines.append({"name": "pdfplumber", "status": "error", "problems": [str(exc)]})

    text_chars = sum(len(clean(page.get("text"))) for _, pages in page_sets for page in pages)
    # Muchos PDFs de facturas son hibridos: una cabecera seleccionable hace creer
    # que hay texto, aunque el cuerpo, la tabla y los importes sean una imagen.
    # En esos casos el OCR debe complementar (no sustituir) el texto nativo.
    native_pages = page_sets[0][1] if page_sets else []
    needs_ocr = text_chars < 80 or any(
        float(page.get("imageCoverage") or 0) >= 0.25
        or len(clean(page.get("text"))) < 180
        for page in native_pages
    )
    if needs_ocr:
        rapid_worked = False

        # ========================================================
        # Primero intentar RapidOCR
        # ========================================================
        try:
            rapid_pages, rapid_count = read_with_rapidocr(
                pdf_path
            )

            rapid_text_chars = sum(
                len(clean(page.get("text")))
                for page in rapid_pages
            )

            if rapid_pages and rapid_text_chars > 0:
                page_sets.append(
                    ("rapidocr", rapid_pages)
                )

                page_count = max(
                    page_count,
                    rapid_count,
                )

                engines.append({
                    "name": "rapidocr",
                    "status": "ok",
                })

                rapid_worked = True

        except Exception as exc:
            message = (
                f"RapidOCR no pudo leer el PDF: {exc}"
            )

            problems.append(message)

            engines.append({
                "name": "rapidocr",
                "status": "error",
                "problems": [str(exc)],
            })

        # ========================================================
        # Tesseract solo si RapidOCR falla
        # ========================================================
        if not rapid_worked:
            try:
                ocr_pages, ocr_count = read_with_ocr(
                    pdf_path
                )

                ocr_text_chars = sum(
                    len(clean(page.get("text")))
                    for page in ocr_pages
                )

                if ocr_pages and ocr_text_chars > 0:
                    page_sets.append(
                        ("ocr", ocr_pages)
                    )

                    page_count = max(
                        page_count,
                        ocr_count,
                    )

                    engines.append({
                        "name": "ocr",
                        "status": "ok",
                    })

            except Exception as exc:
                problems.append(str(exc))

                engines.append({
                    "name": "ocr",
                    "status": "unavailable",
                    "problems": [str(exc)],
                })

    if not page_sets:
        return ([], 0), "none", problems, engines

    merged = []
    for page_number in range(1, page_count + 1):
        texts = []
        seen_texts = set()
        tables = []
        words = []
        width = 0
        height = 0
        image_coverage = 0
        for engine_name, pages in page_sets:
            page = next((item for item in pages if item["page"] == page_number), None)
            if not page:
                continue
            for key in ["text", "blockText"]:
                raw_text = str(page.get(key, "") or "").strip()
                normalized_text = clean(raw_text)
                if normalized_text and normalized_text not in seen_texts:
                    texts.append(raw_text)
                    seen_texts.add(normalized_text)
            tables.extend(page.get("tables") or [])
            candidate_words = page.get("words") or []
            if engine_name == "rapidocr" and candidate_words:
                words = list(candidate_words)

            elif len(candidate_words) > len(words):
                words = list(candidate_words)
            page_width = float(page.get("width") or 0)
            page_height = float(page.get("height") or 0)
            if page_width and page_width > float(width or 0):
                width = page_width
            if page_height and page_height > float(height or 0):
                height = page_height
            image_coverage = max(image_coverage, float(page.get("imageCoverage") or 0))
        merged.append({
            "page": page_number,
            "text": "\n".join(texts),
            "blockText": "",
            "blocks": [],
            "words": words,
            "tables": tables,
            "width": width,
            "height": height,
            "imageCoverage": image_coverage,
        })

    return (merged, page_count), "+".join(engine["name"] for engine in engines if engine["status"] == "ok"), problems, engines


def find_label_value(text, labels):
    lines = [clean(line) for line in text.splitlines() if clean(line)]
    for line in lines:
        for label in labels:
            value = extract_value_from_label_line(line, label)
            if value:
                return value
    joined = "\n".join(lines)
    for label in labels:
        if is_latin_text(label):
            pattern = re.compile(rf"{re.escape(label)}\s*[:：#-]?\s*\n?\s*([^\n]+)", re.I)
        else:
            pattern = re.compile(rf"{re.escape(label)}\s*[:：#-]?\s*\n?\s*([^\n]+)")
        match = pattern.search(joined)
        if match:
            return clean(match.group(1))
    return ""


def extract_value_from_label_line(line, label):
    line = clean(line)
    label = clean(label)
    if not line or not label:
        return ""
    if is_latin_text(label):
        pattern = re.compile(rf"\b{re.escape(label)}\b\s*[:：#-]?\s*(.+)$", re.I)
        match = pattern.search(line)
        if match:
            return clean(match.group(1))
    line_norm = normalize_label_text(line)
    label_norm = normalize_label_text(label)
    if not line_norm or not label_norm:
        return ""
    if line_norm.startswith(label_norm):
        remainder = line[len(label):] if line.lower().startswith(label.lower()) else ""
        if not remainder:
            label_index = strip_accents(line).lower().find(strip_accents(label).lower())
            if label_index >= 0:
                remainder = line[label_index + len(label):]
        return clean(remainder.strip(" :：#-–—."))
    return ""


def line_looks_like_label(line):
    key = normalize_key(line)
    if not key:
        return False
    known = [
        "NUMERO", "NUMFACTURA", "FACTURA", "FECHA", "DATE", "VENCIMIENTO", "DUEDATE",
        "SUBTOTAL", "TOTAL", "IVA", "VAT", "BASEIMPONIBLE", "PENDIENTE", "PAID",
        "METODODEPAGO", "FORMADEPAGO", "CUENTADEPAGO", "IBAN", "CLIENTE", "CLIENT",
        "EMISOR", "PROVEEDOR", "SUPPLIER", "CONCEPTO", "DESCRIPCION", "DESCRIPTION",
        "RAZONSOCIAL", "MERCANCIA", "GOODSDESCRIPTION", "CANTIDAD", "CANTIDADES",
        "QUANTITY", "FRACCIONARANCELARIA", "PARTIDAARANCELARIA", "HSCODE",
        "TARIFFCODE", "PRECIOUNITARIO", "UNITPRICE", "PAISDEORIGEN",
        "COUNTRYOFORIGIN", "EXPORTADORAUTORIZADO", "AUTHORIZEDEXPORTER",
        "INCOTERM", "INCOTERMS", "UNIDADDEMEDIDA", "UNIDADTARIFARIA",
        "VALORENADUANA", "CUSTOMSVALUE",
    ]
    return len(key) <= 28 and any(token == key or token in key for token in known)


def find_adjacent_value(lines, labels, matcher=None, max_lookahead=4):
    label_keys = [normalize_key(label) for label in labels]
    for index, line in enumerate(lines):
        line_key = normalize_key(line)
        for label, label_key in zip(labels, label_keys):
            label_text_key = normalize_label_text(label)
            if not label_key and not label_text_key:
                continue
            same_line_value = extract_value_from_label_line(line, label)
            if same_line_value:
                candidate = clean(same_line_value)
                if candidate and (not matcher or matcher(candidate)):
                    return candidate
            line_label_match = bool(label_key) and (line_key == label_key or line_key.startswith(label_key))
            if not line_label_match and not is_latin_text(label):
                line_label_match = normalize_label_text(line).startswith(label_text_key)
            if line_label_match:
                for next_line in lines[index + 1:index + 1 + max_lookahead]:
                    candidate = clean(next_line)
                    if not candidate:
                        continue
                    if line_looks_like_label(candidate) and not (matcher and matcher(candidate)):
                        continue
                    if matcher and not matcher(candidate):
                        continue
                    return candidate
    return ""


def looks_like_invoice_number(value):
    value = clean(value).strip("#:.- ")
    key = normalize_key(value)
    if not key or len(value) > 80:
        return False
    if DATE_RE.search(value):
        return False
    rejected = {
        "FACTURA", "INVOICE", "DOCUMENTODEFACTURA", "FECHA", "DATA", "DATE",
        "CLIENTE", "CLIENT", "TOTAL", "SUBTOTAL", "IVA", "VAT", "BASE",
    }
    if key in rejected or any(token in key for token in ["FECHA", "DATA", "DATE", "VENCIM", "TOTAL", "SUBTOTAL"]):
        return False
    return bool(re.search(r"\d", value) and re.search(r"[A-Z0-9][A-Z0-9./_-]{2,}", value, re.I))


def normalize_invoice_number(value):
    value = clean(value).strip("#:.- ")
    if re.match(r"^O0\d", value, re.I):
        value = value[1:]
    elif re.match(r"^O\d", value, re.I):
        value = "0" + value[1:]
    return value


def find_loose_invoice_number(text):
    tokens = re.findall(r"[A-ZÁÉÍÓÚÜÑa-záéíóúüñ0-9./_-]+", text or "")
    for index, token in enumerate(tokens):
        token_key = normalize_key(token)
        if token_key not in {"NUMERO", "NDIMERO", "NIMERO", "NUMBER", "NO", "N"}:
            continue
        for candidate in tokens[index + 1:index + 12]:
            candidate = normalize_invoice_number(candidate)
            if re.search(r"[A-Z]", candidate, re.I) and re.search(r"\d{2,}", candidate) and looks_like_invoice_number(candidate):
                return candidate
    return ""


def find_invoice_number(text, lines):
    candidates = [
        first_match(re.compile(r"\b((?:FE|RE|INV|FAC)[-\s]+\d{2,})\s+(?:OF|DEL?|DATE)\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", re.I), text),
        first_match(re.compile(r"\bFactura(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)?\s*#\s*([A-Z0-9][A-Z0-9./_-]{2,})", re.I), text),
        first_match(re.compile(r"(?:N[úu]m\.?\s*factura|N[ºo]\s*factura|No\.?\s*factura|Numero\s*factura|Número\s*factura|Factura\s*n[ºo.]?|Invoice\s*(?:no|number)?|Rechnungsnummer|Numéro\s*de\s*facture|Numero\s*fattura|Número\s*da\s*fatura)[:：\s#-]*([A-Z0-9][A-Z0-9./_-]{2,})", re.I), text),
        find_adjacent_value(lines, [
            "Numero de factura", "Número de factura", "Nº factura", "Num. factura", "Núm. factura",
            "Invoice number", "Invoice no", "Numéro de facture", "Numero fattura",
            "Número da fatura", "Rechnungsnummer", "发票号码", "发票号", "請求書番号",
            "송장 번호", "رقم الفاتورة", "Номер счета",
        ], looks_like_invoice_number),
        find_loose_invoice_number(text),
        first_match(re.compile(r"\b(?:INV|FAC|FRA|F)[-/#\s]*([A-Z0-9][A-Z0-9./_-]{3,})\b", re.I), text),
    ]
    for candidate in candidates:
        candidate = normalize_invoice_number(candidate)
        if looks_like_invoice_number(candidate):
            return candidate
    return ""


def find_date_by_labels(text, lines, labels):
    value = find_label_value(text, labels)
    value = extract_clean_date(value)
    if value:
        return value
    value = find_adjacent_value(lines, labels, lambda item: bool(extract_clean_date(item)))
    return extract_clean_date(value)


def first_match(regex, text):
    match = regex.search(text or "")
    return clean(match.group(1) if match and match.groups() else match.group(0) if match else "")


def find_amount_near(text, labels):
    lines = [clean(line) for line in text.splitlines() if clean(line)]
    label_keys = [normalize_key(label) for label in labels if normalize_key(label)]
    candidates = []
    for line in lines:
        key = normalize_key(line)
        if any(label_key in key for label_key in label_keys):
            if any(normalize_key(label) in {"IVA", "VAT", "TAX", "IMPUESTO"} for label in labels):
                if not any(token in key for token in ["IVA", "VAT", "TAX", "IMPUEST"]):
                    continue
            if any(normalize_key(label) in {"SUBTOTAL", "BASEIMPONIBLE", "NETAMOUNT", "BASE"} for label in labels):
                if not any(token in key for token in ["SUBTOTAL", "BASEIMPONIBLE", "NETAMOUNT"]):
                    continue
            amounts = MONEY_RE.findall(line)
            if amounts:
                candidates.append((line, parse_amount(amounts[-1])))
    for _, amount in reversed(candidates):
        if amount is not None:
            return amount
    return None


def find_amount_after_label(text, labels):
    lines = [clean(line) for line in text.splitlines() if clean(line)]
    wanted_keys = {normalize_key(label) for label in labels}
    wants_total = any(token in wanted_keys for token in ["TOTAL", "TOTALFACTURA", "GRANDTOTAL", "TOTALDUE", "IMPORTETOTAL"])
    wants_tax = any(token in wanted_keys for token in ["IVA", "VAT", "TAX", "IMPUESTO", "IMPUESTOS"])
    wants_subtotal = any(token in wanted_keys for token in ["SUBTOTAL", "BASEIMPONIBLE", "NETAMOUNT", "BASE"])

    def valid_adjacent_amount(value):
        if not MONEY_RE.search(value) or line_looks_like_label(value):
            return False
        key = normalize_key(value)
        if wants_tax and any(token in key for token in ["TOTAL", "SUBTOTAL", "BASEIMPONIBLE"]):
            return False
        if wants_subtotal and any(token in key for token in ["TOTAL", "IVA", "VAT", "TAX", "IMPUEST"]):
            return False
        if not wants_total and "TOTAL" in key:
            return False
        return True

    for line in lines:
        upper = line.upper()
        for label in labels:
            label_upper = label.upper()
            index = upper.find(label_upper)
            if index < 0:
                continue
            tail = line[index + len(label):]
            amounts = MONEY_RE.findall(tail)
            if amounts:
                selected = amounts[-1] if (wants_tax or wants_total) else amounts[0]
                amount = parse_amount(selected)
                if amount is not None:
                    return amount
    adjacent = find_adjacent_value(lines, labels, valid_adjacent_amount)
    if adjacent:
        amounts = MONEY_RE.findall(adjacent)
        if amounts:
            amount = parse_amount(amounts[-1])
            if amount is not None:
                return amount
    return find_amount_near(text, labels)


def find_best_total(text, lines):
    total_labels = ["total factura", "grand total", "total due", "importe total", "total (eur)", "gesamtbetrag", "endbetrag", "价税合计", "價稅合計", "总计", "總計", "应付金额", "應付金額", "总金额", "總金額", "total"]
    candidates = []
    for line in lines:
        key = normalize_header_key(line)
        if not any(token in key for token in ["TOTAL", "GESAMTBETRAG", "ENDBETRAG", "价税合计", "價稅合計", "总计", "總計", "应付金额", "應付金額", "总金额", "總金額"]):
            continue
        if any(skip in key for skip in ["SUBTOTAL", "BASETOTAL", "TOTALBASE", "ZAHLUNGSHINWEIS", "RECHNUNGSNUMMER"]):
            continue
        amounts = MONEY_RE.findall(line)
        if amounts:
            parsed = parse_amount(amounts[-1])
            if parsed is not None:
                candidates.append(parsed)
    if candidates:
        return candidates[-1]
    return find_amount_after_label(text, total_labels)


def guess_invoice_type(text):
    upper = text.upper()
    if "PROFORMA" in upper:
        return "Factura proforma"
    if "CREDIT NOTE" in upper or "ABONO" in upper or "RECTIFICATIVA" in upper:
        return "Factura rectificativa"
    if "INVOICE" in upper:
        return "Invoice"
    if "FACTURA" in upper:
        return "Factura"
    return "Documento de factura"


def extract_party(lines, labels):
    label_indexes = []
    upper_labels = [label.upper() for label in labels]
    for index, line in enumerate(lines):
        upper = line.upper()
        if any(label in upper for label in upper_labels):
            label_indexes.append(index)
    if not label_indexes:
        return {"name": "", "address": "", "taxId": "", "email": "", "phone": ""}

    start = label_indexes[0] + 1
    chunk = []
    for line in lines[start:start + 8]:
        upper = line.upper()
        if any(stop in upper for stop in ["INVOICE", "FACTURA", "TOTAL", "SUBTOTAL", "CLIENTE", "CUSTOMER", "BILL TO", "PROVEEDOR", "SUPPLIER", "ARTICLE", "ARTICULO", "DESCRIP"]):
            break
        chunk.append(line)

    text = "\n".join(chunk)
    address_lines = [
        line for line in chunk[1:]
        if line
        and not TAX_ID_RE.search(line)
        and not EMAIL_RE.search(line)
        and not normalize_phone(line)
    ]

    return {
        "name": chunk[0] if chunk else "",
        "address": clean(", ".join(address_lines)) if address_lines else "",
        "taxId": first_match(TAX_ID_RE, text),
        "email": first_match(EMAIL_RE, text),
        "phone": find_first_phone(text),
    }


def row_has_invoice_shape(line):
    amounts = MONEY_RE.findall(line)
    if not amounts:
        return False
    if is_summary_line_text(line):
        return False
    words = re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}", line)
    return len(words) >= 1 and len(line) >= 12


def extract_line_items(lines):
    items = []
    for line in lines:
        if not row_has_invoice_shape(line):
            continue

        amounts = MONEY_RE.findall(line)
        total = parse_amount(amounts[-1]) if amounts else None
        left = MONEY_RE.sub(" ", line, count=len(amounts)).strip()
        quantity_match = re.search(r"\b(\d+(?:[.,]\d+)?)\s*(?:x|ud|uds|unit|units|qty)?\b", left, re.I)
        quantity = parse_amount(quantity_match.group(1)) if quantity_match else None
        description = clean(re.sub(r"^\d+\s+", "", left))

        if description and total is not None and not is_summary_line_text(description):
            items.append({
                "description": description[:220],
                "quantity": quantity,
                "unitPrice": None,
                "total": total,
            })
    return items[:200]


def add_field(fields, section, label, value, confidence=0.72):
    value = clean(value)
    if not value or value in {"-", "—"}:
        return
    upper_value = value.upper()
    noisy_tokens = ["FACTURA", "CLIENT", "ARTICLE", "DESCRIP", "TOTAL", "IBAN", "BASE", "OBSERV"]
    if len(value) > 260 and sum(1 for token in noisy_tokens if token in upper_value) >= 3:
        return
    normalized = (section.lower(), label.lower(), value.lower())
    for field in fields:
        if (field["section"].lower(), field["label"].lower(), field["value"].lower()) == normalized:
            return
    fields.append({
        "section": section,
        "label": label[:80],
        "value": value[:260],
        "confidence": round(float(confidence), 2),
    })


def priority_field_value(canonical, value, currency="EUR"):
    value = clean(value).strip(":#- ")
    if not value or line_looks_like_label(value):
        return ""

    if canonical == "invoiceNumber":
        return value if looks_like_invoice_number(value) else ""
    if canonical in {"date", "dueDate"}:
        return extract_clean_date(value)
    if canonical == "iban":
        return normalize_iban(value)
    if canonical == "phone":
        return normalize_phone(value)
    if canonical in {"unitPrice", "customsValue"}:
        match = MONEY_RE.search(value)
        if match:
            return format_amount(match.group(0), detect_currency(value) or currency or "EUR")
        amount = parse_amount(value)
        return format_amount(amount, currency or "EUR") if amount is not None else ""
    if canonical == "incoterm":
        match = re.search(r"\b(EXW|FCA|CPT|CIP|DAP|DPU|DDP|FAS|FOB|CFR|CIF)\b", value, re.I)
        return match.group(1).upper() if match else value[:40]
    if canonical == "tariffCode":
        if re.search(r"\b[A-Z0-9][A-Z0-9.\s/-]{3,24}\b", value, re.I):
            return value[:60]
        return ""
    if canonical == "quantity":
        if MONEY_RE.search(value):
            return ""
        return value[:80] if re.search(r"\d", value) else ""
    if canonical in {"countryOfOrigin", "tariffUnit"}:
        if MONEY_RE.search(value) or DATE_RE.search(value):
            return ""
        return value[:80]
    if canonical in {"supplierBusinessName", "goodsDescription", "authorizedExporter"}:
        if len(value) < 2 or MONEY_RE.fullmatch(value):
            return ""
        if canonical == "supplierBusinessName" and re.search(
            r"productos? incluidos|presente documento|origen preferencial|products? included|present document",
            value, re.I
        ):
            return ""
        return value[:220]
    return value[:180]


def extract_priority_invoice_fields(text, lines, currency="EUR"):
    fields = []
    for spec in PRIORITY_INVOICE_FIELD_SPECS:
        canonical = spec["canonical"]
        aliases = spec["aliases"]
        matcher = lambda candidate, field_key=canonical: bool(priority_field_value(field_key, candidate, currency))
        value = find_adjacent_value(lines, aliases, matcher=matcher, max_lookahead=5)
        if not value:
            value = find_label_value(text, aliases)
        value = priority_field_value(canonical, value, currency)
        add_field(fields, spec["section"], spec["label"], value, 0.94)
    return fields


def extract_generic_fields(text, lines):
    fields = []

    label_patterns = [
        ("Factura", "Tipo", r"\b(Factura|Invoice|Credit note|Abono|Proforma)\b"),
        ("Factura", "Numero de factura", r"(?:N[úu]m\.?\s*factura|Nº\s*factura|Numero\s*factura|Factura\s*n[ºo.]?|Invoice\s*(?:no|number)?)[:\s#-]*([A-Z0-9][A-Z0-9./_-]{2,})"),
        ("Factura", "Fecha", r"(?:Data|Fecha|Date|Invoice date)[:\s-]*(" + DATE_PATTERN + r")"),
        ("Factura", "Vencimiento", r"(?:Vencimiento|Due date|Payment due)[:\s-]*(" + DATE_PATTERN + r")"),
        ("Fiscal", "NIF / CIF / VAT", r"(?:DNI/NIF|NIF|CIF|VAT|IVA|Tax ID)[:\s-]*([A-Z0-9][A-Z0-9 ./-]{5,24})"),
        ("Contacto", "Email", EMAIL_RE.pattern),
        ("Contacto", "Telefono", r"(?:Tel[eé]fono|Telefon|Phone|Tel\.?)[:\s-]*([+()\d\s.-]{7,})"),
        ("Pago", "IBAN", IBAN_RE.pattern),
    ]

    for section, label, pattern in label_patterns:
        for match in re.finditer(pattern, text, re.I):
            value = match.group(1) if match.groups() else match.group(0)
            canonical = canonical_label(section, label)
            if canonical in {"date", "dueDate"}:
                value = extract_clean_date(value)
            elif canonical == "phone":
                value = normalize_phone(value)
            elif canonical == "iban":
                value = normalize_iban(value)
            add_field(fields, section, label, value, 0.86)

    amount_labels = [
        ("Importes", "Subtotal", ["subtotal", "base imponible", "base"]),
        ("Importes", "IVA / impuestos", ["iva", "vat", "tax", "impuesto"]),
        ("Importes", "Total", ["total factura", "grand total", "total due", "importe total", "total"]),
        ("Importes", "Pagado", ["pagado", "paid"]),
        ("Importes", "Pendiente", ["pendiente", "balance", "due"]),
    ]
    for section, label, labels in amount_labels:
        amount = find_amount_after_label(text, labels)
        if amount is not None:
            add_field(fields, section, label, format_amount(amount), 0.8)

    for line in lines:
        if ":" not in line:
            continue
        label, value = line.split(":", 1)
        label = clean(label).strip(" .-")
        value = clean(value)
        if re.match(r"^\d", label) or normalize_key(label) in {"COL", "COLUMN", "AMOUNTS"}:
            continue
        label_key = normalize_key(label)
        if "IBAN" in label_key and not normalize_iban(value):
            continue
        if any(token in label_key for token in ["FECHA", "DATA", "DATE", "VENCIMIENTO", "VENCIMENT"]) and not extract_clean_date(value):
            continue
        if any(token in label_key for token in ["TELEFONO", "TELEFON", "PHONE", "TEL"]) and not normalize_phone(value):
            continue
        if 2 <= len(label) <= 40 and value and len(value) <= 180:
            section = "Factura"
            upper = strip_accents(label).upper()
            if any(token in upper for token in ["METODO", "FORMA DE PAGO", "FORMA DE PAGAMENT", "PAYMENT"]):
                section = "Pago"
            elif any(token in upper for token in ["BASE", "TOTAL", "IVA", "PREU", "PRECIO", "PRICE", "IMPORTE"]):
                section = "Importes"
            elif any(token in upper for token in ["NIF", "CIF", "VAT", "DNI"]):
                section = "Fiscal"
            elif any(token in upper for token in ["TEL", "EMAIL", "MAIL"]):
                section = "Contacto"
            elif any(token in upper for token in ["MERCANCIA", "GOODS", "COMMODITY", "CANTIDAD", "QUANTITY", "PRECIO UNITARIO", "UNIT PRICE"]):
                section = "Mercancia"
            elif any(token in upper for token in ["ARANCEL", "TARIC", "ADUANA", "CUSTOMS", "ORIGEN", "EXPORTADOR AUTORIZADO", "AUTHORIZED EXPORTER", "UNIDAD TARIFARIA"]):
                section = "Aduanas"
            elif any(token in upper for token in ["INCOTERM", "DELIVERY TERM", "TRADE TERM", "TERMINOS DE ENTREGA"]):
                section = "Comercio"
            canonical = canonical_label(section, label)
            if canonical in {"date", "dueDate"}:
                value = extract_clean_date(value)
            elif canonical == "phone":
                value = normalize_phone(value)
            elif canonical == "iban":
                value = normalize_iban(value)
            elif canonical in {"unitPrice", "customsValue"}:
                value = priority_field_value(canonical, value, detect_currency(value) or "EUR")
            elif canonical in {
                "supplierBusinessName", "goodsDescription", "quantity", "tariffCode",
                "countryOfOrigin", "authorizedExporter", "incoterm", "tariffUnit"
            }:
                value = priority_field_value(canonical, value)
            add_field(fields, section, label, value, 0.68)

    return fields


def extract_adjacent_label_fields(text, lines):
    fields = []
    specs = [
        ("Factura", "Numero de factura", [alias for spec in PRIORITY_INVOICE_FIELD_SPECS if spec["canonical"] == "invoiceNumber" for alias in spec["aliases"]], looks_like_invoice_number, 0.9),
        ("Factura", "Fecha", ["Fecha", "Data", "Invoice date", "Date", "Datum", "Rechnungsdatum", "Date de facture", "Data fattura", "Data da fatura", "发票日期", "日期", "請求日", "날짜", "تاريخ الفاتورة", "Дата"], lambda value: bool(extract_clean_date(value)), 0.9),
        ("Factura", "Vencimiento", ["Vencimiento", "Venciment", "Due date", "Payment due", "Due", "Echeance", "Échéance", "Scadenza", "Vencimento", "Fälligkeitsdatum", "到期日", "付款期限", "支払期限", "만기일", "تاريخ الاستحقاق", "Срок оплаты"], lambda value: bool(extract_clean_date(value)), 0.88),
        ("Pago", "Forma de pago", ["Metodo de pago", "Método de pago", "Forma de pago", "Forma de pagament", "Payment method", "Payment terms", "Mode de paiement", "Metodo di pagamento", "Forma de pagamento", "Zahlungsart", "付款方式", "支付方式", "支払方法", "결제 방법", "طريقة الدفع", "Способ оплаты"], lambda value: not line_looks_like_label(value), 0.82),
        ("Pago", "IBAN", ["Cuenta de pago", "IBAN", "Cuenta bancaria", "Bank account", "Compte bancaire", "Conto bancario", "Conta bancaria", "Bankverbindung", "银行账户", "銀行口座", "계좌", "الحساب البنكي", "Банковский счет"], lambda value: bool(normalize_iban(value)), 0.9),
        ("Importes", "Subtotal", ["Subtotal", "Sub total", "Base imponible", "Base", "Net amount", "Sous-total", "Imponibile", "Zwischensumme", "小计", "小計", "소계", "المجموع الفرعي", "Промежуточный итог"], lambda value: bool(MONEY_RE.search(value)), 0.88),
        ("Importes", "IVA / impuestos", ["IVA", "IVA 21%", "VAT", "Tax", "Taxes", "Impuestos", "TVA", "Imposte", "MwSt", "USt", "增值税", "税", "부가세", "ضريبة", "НДС"], lambda value: bool(MONEY_RE.search(value)), 0.88),
        ("Importes", "Total", ["Total (EUR)", "Total factura", "Grand total", "Total due", "Importe total", "Total", "Montant total", "Totale", "Gesamtbetrag", "合计", "总计", "總計", "合計", "총액", "الإجمالي", "Итого"], lambda value: bool(MONEY_RE.search(value)), 0.92),
        ("Importes", "Pendiente", ["Pendiente", "Balance", "Due", "Outstanding", "A payer", "Reste a payer", "Da pagare", "Ausstehend", "待付款", "未払", "미지급", "مستحق", "К оплате"], lambda value: bool(MONEY_RE.search(value)), 0.86),
    ]
    for section, label, labels, matcher, confidence in specs:
        value = find_adjacent_value(lines, labels, matcher)
        if label in {"Fecha", "Vencimiento"}:
            value = extract_clean_date(value)
        if label == "IBAN":
            value = normalize_iban(value)
        if section == "Importes":
            amounts = MONEY_RE.findall(value)
            if amounts:
                value = format_amount(parse_amount(amounts[-1]))
        add_field(fields, section, label, value, confidence)
    invoice_number = find_invoice_number(text, lines)
    add_field(fields, "Factura", "Numero de factura", invoice_number, 0.93)
    return fields


def extract_party_blocks(lines):
    fields = []
    markers = [
        ("Emisor", ["VITRA SOFTWARE", "SUPPLIER", "PROVEEDOR", "EMISOR"]),
        ("Cliente", ["CLIENT", "CLIENTE", "CUSTOMER", "BILL TO", "FACTURAR A"]),
    ]
    used_ranges = []
    for section, labels in markers:
        start = None
        for index, line in enumerate(lines):
            upper = line.upper()
            if any(label in upper for label in labels):
                start = index
                break
        if start is None:
            continue
        if normalize_key(lines[start]) in [normalize_key(label) for label in labels]:
            start += 1
        chunk = []
        for line in lines[start:start + 9]:
            upper = line.upper()
            if len(chunk) > 1 and any(stop in upper for stop in ["FACTURA", "ARTICLE", "ARTICULO", "DESCRIP", "TOTAL", "OBSERVACIONES"]):
                break
            chunk.append(line)
        used_ranges.append((start, start + len(chunk)))
        for index, line in enumerate(chunk):
            if index == 0:
                add_field(fields, section, "Nombre", line, 0.78)
            elif re.search(r"\b(NIF|DNI|CIF|VAT)\b", line, re.I):
                add_field(fields, section, "NIF / VAT", line, 0.9)
            elif EMAIL_RE.search(line):
                add_field(fields, section, "Email", first_match(EMAIL_RE, line), 0.92)
            elif re.search(r"\b(Tel|Telefono|Phone)\b", line, re.I):
                add_field(fields, section, "Telefono", normalize_phone(line), 0.86)
            else:
                add_field(fields, section, "Direccion", line, 0.62)
    return fields, used_ranges


def normalize_table_cell(value):
    return clean(value).replace("\n", " ")


def extract_table_line_items(pages):
    items = []
    for page in pages:
        for table in page.get("tables") or []:
            rows = [[normalize_table_cell(cell) for cell in row] for row in table if row]
            if len(rows) < 2:
                continue
            header_index = None
            for index, row in enumerate(rows[:5]):
                joined = " ".join(row).upper()
                if any(token in joined for token in ["ARTICLE", "ARTIC", "ITEM", "CONCEPTO", "DESCRIP", "DESCRIPTION"]) and any(token in joined for token in ["TOTAL", "SUBTOTAL", "PREU", "PRICE", "PRECIO", "IMPORTE"]):
                    header_index = index
                    break
            if header_index is None:
                continue
            headers = [normalizePdfHeader(cell) for cell in rows[header_index]]
            for row in rows[header_index + 1:]:
                if not any(row):
                    continue
                mapped = dict(zip(headers, row))
                description = first_existing(mapped, ["DESCRIPCIO", "DESCRIPCION", "DESCRIPTION", "CONCEPTO", "ARTICLE", "ARTICULO", "ITEM"])
                quantity = first_existing(mapped, ["UNITATS", "UNIDADES", "UNITS", "QTY", "CANTIDAD", "QUANTITY"])
                unit_price = first_existing(mapped, ["PREU", "PRICE", "PRECIO", "UNIT PRICE"])
                total = first_existing(mapped, ["TOTAL", "SUBTOTAL", "IMPORTE", "AMOUNT"])
                description = clean(description)
                row_text = clean(" ".join(row))

                if is_summary_line_text(description) or is_summary_line_text(row_text):
                    continue

                parsed_total = parse_amount(total) if total else None
                parsed_quantity = parse_amount(quantity) if quantity else None
                parsed_unit_price = parse_amount(unit_price) if unit_price else None

                if description and parsed_total is not None:
                    items.append({
                        "description": description,
                        "quantity": parsed_quantity,
                        "unitPrice": parsed_unit_price,
                        "total": parsed_total,
                    })
    return items[:200]


def extract_text_table_line_items(lines):
    items = []
    in_table = False
    continuation = None
    for line in lines:
        upper = line.upper()
        if any(token in upper for token in ["ARTICLE", "ARTICULO", "ARTIC", "CONCEPTO", "DESCRIP"]) and any(token in upper for token in ["TOTAL", "SUBTOTAL", "PREU", "PRICE", "PRECIO", "IMPORTE"]):
            in_table = True
            continue
        if in_table and any(token in upper for token in [
            "MERCHANDISE SUBTOTAL", "SHIPPING", "FREIGHT", "SALES TAX", "AMOUNT DUE", "GRAND TOTAL", "BALANCE DUE",
            "OBSERVACIONES", "OBSERVACIONS", "TOTAL FACTURA", "BASE IMPONIBLE",
            "PENDIENTE", "VENCIMIENTO", "VENCIMENT", "FORMA DE PAGO",
            "FORMA DE PAGAMENT", "METODO DE PAGO", "MÉTODO DE PAGO",
            "CUENTA DE PAGO", "PAYMENT", "IBAN",
        ]):
            break
        if not in_table:
            continue

        amounts = MONEY_RE.findall(line)
        if not amounts:
            if continuation is not None and re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}", line) and len(line) <= 120:
                continuation["description"] = clean(f"{continuation['description']} {line}")[:220]
            continue
        total = parse_amount(amounts[-1])
        unit_price = parse_amount(amounts[0]) if amounts else None
        without_amounts = MONEY_RE.sub(" ", line)
        parts = clean(without_amounts).split()
        if len(parts) < 2:
            continue

        quantity = None
        quantity_index = None
        for index in range(len(parts) - 1, -1, -1):
            candidate = parse_amount(parts[index])
            if candidate is not None and candidate <= 100000:
                quantity = candidate
                quantity_index = index
                break

        if quantity_index is None:
            description = clean(" ".join(parts))
        else:
            description = clean(" ".join(parts[:quantity_index]))

        description = re.sub(r"^[A-Z0-9./_-]+\s+", "", description).strip()
        has_letters = bool(re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}", description))
        if description and has_letters and total is not None and not is_summary_line_text(description):
            item = {
                "description": description[:220],
                "quantity": quantity,
                "unitPrice": unit_price,
                "total": total,
            }
            items.append(item)
            continuation = item

    return items[:200]


def group_words_by_visual_line(words, tolerance=3.5):
    lines = []
    for word in sorted(words, key=lambda item: ((float(item.get("y1") or 0) + float(item.get("y2") or 0)) / 2, float(item.get("x1") or 0))):
        y_center = (float(word.get("y1") or 0) + float(word.get("y2") or 0)) / 2
        placed = False
        for line in lines:
            if abs(line["y"] - y_center) <= max(tolerance, line.get("height", 0) * 0.55):
                line["words"].append(word)
                line["y"] = (line["y"] * (len(line["words"]) - 1) + y_center) / len(line["words"])
                line["height"] = max(line.get("height", 0), float(word.get("y2") or 0) - float(word.get("y1") or 0))
                placed = True
                break
        if not placed:
            lines.append({
                "y": y_center,
                "height": float(word.get("y2") or 0) - float(word.get("y1") or 0),
                "words": [word],
            })
    for line in lines:
        line["words"].sort(key=lambda item: float(item.get("x1") or 0))
        line["text"] = clean(" ".join(word.get("text") or "" for word in line["words"]))
    return lines


def party_from_visual_lines(lines):
    values = [clean(line) for line in lines if clean(line)]
    values = [line for line in values if not re.fullmatch(r"\d{3,}", line)]
    if not values:
        return {"name": "", "address": "", "taxId": "", "email": "", "phone": ""}
    name_index = next((index for index, line in enumerate(values) if re.search(
        r"(?:[A-Za-z].*(?:S\.?P\.?A\.?|S\.?A\.?|S\.?R\.?L\.?|LTD\.?|LLC|INC\.?|GMBH|SAS|BV|COMPANY|CORP)|(?:有限公司|有限责任公司|公司))",
        line, re.I
    )), 0)
    name = re.sub(r"^(?:Kunde|Customer|Client|Cliente|Bill\s*to)\s*[:.-]?\s*", "", values[name_index], flags=re.I)
    contact_text = "\n".join(values)
    address_tokens = re.compile(
        r"\b(?:calle|c\/|cl\.?|av\.?|avenida|via|viale|street|st\.?|road|rd\.?|rue|platz|strasse|straße|"
        r"passeig|plaza|plaça|ct\.?|carretera|piso|floor|col\.?|postal|cp|zip|"
        r"españa|spain|italia|italy|mexico|méxico|barcelona|madrid|milano)\b|\b\d{4,6}\b|"
        r"(?:中国|省|市|区|县|路|街道|大道|号|楼|室)",
        re.I
    )
    address_lines = []
    for index, line in enumerate(values):
        if index == name_index or EMAIL_RE.search(line) or TAX_ID_RE.search(line):
            continue
        if re.search(r"\b(?:Tel|Phone|Fax)\b", line, re.I):
            continue
        if DATE_RE.search(line) or re.search(r"factura|invoice|client|customer|num\.?\s*factura|data\s*:", line, re.I):
            continue
        if address_tokens.search(line):
            address_lines.append(line)
    labeled_phone = ""
    for line in values:
        phone_label = re.search(r"\b(?:Tel|Phone)\.?\s*[:.-]?\s*([+()\d][+()\d\s.-]{7,})", line, re.I)
        if phone_label:
            labeled_phone = normalize_phone(phone_label.group(1))
            if labeled_phone:
                break
    return {
        "name": name,
        "address": clean(", ".join(address_lines)),
        "taxId": first_match(TAX_ID_RE, contact_text),
        "email": first_match(EMAIL_RE, contact_text),
        "phone": labeled_phone or find_first_phone(contact_text),
    }


def extract_top_text_party(lines):
    top = [clean(line) for line in lines[:20] if clean(line)]
    name_index = next((index for index, line in enumerate(top) if re.search(
        r"(?:S\.?P\.?A\.?|S\.?A\.?|S\.?R\.?L\.?|LTD\.?|LLC|INC\.?|GMBH|SAS|BV|COMPANY|CORP)\s*$",
        line, re.I
    )), None)
    if name_index is None:
        return {}
    chunk = [top[name_index]]
    for line in top[name_index + 1:name_index + 6]:
        if re.search(r"(?:S\.?P\.?A\.?|S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?(?:\s+DE)?\s+C\.?V\.?|LTD\.?|LLC|INC\.?|GMBH|SAS|BV|COMPANY|CORP)\s*$", line, re.I):
            break
        chunk.append(line)
    party = party_from_visual_lines(chunk)
    party["name"] = top[name_index]
    return party


def extract_layout_parties(pages):
    """Extrae emisor y receptor usando la geometria, incluso en facturas escaneadas."""
    if not pages:
        return {}, {}, {}
    page = pages[0]
    words = page.get("words") or []
    if not words:
        return {}, {}, {}
    visual_lines = group_words_by_visual_line(words)
    marker_line = next((line for line in visual_lines if any(
        token in strip_accents(line.get("text") or "").upper()
        for token in ["DELIVERY TO", "SHIP TO", "MESSRS", "BILL TO", "CUSTOMER"]
    )), None)
    invoice_line = next((line for line in visual_lines if re.search(
        r"\b(?:INVOICE|FACTURA)\b", line.get("text") or "", re.I
    ) and (not marker_line or line["y"] > marker_line["y"])), None)

    marker_y = marker_line["y"] if marker_line else float(page.get("height") or 0) * 0.18
    end_y = invoice_line["y"] if invoice_line else float(page.get("height") or 0) * 0.48
    width = float(page.get("width") or 0)
    midpoint = width * 0.47

    issuer_lines = [line["text"] for line in visual_lines if line["y"] < marker_y - 4]
    issuer = party_from_visual_lines(issuer_lines[:6])

    left_lines = []
    right_lines = []
    for line in visual_lines:
        if not (marker_y + 3 < line["y"] < end_y - 3):
            continue
        left_words = [word for word in line["words"] if float(word.get("x1") or 0) < midpoint]
        right_words = [word for word in line["words"] if float(word.get("x1") or 0) >= midpoint]
        left_text = clean(" ".join(word.get("text") or "" for word in left_words))
        right_text = clean(" ".join(word.get("text") or "" for word in right_words))
        if left_text:
            left_lines.append(left_text)
        if right_text:
            right_lines.append(right_text)

    delivery = party_from_visual_lines(left_lines)
    recipient = party_from_visual_lines(right_lines)

    # Segundo patron habitual: emisor y cliente son dos bloques independientes,
    # cada uno encabezado por una razon social y seguido por su direccion.
    company_pattern = re.compile(
        r"(?:S\.?P\.?A\.?|S\.?L\.?|S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?(?:\s+DE)?\s+C\.?V\.?|"
        r"LTD\.?|LLC|INC\.?|GMBH|SAS|BV|COMPANY|CORP)\b|(?:有限公司|有限责任公司|公司)", re.I
    )
    company_candidates = []
    for index, line in enumerate(visual_lines):
        for same_side in [False, True]:
            side_words = [word for word in line["words"] if (float(word.get("x1") or 0) >= width / 2) == same_side]
            side_text = clean(" ".join(word.get("text") or "" for word in side_words))
            if not company_pattern.search(side_text):
                continue
            block = [side_text]
            for following in visual_lines[index + 1:]:
                if following["y"] - line["y"] > 90:
                    break
                following_words = [word for word in following["words"] if (float(word.get("x1") or 0) >= width / 2) == same_side]
                following_text = clean(" ".join(word.get("text") or "" for word in following_words))
                if not following_text:
                    continue
                if company_pattern.search(following_text) or re.search(r"ARTICLE|DESCRIP|OBSERV|FACTURA|INVOICE|PAYMENT|TOTAL", following_text, re.I):
                    break
                block.append(following_text)
            party = party_from_visual_lines(block)
            previous_text = " ".join(item.get("text") or "" for item in visual_lines[max(0, index - 5):index])
            company_candidates.append((party, bool(re.search(r"kunde|client|customer|bill\s*to|receptor|cliente", f"{side_text} {previous_text}", re.I))))

    labeled_customer = next((party for party, is_customer in company_candidates if is_customer and party.get("name")), None)
    unlabeled_supplier = next((party for party, is_customer in company_candidates if not is_customer and party.get("name")), None)
    if labeled_customer:
        recipient = labeled_customer
    if unlabeled_supplier:
        issuer = unlabeled_supplier

    labeled_address_parts = []
    for line in visual_lines:
        left_text = clean(" ".join(
            word.get("text") or "" for word in line["words"]
            if float(word.get("x1") or 0) < width / 2
        ))
        match = re.match(r"^(?:Adresse|Address|Direccion|Dirección|Ort|Land)\s*[:.-]?\s*(.+)$", left_text, re.I)
        if match and not DATE_RE.search(match.group(1)):
            labeled_address_parts.append(clean(match.group(1)))
    if recipient.get("name") and labeled_address_parts:
        recipient["address"] = clean(", ".join(dict.fromkeys(labeled_address_parts)))
    return issuer, recipient, delivery


def detect_invoice_table_columns(header_words, allow_partial=False):
    columns = []
    words = sorted(header_words, key=lambda item: float(item.get("x1") or 0))
    normalized = [normalize_header_key(word.get("text")) for word in words]

    def word_center(index):
        word = words[index]
        return (float(word.get("x1") or 0) + float(word.get("x2") or 0)) / 2

    def add_column(key, label, x_center, confidence=1):
        if any(existing["key"] == key for existing in columns):
            return
        columns.append({
            "key": key,
            "label": label,
            "x": x_center,
            "confidence": confidence,
        })

    for index, key in enumerate(normalized):
        next_key = normalized[index + 1] if index + 1 < len(normalized) else ""
        prev_key = normalized[index - 1] if index > 0 else ""
        if key in {"QTY", "QUANTITY", "CANTIDAD", "CANT", "UNIDADES", "UNITATS", "MENGE", "ANZAHL", "QUANTITE", "QUANTITA", "QUANTIDADE", "数量", "數量", "件数", "數目"}:
            add_column("quantity", "Cantidad", word_center(index))
        elif key in {"CODE", "CODIGO", "SKU", "REF", "REFERENCIA", "ARTICLE", "ARTICULO", "ITEM", "PRODUCT", "CODICE", "商品编号", "商品編號", "货号", "貨號", "编号", "編號"}:
            add_column("code", "Codigo", word_center(index))
        elif key in {"CONCEPTO", "DESCRIPTION", "DESCRIPCION", "DESCRIPCIO", "DESCRIPC", "BESCHREIBUNG", "BEZEICHNUNG", "LEISTUNG", "DESCRIZIONE", "DESCRICAO", "项目", "項目", "描述", "项目描述", "項目描述", "商品名称", "商品名稱", "品名", "服务内容", "服務內容"} or key.endswith("DESCRIPTION"):
            add_column("description", "Descripcion", word_center(index))
        elif key in {"PRECIO", "PREU", "PRICE", "EINZELPREIS", "STUCKPREIS", "STUECKPREIS", "PRIX", "PREZZO", "PRECO", "单价", "單價", "价格", "價格"}:
            if prev_key == "UNIT":
                add_column("unitPrice", "Precio ud.", (word_center(index - 1) + word_center(index)) / 2)
            else:
                add_column("unitPrice", "Precio ud.", word_center(index))
        elif key == "UNIT" and next_key == "PRICE":
            add_column("unitPrice", "Precio ud.", (word_center(index) + word_center(index + 1)) / 2)
        elif key in {"TOTAL", "AMOUNT", "IMPORTE", "BETRAG", "GESAMTPREIS", "MONTANT", "IMPORTO", "VALOR", "金额", "金額", "行金额", "行金額"}:
            add_column("total", "Total", word_center(index))
        elif key in {"DTE", "%DTE", "DTO", "DISCOUNT", "DESCUENTO", "RABAIS", "SCONTO", "折扣", "折让", "折讓"}:
            add_column("discount", "Descuento", word_center(index))
        elif key in {"IVA", "%IVA", "VAT", "TAX", "MWST", "UMSATZSTEUER", "税率", "稅率"}:
            add_column("taxRate", "IVA", word_center(index))
        elif (key in {"UNIT", "UNITS", "UNIDAD", "UM", "UOM", "UUM", "EINHEIT", "UNITE", "UNITA", "UNIDADE", "单位", "單位"} or key.endswith("UM")) and next_key != "PRICE":
            add_column("unit", "Unidad", word_center(index))

    # Cabeceras escaneadas pueden perder PRICE/AMOUNT aunque conserven DESCRIPTION
    # y UM. Reconstruimos la distribucion estandar a partir de la columna de unidad.
    keys = {column["key"] for column in columns}
    unit_column = next((column for column in columns if column["key"] == "unit"), None)
    if "description" in keys and unit_column:
        add_column("quantity", "Cantidad", unit_column["x"] + 63)
        add_column("unitPrice", "Precio ud.", unit_column["x"] + 128)
        add_column("total", "Total", unit_column["x"] + 210)

    columns.sort(key=lambda item: item["x"])
    important = {column["key"] for column in columns}
    if allow_partial:
        return columns if len(important) >= 2 else []
    if not ({"description", "code"} & important) or not ({"quantity", "unit", "total", "unitPrice"} & important):
        return []
    return columns


def assign_words_to_columns(line_words, columns, page):
    if not columns:
        return {}, None
    ordered_columns = sorted(columns, key=lambda item: item["x"])
    bounds = []
    for index, column in enumerate(ordered_columns):
        left = 0 if index == 0 else (ordered_columns[index - 1]["x"] + column["x"]) / 2
        right = float(page.get("width") or 999999) if index == len(ordered_columns) - 1 else (column["x"] + ordered_columns[index + 1]["x"]) / 2
        bounds.append((column["key"], left, right))

    mapped_words = {column["key"]: [] for column in ordered_columns}
    selected_words = []
    for word in line_words:
        x_center = (float(word.get("x1") or 0) + float(word.get("x2") or 0)) / 2
        for key, left, right in bounds:
            if left <= x_center < right:
                mapped_words[key].append(word)
                selected_words.append(word)
                break

    mapped_values = {
        key: clean(" ".join(word.get("text") or "" for word in words))
        for key, words in mapped_words.items()
    }
    if not selected_words:
        return mapped_values, None
    source_box = {
        "page": int(page.get("page") or 1),
        "x1": min(float(word["x1"]) for word in selected_words),
        "y1": min(float(word["y1"]) for word in selected_words),
        "x2": max(float(word["x2"]) for word in selected_words),
        "y2": max(float(word["y2"]) for word in selected_words),
        "pageWidth": float(page.get("width") or 0),
        "pageHeight": float(page.get("height") or 0),
    }
    return mapped_values, source_box


def normalize_invoice_item_text(value):
    text = clean(value)
    text = re.sub(r"\s*[¢©]\s*", " ", text)
    return clean(text)


def is_summary_line_text(value):
    key = normalize_header_key(value)
    if not key:
        return False
    summary_tokens = {
        "SHIPPING", "FREIGHT", "DELIVERY", "TRANSPORT", "PORTES", "ENVIO", "SALESTAX", "AMOUNTDUE", "BALANCEDUE", "GRANDTOTAL", "MERCHANDISESUBTOTAL",
        "SUBTOTAL", "TOTAL", "TOTALEUR", "BASEIMPONIBLE", "IVA", "VAT",
        "PENDIENTE", "BALANCE", "DISCOUNTRATE", "VATRATE", "PAYMENTREFNO",
        "ACCOUNTNO", "BANK", "BRANCHCODE", "DUE", "VENCIMIENTO",
        "VENCIMENT", "FORMADEPAGO", "FORMADEPAGAMENT", "METODODEPAGO",
        "METODEPAGO", "CUENTADEPAGO", "PAYMENT", "PAYMENTDETAILS",
        "IBAN", "EMAIL", "CONTACT", "CONTACTO", "TELEFONO", "PHONE",
        "FAX", "OTHERINFO", "RECIPIENTNAME", "BILLTO", "SHIPTO",
        "OBSERVACIONES", "OBSERVACIONS", "TERMS", "CONDICIONES",
        "BASEIMPOSABLE", "BASEBRUTA", "BASENETA", "CUOTAVAT", "QUOTAVA",
        "REGISTROMERCANTIL", "HOJA", "TOMO", "FOLIO",
        "NETTOBETRAG", "UMSATZSTEUER", "MEHRWERTSTEUER", "GESAMTBETRAG",
        "ENDBETRAG", "ZAHLUNGSHINWEIS", "RECHNUNGSDATUM",
        "IMPORTENETO", "IMPORTEBRUTO", "TOTALAPAGAR",
        "FALLIGKEITSDATUM", "FAELLIGKEITSDATUM", "USTIDNR", "ADRESSE",
        "小计", "小計", "合计", "合計", "总计", "總計", "价税合计", "價稅合計",
        "税额", "稅額", "增值税", "增值稅", "应付金额", "應付金額",
        "付款信息", "支付信息", "银行信息", "銀行信息", "备注", "備註",
    }
    if key in summary_tokens or any(key.startswith(token) for token in summary_tokens):
        return True
    if MONEY_RE.search(value or "") and not re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}", value or ""):
        return True
    return False

def is_product_table_header(line_text, columns):
    header = normalize_header_key(line_text)

    column_keys = {
        column.get("key")
        for column in columns
        if column.get("key")
    }

    product_header_tokens = {
        # Español / catalán
        "DESCRIPCION",
        "DESCRIPCIO",
        "CONCEPTO",
        "ARTICULO",
        "ARTICLE",
        "PRODUCTO",
        "PRODUCTE",
        "MERCANCIA",

        # Inglés
        "DESCRIPTION",
        "PRODUCT",
        "PRODUCTSERVICE",
        "ITEM",
        "GOODS",
        "SERVICE",
        "SKU",

        # Otros frecuentes
        "BEZEICHNUNG",
        "BESCHREIBUNG",
        "DESCRIZIONE",
        "DESCRIPTIONARTICLE",
    }

    rejected_header_tokens = {
        "GROSSWGT",
        "NETWGT",
        "GROSSWEIGHT",
        "NETWEIGHT",
        "PACKAGES",
        "PACKAGE",
        "PALLETS",
        "ROLLS",
        "AMOUNTS",
        "BANKDETAILS",
        "PAYMENTDETAILS",
        "SHIPPINGDETAILS",
        "TOTALWEIGHT",
    }

    if any(token in header for token in rejected_header_tokens):
        return False

    has_product_header = any(
        token in header
        for token in product_header_tokens
    )

    has_identity_column = bool(
        {"description", "code"} & column_keys
    )

    has_commercial_column = bool(
        {
            "quantity",
            "unit",
            "unitPrice",
            "total",
            "discount",
            "taxRate",
        } & column_keys
    )

    return (
        has_product_header
        and has_identity_column
        and has_commercial_column
    )

def product_table_group_score(items):
    if not items:
        return -1000

    score = 0

    for item in items:
        description = normalize_header_key(
            item.get("description")
        )

        if clean(item.get("code")):
            score += 3

        if item.get("quantity") is not None:
            score += 4

        if item.get("unitPrice") is not None:
            score += 4

        if item.get("total") is not None:
            score += 5

        if clean(item.get("unit")):
            score += 1

        if item.get("sourceBox"):
            score += 2

        if any(token in description for token in [
            "GROSSWGT",
            "NETWGT",
            "GROSSWEIGHT",
            "NETWEIGHT",
            "PACKAGES",
            "PALLETS",
            "ROLLS",
            "BANKDETAILS",
            "AMOUNTS",
        ]):
            score -= 12

    # Favorece calidad, no simplemente más filas.
    score += min(len(items), 10)

    return score

def extract_word_column_line_items(pages):
    table_groups = []

    for page in pages:
        visual_lines = group_words_by_visual_line(
            page.get("words") or []
        )

        active_columns = []
        table_started = False
        pending_description = []
        pending_source_box = None
        previous_y = None
        current_items = []

        for line in visual_lines:
            line_text = clean(line.get("text"))
            upper = strip_accents(line_text).upper()

            line_y = float(line.get("y") or 0)
            line_height = max(
                float(line.get("height") or 0),
                1,
            )

            detected_columns = detect_invoice_table_columns(
                line.get("words") or []
            )

            # ============================================================
            # Inicio de una tabla de productos
            # ============================================================
            if detected_columns:
                if is_product_table_header(
                    line_text,
                    detected_columns,
                ):
                    # Si ya había una tabla válida en esta página,
                    # la guardamos antes de comenzar la siguiente.
                    if current_items:
                        table_groups.append(current_items)

                    active_columns = detected_columns
                    table_started = True
                    pending_description = []
                    pending_source_box = None
                    previous_y = line_y
                    current_items = []
                    continue

                # Si ya estábamos dentro de una tabla y aparece otra
                # cabecera distinta, termina la tabla actual.
                if table_started:
                    break

                continue

            if not table_started or not active_columns:
                continue

            # ============================================================
            # Final explícito de la tabla de productos
            # ============================================================
            if is_summary_line_text(line_text):
                break

            if any(token in upper for token in [
                "SUB TOTAL",
                "SUBTOTAL",
                "MERCHANDISE SUBTOTAL",
                "BASE IMPONIBLE",
                "NETTOBETRAG",
                "UMSATZSTEUER",
                "MEHRWERTSTEUER",
                "SALES TAX",
                "SHIPPING",
                "FREIGHT",
                "AMOUNT DUE",
                "BALANCE DUE",
                "GRAND TOTAL",
                "GESAMTBETRAG",
                "ZAHLUNGSHINWEIS",
                "PAYMENT DETAILS",
                "BANK DETAILS",
                "BENEFICIARY",
                "IBAN",
                "SWIFT",
                "OBSERVACIONES",
                "TERMS AND CONDITIONS",
            ]):
                break

            # ============================================================
            # Asignar cada palabra a su columna visual
            # ============================================================
            values, source_box = assign_words_to_columns(
                line.get("words") or [],
                active_columns,
                page,
            )

            code = clean(values.get("code"))
            raw_description = clean(
                values.get("description")
            )

            description = normalize_invoice_item_text(
                raw_description or code
            )

            if code and raw_description:
                description = normalize_invoice_item_text(
                    f"{code} {raw_description}"
                )

            # ============================================================
            # Cantidad
            # ============================================================
            quantity_text = clean(
                values.get("quantity")
            )

            quantity = parse_amount(quantity_text)

            if quantity is None and quantity_text:
                quantity_tokens = re.findall(
                    r"-?\d+(?:[.,]\d+)?",
                    quantity_text,
                )

                if quantity_tokens:
                    quantity_token = quantity_tokens[-1]

                    quantity = parse_amount(
                        quantity_token
                    )

                    quantity_prefix = clean(
                        quantity_text.rsplit(
                            quantity_token,
                            1,
                        )[0]
                    )

                    if re.search(
                        r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}",
                        quantity_prefix,
                    ):
                        description = normalize_invoice_item_text(
                            f"{description} {quantity_prefix}"
                        )

            # ============================================================
            # Importes de la línea
            # ============================================================
            unit_price = parse_amount(
                values.get("unitPrice")
            )

            total = parse_amount(
                values.get("total")
            )

            discount = parse_amount(
                values.get("discount")
            )

            tax_rate = parse_amount(
                values.get("taxRate")
            )

            has_commercial_value = any(
                value is not None
                for value in [
                    quantity,
                    unit_price,
                    total,
                ]
            )

            has_identity = bool(
                code or description
            )

            # ============================================================
            # Línea únicamente descriptiva
            #
            # Se guarda temporalmente porque puede ser:
            # - continuación de la descripción;
            # - código o referencia del producto;
            # - composición;
            # - pedido relacionado.
            #
            # No se crea todavía una línea independiente.
            # ============================================================
            if (
                has_identity
                and not has_commercial_value
            ):
                # Una separación vertical grande indica que el bloque
                # anterior probablemente ya no pertenece al producto.
                if (
                    previous_y is not None
                    and line_y - previous_y
                    > line_height * 2.8
                ):
                    pending_description = []
                    pending_source_box = None

                pending_description.append(
                    description
                )

                pending_description = (
                    pending_description[-12:]
                )

                if pending_source_box is None:
                    pending_source_box = source_box

                previous_y = line_y
                continue

            # Una fila vacía no aporta nada.
            if (
                not has_identity
                and not has_commercial_value
            ):
                previous_y = line_y
                continue

            # ============================================================
            # Unir las descripciones anteriores con la fila económica
            # ============================================================
            if pending_description:
                useful_description = [
                    part
                    for part in pending_description
                    if not re.search(
                        r"^(?:"
                        r"BANK\s+DETAILS"
                        r"|BENEFICIARY"
                        r"|IBAN"
                        r"|SWIFT"
                        r"|WARNING"
                        r")",
                        part,
                        re.I,
                    )
                ]

                if useful_description:
                    description = (
                        normalize_invoice_item_text(
                            " ".join(
                                useful_description
                                + (
                                    [description]
                                    if description
                                    else []
                                )
                            )
                        )
                    )

                pending_description = []
                pending_source_box = None

            if not description:
                description = (
                    code
                    or "Línea de factura"
                )

            if is_summary_line_text(
                description
            ):
                previous_y = line_y
                continue

            # ============================================================
            # Añadir línea de producto
            # ============================================================
            current_items.append({
                "code": code,
                "description": description[:220],
                "quantity": quantity,
                "unit": clean(
                    values.get("unit")
                ),
                "unitPrice": unit_price,
                "discount": discount,
                "taxRate": tax_rate,
                "total": total,
                "sourceBox": source_box,
            })

            previous_y = line_y

        # Guardar el grupo detectado en esta página.
        if current_items:
            table_groups.append(current_items)

        # No añadimos pending_description al finalizar.
        # Si no llegó una cantidad, precio o total, podría ser:
        # texto legal, banco, transporte, notas o condiciones.

    if not table_groups:
        return []

    best_group = max(
        table_groups,
        key=product_table_group_score,
    )

    return best_group[:200]

def extract_multipage_split_line_items(pages):
    """Une columnas de una misma tabla que el documento reparte entre paginas."""
    page_fragments = []
    for page in pages:
        visual_lines = group_words_by_visual_line(page.get("words") or [])
        active_columns = []
        fragments = []
        for line in visual_lines:
            line_text = line.get("text") or ""
            detected_columns = detect_invoice_table_columns(line.get("words") or [], allow_partial=True)
            if detected_columns:
                active_columns = detected_columns
                continue
            if not active_columns:
                continue
            if is_summary_line_text(line_text):
                break
            values, source_box = assign_words_to_columns(line.get("words") or [], active_columns, page)
            description = normalize_invoice_item_text(values.get("description") or values.get("code") or "")
            if values.get("code") and values.get("description"):
                description = normalize_invoice_item_text(f"{values.get('code')} {values.get('description')}")
            quantity = parse_amount(values.get("quantity"))
            unit_price = parse_amount(values.get("unitPrice"))
            total_value = parse_amount(values.get("total"))
            has_identity = bool(description)
            has_financial = unit_price is not None or total_value is not None
            has_quantity = quantity is not None
            if not (has_identity or has_financial or has_quantity):
                continue
            if not has_identity and not has_financial:
                continue
            if not has_identity and all(value in (None, 0, 0.0) for value in (unit_price, total_value)):
                continue
            if description and is_summary_line_text(description):
                continue
            fragments.append({
                "code": clean(values.get("code")),
                "description": description[:220],
                "quantity": quantity,
                "unit": clean(values.get("unit")),
                "unitPrice": unit_price,
                "discount": parse_amount(values.get("discount")),
                "taxRate": parse_amount(values.get("taxRate")),
                "total": total_value,
                "sourceBox": source_box,
            })
        
        if fragments:
            page_fragments.append(fragments)

    identity_groups = [group for group in page_fragments if any(item.get("description") for item in group)]
    financial_groups = [group for group in page_fragments if not any(item.get("description") for item in group) and any(
        item.get("unitPrice") is not None or item.get("total") is not None for item in group
    )]
    if not identity_groups or not financial_groups:
        return []
    base = max(identity_groups, key=lambda group: sum(bool(item.get("description")) for item in group))
    supplement = min(financial_groups, key=lambda group: abs(len(group) - len(base)))
    if len(base) != len(supplement):
        return []
    merged = []
    for identity, financial in zip(base, supplement):
        item = dict(identity)
        for key in ("unit", "unitPrice", "discount", "taxRate", "total"):
            if item.get(key) in (None, "") and financial.get(key) not in (None, ""):
                item[key] = financial[key]
        merged.append(item)
    return merged


def line_item_score(items):
    if not items:
        return 0
    score = 0
    for item in items:
        description = normalize_key(item.get("description"))
        if item.get("total") is not None:
            score += 4
        if item.get("quantity") is not None:
            score += 1
        if item.get("unitPrice") is not None:
            score += 1
        else:
            score -= 1
        if item.get("sourceBox"):
            score += 1
        if len(description) >= 4:
            score += 1
        if is_summary_line_text(item.get("description")):
            score -= 8
        if "EMAIL" in description or "CONTACT" in description or "SUBTOTAL" in description or "TOTAL" == description:
            score -= 4
        if any(token in description for token in ["GROSSWGT", "NETWGT", "EXPIRY", "NONIMPART", "INVOICINGPOLICY"]):
            score -= 7
        if item.get("quantity") is not None and float(item.get("quantity")) > 100000:
            score -= 4
    return score + min(len(items), 30)


def choose_line_items(*candidates):
    valid = [candidate for candidate in candidates if candidate]
    if not valid:
        return []
    selected = max(valid, key=line_item_score)
    return [
        item for item in selected
        if clean(item.get("description"))
        and not is_summary_line_text(item.get("description"))
        and (
            bool(re.search(r"(?:[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}|[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]{2,})", item.get("description") or ""))
            or item.get("total") is not None
        )
    ][:200]


def normalizePdfHeader(value):
    return re.sub(r"[^A-Z0-9]+", " ", clean(value).upper()).strip()


def first_existing(mapped, keys):
    for wanted in keys:
        for key, value in mapped.items():
            if wanted in key and clean(value):
                return clean(value)
    return ""


def normalize_match_text(value):
    return normalize_key(value)


def search_variants_for_value(value):
    raw = clean(value)
    variants = [raw]
    amount = parse_amount(raw)
    if amount is not None:
        variants.extend([
            f"{amount:.2f}",
            f"{amount:.2f}€",
            f"{amount:.2f}EUR",
            f"{amount:.2f} EUR",
            f"{amount:.2f}".replace(".", ","),
            f"{amount:.2f}".replace(".", ",") + "€",
            f"{amount:.2f}".replace(".", ",") + " EUR",
        ])
    date = first_match(DATE_RE, raw)
    if date:
        variants.append(date.replace("/", "-"))
        variants.append(date.replace("-", "/"))
    seen = set()
    unique = []
    for variant in variants:
        key = normalize_match_text(variant)
        if key and key not in seen:
            seen.add(key)
            unique.append(variant)
    return unique


def box_for_words(words, start, end, page):
    selected = words[start:end]
    if not selected:
        return None
    return {
        "page": int(page.get("page") or 1),
        "x1": min(float(word["x1"]) for word in selected),
        "y1": min(float(word["y1"]) for word in selected),
        "x2": max(float(word["x2"]) for word in selected),
        "y2": max(float(word["y2"]) for word in selected),
        "pageWidth": float(page.get("width") or 0),
        "pageHeight": float(page.get("height") or 0),
    }


def find_text_box(pages, value):
    needles = [normalize_match_text(variant) for variant in search_variants_for_value(value)]
    needles = [needle for needle in needles if needle and len(needle) >= 2]
    if not needles:
        return None

    for page in pages:
        words = page.get("words") or []
        normalized_words = [normalize_match_text(word.get("text")) for word in words]
        for start in range(len(words)):
            combined = ""
            for end in range(start, min(len(words), start + 12)):
                combined += normalized_words[end]
                if not combined:
                    continue
                if combined in needles:
                    box = box_for_words(words, start, end + 1, page)
                    if not box:
                        continue
                    page_area = max(1, float(box.get("pageWidth") or 0) * float(box.get("pageHeight") or 0))
                    box_area = max(1, (box["x2"] - box["x1"]) * (box["y2"] - box["y1"]))
                    if box_area / page_area <= 0.18:
                        return box
                if len(combined) > max(len(needle) for needle in needles) + 18:
                    break
    return None


def attach_source_boxes(invoice, pages):
    for field in invoice.get("fields") or []:
        value = field.get("value") or ""
        box = find_text_box(pages, value)
        if box:
            field["sourceBox"] = box

    for item in invoice.get("lineItems") or []:
        if item.get("sourceBox"):
            continue
        description = clean(item.get("description") or "")
        tokens = description.split()
        candidates = [
            description,
            " ".join(tokens[:4]) if len(tokens) >= 4 else "",
            " ".join(tokens[:3]) if len(tokens) >= 3 else "",
            " ".join(tokens[:2]) if len(tokens) >= 2 else "",
            format_amount(item.get("total")) if item.get("total") is not None else "",
        ]
        box = None
        for value in candidates:
            box = find_text_box(pages, value)
            if box:
                break
        if box:
            item["sourceBox"] = box

    return invoice


def build_invoice(pages, file_name):
    text = "\n".join(page["text"] for page in pages)
    lines = [clean(line) for line in text.splitlines() if clean(line)]
    currency = detect_currency(text)
    language = detect_language(text)

    invoice_number = find_invoice_number(text, lines)
    invoice_date = find_date_by_labels(text, lines, [
        "Fecha de emisión", "Fecha de emision", "Data d'emissió", "Data d'emissio",
        "Issue date", "Date issued", "Ausstellungsdatum", "Fecha factura", "Invoice date", "Fecha", "Data", "Date", "Rechnungsdatum",
        "Date de facture", "Date facture", "Data fattura", "Data da fatura",
        "Factuurdatum", "开票日期", "開票日期", "发票日期", "發票日期", "請求日", "請求書日付", "청구서 날짜",
        "تاريخ الفاتورة", "Дата счета",
    ]) or extract_clean_date(text)
    due_date = find_date_by_labels(text, lines, [
        "Fecha vencimiento", "Vencimiento", "Venciment", "Due date", "Payment due",
        "Vencimiento pago", "Due", "Fälligkeitsdatum", "Zahlungsziel",
        "Date d'echeance", "Date d'échéance", "Scadenza", "Data de vencimento",
        "Vervaldatum", "到期日", "支払期限", "만기일", "تاريخ الاستحقاق", "Срок оплаты",
    ])

    total = find_best_total(text, lines)
    subtotal = find_amount_after_label(text, [
        "subtotal", "base imponible", "net amount", "base", "taxable amount",
        "netto", "sous-total", "sous total", "subtotale", "subtotaal",
        "不含税金额", "不含稅金額", "未税金额", "未稅金額", "税前金额", "稅前金額", "小计", "小計", "소계", "المجموع الفرعي",
    ])
    tax = find_amount_after_label(text, [
        "iva", "vat", "tax", "impuesto", "taxes", "mwst", "tva",
        "umsatzsteuer", "mehrwertsteuer", "imposta", "impostos", "btw", "增值税", "税", "부가세", "ضريبة", "налог",
    ])
    paid = find_amount_near(text, ["amount paid", "paid amount", "importe pagado", "pagado", "bezahlt", "pagato", "已付", "支払済", "مدفوع"])
    due = find_amount_near(text, ["balance due", "amount due", "total due", "outstanding", "pendiente", "saldo pendiente", "offen", "reste a payer", "da pagare", "未付", "미납", "مستحق"])

    supplier = extract_party(lines, [
        "proveedor", "supplier", "from", "emisor", "seller", "vendor", "issuer",
        "fournisseur", "fornitore", "fornecedor", "lieferant", "verkaufer",
        "leverancier", "供应商", "卖方", "仕入先", "판매자", "المورد",
    ])
    customer = extract_party(lines, [
        "cliente", "customer", "bill to", "facturar a", "receptor", "client", "buyer",
        "billed to", "ship to", "destinatario", "acheteur", "cliente", "kunde",
        "klant", "客户", "买方", "顧客", "구매자", "العميل",
    ])
    layout_supplier, layout_customer, layout_delivery = extract_layout_parties(pages)
    top_supplier = extract_top_text_party(lines)
    if top_supplier.get("name"):
        layout_supplier = {
            key: top_supplier.get(key) or layout_supplier.get(key) or ""
            for key in ["name", "address", "taxId", "email", "phone"]
        }
    if layout_supplier.get("name"):
        supplier = {
            key: supplier.get(key) or layout_supplier.get(key) or ""
            for key in ["name", "address", "taxId", "email", "phone"]
        }
    if layout_customer.get("name"):
        customer = {
            key: (
                layout_customer.get(key) or customer.get(key) or ""
                if key in {"name", "address", "taxId"}
                else customer.get(key) or layout_customer.get(key) or ""
            )
            for key in ["name", "address", "taxId", "email", "phone"]
        }
    detected_fields = extract_priority_invoice_fields(text, lines, currency or "EUR")
    for field in extract_generic_fields(text, lines):
        add_field(detected_fields, field["section"], field["label"], field["value"], field["confidence"])
    for field in extract_adjacent_label_fields(text, lines):
        add_field(detected_fields, field["section"], field["label"], field["value"], field["confidence"])
    party_fields, _ = extract_party_blocks(lines)
    for field in party_fields:
        add_field(detected_fields, field["section"], field["label"], field["value"], field["confidence"])
    if layout_delivery.get("name"):
        add_field(detected_fields, "Cliente", "Destinatario de entrega", layout_delivery.get("name"), 0.9)
        add_field(detected_fields, "Cliente", "Direccion de entrega", layout_delivery.get("address"), 0.86)

    if not supplier["email"]:
        supplier["email"] = first_match(EMAIL_RE, text)
    if not supplier["phone"]:
        supplier["phone"] = find_first_phone(text)
    if not supplier["name"]:
        supplier_name = next((field["value"] for field in detected_fields if field["section"] == "Emisor" and field["label"] == "Nombre"), "")
        supplier["name"] = supplier_name
    if not customer["name"]:
        customer_name = next((field["value"] for field in detected_fields if field["section"] == "Cliente" and field["label"] == "Nombre"), "")
        customer["name"] = customer_name
    customer_phone_digits = re.sub(r"\D", "", customer.get("phone") or "")
    customer_tax_digits = re.sub(r"\D", "", customer.get("taxId") or "")
    if customer_phone_digits and customer_tax_digits and customer_phone_digits == customer_tax_digits:
        customer["phone"] = ""

    structured_line_items = choose_line_items(
        extract_multipage_split_line_items(pages),
        extract_table_line_items(pages),
        extract_word_column_line_items(pages),
    )

    if structured_line_items:
        line_items = structured_line_items
    else:
        line_items = choose_line_items(
            extract_text_table_line_items(lines),
            extract_line_items(lines),
        )
    if total is None and line_items:
        line_totals = [item.get("total") for item in line_items if item.get("total") is not None]
        if line_totals:
            total = round(sum(line_totals), 2)
            add_field(detected_fields, "Importes", "Total detectado por lineas", f"{total:.2f}", 0.7)
    # Un NIF/VAT largo no es un importe fiscal. Si no existe una linea explicita
    # y razonable de impuestos, la factura se considera con impuestos 0.
    if tax is None or tax < 0 or tax > 10000000 or (total is not None and tax > total * 2):
        tax = 0.0
    if subtotal is None and total is not None and tax is not None:
        subtotal = round(total - tax, 2)

    add_field(detected_fields, "Factura", "Tipo", guess_invoice_type(text), 0.95)
    add_field(detected_fields, "Factura", "Numero de factura", invoice_number, 0.95)
    add_field(detected_fields, "Factura", "Fecha", invoice_date, 0.95)
    add_field(detected_fields, "Factura", "Vencimiento", due_date, 0.9)
    add_field(detected_fields, "Factura", "Moneda", currency, 0.8)
    add_field(detected_fields, "Factura", "Idioma detectado", language.get("name"), language.get("confidence", 0.75))
    add_field(detected_fields, "Importes", "Subtotal", format_amount(subtotal, currency or "EUR") if subtotal is not None else "", 0.92)
    add_field(detected_fields, "Importes", "IVA / impuestos", format_amount(tax, currency or "EUR") if tax is not None else "", 0.92)
    add_field(detected_fields, "Importes", "Total", format_amount(total, currency or "EUR") if total is not None else "", 0.96)
    add_field(detected_fields, "Pago", "IBAN", find_first_iban(text), 0.92)
    add_field(detected_fields, "Pago", "Forma de pago", find_label_value(text, ["Metodo de pago", "Payment method", "Forma de pago", "Forma de pagament"]), 0.78)
    for section, party in [("Emisor", supplier), ("Cliente", customer)]:
        add_field(detected_fields, section, "Nombre", party.get("name"), 0.94)
        add_field(detected_fields, section, "Direccion", party.get("address"), 0.9)
        add_field(detected_fields, section, "NIF / VAT", party.get("taxId"), 0.94)
        add_field(detected_fields, section, "Email", party.get("email"), 0.9)
        add_field(detected_fields, section, "Telefono", party.get("phone"), 0.86)
    add_field(detected_fields, "Emisor", "Proveedor / razon social", supplier.get("name"), 0.9)

    if line_items:
        descriptions = [clean(item.get("description")) for item in line_items if clean(item.get("description"))]
        quantities = [str(item.get("quantity")) for item in line_items if item.get("quantity") not in (None, "")]
        unit_prices = [
            format_amount(item.get("unitPrice"), currency or "EUR")
            for item in line_items
            if item.get("unitPrice") not in (None, "")
        ]
        add_field(detected_fields, "Mercancia", "Descripcion de la mercancia", "; ".join(descriptions[:5]), 0.86)
        add_field(detected_fields, "Mercancia", "Cantidades", ", ".join(quantities[:12]), 0.82)
        add_field(detected_fields, "Mercancia", "Precios unitarios", ", ".join(unit_prices[:8]), 0.82)

    detected_field_count = sum(1 for value in [
        invoice_number, invoice_date, due_date, total, subtotal, tax,
        supplier.get("name"), customer.get("name"), supplier.get("taxId"), customer.get("taxId")
    ] if value not in ("", None))
    detected_field_count = max(detected_field_count, len(detected_fields))

    invoice = {
        "fileName": file_name,
        "type": guess_invoice_type(text),
        "invoiceNumber": invoice_number,
        "date": invoice_date,
        "dueDate": due_date,
        "currency": currency,
        "language": language,
        "supplier": supplier,
        "customer": customer,
        "amounts": {
            "subtotal": subtotal,
            "tax": tax,
            "total": total,
            "paid": paid,
            "due": due,
        },
        "payment": {
            "iban": find_first_iban(text),
            "method": find_label_value(text, ["Metodo de pago", "Payment method", "Forma de pago", "Forma de pagament"]),
        },
        "lineItems": line_items,
        "fields": detected_fields,
        "rawTextSample": clean(text[:3000]),
        "detectedFields": detected_field_count,
    }

    invoice = attach_source_boxes(invoice, pages)
    invoice["fields"] = filter_invoice_fields(dedupe_fields(invoice.get("fields") or []), invoice)
    invoice["detectedFields"] = max(invoice["detectedFields"], len(invoice["fields"]))
    return invoice


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--project", default="")
    parser.add_argument("--file-name", default="")
    args = parser.parse_args()

    started = time.perf_counter()
    pdf_path = Path(args.pdf)
    file_name = args.file_name or pdf_path.name
    (pages, page_count), engine, problems, engines = read_pdf(str(pdf_path))

    if not pages:
        result = {
            "workspace": {
                "fileName": file_name,
                "pageCount": page_count,
                "invoice": None,
            },
            "report": {
                "selectedEngine": "invoice-none",
                "tablesDetected": 0,
                "rowsExtracted": 0,
                "precision": 0,
                "processMs": round((time.perf_counter() - started) * 1000),
                "problems": problems,
                "engines": engines or [{
                    "name": engine,
                    "status": "error",
                    "tablesDetected": 0,
                    "rowsExtracted": 0,
                    "precision": 0,
                    "processMs": round((time.perf_counter() - started) * 1000),
                    "problems": problems,
                }],
            },
        }
        print(json.dumps(result, ensure_ascii=True))
        return

    invoice = build_invoice(pages, file_name)
    has_text = bool(clean(invoice.get("rawTextSample")))
    precision = min(0.95, 0.35 + invoice["detectedFields"] * 0.06 + min(len(invoice["lineItems"]), 8) * 0.025)
    if not has_text:
        precision = min(precision, 0.08)
        problems.append("El PDF no contiene texto extraible. Para facturas escaneadas o imagenes hace falta OCR (Tesseract/pytesseract).")
    if not invoice["lineItems"]:
        problems.append("No se detectaron lineas de detalle con importes claros.")
    if not invoice["amounts"]["total"]:
        problems.append("No se detecto un total de factura fiable.")

    result = {
        "workspace": {
            "fileName": file_name,
            "pageCount": page_count,
            "invoice": invoice,
        },
        "report": {
            "selectedEngine": f"invoice-{engine}",
            "tablesDetected": 1 if invoice["lineItems"] else 0,
            "rowsExtracted": len(invoice["lineItems"]),
            "precision": round(precision, 2),
            "processMs": round((time.perf_counter() - started) * 1000),
            "problems": problems,
            "engines": [
                {
                    **engine_report,
                    "name": f"invoice-{engine_report.get('name', 'engine')}",
                    "tablesDetected": 1 if invoice["lineItems"] else 0,
                    "rowsExtracted": len(invoice["lineItems"]),
                    "precision": round(precision, 2),
                    "processMs": round((time.perf_counter() - started) * 1000),
                    "problems": engine_report.get("problems", []),
                }
                for engine_report in (engines or [{"name": engine, "status": "ok"}])
            ],
        },
    }
    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({
            "workspace": {"fileName": "", "pageCount": 0, "invoice": None},
            "report": {
                "selectedEngine": "invoice-error",
                "tablesDetected": 0,
                "rowsExtracted": 0,
                "precision": 0,
                "processMs": 0,
                "problems": [str(exc)],
                "engines": [],
            },
        }, ensure_ascii=True))
        sys.exit(0)

