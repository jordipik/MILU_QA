const API = {
    status: '/export/status',
    runWordpress: '/export/run-wordpress',
    file: (name) => `/export/file?name=${encodeURIComponent(name)}`,
    download: (name) => name
        ? `/export/download?name=${encodeURIComponent(name)}`
        : '/export/download'
};

const TAB_CONFIG = {
    new: {
        label: 'New',
        jsonCandidates: ['milu_wp_import.json', 'milu_wp_new_import.json'],
        csvCandidates: ['milu_wp_import.csv', 'milu_wp_new_import.csv'],
        columns: [
            { key: 'pn', label: 'pn' },
            { key: 'designation_final', label: 'designation_final' },
            { key: 'measure_final', label: 'measure_final' },
            { key: 'weight_final', label: 'weight_final' },
            { key: 'motores', label: 'motores' },
            { key: 'apariciones', label: 'apariciones' },
            { key: 'qa_revision_estado', label: 'qa_revision_estado' },
            { key: 'qa_revision_accion', label: 'qa_revision_accion' }
        ]
    },
    superseded: {
        label: 'Superseded',
        jsonCandidates: ['milu_wp_superseded.json', 'milu_wp_superseded_import.json'],
        csvCandidates: ['milu_wp_superseded.csv', 'milu_wp_superseded_import.csv'],
        columns: [
            { key: 'pn', label: 'pn' },
            { key: 'pn_new', label: 'pn_new' },
            { key: 'sust_superseded_list', label: 'sust_superseded_list' },
            { key: 'designation_final', label: 'designation_final' },
            { key: 'measure_final', label: 'measure_final' },
            { key: 'weight_final', label: 'weight_final' }
        ]
    },
    pending: {
        label: 'Pending',
        jsonCandidates: ['milu_wp_pending_review.json'],
        csvCandidates: ['milu_wp_pending_review.csv'],
        columns: [
            { key: 'pn', label: 'pn' },
            { key: 'designation_final', label: 'designation_final' },
            { key: 'measure_final', label: 'measure_final' },
            { key: 'weight_final', label: 'weight_final' },
            { key: 'motores', label: 'motores' },
            { key: 'apariciones', label: 'apariciones' },
            { key: 'qa_revision_estado', label: 'qa_revision_estado' },
            { key: 'qa_revision_accion', label: 'qa_revision_accion' }
        ]
    },
    discarded: {
        label: 'Discarded',
        jsonCandidates: ['milu_wp_discarded.json'],
        csvCandidates: ['milu_wp_discarded.csv'],
        columns: [
            { key: 'pn', label: 'pn' },
            { key: 'designation_final', label: 'designation_final' },
            { key: 'measure_final', label: 'measure_final' },
            { key: 'weight_final', label: 'weight_final' },
            { key: 'motores', label: 'motores' },
            { key: 'apariciones', label: 'apariciones' },
            { key: 'qa_revision_estado', label: 'qa_revision_estado' },
            { key: 'qa_revision_accion', label: 'qa_revision_accion' }
        ]
    }
};

const state = {
    currentTab: 'new',
    loading: false,
    status: null,
    sources: {
        new: '',
        superseded: '',
        pending: '',
        discarded: ''
    },
    data: {
        new: [],
        superseded: [],
        pending: [],
        discarded: []
    },
    filters: {
        searchPn: '',
        motor: '',
        qaEstado: ''
    }
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(isoString) {
    if (!isoString) return '-';
    try {
        return new Date(isoString).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' });
    } catch (_) {
        return String(isoString);
    }
}

function showToast(message, type = 'info') {
    const container = $('ewpToastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `ewp-toast ${type}`;
    toast.textContent = String(message || '');
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 220ms ease';
        setTimeout(() => toast.remove(), 220);
    }, 2600);
}

function setLoading(loading, message = '') {
    state.loading = Boolean(loading);
    const status = $('ewpStatusText');
    if (status) status.textContent = message || (state.loading ? 'Cargando...' : 'Listo');

    ['ewpRunBtn', 'ewpRefreshBtn', 'ewpDownloadBtn'].forEach((id) => {
        const button = $(id);
        if (button) button.disabled = state.loading;
    });
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    let payload = null;

    try {
        payload = await response.json();
    } catch (_) {
        payload = null;
    }

    if (!response.ok || (payload && payload.ok === false)) {
        const message = payload?.error || `HTTP ${response.status}`;
        throw new Error(String(message));
    }

    return payload;
}

