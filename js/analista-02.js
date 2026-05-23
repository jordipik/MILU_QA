import { state } from './state.js';

import { getEngineJsonFiles, loadEngineDataByFileName, saveCellToServer } from './data-loader.js';

import {

    assignRevisionKeys,

    applyRevisionDataToRows,

    normalizeEstadoToNew,

    normalizeAccionToNew,

    denormalizeEstadoFromNew,

    denormalizeAccionFromNew

} from './revision.js';

import { publishRevisionSync } from './revision-sync.js';

import { getPdfExperimentalBlueTexts, getPdfHeaderColumnBodyDebug, getPdfLastPageData, initPdfZoomControls, loadPdfClear, loadPdfWithPage, requestPdfRelayout, setPdfExperimentalRowHighlights, setPdfReadTokens, setPdfSelection, runPdfHeaderOnlyDetection, clearPdfHeaderOnlyOverlay, buildHeaderColumnBodyHighlights, clearPdfHeaderColumnBodyHighlights, clearPdfAllOverlays, clearPdfOverlaysExceptHeaders } from './pdf-viewer.js';

import { evaluateQaChecksForField, evaluateRowQaChecks, getAllQaCheckCodes, getQaCheckLabel } from './qa-checks.js';

import { confirmTypedAction } from './confirm-typed-action.js';
import { runInMemoryRecalculation } from './error-recalc.js';

import { showToast } from './toast.js';

const $ = (id) => document.getElementById(id);

function ensureLegacyToolbarControls() {
    const ids = ['engineFilterSelect', 'recordIdInput', 'recordSearchList', 'loadRecordBtn', 'recordMeta'];
    const hasAll = ids.every((id) => Boolean($(id)));
    if (hasAll) return;

    let host = $('a2LegacyToolbarGhost');
    if (!(host instanceof HTMLElement)) {
        host = document.createElement('div');
        host.id = 'a2LegacyToolbarGhost';
        host.setAttribute('aria-hidden', 'true');
        host.style.display = 'none';
        document.body.appendChild(host);
    }

    if (!$('engineFilterSelect')) {
        const engineFilterSelect = document.createElement('select');
        engineFilterSelect.id = 'engineFilterSelect';
        engineFilterSelect.setAttribute('aria-label', 'Filtro de libro');
        host.appendChild(engineFilterSelect);
    }

    if (!$('recordIdInput')) {
        const recordIdInput = document.createElement('input');
        recordIdInput.id = 'recordIdInput';
        recordIdInput.type = 'search';
        recordIdInput.setAttribute('list', 'recordSearchList');
        recordIdInput.setAttribute('autocomplete', 'off');
        recordIdInput.placeholder = 'PART NO.';
        host.appendChild(recordIdInput);
    }

    if (!$('recordSearchList')) {
        const recordSearchList = document.createElement('datalist');
        recordSearchList.id = 'recordSearchList';
        host.appendChild(recordSearchList);
    }

    if (!$('loadRecordBtn')) {
        const loadRecordBtn = document.createElement('button');
        loadRecordBtn.id = 'loadRecordBtn';
        loadRecordBtn.type = 'button';
        loadRecordBtn.setAttribute('aria-label', 'Buscar');
        loadRecordBtn.title = 'Buscar';
        host.appendChild(loadRecordBtn);
    }

    if (!$('recordMeta')) {
        const recordMeta = document.createElement('div');
        recordMeta.id = 'recordMeta';
        recordMeta.className = 'a2-meta';
        recordMeta.textContent = 'Sin registro cargado.';
        host.appendChild(recordMeta);
    }
}

ensureLegacyToolbarControls();



function legacyAlertType(message) {

    const text = String(message || '').toLowerCase();

    if (text.startsWith('no se pudo') || text.includes('error') || text.includes('propagación parcial')) return 'error';

    if (text.includes('propagados ') || text.includes('proceso bulk completado')) return 'success';

    if (text.includes('primero debes') || text.includes('ya estas') || text.includes('no hay ')) return 'warning';

    return 'info';

}



function alert(message) {

    showToast(String(message || ''), legacyAlertType(message));

}

function simpleConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(8, 14, 24, 0.55);
            z-index: 13000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
        `;

        const panel = document.createElement('div');
        panel.style.cssText = `
            width: min(480px, 96vw);
            background: #ffffff;
            border-radius: 14px;
            border: 1px solid #d9e1ea;
            box-shadow: 0 24px 64px rgba(10, 25, 40, 0.28);
            font-family: Manrope, sans-serif;
            color: #0f172a;
            overflow: hidden;
        `;

        const content = document.createElement('div');
        content.style.cssText = `padding: 20px 16px; font-size: 14px; line-height: 1.5; color: #334155;`;
        content.textContent = message;

        const footer = document.createElement('div');
        footer.style.cssText = `
            border-top: 1px solid #e6edf5;
            padding: 12px 16px 14px;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            background: #f8fafc;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancelar';
        cancelBtn.style.cssText = `
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #0f172a;
            padding: 8px 12px;
            min-width: 110px;
            border-radius: 10px;
            cursor: pointer;
            font: inherit;
            font-weight: 600;
        `;
        cancelBtn.onclick = () => {
            document.body.removeChild(modal);
            resolve(false);
        };

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'Confirmar';
        confirmBtn.style.cssText = `
            border: 1px solid #dc2626;
            background: linear-gradient(135deg, #dc2626, #b91c1c);
            color: #ffffff;
            padding: 8px 12px;
            min-width: 110px;
            border-radius: 10px;
            cursor: pointer;
            font: inherit;
            font-weight: 700;
        `;
        confirmBtn.onclick = () => {
            document.body.removeChild(modal);
            resolve(true);
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);
        panel.appendChild(content);
        panel.appendChild(footer);
        modal.appendChild(panel);
        document.body.appendChild(modal);

        confirmBtn.focus();
    });
}



const FIELD_TO_ERROR_KEY = {

    'POS': 'pos_error',

    'PART NO.': 'pn_error',

    'DESIGNATION': 'designation_error',

    'MODEL/TYPE': 'model_type_error',

    'QTY': 'qty_error',

    'UNITS': 'units_error',

    'WEIGHT': 'weight_error',

    'FN': 'fn_error',

    'MEASUREMENT / STANDARD': 'measure_error',

    'FG/FGS': 'fg_fgs_error',

    'BOM-No.': 'bom_error',

    'GESA': 'gesa_error',

    'NSN': 'nsn_error',

    'NORMALIZADO': 'normalizado_error',

    'NORMA': 'norma_error'

};

const ERROR_FIELD_KEYS = [...new Set(Object.values(FIELD_TO_ERROR_KEY).filter(Boolean))];

function snapshotRowErrorFields(row) {
    const snapshot = {};
    ERROR_FIELD_KEYS.forEach((key) => {
        snapshot[key] = Number(row?.[key]) || 0;
    });
    return snapshot;
}

function getChangedErrorKeys(beforeSnapshot, rowAfter) {
    return ERROR_FIELD_KEYS.filter((key) => {
        const before = Number(beforeSnapshot?.[key]) || 0;
        const after = Number(rowAfter?.[key]) || 0;
        return before !== after;
    });
}

function flashChangedErrorCells(changedErrorKeys = []) {
    const body = $('comparisonBody');
    if (!(body instanceof HTMLElement) || !Array.isArray(changedErrorKeys) || !changedErrorKeys.length) return;

    changedErrorKeys.forEach((errorKey) => {
        const cell = body.querySelector(`td.field-err[data-field-key="${errorKey}"]`);
        if (!(cell instanceof HTMLElement)) return;
        cell.classList.remove('a2-error-cell-flash');
        // Reinicia la animacion si se dispara varias veces seguidas
        void cell.offsetWidth;
        cell.classList.add('a2-error-cell-flash');
        setTimeout(() => cell.classList.remove('a2-error-cell-flash'), 1600);
    });
}



const FIELD_TO_PDF_AUTO_KEY = {

    'POS': 'pos_pdf',

    'PART NO.': 'pn_pdf',

    'DESIGNATION': 'designation_pdf',

    'MODEL/TYPE': 'model_type_pdf',

    'QTY': 'qty_pdf',

    'UNITS': 'units_pdf',

    'WEIGHT': 'weight_pdf',

    'FN': 'fn_pdf',

    'MEASUREMENT / STANDARD': 'measure_pdf',

    'FG/FGS': 'fg_fgs_pdf',

    'GESA': 'gesa_pdf',

    'NSN': 'nsn_pdf',

    'NORMALIZADO': 'normalizado_pdf',

    'NORMA': 'norma_pdf',

    'SUST_STATUS': 'sust_status_pdf',

    'HIERARCHI': 'hierarchi_pdf',

    'SUST_NEW_PART_NUMBER': 'sust_new_part_number_pdf',

    'SUST_SUPERSEDED_LIST': 'sust_superseded_list_pdf',

    'BOM-No.': 'bom_pdf'

};



const QA_LABELS = Object.fromEntries(getAllQaCheckCodes().map((code) => [code, getQaCheckLabel(code)]));



function getFieldChecks(row, entry, context = {}) {

    return evaluateQaChecksForField(row, entry?.field, context);

}



function getStoredFieldErrorCount(row, fieldName) {

    const errorKey = FIELD_TO_ERROR_KEY[String(fieldName ?? '').trim()];

    if (!errorKey) return 0;

    const value = Number(row?.[errorKey]);

    return Number.isFinite(value) ? value : 0;

}



function getStoredErrorSummary(row) {

    return Object.keys(FIELD_TO_ERROR_KEY)

        .map((fieldName) => ({ field: fieldName, count: getStoredFieldErrorCount(row, fieldName) }))

        .filter((entry) => entry.count > 0);

}



function getStoredPdfAutoValue(row, fieldName) {

    const pdfKey = FIELD_TO_PDF_AUTO_KEY[String(fieldName ?? '').trim()];

    if (!pdfKey) return '';

    return String(row?.[pdfKey] ?? '').trim();

}


function normalizePdfLookupValue(value) {

    return String(value ?? '')

        .trim()

        .replace(/\s+/g, ' ')

        .toLowerCase()

        .normalize('NFD')

        .replace(/[\u0300-\u036f]/g, '');

}


function matchesPdfLookupValue(value, candidates = []) {

    const normalizedValue = normalizePdfLookupValue(value);

    if (!normalizedValue) return false;



    const compactValue = normalizedValue.replace(/[^a-z0-9]/g, '');



    return candidates.some((candidate) => {

        const normalizedCandidate = normalizePdfLookupValue(candidate);

        if (!normalizedCandidate) return false;



        if (normalizedValue === normalizedCandidate) return true;



        const compactCandidate = normalizedCandidate.replace(/[^a-z0-9]/g, '');

        return compactValue && compactCandidate && compactValue === compactCandidate;

    });

}


function findParsedPdfRowForCurrentRow(row, parsedRows = []) {

    if (!Array.isArray(parsedRows) || !parsedRows.length) return null;



    const partNoCandidates = [row?.pn_final, row?.pn_pdf, row?.['PART NO.']];
    const posCandidates = [row?.pos_final, row?.pos_pdf, row?.POS];
    const designationCandidates = [row?.designation_final, row?.designation_pdf, row?.DESIGNATION];
    const qtyCandidates = [row?.qty_final, row?.qty_pdf, row?.QTY];
    const weightCandidates = [row?.weight_final, row?.weight_pdf, row?.WEIGHT];



    let bestRow = null;
    let bestScore = 0;



    parsedRows.forEach((parsedRow) => {

        const cells = parsedRow?.cells || {};
        let score = 0;



        if (matchesPdfLookupValue(cells.part_no, partNoCandidates)) score += 6;
        if (matchesPdfLookupValue(cells.pos, posCandidates)) score += 4;
        if (matchesPdfLookupValue(cells.designation, designationCandidates)) score += 2;
        if (matchesPdfLookupValue(cells.qty, qtyCandidates)) score += 1;
        if (matchesPdfLookupValue(cells.weight, weightCandidates)) score += 1;



        if (score > bestScore) {

            bestScore = score;

            bestRow = parsedRow;

        }

    });



    return bestScore >= 4 ? bestRow : null;

}


function looksLikeFnValue(value) {

    const normalized = normalizeString(value).toUpperCase();

    if (!normalized) return false;
    if (normalized.length > 20) return false;
    // FN suele venir como 1-3 codigos cortos (ej: "EM", "MN", "MN EM").
    if (!/[A-Z]/.test(normalized)) return false;
    return /^(?:[A-Z0-9/.-]{1,8})(?:\s+[A-Z0-9/.-]{1,8}){0,2}$/.test(normalized);

}


function stripTrailingQtyFromDesignation(designation, qty) {

    const cleanedDesignation = normalizeString(designation);

    const cleanedQty = normalizeString(qty);



    if (!cleanedDesignation || !cleanedQty) return cleanedDesignation;



    if (cleanedDesignation === cleanedQty) return cleanedDesignation;



    // Solo recorta si el QTY está separado por espacio.
    // Evita recortes falsos como "HSK-M-PVDF9" -> "HSK-M-PVDF".
    if (cleanedDesignation.endsWith(` ${cleanedQty}`)) {

        const candidate = cleanedDesignation.slice(0, -(cleanedQty.length + 1)).trim();

        if (candidate && /[A-Za-z]/.test(candidate)) {

            return candidate;

        }

    }



    return cleanedDesignation;

}


function isQtyNumeric(value) {

    return /^\d+(?:[.,]\d+)?$/.test(normalizeString(value));

}


function isUnitToken(value) {

    return /^(?:PC|PCS|EA|SET|KIT|PAIR|PZA|PZAS)$/i.test(normalizeString(value));

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



    // Caso frecuente de OCR: MODEL/TYPE trae el QTY al final ("HSK-M-PVDF 9").
    const split = splitModelTypeTrailingQty(normalized.model_type_pdf);
    if (split.qty && (!isQtyNumeric(normalized.qty_pdf) || isUnitToken(normalized.qty_pdf))) {

        normalized.model_type_pdf = split.modelType || normalized.model_type_pdf;

        if (!isQtyNumeric(normalized.qty_pdf)) {

            normalized.qty_pdf = split.qty;

        }

    }



    // Caso frecuente de desplazamiento: QTY="pc" y UNITS="15.000 g".
    if (isUnitToken(normalized.qty_pdf) && isWeightLike(normalized.units_pdf)) {

        const qtyToken = normalized.qty_pdf;

        const weightToken = normalized.units_pdf;

        normalized.units_pdf = qtyToken;

        normalized.weight_pdf = normalized.weight_pdf || weightToken;

    }



    return normalized;

}


function buildPdfAutoCopyValuesFromParsedRow(parsedRow) {

    const cells = parsedRow?.cells || {};



    const measurement = normalizeString(cells.measurement);
    const standard = normalizeString(cells.standard);
    const parsedFn = normalizeString(cells.fn);
    const unknownFn = looksLikeFnValue(cells.unknown) ? normalizeString(cells.unknown) : '';
    const qtyValue = normalizeString(cells.qty);
    const designationValue = stripTrailingQtyFromDesignation(cells.designation, qtyValue);



    return normalizePdfReadFieldAlignment({

        pos_pdf: normalizeString(cells.pos),
        pn_pdf: normalizeString(cells.part_no),
        designation_pdf: designationValue,
        model_type_pdf: normalizeString(cells.model_type),
        qty_pdf: qtyValue,
        units_pdf: normalizeString(cells.units),
        weight_pdf: normalizeString(cells.weight),
        fn_pdf: parsedFn || unknownFn,
        measure_pdf: measurement,
        norma_pdf: standard

    });

}


function buildPdfReadSummary(valuesToCopy) {

    const entries = [

        ['POS', 'pos_pdf'],
        ['PART NO.', 'pn_pdf'],
        ['DESIGNATION', 'designation_pdf'],
        ['MODEL/TYPE', 'model_type_pdf'],
        ['QTY', 'qty_pdf'],
        ['UNITS', 'units_pdf'],
        ['WEIGHT', 'weight_pdf'],
        ['FG/FGS', 'fg_fgs_pdf'],
        ['BOM-No.', 'bom_pdf'],
        ['FN', 'fn_pdf'],
        ['MEASUREMENT / STANDARD', 'measure_pdf'],
        ['NORMA', 'norma_pdf']

    ];



    const lines = entries
        .map(([label, key]) => `${label}: ${txt(valuesToCopy?.[key], '-')}`)
        .filter((line) => !line.endsWith(': -'));



    return lines.length
        ? `Campos leídos del PDF:\n${lines.join('\n')}`
        : 'Campos leídos del PDF: no se detectaron valores.';

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


function findMarkedPdfRowForCurrentRow(debug, row = currentRow) {

    const rectDebug = Array.isArray(debug?.rectDebug) ? debug.rectDebug : [];
    const rowGroups = groupMarkedPdfRectsByRow(rectDebug);

    if (!rowGroups.length) return null;



    const posCandidates = [row?.pos_final, row?.pos_pdf, row?.POS];
    const pnCandidates = [row?.pn_final, row?.pn_pdf, row?.['PART NO.']];
    const designationCandidates = [row?.designation_final, row?.designation_pdf, row?.DESIGNATION];
    const qtyCandidates = [row?.qty_final, row?.qty_pdf, row?.QTY];
    const weightCandidates = [row?.weight_final, row?.weight_pdf, row?.WEIGHT];



    let bestGroup = null;
    let bestScore = 0;



    rowGroups.forEach((group) => {

        const values = buildMarkedRowValuesFromGroup(group, row);
        let score = 0;



        if (matchesPdfLookupValue(values.pos_pdf, posCandidates)) score += 4;
        if (matchesPdfLookupValue(values.pn_pdf, pnCandidates)) score += 6;
        if (matchesPdfLookupValue(values.designation_pdf, designationCandidates)) score += 2;
        if (matchesPdfLookupValue(values.qty_pdf, qtyCandidates)) score += 1;
        if (matchesPdfLookupValue(values.weight_pdf, weightCandidates)) score += 1;



        if (score > bestScore) {

            bestScore = score;
            bestGroup = group;

        }

    });



    return bestScore >= 4 ? bestGroup : null;

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
        if (!silent) setPdfActionStatus('No hay filas detectadas en la pagina actual. Ejecuta CABECERAS + TABLA.', 'error');
        return { ok: false, reason: 'missing-rect-debug', rows: [] };
    }

    const rowGroups = groupMarkedPdfRectsByRow(rectDebug);
    if (!rowGroups.length) {
        if (!silent) setPdfActionStatus('No se pudieron agrupar filas en la pagina actual.', 'error');
        return { ok: false, reason: 'missing-row-groups', rows: [] };
    }

    let fgFgsPdf = '';
    let bomPdf = '';
    try {
        const topDetection = await detectTopBomAndFgInPdf(currentRow);
        const topEntries = Array.isArray(topDetection?.entries) ? topDetection.entries : [];
        const fgEntry = topEntries.find((entry) => String(entry?.key || '').trim() === 'fg_fgs');
        const bomEntry = topEntries.find((entry) => String(entry?.key || '').trim() === 'bom');
        fgFgsPdf = normalizeString(fgEntry?.value);
        bomPdf = normalizeString(bomEntry?.value);
    } catch (error) {
        console.warn('No se pudo detectar BOM/FG durante extractAllPdfRowsFromCurrentPage:', error);
    }

    const sourcePage = Number(state.currentPdfPageNumber || resolvePdfPageNumber(currentRow?.['Source Page']) || 0);
    const rows = rowGroups.map((group, index) => buildPdfPageRowPreviewFromGroup(group, {
        sourcePage,
        rowIndex: index + 1,
        bomPdf,
        fgFgsPdf
    }));

    const headerDebug = getPdfHeaderColumnBodyDebug();
    const detectedHeaders = Array.isArray(headerDebug?.entries)
        ? headerDebug.entries.filter((entry) => entry?.found).map((entry) => entry.key)
        : [];
    const detectedColumns = headerDebug?.columnStats ? Object.keys(headerDebug.columnStats) : [];
    const firstRow = rows[0] || null;

    console.info('[pdf-preview][diagnostico] EXTRAER PAGINA', {
        source_page: sourcePage,
        headers_detectados: detectedHeaders,
        columnas_detectadas: detectedColumns,
        primera_fila_parseada: firstRow,
        bom_fg_detectados: { bom_pdf: bomPdf, fg_fgs_pdf: fgFgsPdf }
    });

    const preview = {
        source_page: sourcePage,
        rows_detected: rows.length,
        rows
    };

    window.__miluPdfPageRowsPreview = preview;
    console.info('[pdf-preview] extractAllPdfRowsFromCurrentPage ->', preview);
    console.table(rows.map((row) => ({
        row_index: row.row_index,
        pos_pdf: row.pos_pdf,
        pn_pdf: row.pn_pdf,
        designation_pdf: row.designation_pdf,
        confidence: row.confidence,
        warnings: row.warnings.join('|')
    })));

    if (!silent) {
        setPdfActionStatus(`Preview PDF pagina ${sourcePage}: ${rows.length} filas detectadas (ver consola / __miluPdfPageRowsPreview).`, 'ok');
    }

    return {
        ok: true,
        reason: 'preview-ready',
        ...preview
    };

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

async function runExtractPdfPageRowsPreview() {

    const result = await extractAllPdfRowsFromCurrentPage({ silent: true });
    if (!result?.ok) {
        setPdfActionStatus('Primero ejecuta CABECERAS + TABLA o carga la vista PDF.', 'error');
        return { ok: false, reason: result?.reason || 'preview-not-ready' };
    }

    const rows = Array.isArray(result.rows) ? result.rows : [];
    const rowsWithPn = rows.filter((row) => normalizeString(row?.pn_pdf)).length;
    const warningsCount = rows.reduce((total, row) => {
        const warnings = Array.isArray(row?.warnings) ? row.warnings : [];
        return total + warnings.length;
    }, 0);
    const sourcePage = Number(result.source_page || state.currentPdfPageNumber || 0);

    const previewPayload = {
        source_page: sourcePage,
        generated_at: new Date().toISOString(),
        rows_count: rows.length,
        rows_with_pn: rowsWithPn,
        warnings_count: warningsCount,
        rows
    };

    window.__miluPdfPageRowsPreview = previewPayload;

    console.info('[pdf-preview] EXTRAER PAGINA resumen ->', {
        source_page: sourcePage,
        rows_count: rows.length,
        rows_with_pn: rowsWithPn,
        warnings_count: warningsCount
    });
    console.table(rows.map((row) => ({
        row_index: row.row_index,
        pos_pdf: row.pos_pdf,
        pn_pdf: row.pn_pdf,
        designation_pdf: row.designation_pdf,
        confidence: row.confidence,
        warnings: Array.isArray(row.warnings) ? row.warnings.join('|') : ''
    })));

    downloadJsonPreview(previewPayload, `pdf_page_rows_preview_p${sourcePage || 0}.json`);
    setPdfActionStatus(
        `Preview pagina ${sourcePage}: filas=${rows.length}, con PN=${rowsWithPn}, warnings=${warningsCount}. JSON descargado.`,
        'ok'
    );

    return { ok: true, payload: previewPayload };

}

window.extractAllPdfRowsFromCurrentPage = extractAllPdfRowsFromCurrentPage;


function getPdfBlueTextsArea() {

    const area = $('pdfBlueTextsArea');

    return area instanceof HTMLTextAreaElement ? area : null;

}


function syncPdfBlueTextsArea() {

    const area = getPdfBlueTextsArea();

    if (!area) return false;

    const texts = getPdfExperimentalBlueTexts({ dedupe: false });

    area.value = Array.isArray(texts) ? texts.join('\n') : '';

    return true;

}


async function copyPdfBlueTextsArea() {

    const area = getPdfBlueTextsArea();

    if (!area) return;



    const text = String(area.value || '').trim();

    if (!text) {

        alert('No hay textos azules para copiar.');

        return;

    }



    if (navigator.clipboard?.writeText) {

        await navigator.clipboard.writeText(text);

        alert('Textos azules copiados al portapapeles.');

        return;

    }



    area.focus();

    area.select();

    const copied = document.execCommand('copy');

    if (copied) {

        alert('Textos azules copiados al portapapeles.');

        return;

    }



    alert('No se pudo copiar automáticamente.');

}


let currentRow = null;

let currentProcessIndex = 0;

let comparisonRenderToken = 0;

let lastRenderedRecordKey = '';

let isApplyingPdfAutoDesignation = false;

let isApplyingPdfAutoPn = false;

let isApplyingPdfAutoPos = false;

let isApplyingPdfGeneric = false;

let isApplyingPdfCurrentRowToFinal = false;

const PDF_TO_FINAL_FIELD_MAPPINGS = [
    { pdfKey: 'pos_pdf', finalKey: 'pos_final', label: 'POS' },
    { pdfKey: 'pn_pdf', finalKey: 'pn_final', label: 'PART NO.' },
    { pdfKey: 'designation_pdf', finalKey: 'designation_final', label: 'DESIGNATION' },
    { pdfKey: 'model_type_pdf', finalKey: 'model_type_final', label: 'MODEL/TYPE' },
    { pdfKey: 'qty_pdf', finalKey: 'qty_final', label: 'QTY' },
    { pdfKey: 'units_pdf', finalKey: 'units_final', label: 'UNITS' },
    { pdfKey: 'weight_pdf', finalKey: 'weight_final', label: 'WEIGHT' },
    { pdfKey: 'fn_pdf', finalKey: 'fn_final', label: 'FN' },
    { pdfKey: 'measure_pdf', finalKey: 'measure_final', label: 'MEASUREMENT / STANDARD' },
    { pdfKey: 'fg_fgs_pdf', finalKey: 'fg_fgs_final', label: 'FG/FGS' },
    { pdfKey: 'bom_pdf', finalKey: 'bom_final', label: 'BOM-No.' },
    { pdfKey: 'gesa_pdf', finalKey: 'gesa_final', label: 'GESA' },
    { pdfKey: 'nsn_pdf', finalKey: 'nsn_final', label: 'NSN' },
    { pdfKey: 'normalizado_pdf', finalKey: 'normalizado_final', label: 'NORMALIZADO' },
    { pdfKey: 'norma_pdf', finalKey: 'norma_final', label: 'NORMA' },
    { pdfKey: 'sust_status_pdf', finalKey: 'sust_status_final', label: 'SUST_STATUS' },
    { pdfKey: 'hierarchi_pdf', finalKey: 'hierarchie_final', label: 'HIERARCHI' },
    { pdfKey: 'sust_new_part_number_pdf', finalKey: 'new_pn_final', label: 'SUST_NEW_PART_NUMBER' },
    { pdfKey: 'sust_superseded_list_pdf', finalKey: 'subst_pnlist_final', label: 'SUST_SUPERSEDED_LIST' }
];

const GESA_TO_FINAL_FIELD_MAPPINGS = new Map([
    ['designation_final', 'designation_gesa'],
    ['measure_final', 'dimensions_gesa'],
    ['weight_final', 'weight_gesa'],
    ['nsn_final', 'nsn'],
    ['normalizado_final', 'normalizado'],
    ['norma_final', 'norma']
]);

let pdfRowHighlightRequestId = 0;

const pdfDocumentPromiseCache = new Map();

const pdfPageTextCache = new Map();

const PDF_CLUSTER_GAP_MAX = 24;

const PDF_LINE_Y_TOLERANCE = 2;

const PDF_ROW_Y_TOLERANCE = 5;

const PDF_ROW_HIGHLIGHT_DEBUG = true;

// Flags separados para evitar acoplar rendimiento con botones de diagnostico.
const PDF_FEATURE_HEADERS_ENABLED = true;
const PDF_FEATURE_BLUE_TEXT_PANEL_ENABLED = false;
const PDF_FEATURE_PN_ROW_DEBUG_ENABLED = false;
const PDF_FEATURE_BACKGROUND_TOKEN_SCAN_ENABLED = false;
const PDF_FEATURE_EXTRACT_PAGE_PREVIEW_ENABLED = true;
const PDF_FEATURE_AUTO_PDF_ENABLED = true;
const PDF_FEATURE_AUTO_SYNC_ON_RECORD_EVENTS = true;
const AUTO_RECOMPUTE_ON_EDIT_ENABLED = false;
const SHELL_NOTIFY_ON_PDF_DATA_CHANGE = false;

// Scope configurable del boton rapido de recálculo de errores:
// - 'all': recalcula errores de todo el libro
// - 'current': recalcula solo el registro actual
// Cambiar aqui para alternar comportamiento en el futuro.
const QUICK_ERRORS_RECALC_SCOPE = 'all';

const RIGHT_PANEL_WIDTH_KEY = 'analista02:right-panel-width';

const COMPARISON_WIDTHS_KEY = 'analista02:comparison-column-widths';

const COMPARISON_MIN_COL_WIDTH = 30;

const ENGINE_BOOK_FILES = getEngineJsonFiles();

const AUTO_RECOMPUTE_TRIGGER_FIELDS = new Set([

    'pn_final',

    'designation_final',

    'weight_final',

    'norma',

    'measure_final'

]);



function invalidatePendingPdfRowHighlight() {

    pdfRowHighlightRequestId += 1;

}


function clearPdfOverlaysOnRecordChange(row) {

    const nextRecordKey = row ? String(getRevisionKey(row) || '').trim() : '';

    if (nextRecordKey === lastRenderedRecordKey) {
        return;
    }

    lastRenderedRecordKey = nextRecordKey;
    clearAllPdfOverlaysAndPanels();

}


function clearAllPdfOverlaysAndPanels() {

    invalidatePendingPdfRowHighlight();
    clearPdfOverlaysExceptHeaders();

    const headerPanel = document.getElementById('headerDetectionPanel');
    if (headerPanel) headerPanel.hidden = true;

    const bodyPanel = document.getElementById('bodyColumnHighlightPanel');
    if (bodyPanel) bodyPanel.hidden = true;

}


function getStartupSelectionFromUrl() {

    const params = new URLSearchParams(window.location.search || '');

    const engine = String(params.get('engine') || '').trim();

    const id = String(params.get('id') || '').trim();

    const record = String(params.get('record') || '').trim();



    return { engine, id, record };

}



const startupSelection = getStartupSelectionFromUrl();



function inferEngineModelFromFileName(fileName) {

    return String(fileName || '')

        .replace(/^engine_/i, '')

        .replace(/\.json$/i, '')

        .trim();

}



const ENGINE_BOOK_MODELS = ENGINE_BOOK_FILES.map(inferEngineModelFromFileName).filter(Boolean);



function txt(value, fallback = '-') {

    const normalized = String(value ?? '').trim();

    return normalized || fallback;

}

// Devuelve el primer valor que no sea vacío, null, undefined, "-" ni "—".
// Usado en buildComparisonRows para resolver fallbacks legacy sin que un "-" o null bloquee el siguiente candidato.
function firstNonEmpty(...values) {

    const EMPTY_SENTINELS = new Set(['-', '—', 'null', 'undefined']);

    for (const v of values) {

        if (v === null || v === undefined) continue;

        const s = String(v).trim();

        if (s && !EMPTY_SENTINELS.has(s)) return v;

    }

    return undefined;

}



function escapeHtml(value) {

    return String(value ?? '')

        .replace(/&/g, '&amp;')

        .replace(/</g, '&lt;')

        .replace(/>/g, '&gt;')

        .replace(/"/g, '&quot;')

        .replace(/'/g, '&#039;');

}



function normalizeString(value) {

    return String(value ?? '').trim().replace(/\s+/g, ' ');

}



function normalizeCompareValue(value) {

    const normalized = String(value ?? '').trim();

    return normalized === '-' ? '' : normalized;

}



function isCompareMatch(left, right) {

    const normalizedLeft = normalizeCompareValue(left);

    const normalizedRight = normalizeCompareValue(right);

    return normalizedLeft !== '' && normalizedRight !== '' && normalizedLeft === normalizedRight;

}



function isRequiredComparisonField(fieldName) {

    const normalized = String(fieldName ?? '').trim().toUpperCase();

    return normalized === 'POS' || normalized === 'PART NO.' || normalized === 'DESIGNATION';

}



// Calcula clases CSS para las celdas de la tabla comparativa (field registry refactorizado).
// Usa propiedades refactorizadas: excel (fuente Excel), gesa, subst, pdf (_pdf almacenado), final.
// Mantiene aliases legacy rawClass/sustClass/pdfAutoClass para compatibilidad con código externo.
function getComparisonCellClasses(entry) {

    // Soporte aliases legacy: excel → raw, subst → sust, pdf → pdfAutoValue
    const excelValue = txt(entry?.excel ?? entry?.raw);

    const substValue = txt(entry?.subst ?? entry?.sust);

    const finalValue = txt(entry?.final);

    const gesaValue = txt(entry?.gesa);

    // entry.pdf contiene el valor _pdf almacenado (antes 'pdfAutoValue' / columna PDF_AUTO)
    const pdfValue = txt(entry?.pdf);



    const getClassAgainstFinal = (value) => {

        const normalizedValue = normalizeCompareValue(value);

        const normalizedFinal = normalizeCompareValue(finalValue);

        if (!normalizedValue) return '';

        return normalizedValue === normalizedFinal ? 'compare-match' : 'compare-mismatch-soft';

    };



    const finalMissing = isRequiredComparisonField(entry?.field) && normalizeCompareValue(finalValue) === '';

    const excelMatchesSubst = isCompareMatch(excelValue, substValue);

    const substMatchesFinal = isCompareMatch(substValue, finalValue);

    const gesaMatchesFinal = isCompareMatch(gesaValue, finalValue);

    const pdfMatchesFinal = isCompareMatch(pdfValue, finalValue);

    const excelSubstMatchClass = excelMatchesSubst ? 'compare-raw-sust-match' : '';

    const finalFilled = normalizeCompareValue(finalValue) !== '';

    const finalMatchesAnySource = gesaMatchesFinal || substMatchesFinal || pdfMatchesFinal;



    return {

        excelClass: [getClassAgainstFinal(excelValue), excelSubstMatchClass].filter(Boolean).join(' '),

        substClass: getClassAgainstFinal(substValue),

        finalClass: finalMissing
            ? 'compare-missing'
            : (finalFilled ? (finalMatchesAnySource ? 'compare-match' : 'compare-mismatch-soft') : ''),

        gesaClass: getClassAgainstFinal(gesaValue),

        pdfClass: getClassAgainstFinal(pdfValue),

        // Aliases legacy para compatibilidad con código que lea rawClass/sustClass/pdfAutoClass

        rawClass: [getClassAgainstFinal(excelValue), excelSubstMatchClass].filter(Boolean).join(' '),

        sustClass: getClassAgainstFinal(substValue),

        pdfAutoClass: getClassAgainstFinal(pdfValue)

    };

}



function normalizePdfToken(value) {

    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

}



function escapeRegExp(value) {

    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

}



function extractExactPdfSubstring(sourceText, candidate) {

    const source = String(sourceText ?? '').trim();

    const rawCandidate = String(candidate ?? '').trim();

    if (!source || !rawCandidate) return '';



    const directIndex = source.toLowerCase().indexOf(rawCandidate.toLowerCase());

    if (directIndex >= 0) {

        return source.slice(directIndex, directIndex + rawCandidate.length);

    }



    const pattern = rawCandidate

        .split(/\s+/)

        .filter(Boolean)

        .map(part => escapeRegExp(part))

        .join('\\s+');

    if (!pattern) return '';



    const regex = new RegExp(pattern, 'i');

    const match = source.match(regex);

    return match?.[0] || '';

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



function resolvePdfPageNumber(value) {

    const parsed = Number(String(value ?? '').replace(/[^0-9]/g, ''));

    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;

}



function logPdfRowHighlightDebug(...args) {

    if (!PDF_ROW_HIGHLIGHT_DEBUG) return;

    console.debug('[A2][PDF_ROW_EXPERIMENT]', ...args);

}


async function getPdfPageNormalizedText(book, sourcePage) {

    if (!window.pdfjsLib) {

        return { normalizedText: '', items: [], clusters: [] };

    }



    const bookClean = String(book ?? '').trim();

    const pageNum = resolvePdfPageNumber(sourcePage);

    if (!bookClean || !pageNum) {

        return { normalizedText: '', items: [], clusters: [] };

    }



    const pageCacheKey = `${bookClean}::${pageNum}`;

    if (pdfPageTextCache.has(pageCacheKey)) {

        return pdfPageTextCache.get(pageCacheKey);

    }



    const pdfUrl = new URL(`pdf/${encodeURIComponent(bookClean)}.pdf`, new URL('.', window.location.href)).href;

    if (!pdfDocumentPromiseCache.has(pdfUrl)) {

        pdfDocumentPromiseCache.set(pdfUrl, window.pdfjsLib.getDocument(pdfUrl).promise);

    }



    const task = (async () => {

        const pdfDocument = await pdfDocumentPromiseCache.get(pdfUrl);

        if (pageNum < 1 || pageNum > pdfDocument.numPages) {

            return { normalizedText: '', items: [], clusters: [] };

        }



        const page = await pdfDocument.getPage(pageNum);

        const textContent = await page.getTextContent();

        const rawItems = (textContent.items || []).map((item) => {

            const text = String(item?.str || '').trim();

            const tx = item?.transform || [];

            return {

                text,

                normalized: normalizePdfToken(text),

                left: Number(tx?.[4] || 0),

                top: Number(tx?.[5] || 0),

                height: Number(item?.height || 0),

                width: Number(item?.width || 0)

            };

        }).filter((item) => item.normalized);



        const lines = [];

        rawItems.forEach((item) => {

            const line = lines.find((candidate) => Math.abs(candidate.top - item.top) <= PDF_LINE_Y_TOLERANCE);

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

            line.items.forEach((item) => {

                item.lineIndex = index;

            });

        });



        const clusters = [];

        lines.forEach((line) => {

            const sorted = [...line.items].sort((a, b) => a.left - b.left);

            let currentCluster = null;



            sorted.forEach((item) => {

                if (!currentCluster) {

                    currentCluster = {

                        right: item.left + item.width,

                        parts: [item.text],

                        normalizedParts: [item.normalized]

                    };

                    return;

                }



                const gap = item.left - currentCluster.right;

                if (gap <= PDF_CLUSTER_GAP_MAX) {

                    currentCluster.parts.push(item.text);

                    currentCluster.normalizedParts.push(item.normalized);

                    currentCluster.right = Math.max(currentCluster.right, item.left + item.width);

                    return;

                }



                clusters.push({

                    text: currentCluster.parts.join(' ').replace(/\s+/g, ' ').trim(),

                    normalized: currentCluster.normalizedParts.join(' ').replace(/\s+/g, ' ').trim(),

                    lineIndex: line.lineIndex

                });



                currentCluster = {

                    right: item.left + item.width,

                    parts: [item.text],

                    normalizedParts: [item.normalized]

                };

            });



            if (currentCluster) {

                clusters.push({

                    text: currentCluster.parts.join(' ').replace(/\s+/g, ' ').trim(),

                    normalized: currentCluster.normalizedParts.join(' ').replace(/\s+/g, ' ').trim(),

                    lineIndex: line.lineIndex

                });

            }

        });



        const joined = rawItems.map((item) => item.text).join(' ');

        return {

            normalizedText: normalizePdfToken(joined),

            items: rawItems,

            clusters

        };

    })().catch((error) => {

        console.warn('No se pudo leer texto PDF para la comparativa:', error);

        return { normalizedText: '', items: [], clusters: [] };

    });



    pdfPageTextCache.set(pageCacheKey, task);

    return task;

}



function buildPdfLineItemsFromTextContent(pageText, lineIndices) {

    if (!pageText || !Array.isArray(pageText.items) || !Array.isArray(lineIndices) || !lineIndices.length) return [];

    const lineIndexSet = new Set(lineIndices.filter(Number.isInteger));

    return pageText.items
        .filter((item) => lineIndexSet.has(Number(item?.lineIndex)))
        .filter((item) => String(item?.text || '').trim())
        .sort((a, b) => {
            const lineDelta = Number(a?.lineIndex || 0) - Number(b?.lineIndex || 0);
            if (lineDelta !== 0) return lineDelta;
            return Number(a?.left || 0) - Number(b?.left || 0);
        });

}



async function findPdfLineByToken(record = currentRow, rawToken = '', fieldName = 'pn_final') {

    if (!record) {
        return { token: '', normalizedToken: '', matches: [], clusterMatches: [], lineIndices: [], lineItems: [], pageText: null, fieldName };
    }

    const book = String(record?.engine_model ?? '').trim();
    const sourcePage = String(record?.['Source Page'] ?? '').trim();
    const token = String(rawToken ?? '').trim();
    const normalizedToken = normalizePdfToken(token);

    if (!book || !sourcePage || !normalizedToken) {
        return { token, normalizedToken, matches: [], clusterMatches: [], lineIndices: [], lineItems: [], pageText: null, fieldName };
    }

    const pageText = await getPdfPageNormalizedText(book, sourcePage);
    const matches = (pageText?.items || []).filter((item) => tokenMatchesPdf(item?.normalized, normalizedToken));
    const clusterMatches = (pageText?.clusters || []).filter((cluster) => tokenMatchesPdf(cluster?.normalized, normalizedToken));
    const lineIndices = Array.from(new Set([
        ...matches.map((item) => Number(item?.lineIndex)).filter(Number.isInteger),
        ...clusterMatches.map((cluster) => Number(cluster?.lineIndex)).filter(Number.isInteger)
    ])).sort((a, b) => a - b);

    return {
        token,
        normalizedToken,
        matches,
        clusterMatches,
        lineIndices,
        lineItems: buildPdfLineItemsFromTextContent(pageText, lineIndices),
        pageText,
        fieldName
    };

}


async function findPdfLineByPnFinal(record = currentRow) {

    const pnFinal = String(record?.pn_final ?? record?.['PART NO.'] ?? '').trim();

    return findPdfLineByToken(record, pnFinal, 'pn_final');

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
        // BOM debe contener al menos un digito para no capturar el literal "No".
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
            normalized: normalizePdfToken(text),
            left: Number(tx?.[4] || 0),
            top: Number(tx?.[5] || 0),
            width: Number(item?.width || 0) * Number(viewport?.scale || 1),
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


async function detectTopBomAndFgInPdf(record = currentRow) {

    if (!record) {

        return { error: 'Primero debes cargar un registro.' };

    }


    const book = String(record?.engine_model ?? '').trim();

    const sourcePage = String(record?.['Source Page'] ?? '').trim();

    if (!book || !sourcePage) {

        return { error: 'No se pudo resolver libro o pagina del PDF del registro actual.' };

    }


    const lastPageData = getPdfLastPageData();
    let pageItems = buildRenderedPdfItemsWithLineIndex(lastPageData?.textItems, lastPageData?.viewport);

    if (!pageItems.length) {
        const pageText = await getPdfPageNormalizedText(book, sourcePage);
        pageItems = Array.isArray(pageText?.items) ? pageText.items : [];
    }

    if (!pageItems.length) {

        setPdfReadTokens([]);

        requestPdfRelayout();

        return { error: 'No hay texto disponible en el PDF cargado.' };

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


    if (!topLines.length) {

        setPdfReadTokens([]);

        requestPdfRelayout();

        return { error: 'No se encontraron lineas superiores para analizar.' };

    }


    const tableHeaderRegex = /\b(pos|part\s*no\.?|designation|model\s*\/\s*type|qty\.?|units|weight|fn|measurement|standard)\b/i;


    const fgDetection = extractTopLabeledValue(topLines, {

        labelRegex: /\b(?:fg(?:\s*(?:\/|-)\s*|\s+)fgs|fg\/fgs|fgs|fg)\b/i,

        valueRegex: /\b(?:fg(?:\s*(?:\/|-)\s*|\s+)fgs|fg\/fgs|fgs|fg)\b\s*[:\-]?\s*(.+)$/i,

        rejectNextLineRegex: tableHeaderRegex,

        sameLineOnly: true

    });


    const bomDetection = extractTopBomValue(topLines, tableHeaderRegex);


    const readTokens = [];

    if (fgDetection?.value) {

        readTokens.push({ field: 'FG/FGS', token: normalizePdfToken(fgDetection.value) });

    }

    if (bomDetection?.value) {

        readTokens.push({ field: 'BOM-No.', token: normalizePdfToken(bomDetection.value) });

    }


    const topOverlayHighlights = [];

    const pushTopOverlayForDetection = (detection, label, labelFilterRegex) => {
        if (!detection?.value) return;
        const valueLineIndex = Number(detection?.valueLineIndex);
        if (!Number.isInteger(valueLineIndex)) return;

        // Work on ALL items on the line — label filtering is only used as last resort fallback
        const allLineItems = pageItems
            .filter((item) => Number(item?.lineIndex) === valueLineIndex)
            .sort((a, b) => Number(a?.left || 0) - Number(b?.left || 0));
        if (!allLineItems.length) return;

        // Narrow to only the items that correspond to the detected value (not the whole line)
        const detectedValue = String(detection.value || '').trim();
        const detectedNorm = normalizePdfToken(detectedValue);
        let matchedItems = [];

        // Method 1: single item exact match
        const exactMatch = allLineItems.find((item) =>
            normalizePdfToken(String(item.text || '').trim()) === detectedNorm
        );
        if (exactMatch) {
            matchedItems = [exactMatch];
        }

        // Method 2: multi-token value — find contiguous window of items
        if (!matchedItems.length) {
            const valueParts = detectedValue.split(/\s+/).filter(Boolean);
            if (valueParts.length > 1) {
                const partNorms = valueParts.map((p) => normalizePdfToken(p));
                for (let i = 0; i <= allLineItems.length - valueParts.length; i++) {
                    const windowNorms = allLineItems.slice(i, i + valueParts.length)
                        .map((item) => normalizePdfToken(String(item.text || '').trim()));
                    if (windowNorms.every((n, j) => n === partNorms[j])) {
                        matchedItems = allLineItems.slice(i, i + valueParts.length);
                        break;
                    }
                }
            }
        }

        // Method 2.5: value with dashes (e.g. "011-05") — split on '-' and look for contiguous items.
        // Also handles the case where pdfjs merges the label with the first token (e.g. item text
        // is "FG/FGS: 011"): the first window item may END WITH partNorms[0] instead of being equal.
        if (!matchedItems.length && detectedValue.includes('-')) {
            const dashParts = detectedValue.split('-').filter(Boolean);
            if (dashParts.length > 1) {
                const partNorms = dashParts.map((p) => normalizePdfToken(p.trim()));
                for (let i = 0; i <= allLineItems.length - dashParts.length; i++) {
                    const windowItems = allLineItems.slice(i, i + dashParts.length);
                    const windowNorms = windowItems.map((item) => normalizePdfToken(String(item.text || '').trim()));
                    // First item: exact match OR ends-with (handles "FG/FGS: 011" merged item)
                    const firstOk = windowNorms[0] === partNorms[0] || windowNorms[0].endsWith(partNorms[0]);
                    const restOk = windowNorms.slice(1).every((n, j) => n === partNorms[j + 1]);
                    if (firstOk && restOk) {
                        matchedItems = windowItems;
                        break;
                    }
                }
            }
        }

        // Method 3: single item that contains the value
        if (!matchedItems.length) {
            const containsMatch = allLineItems.find((item) =>
                normalizePdfToken(String(item.text || '').trim()).includes(detectedNorm)
            );
            if (containsMatch) matchedItems = [containsMatch];
        }

        // Fallback: items to the right of the label (exclude label item itself)
        if (!matchedItems.length) {
            let fallbackItems = allLineItems;
            if (labelFilterRegex instanceof RegExp) {
                const labelItem = allLineItems.find((item) => labelFilterRegex.test(String(item.text || '')));
                if (labelItem) {
                    const labelRight = Number(labelItem.left || 0) + Number(labelItem.width || 0);
                    const afterLabel = allLineItems.filter((item) => Number(item.left || 0) >= labelRight);
                    if (afterLabel.length) fallbackItems = afterLabel;
                }
            }
            matchedItems = fallbackItems;
        }

        const itemsToHighlight = matchedItems;

        const left = Math.min(...itemsToHighlight.map((item) => Number(item?.left || 0)));
        const right = Math.max(...itemsToHighlight.map((item) => Number(item?.left || 0) + Number(item?.width || 0)));
        const top = Math.min(...itemsToHighlight.map((item) => Number(item?.top || 0) - Math.max(10, Number(item?.height || 0))));
        const bottom = Math.max(...itemsToHighlight.map((item) => Number(item?.top || 0)));

        topOverlayHighlights.push({
            left: Math.max(0, left - 4),
            top: Math.max(0, top - 2),
            width: Math.max(20, (right - left) + 8),
            height: Math.max(14, (bottom - top) + 6),
            text: `${label}: ${String(detection.value || '').trim()}`,
            kind: 'blue-token'
        });
    };

    // Normalize FG/FGS: two space-separated tokens → joined with dash (e.g. "004 05" → "004-05")
    if (fgDetection?.value) {
        fgDetection.value = String(fgDetection.value).replace(/^(\S+)\s+(\S+)$/, '$1-$2');
    }

    pushTopOverlayForDetection(fgDetection, 'FG/FGS', /\bfg\s*\/?\s*fgs\b/i);
    pushTopOverlayForDetection(bomDetection, 'BOM-No.', /\bbom\b/i);


    // Asegura que renderPdfSelectionOverlay no descarte el pintado por falta de selección.
    setPdfSelection(record);
    setPdfReadTokens(readTokens);

    state.currentPdfHeaderOnlyOverlay = topOverlayHighlights;

    requestPdfRelayout();


    const entries = [

        {

            key: 'fg_fgs',

            label: 'FG/FGS',

            found: Boolean(fgDetection?.value),

            value: fgDetection?.value || '',

            lineIndex: Number.isInteger(Number(fgDetection?.lineIndex)) ? Number(fgDetection.lineIndex) : null,

            valueLineIndex: Number.isInteger(Number(fgDetection?.valueLineIndex)) ? Number(fgDetection.valueLineIndex) : null,

            method: fgDetection?.method || ''

        },

        {

            key: 'bom',

            label: 'BOM-No.',

            found: Boolean(bomDetection?.value),

            value: bomDetection?.value || '',

            lineIndex: Number.isInteger(Number(bomDetection?.lineIndex)) ? Number(bomDetection.lineIndex) : null,

            valueLineIndex: Number.isInteger(Number(bomDetection?.valueLineIndex)) ? Number(bomDetection.valueLineIndex) : null,

            method: bomDetection?.method || ''

        }

    ];


    return {

        error: null,

        foundCount: entries.filter((entry) => entry.found).length,

        lineCount: topLines.length,

        entries

    };

}



function getPageSortValue(value) {

    const digits = String(value ?? '').replace(/[^0-9]/g, '');

    const parsed = Number(digits);

    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;

}



function getPosSortValue(value) {

    const digits = String(value ?? '').replace(/[^0-9]/g, '');

    const parsed = Number(digits);

    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;

}



function sortRowsByBookPagePos(rows) {

    return [...rows].sort((a, b) => {

        const bookA = String(a?.engine_model ?? '').trim();

        const bookB = String(b?.engine_model ?? '').trim();

        const byBook = bookA.localeCompare(bookB, 'es', { numeric: true, sensitivity: 'base' });

        if (byBook !== 0) return byBook;



        const byPage = getPageSortValue(a?.['Source Page']) - getPageSortValue(b?.['Source Page']);

        if (byPage !== 0) return byPage;



        const byPos = getPosSortValue(a?.POS) - getPosSortValue(b?.POS);

        if (byPos !== 0) return byPos;



        return String(a?.ID ?? '').localeCompare(String(b?.ID ?? ''), 'es', { numeric: true, sensitivity: 'base' });

    });

}



function getQueueRows() {

    const engineFilter = String($('engineFilterSelect')?.value ?? '').trim();

    if (!engineFilter) return sortRowsByBookPagePos(state.allData || []);

    return sortRowsByBookPagePos((state.allData || []).filter(row => String(row?.engine_model ?? '').trim() === engineFilter));

}



function getRevisionKey(row) {

    return String(row?.__qa_revision_key ?? '').trim();

}



function syncCurrentRowRevisionIntoQueue(partial = {}) {

    if (!currentRow || !partial || typeof partial !== 'object') return;



    const rowKey = getRevisionKey(currentRow);

    const rowId = String(currentRow?.ID ?? '').trim();

    const hasEstado = Object.prototype.hasOwnProperty.call(partial, 'qa_revision_estado');

    const hasAccion = Object.prototype.hasOwnProperty.call(partial, 'qa_revision_accion');

    if (!hasEstado && !hasAccion) return;



    const applyToRow = (row) => {

        if (!row) return;

        if (hasEstado) row.qa_revision_estado = partial.qa_revision_estado;

        if (hasAccion) row.qa_revision_accion = partial.qa_revision_accion;

    };



    applyToRow(currentRow);



    const allRows = Array.isArray(state.allData) ? state.allData : [];

    const linkedRow = allRows.find((row) => {

        if (rowKey && getRevisionKey(row) === rowKey) return true;

        if (!rowKey && rowId && String(row?.ID ?? '').trim() === rowId) return true;

        return false;

    });



    if (linkedRow && linkedRow !== currentRow) {

        applyToRow(linkedRow);

    }

}



function getDisplayPn(row) {

    const pnFinal = String(row?.pn_final ?? '').trim();

    if (pnFinal) return pnFinal;

    const partNo = String(row?.['PART NO.'] ?? '').trim();

    if (partNo) return partNo;

    return '-';

}



function getDisplayPnForInput(row) {

    const pnFinal = String(row?.pn_final ?? '').trim();

    if (pnFinal) return pnFinal;

    return String(row?.['PART NO.'] ?? '').trim();

}



function getDistinctRowKey(row) {

    const pnFinal = String(row?.pn_final ?? '').trim();

    if (pnFinal) return pnFinal.toLowerCase();



    const id = String(row?.ID ?? '').trim();

    if (id) return `id:${id.toLowerCase()}`;



    return `rev:${getRevisionKey(row).toLowerCase()}`;

}



function getRowCodes(row) {

    return evaluateRowQaChecks(row, getAllQaCheckCodes()).codes;

}



function getConsistencyWarnings(row) {

    const warnings = [];

    const designationRaw = normalizeString(row?.DESIGNATION);

    const designationFinal = normalizeString(row?.designation_final);



    if (designationRaw && designationFinal && designationRaw.toLowerCase() !== designationFinal.toLowerCase()) {

        warnings.push('Designation raw y designation_final no coinciden exactamente.');

    }



    return warnings;

}



function buildProcessSteps(row) {

    const codes = new Set(getRowCodes(row));

    const warnings = getConsistencyWarnings(row);



    return [

        {

            id: 'identity',

            title: 'Identidad minima (ID + POS)',

            pass: txt(row?.ID, '') !== '' && txt(row?.POS, '') !== '',

            detail: 'Permite trazar el registro en origen y en resultados.'

        },

        {

            id: 'part_no',

            title: 'PART NO. informado en raw',

            pass: !codes.has('missing_part_no'),

            detail: !codes.has('missing_part_no') ? 'PART NO. presente.' : 'Falta PART NO. en el registro raw.'

        },

        {

            id: 'pn_final_presence',

            title: 'pn_final presente',

            pass: !codes.has('missing_pn_final'),

            detail: !codes.has('missing_pn_final') ? 'pn_final informado.' : 'Falta pn_final en el registro final.'

        },

        {

            id: 'pn_final_equals_part_no',

            title: 'pn_final igual a PART NO.',

            pass: isCompareMatch(row?.pn_final, row?.['PART NO.']),

            detail: isCompareMatch(row?.pn_final, row?.['PART NO.']) ? 'pn_final coincide con PART NO.' : 'pn_final no coincide con PART NO.'

        },

        {

            id: 'designation_final_presence',

            title: 'designation_final presente',

            pass: !codes.has('missing_designation_final'),

            detail: !codes.has('missing_designation_final') ? 'designation_final informado.' : 'Falta designation_final.'

        },

        {

            id: 'designation_final_pdf',

            title: 'designation_final localizada en PDF',

            pass: !codes.has('designation_final_not_in_pdf'),

            detail: !codes.has('designation_final_not_in_pdf') ? 'Match de designation_final detectado en PDF.' : 'No hay match de designation_final en PDF.'

        },

        {

            id: 'cross_consistency',

            title: 'Consistencia entre fuentes',

            pass: warnings.length === 0,

            detail: warnings.length ? warnings[0] : 'No se detectan incoherencias basicas entre raw y final.'

        }

    ];

}



function computeProcessState(row) {

    const steps = buildProcessSteps(row);

    const executed = Math.max(0, Math.min(currentProcessIndex, steps.length));

    const executedSteps = steps.slice(0, executed);

    const failedExecuted = executedSteps.filter(step => !step.pass);



    if (executed < steps.length) {

        return {

            status: 'raw',

            title: 'Estado: REGISTRO_RAW',

            message: `Proceso en curso (${executed}/${steps.length}).`,

            steps,

            executed,

            failedExecuted

        };

    }



    if (failedExecuted.length > 0) {

        return {

            status: 'ko',

            title: 'Estado: REGISTRO_KO',

            message: `Proceso completo con ${failedExecuted.length} procesos fallidos.`,

            steps,

            executed,

            failedExecuted

        };

    }



    return {

        status: 'ok',

        title: 'Estado: REGISTRO_OK',

        message: 'Proceso completo sin fallos. Registro listo para OK.',

        steps,

        executed,

        failedExecuted

    };

}



function initHorizontalSplitter() {

    const layout = document.querySelector('.a2-layout');

    const splitter = $('a2Splitter');

    if (!(layout instanceof HTMLElement) || !(splitter instanceof HTMLElement)) return;



    const clampAndApplyWidth = (desiredWidth) => {

        const layoutWidth = Math.max(1, layout.getBoundingClientRect().width);

        const minWidth = 320;

        const maxWidth = Math.max(380, Math.floor(layoutWidth * 0.62));

        const clamped = Math.max(minWidth, Math.min(maxWidth, Math.round(desiredWidth)));

        layout.style.setProperty('--a2-right-width', `${clamped}px`);

        return clamped;

    };



    const savedWidth = Number(localStorage.getItem(RIGHT_PANEL_WIDTH_KEY));

    if (Number.isFinite(savedWidth) && savedWidth > 0) {

        clampAndApplyWidth(savedWidth);

    } else {

        const layoutWidth = Math.max(1, layout.getBoundingClientRect().width);

        clampAndApplyWidth(Math.round(layoutWidth * 0.35));

    }



    let dragging = false;



    const onPointerMove = (event) => {

        if (!dragging) return;

        const rect = layout.getBoundingClientRect();

        const desiredWidth = rect.right - event.clientX;

        const applied = clampAndApplyWidth(desiredWidth);

        localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(applied));

        requestPdfRelayout();

        event.preventDefault();

    };



    const stopDragging = () => {

        if (!dragging) return;

        dragging = false;

        document.body.classList.remove('a2-resizing');

        window.removeEventListener('pointermove', onPointerMove);

        window.removeEventListener('pointerup', stopDragging);

        requestPdfRelayout();

    };



    splitter.addEventListener('pointerdown', (event) => {

        if (window.matchMedia('(max-width: 1200px)').matches) return;

        dragging = true;

        document.body.classList.add('a2-resizing');

        window.addEventListener('pointermove', onPointerMove);

        window.addEventListener('pointerup', stopDragging);

        event.preventDefault();

    });



    splitter.addEventListener('keydown', (event) => {

        if (window.matchMedia('(max-width: 1200px)').matches) return;

        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;



        const current = Number.parseInt(getComputedStyle(layout).getPropertyValue('--a2-right-width'), 10) || 420;

        const delta = event.key === 'ArrowLeft' ? 24 : -24;

        const applied = clampAndApplyWidth(current + delta);

        localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(applied));

        requestPdfRelayout();

        event.preventDefault();

    });

}



function saveComparisonColumnWidths() {

    const widths = {};

    document.querySelectorAll('.a2-compare-table thead th').forEach((th, index) => {

        const key = (th.dataset.sort || th.textContent || `idx_${index}`).trim();

        widths[key] = th.style.width || `${th.offsetWidth}px`;

    });

    try { localStorage.setItem(COMPARISON_WIDTHS_KEY, JSON.stringify(widths)); }

    catch (error) { console.warn('No se pudieron guardar anchos de comparativa:', error); }

}



function loadComparisonColumnWidths() {

    let widths = {};

    try { widths = JSON.parse(localStorage.getItem(COMPARISON_WIDTHS_KEY) || '{}'); }

    catch (error) {

        console.warn('No se pudieron cargar anchos de comparativa:', error);

        return;

    }

    if (!Object.keys(widths).length) return;



    document.querySelectorAll('.a2-compare-table thead th').forEach((th, index) => {

        const key = (th.dataset.sort || th.textContent || `idx_${index}`).trim();

        if (widths[key]) th.style.width = widths[key];

    });

}



function initComparisonColumnResize() {

    const table = document.querySelector('.a2-compare-table');

    if (!(table instanceof HTMLTableElement)) return;

    if (table.dataset.columnsResizable === '1') return;



    let resizingColumn = null;

    let startX = 0;

    let startWidth = 0;



    document.querySelectorAll('.a2-compare-table thead th').forEach((th) => {

        th.addEventListener('mousedown', (event) => {

            if (event.button !== 0) return;

            const rect = th.getBoundingClientRect();

            if (rect.right - event.clientX > 6) return;

            resizingColumn = th;

            startX = event.clientX;

            startWidth = th.offsetWidth;

            th.classList.add('resizing');

            event.preventDefault();

        });

    });



    document.addEventListener('mousemove', (event) => {

        if (!resizingColumn) return;

        const newWidth = Math.max(COMPARISON_MIN_COL_WIDTH, startWidth + (event.clientX - startX));

        resizingColumn.style.width = `${newWidth}px`;

    });



    document.addEventListener('mouseup', () => {

        if (!resizingColumn) return;

        resizingColumn.classList.remove('resizing');

        saveComparisonColumnWidths();

        resizingColumn = null;

    });



    table.dataset.columnsResizable = '1';

}



function renderChecksModalBody() {

    const body = $('checksModalBody');

    if (!(body instanceof HTMLElement)) return;



    const checkEntries = (state.qaErrorCheckDefinitions || [])

        .map((definition) => ({

            field: String(definition?.field || '').trim() || '-',

            code: String(definition?.code || '').trim(),

            label: String(definition?.label || definition?.code || '').trim()

        }))

        .filter((definition) => definition.code);



    let html = '';



    html += `<p class="checks-group-title">Listado activo para ERR (${checkEntries.length})</p>`;

    if (checkEntries.length === 0) {

        html += `<p style="font-size:12px;color:#6b7280;margin:0">No hay checks configurados.</p>`;

    } else {

        html += `<ul class="checks-list">`;

        for (const entry of checkEntries) {

            html += `<li class="check-custom"><span class="check-code">${escapeHtml(entry.code)}</span><span class="check-label">${escapeHtml(entry.label)} <em style="color:#6b7280">(campo: ${escapeHtml(entry.field)})</em></span></li>`;

        }

        html += `</ul>`;

    }



    body.innerHTML = html;

}



function initChecksModal() {

    const header = $('errColHeader');

    const modal = $('checksModal');

    const closeBtn = $('checksModalClose');

    const backdrop = modal?.querySelector('.checks-modal-backdrop');



    if (!(header instanceof HTMLElement) || !(modal instanceof HTMLElement)) return;



    header.addEventListener('click', () => {

        renderChecksModalBody();

        modal.hidden = false;

    });



    closeBtn?.addEventListener('click', () => { modal.hidden = true; });

    backdrop?.addEventListener('click', () => { modal.hidden = true; });



    document.addEventListener('keydown', (event) => {

        if (!modal.hidden && event.key === 'Escape') modal.hidden = true;

    });

}



// Modo depuración: al activar, cada celda de la tabla muestra el nombre técnico del campo
// (atributo data-field-key añadido por buildComparisonRows / renderComparisonTable).
function initComparisonDebugToggle() {

    const btn = $('comparisonDebugBtn');

    const table = document.querySelector('.a2-compare-table');

    if (!(btn instanceof HTMLButtonElement) || !(table instanceof HTMLTableElement)) return;



    btn.addEventListener('click', () => {

        const isActive = table.classList.toggle('is-debug');

        btn.textContent = isActive ? 'Debug ON' : 'Debug';

        btn.setAttribute('aria-pressed', String(isActive));

    });

}



let recomputeModalListenersBound = false;
let recomputeErrorsInFlight = false;
const RECOMPUTE_ALL_BOOKS_VALUE = 'all';

function getRecomputeScopeLabel(scope) {
    switch (String(scope || '').trim()) {
        case 'current':
            return 'registro actual';
        case 'all':
            return 'todos los libros';
        case 'book':
        default:
            return 'libro actual';
    }
}

function getRecomputeBookSelect() {
    const next = $('recomputeBookSelect');
    if (next instanceof HTMLSelectElement) return next;
    const legacy = $('recomputeEngineSelect');
    if (legacy instanceof HTMLSelectElement) return legacy;
    return null;
}

function getRecomputeModalFilters() {
    const recomputeBookSelect = getRecomputeBookSelect();
    const recomputeIdInput = $('recomputeIdInput');

    return {
        book: recomputeBookSelect instanceof HTMLSelectElement
            ? String(recomputeBookSelect.value || '').trim() || RECOMPUTE_ALL_BOOKS_VALUE
            : RECOMPUTE_ALL_BOOKS_VALUE,
        id: recomputeIdInput instanceof HTMLInputElement
            ? String(recomputeIdInput.value || '').trim()
            : ''
    };
}

function logRecomputeModalAction(actionName, filters) {
    console.info('[RecomputeModal] action', actionName);
    console.info('[RecomputeModal] filters', filters);
}

function clearRecomputeErrorsSummary() {
    const panel = $('recomputeErrorsSummaryPanel');
    const meta = $('recomputeErrorsSummaryMeta');
    const body = $('recomputeErrorsSummaryBody');
    if (panel instanceof HTMLElement) panel.hidden = true;
    if (meta instanceof HTMLElement) meta.textContent = '';
    if (body instanceof HTMLElement) body.innerHTML = '';
}

function buildRecomputeErrorTypeList(typeCounts, emptyMessage) {
    const entries = Object.entries(typeCounts || {})
        .map(([code, count]) => ({ code, count: Number(count) || 0 }))
        .filter((item) => item.count > 0)
        .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));

    if (!entries.length) return `<p style="margin:0;color:#64748b;">${escapeHtml(emptyMessage)}</p>`;

    return `<ul style="margin:0;padding-left:1.1rem;display:grid;gap:0.3rem;">${entries
        .map((item) => `<li><strong>${escapeHtml(item.code)}</strong>: ${item.count}</li>`)
        .join('')}</ul>`;
}

function buildRecomputeTopRulesList(ruleSummary) {
    const entries = Array.isArray(ruleSummary) ? ruleSummary.slice(0, 10) : [];
    if (!entries.length) return '<p style="margin:0;color:#64748b;">No se detectaron reglas con errores.</p>';

    return `<ol style="margin:0;padding-left:1.1rem;display:grid;gap:0.3rem;">${entries
        .map((item) => `<li><strong>${escapeHtml(String(item?.label || item?.code || ''))}</strong> <span style="color:#64748b;">(${escapeHtml(String(item?.code || ''))})</span>: ${Number(item?.count) || 0}</li>`)
        .join('')}</ol>`;
}

function renderRecomputeErrorsSummary(result, context = {}) {
    const panel = $('recomputeErrorsSummaryPanel');
    const meta = $('recomputeErrorsSummaryMeta');
    const body = $('recomputeErrorsSummaryBody');
    if (!(panel instanceof HTMLElement) || !(meta instanceof HTMLElement) || !(body instanceof HTMLElement)) return;

    const scope = String(context.scope || result?.scope || '').trim() || 'book';
    const bookRows = Array.isArray(result?.books) ? result.books : [];
    const booksProcessed = Number(result?.booksProcessed) || (bookRows.length || (result?.file ? 1 : 0));
    const recordsProcessed = Number(result?.scanned) || 0;
    const recordsWithErrors = Number(result?.koRows) || 0;
    const errorsFound = Number(result?.errorsFound) || 0;
    const warningsFound = Number(result?.warningsFound) || 0;
    const booksLabel = bookRows.length
        ? bookRows.map((item) => escapeHtml(String(item?.file || ''))).join(', ')
        : escapeHtml(String(result?.file || ''));

    meta.textContent = `Alcance: ${getRecomputeScopeLabel(scope)} · Libros: ${booksProcessed} · Registros: ${recordsProcessed}`;
    body.innerHTML = `
        <div style="display:grid;gap:1rem;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.75rem;">
                <div><strong>Libros procesados</strong><div>${booksProcessed}</div></div>
                <div><strong>Registros procesados</strong><div>${recordsProcessed}</div></div>
                <div><strong>Registros con errores</strong><div>${recordsWithErrors}</div></div>
                <div><strong>Errores encontrados</strong><div>${errorsFound}</div></div>
                <div><strong>Warnings encontrados</strong><div>${warningsFound}</div></div>
            </div>
            <div><strong>Libros procesados</strong><div style="margin-top:0.3rem;color:#475569;">${booksLabel || '—'}</div></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem;align-items:start;">
                <div>
                    <strong>Total errores por tipo</strong>
                    <div style="margin-top:0.45rem;">${buildRecomputeErrorTypeList(result?.errorTypeCounts || {}, 'No hay errores acumulados.')}</div>
                </div>
                <div>
                    <strong>Top 10 leyes/reglas</strong>
                    <div style="margin-top:0.45rem;">${buildRecomputeTopRulesList(result?.ruleSummary)}</div>
                </div>
            </div>
        </div>
    `;
    panel.hidden = false;
}

function logRecomputeErrorsSummary(result, context = {}) {
    const scope = String(context.scope || result?.scope || '').trim() || 'book';
    const elapsedMs = Number(context.elapsedMs) || 0;
    const books = Array.isArray(result?.books)
        ? result.books.map((item) => String(item?.file || '').trim()).filter(Boolean)
        : [String(result?.file || '').trim()].filter(Boolean);

    console.groupCollapsed('[MILU][recomputeModal][errors]');
    console.log('scope usado:', scope);
    console.log('libros procesados:', books);
    console.log('registros procesados:', Number(result?.scanned) || 0);
    console.log('errores encontrados:', Number(result?.errorsFound) || 0);
    console.log('warnings encontrados:', Number(result?.warningsFound) || 0);
    console.log('tiempo total:', `${elapsedMs.toFixed(1)} ms`);
    console.log('top reglas:', Array.isArray(result?.ruleSummary) ? result.ruleSummary.slice(0, 10) : []);
    console.groupEnd();
}

function initRecomputeModal() {

    const quickRecomputeBtn = $('recalculateRecordBtn');

    const recomputeAllBtn = $('recomputeAllBtn');

    const modal = $('recomputeModal');

    const closeBtn = $('recomputeModalClose');
    const recomputeBookSelect = getRecomputeBookSelect();

    const backdrop = modal?.querySelector('.recompute-modal-backdrop');

    const recomputeRunBtn = $('recomputeRunBtn');

    const recomputePdfRunBtn = $('recomputePdfRunBtn');
    const recomputeCopyCurrentBtn = $('recomputeCopyCurrentBtn');
    const recomputeErrorsCurrentBtn = $('recomputeErrorsCurrentBtn');
    const recomputeCopyBookBtn = $('recomputeCopyBookBtn');



    if (!(modal instanceof HTMLElement)) return;



    const allowRecompute = isBackendEndpointAllowed('recompute-qa-errors');



    if (quickRecomputeBtn instanceof HTMLButtonElement) {

        quickRecomputeBtn.disabled = !allowRecompute;

        quickRecomputeBtn.title = allowRecompute ? '' : 'Disponible solo en local (localhost:3000).';

    }
    if (recomputeAllBtn instanceof HTMLButtonElement) {

        recomputeAllBtn.disabled = !allowRecompute;

        recomputeAllBtn.title = allowRecompute ? '' : 'Disponible solo en local (localhost:3000).';

    }



    syncRecomputeBookSelect();

    const recomputeIdInput = $('recomputeIdInput');

    if (recomputeIdInput instanceof HTMLInputElement) {
        recomputeIdInput.placeholder = 'ID puntual';
    }
    if (recomputeBookSelect instanceof HTMLSelectElement && !(recomputeBookSelect.value || '').trim()) {
        const engineFilterSelect = $('engineFilterSelect');
        if (engineFilterSelect instanceof HTMLSelectElement) {
            const selectedMainModel = String(engineFilterSelect.value || '').trim();
            recomputeBookSelect.value = selectedMainModel || RECOMPUTE_ALL_BOOKS_VALUE;
        }
    }



    const closeModal = () => {

        modal.hidden = true;
        clearRecomputeErrorsSummary();

    };



    if (recomputeRunBtn instanceof HTMLButtonElement) {

        recomputeRunBtn.disabled = !allowRecompute;

        recomputeRunBtn.title = allowRecompute ? '' : 'Disponible solo en local (localhost:3000).';

    }



    if (recomputePdfRunBtn instanceof HTMLButtonElement) {

        recomputePdfRunBtn.disabled = !allowRecompute || !PDF_FEATURE_AUTO_PDF_ENABLED;

        recomputePdfRunBtn.title = !PDF_FEATURE_AUTO_PDF_ENABLED
            ? 'Auto-PDF desactivado'
            : (allowRecompute ? '' : 'Disponible solo en local (localhost:3000).');

    }

    if (recomputeCopyCurrentBtn instanceof HTMLButtonElement) {
        recomputeCopyCurrentBtn.disabled = !PDF_FEATURE_AUTO_PDF_ENABLED;
        recomputeCopyCurrentBtn.title = PDF_FEATURE_AUTO_PDF_ENABLED
            ? 'Copiar lectura del PDF actual a campos _pdf'
            : 'Auto-PDF desactivado';
    }

    if (recomputeErrorsCurrentBtn instanceof HTMLButtonElement) {
        recomputeErrorsCurrentBtn.disabled = !allowRecompute;
        recomputeErrorsCurrentBtn.textContent = QUICK_ERRORS_RECALC_SCOPE === 'all'
            ? '2) Recalcular errores de TODO el libro'
            : '2) Recalcular errores del registro actual';
        recomputeErrorsCurrentBtn.title = allowRecompute
            ? (QUICK_ERRORS_RECALC_SCOPE === 'all'
                ? 'Recalcular campos _error para todos los registros del libro'
                : 'Recalcular campos _error del registro actual')
            : 'Disponible solo en local (localhost:3000).';
    }

    if (recomputeCopyBookBtn instanceof HTMLButtonElement) {
        const allowPdfBook = allowRecompute && PDF_FEATURE_AUTO_PDF_ENABLED;
        recomputeCopyBookBtn.disabled = !allowPdfBook;
        recomputeCopyBookBtn.title = !PDF_FEATURE_AUTO_PDF_ENABLED
            ? 'Auto-PDF desactivado'
            : (allowRecompute
                ? 'Aplicar lectura PDF (copy-pdf-to-pdf-all-books) a todos los registros del libro seleccionado'
                : 'Disponible solo en local (localhost:3000).');
    }

    setRecomputeStatus(

        allowRecompute

            ? 'Listo para ejecutar.'

            : getLocalOnlyBackendMessage('recompute-qa-errors'),

        allowRecompute ? '' : 'error'

    );



    if (!recomputeModalListenersBound) {
        closeBtn?.addEventListener('click', closeModal);
        backdrop?.addEventListener('click', closeModal);
        recomputeBookSelect?.addEventListener('change', () => {
            const engineFilterSelect = $('engineFilterSelect');
            if (engineFilterSelect instanceof HTMLSelectElement && recomputeBookSelect instanceof HTMLSelectElement) {
                const selectedValue = String(recomputeBookSelect.value || '').trim();
                if (selectedValue && selectedValue !== RECOMPUTE_ALL_BOOKS_VALUE) {
                    engineFilterSelect.value = selectedValue;
                }
            }
            updateRecomputeModalTitle();
        });

        document.addEventListener('keydown', (event) => {
            if (!modal.hidden && event.key === 'Escape') closeModal();
        });
        recomputeModalListenersBound = true;
    }

}



const hermanosProgressUiState = {

    running: false,

    cancelRequested: false,

    bulkInFlight: false,

    maxLogItems: 80

};



function setHermanosCancelButtonState({ disabled, label, title = '' } = {}) {

    const cancelBtn = $('hermanosProgressCancelBtn');

    if (!(cancelBtn instanceof HTMLButtonElement)) return;

    if (typeof disabled === 'boolean') cancelBtn.disabled = disabled;

    if (typeof label === 'string' && label.length > 0) cancelBtn.textContent = label;

    cancelBtn.title = title;

}



function initHermanosProgressModal() {

    const modal = $('hermanosProgressModal');

    const closeBtn = $('hermanosProgressCloseBtn');

    const cancelBtn = $('hermanosProgressCancelBtn');

    const backdrop = modal?.querySelector('.hermanos-progress-backdrop');



    if (!(modal instanceof HTMLElement)) return;



    const closeModal = () => {

        if (hermanosProgressUiState.running) return;

        modal.hidden = true;

    };



    closeBtn?.addEventListener('click', closeModal);

    backdrop?.addEventListener('click', closeModal);

    cancelBtn?.addEventListener('click', () => {

        if (!hermanosProgressUiState.running) return;

        if (hermanosProgressUiState.bulkInFlight) {

            appendHermanosProgressLog('Cancelación temporalmente deshabilitada durante la fase bulk en servidor.', 'error');

            return;

        }

        if (hermanosProgressUiState.cancelRequested) return;

        hermanosProgressUiState.cancelRequested = true;

        setHermanosCancelButtonState({ disabled: true, label: 'Cancelando...' });

        appendHermanosProgressLog('Cancelación solicitada por usuario. Finalizando tareas en curso...', 'error');

    });



    document.addEventListener('keydown', (event) => {

        if (!modal.hidden && event.key === 'Escape') closeModal();

    });

}



function openHermanosProgressModal() {

    const modal = $('hermanosProgressModal');

    const closeBtn = $('hermanosProgressCloseBtn');

    if (modal instanceof HTMLElement) modal.hidden = false;

    if (closeBtn instanceof HTMLButtonElement) closeBtn.disabled = true;

    setHermanosCancelButtonState({ disabled: false, label: 'Cancelar proceso', title: '' });

    hermanosProgressUiState.running = true;

    hermanosProgressUiState.cancelRequested = false;

    hermanosProgressUiState.bulkInFlight = false;

}



function closeHermanosProgressModal() {

    const modal = $('hermanosProgressModal');

    if (modal instanceof HTMLElement) modal.hidden = true;

}



function finishHermanosProgressModal() {

    const closeBtn = $('hermanosProgressCloseBtn');

    if (closeBtn instanceof HTMLButtonElement) closeBtn.disabled = false;

    setHermanosCancelButtonState({ disabled: true, label: 'Cancelar proceso', title: '' });

    hermanosProgressUiState.running = false;

    hermanosProgressUiState.bulkInFlight = false;

}



function resetHermanosProgressLog() {

    const log = $('hermanosProgressLog');

    if (log instanceof HTMLElement) log.innerHTML = '';

}



function appendHermanosProgressLog(message, status = '') {

    const log = $('hermanosProgressLog');

    if (!(log instanceof HTMLElement)) return;



    const line = document.createElement('div');

    line.className = `hermanos-progress-log-item${status ? ` is-${status}` : ''}`;

    line.textContent = message;

    log.appendChild(line);



    while (log.childElementCount > hermanosProgressUiState.maxLogItems) {

        log.removeChild(log.firstElementChild);

    }



    log.scrollTop = log.scrollHeight;

}



function renderHermanosProgress(state) {

    const {

        currentLabel = 'Iniciando...',

        processedPn = 0,

        totalPn = 0,

        scannedRows = 0,

        propagatedRows = 0,

        pnsWithPropagation = 0

    } = state || {};



    const percent = totalPn > 0

        ? Math.max(0, Math.min(100, Math.round((processedPn / totalPn) * 100)))

        : 0;



    const bar = $('hermanosProgressBar');

    const track = $('hermanosProgressModal')?.querySelector('.hermanos-progress-track');

    const current = $('hermanosProgressCurrent');

    const percentEl = $('hermanosProgressPercent');

    const stats = $('hermanosProgressStats');



    if (bar instanceof HTMLElement) bar.style.width = `${percent}%`;

    if (track instanceof HTMLElement) track.setAttribute('aria-valuenow', String(percent));

    if (current instanceof HTMLElement) current.textContent = currentLabel;

    if (percentEl instanceof HTMLElement) percentEl.textContent = `${percent}%`;

    if (stats instanceof HTMLElement) {

        stats.textContent = `Filas OK+Importar: ${scannedRows} · PN únicos: ${totalPn} · PN procesados: ${processedPn} · PN con cambios: ${pnsWithPropagation} · Hermanos actualizados: ${propagatedRows}`;

    }

}



function initEditRecordModal() {

    const modal = $('editRecordModal');

    const closeBtn = $('editRecordModalClose');

    const backdrop = modal?.querySelector('.edit-record-modal-backdrop');

    const form = $('editRecordForm');

    const resetBtn = $('editRecordResetBtn');



    if (!(modal instanceof HTMLElement)) return;



    const closeModal = () => {

        modal.hidden = true;

    };



    closeBtn?.addEventListener('click', closeModal);

    backdrop?.addEventListener('click', closeModal);



    document.addEventListener('keydown', (event) => {

        if (!modal.hidden && event.key === 'Escape') closeModal();

    });



    resetBtn?.addEventListener('click', (event) => {

        event.preventDefault();

        if (currentRow) populateEditRecordForm(currentRow);

    });



    form?.addEventListener('submit', async (event) => {

        event.preventDefault();

        await saveEditRecordForm();

    });

}



function openEditRecordModalForRow(row = currentRow) {

    if (!row || typeof row !== 'object') return;



    const sharedPayload = {

        id: String(row?.ID ?? '').trim(),

        engineModel: String(row?.engine_model ?? '').trim(),

        engineFile: resolveEngineFile(row),

        record: String(row?.pn_final ?? row?.['PART NO.'] ?? '').trim(),

        source_file: String(row?.source_file ?? '').trim(),

        source_page: String(row?.['Source Page'] ?? '').trim(),

        pos: String(row?.POS ?? '').trim(),

        pos_final: String(row?.pos_final ?? '').trim(),

        part_no: String(row?.['PART NO.'] ?? row?.pn ?? '').trim(),

        pn_final: String(row?.pn_final ?? '').trim(),

        designation_final: String(row?.designation_final ?? '').trim(),

        model_type_final: String(row?.model_type_final ?? '').trim(),

        qty: String(row?.QTY ?? row?.qty ?? '').trim(),

        units: String(row?.Units ?? row?.units ?? '').trim(),

        fn: String(row?.FN ?? row?.fn ?? '').trim(),

        weight_final: String(row?.weight_final ?? '').trim(),

        measurement_final: String(row?.measure_final ?? row?.measurement_final ?? '').trim(),

        norma: String(row?.norma ?? '').trim(),

        gesa: String(row?.gesa ?? '').trim(),

        normalizado: String(row?.normalizado ?? '').trim(),

        sust_hierarchie: String(row?.sust_hierarchie ?? '').trim(),

        has_img: String(row?.has_img ?? '').trim(),

        en_web: String(row?.en_web ?? '').trim(),

        qa_revision_estado: normalizeEstadoToNew(row?.qa_revision_estado),

        qa_revision_accion: normalizeAccionToNew(row?.qa_revision_accion)

    };



    const parentBridge = window.parent && window.parent !== window

        ? window.parent.miluShellOpenSharedRecordEditor

        : null;

    const topBridge = window.top && window.top !== window

        ? window.top.miluShellOpenSharedRecordEditor

        : null;

    const sharedShellBridge = typeof parentBridge === 'function'

        ? parentBridge

        : (typeof topBridge === 'function' ? topBridge : null);

    if (typeof sharedShellBridge === 'function') {

        const openedShared = sharedShellBridge(sharedPayload);

        if (openedShared !== false) return;

    }



    const parentPdfBridge = window.parent && window.parent !== window

        ? window.parent.miluShellOpenPdfRecordModal

        : null;

    const topPdfBridge = window.top && window.top !== window

        ? window.top.miluShellOpenPdfRecordModal

        : null;

    const shellBridge = typeof parentPdfBridge === 'function'

        ? parentPdfBridge

        : (typeof topPdfBridge === 'function' ? topPdfBridge : null);

    if (typeof shellBridge === 'function') {

        const openedInPdfView = shellBridge({

            engine: String(row?.engine_model ?? '').trim(),

            record: String(row?.pn_final ?? row?.['PART NO.'] ?? '').trim(),

            id: String(row?.ID ?? '').trim()

        });

        if (openedInPdfView !== false) return;

    }



    if (window.top === window) {

        try {

            sessionStorage.setItem('milu:pending-shared-editor-payload', JSON.stringify(sharedPayload));

            const shellUrl = new URL('milu_shell.html', window.location.href);

            shellUrl.searchParams.set('view', 'analisis');

            if (sharedPayload.engineModel) shellUrl.searchParams.set('engine', sharedPayload.engineModel);

            if (sharedPayload.id) shellUrl.searchParams.set('id', sharedPayload.id);

            if (sharedPayload.record) shellUrl.searchParams.set('record', sharedPayload.record);

            window.location.href = shellUrl.toString();

            return;

        } catch (error) {

            console.warn('No se pudo abrir shell para modal compartido:', error);

        }

    }



    // Fallback local si no hay shell/bridge disponible.

    populateEditRecordForm(row);

    setEditRecordStatus('', '');



    const modal = $('editRecordModal');

    if (!(modal instanceof HTMLElement)) return;



    modal.hidden = false;

    $('editRecordPnFinal')?.focus();

}



function openExportRecordModalForRow(row = currentRow) {

    if (!row || typeof row !== 'object') return;



    const shellBridge = window.parent && window.parent !== window

        ? window.parent.miluShellOpenPdfRecordModal

        : null;

    if (typeof shellBridge === 'function') {

        const openedInPdfView = shellBridge({

            mode: 'export',

            engine: String(row?.engine_model ?? '').trim(),

            record: String(row?.pn_final ?? row?.['PART NO.'] ?? '').trim(),

            id: String(row?.ID ?? '').trim()

        });

        if (openedInPdfView !== false) return;

    }



    openEditRecordModalForRow(row);

}



function notifyPdfDataChangedFromAnalista(row = currentRow) {

    if (!SHELL_NOTIFY_ON_PDF_DATA_CHANGE) return;

    const shellBridge = window.parent && window.parent !== window

        ? window.parent.miluShellNotifyPdfDataChanged

        : null;

    if (typeof shellBridge !== 'function') return;



    shellBridge({

        engine: String(row?.engine_model ?? '').trim(),

        id: String(row?.ID ?? '').trim(),

        record: String(row?.pn_final ?? row?.['PART NO.'] ?? '').trim()

    });

}



function populateEditRecordForm(row) {

    if (!row || typeof row !== 'object') return;



    const id = String(row?.ID ?? row?.id ?? '').trim();

    if (id) {

        $('editRecordId').value = id;

        const displayInput = $('editRecordIdDisplay');

        if (displayInput instanceof HTMLInputElement) {

            displayInput.value = id;

        }

    }

    const assignInputValue = (inputId, value) => {

        const input = $(inputId);

        if (input instanceof HTMLInputElement) {

            input.value = String(value ?? '');

        }

    };

    assignInputValue('editRecordPosExcel', row?.pos_excel);

    assignInputValue('editRecordPnExcel', row?.pn_excel);

    assignInputValue('editRecordPnFinal', row?.pn_final);

    assignInputValue('editRecordDesignationFinal', row?.designation_final);

    assignInputValue('editRecordWeightFinal', row?.weight_final);

    assignInputValue('editRecordMeasurementFinal', row?.measure_final ?? row?.measurement_final);

    assignInputValue('editRecordNorma', row?.norma);

    const statusSelect = $('editRecordStatus');

    if (statusSelect instanceof HTMLSelectElement) {

        statusSelect.value = normalizeEstadoToNew(row?.qa_revision_estado);

    }

    const actionSelect = $('editRecordAction');

    if (actionSelect instanceof HTMLSelectElement) {

        const nextAction = normalizeAccionToNew(row?.qa_revision_accion);

        actionSelect.value = nextAction || (normalizeEstadoToNew(row?.qa_revision_estado) === 'ok' ? 'importar' : 'revisar');

    }

}



async function saveEditRecordForm() {

    try {

        const id = String($('editRecordId')?.value || '').trim();

        if (!id) {

            setEditRecordStatus('ID no válido.', 'error');

            return;

        }



        if (!currentRow) {

            setEditRecordStatus('No hay registro cargado.', 'error');

            return;

        }



        const engineFile = resolveEngineFile(currentRow);

        if (!engineFile) {

            setEditRecordStatus('No se pudo resolver archivo engine.', 'error');

            return;

        }



        const updates = {

            pos_excel: String($('editRecordPosExcel')?.value || '').trim(),

            pn_excel: String($('editRecordPnExcel')?.value || '').trim(),

            pn_final: String($('editRecordPnFinal')?.value || '').trim(),

            designation_final: String($('editRecordDesignationFinal')?.value || '').trim(),

            weight_final: String($('editRecordWeightFinal')?.value || '').trim(),

            measure_final: String($('editRecordMeasurementFinal')?.value || '').trim(),

            norma: String($('editRecordNorma')?.value || '').trim(),

            qa_revision_estado: normalizeEstadoToNew($('editRecordStatus')?.value || 'pendiente'),

            qa_revision_accion: normalizeAccionToNew($('editRecordAction')?.value || currentRow?.qa_revision_accion || 'revisar')

        };



        let saved = false;

        const changedFields = new Set();



        // Guardar cada campo que cambió (incluso si es vacío)

        for (const [key, value] of Object.entries(updates)) {

            if (currentRow[key] !== value) {

                await saveCellToServer(engineFile, id, key, value);

                currentRow[key] = value;

                saved = true;

                changedFields.add(key);

            }

        }



        if (saved) {

            if (changedFields.has('qa_revision_estado') || changedFields.has('qa_revision_accion')) {

                publishRevisionSync({

                    id,

                    engineFile,

                    estado: currentRow?.qa_revision_estado,

                    accion: currentRow?.qa_revision_accion,

                    source: 'analista-02'

                });

            }



            setEditRecordStatus('Registro guardado correctamente.', 'ok');



            notifyPdfDataChangedFromAnalista(currentRow);



            // Cerrar modal después de 800ms

            setTimeout(() => {

                const modal = $('editRecordModal');

                if (modal instanceof HTMLElement) modal.hidden = true;



                // Recargar UI completa

                renderComparison();

                renderRecordMeta();

                renderReviewStateButtons(currentRow);

                renderReviewStats();

            }, 800);

        } else {

            setEditRecordStatus('Sin cambios para guardar.', '');

        }



    } catch (error) {

        setEditRecordStatus(`Error: ${error.message}`, 'error');

        console.error(error);

    }

}



function setEditRecordStatus(message, type = '') {

    const statusEl = $('editRecordStatusMessage');

    if (!(statusEl instanceof HTMLElement)) return;



    statusEl.textContent = message;

    statusEl.className = 'edit-record-status';

    if (type) statusEl.classList.add(`is-${type}`);

}



function isEditableComparisonField(fieldName) {

    const field = String(fieldName ?? '').trim().toUpperCase();

    return field === 'PART NO.'

        || field === 'DESIGNATION'

        || field === 'WEIGHT'

        || field === 'MEASUREMENT / STANDARD'

        || field === 'NORMA';

}



function initComparisonEditTriggers() {

    // Requerimiento UI: desactivar todos los doble click sobre celdas de la tabla.
    return;

}



async function copyPdfToFinalGeneric(pdfKey, finalKey, fieldLabel) {

    if (!currentRow || isApplyingPdfGeneric) return;



    const engineFile = resolveEngineFile(currentRow);

    const id = txt(currentRow?.ID, '');

    if (!engineFile || !id) {

        alert(`No se pudo resolver archivo engine o ID para aplicar ${fieldLabel} desde PDF.`);

        return;

    }



    const pdfValue = normalizeString(String(currentRow?.[pdfKey] ?? '').trim());

    if (!pdfValue) {

        setRecomputeStatus(`No hay valor PDF en ${fieldLabel} para copiar.`, 'error');

        return;

    }



    const currentFinalValue = normalizeString(String(currentRow?.[finalKey] ?? '').trim());

    const changed = normalizeCompareValue(pdfValue) !== normalizeCompareValue(currentFinalValue);



    isApplyingPdfGeneric = true;

    try {

        setRecomputeStatus(`Aplicando ${fieldLabel} PDF en ID ${id}...`, '');



        if (changed) {

            await saveCellToServer(engineFile, id, finalKey, pdfValue);

            currentRow[finalKey] = pdfValue;

        }



        await reloadEditedRecord(engineFile, id);

        renderReviewStateButtons(currentRow);

        renderReviewStats();

        notifyPdfDataChangedFromAnalista(currentRow);



        const actionLabel = changed ? 'copiado a FINAL' : 'ya coincide con FINAL';

        setRecomputeStatus(`Registro ID ${id}: ${fieldLabel} ${actionLabel}.`, 'ok');

    } catch (error) {

        setRecomputeStatus(`Error aplicando ${fieldLabel} desde PDF: ${String(error?.message || error)}`, 'error');

    } finally {

        isApplyingPdfGeneric = false;

    }

}

async function copyCurrentPdfFieldsToFinal() {

    if (!currentRow || isApplyingPdfCurrentRowToFinal) return;

    const engineFile = resolveEngineFile(currentRow);
    const id = txt(currentRow?.ID, '');

    if (!engineFile || !id) {
        alert('No se pudo resolver archivo engine o ID para copiar campos PDF a FINAL.');
        return;
    }

    const isGesaSi = normalizeString(String(currentRow?.gesa ?? '')).toUpperCase() === 'SI';

    const valuesToApply = PDF_TO_FINAL_FIELD_MAPPINGS
        .map(({ pdfKey, finalKey, label }) => {
            const gesaKey = GESA_TO_FINAL_FIELD_MAPPINGS.get(finalKey);
            const gesaValue = finalKey === 'weight_final'
                ? normalizeString(getGesaWeightWithUnits(currentRow))
                : (gesaKey
                    ? normalizeString(String(currentRow?.[gesaKey] ?? '').trim())
                    : '');
            const pdfValue = normalizeString(String(currentRow?.[pdfKey] ?? '').trim());
            const resolvedValue = (isGesaSi && gesaKey)
                ? gesaValue
                : pdfValue;

            if (isGesaSi && gesaKey && !resolvedValue) {
                return null;
            }

            const finalValue = normalizeString(String(currentRow?.[finalKey] ?? '').trim());
            if (normalizeCompareValue(resolvedValue) === normalizeCompareValue(finalValue)) return null;

            return {
                finalKey,
                label,
                value: resolvedValue,
                source: isGesaSi && gesaKey ? 'GESA' : 'PDF'
            };
        })
        .filter(Boolean);

    if (!valuesToApply.length) {
        setRecomputeStatus(`Registro ID ${id}: no hay cambios PDF pendientes para FINAL.`, 'ok');
        return;
    }

    isApplyingPdfCurrentRowToFinal = true;

    try {
        const sources = [...new Set(valuesToApply.map(({ source }) => source))].join('/');
        setRecomputeStatus(`Copiando ${valuesToApply.length} campos ${sources} a FINAL en ID ${id}...`, '');

        for (const { finalKey, value } of valuesToApply) {
            await saveCellToServer(engineFile, id, finalKey, value);
            currentRow[finalKey] = value;
        }

        await reloadEditedRecord(engineFile, id);
        renderReviewStateButtons(currentRow);
        renderReviewStats();
        notifyPdfDataChangedFromAnalista(currentRow);

        const labelsBySource = valuesToApply.reduce((acc, item) => {
            if (!acc[item.source]) acc[item.source] = [];
            acc[item.source].push(item.label);
            return acc;
        }, {});
        const sourceSummary = Object.entries(labelsBySource)
            .map(([source, labels]) => `${source}: ${labels.join(', ')}`)
            .join(' | ');

        setRecomputeStatus(`Registro ID ${id}: ${valuesToApply.length} campos copiados a FINAL (${sourceSummary}).`, 'ok');
    } catch (error) {
        setRecomputeStatus(`Error copiando PDF a FINAL: ${String(error?.message || error)}`, 'error');
    } finally {
        isApplyingPdfCurrentRowToFinal = false;
    }

}



async function copyPdfAutoDesignationToFinalAndRecompute() {

    if (!currentRow || isApplyingPdfAutoDesignation) return;



    const engineFile = resolveEngineFile(currentRow);

    const id = txt(currentRow?.ID, '');

    if (!engineFile || !id) {

        alert('No se pudo resolver archivo engine o ID para aplicar DESIGNATION desde PDF_AUTO.');

        return;

    }



    const pdfAutoDesignation = normalizeString(getStoredPdfAutoValue(currentRow, 'DESIGNATION'));

    if (!pdfAutoDesignation) {

        setRecomputeStatus('No hay valor PDF_AUTO en DESIGNATION para copiar.', 'error');

        return;

    }



    const currentFinalDesignation = normalizeString(currentRow?.designation_final);

    const changed = normalizeCompareValue(pdfAutoDesignation) !== normalizeCompareValue(currentFinalDesignation);



    isApplyingPdfAutoDesignation = true;

    try {

        setRecomputeStatus(`Aplicando DESIGNATION PDF_AUTO en ID ${id} y recalculando...`, '');



        if (changed) {

            await saveCellToServer(engineFile, id, 'designation_final', pdfAutoDesignation);

            currentRow.designation_final = pdfAutoDesignation;



            const editDesignationInput = $('editDesignationFinal');

            if (editDesignationInput instanceof HTMLInputElement) {

                editDesignationInput.value = pdfAutoDesignation;

            }

        }



        await autoRecomputeEditedRecord(engineFile, id);

        await reloadEditedRecord(engineFile, id);

        renderReviewStateButtons(currentRow);

        renderReviewStats();

        notifyPdfDataChangedFromAnalista(currentRow);



        const actionLabel = changed ? 'copiado a FINAL' : 'ya coincide con FINAL';

        setRecomputeStatus(`Registro ID ${id}: ${actionLabel}. Recalculo completo aplicado.`, 'ok');

    } catch (error) {

        setRecomputeStatus(`Error aplicando DESIGNATION desde PDF_AUTO: ${String(error?.message || error)}`, 'error');

    } finally {

        isApplyingPdfAutoDesignation = false;

    }

}



async function copyPdfAutoPnToFinalAndRecompute() {

    if (!currentRow || isApplyingPdfAutoPn) return;



    const engineFile = resolveEngineFile(currentRow);

    const id = txt(currentRow?.ID, '');

    if (!engineFile || !id) {

        alert('No se pudo resolver archivo engine o ID para aplicar PART NO. desde PDF_AUTO.');

        return;

    }



    const pdfAutoPn = normalizeString(getStoredPdfAutoValue(currentRow, 'PART NO.'));

    if (!pdfAutoPn) {

        setRecomputeStatus('No hay valor PDF_AUTO en PART NO. para copiar.', 'error');

        return;

    }



    const currentPnFinal = normalizeString(currentRow?.pn_final);

    const changed = normalizeCompareValue(pdfAutoPn) !== normalizeCompareValue(currentPnFinal);



    isApplyingPdfAutoPn = true;

    try {

        setRecomputeStatus(`Aplicando PART NO. PDF_AUTO en ID ${id} y recalculando...`, '');



        if (changed) {

            await saveCellToServer(engineFile, id, 'pn_final', pdfAutoPn);

            currentRow.pn_final = pdfAutoPn;



            const editPnInput = $('editRecordPnFinal');

            if (editPnInput instanceof HTMLInputElement) {

                editPnInput.value = pdfAutoPn;

            }

        }



        await autoRecomputeEditedRecord(engineFile, id);

        await reloadEditedRecord(engineFile, id);

        renderReviewStateButtons(currentRow);

        renderReviewStats();

        notifyPdfDataChangedFromAnalista(currentRow);



        const actionLabel = changed ? 'copiado a FINAL' : 'ya coincide con FINAL';

        setRecomputeStatus(`Registro ID ${id}: PART NO. ${actionLabel}. Recalculo completo aplicado.`, 'ok');

    } catch (error) {

        setRecomputeStatus(`Error aplicando PART NO. desde PDF_AUTO: ${String(error?.message || error)}`, 'error');

    } finally {

        isApplyingPdfAutoPn = false;

    }

}



async function copyPdfAutoPosToFinalAndRecompute() {

    if (!currentRow || isApplyingPdfAutoPos) return;



    const engineFile = resolveEngineFile(currentRow);

    const id = txt(currentRow?.ID, '');

    if (!engineFile || !id) {

        alert('No se pudo resolver archivo engine o ID para aplicar POS desde PDF_AUTO.');

        return;

    }



    const pdfAutoPos = normalizeString(getStoredPdfAutoValue(currentRow, 'POS'));

    if (!pdfAutoPos) {

        setRecomputeStatus('No hay valor PDF_AUTO en POS para copiar.', 'error');

        return;

    }



    const currentPosFinal = normalizeString(currentRow?.pos_final);

    const changed = normalizeCompareValue(pdfAutoPos) !== normalizeCompareValue(currentPosFinal);



    isApplyingPdfAutoPos = true;

    try {

        setRecomputeStatus(`Aplicando POS PDF_AUTO en ID ${id} y recalculando...`, '');



        if (changed) {

            await saveCellToServer(engineFile, id, 'pos_final', pdfAutoPos);

            currentRow.pos_final = pdfAutoPos;

        }



        await autoRecomputeEditedRecord(engineFile, id);

        await reloadEditedRecord(engineFile, id);

        renderReviewStateButtons(currentRow);

        renderReviewStats();

        notifyPdfDataChangedFromAnalista(currentRow);



        const actionLabel = changed ? 'copiado a FINAL' : 'ya coincide con FINAL';

        setRecomputeStatus(`Registro ID ${id}: POS ${actionLabel}. Recalculo completo aplicado.`, 'ok');

    } catch (error) {

        setRecomputeStatus(`Error aplicando POS desde PDF_AUTO: ${String(error?.message || error)}`, 'error');

    } finally {

        isApplyingPdfAutoPos = false;

    }

}


async function copyPdfReadValuesForRow(row, options = {}) {

    const silent = options?.silent !== false;
    const reloadAfterSave = options?.reloadAfterSave !== false;
    const clearPdfBeforeCopy = options?.clearPdfBeforeCopy === true;
    const caller = String(options?.caller || 'copyPdfReadValuesForRow').trim();
    const endpoint = String(options?.endpoint || 'frontend/local').trim();

    if (!PDF_FEATURE_AUTO_PDF_ENABLED) {
        return { ok: false, reason: 'feature-disabled', changedFields: [], valuesToCopy: {} };
    }

    if (!row) {
        return { ok: false, reason: 'missing-row', changedFields: [], valuesToCopy: {} };
    }

    const engineFile = resolveEngineFile(row);
    const id = txt(row?.ID, '');
    if (!engineFile || !id) {
        return { ok: false, reason: 'missing-engine-or-id', changedFields: [], valuesToCopy: {} };
    }

    const { textItems, viewport } = getPdfLastPageData();
    if (!Array.isArray(textItems) || !textItems.length || !viewport) {
        return { ok: false, reason: 'missing-pdf-page', changedFields: [], valuesToCopy: {} };
    }

    const headerColumnBodyDebug = getPdfHeaderColumnBodyDebug();
    const markedRow = findMarkedPdfRowForCurrentRow(headerColumnBodyDebug, row);
    if (!markedRow) {
        return { ok: false, reason: 'missing-marked-row', changedFields: [], valuesToCopy: {} };
    }

    const valuesToCopy = buildMarkedRowValuesFromGroup(markedRow);
    console.info(`[pdf-copy] fn=copyPdfReadValuesForRow caller=${caller} endpoint=${endpoint} file=${engineFile || '-'} book=${txt(row?.engine_model, '') || '-'} id=${id || '-'} phase=start`);

    try {
        const topDetection = await detectTopBomAndFgInPdf(row);
        const topEntries = Array.isArray(topDetection?.entries) ? topDetection.entries : [];
        const detectedFg = topEntries.find((entry) => String(entry?.key || '').trim() === 'fg_fgs');
        const detectedBom = topEntries.find((entry) => String(entry?.key || '').trim() === 'bom');

        const fgValue = normalizeString(detectedFg?.value);
        const bomValue = normalizeString(detectedBom?.value);

        if (fgValue) valuesToCopy.fg_fgs_pdf = fgValue;
        if (bomValue) valuesToCopy.bom_pdf = bomValue;
    } catch (error) {
        console.warn('No se pudo detectar FG/FGS + BOM superior durante la copia de lectura PDF:', error);
    }

    const readSummaryMessage = buildPdfReadSummary(valuesToCopy);
    const changedFields = [];
    const changedFieldSet = new Set();

    if (clearPdfBeforeCopy) {
        const pdfFieldsToClear = Object.keys(row || {}).filter((key) => String(key).endsWith('_pdf'));
        for (const field of pdfFieldsToClear) {
            if (String(row?.[field] ?? '') === '') continue;
            try {
                await saveCellToServer(engineFile, id, field, '');
                row[field] = '';
                changedFieldSet.add(field);
            } catch (error) {
                console.error(`Error limpiando ${field} en JSON:`, error);
            }
        }
    }

    for (const [field, value] of Object.entries(valuesToCopy)) {
        if (!value) continue;
        if (String(row?.[field] ?? '') === String(value ?? '')) continue;

        try {
            await saveCellToServer(engineFile, id, field, value);
            row[field] = value;
            changedFieldSet.add(field);
        } catch (error) {
            console.error(`Error guardando ${field} en JSON:`, error);
        }
    }

    if (changedFieldSet.has('norma_pdf') && String(row?.normalizado_pdf ?? '') !== 'SI') {
        try {
            await saveCellToServer(engineFile, id, 'normalizado_pdf', 'SI');
            row['normalizado_pdf'] = 'SI';
            changedFieldSet.add('normalizado_pdf');
        } catch (error) {
            console.error('Error guardando normalizado_pdf en JSON:', error);
        }
    }

    changedFields.push(...changedFieldSet);

    if (reloadAfterSave && changedFields.length > 0) {
        await reloadEditedRecord(engineFile, id);
        renderReviewStats();
        notifyPdfDataChangedFromAnalista(row);
    }

    if (!silent && !changedFields.length) {
        alert(`${readSummaryMessage}\n\nLos campos _pdf ya estaban sincronizados con la lectura del PDF.`);
    }

    if (!silent && changedFields.length > 0) {
        alert(`${readSummaryMessage}\n\nCopiados ${changedFields.length} campos _pdf desde la fila del PDF.`);
    }

    console.info(`[pdf-copy] fn=copyPdfReadValuesForRow caller=${caller} endpoint=${endpoint} file=${engineFile || '-'} book=${txt(row?.engine_model, '') || '-'} id=${id || '-'} changedFields=${changedFields.length}`);

    return {
        ok: true,
        reason: changedFields.length > 0 ? 'updated' : 'already-synced',
        changedFields,
        valuesToCopy,
        readSummaryMessage
    };

}


async function copyPdfReadValuesToPdfFields() {

    if (!currentRow) {
        alert('Primero debes cargar un registro.');
        return;
    }

    const result = await copyPdfReadValuesForRow(currentRow, {
        silent: false,
        reloadAfterSave: true,
        clearPdfBeforeCopy: true,
        caller: 'copyPdfReadValuesToPdfFields',
        endpoint: 'frontend/local'
    });

    if (result.ok) return;

    if (result.reason === 'missing-engine-or-id') {
        alert('No se pudo resolver archivo engine o ID para copiar la lectura del PDF.');
        return;
    }

    if (result.reason === 'missing-pdf-page') {
        alert('Primero carga el PDF del registro para poder copiar sus valores.');
        return;
    }

    if (result.reason === 'missing-marked-row') {
        alert('No se pudo identificar la fila de rectangulos de color para copiar sus valores. Ejecuta Detectar Headers y Pintar Cuerpo en la pagina actual.');
        return;
    }

    if (result.reason === 'feature-disabled') {
        return;
    }

    alert('No se pudo copiar la lectura del PDF para el registro actual.');

}


async function copyPdfReadValuesToPdfFieldsBackend() {

    if (!PDF_FEATURE_AUTO_PDF_ENABLED) return;

    const result = await copyPdfReadValuesForRow(currentRow, {
        silent: false,
        reloadAfterSave: true,
        clearPdfBeforeCopy: true,
        caller: 'copyPdfReadValuesToPdfFieldsBackend',
        endpoint: '/copy-pdf-to-pdf (delegated to visual core)'
    });

    if (result.ok) return;

    if (result.reason === 'missing-engine-or-id') {
        alert('No se pudo resolver archivo engine o ID para copiar la lectura del PDF.');
        return;
    }

    if (result.reason === 'missing-pdf-page') {
        alert('Primero carga el PDF del registro para poder copiar sus valores.');
        return;
    }

    if (result.reason === 'missing-marked-row') {
        alert('No se pudo identificar la fila de rectangulos de color para copiar sus valores. Ejecuta Detectar Headers y Pintar Cuerpo en la pagina actual.');
        return;
    }

    if (result.reason === 'feature-disabled') {
        return;
    }

    alert('No se pudo copiar la lectura del PDF para el registro actual.');

}



function buildEngineOptions(selectedModel = '') {

    const select = $('engineFilterSelect');

    if (!(select instanceof HTMLSelectElement)) return;



    select.innerHTML = ENGINE_BOOK_MODELS.map((value) => `<option value="${value}">${value}</option>`).join('');

    const defaultModel = ENGINE_BOOK_MODELS[0] || '';

    select.value = selectedModel && ENGINE_BOOK_MODELS.includes(selectedModel) ? selectedModel : defaultModel;

}



function resolveEngineFileFromFilter(engineFilter) {

    const model = String(engineFilter || '').trim();

    if (!model) return ENGINE_BOOK_FILES[0] || '';



    const directMatch = ENGINE_BOOK_FILES.find((file) => inferEngineModelFromFileName(file) === model);

    return directMatch || '';

}



const LOCAL_ONLY_BACKEND_ENDPOINTS = new Set(['recompute-qa-errors', 'recompute-pdf-auto', 'recompute-pdf-auto-visual', 'calculate-final-fields', 'recalculate-revision-status', 'copy-pdf-to-pdf', 'copy-pdf-to-pdf-all-books', 'copy-pdf-to-final-all-books', 'clear-engine-fields']);



function getCurrentHostname() {

    return String(window.location.hostname || '').trim().toLowerCase();

}



function isLocalRuntime() {

    const hostname = getCurrentHostname();

    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';

}



function normalizeEndpointPath(endpointPath) {

    return String(endpointPath || '').trim().replace(/^\/+/, '').toLowerCase();

}



function isLocalOnlyBackendEndpoint(endpointPath) {

    return LOCAL_ONLY_BACKEND_ENDPOINTS.has(normalizeEndpointPath(endpointPath));

}



function getLocalOnlyBackendMessage(endpointPath) {

    const endpoint = normalizeEndpointPath(endpointPath);

    const endpointLabel = endpoint ? `/${endpoint}` : 'este endpoint';

    return `${endpointLabel} solo esta disponible en entorno local con server.js (http://localhost:3000).`;

}



function isBackendEndpointAllowed(endpointPath) {

    if (!isLocalOnlyBackendEndpoint(endpointPath)) return true;

    return isLocalRuntime();

}



function getBackendCandidateUrls(endpointPath) {

    const currentOrigin = window.location.origin && window.location.origin !== 'null'

        ? window.location.origin

        : '';

    const currentPathname = String(window.location.pathname || '/');

    const currentHostname = getCurrentHostname();

    const isLocalhost = isLocalRuntime();

    const cleanEndpoint = normalizeEndpointPath(endpointPath);

    const pathnameHasMilu = /(^|\/)milu(\/|$)/i.test(currentPathname);



    if (!isBackendEndpointAllowed(cleanEndpoint)) {

        return [];

    }



    const rootCandidate = currentOrigin ? `${currentOrigin}/${cleanEndpoint}` : `/${cleanEndpoint}`;

    const miluRootCandidate = currentOrigin ? `${currentOrigin}/milu/${cleanEndpoint}` : `/milu/${cleanEndpoint}`;

    const sameDirectoryCandidate = new URL(cleanEndpoint, new URL('.', window.location.href)).href;

    const localPortCandidate = isLocalhost && currentHostname ? `http://${currentHostname}:3000/${cleanEndpoint}` : '';



    if (isLocalhost) {

        return [

            localPortCandidate,

            `http://localhost:3000/${cleanEndpoint}`,

            rootCandidate,

            miluRootCandidate,

            sameDirectoryCandidate

        ].filter((url, index, arr) => url && arr.indexOf(url) === index);

    }



    return [

        rootCandidate,

        pathnameHasMilu ? sameDirectoryCandidate : '',

        pathnameHasMilu ? miluRootCandidate : '',

        sameDirectoryCandidate

    ].filter((url, index, arr) => url && arr.indexOf(url) === index);

}



async function postJsonToBackendCandidates(endpointPath, payload) {

    if (!isBackendEndpointAllowed(endpointPath)) {

        throw new Error(getLocalOnlyBackendMessage(endpointPath));

    }



    const urls = getBackendCandidateUrls(endpointPath);

    let lastError = '';



    for (const url of urls) {

        try {

            const response = await fetch(url, {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify(payload)

            });

            const rawBody = await response.text();

            let data = null;

            try {

                data = rawBody ? JSON.parse(rawBody) : null;

            } catch (_parseError) {

                data = null;

            }



            if (!response.ok) {

                lastError = String(data?.error || `HTTP ${response.status}`).trim();

                continue;

            }



            if (!data || data.ok !== true || !data.result || typeof data.result !== 'object') {

                const snippet = rawBody

                    ? rawBody.replace(/\s+/g, ' ').trim().slice(0, 140)

                    : '';

                lastError = snippet

                    ? `Respuesta invalida desde ${url}: ${snippet}`

                    : `Respuesta invalida desde ${url} (esperado JSON con { ok: true, result }).`;

                continue;

            }



            return data.result;

        } catch (error) {

            lastError = String(error?.message || error || 'Error de red');

        }

    }



    throw new Error(lastError || `No se pudo ejecutar ${endpointPath} en backend.`);

}



async function autoRecomputeEditedRecord(engineFile, id) {

    if (!isBackendEndpointAllowed('recompute-qa-errors')) {

        return;

    }



    await postJsonToBackendCandidates('recompute-qa-errors', {

        file: engineFile,

        id,

        dryRun: false,

        updateRevision: false,

        backup: true

    });



    await postJsonToBackendCandidates('recompute-pdf-auto', {

        file: engineFile,

        id,

        dryRun: false,

        backup: true

    });

}



async function reloadEditedRecord(engineFile, id) {

    const selectedModel = inferEngineModelFromFileName(engineFile);

    await loadEngineForFilter(selectedModel);



    const reloaded = findRecordByPrimaryKey(id, selectedModel);

    if (reloaded) {

        currentRow = reloaded;

        $('recordIdInput').value = getDisplayPnForInput(reloaded);

        currentProcessIndex = 0;

        await revalidateCurrentRow();

    }

    updateRecordSearchSuggestions();

}



function setRecomputeStatus(message, status = '') {

    const statusEl = $('recomputeStatusText');

    if (!(statusEl instanceof HTMLElement)) return;

    statusEl.classList.remove('is-ok', 'is-error');

    if (status === 'ok') statusEl.classList.add('is-ok');

    if (status === 'error') statusEl.classList.add('is-error');

    statusEl.textContent = message;

}

let _lastRecomputeNotFoundResult = null;
let _lastRecomputeNotFoundModel = '';
let _lastRecomputeNotFoundFilters = { reason: 'all', query: '' };

function normalizeRecomputeNotFoundFilterValue(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function escapeCsvValue(value) {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function getFilteredRecomputeNotFoundRows(result) {
    const rows = Array.isArray(result?.not_found_rows) ? result.not_found_rows : [];
    const selectedReason = String(_lastRecomputeNotFoundFilters?.reason || 'all').trim() || 'all';
    const query = normalizeRecomputeNotFoundFilterValue(_lastRecomputeNotFoundFilters?.query || '');

    return rows.filter((row) => {
        const rowReason = String(row?.reason || '').trim();
        if (selectedReason !== 'all' && rowReason !== selectedReason) return false;
        if (!query) return true;
        const haystack = normalizeRecomputeNotFoundFilterValue([
            row?.page,
            row?.pos_pdf ?? row?.pos,
            row?.pn_pdf,
            row?.reason
        ].join(' '));
        return haystack.includes(query);
    });
}

function downloadRecomputeNotFoundCsv(result, selectedModel = '') {
    const body = $('recomputePdfDetailBody');
    const tableRows = body instanceof HTMLElement
        ? Array.from(body.querySelectorAll('tbody tr'))
        : [];
    const header = ['model', 'page', 'pos_pdf', 'pn_pdf', 'reason'];
    const lines = [header.join(';')];
    tableRows.forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll('td')).map((cell) => String(cell.textContent || '').trim());
        lines.push([
            escapeCsvValue(selectedModel || _lastRecomputeNotFoundModel || ''),
            escapeCsvValue(cells[0] || ''),
            escapeCsvValue(cells[1] || ''),
            escapeCsvValue(cells[2] || ''),
            escapeCsvValue(cells[3] || '')
        ].join(';'));
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadTextFile(`\uFEFF${lines.join('\n')}\n`, `milu_not_found_${selectedModel || 'all'}_${timestamp}.csv`, 'text/csv;charset=utf-8');
    setRecomputeStatus(`CSV descargado (${tableRows.length} filas filtradas).`, 'ok');
}

let _pdfActionStatusTimer = null;

function setPdfActionStatus(message, status = '') {
    const el = $('pdfActionStatusText');
    if (!(el instanceof HTMLElement)) return;

    el.classList.remove('is-ok', 'is-error', 'is-busy');
    if (status === 'ok') el.classList.add('is-ok');
    else if (status === 'error') el.classList.add('is-error');
    else if (status === 'busy') el.classList.add('is-busy');

    el.textContent = message;

    if (_pdfActionStatusTimer) clearTimeout(_pdfActionStatusTimer);
    if (status === 'ok' || status === 'error') {
        _pdfActionStatusTimer = setTimeout(() => {
            el.textContent = '';
            el.className = 'pdf-action-status';
        }, 4000);
    }
}



function clearRecomputePdfDetail() {

    const panel = $('recomputePdfDetailPanel');

    const title = $('recomputePdfDetailTitle');

    const meta = $('recomputePdfDetailMeta');

    const body = $('recomputePdfDetailBody');



    if (panel instanceof HTMLElement) panel.hidden = true;

    if (title instanceof HTMLElement) title.textContent = 'Detalle del registro';

    if (meta instanceof HTMLElement) meta.textContent = '';

    if (body instanceof HTMLElement) body.innerHTML = '';

}



function renderRecomputePdfDetail(detailRow, result, pdfAutoBefore = {}) {

    const panel = $('recomputePdfDetailPanel');

    const title = $('recomputePdfDetailTitle');

    const meta = $('recomputePdfDetailMeta');

    const body = $('recomputePdfDetailBody');



    if (!(panel instanceof HTMLElement)

        || !(title instanceof HTMLElement)

        || !(meta instanceof HTMLElement)

        || !(body instanceof HTMLElement)) {

        return;

    }



    if (!detailRow || !Array.isArray(detailRow.comparisons)) {

        clearRecomputePdfDetail();

        return;

    }



    const foundEntries = detailRow.comparisons.filter((entry) => normalizeCompareValue(entry?.pdf) !== '');

    title.textContent = `Detalle PDF_AUTO · ID ${txt(detailRow.ID, '')}`;

    meta.textContent = `Libro=${txt(detailRow.engine_model, '')} | Page=${txt(detailRow.source_page, '')} | PN=${txt(detailRow.pn, '')} | Anchor=${txt(detailRow.pnAnchorLine, '')}`;



    const summaryCards = [

        { label: 'Campos encontrados', value: String(foundEntries.length) },

        { label: 'Campos evaluados', value: String(detailRow.comparisons.length) },

        { label: 'Registros cambiados', value: String(Number(result?.changedRows) || 0) },

        { label: 'Modo', value: result?.dryRun ? 'Simulacion' : 'Escritura' }

    ];



    const summaryHtml = `

        <div class="recompute-result-summary">

            ${summaryCards.map((card) => `

                <div class="recompute-result-kpi">

                    <div class="recompute-result-kpi-label">${escapeHtml(card.label)}</div>

                    <div class="recompute-result-kpi-value">${escapeHtml(card.value)}</div>

                </div>

            `).join('')}

        </div>

    `;



    if (foundEntries.length === 0) {

        body.innerHTML = `${summaryHtml}<p class="recompute-result-empty">No se encontró ningun valor PDF_AUTO util para este registro.</p>`;

        panel.hidden = false;

        return;

    }



    const rowsHtml = foundEntries.map((entry) => {

        const field = String(entry?.field || '').trim();

        const previousPdfAuto = String(pdfAutoBefore?.[field] ?? '').trim();

        const nextPdfAuto = String(entry?.pdf ?? '').trim();

        const changed = normalizeCompareValue(previousPdfAuto) !== normalizeCompareValue(nextPdfAuto);

        const statusLabel = result?.dryRun

            ? (changed ? 'cambiaria' : 'sin cambio')

            : (changed ? 'actualizado' : 'sin cambio');

        const statusClass = changed ? 'is-updated' : 'is-same';

        const matchClass = entry?.finalVsPdfMatch ? 'recompute-result-match' : 'recompute-result-mismatch';

        const matchLabel = entry?.finalVsPdfMatch ? 'match final' : 'no match';



        return `

            <tr>

                <td>${escapeHtml(txt(field, ''))}</td>

                <td>${escapeHtml(txt(entry?.raw, ''))}</td>

                <td>${escapeHtml(txt(entry?.gesa, ''))}</td>

                <td>${escapeHtml(txt(entry?.final, ''))}</td>

                <td>${escapeHtml(txt(nextPdfAuto, ''))}</td>

                <td><span class="recompute-result-status ${statusClass}">${escapeHtml(statusLabel)}</span></td>

                <td><span class="${matchClass}">${escapeHtml(matchLabel)}</span></td>

            </tr>

        `;

    }).join('');



    body.innerHTML = `${summaryHtml}

        <div class="recompute-result-table-wrap">

            <table class="recompute-result-table">

                <thead>

                    <tr>

                        <th>Campo</th>

                        <th>Raw</th>

                        <th>Gesa</th>

                        <th>Final</th>

                        <th>PDF encontrado</th>

                        <th>Estado</th>

                        <th>Comparacion</th>

                    </tr>

                </thead>

                <tbody>${rowsHtml}</tbody>

            </table>

        </div>`;

    panel.hidden = false;

}



function renderRecomputePdfBatchDetail(result, selectedModel = '') {

    const panel = $('recomputePdfDetailPanel');

    const title = $('recomputePdfDetailTitle');

    const meta = $('recomputePdfDetailMeta');

    const body = $('recomputePdfDetailBody');



    if (!(panel instanceof HTMLElement)

        || !(title instanceof HTMLElement)

        || !(meta instanceof HTMLElement)

        || !(body instanceof HTMLElement)) {

        return;

    }



    const totals = result?.totals || {};
    const perFile = Array.isArray(result?.perFile) ? result.perFile : [];

    if (perFile.length === 0) {
        clearRecomputePdfDetail();
        return;
    }

    const modelLabel = txt(selectedModel, 'N/A');
    const filesCount = Number(result?.options?.files?.length) || perFile.length;

    title.textContent = `Detalle lote PDF · ${modelLabel}`;
    meta.textContent = `Funcion: runBulkCopyPdfToBook() -> POST /copy-pdf-to-pdf-all-books | libros=${filesCount}`;

    const summaryCards = [
        { label: 'Registros escaneados', value: String(Number(totals.scanned) || 0) },
        { label: 'Registros cambiados', value: String(Number(totals.changedRows) || 0) },
        { label: 'Sin cambio', value: String(Number(totals.unchangedRows) || 0) },
        { label: 'Sin ancla PN', value: String(Number(totals.pnAnchorMissing) || 0) },
        { label: 'Paginas faltantes', value: String(Number(totals.missingPages) || 0) },
        { label: 'Libros escritos', value: String(Number(totals.filesWritten) || 0) }
    ];

    const summaryHtml = `

        <div class="recompute-result-summary">

            ${summaryCards.map((card) => `

                <div class="recompute-result-kpi">

                    <div class="recompute-result-kpi-label">${escapeHtml(card.label)}</div>

                    <div class="recompute-result-kpi-value">${escapeHtml(card.value)}</div>

                </div>

            `).join('')}

        </div>

    `;

    const rowsHtml = perFile.map((item) => {
        const scanned = Number(item?.scanned) || 0;
        const changed = Number(item?.changedRows) || 0;
        const unchanged = Number(item?.unchangedRows) || Math.max(0, scanned - changed);
        const pnAnchorMissing = Number(item?.pnAnchorMissing) || 0;
        const missingPages = Number(item?.missingPages) || 0;

        return `

            <tr>

                <td>${escapeHtml(txt(item?.file, ''))}</td>

                <td>${escapeHtml(String(scanned))}</td>

                <td>${escapeHtml(String(changed))}</td>

                <td>${escapeHtml(String(unchanged))}</td>

                <td>${escapeHtml(String(pnAnchorMissing))}</td>

                <td>${escapeHtml(String(missingPages))}</td>

            </tr>

        `;
    }).join('');

    body.innerHTML = `${summaryHtml}

        <div class="recompute-result-table-wrap">

            <table class="recompute-result-table">

                <thead>

                    <tr>

                        <th>Libro</th>

                        <th>Scanned</th>

                        <th>Changed</th>

                        <th>Unchanged</th>

                        <th>Sin ancla PN</th>

                        <th>Missing pages</th>

                    </tr>

                </thead>

                <tbody>${rowsHtml}</tbody>

            </table>

        </div>`;

    panel.hidden = false;

}



async function fetchRecomputePdfDetailRow(outputPath, requestUrl) {

    const fileName = String(outputPath || '').split(/[\\/]/).pop();

    if (!fileName) return null;



    const baseOrigin = requestUrl

        ? new URL(requestUrl, window.location.href).origin

        : window.location.origin;

    const detailUrl = `${baseOrigin}/${encodeURIComponent(fileName)}`;

    const response = await fetch(detailUrl, { cache: 'no-store' });

    if (!response.ok) {

        throw new Error(`No se pudo cargar detalle ${fileName} (HTTP ${response.status})`);

    }



    const report = await response.json();

    const rows = Array.isArray(report?.rows) ? report.rows : [];

    return rows[0] || null;

}



function getRecomputeModalBooks() {
    const fromConfigured = Array.isArray(ENGINE_BOOK_MODELS) ? ENGINE_BOOK_MODELS : [];
    const fromRows = Array.isArray(state?.allData)
        ? state.allData.map((row) => String(row?.engine_model || row?.book_set || '').trim()).filter(Boolean)
        : [];
    return Array.from(new Set([...fromConfigured, ...fromRows]))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, 'es', { numeric: true, sensitivity: 'base' }));
}

