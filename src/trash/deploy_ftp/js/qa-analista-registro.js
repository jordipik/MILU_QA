import { state } from './state.js';
import { checkSaveBackendConnection, loadPartitionedEngineData, saveCellToServer } from './data-loader.js';
import { assignRevisionKeys, applyRevisionDataToRows, normalizeEstadoToNew } from './revision.js';
import { initPdfZoomControls, loadPdfClear, loadPdfWithPage, setPdfSelection } from './pdf-viewer.js';
import { evaluateRowQaChecks, getAllQaCheckCodes, getQaCheckDefinitions, getQaCheckLabel } from './qa-checks.js';
import { getQaArticulosFieldValue } from './qa-articulos-fields.js';
import { showToast } from './toast.js';

const $ = (id) => document.getElementById(id);

function legacyAlertType(message) {
    const text = String(message || '').toLowerCase();
    if (text.startsWith('no se pudo') || text.includes('error')) return 'error';
    if (text.includes('primero debes') || text.includes('no se encontro') || text.includes('ya estas')) return 'warning';
    if (text.includes('solo lectura')) return 'info';
    return 'warning';
}

function alert(message) {
    showToast(String(message || ''), legacyAlertType(message));
}

const CRITICAL_CODES = new Set(getAllQaCheckCodes());
const QA_PROCESS_DEFINITIONS = getQaCheckDefinitions();

let currentRow = null;
let reviewedHistory = [];
const TOTAL_PROCESS_CHECKS = QA_PROCESS_DEFINITIONS.length;
let lastReadonlyAlertAt = 0;

const ANALISTA_WRITE_CONTROL_IDS = [
    'saveFieldsBtn',
    'markOkBtn',
    'markKoBtn',
    'editPnFinal',
    'editDesignationFinal',
    'editWeightFinal',
    'editMeasurementFinal',
    'editRevisionEstado',
    'editRevisionAccion'
];

function txt(value, fallback = '-') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
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

function qaField(row, fieldName, fallback = '') {
    return getQaArticulosFieldValue(row, fieldName, fallback);
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
        const bookA = String(qaField(a, 'engine_model', '') ?? '').trim();
        const bookB = String(qaField(b, 'engine_model', '') ?? '').trim();
        const byBook = bookA.localeCompare(bookB, 'es', { numeric: true, sensitivity: 'base' });
        if (byBook !== 0) return byBook;

        const byPage = getPageSortValue(qaField(a, 'source_page', '')) - getPageSortValue(qaField(b, 'source_page', ''));
        if (byPage !== 0) return byPage;

        const byPos = getPosSortValue(qaField(a, 'pos_final', '')) - getPosSortValue(qaField(b, 'pos_final', ''));
        if (byPos !== 0) return byPos;

        return String(a?.ID ?? '').localeCompare(String(b?.ID ?? ''), 'es', { numeric: true, sensitivity: 'base' });
    });
}

function getQueueRows() {
    const engineFilter = String($('engineFilterSelect')?.value ?? '').trim();
    const sourceRows = engineFilter
        ? state.allData.filter((row) => String(qaField(row, 'engine_model', '') ?? '').trim() === engineFilter)
        : state.allData;
    return sortRowsByBookPagePos(sourceRows);
}

function getSidebarSearchTerm() {
    return String($('sidebarSearchInput')?.value ?? '').trim().toLowerCase();
}

function rowMatchesSidebarSearch(row, term) {
    if (!term) return true;
    const haystack = [
        qaField(row, 'engine_model', ''),
        qaField(row, 'source_page', ''),
        qaField(row, 'pos_final', ''),
        qaField(row, 'pn_excel', ''),
        qaField(row, 'pn_final', ''),
        qaField(row, 'designation_final', ''),
        row?.ID
    ].map(value => String(value ?? '').toLowerCase());
    return haystack.some(text => text.includes(term));
}

function getRowQuickOutcome(row) {
    const verdict = computeVerdict(row);
    return verdict.status === 'ok' ? 'ok' : 'ko';
}

