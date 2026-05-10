function resolveApiBasePath() {
    const pathname = String(window.location.pathname || '/');
    return /^\/milu(\/|$)/i.test(pathname) ? '/milu' : '';
}

const API_BASE_PATH = resolveApiBasePath();
const apiUrl = (path) => `${API_BASE_PATH}${path}`;

function buildStaticJsonUrlCandidates(fileName) {
    const clean = String(fileName || '').trim();
    if (!clean) return [];

    const withBase = API_BASE_PATH
        ? `${API_BASE_PATH}/data/output/wordpress/${clean}`
        : `/data/output/wordpress/${clean}`;

    return [
        withBase,
        `data/output/wordpress/${clean}`,
        clean
    ].filter((value, index, arr) => value && arr.indexOf(value) === index);
}

function shouldUseStaticExportMode() {
    const host = String(window.location.hostname || '').toLowerCase();
    const path = String(window.location.pathname || '/');
    return host === 'alentio.es' && /^\/milu(\/|$)/i.test(path);
}

const API = {
    status: apiUrl('/export/status'),
    runWordpress: apiUrl('/export/run-wordpress'),
    file: (name) => `${apiUrl('/export/file')}?name=${encodeURIComponent(name)}`,
    download: (name) => name
        ? `${apiUrl('/export/download')}?name=${encodeURIComponent(name)}`
        : apiUrl('/export/download')
};