function updateRecomputeModalTitle() {
    const title = $('recomputeModalTitle');
    if (!(title instanceof HTMLElement)) return;
    const select = getRecomputeBookSelect();
    const value = select instanceof HTMLSelectElement ? String(select.value || '').trim() : '';
    title.textContent = (!value || value === RECOMPUTE_ALL_BOOKS_VALUE)
        ? 'Recalcular todos los libros'
        : `Recalcular libro ${value}`;
}

function syncRecomputeBookSelect() {
    const source = $('engineFilterSelect');
    const target = getRecomputeBookSelect();
    if (!(source instanceof HTMLSelectElement) || !(target instanceof HTMLSelectElement)) return;

    const books = getRecomputeModalBooks();

    target.innerHTML = [`<option value="${RECOMPUTE_ALL_BOOKS_VALUE}">Todos los libros</option>`]
        .concat(books.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`))
        .join('');
    const selectedMainModel = String(source.value || '').trim();
    target.disabled = false;
    target.value = books.includes(selectedMainModel)
        ? selectedMainModel
        : RECOMPUTE_ALL_BOOKS_VALUE;
    updateRecomputeModalTitle();
}

function syncRecomputeEngineSelect() {
    syncRecomputeBookSelect();
}



// Recalcula errores y, opcionalmente, estado/accion en backend (libro completo o ID puntual).
async function runBackendRecompute(inputFilters = null) {

    if (recomputeErrorsInFlight) return null;

    const recomputeRunBtn = $('recomputeRunBtn');
    const recomputePdfRunBtn = $('recomputePdfRunBtn');
    const engineFilterSelect = $('engineFilterSelect');
    const filters = inputFilters || getRecomputeModalFilters();

    if (!(recomputeRunBtn instanceof HTMLButtonElement)
        || !(engineFilterSelect instanceof HTMLSelectElement)) {
        return null;
    }

    const selectedMainModel = String(engineFilterSelect.value || '').trim();
    const selectedMainFile = resolveEngineFileFromFilter(selectedMainModel);
    const selectedModelRaw = String(filters.book || RECOMPUTE_ALL_BOOKS_VALUE).trim();
    const selectedModel = selectedModelRaw === RECOMPUTE_ALL_BOOKS_VALUE ? '' : selectedModelRaw;
    const id = String(filters.id || '').trim();
    if (!selectedModel && id) {
        setRecomputeStatus('Para filtrar por ID en ERRORES, selecciona un libro concreto.', 'error');
        return null;
    }
    const scope = !selectedModel ? 'all' : (id ? 'current' : 'book');
    const file = scope === 'all' ? '' : resolveEngineFileFromFilter(selectedModel);
    const dryRun = false;
    // ERRORES recalcula *_error/has_error; ESTADOS es el paso separado para qa_revision_*.
    const updateRevision = false;
    const forceRevision = false;
    const backup = true;

    if (scope !== 'all' && !file) {
        alert('No se pudo resolver el archivo engine para el recálculo.');
        return null;
    }

    if (!isBackendEndpointAllowed('recompute-qa-errors')) {
        setRecomputeStatus(getLocalOnlyBackendMessage('recompute-qa-errors'), 'error');
        return null;
    }

    const payload = {
        scope,
        dryRun,
        updateRevision,
        forceRevision,
        backup
    };
    if (file) payload.file = file;
    if (id) payload.id = id;

    const keepRecord = currentRow ? txt(currentRow?.ID, '') : '';
    const startedAt = performance.now();
    const urls = getBackendCandidateUrls('recompute-qa-errors');
    let lastError = '';
    let lastTriedUrl = '';
    let result = null;

    recomputeErrorsInFlight = true;
    recomputeRunBtn.disabled = true;
    if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = true;
    clearRecomputeErrorsSummary();
    setRecomputeStatus(`Ejecutando recálculo de errores para ${getRecomputeScopeLabel(scope)}...`, '');

    try {
        for (const url of urls) {
            lastTriedUrl = url;
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const rawBody = await response.text();
                let data = null;
                try {
                    data = rawBody ? JSON.parse(rawBody) : null;
                } catch (_parseError) {
                    data = null;
                }

                if (!response.ok) {
                    lastError = String(data?.error || `HTTP ${response.status} en ${url}`).trim();
                    continue;
                }

                const legacyTotals = data?.totals;
                const hasLegacyPayload = data?.ok === true && legacyTotals && typeof legacyTotals === 'object';

                if (!data || data.ok !== true || (!data.result && !hasLegacyPayload)) {
                    const snippet = rawBody
                        ? rawBody.replace(/\s+/g, ' ').trim().slice(0, 140)
                        : '';
                    lastError = snippet
                        ? `Respuesta invalida desde ${url}: ${snippet}`
                        : `Respuesta invalida desde ${url} (esperado JSON con { ok: true, result }).`;
                    continue;
                }

                if (data.result && typeof data.result === 'object') {
                    result = data.result;
                } else {
                    result = {
                        scope,
                        file,
                        mode: id ? 'single-id' : 'full-book',
                        id: id || null,
                        dryRun,
                        updateRevision,
                        scanned: Number(legacyTotals.totalRows) || 0,
                        changedRows: Number(legacyTotals.changedRows) || 0,
                        okRows: Math.max((Number(legacyTotals.totalRows) || 0) - (Number(legacyTotals.rowsWithErrors) || 0), 0),
                        koRows: Number(legacyTotals.rowsWithErrors) || 0,
                        warningsFound: 0,
                        wroteFile: !dryRun && (Number(legacyTotals.changedRows) || 0) > 0
                    };
                }

                break;
            } catch (error) {
                lastError = String(error?.message || error || 'Error de red');
            }
        }

        if (!result) {
            const idHint = id
                ? ` Verifica si el ID ${id} existe en ${selectedModel} o deja el ID vacio para recalcular el libro completo.`
                : '';
            setRecomputeStatus(
                `Error: ${lastError || `No se pudo ejecutar el recálculo (ultimo endpoint: ${lastTriedUrl || 'sin URL'}). Comprueba que server.js este activo en http://localhost:3000 y responde en /health.`}${idHint}`,
                'error'
            );
            return null;
        }

        const elapsedMs = performance.now() - startedAt;
        const modeLabel = scope === 'all'
            ? 'todos los libros'
            : (result.mode === 'single-id' ? `ID ${result.id}` : 'libro completo');
        const booksProcessed = Number(result.booksProcessed) || (Array.isArray(result.books) ? result.books.length : (result.file ? 1 : 0));

        setRecomputeStatus(
            `OK ${modeLabel} | libros=${booksProcessed} scanned=${Number(result.scanned) || 0} changed=${Number(result.changedRows) || 0} ok=${Number(result.okRows) || 0} ko=${Number(result.koRows) || 0} warnings=${Number(result.warningsFound) || 0} dryRun=${result.dryRun ? 'si' : 'no'}`,
            'ok'
        );

        renderRecomputeErrorsSummary(result, { scope });
        logRecomputeErrorsSummary(result, { scope, elapsedMs });

        if (!result.dryRun && result.wroteFile) {
            const shouldReloadCurrentBook = scope === 'all'
                ? (Array.isArray(result.books)
                    ? result.books.some((item) => String(item?.file || '').trim() === selectedMainFile)
                    : Boolean(selectedMainFile))
                : selectedMainModel === selectedModel;

            if (shouldReloadCurrentBook && selectedMainModel) {
                await loadEngineForFilter(selectedMainModel);

                if (keepRecord) {
                    const reloaded = findRecordByPrimaryKey(keepRecord, selectedMainModel);
                    if (reloaded) {
                        currentRow = reloaded;
                        $('recordIdInput').value = getDisplayPnForInput(reloaded);
                        currentProcessIndex = 0;
                        await revalidateCurrentRow();
                    }
                }

                updateRecordSearchSuggestions();
            }
        }

        return result;
    } finally {
        recomputeErrorsInFlight = false;
        recomputeRunBtn.disabled = false;
        if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = false;
    }
}



// Vacia campos *_pdf, *_final y *_error en los 9 engine_*.json mediante /clear-engine-fields,
// respetando pn_pdf y pn_final, y marca revisión pendiente.
async function runClearPdfFinalFields() {
    console.info('[clear-engine-fields] click recibido');
    setRecomputeStatus('Preparando vaciado de campos _pdf/_final/_error y marcado de revisión pendiente...', '');

    if (!isBackendEndpointAllowed('clear-engine-fields')) {
        setRecomputeStatus(getLocalOnlyBackendMessage('clear-engine-fields'), 'error');
        return;
    }

    const confirmed = await simpleConfirm(
        'ATENCION: Esta accion vaciara TODOS los campos cuyo nombre termina en _pdf, _final o _error en los 9 engine_*.json, EXCEPTO pn_pdf y pn_final.\n\nAdemas, pondra qa_revision_estado=pendiente, qa_revision_accion=revisar y qa_revision_updated_at al timestamp actual.\n\nEs una operacion DESTRUCTIVA e irreversible.\n\n¿Deseas continuar?'
    );
    if (!confirmed) {
        setRecomputeStatus('Operacion cancelada por el usuario.', '');
        return;
    }

    const clearBtn = $('recomputeClearPdfFinalBtn');
    const recomputeCopyBookBtn = $('recomputeCopyBookBtn');
    const recomputeRunBtn = $('recomputeRunBtn');
    const recomputePdfRunBtn = $('recomputePdfRunBtn');

    if (clearBtn instanceof HTMLButtonElement) clearBtn.disabled = true;
    if (recomputeCopyBookBtn instanceof HTMLButtonElement) recomputeCopyBookBtn.disabled = true;
    if (recomputeRunBtn instanceof HTMLButtonElement) recomputeRunBtn.disabled = true;
    if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = true;

    const progressContainer = $('recomputeProgressContainer');
    const progressFill = $('recomputeProgressFill');
    const progressText = $('recomputeProgressText');
    if (progressContainer instanceof HTMLElement) progressContainer.hidden = false;
    if (progressFill instanceof HTMLElement) progressFill.style.width = '20%';
    if (progressText instanceof HTMLElement) progressText.textContent = 'Enviando peticion al backend...';

    setRecomputeStatus('Vaciando _pdf/_final/_error y marcando revisión pendiente en los 9 libros...', '');

    try {
        if (progressFill instanceof HTMLElement) progressFill.style.width = '45%';
        if (progressText instanceof HTMLElement) progressText.textContent = 'Procesando engine_*.json...';

        const result = await postJsonToBackendCandidates('clear-engine-fields', {
            suffixes: ['_pdf', '_final', '_error'],
            exclude: ['pn_pdf', 'pn_final'],
            resetQaRevision: true
        });

        if (progressFill instanceof HTMLElement) progressFill.style.width = '100%';
        if (progressText instanceof HTMLElement) progressText.textContent = 'Completado.';

        const summary = result?.summary || {};
        const revisionUpdatedAt = String(result?.qaRevisionUpdatedAt || '').trim();

        recomputeErrorsInFlight = false;
        const perFile = Array.isArray(result?.perFile) ? result.perFile : [];
        const fileLines = perFile
            .map((entry) => `${entry?.file || '?'}: ${entry?.fields ?? 0} campos / ${entry?.records ?? 0} reg.`)
            .join(' | ');
        console.info('[clear-engine-fields] resultado', result);
        setRecomputeStatus(
            `OK: ${summary.totalFields ?? 0} campos vaciados en ${summary.totalRecords ?? 0} registros; revisión pendiente aplicada en ${summary.totalRevisionRecords ?? 0} registros${revisionUpdatedAt ? ` (ts=${revisionUpdatedAt})` : ''}. Recarga web obligatoria.${fileLines ? ' [' + fileLines + ']' : ''}`,
            'ok'
        );
        window.alert('Vaciado completado correctamente.\n\nEs obligatorio recargar la web para continuar.');
        window.location.reload();
    } catch (error) {
        console.error('[clear-engine-fields] error', error);
        if (progressText instanceof HTMLElement) progressText.textContent = 'Error.';
        setRecomputeStatus(
            `Error vaciando _pdf/_final/_error y marcando revisión (backend): ${String(error?.message || error)}. Verifica que server.js este reiniciado y exponga /clear-engine-fields.`,
            'error'
        );
    } finally {
        if (clearBtn instanceof HTMLButtonElement) clearBtn.disabled = false;
        if (recomputeCopyBookBtn instanceof HTMLButtonElement) recomputeCopyBookBtn.disabled = false;
        if (recomputeRunBtn instanceof HTMLButtonElement) recomputeRunBtn.disabled = false;
        if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = false;
        setTimeout(() => {
            if (progressContainer instanceof HTMLElement) progressContainer.hidden = true;
            if (progressFill instanceof HTMLElement) progressFill.style.width = '0%';
        }, 1500);
    }
}


// Copia lectura PDF a campos *_pdf para todos los registros de todos los libros (backend batch).
async function runBulkCopyPdfToBook() {

    if (!PDF_FEATURE_AUTO_PDF_ENABLED) {
        return;
    }

    clearRecomputePdfDetail();

    if (!isBackendEndpointAllowed('copy-pdf-to-pdf-all-books')) {
        setRecomputeStatus(getLocalOnlyBackendMessage('copy-pdf-to-pdf-all-books'), 'error');
        return;
    }

    const engineFilterSelect = $('engineFilterSelect');

    const confirmed = await simpleConfirm(
        'Vas a importar la lectura PDF en lote para TODOS los libros.\n\nSe actualizaran los campos *_pdf de todos sus registros y se guardaran los JSON con copia de seguridad.\n\nEsta accion puede tardar varios minutos.\n\n¿Deseas continuar?'
    );

    if (!confirmed) {
        setRecomputeStatus('Operación cancelada por el usuario.', '');
        return;
    }

    const recomputeCopyBookBtn = $('recomputeCopyBookBtn');
    const recomputeRunBtn = $('recomputeRunBtn');
    const recomputePdfRunBtn = $('recomputePdfRunBtn');

    if (recomputeCopyBookBtn instanceof HTMLButtonElement) recomputeCopyBookBtn.disabled = true;
    if (recomputeRunBtn instanceof HTMLButtonElement) recomputeRunBtn.disabled = true;
    if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = true;
    setRecomputeStatus('Copiando lectura PDF a todos los libros...', '');

    // Mostrar barra de progreso
    const progressContainer = $('recomputeProgressContainer');
    if (progressContainer instanceof HTMLElement) {
        progressContainer.hidden = false;
        const fillEl = $('recomputeProgressFill');
        const textEl = $('recomputeProgressText');
        if (fillEl instanceof HTMLElement) fillEl.style.width = '20%';
        if (textEl instanceof HTMLElement) textEl.textContent = 'Iniciando operación...';
    }

    const previousCurrentId = txt(currentRow?.ID, '');
    let result = null;

    try {
        const fillEl = $('recomputeProgressFill');
        const textEl = $('recomputeProgressText');
        if (fillEl instanceof HTMLElement) fillEl.style.width = '45%';
        if (textEl instanceof HTMLElement) textEl.textContent = 'Ejecutando copia masiva en backend...';

        result = await postJsonToBackendCandidates('copy-pdf-to-pdf-all-books', {
            writePdf: true,
            backup: true,
            clearPdfBeforeCopy: true
        });

        const fillElDone = $('recomputeProgressFill');
        const textElDone = $('recomputeProgressText');
        if (fillElDone instanceof HTMLElement) fillElDone.style.width = '90%';
        if (textElDone instanceof HTMLElement) textElDone.textContent = 'Generando resumen por libro...';
    } catch (error) {
        if (progressContainer instanceof HTMLElement) progressContainer.hidden = true;
        if (recomputeCopyBookBtn instanceof HTMLButtonElement) recomputeCopyBookBtn.disabled = false;
        if (recomputeRunBtn instanceof HTMLButtonElement) recomputeRunBtn.disabled = false;
        if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = false;
        setRecomputeStatus(`Error en copia masiva PDF (backend): ${String(error?.message || error)}. Verifica que server.js este reiniciado y exponga /copy-pdf-to-pdf-all-books.`, 'error');
        return;
    }

    if (recomputeCopyBookBtn instanceof HTMLButtonElement) recomputeCopyBookBtn.disabled = false;
    if (recomputeRunBtn instanceof HTMLButtonElement) recomputeRunBtn.disabled = false;
    if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = false;

    // Ocultar barra de progreso
    if (progressContainer instanceof HTMLElement) {
        progressContainer.hidden = true;
    }

    const fillEl = $('recomputeProgressFill');
    const textEl = $('recomputeProgressText');
    if (fillEl instanceof HTMLElement) fillEl.style.width = '100%';
    if (textEl instanceof HTMLElement) textEl.textContent = 'Finalizando...';

    const totals = result?.totals || {};
    const summaryChangedRows = Number(totals.changedRows) || 0;
    const summaryScannedRows = Number(totals.scanned) || 0;
    const summaryFailedRows = Number(totals.missingPages) || 0;
    const summaryMissingMarkedRowRows = Number(totals.pnAnchorMissing) || 0;
    const summaryUnchangedRows = Number(totals.unchangedRows) || Math.max(0, summaryScannedRows - summaryChangedRows);
    const statusMessage = summaryChangedRows === 0
        ? `Sin cambios: campos *_pdf ya sincronizados | alcance=TODOS scanned=${summaryScannedRows} missingPages=${summaryFailedRows} sinAnclaPN=${summaryMissingMarkedRowRows}`
        : `OK alcance=TODOS | scanned=${summaryScannedRows} changed=${summaryChangedRows} unchanged=${summaryUnchangedRows} missingPages=${summaryFailedRows} sinAnclaPN=${summaryMissingMarkedRowRows}`;

    setRecomputeStatus(statusMessage, 'ok');
    renderRecomputePdfBatchDetail(result, 'TODOS LOS LIBROS');

    const wroteFile = Number(totals.filesWritten) > 0;
    if (wroteFile) {
        const activeModel = engineFilterSelect instanceof HTMLSelectElement
            ? String(engineFilterSelect.value || '').trim()
            : '';
        if (activeModel) {
            const keepId = previousCurrentId || (currentRow ? txt(currentRow?.ID, '') : '');
            await loadEngineForFilter(activeModel);
            if (keepId) {
                const reloaded = findRecordByPrimaryKey(keepId, activeModel);
                if (reloaded) {
                    currentRow = reloaded;
                    $('recordIdInput').value = getDisplayPnForInput(reloaded);
                    currentProcessIndex = 0;
                    await revalidateCurrentRow();
                }
            }
            updateRecordSearchSuggestions();
        }
    }

}

// Recalcula campos *_pdf leyendo el PDF en backend (libro completo o ID puntual).
async function runBackendRecomputePdfAuto() {

    if (!PDF_FEATURE_AUTO_PDF_ENABLED) {

        return;

    }

    const recomputeBookSelect = getRecomputeBookSelect();

    const recomputeIdInput = $('recomputeIdInput');

    const recomputeRunBtn = $('recomputeRunBtn');

    const recomputePdfRunBtn = $('recomputePdfRunBtn');

    const engineFilterSelect = $('engineFilterSelect');

    if (!(recomputeBookSelect instanceof HTMLSelectElement)

        || !(recomputeIdInput instanceof HTMLInputElement)

        || !(recomputeRunBtn instanceof HTMLButtonElement)

        || !(recomputePdfRunBtn instanceof HTMLButtonElement)

        || !(engineFilterSelect instanceof HTMLSelectElement)) {

        return;

    }



    const selectedModelRaw = String(recomputeBookSelect.value || '').trim();
    const selectedModel = selectedModelRaw === RECOMPUTE_ALL_BOOKS_VALUE ? '' : selectedModelRaw;
    const scopeEffective = selectedModelRaw === RECOMPUTE_ALL_BOOKS_VALUE
        ? 'all'
        : (String(recomputeIdInput.value || '').trim() ? 'current' : 'book');

    const file = scopeEffective === 'all' ? '' : resolveEngineFileFromFilter(selectedModel);

    const id = String(recomputeIdInput.value || '').trim();

    const dryRun = false;

    const pdfAutoBefore = Object.fromEntries(

        Object.keys(FIELD_TO_PDF_AUTO_KEY).map((fieldName) => [fieldName, getStoredPdfAutoValue(currentRow, fieldName)])

    );



    if (!file && scopeEffective !== 'all') {

        alert('No se pudo resolver el archivo engine para recalcular PDF_AUTO.');

        return;

    }



    if (!isBackendEndpointAllowed('recompute-pdf-auto')) {

        setRecomputeStatus(getLocalOnlyBackendMessage('recompute-pdf-auto'), 'error');

        return;

    }



    const payload = {

        scope: scopeEffective,

        file,

        dryRun,

        backup: true

    };

    if (id) payload.id = id;



    recomputeRunBtn.disabled = true;

    recomputePdfRunBtn.disabled = true;

    setRecomputeStatus(`Ejecutando recalculo PDF_AUTO en backend (${getRecomputeScopeLabel(scopeEffective)})...`, '');

    clearRecomputePdfDetail();



    const urls = getBackendCandidateUrls('recompute-pdf-auto');

    let lastError = '';

    let lastTriedUrl = '';

    let result = null;

    let resultUrl = '';



    for (const url of urls) {

        lastTriedUrl = url;

        try {

            const response = await fetch(url, {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify(payload)

            });

            const rawBody = await response.text();

            let data = null;

            try {

                data = rawBody ? JSON.parse(rawBody) : null;

            } catch (_parseError) {

                data = null;

            }



            if (!response.ok) {

                lastError = String(data?.error || `HTTP ${response.status} en ${url}`).trim();

                continue;

            }



            if (!data || data.ok !== true || !data.result || typeof data.result !== 'object') {

                const snippet = rawBody

                    ? rawBody.replace(/\s+/g, ' ').trim().slice(0, 140)

                    : '';

                lastError = snippet

                    ? `Respuesta invalida desde ${url}: ${snippet}`

                    : `Respuesta invalida desde ${url} (esperado JSON con { ok: true, result }).`;

                continue;

            }



            result = data.result;

            resultUrl = url;

            break;

        } catch (error) {

            lastError = String(error?.message || error || 'Error de red');

        }

    }



    recomputeRunBtn.disabled = false;

    recomputePdfRunBtn.disabled = false;



    if (!result) {

        const idHint = id

            ? ` Verifica si el ID ${id} existe en ${selectedModel || 'todos los libros'} o deja el ID vacio para recalcular el libro completo.`

            : '';

        setRecomputeStatus(

            `Error: ${lastError || `No se pudo ejecutar el recalculo PDF_AUTO (ultimo endpoint: ${lastTriedUrl || 'sin URL'}). Comprueba que server.js este activo en http://localhost:3000 y responde en /health.`}${idHint}`,

            'error'

        );

        return;

    }



    const modeLabel = result.mode === 'single-id' ? `ID ${result.id}` : (scopeEffective === 'all' ? 'todos los libros' : 'libro completo');

    setRecomputeStatus(

        `OK PDF_AUTO ${modeLabel} | scanned=${result.scanned} changed=${result.changedRows} missingPages=${result.missingPages || 0} dryRun=${result.dryRun ? 'si' : 'no'}`,

        'ok'

    );



    if (result.mode === 'single-id' && result.output) {

        try {

            const detailRow = await fetchRecomputePdfDetailRow(result.output, resultUrl);

            renderRecomputePdfDetail(detailRow, result, pdfAutoBefore);

        } catch (error) {

            setRecomputeStatus(

                `OK PDF_AUTO ${modeLabel} | detalle no disponible: ${String(error?.message || error)}`,

                'ok'

            );

        }

    } else {

        clearRecomputePdfDetail();

    }



    if (!result.dryRun && result.wroteFile) {

        const selectedMainModel = String(engineFilterSelect.value || '').trim();

        if (selectedMainModel === selectedModel) {

            const keepRecord = currentRow ? txt(currentRow?.ID, '') : '';

            await loadEngineForFilter(selectedMainModel);

            if (keepRecord) {

                const reloaded = findRecordByPrimaryKey(keepRecord, selectedMainModel);

                if (reloaded) {

                    currentRow = reloaded;

                    $('recordIdInput').value = getDisplayPnForInput(reloaded);

                    currentProcessIndex = 0;

                    await revalidateCurrentRow();

                }

            }

            updateRecordSearchSuggestions();

        }

    }

}



function setQuickRecomputeButtonsDisabled(disabled) {

    const quickRecomputeBtn = $('recalculateRecordBtn');

    const recomputeAllBtn = $('recomputeAllBtn');

    if (quickRecomputeBtn instanceof HTMLButtonElement) quickRecomputeBtn.disabled = disabled;

    if (recomputeAllBtn instanceof HTMLButtonElement) recomputeAllBtn.disabled = disabled;

}



function setQuickRecomputeBusyUi(busy) {

    const quickRecomputeBtn = $('recalculateRecordBtn');

    if (quickRecomputeBtn instanceof HTMLButtonElement) {

        if (!quickRecomputeBtn.dataset.defaultLabel) {

            quickRecomputeBtn.dataset.defaultLabel = quickRecomputeBtn.textContent || 'RECALCULAR';

        }



        quickRecomputeBtn.textContent = busy
            ? `... ${quickRecomputeBtn.dataset.defaultLabel}`
            : quickRecomputeBtn.dataset.defaultLabel;

        quickRecomputeBtn.style.cursor = busy ? 'wait' : '';

        quickRecomputeBtn.setAttribute('aria-busy', busy ? 'true' : 'false');

    }



    document.body.style.cursor = busy ? 'wait' : '';

}



function setRecomputeModalInputsForAction(selectedModel, id = '') {

    const recomputeBookSelect = getRecomputeBookSelect();

    const recomputeIdInput = $('recomputeIdInput');

    const recomputeUpdateRevisionInput = $('recomputeUpdateRevisionInput');

    const recomputeForceRevisionInput = $('recomputeForceRevisionInput');



    if (recomputeBookSelect instanceof HTMLSelectElement) {

        recomputeBookSelect.value = selectedModel || RECOMPUTE_ALL_BOOKS_VALUE;

    }

    if (recomputeIdInput instanceof HTMLInputElement) {

        recomputeIdInput.value = String(id || '').trim();

    }

    if (recomputeUpdateRevisionInput instanceof HTMLInputElement) recomputeUpdateRevisionInput.checked = false;

    if (recomputeForceRevisionInput instanceof HTMLInputElement) recomputeForceRevisionInput.checked = false;

}



async function runQuickRecomputeForCurrentRecord() {

    if (!currentRow) {

        alert('Primero debes cargar un registro.');

        return;

    }



    const engineFilterSelect = $('engineFilterSelect');

    if (!(engineFilterSelect instanceof HTMLSelectElement)) return;



    const selectedModel = String(engineFilterSelect.value || '').trim();

    const currentId = String(currentRow?.ID || '').trim();

    if (!selectedModel || !currentId) {

        alert('No se pudo resolver libro o ID del registro actual.');

        return;

    }



    if (!isBackendEndpointAllowed('recompute-qa-errors')) {

        setRecomputeStatus(getLocalOnlyBackendMessage('recompute-qa-errors'), 'error');

        return;

    }



    setRecomputeModalInputsForAction(selectedModel, currentId);

    const errorSnapshotBefore = snapshotRowErrorFields(currentRow);

    setQuickRecomputeButtonsDisabled(true);

    setQuickRecomputeBusyUi(true);

    try {

        setRecomputeStatus(`Recalculando registro ID ${currentId} (Copiar lectura a _pdf + errores)...`, '');

        await copyPdfReadValuesToPdfFields();

        const backendResult = await runBackendRecompute();
        if (!backendResult) {
            setRecomputeStatus(`No se pudo recalcular el registro ID ${currentId}.`, 'error');
            return;
        }

        const changedErrorKeys = getChangedErrorKeys(errorSnapshotBefore, currentRow);
        flashChangedErrorCells(changedErrorKeys);

        setRecomputeStatus(
            `Registro ID ${currentId} recalculado. Cambios _error: ${changedErrorKeys.length}.`,
            'ok'
        );

    } finally {

        setQuickRecomputeBusyUi(false);

        setQuickRecomputeButtonsDisabled(false);

    }

}



// Atajo UI: recálculo backend de errores para el registro actual.
async function runQuickRecomputeErrorsForCurrentRecord() {

    if (!currentRow) {
        alert('Primero debes cargar un registro.');
        return;
    }

    const engineFilterSelect = $('engineFilterSelect');
    if (!(engineFilterSelect instanceof HTMLSelectElement)) return;

    const selectedModel = String(engineFilterSelect.value || '').trim();
    const currentId = String(currentRow?.ID || '').trim();

    if (!selectedModel || !currentId) {
        alert('No se pudo resolver libro o ID del registro actual.');
        return;
    }

    if (!isBackendEndpointAllowed('recompute-qa-errors')) {
        setRecomputeStatus(getLocalOnlyBackendMessage('recompute-qa-errors'), 'error');
        setPdfActionStatus('Solo disponible en localhost.', 'error');
        return;
    }

    setRecomputeModalInputsForAction(selectedModel, currentId);
    const errorSnapshotBefore = snapshotRowErrorFields(currentRow);
    setQuickRecomputeButtonsDisabled(true);
    setPdfActionStatus(`Recalculando ID ${currentId}...`, 'busy');

    try {
        setRecomputeStatus(`Recalculando errores del registro ID ${currentId}...`, '');

        const backendResult = await runBackendRecompute();
        if (!backendResult) {
            setRecomputeStatus(`No se pudo recalcular errores del registro ID ${currentId}.`, 'error');
            setPdfActionStatus(`Error al recalcular ID ${currentId}.`, 'error');
            return;
        }

        const changedErrorKeys = getChangedErrorKeys(errorSnapshotBefore, currentRow);
        flashChangedErrorCells(changedErrorKeys);

        if (Number(backendResult.changedRows) > 0) {
            setRecomputeStatus(
                `Errores del registro ID ${currentId} recalculados: ${backendResult.changedRows} cambio(s), _error cambiados=${changedErrorKeys.length}, ko=${backendResult.koRows}, ok=${backendResult.okRows}.`,
                'ok'
            );
            setPdfActionStatus(`ID ${currentId}: ${backendResult.changedRows} cambio(s), errores=${changedErrorKeys.length}`, 'ok');
        } else {
            setRecomputeStatus(
                `Registro ID ${currentId} recalculado sin cambios (ko=${backendResult.koRows}, ok=${backendResult.okRows}, _error cambiados=${changedErrorKeys.length}).`,
                'ok'
            );
            setPdfActionStatus(`ID ${currentId}: sin cambios (errores=${changedErrorKeys.length})`, 'ok');
        }

    } finally {
        setQuickRecomputeButtonsDisabled(false);
    }

}


// Recalculo rapido de errores para todo el libro (sin tocar PDF_AUTO).
async function runQuickRecomputeErrorsForFullBook() {

    const engineFilterSelect = $('engineFilterSelect');

    if (!(engineFilterSelect instanceof HTMLSelectElement)) return;

    const selectedModel = String(engineFilterSelect.value || '').trim();
    if (!selectedModel) {
        alert('Selecciona un libro para recalcular errores.');
        return;
    }

    const confirmed = await confirmTypedAction({
        title: 'Confirmar recálculo de errores',
        message: `Se recalcularan SOLO los campos _error para TODO el libro ${selectedModel}.`,
        expectedText: 'APLICAR',
        confirmLabel: 'Recalcular errores',
        cancelLabel: 'Cancelar',
        dangerLevel: 'high'
    });

    if (!confirmed) {
        setRecomputeStatus('Operacion cancelada por el usuario.', '');
        return;
    }

    if (!isBackendEndpointAllowed('recompute-qa-errors')) {
        setRecomputeStatus(getLocalOnlyBackendMessage('recompute-qa-errors'), 'error');
        return;
    }

    setRecomputeModalInputsForAction(selectedModel, '');
    setQuickRecomputeButtonsDisabled(true);

    try {
        setRecomputeStatus(`Recalculando errores de todo el libro ${selectedModel}...`, '');
        const backendResult = await runBackendRecompute();
        if (!backendResult) {
            setRecomputeStatus(`No se pudo recalcular errores del libro ${selectedModel}.`, 'error');
            return;
        }

        setRecomputeStatus(
            `Libro ${selectedModel} recalculado: changed=${backendResult.changedRows}, ko=${backendResult.koRows}, ok=${backendResult.okRows}.`,
            'ok'
        );
    } finally {
        setQuickRecomputeButtonsDisabled(false);
    }
}



// Atajo UI: recálculo backend del registro actual con actualización de estado/accion.
async function runQuickRecomputeRevisionForCurrentRecord() {

    if (!currentRow) {

        alert('Primero debes cargar un registro.');

        return;

    }



    const engineFilterSelect = $('engineFilterSelect');
    const recomputeUpdateRevisionInput = $('recomputeUpdateRevisionInput');
    const recomputeForceRevisionInput = $('recomputeForceRevisionInput');
    const pdfRecomputeRevisionBtn = $('pdfRecomputeRevisionBtn');

    if (!(engineFilterSelect instanceof HTMLSelectElement)) return;



    const selectedModel = String(engineFilterSelect.value || '').trim();
    const currentId = String(currentRow?.ID || '').trim();

    if (!selectedModel || !currentId) {

        alert('No se pudo resolver libro o ID del registro actual.');

        return;

    }



    if (!isBackendEndpointAllowed('recompute-qa-errors')) {

        setRecomputeStatus(getLocalOnlyBackendMessage('recompute-qa-errors'), 'error');

        return;

    }



    setRecomputeModalInputsForAction(selectedModel, currentId);

    if (recomputeUpdateRevisionInput instanceof HTMLInputElement) recomputeUpdateRevisionInput.checked = true;
    if (recomputeForceRevisionInput instanceof HTMLInputElement) recomputeForceRevisionInput.checked = false;

    setQuickRecomputeButtonsDisabled(true);
    if (pdfRecomputeRevisionBtn instanceof HTMLButtonElement) pdfRecomputeRevisionBtn.disabled = true;

    try {

        setRecomputeStatus(`Recalculando estado/accion del registro ID ${currentId}...`, '');

        await runBackendRecompute();

    } finally {

        setQuickRecomputeButtonsDisabled(false);
        if (pdfRecomputeRevisionBtn instanceof HTMLButtonElement) {
            pdfRecomputeRevisionBtn.disabled = !isBackendEndpointAllowed('recompute-qa-errors');
        }

    }

}



// ── Recálculo en memoria ──────────────────────────────────────────────────────
// Guard para evitar ejecuciones simultáneas del recálculo local.
let isRecalculatingErrors = false;

/**
 * Ejecuta el recálculo de errores en memoria sobre los registros cargados.
 * No escribe en disco. Lee el modo desde los radio buttons del modal.
 * @param {'all'|'pending'} [forcedMode] – si se omite, lee del DOM
 */
async function runLocalRecalculation(forcedMode) {
    if (isRecalculatingErrors) return;
    isRecalculatingErrors = true;
    const localRecalcBtn = $('localRecalcBtn');
    if (localRecalcBtn instanceof HTMLButtonElement) localRecalcBtn.disabled = true;
    try {
        const modeRadio = document.querySelector('input[name="localRecalcMode"]:checked');
        const mode = forcedMode || (modeRadio instanceof HTMLInputElement ? modeRadio.value : 'pending');

        const records = Array.isArray(state.allData) ? state.allData : [];

        setRecomputeStatus('Recalculando en memoria…', '');

        // Ceder el hilo para que el navegador actualice el texto de estado
        await new Promise((resolve) => setTimeout(resolve, 0));

        const result = runInMemoryRecalculation(records, mode);
        renderRecalcSummary(result);

        setRecomputeStatus(
            `Recálculo en memoria completado: ${result.errorCount} registro(s) con errores detectados.`,
            result.errorCount > 0 ? 'error' : 'ok'
        );
    } finally {
        isRecalculatingErrors = false;
        if (localRecalcBtn instanceof HTMLButtonElement) localRecalcBtn.disabled = false;
    }
}

/**
 * Renderiza el panel de resumen del recálculo en memoria.
 * @param {{ mode, total, recalculated, skipped, errorCount, results, timestamp }} result
 */
function renderRecalcSummary(result) {
    const panel = $('localRecalcSummary');
    if (!(panel instanceof HTMLElement)) return;

    const modeLabel = result.mode === 'all' ? 'Todos los registros' : 'Solo pendientes/revisar';
    const ts = result.timestamp ? new Date(result.timestamp).toLocaleString() : '—';

    // Primeras 30 filas con errores para no saturar el DOM
    const maxItems = 30;
    const errRows = (result.results || []).slice(0, maxItems);
    const hiddenCount = (result.results || []).length - errRows.length;

    const itemsHtml = errRows.map((item) => {
        const codeList = item.errors.map((e) => `<span class="lrs-err-code lrs-sev-${e.severity}" title="${e.message}">${e.code}</span>`).join(' ');
        const label = item.pn || item.id || '—';
        return `<li class="lrs-item"><span class="lrs-item-label">${label}</span>${codeList}</li>`;
    }).join('');

    const moreHtml = hiddenCount > 0
        ? `<p class="lrs-more">… y ${hiddenCount} más (ver consola para lista completa).</p>`
        : '';

    panel.hidden = false;
    panel.innerHTML = `
        <div class="lrs-head">
            <strong class="lrs-title">Resumen recálculo en memoria</strong>
            <time class="lrs-ts">${ts}</time>
        </div>
        <ul class="lrs-stats">
            <li><span class="lrs-stat-label">Modo:</span> <span class="lrs-stat-val">${modeLabel}</span></li>
            <li><span class="lrs-stat-label">Registros totales:</span> <span class="lrs-stat-val">${result.total}</span></li>
            <li><span class="lrs-stat-label">Recalculados:</span> <span class="lrs-stat-val">${result.recalculated}</span></li>
            <li><span class="lrs-stat-label">Omitidos:</span> <span class="lrs-stat-val">${result.skipped}</span></li>
            <li><span class="lrs-stat-label">Errores encontrados:</span> <span class="lrs-stat-val lrs-stat-errors">${result.errorCount}</span></li>
        </ul>
        ${errRows.length > 0
            ? `<ol class="lrs-error-list">${itemsHtml}</ol>${moreHtml}`
            : '<p class="lrs-ok">No se detectaron errores en los registros recalculados.</p>'}
    `;
}

async function setRevisionOkImportIfNoErrors() {
    if (!currentRow) return false;

    const isNoiseFooter = String(currentRow?.criterio_pn || '').trim() === 'C_NOISE_FOOTER'
        || String(currentRow?.status || '').trim().toUpperCase() === 'NOISE';

    if (!isNoiseFooter && getRowErrorCount(currentRow) > 0) return 'has-errors';

    const engineFile = resolveEngineFile(currentRow);
    const id = txt(currentRow?.ID, '');
    if (!engineFile || !id) return 'has-errors';

    const nextEstado = 'ok';
    const nextAccion = isNoiseFooter ? 'eliminar' : 'importar';
    const currentEstado = normalizeEstadoToNew(currentRow?.qa_revision_estado);
    const currentAccion = normalizeAccionToNew(currentRow?.qa_revision_accion);

    let changed = false;

    if (currentEstado !== nextEstado) {
        await saveCellToServer(engineFile, id, 'qa_revision_estado', denormalizeEstadoFromNew(nextEstado));
        currentRow.qa_revision_estado = nextEstado;
        changed = true;
    }

    if (currentAccion !== nextAccion) {
        await saveCellToServer(engineFile, id, 'qa_revision_accion', denormalizeAccionFromNew(nextAccion));
        currentRow.qa_revision_accion = nextAccion;
        changed = true;
    }

    if (!changed) return isNoiseFooter ? 'already-ok-eliminar' : 'already-ok-importar';

    publishRevisionSync({
        id,
        engineFile,
        estado: currentRow?.qa_revision_estado,
        accion: currentRow?.qa_revision_accion,
        source: 'analista-02'
    });

    renderReviewStateButtons(currentRow);
    renderReviewStats();
    notifyPdfDataChangedFromAnalista(currentRow);
    return isNoiseFooter ? 'applied-eliminar' : 'applied';
}



// Flujo masivo backend para libro: copia PDF_AUTO y luego recálculo de errores.
async function runQuickRecomputeForFullBook() {

    const engineFilterSelect = $('engineFilterSelect');

    if (!(engineFilterSelect instanceof HTMLSelectElement)) return;



    const selectedModel = String(engineFilterSelect.value || '').trim();

    if (!selectedModel) {

        alert('Selecciona un libro para recalcular.');

        return;

    }



    const confirmed = await confirmTypedAction({

        title: 'Confirmar recálculo completo',

        message: `Se copiara lectura a _pdf y despues se recalcularan ERRORES para todo el libro ${selectedModel}. Esta accion afecta a multiples registros.`,

        expectedText: 'APLICAR',

        confirmLabel: 'Recalcular',

        cancelLabel: 'Cancelar',

        dangerLevel: 'high'

    });

    if (!confirmed) {
        setRecomputeStatus('Operacion cancelada por el usuario.', '');
        return;
    }



    if (!isBackendEndpointAllowed('recompute-qa-errors') || !isBackendEndpointAllowed('recompute-pdf-auto')) {

        setRecomputeStatus(getLocalOnlyBackendMessage('recompute-qa-errors'), 'error');

        return;

    }



    setRecomputeModalInputsForAction(selectedModel, '');

    setQuickRecomputeButtonsDisabled(true);

    try {

        setRecomputeStatus(`Recalculando libro ${selectedModel} completo (Copiar lectura a _pdf + errores)...`, '');

        // Orden correcto para que errores use el _pdf ya sincronizado.
        await runBackendRecomputePdfAuto();

        await runBackendRecompute();

        setRecomputeStatus(`Libro ${selectedModel} recalculado correctamente.`, 'ok');

    } finally {

        setQuickRecomputeButtonsDisabled(false);

    }

}



async function loadEngineForFilter(engineFilter) {

    const engineFile = resolveEngineFileFromFilter(engineFilter);

    if (!engineFile) {

        throw new Error('No se pudo resolver el archivo engine para el filtro seleccionado.');

    }



    const loadedRows = await loadEngineDataByFileName(engineFile);

    state.allData = sortRowsByBookPagePos(loadedRows);



    assignRevisionKeys(state.allData);

    applyRevisionDataToRows(state.allData);

    renderReviewStats();



    const selectedModel = inferEngineModelFromFileName(engineFile);

    const engineSelect = $('engineFilterSelect');

    if (engineSelect instanceof HTMLSelectElement) {

        engineSelect.value = selectedModel;

    }



    const firstRow = state.allData[0] || null;

    if (firstRow) {

        currentRow = firstRow;

        $('recordIdInput').value = getDisplayPnForInput(firstRow);

        currentProcessIndex = 0;

        renderRecord(firstRow);

        return;

    }



    currentRow = null;

    currentProcessIndex = 0;

    $('recordIdInput').value = '';

    renderMeta(null);

    renderReviewStateButtons(null);

    renderReviewStats([]);

    syncPdfWithCurrentRow(null);

}



function resolveEngineFile(row) {

    const sourceFile = String(row?.source_file ?? '').trim();

    if (sourceFile) {

        const base = sourceFile

            .replace(/^engine_/i, '')

            .replace(/\.xlsx$/i, '')

            .replace(/\.json$/i, '')

            .trim();

        if (base) return `engine_${base}.json`;

    }



    const engineModel = String(row?.engine_model ?? '').trim();

    if (!engineModel) return '';

    if (/^engine_/i.test(engineModel)) return `${engineModel}.json`;

    return `engine_${engineModel}.json`;

}



function fillEditFields(row) {

    const pnFinal = $('editPnFinal');

    const desigFinal = $('editDesignationFinal');

    const measFinal = $('editMeasurementFinal');

    const weightFinal = $('editWeightFinal');

    const revEstado = $('editRevisionEstado');

    const revAccion = $('editRevisionAccion');

    if (pnFinal) pnFinal.value = txt(row?.pn_final, '');

    if (desigFinal) desigFinal.value = txt(row?.designation_final, '');

    if (measFinal) measFinal.value = txt(row?.measure_final ?? row?.measurement_final, '');

    if (weightFinal) weightFinal.value = txt(row?.weight_final, '');

    if (revEstado) revEstado.value = txt(row?.qa_revision_estado, '');

    if (revAccion) revAccion.value = txt(row?.qa_revision_accion, '');

}



function getRowErrorCount(row) {

    const total = Number(row?.total_error);

    if (Number.isFinite(total)) return total;



    const fallback = [

        'pos_error',

        'pn_error',

        'designation_error',

        'weight_error',

        'measure_error',

        'norma_error',

        'bom_error'

    ].reduce((sum, key) => {

        const value = Number(row?.[key]);

        return sum + (Number.isFinite(value) ? value : 0);

    }, 0);



    if (fallback > 0) return fallback;

    return row?.has_error ? 1 : 0;

}



function renderReviewStats(rows = getQueueRows(), row = currentRow) {

    const stats = {

        total: 0,

        importOk: 0,

        copyOk: 0,

        reviewOk: 0,

        deleteOk: 0,

        pending: 0

    };

    const uniqueStats = {

        total: new Set(),

        importOk: new Set(),

        copyOk: new Set(),

        reviewOk: new Set(),

        deleteOk: new Set(),

        pending: new Set()

    };



    (Array.isArray(rows) ? rows : []).forEach((entry) => {

        const distinctKey = getDistinctRowKey(entry);

        const estado = normalizeEstadoToNew(entry?.qa_revision_estado);

        const accion = normalizeAccionToNew(entry?.qa_revision_accion);



        stats.total += 1;

        uniqueStats.total.add(distinctKey);



        if (estado !== 'ok') {

            stats.pending += 1;

            uniqueStats.pending.add(distinctKey);

            return;

        }



        if (accion === 'revisar') {

            stats.reviewOk += 1;

            uniqueStats.reviewOk.add(distinctKey);

            return;

        }



        if (accion === 'eliminar') {

            stats.deleteOk += 1;

            uniqueStats.deleteOk.add(distinctKey);

            return;

        }



        if (accion === 'copia') {

            stats.copyOk += 1;

            uniqueStats.copyOk.add(distinctKey);

            return;

        }



        stats.importOk += 1;

        uniqueStats.importOk.add(distinctKey);

    });



    const totalEl = $('statsTotalAnalysed');

    const currentEl = $('statsCurrentIndex');

    const totalUniqueEl = $('statsUniqueTotalAnalysed');

    const importOkEl = $('statsTotalImportOk');

    const importOkUniqueEl = $('statsUniqueTotalImportOk');

    const copyOkEl = $('statsTotalCopyOk');

    const copyOkUniqueEl = $('statsUniqueTotalCopyOk');

    const reviewOkEl = $('statsTotalReviewOk');

    const reviewOkUniqueEl = $('statsUniqueTotalReviewOk');

    const deleteOkEl = $('statsTotalDeleteOk');

    const deleteOkUniqueEl = $('statsUniqueTotalDeleteOk');

    const pendingEl = $('statsTotalPending');

    const pendingUniqueEl = $('statsUniqueTotalPending');



    let currentIndex = 0;

    if (row && stats.total > 0) {

        const idx = rows.findIndex(item => getRevisionKey(item) === getRevisionKey(row));

        currentIndex = idx >= 0 ? idx + 1 : 0;

    }



    if (totalEl instanceof HTMLElement) totalEl.textContent = String(stats.total);

    if (currentEl instanceof HTMLElement) currentEl.textContent = String(currentIndex);

    if (totalUniqueEl instanceof HTMLElement) totalUniqueEl.textContent = `· ${uniqueStats.total.size} únicos`;

    if (importOkEl instanceof HTMLElement) importOkEl.textContent = String(stats.importOk);

    if (importOkUniqueEl instanceof HTMLElement) importOkUniqueEl.textContent = `· ${uniqueStats.importOk.size} únicos`;

    if (copyOkEl instanceof HTMLElement) copyOkEl.textContent = String(stats.copyOk);

    if (copyOkUniqueEl instanceof HTMLElement) copyOkUniqueEl.textContent = `· ${uniqueStats.copyOk.size} únicos`;

    if (reviewOkEl instanceof HTMLElement) reviewOkEl.textContent = String(stats.reviewOk);

    if (reviewOkUniqueEl instanceof HTMLElement) reviewOkUniqueEl.textContent = `· ${uniqueStats.reviewOk.size} únicos`;

    if (deleteOkEl instanceof HTMLElement) deleteOkEl.textContent = String(stats.deleteOk);

    if (deleteOkUniqueEl instanceof HTMLElement) deleteOkUniqueEl.textContent = `· ${uniqueStats.deleteOk.size} únicos`;

    if (pendingEl instanceof HTMLElement) pendingEl.textContent = String(stats.pending);

    if (pendingUniqueEl instanceof HTMLElement) pendingUniqueEl.textContent = `· ${uniqueStats.pending.size} únicos`;



    // Update nav button labels with counts

    const queue = rows;

    const errorCount = queue.filter(r => rowHasErrors(r)).length;

    const reviewCount = queue.filter(r => rowHasReviewAction(r)).length;

    const pendingCount = queue.filter(r => rowIsPending(r)).length;

    const errorNavSpan = document.querySelector('.a2-search-nav.is-error .a2-search-nav-center');

    const reviewNavSpan = document.querySelector('.a2-search-nav.is-review .a2-search-nav-center');

    const pendingNavSpan = document.querySelector('.a2-search-nav.is-pending .a2-search-nav-center');

    if (errorNavSpan instanceof HTMLElement) errorNavSpan.textContent = `Error (${errorCount})`;

    if (reviewNavSpan instanceof HTMLElement) reviewNavSpan.textContent = 'Revisar';

    if (pendingNavSpan instanceof HTMLElement) pendingNavSpan.textContent = 'Pendiente';

}



function renderReviewStateButtons(row) {

    const estadoSelect = $('statusEstadoSelect');

    const accionSelect = $('statusAccionSelect');

    if (!(estadoSelect instanceof HTMLSelectElement) || !(accionSelect instanceof HTMLSelectElement)) {

        return;

    }



    const estadoOkBtn = $('statusEstadoOkBtn');

    const estadoPendingBtn = $('statusEstadoPendingBtn');

    const accionImportarBtn = $('statusAccionImportarBtn');

    const accionCopiaBtn = $('statusAccionCopiaBtn');

    const accionRevisarBtn = $('statusAccionRevisarBtn');

    const accionEliminarBtn = $('statusAccionEliminarBtn');



    const estado = normalizeEstadoToNew(row?.qa_revision_estado);

    const accion = normalizeAccionToNew(row?.qa_revision_accion);



    estadoSelect.value = estado === 'ok' ? 'ok' : 'pendiente';

    if (accion === 'revisar') accionSelect.value = 'revisar';

    else if (accion === 'eliminar') accionSelect.value = 'eliminar';

    else if (accion === 'copia') accionSelect.value = 'copia';

    else accionSelect.value = 'importar';



    if (estadoOkBtn instanceof HTMLElement) {

        estadoOkBtn.classList.toggle('is-active', estado === 'ok');

    }

    if (estadoPendingBtn instanceof HTMLElement) {

        estadoPendingBtn.classList.toggle('is-active', estado !== 'ok');

    }

    if (accionImportarBtn instanceof HTMLElement) {

        accionImportarBtn.classList.toggle('is-active', accion === 'importar');

    }

    if (accionCopiaBtn instanceof HTMLElement) {

        accionCopiaBtn.classList.toggle('is-active', accion === 'copia');

    }

    if (accionRevisarBtn instanceof HTMLElement) {

        accionRevisarBtn.classList.toggle('is-active', accion === 'revisar');

    }

    if (accionEliminarBtn instanceof HTMLElement) {

        accionEliminarBtn.classList.toggle('is-active', accion === 'eliminar');

    }

}



function updateRecordSearchSuggestions() {

    const list = $('recordSearchList');

    if (!(list instanceof HTMLDataListElement)) return;



    const model = String($('engineFilterSelect')?.value || '').trim();

    const scopedRows = model

        ? (state.allData || []).filter((row) => String(row?.engine_model ?? '').trim() === model)

        : (state.allData || []);



    const seen = new Set();

    const options = [];

    scopedRows.forEach((row) => {

        const pn = getDisplayPn(row);

        const designation = txt(row?.designation_final || row?.DESIGNATION, '-');

        const id = txt(row?.ID, '-');

        const value = pn && pn !== '-' ? pn : id;

        if (!value || value === '-') return;

        const key = String(value).toLowerCase();

        if (seen.has(key)) return;

        seen.add(key);

        options.push({ value, label: `${designation} | ID ${id}` });

    });



    list.innerHTML = options

        .slice(0, 300)

        .map((option) => `<option value="${escapeHtml(option.value)}" label="${escapeHtml(option.label)}"></option>`)

        .join('');

}



function renderMeta(row) {

    const target = $('recordMeta');

    if (!(target instanceof HTMLElement)) return;



    if (!row) {

        target.textContent = 'Sin registro cargado.';

        return;

    }



    const rowId = row?.ID ?? row?.id ?? '';

    target.innerHTML = `<div class="a2-meta-inline" aria-label="Resumen de registro">

<span class="a2-meta-item"><span class="a2-meta-k">Pag</span><strong class="a2-meta-v">${escapeHtml(txt(row?.['Source Page']))}</strong></span>

<span class="a2-meta-sep" aria-hidden="true">|</span>

<span class="a2-meta-item"><span class="a2-meta-k">ID</span><strong class="a2-meta-v">${escapeHtml(txt(rowId))}</strong></span>

<span class="a2-meta-sep" aria-hidden="true">|</span>

<span class="a2-meta-item a2-meta-item-designation"><span class="a2-meta-k">Designation</span><strong class="a2-meta-v" title="${escapeHtml(txt(row?.designation_final || row?.DESIGNATION))}">${escapeHtml(txt(row?.designation_final || row?.DESIGNATION))}</strong></span>

<button id="openEditRecordBtn" type="button" class="a2-meta-edit-btn">EDITAR</button>

</div>`;



    const editBtn = $('openEditRecordBtn');

    if (editBtn instanceof HTMLButtonElement) {

        editBtn.addEventListener('click', () => {

            openEditRecordModalForRow();

        });

    }

}



function getGesaPn(row) {

    const isGesaSi = String(row?.gesa ?? '').trim().toUpperCase() === 'SI';

    if (!isGesaSi) return null;

    return String(row?.pn_final ?? '').trim() || null;

}



function getSustPn(row) {

    // sust_status === "SI" indica que el PN aparece en el Excel SUST.

    // Este flag se usa SOLO para mostrar la columna SUST en la comparativa de analista.

    // NO determina si un registro se exporta como New o Superseded.

    // La clasificación de exportación depende exclusivamente de sust_hierarchie === "Superseded".

    const isSustSi = String(row?.sust_status ?? '').trim().toUpperCase() === 'SI';

    if (!isSustSi) return null;

    return String(row?.pn_final ?? '').trim() || null;

}



function getGesaWeightWithUnits(row) {

    renderReviewStats();

    const weight = String(row?.weight_gesa ?? '').trim();

    const units = String(row?.units ?? '').trim();

    if (weight && units) return `${weight} ${units}`;

    if (weight) return weight;

    return null;

}

// Visualizacion exacta para columnas GESA/SUST/PDF/FINAL en analista_02:
// devuelve solo el valor del campo solicitado, sin lookup ni fallback.
function getExactField(row, fieldName) {
    if (!row || typeof row !== 'object') return undefined;
    return row[fieldName];
}



// ─── MAPA DE CAMPOS – FIELD REGISTRY REFACTORIZADO ──────────────────────────────────────────────
// buildComparisonRows produce entradas con propiedades semánticas alineadas con el field registry:
//   excel  → campo_excel  (origen Excel; con fallback al nombre legacy si _excel no existe aún)
//   gesa   → campo_gesa   (datos enriquecidos GESA)
//   subst  → campo_subst  (datos de sustitución)
//   pdf    → campo_pdf    (valor PDF almacenado, calculado por recompute-pdf-auto)
//   final  → campo_final  (valor final consolidado)
//   errorKey → campo_error (campo numérico de errores en JSON)
//   fieldKeys → mapa fuente→clave técnica, para modo depuración
// Las propiedades legacy (raw, sust) se mantienen como aliases para compatibilidad.
// Ver js/fieldAdapter.js para resolución de aliases y normalización de nombres.
function buildComparisonRows(row) {

    return [

        {

            field: 'POS', base: 'pos',

            excel: firstNonEmpty(row?.pos_excel, row?.POS),

            gesa: null,

            subst: null,

            pdf: row?.pos_pdf,

            final: row?.pos_final,

            errorKey: 'pos_error',

            pdfAutoAction: 'pos',

            fieldKeys: { excel: 'pos_excel / POS', gesa: null, subst: null, pdf: 'pos_pdf', final: 'pos_final', error: 'pos_error' },

            errFields: ['POS'],

            raw: firstNonEmpty(row?.pos_excel, row?.POS), sust: null

        },

        {

            field: 'PART NO.', base: 'pn',

            excel: firstNonEmpty(row?.pn_excel, row?.['PART NO.']),

            // En GESA/SUST/PDF/FINAL se muestra solo campo exacto, sin fallbacks.
            gesa: getExactField(row, 'pn_gesa'),

            subst: getExactField(row, 'pn_subst'),

            pdf: getExactField(row, 'pn_pdf'),

            final: getExactField(row, 'pn_final'),

            errorKey: 'pn_error',

            pdfAutoAction: 'pn',

            fieldKeys: { excel: 'pn_excel / PART NO.', gesa: 'pn_final (si gesa=SI)', subst: 'pn_final (si sust_status=SI)', pdf: 'pn_pdf', final: 'pn_final', error: 'pn_error' },

            errFields: ['PART NO.', 'pn_final'],

            raw: firstNonEmpty(row?.pn_excel, row?.['PART NO.']), sust: getSustPn(row)

        },

        {

            field: 'DESIGNATION', base: 'designation',

            excel: firstNonEmpty(row?.designation_excel, row?.DESIGNATION),

            gesa: getExactField(row, 'designation_gesa'),

            subst: getExactField(row, 'designation_subst'),

            pdf: getExactField(row, 'designation_pdf'),

            final: getExactField(row, 'designation_final'),

            errorKey: 'designation_error',

            pdfAutoAction: 'designation',

            fieldKeys: { excel: 'designation_excel / DESIGNATION', gesa: 'designation_gesa', subst: null, pdf: 'designation_pdf', final: 'designation_final', error: 'designation_error' },

            errFields: ['designation_final'],

            raw: firstNonEmpty(row?.designation_excel, row?.DESIGNATION), sust: null

        },

        {

            field: 'MODEL/TYPE', base: 'model_type',

            excel: firstNonEmpty(row?.model_type_excel, row?.['MODEL/TYPE']),

            gesa: getExactField(row, 'model_type_gesa'),

            subst: getExactField(row, 'model_type_subst'),

            pdf: getExactField(row, 'model_type_pdf'),

            final: getExactField(row, 'model_type_final'),

            errorKey: 'model_type_error',

            fieldKeys: { excel: 'model_type_excel / MODEL/TYPE', gesa: null, subst: null, pdf: 'model_type_pdf', final: 'model_type_final', error: 'model_type_error' },

            errFields: [],

            raw: firstNonEmpty(row?.model_type_excel, row?.['MODEL/TYPE']), sust: null

        },

        {

            field: 'QTY', base: 'qty',

            excel: firstNonEmpty(row?.qty_excel, row?.QTY),

            gesa: getExactField(row, 'qty_gesa'),

            subst: getExactField(row, 'qty_subst'),

            pdf: getExactField(row, 'qty_pdf'),

            final: getExactField(row, 'qty_final'),

            errorKey: 'qty_error',

            fieldKeys: { excel: 'qty_excel / QTY', gesa: null, subst: null, pdf: 'qty_pdf', final: 'qty_final', error: 'qty_error' },

            errFields: [],

            raw: firstNonEmpty(row?.qty_excel, row?.QTY), sust: null

        },

        {

            field: 'UNITS', base: 'qty_units',

            excel: firstNonEmpty(row?.qty_units_excel, row?.UNITS),

            gesa: getExactField(row, 'units_gesa'),

            subst: getExactField(row, 'units_subst'),

            pdf: getExactField(row, 'units_pdf'),

            final: getExactField(row, 'units_final'),

            errorKey: 'units_error',

            fieldKeys: { excel: 'qty_units_excel / UNITS', gesa: null, subst: null, pdf: 'units_pdf', final: 'units_final', error: 'units_error' },

            errFields: [],

            raw: firstNonEmpty(row?.qty_units_excel, row?.UNITS), sust: null

        },

        {

            field: 'WEIGHT', base: 'weight',

            excel: firstNonEmpty(row?.weight_excel, row?.WEIGHT),

            // Excepcion acordada: en GESA se muestra weight_gesa concatenado con units.
            gesa: getGesaWeightWithUnits(row),

            subst: getExactField(row, 'weight_subst'),

            pdf: getExactField(row, 'weight_pdf'),

            final: getExactField(row, 'weight_final'),

            errorKey: 'weight_error',

            fieldKeys: { excel: 'weight_excel / WEIGHT', gesa: 'weight_gesa + units', subst: null, pdf: 'weight_pdf', final: 'weight_final', error: 'weight_error' },

            errFields: [],

            raw: firstNonEmpty(row?.weight_excel, row?.WEIGHT), sust: null

        },

        {

            field: 'FN', base: 'fn',

            excel: firstNonEmpty(row?.fn_excel, row?.FN),

            gesa: getExactField(row, 'fn_gesa'),

            subst: getExactField(row, 'fn_subst'),

            pdf: getExactField(row, 'fn_pdf'),

            final: getExactField(row, 'fn_final'),

            errorKey: 'fn_error',

            fieldKeys: { excel: 'fn_excel / FN', gesa: null, subst: null, pdf: 'fn_pdf', final: 'fn_final', error: 'fn_error' },

            errFields: [],

            raw: firstNonEmpty(row?.fn_excel, row?.FN), sust: null

        },

        {

            field: 'MEASUREMENT / STANDARD', base: 'measure',

            excel: firstNonEmpty(row?.measure_excel, row?.['MEASUREMENT / STANDARD']),

            gesa: getExactField(row, 'dimensions_gesa'),

            subst: getExactField(row, 'measure_subst'),

            pdf: getExactField(row, 'measure_pdf'),

            final: getExactField(row, 'measure_final'),

            errorKey: 'measure_error',

            fieldKeys: { excel: 'measure_excel / MEASUREMENT / STANDARD', gesa: 'measure_gesa / dimensions_gesa', subst: null, pdf: 'measure_pdf', final: 'measure_final', error: 'measure_error' },

            errFields: [],

            raw: firstNonEmpty(row?.measure_excel, row?.['MEASUREMENT / STANDARD']), sust: null

        },

        {

            field: 'FG/FGS', base: 'fg_fgs',

            excel: firstNonEmpty(row?.fg_fgs_excel, row?.['FG/FGS']),

            gesa: getExactField(row, 'fg_fgs_gesa'),

            subst: getExactField(row, 'fg_fgs_subst'),

            pdf: getExactField(row, 'fg_fgs_pdf'),

            final: getExactField(row, 'fg_fgs_final'),

            errorKey: 'fg_fgs_error',

            fieldKeys: { excel: 'fg_fgs_excel / FG/FGS', gesa: null, subst: null, pdf: 'fg_fgs_pdf', final: 'fg_fgs_final', error: 'fg_fgs_error' },

            errFields: [],

            raw: firstNonEmpty(row?.fg_fgs_excel, row?.['FG/FGS']), sust: null

        },

        {

            field: 'BOM-No.', base: 'bom',

            excel: firstNonEmpty(row?.bom_excel, row?.['BOM-No.']),

            gesa: getExactField(row, 'bom_gesa'),

            subst: getExactField(row, 'bom_subst'),

            pdf: getExactField(row, 'bom_pdf'),

            final: getExactField(row, 'bom_final'),

            errorKey: 'bom_error',

            fieldKeys: { excel: 'bom_excel / BOM-No.', gesa: null, subst: null, pdf: 'bom_pdf', final: 'bom_final', error: 'bom_error' },

            errFields: [],

            raw: firstNonEmpty(row?.bom_excel, row?.['BOM-No.']), sust: null

        },

        {

            field: 'GESA', base: 'isgesa',

            excel: null,

            gesa: getExactField(row, 'gesa'),

            subst: getExactField(row, 'gesa_subst'),

            pdf: getExactField(row, 'gesa_pdf'),

            final: getExactField(row, 'gesa_final'),

            errorKey: 'gesa_error',

            separatorTop: true,

            fieldKeys: { excel: null, gesa: 'gesa', subst: null, pdf: 'gesa_pdf', final: 'gesa_final', error: 'gesa_error' },

            errFields: [],

            raw: null, sust: null

        },

        {

            field: 'NSN', base: 'nsn',

            excel: null,

            gesa: getExactField(row, 'nsn'),

            subst: getExactField(row, 'nsn_subst'),

            pdf: getExactField(row, 'nsn_pdf'),

            final: getExactField(row, 'nsn_final'),

            errorKey: 'nsn_error',

            fieldKeys: { excel: null, gesa: 'nsn', subst: null, pdf: 'nsn_pdf', final: 'nsn_final', error: 'nsn_error' },

            errFields: [],

            raw: null, sust: null

        },

        {

            field: 'NORMALIZADO', base: 'is_norma',

            excel: null,

            gesa: getExactField(row, 'normalizado'),

            subst: getExactField(row, 'normalizado_subst'),

            pdf: getExactField(row, 'normalizado_pdf'),

            final: getExactField(row, 'normalizado_final'),

            errorKey: 'normalizado_error',

            fieldKeys: { excel: null, gesa: 'normalizado', subst: null, pdf: 'normalizado_pdf', final: 'normalizado_final', error: 'normalizado_error' },

            errFields: [],

            raw: null, sust: null

        },

        {

            field: 'NORMA', base: 'norma',

            excel: null,

            gesa: getExactField(row, 'norma'),

            subst: getExactField(row, 'norma_subst'),

            pdf: getExactField(row, 'norma_pdf'),

            final: getExactField(row, 'norma_final'),

            errorKey: 'norma_error',

            fieldKeys: { excel: null, gesa: 'norma', subst: null, pdf: 'norma_pdf', final: 'norma_final', error: 'norma_error' },

            errFields: [],

            raw: null, sust: null

        },

        {

            field: 'SUST_STATUS', base: 'is_subst',

            excel: null,

            gesa: getExactField(row, 'sust_status_gesa'),

            subst: getExactField(row, 'sust_status'),

            pdf: getExactField(row, 'sust_status_pdf'),

            final: getExactField(row, 'sust_status_final'),

            errorKey: null,

            separatorTop: true,

            fieldKeys: { excel: null, gesa: null, subst: 'sust_status', pdf: 'sust_status_pdf', final: 'sust_status_final', error: null },

            errFields: [],

            raw: null, sust: row?.sust_status

        },

        {

            field: 'HIERARCHI', base: 'hierarchie',

            excel: null,

            gesa: null,

            subst: getExactField(row, 'sust_hierarchie'),

            pdf: getExactField(row, 'hierarchi_pdf'),

            final: getExactField(row, 'hierarchie_final'),

            errorKey: null,

            fieldKeys: { excel: null, gesa: null, subst: 'hierarchie_subst / sust_hierarchie / hierarchi', pdf: 'hierarchi_pdf', final: 'hierarchie_final', error: null },

            errFields: [],

            raw: null, sust: getExactField(row, 'sust_hierarchie')

        },

        {

            field: 'SUST_NEW_PART_NUMBER', base: 'new_pn',

            excel: null,

            gesa: null,

            subst: getExactField(row, 'sust_new_part_number'),

            pdf: getExactField(row, 'sust_new_part_number_pdf'),

            final: getExactField(row, 'new_pn_final'),

            errorKey: null,

            fieldKeys: { excel: null, gesa: null, subst: 'new_pn_subst / sust_new_part_number', pdf: 'sust_new_part_number_pdf', final: 'new_pn_final', error: null },

            errFields: [],

            raw: null, sust: getExactField(row, 'sust_new_part_number')

        },

        {

            field: 'SUST_SUPERSEDED_LIST', base: 'subst_pnlist',

            excel: null,

            gesa: null,

            subst: getExactField(row, 'sust_superseded_list'),

            pdf: getExactField(row, 'sust_superseded_list_pdf'),

            final: getExactField(row, 'subst_pnlist_final'),

            errorKey: null,

            fieldKeys: { excel: null, gesa: null, subst: 'subst_pnlist_subst / sust_superseded_list', pdf: 'sust_superseded_list_pdf', final: 'subst_pnlist_final', error: null },

            errFields: [],

            raw: null, sust: getExactField(row, 'sust_superseded_list')

        }

    ];

}



function isBomField(fieldName) {

    return String(fieldName ?? '').trim().toLowerCase().includes('bom');

}



function findPdfPnAnchor(row, pageText) {

    if (!pageText || !pageText.normalizedText) return null;



    const pnCandidates = [row?.pn_final, row?.['PART NO.']]

        .map(value => String(value ?? '').trim())

        .filter(Boolean);



    for (const candidate of pnCandidates) {

        const normalized = normalizePdfToken(candidate);

        const clusterMatch = pageText.clusters.find((cluster) => tokenMatchesPdf(cluster.normalized, normalized));

        if (clusterMatch) return { lineIndex: clusterMatch.lineIndex, token: normalized };



        const itemMatch = pageText.items.find((item) => tokenMatchesPdf(item.normalized, normalized));

        if (itemMatch) return { lineIndex: itemMatch.lineIndex, token: normalized };

    }



    return null;

}



function getPdfValueForRow(row, entry, pageText, pnAnchor) {

    if (!pageText || !pageText.normalizedText) return { value: '-', token: '' };

    if (!pnAnchor) return { value: '-', token: '' };



    const searchClustersLine = isBomField(entry.field)

        ? pageText.clusters

        : pageText.clusters.filter((cluster) => cluster.lineIndex === pnAnchor.lineIndex);

    const searchItemsLine = isBomField(entry.field)

        ? pageText.items

        : pageText.items.filter((item) => item.lineIndex === pnAnchor.lineIndex);



    const searchScopes = [

        { clusters: searchClustersLine, items: searchItemsLine },

        { clusters: pageText.clusters, items: pageText.items }

    ];



    const candidates = [entry.final, entry.gesa, entry.raw]

        .map(value => String(value ?? '').trim())

        .filter(value => value && value !== '-');



    const seen = new Set();

    for (const candidate of candidates) {

        const key = candidate.toLowerCase();

        if (seen.has(key)) continue;

        seen.add(key);



        const normalized = normalizePdfToken(candidate);

        for (const scope of searchScopes) {

            const clusterMatch = scope.clusters.find((cluster) => tokenMatchesPdf(cluster.normalized, normalized));

            if (clusterMatch) {

                const exactMatch = extractExactPdfSubstring(clusterMatch.text, candidate);

                if (exactMatch) {

                    return { value: exactMatch, token: normalizePdfToken(exactMatch) };

                }

            }



            const itemMatch = scope.items.find((item) => tokenMatchesPdf(item.normalized, normalized));

            if (itemMatch) {

                const exactMatch = extractExactPdfSubstring(itemMatch.text, candidate) || itemMatch.text;

                if (exactMatch) {

                    return { value: exactMatch, token: normalizePdfToken(exactMatch) };

                }

            }

        }



        if (tokenMatchesPdf(pageText.normalizedText, normalized)) {

            return { value: candidate, token: normalized };

        }

    }



    return { value: '-', token: '' };

}



// Renderiza la tabla comparativa con 7 columnas (field registry refactorizado):
// Campo | Excel | GESA | SUBST | PDF | Final | Error
// El paso síncrono muestra valores almacenados inmediatamente.
// El paso asíncrono lee el PDF en segundo plano solo para resaltado de tokens (sin re-render de tabla).
async function renderComparisonTable(row) {

    const body = $('comparisonBody');

    if (!(body instanceof HTMLElement)) return;



    const rows = buildComparisonRows(row);

    setPdfReadTokens([]);



    // ── Paso 1: render síncrono con todos los valores almacenados ──────────────────────────────
    function buildRowHtml(entry, cellClasses) {

        const rowClass = entry.separatorTop ? 'separator-top' : '';

        // entry.pdf contiene el valor campo_pdf almacenado (antes PDF_AUTO).
        // entry.errorKey contiene el nombre del campo de error en el JSON (_error).
        const errCount = entry.errorKey ? (Number(row?.[entry.errorKey]) || 0) : 0;

        const errCellClass = errCount > 0 ? 'field-err has-errors' : 'field-err';

        const errTitle = errCount > 0 ? ` title="${escapeHtml(`Errores persistidos en JSON: ${errCount}`)}"` : '';

        const finalFullClass = [cellClasses.finalClass].filter(Boolean).join(' ');

        const finalEditAttrs = '';

        const pdfActionAttrs = '';

        // Aviso discreto en celda PDF cuando el valor está vacío para cualquier
        // campo que tenga mapeo PDF en la tabla comparativa.
        // Solo visual, no afecta guardado ni lógica de validación.
        const pdfIsEmpty = !txt(entry.pdf) || txt(entry.pdf) === '-';

        const hasPdfMappedField = Boolean(entry.fieldKeys?.pdf);

        const pdfEmptyHint = pdfIsEmpty && hasPdfMappedField

            ? ' pdf-empty-hint'

            : '';

        const pdfCellTitle = pdfIsEmpty && hasPdfMappedField

            ? ` title="PDF sin calcular – ejecuta Rec. para obtener valor"`

            : '';

        // Atributos data-field-key para modo depuración (muestra nombre técnico del campo al activar Debug)

        const fk = entry.fieldKeys || {};

        return `<tr class="${rowClass}">

            <td class="field" data-field-key="${escapeHtml(entry.base || entry.field)}">${escapeHtml(entry.field)}</td>

            <td class="${cellClasses.excelClass}" data-field-key="${escapeHtml(fk.excel || '')}">${escapeHtml(txt(entry.excel ?? entry.raw))}</td>

            <td class="${cellClasses.gesaClass}" data-field-key="${escapeHtml(fk.gesa || '')}">${escapeHtml(txt(entry.gesa))}</td>

            <td class="${cellClasses.substClass}" data-field-key="${escapeHtml(fk.subst || '')}">${escapeHtml(txt(entry.subst ?? entry.sust))}</td>

            <td class="${cellClasses.pdfClass}${pdfEmptyHint}"${pdfActionAttrs}${pdfCellTitle} data-field-key="${escapeHtml(fk.pdf || '')}">${escapeHtml(txt(entry.pdf))}</td>

            <td class="${finalFullClass}"${finalEditAttrs} data-field-key="${escapeHtml(fk.final || '')}">${escapeHtml(txt(entry.final))}</td>

            <td class="${errCellClass}"${errTitle} data-field-key="${escapeHtml(fk.error || '')}">${errCount > 0 ? errCount : ''}</td>

        </tr>`;

    }



    body.innerHTML = rows.map((entry) => {

        const cellClasses = getComparisonCellClasses(entry);

        return buildRowHtml(entry, cellClasses);

    }).join('');



    // ── Paso 2 (opcional): lectura asíncrona del PDF en segundo plano (ruta pesada) ─────

    if (!PDF_FEATURE_BACKGROUND_TOKEN_SCAN_ENABLED) {
        return;
    }

    const renderToken = ++comparisonRenderToken;

    // Rendimiento: diferir lectura pesada del texto PDF para no bloquear la carga inicial del visor.
    setTimeout(async () => {

        if (renderToken !== comparisonRenderToken) return;



        const pageText = await getPdfPageNormalizedText(row?.engine_model, row?.['Source Page']);

        if (renderToken !== comparisonRenderToken) return;



        const pnAnchor = findPdfPnAnchor(row, pageText);

        const readTokens = [];

        rows.forEach((entry) => {

            const pdfRead = getPdfValueForRow(row, entry, pageText, pnAnchor);

            if (pdfRead.token) {

                readTokens.push({ field: entry.field, token: pdfRead.token });

            }

        });



        const dedupedReadTokens = [];

        const seenReadTokens = new Set();

        readTokens.forEach((entry) => {

            const key = `${String(entry.field || '').toLowerCase()}|${entry.token}`;

            if (seenReadTokens.has(key)) return;

            seenReadTokens.add(key);

            dedupedReadTokens.push(entry);

        });



        setPdfReadTokens(dedupedReadTokens);

        // Recalcular overlays cuando los tokens estén listos.
        requestPdfRelayout();

    }, 120);

}



function renderProcessList(row, processState) {

    const list = $('processList');

    const summary = $('processSummary');

    if (!(list instanceof HTMLElement) || !(summary instanceof HTMLElement)) return;



    const steps = processState.steps;

    summary.textContent = `${processState.executed}/${steps.length} procesos ejecutados`;



    list.innerHTML = steps.map((step, index) => {

        let cssClass = 'pending';

        let stateLabel = 'PENDIENTE';



        if (index < processState.executed) {

            if (step.pass) {

                cssClass = 'pass';

                stateLabel = 'PASS';

            } else {

                cssClass = 'fail';

                stateLabel = 'FAIL';

            }

        }



        return `<li class="${cssClass}">

            <div class="head">

                <span class="title">${index + 1}. ${step.title}</span>

                <span class="state">${stateLabel}</span>

            </div>

            <p>${step.detail}</p>

        </li>`;

    }).join('');

}



function renderEvidence(row, processState) {

    const statusText = $('statusText');

    const evidence = $('evidenceList');

    if (!(statusText instanceof HTMLElement) || !(evidence instanceof HTMLElement)) return;



    statusText.textContent = processState.message;



    const lines = [];

    lines.push(`<li>Registro: PN/PART NO ${getDisplayPn(row)} | ${txt(row?.engine_model)} / ${txt(row?.['Source Page'])} / POS ${txt(row?.POS)}</li>`);

    lines.push(`<li class="${processState.status === 'ok' ? 'ok' : processState.status === 'ko' ? 'ko' : ''}">Veredicto actual: ${processState.title}</li>`);



    const storedErrors = getStoredErrorSummary(row);

    if (storedErrors.length) {

        storedErrors.forEach((entry) => {

            lines.push(`<li class="ko">Error persistido: ${escapeHtml(entry.field)} = ${entry.count}</li>`);

        });

    } else {

        lines.push('<li class="ok">Sin errores persistidos en el JSON para este registro.</li>');

    }



    evidence.innerHTML = lines.join('');

}



function renderVerdict(processState) {

    const verdict = $('globalVerdict');

    if (!(verdict instanceof HTMLElement)) return;



    verdict.classList.remove('raw', 'ok', 'ko');

    verdict.classList.add(processState.status);

    verdict.textContent = processState.title;

}



async function syncPdfWithCurrentRow(row) {

    if (!row) {

        setPdfSelection(null);

        loadPdfClear();

        return;

    }

    const book = String(row?.engine_model ?? '').trim();

    const page = String(row?.['Source Page'] ?? '').trim();

    if (!book || !page) {

        setPdfSelection(null);

        loadPdfClear();

        return;

    }

    const pageNum = parseInt(page.replace(/[^0-9]/g, ''), 10);

    const isDifferentPage = !(

        state.currentPdfPageNumber === pageNum

        && state.currentPdfSource.endsWith(encodeURIComponent(book) + '.pdf')

        && Array.isArray(state.currentPdfLastTextItems)

        && state.currentPdfLastTextItems.length > 0

    );

    if (isDifferentPage) {

        clearPdfHeaderOnlyOverlay();

        clearPdfHeaderColumnBodyHighlights();

    }

    // Usa la misma función que el botón rojo: busca el PN/POS y dibuja la banda roja.
    await highlightPdfLineForPnFinal(row);

    if (isDifferentPage) {

        runPdfHeaderOnlyDetection();

        buildHeaderColumnBodyHighlights();

        requestPdfRelayout();

    }

    // Auto: al cargar/sincronizar PDF, detectar siempre BOM + FG/FGS en cabecera superior.
    try {
        await detectTopBomAndFgInPdf(row);
    } catch (error) {
        console.warn('No se pudo ejecutar deteccion automatica Top BOM/FG:', error);
    }

}



// Experimental: detecta la fila del PDF a partir de pn_final y dibuja una banda completa.
// Si pn_final no aparece, usa POS como fallback y cambia la banda a naranja.
async function highlightPdfLineForPnFinal(record = currentRow) {

    const requestId = ++pdfRowHighlightRequestId;

    console.log('[A2] highlightPdfRowByPnFinal: iniciando');

    if (window.clearHeaderDetectionDebug) {
        window.clearHeaderDetectionDebug();
    }

    if (!record) {
        setPdfExperimentalRowHighlights(null);
        requestPdfRelayout();
        alert('Primero debes cargar un registro para marcar fila PN.');
        return;
    }

    const book = String(record?.engine_model ?? '').trim();
    const sourcePage = String(record?.['Source Page'] ?? '').trim();

    if (!book || !sourcePage) {
        console.warn('[A2][PDF_ROW_EXPERIMENT] Sin libro/página para buscar PN en PDF.', { book, sourcePage });
        setPdfExperimentalRowHighlights(null);
        requestPdfRelayout();
        alert('No se pudo resolver libro/página del PDF para el registro actual.');
        return;
    }

    const pnFinal = normalizeString(record?.pn_final);
    const posValue = normalizeString(record?.POS ?? record?.pos_final ?? record?.pos);

    if (!pnFinal) {
        console.warn('[A2][PDF_ROW_EXPERIMENT] Registro sin pn_final.');
        setPdfExperimentalRowHighlights(null);
        requestPdfRelayout();
        alert('El registro actual no tiene pn_final para marcar la línea en el PDF.');
        return;
    }

    setPdfSelection(record);
    await loadPdfWithPage(book, sourcePage);

    if (requestId !== pdfRowHighlightRequestId) {
        return;
    }

    let lineMatch = await findPdfLineByPnFinal(record);
    let highlightToken = pnFinal;
    let highlightKind = 'red-row';
    let matchedFieldName = 'pn_final';
    let matches = lineMatch.matches || [];

    logPdfRowHighlightDebug('pn_final buscado:', pnFinal);
    logPdfRowHighlightDebug('coincidencias PN en página:', matches.length);

    if (!matches.length && posValue) {
        lineMatch = await findPdfLineByToken(record, posValue, 'POS');
        highlightToken = posValue;
        highlightKind = 'orange-row';
        matchedFieldName = 'POS';
        matches = lineMatch.matches || [];
        logPdfRowHighlightDebug('fallback POS buscado:', posValue);
        logPdfRowHighlightDebug('coincidencias POS en página:', matches.length);
    }

    if (requestId !== pdfRowHighlightRequestId) {
        return;
    }

    if (!matches.length) {
        console.warn(`[A2][PDF_ROW_EXPERIMENT] No se encontró pn_final ni POS en PDF: "${pnFinal}"${posValue ? ` / "${posValue}"` : ''}`);
        setPdfExperimentalRowHighlights(null);
        requestPdfRelayout();
        alert(posValue
            ? `No se encontró pn_final ni POS en la página PDF actual: ${pnFinal} / ${posValue}.`
            : `No se encontró pn_final en la página PDF actual: ${pnFinal}.`);
        return;
    }

    setPdfExperimentalRowHighlights({
        mode: 'pn-line',
        pn: highlightToken,
        rowKind: highlightKind,
        rowLabel: matchedFieldName === 'POS' ? 'Fila POS' : 'Fila PN',
        yTolerance: PDF_ROW_Y_TOLERANCE
    });
    requestPdfRelayout();

    logPdfRowHighlightDebug('líneas detectadas:', lineMatch.lineIndices);
    logPdfRowHighlightDebug('textos en misma fila:', lineMatch.lineItems.map((item) => String(item?.text || '').trim()).filter(Boolean));

    if (matches.length > 1) {
        console.warn(`[A2][PDF_ROW_EXPERIMENT] ${matchedFieldName} con ${matches.length} coincidencias en la página. Se marcarán todas las líneas coincidentes.`);
    }

}



async function highlightPdfRowByPnFinal(record = currentRow) {

    return highlightPdfLineForPnFinal(record);

}



function renderRecord(row) {

    clearPdfOverlaysOnRecordChange(row);

    if (!row) {

        renderReviewStateButtons(null);
        renderReviewStats([], null);
        return;

    }

    renderReviewStats(getQueueRows(), row);
    if (PDF_FEATURE_AUTO_SYNC_ON_RECORD_EVENTS) {
        syncPdfWithCurrentRow(row);
    }
    renderMeta(row);
    renderComparisonTable(row).catch((error) => {
        console.warn('No se pudo renderizar la comparativa con PDF:', error);
    });
    fillEditFields(row);

    const processState = computeProcessState(row);
    renderProcessList(row, processState);
    renderEvidence(row, processState);
    renderVerdict(processState);
    renderReviewStateButtons(row);

}



function syncCurrentRowReference() {

    if (!currentRow) return;

    const key = getRevisionKey(currentRow);

    if (!key) return;



    const updated = (state.allData || []).find(row => getRevisionKey(row) === key);

    if (updated) currentRow = updated;

}



function getActiveCodes() {

    return (state.qaErrorCheckDefinitions || [])

        .map(def => String(def?.code ?? '').trim())

        .filter(Boolean);

}



async function revalidateCurrentRow() {

    if (!currentRow) {

        alert('Primero debes cargar un registro.');

        return;

    }



    syncCurrentRowReference();

    renderRecord(currentRow);

}



async function saveCurrentFieldChanges() {

    if (!currentRow) {

        alert('Primero debes cargar un registro.');

        return;

    }



    const engineFile = resolveEngineFile(currentRow);

    const id = txt(currentRow?.ID, '');

    if (!engineFile || !id) {

        alert('No se pudo resolver archivo engine o ID para guardar.');

        return;

    }



    const changes = [

        ['pn_final', $('editPnFinal')?.value ?? txt(currentRow?.pn_final, '')],

        ['designation_final', $('editDesignationFinal')?.value ?? txt(currentRow?.designation_final, '')],

        ['measure_final', $('editMeasurementFinal')?.value ?? txt(currentRow?.measure_final ?? currentRow?.measurement_final, '')],

        ['weight_final', $('editWeightFinal')?.value ?? txt(currentRow?.weight_final, '')],

        ['qa_revision_estado', $('editRevisionEstado')?.value ?? txt(currentRow?.qa_revision_estado, '')],

        ['qa_revision_accion', $('editRevisionAccion')?.value ?? txt(currentRow?.qa_revision_accion, '')]

    ];



    const changedFields = new Set();



    for (const [field, value] of changes) {

        if (String(currentRow?.[field] ?? '') === String(value ?? '')) continue;

        await saveCellToServer(engineFile, id, field, value);

        currentRow[field] = value;

        changedFields.add(field);

    }



    const mustAutoRecompute = AUTO_RECOMPUTE_ON_EDIT_ENABLED
        && [...changedFields].some((field) => AUTO_RECOMPUTE_TRIGGER_FIELDS.has(field));

    if (mustAutoRecompute) {

        await autoRecomputeEditedRecord(engineFile, id);

        await reloadEditedRecord(engineFile, id);

        notifyPdfDataChangedFromAnalista(currentRow);

        return;

    }



    renderReviewStats();

    await revalidateCurrentRow();

    notifyPdfDataChangedFromAnalista(currentRow);

}



async function setOutcome(kind) {

    $('editRevisionEstado').value = kind === 'ok' ? 'ok' : 'pendiente';

    $('editRevisionAccion').value = kind === 'ok' ? 'importar' : 'revisar';

    currentProcessIndex = buildProcessSteps(currentRow).length;

    await saveCurrentFieldChanges();

}



function findRecordByPrimaryKey(recordKey, engineFilter) {

    const key = String(recordKey ?? '').trim().toLowerCase();

    if (!key) return null;



    const source = engineFilter

        ? (state.allData || []).filter((row) => String(row?.engine_model ?? '').trim() === engineFilter)

        : (state.allData || []);



    const exact = source.find((row) => {

        const pnFinal = String(row?.pn_final ?? '').trim().toLowerCase();

        const partNo = String(row?.['PART NO.'] ?? '').trim().toLowerCase();

        const id = String(row?.ID ?? '').trim().toLowerCase();

        return pnFinal === key || partNo === key || id === key;

    });

    if (exact) return exact;



    return source.find((row) => {

        const searchHaystack = [

            row?.pn_final,

            row?.['PART NO.'],

            row?.ID,

            row?.designation_final,

            row?.DESIGNATION

        ].map(value => String(value ?? '').toLowerCase());

        return searchHaystack.some(value => value.includes(key));

    }) || null;

}



async function loadRecordFromControls() {

    const recordKey = $('recordIdInput').value;

    const engineFilter = $('engineFilterSelect').value;

    const found = findRecordByPrimaryKey(recordKey, engineFilter);



    if (!found) {

        alert('No se encontro ningun registro con ese PN/PART NO para el filtro seleccionado.');

        return;

    }



    currentRow = found;

    currentProcessIndex = 0;

    await revalidateCurrentRow();

}



async function openAnalisisRecordFromShell(request = {}) {

    const requestedEngine = String(request?.engine || '').trim();

    const requestedLookup = String(request?.record || request?.id || '').trim();



    if (requestedEngine) {

        const select = $('engineFilterSelect');

        const currentEngine = String(select?.value || '').trim();

        if (requestedEngine !== currentEngine) {

            await loadEngineForFilter(requestedEngine);

        }

    }



    if (requestedLookup) {

        $('recordIdInput').value = requestedLookup;

        await loadRecordFromControls();

        return true;

    }



    return true;

}



window.miluOpenAnalisisRecord = (request = {}) => {

    openAnalisisRecordFromShell(request).catch((error) => {

        console.warn('No se pudo abrir registro de analisis desde shell:', error);

    });

    return true;

};



window.miluRefreshAnalisisRecord = async (request = {}) => {

    try {

        const requestedEngine = String(request?.engine || '').trim();

        const lookup = String(request?.id || request?.record || '').trim();



        if (requestedEngine) {

            await loadEngineForFilter(requestedEngine);

        }



        if (lookup) {

            $('recordIdInput').value = lookup;

            await loadRecordFromControls();

        } else {

            await revalidateCurrentRow();

        }

        return true;

    } catch (error) {

        console.warn('No se pudo refrescar analista desde shell:', error);

        return false;

    }

};



async function loadRelativeRecord(direction) {

    const queue = getQueueRows();

    if (!queue.length) return;



    const currentIndex = currentRow

        ? queue.findIndex(row => getRevisionKey(row) === getRevisionKey(currentRow))

        : -1;



    const targetIndex = currentIndex < 0

        ? 0

        : Math.max(0, Math.min(queue.length - 1, currentIndex + direction));



    if (targetIndex === currentIndex) {

        alert(direction > 0 ? 'Ya estas en el ultimo registro.' : 'Ya estas en el primer registro.');

        return;

    }



    currentRow = queue[targetIndex];

    $('recordIdInput').value = getDisplayPnForInput(currentRow);

    currentProcessIndex = 0;

    await revalidateCurrentRow();

}



function rowHasErrors(row) {

    return getRowErrorCount(row) > 0;

}



function rowHasReviewAction(row) {

    const accion = normalizeAccionToNew(row?.qa_revision_accion);

    if (accion === 'revisar') return true;



    const rawAccion = String(row?.qa_revision_accion || '').trim().toLowerCase();

    return rawAccion === 'revision';

}

function rowHasCopyOkAction(row) {

    const estado = normalizeEstadoToNew(row?.qa_revision_estado);

    const accion = normalizeAccionToNew(row?.qa_revision_accion);

    return estado === 'ok' && accion === 'copia';

}

function rowHasImportOkAction(row) {

    const estado = normalizeEstadoToNew(row?.qa_revision_estado);

    if (estado !== 'ok') return false;

    const accion = normalizeAccionToNew(row?.qa_revision_accion);

    return accion !== 'revisar' && accion !== 'eliminar' && accion !== 'copia';

}



function rowIsPending(row) {

    const estado = normalizeEstadoToNew(row?.qa_revision_estado);

    return estado === 'pendiente';

}



async function loadRelativeError(direction) {

    const queue = getQueueRows();

    if (!queue.length) return;



    const startIndex = currentRow

        ? queue.findIndex(row => getRevisionKey(row) === getRevisionKey(currentRow))

        : -1;



    let idx = startIndex;

    while (true) {

        idx += direction;

        if (idx < 0 || idx >= queue.length) {

            alert(direction > 0 ? 'No hay mas registros con error.' : 'No hay errores anteriores.');

            return;

        }

        if (rowHasErrors(queue[idx])) break;

    }



    currentRow = queue[idx];

    $('recordIdInput').value = getDisplayPnForInput(currentRow);

    currentProcessIndex = 0;

    await revalidateCurrentRow();

}



async function loadRelativePending(direction) {

    const queue = getQueueRows();

    if (!queue.length) return;



    const startIndex = currentRow

        ? queue.findIndex(row => getRevisionKey(row) === getRevisionKey(currentRow))

        : -1;



    let idx = startIndex;

    while (true) {

        idx += direction;

        if (idx < 0 || idx >= queue.length) {

            alert(direction > 0 ? 'No hay mas registros pendientes.' : 'No hay pendientes anteriores.');

            return;

        }

        if (rowIsPending(queue[idx])) break;

    }



    currentRow = queue[idx];

    $('recordIdInput').value = getDisplayPnForInput(currentRow);

    currentProcessIndex = 0;

    await revalidateCurrentRow();

}



async function loadRelativeReview(direction) {

    const queue = getQueueRows();

    if (!queue.length) return;



    const startIndex = currentRow

        ? queue.findIndex(row => getRevisionKey(row) === getRevisionKey(currentRow))

        : -1;



    let idx = startIndex;

    while (true) {

        idx += direction;

        if (idx < 0 || idx >= queue.length) {

            alert(direction > 0 ? 'No hay mas registros para revisar.' : 'No hay registros anteriores para revisar.');

            return;

        }

        if (rowHasReviewAction(queue[idx])) break;

    }



    currentRow = queue[idx];

    $('recordIdInput').value = getDisplayPnForInput(currentRow);

    currentProcessIndex = 0;

    await revalidateCurrentRow();

}

async function loadRelativeCopy(direction) {

    const queue = getQueueRows();

    if (!queue.length) return;



    const startIndex = currentRow

        ? queue.findIndex(row => getRevisionKey(row) === getRevisionKey(currentRow))

        : -1;



    let idx = startIndex;

    while (true) {

        idx += direction;

        if (idx < 0 || idx >= queue.length) {

            alert(direction > 0 ? 'No hay mas registros con accion Copia.' : 'No hay registros anteriores con accion Copia.');

            return;

        }

        if (rowHasCopyOkAction(queue[idx])) break;

    }



    currentRow = queue[idx];

    $('recordIdInput').value = getDisplayPnForInput(currentRow);

    currentProcessIndex = 0;

    await revalidateCurrentRow();

}

async function loadRelativeImport(direction) {

    const queue = getQueueRows();

    if (!queue.length) return;



    const startIndex = currentRow

        ? queue.findIndex(row => getRevisionKey(row) === getRevisionKey(currentRow))

        : -1;



    let idx = startIndex;

    while (true) {

        idx += direction;

        if (idx < 0 || idx >= queue.length) {

            alert(direction > 0 ? 'No hay mas registros con accion Importar.' : 'No hay registros anteriores con accion Importar.');

            return;

        }

        if (rowHasImportOkAction(queue[idx])) break;

    }



    currentRow = queue[idx];

    $('recordIdInput').value = getDisplayPnForInput(currentRow);

    currentProcessIndex = 0;

    await revalidateCurrentRow();

}



async function applyPnCopyPropagationFromCurrent() {

    const result = await applyPnCopyPropagationFromRow(currentRow, {

        showAlerts: true,

        refreshPnReview: true,

        requireOkImportar: true,

        silentIfNoSiblings: false

    });

    if (result?.fatalError) return;

}



function getRowPn(row) {

    // Debe coincidir con server.js#getRowPn para consultar /pn-review/:sku/sources.

    return String(row?.pn_final ?? row?.['PART NO.'] ?? row?.pn ?? '').trim();

}



function normalizeEngineFileKey(value) {

    return String(value ?? '')

        .trim()

        .replace(/^engine_/i, '')

        .replace(/\.json$/i, '')

        .toLowerCase();

}



function resolveCanonicalEngineFileName(value) {

    const raw = String(value ?? '').trim();

    if (!raw) return '';



    const withJson = /\.json$/i.test(raw) ? raw : `${raw}.json`;

    return /^engine_/i.test(withJson) ? withJson : `engine_${withJson}`;

}



async function applyPnCopyPropagationFromRow(row, options = {}) {

    const {

        showAlerts = false,

        refreshPnReview = false,

        requireOkImportar = true,

        silentIfNoSiblings = false,

        cancelSignal = null,

        updateInMemory = true

    } = options;



    if (!row) {

        if (showAlerts) alert('Primero debes cargar un registro.');

        return { fatalError: true, reason: 'missing-row' };

    }



    const currentEstado = normalizeEstadoToNew(row?.qa_revision_estado);

    const currentAccion = normalizeAccionToNew(row?.qa_revision_accion);

    const pn = getRowPn(row);



    if (requireOkImportar && (currentEstado !== 'ok' || currentAccion !== 'importar')) {

        if (showAlerts) {

            alert(`El registro debe tener estado OK + Importar para propagar hermanos (PN: ${pn || 'â€”'}).`);

        }

        return { skipped: true, reason: 'not-ok-importar', pn };

    }



    if (!pn) {

        if (showAlerts) alert('El registro activo no tiene Part Number.');

        return { skipped: true, reason: 'missing-pn', pn: '' };

    }



    try {

        if (cancelSignal?.requested) {

            return {

                canceled: true,

                pn,

                propagated: 0,

                scannedSources: 0,

                targetSiblings: 0,

                errors: []

            };

        }



        let sourcesResp;

        const res = await fetch(`/pn-review/${encodeURIComponent(pn)}/sources`);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        sourcesResp = await res.json();

        const allSources = Array.isArray(sourcesResp?.rows)

            ? sourcesResp.rows

            : (Array.isArray(sourcesResp?.sources) ? sourcesResp.sources : []);



        const currentId = String(row?.ID ?? '').trim();

        const currentEngineNorm = normalizeEngineFileKey(resolveEngineFile(row));



        const siblings = allSources.filter(src => {

            const srcId = String(src?.ID ?? '').trim();

            const srcFile = String(src?.source_file ?? src?.engine_file ?? '').trim();

            const srcFileNorm = normalizeEngineFileKey(srcFile);

            if (srcId === currentId && srcFileNorm === currentEngineNorm) return false;

            const estado = normalizeEstadoToNew(src?.qa_revision_estado);

            const accion = normalizeAccionToNew(src?.qa_revision_accion);

            return !(estado === 'ok' && accion === 'copia');

        });



        if (siblings.length === 0) {

            if (showAlerts && !silentIfNoSiblings) {

                alert(`No hay hermanos para propagar (PN: ${pn}). Todos ya tienen OK + Copia o no hay más apariciones.`);

            }

            return { success: true, pn, propagated: 0, scannedSources: allSources.length, targetSiblings: 0, errors: [] };

        }



        const errors = [];

        let propagated = 0;



        for (const src of siblings) {

            if (cancelSignal?.requested) {

                return {

                    canceled: true,

                    pn,

                    propagated,

                    scannedSources: allSources.length,

                    targetSiblings: siblings.length,

                    errors

                };

            }



            const srcId = String(src?.ID ?? '').trim();

            const srcFile = String(src?.source_file ?? src?.engine_file ?? '').trim();

            const srcFileNorm = normalizeEngineFileKey(srcFile);

            if (!srcId || !srcFileNorm) continue;



            const targetEngineFile = resolveCanonicalEngineFileName(srcFile);

            if (!targetEngineFile) continue;



            try {

                await saveCellToServer(targetEngineFile, srcId, 'qa_revision_estado', denormalizeEstadoFromNew('ok'));

                await saveCellToServer(targetEngineFile, srcId, 'qa_revision_accion', denormalizeAccionFromNew('copia'));



                if (updateInMemory) {

                    const inMemRow = (Array.isArray(state.allData) ? state.allData : []).find((candidate) => {

                        const candidateId = String(candidate?.ID ?? '').trim();

                        const candidateEngineNorm = normalizeEngineFileKey(resolveEngineFile(candidate));

                        return candidateId === srcId && candidateEngineNorm === srcFileNorm;

                    });



                    if (inMemRow) {

                        inMemRow.qa_revision_estado = 'ok';

                        inMemRow.qa_revision_accion = 'copia';

                    }

                }



                propagated += 1;

            } catch (err) {

                errors.push(`ID ${srcId} (${targetEngineFile}): ${err.message}`);

            }

        }



        if (showAlerts) {

            if (errors.length > 0) {

                alert(`Propagación parcial (PN: ${pn}). Errores:\n${errors.join('\n')}`);

            } else {

                alert(`Propagados ${propagated} hermano(s) con PN "${pn}" â†’ OK + Copia.`);

            }

        }



        return {

            success: errors.length === 0,

            pn,

            propagated,

            scannedSources: allSources.length,

            targetSiblings: siblings.length,

            errors

        };

    } catch (err) {

        if (showAlerts) {

            alert(`Error al obtener o propagar hermanos: ${err.message}`);

        }

        return { fatalError: true, pn, error: String(err?.message || err) };

    }

}



async function applyPnCopyPropagationForCurrentBook() {

    const queue = getQueueRows();

    if (!Array.isArray(queue) || queue.length === 0) {

        alert('No hay registros cargados para el libro actual.');

        return;

    }



    const candidates = queue.filter((row) => {

        const estado = normalizeEstadoToNew(row?.qa_revision_estado);

        const accion = normalizeAccionToNew(row?.qa_revision_accion);

        return estado === 'ok' && accion === 'importar';

    });



    if (candidates.length === 0) {

        alert('No hay registros en estado OK + Importar en el libro actual.');

        return;

    }



    const uniquePnRows = new Map();

    for (const row of candidates) {

        const pn = getRowPn(row);

        if (!pn) continue;

        if (!uniquePnRows.has(pn)) uniquePnRows.set(pn, row);

    }



    if (uniquePnRows.size === 0) {

        alert('No hay Part Numbers válidos en los registros OK + Importar del libro actual.');

        return;

    }



    const confirmed = await confirmTypedAction({

        title: 'Confirmar propagacion masiva',

        message: `Se revisaran ${candidates.length} registros OK+Importar (${uniquePnRows.size} PN unicos) para propagar hermanos en bloque.`,

        expectedText: 'APLICAR',

        confirmLabel: 'Iniciar proceso',

        cancelLabel: 'Cancelar',

        dangerLevel: 'high'

    });

    if (!confirmed) return;



    const triggerBtn = $('propagateHermanosBookBtn');

    if (triggerBtn instanceof HTMLButtonElement) {

        triggerBtn.disabled = true;

        triggerBtn.title = 'Proceso en ejecución...';

    }



    openHermanosProgressModal();

    resetHermanosProgressLog();

    renderHermanosProgress({

        currentLabel: 'Preparando proceso...',

        processedPn: 0,

        totalPn: uniquePnRows.size,

        scannedRows: candidates.length,

        propagatedRows: 0,

        pnsWithPropagation: 0

    });

    appendHermanosProgressLog(`Inicio: ${candidates.length} filas OK+Importar, ${uniquePnRows.size} PN únicos.`, 'ok');



    const summary = {

        scannedRows: candidates.length,

        scannedUniquePn: uniquePnRows.size,

        propagatedRows: 0,

        pnsWithPropagation: 0,

        noSiblingPn: 0,

        canceled: false,

        fatalErrors: []

    };



    try {

        let bulkApplied = false;



        try {

            if (!hermanosProgressUiState.cancelRequested) {

                const bulkItems = Array.from(uniquePnRows.values()).map((row) => ({

                    pn: getRowPn(row),

                    current_id: String(row?.ID ?? '').trim(),

                    current_engine_file: resolveEngineFile(row)

                })).filter((entry) => entry.pn);



                if (bulkItems.length > 0) {

                    hermanosProgressUiState.bulkInFlight = true;

                    setHermanosCancelButtonState({

                        disabled: true,

                        label: 'Bulk en servidor...',

                        title: 'Cancelación deshabilitada durante petición bulk al backend.'

                    });

                    renderHermanosProgress({

                        currentLabel: `Bulk en servidor: procesando ${bulkItems.length} PN...`,

                        processedPn: Math.max(1, Math.floor(summary.scannedUniquePn * 0.15)),

                        totalPn: summary.scannedUniquePn,

                        scannedRows: summary.scannedRows,

                        propagatedRows: summary.propagatedRows,

                        pnsWithPropagation: summary.pnsWithPropagation

                    });

                    appendHermanosProgressLog('Ejecutando modo rápido backend (bulk)...', 'ok');



                    const response = await fetch('/pn-review/apply-siblings-bulk', {

                        method: 'POST',

                        headers: { 'Content-Type': 'application/json' },

                        body: JSON.stringify({ items: bulkItems })

                    });



                    const payload = await response.json().catch(() => ({}));

                    if (!response.ok || !payload?.result) {

                        throw new Error(String(payload?.error || `HTTP ${response.status}`));

                    }



                    const result = payload.result;

                    summary.pnsWithPropagation = Number(result?.pns_with_changes || 0);

                    summary.propagatedRows = Number(result?.rows_updated || 0);

                    summary.noSiblingPn = Array.isArray(result?.item_results)

                        ? result.item_results.filter((item) => Number(item?.target_siblings || 0) === 0).length

                        : 0;

                    summary.fatalErrors = Array.isArray(result?.errors)

                        ? result.errors.map((entry) => `${entry.file || 'bulk'}: ${entry.error || 'Error desconocido'}`)

                        : [];



                    renderReviewStats();

                    renderHermanosProgress({

                        currentLabel: summary.fatalErrors.length > 0 ? 'Bulk finalizado con incidencias.' : 'Bulk completado.',

                        processedPn: summary.scannedUniquePn,

                        totalPn: summary.scannedUniquePn,

                        scannedRows: summary.scannedRows,

                        propagatedRows: summary.propagatedRows,

                        pnsWithPropagation: summary.pnsWithPropagation

                    });



                    appendHermanosProgressLog(

                        `Bulk aplicado: PN con cambios ${summary.pnsWithPropagation}, hermanos actualizados ${summary.propagatedRows}.`,

                        summary.fatalErrors.length > 0 ? 'error' : 'ok'

                    );

                    if (summary.noSiblingPn > 0) {

                        appendHermanosProgressLog(`Total PN sin hermanos pendientes: ${summary.noSiblingPn}.`, '');

                    }



                    bulkApplied = true;

                }

            }

        } catch (bulkError) {

            appendHermanosProgressLog(

                `Bulk no disponible (${String(bulkError?.message || bulkError)}). Se usa modo compatible por PN...`,

                'error'

            );

        } finally {

            hermanosProgressUiState.bulkInFlight = false;

            if (!hermanosProgressUiState.cancelRequested) {

                setHermanosCancelButtonState({

                    disabled: false,

                    label: 'Cancelar proceso',

                    title: ''

                });

            }

        }



        if (bulkApplied) {

            if (summary.fatalErrors.length > 0) {

                alert(

                    `Proceso bulk terminado con incidencias.\n`

                    + `Filas OK+Importar revisadas: ${summary.scannedRows}\n`

                    + `PN únicos revisados: ${summary.scannedUniquePn}\n`

                    + `PN con hermanos actualizados: ${summary.pnsWithPropagation}\n`

                    + `Hermanos actualizados: ${summary.propagatedRows}\n\n`

                    + `Errores:\n${summary.fatalErrors.join('\n')}`

                );

            } else {

                alert(

                    `Proceso bulk completado.\n`

                    + `Filas OK+Importar revisadas: ${summary.scannedRows}\n`

                    + `PN únicos revisados: ${summary.scannedUniquePn}\n`

                    + `PN con hermanos actualizados: ${summary.pnsWithPropagation}\n`

                    + `Hermanos actualizados: ${summary.propagatedRows}`

                );

            }

            return;

        }



        let processedPn = 0;

        for (const row of uniquePnRows.values()) {

            if (hermanosProgressUiState.cancelRequested) {

                summary.canceled = true;

                appendHermanosProgressLog('Proceso cancelado por usuario.', 'error');

                break;

            }



            const pn = getRowPn(row);

            renderHermanosProgress({

                currentLabel: `Procesando PN ${pn || 'â€”'} (${processedPn + 1}/${summary.scannedUniquePn})...`,

                processedPn,

                totalPn: summary.scannedUniquePn,

                scannedRows: summary.scannedRows,

                propagatedRows: summary.propagatedRows,

                pnsWithPropagation: summary.pnsWithPropagation

            });



            const result = await applyPnCopyPropagationFromRow(row, {

                showAlerts: false,

                refreshPnReview: false,

                requireOkImportar: true,

                silentIfNoSiblings: true,

                cancelSignal: { get requested() { return hermanosProgressUiState.cancelRequested; } },

                updateInMemory: false

            });



            if (result?.canceled) {

                summary.canceled = true;

                summary.propagatedRows += Number(result?.propagated || 0);

                if (Number(result?.propagated || 0) > 0) {

                    summary.pnsWithPropagation += 1;

                }

                processedPn += 1;

                renderHermanosProgress({

                    currentLabel: `Cancelado durante PN ${result?.pn || pn || 'â€”'}.`,

                    processedPn,

                    totalPn: summary.scannedUniquePn,

                    scannedRows: summary.scannedRows,

                    propagatedRows: summary.propagatedRows,

                    pnsWithPropagation: summary.pnsWithPropagation

                });

                appendHermanosProgressLog(`Cancelado durante PN ${result?.pn || pn || 'â€”'}.`, 'error');

                break;

            }



            if (result?.fatalError) {

                summary.fatalErrors.push(`${result.pn || getRowPn(row) || 'â€”'}: ${result.error || result.reason || 'Error desconocido'}`);

                appendHermanosProgressLog(

                    `Error PN ${result.pn || pn || 'â€”'}: ${result.error || result.reason || 'Error desconocido'}`,

                    'error'

                );

                processedPn += 1;

                renderHermanosProgress({

                    currentLabel: `Procesando PN ${pn || 'â€”'} (${processedPn}/${summary.scannedUniquePn})...`,

                    processedPn,

                    totalPn: summary.scannedUniquePn,

                    scannedRows: summary.scannedRows,

                    propagatedRows: summary.propagatedRows,

                    pnsWithPropagation: summary.pnsWithPropagation

                });

                continue;

            }



            const propagated = Number(result?.propagated || 0);

            if (propagated > 0) {

                summary.propagatedRows += propagated;

                summary.pnsWithPropagation += 1;

                appendHermanosProgressLog(

                    `PN ${result?.pn || pn || 'â€”'}: ${propagated} hermano(s) actualizado(s).`,

                    'ok'

                );

            } else {

                summary.noSiblingPn += 1;

                // Evita cientos/miles de repintados de log en procesos largos.

                if (summary.noSiblingPn % 50 === 0) {

                    appendHermanosProgressLog(

                        `Sin hermanos pendientes en ${summary.noSiblingPn} PN procesados.`,

                        ''

                    );

                }

            }



            processedPn += 1;

            renderHermanosProgress({

                currentLabel: `Procesados ${processedPn}/${summary.scannedUniquePn} PN...`,

                processedPn,

                totalPn: summary.scannedUniquePn,

                scannedRows: summary.scannedRows,

                propagatedRows: summary.propagatedRows,

                pnsWithPropagation: summary.pnsWithPropagation

            });

        }



        renderReviewStats();



        appendHermanosProgressLog(

            summary.canceled

                ? `Fin parcial por cancelación: PN con cambios ${summary.pnsWithPropagation}, hermanos actualizados ${summary.propagatedRows}.`

                : `Fin: PN con cambios ${summary.pnsWithPropagation}, hermanos actualizados ${summary.propagatedRows}.`,

            (summary.fatalErrors.length > 0 || summary.canceled) ? 'error' : 'ok'

        );



        if (summary.noSiblingPn > 0) {

            appendHermanosProgressLog(`Total PN sin hermanos pendientes: ${summary.noSiblingPn}.`, '');

        }

        renderHermanosProgress({

            currentLabel: summary.canceled

                ? 'Proceso cancelado por usuario.'

                : (summary.fatalErrors.length > 0 ? 'Finalizado con incidencias.' : 'Proceso completado.'),

            processedPn,

            totalPn: summary.scannedUniquePn,

            scannedRows: summary.scannedRows,

            propagatedRows: summary.propagatedRows,

            pnsWithPropagation: summary.pnsWithPropagation

        });



        if (summary.canceled) {

            alert(

                `Proceso cancelado por usuario.\n`

                + `Filas OK+Importar revisadas: ${summary.scannedRows}\n`

                + `PN únicos totales: ${summary.scannedUniquePn}\n`

                + `PN con hermanos actualizados: ${summary.pnsWithPropagation}\n`

                + `Hermanos actualizados: ${summary.propagatedRows}`

            );

            return;

        }



        if (summary.fatalErrors.length > 0) {

            alert(

                `Proceso terminado con incidencias.\n`

                + `Filas OK+Importar revisadas: ${summary.scannedRows}\n`

                + `PN únicos revisados: ${summary.scannedUniquePn}\n`

                + `PN con hermanos actualizados: ${summary.pnsWithPropagation}\n`

                + `Hermanos actualizados: ${summary.propagatedRows}\n\n`

                + `Errores:\n${summary.fatalErrors.join('\n')}`

            );

            return;

        }



        alert(

            `Proceso completado.\n`

            + `Filas OK+Importar revisadas: ${summary.scannedRows}\n`

            + `PN únicos revisados: ${summary.scannedUniquePn}\n`

            + `PN con hermanos actualizados: ${summary.pnsWithPropagation}\n`

            + `Hermanos actualizados: ${summary.propagatedRows}`

        );

    } finally {

        finishHermanosProgressModal();

        if (triggerBtn instanceof HTMLButtonElement) {

            triggerBtn.disabled = false;

            triggerBtn.title = 'Recorrer el libro actual y propagar hermanos para todos los registros en OK+Importar';

        }

    }

}



async function setReviewStatus(kind) {

    if (!currentRow) {

        alert('Primero debes cargar un registro.');

        return;

    }



    const engineFile = resolveEngineFile(currentRow);

    const id = txt(currentRow?.ID, '');

    if (!engineFile || !id) {

        alert('No se pudo resolver archivo engine o ID para guardar estado.');

        return;

    }



    const mapping = {

        ok: { qa_revision_accion: 'importar' },

        review: { qa_revision_accion: 'revisar' },

        ko: { qa_revision_accion: 'eliminar' },

        copia: { qa_revision_accion: 'copia' }

    };

    const values = mapping[kind] || mapping.review;



    await saveCellToServer(engineFile, id, 'qa_revision_accion', denormalizeAccionFromNew(values.qa_revision_accion));



    currentRow.qa_revision_accion = values.qa_revision_accion;

    syncCurrentRowRevisionIntoQueue({ qa_revision_accion: values.qa_revision_accion });

    publishRevisionSync({

        id,

        engineFile,

        estado: currentRow?.qa_revision_estado,

        accion: currentRow?.qa_revision_accion,

        source: 'analista-02'

    });

    renderReviewStateButtons(currentRow);

    renderReviewStats();

    notifyPdfDataChangedFromAnalista(currentRow);

}



async function setManualRevisionEstado(nextEstado) {

    if (!currentRow) {

        alert('Primero debes cargar un registro.');

        return;

    }



    const normalizedEstado = normalizeEstadoToNew(nextEstado);

    const currentEstado = normalizeEstadoToNew(currentRow?.qa_revision_estado);

    if (normalizedEstado === currentEstado) {

        renderReviewStateButtons(currentRow);

        return;

    }



    const engineFile = resolveEngineFile(currentRow);

    const id = txt(currentRow?.ID, '');

    if (!engineFile || !id) {

        alert('No se pudo resolver archivo engine o ID para guardar estado.');

        return;

    }



    await saveCellToServer(engineFile, id, 'qa_revision_estado', denormalizeEstadoFromNew(normalizedEstado));

    currentRow.qa_revision_estado = normalizedEstado;

    syncCurrentRowRevisionIntoQueue({ qa_revision_estado: normalizedEstado });

    publishRevisionSync({

        id,

        engineFile,

        estado: currentRow?.qa_revision_estado,

        accion: currentRow?.qa_revision_accion,

        source: 'analista-02'

    });

    renderReviewStateButtons(currentRow);

    renderReviewStats();

    notifyPdfDataChangedFromAnalista(currentRow);

}



async function runNextProcess() {

    if (!currentRow) {

        alert('Primero debes cargar un registro.');

        return;

    }



    await revalidateCurrentRow();



    const total = buildProcessSteps(currentRow).length;

    if (currentProcessIndex >= total) {

        alert('Todos los procesos ya fueron ejecutados para este registro.');

        return;

    }



    currentProcessIndex += 1;

    renderRecord(currentRow);

}



async function runAllProcesses() {

    if (!currentRow) {

        alert('Primero debes cargar un registro.');

        return;

    }



    await revalidateCurrentRow();

    currentProcessIndex = buildProcessSteps(currentRow).length;

    renderRecord(currentRow);

}



async function initialize() {

    try {

        state.rightPanelTab = 'pdf';



        initChecksModal();

        initComparisonDebugToggle();

        initHermanosProgressModal();

        initEditRecordModal();

        initComparisonEditTriggers();

        initHorizontalSplitter();

        initComparisonColumnResize();

        loadComparisonColumnWidths();

        initPdfZoomControls();

        applyPdfFeatureFlagsToUi();

        if (PDF_FEATURE_BLUE_TEXT_PANEL_ENABLED) {
            syncPdfBlueTextsArea();
        }

        loadPdfClear();



        const requestedModel = startupSelection.engine && ENGINE_BOOK_MODELS.includes(startupSelection.engine)

            ? startupSelection.engine

            : '';



        buildEngineOptions(requestedModel);

        const initialModel = String($('engineFilterSelect')?.value || '').trim() || ENGINE_BOOK_MODELS[0] || '';

        await loadEngineForFilter(initialModel);

        updateRecordSearchSuggestions();



        const startupLookup = startupSelection.record || startupSelection.id;

        if (startupLookup) {

            $('recordIdInput').value = startupLookup;

            await loadRecordFromControls();

        }

    } catch (error) {

        const statusText = $('statusText');

        if (statusText) statusText.textContent = `Error iniciando Analista 02: ${error.message}`;

        console.error(error);

    }

}



function bindClick(id, callback) {

    const element = $(id);

    if (!(element instanceof HTMLElement)) return;

    element.addEventListener('click', callback);

}


function applyPdfFeatureFlagsToUi() {

    const blueFillBtn = $('pdfBlueTextsFillBtn');
    if (blueFillBtn instanceof HTMLButtonElement) {
        blueFillBtn.disabled = !PDF_FEATURE_BLUE_TEXT_PANEL_ENABLED;
        if (!PDF_FEATURE_BLUE_TEXT_PANEL_ENABLED) blueFillBtn.title = 'Desactivado en modo rendimiento';
    }

    const blueCopyBtn = $('pdfBlueTextsCopyBtn');
    if (blueCopyBtn instanceof HTMLButtonElement) {
        blueCopyBtn.disabled = !PDF_FEATURE_BLUE_TEXT_PANEL_ENABLED;
        if (!PDF_FEATURE_BLUE_TEXT_PANEL_ENABLED) blueCopyBtn.title = 'Desactivado en modo rendimiento';
    }

    const paintSelectedRowRedBtn = $('pdfPaintSelectedRowRedBtn');
    if (paintSelectedRowRedBtn instanceof HTMLButtonElement) {
        paintSelectedRowRedBtn.disabled = false;
    }

    const pdfLoadCurrentBtn = $('pdfLoadCurrentBtn');
    if (pdfLoadCurrentBtn instanceof HTMLButtonElement) {
        pdfLoadCurrentBtn.disabled = false;
    }

    const detectHeadersBtn = $('detectHeadersBtn');
    if (detectHeadersBtn instanceof HTMLButtonElement) {
        detectHeadersBtn.disabled = !PDF_FEATURE_HEADERS_ENABLED;
        if (!PDF_FEATURE_HEADERS_ENABLED) detectHeadersBtn.title = 'Detectar headers desactivado';
    }

    const detectTopBomFgBtn = $('detectTopBomFgBtn');
    if (detectTopBomFgBtn instanceof HTMLButtonElement) {
        detectTopBomFgBtn.disabled = !PDF_FEATURE_HEADERS_ENABLED;
        if (!PDF_FEATURE_HEADERS_ENABLED) detectTopBomFgBtn.title = 'Deteccion superior BOM/FG desactivada';
    }

    const paintBodyBtn = $('paintBodyByHeadersBtn');
    if (paintBodyBtn instanceof HTMLButtonElement) {
        paintBodyBtn.disabled = !PDF_FEATURE_HEADERS_ENABLED;
        if (!PDF_FEATURE_HEADERS_ENABLED) paintBodyBtn.title = 'Requiere Detectar Headers habilitado (experimental)';
    }

    const extractPageRowsBtn = $('pdfExtractPageRowsBtn');
    if (extractPageRowsBtn instanceof HTMLButtonElement) {
        extractPageRowsBtn.disabled = !PDF_FEATURE_EXTRACT_PAGE_PREVIEW_ENABLED;
        if (!PDF_FEATURE_EXTRACT_PAGE_PREVIEW_ENABLED) extractPageRowsBtn.title = 'Preview de extraccion por pagina desactivado';
    }

    const copyPdfReadBtn = $('copyPdfReadToPdfBtn');
    if (copyPdfReadBtn instanceof HTMLButtonElement) {
        copyPdfReadBtn.disabled = !PDF_FEATURE_AUTO_PDF_ENABLED;
        if (!PDF_FEATURE_AUTO_PDF_ENABLED) copyPdfReadBtn.title = 'Auto-PDF desactivado';
    }

    const copyPdfReadBackendBtn = $('copyPdfReadToPdfBackendBtn');
    if (copyPdfReadBackendBtn instanceof HTMLButtonElement) {
        const backendAllowed = PDF_FEATURE_AUTO_PDF_ENABLED && isBackendEndpointAllowed('copy-pdf-to-pdf');
        copyPdfReadBackendBtn.disabled = !backendAllowed;
        if (!PDF_FEATURE_AUTO_PDF_ENABLED) copyPdfReadBackendBtn.title = 'Auto-PDF desactivado';
        else if (!backendAllowed) copyPdfReadBackendBtn.title = 'Disponible solo en local (localhost:3000).';
    }

    const copyPdfReadToFinalBtn = $('copyPdfReadToFinalBtn');
    if (copyPdfReadToFinalBtn instanceof HTMLButtonElement) {
        const allowCopyToFinal = isBackendEndpointAllowed('save-json');
        copyPdfReadToFinalBtn.disabled = !allowCopyToFinal;
        if (!allowCopyToFinal) copyPdfReadToFinalBtn.title = 'Disponible solo en local (localhost:3000).';
    }

    const pdfRecomputeErrorsBtn = $('pdfRecomputeErrorsBtn');
    if (pdfRecomputeErrorsBtn instanceof HTMLButtonElement) {
        const allowRecomputeErrors = isBackendEndpointAllowed('recompute-qa-errors');
        pdfRecomputeErrorsBtn.disabled = !allowRecomputeErrors;
        if (!allowRecomputeErrors) pdfRecomputeErrorsBtn.title = 'Disponible solo en local (localhost:3000).';
    }

    const pdfRecomputeRevisionBtn = $('pdfRecomputeRevisionBtn');
    if (pdfRecomputeRevisionBtn instanceof HTMLButtonElement) {
        const allowRecomputeRevision = isBackendEndpointAllowed('recompute-qa-errors');
        pdfRecomputeRevisionBtn.disabled = !allowRecomputeRevision;
        if (!allowRecomputeRevision) pdfRecomputeRevisionBtn.title = 'Disponible solo en local (localhost:3000).';
    }

    const recomputePdfRunBtn = $('recomputePdfRunBtn');
    if (recomputePdfRunBtn instanceof HTMLButtonElement) {
        recomputePdfRunBtn.disabled = !PDF_FEATURE_AUTO_PDF_ENABLED;
        if (!PDF_FEATURE_AUTO_PDF_ENABLED) recomputePdfRunBtn.title = 'Auto-PDF desactivado';
    }

}

// Aplica book_preview_*.json a engine_*.json mediante el script Python oficial.
// Sustituye al antiguo flujo runBulkCopyPdfToBook() para el boton "1. Importar de PDF"
// del modal de recalculo. Llama al endpoint backend POST /api/pdf-preview/apply-to-engine,
// que ejecuta:
//   - apply_book_preview_to_engine.py --write --overwrite  (si hay engine seleccionado)
//   - apply_all_book_previews.py --write --overwrite       (si no hay engine, todos los libros)
async function runApplyBookPreviewToEngines(inputFilters = null) {
    const TAG = '[recomputeCopyBookBtn]';
    clearRecomputePdfDetail();

    const recomputeCopyBookBtn = $('recomputeCopyBookBtn');
    const recomputeRunBtn = $('recomputeRunBtn');
    const recomputePdfRunBtn = $('recomputePdfRunBtn');
    const filters = inputFilters || getRecomputeModalFilters();
    const selectedModelRaw = String(filters.book || RECOMPUTE_ALL_BOOKS_VALUE).trim();
    const selectedModel = selectedModelRaw === RECOMPUTE_ALL_BOOKS_VALUE ? '' : selectedModelRaw;
    const id = String(filters.id || '').trim();
    const scope = selectedModel ? `engine_${selectedModel}.json` : 'TODOS los libros';

    if (id) {
        const warningMessage = 'IMPORTAR PDF ignora el ID puntual y trabaja por libro o todos los libros.';
        showToast(warningMessage, 'warning');
        setRecomputeStatus(warningMessage, 'warning');
    }

    console.log(`${TAG} button pulsado`);
    console.log(`${TAG} engine seleccionado=${selectedModel || '(todos)'}`);
    console.log(`${TAG} scope=${scope}`);

    const confirmed = await simpleConfirm(
        `Vas a aplicar la lectura PDF (book_preview_*.json) al engine ejecutando el script Python oficial.\n\n` +
        `Alcance: ${scope}\n` +
        `Modo: --write --overwrite (persiste y sobrescribe valores no vacios)\n\n` +
        `Se crearan ficheros .bak.<timestamp> junto al engine modificado.\n\n` +
        `Esta accion puede tardar varios minutos. ¿Continuar?`
    );
    if (!confirmed) {
        setRecomputeStatus('Operacion cancelada por el usuario.', '');
        return;
    }

    if (recomputeCopyBookBtn instanceof HTMLButtonElement) recomputeCopyBookBtn.disabled = true;
    if (recomputeRunBtn instanceof HTMLButtonElement) recomputeRunBtn.disabled = true;
    if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = true;
    setRecomputeStatus(`Ejecutando apply_book_preview_to_engine.py sobre ${scope}...`, '');

    const progressContainer = $('recomputeProgressContainer');
    const fillEl = $('recomputeProgressFill');
    const textEl = $('recomputeProgressText');
    if (progressContainer instanceof HTMLElement) progressContainer.hidden = false;
    if (fillEl instanceof HTMLElement) fillEl.style.width = '20%';
    if (textEl instanceof HTMLElement) textEl.textContent = `Lanzando script Python (${scope})...`;

    let payload;
    try {
        console.log(`${TAG} endpoint=/api/pdf-preview/apply-to-engine payload=`, selectedModel ? { engine: selectedModel } : {});
        const response = await fetch('/api/pdf-preview/apply-to-engine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(selectedModel ? { engine: selectedModel } : {})
        });
        const text = await response.text();
        try { payload = JSON.parse(text); } catch { payload = { ok: false, error: text }; }
        if (!response.ok && payload?.ok !== false) {
            payload.ok = false;
            payload.error = payload.error || `HTTP ${response.status}`;
        }
    } catch (error) {
        console.error(`${TAG} fetch error:`, error);
        if (progressContainer instanceof HTMLElement) progressContainer.hidden = true;
        if (recomputeCopyBookBtn instanceof HTMLButtonElement) recomputeCopyBookBtn.disabled = false;
        if (recomputeRunBtn instanceof HTMLButtonElement) recomputeRunBtn.disabled = false;
        if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = false;
        setRecomputeStatus(`Error de red llamando al endpoint: ${String(error?.message || error)}`, 'error');
        return;
    }

    if (fillEl instanceof HTMLElement) fillEl.style.width = '100%';
    if (textEl instanceof HTMLElement) textEl.textContent = 'Finalizado.';
    if (progressContainer instanceof HTMLElement) progressContainer.hidden = true;
    if (recomputeCopyBookBtn instanceof HTMLButtonElement) recomputeCopyBookBtn.disabled = false;
    if (recomputeRunBtn instanceof HTMLButtonElement) recomputeRunBtn.disabled = false;
    if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = false;

    console.log(`${TAG} response`, payload);

    if (!payload?.ok) {
        const msg = String(payload?.error || `exitCode=${payload?.exitCode ?? '?'}`);
        setRecomputeStatus(`Script fallo: ${msg}`, 'error');
        return;
    }

    const stats = payload.stats || {};
    const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
    const fieldsLabel = `${stats.fields_changed || 0} campos modificados`;
    const rowsLabel = `${stats.rows_changed || 0} filas con cambios`;
    const scopeLabel = payload.engine || 'todos los libros';
    const warnLabel = warnings.length ? ` · ${warnings.length} aviso(s)` : '';
    setRecomputeStatus(
        `OK: ${scopeLabel} · ${rowsLabel} · ${fieldsLabel}${warnLabel}.`,
        'ok'
    );

    console.log(`${TAG} response stats rows_changed=${Number(stats.rows_changed) || 0} fields_changed=${Number(stats.fields_changed) || 0} ambiguous=${Number(stats.ambiguous) || 0} not_found=${Number(stats.not_found) || 0}`);
    renderRecomputePdfNotFoundDetail(payload, selectedModel);
    if (warnings.length) {
        console.warn(`${TAG} warnings:`, warnings);
    }
}

// Copia a FINAL en lote usando FINAL_FIELDS_V1 oficial
// con prioridad simple A/B por campo (PDF, GESA, SUST o base segun mapping).
async function runBackendCalculateFinal(inputFilters = null) {
    const recomputeCalculateFinalBtn = $('recomputeCalculateFinalBtn');
    const engineFilterSelect = $('engineFilterSelect');
    const filters = inputFilters || getRecomputeModalFilters();

    if (!(recomputeCalculateFinalBtn instanceof HTMLButtonElement)
        || !(engineFilterSelect instanceof HTMLSelectElement)) {
        return;
    }

    if (!isBackendEndpointAllowed('copy-pdf-to-final-all-books')) {
        setRecomputeStatus(getLocalOnlyBackendMessage('copy-pdf-to-final-all-books'), 'error');
        return;
    }

    const selectedModelRaw = String(filters.book || RECOMPUTE_ALL_BOOKS_VALUE).trim();
    const selectedModel = selectedModelRaw === RECOMPUTE_ALL_BOOKS_VALUE ? '' : selectedModelRaw;
    const id = String(filters.id || '').trim();
    const targetFile = selectedModel ? resolveEngineFileFromFilter(selectedModel) : '';

    if (id) {
        const warningMessage = 'CÁLCULO FINAL ignora el ID puntual y trabaja por libro o todos los libros.';
        showToast(warningMessage, 'warning');
        setRecomputeStatus(warningMessage, 'warning');
    }

    if (selectedModel && !targetFile) {
        setRecomputeStatus('No se pudo resolver el archivo engine del libro seleccionado para CÁLCULO FINAL.', 'error');
        return;
    }

    const confirmed = await simpleConfirm(
        `Vas a aplicar FINAL_FIELDS_V1 en lote para ${selectedModel ? `el libro ${selectedModel}` : 'TODOS los libros'}.\n\n`
        + 'Se copiaran los campos a *_final usando la prioridad oficial por campo (GESA/SUST/base/PDF segun mapping) y se guardaran los JSON con copia de seguridad.\n\n¿Deseas continuar?'
    );

    if (!confirmed) {
        setRecomputeStatus('Operacion cancelada por el usuario.', '');
        return;
    }

    recomputeCalculateFinalBtn.disabled = true;
    setRecomputeStatus(
        selectedModel
            ? `Aplicando FINAL en libro ${selectedModel}...`
            : 'Aplicando FINAL en todos los libros...',
        ''
    );

    try {
        const result = await postJsonToBackendCandidates('copy-pdf-to-final-all-books', {
            file: targetFile || undefined,
            backup: true
        });

        const totals = result?.totals || {};
        const changedRows = Number(totals.changedRows) || 0;
        const updatedFields = Number(totals.updatedFields) || 0;
        const scannedRows = Number(totals.scannedRows) || 0;
        const filesWritten = Number(totals.filesWritten) || 0;

        const scopeLabel = selectedModel ? `LIBRO:${selectedModel}` : 'TODOS';
        const statusMessage = changedRows === 0
            ? `Sin cambios en FINAL | alcance=${scopeLabel} scanned=${scannedRows}`
            : `OK FINAL alcance=${scopeLabel} | scanned=${scannedRows} changedRows=${changedRows} updatedFields=${updatedFields} filesWritten=${filesWritten}`;

        setRecomputeStatus(statusMessage, 'ok');

        const activeModel = engineFilterSelect instanceof HTMLSelectElement
            ? String(engineFilterSelect.value || '').trim()
            : '';

        if (filesWritten > 0 && activeModel) {
            await loadEngineForFilter(activeModel);
            updateRecordSearchSuggestions();
        }
    } catch (error) {
        setRecomputeStatus(`Error aplicando FINAL en lote: ${String(error?.message || error)}`, 'error');
    } finally {
        recomputeCalculateFinalBtn.disabled = false;
    }
}

// Recalcula estado y acción de revisión para todos los registros de todos los libros
async function runBackendRecalculateRevisionStatus(inputFilters = null) {
    const recomputeRevisionStatusBtn = $('recomputeRevisionStatusBtn');
    const engineFilterSelect = $('engineFilterSelect');
    const filters = inputFilters || getRecomputeModalFilters();

    if (!(recomputeRevisionStatusBtn instanceof HTMLButtonElement)
        || !(engineFilterSelect instanceof HTMLSelectElement)) {
        return;
    }

    if (!isBackendEndpointAllowed('recalculate-revision-status')) {
        setRecomputeStatus(getLocalOnlyBackendMessage('recalculate-revision-status'), 'error');
        return;
    }

    const selectedModelRaw = String(filters.book || RECOMPUTE_ALL_BOOKS_VALUE).trim();
    const selectedModel = selectedModelRaw === RECOMPUTE_ALL_BOOKS_VALUE ? '' : selectedModelRaw;
    const id = String(filters.id || '').trim();
    if (selectedModel || id) {
        setRecomputeStatus('ESTADOS actualmente solo recalcula todos los libros.', 'error');
        return;
    }

    recomputeRevisionStatusBtn.disabled = true;
    setRecomputeStatus('Recalculando estado de revisión para todos los registros...', '');

    const urls = getBackendCandidateUrls('recalculate-revision-status');
    let lastError = '';
    let result = null;

    for (const url of urls) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const rawBody = await response.text();
            let data = null;
            try {
                data = rawBody ? JSON.parse(rawBody) : null;
            } catch (_parseError) {
                data = null;
            }

            if (!response.ok) {
                lastError = String(data?.error || `HTTP ${response.status}`).trim();
                continue;
            }

            if (!data || data.ok !== true || !data.result) {
                const snippet = rawBody ? rawBody.replace(/\s+/g, ' ').trim().slice(0, 140) : '';
                lastError = snippet
                    ? `Respuesta invalida: ${snippet}`
                    : `Respuesta invalida (esperado JSON con { ok: true, result })`;
                continue;
            }

            result = data.result;
            break;
        } catch (error) {
            lastError = String(error?.message || error || 'Error de red');
        }
    }

    recomputeRevisionStatusBtn.disabled = false;

    if (!result) {
        setRecomputeStatus(`Error recalculando estado: ${lastError}`, 'error');
        return;
    }

    const totalRecords = Number(result.totalRecords) || 0;
    const changedRecords = Number(result.changedRecords) || 0;
    setRecomputeStatus(
        `OK | Total registros: ${totalRecords}, Estado actualizado: ${changedRecords}`,
        'ok'
    );

    // Recargar el engine activo si hay
    const activeModel = engineFilterSelect instanceof HTMLSelectElement
        ? String(engineFilterSelect.value || '').trim()
        : '';
    if (activeModel) {
        await loadEngineForFilter(activeModel);
        updateRecordSearchSuggestions();
    }
}


bindClick('loadRecordBtn', () => {

    loadRecordFromControls().catch((error) => alert(`No se pudo cargar el registro: ${error.message}`));

});



bindClick('statsPrevRecordBtn', () => {

    loadRelativeRecord(-1).catch((error) => alert(`No se pudo cargar registro anterior: ${error.message}`));

});



bindClick('statsNextRecordBtn', () => {

    loadRelativeRecord(1).catch((error) => alert(`No se pudo cargar siguiente registro: ${error.message}`));

});

bindClick('statsPrevImportBtn', () => {

    loadRelativeImport(-1).catch((error) => alert(`No se pudo cargar importar anterior: ${error.message}`));

});

bindClick('statsNextImportBtn', () => {

    loadRelativeImport(1).catch((error) => alert(`No se pudo cargar siguiente importar: ${error.message}`));

});

bindClick('statsPrevCopyBtn', () => {

    loadRelativeCopy(-1).catch((error) => alert(`No se pudo cargar copia anterior: ${error.message}`));

});

bindClick('statsNextCopyBtn', () => {

    loadRelativeCopy(1).catch((error) => alert(`No se pudo cargar siguiente copia: ${error.message}`));

});



bindClick('statsPrevErrorBtn', () => {

    loadRelativeError(-1).catch((error) => alert(`No se pudo cargar error anterior: ${error.message}`));

});



bindClick('statsNextErrorBtn', () => {

    loadRelativeError(1).catch((error) => alert(`No se pudo cargar siguiente error: ${error.message}`));

});



bindClick('statsPrevReviewBtn', () => {

    loadRelativeReview(-1).catch((error) => alert(`No se pudo cargar registro revisar anterior: ${error.message}`));

});



bindClick('statsNextReviewBtn', () => {

    loadRelativeReview(1).catch((error) => alert(`No se pudo cargar siguiente registro revisar: ${error.message}`));

});



bindClick('statsPrevPendingBtn', () => {

    loadRelativePending(-1).catch((error) => alert(`No se pudo cargar pendiente anterior: ${error.message}`));

});



bindClick('statsNextPendingBtn', () => {

    loadRelativePending(1).catch((error) => alert(`No se pudo cargar siguiente pendiente: ${error.message}`));

});



bindClick('recalculateRecordBtn', () => {

    runQuickRecomputeForCurrentRecord().catch((error) => {

        setRecomputeStatus(`Error: ${String(error?.message || error)}`, 'error');

    });

});



bindClick('recomputeAllBtn', () => {

    runQuickRecomputeForFullBook().catch((error) => {

        setRecomputeStatus(`Error: ${String(error?.message || error)}`, 'error');

    });

});



bindClick('recomputeRunBtn', () => {

    const filters = getRecomputeModalFilters();
    logRecomputeModalAction('ERRORES', filters);

    runBackendRecompute(filters).catch((error) => {

        setRecomputeStatus(`Error: ${String(error?.message || error)}`, 'error');

    });

});

bindClick('recomputeClearPdfFinalBtn', () => {
    runClearPdfFinalFields().catch((error) => {
        setRecomputeStatus(`Error al vaciar _pdf/_final/_error y marcar revisión: ${String(error?.message || error)}`, 'error');
    });
});

bindClick('recomputeCopyCurrentBtn', () => {

    if (!PDF_FEATURE_AUTO_PDF_ENABLED) {
        setRecomputeStatus('Auto-PDF desactivado para copiar a campos _pdf.', 'error');
        return;
    }

    setRecomputeStatus('Copiando lectura PDF a campos _pdf del registro actual...', '');
    copyPdfReadValuesToPdfFields().then(() => {
        setRecomputeStatus('Campos _pdf del registro actual guardados correctamente.', 'ok');
    }).catch((error) => {
        setRecomputeStatus(`Error al copiar _pdf: ${String(error?.message || error)}`, 'error');
    });

});

bindClick('recomputeErrorsCurrentBtn', () => {

    const runner = QUICK_ERRORS_RECALC_SCOPE === 'all'
        ? runQuickRecomputeErrorsForFullBook
        : runQuickRecomputeErrorsForCurrentRecord;

    runner().catch((error) => {

        const scopeLabel = QUICK_ERRORS_RECALC_SCOPE === 'all' ? 'todo el libro' : 'el registro actual';
        setRecomputeStatus(`Error recalculando _error de ${scopeLabel}: ${String(error?.message || error)}`, 'error');

    });

});

bindClick('recomputePdfRunBtn', () => {

    if (!PDF_FEATURE_AUTO_PDF_ENABLED) {
        return;
    }

    runBackendRecomputePdfAuto().catch((error) => {

        setRecomputeStatus(`Error: ${String(error?.message || error)}`, 'error');

    });

});

bindClick('recomputeCopyBookBtn', () => {

    const filters = getRecomputeModalFilters();
    logRecomputeModalAction('IMPORTAR PDF', filters);
    console.log('[recomputeCopyBookBtn] button pulsado -> runApplyBookPreviewToEngines()');
    runApplyBookPreviewToEngines(filters).catch((error) => {
        setRecomputeStatus(`Error en apply_book_preview_to_engine.py: ${String(error?.message || error)}`, 'error');
    });
});

bindClick('recomputeCalculateFinalBtn', () => {

    const filters = getRecomputeModalFilters();
    logRecomputeModalAction('CÁLCULO FINAL', filters);
    runBackendCalculateFinal(filters).catch((error) => {
        setRecomputeStatus(`Error al calcular FINAL: ${String(error?.message || error)}`, 'error');
    });
});

// Recalcula estado y acción de revisión para todos
bindClick('recomputeRevisionStatusBtn', () => {

    const filters = getRecomputeModalFilters();
    logRecomputeModalAction('ESTADOS', filters);
    runBackendRecalculateRevisionStatus(filters).catch((error) => {
        setRecomputeStatus(`Error: ${String(error?.message || error)}`, 'error');
    });
});


// ── Recálculo en memoria ──────────────────────────────────────────────────────

// Recálculo en memoria (solo UI, sin backend, con selector de modo)
bindClick('localRecalcBtn', () => {
    runLocalRecalculation().catch((error) => {
        setRecomputeStatus(`Error en recálculo local: ${String(error?.message || error)}`, 'error');
    });
});


bindClick('pdfBlueTextsFillBtn', () => {

    if (!PDF_FEATURE_BLUE_TEXT_PANEL_ENABLED) {
        return;
    }

    if (!syncPdfBlueTextsArea()) {

        alert('No se encontró la caja de texto azul.');

    }

});


bindClick('pdfBlueTextsCopyBtn', () => {

    if (!PDF_FEATURE_BLUE_TEXT_PANEL_ENABLED) {
        return;
    }

    copyPdfBlueTextsArea().catch((error) => {

        alert(`No se pudo copiar los textos azules: ${String(error?.message || error)}`);

    });

});

bindClick('pdfLoadCurrentBtn', () => {

    if (!currentRow) {
        alert('Primero debes cargar un registro.');
        return;
    }

    invalidatePendingPdfRowHighlight();
    clearPdfHeaderOnlyOverlay();
    clearPdfHeaderColumnBodyHighlights();
    setPdfExperimentalRowHighlights(null);

    syncPdfWithCurrentRow(currentRow);

});

bindClick('pdfClearOverlaysBtn', () => {

    clearAllPdfOverlaysAndPanels();

});



bindClick('pdfPaintSelectedRowRedBtn', () => {

    highlightPdfRowByPnFinal(currentRow).catch((error) => {

        console.warn('No se pudo pintar en rojo la fila seleccionada en el PDF:', error);

        alert(`No se pudo pintar la fila en rojo: ${String(error?.message || error)}`);

    });

});

bindClick('copyPdfReadToPdfBtn', () => {

    if (!PDF_FEATURE_AUTO_PDF_ENABLED) {
        return;
    }

    copyPdfReadValuesToPdfFields().catch((error) => {

        console.warn('No se pudo copiar la lectura del PDF a los campos _pdf:', error);

        alert(`No se pudo copiar la lectura del PDF: ${String(error?.message || error)}`);

    });

});

bindClick('copyPdfReadToPdfBackendBtn', () => {

    if (!PDF_FEATURE_AUTO_PDF_ENABLED) {
        return;
    }

    copyPdfReadValuesToPdfFieldsBackend().catch((error) => {

        console.warn('No se pudo copiar la lectura del PDF (backend):', error);

        alert(`No se pudo copiar la lectura del PDF (backend): ${String(error?.message || error)}`);

    });

});

bindClick('copyPdfReadToFinalBtn', () => {

    copyCurrentPdfFieldsToFinal().catch((error) => {

        console.warn('No se pudieron copiar los campos _pdf a _final del registro actual:', error);

        alert(`No se pudo copiar PDF a FINAL: ${String(error?.message || error)}`);

    });

});

bindClick('pdfRecomputeErrorsBtn', () => {

    runQuickRecomputeErrorsForCurrentRecord().catch((error) => {

        setRecomputeStatus(`Error: ${String(error?.message || error)}`, 'error');

    });

});

bindClick('pdfRecomputeRevisionBtn', () => {

    runQuickRecomputeRevisionForCurrentRecord().catch((error) => {

        setRecomputeStatus(`Error: ${String(error?.message || error)}`, 'error');

    });

});

bindClick('detectHeadersBtn', () => {
    if (!PDF_FEATURE_HEADERS_ENABLED) {
        return;
    }
    const result = runPdfHeaderOnlyDetection();
    renderHeaderDetectionPanel(result);
});

bindClick('detectTopBomFgBtn', () => {
    if (!PDF_FEATURE_HEADERS_ENABLED) {
        return;
    }
    detectTopBomAndFgInPdf(currentRow).then((result) => {
        renderTopBomFgDetectionPanel(result);
    }).catch((error) => {
        console.warn('No se pudo detectar BOM + FG/FGS superior en el PDF:', error);
        alert(`No se pudo detectar BOM + FG/FGS superior: ${String(error?.message || error)}`);
    });
});

bindClick('headerDetectionCloseBtn', () => {
    clearPdfHeaderOnlyOverlay();
    const panel = document.getElementById('headerDetectionPanel');
    if (panel) panel.hidden = true;
});

bindClick('paintBodyByHeadersBtn', () => {
    if (!PDF_FEATURE_HEADERS_ENABLED) {
        alert('Detecta Headers primero');
        return;
    }
    const result = buildHeaderColumnBodyHighlights();
    renderBodyColumnHighlightPanel(result);
    requestPdfRelayout();
});

bindClick('pdfExtractPageRowsBtn', () => {
    if (!PDF_FEATURE_EXTRACT_PAGE_PREVIEW_ENABLED) {
        return;
    }

    runExtractPdfPageRowsPreview().catch((error) => {
        console.warn('No se pudo extraer el preview de filas de la pagina PDF:', error);
        setPdfActionStatus('Primero ejecuta CABECERAS + TABLA o carga la vista PDF.', 'error');
    });
});

bindClick('bodyColumnHighlightCloseBtn', () => {
    clearPdfHeaderColumnBodyHighlights();
    const panel = document.getElementById('bodyColumnHighlightPanel');
    if (panel) panel.hidden = true;
});

function renderBodyColumnHighlightPanel(result) {
    const panel = document.getElementById('bodyColumnHighlightPanel');
    const body = document.getElementById('bodyColumnHighlightBody');
    const statsBadge = document.getElementById('bodyColumnHighlightStats');
    if (!panel || !body || !statsBadge) return;

    const COLUMN_COLORS = {
        pos: { border: '#2563eb', bg: 'rgba(96,165,250,0.20)', label: 'POS' },
        part_no: { border: '#16a34a', bg: 'rgba(74,222,128,0.18)', label: 'PART NO.' },
        designation: { border: '#ea580c', bg: 'rgba(251,146,60,0.18)', label: 'DESIGNATION' },
        model_type: { border: '#0e7490', bg: 'rgba(103,232,249,0.18)', label: 'MODEL/TYPE' },
        qty: { border: '#7c3aed', bg: 'rgba(196,181,253,0.22)', label: 'QTY.' },
        units: { border: '#ca8a04', bg: 'rgba(253,224,71,0.22)', label: 'UNITS' },
        weight: { border: '#dc2626', bg: 'rgba(252,165,165,0.22)', label: 'WEIGHT' },
        fn: { border: '#a855f7', bg: 'rgba(221,214,254,0.22)', label: 'FN' },
        measurement: { border: '#0891b2', bg: 'rgba(103,232,249,0.20)', label: 'MEASUREMENT' },
        standard: { border: '#0f766e', bg: 'rgba(94,234,212,0.18)', label: 'STANDARD' }
    };

    if (result?.error) {
        statsBadge.textContent = 'Error';
        const errorMsg = result.message || result.error;
        body.innerHTML = `<div style="color:#dc2626;font-size:12px;padding:8px;line-height:1.4">${errorMsg}</div>`;
        if (result.warnings && result.warnings.length > 0) {
            const warningsHtml = result.warnings.map((w) => `<div style="color:#b45309;font-size:11px;padding:2px 0">⚠ ${w}</div>`).join('');
            body.innerHTML += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #ddd">${warningsHtml}</div>`;
        }
        panel.hidden = false;
        return;
    }

    const highlightCount = result?.highlightCount ?? 0;
    const textCount = result?.textCount ?? 0;
    const columnCount = result?.columnCount ?? 0;
    statsBadge.textContent = `${highlightCount} highlights · ${textCount} textos · ${columnCount} cols`;

    const columnStats = result?.columnStats || {};
    const columnsHtml = Object.entries(columnStats).map(([label, stats]) => {
        const c = COLUMN_COLORS[stats.key] || { border: '#888', bg: 'rgba(0,0,0,0.05)' };
        const samplesStr = stats.samples && stats.samples.length > 0
            ? stats.samples.join(', ').substring(0, 80) + '...'
            : '-';
        return `<div class="header-detection-entry" style="border-color:${c.border};background:${c.bg}">
            <span class="header-detection-entry-label" style="color:${c.border}">${label}</span>
            <span class="header-detection-entry-meta">
                x0=${stats.x0} x1=${stats.x1} · ${stats.textCount} textos<br>
                <small style="opacity:0.7">Samples: ${samplesStr}</small>
            </span>
        </div>`;
    }).join('');

    let warningsHtml = '';
    if (result.warnings && result.warnings.length > 0) {
        warningsHtml = `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #ddd">
            ${result.warnings.map((w) => `<div style="color:#b45309;font-size:11px;padding:2px 0">⚠ ${w}</div>`).join('')}
        </div>`;
    }

    // Extra: columna decorativa ignorada
    let decorativeHtml = '';
    if (result.decorativeColumnIgnored && result.decorativeColumn) {
        const dc = result.decorativeColumn;
        const dw = Math.round((dc.x1 ?? 0) - (dc.x0 ?? 0));
        decorativeHtml = `<div style="margin-top:6px;padding:4px 6px;background:rgba(220,38,38,0.08);border:1px solid #dc2626;border-radius:4px;font-size:11px;color:#dc2626">
            🚫 Columna decorativa ignorada: <b>${dc.key}</b> · x0=${dc.x0} · ancho=${dw}px
        </div>`;
    }

    // Extra: candidatos multiline
    let multilineHtml = '';
    const mlCount = result.multilineCandidateCount ?? 0;
    if (mlCount > 0) {
        const mlSamples = (result.multilineCandidates || []).slice(0, 6)
            .map((m) => `<span style="background:rgba(168,85,247,0.12);border:1px solid #a855f7;border-radius:3px;padding:1px 4px;margin:1px;display:inline-block;font-size:10px">${m.text} <span style="opacity:0.6">[${m.column}]</span></span>`)
            .join('');
        multilineHtml = `<div style="margin-top:6px;padding:4px 6px;background:rgba(168,85,247,0.07);border:1px solid #a855f7;border-radius:4px;font-size:11px">
            🔀 <b>${mlCount}</b> candidato(s) multiline (solo debug): ${mlSamples}
        </div>`;
    }

    // Extra: tabla rectDebug (primeros 10 rects con heurísticas)
    let rectDebugHtml = '';
    let splitPnDesignationHtml = '';
    const pnDsSplitCount = result.partNoDesignationSplitCount ?? 0;
    if (pnDsSplitCount > 0) {
        const splitRows = (result.partNoDesignationSplits || []).slice(0, 10).map((s) => {
            return `<div style="padding:2px 0;border-bottom:1px dashed #e5e7eb">
                <span style="color:#16a34a;font-weight:600">${s.pnText}</span>
                <span style="opacity:0.6"> + </span>
                <span style="color:#ea580c">${s.designationText}</span>
                <span style="opacity:0.6"> · splitX=${s.splitX} · ${s.splitMethod}</span>
            </div>`;
        }).join('');
        splitPnDesignationHtml = `<div style="margin-top:6px;padding:6px;background:rgba(22,163,74,0.08);border:1px solid #16a34a;border-radius:4px;font-size:11px">
            <div style="font-weight:700;margin-bottom:3px">Splits PN + DESIGNATION: ${pnDsSplitCount}</div>
            ${splitRows}
        </div>`;
    }

    let measurementStandardSummaryHtml = '';
    const measurementRectsCount = result.measurementRectsCount ?? 0;
    const standardRectsCount = result.standardRectsCount ?? 0;
    const fnRectsCount = result.fnRectsCount ?? 0;
    const msWarnings = result.measurementStandardBoundaryWarnings || [];
    if (measurementRectsCount > 0 || standardRectsCount > 0 || fnRectsCount > 0 || msWarnings.length > 0) {
        const warningRows = msWarnings.slice(0, 10).map((w) => {
            return `<div style="padding:1px 0;font-size:10px;opacity:0.85">${w.type} · x=${w.left} · cX=${w.centerX} · ${w.text}</div>`;
        }).join('');
        measurementStandardSummaryHtml = `<div style="margin-top:6px;padding:6px;background:rgba(8,145,178,0.08);border:1px solid #0891b2;border-radius:4px;font-size:11px">
            <div style="font-weight:700;margin-bottom:3px">Measurement/Standard Summary</div>
            <div>measurementRectsCount: <b>${measurementRectsCount}</b> · standardRectsCount: <b>${standardRectsCount}</b> · fnRectsCount: <b>${fnRectsCount}</b></div>
            <div>measurementStandardBoundaryWarnings: <b>${msWarnings.length}</b></div>
            <div>fnMeasurementCorrectionsCount: <b>${result.fnMeasurementCorrectionsCount ?? 0}</b></div>
            ${warningRows}
        </div>`;
    }

    let footerNoiseHtml = '';
    const footerNoiseIgnoredCount = result.footerNoiseIgnoredCount ?? 0;
    const footerNoiseExamples = result.footerNoiseIgnoredExamples || [];
    if (footerNoiseIgnoredCount > 0 || footerNoiseExamples.length > 0) {
        const rows = footerNoiseExamples.slice(0, 8)
            .map((txt) => `<div style="padding:1px 0;font-size:10px;opacity:0.85">${txt}</div>`)
            .join('');
        footerNoiseHtml = `<div style="margin-top:6px;padding:6px;background:rgba(220,38,38,0.08);border:1px solid #dc2626;border-radius:4px;font-size:11px">
            <div style="font-weight:700;margin-bottom:3px">Footer Noise Ignored: ${footerNoiseIgnoredCount}</div>
            ${rows}
        </div>`;
    }

    const rectDebug = result.rectDebug || [];
    if (rectDebug.length > 0) {
        const rows = rectDebug.slice(0, 10).map((rd) => {
            const pnBadge = rd.isLikelyPartNumber ? '<span style="color:#16a34a;font-weight:700">PN</span>' : '';
            const fnBadge = rd.isLikelyFnToken ? '<span style="color:#a855f7;font-weight:700">FN</span>' : '';
            const dsBadge = rd.isLikelyDesignationText ? '<span style="color:#ea580c;font-weight:700">DS</span>' : '';
            const mlBadge = rd.multilineCandidate ? '<span style="color:#a855f7">ML</span>' : '';
            const splitBadge = rd.splitFromCombined ? '<span style="color:#dc2626;font-weight:700">SPLIT</span>' : '';
            const c = COLUMN_COLORS[rd.column] || { border: '#888' };
            const boundary = rd.boundaryCase || '-';
            const beforeAfter = `${rd.assignedColumnBeforeCorrection || '-'}→${rd.assignedColumnAfterCorrection || '-'}`;
            const splitInfo = rd.splitType
                ? `${rd.splitType} (${rd.splitMethod || '-'}, x=${rd.splitX ?? '-'})`
                : '-';
            const fnFix = rd.correctedFromMeasurementToFn ? 'yes' : 'no';
            const fnReason = rd.fnMeasurementReason || '-';
            return `<tr>
                <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${rd.text}">${rd.text}</td>
                <td style="color:${c.border};font-weight:600">${rd.column}</td>
                <td>${rd.assignedBy}</td>
                <td>${rd.overlapRatio}</td>
                <td>${pnBadge}${fnBadge}${dsBadge}${mlBadge}${splitBadge}</td>
                <td>${boundary}</td>
                <td>${beforeAfter}</td>
                <td>${fnFix}</td>
                <td>${fnReason}</td>
                <td>${rd.x0 ?? '-'}/${rd.x1 ?? '-'}</td>
                <td>${rd.centerX ?? '-'}</td>
                <td>${rd.overlapMeasurement ?? '-'}</td>
                <td>${rd.overlapStandard ?? '-'}</td>
                <td>${splitInfo}</td>
                <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${rd.pnText || '-'}">${rd.pnText || '-'}</td>
                <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${rd.designationText || '-'}">${rd.designationText || '-'}</td>
                <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${rd.originalText || rd.text}">${rd.originalText || rd.text}</td>
            </tr>`;
        }).join('');
        rectDebugHtml = `<details style="margin-top:8px;font-size:11px">
            <summary style="cursor:pointer;color:#555;padding:2px 0">▶ rectDebug (primeros ${Math.min(10, rectDebug.length)} de ${rectDebug.length})</summary>
            <table style="width:100%;border-collapse:collapse;margin-top:4px">
                <thead><tr style="background:#f0f0f0">
                    <th style="text-align:left;padding:2px 4px">Texto</th>
                    <th style="text-align:left;padding:2px 4px">Columna</th>
                    <th style="text-align:left;padding:2px 4px">assignedBy</th>
                    <th style="text-align:left;padding:2px 4px">overlap</th>
                    <th style="text-align:left;padding:2px 4px">Flags</th>
                    <th style="text-align:left;padding:2px 4px">boundaryCase</th>
                    <th style="text-align:left;padding:2px 4px">before→after</th>
                    <th style="text-align:left;padding:2px 4px">corr M→FN</th>
                    <th style="text-align:left;padding:2px 4px">fnReason</th>
                    <th style="text-align:left;padding:2px 4px">x0/x1</th>
                    <th style="text-align:left;padding:2px 4px">centerX</th>
                    <th style="text-align:left;padding:2px 4px">ovlMeasure</th>
                    <th style="text-align:left;padding:2px 4px">ovlStandard</th>
                    <th style="text-align:left;padding:2px 4px">split</th>
                    <th style="text-align:left;padding:2px 4px">pnText</th>
                    <th style="text-align:left;padding:2px 4px">designationText</th>
                    <th style="text-align:left;padding:2px 4px">originalText</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </details>`;
    }

    body.innerHTML = columnsHtml + decorativeHtml + splitPnDesignationHtml + measurementStandardSummaryHtml + footerNoiseHtml + multilineHtml + rectDebugHtml + warningsHtml;
    panel.hidden = false;
}


