'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PDF_DIR = path.join(__dirname, 'data', 'pdfs');

function cleanProjectId(projectId) {
    return String(projectId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

function pdfPath(projectId) {
    const cleanId = cleanProjectId(projectId);
    if (!cleanId) {
        const error = new Error('Proyecto no valido.');
        error.status = 400;
        throw error;
    }

    return path.join(PDF_DIR, `${cleanId}.pdf`);
}

function metaPath(projectId) {
    return `${pdfPath(projectId)}.json`;
}

function ensurePdfDir() {
    fs.mkdirSync(PDF_DIR, { recursive: true });
}

function saveProjectPdf(projectId, buffer, fileName) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        const error = new Error('PDF no valido.');
        error.status = 400;
        throw error;
    }

    ensurePdfDir();
    const filePath = pdfPath(projectId);
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, filePath);

    const meta = {
        fileName: String(fileName || 'documento.pdf').slice(0, 180),
        size: buffer.length,
        updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(metaPath(projectId), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

    return meta;
}

function readProjectPdfMeta(projectId) {
    try {
        const filePath = pdfPath(projectId);
        if (!fs.existsSync(filePath)) return null;

        const raw = fs.existsSync(metaPath(projectId))
            ? fs.readFileSync(metaPath(projectId), 'utf8')
            : '';
        const parsed = raw ? JSON.parse(raw) : {};
        const stats = fs.statSync(filePath);

        return {
            fileName: String(parsed.fileName || 'documento.pdf'),
            size: Number(parsed.size || stats.size || 0),
            updatedAt: parsed.updatedAt || stats.mtime.toISOString()
        };
    } catch (_) {
        return null;
    }
}

function readProjectPdf(projectId) {
    const filePath = pdfPath(projectId);
    if (!fs.existsSync(filePath)) {
        const error = new Error('PDF no encontrado.');
        error.status = 404;
        throw error;
    }

    return {
        meta: readProjectPdfMeta(projectId),
        buffer: fs.readFileSync(filePath)
    };
}

module.exports = {
    readProjectPdf,
    readProjectPdfMeta,
    saveProjectPdf
};