const QA_EXPORT_FIELDS = [
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

const VOLATILE_FIELDS = new Set(['Id', 'fecha_version']);
const WARNING_FIELDS = new Set(['exp_categorias', 'atributo']);

const TAB_CONFIG = {
    new: {
        label: 'New',
        detailLabel: 'Export WordPress New',
        jsonCandidates: ['milu_wp_import.json', 'milu_wp_new_import.json'],
        csvCandidates: ['milu_wp_import.csv', 'milu_wp_new_import.csv']
    },
    superseded: {
        label: 'Superseded',
        detailLabel: 'Export WordPress Superseded',
        jsonCandidates: ['milu_wp_superseded.json', 'milu_wp_superseded_import.json'],
        csvCandidates: ['milu_wp_superseded.csv', 'milu_wp_superseded_import.csv']
    },
    pending: {
        label: 'Pending',
        detailLabel: 'Export WordPress Pending',
        jsonCandidates: ['milu_wp_pending.json', 'milu_wp_pending_review.json'],
        csvCandidates: ['milu_wp_pending.csv', 'milu_wp_pending_review.csv']
    },
    discarded: {
        label: 'Discarded',
        detailLabel: 'Export WordPress Discarded',
        jsonCandidates: ['milu_wp_discarded.json'],
        csvCandidates: ['milu_wp_discarded.csv']
    }
};

const PAGE_SIZE = 20;

const state = {
    currentTab: 'new',
    loading: false,
    status: null,
    selectedPn: '',
    onlyDiff: false,
    currentPage: 1,
    filters: {
        searchPn: '',
        motor: '',
        qaEstado: ''
    },
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
    miluNewData: [],
    allData: []
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

function text(value) {
    return String(value == null ? '' : value).trim();
}

function pick(...values) {
    for (const value of values) {
        const normalized = text(value);
        if (normalized) return normalized;
    }
    return '';
}

function normKey(value) {
    return text(value).toLowerCase();
}

function splitCsv(value) {
    return text(value)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

function formatDate(value) {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' });
    } catch (_) {
        return String(value);
    }
}

function formatValue(value) {
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
    return formatValue(value).replace(/\s+/g, ' ').trim();
}

function showToast(message, type = 'info') {
    const container = $('ewpToastContainer');
    if (!(container instanceof HTMLElement)) return;

    const toast = document.createElement('div');
    toast.className = `ewx-toast ${type}`;
    toast.textContent = String(message || '');
    container.appendChild(toast);

    window.setTimeout(() => {
        toast.classList.add('is-leaving');
        window.setTimeout(() => toast.remove(), 220);
    }, 2600);
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
        throw new Error(payload?.error || `HTTP ${response.status}`);
    }

    return payload;
}

async function fetchFirstAvailableExportFile(candidates) {
    const errors = [];

    for (const name of candidates || []) {
        try {
            const payload = await fetchJson(API.file(name));
            const rows = Array.isArray(payload?.data) ? payload.data : [];
            return { name, rows };
        } catch (error) {
            errors.push(`${name}: ${error.message}`);
        }
    }

    return { name: '', rows: [], errors };
}

async function fetchFirstAvailableStaticJson(candidates) {
    for (const name of candidates || []) {
        const urls = buildStaticJsonUrlCandidates(name);
        for (const url of urls) {
            try {
                const response = await fetch(url);
                if (!response.ok) continue;
                const payload = await response.json();
                if (Array.isArray(payload)) return payload;
            } catch (_) {
                // Continue with next candidate URL.
            }
        }
    }
    return [];
}

async function fetchFirstAvailableStaticJsonFile(candidates) {
    for (const name of candidates || []) {
        const urls = buildStaticJsonUrlCandidates(name);
        for (const url of urls) {
            try {
                const response = await fetch(url);
                if (!response.ok) continue;
                const payload = await response.json();
                if (Array.isArray(payload)) return { name: url, rows: payload };
            } catch (_) {
                // Continue with next candidate URL.
            }
        }
    }
    return { name: '', rows: [] };
}

async function fetchExportRows(candidates, backendAvailable) {
    if (backendAvailable) {
        const backendPayload = await fetchFirstAvailableExportFile(candidates);
        if (backendPayload.name || (backendPayload.rows || []).length > 0) {
            return backendPayload;
        }
    }
    return fetchFirstAvailableStaticJsonFile(candidates);
}

// --- Synthetic computation helpers (ported from qa-milu.js) ---

const SYNTH_ENGINE_FILES = [
    'engine_12V4000M40A.json', 'engine_12V4000M53.json', 'engine_12V4000M70.json',
    'engine_16V4000M61.json', 'engine_16V4000M73.json', 'engine_16V4000M73L.json',
    'engine_16V4000M90.json', 'engine_20V4000M93.json', 'engine_20V4000M93L.json'
];

function synthNormPn(value) {
    return String(value ?? '').trim().toLowerCase();
}

function synthEscapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function synthUniqueSorted(values, compareAsNumeric = false) {
    const unique = [...new Set(values.map(v => String(v ?? '').trim()).filter(Boolean))];
    return unique.sort((a, b) => compareAsNumeric
        ? a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
        : a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function synthFormatVersionStamp(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}${m}${d}.${h}${min}`;
}

function synthNormalizeModelType(row) {
    const rawModel = String(row?.model ?? '').trim();
    if (rawModel) return rawModel;
    const engineModel = String(row?.engine_model ?? '').trim();
    if (!engineModel) return '';
    return engineModel.replace('4000', '').trim();
}

function synthNormalizePageLabel(row) {
    const book = String(row?.engine_model ?? '').trim();
    const pageRaw = String(row?.['Source Page'] ?? '').trim();
    if (!book || !pageRaw) return '';
    const digits = pageRaw.replace(/[^0-9]/g, '');
    const page = digits ? digits.padStart(4, '0') : pageRaw;
    return `${book}-${page}`;
}

function synthGetMatchingRows(pn) {
    const normalizedPn = synthNormPn(pn);
    return state.allData.filter(item => synthNormPn(item?.['PART NO.'] ?? item?.pn ?? '') === normalizedPn);
}

function synthGetHierarchyKind(row) {
    const h = String(row?.sust_hierarchie ?? '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/[._-]/g, ' ');
    if (h === 'SUPERSEDED') return 'superseded';
    return 'new';
}

function synthPickFirst(row, keys) {
    for (const key of keys) {
        const value = row?.[key];
        if (value != null && String(value).trim() !== '') return value;
    }
    return '';
}

function synthParseWeight(value) {
    const txt = String(value ?? '').trim();
    if (!txt) return null;
    const match = txt.replace(/\s+/g, ' ').match(/(\d+[\d.,]*)\s*(KGM|KG|G)\b/i);
    if (!match) return null;
    let n = match[1].replace(/\s/g, '');
    if (n.includes(',') && n.includes('.')) { n = n.replace(/\./g, '').replace(',', '.'); }
    else if (n.includes(',')) { n = n.replace(',', '.'); }
    const parsed = Number(n);
    if (!Number.isFinite(parsed)) return null;
    return match[2].toUpperCase() === 'G' ? parsed / 1000 : parsed;
}

function synthResolveWeight(row) {
    const gesaWeight = Number(row?.weight_gesa);
    if (Number.isFinite(gesaWeight)) return gesaWeight;
    const fw = synthParseWeight(synthPickFirst(row, ['weight_final', 'weight_raw', 'WEIGHT']));
    if (Number.isFinite(fw)) return fw;
    return synthParseWeight(row?.WEIGHT);
}

function synthFormatWeightText(row, weightValue) {
    if (!Number.isFinite(weightValue)) {
        return String(synthPickFirst(row, ['weight_final', 'weight_raw', 'WEIGHT']) || '').trim();
    }
    const unit = String(row?.units || 'KGM').trim() || 'KGM';
    return `${weightValue.toFixed(3)} ${unit}`;
}

function synthResolveMeasurement(row) {
    const gesaField = String(row?.dimensions_gesa ?? row?.measure_gesa ?? '').trim().replace(/\s{2,}/g, ' ');
    if (gesaField) return gesaField;
    let raw = String(row?.['MEASUREMENT / STANDARD'] ?? row?.measure_raw ?? row?.measure_final ?? '').trim().replace(/\s{2,}/g, ' ');
    const norma = String(row?.norma ?? row?.norma_final ?? '').trim();
    if (raw && norma) {
        raw = raw.replace(new RegExp(`\\b${synthEscapeRegExp(norma)}\\b`, 'ig'), '').trim();
    }
    if (raw) return raw;
    return String(row?.measure_final ?? row?.measurement_final ?? '').trim().replace(/\s{2,}/g, ' ');
}

function synthFirstNonEmpty(rows, getter) {
    for (const row of rows) {
        const value = getter(row);
        if (value != null && String(value).trim() !== '') return value;
    }
    return null;
}

function synthMergeImages(primary, secondary) {
    const merged = [];
    const seen = new Set();
    const addValue = (value) => {
        String(value ?? '').split(',').map(p => p.trim()).filter(Boolean).forEach(part => {
            const key = synthNormPn(part);
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(part);
        });
    };
    addValue(primary);
    addValue(secondary);
    return merged.join(', ');
}

function synthDesignation(row) {
    return synthPickFirst(row, ['designation_final', 'designation_pdf', 'designation_gesa', 'designation_raw', 'DESIGNATION']);
}

function buildSyntheticRowForPn(pn) {
    const matches = synthGetMatchingRows(pn);
    if (!matches.length) return null;
    const row = matches[0];
    const isSuperseded = synthGetHierarchyKind(row) === 'superseded';

    const weightValue = synthResolveWeight(row);
    const pageLabels = synthUniqueSorted(matches.map(item => synthNormalizePageLabel(item)), true);
    const modelTypes = synthUniqueSorted(matches.map(item => synthNormalizeModelType(item)), true);
    const engineModels = synthUniqueSorted(matches.map(item => String(item?.engine_model ?? '').trim()), true);
    const categoryValues = synthUniqueSorted(matches.map(item => String(item?.categoria ?? item?.atributo ?? item?.exp_categorias ?? '').trim()));
    const imageValue = synthFirstNonEmpty([row, ...matches], item => item?.exp_imagenes || item?.ruta_foto || '');
    const routeFotoValue = synthFirstNonEmpty([row, ...matches], item => item?.ruta_foto || '');
    const exportImagesValue = synthMergeImages(routeFotoValue, imageValue);
    const normalizedPn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
    const hierarchy = String(row?.sust_hierarchie ?? '').trim();
    const supersededList = String(row?.sust_superseded_list ?? '').trim();
    const relatedNewPn = String(row?.sust_new_part_number ?? '').trim() || String(row?.['New Part Number'] ?? '').trim();
    const hasSubstitution = isSuperseded
        ? (hierarchy === 'Superseded' || relatedNewPn !== '')
        : (hierarchy !== '' || supersededList !== '' || relatedNewPn !== '');

    return {
        Id: String(row?.ID ?? '').trim(),
        fecha_version: synthFormatVersionStamp(),
        POS: String(row?.POS ?? '').trim(),
        designation: String(synthDesignation(row)).trim(),
        engine: String(row?.engine ?? '').trim() || '4000',
        model_type: modelTypes.join(', '),
        type: '',
        pn: normalizedPn,
        nsn: String(row?.nsn ?? '').trim(),
        GESA_NORM: String(row?.norma ?? row?.norma_final ?? '').trim(),
        GESA_NORMALIZADO: String(row?.normalizado ?? '').trim(),
        fg_code: row?.fg_code ?? '',
        fg_description: String(row?.fgs_description ?? '').trim(),
        fg_code_description: String(row?.fgs_code_description ?? '').trim(),
        weight: Number.isFinite(weightValue) ? Number(weightValue.toFixed(3)) : '',
        weight_txt: synthFormatWeightText(row, weightValue),
        measurement: synthResolveMeasurement(row),
        TIPOARTICULO: String(row?.TIPOARTICULO ?? '').trim() || 'piezas',
        PAG: pageLabels.join(', '),
        BOM_no: String(row?.['BOM-No.'] ?? '').trim(),
        esquema_general: '',
        exp_motor: engineModels.join(', '),
        exp_categorias: categoryValues.join(', '),
        atributo: categoryValues.join(', '),
        SUST_TIPO: isSuperseded ? (hierarchy || 'Superseded') : (hierarchy || null),
        new_pn_relacionado: isSuperseded
            ? (relatedNewPn || normalizedPn || null)
            : (hierarchy === 'New' ? normalizedPn : (relatedNewPn || null)),
        old_pn_relacionados: isSuperseded ? null : (supersededList || null),
        EN_EXCEL_SUSTITUCION: hasSubstitution ? 'SI' : '',
        ruta_foto: routeFotoValue,
        exp_imagenes: exportImagesValue
    };
}

// --- End synthetic computation helpers ---

function normalizeRow(raw = {}) {
    const motoresValue = pick(raw.motores, raw.engines, raw.exp_motor, raw.engine);
    const measureValue = pick(raw.measurement, raw.measure_final, raw.measurement_final);
    const weightValue = pick(raw.weight_txt, raw.weight_final, raw.weight);
    const designationValue = pick(raw.designation, raw.designation_final);

    return {
        Id: pick(raw.Id, raw.id),
        fecha_version: pick(raw.fecha_version, raw.timestamp, raw.updated_at),
        POS: pick(raw.POS, raw.pos),
        designation: designationValue,
        engine: pick(raw.engine, raw.exp_motor, raw.engines, raw.motores),
        model_type: pick(raw.model_type, raw.model, raw['MODEL/TYPE']),
        type: pick(raw.type),
        pn: pick(raw.pn, raw.sku),
        nsn: pick(raw.nsn),
        GESA_NORM: pick(raw.GESA_NORM, raw.norma, raw.norma_final),
        GESA_NORMALIZADO: pick(raw.GESA_NORMALIZADO, raw.normalizado),
        fg_code: pick(raw.fg_code),
        fg_description: pick(raw.fg_description, raw.fgs_description),
        fg_code_description: pick(raw.fg_code_description, raw.fgs_code_description),
        weight: pick(raw.weight, raw.weight_final),
        weight_txt: weightValue,
        measurement: measureValue,
        TIPOARTICULO: pick(raw.TIPOARTICULO, raw.tipo_articulo),
        PAG: pick(raw.PAG, raw.source_pages),
        BOM_no: pick(raw.BOM_no, raw['BOM-No.']),
        esquema_general: pick(raw.esquema_general),
        exp_motor: motoresValue,
        exp_categorias: pick(raw.exp_categorias, raw.categoria),
        atributo: pick(raw.atributo, raw.exp_categorias, raw.categoria),
        SUST_TIPO: pick(raw.SUST_TIPO, raw.sust_hierarchie),
        new_pn_relacionado: pick(raw.new_pn_relacionado, raw.pn_new, raw.sust_new_part_number),
        old_pn_relacionados: pick(raw.old_pn_relacionados, raw.sust_superseded_list, raw.source_ids),
        EN_EXCEL_SUSTITUCION: pick(raw.EN_EXCEL_SUSTITUCION),
        ruta_foto: pick(raw.ruta_foto),
        exp_imagenes: pick(raw.exp_imagenes),

        designation_final: designationValue,
        measure_final: measureValue,
        weight_final: weightValue,
        motores: motoresValue,
        apariciones: Number(raw.apariciones || raw.occurrences || raw.total_occurrences_global || 0) || 0,
        qa_revision_estado: pick(raw.qa_revision_estado),
        qa_revision_accion: pick(raw.qa_revision_accion),
        source: raw
    };
}

function getTabRows(tabKey) {
    return Array.isArray(state.data[tabKey]) ? state.data[tabKey] : [];
}

function getSelectedRow() {
    return getTabRows(state.currentTab).find((row) => normKey(row.pn) === normKey(state.selectedPn)) || null;
}

function getMiluNewMatch(pn) {
    if (!pn || !Array.isArray(state.miluNewData)) return null;
    return state.miluNewData.find((row) => normKey(row?.pn) === normKey(pn)) || null;
}

function getVisibleRows() {
    const rows = getTabRows(state.currentTab);
    return rows
        .filter((row) => {
            if (state.filters.searchPn && !normKey(row.pn).includes(normKey(state.filters.searchPn))) return false;
            if (state.filters.motor) {
                const motors = splitCsv(row.exp_motor || row.motores).map(normKey);
                if (!motors.includes(normKey(state.filters.motor))) return false;
            }
            if (state.filters.qaEstado && normKey(row.qa_revision_estado) !== normKey(state.filters.qaEstado)) return false;
            return true;
        })
        .sort((a, b) => String(a.pn || '').localeCompare(String(b.pn || ''), 'es', { numeric: true, sensitivity: 'base' }));
}

function ensureValidSelection() {
    const visibleRows = getVisibleRows();
    if (!visibleRows.length) {
        state.selectedPn = '';
        state.currentPage = 1;
        return;
    }

    const stillVisible = visibleRows.some((row) => normKey(row.pn) === normKey(state.selectedPn));
    if (!stillVisible) {
        const preferredRow = visibleRows.find((row) => getMiluNewMatch(row.pn)) || visibleRows[0];
        state.selectedPn = preferredRow.pn;
        state.currentPage = 1;
    } else {
        // Ensure selected PN is on the current page.
        const selectedIndex = visibleRows.findIndex((row) => normKey(row.pn) === normKey(state.selectedPn));
        if (selectedIndex >= 0) {
            const targetPage = Math.floor(selectedIndex / PAGE_SIZE) + 1;
            state.currentPage = targetPage;
        }
    }
}

function updateSummary() {
    const counts = state.status?.counts || {};
    $('sumNew').textContent = String(Number.isFinite(Number(counts.new)) ? Number(counts.new) : getTabRows('new').length);
    $('sumSuperseded').textContent = String(Number.isFinite(Number(counts.superseded)) ? Number(counts.superseded) : getTabRows('superseded').length);
    $('sumPending').textContent = String(Number.isFinite(Number(counts.pending)) ? Number(counts.pending) : getTabRows('pending').length);
    $('sumDiscarded').textContent = String(Number.isFinite(Number(counts.discarded)) ? Number(counts.discarded) : getTabRows('discarded').length);
    $('sumTimestamp').textContent = formatDate(state.status?.timestamp);
}

function renderTabs() {
    const tabs = $('ewpTabs');
    if (!(tabs instanceof HTMLElement)) return;

    tabs.innerHTML = Object.entries(TAB_CONFIG).map(([tabKey, config]) => {
        const activeClass = tabKey === state.currentTab ? 'active' : '';
        const count = getTabRows(tabKey).length;
        return `<button type="button" class="${activeClass}" data-tab="${escapeHtml(tabKey)}">${escapeHtml(config.label)} <span>${count}</span></button>`;
    }).join('');
}

function refreshFilterChoices() {
    const allRows = Object.keys(TAB_CONFIG).flatMap((tabKey) => getTabRows(tabKey));
    const motors = [...new Set(allRows.flatMap((row) => splitCsv(row.exp_motor || row.motores)))].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    const qaEstados = [...new Set(allRows.map((row) => text(row.qa_revision_estado)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    const motorSelect = $('ewpMotorFilter');
    const qaSelect = $('ewpQaFilter');

    if (motorSelect instanceof HTMLSelectElement) {
        const current = motorSelect.value;
        motorSelect.innerHTML = '<option value="">Todos los motores</option>' + motors.map((motor) => `<option value="${escapeHtml(motor)}">${escapeHtml(motor)}</option>`).join('');
        motorSelect.value = motors.includes(current) ? current : '';
    }

    if (qaSelect instanceof HTMLSelectElement) {
        const current = qaSelect.value;
        qaSelect.innerHTML = '<option value="">Todos los estados QA</option>' + qaEstados.map((estado) => `<option value="${escapeHtml(estado)}">${escapeHtml(estado)}</option>`).join('');
        qaSelect.value = qaEstados.includes(current) ? current : '';
    }
}

function renderPnList() {
    const list = $('ewpPnList');
    const sourceChip = $('ewpCurrentSource');
    const visibleCount = $('ewpVisibleCount');
    if (!(list instanceof HTMLElement) || !(sourceChip instanceof HTMLElement) || !(visibleCount instanceof HTMLElement)) return;

    const rows = getVisibleRows();
    const currentSource = state.sources[state.currentTab] || 'Sin archivo';
    sourceChip.textContent = currentSource;
    visibleCount.textContent = `${rows.length} resultado${rows.length === 1 ? '' : 's'}`;

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.currentPage > totalPages) state.currentPage = totalPages;

    // Pagination bar
    const paginationEl = $('ewpPagination');
    if (paginationEl instanceof HTMLElement) {
        if (totalPages <= 1) {
            paginationEl.hidden = true;
        } else {
            paginationEl.hidden = false;
            const prev = state.currentPage > 1;
            const next = state.currentPage < totalPages;
            paginationEl.innerHTML = `
                <button type="button" class="ewx-page-btn" data-page="prev" ${prev ? '' : 'disabled'} aria-label="Anterior">&lsaquo;</button>
                <span class="ewx-page-info">${state.currentPage} / ${totalPages}</span>
                <button type="button" class="ewx-page-btn" data-page="next" ${next ? '' : 'disabled'} aria-label="Siguiente">&rsaquo;</button>
            `;
        }
    }

    if (!rows.length) {
        list.innerHTML = '<div class="ewx-empty-list">No hay PNs para los filtros actuales.</div>';
        return;
    }

    const start = (state.currentPage - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);

    list.innerHTML = pageRows.map((row) => {
        const selectedClass = normKey(row.pn) === normKey(state.selectedPn) ? 'is-selected' : '';
        const designation = text(row.designation || row.designation_final) || '-';
        return `<button type="button" class="ewx-pn-row ${selectedClass}" data-pn="${escapeHtml(row.pn)}" role="option" aria-selected="${selectedClass ? 'true' : 'false'}" title="${escapeHtml(designation)}">
            <span class="ewx-pn-row-pn">${escapeHtml(row.pn || '-')}</span>
            <span class="ewx-pn-row-desc">${escapeHtml(designation)}</span>
        </button>`;
    }).join('');
}

function renderDetail() {
    const title = $('ewpDetailTitle');
    const meta = $('ewpDetailMeta');
    const count = $('ewpDetailCount');
    const sources = $('ewpDetailSources');
    const head = $('ewpCompareHead');
    const body = $('ewpCompareBody');

    if (!(title instanceof HTMLElement) || !(meta instanceof HTMLElement) || !(count instanceof HTMLElement)
        || !(sources instanceof HTMLElement) || !(head instanceof HTMLElement) || !(body instanceof HTMLElement)) {
        return;
    }

    const selectedRow = getSelectedRow();
    if (!selectedRow) {
        title.textContent = 'Selecciona un PN';
        meta.textContent = 'La tabla replica el formato de Exportacion MILU_New para este codigo.';
        count.textContent = 'Sin seleccion';
        sources.innerHTML = '';
        head.innerHTML = '<th>Sin datos</th>';
        body.innerHTML = '<tr><td class="ewx-empty-table">Selecciona un PN del panel izquierdo.</td></tr>';
        return;
    }

    const miluNewRaw = getMiluNewMatch(selectedRow.pn);
    const syntheticRow = buildSyntheticRowForPn(selectedRow.pn);
    const sourceRows = [
        ...(miluNewRaw ? [{ label: 'MILU_New_v506', row: normalizeRow(miluNewRaw) }] : []),
        ...(syntheticRow ? [{ label: 'Synthetic', row: syntheticRow }] : [
            { label: TAB_CONFIG[state.currentTab].detailLabel, row: selectedRow }
        ])
    ];
    const diffFields = new Set();

    if (sourceRows.length >= 2) {
        const firstRow = sourceRows[0].row;
        const lastRow = sourceRows[sourceRows.length - 1].row;
        for (const field of QA_EXPORT_FIELDS) {
            if (VOLATILE_FIELDS.has(field)) continue;
            const firstValue = normalizeComparisonValue(firstRow?.[field]);
            const lastValue = normalizeComparisonValue(lastRow?.[field]);
            if (firstValue !== lastValue) diffFields.add(field);
        }
    }

    const visibleFields = state.onlyDiff
        ? QA_EXPORT_FIELDS.filter((field) => diffFields.has(field))
        : [...QA_EXPORT_FIELDS];

    title.textContent = selectedRow.pn || '-';
    meta.textContent = `${selectedRow.designation || selectedRow.designation_final || '-'} · ${selectedRow.exp_motor || selectedRow.motores || 'Sin motor'} · ${Number(selectedRow.apariciones || 0)} apariciones`;
    count.textContent = sourceRows.length >= 2
        ? `${sourceRows.length} registros comparados · ${visibleFields.length} campo${visibleFields.length === 1 ? '' : 's'}${state.onlyDiff ? ' no coincidente' + (visibleFields.length === 1 ? '' : 's') : ''}`
        : '1 registro visible';

    sources.innerHTML = sourceRows.map((source) => `<span class="ewx-source-pill">${escapeHtml(source.label)}</span>`).join('');
    head.innerHTML = ['<th>Campo</th>', ...sourceRows.map((source) => `<th>${escapeHtml(source.label)}</th>`)].join('');

    if (!visibleFields.length) {
        body.innerHTML = `<tr><td colspan="${sourceRows.length + 1}" class="ewx-empty-table">No hay campos no coincidentes para este PN.</td></tr>`;
        return;
    }

    body.innerHTML = visibleFields.map((field) => {
        const valueCells = sourceRows.map((source, index) => {
            const rawValue = formatValue(source.row?.[field]);
            const displayValue = rawValue || '-';
            const comparedEdge = index === 0 || index === sourceRows.length - 1;
            const mismatched = comparedEdge && diffFields.has(field);
            const warning = mismatched && WARNING_FIELDS.has(field);
            const critical = mismatched && !WARNING_FIELDS.has(field);
            const className = [critical ? 'cell-diff' : '', warning ? 'cell-diff-warn' : ''].filter(Boolean).join(' ');
            return `<td class="${className}" title="${escapeHtml(rawValue)}">${escapeHtml(displayValue)}</td>`;
        }).join('');

        return `<tr><td class="field-name">${escapeHtml(field)}</td>${valueCells}</tr>`;
    }).join('');
}

function renderAll() {
    ensureValidSelection();
    updateSummary();
    renderTabs();
    refreshFilterChoices();
    renderPnList();
    renderDetail();
}

function setLoading(loading, message = '') {
    state.loading = Boolean(loading);
    const status = $('ewpStatusText');
    if (status) status.textContent = message || (loading ? 'Cargando...' : 'Listo');

    ['ewpRunBtn', 'ewpRefreshBtn', 'ewpDownloadBtn'].forEach((id) => {
        const button = $(id);
        if (button instanceof HTMLButtonElement) {
            button.disabled = loading;
        }
    });
}

async function loadAllData() {
    setLoading(true, 'Cargando export...');
    try {
        let statusPayload = null;
        const staticMode = shouldUseStaticExportMode();
        if (!staticMode) {
            try {
                statusPayload = await fetchJson(API.status);
            } catch (_) {
                statusPayload = { ok: false, offline: true };
            }
        } else {
            statusPayload = { ok: false, staticMode: true };
        }

        const backendAvailable = !staticMode && statusPayload?.ok !== false;
        const shouldLoadStaticJsonFiles = true;

        const [newPayload, supersededPayload, pendingPayload, discardedPayload, miluNewPayload] = shouldLoadStaticJsonFiles
            ? await Promise.all([
                fetchExportRows(TAB_CONFIG.new.jsonCandidates, backendAvailable),
                fetchExportRows(TAB_CONFIG.superseded.jsonCandidates, backendAvailable),
                fetchExportRows(TAB_CONFIG.pending.jsonCandidates, backendAvailable),
                fetchExportRows(TAB_CONFIG.discarded.jsonCandidates, backendAvailable),
                fetchFirstAvailableStaticJson(['MILU_New_v506.json', 'MILU_New_v507.json'])
            ])
            : [
                { name: '', rows: [] },
                { name: '', rows: [] },
                { name: '', rows: [] },
                { name: '', rows: [] },
                []
            ];

        state.status = statusPayload;
        state.sources.new = newPayload.name;
        state.sources.superseded = supersededPayload.name;
        state.sources.pending = pendingPayload.name;
        state.sources.discarded = discardedPayload.name;

        state.data.new = (newPayload.rows || []).map(normalizeRow);
        state.data.superseded = (supersededPayload.rows || []).map(normalizeRow);
        state.data.pending = (pendingPayload.rows || []).map(normalizeRow);
        state.data.discarded = (discardedPayload.rows || []).map(normalizeRow);
        state.miluNewData = Array.isArray(miluNewPayload) ? miluNewPayload : [];

        // Load engine data for synthetic computation
        setLoading(true, 'Cargando motores para calculo synthetic...');
        const engineChunks = await Promise.all(SYNTH_ENGINE_FILES.map(async (fileName) => {
            try {
                const response = await fetch(fileName);
                if (!response.ok) return [];
                const data = await response.json();
                if (!Array.isArray(data)) return [];
                const engineModel = fileName.replace(/^engine_/, '').replace(/\.json$/, '');
                return data.map(row => ({ ...row, engine_model: String(row?.engine_model ?? '').trim() || engineModel }));
            } catch (_) {
                return [];
            }
        }));
        state.allData = engineChunks.flat();

        renderAll();
        if (staticMode && state.data.new.length === 0 && state.data.superseded.length === 0 && state.data.pending.length === 0 && state.data.discarded.length === 0) {
            showToast('Modo publicacion: no se encontraron JSON en /data/output/wordpress.', 'info');
        }
        showToast('Export cargado correctamente.', 'success');
    } catch (error) {
        const head = $('ewpCompareHead');
        const body = $('ewpCompareBody');
        if (head) head.innerHTML = '<th>estado</th>';
        if (body) body.innerHTML = `<tr><td class="ewx-empty-table">Error: ${escapeHtml(error.message)}</td></tr>`;
        showToast(`No se pudo cargar la pagina: ${error.message}`, 'error');
    } finally {
        setLoading(false, 'Listo');
    }
}

async function runWordpressExport() {
    if (shouldUseStaticExportMode()) {
        showToast('Ejecucion de export no disponible en hosting estatico. Usa datos ya generados.', 'info');
        return;
    }

    setLoading(true, 'Ejecutando export...');
    try {
        await fetchJson(API.runWordpress, { method: 'POST' });
        showToast('Export ejecutado correctamente.', 'success');
        await loadAllData();
    } catch (error) {
        showToast(`Error ejecutando export: ${error.message}`, 'error');
    } finally {
        setLoading(false, 'Listo');
    }
}

function downloadCurrentCsv() {
    const config = TAB_CONFIG[state.currentTab] || TAB_CONFIG.new;
    const name = (config.csvCandidates || []).find(Boolean);
    if (!name) {
        showToast('No hay CSV configurado para esta pestana.', 'info');
        return;
    }
    window.location.href = API.download(name);
}

function onTabClick(event) {
    const button = event.target.closest('button[data-tab]');
    if (!(button instanceof HTMLButtonElement)) return;

    const nextTab = text(button.dataset.tab).toLowerCase();
    if (!TAB_CONFIG[nextTab] || nextTab === state.currentTab) return;

    state.currentTab = nextTab;
    state.currentPage = 1;
    renderAll();
}

function onPnListClick(event) {
    const card = event.target.closest('button[data-pn]');
    if (!(card instanceof HTMLButtonElement)) return;
    state.selectedPn = text(card.dataset.pn);
    renderDetail();
    // Update selection highlight without re-rendering whole list
    $('ewpPnList')?.querySelectorAll('.ewx-pn-row').forEach((btn) => {
        const selected = normKey(btn.dataset.pn || '') === normKey(state.selectedPn);
        btn.classList.toggle('is-selected', selected);
        btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
}

function onPaginationClick(event) {
    const btn = event.target.closest('button[data-page]');
    if (!(btn instanceof HTMLButtonElement) || btn.disabled) return;
    const action = btn.dataset.page;
    const rows = getVisibleRows();
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (action === 'prev' && state.currentPage > 1) state.currentPage--;
    else if (action === 'next' && state.currentPage < totalPages) state.currentPage++;
    renderPnList();
}

function bindEvents() {
    $('ewpTabs')?.addEventListener('click', onTabClick);
    $('ewpPnList')?.addEventListener('click', onPnListClick);
    $('ewpPagination')?.addEventListener('click', onPaginationClick);

    $('ewpSearchPn')?.addEventListener('input', (event) => {
        state.filters.searchPn = text(event.target?.value || '');
        state.currentPage = 1;
        renderAll();
    });

    $('ewpMotorFilter')?.addEventListener('change', (event) => {
        state.filters.motor = text(event.target?.value || '');
        state.currentPage = 1;
        renderAll();
    });

    $('ewpQaFilter')?.addEventListener('change', (event) => {
        state.filters.qaEstado = text(event.target?.value || '');
        state.currentPage = 1;
        renderAll();
    });

    $('ewpOnlyDiffToggle')?.addEventListener('change', (event) => {
        state.onlyDiff = Boolean(event.target?.checked);
        renderDetail();
    });

    $('ewpRunBtn')?.addEventListener('click', runWordpressExport);
    $('ewpRefreshBtn')?.addEventListener('click', loadAllData);
    $('ewpDownloadBtn')?.addEventListener('click', downloadCurrentCsv);

    if (shouldUseStaticExportMode()) {
        const runBtn = $('ewpRunBtn');
        if (runBtn instanceof HTMLButtonElement) {
            runBtn.disabled = true;
            runBtn.title = 'No disponible en hosting estatico';
        }
    }
}

bindEvents();
loadAllData();
