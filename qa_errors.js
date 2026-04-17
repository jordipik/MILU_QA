const fs = require('fs');
const path = require('path');

const PDF_DIRECTORY = path.join(__dirname, 'pdf');
const PDFJS_STANDARD_FONTS_DIRECTORY = path.resolve(
    path.dirname(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')),
    '..',
    '..',
    'standard_fonts'
);
const pdfPageTextCache = new Map();
let pdfJsModulePromise = null;
const DEFAULT_ACTIVE_QA_CODES = [
    'missing_part_no',
    'missing_pos',
    'missing_designation_final',
    'designation_final_not_in_pdf'
];

function text(value) {
    if (value == null) return '';
    return String(value).trim();
}

function normalizeSpaces(value) {
    return text(value).replace(/\s+/g, ' ').trim();
}

function normalizePdfToken(value) {
    return normalizeSpaces(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function compactPdfToken(value) {
    return normalizePdfToken(value).replace(/\s+/g, '');
}

function isGesaRow(row) {
    return text(row?.gesa).toUpperCase() === 'SI';
}

function getFinalDesignation(row) {
    const explicit = text(row?.designation_final);
    if (explicit) return explicit;
    return isGesaRow(row) ? text(row?.designation_gesa) : text(row?.DESIGNATION);
}

function getPartNumber(row) {
    return text(row?.['PART NO.'] || row?.pn_final || row?.pn);
}

function resolveAssignedPdfBaseName(row) {
    const sourceFileBase = text(row?.source_file).replace(/\.xlsx$/i, '');
    if (sourceFileBase) return sourceFileBase;
    return text(row?.engine_model);
}

function resolveAssignedPdfPath(row) {
    const baseName = resolveAssignedPdfBaseName(row);
    if (!baseName) return '';
    return path.join(PDF_DIRECTORY, `${baseName}.pdf`);
}

function resolvePageNumber(value) {
    const digits = text(value).replace(/[^0-9]/g, '');
    if (!digits) return null;
    const parsed = Number(digits);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function loadPdfJsModule() {
    if (!pdfJsModulePromise) {
        pdfJsModulePromise = import('pdfjs-dist/legacy/build/pdf.mjs');
    }
    return pdfJsModulePromise;
}

async function extractPdfPageTextIndex(pdfPath) {
    const { getDocument } = await loadPdfJsModule();
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    class NodeStandardFontDataFactory {
        constructor({ baseUrl = PDFJS_STANDARD_FONTS_DIRECTORY } = {}) {
            this.baseUrl = baseUrl;
        }

        async fetch({ filename }) {
            if (!filename) {
                throw new Error('Font filename must be specified.');
            }
            const fontPath = path.join(this.baseUrl, filename);
            return new Uint8Array(await fs.promises.readFile(fontPath));
        }
    }
    const loadingTask = getDocument({
        data,
        useWorkerFetch: false,
        isEvalSupported: false,
        disableFontFace: true,
        standardFontDataUrl: `${PDFJS_STANDARD_FONTS_DIRECTORY}${path.sep}`,
        StandardFontDataFactory: NodeStandardFontDataFactory
    });
    const pdfDocument = await loadingTask.promise;

    try {
        const pageIndex = new Map();
        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
            const page = await pdfDocument.getPage(pageNumber);
            const textContent = await page.getTextContent();
            const rawText = (textContent.items || [])
                .map(item => String(item?.str || ''))
                .join(' ');
            pageIndex.set(pageNumber, {
                normalized: normalizePdfToken(rawText),
                compact: compactPdfToken(rawText)
            });
        }
        return pageIndex;
    } finally {
        if (typeof pdfDocument.cleanup === 'function') pdfDocument.cleanup();
        if (typeof pdfDocument.destroy === 'function') {
            await pdfDocument.destroy().catch(() => { });
        }
    }
}

async function getPdfPageTextIndex(pdfPath) {
    if (!pdfPageTextCache.has(pdfPath)) {
        const promise = extractPdfPageTextIndex(pdfPath).catch((error) => {
            pdfPageTextCache.delete(pdfPath);
            throw error;
        });
        pdfPageTextCache.set(pdfPath, promise);
    }
    return pdfPageTextCache.get(pdfPath);
}

async function findDesignationInAssignedPdf(row, designation) {
    const pdfPath = resolveAssignedPdfPath(row);
    const pageNumber = resolvePageNumber(row?.['Source Page']);
    const normalizedDesignation = normalizePdfToken(designation);
    const compactDesignation = compactPdfToken(designation);

    if (!pdfPath || !pageNumber || !normalizedDesignation) {
        return {
            checked: false,
            found: false,
            pageNumber: pageNumber || null,
            pdfFileName: pdfPath ? path.basename(pdfPath) : ''
        };
    }

    if (!fs.existsSync(pdfPath)) {
        return {
            checked: false,
            found: false,
            pageNumber,
            pdfFileName: path.basename(pdfPath)
        };
    }

    const pageIndex = await getPdfPageTextIndex(pdfPath);
    const pageText = pageIndex.get(pageNumber);
    if (!pageText) {
        return {
            checked: false,
            found: false,
            pageNumber,
            pdfFileName: path.basename(pdfPath)
        };
    }

    const found = pageText.normalized.includes(normalizedDesignation)
        || (!!compactDesignation && pageText.compact.includes(compactDesignation));

    return {
        checked: true,
        found,
        pageNumber,
        pdfFileName: path.basename(pdfPath)
    };
}

function addIssue(target, code, severity, fields, message) {
    if (!target.codes.includes(code)) target.codes.push(code);

    fields.forEach((field) => {
        if (!field) return;
        if (!target.fields[field]) target.fields[field] = [];
        if (!target.fields[field].includes(code)) target.fields[field].push(code);
    });

    target.issues.push({ code, severity, fields, message });

    if (severity === 'critical' || (severity === 'warning' && target.severity === 'none')) {
        target.severity = severity;
    }
}

async function validateRow(row) {
    const result = {
        version: 1,
        severity: 'none',
        codes: [],
        fields: {},
        issues: []
    };

    const pn = getPartNumber(row);
    const pos = text(row?.POS);
    const designation = getFinalDesignation(row);

    if (!pn) {
        addIssue(result, 'missing_part_no', 'critical', ['PART NO.', 'pn_final', 'pn'], 'PN vacio');
    }

    if (!pos) {
        addIssue(result, 'missing_pos', 'warning', ['POS'], 'POS vacio');
    }

    if (!designation) {
        addIssue(result, 'missing_designation_final', 'warning', ['designation_final', 'designation_gesa', 'DESIGNATION'], 'Designation Final vacio');
    } else {
        const pdfLookup = await findDesignationInAssignedPdf(row, designation);
        if (pdfLookup.checked && !pdfLookup.found) {
            const pageSuffix = pdfLookup.pageNumber ? ` en pagina ${pdfLookup.pageNumber}` : '';
            const pdfSuffix = pdfLookup.pdfFileName ? ` (${pdfLookup.pdfFileName})` : '';
            addIssue(
                result,
                'designation_final_not_in_pdf',
                'warning',
                ['designation_final', 'designation_gesa', 'DESIGNATION', 'Source Page', 'source_file', 'engine_model'],
                `Designation Final no se encuentra en el PDF asignado${pageSuffix}${pdfSuffix}`
            );
        }
    }

    result.codes.sort((a, b) => a.localeCompare(b));
    Object.keys(result.fields).forEach((field) => {
        result.fields[field].sort((a, b) => a.localeCompare(b));
    });

    return result;
}

function stableSnapshot(errors) {
    if (!errors || typeof errors !== 'object') {
        return JSON.stringify({ version: 1, severity: 'none', codes: [], fields: {}, issues: [] });
    }

    const normalized = {
        version: Number.isFinite(Number(errors.version)) ? Number(errors.version) : 1,
        severity: text(errors.severity).toLowerCase() || 'none',
        codes: Array.isArray(errors.codes) ? [...new Set(errors.codes.map((code) => text(code)).filter(Boolean))].sort((a, b) => a.localeCompare(b)) : [],
        fields: {},
        issues: Array.isArray(errors.issues)
            ? errors.issues.map((issue) => ({
                code: text(issue?.code),
                severity: text(issue?.severity).toLowerCase() || 'warning',
                fields: Array.isArray(issue?.fields) ? issue.fields.map((field) => text(field)).filter(Boolean).sort((a, b) => a.localeCompare(b)) : [],
                message: text(issue?.message)
            })).sort((a, b) => `${a.code}|${a.message}`.localeCompare(`${b.code}|${b.message}`))
            : []
    };

    if (errors.fields && typeof errors.fields === 'object') {
        Object.keys(errors.fields).sort((a, b) => a.localeCompare(b)).forEach((field) => {
            const codes = Array.isArray(errors.fields[field])
                ? [...new Set(errors.fields[field].map((code) => text(code)).filter(Boolean))].sort((a, b) => a.localeCompare(b))
                : [];
            if (codes.length > 0) normalized.fields[field] = codes;
        });
    }

    return JSON.stringify(normalized);
}

async function applyQaErrorsToRows(rows, options = {}) {
    if (!Array.isArray(rows)) {
        throw new Error('applyQaErrorsToRows espera un array de filas');
    }

    const nowIso = text(options.nowIso) || new Date().toISOString();
    let changedRows = 0;
    let rowsWithErrors = 0;

    for (const row of rows) {
        const next = await validateRow(row);
        if (next.codes.length > 0) rowsWithErrors += 1;

        const prev = row?.qa_errors;
        if (stableSnapshot(prev) === stableSnapshot(next)) {
            if (!row.qa_errors || typeof row.qa_errors !== 'object') {
                row.qa_errors = { ...next, updated_at: nowIso };
                changedRows += 1;
            }
            continue;
        }

        row.qa_errors = { ...next, updated_at: nowIso };
        changedRows += 1;
    }

    return {
        totalRows: rows.length,
        rowsWithErrors,
        changedRows
    };
}

async function recomputeQaErrorsInFile(filePath, options = {}) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) {
        throw new Error(`El archivo no contiene un array JSON: ${filePath}`);
    }

    const summary = await applyQaErrorsToRows(rows, options);
    const activeSummary = Array.isArray(options.activeCodes)
        ? applyActiveQaErrorsToRows(rows, options.activeCodes)
        : { changedRows: 0, signature: '' };
    const totalChangedRows = summary.changedRows + activeSummary.changedRows;
    if (totalChangedRows > 0 || options.forceWrite === true) {
        fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
    }

    return {
        ...summary,
        changedRows: totalChangedRows,
        activeChangedRows: activeSummary.changedRows
    };
}

function getActiveCodesSignature(activeCodes) {
    if (!Array.isArray(activeCodes)) return '';
    return [...new Set(activeCodes.map(code => String(code || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .join('|');
}

function filterQaErrorsByCodes(qaErrors, activeCodes) {
    if (!qaErrors || !Array.isArray(activeCodes)) {
        return qaErrors;
    }

    const activeSet = new Set(activeCodes.map(c => String(c).trim()).filter(c => c));
    if (activeSet.size === 0) {
        return {
            version: qaErrors.version || 1,
            severity: 'none',
            codes: [],
            fields: {},
            issues: [],
            updated_at: new Date().toISOString()
        };
    }

    const filteredCodes = (qaErrors.codes || []).filter(code => activeSet.has(code));
    const filteredFields = {};
    const filteredIssues = [];

    (qaErrors.issues || []).forEach((issue) => {
        if (!activeSet.has(issue.code)) return;
        filteredIssues.push(issue);
        (issue.fields || []).forEach((field) => {
            if (!field) return;
            if (!filteredFields[field]) filteredFields[field] = [];
            if (!filteredFields[field].includes(issue.code)) {
                filteredFields[field].push(issue.code);
            }
        });
    });

    let severity = 'none';
    filteredIssues.forEach((issue) => {
        if (issue.severity === 'critical') severity = 'critical';
        else if (issue.severity === 'warning' && severity !== 'critical') severity = 'warning';
    });

    return {
        version: qaErrors.version || 1,
        severity,
        codes: filteredCodes,
        fields: filteredFields,
        issues: filteredIssues,
        signature: getActiveCodesSignature(activeCodes),
        updated_at: qaErrors.updated_at || new Date().toISOString()
    };
}

function applyActiveQaErrorsToRows(rows, activeCodes) {
    if (!Array.isArray(rows)) {
        throw new Error('applyActiveQaErrorsToRows espera un array de filas');
    }

    const signature = getActiveCodesSignature(activeCodes);
    let changedRows = 0;

    rows.forEach((row) => {
        const next = filterQaErrorsByCodes(row?.qa_errors || null, activeCodes);
        const prev = row?.qa_errors_active;
        const nextSnapshot = JSON.stringify(next || null);
        const prevSnapshot = JSON.stringify(prev || null);
        if (nextSnapshot !== prevSnapshot) {
            row.qa_errors_active = next ? { ...next, signature } : null;
            changedRows += 1;
        } else if (row?.qa_errors_active && row.qa_errors_active.signature !== signature) {
            row.qa_errors_active.signature = signature;
            changedRows += 1;
        }
    });

    return { changedRows, signature };
}

function getQaErrorsStats(rows, activeCodes) {
    let totalRows = 0;
    let rowsWithErrors = 0;
    const codeCount = {};
    const severityCount = { none: 0, warning: 0, critical: 0 };

    rows.forEach((row) => {
        totalRows++;
        const qaErrors = row.qa_errors_active || filterQaErrorsByCodes(row.qa_errors, activeCodes);
        if (!qaErrors) {
            severityCount.none++;
            return;
        }

        if (qaErrors.codes.length > 0) {
            rowsWithErrors++;
            severityCount[qaErrors.severity] = (severityCount[qaErrors.severity] || 0) + 1;
            qaErrors.codes.forEach((code) => {
                codeCount[code] = (codeCount[code] || 0) + 1;
            });
        } else {
            severityCount.none++;
        }
    });

    return {
        totalRows,
        rowsWithErrors,
        rowsOk: totalRows - rowsWithErrors,
        codeCount,
        severityCount
    };
}

module.exports = {
    DEFAULT_ACTIVE_QA_CODES,
    applyQaErrorsToRows,
    applyActiveQaErrorsToRows,
    recomputeQaErrorsInFile,
    validateRow,
    filterQaErrorsByCodes,
    getQaErrorsStats,
    getActiveCodesSignature
};