#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');

const ROOT_DIR = path.resolve(__dirname, '..');
const PDF_DIR = path.join(ROOT_DIR, 'pdf');

const PDF_FIELD_TO_JSON_KEY = {
    POS: 'pos_pdf',
    'PART NO.': 'pn_pdf',
    DESIGNATION: 'designation_pdf',
    'MODEL/TYPE': 'model_type_pdf',
    QTY: 'qty_pdf',
    UNITS: 'units_pdf',
    WEIGHT: 'weight_pdf',
    FN: 'fn_pdf',
    'MEASUREMENT / STANDARD': 'measure_pdf',
    NORMA: 'norma_pdf',
    'FG/FGS': 'fg_fgs_pdf',
    'BOM-No.': 'bom_pdf'
};

const UNIT_TOKENS = new Set(['PC', 'PCS', 'EA', 'SET', 'KIT', 'PAIR', 'PZA', 'PZAS']);

let cachedStandardFontDataUrl = null;

function txt(value) {
    return String(value == null ? '' : value).trim();
}

function normalizeString(value) {
    return txt(value).replace(/\s+/g, ' ');
}

function normalizePdfToken(value) {
    return normalizeString(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizePdfLookupValue(value) {
    return normalizePdfToken(value);
}

function matchesPdfLookupValue(value, candidates = []) {
    const normalizedValue = normalizePdfLookupValue(value);
    if (!normalizedValue) return false;

    const compactValue = normalizedValue.replace(/[^a-z0-9]/g, '');
    return candidates.some((candidate) => {
        const normalizedCandidate = normalizePdfLookupValue(candidate);
        if (!normalizedCandidate) return false;
        if (normalizedCandidate === normalizedValue) return true;
        const compactCandidate = normalizedCandidate.replace(/[^a-z0-9]/g, '');
        return compactValue && compactCandidate && compactCandidate === compactValue;
    });
}

function escapeRegExp(value) {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenMatchesPdf(pageText, candidateValue) {
    if (!pageText || !candidateValue) return false;
    if (pageText === candidateValue) return true;
    if (!pageText.includes(candidateValue)) return false;

    const separatorRegex = /[\s\-\,\.\;\/\(\)]/;
    let searchIndex = pageText.indexOf(candidateValue);
    while (searchIndex !== -1) {
        const endIndex = searchIndex + candidateValue.length;
        const beforeOk = searchIndex === 0 || separatorRegex.test(pageText[searchIndex - 1]);
        const afterOk = endIndex === pageText.length || separatorRegex.test(pageText[endIndex]);
        if (beforeOk && afterOk) return true;
        searchIndex = pageText.indexOf(candidateValue, searchIndex + 1);
    }

    return false;
}

function looksLikeFnValue(value) {
    const normalized = normalizeString(value).toUpperCase();
    if (!normalized) return false;
    if (normalized.length > 20) return false;
    if (!/[A-Z]/.test(normalized)) return false;
    return /^(?:[A-Z0-9/.-]{1,8})(?:\s+[A-Z0-9/.-]{1,8}){0,2}$/.test(normalized);
}

function looksLikeNormaValue(value) {
    const normalized = normalizeString(value).toUpperCase();
    if (!normalized) return false;
    if (/^(DIN|ISO|MTN|MMN|EN|SAE|ASTM|JIS)[A-Z0-9./-]*$/.test(normalized)) return true;
    if (/^[A-Z]{3,}[0-9]{2,}[A-Z0-9./-]*$/.test(normalized)) return true;
    return false;
}

function stripTrailingQtyFromDesignation(designation, qty) {
    const cleanedDesignation = normalizeString(designation);
    const cleanedQty = normalizeString(qty);

    if (!cleanedDesignation || !cleanedQty) return cleanedDesignation;
    if (cleanedDesignation === cleanedQty) return cleanedDesignation;

    if (cleanedDesignation.endsWith(` ${cleanedQty}`)) {
        const candidate = cleanedDesignation.slice(0, -(cleanedQty.length + 1)).trim();
        if (candidate && /[A-Za-z]/.test(candidate)) return candidate;
    }

    return cleanedDesignation;
}

function isQtyNumeric(value) {
    return /^\d+(?:[.,]\d+)?$/.test(normalizeString(value));
}

function isUnitToken(value) {
    return UNIT_TOKENS.has(normalizeString(value).toUpperCase());
}

function isWeightLike(value) {
    return /^\d+[\d.,]*\s*(?:G|GR|KG|LB|LBS)$/i.test(normalizeString(value));
}

function splitModelTypeTrailingQty(modelTypeValue) {
    const clean = normalizeString(modelTypeValue);
    const match = clean.match(/^(.*?)(?:\s+)(\d+(?:[.,]\d+)?)$/);
    if (!match) return { modelType: clean, qty: '' };
    return {
        modelType: normalizeString(match[1]),
        qty: normalizeString(match[2])
    };
}

function normalizePdfReadFieldAlignment(values = {}) {
    const normalized = {
        ...values,
        designation_pdf: normalizeString(values.designation_pdf),
        model_type_pdf: normalizeString(values.model_type_pdf),
        qty_pdf: normalizeString(values.qty_pdf),
        units_pdf: normalizeString(values.units_pdf),
        weight_pdf: normalizeString(values.weight_pdf)
    };

    const split = splitModelTypeTrailingQty(normalized.model_type_pdf);
    if (split.qty && (!isQtyNumeric(normalized.qty_pdf) || isUnitToken(normalized.qty_pdf))) {
        normalized.model_type_pdf = split.modelType || normalized.model_type_pdf;
        if (!isQtyNumeric(normalized.qty_pdf)) normalized.qty_pdf = split.qty;
    }

    if (isUnitToken(normalized.qty_pdf) && isWeightLike(normalized.units_pdf)) {
        const qtyToken = normalized.qty_pdf;
        const weightToken = normalized.units_pdf;
        normalized.units_pdf = qtyToken;
        normalized.weight_pdf = normalized.weight_pdf || weightToken;
    }

    return normalized;
}

function resolvePdfPageNumber(value) {
    const parsed = Number(String(value ?? '').replace(/[^0-9]/g, ''));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function inferModelFromEngineFile(file) {
    return String(file || '').replace(/^engine_/i, '').replace(/\.json$/i, '').trim();
}

function getPdfStandardFontDataUrl() {
    if (cachedStandardFontDataUrl !== null) return cachedStandardFontDataUrl;

    try {
        const pdfjsPkgPath = require.resolve('pdfjs-dist/package.json');
        const standardFontsDir = path.join(path.dirname(pdfjsPkgPath), 'standard_fonts');
        if (fs.existsSync(standardFontsDir)) {
            cachedStandardFontDataUrl = standardFontsDir.endsWith(path.sep)
                ? standardFontsDir
                : `${standardFontsDir}${path.sep}`;
            return cachedStandardFontDataUrl;
        }
    } catch (_) {
        // no-op
    }

    cachedStandardFontDataUrl = null;
    return cachedStandardFontDataUrl;
}

async function loadPdfJsLib() {
    const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return mod;
}

function loadJsonArray(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error(`El archivo no contiene un array JSON: ${filePath}`);
    return data;
}

function assignIfChanged(target, key, nextValue) {
    const current = target?.[key];
    if (String(current ?? '') === String(nextValue ?? '')) return false;
    target[key] = nextValue;
    return true;
}

async function getPdfPageData(pdfjsLib, caches, book, sourcePage) {
    const bookClean = txt(book);
    const pageNum = resolvePdfPageNumber(sourcePage);
    if (!bookClean || !pageNum) {
        return { status: 'missing-book-or-page', items: [], lines: [], normalizedText: '' };
    }

    const pageCacheKey = `${bookClean}::${pageNum}`;
    if (caches.pageTextCache.has(pageCacheKey)) return caches.pageTextCache.get(pageCacheKey);

    const task = (async () => {
        const pdfPath = path.join(PDF_DIR, `${bookClean}.pdf`);
        if (!fs.existsSync(pdfPath)) {
            return { status: 'pdf-not-found', items: [], lines: [], normalizedText: '', pdfPath };
        }

        if (!caches.pdfDocumentPromiseCache.has(pdfPath)) {
            const pdfBuffer = fs.readFileSync(pdfPath);
            const standardFontDataUrl = getPdfStandardFontDataUrl();
            const loadingTask = pdfjsLib.getDocument({
                data: new Uint8Array(pdfBuffer),
                isEvalSupported: false,
                ...(standardFontDataUrl ? { standardFontDataUrl } : {})
            });
            caches.pdfDocumentPromiseCache.set(pdfPath, loadingTask.promise);
        }

        const pdfDocument = await caches.pdfDocumentPromiseCache.get(pdfPath);
        if (pageNum < 1 || pageNum > pdfDocument.numPages) {
            return { status: 'page-out-of-range', items: [], lines: [], normalizedText: '', pdfPath };
        }

        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const items = (textContent.items || []).map((item) => {
            const text = txt(item?.str);
            if (!text) return null;
            const tx = item?.transform || [];
            return {
                text,
                normalized: normalizePdfToken(text),
                left: Number(tx?.[4] || 0),
                top: Number(tx?.[5] || 0),
                width: Number(item?.width || 0),
                lineIndex: -1
            };
        }).filter(Boolean);

        const lines = [];
        const LINE_TOL = 2;
        items.forEach((item) => {
            const line = lines.find((candidate) => Math.abs(candidate.top - item.top) <= LINE_TOL);
            if (line) {
                line.items.push(item);
                line.top = (line.top + item.top) / 2;
            } else {
                lines.push({ top: item.top, items: [item] });
            }
        });

        lines.sort((a, b) => b.top - a.top);
        lines.forEach((line, index) => {
            line.lineIndex = index;
            line.items.sort((a, b) => a.left - b.left);
            line.items.forEach((item) => {
                item.lineIndex = index;
            });
        });

        const normalizedText = normalizePdfToken(items.map((item) => item.text).join(' '));
        return { status: 'ok', items, lines, normalizedText, pdfPath };
    })().catch((error) => ({
        status: 'pdf-read-error',
        items: [],
        lines: [],
        normalizedText: '',
        error: String(error?.message || error)
    }));

    caches.pageTextCache.set(pageCacheKey, task);
    return task;
}

function findLineByPnAnchor(row, pageData) {
    const pnCandidates = [row?.pn_final, row?.pn_pdf, row?.['PART NO.']]
        .map((value) => txt(value))
        .filter(Boolean);
    if (!pnCandidates.length) return null;

    const candidatesNorm = pnCandidates.map((value) => normalizePdfToken(value));
    for (const line of pageData.lines || []) {
        const lineText = normalizePdfToken((line.items || []).map((item) => item.text).join(' '));
        for (const candidate of candidatesNorm) {
            if (tokenMatchesPdf(lineText, candidate)) {
                return line;
            }
        }
    }

    return null;
}

function parseVisualLikeCellsFromLine(line, row) {
    const items = Array.isArray(line?.items) ? [...line.items].sort((a, b) => a.left - b.left) : [];
    if (!items.length) return null;

    const pnCandidatesNorm = [row?.pn_final, row?.pn_pdf, row?.['PART NO.']]
        .map((value) => normalizePdfToken(value))
        .filter(Boolean);

    let pnIndex = -1;
    for (let i = 0; i < items.length; i += 1) {
        const norm = normalizePdfToken(items[i].text);
        if (pnCandidatesNorm.some((candidate) => tokenMatchesPdf(norm, candidate))) {
            pnIndex = i;
            break;
        }
    }
    if (pnIndex < 0) return null;

    const pnText = txt(items[pnIndex].text);
    const before = items.slice(0, pnIndex);
    const after = items.slice(pnIndex + 1);

    const posCandidate = [...before].reverse().find((item) => /^\d{1,4}$/.test(txt(item.text)));
    const pos = txt(posCandidate?.text);

    let designation = '';
    let modelType = '';
    let qty = '';
    let units = '';
    let weight = '';
    let fn = '';
    let measurement = '';
    let standard = '';

    const afterTexts = after.map((item) => txt(item.text)).filter(Boolean);

    for (let i = 0; i < afterTexts.length; i += 1) {
        const token = afterTexts[i];
        const upper = token.toUpperCase();

        if (!standard && looksLikeNormaValue(token)) {
            standard = token;
            continue;
        }

        if (!designation && /[A-Z]/i.test(token) && !isQtyNumeric(token) && !isUnitToken(token) && !isWeightLike(token)) {
            designation = token;
            continue;
        }

        if (!modelType && designation && /[A-Z0-9]/i.test(token) && !isQtyNumeric(token) && !isUnitToken(token) && !isWeightLike(token)) {
            modelType = token;
            continue;
        }

        if (!qty && isQtyNumeric(token)) {
            qty = token;
            continue;
        }

        if (!units && isUnitToken(token)) {
            units = token;
            continue;
        }

        if (!weight && isWeightLike(token)) {
            weight = token;
            continue;
        }

        if (!fn && looksLikeFnValue(token) && token.length <= 8 && !looksLikeNormaValue(token)) {
            fn = token;
            continue;
        }

        if (!measurement && /\d/.test(token)) {
            measurement = token;
            continue;
        }

        if (!standard && upper.length <= 24) {
            standard = token;
        }
    }

    if (!designation) designation = txt(row?.designation_pdf || row?.designation_final || row?.DESIGNATION);

    return {
        cells: {
            pos,
            part_no: pnText,
            designation,
            model_type: modelType,
            qty,
            units,
            weight,
            fn,
            measurement,
            standard,
            unknown: ''
        }
    };
}

function buildVisualCopyValues(parsedRow) {
    const cells = parsedRow?.cells || {};
    const qtyValue = normalizeString(cells.qty);
    const designationValue = stripTrailingQtyFromDesignation(cells.designation, qtyValue);
    const parsedFn = normalizeString(cells.fn);
    const unknownFn = looksLikeFnValue(cells.unknown) ? normalizeString(cells.unknown) : '';

    return normalizePdfReadFieldAlignment({
        pos_pdf: normalizeString(cells.pos),
        pn_pdf: normalizeString(cells.part_no),
        designation_pdf: designationValue,
        model_type_pdf: normalizeString(cells.model_type),
        qty_pdf: qtyValue,
        units_pdf: normalizeString(cells.units),
        weight_pdf: normalizeString(cells.weight),
        fn_pdf: parsedFn || unknownFn,
        measure_pdf: normalizeString(cells.measurement),
        norma_pdf: normalizeString(cells.standard)
    });
}

function applyRowFallbacksToValues(values, row) {
    const out = { ...(values || {}) };

    // Keep legacy visual layout when UNITS already stores weight text and WEIGHT is empty.
    const existingUnits = normalizeString(row?.units_pdf);
    const existingWeight = normalizeString(row?.weight_pdf);
    if (existingUnits && !existingWeight && out.units_pdf && out.weight_pdf) {
        const startsWithUnit = existingUnits.startsWith(`${normalizeString(out.units_pdf)} `);
        const endsWithWeight = existingUnits.endsWith(normalizeString(out.weight_pdf));
        if (startsWithUnit && endsWithWeight) {
            out.units_pdf = existingUnits;
            out.weight_pdf = '';
        }
    }

    if (!normalizeString(out.fn_pdf)) {
        const fnFinal = normalizeString(row?.fn_final || row?.FN);
        if (looksLikeFnValue(fnFinal) && !looksLikeNormaValue(fnFinal)) {
            out.fn_pdf = fnFinal;
        }
    }
    return out;
}

function scoreVisualValues(values, row) {
    let score = 0;
    if (matchesPdfLookupValue(values.pos_pdf, [row?.pos_final, row?.pos_pdf, row?.POS])) score += 4;
    if (matchesPdfLookupValue(values.pn_pdf, [row?.pn_final, row?.pn_pdf, row?.['PART NO.']])) score += 6;
    if (matchesPdfLookupValue(values.designation_pdf, [row?.designation_final, row?.designation_pdf, row?.DESIGNATION])) score += 2;
    if (matchesPdfLookupValue(values.qty_pdf, [row?.qty_final, row?.qty_pdf, row?.QTY])) score += 1;
    if (matchesPdfLookupValue(values.weight_pdf, [row?.weight_final, row?.weight_pdf, row?.WEIGHT])) score += 1;
    return score;
}

function cleanupTopPdfFieldValue(value) {
    return String(value ?? '')
        .replace(/^[\s:\-]+/, '')
        .replace(/[\s,;:.!?]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeTopPdfLineText(value) {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractTopLabeledValue(lines, config = {}) {
    const labelRegex = config.labelRegex instanceof RegExp ? config.labelRegex : null;
    const valueRegex = config.valueRegex instanceof RegExp ? config.valueRegex : null;
    const rejectNextLineRegex = config.rejectNextLineRegex instanceof RegExp ? config.rejectNextLineRegex : null;
    const sameLineOnly = config.sameLineOnly === true;
    if (!labelRegex || !valueRegex || !Array.isArray(lines) || !lines.length) return null;

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const lineText = normalizeTopPdfLineText(line?.text);
        if (!lineText || !labelRegex.test(lineText)) continue;

        const sameLineMatch = lineText.match(valueRegex);
        let value = cleanupTopPdfFieldValue(sameLineMatch?.[1] || '');

        if (!value && !sameLineOnly) {
            const nextLine = lines[index + 1] || null;
            const nextText = normalizeTopPdfLineText(nextLine?.text);
            if (nextText) {
                const blocked = rejectNextLineRegex ? rejectNextLineRegex.test(nextText) : false;
                if (!blocked) value = cleanupTopPdfFieldValue(nextText);
            }
        }

        if (value) return { value };
    }

    return null;
}

function extractTopBomValue(lines, rejectNextLineRegex = null) {
    const labelRegex = /\bbom(?:\s*[-\s]?(?:no\.?|nr\.?|number))?\b/i;
    const parseBomCandidate = (text) => {
        const cleaned = cleanupTopPdfFieldValue(text);
        if (!cleaned) return '';
        const match = cleaned.match(/\b(?=[a-z0-9./\-]*\d)[a-z0-9][a-z0-9./\-]*\b/i);
        return cleanupTopPdfFieldValue(match?.[0] || '');
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const lineText = normalizeTopPdfLineText(line?.text);
        if (!lineText || !labelRegex.test(lineText)) continue;

        const remainder = lineText.replace(/^.*?\bbom(?:\s*[-\s]?(?:no\.?|nr\.?|number))?\b\s*[:\-]?\s*/i, '');
        let value = parseBomCandidate(remainder);

        if (!value) {
            const nextLine = lines[index + 1] || null;
            const nextText = normalizeTopPdfLineText(nextLine?.text);
            if (nextText) {
                const blocked = rejectNextLineRegex instanceof RegExp ? rejectNextLineRegex.test(nextText) : false;
                if (!blocked) value = parseBomCandidate(nextText);
            }
        }

        if (value) return { value };
    }

    return null;
}

function extractTopLineValues(pageData) {
    const lines = Array.isArray(pageData?.lines) ? pageData.lines : [];
    if (!lines.length) return { fg_fgs_pdf: '', bom_pdf: '' };

    const pageMaxTop = Math.max(...lines.map((line) => Number(line.top || 0)));
    const pageMinTop = Math.min(...lines.map((line) => Number(line.top || 0)));
    const topThreshold = pageMinTop + (pageMaxTop - pageMinTop) * 0.3;

    const topLines = lines.filter((line) => Number(line.top || 0) >= topThreshold)
        .map((line) => ({
            text: normalizeString((line.items || []).map((item) => item.text).join(' '))
        }))
        .filter((line) => line.text);

    const tableHeaderRegex = /\b(pos|part\s*no\.?|designation|model\s*\/\s*type|qty\.?|units|weight|fn|measurement|standard)\b/i;
    const fgDetection = extractTopLabeledValue(topLines, {
        labelRegex: /\bfg\s*\/?\s*fgs\b/i,
        valueRegex: /\bfg\s*\/?\s*fgs\b\s*[:\-]?\s*(.+)$/i,
        rejectNextLineRegex: tableHeaderRegex,
        sameLineOnly: true
    });
    const bomDetection = extractTopBomValue(topLines, tableHeaderRegex);

    let fg = normalizeString(fgDetection?.value || '');
    if (fg) fg = fg.replace(/^(\S+)\s+(\S+)$/, '$1-$2');
    const bom = normalizeString(bomDetection?.value || '');

    return {
        fg_fgs_pdf: fg,
        bom_pdf: bom
    };
}

async function runVisualCopyComparison(options) {
    if (!options.file) throw new Error('Falta parametro requerido: file');
    if (!ENGINE_JSON_FILES.includes(options.file)) throw new Error(`Archivo no permitido (${options.file})`);

    const filePath = path.join(ROOT_DIR, options.file);
    if (!fs.existsSync(filePath)) throw new Error(`No existe el archivo ${filePath}`);

    const rows = loadJsonArray(filePath);
    const rowsToProcess = options.id
        ? rows.filter((row) => String(row?.ID ?? '').trim() === String(options.id).trim())
        : rows;

    if (options.id && rowsToProcess.length === 0) {
        throw new Error(`No se encontro ningun registro con ID=${options.id} en ${options.file}`);
    }

    const pdfjsLib = await loadPdfJsLib();
    const caches = {
        pdfDocumentPromiseCache: new Map(),
        pageTextCache: new Map()
    };

    const reportRows = [];
    const missingPages = [];
    let changedPdfFieldsRows = 0;

    for (const row of rowsToProcess) {
        const rowBook = txt(row?.engine_model) || inferModelFromEngineFile(options.file);
        const rowPage = txt(row?.['Source Page']);
        const pageData = await getPdfPageData(pdfjsLib, caches, rowBook, rowPage);

        if (pageData.status !== 'ok') {
            missingPages.push({
                ID: String(row?.ID ?? ''),
                book: rowBook,
                sourcePage: rowPage,
                status: pageData.status,
                detail: pageData.error || pageData.pdfPath || ''
            });
        }

        const line = pageData.status === 'ok' ? findLineByPnAnchor(row, pageData) : null;
        const parsedRow = line ? parseVisualLikeCellsFromLine(line, row) : null;
        const valuesToCopy = parsedRow ? buildVisualCopyValues(parsedRow) : {};
        const topValues = pageData.status === 'ok' ? extractTopLineValues(pageData) : { fg_fgs_pdf: '', bom_pdf: '' };

        const mergedValues = applyRowFallbacksToValues({
            ...valuesToCopy,
            ...(topValues.fg_fgs_pdf ? { fg_fgs_pdf: topValues.fg_fgs_pdf } : {}),
            ...(topValues.bom_pdf ? { bom_pdf: topValues.bom_pdf } : {})
        }, row);

        let rowChanged = false;
        const changedFields = [];
        if (options.writePdf) {
            for (const fieldKey of Object.values(PDF_FIELD_TO_JSON_KEY)) {
                if (!Object.prototype.hasOwnProperty.call(mergedValues, fieldKey)) continue;
                const value = normalizeString(mergedValues[fieldKey]);
                if (!value) continue;
                if (assignIfChanged(row, fieldKey, value)) {
                    rowChanged = true;
                    changedFields.push(fieldKey);
                }
            }

            if (changedFields.includes('norma_pdf') && txt(row?.normalizado_pdf).toUpperCase() !== 'SI') {
                if (assignIfChanged(row, 'normalizado_pdf', 'SI')) {
                    rowChanged = true;
                    changedFields.push('normalizado_pdf');
                }
            }
        }

        if (rowChanged) changedPdfFieldsRows += 1;

        reportRows.push({
            ID: String(row?.ID ?? ''),
            engine_model: rowBook,
            source_page: rowPage,
            pn_anchor_found: Boolean(line),
            line_index: Number.isInteger(line?.lineIndex) ? line.lineIndex : null,
            visual_score: parsedRow ? scoreVisualValues(valuesToCopy, row) : 0,
            copied_values: mergedValues,
            changed_fields: changedFields
        });
    }

    let wroteEngineFile = false;
    if (options.writePdf && changedPdfFieldsRows > 0) {
        if (options.backup) fs.copyFileSync(filePath, `${filePath}.backup`);
        fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
        wroteEngineFile = true;
    }

    const report = {
        generated_at: new Date().toISOString(),
        mode: 'visual-compatible-backend',
        file: options.file,
        id: options.id || null,
        scanned_rows: rowsToProcess.length,
        changed_pdf_fields_rows: changedPdfFieldsRows,
        wrote_engine_file: wroteEngineFile,
        write_pdf: Boolean(options.writePdf),
        missing_pages: missingPages,
        rows: reportRows
    };

    return { report };
}

module.exports = {
    runVisualCopyComparison
};
