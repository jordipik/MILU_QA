'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const PRODUCT_EXTRACTOR_SCRIPT = path.join(__dirname, 'pdf_extractors', 'pdf_multi_extract.py');
const INVOICE_EXTRACTOR_SCRIPT = path.join(__dirname, 'pdf_extractors', 'pdf_invoice_extract.py');
const DEFAULT_TIMEOUT_MS = 180000;

function parseJsonOutput(output) {
    const text = String(output || '').trim();
    if (!text) {
        const error = new Error('El extractor no devolvio datos.');
        error.status = 502;
        throw error;
    }

    try {
        return JSON.parse(text);
    } catch (parseError) {
        const error = new Error(`Respuesta no valida del extractor: ${text.slice(0, 500)}`);
        error.status = 502;
        throw error;
    }
}

function runPythonExtractor({ pdfPath, projectId, fileName, scriptPath = PRODUCT_EXTRACTOR_SCRIPT, extraArgs = [] }) {
    return new Promise((resolve, reject) => {
        const pythonBin = process.env.PDF_EXTRACTOR_PYTHON || process.env.PYTHON_BIN || 'python';
        const args = [
            scriptPath,
            '--pdf',
            pdfPath,
            '--project',
            String(projectId || ''),
            '--file-name',
            String(fileName || ''),
            ...extraArgs.map((value) => String(value))
        ];

        const child = spawn(pythonBin, args, {
            cwd: path.resolve(__dirname, '..', '..', '..'),
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill('SIGKILL');
            const error = new Error('El extractor PDF ha superado el tiempo maximo.');
            error.status = 504;
            reject(error);
        }, Number(process.env.PDF_EXTRACTOR_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString('utf8');
        });

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
                const error = new Error(stderr.trim() || `Extractor PDF finalizo con codigo ${code}`);
                error.status = 502;
                reject(error);
                return;
            }

            try {
                resolve(parseJsonOutput(stdout));
            } catch (error) {
                reject(error);
            }
        });
    });
}

async function extractProjectPdf(options) {
    const result = await runPythonExtractor({
        ...options,
        scriptPath: PRODUCT_EXTRACTOR_SCRIPT
    });
    return {
        ok: true,
        extractor: result
    };
}

async function extractProjectInvoicePdf(options) {
    const result = await runPythonExtractor({
        ...options,
        scriptPath: INVOICE_EXTRACTOR_SCRIPT
    });
    return {
        ok: true,
        extractor: result
    };
}

async function extractProjectInvoiceLinesRegion(options) {
    const result = await runPythonExtractor({
        ...options,
        scriptPath: INVOICE_EXTRACTOR_SCRIPT,
        extraArgs: ['--line-region', JSON.stringify(options.region || {})]
    });
    return {
        ok: true,
        lineItems: result?.workspace?.invoice?.lineItems || [],
        regionWords: Array.isArray(result?.regionWords) ? result.regionWords : [],
        report: result?.report || null
    };
}

module.exports = {
    extractProjectPdf,
    extractProjectInvoicePdf,
    extractProjectInvoiceLinesRegion
};
