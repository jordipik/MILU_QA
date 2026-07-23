'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PDF_DIR = path.join(__dirname, 'data', 'pdfs');

const CONTENT_TYPES = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword'
};

function cleanProjectId(projectId) {
    return String(projectId || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '');
}

function validateProjectId(projectId) {
    const cleanId = cleanProjectId(projectId);

    if (!cleanId) {
        const error = new Error('Proyecto no valido.');
        error.status = 400;
        throw error;
    }

    return cleanId;
}

function ensurePdfDir() {
    fs.mkdirSync(PDF_DIR, { recursive: true });
}

function pdfPath(projectId) {
    const cleanId = validateProjectId(projectId);
    return path.join(PDF_DIR, `${cleanId}.pdf`);
}

function metaPath(projectId) {
    const cleanId = validateProjectId(projectId);
    return path.join(PDF_DIR, `${cleanId}.json`);
}

function getExtension(fileName) {
    return String(
        path.extname(String(fileName || '')).replace('.', '') || ''
    ).toLowerCase();
}

function getDocumentKind(fileName) {
    const extension = getExtension(fileName);

    if (extension === 'pdf') return 'pdf';
    if (['xlsx', 'xls', 'csv'].includes(extension)) return 'spreadsheet';
    if (['docx', 'doc'].includes(extension)) return 'word';

    return 'unknown';
}

function getContentType(fileName, fallback = '') {
    const extension = getExtension(fileName);
    return CONTENT_TYPES[extension] || fallback || 'application/octet-stream';
}

function sourcePath(projectId, fileName) {
    const cleanId = validateProjectId(projectId);
    const extension = getExtension(fileName);

    if (!extension) {
        const error = new Error('El archivo no tiene una extension valida.');
        error.status = 400;
        throw error;
    }

    return path.join(PDF_DIR, `${cleanId}-source.${extension}`);
}

function removeOldProjectFiles(projectId) {
    const cleanId = validateProjectId(projectId);

    if (!fs.existsSync(PDF_DIR)) return;

    for (const fileName of fs.readdirSync(PDF_DIR)) {
        if (
            fileName === `${cleanId}.pdf`
            || fileName === `${cleanId}.json`
            || fileName.startsWith(`${cleanId}-source.`)
        ) {
            try {
                fs.unlinkSync(path.join(PDF_DIR, fileName));
            } catch (_) {
                // Ignoramos archivos que ya no existan o estén bloqueados.
            }
        }
    }
}

function writeBufferAtomic(filePath, buffer) {
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, filePath);
}

function saveProjectPdf(projectId, buffer, fileName) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        const error = new Error('Documento no valido.');
        error.status = 400;
        throw error;
    }

    const cleanFileName = path.basename(
        String(fileName || 'documento.pdf')
    ).slice(0, 180);

    const kind = getDocumentKind(cleanFileName);

    if (kind === 'unknown') {
        const error = new Error(
            'Formato no soportado. Usa PDF, Excel, CSV o Word.'
        );
        error.status = 400;
        throw error;
    }

    ensurePdfDir();

    const originalPath = sourcePath(projectId, cleanFileName);
    const originalTmpPath =
        `${originalPath}.tmp-${process.pid}-${Date.now()}`;

    fs.writeFileSync(originalTmpPath, buffer);
    fs.renameSync(originalTmpPath, originalPath);

    /*
     * Solo escribimos directamente <projectId>.pdf
     * cuando el archivo subido ya es un PDF auténtico.
     */
    if (kind === 'pdf') {
        const destinationPdfPath = pdfPath(projectId);
        const pdfTmpPath =
            `${destinationPdfPath}.tmp-${process.pid}-${Date.now()}`;

        fs.writeFileSync(pdfTmpPath, buffer);
        fs.renameSync(pdfTmpPath, destinationPdfPath);
    }

    const meta = {
        fileName: cleanFileName,
        originalFileName: cleanFileName,
        sourcePath: originalPath,
        kind,
        contentType: getContentType(cleanFileName),
        size: buffer.length,
        updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(
        metaPath(projectId),
        `${JSON.stringify(meta, null, 2)}\n`,
        'utf8'
    );

    return meta;
}

