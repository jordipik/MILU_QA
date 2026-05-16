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

import { getPdfExperimentalBlueTexts, initPdfZoomControls, loadPdfClear, loadPdfWithPage, requestPdfRelayout, setPdfExperimentalRowHighlights, setPdfReadTokens, setPdfSelection, runPdfHeaderOnlyDetection, clearPdfHeaderOnlyOverlay, buildHeaderColumnBodyHighlights, clearPdfHeaderColumnBodyHighlights, refreshPdfSelectionOverlayFromCache } from './pdf-viewer.js';

import { evaluateQaChecksForField, evaluateRowQaChecks, getAllQaCheckCodes, getQaCheckLabel } from './qa-checks.js';

import { confirmTypedAction } from './confirm-typed-action.js';

import { showToast } from './toast.js';

const $ = (id) => document.getElementById(id);



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



const FIELD_TO_ERROR_KEY = {

    'POS': 'pos_error',

    'PART NO.': 'pn_error',

    'DESIGNATION': 'designation_error',

    'WEIGHT': 'weight_error',

    'MEASUREMENT / STANDARD': 'measurement_error',

    'NORMA': 'norma_error',

    'BOM-No.': 'bom_error'

};



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

let isApplyingPdfAutoDesignation = false;

let isApplyingPdfAutoPn = false;

