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

export function isGesaRow(row) {
    return String(row?.gesa || '').trim().toUpperCase() === 'SI';
}

export function getRowValueForColumn(row, key, defaultVal = '—') {
    const normalizeMeasurementText = (value) => {
        const text = String(value ?? '').trim();
        return text ? text.replace(/\s{2,}/g, ' ') : '';
    };

    switch (key) {
        case 'designation_final': {
            const explicitFinal = String(row?.designation_final ?? '').trim();
            if (explicitFinal) return explicitFinal;
            return isGesaRow(row)
                ? val(row, 'designation_gesa', defaultVal)
                : val(row, 'DESIGNATION', defaultVal);
        }
        case 'measurement_final': {
            const gesaMeasurement = normalizeMeasurementText(row?.dimensions_gesa);
            if (gesaMeasurement) return gesaMeasurement;

            const rawMeasurement = normalizeMeasurementText(row?.['MEASUREMENT / STANDARD']);
            if (rawMeasurement) return rawMeasurement;

            const explicitFinal = normalizeMeasurementText(row?.measurement_final);
            if (explicitFinal) return explicitFinal;

            return defaultVal;
        }
        case 'weight_final': {
            const explicitFinal = String(row?.weight_final ?? '').trim();
            if (explicitFinal) return explicitFinal;
            if (!isGesaRow(row)) return val(row, 'WEIGHT', defaultVal);
            const weightValue = String(row?.weight_gesa ?? '').trim();
            const unitsValue = String(row?.units ?? '').trim();
            if (!weightValue) return defaultVal;
            return unitsValue ? `${weightValue} ${unitsValue}` : weightValue;
        }
        default:
            return val(row, key, defaultVal);
    }
}

