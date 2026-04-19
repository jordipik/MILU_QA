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
    'missing_pn_final',
    'pn_final_not_equal_pn_pdf',
    'missing_designation_final',
    'designation_final_not_in_pdf'
];
const PN_NEAR_BY_X_MAX = 240;
const TOKEN_MERGE_GAP_MAX = 28;

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

function tokenMatches(itemText, tokenValue, allowContains) {
    if (!itemText || !tokenValue) return false;
    if (itemText === tokenValue) return true;

    if (!allowContains) return false;

    const separatorRegex = /[\s\-\,\.\;\/\(\)]/;
    let searchIndex = itemText.indexOf(tokenValue);

    while (searchIndex !== -1) {
        const endIndex = searchIndex + tokenValue.length;
        const beforeOk = searchIndex === 0 || separatorRegex.test(itemText[searchIndex - 1]);
        const afterOk = endIndex === itemText.length || separatorRegex.test(itemText[endIndex]);
        if (beforeOk && afterOk) return true;
        searchIndex = itemText.indexOf(tokenValue, searchIndex + 1);
    }

    return false;
}

function buildPageLines(rects) {
    if (!Array.isArray(rects) || rects.length === 0) return [];

    const sorted = [...rects].sort((a, b) => {
        const yDelta = b.centerY - a.centerY;
        if (Math.abs(yDelta) > 2) return yDelta;
        return a.left - b.left;
    });

    const lines = [];
    sorted.forEach((rect) => {
        const lineThreshold = Math.max(rect.height, 12) * 0.5 + 2;
        const line = lines.find(item => Math.abs(item.centerY - rect.centerY) <= lineThreshold);
        if (line) {
            line.rects.push(rect);
            line.centerY = (line.centerY + rect.centerY) / 2;
            return;
        }
        lines.push({ centerY: rect.centerY, rects: [rect] });
    });

    return lines;
}

