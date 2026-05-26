/**
 * Edición inline de celdas sobre la tabla QA.
 * Doble click en las columnas configuradas para editar directamente y persistir en engine_*.json.
 */

import { state } from './state.js';
import { escapeHtml, getEngineJsonForRow } from './helpers.js';
import { saveCellToServer } from './data-loader.js';
import { showToast } from './toast.js';

const EDITABLE_COLUMNS = new Set();
let activeEditor = null;

function isEditableColumn(columnKey) {
    return EDITABLE_COLUMNS.has(String(columnKey || '').trim());
}

function buildEditor(columnKey, currentValue) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'filter-input qa-inline-editor';
    input.value = String(currentValue ?? '').trim() === '—' ? '' : String(currentValue ?? '');
    input.setAttribute('aria-label', `Editar ${columnKey}`);
    return input;
}

function restoreCell(td, displayValue, titleValue) {
    td.innerHTML = escapeHtml(displayValue);
    td.title = String(titleValue ?? '');
}

function findRowByRevisionKey(revisionKey) {
    return state.allData.find(item => String(item.__qa_revision_key || '') === String(revisionKey)
        || String(item.__qa_revision_legacy_key || '') === String(revisionKey)
        || String(item.__qa_revision_occ_key || '') === String(revisionKey));
}

export function cancelInlineEdit() {
    if (!activeEditor) return;
    const { td, originalDisplayValue, originalTitleValue } = activeEditor;
    restoreCell(td, originalDisplayValue, originalTitleValue);
    activeEditor = null;
}

async function commitInlineEdit() {
    if (!activeEditor) return;

    const { td, input, row, columnKey, originalDisplayValue, originalTitleValue } = activeEditor;
    const nextValue = input.value;
    const currentStoredValue = row?.[columnKey] ?? '';

    if (String(currentStoredValue) === String(nextValue)) {
        restoreCell(td, nextValue || '—', nextValue || '');
        activeEditor = null;
        return;
    }

    const engineFile = getEngineJsonForRow(row);
    if (!engineFile) {
        restoreCell(td, originalDisplayValue, originalTitleValue);
        activeEditor = null;
        showToast('No se pudo determinar el archivo engine_*.json para esta fila.', 'error');
        return;
    }

    td.classList.add('cell-saving');

    try {
        await saveCellToServer(engineFile, row.ID, columnKey, nextValue);
        row[columnKey] = nextValue;
        restoreCell(td, nextValue || '—', nextValue || '');
    } catch (error) {
        console.error('Error guardando edición inline:', error);
        restoreCell(td, originalDisplayValue, originalTitleValue);
        showToast(`No se pudo guardar el cambio: ${error.message}`, 'error');
    } finally {
        td.classList.remove('cell-saving');
        activeEditor = null;
    }
}

export function startInlineEdit(td) {
    if (!(td instanceof HTMLTableCellElement)) return;
    if (state.backendWritable === false) {
        showToast('Modo solo lectura: backend sin conexion. No se pueden editar celdas.', 'info');
        return;
    }
    if (activeEditor) cancelInlineEdit();

    const columnKey = td.dataset.colKey;
    const revisionKey = td.closest('tr')?.dataset.revisionKey;
    if (!isEditableColumn(columnKey) || !revisionKey) return;

    const row = findRowByRevisionKey(revisionKey);
    if (!row) return;

    const originalDisplayValue = td.textContent || '';
    const originalTitleValue = td.title || originalDisplayValue;
    const input = buildEditor(columnKey, row[columnKey] ?? '');

    td.innerHTML = '';
    td.appendChild(input);
    td.classList.add('cell-editing');
    input.focus();
    input.select();

    activeEditor = { td, input, row, columnKey, originalDisplayValue, originalTitleValue };

    input.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            td.classList.remove('cell-editing');
            await commitInlineEdit();
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            td.classList.remove('cell-editing');
            cancelInlineEdit();
        }
    });

    input.addEventListener('blur', async () => {
        if (!activeEditor || activeEditor.input !== input) return;
        td.classList.remove('cell-editing');
        await commitInlineEdit();
    }, { once: true });
}

export function isInlineEditableTarget(target) {
    const td = target instanceof HTMLElement ? target.closest('td[data-editable="true"]') : null;
    if (!td) return false;
    return isEditableColumn(td.dataset.colKey);
}