function normalizeWordpressRow(raw = {}) {
    return {
        pn: String(raw.pn || raw.sku || '').trim(),
        pn_new: String(raw.pn_new || raw.sust_new_part_number || '').trim(),
        sust_superseded_list: String(raw.sust_superseded_list || raw.source_ids || '').trim(),
        designation_final: String(raw.designation_final || '').trim(),
        measure_final: String(raw.measure_final || raw.measurement_final || '').trim(),
        weight_final: String(raw.weight_final || '').trim(),
        motores: String(raw.motores || raw.engines || '').trim(),
        apariciones: Number(raw.apariciones || raw.occurrences || raw.total_occurrences_global || 0) || 0,
        qa_revision_estado: String(raw.qa_revision_estado || '').trim(),
        qa_revision_accion: String(raw.qa_revision_accion || '').trim(),
        source: raw
    };
}

async function fetchFirstAvailableFile(candidates) {
    const errors = [];

    for (const name of candidates || []) {
        try {
            const payload = await fetchJson(API.file(name));
            const rows = Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload?.json?.sample)
                    ? payload.json.sample
                    : [];
            return { name, rows };
        } catch (error) {
            errors.push(`${name}: ${error.message}`);
        }
    }

    return { name: '', rows: [], errors };
}

function getTabRows(tab) {
    return Array.isArray(state.data[tab]) ? state.data[tab] : [];
}

function updateSummary() {
    const counts = state.status?.counts || {};

    const newCount = Number.isFinite(Number(counts.new)) ? Number(counts.new) : getTabRows('new').length;
    const supersededCount = Number.isFinite(Number(counts.superseded)) ? Number(counts.superseded) : getTabRows('superseded').length;
    const pendingCount = Number.isFinite(Number(counts.pending)) ? Number(counts.pending) : getTabRows('pending').length;
    const discardedCount = Number.isFinite(Number(counts.discarded)) ? Number(counts.discarded) : getTabRows('discarded').length;

    $('sumNew').textContent = String(newCount);
    $('sumSuperseded').textContent = String(supersededCount);
    $('sumPending').textContent = String(pendingCount);
    $('sumDiscarded').textContent = String(discardedCount);
    $('sumTimestamp').textContent = formatDate(state.status?.timestamp);
}

function renderTabs() {
    const tabContainer = $('ewpTabs');
    if (!tabContainer) return;

    tabContainer.innerHTML = Object.entries(TAB_CONFIG).map(([tabKey, config]) => {
        const count = getTabRows(tabKey).length;
        const activeClass = state.currentTab === tabKey ? 'active' : '';
        return `<button type="button" class="${activeClass}" data-tab="${tabKey}">${escapeHtml(config.label)} (${count})</button>`;
    }).join('');
}

