'use strict';

const DEFAULT_MODEL = 'gpt-5.6-terra';
const DEFAULT_TIMEOUT_MS = 90000;
const MAX_PDF_BYTES = 18 * 1024 * 1024;

const nullableString = { type: ['string', 'null'] };
const nullableNumber = { type: ['number', 'null'] };
const partySchema = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'address', 'taxId', 'email', 'phone'],
    properties: {
        name: nullableString,
        address: nullableString,
        taxId: nullableString,
        email: nullableString,
        phone: nullableString
    }
};

const invoiceSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
        'invoiceNumber', 'date', 'dueDate', 'currency', 'supplier', 'customer',
        'amounts', 'payment', 'lineItems', 'confidence', 'warnings'
    ],
    properties: {
        invoiceNumber: nullableString,
        date: nullableString,
        dueDate: nullableString,
        currency: nullableString,
        supplier: partySchema,
        customer: partySchema,
        amounts: {
            type: 'object',
            additionalProperties: false,
            required: ['subtotal', 'tax', 'total', 'paid', 'due'],
            properties: {
                subtotal: nullableNumber,
                tax: nullableNumber,
                total: nullableNumber,
                paid: nullableNumber,
                due: nullableNumber
            }
        },
        payment: {
            type: 'object',
            additionalProperties: false,
            required: ['iban', 'method'],
            properties: {
                iban: nullableString,
                method: nullableString
            }
        },
        lineItems: {
            type: 'array',
            maxItems: 250,
            items: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'code', 'description', 'quantity', 'unit', 'unitPrice',
                    'discount', 'taxRate', 'total'
                ],
                properties: {
                    code: nullableString,
                    description: { type: 'string' },
                    quantity: nullableNumber,
                    unit: nullableString,
                    unitPrice: nullableNumber,
                    discount: nullableNumber,
                    taxRate: nullableNumber,
                    total: nullableNumber
                }
            }
        },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        warnings: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string' }
        }
    }
};

function cleanText(value, maxLength = 260) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, maxLength) : '';
}

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function validDate(value) {
    const text = cleanText(value, 40);
    if (!text) return '';
    if (/^(?:\d{1,4}[./-]){2}\d{1,4}$/.test(text)) return text;
    if (/\b\d{1,2}\s+[^\d\s]{3,18}\s+\d{4}\b/u.test(text)) return text;
    if (/\b[^\d\s]{3,18}\s+\d{1,2},?\s+\d{4}\b/u.test(text)) return text;
    return '';
}

function validTaxId(value) {
    const text = cleanText(value, 40).replace(/\s+/g, '').toUpperCase();
    return /^[A-Z]{0,3}[A-Z0-9][A-Z0-9.-]{5,19}$/.test(text) ? text : '';
}

function validIban(value) {
    const text = cleanText(value, 48).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(text) ? text : '';
}

function validEmail(value) {
    const text = cleanText(value, 160);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : '';
}

function sanitizeParty(candidate, fallback = {}) {
    const party = candidate && typeof candidate === 'object' ? candidate : {};
    return {
        name: cleanText(party.name, 180) || cleanText(fallback.name, 180),
        address: cleanText(party.address, 260) || cleanText(fallback.address, 260),
        taxId: validTaxId(party.taxId) || validTaxId(fallback.taxId),
        email: validEmail(party.email) || validEmail(fallback.email),
        phone: cleanText(party.phone, 40) || cleanText(fallback.phone, 40)
    };
}

function sanitizeLineItems(items, currency) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => {
        const description = cleanText(item?.description, 240);
        const quantity = finiteNumber(item?.quantity);
        const unitPrice = finiteNumber(item?.unitPrice);
        const total = finiteNumber(item?.total);
        const discount = finiteNumber(item?.discount);
        const taxRate = finiteNumber(item?.taxRate);
        if (!description || (unitPrice == null && total == null)) return null;
        if (taxRate != null && (taxRate < 0 || taxRate > 30)) return null;
        if (discount != null && (discount < 0 || discount > 100)) return null;
        if (quantity != null && unitPrice != null && total != null) {
            const expected = quantity * unitPrice * (1 - (discount || 0) / 100);
            const tolerance = Math.max(0.1, Math.abs(total) * 0.04);
            if (Math.abs(expected - total) > tolerance) return null;
        }
        return {
            code: cleanText(item.code, 80),
            description,
            quantity,
            unit: cleanText(item.unit, 40),
            unitPrice,
            discount,
            taxRate,
            total,
            currency
        };
    }).filter(Boolean);
}

