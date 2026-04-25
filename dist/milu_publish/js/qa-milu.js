/**
 * Punto de entrada principal de qa_milu.
 */

import { state } from './state.js';
import { escapeHtml, getRowErrors, getRowErrorType, getRowValueForColumn, val } from './helpers.js';
import { evaluateRowQaChecks, getQaActiveSignature } from './qa-checks.js';
import { checkSaveBackendConnection, fetchJsonSafe, loadPartitionedEngineData, saveCellToServer } from './data-loader.js';
import {
    applyRevisionDataToRows,
    assignRevisionKeys,
    denormalizeAccionFromNew,
    denormalizeEstadoFromNew,
    getRevisionKey,
    normalizeAccionToNew,
    normalizeEstadoToNew,
    updateRevisionSelectVisual
} from './revision.js';
import { subscribeRevisionSync } from './revision-sync.js';
import { createChangeControl } from './change-control.js';
import {
    applyColumnView,
    initColumnResize,
    loadColumnViewPreference,
    loadColumnWidths,
    saveColumnViewPreference
} from './column-view.js';
import { isInlineEditableTarget, cancelInlineEdit } from './cell-editor.js';
import { initPdfZoomControls, loadPdfClear, loadPdfWithPage, renderPdfPage, requestPdfRelayout, setPdfSelection } from './pdf-viewer.js';
import { updateSchemasInline, renderSelectedRowPosPanel, renderSelectedRowPosTop } from './schemas.js';
import { getEngineJsonForRow } from './helpers.js';
import {
    changePage,
    focusRevisionRowInMainTable,
    getCurrentFilteredSortedRows,
    getRowsForBulkScope,
    jumpToPage,
    moveSelectionBy,
    refreshVisibleRowByRevisionKey,
    renderPagination,
    renderTable,
    syncAutoPageSize,
    refreshSelectedRowVisual
} from './qa-table.js';

const $ = (id) => document.getElementById(id);
let filterTimeout = null;
let resizeTimer = null;
let backendStatusTimer = null;

function queueColumnViewRefresh() {
    requestAnimationFrame(() => {
        applyColumnView();
        requestAnimationFrame(() => applyColumnView());
    });
}

const MODAL_FIELD_KEYS = [
    'pos_final',
    'pn_final',
    'designation_final',
    'model_final',
    'qty_final',
    'qty_units_final',
    'weight_final',
    'fn_final',
    'measure_final',
    'norma_final',
    'gesa',
    'normalizado',
    'sust_hierarchie',
    'has_img',
    'EN_WEB',
    'engine_model',
    'Source Page'
];
const SYNTHETIC_NEW_EXPORT_COLUMNS = [
    'Id',
    'fecha_version',
    'POS',
    'designation',
    'engine',
    'model_type',
    'type',
    'pn',
    'nsn',
    'GESA_NORM',
    'GESA_NORMALIZADO',
    'fg_code',
    'fg_description',
    'fg_code_description',
    'weight',
    'weight_txt',
    'measurement',
    'TIPOARTICULO',
    'PAG',
    'BOM_no',
    'esquema_general',
    'exp_motor',
    'exp_categorias',
    'atributo',
    'SUST_TIPO',
    'new_pn_relacionado',
    'old_pn_relacionados',
    'EN_EXCEL_SUSTITUCION',
    'ruta_foto',
    'exp_imagenes'
];
const SYNTHETIC_SUPERSEDED_EXPORT_COLUMNS = [
    ...SYNTHETIC_NEW_EXPORT_COLUMNS,
    'vinculo'
];
const modalUiState = {
    tableScrollTop: 0,
    tableScrollLeft: 0,
    windowScrollX: 0,
    windowScrollY: 0
};
let activeMatchesModalRevisionKey = '';
let pendingShellRecordModalRequest = null;

const QA_ROW_PATCH_CHANGE_TYPE = 'qa-row-patch';
const QA_BULK_ROW_PATCH_CHANGE_TYPE = 'qa-bulk-row-patch';

function getAuditBackendCandidateUrls() {
    const currentOrigin = window.location.origin && window.location.origin !== 'null'
        ? window.location.origin
        : '';
    const currentHostname = String(window.location.hostname || '').trim();
    const sameDirectoryCandidate = new URL('audit-log', new URL('.', window.location.href)).href;
    const localPortCandidate = currentHostname ? `http://${currentHostname}:3000/audit-log` : '';
    const sameOriginCandidate = currentOrigin ? `${currentOrigin}/audit-log` : '/audit-log';
    return [
        localPortCandidate,
        'http://localhost:3000/audit-log',
        sameDirectoryCandidate,
        sameOriginCandidate
    ].filter((url, index, arr) => url && arr.indexOf(url) === index);
}

async function persistAuditEntryToServer(entry) {
    const urls = getAuditBackendCandidateUrls();
    for (const url of urls) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry)
            });
            if (response.ok) return true;
        } catch (_) {
            // Continue with next candidate.
        }
    }
    return false;
}

const changeControl = createChangeControl({
    namespace: 'milu:qa',
    eventPrefix: 'milu:change-control',
    maxUndoEntries: 200,
    maxAuditEntries: 2000,
    onAuditEntry: persistAuditEntryToServer
});

function updateUndoButtonState() {
    const undoBtn = $('qaUndoLastChangeBtn');
    if (!(undoBtn instanceof HTMLButtonElement)) return;
    const historyState = changeControl.getUndoState();
    undoBtn.disabled = !historyState.canUndo;
    undoBtn.textContent = historyState.undoCount > 0
        ? `Deshacer (${historyState.undoCount})`
        : 'Deshacer';
}

function getPersistedValueForField(fieldKey, value) {
    if (fieldKey === 'qa_revision_estado') return denormalizeEstadoFromNew(value);
    if (fieldKey === 'qa_revision_accion') return denormalizeAccionFromNew(value);
    return value;
}

async function applySinglePatchTarget(target, changes, direction) {
    const revisionKey = String(target?.revisionKey || '').trim();
    const engineFile = String(target?.engineFile || '').trim();
    const rowId = String(target?.id || '').trim();
    if (!revisionKey || !engineFile || !rowId) {
        throw new Error('Patch invalido: falta revisionKey/engineFile/id.');
    }

    const row = getRowByRevisionKey(revisionKey);
    if (!row) {
        throw new Error(`No se encontro la fila para revisionKey ${revisionKey}`);
    }

    const useBefore = direction === 'before';
    const touchedFields = [];
    for (const [fieldKey, change] of Object.entries(changes || {})) {
        const nextValue = useBefore ? change?.before : change?.after;
        const prevValue = String(row?.[fieldKey] ?? '');
        const nextAsString = String(nextValue ?? '');
        if (prevValue === nextAsString) continue;

        await saveCellToServer(engineFile, rowId, fieldKey, getPersistedValueForField(fieldKey, nextValue));
        row[fieldKey] = nextValue;
        touchedFields.push(fieldKey);
    }

    if (!touchedFields.length) return;

    if (touchedFields.includes('qa_revision_estado') || touchedFields.includes('qa_revision_accion')) {
        row.qa_revision_updated_at = new Date().toISOString();
    }

    if (touchedFields.some((fieldKey) => MODAL_FIELD_KEYS.includes(fieldKey))) {
        invalidateRowActiveQaErrors(row);
    }

    state.selectedRevisionRowKey = revisionKey;
    const updatedVisibleRow = refreshVisibleRowByRevisionKey(revisionKey);
    if (!updatedVisibleRow) renderTable();
    renderPagination();

    const modalForm = $('qaRecordModalForm');
    if (modalForm instanceof HTMLFormElement && String(modalForm.dataset.revisionKey || '') === revisionKey) {
        fillRecordModal(row, revisionKey);
    }
    fillSideRecordForm(row, revisionKey);
}

async function applyBulkPatchTargets(targets, direction) {
    const appliedTargets = [];
    try {
        for (const targetPatch of targets) {
            await applySinglePatchTarget(targetPatch.target, targetPatch.changes, direction);
            appliedTargets.push(targetPatch);
        }
    } catch (error) {
        const rollbackDirection = direction === 'before' ? 'after' : 'before';
        for (let index = appliedTargets.length - 1; index >= 0; index -= 1) {
            const targetPatch = appliedTargets[index];
            try {
                await applySinglePatchTarget(targetPatch.target, targetPatch.changes, rollbackDirection);
            } catch (_) {
                // Keep original error and stop best-effort rollback failures from hiding it.
            }
        }
        throw error;
    }
}

function registerChangeControlTypes() {
    changeControl.registerType(QA_ROW_PATCH_CHANGE_TYPE, {
        apply: async (entry) => {
            const target = entry?.data?.target;
            const changes = entry?.data?.changes || {};
            await applySinglePatchTarget(target, changes, 'after');
        },
        revert: async (entry) => {
            const target = entry?.data?.target;
            const changes = entry?.data?.changes || {};
            await applySinglePatchTarget(target, changes, 'before');
        }
    });

    changeControl.registerType(QA_BULK_ROW_PATCH_CHANGE_TYPE, {
        apply: async (entry) => {
            const targets = Array.isArray(entry?.data?.targets) ? entry.data.targets : [];
            await applyBulkPatchTargets(targets, 'after');
        },
        revert: async (entry) => {
            const targets = Array.isArray(entry?.data?.targets) ? entry.data.targets : [];
            await applyBulkPatchTargets(targets, 'before');
        }
    });
}

function buildPatchTargetForRow(row) {
    const revisionKey = String(getRevisionKey(row) || '').trim();
    const engineFile = String(getEngineJsonForRow(row) || '').trim();
    const id = String(row?.ID ?? '').trim();
    if (!revisionKey || !engineFile || !id) {
        throw new Error('No se pudo construir patch target para la fila.');
    }
    return { revisionKey, engineFile, id };
}

function collectRowChanges(row, nextValues, nextEstado, nextAccion) {
    const changes = {};

    MODAL_FIELD_KEYS.forEach((fieldKey) => {
        const beforeValue = String(row?.[fieldKey] ?? '');
        const afterValue = String(nextValues?.[fieldKey] ?? '');
        if (beforeValue === afterValue) return;
        changes[fieldKey] = {
            before: row?.[fieldKey] ?? '',
            after: nextValues?.[fieldKey] ?? ''
        };
    });

    const normalizedEstadoBefore = normalizeEstadoToNew(row?.qa_revision_estado);
    const normalizedEstadoAfter = normalizeEstadoToNew(nextEstado);
    if (normalizedEstadoBefore !== normalizedEstadoAfter) {
        changes.qa_revision_estado = {
            before: normalizedEstadoBefore,
            after: normalizedEstadoAfter
        };
    }

    const normalizedAccionBefore = normalizeAccionToNew(row?.qa_revision_accion);
    const normalizedAccionAfter = normalizeAccionToNew(nextAccion);
    if (normalizedAccionBefore !== normalizedAccionAfter) {
        changes.qa_revision_accion = {
            before: normalizedAccionBefore,
            after: normalizedAccionAfter
        };
    }

    return changes;
}

async function undoLastQaChange() {
    try {
        const entry = await changeControl.undoLast();
        if (!entry) {
            const status = $('qaSideStatus');
            if (status) status.textContent = 'No hay cambios para deshacer.';
            return;
        }
        const status = $('qaSideStatus');
        if (status) status.textContent = `Deshecho: ${entry.description || entry.action || entry.type}`;
    } catch (error) {
        console.error('No se pudo deshacer el ultimo cambio:', error);
        alert(`No se pudo deshacer el ultimo cambio: ${error.message}`);
    } finally {
        updateUndoButtonState();
    }
}

async function redoLastQaChange() {
    try {
        const entry = await changeControl.redoLast();
        if (!entry) return;
        const status = $('qaSideStatus');
        if (status) status.textContent = `Rehecho: ${entry.description || entry.action || entry.type}`;
    } catch (error) {
        console.error('No se pudo rehacer el ultimo cambio:', error);
        alert(`No se pudo rehacer el ultimo cambio: ${error.message}`);
    } finally {
        updateUndoButtonState();
    }
}