let isApplyingPdfAutoPos = false;

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

    const normalized = normalizeString(value);

    if (!normalized || normalized === '-') return '';

    return normalized

        .toLowerCase()

        .normalize('NFD')

        .replace(/[\u0300-\u036f]/g, '');

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



    const getMismatchClassAgainstFinal = (value) => {

        const normalizedValue = normalizeCompareValue(value);

        const normalizedFinal = normalizeCompareValue(finalValue);

        if (!normalizedValue || !normalizedFinal) return '';

        return normalizedValue === normalizedFinal ? 'compare-match' : 'compare-mismatch-soft';

    };



    const finalMissing = isRequiredComparisonField(entry?.field) && normalizeCompareValue(finalValue) === '';

    const excelMatchesSubst = isCompareMatch(excelValue, substValue);

    const gesaMatchesFinal = isCompareMatch(gesaValue, finalValue);

    const pdfMatchesFinal = isCompareMatch(pdfValue, finalValue);

    const excelSubstMatchClass = excelMatchesSubst ? 'compare-raw-sust-match' : '';



    return {

        excelClass: [getMismatchClassAgainstFinal(excelValue), excelSubstMatchClass].filter(Boolean).join(' '),

        substClass: excelMatchesSubst ? `compare-match ${excelSubstMatchClass}` : '',

        finalClass: finalMissing ? 'compare-missing' : (gesaMatchesFinal || pdfMatchesFinal ? 'compare-match' : ''),

        gesaClass: getMismatchClassAgainstFinal(gesaValue),

        pdfClass: getMismatchClassAgainstFinal(pdfValue),

        // Aliases legacy para compatibilidad con código que lea rawClass/sustClass/pdfAutoClass

        rawClass: [getMismatchClassAgainstFinal(excelValue), excelSubstMatchClass].filter(Boolean).join(' '),

        sustClass: excelMatchesSubst ? `compare-match ${excelSubstMatchClass}` : '',

        pdfAutoClass: getMismatchClassAgainstFinal(pdfValue)

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



async function findPdfLineByPnFinal(record = currentRow) {

    if (!record) {
        return { pnFinal: '', normalizedPn: '', pnMatches: [], pnClusterMatches: [], lineIndices: [], lineItems: [], pageText: null };
    }

    const book = String(record?.engine_model ?? '').trim();
    const sourcePage = String(record?.['Source Page'] ?? '').trim();
    const pnFinal = String(record?.pn_final ?? record?.['PART NO.'] ?? '').trim();
    const normalizedPn = normalizePdfToken(pnFinal);

    if (!book || !sourcePage || !normalizedPn) {
        return { pnFinal, normalizedPn, pnMatches: [], pnClusterMatches: [], lineIndices: [], lineItems: [], pageText: null };
    }

    const pageText = await getPdfPageNormalizedText(book, sourcePage);
    const pnMatches = (pageText?.items || []).filter((item) => tokenMatchesPdf(item?.normalized, normalizedPn));
    const pnClusterMatches = (pageText?.clusters || []).filter((cluster) => tokenMatchesPdf(cluster?.normalized, normalizedPn));
    const lineIndices = Array.from(new Set([
        ...pnMatches.map((item) => Number(item?.lineIndex)).filter(Number.isInteger),
        ...pnClusterMatches.map((cluster) => Number(cluster?.lineIndex)).filter(Number.isInteger)
    ])).sort((a, b) => a - b);

    return {
        pnFinal,
        normalizedPn,
        pnMatches,
        pnClusterMatches,
        lineIndices,
        lineItems: buildPdfLineItemsFromTextContent(pageText, lineIndices),
        pageText
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



function initRecomputeModal() {

    const quickRecomputeBtn = $('openRecomputeModalBtn');

    const recomputeAllBtn = $('recomputeAllBtn');

    const modal = $('recomputeModal');

    const closeBtn = $('recomputeModalClose');

    const backdrop = modal?.querySelector('.recompute-modal-backdrop');

    const recomputeRunBtn = $('recomputeRunBtn');

    const recomputePdfRunBtn = $('recomputePdfRunBtn');



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



    syncRecomputeEngineSelect();

    const recomputeIdInput = $('recomputeIdInput');

    if (recomputeIdInput instanceof HTMLInputElement) {

        recomputeIdInput.value = String(currentRow?.ID ?? '').trim();

    }



    const closeModal = () => {

        modal.hidden = true;

    };



    if (recomputeRunBtn instanceof HTMLButtonElement) {

        recomputeRunBtn.disabled = !allowRecompute;

        recomputeRunBtn.title = allowRecompute ? '' : 'Disponible solo en local (localhost:3000).';

    }



    if (recomputePdfRunBtn instanceof HTMLButtonElement) {

        recomputePdfRunBtn.disabled = !allowRecompute;

        recomputePdfRunBtn.title = allowRecompute ? '' : 'Disponible solo en local (localhost:3000).';

    }



    setRecomputeStatus(

        allowRecompute

            ? 'Listo para ejecutar.'

            : getLocalOnlyBackendMessage('recompute-qa-errors'),

        allowRecompute ? '' : 'error'

    );



    closeBtn?.addEventListener('click', closeModal);

    backdrop?.addEventListener('click', closeModal);



    document.addEventListener('keydown', (event) => {

        if (!modal.hidden && event.key === 'Escape') closeModal();

    });

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

    if (row?.pn_final) $('editRecordPnFinal').value = String(row.pn_final);

    if (row?.designation_final) $('editRecordDesignationFinal').value = String(row.designation_final);

    if (row?.weight_final) $('editRecordWeightFinal').value = String(row.weight_final);

    if (row?.measure_final ?? row?.measurement_final) $('editRecordMeasurementFinal').value = String(row?.measure_final ?? row?.measurement_final);

    if (row?.norma) $('editRecordNorma').value = String(row.norma);

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



            const mustAutoRecompute = [...changedFields].some((field) => AUTO_RECOMPUTE_TRIGGER_FIELDS.has(field));

            const recomputeErrors = ($('editRecordRecomputeErrors') instanceof HTMLInputElement)

                ? $('editRecordRecomputeErrors').checked

                : mustAutoRecompute;

            const recomputePdf = ($('editRecordRecomputePdf') instanceof HTMLInputElement)

                ? $('editRecordRecomputePdf').checked

                : mustAutoRecompute;



            if (recomputeErrors || recomputePdf) {

                setEditRecordStatus('Registro guardado. Recalculando...', '');

                if (recomputeErrors) {

                    await postJsonToBackendCandidates('recompute-qa-errors', {

                        file: engineFile, id, dryRun: false, updateRevision: false, backup: true

                    });

                }

                if (recomputePdf) {

                    await postJsonToBackendCandidates('recompute-pdf-auto', {

                        file: engineFile, id, dryRun: false, backup: true

                    });

                }

                await reloadEditedRecord(engineFile, id);

                setEditRecordStatus('Registro guardado y recalculado correctamente.', 'ok');

            } else {

                setEditRecordStatus('Registro guardado correctamente.', 'ok');

            }



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

    const body = $('comparisonBody');

    if (!(body instanceof HTMLElement)) return;



    body.addEventListener('dblclick', async (event) => {

        const target = event.target;

        if (!(target instanceof HTMLElement)) return;



        const pdfAutoCopyCell = target.closest('td[data-copy-pdf-auto-designation="true"]');

        if (pdfAutoCopyCell && currentRow) {

            event.preventDefault();

            await copyPdfAutoDesignationToFinalAndRecompute();

            return;

        }



        const pdfAutoCopyPnCell = target.closest('td[data-copy-pdf-auto-pn="true"]');

        if (pdfAutoCopyPnCell && currentRow) {

            event.preventDefault();

            await copyPdfAutoPnToFinalAndRecompute();

            return;

        }



        const pdfAutoCopyPosCell = target.closest('td[data-copy-pdf-auto-pos="true"]');

        if (pdfAutoCopyPosCell && currentRow) {

            event.preventDefault();

            await copyPdfAutoPosToFinalAndRecompute();

            return;

        }



        const editableCell = target.closest('td[data-open-edit-record-modal="true"]');

        if (!editableCell || !currentRow) return;



        event.preventDefault();

        openEditRecordModalForRow(currentRow);

    });

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



const LOCAL_ONLY_BACKEND_ENDPOINTS = new Set(['recompute-qa-errors', 'recompute-pdf-auto']);



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



function syncRecomputeEngineSelect() {

    const source = $('engineFilterSelect');

    const target = $('recomputeEngineSelect');

    if (!(source instanceof HTMLSelectElement) || !(target instanceof HTMLSelectElement)) return;



    target.innerHTML = ENGINE_BOOK_MODELS

        .map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`)

        .join('');

    target.value = source.value;

}



async function runBackendRecompute() {

    const recomputeEngineSelect = $('recomputeEngineSelect');

    const recomputeIdInput = $('recomputeIdInput');

    const recomputeUpdateRevisionInput = $('recomputeUpdateRevisionInput');

    const recomputeForceRevisionInput = $('recomputeForceRevisionInput');

    const recomputeRunBtn = $('recomputeRunBtn');

    const recomputePdfRunBtn = $('recomputePdfRunBtn');

    const engineFilterSelect = $('engineFilterSelect');



    if (!(recomputeEngineSelect instanceof HTMLSelectElement)

        || !(recomputeIdInput instanceof HTMLInputElement)

        || !(recomputeRunBtn instanceof HTMLButtonElement)

        || !(engineFilterSelect instanceof HTMLSelectElement)) {

        return;

    }



    const selectedModel = String(recomputeEngineSelect.value || '').trim();

    const file = resolveEngineFileFromFilter(selectedModel);

    const id = String(recomputeIdInput.value || '').trim();

    const dryRun = false;

    const updateRevision = recomputeUpdateRevisionInput instanceof HTMLInputElement ? recomputeUpdateRevisionInput.checked : false;

    const forceRevision = recomputeForceRevisionInput instanceof HTMLInputElement ? recomputeForceRevisionInput.checked : false;



    if (!file) {

        alert('No se pudo resolver el archivo engine para el recálculo.');

        return;

    }



    if (!isBackendEndpointAllowed('recompute-qa-errors')) {

        setRecomputeStatus(getLocalOnlyBackendMessage('recompute-qa-errors'), 'error');

        return;

    }



    const payload = {

        file,

        dryRun,

        updateRevision,

        forceRevision,

        backup: true

    };

    if (id) payload.id = id;



    recomputeRunBtn.disabled = true;

    if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = true;

    setRecomputeStatus('Ejecutando recálculo en backend...', '');



    const urls = getBackendCandidateUrls('recompute-qa-errors');

    let lastError = '';

    let lastTriedUrl = '';

    let result = null;



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

                    file,

                    mode: id ? 'single-id' : 'full-book',

                    id: id || null,

                    dryRun,

                    updateRevision,

                    scanned: Number(legacyTotals.totalRows) || 0,

                    changedRows: Number(legacyTotals.changedRows) || 0,

                    okRows: Math.max((Number(legacyTotals.totalRows) || 0) - (Number(legacyTotals.rowsWithErrors) || 0), 0),

                    koRows: Number(legacyTotals.rowsWithErrors) || 0,

                    wroteFile: !dryRun && (Number(legacyTotals.changedRows) || 0) > 0

                };

            }

            break;

        } catch (error) {

            lastError = String(error?.message || error || 'Error de red');

        }

    }



    recomputeRunBtn.disabled = false;

    if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = false;



    if (!result) {

        const idHint = id

            ? ` Verifica si el ID ${id} existe en ${selectedModel} o deja el ID vacio para recalcular el libro completo.`

            : '';

        setRecomputeStatus(

            `Error: ${lastError || `No se pudo ejecutar el recálculo (ultimo endpoint: ${lastTriedUrl || 'sin URL'}). Comprueba que server.js este activo en http://localhost:3000 y responde en /health.`}${idHint}`,

            'error'

        );

        return;

    }



    const modeLabel = result.mode === 'single-id' ? `ID ${result.id}` : 'libro completo';

    setRecomputeStatus(

        `OK ${modeLabel} | scanned=${result.scanned} changed=${result.changedRows} ok=${result.okRows} ko=${result.koRows} dryRun=${result.dryRun ? 'si' : 'no'}`,

        'ok'

    );



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



async function runBackendRecomputePdfAuto() {

    const recomputeEngineSelect = $('recomputeEngineSelect');

    const recomputeIdInput = $('recomputeIdInput');

    const recomputeRunBtn = $('recomputeRunBtn');

    const recomputePdfRunBtn = $('recomputePdfRunBtn');

    const engineFilterSelect = $('engineFilterSelect');



    if (!(recomputeEngineSelect instanceof HTMLSelectElement)

        || !(recomputeIdInput instanceof HTMLInputElement)

        || !(recomputeRunBtn instanceof HTMLButtonElement)

        || !(recomputePdfRunBtn instanceof HTMLButtonElement)

        || !(engineFilterSelect instanceof HTMLSelectElement)) {

        return;

    }



    const selectedModel = String(recomputeEngineSelect.value || '').trim();

    const file = resolveEngineFileFromFilter(selectedModel);

    const id = String(recomputeIdInput.value || '').trim();

    const dryRun = false;

    const pdfAutoBefore = Object.fromEntries(

        Object.keys(FIELD_TO_PDF_AUTO_KEY).map((fieldName) => [fieldName, getStoredPdfAutoValue(currentRow, fieldName)])

    );



    if (!file) {

        alert('No se pudo resolver el archivo engine para recalcular PDF_AUTO.');

        return;

    }



    if (!isBackendEndpointAllowed('recompute-pdf-auto')) {

        setRecomputeStatus(getLocalOnlyBackendMessage('recompute-pdf-auto'), 'error');

        return;

    }



    const payload = {

        file,

        dryRun,

        backup: true

    };

    if (id) payload.id = id;



    recomputeRunBtn.disabled = true;

    recomputePdfRunBtn.disabled = true;

    setRecomputeStatus('Ejecutando recalculo PDF_AUTO en backend...', '');

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

            ? ` Verifica si el ID ${id} existe en ${selectedModel} o deja el ID vacio para recalcular el libro completo.`

            : '';

        setRecomputeStatus(

            `Error: ${lastError || `No se pudo ejecutar el recalculo PDF_AUTO (ultimo endpoint: ${lastTriedUrl || 'sin URL'}). Comprueba que server.js este activo en http://localhost:3000 y responde en /health.`}${idHint}`,

            'error'

        );

        return;

    }



    const modeLabel = result.mode === 'single-id' ? `ID ${result.id}` : 'libro completo';

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

    const quickRecomputeBtn = $('openRecomputeModalBtn');

    const recomputeAllBtn = $('recomputeAllBtn');

    if (quickRecomputeBtn instanceof HTMLButtonElement) quickRecomputeBtn.disabled = disabled;

    if (recomputeAllBtn instanceof HTMLButtonElement) recomputeAllBtn.disabled = disabled;

}



function setQuickRecomputeBusyUi(busy) {

    const quickRecomputeBtn = $('openRecomputeModalBtn');

    if (quickRecomputeBtn instanceof HTMLButtonElement) {

        if (!quickRecomputeBtn.dataset.defaultLabel) {

            quickRecomputeBtn.dataset.defaultLabel = quickRecomputeBtn.textContent || 'Recalcular registro';

        }



        quickRecomputeBtn.textContent = busy

            ? `âŒ› ${quickRecomputeBtn.dataset.defaultLabel}`

            : quickRecomputeBtn.dataset.defaultLabel;

        quickRecomputeBtn.style.cursor = busy ? 'wait' : '';

        quickRecomputeBtn.setAttribute('aria-busy', busy ? 'true' : 'false');

    }



    document.body.style.cursor = busy ? 'wait' : '';

}



function setRecomputeModalInputsForAction(selectedModel, id = '') {

    const recomputeEngineSelect = $('recomputeEngineSelect');

    const recomputeIdInput = $('recomputeIdInput');

    const recomputeUpdateRevisionInput = $('recomputeUpdateRevisionInput');

    const recomputeForceRevisionInput = $('recomputeForceRevisionInput');



    if (recomputeEngineSelect instanceof HTMLSelectElement && selectedModel) {

        recomputeEngineSelect.value = selectedModel;

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



    if (!isBackendEndpointAllowed('recompute-qa-errors') || !isBackendEndpointAllowed('recompute-pdf-auto')) {

        setRecomputeStatus(getLocalOnlyBackendMessage('recompute-qa-errors'), 'error');

        return;

    }



    setRecomputeModalInputsForAction(selectedModel, currentId);

    setQuickRecomputeButtonsDisabled(true);

    setQuickRecomputeBusyUi(true);

    try {

        setRecomputeStatus(`Recalculando registro ID ${currentId} (errores + PDF_AUTO)...`, '');

        await runBackendRecompute();

        await runBackendRecomputePdfAuto();

        const revisionAutoUpdate = await setRevisionOkImportIfNoErrors();

        const revisionSuffix = revisionAutoUpdate === 'applied'

            ? ' Sin errores: estado=OK y accion=Importar aplicados automaticamente.'

            : revisionAutoUpdate === 'applied-eliminar'

                ? ' Footer/ruido detectado: estado=OK y accion=Eliminar aplicados automaticamente.'

                : revisionAutoUpdate === 'already-ok-importar'

                    ? ' Sin errores: estado/accion ya estaban en OK/Importar.'

                    : revisionAutoUpdate === 'already-ok-eliminar'

                        ? ' Footer/ruido: estado/accion ya estaban en OK/Eliminar.'

                        : '';

        setRecomputeStatus(`Registro ID ${currentId} recalculado correctamente.${revisionSuffix}`, 'ok');

    } finally {

        setQuickRecomputeBusyUi(false);

        setQuickRecomputeButtonsDisabled(false);

    }

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

        message: `Se recalcularan ERRORES y PDF_AUTO para todo el libro ${selectedModel}. Esta accion afecta a multiples registros.`,

        expectedText: 'APLICAR',

        confirmLabel: 'Recalcular',

        cancelLabel: 'Cancelar',

        dangerLevel: 'high'

    });

    if (!confirmed) return;



    if (!isBackendEndpointAllowed('recompute-qa-errors') || !isBackendEndpointAllowed('recompute-pdf-auto')) {

        setRecomputeStatus(getLocalOnlyBackendMessage('recompute-qa-errors'), 'error');

        return;

    }



    setRecomputeModalInputsForAction(selectedModel, '');

    setQuickRecomputeButtonsDisabled(true);

    try {

        setRecomputeStatus(`Recalculando libro ${selectedModel} completo (errores + PDF_AUTO)...`, '');

        await runBackendRecompute();

        await runBackendRecomputePdfAuto();

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

        await revalidateCurrentRow();

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

        'measurement_error',

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



    target.innerHTML = `<section class="a2-meta-block a2-meta-block-book">

<span class="a2-meta-label">Libro + Pag</span>

<strong class="a2-meta-value">${escapeHtml(txt(row?.engine_model))} Pag: ${escapeHtml(txt(row?.['Source Page']))}</strong>

</section>

<section class="a2-meta-block a2-meta-block-pos">

<span class="a2-meta-label">POS</span>

<strong class="a2-meta-value">${escapeHtml(txt(row?.POS))}</strong>

</section>

<section class="a2-meta-block a2-meta-block-pn">

<span class="a2-meta-label">PN</span>

<strong class="a2-meta-value">${escapeHtml(getDisplayPn(row))}</strong>

</section>

<section class="a2-meta-block a2-meta-block-designation">

<div class="a2-meta-designation-inner">

<span class="a2-meta-label">DESIGNATION</span>

<strong class="a2-meta-value">${escapeHtml(txt(row?.designation_final || row?.DESIGNATION))}</strong>

</div>

<div class="a2-meta-actions">

<button id="openEditRecordBtn" type="button" class="a2-meta-edit-btn">Editar</button>

<button id="openExportRecordBtn" type="button" class="a2-meta-edit-btn">Exportar</button>

</div>

</section>`;



    const editBtn = $('openEditRecordBtn');

    if (editBtn instanceof HTMLButtonElement) {

        editBtn.addEventListener('click', () => {

            openEditRecordModalForRow();

        });

    }



    const exportBtn = $('openExportRecordBtn');

    if (exportBtn instanceof HTMLButtonElement) {

        exportBtn.addEventListener('click', () => {

            openExportRecordModalForRow();

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

            fieldKeys: { excel: 'POS', gesa: null, subst: null, pdf: 'pos_pdf', final: 'pos_final', error: 'pos_error' },

            errFields: ['POS'],

            raw: firstNonEmpty(row?.pos_excel, row?.POS), sust: null

        },

        {

            field: 'PART NO.', base: 'pn',

            excel: firstNonEmpty(row?.pn_excel, row?.['PART NO.']),

            gesa: getGesaPn(row),

            subst: getSustPn(row),

            pdf: row?.pn_pdf,

            final: row?.pn_final,

            errorKey: 'pn_error',

            pdfAutoAction: 'pn',

            fieldKeys: { excel: 'PART NO.', gesa: 'pn_gesa', subst: 'pn_subst', pdf: 'pn_pdf', final: 'pn_final', error: 'pn_error' },

            errFields: ['PART NO.', 'pn_final'],

            raw: firstNonEmpty(row?.pn_excel, row?.['PART NO.']), sust: getSustPn(row)

        },

        {

            field: 'DESIGNATION', base: 'designation',

            excel: firstNonEmpty(row?.designation_excel, row?.DESIGNATION),

            gesa: row?.designation_gesa,

            subst: null,

            pdf: row?.designation_pdf,

            final: row?.designation_final,

            errorKey: 'designation_error',

            pdfAutoAction: 'designation',

            fieldKeys: { excel: 'DESIGNATION', gesa: 'designation_gesa', subst: null, pdf: 'designation_pdf', final: 'designation_final', error: 'designation_error' },

            errFields: ['designation_final'],

            raw: firstNonEmpty(row?.designation_excel, row?.DESIGNATION), sust: null

        },

        {

            field: 'MODEL/TYPE', base: 'model_type',

            excel: firstNonEmpty(row?.model_type_excel, row?.['MODEL/TYPE']),

            gesa: null,

            subst: null,

            pdf: row?.model_type_pdf,

            final: firstNonEmpty(row?.model_type_final, row?.['MODEL/TYPE']),

            errorKey: null,

            fieldKeys: { excel: 'MODEL/TYPE', gesa: null, subst: null, pdf: 'model_type_pdf', final: 'model_type_final', error: null },

            errFields: [],

            raw: firstNonEmpty(row?.model_type_excel, row?.['MODEL/TYPE']), sust: null

        },

        {

            field: 'QTY', base: 'qty',

            excel: firstNonEmpty(row?.qty_excel, row?.QTY),

            gesa: null,

            subst: null,

            pdf: row?.qty_pdf,

            final: row?.qty_final,

            errorKey: null,

            fieldKeys: { excel: 'QTY', gesa: null, subst: null, pdf: 'qty_pdf', final: 'qty_final', error: null },

            errFields: [],

            raw: firstNonEmpty(row?.qty_excel, row?.QTY), sust: null

        },

        {

            field: 'UNITS', base: 'qty_units',

            excel: firstNonEmpty(row?.qty_units_excel, row?.UNITS),

            gesa: null,

            subst: null,

            pdf: row?.units_pdf,

            final: row?.UNITS,

            errorKey: null,

            fieldKeys: { excel: 'UNITS', gesa: null, subst: null, pdf: 'units_pdf', final: 'UNITS', error: null },

            errFields: [],

            raw: firstNonEmpty(row?.qty_units_excel, row?.UNITS), sust: null

        },

        {

            field: 'WEIGHT', base: 'weight',

            excel: firstNonEmpty(row?.weight_excel, row?.WEIGHT),

            gesa: getGesaWeightWithUnits(row),

            subst: null,

            pdf: row?.weight_pdf,

            final: row?.weight_final,

            errorKey: 'weight_error',

            fieldKeys: { excel: 'WEIGHT', gesa: 'weight_gesa', subst: null, pdf: 'weight_pdf', final: 'weight_final', error: 'weight_error' },

            errFields: [],

            raw: firstNonEmpty(row?.weight_excel, row?.WEIGHT), sust: null

        },

        {

            field: 'FN', base: 'fn',

            excel: firstNonEmpty(row?.fn_excel, row?.FN),

            gesa: null,

            subst: null,

            pdf: row?.fn_pdf,

            final: row?.FN,

            errorKey: null,

            fieldKeys: { excel: 'FN', gesa: null, subst: null, pdf: 'fn_pdf', final: 'FN', error: null },

            errFields: [],

            raw: firstNonEmpty(row?.fn_excel, row?.FN), sust: null

        },

        {

            field: 'MEASUREMENT / STANDARD', base: 'measure',

            excel: firstNonEmpty(row?.measure_excel, row?.['MEASUREMENT / STANDARD']),

            gesa: firstNonEmpty(row?.measure_gesa, row?.dimensions_gesa),

            subst: null,

            pdf: row?.measure_pdf,

            // measure_final con alias legacy measurement_final (ver fieldAdapter.js FALLBACK_ALIASES)
            final: firstNonEmpty(row?.measure_final, row?.measurement_final),

            errorKey: 'measurement_error',

            fieldKeys: { excel: 'MEASUREMENT / STANDARD', gesa: 'dimensions_gesa', subst: null, pdf: 'measure_pdf', final: 'measure_final', error: 'measurement_error' },

            errFields: [],

            raw: firstNonEmpty(row?.measure_excel, row?.['MEASUREMENT / STANDARD']), sust: null

        },

        {

            field: 'FG/FGS', base: 'fg_fgs',

            excel: firstNonEmpty(row?.fg_fgs_excel, row?.['FG/FGS']),

            gesa: null,

            subst: null,

            pdf: row?.fg_fgs_pdf,

            final: row?.['FG/FGS'],

            errorKey: null,

            fieldKeys: { excel: 'FG/FGS', gesa: null, subst: null, pdf: 'fg_fgs_pdf', final: 'FG/FGS', error: null },

            errFields: [],

            raw: firstNonEmpty(row?.fg_fgs_excel, row?.['FG/FGS']), sust: null

        },

        {

            field: 'BOM-No.', base: 'bom',

            excel: firstNonEmpty(row?.bom_excel, row?.['BOM-No.']),

            gesa: null,

            subst: null,

            pdf: row?.bom_pdf,

            final: row?.['BOM-No.'],

            errorKey: 'bom_error',

            fieldKeys: { excel: 'BOM-No.', gesa: null, subst: null, pdf: 'bom_pdf', final: 'BOM-No.', error: 'bom_error' },

            errFields: [],

            raw: firstNonEmpty(row?.bom_excel, row?.['BOM-No.']), sust: null

        },

        {

            field: 'GESA', base: 'isgesa',

            excel: null,

            gesa: row?.gesa,

            subst: null,

            pdf: row?.gesa_pdf,

            final: row?.gesa,

            errorKey: null,

            separatorTop: true,

            fieldKeys: { excel: null, gesa: 'gesa', subst: null, pdf: 'gesa_pdf', final: 'gesa', error: null },

            errFields: [],

            raw: null, sust: null

        },

        {

            field: 'NSN', base: 'nsn',

            excel: null,

            gesa: row?.nsn,

            subst: null,

            pdf: row?.nsn_pdf,

            final: row?.nsn,

            errorKey: null,

            fieldKeys: { excel: null, gesa: 'nsn', subst: null, pdf: 'nsn_pdf', final: 'nsn', error: null },

            errFields: [],

            raw: null, sust: null

        },

        {

            field: 'NORMALIZADO', base: 'is_norma',

            excel: null,

            gesa: row?.normalizado,

            subst: null,

            pdf: row?.normalizado_pdf,

            final: row?.normalizado,

            errorKey: null,

            fieldKeys: { excel: null, gesa: 'normalizado', subst: null, pdf: 'normalizado_pdf', final: 'normalizado', error: null },

            errFields: [],

            raw: null, sust: null

        },

        {

            field: 'NORMA', base: 'norma',

            excel: null,

            gesa: row?.norma,

            subst: null,

            pdf: row?.norma_pdf,

            final: row?.norma,

            errorKey: 'norma_error',

            fieldKeys: { excel: null, gesa: 'norma', subst: null, pdf: 'norma_pdf', final: 'norma', error: 'norma_error' },

            errFields: [],

            raw: null, sust: null

        },

        {

            field: 'SUST_STATUS', base: 'is_subst',

            excel: null,

            gesa: null,

            subst: row?.sust_status,

            pdf: null,

            final: row?.sust_status,

            errorKey: null,

            separatorTop: true,

            fieldKeys: { excel: null, gesa: null, subst: 'sust_status', pdf: null, final: 'sust_status', error: null },

            errFields: [],

            raw: null, sust: row?.sust_status

        },

        {

            field: 'HIERARCHI', base: 'hierarchie',

            excel: null,

            gesa: null,

            // hierarchie_subst → sust_hierarchie → hierarchi (fallbacks legacy)
            subst: firstNonEmpty(row?.hierarchie_subst, row?.sust_hierarchie, row?.hierarchi),

            pdf: null,

            final: firstNonEmpty(row?.hierarchie_final, row?.sust_hierarchie, row?.hierarchi),

            errorKey: null,

            fieldKeys: { excel: null, gesa: null, subst: 'hierarchie_subst', pdf: null, final: 'hierarchie_final', error: null },

            errFields: [],

            raw: null, sust: firstNonEmpty(row?.sust_hierarchie, row?.hierarchi)

        },

        {

            field: 'SUST_NEW_PART_NUMBER', base: 'new_pn',

            excel: null,

            gesa: null,

            // new_pn_subst → sust_new_part_number (fallback legacy)
            subst: firstNonEmpty(row?.new_pn_subst, row?.sust_new_part_number),

            pdf: row?.sust_new_part_number_pdf,

            final: firstNonEmpty(row?.new_pn_final, row?.sust_new_part_number),

            errorKey: null,

            fieldKeys: { excel: null, gesa: null, subst: 'new_pn_subst', pdf: 'sust_new_part_number_pdf', final: 'new_pn_final', error: null },

            errFields: [],

            raw: null, sust: firstNonEmpty(row?.sust_new_part_number)

        },

        {

            field: 'SUST_SUPERSEDED_LIST', base: 'subst_pnlist',

            excel: null,

            gesa: null,

            // subst_pnlist_subst → sust_superseded_list (fallback legacy)
            subst: firstNonEmpty(row?.subst_pnlist_subst, row?.sust_superseded_list),

            pdf: row?.sust_superseded_list_pdf,

            final: firstNonEmpty(row?.subst_pnlist_final, row?.sust_superseded_list),

            errorKey: null,

            fieldKeys: { excel: null, gesa: null, subst: 'subst_pnlist_subst', pdf: 'sust_superseded_list_pdf', final: 'subst_pnlist_final', error: null },

            errFields: [],

            raw: null, sust: firstNonEmpty(row?.sust_superseded_list)

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

        const finalErrClass = errCount > 0 ? 'compare-final-error' : 'compare-final-ok';

        const finalFullClass = [cellClasses.finalClass, finalErrClass].filter(Boolean).join(' ');

        const finalEditAttrs = isEditableComparisonField(entry.field)

            ? ' data-open-edit-record-modal="true" title="Doble clic para editar en modal"'

            : '';

        // data-copy-pdf-auto-* se mantiene para la acción de doble clic de copiar PDF a final

        const pdfActionAttrs = entry.pdfAutoAction === 'designation'

            ? ' data-copy-pdf-auto-designation="true" title="Doble clic para copiar PDF a DESIGNATION_FINAL y recalcular"'

            : entry.pdfAutoAction === 'pn'

                ? ' data-copy-pdf-auto-pn="true" title="Doble clic para copiar PDF a PN_FINAL y recalcular"'

                : entry.pdfAutoAction === 'pos'

                    ? ' data-copy-pdf-auto-pos="true" title="Doble clic para copiar PDF a POS_FINAL y recalcular"'

                    : '';

        // Aviso discreto en celda PDF cuando el valor está vacío pero el campo _pdf existe en el JSON
        // (indica que recompute-pdf-auto no se ha ejecutado aún para este registro).
        // Solo visual, no afecta guardado ni lógica de validación.
        const pdfIsEmpty = !txt(entry.pdf) || txt(entry.pdf) === '-';

        const pdfKeyExists = entry.fieldKeys?.pdf && Object.prototype.hasOwnProperty.call(row, entry.fieldKeys.pdf);

        const pdfEmptyHint = pdfIsEmpty && pdfKeyExists

            ? ' pdf-empty-hint'

            : '';

        const pdfCellTitle = pdfIsEmpty && pdfKeyExists

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



function syncPdfWithCurrentRow(row) {

    if (!row) {

        setPdfSelection(null);

        loadPdfClear();

        return;

    }



    setPdfSelection(row);



    const book = String(row?.engine_model ?? '').trim();

    const page = String(row?.['Source Page'] ?? '').trim();

    if (!book || !page) {

        loadPdfClear();

        return;

    }

    const targetPageNum = Number.parseInt(String(page).replace(/[^0-9]/g, ''), 10);
    const currentPageNum = Number(state.currentPdfPageNumber || 0);
    const currentSource = String(state.currentPdfSource || '');
    const currentBook = currentSource
        ? decodeURIComponent(currentSource.split('/').pop() || '').replace(/\.pdf$/i, '')
        : '';

    if (
        Number.isFinite(targetPageNum)
        && targetPageNum > 0
        && currentPageNum === targetPageNum
        && currentBook === book
    ) {
        refreshPdfSelectionOverlayFromCache();
        return;
    }



    loadPdfWithPage(book, page).catch((error) => {

        console.error('No se pudo cargar PDF del registro:', error);

    });

}



// Experimental: detecta la fila del PDF a partir de pn_final y dibuja marcas azules.
// No reemplaza la lógica verde actual; solo añade una capa temporal de depuración visual.
async function highlightPdfLineForPnFinal(record = currentRow) {

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

    if (!pnFinal) {
        console.warn('[A2][PDF_ROW_EXPERIMENT] Registro sin pn_final.');
        setPdfExperimentalRowHighlights(null);
        requestPdfRelayout();
        alert('El registro actual no tiene pn_final para marcar la línea en el PDF.');
        return;
    }

    setPdfSelection(record);
    await loadPdfWithPage(book, sourcePage);

    const lineMatch = await findPdfLineByPnFinal(record);
    const pnMatches = lineMatch.pnMatches || [];

    logPdfRowHighlightDebug('pn_final buscado:', pnFinal);
    logPdfRowHighlightDebug('coincidencias PN en página:', pnMatches.length);

    if (!pnMatches.length) {
        console.warn(`[A2][PDF_ROW_EXPERIMENT] No se encontró pn_final en PDF: "${pnFinal}"`);
        setPdfExperimentalRowHighlights(null);
        requestPdfRelayout();
        alert(`No se encontró pn_final en la página PDF actual: ${pnFinal}.`);
        return;
    }

    setPdfExperimentalRowHighlights({
        mode: 'pn-line',
        pn: pnFinal,
        yTolerance: PDF_ROW_Y_TOLERANCE
    });
    requestPdfRelayout();

    logPdfRowHighlightDebug('líneas detectadas:', lineMatch.lineIndices);
    logPdfRowHighlightDebug('textos en misma fila:', lineMatch.lineItems.map((item) => String(item?.text || '').trim()).filter(Boolean));

    if (pnMatches.length > 1) {
        console.warn(`[A2][PDF_ROW_EXPERIMENT] PN con ${pnMatches.length} coincidencias en la página. Se marcarán todas las líneas coincidentes.`);
    }

}



async function highlightPdfRowByPnFinal(record = currentRow) {

    return highlightPdfLineForPnFinal(record);

}



function renderRecord(row) {

    if (!row) {

        renderReviewStateButtons(null);
        renderReviewStats([], null);
        return;

    }

    renderReviewStats(getQueueRows(), row);
    syncPdfWithCurrentRow(row);
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



    const mustAutoRecompute = [...changedFields].some((field) => AUTO_RECOMPUTE_TRIGGER_FIELDS.has(field));

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

        initRecomputeModal();

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

        syncRecomputeEngineSelect();

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

    const markPnBtn = $('markPnRowBtn');
    if (markPnBtn instanceof HTMLButtonElement) {
        markPnBtn.disabled = !PDF_FEATURE_PN_ROW_DEBUG_ENABLED;
        if (!PDF_FEATURE_PN_ROW_DEBUG_ENABLED) markPnBtn.title = 'Desactivado en modo rendimiento';
    }

    const detectHeadersBtn = $('detectHeadersBtn');
    if (detectHeadersBtn instanceof HTMLButtonElement) {
        detectHeadersBtn.disabled = !PDF_FEATURE_HEADERS_ENABLED;
        if (!PDF_FEATURE_HEADERS_ENABLED) detectHeadersBtn.title = 'Detectar headers desactivado';
    }

    const paintBodyBtn = $('paintBodyByHeadersBtn');
    if (paintBodyBtn instanceof HTMLButtonElement) {
        paintBodyBtn.disabled = !PDF_FEATURE_HEADERS_ENABLED;
        if (!PDF_FEATURE_HEADERS_ENABLED) paintBodyBtn.title = 'Requiere Detectar Headers habilitado (experimental)';
    }

}



bindClick('loadRecordBtn', () => {

    loadRecordFromControls().catch((error) => alert(`No se pudo cargar el registro: ${error.message}`));

});



bindClick('prevRecordBtn', () => {

    loadRelativeRecord(-1).catch((error) => alert(`No se pudo cargar registro anterior: ${error.message}`));

});



bindClick('nextRecordBtn', () => {

    loadRelativeRecord(1).catch((error) => alert(`No se pudo cargar siguiente registro: ${error.message}`));

});



bindClick('prevErrorBtn', () => {

    loadRelativeError(-1).catch((error) => alert(`No se pudo cargar error anterior: ${error.message}`));

});



bindClick('nextErrorBtn', () => {

    loadRelativeError(1).catch((error) => alert(`No se pudo cargar siguiente error: ${error.message}`));

});



bindClick('prevReviewBtn', () => {

    loadRelativeReview(-1).catch((error) => alert(`No se pudo cargar registro revisar anterior: ${error.message}`));

});



bindClick('nextReviewBtn', () => {

    loadRelativeReview(1).catch((error) => alert(`No se pudo cargar siguiente registro revisar: ${error.message}`));

});



bindClick('prevPendingBtn', () => {

    loadRelativePending(-1).catch((error) => alert(`No se pudo cargar pendiente anterior: ${error.message}`));

});



bindClick('nextPendingBtn', () => {

    loadRelativePending(1).catch((error) => alert(`No se pudo cargar siguiente pendiente: ${error.message}`));

});



bindClick('openRecomputeModalBtn', () => {

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

    runBackendRecompute().catch((error) => {

        setRecomputeStatus(`Error: ${String(error?.message || error)}`, 'error');

    });

});



bindClick('recomputePdfRunBtn', () => {

    runBackendRecomputePdfAuto().catch((error) => {

        setRecomputeStatus(`Error: ${String(error?.message || error)}`, 'error');

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



bindClick('markPnRowBtn', () => {

    if (!PDF_FEATURE_PN_ROW_DEBUG_ENABLED) {
        return;
    }

    highlightPdfRowByPnFinal(currentRow).catch((error) => {

        console.warn('No se pudo marcar la fila PN en el PDF:', error);

        alert(`No se pudo marcar la fila PN: ${String(error?.message || error)}`);

    }).then(() => {

        syncPdfBlueTextsArea();

    });

});

bindClick('detectHeadersBtn', () => {
    if (!PDF_FEATURE_HEADERS_ENABLED) {
        return;
    }
    const result = runPdfHeaderOnlyDetection();
    renderHeaderDetectionPanel(result);
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

        const recomputeEngineSelect = $('recomputeEngineSelect');

        if (recomputeEngineSelect instanceof HTMLSelectElement) {

            recomputeEngineSelect.value = selectedModel;

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

