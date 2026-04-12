/**
 * Punto de entrada principal de qa_milu.
 */

import { state } from './state.js';
import { escapeHtml, val } from './helpers.js';
import { fetchJsonSafe, loadPartitionedEngineData, saveCellToServer } from './data-loader.js';
import {
    applyRevisionDataToRows,
    assignRevisionKeys,
    getRevisionKey,
    handleExportRevision,
    handleImportRevisionFile,
    loadRevisionData,
    setRowRevision,
    setRowRevisionNoSave,
    updateRevisionSelectVisual
} from './revision.js';
import {
    applyColumnView,
    initColumnResize,
    loadColumnViewPreference,
    loadColumnWidths,
    saveColumnViewPreference
} from './column-view.js';
import { isInlineEditableTarget, startInlineEdit, cancelInlineEdit } from './cell-editor.js';
import { loadPdfClear, loadPdfWithPage, renderPdfPage } from './pdf-viewer.js';
import { updateSchemasInline, renderSelectedRowPosPanel, renderSelectedRowPosTop } from './schemas.js';
import { getEngineJsonForRow } from './helpers.js';
import {
    changePage,
    getRowsForBulkScope,
    moveSelectionBy,
    renderPagination,
    renderTable,
    syncAutoPageSize,
    refreshSelectedRowVisual
} from './qa-table.js';

const $ = (id) => document.getElementById(id);
let filterTimeout = null;
let resizeTimer = null;
const MODAL_FIELD_KEYS = ['pn_final', 'criterio_pn', 'designation_gesa', 'norma'];

function isRecordModalOpen() {
    const modal = $('qaRecordModal');
    return !!modal && !modal.hasAttribute('hidden');
}

function getRowByRevisionKey(revisionKey) {
    return state.allData.find(item => getRevisionKey(item) === revisionKey);
}

function fillRecordModal(row, revisionKey) {
    const form = $('qaRecordModalForm');
    if (!(form instanceof HTMLFormElement)) return;

    form.dataset.revisionKey = revisionKey;
    $('qaModalId').value = String(row?.ID ?? '');
    $('qaModalPn').value = String(row?.['PART NO.'] ?? row?.pn ?? '');
    $('qaModalBook').value = String(row?.engine_model ?? '');
    $('qaModalPage').value = String(row?.['Source Page'] ?? '');
    $('qaModalPos').value = String(row?.POS ?? '');

    $('qaModalRevisionEstado').value = String(row?.qa_revision_estado || '');
    $('qaModalRevisionAccion').value = String(row?.qa_revision_accion || '');
    $('qaModalPnFinal').value = String(row?.pn_final ?? '');
    $('qaModalCriterioPn').value = String(row?.criterio_pn ?? '');
    $('qaModalDesignationGesa').value = String(row?.designation_gesa ?? '');
    $('qaModalNorma').value = String(row?.norma ?? '');

    const status = $('qaRecordModalStatus');
    if (status) status.textContent = '';
}

function openRecordModal(revisionKey) {
    const row = getRowByRevisionKey(revisionKey);
    const modal = $('qaRecordModal');
    if (!row || !modal) return;
    fillRecordModal(row, revisionKey);
    modal.removeAttribute('hidden');
    const firstInput = $('qaModalRevisionEstado');
    if (firstInput instanceof HTMLElement) firstInput.focus();
}

function closeRecordModal() {
    const modal = $('qaRecordModal');
    if (!modal) return;
    modal.setAttribute('hidden', '');
    const status = $('qaRecordModalStatus');
    if (status) status.textContent = '';
}

