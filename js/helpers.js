/**
 * Funciones de utilidad puras (sin acceso al DOM ni al estado global).
 */

import { state } from './state.js';

export function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function val(row, key, defaultVal = '—') {
    const v = row[key];
    return (v != null && String(v).trim() !== '') ? v : defaultVal;
}

function pickFirstValue(row, keys, defaultVal = '—') {
    for (const key of keys) {
        const value = row?.[key];
        if (value != null && String(value).trim() !== '') return value;
    }
    return defaultVal;
}

const COLUMN_FALLBACKS = {
    POS: ['pos_final', 'pos_pdf', 'pos_raw', 'POS'],
    'PART NO.': ['pn_final', 'pn_pdf', 'pn_sust', 'pn_gesa', 'pn_raw', 'PART NO.'],
    pn_raw: ['pn_raw', 'PART NO.'],
    pn_final: ['pn_final', 'pn_pdf', 'pn_raw', 'PART NO.'],
    DESIGNATION: ['designation_raw', 'DESIGNATION'],
    designation_gesa: ['designation_gesa', 'designation_raw', 'DESIGNATION'],
    designation_final: ['designation_final', 'designation_pdf', 'designation_sust', 'designation_gesa', 'designation_raw', 'DESIGNATION'],
    'MODEL/TYPE': ['model_raw', 'model_final', 'model_pdf', 'MODEL/TYPE', 'model'],
    model: ['model_final', 'model_pdf', 'model', 'MODEL/TYPE'],
    QTY: ['qty_final', 'qty_raw', 'QTY'],
    UNITS: ['qty_units_final', 'qty_units_raw', 'qty_units_gesa', 'UNITS', 'units'],
    units: ['qty_units_gesa', 'qty_units_final', 'units', 'UNITS'],
    WEIGHT: ['weight_raw', 'weight_final', 'WEIGHT'],
    weight_final: ['weight_final', 'weight_raw', 'WEIGHT'],
    weight_gesa: ['weight_gesa', 'weight_final', 'weight_raw', 'WEIGHT'],
    FN: ['fn_final', 'fn_raw', 'FN'],
    'MEASUREMENT / STANDARD': ['measure_raw', 'measure_final', 'measure_gesa', 'MEASUREMENT / STANDARD'],
    measurement_final: ['measure_final', 'measure_gesa', 'measure_raw', 'measurement_final', 'MEASUREMENT / STANDARD'],
    dimensions_gesa: ['measure_gesa', 'measure_final', 'measure_raw', 'dimensions_gesa', 'MEASUREMENT / STANDARD'],
    norma: ['norma_final', 'norma_raw', 'norma']
};

export function isGesaRow(row) {
    return String(row?.gesa || '').trim().toUpperCase() === 'SI';
}

export function getRowValueForColumn(row, key, defaultVal = '—') {
    const fallbacks = COLUMN_FALLBACKS[key];
    if (Array.isArray(fallbacks)) {
        return pickFirstValue(row, fallbacks, defaultVal);
    }
    return val(row, key, defaultVal);
}