function formatBookCompact(value) {
    return String(value ?? '')
        .trim()
        .replace(/^engine_/i, '')
        .replace(/\.json$/i, '')
        .replace(/\s+/g, '')
        .toLowerCase() || '-';
}

function setBackendBadge(status, text) {
    const badge = $('backendBadge');
    if (!badge) return;
    badge.classList.remove('checking', 'online', 'offline');
    badge.classList.add(status);
    badge.textContent = text;
    state.backendStatusMessage = text;
}

function applyBackendWriteMode() {
    const writable = state.backendWritable !== false;

    ANALISTA_WRITE_CONTROL_IDS.forEach((id) => {
        const elem = $(id);
        if (elem instanceof HTMLButtonElement || elem instanceof HTMLInputElement || elem instanceof HTMLSelectElement) {
            elem.disabled = !writable;
            elem.title = writable ? '' : 'Modo solo lectura: backend sin conexion.';
        }
    });

    const statusText = $('statusText');
    if (!writable && statusText instanceof HTMLElement) {
        statusText.textContent = 'Modo solo lectura: backend sin conexion. Los cambios no se guardan.';
    }
}

function ensureBackendWritable(actionLabel = 'guardar cambios') {
    if (state.backendWritable !== false) return true;

    const now = Date.now();
    if (now - lastReadonlyAlertAt > 1500) {
        alert(`Modo solo lectura: no se puede ${actionLabel} porque el backend no esta disponible.`);
        lastReadonlyAlertAt = now;
    }
    return false;
}

async function refreshBackendBadge() {
    setBackendBadge('checking', 'Backend: comprobando...');
    try {
        const result = await checkSaveBackendConnection();
        if (result.ok) {
            state.backendWritable = true;
            setBackendBadge('online', 'Backend: online');
            applyBackendWriteMode();
            return;
        }

        state.backendWritable = false;
        setBackendBadge('offline', 'Backend: offline (solo lectura)');
        applyBackendWriteMode();
    } catch (_) {
        state.backendWritable = false;
        setBackendBadge('offline', 'Backend: offline (solo lectura)');
        applyBackendWriteMode();
    }
}