function hasExactDesignationInPage(pageRects, normalizedDesignation) {
    if (!Array.isArray(pageRects) || !pageRects.length) return false;
    if (!normalizedDesignation) return false;

    if (pageRects.some(rect => tokenMatches(rect.normalizedText, normalizedDesignation, true))) return true;

    const lines = buildPageLines(pageRects);
    return lines.some((line) => {
        const lineRects = [...line.rects].sort((a, b) => a.left - b.left);
        const clusters = buildTextClusters(lineRects);
        return clusters.some((cluster) => {
            const clusterText = normalizePdfToken(cluster.words.join(' '));
            return tokenMatches(clusterText, normalizedDesignation, true);
        });
    });
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
            const items = textContent.items || [];
            const rawText = items
                .map(item => String(item?.str || ''))
                .join(' ');

            const rects = items.map((item) => {
                const tx = item?.transform || [];
                const left = Number(tx?.[4] || 0);
                const top = Number(tx?.[5] || 0);
                const width = Number(item?.width || 0);
                const height = Number(item?.height || 12) || 12;
                return {
                    text: String(item?.str || ''),
                    normalizedText: normalizePdfToken(item?.str),
                    left,
                    top,
                    width,
                    height,
                    centerY: top - (height / 2)
                };
            }).filter(rect => rect.normalizedText);

            pageIndex.set(pageNumber, {
                normalized: normalizePdfToken(rawText),
                compact: compactPdfToken(rawText),
                rects
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

function buildTextClusters(rects) {
    if (!Array.isArray(rects) || rects.length === 0) return [];
    const clusters = [];
    let currentCluster = null;

    rects.forEach((rect) => {
        if (!currentCluster) {
            currentCluster = {
                left: rect.left,
                right: rect.left + rect.width,
                words: [rect.normalizedText]
            };
            return;
        }

        const gap = rect.left - currentCluster.right;
        if (gap <= TOKEN_MERGE_GAP_MAX) {
            currentCluster.words.push(rect.normalizedText);
            currentCluster.right = Math.max(currentCluster.right, rect.left + rect.width);
            return;
        }

        clusters.push(currentCluster);
        currentCluster = {
            left: rect.left,
            right: rect.left + rect.width,
            words: [rect.normalizedText]
        };
    });

    if (currentCluster) clusters.push(currentCluster);
    return clusters;
}

function hasDesignationNearPartNumber(pageRects, normalizedPartNumber, normalizedDesignation) {
    if (!Array.isArray(pageRects) || !pageRects.length) return false;
    if (!normalizedPartNumber || !normalizedDesignation) return false;

    const allowPnContains = normalizedPartNumber.length >= 6;
    const pnRects = pageRects.filter(rect => tokenMatches(rect.normalizedText, normalizedPartNumber, allowPnContains));
    if (!pnRects.length) return false;

    return pnRects.some((pnRect) => {
        const sameLineThreshold = Math.max(pnRect.height, 12) * 0.9 + 6;
        const lineRects = pageRects
            .filter((rect) => {
                const verticalGap = Math.abs(rect.centerY - pnRect.centerY);
                if (verticalGap > sameLineThreshold) return false;

                const xStart = pnRect.left + pnRect.width - 2;
                const xDelta = rect.left - xStart;
                return xDelta >= 0 && xDelta <= PN_NEAR_BY_X_MAX;
            })
            .sort((a, b) => a.left - b.left);

        if (!lineRects.length) return false;

        const clusters = buildTextClusters(lineRects);
        return clusters.some((cluster) => {
            const clusterText = normalizePdfToken(cluster.words.join(' '));
            return tokenMatches(clusterText, normalizedDesignation, true);
        });
    });
}

async function findPnFinalInAssignedPdf(row, pnFinal) {
    const pdfPath = resolveAssignedPdfPath(row);
    const pageNumber = resolvePageNumber(row?.['Source Page']);
    const normalizedPn = normalizePdfToken(pnFinal);

    if (!pdfPath || !pageNumber || !normalizedPn) {
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

    // Coincidencia exacta: el rect del PDF debe ser exactamente igual a pn_final normalizado.
    // Si el PDF tiene 0023912760297149 y pn_final es 912760297149, no coincide (igual que el visor).
    const found = pageText.rects.some(rect => rect.normalizedText === normalizedPn);

    return {
        checked: true,
        found,
        pageNumber,
        pdfFileName: path.basename(pdfPath)
    };
}

async function findDesignationInAssignedPdf(row, designation) {
    const pdfPath = resolveAssignedPdfPath(row);
    const pageNumber = resolvePageNumber(row?.['Source Page']);
    const partNumber = getPartNumber(row);
    const normalizedDesignation = normalizePdfToken(designation);
    const compactDesignation = compactPdfToken(designation);
    const normalizedPartNumber = normalizePdfToken(partNumber);

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

    const foundByDesignationOnly = hasExactDesignationInPage(pageText.rects || [], normalizedDesignation);

    let found = foundByDesignationOnly;
    if (normalizedPartNumber && normalizedDesignation) {
        found = hasDesignationNearPartNumber(pageText.rects || [], normalizedPartNumber, normalizedDesignation);
    } else if (compactDesignation) {
        found = foundByDesignationOnly;
    }

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
    const pnFinal = text(row?.pn_final);
    const pnPdf = text(row?.pn_pdf);
    const pos = text(row?.POS);
    const designation = getFinalDesignation(row);

    if (!pn) {
        addIssue(result, 'missing_part_no', 'critical', ['PART NO.', 'pn_final', 'pn'], 'PN vacio');
    }

    if (!pos) {
        addIssue(result, 'missing_pos', 'critical', ['POS'], 'POS vacio');
    }

    if (!pnFinal) {
        addIssue(result, 'missing_pn_final', 'critical', ['pn_final'], 'PN Final vacio');
    } else {
        if (!pnPdf || pnFinal !== pnPdf) {
            addIssue(
                result,
                'pn_final_not_equal_pn_pdf',
                'critical',
                ['pn_final', 'pn_pdf'],
                'PN Final debe ser igual a PN PDF'
            );
        }
    }

    if (!designation) {
        addIssue(result, 'missing_designation_final', 'critical', ['designation_final', 'designation_gesa', 'DESIGNATION'], 'Designation Final vacio');
    } else {
        const pdfLookup = await findDesignationInAssignedPdf(row, designation);
        if (pdfLookup.checked && !pdfLookup.found) {
            const pageSuffix = pdfLookup.pageNumber ? ` en pagina ${pdfLookup.pageNumber}` : '';
            const pdfSuffix = pdfLookup.pdfFileName ? ` (${pdfLookup.pdfFileName})` : '';
            addIssue(
                result,
                'designation_final_not_in_pdf',
                'critical',
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

    const severity = filteredIssues.length > 0 ? 'critical' : 'none';

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
            severityCount.critical = (severityCount.critical || 0) + 1;
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