export function normalizeText(text) {
    if (text == null) return '';
    return String(text)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export function getPnKey(row) {
    return String(row['PART NO.'] ?? row.pn ?? '').trim();
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

/**
 * Detecta errores en un registro (sin PN, inconsistencias Export, mismatches MILU_New, etc).
 * Devuelve array de strings con códigos/mensajes de error.
 * Vacío si no hay errores.
 */
function getDynamicRowErrors(row) {
    const errors = [];

    // Error: No tiene PN (PART NO. ni pn_final ni pn)
    const pn = String(row['PART NO.'] ?? row.pn_final ?? row.pn ?? '').trim();
    if (!pn) {
        errors.push('no_pn');
        return errors; // Sin PN, no hay sentido verificar más
    }

    // Error: PN está en ambos MILU_New Y MILU_Superseded (inconsistencia)
    if (state && state.newPnSet && state.supersededPnSet) {
        const isInNew = state.newPnSet.has(pn);
        const isInSuperseded = state.supersededPnSet.has(pn);

        if (isInNew && isInSuperseded) {
            errors.push('export_inconsistency');
        }
    }

    // Error Export_New: aplica a artículos no Superseded.
    const isSuperseded = String(row?.sust_hierarchie ?? row?.Hierarchie ?? '')
        .trim()
        .toUpperCase()
        .includes('SUPERSEDED');
    if (!isSuperseded) {
        const detalle = String(row?.detalle_cambio ?? '').trim();
        if (detalle && !detalle.toLowerCase().startsWith('match:')) {
            errors.push('export_mismatch_critical');
        }

        // Comparación de campos clave MILU_New vs vista sintética (misma intención que la ficha).
        // Esto cubre casos reales de mismatch aunque detalle_cambio venga como "match:".
        const miluNewRow = Array.isArray(state?.miluNewData)
            ? state.miluNewData.find(item => String(item?.pn ?? '').trim().toLowerCase() === pn.toLowerCase())
            : null;

        if (miluNewRow) {
            const relatedRows = Array.isArray(state?.allData)
                ? state.allData.filter(item => String(item?.['PART NO.'] ?? item?.pn_final ?? item?.pn ?? '').trim().toLowerCase() === pn.toLowerCase())
                : [row];

            const modelTypes = uniqueSortedForComparison(relatedRows.map(item => {
                const model = String(item?.model ?? '').trim();
                if (model) return model;
                return String(item?.engine_model ?? '').trim().replace('4000', '').trim();
            }));

            const categoryValues = uniqueSortedForComparison(relatedRows.map(item =>
                String(item?.categoria ?? item?.atributo ?? item?.exp_categorias ?? '').trim()
            ));

            const syntheticLike = {
                POS: String(row?.POS ?? '').trim(),
                designation: String(getRowValueForColumn(row, 'designation_final', '')).trim(),
                engine: String(row?.engine ?? '').trim() || '4000',
                model_type: modelTypes.join(', '),
                pn,
                nsn: String(row?.nsn ?? '').trim(),
                GESA_NORM: String(row?.norma ?? '').trim(),
                GESA_NORMALIZADO: String(row?.normalizado ?? '').trim(),
                fg_code: String(row?.fg_code ?? '').trim(),
                fg_description: String(row?.fgs_description ?? '').trim(),
                fg_code_description: String(row?.fgs_code_description ?? '').trim(),
                exp_categorias: categoryValues.join(', '),
                atributo: categoryValues.join(', ')
            };

            const warningFields = new Set(['exp_categorias', 'atributo']);
            const comparedFields = [
                'POS', 'designation', 'engine', 'model_type', 'pn', 'nsn',
                'GESA_NORM', 'GESA_NORMALIZADO', 'fg_code', 'fg_description',
                'fg_code_description', 'exp_categorias', 'atributo'
            ];

            let hasCriticalMismatch = false;
            let hasWarningMismatch = false;

            for (const field of comparedFields) {
                const left = normalizeFieldForComparison(field, syntheticLike[field]);
                const right = normalizeFieldForComparison(field, miluNewRow?.[field]);
                if (left === right) continue;
                if (warningFields.has(field)) hasWarningMismatch = true;
                else hasCriticalMismatch = true;
            }

            if (hasCriticalMismatch) errors.push('export_mismatch_critical');
            else if (hasWarningMismatch) errors.push('export_mismatch_warning');
        }
    }

    return errors;
}

function uniqueSortedForComparison(values) {
    const unique = [...new Set(values.map(v => String(v ?? '').trim()).filter(Boolean))];
    return unique.sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
}

function normalizeCommaSeparatedList(value) {
    const parts = String(value ?? '')
        .split(',')
        .map(part => part.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map(part => part.toLowerCase());
    return [...new Set(parts)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })).join('|');
}

function normalizeFieldForComparison(field, value) {
    if (field === 'model_type' || field === 'exp_categorias' || field === 'atributo') {
        return normalizeCommaSeparatedList(value);
    }
    return String(value ?? '').replace(/\s+/g, ' ').trim();
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
    const activePersisted = normalizePersistedActiveQaErrors(row, options.activeCodes);
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
    const activePersisted = normalizePersistedActiveQaErrors(row, options.activeCodes);
    if (activePersisted) {
        if (!Array.isArray(activePersisted.codes) || activePersisted.codes.length === 0) return null;
        return String(activePersisted.severity || '').trim() === 'critical' ? 'critical' : 'warning';
    }

    const errors = getRowErrors(row, options);
    if (!errors.length) return null;

    const criticalCodes = new Set([
        'missing_id',
        'missing_part_no',
        'duplicate_id',
        'no_pn',
        'export_inconsistency',
        'export_mismatch_critical'
    ]);

    if (errors.some(code => criticalCodes.has(code))) {
        return 'critical';
    }
    return 'warning';
}

export function getRowErrors(row, options = {}) {
    const activePersisted = normalizePersistedActiveQaErrors(row, options.activeCodes);
    if (activePersisted && Array.isArray(activePersisted.codes)) {
        return [...new Set(activePersisted.codes.map(code => String(code ?? '').trim()).filter(Boolean))];
    }

    const activeCodes = resolveActiveErrorCodes(options.activeCodes);
    const dynamicErrors = filterByActiveCodes(getDynamicRowErrors(row), activeCodes);
    const persistedErrors = getPersistedErrorCodes(row, activeCodes);
    return [...new Set([...persistedErrors, ...dynamicErrors])];
}