function findSourceBox(invoice, value, labelPattern = null) {
    const wanted = cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!wanted) return null;
    const fields = Array.isArray(invoice?.fields) ? invoice.fields : [];
    const exact = fields.find((field) => {
        if (!field?.sourceBox) return false;
        if (labelPattern && !labelPattern.test(`${field.section || ''} ${field.label || ''}`)) return false;
        const candidate = cleanText(field.value).toLowerCase().replace(/[^a-z0-9]/g, '');
        return candidate === wanted;
    });
    return exact?.sourceBox || null;
}

function attachLineSources(lines, originalInvoice) {
    const originalLines = Array.isArray(originalInvoice?.lineItems) ? originalInvoice.lineItems : [];
    return lines.map((line) => {
        const normalized = cleanText(line.description).toLowerCase();
        const match = originalLines.find((item) => {
            const candidate = cleanText(item?.description).toLowerCase();
            return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate);
        });
        return { ...line, sourceBox: match?.sourceBox || findSourceBox(originalInvoice, line.description) };
    });
}

function mergeAiInvoice(originalInvoice, candidate) {
    const currency = cleanText(candidate.currency, 3).toUpperCase();
    const resolvedCurrency = /^[A-Z]{3}$/.test(currency) ? currency : (originalInvoice.currency || 'EUR');
    const aiLines = sanitizeLineItems(candidate.lineItems, resolvedCurrency);
    const originalLines = Array.isArray(originalInvoice.lineItems) ? originalInvoice.lineItems : [];
    const lineItems = aiLines.length ? attachLineSources(aiLines, originalInvoice) : originalLines;
    const aiAmounts = candidate.amounts || {};
    const amounts = {
        subtotal: finiteNumber(aiAmounts.subtotal),
        tax: finiteNumber(aiAmounts.tax),
        total: finiteNumber(aiAmounts.total),
        paid: finiteNumber(aiAmounts.paid),
        due: finiteNumber(aiAmounts.due)
    };
    Object.keys(amounts).forEach((key) => {
        if (amounts[key] == null) amounts[key] = finiteNumber(originalInvoice.amounts?.[key]);
    });
    if (amounts.tax != null && amounts.tax < 0) amounts.tax = finiteNumber(originalInvoice.amounts?.tax);
    if (amounts.subtotal != null && amounts.tax != null && amounts.total != null) {
        const expected = amounts.subtotal + amounts.tax;
        const tolerance = Math.max(0.1, Math.abs(amounts.total) * 0.035);
        if (Math.abs(expected - amounts.total) > tolerance) {
            amounts.subtotal = finiteNumber(originalInvoice.amounts?.subtotal);
            amounts.tax = finiteNumber(originalInvoice.amounts?.tax);
            amounts.total = finiteNumber(originalInvoice.amounts?.total);
        }
    }

    return {
        ...originalInvoice,
        invoiceNumber: cleanText(candidate.invoiceNumber, 80) || originalInvoice.invoiceNumber,
        date: validDate(candidate.date) || originalInvoice.date,
        dueDate: validDate(candidate.dueDate) || originalInvoice.dueDate,
        currency: resolvedCurrency,
        supplier: sanitizeParty(candidate.supplier, originalInvoice.supplier),
        customer: sanitizeParty(candidate.customer, originalInvoice.customer),
        amounts,
        payment: {
            iban: validIban(candidate.payment?.iban) || validIban(originalInvoice.payment?.iban),
            method: cleanText(candidate.payment?.method, 120) || cleanText(originalInvoice.payment?.method, 120)
        },
        lineItems,
        aiRefinement: {
            applied: true,
            model: process.env.OPENAI_INVOICE_MODEL || DEFAULT_MODEL,
            confidence: finiteNumber(candidate.confidence) || 0,
            warnings: Array.isArray(candidate.warnings) ? candidate.warnings.map((item) => cleanText(item, 220)).filter(Boolean) : []
        }
    };
}

