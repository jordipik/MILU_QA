/**
 * Gestion de la vista de columnas: orden y visibilidad.
 * Tres modos: 'qa' (all), 'focus' (enfocado en PN), 'pdf' (vista compacta operativa).
 */

import { state } from './state.js';

const COLUMN_VIEW_STORAGE_KEY = 'milu_column_view_v2';
const TABLE_COLUMN_WIDTHS_STORAGE_KEY = 'milu_table_column_widths_v2';
const DEFAULT_COLUMN_VIEW = 'pdf';

export const FOCUS_COLUMN_ORDER = [
    'ID', 'quick_actions', 'esquemas', 'BOM-No.', 'qa_revision_accion', 'pn_final', 'DESIGNATION', 'designation_gesa', 'MODEL/TYPE', 'QTY',
    'gesa', 'normalizado', 'sust_hierarchie', 'has_img', 'has_error', 'EN_WEB', 'qa_revision_estado',
    'POS', 'PART NO.', 'pn_raw', 'criterio_pn', 'weight_final', 'UNITS', 'weight_gesa', 'units', 'FG/FGS', 'measure_final', 'dimensions_gesa', 'model', 'Source Page',
    'precio', 'FN', 'esquemas_circulos_all', 'engine_model', 'categoria', 'source_file', 'source_sheet', 'engine', 'fg_fgs_raw', 'fg_code', 'fgs_description', 'atributo2', 'ruta_foto',
    'esquemas_circulos', 'fgs_code_description', 'filename_foto', 'nsn', 'norma', 'sust_status', 'sust_new_part_number', 'sust_superseded_list'
];

export const PDF_COLUMN_ORDER = [
    // Vista compacta por defecto (~12 columnas) para operativa QA sin perder flujo.
    'engine_model',
    'Source Page',
    'POS',
    'PART NO.',
    'designation_final',
    'QTY',
    'qa_revision_estado',
    'qa_revision_accion',
    'measure_final',
    'sust_status',
    'sust_hierarchie',
    'has_img'
];

function syncColumnViewStateFromControl() {
    const viewSelect = document.getElementById('columnViewSelect');
    if (!(viewSelect instanceof HTMLSelectElement)) return state.columnView;
    const controlValue = String(viewSelect.value || '').trim();
    if (controlValue === 'qa' || controlValue === 'focus' || controlValue === 'pdf') {
        state.columnView = controlValue;
    }
    return state.columnView;
}

function getCellOrderKey(cell, index) {
    if (!(cell instanceof HTMLElement)) return `idx:${index}`;
    const explicitKey = String(cell.dataset.columnKey || '').trim();
    if (explicitKey) return explicitKey;
    const sortKey = String(cell.dataset.sort || '').trim();
    if (sortKey) return sortKey;
    return `idx:${index}`;
}

function resolveColumnOrder(preferredKeys, headerRow, totalColumns) {
    const defaultOrder = Array.from({ length: totalColumns }, (_, i) => i);
    if (!headerRow) return defaultOrder;

    const cells = Array.from(headerRow.children || []);
    const indexByKey = new Map();
    cells.forEach((cell, index) => {
        const key = getCellOrderKey(cell, index);
        const rawIndex = Number(cell.dataset.colIndex);
        const originalIndex = Number.isInteger(rawIndex) ? rawIndex : index;
        if (!indexByKey.has(key)) indexByKey.set(key, originalIndex);
    });

    const resolved = [];
    preferredKeys.forEach(key => {
        const index = indexByKey.get(key);
        if (Number.isInteger(index)) resolved.push(index);
    });

    return resolved.length ? resolved : defaultOrder;
}

function getColumnOrderForView(totalColumns, headerRow) {
    const defaultOrder = Array.from({ length: totalColumns }, (_, i) => i);
    const preferred = state.columnView === 'focus'
        ? resolveColumnOrder(FOCUS_COLUMN_ORDER, headerRow, totalColumns)
        : (state.columnView === 'pdf'
            ? resolveColumnOrder(PDF_COLUMN_ORDER, headerRow, totalColumns)
            : defaultOrder);
    const seen = new Set();
    const normalized = [];
    preferred.forEach(i => {
        if (Number.isInteger(i) && i >= 0 && i < totalColumns && !seen.has(i)) {
            seen.add(i); normalized.push(i);
        }
    });
    for (let i = 0; i < totalColumns; i++) {
        if (!seen.has(i)) normalized.push(i);
    }
    return normalized;
}

function getVisibleColumnIndexesForView(totalColumns, headerRow) {
    if (state.columnView !== 'pdf') return null;
    const visible = new Set(resolveColumnOrder(PDF_COLUMN_ORDER, headerRow, totalColumns));
    return visible.size > 0 ? visible : null;
}

function ensureRowColumnIndexes(row) {
    if (!row) return;
    Array.from(row.children || []).forEach((cell, index) => {
        if (!(cell instanceof HTMLElement)) return;
        if (!cell.dataset.colIndex) cell.dataset.colIndex = String(index);
    });
}

