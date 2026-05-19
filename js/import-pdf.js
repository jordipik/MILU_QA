import { getEngineJsonFiles } from './data-loader.js';
import { inferEngineModelFromFileName } from './helpers.js';
import {
    buildHeaderColumnBodyHighlights,
    clearPdfAllOverlays,
    clearPdfHeaderColumnBodyHighlights,
    clearPdfHeaderOnlyOverlay,
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

function normalizePdfReadFieldAlignment(values) {
    return {
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

    const sourcePage = Number(getSelectedPageNumber() || 0);
    const rows = rowGroups.map((group, index) => buildPdfPageRowPreviewFromGroup(group, {
        sourcePage,
        rowIndex: index + 1,
        bomPdf: '',
        fgFgsPdf: ''
    }));

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

function bindEvents() {
    const goToPageBtn = $('goToPageBtn');
    const detectHeadersBtn = $('detectHeadersBtn');
    const paintBodyByHeadersBtn = $('paintBodyByHeadersBtn');
    const extractPageRowsBtn = $('extractPageRowsBtn');
    const downloadJsonBtn = $('downloadJsonBtn');
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