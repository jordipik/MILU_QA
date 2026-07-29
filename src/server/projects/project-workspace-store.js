'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WORKSPACES_DIR = path.join(__dirname, 'data', 'workspaces');

function cleanProjectId(projectId) {
    return String(projectId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

function workspacePath(projectId) {
    const cleanId = cleanProjectId(projectId);
    if (!cleanId) {
        const error = new Error('Proyecto no valido.');
        error.status = 400;
        throw error;
    }

    return path.join(WORKSPACES_DIR, `${cleanId}.json`);
}

function ensureWorkspaceDir() {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
}

function normalizeRow(row, index) {
    const geometry = row?.geometry && typeof row.geometry === 'object' ? row.geometry : {};
    const cells = row?.cells && typeof row.cells === 'object' && !Array.isArray(row.cells) ? row.cells : {};
    const cellGeometry = row?.cellGeometry && typeof row.cellGeometry === 'object' && !Array.isArray(row.cellGeometry)
        ? row.cellGeometry
        : {};
    const wordpressMatch = row?.wordpressMatch && typeof row.wordpressMatch === 'object' && !Array.isArray(row.wordpressMatch)
        ? row.wordpressMatch
        : null;

    return {
        id: String(row?.id || `row-${index + 1}`).slice(0, 80),
        page: String(row?.page || ''),
        pos: String(row?.pos || ''),
        partNo: String(row?.partNo || ''),
        designation: String(row?.designation || ''),
        modelType: String(row?.modelType || ''),
        qty: String(row?.qty || ''),
        units: String(row?.units || ''),
        weight: String(row?.weight || ''),
        fn: String(row?.fn || ''),
        measurement: String(row?.measurement || ''),
        standard: String(row?.standard || ''),
        cells: Object.fromEntries(Object.entries(cells).map(([key, value]) => [
            String(key).slice(0, 60),
            String(value || '').slice(0, 1000)
        ])),
        cellGeometry: Object.fromEntries(Object.entries(cellGeometry).map(([key, value]) => {
            const cell = value && typeof value === 'object' ? value : {};
            return [
                String(key).slice(0, 60),
                {
                    page: Number(cell.page || row?.page || 0),
                    x1: Number(cell.x1 || 0),
                    x2: Number(cell.x2 || 0),
                    y1: Number(cell.y1 || 0),
                    y2: Number(cell.y2 || 0),
                    pageWidth: Number(cell.pageWidth || geometry.pageWidth || 0),
                    pageHeight: Number(cell.pageHeight || geometry.pageHeight || 0)
                }
            ];
        })),
        status: String(row?.status || 'Pendiente').slice(0, 40),
        edited: Boolean(row?.edited),
        wordpressMatch: wordpressMatch ? {
            checked: Boolean(wordpressMatch.checked),
            exists: Boolean(wordpressMatch.exists),
            partNumber: String(wordpressMatch.partNumber || '').slice(0, 120),
            source: String(wordpressMatch.source || '').slice(0, 160),
            checkedAt: String(wordpressMatch.checkedAt || '').slice(0, 40),
            matches: Array.isArray(wordpressMatch.matches)
                ? wordpressMatch.matches.slice(0, 5).map((match) => ({
                    id: String(match?.id || '').slice(0, 80),
                    title: String(match?.title || '').slice(0, 180),
                    url: String(match?.url || '').slice(0, 500)
                }))
                : []
        } : null,
        geometry: {
            page: Number(geometry.page || row?.page || 0),
            y1: Number(geometry.y1 || 0),
            y2: Number(geometry.y2 || 0),
            pageWidth: Number(geometry.pageWidth || 0),
            pageHeight: Number(geometry.pageHeight || 0)
        }
    };
}

function normalizeColumns(value) {
    if (!Array.isArray(value)) return [];

    return value
        .map((column, index) => ({
            key: String(column?.key || `col_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60),
            label: String(column?.label || column?.key || `Columna ${index + 1}`).slice(0, 120),
            dynamic: Boolean(column?.dynamic)
        }))
        .filter((column) => column.key && column.label)
        .slice(0, 40);
}

function normalizeHeaderLabels(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.fromEntries(Object.entries(value).map(([key, label]) => [
        String(key).slice(0, 40),
        String(label || '').slice(0, 80)
    ]));
}

function normalizeExtractionReport(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    return {
        selectedEngine: String(value.selectedEngine || '').slice(0, 80),
        tablesDetected: Number(value.tablesDetected || 0),
        rowsExtracted: Number(value.rowsExtracted || 0),
        precision: Number(value.precision || 0),
        processMs: value.processMs == null ? null : Number(value.processMs || 0),
        problems: Array.isArray(value.problems)
            ? value.problems.slice(0, 50).map((item) => String(item || '').slice(0, 500))
            : [],
        engines: Array.isArray(value.engines)
            ? value.engines.slice(0, 10).map((engine) => ({
                name: String(engine?.name || '').slice(0, 80),
                status: String(engine?.status || '').slice(0, 80),
                tablesDetected: Number(engine?.tablesDetected || 0),
                rowsExtracted: Number(engine?.rowsExtracted || 0),
                precision: Number(engine?.precision || 0),
                processMs: engine?.processMs == null ? null : Number(engine?.processMs || 0),
                problems: Array.isArray(engine?.problems)
                    ? engine.problems.slice(0, 20).map((item) => String(item || '').slice(0, 500))
                    : []
            }))
            : []
    };
}

function normalizeInvoiceParty(value) {
    const party = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        name: String(party.name || '').slice(0, 240),
        address: String(party.address || '').slice(0, 1000),
        taxId: String(party.taxId || '').slice(0, 80),
        email: String(party.email || '').slice(0, 180),
        phone: String(party.phone || '').slice(0, 80)
    };
}

function normalizeInvoiceAmount(value) {
    return value == null || value === '' ? null : Number(value || 0);
}

function normalizeSourceBox(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const box = {
        page: Number(value.page || 1),
        x1: Number(value.x1 || 0),
        y1: Number(value.y1 || 0),
        x2: Number(value.x2 || 0),
        y2: Number(value.y2 || 0),
        pageWidth: Number(value.pageWidth || 0),
        pageHeight: Number(value.pageHeight || 0)
    };

    return box.x2 > box.x1 && box.y2 > box.y1 ? box : null;
}

function normalizeInvoice(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const amounts = value.amounts && typeof value.amounts === 'object' && !Array.isArray(value.amounts)
        ? value.amounts
        : {};
    const payment = value.payment && typeof value.payment === 'object' && !Array.isArray(value.payment)
        ? value.payment
        : {};

    return {
        fileName: String(value.fileName || '').slice(0, 180),
        type: String(value.type || '').slice(0, 120),
        invoiceNumber: String(value.invoiceNumber || '').slice(0, 120),
        date: String(value.date || '').slice(0, 80),
        dueDate: String(value.dueDate || '').slice(0, 80),
        currency: String(value.currency || '').slice(0, 16),
        supplier: normalizeInvoiceParty(value.supplier),
        customer: normalizeInvoiceParty(value.customer),
        amounts: {
            subtotal: normalizeInvoiceAmount(amounts.subtotal),
            tax: normalizeInvoiceAmount(amounts.tax),
            total: normalizeInvoiceAmount(amounts.total),
            paid: normalizeInvoiceAmount(amounts.paid),
            due: normalizeInvoiceAmount(amounts.due)
        },
        payment: {
            iban: String(payment.iban || '').slice(0, 80),
            method: String(payment.method || '').slice(0, 180)
        },
        lineColumnLabels: value.lineColumnLabels && typeof value.lineColumnLabels === 'object'
            ? Object.fromEntries(
                Object.entries(value.lineColumnLabels)
                    .slice(0, 12)
                    .map(([key, label]) => [
                        String(key || '').slice(0, 40),
                        String(label || '').slice(0, 120)
                    ])
                    .filter(([key, label]) => key && label)
            )
            : {},
        lineItems: Array.isArray(value.lineItems)
            ? value.lineItems.slice(0, 500).map((item, index) => ({
                id: String(item?.id || `line-${index + 1}`).slice(0, 80),
                code: String(item?.code || '').slice(0, 120),
                description: String(item?.description || '').slice(0, 500),
                quantity: item?.quantity == null || item?.quantity === '' ? null : Number(item.quantity || 0),
                unit: String(item?.unit || '').slice(0, 80),
                unitPrice: item?.unitPrice == null || item?.unitPrice === '' ? null : Number(item.unitPrice || 0),
                discount: item?.discount == null || item?.discount === '' ? null : Number(item.discount || 0),
                taxRate: item?.taxRate == null || item?.taxRate === '' ? null : Number(item.taxRate || 0),
                total: item?.total == null || item?.total === '' ? null : Number(item.total || 0),
                sourceBox: normalizeSourceBox(item?.sourceBox)
            }))
            : [],
        fields: Array.isArray(value.fields)
            ? value.fields.slice(0, 300).map((field) => ({
                section: String(field?.section || 'Factura').slice(0, 80),
                label: String(field?.label || '').slice(0, 120),
                value: String(field?.value || '').slice(0, 1200),
                confidence: Number(field?.confidence || 0),
                sourceBox: normalizeSourceBox(field?.sourceBox)
            })).filter((field) => field.label && field.value)
            : [],
        rawTextSample: String(value.rawTextSample || '').slice(0, 5000),
        aiRefinement: value.aiRefinement && typeof value.aiRefinement === 'object'
            ? {
                applied: Boolean(value.aiRefinement.applied),
                model: String(value.aiRefinement.model || '').slice(0, 80),
                confidence: Number(value.aiRefinement.confidence || 0),
                warnings: Array.isArray(value.aiRefinement.warnings)
                    ? value.aiRefinement.warnings.slice(0, 20).map((warning) => String(warning || '').slice(0, 240))
                    : []
            }
            : null,
        detectedFields: Number(value.detectedFields || 0)
    };
}

function normalizeInvoiceRecord(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    return {
        id: String(value.id || `invoice-${index + 1}`).slice(0, 140),
        fileName: String(value.fileName || '').slice(0, 180),
        relativePath: String(value.relativePath || '').slice(0, 260),
        pageCount: Number(value.pageCount || 0),
        invoice: normalizeInvoice(value.invoice),
        headerLabels: normalizeHeaderLabels(value.headerLabels),
        columns: normalizeColumns(value.columns),
        rows: Array.isArray(value.rows) ? value.rows.map(normalizeRow) : [],
        extractionReport: normalizeExtractionReport(value.extractionReport)
    };
}

function emptyWorkspace(projectId) {
    return {
        version: 1,
        projectId: cleanProjectId(projectId),
        documentType: '',
        fileName: '',
        pageCount: 0,
        headerLabels: {},
        columns: [],
        rows: [],
        invoice: null,
        invoices: [],
        activeInvoiceId: '',
        extractionReport: null,
        updatedAt: null
    };
}

function readProjectWorkspace(projectId) {
    const fallback = emptyWorkspace(projectId);
    const filePath = workspacePath(projectId);

    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = raw ? JSON.parse(raw) : fallback;

        return {
            version: 1,
            projectId: cleanProjectId(projectId),
            documentType: String(parsed?.documentType || '').slice(0, 40),
            fileName: String(parsed?.fileName || '').slice(0, 180),
            pageCount: Number(parsed?.pageCount || 0),
            headerLabels: normalizeHeaderLabels(parsed?.headerLabels),
            columns: normalizeColumns(parsed?.columns),
            rows: Array.isArray(parsed?.rows) ? parsed.rows.map(normalizeRow) : [],
            invoice: normalizeInvoice(parsed?.invoice),
            invoices: Array.isArray(parsed?.invoices)
                ? parsed.invoices.map(normalizeInvoiceRecord).filter(Boolean)
                : [],
            activeInvoiceId: String(parsed?.activeInvoiceId || '').slice(0, 140),
            extractionReport: normalizeExtractionReport(parsed?.extractionReport),
            updatedAt: parsed?.updatedAt || null
        };
    } catch (_) {
        return fallback;
    }
}

function saveProjectWorkspace(projectId, input) {
    ensureWorkspaceDir();

    const workspace = {
        version: 1,
        projectId: cleanProjectId(projectId),
        documentType: String(input?.documentType || '').slice(0, 40),
        fileName: String(input?.fileName || '').slice(0, 180),
        pageCount: Number(input?.pageCount || 0),
        headerLabels: normalizeHeaderLabels(input?.headerLabels),
        columns: normalizeColumns(input?.columns),
        rows: Array.isArray(input?.rows) ? input.rows.map(normalizeRow) : [],
        invoice: normalizeInvoice(input?.invoice),
        invoices: Array.isArray(input?.invoices)
            ? input.invoices.map(normalizeInvoiceRecord).filter(Boolean)
            : [],
        activeInvoiceId: String(input?.activeInvoiceId || '').slice(0, 140),
        extractionReport: normalizeExtractionReport(input?.extractionReport),
        updatedAt: new Date().toISOString()
    };

    const filePath = workspacePath(projectId);
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, filePath);

    return workspace;
}

module.exports = {
    readProjectWorkspace,
    saveProjectWorkspace
};
