import { getEngineJsonFiles } from './data-loader.js';
import { inferEngineModelFromFileName } from './helpers.js';
import {
    buildHeaderColumnBodyHighlights,
    clearPdfAllOverlays,
    clearPdfHeaderColumnBodyHighlights,
    clearPdfHeaderOnlyOverlay,
    getCurrentPdfPageCount,
    getPdfLastPageData,
    getPdfHeaderColumnBodyDebug,
    initPdfZoomControls,
    loadPdfClear,
    loadPdfWithPage,
    requestPdfRelayout,
    runPdfHeaderOnlyDetection,
    setPdfSelection
} from './pdf-viewer.js';

const $ = (id) => document.getElementById(id);

const PREVIEW_COLUMNS = [
    'row_index',
    'pos_pdf',
    'pn_pdf',
    'designation_pdf',
    'model_type_pdf',
    'qty_pdf',
    'units_pdf',
    'weight_pdf',
    'fn_pdf',
    'measure_pdf',
    'norma_pdf',
    'bom_pdf',
    'fg_fgs_pdf',
    'confidence',
    'warnings'
];

let currentPreviewPayload = null;

function normalizeString(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
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
        let method = 'same-line';
        let valueLineIndex = Number(line?.lineIndex);

        if (!value && !sameLineOnly) {
            const nextLine = lines[index + 1] || null;
            const nextText = normalizeTopPdfLineText(nextLine?.text);
            if (nextText) {
                const blocked = rejectNextLineRegex ? rejectNextLineRegex.test(nextText) : false;
                if (!blocked) {
                    value = cleanupTopPdfFieldValue(nextText);
                    method = 'next-line';
                    valueLineIndex = Number(nextLine?.lineIndex);
                }
            }
        }

        if (value) {
            return {
                value,
                lineIndex: Number(line?.lineIndex),
                valueLineIndex: Number.isFinite(valueLineIndex) ? valueLineIndex : Number(line?.lineIndex),
                method,
                lineText
            };
        }
    }

    return null;
}

function extractTopBomValue(lines, rejectNextLineRegex = null) {
    const labelRegex = /\b(?:b\.?o\.?m\.?)(?:\s*[-\s]?(?:no\.?|nr\.?|number))?\b/i;
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

        const remainder = lineText.replace(/^.*?\b(?:b\.?o\.?m\.?)(?:\s*[-\s]?(?:no\.?|nr\.?|number))?\b\s*[:\-]?\s*/i, '');
        let value = parseBomCandidate(remainder);
        let method = 'same-line';
        let valueLineIndex = Number(line?.lineIndex);

        if (!value) {
            const nextLine = lines[index + 1] || null;
            const nextText = normalizeTopPdfLineText(nextLine?.text);
            if (nextText) {
                const blocked = rejectNextLineRegex instanceof RegExp ? rejectNextLineRegex.test(nextText) : false;
                if (!blocked) {
                    value = parseBomCandidate(nextText);
                    if (value) {
                        method = 'next-line';
                        valueLineIndex = Number(nextLine?.lineIndex);
                    }
                }
            }
        }

        if (value) {
            return {
                value,
                lineIndex: Number(line?.lineIndex),
                valueLineIndex: Number.isFinite(valueLineIndex) ? valueLineIndex : Number(line?.lineIndex),
                method,
                lineText
            };
        }
    }

    return null;
}

function buildRenderedPdfItemsWithLineIndex(textItems, viewport) {
    if (!Array.isArray(textItems) || !textItems.length || !viewport || !window.pdfjsLib?.Util?.transform) {
        return [];
    }

    const baseItems = textItems.map((item) => {
        const text = String(item?.str || '').trim();
        if (!text) return null;

        const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
        return {
            text,
            left: Number(tx?.[4] || 0),
            top: Number(tx?.[5] || 0),
            height: (Number(item?.height || 0) * Number(viewport?.scale || 1)) || 12,
            lineIndex: -1
        };
    }).filter(Boolean);

    const HEADER_LINE_Y_TOLERANCE = 5;
    const lines = [];
    baseItems.forEach((item) => {
        const existing = lines.find((line) => Math.abs(Number(line.top) - Number(item.top)) <= HEADER_LINE_Y_TOLERANCE);
        if (existing) {
            existing.items.push(item);
            existing.top = (existing.top + item.top) / 2;
        } else {
            lines.push({ top: item.top, items: [item] });
        }
    });

    lines.sort((a, b) => Number(a.top) - Number(b.top));
    lines.forEach((line, idx) => {
        line.items.forEach((item) => {
            item.lineIndex = idx;
        });
    });

    return baseItems;
}

