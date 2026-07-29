'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
    extractProjectPdf,
    extractProjectInvoicePdf
} = require('./project-pdf-extractor');

const PRODUCT_ALIASES = [
    { key: 'item', tests: [/^(pos|item|linea|line|n[ºo]?\.?)$/i] },
    { key: 'partNo', tests: [/part\s*(no|number|num)/i, /\bpn\b/i, /referencia/i, /codigo/i, /code/i] },
    { key: 'description', tests: [/description/i, /descripcion/i, /designation/i, /concepto/i, /producto/i] },
    { key: 'model_type', tests: [/model/i, /modelo/i, /type/i, /tipo/i] },
    { key: 'qty', tests: [/qty/i, /quantity/i, /cantidad/i, /unidades?/i] },
    { key: 'units', tests: [/^unit/i, /unidad/i, /u\.?m\.?/i] },
    { key: 'weight', tests: [/weight/i, /peso/i] },
    { key: 'fn', tests: [/^fn$/i] },
    { key: 'measure', tests: [/measure/i, /medida/i] },
    { key: 'standard', tests: [/standard/i, /norma/i] },
    { key: 'errors', tests: [/error/i, /incidencia/i] }
];

const INVOICE_ALIASES = [
    { key: 'invoiceNumber', label: 'Numero de factura', tests: [/invoice\s*(no|number|num)/i, /factura/i, /numero/i] },
    { key: 'date', label: 'Fecha', tests: [/invoice\s*date/i, /^date$/i, /^fecha$/i] },
    { key: 'dueDate', label: 'Vencimiento', tests: [/due/i, /vencimiento/i] },
    { key: 'supplier', label: 'Proveedor / razon social', tests: [/supplier/i, /vendor/i, /proveedor/i, /emisor/i] },
    { key: 'customer', label: 'Cliente', tests: [/customer/i, /client/i, /cliente/i] },
    { key: 'subtotal', label: 'Subtotal', tests: [/subtotal/i, /base/i] },
    { key: 'tax', label: 'IVA / impuestos', tests: [/tax/i, /vat/i, /iva/i, /impuesto/i] },
    { key: 'total', label: 'Total', tests: [/total/i, /importe/i] },
    { key: 'currency', label: 'Moneda', tests: [/currency/i, /moneda/i] },
    { key: 'iban', label: 'IBAN', tests: [/iban/i, /cuenta/i, /account/i] },
    { key: 'incoterm', label: 'Incoterm', tests: [/incoterm/i] },
    { key: 'originCountry', label: 'Pais de origen', tests: [/origin/i, /pais.*origen/i] },
    { key: 'tariffCode', label: 'Fraccion arancelaria', tests: [/tariff/i, /arancel/i, /hs\s*code/i] },
    { key: 'customsValue', label: 'Valor en aduana', tests: [/customs/i, /aduana/i] }
];

function safeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function slugify(value, fallback) {
    const slug = safeText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return slug || fallback;
}

function normalizeHeader(label, index, aliases = PRODUCT_ALIASES) {
    const text = safeText(label);
    for (const alias of aliases) {
        if (alias.tests.some((test) => test.test(text))) return alias.key;
    }
    return slugify(text, `col_${index + 1}`);
}

function uniqueColumns(headers, aliases = PRODUCT_ALIASES) {
    const used = new Map();
    return headers.map((header, index) => {
        const label = safeText(header) || `Columna ${index + 1}`;
        const base = normalizeHeader(label, index, aliases);
        const count = Number(used.get(base) || 0) + 1;
        used.set(base, count);
        return {
            key: count > 1 ? `${base}_${count}` : base,
            label,
            dynamic: true
        };
    });
}

function rowNonEmptyCount(row) {
    return (row || []).filter((value) => safeText(value)).length;
}

