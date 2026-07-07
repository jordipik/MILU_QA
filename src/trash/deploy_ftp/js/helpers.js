/**
 * Funciones de utilidad puras (sin acceso al DOM ni al estado global).
 */

import { state } from './state.js';
import { evaluateRowQaChecks, getAllQaCheckCodes, getQaActiveSignature } from './qa-checks.js';

export function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function val(row, key, defaultVal = '—') {
    const v = row[key];
    return (v != null && String(v).trim() !== '') ? v : defaultVal;
}

export function isGesaRow(row) {
    return String(row?.gesa || '').trim().toUpperCase() === 'SI';
}

export function getRowValueForColumn(row, key, defaultVal = '—') {
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
    const candidates = ['pn_final', 'pn_raw', 'PART NO.', 'pn'];
    for (const key of candidates) {
        const value = row?.[key];
        if (value != null && String(value).trim() !== '') return String(value).trim();
    }
    return '';
}

/**
 * Devuelve el nombre del archivo engine_*.json correspondiente a un registro.
 * Ej: source_file='12V4000M40A.xlsx' → 'engine_12V4000M40A.json'
 */
export function getEngineJsonForRow(row) {
    const engineModel = String(row?.engine_model || '').trim();
    if (engineModel) {
        return `engine_${engineModel}.json`;
    }

    const sourceFile = String(row?.source_file || '').trim();
    if (!sourceFile) return null;

    const normalized = sourceFile
        .replace(/^book_preview_/i, '')
        .replace(/^engine_/i, '')
        .replace(/\.(xlsx|json)$/i, '')
        .trim();

    return normalized ? `engine_${normalized}.json` : null;
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

function resolveActiveErrorCodes(activeCodes) {
    if (activeCodes instanceof Set) return activeCodes;
    if (Array.isArray(activeCodes)) return new Set(activeCodes.map(code => String(code ?? '').trim()).filter(Boolean));
    if (state.activeQaErrorChecks instanceof Set && state.activeQaErrorChecks.size > 0) return state.activeQaErrorChecks;
    return new Set(getAllQaCheckCodes());
}

function getResolvedQaResult(row, activeCodes) {
    const active = [...resolveActiveErrorCodes(activeCodes)];
    const scopedRows = state.qaChecksScopedRows;
    if (scopedRows instanceof Set && scopedRows.size > 0 && !scopedRows.has(row)) {
        return null;
    }

    const cached = row?.__qaChecksActive;
    const expectedSignature = getQaActiveSignature(active);
    if (cached && typeof cached === 'object' && String(cached.signature || '') === expectedSignature) {
        return cached;
    }

    return evaluateRowQaChecks(row, active);
}

export function getRowErrorFields(row, options = {}) {
    const resolved = getResolvedQaResult(row, options.activeCodes);
    if (!resolved || typeof resolved.fields !== 'object' || !resolved.fields) {
        return new Set();
    }

    const fieldNames = Object.keys(resolved.fields)
        .map(field => String(field ?? '').trim())
        .filter(Boolean);

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
    const resolved = getResolvedQaResult(row, options.activeCodes);
    return Array.isArray(resolved?.codes) && resolved.codes.length > 0 ? 'critical' : null;
}

export function getRowErrors(row, options = {}) {
    const resolved = getResolvedQaResult(row, options.activeCodes);
    return Array.isArray(resolved?.codes)
        ? [...new Set(resolved.codes.map(code => String(code ?? '').trim()).filter(Boolean))]
        : [];
}