function detectTopBomAndFgFromCurrentPage() {
    const { textItems, viewport } = getPdfLastPageData();
    const pageItems = buildRenderedPdfItemsWithLineIndex(textItems, viewport);
    if (!pageItems.length) {
        return { bomPdf: '', fgFgsPdf: '', topLines: [], entries: [] };
    }

    const topLineMap = new Map();
    const allTops = pageItems.map((item) => Number(item?.top || 0));
    const pageMaxTop = allTops.length ? Math.max(...allTops) : 0;
    const pageMinTop = allTops.length ? Math.min(...allTops) : 0;
    const pageTopThreshold = pageMinTop + (pageMaxTop - pageMinTop) * 0.30;

    pageItems
        .filter((item) => Number.isInteger(Number(item?.lineIndex)))
        .filter((item) => Number(item?.top || 0) <= pageTopThreshold)
        .sort((a, b) => Number(a?.lineIndex || 0) - Number(b?.lineIndex || 0) || Number(a?.left || 0) - Number(b?.left || 0))
        .forEach((item) => {
            const lineIndex = Number(item?.lineIndex);
            if (!topLineMap.has(lineIndex)) topLineMap.set(lineIndex, []);
            topLineMap.get(lineIndex).push(item);
        });

    const topLines = Array.from(topLineMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([lineIndex, items]) => ({
            lineIndex,
            text: items.map((item) => String(item?.text || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
        }))
        .filter((line) => line.text);

    const tableHeaderRegex = /\b(pos|part\s*no\.?|designation|model\s*\/\s*type|qty\.?|units|weight|fn|measurement|standard)\b/i;
    const fgLabelRegex = /\b(?:fg(?:\s*(?:\/|-)\s*|\s+)fgs|fg\/fgs|fgs|fg)\b/i;

    const fgDetection = extractTopLabeledValue(topLines, {
        labelRegex: fgLabelRegex,
        valueRegex: /\b(?:fg(?:\s*(?:\/|-)\s*|\s+)fgs|fg\/fgs|fgs|fg)\b\s*[:\-]?\s*(.+)$/i,
        rejectNextLineRegex: tableHeaderRegex,
        sameLineOnly: true
    });

    const bomDetection = extractTopBomValue(topLines, tableHeaderRegex);

    let fgFgsPdf = cleanupTopPdfFieldValue(fgDetection?.value || '');
    if (fgFgsPdf) {
        fgFgsPdf = String(fgFgsPdf).replace(/^([^\s]+)\s+([^\s]+)$/, '$1-$2');
    }

    const bomPdf = cleanupTopPdfFieldValue(bomDetection?.value || '');

    return {
        bomPdf,
        fgFgsPdf,
        topLines,
        entries: [
            { key: 'fg_fgs', found: Boolean(fgFgsPdf), value: fgFgsPdf, method: fgDetection?.method || '' },
            { key: 'bom', found: Boolean(bomPdf), value: bomPdf, method: bomDetection?.method || '' }
        ]
    };
}

function looksLikeFnValue(value) {
    const normalized = normalizeString(value).toUpperCase();
    if (!normalized) return false;
    if (normalized.length > 20) return false;
    if (!/[A-Z]/.test(normalized)) return false;
    return /^(?:[A-Z0-9/.-]{1,8})(?:\s+[A-Z0-9/.-]{1,8}){0,2}$/.test(normalized);
}

function stripTrailingQtyFromDesignation(designation, qty) {
    const rawDesignation = normalizeString(designation);
    const rawQty = normalizeString(qty);
    if (!rawDesignation) return '';

    if (rawQty) {
        const qtyPattern = new RegExp(`\\s+${rawQty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        if (qtyPattern.test(rawDesignation)) {
            return rawDesignation.replace(qtyPattern, '').trim();
        }
    }

    return rawDesignation;
}

function looksLikeExtractedPartNumberToken(value) {
    const token = normalizeString(value).toUpperCase();
    if (!token || /\s/.test(token)) return false;
    if (/^X00[A-Z0-9./-]+$/.test(token)) return true;
    if (/^000[A-Z0-9./-]+$/.test(token)) return true;
    if (/\d{6,}/.test(token)) return true;
    return false;
}

function extractLeadingPnFromDesignation(designationValue, pnValue = '') {
    const currentPn = normalizeString(pnValue);
    const designation = normalizeString(designationValue);
    if (currentPn || !designation) return { pn: currentPn, designation };

    const match = designation.match(/^([A-Z0-9][A-Z0-9./-]{5,})\s+(.+)$/i);
    if (!match) return { pn: currentPn, designation };

    const candidatePn = normalizeString(match[1]);
    const rest = normalizeString(match[2]);
    if (!looksLikeExtractedPartNumberToken(candidatePn) || !rest) {
        return { pn: currentPn, designation };
    }

    return { pn: candidatePn, designation: rest };
}

function extractLeadingPosPnFromDesignation(designationValue, posValue = '', pnValue = '') {
    const currentPos = normalizeString(posValue);
    const currentPn = normalizeString(pnValue);
    const designation = normalizeString(designationValue);
    if ((currentPos && currentPn) || !designation) {
        return { pos: currentPos, pn: currentPn, designation };
    }

    const match = designation.match(/^(\d{2,5}[A-Z]?)\s+([A-Z0-9][A-Z0-9./-]{5,})\s+(.+)$/i);
    if (!match) {
        return { pos: currentPos, pn: currentPn, designation };
    }

    const candidatePos = normalizeString(match[1]);
    const candidatePn = normalizeString(match[2]);
    const rest = normalizeString(match[3]);
    if (!/^\d{2,5}[A-Z]?$/.test(candidatePos) || !looksLikeExtractedPartNumberToken(candidatePn) || !rest) {
        return { pos: currentPos, pn: currentPn, designation };
    }

    return {
        pos: currentPos || candidatePos,
        pn: currentPn || candidatePn,
        designation: rest
    };
}

function normalizePdfReadFieldAlignment(values) {
    const normalized = {
        pos_pdf: normalizeString(values?.pos_pdf),
        pn_pdf: normalizeString(values?.pn_pdf),
        designation_pdf: normalizeString(values?.designation_pdf),
        model_type_pdf: normalizeString(values?.model_type_pdf),
        qty_pdf: normalizeString(values?.qty_pdf),
        units_pdf: normalizeString(values?.units_pdf),
        weight_pdf: normalizeString(values?.weight_pdf),
        fn_pdf: normalizeString(values?.fn_pdf),
        measure_pdf: normalizeString(values?.measure_pdf),
        norma_pdf: normalizeString(values?.norma_pdf)
    };

    const repairedPosPnDesignation = extractLeadingPosPnFromDesignation(
        normalized.designation_pdf,
        normalized.pos_pdf,
        normalized.pn_pdf
    );
    normalized.pos_pdf = repairedPosPnDesignation.pos;
    normalized.pn_pdf = repairedPosPnDesignation.pn;
    normalized.designation_pdf = repairedPosPnDesignation.designation;

    const repairedPnDesignation = extractLeadingPnFromDesignation(normalized.designation_pdf, normalized.pn_pdf);
    normalized.pn_pdf = repairedPnDesignation.pn;
    normalized.designation_pdf = repairedPnDesignation.designation;

    return normalized;
}

function groupMarkedPdfRectsByRow(rectDebug = [], tolerance = 8) {
    const rows = [];

    [...rectDebug]
        .filter((item) => String(item?.text ?? '').trim())
        .sort((left, right) => Number(left?.rectTop || 0) - Number(right?.rectTop || 0) || Number(left?.rectLeft || 0) - Number(right?.rectLeft || 0))
        .forEach((item) => {
            const rectTop = Number(item?.rectTop || 0);
            const lastRow = rows[rows.length - 1];

            if (lastRow && Math.abs(rectTop - lastRow.centerTop) <= tolerance) {
                lastRow.items.push(item);
                lastRow.centerTop = (lastRow.centerTop + rectTop) / 2;
                return;
            }

            rows.push({
                centerTop: rectTop,
                items: [item]
            });
        });

    return rows;
}

function buildMarkedRowValuesFromGroup(rowGroup = {}) {
    const byColumn = new Map();

    (rowGroup.items || []).forEach((item) => {
        const column = String(item?.column || '').trim();
        const text = normalizeString(item?.text);

        if (!column || !text) return;

        if (!byColumn.has(column)) byColumn.set(column, []);
        byColumn.get(column).push({ text, left: Number(item?.rectLeft || 0) });
    });

    const readColumn = (...keys) => {
        const texts = keys
            .flatMap((key) => byColumn.get(key) || [])
            .sort((left, right) => left.left - right.left)
            .map((entry) => entry.text)
            .filter(Boolean);

        return texts.join(' ').replace(/\s+/g, ' ').trim();
    };

    const measurement = readColumn('measurement');
    const standard = readColumn('standard');
    const parsedFn = readColumn('fn');
    const unknownFn = looksLikeFnValue(readColumn('unknown')) ? readColumn('unknown') : '';
    const qtyValue = readColumn('qty');
    const designationValue = stripTrailingQtyFromDesignation(readColumn('designation'), qtyValue);

    return normalizePdfReadFieldAlignment({
        pos_pdf: readColumn('pos'),
        pn_pdf: readColumn('part_no'),
        designation_pdf: designationValue,
        model_type_pdf: readColumn('model_type'),
        qty_pdf: qtyValue,
        units_pdf: readColumn('units'),
        weight_pdf: readColumn('weight'),
        fn_pdf: parsedFn || unknownFn,
        measure_pdf: measurement,
        norma_pdf: standard
    });
}

function buildPdfPageRowPreviewFromGroup(rowGroup = {}, options = {}) {
    const sourcePage = Number(options?.sourcePage || 0);
    const rowIndex = Number(options?.rowIndex || 0);
    const bomPdf = normalizeString(options?.bomPdf);
    const fgFgsPdf = normalizeString(options?.fgFgsPdf);

    const values = buildMarkedRowValuesFromGroup(rowGroup);
    const items = Array.isArray(rowGroup?.items) ? rowGroup.items : [];
    const columnsSeen = new Set(items.map((item) => String(item?.column || '').trim()).filter(Boolean));

    const warnings = [];
    if (!values.pn_pdf) warnings.push('pn-missing');
    if (!values.pos_pdf) warnings.push('pos-missing');
    if (!values.designation_pdf) warnings.push('designation-missing');
    if (items.some((item) => Boolean(item?.multilineCandidate))) warnings.push('multiline-candidate');

    let confidence = 0.2;
    if (values.pn_pdf) confidence += 0.35;
    if (values.pos_pdf) confidence += 0.25;
    if (values.designation_pdf) confidence += 0.1;
    if (values.qty_pdf || values.units_pdf || values.weight_pdf) confidence += 0.1;
    confidence += Math.min(0.2, columnsSeen.size * 0.02);
    confidence = Number(Math.max(0, Math.min(1, confidence)).toFixed(2));

    if (confidence < 0.55) warnings.push('low-confidence');

    return {
        source_page: sourcePage,
        row_index: rowIndex,
        pos_pdf: values.pos_pdf || '',
        pn_pdf: values.pn_pdf || '',
        designation_pdf: values.designation_pdf || '',
        model_type_pdf: values.model_type_pdf || '',
        qty_pdf: values.qty_pdf || '',
        units_pdf: values.units_pdf || '',
        weight_pdf: values.weight_pdf || '',
        fn_pdf: values.fn_pdf || '',
        measure_pdf: values.measure_pdf || '',
        norma_pdf: values.norma_pdf || '',
        bom_pdf: bomPdf,
        fg_fgs_pdf: fgFgsPdf,
        confidence,
        warnings: Array.from(new Set(warnings))
    };
}

function countWarnings(rows = []) {
    return rows.reduce((total, row) => total + (Array.isArray(row?.warnings) ? row.warnings.length : 0), 0);
}

function isRowMissingPosPnWithDesignation(row = {}) {
    return !normalizeString(row?.pos_pdf)
        && !normalizeString(row?.pn_pdf)
        && Boolean(normalizeString(row?.designation_pdf));
}

function rowHasStructuredDataForMultilineMerge(row = {}) {
    const structuredKeys = [
        'qty_pdf',
        'units_pdf',
        'weight_pdf',
        'fn_pdf',
        'measure_pdf',
        'norma_pdf',
        'model_type_pdf'
    ];

    return structuredKeys.some((key) => Boolean(normalizeString(row?.[key])));
}

function isValidPreviousRowForMultilineMerge(row = {}) {
    return Boolean(normalizeString(row?.pos_pdf) || normalizeString(row?.pn_pdf));
}

function getCarryableWarningsFromMergedRow(row = {}) {
    const localOnlyWarnings = new Set([
        'pn-missing',
        'pos-missing',
        'designation-missing',
        'low-confidence'
    ]);

    const warnings = Array.isArray(row?.warnings) ? row.warnings : [];
    return warnings.filter((warning) => !localOnlyWarnings.has(String(warning || '').trim()));
}

function mergeMultilineDesignationRows(rows = [], sourcePage = 0) {
    const normalizedRows = [];

    rows.forEach((currentRow) => {
        const previousRow = normalizedRows[normalizedRows.length - 1] || null;
        const canMergeCurrentRow = isRowMissingPosPnWithDesignation(currentRow)
            && !rowHasStructuredDataForMultilineMerge(currentRow)
            && isValidPreviousRowForMultilineMerge(previousRow);

        if (!canMergeCurrentRow) {
            normalizedRows.push(currentRow);
            return;
        }

        const previousDesignation = normalizeString(previousRow?.designation_pdf);
        const currentDesignation = normalizeString(currentRow?.designation_pdf);
        previousRow.designation_pdf = normalizeString(`${previousDesignation} ${currentDesignation}`);

        const mergedWarnings = [
            ...(Array.isArray(previousRow?.warnings) ? previousRow.warnings : []),
            ...getCarryableWarningsFromMergedRow(currentRow),
            'merged-multiline-designation'
        ];
        previousRow.warnings = Array.from(new Set(mergedWarnings));

        console.info(`[PDF multiline merge] page=${sourcePage || 0} row=${Number(currentRow?.row_index || 0)} into previous row`);
    });

    return normalizedRows;
}

function getSelectedEngineModel() {
    const select = $('engineSelect');
    return select instanceof HTMLSelectElement ? String(select.value || '').trim() : '';
}

function getSelectedPageNumber() {
    const input = $('pdfPageInput');
    const parsed = Number.parseInt(String(input?.value || '').replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function setActionStatus(message, kind = '') {
    const el = $('actionStatus');
    if (!(el instanceof HTMLElement)) return;
    el.classList.remove('is-error', 'is-ok', 'is-busy');
    if (kind === 'error') el.classList.add('is-error');
    else if (kind === 'ok') el.classList.add('is-ok');
    else if (kind === 'busy') el.classList.add('is-busy');
    el.textContent = String(message || '');
}

function updateSummary(payload = null) {
    const pageEl = $('summaryPage');
    const rowsEl = $('summaryRowsDetected');
    const pnEl = $('summaryRowsWithPn');
    const warningsEl = $('summaryWarnings');
    const statusEl = $('summaryStatus');
    const downloadBtn = $('downloadJsonBtn');
    const downloadCsvBtn = $('downloadCsvBtn');

    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const sourcePage = Number(payload?.source_page || getSelectedPageNumber() || 0);
    const rowsWithPn = rows.filter((row) => normalizeString(row?.pn_pdf)).length;
    const warningsCount = countWarnings(rows);

    if (pageEl) pageEl.textContent = sourcePage > 0 ? String(sourcePage) : '-';
    if (rowsEl) rowsEl.textContent = String(rows.length);
    if (pnEl) pnEl.textContent = String(rowsWithPn);
    if (warningsEl) warningsEl.textContent = String(warningsCount);
    if (statusEl) {
        statusEl.textContent = payload?.rows
            ? `Página ${sourcePage}: ${rows.length} filas extraídas.`
            : 'Lista para cargar un PDF.';
    }
    if (downloadBtn instanceof HTMLButtonElement) {
        downloadBtn.disabled = !rows.length;
    }
    if (downloadCsvBtn instanceof HTMLButtonElement) {
        downloadCsvBtn.disabled = !rows.length;
    }
}

function renderPreviewTable(rows = []) {
    const body = $('previewBody');
    if (!(body instanceof HTMLTableSectionElement)) return;

    body.innerHTML = '';

    if (!rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = PREVIEW_COLUMNS.length;
        td.className = 'ip-preview-empty';
        td.textContent = 'No hay filas extraídas todavía.';
        tr.appendChild(td);
        body.appendChild(tr);
        return;
    }

    rows.forEach((row) => {
        const tr = document.createElement('tr');
        PREVIEW_COLUMNS.forEach((key) => {
            const td = document.createElement('td');
            const value = key === 'warnings'
                ? (Array.isArray(row?.warnings) ? row.warnings.join('|') : '')
                : row?.[key];
            td.textContent = value == null ? '' : String(value);
            tr.appendChild(td);
        });
        body.appendChild(tr);
    });
}

function downloadJsonPreview(data, filename) {
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function toCsvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function buildCsvExportRows(rows = []) {
    return rows.map((row) => ({
        row_index: row?.row_index ?? '',
        pos_pdf: row?.pos_pdf ?? '',
        pn_pdf: row?.pn_pdf ?? '',
        designation_pdf: row?.designation_pdf ?? '',
        model_type_pdf: row?.model_type_pdf ?? '',
        qty_pdf: row?.qty_pdf ?? '',
        units_pdf: row?.units_pdf ?? '',
        weight_pdf: row?.weight_pdf ?? '',
        fn_pdf: row?.fn_pdf ?? '',
        measure_pdf: row?.measure_pdf ?? '',
        norma_pdf: row?.norma_pdf ?? '',
        bom_pdf: row?.bom_pdf ?? '',
        fg_fgs_pdf: row?.fg_fgs_pdf ?? '',
        confidence: row?.confidence ?? '',
        warnings: Array.isArray(row?.warnings) ? row.warnings.join('|') : ''
    }));
}

function downloadCsvPreview(payload, filename) {
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const exportRows = buildCsvExportRows(rows);
    const firstRow = exportRows[0] || null;

    console.log('[import-pdf][csv] filas exportadas:', exportRows.length);
    console.log('[import-pdf][csv] columnas CSV:', PREVIEW_COLUMNS);
    console.log('[import-pdf][csv] primera fila exportada:', firstRow);
    console.log('[import-pdf][csv] bom_pdf y fg_fgs_pdf primera fila:', {
        bom_pdf: firstRow?.bom_pdf ?? '',
        fg_fgs_pdf: firstRow?.fg_fgs_pdf ?? ''
    });

    const lines = [
        PREVIEW_COLUMNS.join(';'),
        ...exportRows.map((row) => PREVIEW_COLUMNS.map((column) => toCsvCell(row?.[column] ?? '')).join(';'))
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function populateEngineSelect() {
    const select = $('engineSelect');
    if (!(select instanceof HTMLSelectElement)) return;

    const files = getEngineJsonFiles();
    const models = files.map((fileName) => inferEngineModelFromFileName(fileName)).filter(Boolean);
    select.innerHTML = '';

    models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        select.appendChild(option);
    });

    if (!select.value && models.length) {
        select.value = models[0];
    }
}

async function goToSelectedPage() {
    const book = getSelectedEngineModel();
    const page = getSelectedPageNumber();

    if (!book) {
        setActionStatus('Selecciona un libro antes de abrir una página.', 'error');
        return false;
    }

    if (!page) {
        setActionStatus('Indica una página válida.', 'error');
        return false;
    }

    setActionStatus(`Cargando ${book} página ${page}...`, 'busy');
    clearPdfAllOverlays();
    clearPdfHeaderOnlyOverlay();
    clearPdfHeaderColumnBodyHighlights();
    setPdfSelection(null);

    try {
        await loadPdfWithPage(book, page);
        setActionStatus(`PDF cargado: ${book} página ${page}.`, 'ok');
        updateSummary(null);
        return true;
    } catch (error) {
        setActionStatus(`Error cargando PDF: ${String(error?.message || error)}`, 'error');
        return false;
    }
}

async function runHeadersOnly() {
    setActionStatus('Ejecutando CABECERAS...', 'busy');
    try {
        const result = runPdfHeaderOnlyDetection();
        setActionStatus(result?.message || 'CABECERAS ejecutado.', 'ok');
        return result;
    } catch (error) {
        setActionStatus(`Error en CABECERAS: ${String(error?.message || error)}`, 'error');
        throw error;
    }
}

async function runTableDetection() {
    setActionStatus('Ejecutando TABLA...', 'busy');
    try {
        const result = buildHeaderColumnBodyHighlights();
        requestPdfRelayout();
        const rectDebugCount = Array.isArray(result?.rectDebug) ? result.rectDebug.length : 0;
        setActionStatus(`TABLA ejecutado${rectDebugCount ? ` (${rectDebugCount} rectángulos)` : ''}.`, 'ok');
        return result;
    } catch (error) {
        setActionStatus(`Error en TABLA: ${String(error?.message || error)}`, 'error');
        throw error;
    }
}

async function extractAllPdfRowsFromCurrentPage(options = {}) {
    const silent = options?.silent === true;

    let headerColumnBodyDebug = getPdfHeaderColumnBodyDebug();
    const hasRectDebug = Array.isArray(headerColumnBodyDebug?.rectDebug) && headerColumnBodyDebug.rectDebug.length > 0;

    if (!hasRectDebug) {
        headerColumnBodyDebug = buildHeaderColumnBodyHighlights();
        requestPdfRelayout();
    }

    const rectDebug = Array.isArray(headerColumnBodyDebug?.rectDebug) ? headerColumnBodyDebug.rectDebug : [];
    if (!rectDebug.length) {
        if (!silent) setActionStatus('No hay filas detectadas en la pagina actual. Ejecuta CABECERAS + TABLA.', 'error');
        return { ok: false, reason: 'missing-rect-debug', rows: [] };
    }

    const rowGroups = groupMarkedPdfRectsByRow(rectDebug);
    if (!rowGroups.length) {
        if (!silent) setActionStatus('No se pudieron agrupar filas en la pagina actual.', 'error');
        return { ok: false, reason: 'missing-row-groups', rows: [] };
    }

    let fgFgsPdf = '';
    let bomPdf = '';
    let topDetection = null;
    try {
        topDetection = detectTopBomAndFgFromCurrentPage();
        fgFgsPdf = normalizeString(topDetection?.fgFgsPdf);
        bomPdf = normalizeString(topDetection?.bomPdf);
    } catch (error) {
        console.warn('No se pudo detectar BOM/FG durante extractAllPdfRowsFromCurrentPage (import-pdf):', error);
    }

    const sourcePage = Number(getSelectedPageNumber() || 0);
    const rawRows = rowGroups.map((group, index) => buildPdfPageRowPreviewFromGroup(group, {
        sourcePage,
        rowIndex: index + 1,
        bomPdf,
        fgFgsPdf
    }));
    const rows = mergeMultilineDesignationRows(rawRows, sourcePage);

    const headerDebug = getPdfHeaderColumnBodyDebug();
    const detectedHeaders = Array.isArray(headerDebug?.entries)
        ? headerDebug.entries.filter((entry) => entry?.found).map((entry) => entry.key)
        : [];
    const detectedColumns = headerDebug?.columnStats ? Object.keys(headerDebug.columnStats) : [];
    const firstRow = rows[0] || null;

    console.info('[import-pdf][diagnostico] EXTRAER PAGINA', {
        source_page: sourcePage,
        headers_detectados: detectedHeaders,
        columnas_detectadas: detectedColumns,
        primera_fila_parseada: firstRow,
        bom_fg_detectados: { bom_pdf: bomPdf, fg_fgs_pdf: fgFgsPdf },
        top_detection_entries: topDetection?.entries || []
    });

    const preview = {
        source_page: sourcePage,
        rows_detected: rows.length,
        rows
    };

    window.__miluPdfPageRowsPreview = preview;
    console.info('[import-pdf] extractAllPdfRowsFromCurrentPage ->', preview);
    console.table(rows.map((row) => ({
        row_index: row.row_index,
        pos_pdf: row.pos_pdf,
        pn_pdf: row.pn_pdf,
        designation_pdf: row.designation_pdf,
        confidence: row.confidence,
        warnings: Array.isArray(row.warnings) ? row.warnings.join('|') : ''
    })));

    if (!silent) {
        setActionStatus(`Preview PDF pagina ${sourcePage}: ${rows.length} filas detectadas.`, 'ok');
    }

    return {
        ok: true,
        reason: 'preview-ready',
        ...preview
    };
}

async function runExtractPdfPageRowsPreview() {
    const result = await extractAllPdfRowsFromCurrentPage({ silent: true });
    if (!result?.ok) {
        setActionStatus('Primero ejecuta CABECERAS + TABLA o carga la vista PDF.', 'error');
        return { ok: false, reason: result?.reason || 'preview-not-ready' };
    }

    const rows = Array.isArray(result.rows) ? result.rows : [];
    const rowsWithPn = rows.filter((row) => normalizeString(row?.pn_pdf)).length;
    const warningsCount = countWarnings(rows);
    const sourcePage = Number(result.source_page || getSelectedPageNumber() || 0);

    const previewPayload = {
        source_page: sourcePage,
        generated_at: new Date().toISOString(),
        rows_count: rows.length,
        rows_with_pn: rowsWithPn,
        warnings_count: warningsCount,
        rows
    };

    window.__miluPdfPageRowsPreview = previewPayload;
    currentPreviewPayload = previewPayload;

    renderPreviewTable(rows);
    updateSummary(previewPayload);

    console.info('[import-pdf] EXTRAER PÁGINA resumen ->', {
        source_page: sourcePage,
        rows_count: rows.length,
        rows_with_pn: rowsWithPn,
        warnings_count: warningsCount
    });

    downloadJsonPreview(previewPayload, `pdf_page_rows_preview_p${sourcePage || 0}.json`);
    setActionStatus(`Preview pagina ${sourcePage}: filas=${rows.length}, con PN=${rowsWithPn}, warnings=${warningsCount}. JSON descargado.`, 'ok');

    return { ok: true, payload: previewPayload };
}

let bookExtractRunning = false;
let bookExtractCancelled = false;

function setBookProgressVisible(visible) {
    const el = $('bookProgress');
    if (el) el.style.display = visible ? 'flex' : 'none';
}

function updateBookProgress({ page, processed, total, withRows, rows, warnings }) {
    const set = (id, value) => {
        const el = $(id);
        if (el) el.textContent = String(value);
    };
    if (page !== undefined) set('bookProgressPage', page);
    if (processed !== undefined) set('bookProgressProcessed', processed);
    if (total !== undefined) set('bookProgressTotal', total);
    if (withRows !== undefined) set('bookProgressWithRows', withRows);
    if (rows !== undefined) set('bookProgressRows', rows);
    if (warnings !== undefined) set('bookProgressWarnings', warnings);
    if (processed !== undefined && total) {
        const bar = $('bookProgressBar');
        if (bar) {
            const pct = Math.max(0, Math.min(100, Math.round((processed / total) * 100)));
            bar.style.right = `${100 - pct}%`;
        }
    }
}

function setBookButtonsBusy(busy) {
    const extractBtn = $('extractBookBtn');
    const extractAllBtn = $('extractAllBooksBtn');
    const cancelBtn = $('cancelBookBtn');
    if (extractBtn instanceof HTMLButtonElement) extractBtn.disabled = busy;
    if (extractAllBtn instanceof HTMLButtonElement) extractAllBtn.disabled = busy;
    if (cancelBtn instanceof HTMLButtonElement) cancelBtn.disabled = !busy;
}

async function extractWholeBook(bookOverride = null) {
    if (bookExtractRunning) {
        setActionStatus('Ya hay una extracción de libro en curso.', 'busy');
        return null;
    }

    const book = bookOverride || getSelectedEngineModel();
    if (!book) {
        setActionStatus('Selecciona un libro antes de extraer.', 'error');
        return null;
    }

    bookExtractRunning = true;
    bookExtractCancelled = false;
    setBookButtonsBusy(true);
    setBookProgressVisible(true);
    updateBookProgress({ page: '-', processed: 0, total: 0, withRows: 0, rows: 0, warnings: 0 });
    const bookLabel = $('bookProgressBook');
    if (bookLabel) bookLabel.textContent = book;
    setActionStatus(`Cargando ${book} para conocer total de páginas...`, 'busy');

    try {
        // Cargar página 1 para forzar carga del documento PDF
        await loadPdfWithPage(book, 1);
        const totalPages = getCurrentPdfPageCount();
        if (!totalPages) {
            setActionStatus('No se pudo determinar el número de páginas del PDF.', 'error');
            return;
        }

        const fromInput = $('bookPageFromInput');
        const toInput = $('bookPageToInput');
        const skipEmptyChk = $('bookSkipEmptyChk');

        let pageFrom = 1;
        let pageTo = totalPages;
        if (fromInput instanceof HTMLInputElement && fromInput.value) {
            const n = Number(fromInput.value);
            if (Number.isFinite(n) && n >= 1) pageFrom = Math.min(totalPages, Math.floor(n));
        }
        if (toInput instanceof HTMLInputElement && toInput.value) {
            const n = Number(toInput.value);
            if (Number.isFinite(n) && n >= 1) pageTo = Math.min(totalPages, Math.floor(n));
        }
        if (pageTo < pageFrom) pageTo = pageFrom;
        const skipEmpty = !(skipEmptyChk instanceof HTMLInputElement) || skipEmptyChk.checked;

        const totalToProcess = pageTo - pageFrom + 1;
        updateBookProgress({ processed: 0, total: totalToProcess });

        const pagesOut = [];
        let rowsTotal = 0;
        let warningsTotal = 0;
        let pagesWithRows = 0;
        let processed = 0;

        for (let p = pageFrom; p <= pageTo; p++) {
            if (bookExtractCancelled) {
                setActionStatus(`Cancelado en página ${p}. Procesadas ${processed}/${totalToProcess}.`, 'busy');
                break;
            }

            updateBookProgress({ page: p });
            setActionStatus(`Procesando página ${p}/${pageTo}...`, 'busy');

            try {
                clearPdfAllOverlays();
                clearPdfHeaderOnlyOverlay();
                clearPdfHeaderColumnBodyHighlights();
                setPdfSelection(null);

                await loadPdfWithPage(book, p);
                // Sincronizar el input visual (para que getSelectedPageNumber dentro de la extracción use p)
                const pageInput = $('pdfPageInput');
                if (pageInput instanceof HTMLInputElement) pageInput.value = String(p);

                runPdfHeaderOnlyDetection();
                buildHeaderColumnBodyHighlights();
                requestPdfRelayout();

                const result = await extractAllPdfRowsFromCurrentPage({ silent: true });
                const rows = Array.isArray(result?.rows) ? result.rows : [];
                const rowsWithPn = rows.filter((row) => normalizeString(row?.pn_pdf)).length;
                const warningsCount = countWarnings(rows);

                if (rows.length > 0 || !skipEmpty) {
                    pagesOut.push({
                        source_page: p,
                        rows_count: rows.length,
                        rows_with_pn: rowsWithPn,
                        warnings_count: warningsCount,
                        rows
                    });
                    if (rows.length > 0) pagesWithRows++;
                    rowsTotal += rows.length;
                    warningsTotal += warningsCount;
                }
            } catch (pageError) {
                console.warn(`[import-pdf] Error en página ${p}:`, pageError);
                pagesOut.push({
                    source_page: p,
                    rows_count: 0,
                    rows_with_pn: 0,
                    warnings_count: 0,
                    error: String(pageError?.message || pageError),
                    rows: []
                });
            }

            processed++;
            updateBookProgress({
                processed,
                total: totalToProcess,
                withRows: pagesWithRows,
                rows: rowsTotal,
                warnings: warningsTotal
            });

            // Ceder al event loop para no bloquear UI
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const payload = {
            book,
            generated_at: new Date().toISOString(),
            pages_total: totalPages,
            range_from: pageFrom,
            range_to: pageTo,
            pages_processed: processed,
            pages_with_rows: pagesWithRows,
            rows_total: rowsTotal,
            warnings_total: warningsTotal,
            cancelled: bookExtractCancelled,
            pages: pagesOut
        };

        window.__miluPdfBookPreview = payload;
        console.info('[import-pdf] EXTRAER LIBRO resumen ->', {
            book,
            pages_processed: processed,
            pages_with_rows: pagesWithRows,
            rows_total: rowsTotal,
            warnings_total: warningsTotal,
            cancelled: bookExtractCancelled
        });

        downloadJsonPreview(payload, `book_preview_${book}.json`);

        const suffix = bookExtractCancelled ? ' (cancelado)' : '';
        setActionStatus(
            `Libro ${book}${suffix}: ${processed} páginas procesadas, ${pagesWithRows} con filas, ${rowsTotal} filas totales, ${warningsTotal} warnings. JSON descargado.`,
            bookExtractCancelled ? 'busy' : 'ok'
        );
        return { payload, cancelled: bookExtractCancelled };
    } catch (error) {
        setActionStatus(`Error en EXTRAER LIBRO: ${String(error?.message || error)}`, 'error');
        return { payload: null, cancelled: bookExtractCancelled, error };
    } finally {
        bookExtractRunning = false;
        bookExtractCancelled = false;
        setBookButtonsBusy(false);
    }
}

function getAllEngineModels() {
    const select = $('engineSelect');
    if (!(select instanceof HTMLSelectElement)) return [];
    return Array.from(select.options)
        .map((opt) => String(opt.value || '').trim())
        .filter(Boolean);
}

let bookSweepRunning = false;
let bookSweepCancelled = false;

async function extractAllBooks() {
    if (bookSweepRunning || bookExtractRunning) {
        setActionStatus('Ya hay una extracción en curso.', 'busy');
        return;
    }
    const models = getAllEngineModels();
    if (!models.length) {
        setActionStatus('No hay libros en el selector.', 'error');
        return;
    }

    bookSweepRunning = true;
    bookSweepCancelled = false;
    const select = $('engineSelect');
    const indexLabel = $('bookProgressBookIndex');
    const totalBooks = models.length;
    const summaries = [];

    try {
        for (let i = 0; i < models.length; i++) {
            if (bookSweepCancelled) {
                setActionStatus(`Barrido cancelado tras ${i}/${totalBooks} libros.`, 'busy');
                break;
            }
            const book = models[i];
            if (select instanceof HTMLSelectElement) select.value = book;
            if (indexLabel) indexLabel.textContent = `(${i + 1}/${totalBooks})`;

            const result = await extractWholeBook(book);
            summaries.push({
                book,
                ok: !!result?.payload,
                cancelled: !!result?.cancelled,
                rows_total: result?.payload?.rows_total ?? 0,
                pages_processed: result?.payload?.pages_processed ?? 0
            });

            if (result?.cancelled) {
                bookSweepCancelled = true;
                setActionStatus(`Cancelado en libro ${book} (${i + 1}/${totalBooks}).`, 'busy');
                break;
            }
            // Pausa breve para que el navegador respire entre PDFs
            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        console.info('[import-pdf] EXTRAER TODOS resumen ->', summaries);
        const done = summaries.length;
        const totalRows = summaries.reduce((acc, s) => acc + (s.rows_total || 0), 0);
        const suffix = bookSweepCancelled ? ' (cancelado)' : '';
        setActionStatus(
            `Barrido completo${suffix}: ${done}/${totalBooks} libros procesados, ${totalRows} filas totales. Se han descargado ${done} JSON.`,
            bookSweepCancelled ? 'busy' : 'ok'
        );
    } finally {
        bookSweepRunning = false;
        bookSweepCancelled = false;
        if (indexLabel) indexLabel.textContent = '';
        setBookButtonsBusy(false);
    }
}

function bindEvents() {
    const goToPageBtn = $('goToPageBtn');
    const detectHeadersBtn = $('detectHeadersBtn');
    const paintBodyByHeadersBtn = $('paintBodyByHeadersBtn');
    const extractPageRowsBtn = $('extractPageRowsBtn');
    const downloadJsonBtn = $('downloadJsonBtn');
    const downloadCsvBtn = $('downloadCsvBtn');
    const select = $('engineSelect');
    const pageInput = $('pdfPageInput');

    if (select instanceof HTMLSelectElement) {
        select.addEventListener('change', () => {
            setActionStatus(`Libro seleccionado: ${select.value}.`, 'ok');
        });
    }

    if (pageInput instanceof HTMLInputElement) {
        pageInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                goToSelectedPage().catch((error) => setActionStatus(String(error?.message || error), 'error'));
            }
        });
    }

    if (goToPageBtn instanceof HTMLButtonElement) {
        goToPageBtn.addEventListener('click', () => {
            goToSelectedPage().catch((error) => setActionStatus(String(error?.message || error), 'error'));
        });
    }

    if (detectHeadersBtn instanceof HTMLButtonElement) {
        detectHeadersBtn.addEventListener('click', () => {
            runHeadersOnly().catch(() => { });
        });
    }

    if (paintBodyByHeadersBtn instanceof HTMLButtonElement) {
        paintBodyByHeadersBtn.addEventListener('click', () => {
            runTableDetection().catch(() => { });
        });
    }

    if (extractPageRowsBtn instanceof HTMLButtonElement) {
        extractPageRowsBtn.addEventListener('click', () => {
            runExtractPdfPageRowsPreview().catch((error) => {
                setActionStatus(`No se pudo extraer la pagina: ${String(error?.message || error)}`, 'error');
            });
        });
    }

    if (downloadJsonBtn instanceof HTMLButtonElement) {
        downloadJsonBtn.addEventListener('click', () => {
            const payload = currentPreviewPayload || window.__miluPdfPageRowsPreview;
            if (!payload?.rows?.length) {
                setActionStatus('No hay un JSON de preview para descargar.', 'error');
                return;
            }
            downloadJsonPreview(payload, `pdf_page_rows_preview_p${Number(payload?.source_page || 0)}.json`);
            setActionStatus('JSON descargado desde el preview actual.', 'ok');
        });
    }

    if (downloadCsvBtn instanceof HTMLButtonElement) {
        downloadCsvBtn.addEventListener('click', () => {
            const payload = currentPreviewPayload || window.__miluPdfPageRowsPreview;
            if (!payload?.rows?.length) {
                setActionStatus('No hay un CSV de preview para descargar.', 'error');
                return;
            }
            downloadCsvPreview(payload, `pdf_page_rows_preview_p${Number(payload?.source_page || 0)}.csv`);
            setActionStatus('CSV descargado desde el preview actual.', 'ok');
        });
    }

    const extractBookBtn = $('extractBookBtn');
    if (extractBookBtn instanceof HTMLButtonElement) {
        extractBookBtn.addEventListener('click', () => {
            extractWholeBook().catch((error) => {
                setActionStatus(`No se pudo extraer el libro: ${String(error?.message || error)}`, 'error');
            });
        });
    }

    const extractAllBooksBtn = $('extractAllBooksBtn');
    if (extractAllBooksBtn instanceof HTMLButtonElement) {
        extractAllBooksBtn.addEventListener('click', () => {
            extractAllBooks().catch((error) => {
                setActionStatus(`No se pudo extraer todos los libros: ${String(error?.message || error)}`, 'error');
            });
        });
    }

    const cancelBookBtn = $('cancelBookBtn');
    if (cancelBookBtn instanceof HTMLButtonElement) {
        cancelBookBtn.addEventListener('click', () => {
            if (bookExtractRunning || bookSweepRunning) {
                bookExtractCancelled = true;
                bookSweepCancelled = true;
                setActionStatus('Cancelando extracción...', 'busy');
            }
        });
    }
}

function init() {
    populateEngineSelect();
    initPdfZoomControls();
    bindEvents();
    updateSummary(null);
    loadPdfClear();
    window.extractAllPdfRowsFromCurrentPage = extractAllPdfRowsFromCurrentPage;
    window.__miluPdfPageRowsPreview = null;
}

document.addEventListener('DOMContentLoaded', init);