function findHeaderIndex(rows) {
    let bestIndex = 0;
    let bestScore = -1;

    rows.slice(0, 30).forEach((row, index) => {
        const values = (row || []).map(safeText);
        const nonEmpty = values.filter(Boolean).length;
        if (nonEmpty < 2) return;

        const aliasHits = PRODUCT_ALIASES.reduce((count, alias) => (
            count + (values.some((value) => alias.tests.some((test) => test.test(value))) ? 1 : 0)
        ), 0);
        const score = (aliasHits * 4) + nonEmpty;
        if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
        }
    });

    return bestIndex;
}

function makeRowsFromMatrix(matrix, sourceName, pageLabel) {
    const usefulRows = matrix.filter((row) => rowNonEmptyCount(row));
    if (!usefulRows.length) {
        return { columns: [], rows: [], headerLabels: {} };
    }

    const headerIndex = findHeaderIndex(usefulRows);
    const headers = usefulRows[headerIndex] || [];
    const width = Math.max(...usefulRows.map((row) => row.length), headers.length);
    const normalizedHeaders = Array.from({ length: width }, (_, index) => safeText(headers[index]) || `Columna ${index + 1}`);
    const columns = uniqueColumns(normalizedHeaders);
    const rows = [];

    usefulRows.slice(headerIndex + 1).forEach((row, index) => {
        if (rowNonEmptyCount(row) === 0) return;
        const cells = {};
        columns.forEach((column, columnIndex) => {
            cells[column.key] = safeText(row[columnIndex]);
        });
        rows.push({
            id: `${slugify(sourceName, 'documento')}-${slugify(pageLabel, 'hoja')}-${index + 1}`,
            page: pageLabel,
            cells,
            columns,
            status: 'Pendiente'
        });
    });

    return {
        columns,
        rows,
        headerLabels: Object.fromEntries(columns.map((column) => [column.key, column.label]))
    };
}

function mergeColumns(left, right) {
    const map = new Map();
    [...left, ...right].forEach((column) => {
        if (!column?.key || map.has(column.key)) return;
        map.set(column.key, column);
    });
    return Array.from(map.values());
}

function looseText(value) {
    return safeText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function splitLooseCells(value) {
    return String(value ?? '')
        .split(/\s*\|\s*|\t+/)
        .map(safeText)
        .filter(Boolean);
}

function flattenMatrix(matrix) {
    return (matrix || [])
        .flatMap((row) => (row || []).flatMap(splitLooseCells))
        .map(safeText)
        .filter(Boolean);
}

function findFirstByLabel(tokens, tests) {
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (!tests.some((test) => test.test(looseText(token)))) continue;

        const sameCell = token.match(/[:：]\s*(.+)$/);
        if (sameCell?.[1]) return safeText(sameCell[1]);

        for (let next = index + 1; next < Math.min(tokens.length, index + 4); next += 1) {
            const value = safeText(tokens[next]);
            if (value && !tests.some((test) => test.test(looseText(value)))) return value;
        }
    }
    return '';
}

function findRegex(text, regex) {
    const match = String(text || '').match(regex);
    return match ? safeText(match[1] || match[0]) : '';
}

function matrixRowTexts(matrices) {
    return (matrices || [])
        .flatMap((entry) => (entry.matrix || []).map((row) => (
            (row || [])
                .map(safeText)
                .filter(Boolean)
                .join(' | ')
        )))
        .map(safeText)
        .filter(Boolean);
}

function findByRowLabel(rowTexts, tests) {
    for (const rowText of rowTexts || []) {
        const parts = splitLooseCells(rowText);
        const index = parts.findIndex((part) => tests.some((test) => test.test(looseText(part))));
        if (index < 0) continue;

        const sameCell = parts[index].match(/[:：]\s*(.+)$/);
        if (sameCell?.[1]) return safeText(sameCell[1]);

        for (let next = index + 1; next < parts.length; next += 1) {
            const value = safeText(parts[next]);
            if (value && !tests.some((test) => test.test(looseText(value)))) return value;
        }
    }
    return '';
}

function findValueByAnyLabel(rowTexts, tokenTexts, tests) {
    return findByRowLabel(rowTexts, tests) || findFirstByLabel(tokenTexts, tests);
}