function renderRecomputePdfNotFoundDetail(result, selectedModel = '') {

    const panel = $('recomputePdfDetailPanel');

    const title = $('recomputePdfDetailTitle');

    const meta = $('recomputePdfDetailMeta');

    const body = $('recomputePdfDetailBody');



    if (!(panel instanceof HTMLElement)
        || !(title instanceof HTMLElement)
        || !(meta instanceof HTMLElement)
        || !(body instanceof HTMLElement)) {

        return;

    }



    _lastRecomputeNotFoundResult = result || null;
    _lastRecomputeNotFoundModel = String(selectedModel || '').trim();

    const rows = Array.isArray(result?.not_found_rows) ? result.not_found_rows : [];
    const stats = result?.stats || {};
    const modelLabel = txt(selectedModel, 'N/A');
    const filteredRows = getFilteredRecomputeNotFoundRows(result);

    title.textContent = `Registros sin match PDF · ${modelLabel}`;
    meta.textContent = `Endpoint: POST /api/pdf-preview/apply-to-engine | not_found=${Number(stats.not_found) || rows.length} | visibles=${filteredRows.length}`;

    const reasonCounts = rows.reduce((acc, row) => {
        const reason = String(row?.reason || 'unknown');
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
    }, {});

    const summaryCards = [
        { label: 'No encontrados', value: String(Number(stats.not_found) || rows.length) },
        { label: 'Filtrados', value: String(filteredRows.length) },
        { label: 'Other', value: String(reasonCounts['other'] || 0) },
        { label: 'Sin POS', value: String(reasonCounts['missing-pos'] || 0) },
        { label: 'Sin match engine', value: String(reasonCounts['no-engine-match'] || 0) },
        { label: 'Total filas', value: String(rows.length) }
    ];

    const controlsHtml = `
        <div class="recompute-notfound-controls" style="display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:10px 0 14px;">
            <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#475569;">
                <span>Motivo</span>
                <select id="recomputeNotFoundReasonFilter" style="min-width:180px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;">
                    <option value="all">Todos</option>
                    <option value="other">Other</option>
                    <option value="missing-pos">Sin POS</option>
                    <option value="no-engine-match">Sin match engine</option>
                </select>
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#475569;flex:1;min-width:220px;">
                <span>Buscar</span>
                <input id="recomputeNotFoundTextFilter" type="search" placeholder="Page, POS, PN o reason" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;" />
            </label>
            <button id="recomputeNotFoundExportCsvBtn" type="button" class="is-success" style="height:34px;padding:0 14px;">Exportar CSV</button>
        </div>
    `;

    const summaryHtml = `

        <div class="recompute-result-summary">

            ${summaryCards.map((card) => `

                <div class="recompute-result-kpi">

                    <div class="recompute-result-kpi-label">${escapeHtml(card.label)}</div>

                    <div class="recompute-result-kpi-value">${escapeHtml(card.value)}</div>

                </div>

            `).join('')}

        </div>

    `;

    if (!rows.length) {
        body.innerHTML = `${summaryHtml}${controlsHtml}<p class="recompute-result-empty">No hay registros no encontrados para este run.</p>`;
        panel.hidden = false;
        return;
    }

    const rowsHtml = filteredRows.map((row) => {
        return `

            <tr>
                <td>${escapeHtml(txt(row?.page, ''))}</td>
                <td>${escapeHtml(txt(row?.pos_pdf ?? row?.pos, ''))}</td>
                <td>${escapeHtml(txt(row?.pn_pdf, ''))}</td>
                <td>${escapeHtml(txt(row?.reason, ''))}</td>
            </tr>

        `;
    }).join('');

    body.innerHTML = `${summaryHtml}${controlsHtml}

        <div class="recompute-result-table-wrap">

            <table class="recompute-result-table">

                <thead>

                    <tr>
                        <th>Page</th>
                        <th>POS PDF</th>
                        <th>PN PDF</th>
                        <th>Reason</th>
                    </tr>

                </thead>

                <tbody>${rowsHtml}</tbody>

            </table>

        </div>`;

    const reasonFilter = $('recomputeNotFoundReasonFilter');
    const textFilter = $('recomputeNotFoundTextFilter');
    const exportBtn = $('recomputeNotFoundExportCsvBtn');

    if (reasonFilter instanceof HTMLSelectElement) {
        reasonFilter.value = String(_lastRecomputeNotFoundFilters?.reason || 'all');
        reasonFilter.onchange = () => {
            _lastRecomputeNotFoundFilters.reason = String(reasonFilter.value || 'all').trim() || 'all';
            renderRecomputePdfNotFoundDetail(_lastRecomputeNotFoundResult, _lastRecomputeNotFoundModel);
        };
    }

    if (textFilter instanceof HTMLInputElement) {
        textFilter.value = String(_lastRecomputeNotFoundFilters?.query || '');
        textFilter.oninput = () => {
            _lastRecomputeNotFoundFilters.query = String(textFilter.value || '');
            renderRecomputePdfNotFoundDetail(_lastRecomputeNotFoundResult, _lastRecomputeNotFoundModel);
        };
    }

    if (exportBtn instanceof HTMLButtonElement) {
        exportBtn.onclick = () => downloadRecomputeNotFoundCsv(_lastRecomputeNotFoundResult, _lastRecomputeNotFoundModel);
    }

    panel.hidden = false;
}