function buildEngineOptions() {
    const select = $('engineFilterSelect');
    if (!(select instanceof HTMLSelectElement)) return;

    const engineModels = [...new Set(
        state.allData
            .map((row) => String(qaField(row, 'engine_model', '') ?? '').trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));

    select.innerHTML = '<option value="">Todos los libros</option>'
        + engineModels.map((engine) => `<option value="${engine}">${engine}</option>`).join('');
}

function getActiveCodes() {
    return (state.qaErrorCheckDefinitions || [])
        .map((def) => String(def?.code ?? '').trim())
        .filter(Boolean);
}

function getRevisionKey(row) {
    return String(row?.__qa_revision_key ?? '').trim();
}

function renderSelectedContext(row) {
    const target = $('selectedContext');
    if (!(target instanceof HTMLElement)) return;

    if (!row) {
        target.innerHTML = [
            'PN: -',
            'Libro: -',
            'Pag: -',
            'Pos: -'
        ].map((label) => `<span class="context-pill">${label}</span>`).join('');
        return;
    }

    const pn = txt(qaField(row, 'pn_final', ''));
    const book = txt(qaField(row, 'engine_model', ''));
    const page = txt(qaField(row, 'source_page', ''));
    const pos = txt(qaField(row, 'pos_final', ''));

    target.innerHTML = [
        `PN: ${escapeHtml(pn)}`,
        `Libro: ${escapeHtml(book)}`,
        `Pag: ${escapeHtml(page)}`,
        `Pos: ${escapeHtml(pos)}`,
        `ID: ${escapeHtml(txt(row?.ID))}`
    ].map((label) => `<span class="context-pill">${label}</span>`).join('');
}

function buildHistoryEntry(row) {
    const failedChecks = getRowCodes(row).length;
    return {
        revisionKey: getRevisionKey(row),
        id: txt(row?.ID, ''),
        book: formatBookCompact(qaField(row, 'engine_model', '')),
        page: txt(qaField(row, 'source_page', ''), ''),
        pos: txt(qaField(row, 'pos_final', ''), ''),
        pn: txt(qaField(row, 'pn_final', ''), ''),
        failedChecks,
        passedChecks: Math.max(TOTAL_PROCESS_CHECKS - failedChecks, 0),
        outcome: getRowQuickOutcome(row)
    };
}

function upsertReviewedHistory(row) {
    if (!row) return;
    const entry = buildHistoryEntry(row);
    if (!entry.revisionKey) return;

    reviewedHistory = reviewedHistory.filter((item) => item.revisionKey !== entry.revisionKey);
    reviewedHistory.unshift(entry);
}

function renderReviewedHistory() {
    const list = $('reviewLogList');
    const summary = $('reviewLogSummary');
    if (!(list instanceof HTMLElement) || !(summary instanceof HTMLElement)) return;

    const searchTerm = getSidebarSearchTerm();
    const rows = getQueueRows().filter(row => rowMatchesSidebarSearch(row, searchTerm));
    const okCount = rows.filter(row => getRowCodes(row).length === 0).length;
    const koCount = rows.length - okCount;
    summary.textContent = `${rows.length} registros · ${okCount} OK · ${koCount} KO`;

    if (!rows.length) {
        list.innerHTML = '<tr class="left-empty-row"><td colspan="5">Sin coincidencias.</td></tr>';
        return;
    }

    const currentKey = getRevisionKey(currentRow);
    list.innerHTML = rows.map((row) => {
        const revisionKey = getRevisionKey(row);
        const isSelected = revisionKey && revisionKey === currentKey;
        const statusOk = getRowCodes(row).length === 0;
        const statusLabel = statusOk ? 'OK' : 'KO';
        const statusClass = statusOk ? 'ok' : 'ko';

        return `<tr class="left-row ${isSelected ? 'selected' : ''}" data-revision-key="${escapeHtml(revisionKey)}" aria-selected="${isSelected ? 'true' : 'false'}">
            <td title="${escapeHtml(String(qaField(row, 'engine_model', '-') ?? '-'))}">${escapeHtml(String(qaField(row, 'engine_model', '-') ?? '-'))}</td>
            <td title="${escapeHtml(String(qaField(row, 'source_page', '-') ?? '-'))}">${escapeHtml(String(qaField(row, 'source_page', '-') ?? '-'))}</td>
            <td title="${escapeHtml(String(qaField(row, 'pos_final', '-') ?? '-'))}">${escapeHtml(String(qaField(row, 'pos_final', '-') ?? '-'))}</td>
            <td class="pn" title="${escapeHtml(String(qaField(row, 'pn_final', '-') ?? '-'))}">${escapeHtml(String(qaField(row, 'pn_final', '-') ?? '-'))}</td>
            <td><span class="row-status ${statusClass}">${statusLabel}</span></td>
        </tr>`;
    }).join('');
}

function buildCorrelationRows(row) {
    const qtyUnits = [txt(qaField(row, 'qty_excel', ''), ''), txt(qaField(row, 'qty_units_excel', ''), '')].filter(Boolean).join(' / ');
    const finalQtyUnits = [txt(qaField(row, 'qty_final', ''), ''), txt(qaField(row, 'qty_units_final', ''), '')].filter(Boolean).join(' / ');

    return [
        {
            field: 'Designation',
            raw: txt(qaField(row, 'designation_excel', '')),
            gesa: txt(qaField(row, 'designation_gesa', '')),
            sust: txt(qaField(row, 'hierarchie_final', '')),
            final: txt(qaField(row, 'designation_final', '')),
            pdf: txt(qaField(row, 'designation_pdf', ''))
        },
        {
            field: 'Part Number',
            raw: txt(qaField(row, 'pn_excel', '')),
            gesa: txt(qaField(row, 'pn_excel', '')),
            sust: txt(qaField(row, 'new_pn_final', '')),
            final: txt(qaField(row, 'pn_final', '')),
            pdf: txt(qaField(row, 'pn_pdf', ''))
        },
        {
            field: 'PN criterio',
            raw: txt(qaField(row, 'pn_excel', '')),
            gesa: txt(row?.criterio_pn),
            sust: txt(qaField(row, 'hierarchie_final', '')),
            final: txt(qaField(row, 'pn_final', '')),
            pdf: txt(qaField(row, 'pn_pdf', ''))
        },
        {
            field: 'Weight',
            raw: txt(qaField(row, 'weight_excel', '')),
            gesa: txt(qaField(row, 'weight_number_gesa', '')),
            sust: '-',
            final: txt(qaField(row, 'weight_final', '')),
            pdf: txt(qaField(row, 'weight_pdf', ''))
        },
        {
            field: 'Measurement',
            raw: txt(qaField(row, 'measure_excel', '')),
            gesa: txt(qaField(row, 'measure_number_gesa', '')),
            sust: '-',
            final: txt(qaField(row, 'measure_final', '')),
            pdf: txt(qaField(row, 'measure_pdf', ''))
        },
        {
            field: 'FG / FGS',
            raw: txt(qaField(row, 'fg_fgs_excel', '')),
            gesa: txt(row?.fg_code),
            sust: '-',
            final: txt(qaField(row, 'fg_fgs_final', '')),
            pdf: txt(qaField(row, 'fg_fgs_pdf', ''))
        },
        {
            field: 'Model / Type',
            raw: txt(qaField(row, 'model_type_final', '')),
            gesa: txt(row?.model),
            sust: '-',
            final: txt(qaField(row, 'engine_model', '')),
            pdf: txt(qaField(row, 'engine_model', ''))
        },
        {
            field: 'Qty / Units',
            raw: qtyUnits || '-',
            gesa: txt(qaField(row, 'weight_units_gesa', '')),
            sust: '-',
            final: finalQtyUnits || '-',
            pdf: finalQtyUnits || '-'
        },
        {
            field: 'Norma',
            raw: txt(qaField(row, 'norma_excel', '')),
            gesa: txt(qaField(row, 'norma_gesa', '')),
            sust: '-',
            final: txt(qaField(row, 'norma_final', '')),
            pdf: txt(qaField(row, 'norma_pdf', ''))
        },
        {
            field: 'Sustitucion',
            raw: '-',
            gesa: txt(qaField(row, 'hierarchie_final', '')),
            sust: txt(qaField(row, 'is_subst_final', '')),
            final: txt(qaField(row, 'new_pn_final', '')),
            pdf: txt(qaField(row, 'new_pn_final', ''))
        },
        {
            field: 'Imagenes / Esquemas',
            raw: txt(qaField(row, 'ruta_foto', '')),
            gesa: txt(qaField(row, 'ruta_esquemas_pos', '')),
            sust: txt(qaField(row, 'esquemas', '')),
            final: txt(qaField(row, 'esquemas_circulos', '')),
            pdf: txt(qaField(row, 'esquemas_circulos_all', ''))
        }
    ];
}

function renderCorrelationMatrix(row) {
    const body = $('correlationBody');
    if (!(body instanceof HTMLElement)) return;

    if (!row) {
        body.innerHTML = '<tr><td colspan="6">Selecciona un registro para ver la correlacion.</td></tr>';
        return;
    }

    const rows = buildCorrelationRows(row);
    body.innerHTML = rows.map((item) => {
        const rawNorm = normalizeString(item.raw).toLowerCase();
        const finalNorm = normalizeString(item.final).toLowerCase();
        const finalDiffClass = rawNorm && finalNorm && rawNorm !== finalNorm ? 'final-diff' : '';
        return `<tr>
            <td>${escapeHtml(item.field)}</td>
            <td class="correlation-val">${escapeHtml(item.raw)}</td>
            <td class="correlation-val">${escapeHtml(item.gesa)}</td>
            <td class="correlation-val">${escapeHtml(item.sust || '-')}</td>
            <td class="correlation-val ${finalDiffClass}">${escapeHtml(item.final)}</td>
            <td class="correlation-val">${escapeHtml(item.pdf || '-')}</td>
        </tr>`;
    }).join('');
}

function renderHeaderStrip(row) {
    const posTarget = $('headPosValue');
    const pnTarget = $('headPnValue');
    const designationTarget = $('headDesignationValue');
    if (!(posTarget instanceof HTMLElement) || !(pnTarget instanceof HTMLElement) || !(designationTarget instanceof HTMLElement)) return;

    if (!row) {
        posTarget.textContent = '-';
        pnTarget.textContent = '-';
        designationTarget.textContent = '-';
        return;
    }

    posTarget.textContent = txt(qaField(row, 'pos_final', ''));
    pnTarget.textContent = txt(qaField(row, 'pn_final', ''));
    designationTarget.textContent = txt(qaField(row, 'designation_final', ''));
}

function syncPdfWithCurrentRow(row) {
    if (!row) {
        setPdfSelection(null);
        loadPdfClear();
        return;
    }

    setPdfSelection(row);
    const book = String(qaField(row, 'engine_model', '') ?? '').trim();
    const page = String(qaField(row, 'source_page', '') ?? '').trim();

    if (book && page) {
        loadPdfWithPage(book, page).catch((error) => {
            console.error('No se pudo cargar el PDF del registro:', error);
        });
        return;
    }

    loadPdfClear();
}

function findRecordById(recordId, engineFilter) {
    const id = String(recordId ?? '').trim();
    if (!id) return null;

    const source = engineFilter
        ? state.allData.filter((row) => String(row?.engine_model ?? '').trim() === engineFilter)
        : state.allData;

    return source.find((row) => String(row?.ID ?? '').trim() === id) || null;
}

function getRowCodes(row) {
    return evaluateRowQaChecks(row, getAllQaCheckCodes()).codes;
}

function splitCodes(codes) {
    const critical = [];
    const major = [];
    codes.forEach((code) => {
        if (CRITICAL_CODES.has(code)) critical.push(code);
        else major.push(code);
    });
    return { critical, major };
}

function buildConsistencyWarnings(row) {
    const warnings = [];
    const designationRaw = normalizeString(qaField(row, 'designation_excel', ''));
    const designationFinal = normalizeString(qaField(row, 'designation_final', ''));
    const hasGesa = normalizeString(qaField(row, 'is_gesa_gesa', '')).toUpperCase() === 'SI';

    if (designationRaw && designationFinal && designationRaw.toLowerCase() !== designationFinal.toLowerCase()) {
        warnings.push('La designation raw y designation_final no coinciden exactamente.');
    }

    if (!hasGesa && normalizeString(qaField(row, 'measure_number_gesa', ''))) {
        warnings.push('Hay dimensions_gesa aunque el flag gessa no esta en SI.');
    }

    return warnings;
}

function computeVerdict(row) {
    const codes = getRowCodes(row);
    const { critical, major } = splitCodes(codes);
    const warnings = buildConsistencyWarnings(row);

    if (critical.length > 0 || major.length > 0) {
        return {
            status: 'ko',
            title: 'Estado: REGISTRO_KO',
            message: `Falla ${critical.length + major.length} checks del proceso (${critical.length} criticos).`,
            critical,
            major,
            warnings
        };
    }

    return {
        status: 'ok',
        title: 'Estado: REGISTRO_OK',
        message: warnings.length
            ? 'Todos los checks QA pasan, pero quedan avisos de consistencia entre fuentes.'
            : 'Todos los checks QA pasan. Registro listo para marcar como OK.',
        critical,
        major,
        warnings
    };
}

function renderProcessChecks(row, verdict) {
    const list = $('processList');
    const summary = $('processSummary');
    if (!(list instanceof HTMLElement) || !(summary instanceof HTMLElement)) return;

    const codes = getRowCodes(row);
    const codeSet = new Set(codes);

    const checks = QA_PROCESS_DEFINITIONS.map((definition) => {
        const code = String(definition?.code || '').trim();
        const label = String(definition?.label || code).trim() || code;
        const pass = !codeSet.has(code);

        return {
            id: code,
            title: label,
            pass,
            detail: pass ? `${label}: OK.` : `${label}: KO.`
        };
    });

    summary.textContent = `${checks.length} checks · ${checks.filter((c) => c.pass).length} pass · ${checks.filter((c) => !c.pass).length} fail`;

    list.innerHTML = checks.map((check) => {
        const cssState = check.pass ? 'pass' : (check.warn ? 'warn' : 'fail');
        const marker = check.pass ? 'OK' : (check.warn ? '!' : 'X');
        return `<li class="process-item ${cssState}">
            <span class="process-marker">${marker}</span>
            <div>
                <p class="process-title">${check.title}</p>
                <p class="process-detail">${check.detail}</p>
            </div>
        </li>`;
    }).join('');
}

function renderEvidence(row, verdict) {
    const evidence = $('evidenceList');
    if (!(evidence instanceof HTMLElement)) return;

    const pieces = [];
    pieces.push(`<li class="${verdict.status === 'ok' ? 'ok' : 'ko'}">Veredicto propuesto: ${verdict.title}</li>`);
    pieces.push(`<li>engine_model: ${txt(qaField(row, 'engine_model', ''))} · Source Page: ${txt(qaField(row, 'source_page', ''))}</li>`);
    pieces.push(`<li>ID: ${txt(row?.ID)} · PART NO.: ${txt(qaField(row, 'pn_excel', ''))} · POS: ${txt(qaField(row, 'pos_final', ''))}</li>`);

    const allCodes = [...verdict.critical, ...verdict.major];
    if (allCodes.length > 0) {
        allCodes.forEach((code) => {
            pieces.push(`<li class="ko">Check fallido: ${getQaCheckLabel(code) || code}</li>`);
        });
    } else {
        pieces.push('<li class="ok">No hay checks ERR fallidos para este registro.</li>');
    }

    verdict.warnings.forEach((warning) => {
        pieces.push(`<li>${warning}</li>`);
    });

    evidence.innerHTML = pieces.join('');
}

function renderHeader(row, verdict) {
    const meta = $('recordMeta');
    const globalVerdict = $('globalVerdict');
    const statusText = $('statusText');
    if (!(meta instanceof HTMLElement) || !(globalVerdict instanceof HTMLElement) || !(statusText instanceof HTMLElement)) return;

    meta.textContent = `ID=${txt(row?.ID, '')} | PN=${txt(qaField(row, 'pn_final', ''))} | POS=${txt(qaField(row, 'pos_final', ''))} | Libro=${txt(qaField(row, 'engine_model', ''))} | Pagina=${txt(qaField(row, 'source_page', ''))}`;

    globalVerdict.classList.remove('status-raw', 'status-ok', 'status-ko');
    globalVerdict.classList.add(verdict.status === 'ok' ? 'status-ok' : 'status-ko');
    globalVerdict.textContent = verdict.title;
    const failedChecks = getRowCodes(row).length;
    const passedChecks = Math.max(TOTAL_PROCESS_CHECKS - failedChecks, 0);
    statusText.textContent = `${verdict.message} Proceso: ${passedChecks}/${TOTAL_PROCESS_CHECKS} filtros correctos.`;
}

function syncOutcomeButtons(row) {
    const okBtn = $('markOkBtn');
    const koBtn = $('markKoBtn');
    if (!(okBtn instanceof HTMLButtonElement) || !(koBtn instanceof HTMLButtonElement)) return;

    okBtn.classList.remove('is-selected');
    koBtn.classList.remove('is-selected');

    const estado = normalizeEstadoToNew(qaField(row, 'qa_revision_estado', ''));
    if (estado === 'ok') okBtn.classList.add('is-selected');
    if (estado === 'pendiente') koBtn.classList.add('is-selected');
}

function fillEditForm(row) {
    $('editPnFinal').value = txt(qaField(row, 'pn_final', ''), '');
    $('editDesignationFinal').value = txt(qaField(row, 'designation_final', ''), '');
    $('editWeightFinal').value = txt(qaField(row, 'weight_final', ''), '');
    $('editMeasurementFinal').value = txt(qaField(row, 'measure_final', ''), '');
    $('editRevisionEstado').value = normalizeEstadoToNew(qaField(row, 'qa_revision_estado', ''));
    $('editRevisionAccion').value = txt(qaField(row, 'qa_revision_accion', ''), '');
}

function renderRecord(row) {
    currentRow = row;
    const verdict = computeVerdict(row);
    renderHeader(row, verdict);
    renderHeaderStrip(row);
    renderSelectedContext(row);
    renderCorrelationMatrix(row);
    renderProcessChecks(row, verdict);
    renderEvidence(row, verdict);
    fillEditForm(row);
    syncOutcomeButtons(row);
    syncPdfWithCurrentRow(row);
    renderReviewedHistory();
}

function syncCurrentRowReference() {
    if (!currentRow) return;
    const key = getRevisionKey(currentRow);
    if (!key) return;

    const updated = state.allData.find((row) => getRevisionKey(row) === key);
    if (updated) currentRow = updated;
}

async function revalidateCurrentRow() {
    if (!currentRow) {
        alert('Primero debes cargar un registro.');
        return;
    }

    syncCurrentRowReference();
    renderRecord(currentRow);
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

    const engineModel = String(qaField(row, 'engine_model', '') ?? '').trim();
    if (!engineModel) return '';
    if (/^engine_/i.test(engineModel)) return `${engineModel}.json`;
    return `engine_${engineModel}.json`;
}

async function saveCurrentFieldChanges() {
    if (!ensureBackendWritable('guardar cambios del registro')) return;

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
        ['pn_final', $('editPnFinal').value],
        ['designation_final', $('editDesignationFinal').value],
        ['weight_final', $('editWeightFinal').value],
        ['measure_final', $('editMeasurementFinal').value],
        ['qa_revision_estado', $('editRevisionEstado').value],
        ['qa_revision_accion', $('editRevisionAccion').value]
    ];

    for (const [field, value] of changes) {
        if (String(currentRow?.[field] ?? '') === String(value ?? '')) continue;
        await saveCellToServer(engineFile, id, field, value);
        currentRow[field] = value;
    }

    await revalidateCurrentRow();
}