function findAmountByRowLabel(rowTexts, tests) {
    const value = findByRowLabel(rowTexts, tests);
    const parsed = parseMoneyValue(value);
    if (parsed != null) return parsed;

    for (const rowText of rowTexts || []) {
        if (!tests.some((test) => test.test(looseText(rowText)))) continue;
        const rowParsed = parseMoneyValue(rowText);
        if (rowParsed != null) return rowParsed;
    }
    return null;
}

function inferInvoiceNumberFromFileName(fileName) {
    const base = path.basename(String(fileName || ''), path.extname(String(fileName || '')));
    const cleaned = safeText(base).replace(/[_-]+/g, ' ');
    const labeled = cleaned.match(/(?:invoice|factura|rechnung|inv|fac|f)\s*([A-Z0-9][A-Z0-9.-]{2,})/i);
    if (labeled?.[1]) return labeled[1].replace(/[.\s-]+$/g, '');
    const compact = cleaned.match(/\b[A-Z]{1,4}\d{2,}[A-Z0-9.-]*\b|\b\d{4,}\b/i);
    return compact ? compact[0].replace(/[.\s-]+$/g, '') : '';
}

function parseDateValue(value) {
    const text = safeText(value);
    if (!text || /[$€£¥]|eur|usd|gbp|cny|rmb/i.test(text)) return '';

    const numeric = text.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/);
    if (numeric) return numeric[1].replace(/\./g, '-');

    const chinese = text.match(/\b(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?\b/);
    if (chinese) return `${chinese[1]}-${chinese[2].padStart(2, '0')}-${chinese[3].padStart(2, '0')}`;

    const month = text.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
    if (month) return month[0];

    return '';
}

function parseMoneyValue(value) {
    const text = safeText(value);
    if (!text) return null;
    const moneyLike = text.match(/[-+]?\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{2})|[-+]?\d+(?:[,.]\d{2})?/g);
    if (!moneyLike?.length) return null;
    const raw = moneyLike[moneyLike.length - 1].replace(/\s/g, '');
    const normalized = raw.includes(',') && raw.lastIndexOf(',') > raw.lastIndexOf('.')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

function detectCurrency(text) {
    const value = String(text || '');
    if (/\bUSD\b|\$|美元/i.test(value)) return 'USD';
    if (/\bEUR\b|€|欧元/i.test(value)) return 'EUR';
    if (/\bGBP\b|£/i.test(value)) return 'GBP';
    if (/\bCNY\b|\bRMB\b|¥|人民币/i.test(value)) return 'CNY';
    return 'EUR';
}

function findIban(text) {
    const compact = String(text || '').replace(/\s+/g, ' ');
    const match = compact.match(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){8,34}\b/i);
    return match ? match[0].replace(/\s+/g, '').toUpperCase() : '';
}

function findInvoiceLanguage(text) {
    const value = String(text || '');
    if (/[\u4e00-\u9fff]/.test(value)) return 'Chino';
    if (/\b(rechnung|gesamtbetrag|fällig|faellig|zahlungsziel|ust-idnr)\b/i.test(value)) return 'Alemán';
    if (/\b(invoice|due date|subtotal|payment|customer|supplier)\b/i.test(value)) return 'Inglés';
    if (/\b(factura|vencimiento|subtotal|proveedor|cliente|iva)\b/i.test(value)) return 'Español';
    return '';
}

function addInvoiceField(invoice, section, label, value) {
    const cleanValue = safeText(value);
    if (!cleanValue || cleanValue === '-') return;

    invoice.fields.push({ section, label, value: cleanValue });
}

