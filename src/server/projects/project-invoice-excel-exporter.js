'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const INVOICE_XLSX_SCRIPT = path.join(__dirname, 'pdf_extractors', 'invoice_xlsx_export.py');
const DEFAULT_TIMEOUT_MS = 60000;

function exportInvoiceExcel(payload) {
    return new Promise((resolve, reject) => {
        const pythonBin = process.env.PDF_EXTRACTOR_PYTHON || process.env.PYTHON_BIN || 'python';
        const child = spawn(pythonBin, [INVOICE_XLSX_SCRIPT], {
            cwd: path.resolve(__dirname, '..', '..', '..'),
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const chunks = [];
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill('SIGKILL');
            const error = new Error('La exportacion Excel ha superado el tiempo maximo.');
            error.status = 504;
            reject(error);
        }, Number(process.env.INVOICE_XLSX_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));

        child.stdout.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });

        child.on('error', (error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            error.status = 502;
            reject(error);
        });

        child.on('close', (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);

            if (code !== 0) {
                const error = new Error(stderr.trim() || `Exportador Excel finalizo con codigo ${code}`);
                error.status = 502;
                reject(error);
                return;
            }

            resolve(Buffer.concat(chunks));
        });

        child.stdin.end(JSON.stringify(payload || {}));
    });
}

module.exports = {
    exportInvoiceExcel
};