async function setRevisionOutcome(kind) {
    if (!ensureBackendWritable('guardar el estado de revision')) return;

    if (!currentRow) {
        alert('Primero debes cargar un registro.');
        return;
    }

    $('editRevisionEstado').value = kind === 'ok' ? 'ok' : 'pendiente';
    $('editRevisionAccion').value = kind === 'ok' ? 'mantener' : 'revisar';
    await saveCurrentFieldChanges();
    upsertReviewedHistory(currentRow);
    renderReviewedHistory();
}

async function loadRecordFromControls() {
    const id = $('recordIdInput').value;
    const engineFilter = $('engineFilterSelect').value;
    const row = findRecordById(id, engineFilter);

    if (!row) {
        alert('No se encontro ningun registro con ese ID para el filtro seleccionado.');
        return;
    }

    currentRow = row;
    await revalidateCurrentRow();
}

async function loadNextRecord() {
    const queueRows = getQueueRows();
    const currentIndex = currentRow
        ? queueRows.findIndex((row) => getRevisionKey(row) === getRevisionKey(currentRow))
        : -1;

    const nextRow = queueRows[currentIndex + 1] || null;
    if (nextRow) {
        $('recordIdInput').value = txt(nextRow?.ID, '');
        currentRow = nextRow;
        await revalidateCurrentRow();
        return;
    }

    alert('Ya estas en el ultimo registro de la cola actual.');
}

