/**
 * Render de la tabla principal QA: filtros, orden, paginación, selección y agrupado.
 */

import { state } from './state.js';
import { escapeHtml, getPnKey, getRowValueForColumn, val, getRowErrorFields, getRowErrorType, getRowErrors } from './helpers.js';
import './fieldAdapter.js';
import {
    getRevisionAccionClass,
    getRevisionEstadoClass,
    getRevisionKey,
    normalizeAccionToNew,
    normalizeEstadoToNew
} from './revision.js';
import { applyColumnView } from './column-view.js';
import { scheduleVisiblePosCirclePreload } from './pos-preload.js';
import { getPosSchemasForRow, renderSelectedRowPosPanel, renderSelectedRowPosTop } from './schemas.js';

const qaErrorMetaCache = {
    signature: '',
    entries: new WeakMap()
};

const VIRTUAL_MIN_ROWS = 120;
const VIRTUAL_OVERSCAN_ROWS = 10;

const COMPACT_FIELD_FALLBACKS = {
    source_page: ['Source Page', 'page4'],
    pos_final: ['POS'],
    pn_final: ['PART NO.', 'pn'],
    designation_final: ['DESIGNATION'],
    qty_final: ['QTY'],
    qty_units_final: ['UNITS'],
    weight_final: ['WEIGHT', 'weight_gesa'],
    measure_final: ['measurement_final', 'MEASUREMENT / STANDARD'],
    norma_final: ['norma', 'STANDARD'],
    ruta_foto: ['filename_foto'],
    ruta_esquemas_pos: ['exp_imagenes']
};

const virtualTableState = {
    main: {
        active: false,
        rows: [],
        wrapId: 'mainTableWrap',
        tbodyId: 'tbody',
        columnCount: 53,
        rowHeight: 34,
        renderRowFn: null,
        frameRequested: false
    },
    errors: {
        active: false,
        rows: [],
        wrapId: 'errorViewWrap',
        tbodyId: 'errorViewTbody',
        columnCount: 15,
        rowHeight: 34,
        renderRowFn: null,
        frameRequested: false
    }
};

let virtualScrollListenersBound = false;

function isVirtualDebugEnabled() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        if (params.get('virtualDebug') === '1') return true;
    } catch (_) {
        // ignore
    }
    try {
        return window.localStorage?.getItem('miluVirtualDebug') === '1';
    } catch (_) {
        return false;
    }
}

function getVirtualModeKey(errorsMode) {
    return errorsMode ? 'errors' : 'main';
}

function getVirtualState(errorsMode) {
    return virtualTableState[getVirtualModeKey(errorsMode)];
}

function isVirtualizationEnabledForRows(rows) {
    return !state.paginationEnabled && Array.isArray(rows) && rows.length > VIRTUAL_MIN_ROWS;
}

function buildVirtualSpacerRow(heightPx, colCount) {
    const safeHeight = Math.max(0, Math.round(Number(heightPx) || 0));
    if (safeHeight <= 0) return '';
    return `<tr class="virtual-spacer" aria-hidden="true"><td colspan="${colCount}" style="padding:0;border:0;height:${safeHeight}px;min-height:${safeHeight}px"></td></tr>`;
}

function updateVirtualDebugStats({ totalRows, renderedRows, startIndex, endIndex, elapsedMs }) {
    if (!isVirtualDebugEnabled()) return;
    const stats = document.getElementById('stats');
    if (!(stats instanceof HTMLElement)) return;
    const debugText = `VIRT ${renderedRows}/${totalRows} filas · idx ${startIndex}-${Math.max(startIndex, endIndex - 1)} · ${elapsedMs.toFixed(1)}ms`;
    let badge = stats.querySelector('[data-virtual-debug="1"]');
    if (!(badge instanceof HTMLElement)) {
        badge = document.createElement('span');
        badge.setAttribute('data-virtual-debug', '1');
        badge.className = 'stat';
        badge.style.marginLeft = 'auto';
        badge.style.color = '#64748b';
        badge.style.fontSize = '11px';
        stats.appendChild(badge);
    }
    badge.textContent = debugText;
}

function ensureVirtualScrollListeners() {
    if (virtualScrollListenersBound) return;
    virtualScrollListenersBound = true;

    const bind = (modeKey) => {
        const virtualState = virtualTableState[modeKey];
        const wrap = document.getElementById(virtualState.wrapId);
        if (!(wrap instanceof HTMLElement)) return;
        wrap.addEventListener('scroll', () => {
            if (!virtualState.active) return;
            if (virtualState.frameRequested) return;
            virtualState.frameRequested = true;
            requestAnimationFrame(() => {
                virtualState.frameRequested = false;
                renderVirtualWindow(modeKey === 'errors');
            });
        }, { passive: true });
    };

    bind('main');
    bind('errors');
}

function ensureVirtualRowVisible(errorsMode, revisionKey) {
    const key = String(revisionKey || '').trim();
    if (!key) return;

    const virtualState = getVirtualState(errorsMode);
    if (!virtualState.active) return;

    const targetIndex = virtualState.rows.findIndex((row) => getRevisionKey(row) === key);
    if (targetIndex < 0) return;

    const wrap = document.getElementById(virtualState.wrapId);
    if (!(wrap instanceof HTMLElement)) return;

    const rowHeight = Math.max(22, Number(virtualState.rowHeight) || 34);
    const top = targetIndex * rowHeight;
    const bottom = top + rowHeight;
    const viewTop = wrap.scrollTop;
    const viewBottom = viewTop + wrap.clientHeight;

    if (top >= viewTop && bottom <= viewBottom) return;

    const nextScrollTop = Math.max(0, top - Math.floor(Math.max(0, wrap.clientHeight - rowHeight) / 2));
    wrap.scrollTop = nextScrollTop;
    renderVirtualWindow(errorsMode);
}

function renderVirtualWindow(errorsMode) {
    const virtualState = getVirtualState(errorsMode);
    if (!virtualState.active) return;

    const wrap = document.getElementById(virtualState.wrapId);
    const tbody = document.getElementById(virtualState.tbodyId);
    if (!(wrap instanceof HTMLElement) || !(tbody instanceof HTMLElement)) return;

    const totalRows = virtualState.rows.length;
    if (!totalRows) {
        tbody.innerHTML = '';
        return;
    }

    const startedAt = performance.now();
    const rowHeight = Math.max(22, Number(virtualState.rowHeight) || 34);
    const viewportHeight = Math.max(rowHeight, wrap.clientHeight || 0);
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
    const firstVisible = Math.max(0, Math.floor((wrap.scrollTop || 0) / rowHeight));
    const start = Math.max(0, firstVisible - VIRTUAL_OVERSCAN_ROWS);
    const end = Math.min(totalRows, start + visibleCount + (VIRTUAL_OVERSCAN_ROWS * 2));
    const topSpacerHeight = start * rowHeight;
    const bottomSpacerHeight = Math.max(0, (totalRows - end) * rowHeight);

    const windowRows = virtualState.rows.slice(start, end);
    const rowsHtml = windowRows.map(virtualState.renderRowFn).join('');
    tbody.innerHTML = `${buildVirtualSpacerRow(topSpacerHeight, virtualState.columnCount)}${rowsHtml}${buildVirtualSpacerRow(bottomSpacerHeight, virtualState.columnCount)}`;

    refreshSelectedRowVisual();
    if (!errorsMode) {
        applyColumnView();
    }

    updateVirtualDebugStats({
        totalRows,
        renderedRows: windowRows.length,
        startIndex: start,
        endIndex: end,
        elapsedMs: performance.now() - startedAt
    });
}

function setVirtualState(errorsMode, rows, renderRowFn, columnCount) {
    const virtualState = getVirtualState(errorsMode);
    virtualState.active = isVirtualizationEnabledForRows(rows);
    virtualState.rows = Array.isArray(rows) ? rows : [];
    virtualState.renderRowFn = renderRowFn;
    virtualState.columnCount = Math.max(1, Number(columnCount) || 1);

    if (!virtualState.active) return;

    const measuredHeight = Math.max(getBodyRowHeight(), 22);
    virtualState.rowHeight = measuredHeight;
    ensureVirtualScrollListeners();
}

function parseBooleanLike(value) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return null;
    if (['true', '1', 'si', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    return null;
}

function getFieldAdapterApi() {
    try {
        const adapter = globalThis?.window?.fieldAdapter;
        if (adapter && typeof adapter.getField === 'function') return adapter;
    } catch (_) {
        // Ignore window access issues in non-browser contexts.
    }
    return null;
}

export function getCompactFieldValue(row, fieldName, defaultValue = '') {
    const record = row && typeof row === 'object' ? row : {};
    const field = String(fieldName || '').trim();
    if (!field) return defaultValue;

    const adapter = getFieldAdapterApi();
    if (adapter) {
        const adapterValue = adapter.getField(record, field);
        if (adapterValue != null && String(adapterValue).trim() !== '') return adapterValue;
    }

    const direct = record[field];
    if (direct != null && String(direct).trim() !== '') return direct;

    const fallbackKeys = COMPACT_FIELD_FALLBACKS[field] || [];
    for (const key of fallbackKeys) {
        const candidate = record[key];
        if (candidate != null && String(candidate).trim() !== '') return candidate;
    }

    return defaultValue;
}

function toFiniteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
}