function extractLineItemsFromMatrix(matrix) {
    const rows = (matrix || [])
        .map((row) => (row || []).flatMap(splitLooseCells).map(safeText))
        .filter((row) => row.filter(Boolean).length >= 2);
    const headerTests = {
        description: /description|descripcion|descripcio|concepto|article|articulo|artikel|leistung|producto|mercancia|商品|项目|服务|名称/i,
        quantity: /qty|quantity|cantidad|unidades|units|menge|数量|cant/i,
        unitPrice: /unit\s*price|precio\s*ud|precio|preis|preu|单价/i,
        total: /^total$|importe|amount|subtotal|betrag|金额|总价|合计/i,
        code: /code|codigo|sku|referencia|part|编号/i
    };

    headerTests.description = /description|descripcion|descripcio|concepto|article|articulo|artikel|leistung|producto|mercancia|\u5546\u54c1|\u9879\u76ee|\u670d\u52a1|\u540d\u79f0/i;
    headerTests.quantity = /qty|quantity|cantidad|unidades|units|menge|\u6570\u91cf|cant/i;
    headerTests.unitPrice = /unit\s*price|precio\s*ud|precio|preis|preu|\u5355\u4ef7/i;
    headerTests.total = /^total$|importe|amount|subtotal|betrag|\u91d1\u989d|\u603b\u4ef7|\u5408\u8ba1/i;
    headerTests.code = /code|codigo|sku|referencia|part|\u7f16\u53f7/i;

    let headerIndex = -1;
    let map = {};

    rows.slice(0, 40).forEach((row, index) => {
        if (headerIndex >= 0) return;
        const hits = {};
        row.forEach((cell, cellIndex) => {
            Object.entries(headerTests).forEach(([key, test]) => {
                if (hits[key] == null && test.test(cell)) hits[key] = cellIndex;
            });
        });
        if (Object.keys(hits).length >= 2 && hits.description != null) {
            headerIndex = index;
            map = hits;
        }
    });

    const isBadLineDescription = (description) => {
        const value = safeText(description);
        if (!value || value === '-' || /^0+(?:[,.]0+)?$/.test(value)) return true;
        return /subtotal|iva|vat|tax|total|bank|payment|contact|iban|fecha|date|due|vencimiento|invoice|factura|rechnung/i.test(value);
    };

    const isQuantityValue = (value) => {
        const text = safeText(value);
        if (!text || parseDateValue(text)) return false;
        if (/[$€£¥]|eur|usd|gbp|cny|rmb/i.test(text)) return false;
        const normalized = text.replace(',', '.');
        return /^\d+(?:[,.]\d+)?$/.test(text) && Number.isFinite(Number(normalized));
    };

    const isAmountValue = (value) => {
        const text = safeText(value);
        if (!text || parseDateValue(text)) return false;
        const parsed = parseMoneyValue(text);
        if (parsed == null) return false;
        if (/[$€£¥]|\b(EUR|USD|GBP|CNY|RMB)\b/i.test(text)) return true;
        if (/\d+[,.]\d{2}\b/.test(text)) return true;
        return Math.abs(parsed) >= 10;
    };

    const isValidLineItem = (line) => (
        !isBadLineDescription(line?.description)
        && isQuantityValue(line?.quantity)
        && (isAmountValue(line?.unitPrice) || isAmountValue(line?.total))
    );

    if (headerIndex >= 0) {
        return rows.slice(headerIndex + 1)
            .map((row) => ({
                code: map.code != null ? safeText(row[map.code]) : '',
                description: map.description != null ? safeText(row[map.description]) : '',
                quantity: map.quantity != null ? safeText(row[map.quantity]) : '',
                unitPrice: map.unitPrice != null ? safeText(row[map.unitPrice]) : '',
                total: map.total != null ? safeText(row[map.total]) : ''
            }))
            .filter(isValidLineItem)
            .slice(0, 300);
    }

    return rows.map((row) => {
        const joined = row.join(' ');
        if (/^\s*$/.test(joined)) return null;
        const moneyIndexes = row
            .map((cell, index) => ({ cell, index }))
            .filter(({ cell }) => parseMoneyValue(cell) != null)
            .map(({ index }) => index);
        const quantityIndex = row.findIndex((cell) => /^\d+(?:[,.]\d+)?$/.test(cell));
        const effectiveMoneyIndexes = moneyIndexes.filter((index) => index !== quantityIndex);
        const descriptionIndex = row.findIndex((cell, index) => (
            index !== quantityIndex
            && !effectiveMoneyIndexes.includes(index)
            && /[A-Za-z\u00c0-\u024f\u4e00-\u9fff]/.test(cell)
            && cell.length > 2
        ));
        if (descriptionIndex < 0 || quantityIndex < 0 || !effectiveMoneyIndexes.length) return null;
        return {
            description: row[descriptionIndex],
            quantity: quantityIndex >= 0 ? row[quantityIndex] : '',
            unitPrice: effectiveMoneyIndexes.length > 1 ? row[effectiveMoneyIndexes[effectiveMoneyIndexes.length - 2]] : '',
            total: row[effectiveMoneyIndexes[effectiveMoneyIndexes.length - 1]]
        };
    }).filter(Boolean).filter(isValidLineItem).slice(0, 300);
}