async function initialize() {
    try {
        state.rightPanelTab = 'pdf';
        initPdfZoomControls();
        loadPdfClear();

        setBackendBadge('checking', 'Backend: modo minimo');
        const loadedRows = await loadPartitionedEngineData();
        const orderedRows = sortRowsByBookPagePos(loadedRows);
        const firstRow = orderedRows[0] || null;

        state.allData = firstRow ? [firstRow] : [];
        assignRevisionKeys(state.allData);
        applyRevisionDataToRows(state.allData);
        buildEngineOptions();
        reviewedHistory = [];
        renderReviewedHistory();
        applyBackendWriteMode();

        if (firstRow) {
            $('recordIdInput').value = txt(firstRow?.ID, '');
            currentRow = firstRow;
            renderRecord(firstRow);
        }

        await refreshBackendBadge();
    } catch (error) {
        state.backendWritable = false;
        setBackendBadge('offline', 'Backend: error');
        applyBackendWriteMode();
        const statusText = $('statusText');
        if (statusText) {
            statusText.textContent = `Error iniciando analista: ${error.message}`;
        }
        console.error(error);
    }
}

$('loadRecordBtn').addEventListener('click', () => {
    loadRecordFromControls().catch((error) => {
        alert(`No se pudo cargar el registro: ${error.message}`);
    });
});