function reorderRowCells(row, order) {
    if (!row) return;
    const cells = Array.from(row.children || []);
    const byOriginalIndex = new Map();
    cells.forEach((cell, position) => {
        if (!(cell instanceof HTMLElement)) return;
        const rawIndex = Number(cell.dataset.colIndex);
        const originalIndex = Number.isInteger(rawIndex) ? rawIndex : position;
        if (!cell.dataset.colIndex) cell.dataset.colIndex = String(originalIndex);
        byOriginalIndex.set(originalIndex, cell);
    });
    order.forEach(i => {
        const cell = byOriginalIndex.get(i);
        if (cell) row.appendChild(cell);
    });
}

function setRowColumnVisibility(row, visibleIndexes) {
    if (!row) return;
    const cells = Array.from(row.children || []);
    if (cells.length <= 1) return;
    cells.forEach((cell, index) => {
        if (!(cell instanceof HTMLElement)) return;
        if (visibleIndexes === null) {
            cell.style.display = '';
            return;
        }
        const originalIndex = Number(cell.dataset.colIndex);
        const fallbackIndex = Number.isInteger(originalIndex) ? originalIndex : index;
        cell.style.display = visibleIndexes.has(fallbackIndex) ? '' : 'none';
    });
}

export function applyColumnView() {
    const headerRow = document.querySelector('#mainTableWrap thead tr:not(.filter-row)');
    const filterRow = document.querySelector('#mainTableWrap thead tr.filter-row');
    if (!headerRow || !filterRow) return;

    ensureRowColumnIndexes(headerRow);
    ensureRowColumnIndexes(filterRow);

    syncColumnViewStateFromControl();

    const totalColumns = headerRow.children.length;
    const order = getColumnOrderForView(totalColumns, headerRow);
    const visibleIndexes = getVisibleColumnIndexesForView(totalColumns, headerRow);
    reorderRowCells(headerRow, order);
    reorderRowCells(filterRow, order);
    setRowColumnVisibility(headerRow, visibleIndexes);
    setRowColumnVisibility(filterRow, visibleIndexes);

    document.querySelectorAll('#tbody tr').forEach(row => {
        ensureRowColumnIndexes(row);
        reorderRowCells(row, order);
        setRowColumnVisibility(row, visibleIndexes);
    });
}

export function saveColumnViewPreference() {
    try { localStorage.setItem(COLUMN_VIEW_STORAGE_KEY, state.columnView); }
    catch (e) { console.warn('No se pudo guardar la vista de columnas:', e); }
}

export function loadColumnViewPreference() {
    state.columnView = DEFAULT_COLUMN_VIEW;
    try {
        const saved = localStorage.getItem(COLUMN_VIEW_STORAGE_KEY);
        if (saved === 'qa' || saved === 'focus' || saved === 'pdf') {
            state.columnView = saved;
        }
    } catch (e) { console.warn('No se pudo leer la vista de columnas:', e); }
    const viewSelect = document.getElementById('columnViewSelect');
    if (viewSelect instanceof HTMLSelectElement) {
        viewSelect.value = state.columnView;
        syncColumnViewStateFromControl();
    }
}

// ─── Anchos de columna ────────────────────────────────────────────────────────

export function saveColumnWidths() {
    const widths = {};
    document.querySelectorAll('#mainTableWrap thead tr:not(.filter-row) th').forEach((th, index) => {
        const key = (th.dataset.sort || th.textContent || `idx_${index}`).trim();
        widths[key] = th.style.width || th.offsetWidth + 'px';
    });
    try { localStorage.setItem(TABLE_COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(widths)); }
    catch (e) { /* ignore */ }
}

export function loadColumnWidths() {
    let widths = {};
    try { widths = JSON.parse(localStorage.getItem(TABLE_COLUMN_WIDTHS_STORAGE_KEY) || '{}'); }
    catch (e) { /* ignore */ }
    if (!Object.keys(widths).length) return;
    document.querySelectorAll('#mainTableWrap thead tr:not(.filter-row) th').forEach((th, index) => {
        const key = (th.dataset.sort || th.textContent || `idx_${index}`).trim();
        if (widths[key]) th.style.width = widths[key];
    });
}

export function initColumnResize() {
    let resizingColumn = null;
    let startX = 0;
    let startWidth = 0;

    document.querySelectorAll('#mainTableWrap thead tr:not(.filter-row) th').forEach(th => {
        th.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const rect = th.getBoundingClientRect();
            if (rect.right - e.clientX > 6) return;
            resizingColumn = th;
            startX = e.clientX;
            startWidth = th.offsetWidth;
            th.classList.add('resizing');
            e.preventDefault();
        });
    });

    document.addEventListener('mousemove', (e) => {
        if (!resizingColumn) return;
        const newWidth = Math.max(30, startWidth + (e.clientX - startX));
        resizingColumn.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (resizingColumn) {
            resizingColumn.classList.remove('resizing');
            saveColumnWidths();
            resizingColumn = null;
        }
    });
}