function renderHeaderDetectionPanel(result) {
    const panel = document.getElementById('headerDetectionPanel');
    const body = document.getElementById('headerDetectionBody');
    const confBadge = document.getElementById('headerDetectionConfidence');
    if (!panel || !body || !confBadge) return;

    const HEADER_COLORS = {
        pos: { border: '#2563eb', bg: 'rgba(96,165,250,0.20)', label: 'POS' },
        part_no: { border: '#16a34a', bg: 'rgba(74,222,128,0.18)', label: 'PART NO.' },
        designation: { border: '#ea580c', bg: 'rgba(251,146,60,0.18)', label: 'DESIGNATION' },
        model_type: { border: '#0e7490', bg: 'rgba(103,232,249,0.18)', label: 'MODEL/TYPE' },
        qty: { border: '#7c3aed', bg: 'rgba(196,181,253,0.22)', label: 'QTY.' },
        units: { border: '#ca8a04', bg: 'rgba(253,224,71,0.22)', label: 'UNITS' },
        weight: { border: '#dc2626', bg: 'rgba(252,165,165,0.22)', label: 'WEIGHT' },
        fn: { border: '#a855f7', bg: 'rgba(221,214,254,0.22)', label: 'FN' },
        measurement: { border: '#0891b2', bg: 'rgba(103,232,249,0.20)', label: 'MEASUREMENT' },
        standard: { border: '#0f766e', bg: 'rgba(94,234,212,0.18)', label: 'STANDARD' }
    };

    if (result?.error) {
        confBadge.textContent = 'sin datos';
        body.innerHTML = `<div style="color:#c63c2c;font-size:12px;padding:4px 0">${result.error}</div>`;
        panel.hidden = false;
        return;
    }

    const conf = result?.confidence || '?';
    const matchCount = result?.matchCount ?? 0;
    confBadge.textContent = `${conf} · ${matchCount}/10 headers`;

    const entries = Array.isArray(result?.entries) ? result.entries : [];

    // Build legend.
    const legendHtml = `<div class="header-detection-legend">${Object.entries(HEADER_COLORS).map(([key, c]) => {
        const found = entries.some((e) => e.key === key && e.found);
        return `<span class="header-detection-legend-chip${found ? '' : ' is-missing'}"
                style="border-color:${c.border};background:${c.bg};color:${c.border}">${c.label}</span>`;
    }).join('')
        }</div>`;

    if (!entries.length) {
        body.innerHTML = legendHtml + '<div style="color:#5e6f84;font-size:12px;padding:4px 0">No se detectaron headers en esta página.</div>';
        panel.hidden = false;
        return;
    }

    const entriesHtml = entries.map((e) => {
        const c = HEADER_COLORS[e.key] || { border: '#888', bg: 'rgba(0,0,0,0.05)', label: e.key };
        if (!e.found) {
            return `<div class="header-detection-entry is-missing"
                style="border-color:${c.border};background:rgba(0,0,0,0.03)">
                <span class="header-detection-entry-label" style="color:${c.border};opacity:0.5">${c.label}</span>
                <span class="header-detection-entry-meta" style="color:#9ca3af;font-style:italic">No detectado</span>
            </div>`;
        }
        return `<div class="header-detection-entry"
            style="border-color:${c.border};background:${c.bg}">
            <span class="header-detection-entry-label" style="color:${c.border}">${c.label}</span>
            <span class="header-detection-entry-meta">
                texto: <b>${e.text}</b> · variante: <i>${e.variant}</i><br>
                x0=${e.x0} x1=${e.x1} · y0=${e.y0} y1=${e.y1}<br>
                confianza: <b>${e.confidence}</b> (score ${e.score}) · ${e.method}
            </span>
        </div>`;
    }).join('');

    body.innerHTML = legendHtml + entriesHtml;
    panel.hidden = false;
}