function splitCsvValues(value) {
    return String(value || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

function refreshFilterChoices() {
    const allRows = [
        ...getTabRows('new'),
        ...getTabRows('superseded'),
        ...getTabRows('pending'),
        ...getTabRows('discarded')
    ];

    const motors = [...new Set(allRows.flatMap((row) => splitCsvValues(row.motores)))].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    const qaEstados = [...new Set(allRows.map((row) => String(row.qa_revision_estado || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    const motorSelect = $('ewpMotorFilter');
    const qaSelect = $('ewpQaFilter');

    if (motorSelect) {
        const current = motorSelect.value;
        motorSelect.innerHTML = '<option value="">Todos los motores</option>' + motors.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
        motorSelect.value = motors.includes(current) ? current : '';
    }

    if (qaSelect) {
        const current = qaSelect.value;
        qaSelect.innerHTML = '<option value="">Todos los estados QA</option>' + qaEstados.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
        qaSelect.value = qaEstados.includes(current) ? current : '';
    }
}

function rowMatchesFilters(row) {
    if (state.filters.searchPn) {
        const pn = String(row.pn || '').toLowerCase();
        if (!pn.includes(state.filters.searchPn)) return false;
    }

    if (state.filters.motor) {
        const motors = splitCsvValues(row.motores).map((item) => item.toLowerCase());
        if (!motors.includes(state.filters.motor.toLowerCase())) return false;
    }

    if (state.filters.qaEstado) {
        if (String(row.qa_revision_estado || '').toLowerCase() !== state.filters.qaEstado.toLowerCase()) return false;
    }

    return true;
}

function getVisibleRows() {
    const tabRows = getTabRows(state.currentTab);
    return tabRows.filter(rowMatchesFilters);
}

function renderTable() {
    const tabConfig = TAB_CONFIG[state.currentTab] || TAB_CONFIG.new;
    const rows = getVisibleRows();

    const head = $('ewpTableHead');
    const body = $('ewpTableBody');

    if (!head || !body) return;

    const headers = [...tabConfig.columns, { key: '__actions', label: 'acciones' }];
    head.innerHTML = `<tr>${headers.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>`;

    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="${headers.length}" class="empty">Sin resultados para los filtros actuales.</td></tr>`;
        return;
    }

    body.innerHTML = rows.map((row) => {
        const actionButton = row.pn
            ? `<button type="button" class="ewp-row-action" data-open-pn="${escapeHtml(row.pn)}">Abrir PN Review</button>`
            : '-';

        const cells = tabConfig.columns.map((column) => `<td>${escapeHtml(row[column.key] ?? '')}</td>`).join('');
        return `<tr>${cells}<td>${actionButton}</td></tr>`;
    }).join('');
}

function getCurrentTabCsvName() {
    const config = TAB_CONFIG[state.currentTab] || TAB_CONFIG.new;

    for (const candidate of config.csvCandidates) {
        if (candidate) return candidate;
    }

    return '';
}

async function loadAllData() {
    setLoading(true, 'Cargando export...');

    try {
        const [statusPayload, newPayload, supersededPayload, pendingPayload, discardedPayload] = await Promise.all([
            fetchJson(API.status),
            fetchFirstAvailableFile(TAB_CONFIG.new.jsonCandidates),
            fetchFirstAvailableFile(TAB_CONFIG.superseded.jsonCandidates),
            fetchFirstAvailableFile(TAB_CONFIG.pending.jsonCandidates),
            fetchFirstAvailableFile(TAB_CONFIG.discarded.jsonCandidates)
        ]);

        state.status = statusPayload;

        state.sources.new = newPayload.name;
        state.sources.superseded = supersededPayload.name;
        state.sources.pending = pendingPayload.name;
        state.sources.discarded = discardedPayload.name;

        state.data.new = (newPayload.rows || []).map(normalizeWordpressRow);
        state.data.superseded = (supersededPayload.rows || []).map(normalizeWordpressRow);
        state.data.pending = (pendingPayload.rows || []).map(normalizeWordpressRow);
        state.data.discarded = (discardedPayload.rows || []).map(normalizeWordpressRow);

        const issues = [
            ...(newPayload.errors || []),
            ...(supersededPayload.errors || []),
            ...(pendingPayload.errors || []),
            ...(discardedPayload.errors || [])
        ];

        updateSummary();
        renderTabs();
        refreshFilterChoices();
        renderTable();

        if (issues.length) {
            showToast('Algunos archivos no estuvieron disponibles. Se cargaron los existentes.', 'info');
            console.warn('[Export WordPress] Missing files:', issues);
        } else {
            showToast('Datos de export actualizados.', 'success');
        }
    } catch (error) {
        showToast(`No se pudo cargar export: ${error.message}`, 'error');
        const body = $('ewpTableBody');
        const head = $('ewpTableHead');
        if (head) head.innerHTML = '<tr><th>estado</th></tr>';
        if (body) body.innerHTML = `<tr><td class="empty">Error: ${escapeHtml(error.message)}</td></tr>`;
    } finally {
        setLoading(false, 'Listo');
    }
}

async function runWordpressExport() {
    setLoading(true, 'Ejecutando export...');
    try {
        await fetchJson(API.runWordpress, { method: 'POST' });
        showToast('Export de WordPress ejecutado correctamente.', 'success');
        await loadAllData();
    } catch (error) {
        showToast(`Error ejecutando export: ${error.message}`, 'error');
    } finally {
        setLoading(false, 'Listo');
    }
}

function onTabClick(event) {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;

    const nextTab = String(button.dataset.tab || '').trim();
    if (!TAB_CONFIG[nextTab]) return;

    state.currentTab = nextTab;
    renderTabs();
    renderTable();
}

function onTableClick(event) {
    const button = event.target.closest('button[data-open-pn]');
    if (!button) return;

    const pn = String(button.dataset.openPn || '').trim();
    if (!pn) return;

    const target = `/pn_review.html?q=${encodeURIComponent(pn)}`;
    window.open(target, '_blank', 'noopener');
}

function bindEvents() {
    $('ewpTabs')?.addEventListener('click', onTabClick);
    $('ewpTableBody')?.addEventListener('click', onTableClick);

    $('ewpRunBtn')?.addEventListener('click', runWordpressExport);
    $('ewpRefreshBtn')?.addEventListener('click', loadAllData);
    $('ewpDownloadBtn')?.addEventListener('click', () => {
        const name = getCurrentTabCsvName();
        window.location.href = API.download(name);
    });

    $('ewpSearchPn')?.addEventListener('input', (event) => {
        state.filters.searchPn = String(event.target.value || '').trim().toLowerCase();
        renderTable();
    });

    $('ewpMotorFilter')?.addEventListener('change', (event) => {
        state.filters.motor = String(event.target.value || '').trim();
        renderTable();
    });

    $('ewpQaFilter')?.addEventListener('change', (event) => {
        state.filters.qaEstado = String(event.target.value || '').trim();
        renderTable();
    });
}

function init() {
    bindEvents();
    loadAllData();
}

document.addEventListener('DOMContentLoaded', init);