export function normalizeText(text) {
    if (text == null) return '';
    return String(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export function getPnKey(row) {
    return String(pickFirstValue(row, ['pn_final', 'pn_pdf', 'pn_raw', 'PART NO.', 'pn'], '')).trim();
}

/**
 * Devuelve el nombre del archivo engine_*.json correspondiente a un registro.
 * Ej: source_file='12V4000M40A.xlsx' → 'engine_12V4000M40A.json'
 */
export function getEngineJsonForRow(row) {
    const sf = String(row?.source_file || '').replace('.xlsx', '').trim();
    return sf ? `engine_${sf}.json` : null;
}

export function inferEngineModelFromFileName(fileName) {
    return String(fileName || '')
        .replace(/^engine_/i, '')
        .replace(/\.json$/i, '')
        .trim();
}

export function normalizeEngineModel(row, fallbackEngineModel) {
    const existing = String(row?.engine_model ?? '').trim();
    return { ...row, engine_model: existing || fallbackEngineModel };
}

function normalizePersistedQaErrors(row) {
    const raw = row?.qa_errors;
    if (!raw || typeof raw !== 'object') return null;
    return raw;
}

function getActiveCodesSignature(activeCodes) {
    const resolved = activeCodes instanceof Set
        ? [...activeCodes]
        : Array.isArray(activeCodes)
            ? activeCodes
            : [...resolveActiveErrorCodes(activeCodes)];

    return [...new Set(resolved.map(code => String(code ?? '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .join('|');
}

function normalizePersistedActiveQaErrors(row, activeCodes) {
    const raw = row?.qa_errors_active;
    if (!raw || typeof raw !== 'object') return null;
    const expectedSignature = getActiveCodesSignature(activeCodes);
    if (String(raw.signature || '') !== expectedSignature) return null;
    return raw;
}

function resolveScopedActiveQaErrors(row, activeCodes) {
    const scopedRows = state.qaChecksScopedRows;
    if (scopedRows instanceof Set && scopedRows.size > 0 && !scopedRows.has(row)) {
        const raw = row?.qa_errors_active;
        if (raw && typeof raw === 'object') return raw;
    }
    return normalizePersistedActiveQaErrors(row, activeCodes);
}

function resolveActiveErrorCodes(activeCodes) {
    if (activeCodes instanceof Set) return activeCodes;
    if (Array.isArray(activeCodes)) return new Set(activeCodes.map(code => String(code ?? '').trim()).filter(Boolean));
    if (state.activeQaErrorChecks instanceof Set && state.activeQaErrorChecks.size > 0) return state.activeQaErrorChecks;
    return new Set((state.qaErrorCheckDefinitions || []).map(def => String(def?.code ?? '').trim()).filter(Boolean));
}

function filterByActiveCodes(codes, activeCodes) {
    const active = resolveActiveErrorCodes(activeCodes);
    return [...new Set((codes || [])
        .map(code => String(code ?? '').trim())
        .filter(code => code && active.has(code)))];
}

function getPersistedErrorCodes(row, activeCodes) {
    const activePersisted = normalizePersistedActiveQaErrors(row, activeCodes);
    if (activePersisted && Array.isArray(activePersisted.codes)) return activePersisted.codes;

    const persisted = normalizePersistedQaErrors(row);
    if (!persisted || !Array.isArray(persisted.codes)) return [];
    return filterByActiveCodes(persisted.codes, activeCodes);
}

export function getRowErrorFields(row, options = {}) {
    const activePersisted = resolveScopedActiveQaErrors(row, options.activeCodes);
    if (activePersisted && typeof activePersisted.fields === 'object' && activePersisted.fields) {
        return new Set(Object.keys(activePersisted.fields).map(field => String(field ?? '').trim()).filter(Boolean));
    }

    const active = resolveActiveErrorCodes(options.activeCodes);
    const persisted = normalizePersistedQaErrors(row);
    if (!persisted || typeof persisted.fields !== 'object' || !persisted.fields) {
        return new Set();
    }

    const fieldNames = Object.keys(persisted.fields).filter(field => {
        const codes = Array.isArray(persisted.fields[field]) ? persisted.fields[field] : [];
        return codes.some(code => active.has(String(code ?? '').trim()));
    }).map(field => String(field ?? '').trim()).filter(Boolean);

    return new Set(fieldNames);
}

/**
 * Devuelve true si el registro tiene algún error.
 */
export function hasRowError(row) {
    return getRowErrors(row).length > 0;
}

/**
 * Devuelve el tipo de error más grave (para mostrar ícono rojo o naranja).
 * 'critical' = rojo, 'warning' = naranja, null = sin error
 */
export function getRowErrorType(row, options = {}) {
    const activePersisted = resolveScopedActiveQaErrors(row, options.activeCodes);
    if (activePersisted) {
        if (!Array.isArray(activePersisted.codes) || activePersisted.codes.length === 0) return null;
        return 'critical';
    }

    const errors = getRowErrors(row, options);
    if (!errors.length) return null;
    return 'critical';
}

export function getRowErrors(row, options = {}) {
    const activePersisted = resolveScopedActiveQaErrors(row, options.activeCodes);
    if (activePersisted && Array.isArray(activePersisted.codes)) {
        return [...new Set(activePersisted.codes.map(code => String(code ?? '').trim()).filter(Boolean))];
    }

    return getPersistedErrorCodes(row, options.activeCodes);
}