$('revalidateBtn').addEventListener('click', () => {
    revalidateCurrentRow().catch((error) => {
        alert(`No se pudo revalidar: ${error.message}`);
    });
});

$('saveFieldsBtn').addEventListener('click', () => {
    saveCurrentFieldChanges().catch((error) => {
        alert(`No se pudieron guardar cambios: ${error.message}`);
    });
});

$('markOkBtn').addEventListener('click', () => {
    setRevisionOutcome('ok').catch((error) => {
        alert(`No se pudo marcar registro_ok: ${error.message}`);
    });
});

$('markKoBtn').addEventListener('click', () => {
    setRevisionOutcome('ko').catch((error) => {
        alert(`No se pudo marcar registro_ko: ${error.message}`);
    });
});

$('nextWithErrorsBtn').addEventListener('click', () => {
    loadNextRecord().catch((error) => {
        alert(`No se pudo cargar siguiente registro: ${error.message}`);
    });
});

$('nextRecordBtn').addEventListener('click', () => {
    loadNextRecord().catch((error) => {
        alert(`No se pudo cargar siguiente registro: ${error.message}`);
    });
});

$('recordIdInput').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    loadRecordFromControls().catch((error) => {
        alert(`No se pudo cargar el registro: ${error.message}`);
    });
});