function renderTopBomFgDetectionPanel(result) {
    const panel = document.getElementById('headerDetectionPanel');
    const body = document.getElementById('headerDetectionBody');
    const confBadge = document.getElementById('headerDetectionConfidence');
    if (!panel || !body || !confBadge) return;

    if (result?.error) {
        confBadge.textContent = 'sin datos';
        body.innerHTML = `<div style="color:#c63c2c;font-size:12px;padding:4px 0">${escapeHtml(String(result.error || 'Sin datos'))}</div>`;
        panel.hidden = false;
        return;
    }

    const entries = Array.isArray(result?.entries) ? result.entries : [];
    const foundCount = Number(result?.foundCount || 0);
    confBadge.textContent = `${foundCount}/2 detectados`;

    const COLORS = {
        fg_fgs: { border: '#0f766e', bg: 'rgba(94,234,212,0.18)' },
        bom: { border: '#7c3aed', bg: 'rgba(196,181,253,0.22)' }
    };

    const html = entries.map((entry) => {
        const key = String(entry?.key || 'unknown');
        const color = COLORS[key] || { border: '#6b7280', bg: 'rgba(209,213,219,0.30)' };
        const label = String(entry?.label || key);
        if (!entry?.found) {
            return `<div class="header-detection-entry is-missing" style="border-color:${color.border};background:rgba(0,0,0,0.03)">
                <span class="header-detection-entry-label" style="color:${color.border};opacity:0.65">${escapeHtml(label)}</span>
                <span class="header-detection-entry-meta" style="color:#9ca3af;font-style:italic">No detectado en zona superior</span>
            </div>`;
        }

        const lineInfo = Number.isInteger(Number(entry?.lineIndex)) ? `linea ${Number(entry.lineIndex) + 1}` : 'linea ?';
        const methodInfo = String(entry?.method || '').trim() || 'same-line';
        return `<div class="header-detection-entry" style="border-color:${color.border};background:${color.bg}">
            <span class="header-detection-entry-label" style="color:${color.border}">${escapeHtml(label)}</span>
            <span class="header-detection-entry-meta">valor: <b>${escapeHtml(String(entry?.value || ''))}</b><br>${escapeHtml(lineInfo)} · ${escapeHtml(methodInfo)}</span>
        </div>`;
    }).join('');

    const summary = `<div style="font-size:11px;color:#5e6f84;padding-bottom:6px">Analizadas ${Number(result?.lineCount || 0)} lineas superiores del PDF.</div>`;
    body.innerHTML = summary + html;
    panel.hidden = false;
}