function setRightPanelTab(tabName) {
    const validTabs = new Set(['pdf', 'record', 'export', 'schemas']);
    const resolvedTab = validTabs.has(tabName) ? tabName : 'pdf';
    state.rightPanelTab = resolvedTab;

    document.querySelectorAll('[data-pdf-tab]').forEach(btn => {
        const isActive = btn.dataset.pdfTab === resolvedTab;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('[data-pdf-panel]').forEach(panel => {
        const isActive = panel.dataset.pdfPanel === resolvedTab;
        panel.classList.toggle('is-active', isActive);
        panel.toggleAttribute('hidden', !isActive);
    });

    if (resolvedTab === 'pdf') {
        requestPdfRelayout();
    }
}

function setBackendStatusBadge(status, message) {
    const statusWrap = $('backendStatus');
    const statusText = $('backendStatusText');
    if (!statusWrap || !statusText) return;

    statusWrap.classList.remove('checking', 'online', 'offline');
    statusWrap.classList.add(status);
    statusText.textContent = message;
}

async function refreshBackendStatus() {
    setBackendStatusBadge('checking', 'Backend: comprobando...');
    const result = await checkSaveBackendConnection();
    if (result.ok) {
        setBackendStatusBadge('online', 'Backend: conectado');
        return;
    }
    setBackendStatusBadge('offline', 'Backend: sin conexion');
}

function initBackendStatusMonitor() {
    refreshBackendStatus().catch(() => setBackendStatusBadge('offline', 'Backend: sin conexion'));

    if (backendStatusTimer) clearInterval(backendStatusTimer);
    backendStatusTimer = setInterval(() => {
        refreshBackendStatus().catch(() => setBackendStatusBadge('offline', 'Backend: sin conexion'));
    }, 30000);

    window.addEventListener('focus', () => {
        refreshBackendStatus().catch(() => setBackendStatusBadge('offline', 'Backend: sin conexion'));
    });
}

function isRecordModalOpen() {
    const modal = $('qaRecordModal');
    return !!modal && !modal.hasAttribute('hidden');
}

function isMatchesModalOpen() {
    const modal = $('qaMatchesModal');
    return !!modal && !modal.hasAttribute('hidden');
}

function isExportModalOpen() {
    const modal = $('qaExportModal');
    return !!modal && !modal.hasAttribute('hidden');
}

function getBookEngineCode(row) {
    const sourceFile = String(row?.source_file ?? '').trim();
    if (sourceFile) return sourceFile.replace(/\.xlsx$/i, '');

    const engineModel = String(row?.engine_model ?? '').trim();
    if (!engineModel) return '';

    return engineModel
        .replace(/^engine_/i, '')
        .replace(/\.json$/i, '')
        .trim();
}

function openAnalisisForRow(row) {
    if (!row) return;

    const book = String(row?.engine_model ?? '').trim();
    const record = String(row?.pn_final ?? row?.['PART NO.'] ?? row?.pn ?? '').trim();
    if (!record) {
        alert('El registro no tiene PN/PART NO para abrir analisis.');
        return;
    }

    const params = new URLSearchParams();
    if (book) params.set('engine', book);
    params.set('record', record);

    const targetUrl = `analista_02.html?${params.toString()}`;
    window.open(targetUrl, '_blank', 'noopener');
}


function getModalMatchesByPn(row) {
    const pn = normModalMatch(row?.['PART NO.'] ?? row?.pn ?? '');
    if (!pn) return [];
    return state.allData
        .filter(item => normModalMatch(item?.['PART NO.'] ?? item?.pn ?? '') === pn)
        .map(item => ({
            revisionKey: getRevisionKey(item),
            page: String(item?.['Source Page'] ?? ''),
            pos: String(item?.POS ?? ''),
            id: String(item?.ID ?? ''),
            partNumber: String(item?.['PART NO.'] ?? item?.pn ?? ''),
            estado: String(item?.qa_revision_estado ?? ''),
            designationFinal: String(item?.designation_final ?? item?.DESIGNATION ?? ''),
            weightFinal: String(item?.weight_final ?? ''),
            measurementFinal: String(item?.measure_final ?? item?.measurement_final ?? ''),
            fgsCodeDescription: String(item?.fgs_code_description ?? ''),
            accion: String(item?.qa_revision_accion ?? ''),
            book: getBookEngineCode(item)
        }));
}

function syncRecordModalBookFilter(row, matches, selectId = 'qaModalMatchesBookFilter') {
    const select = $(selectId);
    if (!(select instanceof HTMLSelectElement)) return;

    const currentBook = getBookEngineCode(row);
    const previousValue = String(select.value || '__current__');
    const books = [...new Set(matches.map(item => String(item.book || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));

    const options = [
        { value: '__current__', label: currentBook ? `Libro actual (${currentBook})` : 'Libro actual' },
        { value: '__all__', label: 'Todos los libros' },
        ...books.map(book => ({ value: book, label: book }))
    ];

    select.innerHTML = options
        .map(opt => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`)
        .join('');

    const hasPrevious = options.some(opt => opt.value === previousValue);
    select.value = hasPrevious ? previousValue : '__current__';
}
function getRowByRevisionKey(revisionKey) {
    return state.allData.find(item => getRevisionKey(item) === revisionKey);
}

function selectRevisionRowByKey(revisionKey) {
    const key = String(revisionKey || '').trim();
    if (!key) return false;
    const row = getRowByRevisionKey(key);
    if (!row) return false;
    state.selectedRevisionRowKey = key;
    refreshSelectedRowVisual();
    renderSelectedRowPosPanel(row);
    renderSelectedRowPosTop(row);
    document.dispatchEvent(new CustomEvent('qa:selected-row-changed', {
        detail: { revisionKey: key }
    }));
    return true;
}

function resolveRowForShellRecordModal(request = {}) {
    const requestedRevisionKey = String(request?.revisionKey || '').trim();
    if (requestedRevisionKey) {
        const byRevisionKey = getRowByRevisionKey(requestedRevisionKey);
        if (byRevisionKey) return byRevisionKey;
    }

    const requestedId = String(request?.id || '').trim().toLowerCase();
    const requestedRecord = String(request?.record || '').trim().toLowerCase();
    const requestedBook = resolveBookValue(request?.engine || request?.book || '').trim().toLowerCase();

    return state.allData.find(item => {
        const itemBook = String(item?.engine_model ?? '').trim().toLowerCase();
        if (requestedBook && itemBook !== requestedBook) return false;

        const itemId = String(item?.ID ?? '').trim().toLowerCase();
        const itemPnFinal = String(item?.pn_final ?? '').trim().toLowerCase();
        const itemPartNo = String(item?.['PART NO.'] ?? item?.pn ?? '').trim().toLowerCase();

        if (requestedId && itemId === requestedId) return true;
        if (requestedRecord && (itemPnFinal === requestedRecord || itemPartNo === requestedRecord)) return true;
        return false;
    }) || null;
}

function openRecordModalFromShell(request = {}) {
    if (!Array.isArray(state.allData) || state.allData.length === 0) {
        pendingShellRecordModalRequest = { ...request };
        return false;
    }

    const row = resolveRowForShellRecordModal(request);
    if (!row) return false;

    const revisionKey = getRevisionKey(row);
    if (!revisionKey) return false;

    const targetBook = String(row?.engine_model ?? '').trim();
    const targetPage = normalizePageNumber(row?.['Source Page']);

    if (targetBook) {
        applyBookSelection(targetBook, {
            pageValue: targetPage,
            fallbackToFirstAvailablePage: true,
            render: true,
            updatePdf: true
        });
    }

    const moved = focusRevisionRowInMainTable(revisionKey);
    if (!moved) {
        selectRevisionRowByKey(revisionKey);
    }

    setRightPanelTab('pdf');
    const requestedMode = String(request?.mode || '').trim().toLowerCase();
    if (requestedMode === 'export') {
        openExportModal(revisionKey);
    } else {
        openRecordModal(revisionKey);
    }
    pendingShellRecordModalRequest = null;
    return true;
}

window.miluOpenPdfRecordModal = (request = {}) => openRecordModalFromShell(request);

async function refreshDataFromShellUpdate(request = {}) {
    if (!Array.isArray(state.allData) || state.allData.length === 0) return false;

    const selectedRevisionKeyBefore = String(state.selectedRevisionRowKey || '').trim();
    const currentPageBefore = Number(state.currentPage || 1);
    const recordModal = $('qaRecordModalForm');
    const openModalRevisionKey = recordModal instanceof HTMLFormElement
        ? String(recordModal.dataset.revisionKey || '').trim()
        : '';

    const requestedId = String(request?.id || '').trim().toLowerCase();
    const requestedBook = String(request?.engine || request?.book || '').trim().toLowerCase();

    const freshData = await loadPartitionedEngineData();
    if (!Array.isArray(freshData)) return false;

    state.allData = freshData;
    assignRevisionKeys(state.allData);
    applyRevisionDataToRows(state.allData);

    state.currentPage = currentPageBefore;
    renderTable();
    renderPagination();

    let targetRevisionKey = '';
    if (requestedId) {
        const requestedRow = state.allData.find((row) => {
            const rowId = String(row?.ID ?? '').trim().toLowerCase();
            const rowBook = String(row?.engine_model ?? '').trim().toLowerCase();
            if (requestedBook && rowBook !== requestedBook) return false;
            return rowId === requestedId;
        });
        targetRevisionKey = requestedRow ? getRevisionKey(requestedRow) : '';
    }

    if (!targetRevisionKey && selectedRevisionKeyBefore) {
        const selectedRow = getRowByRevisionKey(selectedRevisionKeyBefore);
        if (selectedRow) targetRevisionKey = selectedRevisionKeyBefore;
    }

    if (targetRevisionKey) {
        state.selectedRevisionRowKey = targetRevisionKey;
        refreshSelectedRowVisual();
        document.dispatchEvent(new CustomEvent('qa:selected-row-changed', {
            detail: { revisionKey: targetRevisionKey }
        }));
    } else {
        syncSideRecordFormWithSelection();
    }

    if (openModalRevisionKey) {
        const modalRow = getRowByRevisionKey(openModalRevisionKey);
        if (modalRow) fillRecordModal(modalRow, openModalRevisionKey);
    }

    return true;
}

window.miluRefreshPdfData = async (request = {}) => {
    try {
        return await refreshDataFromShellUpdate(request);
    } catch (error) {
        console.warn('No se pudo refrescar QA PDF tras actualización externa:', error);
        return false;
    }
};

function normModalMatch(value) {
    return String(value ?? '').trim().toLowerCase();
}

function pageSortValue(page) {
    const raw = String(page ?? '').trim();
    const numeric = Number(raw.replace(/[^0-9]/g, ''));
    return Number.isFinite(numeric) && !Number.isNaN(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function formatModalExportValue(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch (_) {
            return String(value);
        }
    }
    return String(value);
}

function normalizeComparisonValue(value) {
    return formatModalExportValue(value)
        .replace(/\s+/g, ' ')
        .trim();
}

function formatExportVersionStamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}.${hour}${minute}`;
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeModelTypeForExport(row) {
    const rawModel = String(row?.model ?? '').trim();
    if (rawModel) return rawModel;

    const engineModel = String(row?.engine_model ?? '').trim();
    if (!engineModel) return '';
    return engineModel.replace('4000', '').trim();
}

function normalizePageLabelForExport(row) {
    const book = String(row?.engine_model ?? '').trim();
    const pageRaw = String(row?.['Source Page'] ?? '').trim();
    if (!book || !pageRaw) return '';
    const digits = pageRaw.replace(/[^0-9]/g, '');
    const page = digits ? digits.padStart(4, '0') : pageRaw;
    return `${book}-${page}`;
}

function getPreferredRowsForPn(row) {
    const currentPn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
    if (!currentPn) return [];
    const normalizedPn = normModalMatch(currentPn);
    return state.allData.filter(item => normModalMatch(item?.['PART NO.'] ?? item?.pn ?? '') === normalizedPn);
}

function getMiluNewRowForPn(row) {
    const currentPn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
    if (!currentPn || !Array.isArray(state.miluNewData) || !state.miluNewData.length) return null;
    const normalizedPn = normModalMatch(currentPn);
    return state.miluNewData.find(item => normModalMatch(item?.pn ?? '') === normalizedPn) || null;
}

function getArticleHierarchyKind(row) {
    const hierarchyRaw = String(row?.sust_hierarchie ?? '').trim().toUpperCase();
    const hierarchy = hierarchyRaw.replace(/\s+/g, ' ').replace(/[._-]/g, ' ');
    if (hierarchy === 'SUPERSEDED') return 'superseded';
    if (hierarchy === 'NEW') return 'new';
    // Default to New to ensure uncategorized rows are still shown.
    return 'new';
}

function isSupersededArticle(row) {
    return getArticleHierarchyKind(row) === 'superseded';
}

function uniqueSortedValues(values, compareAsNumeric = false) {
    const unique = [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))];
    return unique.sort((a, b) => {
        if (compareAsNumeric) {
            return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
        }
        return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });
}

function parseWeightNumber(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;

    const normalized = text.replace(/\s+/g, ' ');
    const match = normalized.match(/(\d+[\d.,]*)\s*(KGM|KG|G)\b/i);
    if (!match) return null;

    let numericText = match[1].replace(/\s/g, '');
    if (numericText.includes(',') && numericText.includes('.')) {
        numericText = numericText.replace(/\./g, '').replace(',', '.');
    } else if (numericText.includes(',')) {
        numericText = numericText.replace(',', '.');
    }

    const parsed = Number(numericText);
    if (!Number.isFinite(parsed)) return null;

    const unit = match[2].toUpperCase();
    if (unit === 'G') return parsed / 1000;
    return parsed;
}

function resolveWeightForExport(row) {
    const gesaWeight = Number(row?.weight_gesa);
    if (Number.isFinite(gesaWeight)) return gesaWeight;

    const finalWeight = parseWeightNumber(getRowValueForColumn(row, 'weight_final', ''));
    if (Number.isFinite(finalWeight)) return finalWeight;

    return parseWeightNumber(row?.WEIGHT);
}

function formatWeightTextForExport(row, weightValue) {
    if (!Number.isFinite(weightValue)) {
        return String(getRowValueForColumn(row, 'weight_final', '') || row?.WEIGHT || '').trim();
    }
    const unit = String(row?.units || 'KGM').trim() || 'KGM';
    return `${weightValue.toFixed(3)} ${unit}`;
}

function resolveMeasurementForExport(row) {
    const gesaMeasurement = String(row?.dimensions_gesa ?? '').trim().replace(/\s{2,}/g, ' ');
    if (gesaMeasurement) return gesaMeasurement;

    let rawMeasurement = String(row?.['MEASUREMENT / STANDARD'] ?? '').trim().replace(/\s{2,}/g, ' ');
    const norma = String(row?.norma ?? '').trim();
    if (rawMeasurement && norma) {
        rawMeasurement = rawMeasurement.replace(new RegExp(`\\b${escapeRegExp(norma)}\\b`, 'ig'), '').trim();
    }
    if (rawMeasurement) return rawMeasurement;

    return String(row?.measure_final ?? row?.measurement_final ?? '').trim().replace(/\s{2,}/g, ' ');
}

function firstNonEmptyValue(rows, getter) {
    for (const row of rows) {
        const value = getter(row);
        if (value != null && String(value).trim() !== '') return value;
    }
    return null;
}

function mergeImageValues(primaryValue, secondaryValue) {
    const merged = [];
    const seen = new Set();

    const addValue = (value) => {
        const parts = String(value ?? '')
            .split(',')
            .map(part => part.trim())
            .filter(Boolean);
        for (const part of parts) {
            const key = normModalMatch(part);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(part);
        }
    };

    addValue(primaryValue);
    addValue(secondaryValue);
    return merged.join(', ');
}

function buildSyntheticNewExportRow(row) {
    const matches = getPreferredRowsForPn(row);
    if (!matches.length) return null;
    if (isSupersededArticle(row)) return null;

    const weightValue = resolveWeightForExport(row);
    const pageLabels = uniqueSortedValues(matches.map(item => normalizePageLabelForExport(item)), true);
    const modelTypes = uniqueSortedValues(matches.map(item => normalizeModelTypeForExport(item)), true);
    const engineModels = uniqueSortedValues(matches.map(item => String(item?.engine_model ?? '').trim()), true);
    const categoryValues = uniqueSortedValues(matches.map(item => String(item?.categoria ?? item?.atributo ?? item?.exp_categorias ?? '').trim()));
    const imageValue = firstNonEmptyValue([row, ...matches], item => item?.exp_imagenes || item?.ruta_foto || '');
    const routeFotoValue = firstNonEmptyValue([row, ...matches], item => item?.ruta_foto || '');
    const exportImagesValue = mergeImageValues(routeFotoValue, imageValue);
    const normalizedPn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
    const hierarchy = String(row?.sust_hierarchie ?? '').trim();
    const supersededList = String(row?.sust_superseded_list ?? '').trim();
    const hasSubstitution = hierarchy !== '' || supersededList !== '' || String(row?.sust_new_part_number ?? '').trim() !== '';

    return {
        Id: String(row?.ID ?? '').trim(),
        fecha_version: formatExportVersionStamp(),
        POS: String(row?.POS ?? '').trim(),
        designation: String(getRowValueForColumn(row, 'designation_final', '')).trim(),
        engine: String(row?.engine ?? '').trim() || '4000',
        model_type: modelTypes.join(', '),
        type: '',
        pn: normalizedPn,
        nsn: String(row?.nsn ?? '').trim(),
        GESA_NORM: String(row?.norma ?? '').trim(),
        GESA_NORMALIZADO: String(row?.normalizado ?? '').trim(),
        fg_code: row?.fg_code ?? '',
        fg_description: String(row?.fgs_description ?? '').trim(),
        fg_code_description: String(row?.fgs_code_description ?? '').trim(),
        weight: Number.isFinite(weightValue) ? Number(weightValue.toFixed(3)) : '',
        weight_txt: formatWeightTextForExport(row, weightValue),
        measurement: resolveMeasurementForExport(row),
        TIPOARTICULO: String(row?.TIPOARTICULO ?? '').trim() || 'piezas',
        PAG: pageLabels.join(', '),
        BOM_no: String(row?.['BOM-No.'] ?? '').trim(),
        esquema_general: '',
        exp_motor: engineModels.join(', '),
        exp_categorias: categoryValues.join(', '),
        atributo: categoryValues.join(', '),
        SUST_TIPO: hierarchy || null,
        new_pn_relacionado: hierarchy === 'New'
            ? normalizedPn
            : (String(row?.sust_new_part_number ?? '').trim() || null),
        old_pn_relacionados: supersededList || null,
        EN_EXCEL_SUSTITUCION: hasSubstitution ? 'SI' : '',
        ruta_foto: routeFotoValue,
        exp_imagenes: exportImagesValue
    };
}

function buildSyntheticSupersededExportRow(row) {
    const matches = getPreferredRowsForPn(row);
    if (!matches.length) return null;
    if (!isSupersededArticle(row)) return null;

    const hierarchy = String(row?.sust_hierarchie ?? '').trim();
    const relatedNewPn = String(row?.sust_new_part_number ?? '').trim()
        || String(row?.['New Part Number'] ?? '').trim();
    if (!relatedNewPn && hierarchy !== 'Superseded') return null;

    const weightValue = resolveWeightForExport(row);
    const pageLabels = uniqueSortedValues(matches.map(item => normalizePageLabelForExport(item)), true);
    const modelTypes = uniqueSortedValues(matches.map(item => normalizeModelTypeForExport(item)), true);
    const engineModels = uniqueSortedValues(matches.map(item => String(item?.engine_model ?? '').trim()), true);
    const categoryValues = uniqueSortedValues(matches.map(item => String(item?.categoria ?? item?.atributo ?? item?.exp_categorias ?? '').trim()));
    const imageValue = firstNonEmptyValue([row, ...matches], item => item?.exp_imagenes || item?.ruta_foto || '');
    const routeFotoValue = firstNonEmptyValue([row, ...matches], item => item?.ruta_foto || '');
    const exportImagesValue = mergeImageValues(routeFotoValue, imageValue);
    const normalizedPn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
    const resolvedRelatedPn = relatedNewPn || normalizedPn;
    const hasSubstitution = hierarchy === 'Superseded' || resolvedRelatedPn !== '';

    return {
        Id: String(row?.ID ?? '').trim(),
        fecha_version: formatExportVersionStamp(),
        POS: String(row?.POS ?? '').trim(),
        designation: String(getRowValueForColumn(row, 'designation_final', '')).trim(),
        engine: String(row?.engine ?? '').trim() || '4000',
        model_type: modelTypes.join(', '),
        type: '',
        pn: normalizedPn,
        nsn: String(row?.nsn ?? '').trim(),
        GESA_NORM: String(row?.norma ?? '').trim(),
        GESA_NORMALIZADO: String(row?.normalizado ?? '').trim(),
        fg_code: row?.fg_code ?? '',
        fg_description: String(row?.fgs_description ?? '').trim(),
        fg_code_description: String(row?.fgs_code_description ?? '').trim(),
        weight: Number.isFinite(weightValue) ? Number(weightValue.toFixed(3)) : '',
        weight_txt: formatWeightTextForExport(row, weightValue),
        measurement: resolveMeasurementForExport(row),
        TIPOARTICULO: String(row?.TIPOARTICULO ?? '').trim() || 'piezas',
        PAG: pageLabels.join(', '),
        BOM_no: String(row?.['BOM-No.'] ?? '').trim(),
        esquema_general: '',
        exp_motor: engineModels.join(', '),
        exp_categorias: categoryValues.join(', '),
        atributo: categoryValues.join(', '),
        SUST_TIPO: hierarchy || 'Superseded',
        new_pn_relacionado: resolvedRelatedPn || null,
        old_pn_relacionados: null,
        EN_EXCEL_SUSTITUCION: hasSubstitution ? 'SI' : '',
        ruta_foto: routeFotoValue,
        exp_imagenes: exportImagesValue,
        vinculo: resolvedRelatedPn ? `milu-naval.mystagingwebsite.com/producto/${resolvedRelatedPn}` : ''
    };
}

function setModalSectionVisibility(tableBodyElement, visible) {
    const section = tableBodyElement?.closest('section.qa-modal-related');
    if (section instanceof HTMLElement) {
        section.hidden = false;
    }
}

function getModalExportColumns(matches) {
    const columns = [];
    const seen = new Set();
    for (const item of matches) {
        for (const key of Object.keys(item || {})) {
            if (seen.has(key)) continue;
            seen.add(key);
            columns.push(key);
        }
    }
    return columns;
}

function renderRecordModalExport(row, options = {}) {
    const {
        headRowId = 'qaModalExportHeadRow',
        bodyId = 'qaModalExportBody',
        countId = 'qaModalExportCount',
        onlyDiffToggleId = 'qaModalExportOnlyDiffToggle'
    } = options;
    const headRow = $(headRowId);
    const body = $(bodyId);
    const count = $(countId);
    const onlyDiffToggle = $(onlyDiffToggleId);
    const onlyMismatchFields = onlyDiffToggle instanceof HTMLInputElement && onlyDiffToggle.checked;
    if (!(headRow instanceof HTMLElement) || !(body instanceof HTMLElement)) return;

    const syntheticRow = buildSyntheticNewExportRow(row);
    if (!syntheticRow) {
        headRow.innerHTML = '<th>Sin datos</th>';
        body.innerHTML = '<tr><td>No se pudo determinar el codigo PN del registro.</td></tr>';
        if (count) count.textContent = '0 registros';
        setModalSectionVisibility(body, false);
        return;
    }

    const sourceMatches = getPreferredRowsForPn(row);
    const miluNewRow = getMiluNewRowForPn(row);
    const matches = [
        ...(miluNewRow ? [{ origen: 'MILU_New_v506', ...miluNewRow }] : []),
        { origen: 'Synthetic', ...syntheticRow }
    ];
    const sourceLabels = matches.map(item => String(item?.origen || '-'));
    const fields = [...SYNTHETIC_NEW_EXPORT_COLUMNS];
    const diffColumns = new Set();
    const volatileComparisonColumns = new Set(['Id', 'fecha_version']);
    const warningComparisonColumns = new Set(['exp_categorias', 'atributo']);
    if (matches.length >= 2) {
        const firstRow = matches[0];
        const lastRow = matches[matches.length - 1];
        fields.forEach(col => {
            if (volatileComparisonColumns.has(col)) return;
            const firstValue = normalizeComparisonValue(firstRow?.[col]);
            const lastValue = normalizeComparisonValue(lastRow?.[col]);
            if (firstValue !== lastValue) diffColumns.add(col);
        });
    }
    headRow.innerHTML = ['<th>Campo</th>', ...sourceLabels.map(label => `<th>${escapeHtml(label)}</th>`)].join('');

    const visibleFields = onlyMismatchFields
        ? fields.filter(field => diffColumns.has(field))
        : fields;

    if (!visibleFields.length) {
        body.innerHTML = `<tr><td colspan="${sourceLabels.length + 1}">No hay campos no coincidentes para este registro.</td></tr>`;
        if (count) {
            const comparedLabel = miluNewRow ? '2 registros comparados (v506 + synthetic)' : '1 registro (solo synthetic; sin match en v506)';
            count.textContent = `${comparedLabel} · ${sourceMatches.length} aparicion${sourceMatches.length === 1 ? '' : 'es'} · 0 campos no coincidentes`;
        }
        setModalSectionVisibility(body, true);
        return;
    }

    body.innerHTML = visibleFields.map((field) => {
        const valueCells = matches.map((item, rowIndex) => {
            const rawValue = formatModalExportValue(item?.[field]);
            const displayValue = rawValue || '-';
            const isComparedEdgeRow = rowIndex === 0 || rowIndex === matches.length - 1;
            const isFieldMismatch = isComparedEdgeRow && diffColumns.has(field);
            const isWarningFieldMismatch = isFieldMismatch && warningComparisonColumns.has(field);
            const isCriticalFieldMismatch = isFieldMismatch && !warningComparisonColumns.has(field);
            const tdClasses = [
                isCriticalFieldMismatch ? 'qa-modal-cell-diff' : '',
                isWarningFieldMismatch ? 'qa-modal-cell-diff-warn' : ''
            ].filter(Boolean).join(' ');
            return `<td class="${tdClasses}" title="${escapeHtml(rawValue)}">${escapeHtml(displayValue)}</td>`;
        }).join('');

        return `<tr><td>${escapeHtml(field)}</td>${valueCells}</tr>`;
    }).join('');

    if (count) {
        const comparedLabel = miluNewRow ? '2 registros comparados (v506 + synthetic)' : '1 registro (solo synthetic; sin match en v506)';
        const fieldLabel = onlyMismatchFields
            ? `${visibleFields.length} campo${visibleFields.length === 1 ? '' : 's'} no coincidente${visibleFields.length === 1 ? '' : 's'}`
            : `${fields.length} campos`;
        count.textContent = `${comparedLabel} · ${sourceMatches.length} aparicion${sourceMatches.length === 1 ? '' : 'es'} · ${fieldLabel}`;
    }
    setModalSectionVisibility(body, true);
}

function renderRecordModalSuperseded(row, options = {}) {
    const {
        headRowId = 'qaModalSupersededHeadRow',
        bodyId = 'qaModalSupersededBody',
        countId = 'qaModalSupersededCount'
    } = options;
    const headRow = $(headRowId);
    const body = $(bodyId);
    const count = $(countId);
    if (!(headRow instanceof HTMLElement) || !(body instanceof HTMLElement)) return;

    const syntheticRow = buildSyntheticSupersededExportRow(row);
    if (!syntheticRow) {
        headRow.innerHTML = '<th>Sin datos</th>';
        body.innerHTML = '<tr><td>El registro no tiene datos suficientes para reconstruir MILU_Superseded.</td></tr>';
        if (count) count.textContent = '0 registros';
        setModalSectionVisibility(body, false);
        return;
    }

    const sourceMatches = getPreferredRowsForPn(row);
    const columns = SYNTHETIC_SUPERSEDED_EXPORT_COLUMNS.filter(col => Object.prototype.hasOwnProperty.call(syntheticRow, col));
    headRow.innerHTML = '<th>Campo</th><th>Synthetic</th>';

    body.innerHTML = columns.map(col => {
        const rawValue = formatModalExportValue(syntheticRow?.[col]);
        const displayValue = rawValue || '-';
        return `<tr><td>${escapeHtml(col)}</td><td title="${escapeHtml(rawValue)}">${escapeHtml(displayValue)}</td></tr>`;
    }).join('');

    if (count) count.textContent = `1 registro reconstruido · ${sourceMatches.length} aparicion${sourceMatches.length === 1 ? '' : 'es'}`;
    setModalSectionVisibility(body, true);
}

function renderRecordModalMatches(row, currentRevisionKey, options = {}) {
    const {
        bodyId = 'qaModalMatchesBody',
        countId = 'qaModalMatchesCount',
        bookFilterId = 'qaModalMatchesBookFilter',
        showAction = true
    } = options;
    const body = $(bodyId);
    const count = $(countId);
    if (!(body instanceof HTMLElement)) return;

    const matchesByPn = getModalMatchesByPn(row);
    const currentBook = normModalMatch(getBookEngineCode(row));

    const emptyColspan = 5;

    if (!matchesByPn.length) {
        body.innerHTML = `<tr><td colspan="${emptyColspan}">No se pudo determinar PN/libro del registro.</td></tr>`;
        if (count) count.textContent = '0 coincidencias';
        setModalSectionVisibility(body, false);
        return;
    }

    syncRecordModalBookFilter(row, matchesByPn, bookFilterId);
    const selectedBookFilter = String($(bookFilterId)?.value || '__current__');

    const filteredMatches = matchesByPn.filter(item => {
        const itemBook = normModalMatch(item.book);
        if (selectedBookFilter === '__all__') return true;
        if (selectedBookFilter === '__current__') return !!currentBook && itemBook === currentBook;
        return itemBook === normModalMatch(selectedBookFilter);
    });

    const matches = filteredMatches
        .sort((a, b) => {
            const byBook = String(a.book || '').localeCompare(String(b.book || ''), 'es', { numeric: true, sensitivity: 'base' });
            if (byBook !== 0) return byBook;
            const byPage = pageSortValue(a.page) - pageSortValue(b.page);
            if (byPage !== 0) return byPage;
            const byPos = a.pos.localeCompare(b.pos, 'es', { numeric: true, sensitivity: 'base' });
            if (byPos !== 0) return byPos;
            return a.id.localeCompare(b.id, 'es', { numeric: true, sensitivity: 'base' });
        });

    if (!matches.length) {
        body.innerHTML = `<tr><td colspan="${emptyColspan}">Sin coincidencias para el filtro seleccionado.</td></tr>`;
        if (count) count.textContent = '0 coincidencias';
        setModalSectionVisibility(body, false);
        return;
    }

    body.innerHTML = matches.map(item => {
        const isCurrent = item.revisionKey === currentRevisionKey;
        const revisionKeyAttr = escapeHtml(String(item.revisionKey || ''));
        const normalizedEstado = normModalMatch(item.estado);
        const isOkStatus = normalizedEstado === 'ok';
        const sideStatusClass = isOkStatus ? 'ok' : 'ko';
        const sideStatusLabel = isOkStatus ? 'OK' : 'KO';
        return `<tr class="${isCurrent ? 'qa-modal-related-current' : ''}" data-revision-key="${revisionKeyAttr}" title="Doble click para ir al registro en tabla principal">`
            + `<td>${escapeHtml(item.book || '-')}</td>`
            + `<td>${escapeHtml(item.page || '-')}</td>`
            + `<td>${escapeHtml(item.pos || '-')}</td>`
            + (showAction
                ? `<td>${escapeHtml(item.designationFinal || '-')}</td><td>${escapeHtml(item.accion || '-')}</td>`
                : `<td class="qa-side-match-part-number">${escapeHtml(item.partNumber || '-')}</td><td><span class="qa-side-match-st ${sideStatusClass}">${sideStatusLabel}</span></td>`)
            + '</tr>';
    }).join('');

    if (count) count.textContent = `${matches.length} coincidencias`;
    setModalSectionVisibility(body, true);
}

function getQaErrorDefinitionMap() {
    return new Map((state.qaErrorCheckDefinitions || [])
        .map(def => [String(def?.code || '').trim(), String(def?.label || def?.code || '').trim()])
        .filter(([code]) => code));
}

function buildRowActiveQaErrors(row, activeCodes) {
    return evaluateRowQaChecks(row, activeCodes);
}

function invalidateRowActiveQaErrors(row) {
    if (!row || typeof row !== 'object') return;
    delete row.__qaChecksActive;
}

function applyActiveQaErrorsToClientRows(activeCodes) {
    state.allData.forEach(row => {
        row.__qaChecksActive = buildRowActiveQaErrors(row, activeCodes);
    });
}

function applyActiveQaErrorsToSubset(activeCodes, rows) {
    (rows || []).forEach(row => {
        row.__qaChecksActive = buildRowActiveQaErrors(row, activeCodes);
    });
}

function buildQaStatsFromRows(rows, activeCodes) {
    const activeSet = new Set((activeCodes || []).map(code => String(code || '').trim()).filter(Boolean));
    const totals = {
        totalRows: 0,
        rowsWithErrors: 0,
        rowsOk: 0,
        severityCount: { critical: 0, warning: 0, none: 0 },
        codeCount: {}
    };

    (rows || []).forEach(row => {
        totals.totalRows += 1;
        const activeErrors = buildRowActiveQaErrors(row, activeSet);
        const hasErrors = Array.isArray(activeErrors?.codes) && activeErrors.codes.length > 0;
        if (hasErrors) totals.rowsWithErrors += 1;
        else totals.rowsOk += 1;

        if (hasErrors) totals.severityCount.critical += 1;
        else totals.severityCount.none += 1;

        (activeErrors.codes || []).forEach(code => {
            const normalizedCode = String(code || '').trim();
            if (!normalizedCode) return;
            totals.codeCount[normalizedCode] = Number(totals.codeCount[normalizedCode] || 0) + 1;
        });
    });

    return totals;
}

function renderRecordQaErrors(row, options = {}) {
    const summaryId = options.summaryId || 'qaModalErrorsSummary';
    const listId = options.listId || 'qaModalErrorsList';
    const summary = $(summaryId);
    const list = $(listId);
    if (!(summary instanceof HTMLElement) || !(list instanceof HTMLElement)) return;

    const activeCodes = state.activeQaErrorChecks instanceof Set ? state.activeQaErrorChecks : new Set();
    const type = getRowErrorType(row, { activeCodes }) || 'none';
    const definitionMap = getQaErrorDefinitionMap();
    const sourceErrors = row?.__qaChecksActive && row.__qaChecksActive.signature === getQaActiveSignature([...activeCodes])
        ? row.__qaChecksActive
        : buildRowActiveQaErrors(row, [...activeCodes]);
    const rawIssues = Array.isArray(sourceErrors?.issues) ? sourceErrors.issues : [];
    const filteredIssues = rawIssues.filter(issue => {
        const code = String(issue?.code || '').trim();
        return code && activeCodes.has(code);
    });

    const fallbackCodes = getRowErrors(row, { activeCodes });
    const issueItems = filteredIssues.length > 0
        ? filteredIssues.map(issue => {
            const code = String(issue?.code || '').trim();
            const fields = Array.isArray(issue?.fields) ? issue.fields.filter(Boolean).join(', ') : '';
            const label = definitionMap.get(code) || code;
            const message = String(issue?.message || '').trim() || label;
            const severity = type === 'critical' ? 'critical' : String(issue?.severity || type || 'warning').trim();
            const fieldHtml = fields ? `<span class="qa-record-errors-fields">${escapeHtml(fields)}</span>` : '';
            return `<li class="qa-record-errors-item is-${escapeHtml(severity)}">
                <div class="qa-record-errors-item-main">
                    <span class="qa-record-errors-code">${escapeHtml(label)}</span>
                    ${fieldHtml}
                </div>
                <span class="qa-record-errors-message">${escapeHtml(message)}</span>
            </li>`;
        })
        : fallbackCodes.map(code => {
            const label = definitionMap.get(code) || code;
            return `<li class="qa-record-errors-item is-${escapeHtml(type === 'critical' ? 'critical' : 'warning')}">
                <div class="qa-record-errors-item-main">
                    <span class="qa-record-errors-code">${escapeHtml(label)}</span>
                </div>
                <span class="qa-record-errors-message">Error activo en este registro.</span>
            </li>`;
        });

    if (issueItems.length === 0) {
        summary.innerHTML = '<span class="qa-record-errors-pill is-ok">Sin errores activos</span>';
        list.innerHTML = '<li class="qa-record-errors-empty">Este registro no tiene errores para las comprobaciones activas.</li>';
        return;
    }

    const severityLabel = type === 'critical' ? 'Criticos' : 'Avisos';
    summary.innerHTML = `<span class="qa-record-errors-pill is-${escapeHtml(type)}">${issueItems.length} ${escapeHtml(severityLabel)}</span>`;
    list.innerHTML = issueItems.join('');
}

function fillRecordModal(row, revisionKey) {
    const form = $('qaRecordModalForm');
    if (!(form instanceof HTMLFormElement)) return;

    form.dataset.revisionKey = revisionKey;
    $('qaModalId').value = String(row?.ID ?? '');
    $('qaModalPn').value = String(row?.['PART NO.'] ?? row?.pn ?? '');
    $('qaModalBook').value = String(row?.engine_model ?? '');
    $('qaModalPage').value = String(row?.['Source Page'] ?? '');
    $('qaModalPos').value = String(row?.pos_final ?? '');
    $('qaModalGesa').value = String(row?.gesa ?? '');
    $('qaModalNormalizado').value = String(row?.normalizado ?? '');
    $('qaModalSustHierarchie').value = String(row?.sust_hierarchie ?? '');
    $('qaModalHasImg').value = String(row?.has_img ?? '');
    $('qaModalEnWeb').value = String(row?.EN_WEB ?? '');

    $('qaModalRevisionEstado').value = normalizeEstadoToNew(row?.qa_revision_estado);
    $('qaModalRevisionAccion').value = normalizeAccionToNew(row?.qa_revision_accion);
    $('qaModalPnFinal').value = String(row?.pn_final ?? '');
    $('qaModalDesignationFinal').value = String(row?.designation_final ?? '');
    $('qaModalModelType').value = String(row?.model_final ?? '');
    $('qaModalQty').value = String(row?.qty_final ?? '');
    $('qaModalUnits').value = String(row?.qty_units_final ?? '');
    $('qaModalWeightFinal').value = String(row?.weight_final ?? '');
    $('qaModalFn').value = String(row?.fn_final ?? '');
    $('qaModalMeasurementFinal').value = String(row?.measure_final ?? row?.measurement_final ?? '');
    $('qaModalNorma').value = String(row?.norma_final ?? '');

    renderRecordQaErrors(row);
    renderRecordModalMatches(row, revisionKey);
    updateExportModalHeader(row);

    const status = $('qaRecordModalStatus');
    if (status) status.textContent = '';
}

function fillSideRecordForm(row, revisionKey) {
    const form = $('qaSideRecordForm');
    if (!(form instanceof HTMLFormElement)) return;

    form.dataset.revisionKey = revisionKey;
    $('qaSideId').value = String(row?.ID ?? '');
    $('qaSidePn').value = String(row?.['PART NO.'] ?? row?.pn ?? '');
    $('qaSideBook').value = String(row?.engine_model ?? '');
    $('qaSidePage').value = String(row?.['Source Page'] ?? '');
    $('qaSidePos').value = String(row?.pos_final ?? '');
    $('qaSideGesa').value = String(row?.gesa ?? '');
    $('qaSideNormalizado').value = String(row?.normalizado ?? '');
    $('qaSideSustHierarchie').value = String(row?.sust_hierarchie ?? '');
    $('qaSideHasImg').value = String(row?.has_img ?? '');
    $('qaSideEnWeb').value = String(row?.EN_WEB ?? '');

    $('qaSideRevisionEstado').value = normalizeEstadoToNew(row?.qa_revision_estado);
    $('qaSideRevisionAccion').value = normalizeAccionToNew(row?.qa_revision_accion);
    $('qaSidePnFinal').value = String(row?.pn_final ?? '');
    $('qaSideDesignationFinal').value = String(row?.designation_final ?? '');
    $('qaSideModelType').value = String(row?.model_final ?? '');
    $('qaSideQty').value = String(row?.qty_final ?? '');
    $('qaSideUnits').value = String(row?.qty_units_final ?? '');
    $('qaSideWeightFinal').value = String(row?.weight_final ?? '');
    $('qaSideFn').value = String(row?.fn_final ?? '');
    $('qaSideMeasurementFinal').value = String(row?.measure_final ?? row?.measurement_final ?? '');
    $('qaSideNorma').value = String(row?.norma_final ?? '');

    const sideLabel = $('qaSideLabel');
    if (sideLabel) {
        sideLabel.textContent = `${String(row?.engine_model ?? '-')} • pág ${String(row?.['Source Page'] ?? '-')} • ID ${String(row?.ID ?? '-')}`;
    }
    const exportLabel = $('qaSideExportLabel');
    if (exportLabel) {
        exportLabel.textContent = `${String(row?.engine_model ?? '-')} • pág ${String(row?.['Source Page'] ?? '-')} • ID ${String(row?.ID ?? '-')}`;
    }

    renderRecordQaErrors(row, {
        summaryId: 'qaSideErrorsSummary',
        listId: 'qaSideErrorsList'
    });
    renderRecordModalMatches(row, revisionKey, {
        bodyId: 'qaSideMatchesBody',
        countId: 'qaSideMatchesCount',
        bookFilterId: 'qaSideMatchesBookFilter',
        showAction: false
    });
    renderRecordModalExport(row, {
        headRowId: 'qaSideExportHeadRow',
        bodyId: 'qaSideExportBody',
        countId: 'qaSideExportCount',
        onlyDiffToggleId: 'qaSideExportOnlyDiffToggle'
    });
    renderRecordModalSuperseded(row, {
        headRowId: 'qaSideSupersededHeadRow',
        bodyId: 'qaSideSupersededBody',
        countId: 'qaSideSupersededCount'
    });

    const superseded = isSupersededArticle(row);
    $('qaSideNewSection')?.toggleAttribute('hidden', superseded);
    $('qaSideSupersededSection')?.toggleAttribute('hidden', !superseded);

    const status = $('qaSideStatus');
    if (status) status.textContent = '';
}

function getRecordFormValues(scope) {
    const prefix = scope === 'side' ? 'qaSide' : 'qaModal';
    return {
        pos_final: String($(`${prefix}Pos`)?.value || ''),
        pn_final: String($(`${prefix}PnFinal`)?.value || ''),
        designation_final: String($(`${prefix}DesignationFinal`)?.value || ''),
        model_final: String($(`${prefix}ModelType`)?.value || ''),
        qty_final: String($(`${prefix}Qty`)?.value || ''),
        qty_units_final: String($(`${prefix}Units`)?.value || ''),
        weight_final: String($(`${prefix}WeightFinal`)?.value || ''),
        fn_final: String($(`${prefix}Fn`)?.value || ''),
        measure_final: String($(`${prefix}MeasurementFinal`)?.value || ''),
        norma_final: String($(`${prefix}Norma`)?.value || ''),
        gesa: String($(`${prefix}Gesa`)?.value || ''),
        normalizado: String($(`${prefix}Normalizado`)?.value || ''),
        sust_hierarchie: String($(`${prefix}SustHierarchie`)?.value || ''),
        has_img: String($(`${prefix}HasImg`)?.value || ''),
        EN_WEB: String($(`${prefix}EnWeb`)?.value || ''),
        engine_model: String($(`${prefix}Book`)?.value || ''),
        'Source Page': String($(`${prefix}Page`)?.value || '')
    };
}

function clearSideRecordForm() {
    const form = $('qaSideRecordForm');
    if (!(form instanceof HTMLFormElement)) return;

    form.dataset.revisionKey = '';
    form.querySelectorAll('input').forEach(input => { input.value = ''; });
    form.querySelectorAll('select').forEach(select => {
        if (select.id === 'qaSideMatchesBookFilter') select.value = '__current__';
        else if (select.id === 'qaSideRevisionEstado') select.value = 'pendiente';
        else if (select.id === 'qaSideRevisionAccion') select.value = 'importar';
        else select.value = '';
    });

    const sideLabel = $('qaSideLabel');
    if (sideLabel) sideLabel.textContent = 'Selecciona una fila para cargar la ficha';
    const exportLabel = $('qaSideExportLabel');
    if (exportLabel) exportLabel.textContent = 'Sin selección';

    $('qaSideMatchesBody').innerHTML = '<tr><td colspan="5">Sin seleccion</td></tr>';
    const sideOnlyDiffToggle = $('qaSideExportOnlyDiffToggle');
    if (sideOnlyDiffToggle instanceof HTMLInputElement) sideOnlyDiffToggle.checked = false;
    $('qaSideExportHeadRow').innerHTML = '<th>Sin datos</th>';
    $('qaSideExportBody').innerHTML = '<tr><td>Sin seleccion.</td></tr>';
    $('qaSideSupersededHeadRow').innerHTML = '<th>Sin datos</th>';
    $('qaSideSupersededBody').innerHTML = '<tr><td>Sin seleccion.</td></tr>';
    $('qaSideErrorsSummary').innerHTML = '<span class="qa-record-errors-pill is-empty">Sin seleccion</span>';
    $('qaSideErrorsList').innerHTML = '<li class="qa-record-errors-empty">Selecciona una fila para ver sus errores.</li>';
    const status = $('qaSideStatus');
    if (status) status.textContent = 'Selecciona una fila para editarla aqui.';
    if (isMatchesModalOpen()) closeMatchesModal();
}

function syncSideRecordFormWithSelection() {
    const revisionKey = String(state.selectedRevisionRowKey || '');
    const row = getRowByRevisionKey(revisionKey);
    if (!row || !revisionKey) {
        clearSideRecordForm();
        return;
    }
    fillSideRecordForm(row, revisionKey);
    if (isMatchesModalOpen()) {
        activeMatchesModalRevisionKey = revisionKey;
        renderMatchesLargeModal(revisionKey);
    }
}

function applyIncomingRevisionSync(message) {
    const id = String(message?.id || '').trim();
    if (!id || !Array.isArray(state.allData) || state.allData.length === 0) return;

    const engineFile = String(message?.engineFile || '').trim().toLowerCase();
    const hasEstado = message?.estado !== undefined && message?.estado !== null;
    const hasAccion = message?.accion !== undefined && message?.accion !== null;
    if (!hasEstado && !hasAccion) return;

    const nextEstado = hasEstado ? normalizeEstadoToNew(message.estado) : null;
    const nextAccion = hasAccion ? normalizeAccionToNew(message.accion) : null;

    let changed = false;
    const touchedKeys = new Set();

    state.allData.forEach((row) => {
        const rowId = String(row?.ID || '').trim();
        if (!rowId || rowId !== id) return;

        if (engineFile) {
            const rowEngineFile = String(getEngineJsonForRow(row) || '').trim().toLowerCase();
            if (rowEngineFile !== engineFile) return;
        }

        let rowChanged = false;
        if (nextEstado && normalizeEstadoToNew(row?.qa_revision_estado) !== nextEstado) {
            row.qa_revision_estado = nextEstado;
            rowChanged = true;
        }
        if (nextAccion && normalizeAccionToNew(row?.qa_revision_accion) !== nextAccion) {
            row.qa_revision_accion = nextAccion;
            rowChanged = true;
        }

        if (!rowChanged) return;
        row.qa_revision_updated_at = new Date().toISOString();
        touchedKeys.add(getRevisionKey(row));
        changed = true;
    });

    if (!changed) return;

    renderTable();
    renderPagination();

    const selectedKey = String(state.selectedRevisionRowKey || '').trim();
    if (selectedKey && touchedKeys.has(selectedKey)) {
        syncSideRecordFormWithSelection();

        const modalForm = $('qaRecordModalForm');
        if (modalForm instanceof HTMLFormElement && String(modalForm.dataset.revisionKey || '') === selectedKey) {
            const selectedRow = getRowByRevisionKey(selectedKey);
            if (selectedRow) fillRecordModal(selectedRow, selectedKey);
        }
    }
}

function captureModalUiState() {
    const tableWrap = $('mainTableWrap');
    if (tableWrap instanceof HTMLElement) {
        modalUiState.tableScrollTop = tableWrap.scrollTop;
        modalUiState.tableScrollLeft = tableWrap.scrollLeft;
    }
    modalUiState.windowScrollX = window.scrollX || 0;
    modalUiState.windowScrollY = window.scrollY || 0;
}

function restoreModalUiState(revisionKey) {
    const tableWrap = $('mainTableWrap');
    if (tableWrap instanceof HTMLElement) {
        tableWrap.scrollTop = modalUiState.tableScrollTop;
        tableWrap.scrollLeft = modalUiState.tableScrollLeft;
    }
    window.scrollTo(modalUiState.windowScrollX, modalUiState.windowScrollY);

    const safeKey = String(revisionKey || '').replace(/"/g, '\\"');
    if (!safeKey) return;
    const targetRow = document.querySelector(`#tbody tr[data-revision-key="${safeKey}"]`);
    if (!(targetRow instanceof HTMLTableRowElement)) return;
    targetRow.scrollIntoView({ block: 'nearest' });
}

function openRecordModal(revisionKey) {
    const row = getRowByRevisionKey(revisionKey);
    const modal = $('qaRecordModal');
    if (!row || !modal) return;
    captureModalUiState();
    fillRecordModal(row, revisionKey);
    modal.removeAttribute('hidden');
    const firstInput = $('qaModalRevisionEstado');
    if (firstInput instanceof HTMLElement) firstInput.focus();
}

function updateExportModalHeader(row) {
    const pnLabel = $('qaExportModalPn');
    const currentLabel = $('qaExportModalCurrent');
    if (pnLabel) pnLabel.textContent = String(row?.['PART NO.'] ?? row?.pn ?? '-').trim() || '-';
    if (currentLabel) {
        currentLabel.textContent = `${String(row?.engine_model || '-')} · pag ${String(row?.['Source Page'] || '-')} · pos ${String(row?.POS || '-')}`;
    }
}

function openExportModal(revisionKey) {
    const row = getRowByRevisionKey(revisionKey);
    const modal = $('qaExportModal');
    if (!row || !modal) return;

    if (isRecordModalOpen()) closeRecordModal();

    renderRecordModalExport(row);
    renderRecordModalSuperseded(row);
    updateExportModalHeader(row);
    modal.dataset.revisionKey = String(revisionKey || '');
    modal.removeAttribute('hidden');
}

function closeExportModal() {
    const modal = $('qaExportModal');
    if (!modal) return;
    modal.setAttribute('hidden', '');
    modal.dataset.revisionKey = '';
}

function closeRecordModal() {
    const modal = $('qaRecordModal');
    if (!modal) return;
    modal.setAttribute('hidden', '');
    const status = $('qaRecordModalStatus');
    if (status) status.textContent = '';
}

function renderMatchesLargeModal(revisionKey = activeMatchesModalRevisionKey) {
    const body = $('qaMatchesModalBody');
    const count = $('qaMatchesModalCount');
    const pnLabel = $('qaMatchesModalPn');
    const currentLabel = $('qaMatchesModalCurrent');
    const row = getRowByRevisionKey(revisionKey);

    if (!(body instanceof HTMLElement) || !row || !revisionKey) {
        if (body instanceof HTMLElement) {
            body.innerHTML = '<tr><td colspan="8">Selecciona un registro en la ficha para ver apariciones.</td></tr>';
        }
        if (count) count.textContent = '0';
        if (pnLabel) pnLabel.textContent = '-';
        if (currentLabel) currentLabel.textContent = '-';
        return;
    }

    const currentBook = normModalMatch(getBookEngineCode(row));
    const matchesByPn = getModalMatchesByPn(row);
    const pn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim() || '-';
    if (pnLabel) pnLabel.textContent = pn;
    if (currentLabel) {
        currentLabel.textContent = `${String(row?.engine_model || '-')} · pag ${String(row?.['Source Page'] || '-')} · pos ${String(row?.POS || '-')}`;
    }

    if (!matchesByPn.length) {
        body.innerHTML = '<tr><td colspan="8">No se pudo determinar PN/libro del registro.</td></tr>';
        if (count) count.textContent = '0';
        return;
    }

    syncRecordModalBookFilter(row, matchesByPn, 'qaMatchesModalBookFilter');

    const selectedBookFilter = String($('qaMatchesModalBookFilter')?.value || '__current__');
    const pageFilter = normModalMatch($('qaMatchesModalPageFilter')?.value || '');
    const posFilter = normModalMatch($('qaMatchesModalPosFilter')?.value || '');
    const idFilter = normModalMatch($('qaMatchesModalIdFilter')?.value || '');
    const textFilter = normModalMatch($('qaMatchesModalTextFilter')?.value || '');

    const filteredMatches = matchesByPn.filter(item => {
        const itemBook = normModalMatch(item.book);
        if (selectedBookFilter === '__all__') {
            // No aplicar filtro de libro.
        } else if (selectedBookFilter === '__current__') {
            if (!currentBook || itemBook !== currentBook) return false;
        } else if (itemBook !== normModalMatch(selectedBookFilter)) {
            return false;
        }

        if (pageFilter && !normModalMatch(item.page).includes(pageFilter)) return false;
        if (posFilter && !normModalMatch(item.pos).includes(posFilter)) return false;
        if (idFilter && !normModalMatch(item.id).includes(idFilter)) return false;

        if (textFilter) {
            const haystack = [
                item.id,
                item.designationFinal,
                item.weightFinal,
                item.measurementFinal,
                item.fgsCodeDescription,
                item.book,
                item.page,
                item.pos
            ].map(value => normModalMatch(value)).join(' ');
            if (!haystack.includes(textFilter)) return false;
        }

        return true;
    });

    const matches = filteredMatches
        .sort((a, b) => {
            const byBook = String(a.book || '').localeCompare(String(b.book || ''), 'es', { numeric: true, sensitivity: 'base' });
            if (byBook !== 0) return byBook;
            const byPage = pageSortValue(a.page) - pageSortValue(b.page);
            if (byPage !== 0) return byPage;
            const byPos = a.pos.localeCompare(b.pos, 'es', { numeric: true, sensitivity: 'base' });
            if (byPos !== 0) return byPos;
            return a.id.localeCompare(b.id, 'es', { numeric: true, sensitivity: 'base' });
        });

    if (!matches.length) {
        body.innerHTML = '<tr><td colspan="8">Sin coincidencias para los filtros seleccionados.</td></tr>';
        if (count) count.textContent = `0 / ${matchesByPn.length}`;
        return;
    }

    body.innerHTML = matches.map(item => {
        const isCurrent = item.revisionKey === revisionKey;
        const revisionKeyAttr = escapeHtml(String(item.revisionKey || ''));
        return `<tr class="${isCurrent ? 'qa-modal-related-current' : ''}" data-revision-key="${revisionKeyAttr}" title="Doble click para ir al registro en tabla principal">`
            + `<td>${escapeHtml(item.book || '-')}</td>`
            + `<td>${escapeHtml(item.page || '-')}</td>`
            + `<td>${escapeHtml(item.pos || '-')}</td>`
            + `<td>${escapeHtml(item.id || '-')}</td>`
            + `<td>${escapeHtml(item.designationFinal || '-')}</td>`
            + `<td>${escapeHtml(item.weightFinal || '-')}</td>`
            + `<td>${escapeHtml(item.measurementFinal || '-')}</td>`
            + `<td>${escapeHtml(item.fgsCodeDescription || '-')}</td>`
            + '</tr>';
    }).join('');

    if (count) count.textContent = `${matches.length} / ${matchesByPn.length}`;
}

function openMatchesModal(revisionKey) {
    const modal = $('qaMatchesModal');
    const row = getRowByRevisionKey(revisionKey);
    if (!modal || !row) return;

    if (activeMatchesModalRevisionKey !== revisionKey) {
        const pageFilter = $('qaMatchesModalPageFilter');
        const posFilter = $('qaMatchesModalPosFilter');
        const idFilter = $('qaMatchesModalIdFilter');
        const textFilter = $('qaMatchesModalTextFilter');
        if (pageFilter instanceof HTMLInputElement) pageFilter.value = '';
        if (posFilter instanceof HTMLInputElement) posFilter.value = '';
        if (idFilter instanceof HTMLInputElement) idFilter.value = '';
        if (textFilter instanceof HTMLInputElement) textFilter.value = '';
    }

    activeMatchesModalRevisionKey = revisionKey;
    modal.removeAttribute('hidden');
    renderMatchesLargeModal(revisionKey);
}

function closeMatchesModal() {
    const modal = $('qaMatchesModal');
    if (!modal) return;

    modal.setAttribute('hidden', '');
    activeMatchesModalRevisionKey = '';
}

async function handleRecordModalSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const revisionKey = String(form.dataset.revisionKey || '');
    const row = getRowByRevisionKey(revisionKey);
    if (!row) {
        alert('No se encontro el registro seleccionado para guardar.');
        closeRecordModal();
        return;
    }

    const saveBtn = $('qaRecordModalSaveBtn');
    const status = $('qaRecordModalStatus');
    if (saveBtn) saveBtn.disabled = true;
    if (status) status.textContent = 'Guardando cambios...';

    const nextEstado = String($('qaModalRevisionEstado')?.value || '').trim();
    const nextAccion = String($('qaModalRevisionAccion')?.value || '').trim();
    const nextValues = getRecordFormValues('modal');

    try {
        const changes = collectRowChanges(row, nextValues, nextEstado, nextAccion);
        if (!Object.keys(changes).length) {
            if (status) status.textContent = 'Sin cambios para guardar.';
            closeRecordModal();
            restoreModalUiState(revisionKey);
            return;
        }

        await changeControl.applyAndRecord({
            type: QA_ROW_PATCH_CHANGE_TYPE,
            module: 'qa_milu',
            action: 'save-record-modal',
            description: `Guardar ficha modal ID ${row.ID}`,
            target: { revisionKey },
            data: {
                target: buildPatchTargetForRow(row),
                changes
            }
        });

        closeRecordModal();
        restoreModalUiState(revisionKey);
        updateUndoButtonState();
    } catch (error) {
        console.error('Error guardando formulario modal:', error);
        if (status) status.textContent = `No se pudo guardar: ${error.message}`;
        alert(`No se pudo guardar el registro: ${error.message}`);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function handleSideRecordSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const revisionKey = String(form.dataset.revisionKey || '');
    const row = getRowByRevisionKey(revisionKey);
    if (!row) {
        alert('Selecciona un registro de la tabla para editar la ficha lateral.');
        return;
    }

    const saveBtn = $('qaSideSaveBtn');
    const status = $('qaSideStatus');
    if (saveBtn) saveBtn.disabled = true;
    if (status) status.textContent = 'Guardando cambios...';

    const nextEstado = String($('qaSideRevisionEstado')?.value || '').trim();
    const nextAccion = String($('qaSideRevisionAccion')?.value || '').trim();
    const nextValues = getRecordFormValues('side');

    try {
        const changes = collectRowChanges(row, nextValues, nextEstado, nextAccion);
        if (!Object.keys(changes).length) {
            if (status) status.textContent = 'Sin cambios para guardar.';
            return;
        }

        await changeControl.applyAndRecord({
            type: QA_ROW_PATCH_CHANGE_TYPE,
            module: 'qa_milu',
            action: 'save-side-form',
            description: `Guardar ficha lateral ID ${row.ID}`,
            target: { revisionKey },
            data: {
                target: buildPatchTargetForRow(row),
                changes
            }
        });

        if (status) status.textContent = 'Cambios guardados.';
        updateUndoButtonState();
    } catch (error) {
        console.error('Error guardando ficha lateral:', error);
        if (status) status.textContent = `No se pudo guardar: ${error.message}`;
        alert(`No se pudo guardar el registro: ${error.message}`);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function tryLoadFirstJson(candidates) {
    for (const candidate of candidates) {
        try {
            return await fetchJsonSafe(candidate);
        } catch (_) {
            // Continue with next candidate.
        }
    }
    return null;
}

function getBookPages(book) {
    const bookFilter = String(book || state.filters.book || '').toLowerCase();
    return [...new Set(state.allData
        .filter(row => !bookFilter || val(row, 'engine_model', '').toString().toLowerCase().includes(bookFilter))
        .map(row => {
            const n = Number(String(val(row, 'Source Page', '')).replace(/[^0-9]/g, ''));
            return Number.isFinite(n) && !Number.isNaN(n) ? n : null;
        })
        .filter(n => n != null))].sort((a, b) => a - b);
}

function populatePageFilterOptions(bookValue, selectedPage = '') {
    const pageSelect = $('pageFilterSelect');
    if (!(pageSelect instanceof HTMLSelectElement)) return '';

    const normalizedBook = String(bookValue || '').trim();
    const pages = normalizedBook ? getBookPages(normalizedBook) : [];
    const normalizedSelectedPage = normalizePageNumber(selectedPage);
    const selectedPageNumber = Number(normalizedSelectedPage);
    const hasSelectedPage = normalizedSelectedPage !== '' && pages.includes(selectedPageNumber);
    const resolvedPage = hasSelectedPage ? normalizedSelectedPage : '';

    pageSelect.innerHTML = '<option value="">Todas las páginas</option>'
        + pages.map(page => `<option value="${page}">${page}</option>`).join('');
    pageSelect.value = resolvedPage;

    return resolvedPage;
}

function applyBookSelection(bookValue, options = {}) {
    const {
        pageValue = null,
        fallbackToFirstAvailablePage = true,
        render = true,
        updatePdf = true
    } = options;

    const normalizedBook = String(bookValue || '').trim();
    const bookFilterSelect = $('bookFilterSelect');

    if (bookFilterSelect) bookFilterSelect.value = normalizedBook;
    if (normalizedBook) state.filters.book = normalizedBook;
    else delete state.filters.book;

    const pages = getBookPages(normalizedBook);
    const requestedPage = String(pageValue ?? '').trim();
    const requestedPageNumber = Number(requestedPage.replace(/[^0-9]/g, ''));
    const hasRequestedPage = requestedPage !== '' && pages.includes(requestedPageNumber);
    const resolvedPage = hasRequestedPage
        ? String(requestedPageNumber)
        : (fallbackToFirstAvailablePage && pages.length > 0 ? String(pages[0]) : '');

    const selectedPage = populatePageFilterOptions(normalizedBook, resolvedPage);

    if (selectedPage) state.filters.page = selectedPage;
    else delete state.filters.page;

    if (render) {
        state.currentPage = 1;
        renderTable();
        renderPagination();
    }

    if (updatePdf) {
        if (normalizedBook && selectedPage) loadPdfWithPage(normalizedBook, selectedPage);
        else loadPdfClear();
    }

    updateSchemasInline(normalizedBook, selectedPage);
}

function setPageFilterValue(pageValue) {
    const selectedBook = $('bookFilterSelect')?.value || '';
    const normalizedPage = normalizePageNumber(pageValue);
    const selectedPage = populatePageFilterOptions(selectedBook, normalizedPage);
    if (!selectedPage) delete state.filters.page;
    else state.filters.page = selectedPage;

    state.currentPage = 1;
    renderTable();
    renderPagination();

    if (selectedBook && selectedPage) loadPdfWithPage(selectedBook, selectedPage);
    else loadPdfClear();

    updateSchemasInline(selectedBook, selectedPage);
}

function syncPdfWithSelectedRow(revisionKey) {
    const normalizedKey = String(revisionKey || '').trim();
    if (!normalizedKey) {
        setPdfSelection(null);
        loadPdfClear();
        return;
    }

    const selectedRow = state.allData.find(item => getRevisionKey(item) === normalizedKey);
    if (!selectedRow) {
        setPdfSelection(null);
        loadPdfClear();
        return;
    }

    setPdfSelection(selectedRow);
    const book = String(val(selectedRow, 'engine_model', '') || '').trim();
    const page = String(val(selectedRow, 'Source Page', '') || '').trim();
    if (book && page) {
        loadPdfWithPage(book, page);
        return;
    }

    loadPdfClear();
}

function normalizePageNumber(value) {
    const digits = String(value || '').replace(/[^0-9]/g, '');
    if (!digits) return '';
    const parsed = Number(digits);
    return Number.isFinite(parsed) && !Number.isNaN(parsed) ? String(parsed) : '';
}

function resolveBookValue(rawBook) {
    const candidate = String(rawBook || '').trim();
    if (!candidate) return '';
    const normalizedCandidate = candidate.toLowerCase();

    const books = [...new Set(state.allData
        .map(item => String(item?.engine_model ?? '').trim())
        .filter(Boolean))];

    const exact = books.find(book => book.toLowerCase() === normalizedCandidate);
    if (exact) return exact;

    const partial = books.find(book => book.toLowerCase().includes(normalizedCandidate));
    return partial || candidate;
}

function setSideSearchStatus(message, kind = '') {
    const status = $('qaSideSearchStatus');
    if (!(status instanceof HTMLElement)) return;
    status.classList.remove('ok', 'error');
    if (kind) status.classList.add(kind);
    status.textContent = String(message || '');
}

function findRowByArticleToken(rows, token) {
    const normalizedToken = String(token || '').trim().toLowerCase();
    if (!normalizedToken) return null;

    const byIdExact = rows.find(item => String(item?.ID ?? '').trim().toLowerCase() === normalizedToken);
    if (byIdExact) return byIdExact;

    const byPnExact = rows.find(item => {
        const pn = String(item?.['PART NO.'] ?? item?.pn ?? '').trim().toLowerCase();
        return pn === normalizedToken;
    });
    if (byPnExact) return byPnExact;

    const byContains = rows.find(item => {
        const id = String(item?.ID ?? '').trim().toLowerCase();
        const pn = String(item?.['PART NO.'] ?? item?.pn ?? '').trim().toLowerCase();
        const designation = String(getRowValueForColumn(item, 'designation_final', '')).trim().toLowerCase();
        return id.includes(normalizedToken) || pn.includes(normalizedToken) || designation.includes(normalizedToken);
    });
    return byContains || null;
}

function runSideQuickSearch() {
    const rawArticle = String($('qaSideSearchArticle')?.value || '').trim();

    if (!rawArticle) {
        setSideSearchStatus('Escribe un articulo o part number para buscar.', 'error');
        return;
    }

    const targetRow = findRowByArticleToken(state.allData, rawArticle);
    if (!targetRow) {
        setSideSearchStatus('No se encontro ese articulo.', 'error');
        return;
    }

    const targetBook = String(targetRow?.engine_model ?? '').trim();
    const targetPage = normalizePageNumber(targetRow?.['Source Page']);
    applyBookSelection(targetBook, {
        pageValue: targetPage,
        fallbackToFirstAvailablePage: true,
        render: true,
        updatePdf: true
    });

    const revisionKey = getRevisionKey(targetRow);
    const moved = focusRevisionRowInMainTable(revisionKey);
    if (!moved) {
        setSideSearchStatus('Se encontro el articulo, pero no se pudo enfocar en la tabla principal.', 'error');
        return;
    }

    setSideSearchStatus(`Articulo encontrado: ID ${String(targetRow?.ID ?? '-')}, libro ${targetBook || '-'}, pagina ${targetPage || '-'}.`, 'ok');
}

function goToNextBookPage() {
    const book = $('bookFilterSelect')?.value || '';
    if (!book) return;
    const pages = getBookPages(book);
    if (!pages.length) return;
    const currentValue = Number($('pageFilterSelect')?.value || 0);
    const currentIndex = pages.indexOf(currentValue);
    const targetPage = (currentIndex === -1 || currentIndex === pages.length - 1) ? pages[0] : pages[currentIndex + 1];
    setPageFilterValue(targetPage);
}

function goToPrevBookPage() {
    const book = $('bookFilterSelect')?.value || '';
    if (!book) return;
    const pages = getBookPages(book);
    if (!pages.length) return;
    const currentValue = Number($('pageFilterSelect')?.value || 0);
    const currentIndex = pages.indexOf(currentValue);
    const targetPage = currentIndex <= 0 ? pages[pages.length - 1] : pages[currentIndex - 1];
    setPageFilterValue(targetPage);
}

function getAllQaCheckCodes() {
    return (state.qaErrorCheckDefinitions || [])
        .map(def => String(def?.code || '').trim())
        .filter(Boolean);
}

function persistActiveQaChecks() {
    // QA checks are session-only: do not persist error settings to localStorage.
}

function ensureQaChecksState() {
    const allCodes = getAllQaCheckCodes();
    if (!allCodes.length) {
        state.activeQaErrorChecks = new Set();
        return;
    }

    const currentSet = state.activeQaErrorChecks instanceof Set
        ? state.activeQaErrorChecks
        : new Set();
    const active = currentSet.size > 0
        ? allCodes.filter(code => currentSet.has(code))
        : allCodes;

    state.activeQaErrorChecks = new Set(active);
}

function updateQaChecksSummary() {
    const badge = $('qaChecksSummaryBadge');
    if (!(badge instanceof HTMLElement)) return;
    const total = getAllQaCheckCodes().length;
    const active = state.activeQaErrorChecks.size;
    badge.textContent = `${active}/${total}`;
}

function showQaChecksProgress() {
    const area = $('qaChecksProgressArea');
    if (!(area instanceof HTMLElement)) return;
    area.style.display = 'flex';
}

function hideQaChecksProgress() {
    const area = $('qaChecksProgressArea');
    if (!(area instanceof HTMLElement)) return;
    area.style.display = 'none';
}

function buildFoundErrorRows(rows, activeCodes, maxItems = 300) {
    const definitionMap = getQaErrorDefinitionMap();
    const output = [];

    for (const row of (rows || [])) {
        const activeErrors = buildRowActiveQaErrors(row, activeCodes);
        if (!Array.isArray(activeErrors?.codes) || activeErrors.codes.length === 0) continue;

        output.push({
            id: String(row?.ID ?? '').trim(),
            book: String(row?.engine_model ?? '').trim(),
            page: String(row?.['Source Page'] ?? '').trim(),
            pos: String(row?.POS ?? '').trim(),
            pn: String(row?.['PART NO.'] ?? row?.pn ?? '').trim(),
            errors: activeErrors.codes.map(code => definitionMap.get(code) || code)
        });

        if (output.length >= maxItems) break;
    }

    return output;
}

function renderQaChecksFoundRows(foundRows, totalFound) {
    const body = $('qaChecksFoundRows');
    const count = $('qaChecksFoundCount');

    if (count instanceof HTMLElement) {
        count.textContent = String(Number(totalFound || 0));
    }

    if (!(body instanceof HTMLElement)) return;

    if (!Array.isArray(foundRows) || foundRows.length === 0) {
        body.innerHTML = '<tr><td colspan="6" class="qa-checks-found-empty">No se han encontrado registros con error para las comprobaciones activas.</td></tr>';
        return;
    }

    body.innerHTML = foundRows.map(item => `
        <tr>
            <td>${escapeHtml(item.id || '-')}</td>
            <td>${escapeHtml(item.book || '-')}</td>
            <td>${escapeHtml(item.page || '-')}</td>
            <td>${escapeHtml(item.pos || '-')}</td>
            <td>${escapeHtml(item.pn || '-')}</td>
            <td>${escapeHtml((item.errors || []).join(' | ') || '-')}</td>
        </tr>
    `).join('');
}

function showQaChecksStats(stats, scopeLabel = '') {
    const statsArea = $('qaChecksStatsArea');
    if (!(statsArea instanceof HTMLElement)) return;

    const globalStats = stats?.stats;
    if (!globalStats) {
        statsArea.style.display = 'none';
        return;
    }

    const scopeElem = $('qaChecksStatsScope');
    if (scopeElem instanceof HTMLElement) {
        scopeElem.textContent = scopeLabel || 'Todos los articulos';
    }

    const totalElem = $('qaChecksStat_total');
    if (totalElem) totalElem.textContent = String(globalStats.totalRows || 0);

    const errorsElem = $('qaChecksStat_errors');
    if (errorsElem) errorsElem.textContent = String(globalStats.rowsWithErrors || 0);

    const okElem = $('qaChecksStat_ok');
    if (okElem) okElem.textContent = String(globalStats.rowsOk || 0);

    const criticalElem = $('qaChecksStat_critical');
    if (criticalElem) criticalElem.textContent = String(globalStats.severityCount?.critical || 0);

    const definitionMap = getQaErrorDefinitionMap();
    const codesList = $('qaChecksStatCodes');
    if (codesList instanceof HTMLElement) {
        const entries = Object.entries(globalStats.codeCount || {})
            .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0) || String(a[0]).localeCompare(String(b[0])));

        if (!entries.length) {
            codesList.innerHTML = '<li class="qa-checks-stat-codes-empty">No hay errores para las comprobaciones activas.</li>';
        } else {
            codesList.innerHTML = entries.map(([code, count]) => {
                const label = definitionMap.get(code) || code;
                return `<li class="qa-checks-stat-code-item">
                    <span class="qa-checks-stat-code-label">${escapeHtml(label)}</span>
                    <span class="qa-checks-stat-code-count">${escapeHtml(String(count))}</span>
                </li>`;
            }).join('');
        }
    }

    statsArea.style.display = 'block';
}

async function applyQaChecksFilter(scope = 'all') {
    const activeCodes = Array.from(state.activeQaErrorChecks);
    const isVisibleScope = scope === 'visible';

    showQaChecksProgress();
    hideQaChecksStats();

    try {
        if (isVisibleScope) {
            const targetRows = getRowsForBulkScope('visible');
            if (!targetRows.length) {
                hideQaChecksProgress();
                alert('No hay articulos visibles para aplicar el filtro en esta pagina.');
                return;
            }

            const revisionKeys = targetRows
                .map(row => String(getRevisionKey(row) || '').trim())
                .filter(key => /^idx=\d+$/.test(key));
            if (!revisionKeys.length) {
                hideQaChecksProgress();
                alert('No se pudo determinar la clave de revisión para guardar los visibles.');
                return;
            }
            applyActiveQaErrorsToSubset(activeCodes, targetRows);
            state.qaChecksScopedRows = new Set(targetRows);
            persistActiveQaChecks();

            const visibleStats = buildQaStatsFromRows(targetRows, activeCodes);
            showQaChecksStats({ stats: visibleStats }, 'Solo visibles en pantalla');

            const foundRows = buildFoundErrorRows(targetRows, activeCodes, 300);
            renderQaChecksFoundRows(foundRows, visibleStats.rowsWithErrors || foundRows.length);

            renderTable();
            renderPagination();
            hideQaChecksProgress();
            return;
        }

        applyActiveQaErrorsToClientRows(activeCodes);
        const globalStats = buildQaStatsFromRows(state.allData, activeCodes);

        hideQaChecksProgress();
        showQaChecksStats({ stats: globalStats }, 'Todos los articulos');
        persistActiveQaChecks();
        state.qaChecksScopedRows = null;

        const foundRows = buildFoundErrorRows(state.allData, activeCodes, 500);
        renderQaChecksFoundRows(foundRows, globalStats.rowsWithErrors || foundRows.length);

        // Actualizar tabla después del éxito
        state.currentPage = 1;
        renderTable();
        renderPagination();

    } catch (err) {
        console.error('Error applying QA checks filter:', err);
        hideQaChecksProgress();
        alert('Error al procesar el filtro. Revisa la consola.');
    }
}

function hideQaChecksStats() {
    const statsArea = $('qaChecksStatsArea');
    if (!(statsArea instanceof HTMLElement)) return;
    statsArea.style.display = 'none';

    const codesList = $('qaChecksStatCodes');
    if (codesList instanceof HTMLElement) {
        codesList.innerHTML = '<li class="qa-checks-stat-codes-empty">Aplica el cálculo para ver el detalle.</li>';
    }

    renderQaChecksFoundRows([], 0);
}

function openQaChecksModal() {
    const overlay = $('qaChecksModalOverlay');
    if (!(overlay instanceof HTMLElement)) return;
    renderQaChecksPanel();
    overlay.style.display = 'flex';
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

function closeQaChecksModal() {
    const overlay = $('qaChecksModalOverlay');
    if (!(overlay instanceof HTMLElement)) return;
    overlay.style.display = 'none';
    // Restore body scroll
    document.body.style.overflow = '';
}

function renderQaChecksPanel() {
    ensureQaChecksState();

    const container = $('qaChecksList');
    if (!(container instanceof HTMLElement)) return;

    const items = state.qaErrorCheckDefinitions || [];
    container.innerHTML = items.map(def => {
        const code = String(def?.code || '').trim();
        const label = String(def?.label || code);
        const checked = state.activeQaErrorChecks.has(code) ? 'checked' : '';
        return `<label class="qa-check-item" title="${escapeHtml(code)}">
            <input type="checkbox" data-qa-check-code="${escapeHtml(code)}" ${checked}>
            <span>${escapeHtml(label)}</span>
        </label>`;
    }).join('');

    updateQaChecksSummary();
}

function clearFilters() {
    document.querySelectorAll('.filter-input[data-filter]').forEach(input => { input.value = ''; });
    document.querySelectorAll('.filter-select[data-filter]').forEach(select => { select.value = ''; });
    state.filters = {};
    updateOnlyErrorsToggleLabel();
    populatePageFilterOptions('', '');
    state.currentPage = 1;
    renderTable();
    renderPagination();
    loadPdfClear();
    updateSchemasInline('', '');
}

function updateOnlyErrorsToggleLabel() {
    const toggleBtn = $('toggleOnlyErrorsBtn');
    if (!(toggleBtn instanceof HTMLButtonElement)) return;

    const onlyErrorsActive = String(state.filters?.has_error || '') === 'true';
    toggleBtn.classList.toggle('is-active', onlyErrorsActive);
    toggleBtn.textContent = onlyErrorsActive ? 'Solo errores: ON' : 'Solo errores: OFF';
}

function setOnlyErrorsFilter(enabled) {
    if (enabled) state.filters.has_error = 'true';
    else delete state.filters.has_error;

    const hasErrorSelect = document.querySelector('.filter-select[data-filter="has_error"]');
    if (hasErrorSelect instanceof HTMLSelectElement) {
        hasErrorSelect.value = enabled ? 'true' : '';
    }

    state.currentPage = 1;
    updateOnlyErrorsToggleLabel();
    renderTable();
    renderPagination();
}

function handleFilter(event) {
    const input = event.target;
    const filterKey = input.dataset.filter;
    if (!filterKey) return;
    const filterValue = input.value.trim();
    if (filterValue === '') delete state.filters[filterKey];
    else state.filters[filterKey] = filterValue;
    updateOnlyErrorsToggleLabel();

    if (filterTimeout) clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
        state.currentPage = 1;
        renderTable();
        renderPagination();
    }, 120);
}

function handleSort(event) {
    const th = event.target.closest('th');
    if (!th || !th.dataset.sort) return;
    const key = th.dataset.sort;
    if (state.sortKey === key) state.sortAsc = !state.sortAsc;
    else {
        state.sortKey = key;
        state.sortAsc = true;
    }
    state.currentPage = 1;
    renderTable();
    renderPagination();
}

function isTypingContext(target) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'));
}

function updatePaginationToggleLabel() {
    const btn = $('togglePaginationBtn');
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.textContent = state.paginationEnabled ? 'Paginación: ON' : 'Paginación: OFF';
}

async function applyBulkQuickMode(quickMode) {
    const scopeSelect = $('bulkScopeSelect');
    if (!scopeSelect) return;

    const quickMap = {
        revok: { estado: 'ok', accion: null, label: 'revisión OK' },
        revempty: { estado: 'pendiente', accion: null, label: 'revisión Pendiente' },
        validate: { estado: null, accion: 'importar', label: 'acción Importar' },
        review: { estado: null, accion: 'revisar', label: 'acción Revisar' },
        discard: { estado: null, accion: 'eliminar', label: 'acción Eliminar' }
    };

    const targetValues = quickMap[quickMode];
    if (!targetValues) return;

    const scope = scopeSelect.value;
    const targetRows = getRowsForBulkScope(scope);
    if (!targetRows.length) {
        alert('No hay registros para aplicar el cambio masivo con el ámbito seleccionado.');
        return;
    }

    const scopeText = scope === 'visible' ? 'registros visibles en pantalla' : 'registros filtrados';
    const confirmed = window.confirm(`Se aplicará ${targetValues.label} masiva a ${targetRows.length} ${scopeText}. ¿Continuar?`);
    if (!confirmed) return;

    const targets = [];
    for (const row of targetRows) {
        const currentEstado = normalizeEstadoToNew(row.qa_revision_estado);
        const currentAccion = normalizeAccionToNew(row.qa_revision_accion);
        const nextEstado = targetValues.estado === null ? currentEstado : targetValues.estado;
        const nextAccion = targetValues.accion === null ? currentAccion : targetValues.accion;

        if (nextEstado === currentEstado && nextAccion === currentAccion) {
            continue;
        }

        targets.push({
            target: buildPatchTargetForRow(row),
            changes: {
                ...(nextEstado !== currentEstado
                    ? { qa_revision_estado: { before: currentEstado, after: nextEstado } }
                    : {}),
                ...(nextAccion !== currentAccion
                    ? { qa_revision_accion: { before: currentAccion, after: nextAccion } }
                    : {})
            }
        });
    }

    if (!targets.length) {
        alert('No hay cambios efectivos para aplicar en el ambito seleccionado.');
        return;
    }

    await changeControl.applyAndRecord({
        type: QA_BULK_ROW_PATCH_CHANGE_TYPE,
        module: 'qa_milu',
        action: `bulk-${quickMode}`,
        description: `Cambio masivo ${targetValues.label} (${targets.length} filas)`,
        target: { scope, size: targets.length },
        data: { targets }
    });

    updateUndoButtonState();
}

async function loadData() {
    try {
        const isFileProtocol = window.location.protocol === 'file:';
        if (isFileProtocol) {
            const columns = 53;
            $('tbody').innerHTML = `<tr><td colspan="${columns}" class="error">Estás abriendo el archivo directamente (file://). Intenta con servidor local.</td></tr>` +
                `<tr><td colspan="${columns}" class="error">Ejecuta un servidor local o usa Ejecutar localhost.bat para que fetch() cargue los engine_*.json.</td></tr>`;
        }

        $('stats').innerHTML = '<span class="stat">Cargando datos...</span>';
        $('pagination').style.display = 'none';

        state.allData = await loadPartitionedEngineData();
        if (!Array.isArray(state.allData)) throw new Error('Los datos no son un array');

        const newData = await tryLoadFirstJson(['MILU_New_v506.json', 'MILU_New_v507.json']);
        if (Array.isArray(newData)) {
            state.newPnSet = new Set(newData.map(item => item.pn));
            state.miluNewData = newData;
        } else {
            state.miluNewData = [];
        }

        const supersededData = await tryLoadFirstJson(['MILU_Superseded_v506.json', 'MILU_Superseded_v507.json']);
        if (Array.isArray(supersededData)) {
            state.supersededPnSet = new Set(supersededData.map(item => item.pn));
            state.miluSupersededData = supersededData;
        } else {
            state.miluSupersededData = [];
        }

        state.publishedMap = new Map();

        const productExportData = await tryLoadFirstJson(['product-export-2026-03-29-11-07.json', 'product_export_v507.json']);
        if (Array.isArray(productExportData)) state.productExportPnSet = new Set(productExportData.map(item => item.pn));

        state.currentPage = 1;
        state.sortKey = 'book_page_pos';
        state.sortAsc = true;
        state.paginationEnabled = true;
        state.tableMode = 'qa';
        state.filters = {};
        updateOnlyErrorsToggleLabel();
        state.qaChecksScopedRows = null;
        state.recentRevisionKeys = [];
        state.displayRowCount = 0;

        const columnViewSelect = $('columnViewSelect');
        if (columnViewSelect instanceof HTMLSelectElement) {
            columnViewSelect.value = state.tableMode === 'errors' ? 'errors' : state.columnView;
        }

        assignRevisionKeys(state.allData);
        applyRevisionDataToRows(state.allData);
        loadColumnWidths();

        const allBooks = [...new Set(state.allData
            .map(item => val(item, 'engine_model', '').toString().trim())
            .filter(b => b && b !== '—'))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const bookFilterSelect = $('bookFilterSelect');
        if (bookFilterSelect) {
            bookFilterSelect.innerHTML = '<option value="">Todos los libros</option>' + allBooks.map(book => `<option value="${escapeHtml(book)}">${escapeHtml(book)}</option>`).join('');
            if (allBooks.length > 0) {
                applyBookSelection(allBooks[0], { fallbackToFirstAvailablePage: true, render: false, updatePdf: true });
            }
        }

        if (!state.allData.length) {
            $('tbody').innerHTML = '<tr><td colspan="53" class="error">No se encontró información en los archivos engine_*.json</td></tr>';
            $('stats').innerHTML = '<span class="stat">0 total</span>';
            $('pagination').style.display = 'none';
            return;
        }

        state.filteredData = [...state.allData];
        renderTable();
        renderPagination();
        updatePaginationToggleLabel();
        updateOnlyErrorsToggleLabel();
        syncSideRecordFormWithSelection();
        queueColumnViewRefresh();

        if (pendingShellRecordModalRequest) {
            const pendingRequest = pendingShellRecordModalRequest;
            pendingShellRecordModalRequest = null;
            openRecordModalFromShell(pendingRequest);
        }

        if (syncAutoPageSize()) {
            state.currentPage = 1;
            renderTable();
            renderPagination();
            queueColumnViewRefresh();
        }
    } catch (error) {
        console.error('Error cargando datos:', error);
        $('tbody').innerHTML = `<tr><td colspan="53" class="error">Error cargando datos: ${escapeHtml(error.message)}</td></tr>`;
        $('stats').innerHTML = '<span class="stat bad">Error cargando datos</span>';
    }
}

function attachGlobalEvents() {
    document.addEventListener('qa:selected-row-changed', (event) => {
        syncPdfWithSelectedRow(event?.detail?.revisionKey || state.selectedRevisionRowKey);
        syncSideRecordFormWithSelection();
    });

    document.addEventListener('qa:revision-save-failed', (event) => {
        const revisionKey = String(event?.detail?.revisionKey || '').trim();
        if (!revisionKey) return;
        const rowRefreshed = refreshVisibleRowByRevisionKey(revisionKey);
        if (!rowRefreshed) renderTable();

        const selectedRevisionKey = String(state.selectedRevisionRowKey || '').trim();
        if (selectedRevisionKey === revisionKey) {
            const status = $('qaSideStatus');
            if (status) status.textContent = 'Error guardando revisión. Revisa conexión/backend.';
        }
    });

    $('firstBtn')?.addEventListener('click', () => jumpToPage(1));
    $('prevBtn')?.addEventListener('click', () => changePage(-1));
    $('nextBtn')?.addEventListener('click', () => changePage(1));
    $('lastBtn')?.addEventListener('click', () => jumpToPage(Number.MAX_SAFE_INTEGER));
    document.querySelector('thead')?.addEventListener('click', handleSort);

    document.querySelectorAll('.filter-input[data-filter], .filter-select[data-filter]').forEach(elem => {
        if (elem.id === 'bookFilterSelect' || elem.id === 'pageFilterSelect') return;
        elem.addEventListener('input', handleFilter);
        elem.addEventListener('change', handleFilter);
    });

    $('nextBookPageBtn')?.addEventListener('click', goToNextBookPage);
    $('prevBookPageBtn')?.addEventListener('click', goToPrevBookPage);
    $('clearFiltersBtn')?.addEventListener('click', clearFilters);
    $('toggleOnlyErrorsBtn')?.addEventListener('click', () => {
        const onlyErrorsActive = String(state.filters?.has_error || '') === 'true';
        setOnlyErrorsFilter(!onlyErrorsActive);
    });
    $('togglePaginationBtn')?.addEventListener('click', () => {
        state.paginationEnabled = !state.paginationEnabled;
        state.currentPage = 1;
        renderTable();
        renderPagination();
        updatePaginationToggleLabel();
    });

    // QA Checks Modal
    $('openQaChecksModalBtn')?.addEventListener('click', openQaChecksModal);
    $('closeQaChecksModalBtn')?.addEventListener('click', closeQaChecksModal);
    $('applyQaChecksAllBtn')?.addEventListener('click', async () => {
        await applyQaChecksFilter('all');
        // No cerrar modal aún, para que usuario vea estadísticas
    });

    $('applyQaChecksVisibleBtn')?.addEventListener('click', async () => {
        await applyQaChecksFilter('visible');
        // No cerrar modal aún, para que usuario vea estadísticas
    });

    // Close modal on overlay click
    $('qaChecksModalOverlay')?.addEventListener('click', (event) => {
        if (event.target.id === 'qaChecksModalOverlay') closeQaChecksModal();
    });

    // QA Checks list changes - use event delegation with 'input' (bubbles)
    const qaChecksList = $('qaChecksList');
    if (qaChecksList instanceof HTMLElement) {
        qaChecksList.addEventListener('input', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
            const code = String(target.dataset.qaCheckCode || '').trim();
            if (!code) return;

            if (target.checked) state.activeQaErrorChecks.add(code);
            else state.activeQaErrorChecks.delete(code);

            // Solo actualizar badge, NO renderizar tabla
            updateQaChecksSummary();
        });
    }

    $('qaChecksAllBtn')?.addEventListener('click', () => {
        state.activeQaErrorChecks = new Set(getAllQaCheckCodes());
        renderQaChecksPanel();
    });

    $('qaChecksNoneBtn')?.addEventListener('click', () => {
        state.activeQaErrorChecks = new Set();
        renderQaChecksPanel();
    });

    $('sortBookPagePosBtn')?.addEventListener('click', () => {
        if (state.sortKey === 'book_page_pos') state.sortAsc = !state.sortAsc;
        else { state.sortKey = 'book_page_pos'; state.sortAsc = true; }
        state.currentPage = 1;
        renderTable();
        renderPagination();
    });

    $('columnViewSelect')?.addEventListener('change', (event) => {
        const selectedView = String(event.target.value || 'qa');
        if (selectedView === 'errors') {
            state.tableMode = 'errors';
        } else {
            state.tableMode = 'qa';
            state.columnView = ['qa', 'focus', 'pdf'].includes(selectedView) ? selectedView : 'qa';
            saveColumnViewPreference();
        }

        if (event.target instanceof HTMLSelectElement) {
            event.target.value = state.tableMode === 'errors' ? 'errors' : state.columnView;
        }

        state.currentPage = 1;
        renderTable();
        renderPagination();
        queueColumnViewRefresh();
    });

    $('bookFilterSelect')?.addEventListener('change', () => {
        applyBookSelection($('bookFilterSelect')?.value || '', {
            fallbackToFirstAvailablePage: false,
            render: true,
            updatePdf: true
        });
    });

    $('pageFilterSelect')?.addEventListener('change', () => {
        setPageFilterValue($('pageFilterSelect')?.value || '');
    });

    $('bulkRevOkBtn')?.addEventListener('click', () => applyBulkQuickMode('revok'));
    $('bulkRevEmptyBtn')?.addEventListener('click', () => applyBulkQuickMode('revempty'));
    $('bulkValidateBtn')?.addEventListener('click', () => applyBulkQuickMode('validate'));
    $('bulkReviewBtn')?.addEventListener('click', () => applyBulkQuickMode('review'));
    $('bulkDiscardBtn')?.addEventListener('click', () => applyBulkQuickMode('discard'));
    $('qaUndoLastChangeBtn')?.addEventListener('click', () => undoLastQaChange());
    $('openAuditPageBtn')?.addEventListener('click', () => {
        window.open('qa_auditoria.html', '_blank', 'noopener');
    });

    document.addEventListener('milu:change-control:history-updated', () => {
        updateUndoButtonState();
    });

    document.querySelectorAll('[data-pdf-tab]').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => setRightPanelTab(tabBtn.dataset.pdfTab || 'pdf'));
    });

    $('qaSideOpenModalBtn')?.addEventListener('click', () => {
        const revisionKey = String($('qaSideRecordForm')?.dataset.revisionKey || '');
        if (!revisionKey) {
            alert('Selecciona un registro para abrir el modal.');
            return;
        }
        openRecordModal(revisionKey);
    });

    $('qaRecordModalOpenExportBtn')?.addEventListener('click', () => {
        const revisionKey = String($('qaRecordModalForm')?.dataset.revisionKey || '');
        if (!revisionKey) {
            alert('Selecciona un registro para abrir la exportación.');
            return;
        }
        openExportModal(revisionKey);
    });

    $('qaSideOpenMatchesModalBtn')?.addEventListener('click', () => {
        const revisionKey = String($('qaSideRecordForm')?.dataset.revisionKey || '');
        if (!revisionKey) {
            alert('Selecciona un registro para abrir las apariciones en modal.');
            return;
        }
        openMatchesModal(revisionKey);
    });

    $('qaSideMatchesBookFilter')?.addEventListener('change', () => {
        const revisionKey = String($('qaSideRecordForm')?.dataset.revisionKey || '');
        const row = getRowByRevisionKey(revisionKey);
        if (!row) return;
        renderRecordModalMatches(row, revisionKey, {
            bodyId: 'qaSideMatchesBody',
            countId: 'qaSideMatchesCount',
            bookFilterId: 'qaSideMatchesBookFilter',
            showAction: false
        });
    });

    $('qaSideExportOnlyDiffToggle')?.addEventListener('change', () => {
        const revisionKey = String($('qaSideRecordForm')?.dataset.revisionKey || '');
        const row = getRowByRevisionKey(revisionKey);
        if (!row) return;
        renderRecordModalExport(row, {
            headRowId: 'qaSideExportHeadRow',
            bodyId: 'qaSideExportBody',
            countId: 'qaSideExportCount',
            onlyDiffToggleId: 'qaSideExportOnlyDiffToggle'
        });
    });

    $('qaModalExportOnlyDiffToggle')?.addEventListener('change', () => {
        if (!isExportModalOpen()) return;
        const revisionKey = String($('qaExportModal')?.dataset.revisionKey || '');
        const row = getRowByRevisionKey(revisionKey);
        if (!row) return;
        renderRecordModalExport(row, {
            headRowId: 'qaModalExportHeadRow',
            bodyId: 'qaModalExportBody',
            countId: 'qaModalExportCount',
            onlyDiffToggleId: 'qaModalExportOnlyDiffToggle'
        });
    });

    $('qaSideMatchesBody')?.addEventListener('dblclick', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const tr = target.closest('tr[data-revision-key]');
        const revisionKey = String(tr?.getAttribute('data-revision-key') || '').trim();
        if (!revisionKey) return;

        event.preventDefault();
        event.stopPropagation();

        const moved = focusRevisionRowInMainTable(revisionKey);
        if (!moved) {
            alert('No se pudo navegar al registro en la tabla principal. Puede estar fuera de los filtros activos.');
        }
    });

    $('qaMatchesModalCloseBtn')?.addEventListener('click', closeMatchesModal);
    $('qaMatchesModal')?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.dataset.matchesModalClose === 'true') closeMatchesModal();
    });

    ['qaMatchesModalBookFilter'].forEach(id => {
        $(id)?.addEventListener('change', () => renderMatchesLargeModal());
    });
    ['qaMatchesModalPageFilter', 'qaMatchesModalPosFilter', 'qaMatchesModalIdFilter', 'qaMatchesModalTextFilter'].forEach(id => {
        $(id)?.addEventListener('input', () => renderMatchesLargeModal());
    });

    $('qaMatchesModalBody')?.addEventListener('dblclick', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const tr = target.closest('tr[data-revision-key]');
        const revisionKey = String(tr?.getAttribute('data-revision-key') || '').trim();
        if (!revisionKey) return;

        event.preventDefault();
        event.stopPropagation();

        const moved = focusRevisionRowInMainTable(revisionKey);
        if (!moved) {
            alert('No se pudo navegar al registro en la tabla principal. Puede estar fuera de los filtros activos.');
            return;
        }
        closeMatchesModal();
    });

    $('qaSideSearchBtn')?.addEventListener('click', runSideQuickSearch);
    ['qaSideSearchArticle'].forEach(id => {
        $(id)?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            runSideQuickSearch();
        });
    });

    $('qaSideResetBtn')?.addEventListener('click', syncSideRecordFormWithSelection);
    $('qaSideRecordForm')?.addEventListener('submit', handleSideRecordSubmit);

    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && !event.altKey) {
            const key = String(event.key || '').toLowerCase();
            if (key === 'z') {
                event.preventDefault();
                if (event.shiftKey) redoLastQaChange();
                else undoLastQaChange();
                return;
            }
            if (key === 'y') {
                event.preventDefault();
                redoLastQaChange();
                return;
            }
        }

        if (isMatchesModalOpen()) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeMatchesModal();
            }
            return;
        }

        if (isRecordModalOpen()) {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeRecordModal();
            }
            return;
        }

        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.repeat || isTypingContext(event.target)) return;

        if (event.key.toLowerCase() === 'v') {
            event.preventDefault();
            const scopeSelect = $('bulkScopeSelect');
            if (scopeSelect) scopeSelect.value = 'filtered';
            applyBulkQuickMode('revok');
            return;
        }

        if (event.key === 'ArrowRight') { event.preventDefault(); goToNextBookPage(); return; }
        if (event.key === 'ArrowLeft') { event.preventDefault(); goToPrevBookPage(); return; }
        if (event.key === 'ArrowDown') { event.preventDefault(); moveSelectionBy(1); return; }
        if (event.key === 'ArrowUp') { event.preventDefault(); moveSelectionBy(-1); return; }
        if (event.key === 'Escape') cancelInlineEdit();
    });

    const tbody = $('tbody');
    tbody?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const openAnalysisBadge = target.closest('[data-open-analysis="true"]');
        if (openAnalysisBadge) {
            const tr = openAnalysisBadge.closest('tr[data-revision-key]');
            const rowKey = tr?.getAttribute('data-revision-key') || '';
            const row = state.allData.find(item => getRevisionKey(item) === rowKey);
            if (row) {
                event.preventDefault();
                event.stopPropagation();
                openAnalisisForRow(row);
            }
            return;
        }

        if (target.closest('select') || target.closest('a') || isInlineEditableTarget(target)) return;

        const tr = target.closest('tr[data-revision-key]');
        if (!tr) return;
        const rowKey = tr.getAttribute('data-revision-key') || '';
        const row = state.allData.find(item => getRevisionKey(item) === rowKey);
        if (!row) return;
        state.selectedRevisionRowKey = rowKey;
        refreshSelectedRowVisual();
        renderSelectedRowPosPanel(row);
        renderSelectedRowPosTop(row);
        document.dispatchEvent(new CustomEvent('qa:selected-row-changed', {
            detail: { revisionKey: rowKey }
        }));
    });

    tbody?.addEventListener('dblclick', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest('button') || target.closest('select') || target.closest('a') || target.closest('input') || target.closest('textarea')) return;
        const tr = target.closest('tr[data-revision-key]');
        const revisionKey = tr?.getAttribute('data-revision-key') || '';
        if (!revisionKey) return;
        event.preventDefault();
        event.stopPropagation();
        openRecordModal(revisionKey);
    });

    tbody?.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        const revisionField = target.dataset.revisionField;
        const revisionKey = target.dataset.revisionKey;
        if (!revisionField || !revisionKey) return;
        const row = state.allData.find(item => getRevisionKey(item) === revisionKey);
        if (!row) return;
        const currentEstado = normalizeEstadoToNew(row.qa_revision_estado);
        const currentAccion = normalizeAccionToNew(row.qa_revision_accion);
        const nextEstado = revisionField === 'estado' ? normalizeEstadoToNew(target.value) : currentEstado;
        const nextAccion = revisionField === 'accion' ? normalizeAccionToNew(target.value) : currentAccion;
        const changes = {};
        if (nextEstado !== currentEstado) {
            changes.qa_revision_estado = { before: currentEstado, after: nextEstado };
        }
        if (nextAccion !== currentAccion) {
            changes.qa_revision_accion = { before: currentAccion, after: nextAccion };
        }
        if (!Object.keys(changes).length) {
            updateRevisionSelectVisual(target);
            return;
        }

        changeControl.applyAndRecord({
            type: QA_ROW_PATCH_CHANGE_TYPE,
            module: 'qa_milu',
            action: `inline-${revisionField}`,
            description: `Cambio rapido ${revisionField} ID ${row.ID}`,
            target: { revisionKey },
            data: {
                target: buildPatchTargetForRow(row),
                changes
            }
        }).catch((error) => {
            console.error('No se pudo guardar cambio rapido:', error);
            alert(`No se pudo guardar el cambio rapido: ${error.message}`);
            refreshVisibleRowByRevisionKey(revisionKey);
            syncSideRecordFormWithSelection();
        }).finally(() => {
            updateRevisionSelectVisual(target);
            updateUndoButtonState();
        });
    });

    const errorViewTbody = $('errorViewTbody');
    errorViewTbody?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const openAnalysisBadge = target.closest('[data-open-analysis="true"]');
        if (openAnalysisBadge) {
            const tr = openAnalysisBadge.closest('tr[data-revision-key]');
            const rowKey = tr?.getAttribute('data-revision-key') || '';
            const row = state.allData.find(item => getRevisionKey(item) === rowKey);
            if (row) {
                event.preventDefault();
                event.stopPropagation();
                openAnalisisForRow(row);
            }
            return;
        }

        if (target.closest('a') || target.closest('button') || target.closest('input') || target.closest('select')) return;

        const tr = target.closest('tr[data-revision-key]');
        if (!tr) return;
        const rowKey = tr.getAttribute('data-revision-key') || '';
        const row = state.allData.find(item => getRevisionKey(item) === rowKey);
        if (!row) return;

        state.selectedRevisionRowKey = rowKey;
        refreshSelectedRowVisual();
        renderSelectedRowPosPanel(row);
        renderSelectedRowPosTop(row);
        document.dispatchEvent(new CustomEvent('qa:selected-row-changed', {
            detail: { revisionKey: rowKey }
        }));
    });

    errorViewTbody?.addEventListener('dblclick', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest('a') || target.closest('button') || target.closest('input') || target.closest('select') || target.closest('textarea')) return;

        const tr = target.closest('tr[data-revision-key]');
        const revisionKey = tr?.getAttribute('data-revision-key') || '';
        if (!revisionKey) return;

        event.preventDefault();
        event.stopPropagation();
        openRecordModal(revisionKey);
    });

    errorViewTbody?.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        const revisionField = target.dataset.revisionField;
        const revisionKey = target.dataset.revisionKey;
        if (!revisionField || !revisionKey) return;
        const row = state.allData.find(item => getRevisionKey(item) === revisionKey);
        if (!row) return;
        const currentEstado = normalizeEstadoToNew(row.qa_revision_estado);
        const currentAccion = normalizeAccionToNew(row.qa_revision_accion);
        const nextEstado = revisionField === 'estado' ? normalizeEstadoToNew(target.value) : currentEstado;
        const nextAccion = revisionField === 'accion' ? normalizeAccionToNew(target.value) : currentAccion;
        const changes = {};
        if (nextEstado !== currentEstado) {
            changes.qa_revision_estado = { before: currentEstado, after: nextEstado };
        }
        if (nextAccion !== currentAccion) {
            changes.qa_revision_accion = { before: currentAccion, after: nextAccion };
        }
        if (!Object.keys(changes).length) {
            updateRevisionSelectVisual(target);
            return;
        }

        changeControl.applyAndRecord({
            type: QA_ROW_PATCH_CHANGE_TYPE,
            module: 'qa_milu',
            action: `inline-error-view-${revisionField}`,
            description: `Cambio rapido vista errores ${revisionField} ID ${row.ID}`,
            target: { revisionKey },
            data: {
                target: buildPatchTargetForRow(row),
                changes
            }
        }).catch((error) => {
            console.error('No se pudo guardar cambio rapido en vista errores:', error);
            alert(`No se pudo guardar el cambio rapido: ${error.message}`);
            refreshVisibleRowByRevisionKey(revisionKey);
            syncSideRecordFormWithSelection();
        }).finally(() => {
            updateRevisionSelectVisual(target);
            updateUndoButtonState();
        });
    });

    window.addEventListener('resize', () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (state.rightPanelTab === 'pdf') {
                requestPdfRelayout();
            }
            if (!state.allData.length || state.groupedVisible) return;
            if (!syncAutoPageSize()) return;
            const totalPages = Math.max(1, Math.ceil(state.filteredData.length / state.pageSize));
            if (state.currentPage > totalPages) state.currentPage = totalPages;
            renderTable();
            renderPagination();
        }, 120);
    });

    $('qaRecordModalCloseBtn')?.addEventListener('click', closeRecordModal);
    $('qaRecordModalCancelBtn')?.addEventListener('click', closeRecordModal);
    $('qaRecordModal')?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.dataset.modalClose === 'true') closeRecordModal();
    });

    $('qaModalMatchesBookFilter')?.addEventListener('change', () => {
        const form = $('qaRecordModalForm');
        if (!(form instanceof HTMLFormElement)) return;
        const revisionKey = String(form.dataset.revisionKey || '');
        const row = getRowByRevisionKey(revisionKey);
        if (!row) return;
        renderRecordModalMatches(row, revisionKey);
    });

    $('qaExportModalCloseBtn')?.addEventListener('click', closeExportModal);
    $('qaExportModal')?.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.dataset.exportModalClose === 'true') closeExportModal();
    });

    $('qaRecordModalForm')?.addEventListener('submit', handleRecordModalSubmit);
    $('backendStatusRetryBtn')?.addEventListener('click', () => {
        refreshBackendStatus().catch(() => setBackendStatusBadge('offline', 'Backend: sin conexion'));
    });
}