async function handleRecordModalSubmit(event) {
    event.preventDefault();
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
    const nextValues = {
        pn_final: String($('qaModalPnFinal')?.value || ''),
        criterio_pn: String($('qaModalCriterioPn')?.value || ''),
        designation_gesa: String($('qaModalDesignationGesa')?.value || ''),
        norma: String($('qaModalNorma')?.value || '')
    };

    try {
        const changedFields = MODAL_FIELD_KEYS.filter(key => String(row?.[key] ?? '') !== String(nextValues[key] ?? ''));
        if (changedFields.length > 0) {
            const engineFile = getEngineJsonForRow(row);
            if (!engineFile) throw new Error('No se pudo determinar el archivo engine_*.json del registro.');
            for (const fieldKey of changedFields) {
                await saveCellToServer(engineFile, row.ID, fieldKey, nextValues[fieldKey]);
                row[fieldKey] = nextValues[fieldKey];
            }
        }

        setRowRevision(row, nextEstado, nextAccion);
        state.selectedRevisionRowKey = revisionKey;
        renderTable();
        renderPagination();
        closeRecordModal();
    } catch (error) {
        console.error('Error guardando formulario modal:', error);
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

function applyBookSelection(bookValue, options = {}) {
    const {
        pageValue = null,
        fallbackToFirstAvailablePage = true,
        render = true,
        updatePdf = true
    } = options;

    const normalizedBook = String(bookValue || '').trim();
    const bookFilterSelect = $('bookFilterSelect');
    const pageInput = $('pageFilterInput');

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

    if (pageInput) pageInput.value = resolvedPage;
    if (resolvedPage) state.filters.page = resolvedPage;
    else delete state.filters.page;

    if (render) {
        state.currentPage = 1;
        renderTable();
        renderPagination();
    }

    if (updatePdf) {
        if (normalizedBook && resolvedPage) loadPdfWithPage(normalizedBook, resolvedPage);
        else loadPdfClear();
    }

    updateSchemasInline(normalizedBook, resolvedPage);
}

function setPageFilterValue(pageValue) {
    const pageInput = $('pageFilterInput');
    const selectedBook = $('bookFilterSelect')?.value || '';
    const normalizedPage = pageValue ? String(pageValue) : '';
    if (pageInput) pageInput.value = normalizedPage;
    if (!normalizedPage) delete state.filters.page;
    else state.filters.page = normalizedPage;

    state.currentPage = 1;
    renderTable();
    renderPagination();

    if (selectedBook && normalizedPage) loadPdfWithPage(selectedBook, normalizedPage);
    else if (!normalizedPage) loadPdfClear();

    updateSchemasInline(selectedBook, normalizedPage);
}

function goToNextBookPage() {
    const book = $('bookFilterSelect')?.value || '';
    const pages = getBookPages(book);
    if (!pages.length) return;
    const currentValue = Number($('pageFilterInput')?.value || 0);
    const currentIndex = pages.indexOf(currentValue);
    const targetPage = (currentIndex === -1 || currentIndex === pages.length - 1) ? pages[0] : pages[currentIndex + 1];
    setPageFilterValue(targetPage);
}

function goToPrevBookPage() {
    const book = $('bookFilterSelect')?.value || '';
    const pages = getBookPages(book);
    if (!pages.length) return;
    const currentValue = Number($('pageFilterInput')?.value || 0);
    const currentIndex = pages.indexOf(currentValue);
    const targetPage = currentIndex <= 0 ? pages[pages.length - 1] : pages[currentIndex - 1];
    setPageFilterValue(targetPage);
}

function clearFilters() {
    document.querySelectorAll('.filter-input[data-filter]').forEach(input => { input.value = ''; });
    document.querySelectorAll('.filter-select[data-filter]').forEach(select => { select.value = ''; });
    state.filters = {};
    state.currentPage = 1;
    renderTable();
    renderPagination();
    loadPdfClear();
    updateSchemasInline('', '');
}

function handleFilter(event) {
    const input = event.target;
    const filterKey = input.dataset.filter;
    if (!filterKey) return;
    const filterValue = input.value.trim();
    if (filterValue === '') delete state.filters[filterKey];
    else state.filters[filterKey] = filterValue;

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

function applyBulkQuickMode(quickMode) {
    const scopeSelect = $('bulkScopeSelect');
    if (!scopeSelect) return;

    const quickMap = {
        revok: { estado: 'revisado', accion: null, label: 'revisión OK' },
        revempty: { estado: '', accion: null, label: 'revisión vacía' },
        validate: { estado: null, accion: 'mantener', label: 'acción Import' },
        review: { estado: null, accion: 'revisar', label: 'acción Revisar' },
        discard: { estado: null, accion: 'eliminar', label: 'acción Eliminar' },
        clear: { estado: '', accion: '', label: 'vaciado' }
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

    targetRows.forEach(row => {
        const nextEstado = targetValues.estado === null ? String(row.qa_revision_estado || '') : targetValues.estado;
        const nextAccion = targetValues.accion === null ? String(row.qa_revision_accion || '') : targetValues.accion;
        setRowRevisionNoSave(row, nextEstado, nextAccion);
    });

    renderTable();
    renderPagination();
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

        const newData = await tryLoadFirstJson(['MILU_New_v507.json', 'MILU_New_v506.json']);
        if (Array.isArray(newData)) state.newPnSet = new Set(newData.map(item => item.pn));

        const supersededData = await tryLoadFirstJson(['MILU_Superseded_v507.json', 'MILU_Superseded_v506.json']);
        if (Array.isArray(supersededData)) state.supersededPnSet = new Set(supersededData.map(item => item.pn));

        const publication = await tryLoadFirstJson(['publication_map.json']);
        if (publication && typeof publication === 'object') state.publishedMap = new Map(Object.entries(publication));

        const productExportData = await tryLoadFirstJson(['product_export_v507.json', 'product-export-2026-03-29-11-07.json']);
        if (Array.isArray(productExportData)) state.productExportPnSet = new Set(productExportData.map(item => item.pn));

        state.currentPage = 1;
        state.sortKey = 'book_page_pos';
        state.sortAsc = true;
        state.filters = {};

        assignRevisionKeys(state.allData);
        await loadRevisionData();
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

        if (syncAutoPageSize()) {
            state.currentPage = 1;
            renderTable();
            renderPagination();
        }
    } catch (error) {
        console.error('Error cargando datos:', error);
        $('tbody').innerHTML = `<tr><td colspan="53" class="error">Error cargando datos: ${escapeHtml(error.message)}</td></tr>`;
        $('stats').innerHTML = '<span class="stat bad">Error cargando datos</span>';
    }
}

function attachGlobalEvents() {
    $('prevBtn')?.addEventListener('click', () => changePage(-1));
    $('nextBtn')?.addEventListener('click', () => changePage(1));
    document.querySelector('thead')?.addEventListener('click', handleSort);

    document.querySelectorAll('.filter-input[data-filter], .filter-select[data-filter]').forEach(elem => {
        elem.addEventListener('input', handleFilter);
        elem.addEventListener('change', handleFilter);
    });

    $('nextBookPageBtn')?.addEventListener('click', goToNextBookPage);
    $('prevBookPageBtn')?.addEventListener('click', goToPrevBookPage);
    $('clearFiltersBtn')?.addEventListener('click', clearFilters);

    $('sortBookPagePosBtn')?.addEventListener('click', () => {
        if (state.sortKey === 'book_page_pos') state.sortAsc = !state.sortAsc;
        else { state.sortKey = 'book_page_pos'; state.sortAsc = true; }
        state.currentPage = 1;
        renderTable();
        renderPagination();
    });

    $('columnViewSelect')?.addEventListener('change', (event) => {
        state.columnView = ['qa', 'focus', 'pdf'].includes(event.target.value) ? event.target.value : 'qa';
        saveColumnViewPreference();
        renderTable();
        renderPagination();
        applyColumnView();
    });

    $('bookFilterSelect')?.addEventListener('change', () => {
        applyBookSelection($('bookFilterSelect')?.value || '', {
            fallbackToFirstAvailablePage: true,
            render: true,
            updatePdf: true
        });
    });

    $('pageFilterInput')?.addEventListener('input', () => {
        const selectedBook = $('bookFilterSelect')?.value || '';
        const newPage = $('pageFilterInput')?.value || '';
        if (selectedBook && newPage) loadPdfWithPage(selectedBook, newPage);
        else loadPdfClear();
        updateSchemasInline(selectedBook, newPage);
    });

    $('exportRevisionBtn')?.addEventListener('click', handleExportRevision);

    const revisionFileInput = $('revisionFileInput');
    $('importRevisionBtn')?.addEventListener('click', () => revisionFileInput?.click());
    revisionFileInput?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            await handleImportRevisionFile(file);
            applyRevisionDataToRows(state.allData);
            state.currentPage = 1;
            renderTable();
            renderPagination();
        } catch (error) {
            alert(`Error importando revisión: ${error.message}`);
        } finally {
            revisionFileInput.value = '';
        }
    });

    $('bulkRevOkBtn')?.addEventListener('click', () => applyBulkQuickMode('revok'));
    $('bulkRevEmptyBtn')?.addEventListener('click', () => applyBulkQuickMode('revempty'));
    $('bulkValidateBtn')?.addEventListener('click', () => applyBulkQuickMode('validate'));
    $('bulkReviewBtn')?.addEventListener('click', () => applyBulkQuickMode('review'));
    $('bulkDiscardBtn')?.addEventListener('click', () => applyBulkQuickMode('discard'));
    $('bulkClearBtn')?.addEventListener('click', () => applyBulkQuickMode('clear'));

    document.addEventListener('keydown', (event) => {
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

        const openModalBtn = target.closest('button[data-open-record-modal="true"]');
        if (openModalBtn) {
            const revisionKey = openModalBtn.dataset.revisionKey;
            if (!revisionKey) return;
            openRecordModal(revisionKey);
            return;
        }

        const quickBtn = target.closest('button[data-quick-mode]');
        if (quickBtn) {
            const revisionKey = quickBtn.dataset.revisionKey;
            const quickMode = quickBtn.dataset.quickMode;
            if (!revisionKey) return;
            const row = state.allData.find(item => getRevisionKey(item) === revisionKey);
            if (!row) return;
            const quickMap = {
                revok: { estado: 'revisado', accion: null },
                revempty: { estado: '', accion: null },
                validate: { estado: null, accion: 'mantener' },
                review: { estado: null, accion: 'revisar' },
                discard: { estado: null, accion: 'eliminar' }
            };
            const targetValues = quickMap[quickMode];
            if (!targetValues) return;
            const nextEstado = targetValues.estado === null ? String(row.qa_revision_estado || '') : targetValues.estado;
            const nextAccion = targetValues.accion === null ? String(row.qa_revision_accion || '') : targetValues.accion;
            setRowRevision(row, nextEstado, nextAccion);
            const tr = quickBtn.closest('tr');
            const estadoSelect = tr?.querySelector('select[data-revision-field="estado"]');
            const accionSelect = tr?.querySelector('select[data-revision-field="accion"]');
            if (estadoSelect instanceof HTMLSelectElement) { estadoSelect.value = nextEstado; updateRevisionSelectVisual(estadoSelect); }
            if (accionSelect instanceof HTMLSelectElement) { accionSelect.value = nextAccion; updateRevisionSelectVisual(accionSelect); }
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
    });

    tbody?.addEventListener('dblclick', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const editableCell = target.closest('td[data-editable="true"]');
        if (editableCell) {
            event.preventDefault();
            event.stopPropagation();
            startInlineEdit(editableCell);
        }
    });

    tbody?.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        const revisionField = target.dataset.revisionField;
        const revisionKey = target.dataset.revisionKey;
        if (!revisionField || !revisionKey) return;
        const row = state.allData.find(item => getRevisionKey(item) === revisionKey);
        if (!row) return;
        const estado = revisionField === 'estado' ? target.value : String(row.qa_revision_estado || '');
        const accion = revisionField === 'accion' ? target.value : String(row.qa_revision_accion || '');
        setRowRevision(row, estado, accion);
        updateRevisionSelectVisual(target);
    });

    window.addEventListener('resize', () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (state.currentPdfSource && state.currentPdfPageNumber > 0) {
                renderPdfPage(state.currentPdfSource, state.currentPdfPageNumber).catch(error => console.error('Error reajustando PDF:', error));
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
    $('qaRecordModalForm')?.addEventListener('submit', handleRecordModalSubmit);
}

function init() {
    initColumnResize();
    loadColumnViewPreference();
    attachGlobalEvents();
    loadData();
}

init();