function responseOutputText(response) {
    if (cleanText(response?.output_text, 100000)) return response.output_text;
    for (const output of response?.output || []) {
        for (const content of output?.content || []) {
            if (content?.type === 'output_text' && content.text) return content.text;
        }
    }
    return '';
}

async function requestAiInvoice({ invoice, pdfBuffer, fileName }) {
    const apiKey = cleanText(process.env.OPENAI_API_KEY, 1000);
    if (!apiKey) return null;
    if (!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length || pdfBuffer.length > MAX_PDF_BYTES) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(process.env.OPENAI_INVOICE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
    try {
        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: process.env.OPENAI_INVOICE_MODEL || DEFAULT_MODEL,
                store: false,
                reasoning: { effort: process.env.OPENAI_INVOICE_REASONING || 'low' },
                input: [{
                    role: 'user',
                    content: [
                        {
                            type: 'input_text',
                            text: [
                                'Refina esta factura usando el PDF como evidencia principal y el OCR como candidato.',
                                'No inventes nada. Usa null si un dato no aparece de forma explícita.',
                                'Separa correctamente emisor y cliente. Una dirección solo contiene dirección postal.',
                                'Las líneas deben proceder exclusivamente de la tabla de conceptos/productos.',
                                'No conviertas cabeceras, fechas, totales, impuestos ni datos bancarios en líneas.',
                                'Comprueba cantidad × precio × descuento = total de línea.',
                                'El IVA por línea debe estar entre 0 y 30. Conserva todos los idiomas y textos originales.',
                                `Archivo: ${cleanText(fileName, 180)}`,
                                `OCR candidato: ${JSON.stringify(invoice)}`
                            ].join('\n')
                        },
                        {
                            type: 'input_file',
                            filename: cleanText(fileName, 180) || 'factura.pdf',
                            file_data: `data:application/pdf;base64,${pdfBuffer.toString('base64')}`
                        }
                    ]
                }],
                text: {
                    format: {
                        type: 'json_schema',
                        name: 'invoice_refinement',
                        strict: true,
                        schema: invoiceSchema
                    }
                }
            })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload?.error?.message || `OpenAI HTTP ${response.status}`);
        }
        const text = responseOutputText(payload);
        if (!text) throw new Error('OpenAI no devolvió una factura estructurada.');
        return JSON.parse(text);
    } finally {
        clearTimeout(timer);
    }
}

async function refineInvoiceExtractionWithAi({ result, pdfBuffer, fileName }) {
    const extractor = result?.extractor || result;
    const workspace = extractor?.workspace || result?.workspace;
    const invoice = workspace?.invoice;
    if (!invoice || !process.env.OPENAI_API_KEY) return result;

    const startedAt = Date.now();
    try {
        const candidate = await requestAiInvoice({ invoice, pdfBuffer, fileName });
        if (!candidate || Number(candidate.confidence || 0) < 0.55) return result;
        const refined = mergeAiInvoice(invoice, candidate);
        workspace.invoice = refined;
        if (result?.workspace) result.workspace.invoice = refined;
        const report = extractor.report || result.report || {};
        report.engines = [
            ...(Array.isArray(report.engines) ? report.engines : []),
            {
                name: process.env.OPENAI_INVOICE_MODEL || DEFAULT_MODEL,
                status: 'ok',
                precision: Number(candidate.confidence || 0),
                processMs: Date.now() - startedAt,
                problems: refined.aiRefinement.warnings
            }
        ];
        report.selectedEngine = `${report.selectedEngine || 'invoice-ocr'}+ai`;
        extractor.report = report;
        if (result?.report) result.report = report;
        return result;
    } catch (error) {
        const report = extractor?.report || result?.report;
        if (report) {
            report.engines = [
                ...(Array.isArray(report.engines) ? report.engines : []),
                {
                    name: process.env.OPENAI_INVOICE_MODEL || DEFAULT_MODEL,
                    status: 'error',
                    precision: 0,
                    processMs: Date.now() - startedAt,
                    problems: [cleanText(error?.message || error, 240)]
                }
            ];
            report.problems = [
                ...(Array.isArray(report.problems) ? report.problems : []),
                `La validación de IA no estuvo disponible: ${cleanText(error?.message || error, 180)}`
            ];
        }
        return result;
    }
}

module.exports = {
    refineInvoiceExtractionWithAi
};
