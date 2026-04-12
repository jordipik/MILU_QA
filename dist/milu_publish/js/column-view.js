/**
 * Gestión de la vista de columnas: orden y visibilidad.
 * Tres modos: 'qa' (all), 'focus' (enfocado en PN), 'pdf' (útil para PDF).
 */

import { state } from './state.js';

const COLUMN_VIEW_STORAGE_KEY = 'milu_column_view_v2';
const TABLE_COLUMN_WIDTHS_STORAGE_KEY = 'milu_table_column_widths_v2';

export const FOCUS_COLUMN_ORDER = [
    0, 9, 36, 26, 8, 13, 15, 16, 17, 18,
    1, 2, 3, 4, 5, 6, 7,
    10, 11, 12, 14, 19, 20, 21, 22, 23, 24, 25, 27, 28,
    40, 41, 37, 38, 39, 42, 43, 44, 45, 46, 47, 48, 49,
    29, 30, 31, 32, 33, 34, 35
];

export const PDF_COLUMN_ORDER = [
    // Sin ID. Se mantienen estados hasta "Acción" y luego columnas de exportación PDF.
    1, 2, 3, 4, 5, 6, 7, 8,
    9, 12, 51, 16, 17, 19, 53, 40, 52, 31
];

function getColumnOrderForView(totalColumns) {
    const defaultOrder = Array.from({ length: totalColumns }, (_, i) => i);
    const preferred = state.columnView === 'focus'
        ? FOCUS_COLUMN_ORDER
        : (state.columnView === 'pdf' ? PDF_COLUMN_ORDER : defaultOrder);
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

function getVisibleColumnCountForView(totalColumns) {
    if (state.columnView !== 'pdf') return totalColumns;
    const visible = new Set();
    PDF_COLUMN_ORDER.forEach(i => {
        if (Number.isInteger(i) && i >= 0 && i < totalColumns) visible.add(i);
    });
    return visible.size > 0 ? visible.size : totalColumns;
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

function setRowColumnVisibility(row, visibleCount) {
    if (!row) return;
    const cells = Array.from(row.children || []);
    if (cells.length <= 1) return;
    cells.forEach((cell, index) => {
        if (!(cell instanceof HTMLElement)) return;
        cell.style.display = index < visibleCount ? '' : 'none';
    });
}

export function applyColumnView() {
    const headerRow = document.querySelector('#mainTableWrap thead tr:not(.filter-row)');
    const filterRow = document.querySelector('#mainTableWrap thead tr.filter-row');
    if (!headerRow || !filterRow) return;

    const totalColumns = headerRow.children.length;
    const order = getColumnOrderForView(totalColumns);
    const visibleCount = getVisibleColumnCountForView(totalColumns);

    ensureRowColumnIndexes(headerRow);
    ensureRowColumnIndexes(filterRow);
    reorderRowCells(headerRow, order);
    reorderRowCells(filterRow, order);
    setRowColumnVisibility(headerRow, visibleCount);
    setRowColumnVisibility(filterRow, visibleCount);

    document.querySelectorAll('#tbody tr').forEach(row => {
        ensureRowColumnIndexes(row);
        reorderRowCells(row, order);
        setRowColumnVisibility(row, visibleCount);
    });
}

export function saveColumnViewPreference() {
    try { localStorage.setItem(COLUMN_VIEW_STORAGE_KEY, state.columnView); }
    catch (e) { console.warn('No se pudo guardar la vista de columnas:', e); }
}

export function loadColumnViewPreference() {
    try {
        const saved = localStorage.getItem(COLUMN_VIEW_STORAGE_KEY);
        if (saved === 'qa' || saved === 'focus' || saved === 'pdf') state.columnView = saved;
    } catch (e) { console.warn('No se pudo leer la vista de columnas:', e); }
    const viewSelect = document.getElementById('columnViewSelect');
    if (viewSelect) viewSelect.value = state.columnView;
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