bindClick('statusEstadoOkBtn', () => {

    setManualRevisionEstado('ok').catch((error) => alert(`No se pudo guardar estado OK: ${error.message}`));

});



bindClick('statusEstadoPendingBtn', () => {

    setManualRevisionEstado('pendiente').catch((error) => alert(`No se pudo guardar estado pendiente: ${error.message}`));

});



bindClick('statusAccionEliminarBtn', () => {

    setReviewStatus('ko').catch((error) => alert(`No se pudo guardar estado KO: ${error.message}`));

});



bindClick('statusAccionImportarBtn', () => {

    setReviewStatus('ok').catch((error) => alert(`No se pudo guardar accion importar: ${error.message}`));

});



bindClick('statusAccionCopiaBtn', () => {

    setReviewStatus('copia').catch((error) => alert(`No se pudo guardar accion copia: ${error.message}`));

});



bindClick('statusAccionRevisarBtn', () => {

    setReviewStatus('review').catch((error) => alert(`No se pudo guardar accion revisar: ${error.message}`));

});



bindClick('propagateHermanosBtn', () => {

    applyPnCopyPropagationFromCurrent().catch((error) => alert(`Error al propagar hermanos: ${error.message}`));

});



bindClick('propagateHermanosBookBtn', () => {

    applyPnCopyPropagationForCurrentBook().catch((error) => alert(`Error al propagar hermanos del libro: ${error.message}`));

});