function initQaSplitter() {
    const main = document.querySelector('.main');
    const splitter = document.getElementById('qaSplitter');
    if (!(main instanceof HTMLElement) || !(splitter instanceof HTMLElement)) return;

    const QA_RIGHT_WIDTH_KEY = 'qamilu:right-panel-width';

    const clampAndApply = (desiredWidth) => {
        const totalWidth = Math.max(1, main.getBoundingClientRect().width);
        const min = 320;
        const max = Math.max(400, Math.floor(totalWidth * 0.70));
        const clamped = Math.max(min, Math.min(max, Math.round(desiredWidth)));
        document.documentElement.style.setProperty('--qa-right-width', `${clamped}px`);
        return clamped;
    };

    const savedWidth = Number(localStorage.getItem(QA_RIGHT_WIDTH_KEY));
    if (Number.isFinite(savedWidth) && savedWidth > 0) {
        clampAndApply(savedWidth);
    } else {
        clampAndApply(Math.round(main.getBoundingClientRect().width * 0.35));
    }

    let dragging = false;

    const onPointerMove = (event) => {
        if (!dragging) return;
        const rect = main.getBoundingClientRect();
        const desiredWidth = rect.right - event.clientX;
        const applied = clampAndApply(desiredWidth);
        localStorage.setItem(QA_RIGHT_WIDTH_KEY, String(applied));
        requestPdfRelayout();
        event.preventDefault();
    };

    const stopDragging = () => {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('qa-resizing');
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', stopDragging);
        requestPdfRelayout();
    };

    splitter.addEventListener('pointerdown', (event) => {
        if (window.matchMedia('(max-width: 1200px)').matches) return;
        dragging = true;
        document.body.classList.add('qa-resizing');
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', stopDragging);
        event.preventDefault();
    });

    splitter.addEventListener('keydown', (event) => {
        if (window.matchMedia('(max-width: 1200px)').matches) return;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const current = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--qa-right-width'), 10) || 500;
        const delta = event.key === 'ArrowLeft' ? 24 : -24;
        const applied = clampAndApply(current + delta);
        localStorage.setItem(QA_RIGHT_WIDTH_KEY, String(applied));
        requestPdfRelayout();
        event.preventDefault();
    });
}

function init() {
    registerChangeControlTypes();
    initColumnResize();
    loadColumnViewPreference();
    initPdfZoomControls();
    initBackendStatusMonitor();
    ensureQaChecksState();
    updateQaChecksSummary();
    attachGlobalEvents();
    subscribeRevisionSync((message) => {
        applyIncomingRevisionSync(message);
    });
    updateUndoButtonState();
    initQaSplitter();
    setRightPanelTab(state.rightPanelTab);
    clearSideRecordForm();
    loadData();
}

init();