function buildInvoiceFromMatrices({ fileName, pageCount, matrices }) {
    const tokens = matrices.flatMap((entry) => flattenMatrix(entry.matrix));
    const text = tokens.join(' ');
    const rowTexts = matrixRowTexts(matrices);
    const currency = detectCurrency(text);
    const invoiceNumber = findFirstByLabel(tokens, [
        /invoice\s*(no|number|num)?/i,
        /factura|n[uú]m\.?\s*factura|numero\s*de\s*factura/i,
        /rechnung|rechnungsnummer/i,
        /发票|编号|号码/i
    ]) || findRegex(text, /(?:INV|F|US|RE)[-\s]?[A-Z0-9]{2,}|\b\d{4,}\b/i);
    const date = parseDateValue(findFirstByLabel(tokens, [/invoice\s*date|^date$|fecha|rechnungsdatum|日期|开票日期/i]));
    const dueDate = parseDateValue(findFirstByLabel(tokens, [/due|vencimiento|f[aä]llig|faellig|zahlungsziel|到期|截止/i]));
    const subtotal = parseMoneyValue(findFirstByLabel(tokens, [/subtotal|sub\s*total|base\s*imponible|netto|未税|小计/i]));
    const tax = parseMoneyValue(findFirstByLabel(tokens, [/iva|vat|tax|impuesto|mwst|ust|税|增值税/i]));
    const total = parseMoneyValue(findFirstByLabel(tokens, [/grand\s*total|total|gesamtbetrag|amount\s*due|balance\s*due|pendiente|合计|总计|应付/i]));
    const email = findRegex(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const phone = findRegex(text, /(?:tel[eé]fono|tel\.?|phone|telefon)[:：]?\s*([+()\d][+()\d\s.-]{6,})/i);
    const iban = findIban(text) || findFirstByLabel(tokens, [/iban|bank\s*account|account\s*no|cuenta|konto|银行账号/i]);
    const taxId = findRegex(text, /\b(?:NIF|CIF|VAT|USt-IdNr\.?|DNI\/NIF)[:：]?\s*([A-Z0-9.-]{6,})/i);
    const supplier = findFirstByLabel(tokens, [/supplier|vendor|proveedor|emisor|razon\s*social|company|empresa|lieferant/i]);
    const customer = findFirstByLabel(tokens, [/customer|client|cliente|bill\s*to|receptor|kunde|客户/i]);
    const invoiceNumberFromRows = findValueByAnyLabel(rowTexts, tokens, [
        /invoice\s*(no|number|num)?/i,
        /factura|numero\s*de\s*factura|num\.?\s*factura/i,
        /rechnung|rechnungsnummer/i,
        /\u53d1\u7968|\u7f16\u53f7|\u53f7\u7801/i
    ]);
    const dateFromRows = parseDateValue(findValueByAnyLabel(rowTexts, tokens, [
        /invoice\s*date|^date$|fecha|rechnungsdatum|datum|\u65e5\u671f|\u5f00\u7968\u65e5\u671f/i
    ]));
    const dueDateFromRows = parseDateValue(findValueByAnyLabel(rowTexts, tokens, [
        /due|vencimiento|vence|faellig|fällig|zahlungsziel|\u5230\u671f|\u622a\u6b62/i
    ]));
    const subtotalFromRows = findAmountByRowLabel(rowTexts, [
        /subtotal|sub\s*total|base\s*imponible|netto|\u672a\u7a0e|\u5c0f\u8ba1/i
    ]);
    const taxFromRows = findAmountByRowLabel(rowTexts, [
        /iva|vat|tax|impuesto|mwst|ust|\u7a0e|\u589e\u503c\u7a0e/i
    ]);
    const totalFromRows = findAmountByRowLabel(rowTexts, [
        /grand\s*total|^total\b|gesamtbetrag|amount\s*due|balance\s*due|pendiente|\u5408\u8ba1|\u603b\u8ba1|\u5e94\u4ed8/i
    ]);
    const ibanFromRows = findValueByAnyLabel(rowTexts, tokens, [
        /iban|bank\s*account|account\s*no|cuenta|konto|\u94f6\u884c\u8d26\u53f7/i
    ]);
    const supplierFromRows = findValueByAnyLabel(rowTexts, tokens, [
        /supplier|vendor|proveedor|emisor|razon\s*social|company|empresa|lieferant|\u4f9b\u5e94\u5546|\u516c\u53f8/i
    ]);
    const customerFromRows = findValueByAnyLabel(rowTexts, tokens, [
        /customer|client|cliente|bill\s*to|receptor|kunde|\u5ba2\u6237/i
    ]);
    const allLineItems = matrices.flatMap((entry) => extractLineItemsFromMatrix(entry.matrix));
    const seenLines = new Set();
    const lineItems = allLineItems.filter((line) => {
        const key = `${line.description}|${line.quantity}|${line.unitPrice}|${line.total}`;
        if (seenLines.has(key)) return false;
        seenLines.add(key);
        return true;
    });

    const language = findInvoiceLanguage(text);
    const finalInvoiceNumber = invoiceNumberFromRows || invoiceNumber || inferInvoiceNumberFromFileName(fileName);
    const finalDate = dateFromRows || date;
    const finalDueDate = dueDateFromRows || dueDate;
    const finalSubtotal = subtotal != null ? subtotal : subtotalFromRows;
    const finalTax = tax != null ? tax : taxFromRows;
    const finalTotal = total != null ? total : totalFromRows;
    const finalIban = findIban(iban || ibanFromRows || text);
    const finalSupplier = supplier || supplierFromRows;
    const finalCustomer = customer || customerFromRows;
    const invoice = {
        type: /rechnung/i.test(text) ? 'Rechnung' : (/invoice/i.test(text) ? 'Invoice' : 'Documento importado'),
        fileName,
        pageCount,
        invoiceNumber: safeText(invoiceNumber).replace(/^[:：#\s]+/, ''),
        date,
        dueDate,
        currency,
        language,
        detectedLanguage: language,
        amounts: {},
        supplier: { name: supplier, email, phone, taxId },
        customer: { name: customer },
        payment: { iban: safeText(iban).replace(/\s+/g, '').toUpperCase() },
        fields: [],
        lineItems
    };

    if (subtotal != null) invoice.amounts.subtotal = subtotal;
    if (tax != null) invoice.amounts.tax = tax;
    if (total != null) invoice.amounts.total = total;

    invoice.invoiceNumber = safeText(finalInvoiceNumber).replace(/^[:：#\s]+/, '');
    invoice.date = finalDate;
    invoice.dueDate = finalDueDate;
    invoice.supplier.name = finalSupplier;
    invoice.customer.name = finalCustomer;
    invoice.payment.iban = safeText(finalIban || iban || ibanFromRows).replace(/\s+/g, '').toUpperCase();
    invoice.amounts = {};
    if (finalSubtotal != null) invoice.amounts.subtotal = finalSubtotal;
    if (finalTax != null) invoice.amounts.tax = finalTax;
    if (finalTotal != null) invoice.amounts.total = finalTotal;

    addInvoiceField(invoice, 'Factura', 'Numero de factura', invoice.invoiceNumber);
    addInvoiceField(invoice, 'Factura', 'Fecha', invoice.date);
    addInvoiceField(invoice, 'Factura', 'Vencimiento', invoice.dueDate);
    addInvoiceField(invoice, 'Factura', 'Moneda', invoice.currency);
    addInvoiceField(invoice, 'Factura', 'Idioma detectado', invoice.detectedLanguage);
    addInvoiceField(invoice, 'Fiscal', 'NIF / CIF / VAT', taxId);
    addInvoiceField(invoice, 'Pago', 'IBAN', invoice.payment.iban);
    addInvoiceField(invoice, 'Contacto', 'Email', email);
    addInvoiceField(invoice, 'Contacto', 'Telefono', phone);
    addInvoiceField(invoice, 'Emisor', 'Nombre', invoice.supplier.name);
    addInvoiceField(invoice, 'Cliente', 'Nombre', invoice.customer.name);

    invoice.detectedFields = invoice.fields.length;

    return invoice;
}

function findLibreOfficeBinary() {
    const configured = safeText(process.env.LIBREOFFICE_BIN);
    const candidates = configured
        ? [configured]
        : ['soffice.com', 'soffice', 'soffice.exe', 'libreoffice'];

    for (const candidate of candidates) {
        try {
            if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
            const command = process.platform === 'win32' ? 'where.exe' : 'which';
            const output = execFileSync(command, [candidate], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
                windowsHide: true
            });
            const binary = safeText(String(output).split(/\r?\n/)[0]);
            if (binary) return binary;
        } catch (error) {
            // Continue with the next candidate.
        }
    }

    return '';
}

function getSafeOfficeInputName(fileName) {
    const rawName = safeText(fileName) || 'documento';
    const rawExtension = path.extname(rawName) || '.docx';
    const extension = rawExtension.replace(/[^a-z0-9.]/gi, '').toLowerCase() || '.docx';
    const rawBase = path.basename(rawName, path.extname(rawName));
    const baseName = safeText(rawBase)
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || 'documento';

    return { baseName, extension };
}

function convertDocumentToPdf(filePath, fileName) {
    const binary = findLibreOfficeBinary();
    if (!binary) return null;

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alentio-document-pdf-'));
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alentio-lo-profile-'));
    const { baseName, extension } = getSafeOfficeInputName(fileName);
    const inputPath = path.join(outputDir, `${baseName}${extension}`);
    const outputName = `${baseName}.pdf`;
    const outputPath = path.join(outputDir, outputName);
    const profileUri = `file:///${profileDir.replace(/\\/g, '/')}`;
    const cleanup = () => {
        fs.rmSync(outputDir, { recursive: true, force: true });
        fs.rmSync(profileDir, { recursive: true, force: true });
    };

    try {
        fs.copyFileSync(filePath, inputPath);

        execFileSync(binary, [
            '--headless',
            '--nologo',
            '--nodefault',
            '--nofirststartwizard',
            '--nolockcheck',
            `-env:UserInstallation=${profileUri}`,
            '--convert-to',
            'pdf',
            '--outdir',
            outputDir,
            inputPath
        ], {
            stdio: ['ignore', 'ignore', 'pipe'],
            timeout: Number(process.env.LIBREOFFICE_TIMEOUT_MS || 120000),
            windowsHide: true
        });

        const generatedPath = fs.existsSync(outputPath)
            ? outputPath
            : fs.readdirSync(outputDir)
                .map((name) => path.join(outputDir, name))
                .find((entryPath) => path.extname(entryPath).toLowerCase() === '.pdf');

        return generatedPath
            ? {
                pdfPath: generatedPath,
                fileName: path.basename(generatedPath),
                cleanup
            }
            : null;
    } catch (error) {
        cleanup();
        return null;
    }
}

async function extractInvoiceDocumentAsPdf({ filePath, fileName, projectId, sourceDocumentKind }) {
    const converted = convertDocumentToPdf(filePath, fileName);
    if (!converted?.pdfPath) {
        const error = new Error('No se pudo convertir el documento a PDF. Revisa que LibreOffice este instalado y accesible en el servidor.');
        error.status = 500;
        throw error;
    }

    try {
        const result = await extractProjectInvoicePdf({
            projectId,
            pdfPath: converted.pdfPath,
            fileName: converted.fileName
        });
        const extractor = result.extractor || {};
        const convertedBuffer = fs.readFileSync(converted.pdfPath);

        return {
            workspace: {
                ...(extractor.workspace || {}),
                fileName: converted.fileName,
                originalFileName: fileName,
                convertedPdfFileName: converted.fileName,
                documentKind: 'pdf',
                sourceDocumentKind
            },
            report: {
                ...(extractor.report || {}),
                selectedEngine: `${sourceDocumentKind}-to-pdf+${extractor.report?.selectedEngine || 'invoice-pdf'}`,
                problems: extractor.report?.problems || []
            },
            convertedDocument: {
                buffer: convertedBuffer,
                fileName: converted.fileName,
                documentKind: 'pdf',
                originalFileName: fileName
            }
        };
    } finally {
        converted.cleanup();
    }
}

async function extractProductDocumentAsPdf({ filePath, fileName, projectId, sourceDocumentKind }) {
    const converted = convertDocumentToPdf(filePath, fileName);
    if (!converted?.pdfPath) {
        const error = new Error('No se pudo convertir el documento a PDF. Revisa que LibreOffice este instalado y accesible en el servidor.');
        error.status = 500;
        throw error;
    }

    try {
        const result = await extractProjectPdf({
            projectId,
            pdfPath: converted.pdfPath,
            fileName: converted.fileName
        });
        const extractor = result.extractor || {};
        const convertedBuffer = fs.readFileSync(converted.pdfPath);

        return {
            workspace: {
                ...(extractor.workspace || {}),
                fileName: converted.fileName,
                originalFileName: fileName,
                convertedPdfFileName: converted.fileName,
                documentKind: 'pdf',
                sourceDocumentKind
            },
            report: {
                ...(extractor.report || {}),
                selectedEngine: `${sourceDocumentKind}-to-pdf+${extractor.report?.selectedEngine || 'product-pdf'}`,
                problems: extractor.report?.problems || []
            },
            convertedDocument: {
                buffer: convertedBuffer,
                fileName: converted.fileName,
                documentKind: 'pdf',
                originalFileName: fileName
            }
        };
    } finally {
        converted.cleanup();
    }
}

function detectKind(fileName) {
    const extension = path.extname(String(fileName || '')).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(extension)) return 'spreadsheet';
    if (extension === '.docx') return 'word';
    if (extension === '.doc') return 'legacy-word';
    return 'unknown';
}

async function extractProjectDocument({ documentPath, fileName, projectId, documentType }) {
    const startedAt = Date.now();
    const kind = detectKind(fileName);
    let result;

    if (['spreadsheet', 'word', 'legacy-word'].includes(kind)) {
        const sourceDocumentKind = kind === 'legacy-word' ? 'word' : kind;
        result = documentType === 'invoice'
            ? await extractInvoiceDocumentAsPdf({
                filePath: documentPath,
                fileName,
                projectId,
                sourceDocumentKind
            })
            : await extractProductDocumentAsPdf({
                filePath: documentPath,
                fileName,
                projectId,
                sourceDocumentKind
            });
    } else {
        const error = new Error('Formato no soportado para extractor de documentos.');
        error.status = 400;
        throw error;
    }

    result.workspace.documentKind = 'pdf';
    result.workspace.sourceDocumentKind = result.workspace.sourceDocumentKind || kind;
    result.report.processMs = Date.now() - startedAt;
    result.report.fileName = fileName;

    return {
        ok: true,

        // Mantenemos extractor por compatibilidad.
        extractor: result,

        // Exponemos también los datos principales arriba,
        // que es donde project-router.js los busca.
        workspace: result.workspace || {},
        report: result.report || {},
        convertedDocument: result.convertedDocument || null
    };
}

module.exports = {
    extractProjectDocument
};
