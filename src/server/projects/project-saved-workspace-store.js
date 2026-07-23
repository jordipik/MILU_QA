'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readProjectWorkspace, saveProjectWorkspace } = require('./project-workspace-store');
const { readProjectPdf, saveProjectPdf } = require('./project-pdf-store');

const SAVED_DIR = path.join(__dirname, 'data', 'saved-workspaces');

function cleanProjectId(projectId) {
    return String(projectId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

function cleanFileId(fileId) {
    return String(fileId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

function cleanInvoiceId(invoiceId) {
    return String(invoiceId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
}

function projectDir(projectId) {
    const cleanId = cleanProjectId(projectId);
    if (!cleanId) {
        const error = new Error('Proyecto no valido.');
        error.status = 400;
        throw error;
    }

    return path.join(SAVED_DIR, cleanId);
}

function savedJsonPath(projectId, fileId) {
    const cleanId = cleanFileId(fileId);
    if (!cleanId) {
        const error = new Error('Guardado no valido.');
        error.status = 400;
        throw error;
    }

    return path.join(projectDir(projectId), `${cleanId}.json`);
}

function savedPdfPath(projectId, fileId) {
    return path.join(projectDir(projectId), `${cleanFileId(fileId)}.pdf`);
}

function savedInvoicePdfDir(projectId, fileId) {
    return path.join(projectDir(projectId), `${cleanFileId(fileId)}-invoices`);
}

function savedInvoicePdfPath(projectId, fileId, invoiceId) {
    const cleanId = cleanInvoiceId(invoiceId);
    if (!cleanId) {
        const error = new Error('Factura guardada no valida.');
        error.status = 400;
        throw error;
    }

    return path.join(savedInvoicePdfDir(projectId, fileId), `${cleanId}.pdf`);
}

function createFileId() {
    return `saved-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

function publicMeta(record) {
    const invoiceCount = Array.isArray(record.workspace?.invoices)
        ? record.workspace.invoices.length
        : Number(record.invoiceCount || 0);

    return {
        id: record.id,
        name: record.name,
        documentType: record.documentType || record.workspace?.documentType || '',
        fileName: record.fileName,
        rows: Number(record.rows || 0),
        invoiceCount,
        pageCount: Number(record.pageCount || 0),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
    };
}

function readSavedRecord(projectId, fileId) {
    const filePath = savedJsonPath(projectId, fileId);
    if (!fs.existsSync(filePath)) {
        const error = new Error('Guardado no encontrado.');
        error.status = 404;
        throw error;
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listSavedWorkspaces(projectId, documentType = '') {
    const dir = projectDir(projectId);
    if (!fs.existsSync(dir)) return [];

    const expectedType = String(documentType || '').trim();

    return fs.readdirSync(dir)
        .filter((fileName) => fileName.endsWith('.json'))
        .map((fileName) => {
            try {
                return publicMeta(JSON.parse(fs.readFileSync(path.join(dir, fileName), 'utf8')));
            } catch (_) {
                return null;
            }
        })
        .filter(Boolean)
        .filter((record) => !expectedType || record.documentType === expectedType)
        .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

function decodeInvoicePdfInput(input, workspace) {
    const invoices = Array.isArray(workspace?.invoices) ? workspace.invoices : [];
    const validIds = new Set(invoices.map((invoice) => cleanInvoiceId(invoice?.id)).filter(Boolean));

    if (!Array.isArray(input) || !validIds.size) return [];

    return input
        .map((item) => {
            const id = cleanInvoiceId(item?.id);
            const encoded = String(item?.data || '').replace(/^data:application\/pdf;base64,/i, '');
            if (!id || !validIds.has(id) || !encoded) return null;

            try {
                const buffer = Buffer.from(encoded, 'base64');
                if (!buffer.length) return null;

                return {
                    id,
                    fileName: String(item?.fileName || 'factura.pdf').replace(/[\r\n]+/g, ' ').slice(0, 180),
                    buffer
                };
            } catch (_) {
                return null;
            }
        })
        .filter(Boolean);
}

function saveCurrentWorkspaceSnapshot(projectId, input) {
    const name = String(input?.name || '').replace(/\s+/g, ' ').trim();
    if (!name) {
        const error = new Error('Pon un nombre para el guardado.');
        error.status = 400;
        throw error;
    }

    const workspace = input?.workspace && typeof input.workspace === 'object'
        ? saveProjectWorkspace(projectId, input.workspace)
        : readProjectWorkspace(projectId);
    const invoicePdfs = decodeInvoicePdfInput(input?.invoicePdfs, workspace);

    let currentPdf = null;
    try {
        currentPdf = readProjectPdf(projectId);
    } catch (error) {
        if (!invoicePdfs.length) throw error;
    }

    const id = createFileId();
    const now = new Date().toISOString();
    const dir = projectDir(projectId);
    fs.mkdirSync(dir, { recursive: true });

    const mainPdf = currentPdf || invoicePdfs[0] || null;
    if (mainPdf) {
        fs.writeFileSync(savedPdfPath(projectId, id), mainPdf.buffer);
    }

    if (invoicePdfs.length) {
        const invoiceDir = savedInvoicePdfDir(projectId, id);
        fs.mkdirSync(invoiceDir, { recursive: true });
        invoicePdfs.forEach((invoicePdf) => {
            fs.writeFileSync(savedInvoicePdfPath(projectId, id, invoicePdf.id), invoicePdf.buffer);
        });
    }

    const record = {
        id,
        name: name.slice(0, 120),
        documentType: String(workspace.documentType || '').slice(0, 40),
        fileName: String(workspace.fileName || currentPdf?.meta?.fileName || invoicePdfs[0]?.fileName || 'documento.pdf').slice(0, 180),
        rows: Array.isArray(workspace.rows) ? workspace.rows.length : 0,
        invoiceCount: Array.isArray(workspace.invoices) ? workspace.invoices.length : 0,
        pageCount: Number(workspace.pageCount || 0),
        workspace,
        pdf: {
            fileName: currentPdf?.meta?.fileName || invoicePdfs[0]?.fileName || workspace.fileName || 'documento.pdf',
            size: mainPdf ? mainPdf.buffer.length : 0
        },
        invoicePdfs: invoicePdfs.map((invoicePdf) => ({
            id: invoicePdf.id,
            fileName: invoicePdf.fileName,
            size: invoicePdf.buffer.length
        })),
        createdAt: now,
        updatedAt: now
    };

    fs.writeFileSync(savedJsonPath(projectId, id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return publicMeta(record);
}

function readSavedWorkspace(projectId, fileId) {
    const record = readSavedRecord(projectId, fileId);
    return {
        file: publicMeta(record),
        workspace: record.workspace || {}
    };
}

function readSavedWorkspacePdf(projectId, fileId) {
    const record = readSavedRecord(projectId, fileId);
    const pdfPath = savedPdfPath(projectId, fileId);
    if (!fs.existsSync(pdfPath)) {
        const error = new Error('PDF del guardado no encontrado.');
        error.status = 404;
        throw error;
    }

    return {
        meta: record.pdf || { fileName: record.fileName || 'documento.pdf' },
        buffer: fs.readFileSync(pdfPath)
    };
}

function readSavedInvoiceWorkspacePdf(projectId, fileId, invoiceId) {
    const record = readSavedRecord(projectId, fileId);
    const cleanId = cleanInvoiceId(invoiceId);
    const invoiceMeta = Array.isArray(record.invoicePdfs)
        ? record.invoicePdfs.find((invoicePdf) => cleanInvoiceId(invoicePdf?.id) === cleanId)
        : null;
    const pdfPath = savedInvoicePdfPath(projectId, fileId, cleanId);

    if (!fs.existsSync(pdfPath)) {
        const error = new Error('PDF de factura guardada no encontrado.');
        error.status = 404;
        throw error;
    }

    return {
        meta: invoiceMeta || { id: cleanId, fileName: 'factura.pdf' },
        buffer: fs.readFileSync(pdfPath)
    };
}

function restoreSavedWorkspace(projectId, fileId) {
    const record = readSavedRecord(projectId, fileId);
    const pdf = readSavedWorkspacePdf(projectId, fileId);
    const workspace = saveProjectWorkspace(projectId, record.workspace || {});
    saveProjectPdf(projectId, pdf.buffer, pdf.meta?.fileName || record.fileName || 'documento.pdf');

    return {
        file: publicMeta({
            ...record,
            updatedAt: new Date().toISOString()
        }),
        workspace
    };
}

module.exports = {
    listSavedWorkspaces,
    readSavedWorkspace,
    readSavedInvoiceWorkspacePdf,
    readSavedWorkspacePdf,
    restoreSavedWorkspace,
    saveCurrentWorkspaceSnapshot
};