function getPersistedErrorCount(row) {
    const total = toFiniteNumber(row?.total_error);
    if (!Number.isNaN(total)) return Math.max(0, Math.trunc(total));

    const breakdownKeys = [
        'pos_error',
        'pn_error',
        'designation_error',
        'weight_error',
        'measurement_error',
        'norma_error',
        'bom_error'
    ];

    let sum = 0;
    let hasBreakdown = false;
    breakdownKeys.forEach((key) => {
        const value = toFiniteNumber(row?.[key]);
        if (Number.isNaN(value)) return;
        hasBreakdown = true;
        sum += Math.max(0, Math.trunc(value));
    });
    if (hasBreakdown) return sum;

    return getPersistedHasError(row) ? 1 : 0;
}

export function getPersistedHasError(row) {
    const boolFromFlag = parseBooleanLike(row?.has_error);
    if (boolFromFlag !== null) return boolFromFlag;

    const total = toFiniteNumber(row?.total_error);
    if (!Number.isNaN(total)) return total > 0;

    return false;
}

function queueColumnViewRefresh() {
    requestAnimationFrame(() => {
        applyColumnView();
        requestAnimationFrame(() => applyColumnView());
    });
}

function getActiveErrorSignature() {
    return [...(state.activeQaErrorChecks || [])]
        .map(code => String(code || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .join('|');
}

function getRowErrorCacheMarker(row) {
    const qaErrors = row?.__qaChecksActive;
    const updatedAt = String(qaErrors?.updated_at || '');
    const severity = String(qaErrors?.severity || '');
    const signature = String(qaErrors?.signature || '');
    const codesLength = Array.isArray(qaErrors?.codes) ? qaErrors.codes.length : 0;
    const pn = String(row?.['PART NO.'] ?? row?.pn ?? row?.pn_final ?? '');
    return `${updatedAt}|${severity}|${signature}|${codesLength}|${pn}`;
}

function getRowErrorMeta(row) {
    const signature = getActiveErrorSignature();
    if (qaErrorMetaCache.signature !== signature) {
        qaErrorMetaCache.signature = signature;
        qaErrorMetaCache.entries = new WeakMap();
    }

    const marker = getRowErrorCacheMarker(row);
    const cached = qaErrorMetaCache.entries.get(row);
    if (cached && cached.marker === marker) {
        return cached.value;
    }

    const activeCodes = state.activeQaErrorChecks;
    const errorType = getRowErrorType(row, { activeCodes });
    const errorFields = getRowErrorFields(row, { activeCodes });
    const value = {
        errorType,
        errorFields,
        hasError: !!errorType
    };

    qaErrorMetaCache.entries.set(row, { marker, value });
    return value;
}

function hasComparableValue(value) {
    return String(value ?? '').trim() !== '';
}

function normalizeComparableValue(value) {
    return String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function valuesMatch(left, right) {
    const normalizedLeft = normalizeComparableValue(left);
    const normalizedRight = normalizeComparableValue(right);
    return normalizedLeft !== '' && normalizedRight !== '' && normalizedLeft === normalizedRight;
}

export function getQaPosValue(row) {
    return String(getCompactFieldValue(row, 'pos_final', '')).trim();
}

function getRowComparisonMeta(row) {
    const pdfPos = getQaPosValue(row);
    const pdfPn = row?.['PART NO.'];
    const finalPn = getCompactFieldValue(row, 'pn_final', '');
    const gesaPn = row?.pn_raw;
    const pdfDesignation = row?.DESIGNATION;
    const finalDesignation = getCompactFieldValue(row, 'designation_final', '');
    const gesaDesignation = row?.designation_gesa;
    const pdfMeasurement = row?.['MEASUREMENT / STANDARD'];
    const finalMeasurement = getCompactFieldValue(row, 'measure_final', '');
    const gesaMeasurement = row?.dimensions_gesa;

    return {
        pos: {
            missing: !hasComparableValue(pdfPos)
        },
        pn: {
            missing: !hasComparableValue(pdfPn),
            pdfMatch: valuesMatch(pdfPn, finalPn),
            gesaMatch: valuesMatch(gesaPn, finalPn)
        },
        designation: {
            missing: !hasComparableValue(pdfDesignation),
            pdfMatch: valuesMatch(pdfDesignation, finalDesignation),
            gesaMatch: valuesMatch(gesaDesignation, finalDesignation)
        },
        measurement: {
            pdfMatch: valuesMatch(pdfMeasurement, finalMeasurement),
            gesaMatch: valuesMatch(gesaMeasurement, finalMeasurement)
        }
    };
}

function getComparisonClasses({ missing = false, pdfMatch = false, gesaMatch = false } = {}) {
    if (missing) return ['cell-missing-source'];
    if (pdfMatch || gesaMatch) return ['cell-match-final'];
    return [];
}

function dispatchSelectionChanged(rowKey) {
    document.dispatchEvent(new CustomEvent('qa:selected-row-changed', {
        detail: { revisionKey: String(rowKey || '') }
    }));
}

function getCurrentColumnCount() {
    const headerRow = document.querySelector('#mainTableWrap thead tr:not(.filter-row)');
    if (!headerRow?.children?.length) return 50;
    const visibleCount = Array.from(headerRow.children).filter(cell => {
        if (!(cell instanceof HTMLElement)) return false;
        return cell.style.display !== 'none' && window.getComputedStyle(cell).display !== 'none';
    }).length;
    return visibleCount > 0 ? visibleCount : headerRow.children.length;
}

function getDistinctReviewKey(row) {
    const pnKey = getPnKey(row);
    if (pnKey) return pnKey;
    return String(getRevisionKey(row) || row?.ID || '').trim();
}

function getBookScopeRowsWithoutFilters() {
    const allRows = Array.isArray(state.allData) ? state.allData : [];
    const bookFilter = String(state?.filters?.book ?? '').trim().toLowerCase();
    if (!bookFilter) return allRows;
    return allRows.filter((row) => val(row, 'engine_model', '').toString().toLowerCase() === bookFilter);
}

function buildReviewStats(rows, visibleRows, totalScopeRows) {
    const scopeRows = Array.isArray(totalScopeRows) ? totalScopeRows : (Array.isArray(rows) ? rows : []);
    const visRows = Array.isArray(visibleRows) ? visibleRows : [];
    const summary = {
        total: scopeRows.length,
        importOk: 0,
        copyOk: 0,
        reviewOk: 0,
        deleteOk: 0,
        pending: 0,
        visibleImportOk: 0,
        visibleCopyOk: 0,
        visibleReviewOk: 0,
        visibleDeleteOk: 0,
        visiblePending: 0,
        unique: {
            total: new Set(),
            importOk: new Set(),
            copyOk: new Set(),
            reviewOk: new Set(),
            deleteOk: new Set(),
            pending: new Set()
        }
    };

    scopeRows.forEach((row) => {
        summary.unique.total.add(getDistinctReviewKey(row));
    });

    const classifyRow = (row) => {
        const estado = normalizeEstadoToNew(row?.qa_revision_estado);
        const accion = normalizeAccionToNew(row?.qa_revision_accion);
        if (estado !== 'ok') return 'pending';
        if (accion === 'revisar') return 'reviewOk';
        if (accion === 'eliminar') return 'deleteOk';
        if (accion === 'copia') return 'copyOk';
        return 'importOk';
    };

    scopeRows.forEach((row) => {
        const distinctKey = getDistinctReviewKey(row);
        const cat = classifyRow(row);
        summary[cat] += 1;
        summary.unique[cat].add(distinctKey);
    });

    visRows.forEach((row) => {
        const cat = classifyRow(row);
        if (cat === 'pending') summary.visiblePending += 1;
        else if (cat === 'reviewOk') summary.visibleReviewOk += 1;
        else if (cat === 'deleteOk') summary.visibleDeleteOk += 1;
        else if (cat === 'copyOk') summary.visibleCopyOk += 1;
        else summary.visibleImportOk += 1;
    });

    const visibleCount = visRows.length;

    return {
        ...summary,
        visibleCount
    };
}

function renderReviewStatsSummary(statsElement, rows, visibleRows, totalScopeRows) {
    if (!statsElement) return;
    const stats = buildReviewStats(rows, visibleRows, totalScopeRows);

    statsElement.innerHTML = `
        <div class="qa-stats-row">
            <article class="qa-stat-card">
                <span class="qa-stat-label">TOTAL ANALIZADOS</span>
                <div class="qa-stat-inline-total">
                    <strong>${stats.visibleCount}</strong>
                    <span class="qa-stat-inline-separator">de</span>
                    <strong>${stats.total}</strong>
                    <span class="qa-stat-inline-unique">· ${stats.unique.total.size} únicos</span>
                </div>
            </article>
            <article class="qa-stat-card is-ok">
                <span class="qa-stat-label">IMPORTAR (OK)</span>
                <div class="qa-stat-inline-total">
                    <strong>${stats.visibleImportOk}</strong>
                    <span class="qa-stat-inline-separator">de</span>
                    <strong>${stats.importOk}</strong>
                    <span class="qa-stat-inline-unique">· ${stats.unique.importOk.size} únicos</span>
                </div>
            </article>
            <article class="qa-stat-card is-copy">
                <span class="qa-stat-label">COPIA (OK)</span>
                <div class="qa-stat-inline-total">
                    <strong>${stats.visibleCopyOk}</strong>
                    <span class="qa-stat-inline-separator">de</span>
                    <strong>${stats.copyOk}</strong>
                    <span class="qa-stat-inline-unique">· ${stats.unique.copyOk.size} únicos</span>
                </div>
            </article>
            <article class="qa-stat-card is-review">
                <span class="qa-stat-label">REVISAR (OK)</span>
                <div class="qa-stat-inline-total">
                    <strong>${stats.visibleReviewOk}</strong>
                    <span class="qa-stat-inline-separator">de</span>
                    <strong>${stats.reviewOk}</strong>
                    <span class="qa-stat-inline-unique">· ${stats.unique.reviewOk.size} únicos</span>
                </div>
            </article>
            <article class="qa-stat-card is-ko">
                <span class="qa-stat-label">ELIMINAR (OK)</span>
                <div class="qa-stat-inline-total">
                    <strong>${stats.visibleDeleteOk}</strong>
                    <span class="qa-stat-inline-separator">de</span>
                    <strong>${stats.deleteOk}</strong>
                    <span class="qa-stat-inline-unique">· ${stats.unique.deleteOk.size} únicos</span>
                </div>
            </article>
            <article class="qa-stat-card">
                <span class="qa-stat-label">PENDIENTES</span>
                <div class="qa-stat-inline-total">
                    <strong>${stats.visiblePending}</strong>
                    <span class="qa-stat-inline-separator">de</span>
                    <strong>${stats.pending}</strong>
                    <span class="qa-stat-inline-unique">· ${stats.unique.pending.size} únicos</span>
                </div>
            </article>
        </div>
    `;
}

export function sortData(data, key, asc) {
    if (!key) return data;

    if (key === 'has_error') {
        return [...data].sort((a, b) => {
            const safeA = getPersistedErrorCount(a);
            const safeB = getPersistedErrorCount(b);
            return asc ? safeA - safeB : safeB - safeA;
        });
    }

    if (key === 'has_esquema_pos') {
        // Ordena: general (0) -> ok (1) -> missing (2) -> empty (3) -> sin (4)
        const order = { general: 0, ok: 1, missing: 2, empty: 3, sin: 4 };
        return [...data].sort((a, b) => {
            const va = order[getEsquemaPosStatus(a)] ?? 4;
            const vb = order[getEsquemaPosStatus(b)] ?? 4;
            return asc ? va - vb : vb - va;
        });
    }

    if (key === 'book_page_pos') {
        const direction = asc ? 1 : -1;
        return [...data].sort((a, b) => {
            const bookA = val(a, 'engine_model', '').toString().toLowerCase();
            const bookB = val(b, 'engine_model', '').toString().toLowerCase();
            if (bookA !== bookB) return direction * bookA.localeCompare(bookB, undefined, { numeric: true });
            const pageA = Number(String(getCompactFieldValue(a, 'source_page', '')).replace(/\D/g, '')) || 0;
            const pageB = Number(String(getCompactFieldValue(b, 'source_page', '')).replace(/\D/g, '')) || 0;
            if (pageA !== pageB) return direction * (pageA - pageB);
            const posA = Number(getQaPosValue(a).replace(/\D/g, '')) || 0;
            const posB = Number(getQaPosValue(b).replace(/\D/g, '')) || 0;
            return direction * (posA - posB);
        });
    }

    if (key === 'POS') {
        return [...data].sort((a, b) => {
            const aVal = getQaPosValue(a).toLowerCase();
            const bVal = getQaPosValue(b).toLowerCase();
            return asc
                ? aVal.localeCompare(bVal, undefined, { numeric: true })
                : bVal.localeCompare(aVal, undefined, { numeric: true });
        });
    }

    if (key === 'Source Page') {
        return [...data].sort((a, b) => {
            const pageA = Number(String(getCompactFieldValue(a, 'source_page', '')).replace(/[^0-9]/g, '')) || 0;
            const pageB = Number(String(getCompactFieldValue(b, 'source_page', '')).replace(/[^0-9]/g, '')) || 0;
            return asc ? pageA - pageB : pageB - pageA;
        });
    }

    return [...data].sort((a, b) => {
        const aVal = getRowValueForColumn(a, key, '').toString().toLowerCase();
        const bVal = getRowValueForColumn(b, key, '').toString().toLowerCase();
        return asc
            ? aVal.localeCompare(bVal, undefined, { numeric: true })
            : bVal.localeCompare(aVal, undefined, { numeric: true });
    });
}

export function applyFilters(data) {
    return data.filter(row => {
        for (const [key, filterValue] of Object.entries(state.filters)) {
            if (!filterValue) continue;

            let rowValue;
            switch (key) {
                case 'has_img': {
                    const imgValue = (row.filename_foto || row.ruta_foto || '').toString().trim();
                    rowValue = imgValue ? 'true' : 'false';
                    break;
                }
                case 'has_esquema_pos': {
                    // Valores posibles del filtro: 'general' | 'ok' | 'missing' | 'empty' | 'sin'
                    // Compara contra el estado derivado de ruta_esquemas_pos + índice local
                    rowValue = getEsquemaPosStatus(row);
                    break;
                }
                case 'has_error': {
                    rowValue = getPersistedHasError(row) ? 'true' : 'false';
                    break;
                }
                case 'sust_hierarchie':
                    if (filterValue === 'empty') {
                        rowValue = (row.sust_hierarchie == null || String(row.sust_hierarchie).trim() === '') ? 'empty' : 'nonempty';
                    } else {
                        rowValue = row.sust_hierarchie === 'New' ? 'New' : ((row.sust_hierarchie && row.sust_hierarchie.toString().toUpperCase().includes('SUPERSEDED')) ? 'Old' : '');
                    }
                    break;
                case 'qa_revision_estado':
                    rowValue = filterValue === 'empty'
                        ? (String(getCompactFieldValue(row, 'qa_revision_estado', '') || '').trim() === '' ? 'empty' : 'nonempty')
                        : normalizeEstadoToNew(getCompactFieldValue(row, 'qa_revision_estado', ''));
                    break;
                case 'qa_revision_accion':
                    rowValue = filterValue === 'empty'
                        ? (String(getCompactFieldValue(row, 'qa_revision_accion', '') || '').trim() === '' ? 'empty' : 'nonempty')
                        : normalizeAccionToNew(getCompactFieldValue(row, 'qa_revision_accion', ''));
                    break;
                case 'in_new':
                    rowValue = state.newPnSet.has(row['PART NO.'] || row.pn) ? 'true' : 'false';
                    break;
                case 'in_superseded':
                    rowValue = state.supersededPnSet.has(row['PART NO.'] || row.pn) ? 'true' : 'false';
                    break;
                case 'published':
                    rowValue = state.publishedMap.get(row['PART NO.'] || row.pn)?.published === true ? 'true' : 'false';
                    break;
                case 'in_product_export':
                    rowValue = state.productExportPnSet.has(row['PART NO.'] || row.pn) ? 'true' : 'false';
                    break;
                case 'EN_WEB':
                    rowValue = (row.EN_WEB === true || row.EN_WEB === 'true') ? 'true' : 'false';
                    break;
                case 'book':
                    rowValue = val(row, 'engine_model', '').toString().toLowerCase();
                    break;
                case 'engine_model':
                    rowValue = val(row, 'engine_model', '').toString().toLowerCase();
                    break;
                case 'page': {
                    const filterPage = Number(String(filterValue).replace(/[^0-9]/g, ''));
                    const rowPage = Number(String(getCompactFieldValue(row, 'source_page', '')).replace(/[^0-9]/g, ''));
                    if (!Number.isNaN(filterPage) && !Number.isNaN(rowPage)) {
                        if (rowPage !== filterPage) return false;
                        continue;
                    }
                    rowValue = String(getCompactFieldValue(row, 'source_page', '')).toLowerCase();
                    break;
                }
                case 'designation_final':
                case 'measure_final':
                case 'weight_final':
                    rowValue = getRowValueForColumn(row, key, '').toString().toLowerCase();
                    break;
                case 'POS':
                    rowValue = getQaPosValue(row).toLowerCase();
                    break;
                default:
                    rowValue = getRowValueForColumn(row, key, '').toString().toLowerCase();
                    break;
            }

            if (key === 'book' || key === 'engine_model') {
                if (rowValue !== String(filterValue).toLowerCase()) return false;
                continue;
            }

            if (
                key.startsWith('has_')
                || key.startsWith('is_')
                || key.startsWith('in_')
                || key === 'published'
                || key === 'sust_hierarchie'
                || key === 'qa_revision_estado'
                || key === 'qa_revision_accion'
                || key === 'book'
                || key === 'engine_model'
            ) {
                if (rowValue !== filterValue) return false;
            } else if (!rowValue.includes(String(filterValue).toLowerCase())) {
                return false;
            }
        }
        return true;
    });
}

export function getCurrentFilteredSortedRows() {
    return sortData(applyFilters(state.allData), state.sortKey, state.sortAsc);
}

function getQaDisplayRows(sortedRows) {
    // En vista PDF, siempre mostrar todos los registros sin filtro de revisión
    if (!state.leftTableReviewedOnly || state.columnView === 'pdf') return sortedRows;
    const rowsByKey = new Map(sortedRows.map(row => [getRevisionKey(row), row]));
    return (state.recentRevisionKeys || [])
        .map(key => rowsByKey.get(key))
        .filter(Boolean);
}

function getPaginationTotalRows() {
    if (state.tableMode === 'qa' && state.leftTableReviewedOnly) {
        return Math.max(0, Number(state.displayRowCount) || 0);
    }
    return Math.max(0, Number(state.filteredData.length) || 0);
}

export function getRowsForBulkScope(scope) {
    const sortedRows = getCurrentFilteredSortedRows();
    if (scope === 'visible') {
        if (!state.paginationEnabled) return sortedRows;
        const start = (state.currentPage - 1) * state.pageSize;
        return sortedRows.slice(start, start + state.pageSize);
    }
    return sortedRows;
}

function getEffectivePageSize(totalRows) {
    if (state.paginationEnabled) return state.pageSize;
    return Math.max(1, Number(totalRows) || 0);
}

function getEffectiveTotalPages(totalRows) {
    const pageSize = getEffectivePageSize(totalRows);
    return Math.max(1, Math.ceil((Number(totalRows) || 0) / pageSize));
}

function summarizeFields(rows) {
    if (!rows.length) return { equalFields: [], unequalCount: 0, equalPairs: [] };
    const allKeys = new Set();
    rows.forEach(row => Object.keys(row || {}).forEach(k => allKeys.add(k)));
    const ignoreKeys = new Set(['PART NO.', 'pn']);
    const equalFields = [];
    const equalPairs = [];
    for (const key of allKeys) {
        if (ignoreKeys.has(key)) continue;
        const values = rows.map(r => String(r?.[key] ?? '').trim());
        const first = values[0] ?? '';
        const same = values.every(v => v === first);
        if (same) {
            equalFields.push(key);
            equalPairs.push({ key, value: first });
        }
    }
    const comparableFields = [...allKeys].filter(key => !ignoreKeys.has(key)).length;
    return { equalFields, unequalCount: Math.max(0, comparableFields - equalFields.length), equalPairs };
}

function buildGroupedByPn(data) {
    const groups = new Map();
    data.forEach(row => {
        const pnKey = getPnKey(row);
        if (!groups.has(pnKey)) groups.set(pnKey, []);
        groups.get(pnKey).push(row);
    });
    return [...groups.entries()].map(([pn, rows]) => {
        const summary = summarizeFields(rows);
        const posList = rows.map(getQaPosValue).filter(Boolean).slice(0, 8);
        return {
            pn: pn || '—',
            count: rows.length,
            equalFieldCount: summary.equalFields.length,
            unequalFieldCount: summary.unequalCount,
            equalFieldPairs: summary.equalPairs,
            posSample: posList
        };
    }).sort((a, b) => (b.count - a.count) || a.pn.localeCompare(b.pn, undefined, { numeric: true }));
}

export function renderGroupedTable(sourceData) {
    if (!state.groupedVisible) return;
    const section = document.getElementById('groupedSection');
    const tbody = document.getElementById('groupedTbody');
    const groupedStats = document.getElementById('groupedStats');
    if (!section || !tbody || !groupedStats) return;

    const groupedRows = buildGroupedByPn(sourceData || []);
    const repeated = groupedRows.filter(g => g.count > 1);
    const repeatedRows = repeated.reduce((acc, item) => acc + item.count, 0);
    groupedStats.textContent = `${groupedRows.length} PN distintos · ${repeated.length} PN repetidos · ${repeatedRows} registros en PN repetidos`;

    if (!groupedRows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="error">No hay datos para agrupar</td></tr>';
        return;
    }

    tbody.innerHTML = groupedRows.map(group => {
        const detailSummary = group.equalFieldPairs.length ? `Ver ${group.equalFieldPairs.length} campos iguales` : 'Sin campos iguales';
        const detailItems = group.equalFieldPairs.length
            ? `<ul class="grouped-list">${group.equalFieldPairs.map(item => `<li><b>${escapeHtml(item.key)}</b>: ${escapeHtml(item.value === '' ? '(vacio)' : item.value)}</li>`).join('')}</ul>`
            : '';
        const posText = group.posSample.length ? group.posSample.join(', ') : '—';
        return `<tr>
            <td title="${escapeHtml(group.pn)}">${escapeHtml(group.pn)}</td>
            <td title="${group.count}">${group.count}</td>
            <td title="${group.equalFieldCount}">${group.equalFieldCount}</td>
            <td title="${group.unequalFieldCount}">${group.unequalFieldCount}</td>
            <td><details class="grouped-details"><summary>${escapeHtml(detailSummary)}</summary>${detailItems}</details></td>
            <td title="${escapeHtml(posText)}">${escapeHtml(posText)}</td>
        </tr>`;
    }).join('');
}

export function refreshSelectedRowVisual() {
    ['tbody', 'errorViewTbody'].forEach(tbodyId => {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        tbody.querySelectorAll('tr').forEach(tr => {
            const rowKey = tr.getAttribute('data-revision-key') || '';
            tr.classList.toggle('row-selected', rowKey !== '' && rowKey === state.selectedRevisionRowKey);
        });
    });
}

export function getVisibleTableRows() {
    const tbodySelector = state.tableMode === 'errors' ? '#errorViewTbody' : '#tbody';
    return Array.from(document.querySelectorAll(`${tbodySelector} tr[data-revision-key]`));
}

export function selectVisibleRowByIndex(index) {
    const rows = getVisibleTableRows();
    if (!rows.length) return;
    const boundedIndex = Math.min(Math.max(0, index), rows.length - 1);
    const tr = rows[boundedIndex];
    const rowKey = tr?.getAttribute('data-revision-key') || '';
    if (!rowKey) return;
    const row = state.allData.find(item => getRevisionKey(item) === rowKey);
    if (!row) return;
    state.selectedRevisionRowKey = rowKey;
    refreshSelectedRowVisual();
    renderSelectedRowPosPanel(row);
    renderSelectedRowPosTop(row);
    dispatchSelectionChanged(rowKey);
    tr.scrollIntoView({ block: 'nearest' });
}

export function moveSelectionBy(delta) {
    if (!state.paginationEnabled) {
        const errorsMode = state.tableMode === 'errors';
        const virtualState = getVirtualState(errorsMode);
        const rows = virtualState.active
            ? virtualState.rows
            : (errorsMode
                ? sortData(applyFilters(state.allData).filter(row => getPersistedHasError(row)), state.sortKey, state.sortAsc)
                : getCurrentFilteredSortedRows());

        if (!rows.length) return;

        let currentIndex = rows.findIndex(row => getRevisionKey(row) === state.selectedRevisionRowKey);
        if (currentIndex === -1) currentIndex = 0;
        const boundedIndex = Math.min(Math.max(0, currentIndex + delta), rows.length - 1);
        const targetRow = rows[boundedIndex];
        if (!targetRow) return;

        const targetKey = getRevisionKey(targetRow);
        state.selectedRevisionRowKey = targetKey;
        refreshSelectedRowVisual();
        renderSelectedRowPosPanel(targetRow);
        renderSelectedRowPosTop(targetRow);
        dispatchSelectionChanged(targetKey);

        ensureVirtualRowVisible(errorsMode, targetKey);
        return;
    }

    if (state.tableMode === 'qa' && state.leftTableReviewedOnly) {
        const rows = getCurrentFilteredSortedRows();
        if (!rows.length) return;
        let currentIndex = rows.findIndex(row => getRevisionKey(row) === state.selectedRevisionRowKey);
        if (currentIndex === -1) currentIndex = 0;
        const boundedIndex = Math.min(Math.max(0, currentIndex + delta), rows.length - 1);
        const targetRow = rows[boundedIndex];
        if (!targetRow) return;
        const targetKey = getRevisionKey(targetRow);
        state.selectedRevisionRowKey = targetKey;
        refreshSelectedRowVisual();
        renderSelectedRowPosPanel(targetRow);
        renderSelectedRowPosTop(targetRow);
        dispatchSelectionChanged(targetKey);
        return;
    }

    const rows = getVisibleTableRows();
    if (!rows.length) return;
    let currentIndex = rows.findIndex(tr => (tr.getAttribute('data-revision-key') || '') === state.selectedRevisionRowKey);
    if (currentIndex === -1) currentIndex = 0;
    const nextIndex = currentIndex + delta;
    if (nextIndex >= 0 && nextIndex < rows.length) {
        selectVisibleRowByIndex(nextIndex);
        return;
    }

    const totalPages = getEffectiveTotalPages(state.filteredData.length);
    if (delta > 0 && nextIndex >= rows.length && state.currentPage < totalPages) {
        state.currentPage += 1;
        renderTable();
        renderPagination();
        selectVisibleRowByIndex(0);
        return;
    }

    if (delta < 0 && nextIndex < 0 && state.currentPage > 1) {
        state.currentPage -= 1;
        renderTable();
        renderPagination();
        const nextRows = getVisibleTableRows();
        if (!nextRows.length) return;
        selectVisibleRowByIndex(nextRows.length - 1);
    }
}

function getMainHeaderHeight() {
    const thead = document.querySelector('#mainTableWrap table thead');
    if (!thead) return 72;
    const h = Math.ceil(thead.getBoundingClientRect().height);
    return Number.isFinite(h) && h > 0 ? h : 72;
}

function getBodyRowHeight() {
    const row = document.querySelector('#tbody tr');
    if (!row || row.querySelector('.error, .loading')) return 30;
    const h = Math.ceil(row.getBoundingClientRect().height);
    return Number.isFinite(h) && h > 12 ? h : 30;
}

function calculateAutoPageSize() {
    const wrap = document.getElementById('mainTableWrap');
    if (!wrap) return state.pageSize;
    if (window.getComputedStyle(wrap).display === 'none' || wrap.clientHeight <= 0) return state.pageSize;
    const headerHeight = getMainHeaderHeight();
    const rowHeight = Math.max(22, getBodyRowHeight());
    const available = wrap.clientHeight - headerHeight - 8;
    if (!Number.isFinite(available) || available <= rowHeight) return state.pageSize;
    return Math.max(state.MIN_PAGE_SIZE, Math.floor(available / rowHeight));
}

export function syncAutoPageSize() {
    if (!state.paginationEnabled) return false;
    const next = calculateAutoPageSize();
    if (!Number.isFinite(next) || next < 1 || next === state.pageSize) return false;
    state.pageSize = next;
    return true;
}

function editableAttr(columnKey) {
    const editable = false;
    return editable ? ` data-editable="true" data-col-key="${columnKey}"` : '';
}

function getRevisionEstadoOptionsHtml(revisionEstado) {
    return [
        { value: 'pendiente', label: 'Pendiente' },
        { value: 'ok', label: 'OK' }
    ].map(opt => `<option value="${escapeHtml(opt.value)}" ${revisionEstado === opt.value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('');
}

function getRevisionAccionOptionsHtml(revisionAccion) {
    return [
        { value: 'importar', label: 'Importar' },
        { value: 'copia', label: 'Copia' },
        { value: 'revisar', label: 'Revisar' },
        { value: 'eliminar', label: 'Eliminar' }
    ].map(opt => `<option value="${escapeHtml(opt.value)}" ${revisionAccion === opt.value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('');
}

// --- Helpers para columna ESQ_POS ---
// Normaliza una URL/ruta a basename en minúsculas para comparar contra
// el índice de archivos existentes (state.esquemasPosFileSet).
function normalizePath(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        const name = decodeURIComponent(parsed.pathname.split('/').pop() || '').trim();
        return name.toLowerCase();
    } catch (_) {
        const clean = decodeURIComponent(raw.replace(/\\/g, '/').split('/').pop() || '').trim();
        return clean.toLowerCase();
    }
}

function basename(value) {
    return normalizePath(value);
}

function splitSchemaTokensLocal(rawValue) {
    return String(rawValue || '').split(/[,;|\n]+/).map(token => String(token || '').trim()).filter(Boolean);
}

function isGeneralSchemaFileName(value) {
    return /^.+-\d{4}-\d{2}\.(png|webp|jpg|jpeg)$/i.test(String(value || '').trim());
}

// Devuelve el estado del esquema pos para la fila:
//   'sin'     — no hay esquemas base en el registro
//   'empty'   — hay esquemas pero no hay referencias en ruta_esquemas_pos / exp_imagenes / esquemas_circulos
//   'ok'      — existe al menos un candidato en state.esquemasPosFileSet
//   'missing' — hay referencias pero no se encuentra archivo local
function getEsquemaPosStatus(row) {
    const esquemaTokens = splitSchemaTokensLocal(getCompactFieldValue(row, 'esquemas', ''));
    const hasEsquemaBase = esquemaTokens.length > 0;
    if (!hasEsquemaBase) return 'sin';

    const esquemaBasenames = new Set(esquemaTokens.map(token => basename(token)).filter(Boolean));
    const generalCircleMatch = splitSchemaTokensLocal(getCompactFieldValue(row, 'esquemas_circulos', ''))
        .map(token => basename(token))
        .find(token => token && isGeneralSchemaFileName(token) && esquemaBasenames.has(token));
    if (generalCircleMatch) return 'general';

    // Mismo criterio que usa la UI de esquemas para resolver imágenes:
    // combina ruta_esquemas_pos + esquemas_circulos y evalúa sus candidatos.
    const rowForSchemas = {
        ...row,
        ruta_esquemas_pos: getCompactFieldValue(row, 'ruta_esquemas_pos', '')
    };
    const posItems = getPosSchemasForRow(rowForSchemas);
    if (!Array.isArray(posItems) || posItems.length === 0) return 'empty';

    const exists = posItems.some(item =>
        Array.isArray(item?.candidates)
        && item.candidates.some(candidate => state.esquemasPosFileSet.has(basename(candidate)))
    );

    return exists ? 'ok' : 'missing';
}

// Genera el HTML del badge de la columna ESQ_POS para una fila dada.
function renderEsquemaPosCell(row) {
    const status = getEsquemaPosStatus(row);
    const ruta = String(getCompactFieldValue(row, 'ruta_esquemas_pos', '') || '').trim();
    if (status === 'ok') {
        return `<span class="badge-pos-ok" title="Archivo encontrado">OK</span>`;
    } else if (status === 'general') {
        return `<span class="badge-pos-general" title="esquemas_circulos contiene un esquema general presente en esquemas">ESQ</span>`;
    } else if (status === 'missing') {
        return `<span class="badge-pos-missing" title="Archivo no encontrado${ruta ? `: ${escapeHtml(ruta)}` : ''}">MISS</span>`;
    } else if (status === 'sin') {
        return `<span class="badge-pos-none" title="Sin esquemas base">SIN</span>`;
    }
    return `<span class="badge-pos-empty" title="Sin esquema_pos">FALTA</span>`;
}

function renderRow(row) {
    const id = val(row, 'ID');
    const enWeb = row.EN_WEB === true || row.EN_WEB === 'true' ? '✔️' : '';
    const sustHierarchyRaw = String(row.sust_hierarchie || '').trim();
    const sustHierarchyLabel = sustHierarchyRaw || '—';
    const isGesa = String(row.gesa || '').toUpperCase() === 'SI';
    const isNormalizado = String(row.normalizado || '').toUpperCase() === 'SI';
    const isHierarchyNew = sustHierarchyRaw === 'New';
    const isHierarchySuperseded = sustHierarchyRaw.toUpperCase().includes('SUPERSEDED');
    const hasImg = String(getCompactFieldValue(row, 'ruta_foto', '') || '').trim() !== '';
    const errorMeta = getRowErrorMeta(row);
    const totalError = getPersistedErrorCount(row);
    const revisionEstado = normalizeEstadoToNew(getCompactFieldValue(row, 'qa_revision_estado', ''));
    const revisionAccion = normalizeAccionToNew(getCompactFieldValue(row, 'qa_revision_accion', ''));
    const revisionKey = getRevisionKey(row);
    const errorFields = errorMeta.errorFields;
    const comparisonMeta = getRowComparisonMeta(row);

    const withCellClasses = (baseClass, fieldKey, extraClasses = []) => {
        const classes = [];
        if (baseClass) classes.push(baseClass);
        if (Array.isArray(extraClasses) && extraClasses.length > 0) classes.push(...extraClasses.filter(Boolean));
        if (errorFields.has(fieldKey)) classes.push('cell-error-field');
        return classes.join(' ');
    };

    const gesaIcon = isGesa ? '<span class="status-icon yes" aria-label="GESA SI">G</span>' : '<span class="status-icon no" aria-label="GESA NO">-</span>';
    const normalizadoIcon = isNormalizado ? '<span class="status-icon yes" aria-label="Normalizado SI">N</span>' : '<span class="status-icon no" aria-label="Normalizado NO">-</span>';
    let hierarchyIcon = '<span class="status-icon no" aria-label="Sin sust_hierarchie">-</span>';
    if (isHierarchyNew) hierarchyIcon = '<span class="status-icon new" aria-label="sust_hierarchie New">N</span>';
    else if (isHierarchySuperseded) hierarchyIcon = '<span class="status-icon sup" aria-label="sust_hierarchie Superseded">S</span>';
    else if (sustHierarchyRaw) hierarchyIcon = '<span class="status-icon other" aria-label="sust_hierarchie Other">O</span>';
    const fotoIcon = hasImg ? '<span class="status-icon yes" aria-label="Con Foto">F</span>' : '<span class="status-icon no" aria-label="Sin Foto">-</span>';
    const errorIcon = totalError > 0
        ? `<span class="status-icon error-count" data-open-analysis="true" aria-label="Errores persistidos en JSON (${totalError})">${totalError}</span>`
        : '<span class="status-icon no" aria-label="Sin errores">-</span>';

    const revisionEstadoOptions = getRevisionEstadoOptionsHtml(revisionEstado);
    const revisionAccionOptions = getRevisionAccionOptionsHtml(revisionAccion);

    const classGesa = isGesa ? 'cell-gesa' : '';
    const rowSelectedClass = state.selectedRevisionRowKey && state.selectedRevisionRowKey === revisionKey ? 'row-selected' : '';
    const rowSaveFailedClass = row?.__qa_revision_save_failed ? 'row-save-failed' : '';

    return `<tr class="${[rowSelectedClass, rowSaveFailedClass].filter(Boolean).join(' ')}" data-revision-key="${escapeHtml(revisionKey)}">
        <td class="${withCellClasses('separator-before separator-after', 'ID')}" title="${escapeHtml(id)}">${escapeHtml(id)}</td>
      <td class="status-col" title="GESA: ${isGesa ? 'SI' : 'NO'}">${gesaIcon}</td>
      <td class="status-col" title="Normalizado: ${isNormalizado ? 'SI' : 'NO'}">${normalizadoIcon}</td>
      <td class="status-col" title="sust_hierarchie: ${escapeHtml(sustHierarchyLabel)}">${hierarchyIcon}</td>
      <td class="status-col">${renderEsquemaPosCell(row)}</td>
      <td class="status-col" title="Foto: ${hasImg ? 'SI' : 'NO'}">${fotoIcon}</td>
    <td class="status-col" title="Errores: ${totalError}">${errorIcon}</td>
      <td class="status-col" title="En Web">${enWeb}</td>
            <td class="${withCellClasses(`revision-cell ${getRevisionEstadoClass(revisionEstado)}`, 'qa_revision_estado')}" title="Estado de revisión">
          <select class="revision-select" data-revision-field="estado" data-revision-key="${escapeHtml(revisionKey)}">${revisionEstadoOptions}</select>
      </td>
            <td class="${withCellClasses(`revision-cell ${getRevisionAccionClass(revisionAccion)}`, 'qa_revision_accion')}" title="Acción a realizar">
          <select class="revision-select" data-revision-field="accion" data-revision-key="${escapeHtml(revisionKey)}">${revisionAccionOptions}</select>
      </td>
    <td data-copy-to-final="pn_final" data-copy-from-field="PART NO." class="${withCellClasses('', 'PART NO.', getComparisonClasses({ pdfMatch: comparisonMeta.pn.pdfMatch }))}" title="${escapeHtml(val(row, 'PART NO.'))}">${escapeHtml(val(row, 'PART NO.'))}</td>
        <td class="${withCellClasses('', 'pos_final', getComparisonClasses({ missing: comparisonMeta.pos.missing }))}" title="${escapeHtml(getQaPosValue(row))}">${escapeHtml(getQaPosValue(row))}</td>
    <td${editableAttr('pn_final')} title="${escapeHtml(getCompactFieldValue(row, 'pn_final', '—'))}" class="${withCellClasses('cell-inline-editable', 'pn_final', getComparisonClasses(comparisonMeta.pn))}">${escapeHtml(getCompactFieldValue(row, 'pn_final', '—'))}</td>
    <td class="${withCellClasses('', 'designation_final', getComparisonClasses(comparisonMeta.designation))}" title="${escapeHtml(getCompactFieldValue(row, 'designation_final', '—'))}">${escapeHtml(getCompactFieldValue(row, 'designation_final', '—'))}</td>
            <td class="${withCellClasses('', 'pn_raw', getComparisonClasses({ gesaMatch: comparisonMeta.pn.gesaMatch }))}" title="${escapeHtml(val(row, 'pn_raw'))}">${escapeHtml(val(row, 'pn_raw'))}</td>
        <td title="${escapeHtml(val(row, 'criterio_pn'))}">${escapeHtml(val(row, 'criterio_pn'))}</td>
    <td data-copy-to-final="designation_final" data-copy-from-field="designation_gesa" title="${escapeHtml(val(row, 'designation_gesa'))}" class="${withCellClasses(classGesa, 'designation_gesa', getComparisonClasses({ gesaMatch: comparisonMeta.designation.gesaMatch }))}">${escapeHtml(val(row, 'designation_gesa'))}</td>
    <td class="separator-after" title="${escapeHtml(getRowValueForColumn(row, 'MODEL/TYPE'))}">${escapeHtml(getRowValueForColumn(row, 'MODEL/TYPE'))}</td>
    <td title="${escapeHtml(getCompactFieldValue(row, 'qty_final', '—'))}">${escapeHtml(getCompactFieldValue(row, 'qty_final', '—'))}</td>
        <td class="${withCellClasses(classGesa, 'weight_final')}" title="${escapeHtml(getCompactFieldValue(row, 'weight_final', '—'))}">${escapeHtml(getCompactFieldValue(row, 'weight_final', '—'))}</td>
            <td class="${withCellClasses('', 'qty_units_final')}" title="${escapeHtml(getCompactFieldValue(row, 'qty_units_final', '—'))}">${escapeHtml(getCompactFieldValue(row, 'qty_units_final', '—'))}</td>
            <td data-copy-to-final="weight_final" data-copy-from-field="weight_gesa" class="${withCellClasses(classGesa, 'weight_gesa')}" title="${escapeHtml(val(row, 'weight_gesa'))}">${escapeHtml(val(row, 'weight_gesa'))}</td>
            <td class="${withCellClasses(`separator-after ${classGesa}`, 'units')}" title="${escapeHtml(val(row, 'units'))}">${escapeHtml(val(row, 'units'))}</td>
      <td title="${escapeHtml(val(row, 'FG/FGS'))}">${escapeHtml(val(row, 'FG/FGS'))}</td>
        <td class="${withCellClasses(classGesa, 'measure_final', getComparisonClasses(comparisonMeta.measurement))}" title="${escapeHtml(getCompactFieldValue(row, 'measure_final', '—'))}">${escapeHtml(getCompactFieldValue(row, 'measure_final', '—'))}</td>
            <td data-copy-to-final="measure_final" data-copy-from-field="dimensions_gesa" class="${withCellClasses(classGesa, 'dimensions_gesa', getComparisonClasses({ gesaMatch: comparisonMeta.measurement.gesaMatch }))}" title="${escapeHtml(val(row, 'dimensions_gesa'))}">${escapeHtml(val(row, 'dimensions_gesa'))}</td>
      <td title="${escapeHtml(val(row, 'BOM-No.'))}">${escapeHtml(val(row, 'BOM-No.'))}</td>
      <td title="${escapeHtml(val(row, 'model'))}">${escapeHtml(val(row, 'model'))}</td>
    <td class="${withCellClasses('', 'Source Page')}" title="${escapeHtml(getCompactFieldValue(row, 'source_page', '—'))}">${escapeHtml(getCompactFieldValue(row, 'source_page', '—'))}</td>
      <td title="${escapeHtml(val(row, 'fgs_code_description'))}">${escapeHtml(val(row, 'fgs_code_description'))}</td>
      <td title="${escapeHtml(val(row, 'filename_foto'))}">${escapeHtml(val(row, 'filename_foto'))}</td>
      <td title="${escapeHtml(val(row, 'nsn'))}">${escapeHtml(val(row, 'nsn'))}</td>
    <td${editableAttr('norma_final')} title="${escapeHtml(getCompactFieldValue(row, 'norma_final', '—'))}" class="cell-inline-editable">${escapeHtml(getCompactFieldValue(row, 'norma_final', '—'))}</td>
      <td title="${escapeHtml(val(row, 'sust_status'))}">${escapeHtml(val(row, 'sust_status'))}</td>
      <td title="${escapeHtml(val(row, 'sust_new_part_number'))}">${escapeHtml(val(row, 'sust_new_part_number'))}</td>
      <td title="${escapeHtml(val(row, 'sust_superseded_list'))}">${escapeHtml(val(row, 'sust_superseded_list'))}</td>
      <td title="${escapeHtml(val(row, 'esquemas'))}">${escapeHtml(val(row, 'esquemas'))}</td>
      <td title="${escapeHtml(val(row, 'esquemas_circulos_all'))}">${escapeHtml(val(row, 'esquemas_circulos_all'))}</td>
      <td title="${escapeHtml(val(row, 'engine_model'))}">${escapeHtml(val(row, 'engine_model'))}</td>
      <td title="${escapeHtml(val(row, 'categoria'))}">${escapeHtml(val(row, 'categoria'))}</td>
      <td title="${escapeHtml(val(row, 'precio'))}">${escapeHtml(val(row, 'precio'))}</td>
    <td title="${escapeHtml(getRowValueForColumn(row, 'FN'))}">${escapeHtml(getRowValueForColumn(row, 'FN'))}</td>
        <td class="${withCellClasses('', 'source_file')}" title="${escapeHtml(val(row, 'source_file'))}">${escapeHtml(val(row, 'source_file'))}</td>
      <td title="${escapeHtml(val(row, 'source_sheet'))}">${escapeHtml(val(row, 'source_sheet'))}</td>
      <td title="${escapeHtml(val(row, 'engine'))}">${escapeHtml(val(row, 'engine'))}</td>
      <td title="${escapeHtml(val(row, 'fg_fgs_raw'))}">${escapeHtml(val(row, 'fg_fgs_raw'))}</td>
      <td title="${escapeHtml(val(row, 'fg_code'))}">${escapeHtml(val(row, 'fg_code'))}</td>
      <td title="${escapeHtml(val(row, 'fgs_description'))}">${escapeHtml(val(row, 'fgs_description'))}</td>
      <td title="${escapeHtml(val(row, 'atributo2'))}">${escapeHtml(val(row, 'atributo2'))}</td>
    <td title="${escapeHtml(getCompactFieldValue(row, 'ruta_foto', '—'))}">${escapeHtml(getCompactFieldValue(row, 'ruta_foto', '—'))}</td>
      <td title="${escapeHtml(val(row, 'esquemas_circulos'))}">${escapeHtml(val(row, 'esquemas_circulos'))}</td>
            <td title="${escapeHtml(getCompactFieldValue(row, 'ruta_esquemas_pos', '—'))}">${escapeHtml(getCompactFieldValue(row, 'ruta_esquemas_pos', '—'))}</td>
                <td${editableAttr('designation_final')} class="${withCellClasses(`${classGesa} cell-inline-editable`.trim(), 'designation_final', getComparisonClasses(comparisonMeta.designation))}" title="${escapeHtml(getCompactFieldValue(row, 'designation_final', '—'))}">${escapeHtml(getCompactFieldValue(row, 'designation_final', '—'))}</td>
    </tr>`;
}

function getErrorViewDefinitions() {
    return (state.qaErrorCheckDefinitions || [])
        .map(def => ({
            code: String(def?.code || '').trim(),
            label: String(def?.label || def?.code || '').trim()
        }))
        .filter(def => def.code);
}

function getRowErrorSet(row) {
    return new Set(getRowErrors(row, { activeCodes: state.activeQaErrorChecks }));
}

function getErrorViewColumnCount() {
    const pdfViewColumns = 9;  // gesa, normalizado, sust_hierarchie, has_esquema_pos, has_img, has_error, EN_WEB, estado, accion
    const baseColumns = 6;      // Libro, Pagina, POS, PN, Designation Final, #Errores
    return pdfViewColumns + baseColumns + getErrorViewDefinitions().length;
}

function renderErrorViewHeader(definitions) {
    const thead = document.getElementById('errorViewThead');
    if (!thead) return;

    // Columnas de Vista Pdf (al inicio)
    const pdfViewHeaders = `
        <th style="width:36px" class="status-head">G</th>
        <th style="width:36px" class="status-head">N</th>
        <th style="width:44px" class="status-head">H</th>
        <th style="width:44px" class="status-head" title="Esquema POS">P</th>
        <th style="width:36px" class="status-head">F</th>
        <th style="width:36px" class="status-head">E</th>
        <th style="width:70px">W</th>
        <th style="width:78px">Rev</th>
        <th style="width:86px">Acc</th>
    `;

    const baseHeaders = `
        <th style="width:130px">Libro</th>
        <th style="width:70px">Pagina</th>
        <th style="width:70px">POS</th>
        <th style="width:120px">PN</th>
        <th style="width:220px">Designation Final</th>
        <th style="width:56px">#</th>
    `;

    const checkHeaders = definitions.map(def => {
        return `<th class="error-check-col" title="${escapeHtml(def.code)}">${escapeHtml(def.label || def.code)}</th>`;
    }).join('');

    thead.innerHTML = `<tr>${pdfViewHeaders}${baseHeaders}${checkHeaders}</tr>`;
}

function renderErrorViewRow(row, definitions) {
    const revisionKey = getRevisionKey(row);
    const errorCodes = getRowErrorSet(row);
    const totalError = getPersistedErrorCount(row);
    const hasPersistedError = getPersistedHasError(row);
    const selectedClass = state.selectedRevisionRowKey && state.selectedRevisionRowKey === revisionKey ? 'row-selected' : '';
    const rowSaveFailedClass = row?.__qa_revision_save_failed ? 'row-save-failed' : '';

    const checkCells = definitions.map(def => {
        const hasCode = errorCodes.has(def.code);
        return `<td class="error-check-cell ${hasCode ? 'is-hit' : ''}" title="${hasCode ? 'Detectado' : 'Sin error'}">${hasCode ? '1' : ''}</td>`;
    }).join('');

    const sustHierarchyRaw = String(row.sust_hierarchie || '').trim();
    const sustHierarchyLabel = sustHierarchyRaw || '—';
    const isGesa = String(row.gesa || '').toUpperCase() === 'SI';
    const isNormalizado = String(row.normalizado || '').toUpperCase() === 'SI';
    const isHierarchyNew = sustHierarchyRaw === 'New';
    const isHierarchySuperseded = sustHierarchyRaw.toUpperCase().includes('SUPERSEDED');
    const hasImg = String(getCompactFieldValue(row, 'ruta_foto', '') || '').trim() !== '';
    const revisionEstado = normalizeEstadoToNew(getCompactFieldValue(row, 'qa_revision_estado', ''));
    const revisionAccion = normalizeAccionToNew(getCompactFieldValue(row, 'qa_revision_accion', ''));

    const gesaIcon = isGesa ? '<span class="status-icon yes" aria-label="GESA SI">G</span>' : '<span class="status-icon no" aria-label="GESA NO">-</span>';
    const normalizadoIcon = isNormalizado ? '<span class="status-icon yes" aria-label="Normalizado SI">N</span>' : '<span class="status-icon no" aria-label="Normalizado NO">-</span>';
    let hierarchyIcon = '<span class="status-icon no" aria-label="Sin sust_hierarchie">-</span>';
    if (isHierarchyNew) hierarchyIcon = '<span class="status-icon new" aria-label="sust_hierarchie New">N</span>';
    else if (isHierarchySuperseded) hierarchyIcon = '<span class="status-icon sup" aria-label="sust_hierarchie Superseded">S</span>';
    else if (sustHierarchyRaw) hierarchyIcon = '<span class="status-icon other" aria-label="sust_hierarchie Other">O</span>';
    const fotoIcon = hasImg ? '<span class="status-icon yes" aria-label="Con Foto">F</span>' : '<span class="status-icon no" aria-label="Sin Foto">-</span>';
    const errorIcon = hasPersistedError ? `<span class="status-icon error-count" aria-label="Errores persistidos en JSON (${totalError})">${totalError}</span>` : '';

    const enWeb = row.EN_WEB === true || row.EN_WEB === 'true' ? '✔️' : '';
    const revisionEstadoOptions = getRevisionEstadoOptionsHtml(revisionEstado);
    const revisionAccionOptions = getRevisionAccionOptionsHtml(revisionAccion);
    const estadoClass = getRevisionEstadoClass(revisionEstado);
    const accionClass = getRevisionAccionClass(revisionAccion);

    return `<tr class="${[selectedClass, rowSaveFailedClass].filter(Boolean).join(' ')}" data-revision-key="${escapeHtml(revisionKey)}">
        <td class="status-col" title="GESA: ${isGesa ? 'SI' : 'NO'}">${gesaIcon}</td>
        <td class="status-col" title="Normalizado: ${isNormalizado ? 'SI' : 'NO'}">${normalizadoIcon}</td>
        <td class="status-col" title="sust_hierarchie: ${escapeHtml(sustHierarchyLabel)}">${hierarchyIcon}</td>
        <td class="status-col">${renderEsquemaPosCell(row)}</td>
        <td class="status-col" title="Foto: ${hasImg ? 'SI' : 'NO'}">${fotoIcon}</td>
        <td class="status-col" title="Error persistido: ${hasPersistedError ? 'SI' : 'NO'}">${errorIcon}</td>
        <td class="status-col" title="En Web">${enWeb}</td>
        <td class="revision-cell ${estadoClass}" title="Estado de revisión">
            <select class="revision-select" data-revision-field="estado" data-revision-key="${escapeHtml(revisionKey)}">${revisionEstadoOptions}</select>
        </td>
        <td class="revision-cell ${accionClass}" title="Acción a realizar">
            <select class="revision-select" data-revision-field="accion" data-revision-key="${escapeHtml(revisionKey)}">${revisionAccionOptions}</select>
        </td>
        <td title="${escapeHtml(val(row, 'engine_model'))}">${escapeHtml(val(row, 'engine_model'))}</td>
        <td title="${escapeHtml(getCompactFieldValue(row, 'source_page', '—'))}">${escapeHtml(getCompactFieldValue(row, 'source_page', '—'))}</td>
        <td title="${escapeHtml(getQaPosValue(row))}">${escapeHtml(getQaPosValue(row))}</td>
        <td data-copy-to-final="pn_final" data-copy-from-field="PART NO." title="${escapeHtml(val(row, 'PART NO.'))}">${escapeHtml(val(row, 'PART NO.'))}</td>
        <td title="${escapeHtml(getCompactFieldValue(row, 'designation_final', '—'))}">${escapeHtml(getCompactFieldValue(row, 'designation_final', '—'))}</td>
        <td class="error-total-cell" title="${totalError}">${totalError}</td>
        ${checkCells}
    </tr>`;
}

function renderErrorTableStats(filteredRows, definitions) {
    const stats = document.getElementById('stats');
    if (!stats) return;

    const codeCount = new Map(definitions.map(def => [def.code, 0]));
    filteredRows.forEach(row => {
        getRowErrorSet(row).forEach(code => {
            if (!codeCount.has(code)) return;
            codeCount.set(code, (codeCount.get(code) || 0) + 1);
        });
    });

    const codeStats = definitions
        .filter(def => (codeCount.get(def.code) || 0) > 0)
        .map(def => `<span class="stat bad"><b>${codeCount.get(def.code) || 0}</b> ${escapeHtml(def.label || def.code)}</span>`)
        .join('');

    stats.innerHTML = `
        <span class="stat"><b>${filteredRows.length}</b> registros con error</span>
        <span class="stat"><b>${definitions.length}</b> tipos de error</span>
        ${codeStats || '<span class="stat">Sin desglose por tipo para el filtro actual</span>'}
        <span class="stat" style="margin-left:auto; color:#64748b; font-size:11px;" title="JSON base de esta vista">📄 ${escapeHtml(state.mainDataSourceLabel)}</span>
    `;
}

function setTableModeVisibility() {
    const mainTableWrap = document.getElementById('mainTableWrap');
    const errorViewWrap = document.getElementById('errorViewWrap');
    const groupedSection = document.getElementById('groupedSection');
    if (!mainTableWrap || !errorViewWrap) return;

    const errorsMode = state.tableMode === 'errors';
    mainTableWrap.style.display = errorsMode ? 'none' : 'block';
    errorViewWrap.style.display = errorsMode ? 'block' : 'none';
    if (groupedSection) groupedSection.style.display = 'none';
}

export function refreshVisibleRowByRevisionKey(revisionKey) {
    if (state.tableMode === 'errors') {
        renderTable();
        return true;
    }

    const key = String(revisionKey || '').trim();
    if (!key) return false;

    const tbody = document.getElementById('tbody');
    if (!tbody) return false;

    const currentTr = Array.from(tbody.querySelectorAll('tr[data-revision-key]'))
        .find(tr => (tr.getAttribute('data-revision-key') || '') === key);
    if (!currentTr) return false;

    const row = state.allData.find(item => getRevisionKey(item) === key);
    if (!row) return false;

    const tempTbody = document.createElement('tbody');
    tempTbody.innerHTML = renderRow(row).trim();
    const nextTr = tempTbody.firstElementChild;
    if (!(nextTr instanceof HTMLTableRowElement)) return false;

    currentTr.replaceWith(nextTr);
    refreshSelectedRowVisual();
    if (state.selectedRevisionRowKey === key) {
        renderSelectedRowPosPanel(row);
        renderSelectedRowPosTop(row);
    }
    applyColumnView();
    return true;
}

export function renderPagination() {
    const totalPages = getEffectiveTotalPages(getPaginationTotalRows());
    const pagination = document.getElementById('pagination');
    const pageInfo = document.getElementById('pageInfo');
    const firstBtn = document.getElementById('firstBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const lastBtn = document.getElementById('lastBtn');
    if (!pagination || !pageInfo || !prevBtn || !nextBtn) return;
    if (!state.paginationEnabled) {
        pagination.style.display = 'none';
        return;
    }
    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }
    pagination.style.display = 'flex';
    pageInfo.textContent = `Página ${state.currentPage} de ${totalPages}`;
    if (firstBtn instanceof HTMLButtonElement) firstBtn.disabled = state.currentPage === 1;
    prevBtn.disabled = state.currentPage === 1;
    nextBtn.disabled = state.currentPage === totalPages;
    if (lastBtn instanceof HTMLButtonElement) lastBtn.disabled = state.currentPage === totalPages;
}

export function jumpToPage(pageNumber) {
    const totalPages = getEffectiveTotalPages(getPaginationTotalRows());
    const requestedPage = Number(pageNumber);
    if (!Number.isFinite(requestedPage)) return;

    const boundedPage = Math.min(Math.max(1, Math.trunc(requestedPage)), totalPages);
    if (boundedPage === state.currentPage) return;

    state.currentPage = boundedPage;
    renderTable();
    renderPagination();
}

export function renderTable() {
    const tbody = document.getElementById('tbody');
    const errorViewTbody = document.getElementById('errorViewTbody');
    const stats = document.getElementById('stats');
    const pagination = document.getElementById('pagination');
    if (!tbody || !errorViewTbody || !stats || !pagination) return;

    setTableModeVisibility();

    if (state.paginationEnabled) syncAutoPageSize();

    document.querySelectorAll('thead th[data-sort]').forEach(th => {
        const key = th.dataset.sort;
        if (key === state.sortKey) th.setAttribute('data-sort-dir', state.sortAsc ? 'asc' : 'desc');
        else th.removeAttribute('data-sort-dir');
    });

    const errorsMode = state.tableMode === 'errors';
    const baseFiltered = applyFilters(state.allData);
    const totalBookRowsNoFilters = getBookScopeRowsWithoutFilters();
    state.filteredData = errorsMode
        ? baseFiltered.filter(row => getPersistedHasError(row))
        : baseFiltered;
    const total = state.filteredData.length;

    if (!state.filteredData.length) {
        const noDataMessage = errorsMode
            ? 'No hay registros con error para los filtros y checks activos'
            : 'No se encontraron datos que coincidan con los filtros';
        tbody.innerHTML = `<tr><td colspan="${getCurrentColumnCount()}" class="error">${noDataMessage}</td></tr>`;
        errorViewTbody.innerHTML = `<tr><td colspan="${getErrorViewColumnCount()}" class="error">${noDataMessage}</td></tr>`;
        pagination.style.display = 'none';
        renderReviewStatsSummary(stats, [], [], totalBookRowsNoFilters);
        if (!errorsMode) applyColumnView();
        return;
    }

    const sortedData = sortData(state.filteredData, state.sortKey, state.sortAsc);
    const displayRows = errorsMode ? sortedData : getQaDisplayRows(sortedData);
    state.displayRowCount = displayRows.length;
    const effectivePageSize = getEffectivePageSize(displayRows.length);
    const totalPages = Math.max(1, Math.ceil(displayRows.length / effectivePageSize));
    if (state.currentPage < 1) state.currentPage = 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    const start = (state.currentPage - 1) * effectivePageSize;
    const pageData = displayRows.slice(start, start + effectivePageSize);

    if (sortedData.length > 0) {
        const hasSelectedInFiltered = state.filteredData.some(item => getRevisionKey(item) === state.selectedRevisionRowKey);
        if (!hasSelectedInFiltered) {
            state.selectedRevisionRowKey = getRevisionKey(sortedData[0]);
        }
    }

    if (errorsMode) {
        const definitions = getErrorViewDefinitions();
        renderErrorViewHeader(definitions);
        renderErrorTableStats(state.filteredData, definitions);
        setVirtualState(true, pageData, (row) => renderErrorViewRow(row, definitions), getErrorViewColumnCount());
        if (getVirtualState(true).active) {
            errorViewTbody.innerHTML = '';
            renderVirtualWindow(true);
        } else {
            errorViewTbody.innerHTML = pageData.map(row => renderErrorViewRow(row, definitions)).join('');
        }
        tbody.innerHTML = '';
        renderReviewStatsSummary(stats, state.filteredData, pageData, totalBookRowsNoFilters);
    } else {
        renderReviewStatsSummary(stats, state.filteredData, pageData, totalBookRowsNoFilters);

        setVirtualState(false, pageData, renderRow, getCurrentColumnCount());
        if (getVirtualState(false).active) {
            tbody.innerHTML = '';
            renderVirtualWindow(false);
        } else {
            tbody.innerHTML = pageData.length
                ? pageData.map(renderRow).join('')
                : `<tr><td colspan="${getCurrentColumnCount()}" class="error">Aun no hay registros en estado OK en esta sesion.</td></tr>`;
        }
        errorViewTbody.innerHTML = '';
    }

    refreshSelectedRowVisual();

    const selectedRow = state.selectedRevisionRowKey
        ? state.allData.find(item => getRevisionKey(item) === state.selectedRevisionRowKey)
        : null;
    renderSelectedRowPosPanel(selectedRow || null);
    renderSelectedRowPosTop(selectedRow || null);
    dispatchSelectionChanged(state.selectedRevisionRowKey);
    const preloadRows = getVirtualState(false).active
        ? getVirtualState(false).rows.slice(0, Math.min(getVirtualState(false).rows.length, Math.max(50, VIRTUAL_OVERSCAN_ROWS * 4)))
        : pageData;
    scheduleVisiblePosCirclePreload(preloadRows);

    if (!errorsMode) {
        applyColumnView();
        queueColumnViewRefresh();
        renderGroupedTable(state.filteredData);
    }
}

export function changePage(direction) {
    const totalPages = getEffectiveTotalPages(getPaginationTotalRows());
    state.currentPage += direction;
    if (state.currentPage < 1) state.currentPage = 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    renderTable();
    renderPagination();
}

export function focusRevisionRowInMainTable(revisionKey) {
    const targetKey = String(revisionKey || '').trim();
    if (!targetKey) return false;

    const targetRow = state.allData.find(item => getRevisionKey(item) === targetKey);
    if (!targetRow) return false;

    const filteredSortedRows = getCurrentFilteredSortedRows();
    const targetIndex = filteredSortedRows.findIndex(item => getRevisionKey(item) === targetKey);
    if (targetIndex === -1) return false;

    state.selectedRevisionRowKey = targetKey;
    const effectivePageSize = getEffectivePageSize(filteredSortedRows.length);
    state.currentPage = Math.floor(targetIndex / effectivePageSize) + 1;

    renderTable();
    renderPagination();

    ensureVirtualRowVisible(false, targetKey);

    const safeKey = targetKey.replace(/"/g, '\\"');
    const visibleRow = document.querySelector(`#tbody tr[data-revision-key="${safeKey}"]`);
    if (visibleRow instanceof HTMLTableRowElement) {
        visibleRow.scrollIntoView({ block: 'nearest' });
    }

    return true;
}

export function toggleGroupedView() {
    state.groupedVisible = !state.groupedVisible;
    const section = document.getElementById('groupedSection');
    const mainTableWrap = document.getElementById('mainTableWrap');
    const pagination = document.getElementById('pagination');
    if (!section || !mainTableWrap || !pagination) return;
    section.style.display = state.groupedVisible ? 'block' : 'none';
    mainTableWrap.style.display = state.groupedVisible ? 'none' : 'block';
    if (state.groupedVisible) {
        pagination.style.display = 'none';
        renderGroupedTable(state.filteredData);
    } else {
        if (syncAutoPageSize()) renderTable();
        renderPagination();
    }
}