function readProjectPdfMeta(projectId) {
    try {
        const metadataPath = metaPath(projectId);

        if (!fs.existsSync(metadataPath)) {
            return null;
        }

        const parsed = JSON.parse(
            fs.readFileSync(metadataPath, 'utf8')
        );

        return {
            ...parsed,
            sourcePath:
                parsed.sourcePath
                || sourcePath(projectId, parsed.fileName),
            pdfPath: parsed.pdfPath || pdfPath(projectId)
        };
    } catch (_) {
        return null;
    }
}

function readProjectSourcePath(projectId) {
    const meta = readProjectPdfMeta(projectId);

    if (!meta?.sourcePath || !fs.existsSync(meta.sourcePath)) {
        const error = new Error('Documento original no encontrado.');
        error.status = 404;
        throw error;
    }

    return meta.sourcePath;
}

function readProjectPdfPath(projectId) {
    const filePath = pdfPath(projectId);

    if (!fs.existsSync(filePath)) {
        const error = new Error('PDF convertido no encontrado.');
        error.status = 404;
        throw error;
    }

    return filePath;
}

function readProjectPdf(projectId) {
    const filePath = readProjectPdfPath(projectId);

    return {
        meta: readProjectPdfMeta(projectId),
        buffer: fs.readFileSync(filePath)
    };
}

function setConvertedProjectPdf(projectId, convertedPath, fileName) {
    if (!fs.existsSync(convertedPath)) {
        const error = new Error(
            'LibreOffice no genero el archivo PDF esperado.'
        );
        error.status = 502;
        throw error;
    }

    ensurePdfDir();

    const destination = pdfPath(projectId);

    if (path.resolve(convertedPath) !== path.resolve(destination)) {
        fs.copyFileSync(convertedPath, destination);
    }

    const previousMeta = readProjectPdfMeta(projectId) || {};
    const convertedPdfFileName =
        String(fileName || previousMeta.fileName || 'documento.pdf')
            .replace(/\.[^.]+$/i, '.pdf');

    const stats = fs.statSync(destination);

    const nextMeta = {
        ...previousMeta,
        pdfPath: destination,
        convertedPdfFileName,
        convertedAt: new Date().toISOString(),
        pdfSize: stats.size,
        updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(
        metaPath(projectId),
        `${JSON.stringify(nextMeta, null, 2)}\n`,
        'utf8'
    );

    return {
        fileName: convertedPdfFileName,
        contentType: 'application/pdf',
        size: stats.size,
        path: destination
    };
}

function sourcePath(projectId, fileName) {
    const cleanId = cleanProjectId(projectId);

    if (!cleanId) {
        const error = new Error('Proyecto no valido.');
        error.status = 400;
        throw error;
    }

    const extension = getExtension(fileName);

    if (!extension) {
        const error = new Error('El documento no tiene una extension valida.');
        error.status = 400;
        throw error;
    }

    return path.join(PDF_DIR, `${cleanId}-source.${extension}`);
}

function readProjectSourcePath(projectId) {
    const meta = readProjectPdfMeta(projectId);

    if (!meta) {
        const error = new Error('Documento original no encontrado.');
        error.status = 404;
        throw error;
    }

    const filePath = String(meta.sourcePath || '');

    if (!filePath || !fs.existsSync(filePath)) {
        const error = new Error('Archivo original no encontrado.');
        error.status = 404;
        throw error;
    }

    return filePath;
}

module.exports = {
    getContentType,
    getDocumentKind,
    readProjectPdf,
    readProjectPdfPath: pdfPath,
    readProjectSourcePath,
    readProjectPdfMeta,
    saveProjectPdf
};