$('engineFilterSelect').addEventListener('change', () => {
    const currentEngineFilter = String($('engineFilterSelect')?.value ?? '').trim();
    renderReviewedHistory();
    if (!currentEngineFilter || !currentRow) return;

    const rowEngine = String(qaField(currentRow, 'engine_model', '') ?? '').trim();
    if (rowEngine !== currentEngineFilter) {
        const nextInEngine = getQueueRows()[0] || null;
        if (nextInEngine) {
            currentRow = nextInEngine;
            $('recordIdInput').value = txt(nextInEngine?.ID, '');
            revalidateCurrentRow().catch((error) => {
                alert(`No se pudo cargar el registro del filtro: ${error.message}`);
            });
        }
    }
});

$('reviewLogList').addEventListener('click', (event) => {
    const targetItem = event.target.closest('tr[data-revision-key]');
    if (!(targetItem instanceof HTMLTableRowElement)) return;

    const revisionKey = String(targetItem.dataset.revisionKey || '').trim();
    if (!revisionKey) return;

    const row = state.allData.find((item) => getRevisionKey(item) === revisionKey);
    if (!row) return;

    currentRow = row;
    $('recordIdInput').value = txt(row?.ID, '');
    revalidateCurrentRow().catch((error) => {
        alert(`No se pudo cargar el registro seleccionado: ${error.message}`);
    });
});

$('sidebarSearchInput')?.addEventListener('input', () => {
    renderReviewedHistory();
});

initialize();