const statusEstadoSelect = $('statusEstadoSelect');

if (statusEstadoSelect instanceof HTMLSelectElement) {

    statusEstadoSelect.addEventListener('change', () => {

        const nextEstado = String(statusEstadoSelect.value || '').trim().toLowerCase() === 'ok' ? 'ok' : 'pendiente';

        setManualRevisionEstado(nextEstado).catch((error) => {

            alert(`No se pudo guardar estado: ${error.message}`);

            renderReviewStateButtons(currentRow);

        });

    });

}



const statusAccionSelect = $('statusAccionSelect');

if (statusAccionSelect instanceof HTMLSelectElement) {

    statusAccionSelect.addEventListener('change', () => {

        const nextAccion = String(statusAccionSelect.value || '').trim().toLowerCase();

        const kind = nextAccion === 'eliminar' ? 'ko'

            : (nextAccion === 'revisar' ? 'review'

                : (nextAccion === 'copia' ? 'copia' : 'ok'));

        setReviewStatus(kind).catch((error) => {

            alert(`No se pudo guardar acción: ${error.message}`);

            renderReviewStateButtons(currentRow);

        });

    });

}



const recordIdInput = $('recordIdInput');

if (recordIdInput instanceof HTMLInputElement) {

    recordIdInput.addEventListener('input', () => {

        updateRecordSearchSuggestions();

    });



    recordIdInput.addEventListener('keydown', (event) => {

        if (event.key !== 'Enter') return;

        event.preventDefault();

        loadRecordFromControls().catch((error) => alert(`No se pudo cargar el registro: ${error.message}`));

    });

}



const engineFilterSelect = $('engineFilterSelect');

if (engineFilterSelect instanceof HTMLSelectElement) {

    engineFilterSelect.addEventListener('change', () => {

        const selectedModel = String(engineFilterSelect.value || '').trim();

        const recomputeBookSelect = getRecomputeBookSelect();

        if (recomputeBookSelect instanceof HTMLSelectElement) {

            recomputeBookSelect.value = selectedModel;

        }

        loadEngineForFilter(selectedModel).then(() => {

            updateRecordSearchSuggestions();

        }).catch((error) => {

            alert(`No se pudo cargar el libro seleccionado: ${error.message}`);

        });

    });

}



document.addEventListener('keydown', (event) => {

    if (event.key !== 'ArrowRight') return;

    const activeEl = document.activeElement;

    if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLSelectElement) return;

    const editModal = $('editRecordModal');

    const recomputeModal = $('recomputeModal');

    if ((editModal instanceof HTMLElement && !editModal.hidden) || (recomputeModal instanceof HTMLElement && !recomputeModal.hidden)) return;

    event.preventDefault();

    loadRelativePending(1).catch((error) => alert(`No se pudo cargar siguiente pendiente: ${error.message}`));

});



initialize();

