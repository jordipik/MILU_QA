/**
 * Gestión de datos de revisión (estado, acción) por fila.
 * Los datos viven en los propios engine_*.json y se guardan vía backend.
 */

import { state } from './state.js';
import { saveCellToServer } from './data-loader.js';

// ─── Claves de revisión ──────────────────────────────────────────────────────

export function buildLegacyRevisionKey(row) {
    const id = String(row?.ID ?? '').trim();
    const pn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
    const page = String(row?.['Source Page'] ?? '').trim();
    const pos = String(row?.POS ?? '').trim();
    const source = String(row?.source_file ?? '').trim();
    return [id, pn, page, pos, source].join('||');
}

export function assignRevisionKeys(rows) {
    const occurrenceByLegacyKey = new Map();
    rows.forEach((row, index) => {
        const legacyKey = buildLegacyRevisionKey(row);
        const nextOccurrence = (occurrenceByLegacyKey.get(legacyKey) || 0) + 1;
        occurrenceByLegacyKey.set(legacyKey, nextOccurrence);
        row.__qa_revision_legacy_key = legacyKey;
        row.__qa_revision_occ_key = `${legacyKey}||occ=${nextOccurrence}`;
        row.__qa_revision_key = `idx=${index + 1}`;
    });
}

export function getRevisionKey(row) {
    if (row && typeof row.__qa_revision_key === 'string' && row.__qa_revision_key.trim() !== '') {
        return row.__qa_revision_key;
    }
    return buildLegacyRevisionKey(row);
}

export function getRevisionKeyAliases(row) {
    if (!row) return [];
    const aliases = [];
    const key = getRevisionKey(row);
    const legacyKey = String(row.__qa_revision_legacy_key || buildLegacyRevisionKey(row) || '').trim();
    const occKey = String(row.__qa_revision_occ_key || '').trim();
    if (key) aliases.push(key);
    if (legacyKey && !aliases.includes(legacyKey)) aliases.push(legacyKey);
    if (occKey && !aliases.includes(occKey)) aliases.push(occKey);
    return aliases;
}

// ─── Normalización ───────────────────────────────────────────────────────────

export function normalizeRevisionRecord(record) {
    return {
        estado: String(record?.estado ?? '').trim(),
        accion: String(record?.accion ?? '').trim(),
        updated_at: String(record?.updated_at ?? '').trim()
    };
}

export function revisionRecordHasData(record) {
    return !!(String(record?.estado || '').trim() || String(record?.accion || '').trim());
}

export function parseStableRevisionIndex(key) {
    const m = String(key || '').match(/^idx=(\d+)$/);
    if (!m) return null;
    return Number(m[1]);
}

export async function loadRevisionData() {
    // Sin import/export de revisiones: no hay carga adicional.
}

// ─── Aplicar revisiones a las filas ──────────────────────────────────────────

export function applyRevisionDataToRows(rows) {
    rows.forEach(row => {
        const rev = normalizeRevisionRecord({
            estado: row?.qa_revision_estado,
            accion: row?.qa_revision_accion,
            updated_at: row?.qa_revision_updated_at
        });
        row.qa_revision_estado = rev.estado || '';
        row.qa_revision_accion = rev.accion || '';
        row.qa_revision_updated_at = rev.updated_at || '';
    });
}

function getEngineFileForRow(row) {
    const sourceFile = String(row?.source_file || '').trim();
    if (sourceFile) {
        const base = sourceFile
            .replace(/^engine_/i, '')
            .replace(/\.xlsx$/i, '')
            .replace(/\.json$/i, '')
            .trim();
        if (base) return `engine_${base}.json`;
    }

    const engineModel = String(row?.engine_model || '').trim();
    if (!engineModel) return '';
    if (/\.json$/i.test(engineModel)) return engineModel;
    if (/^engine_/i.test(engineModel)) return `${engineModel}.json`;
    return `engine_${engineModel}.json`;
}

async function persistRevisionRowToServer(row) {
    const engineFile = getEngineFileForRow(row);
    const id = String(row?.ID ?? '').trim();
    if (!engineFile || !id) {
        throw new Error('No se pudo determinar archivo/ID para guardar revisión.');
    }

    await saveCellToServer(engineFile, id, 'qa_revision_estado', String(row.qa_revision_estado || ''));
    await saveCellToServer(engineFile, id, 'qa_revision_accion', String(row.qa_revision_accion || ''));
}

export function setRowRevision(row, estado, accion) {
    const normalizedEstado = String(estado || '').trim();
    const normalizedAccion = String(accion || '').trim();
    row.qa_revision_estado = normalizedEstado;
    row.qa_revision_accion = normalizedAccion;
    row.qa_revision_updated_at = new Date().toISOString();

    persistRevisionRowToServer(row).catch(error => {
        console.warn('No se pudo guardar revisión en engine JSON:', error);
        alert(`No se pudo guardar la revisión en servidor: ${error.message}`);
    });
}

// ─── Clases visuales ─────────────────────────────────────────────────────────

export function getRevisionEstadoClass(value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return 'rev-empty';
    if (v === 'copia') return 'rev-estado-copia';
    if (v === 'en revisión') return 'rev-estado-en-revision';
    if (v === 'revisado') return 'rev-estado-revisado';
    if (v === 'descartado') return 'rev-estado-descartado';
    return 'rev-empty';
}

export function getRevisionAccionClass(value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return 'rev-empty';
    if (v === 'mantener') return 'rev-accion-mantener';
    if (v === 'actualizar') return 'rev-accion-actualizar';
    if (v === 'revisar') return 'rev-accion-revisar';
    if (v === 'sustituir') return 'rev-accion-sustituir';
    if (v === 'eliminar') return 'rev-accion-eliminar';
    return 'rev-empty';
}

export function updateRevisionSelectVisual(selectEl) {
    if (!(selectEl instanceof HTMLSelectElement)) return;
    const field = selectEl.dataset.revisionField;
    if (!field) return;
    const td = selectEl.closest('td');
    if (!td) return;
    const allRevClasses = [
        'rev-empty',
        'rev-estado-copia', 'rev-estado-en-revision', 'rev-estado-revisado', 'rev-estado-descartado',
        'rev-accion-mantener', 'rev-accion-actualizar', 'rev-accion-revisar', 'rev-accion-sustituir', 'rev-accion-eliminar'
    ];
    td.classList.remove(...allRevClasses);
    const visualClass = field === 'estado' ? getRevisionEstadoClass(selectEl.value) : getRevisionAccionClass(selectEl.value);
    td.classList.add('revision-cell', visualClass);
}

// ─── Aplicar revisión a registros con igual part number ─────────────────────

/**
 * Aplica el estado de revisión de un registro seleccionado a todos los
 * registros con el mismo part number que estén en estado "copia",
 * sin modificar el registro original.
 * 
 * @param {Object} selectedRow - La fila seleccionada (debe tener estado "revisado")
 * @returns {Promise<Object>} Resumen de registros actualizados
 */
export async function applyRevisionToMatchingPartNumbers(selectedRow) {
    if (!selectedRow) {
        throw new Error('Debe seleccionar un registro primero.');
    }

    // Obtener part number
    const selectedPn = String(selectedRow?.['PART NO.'] ?? selectedRow?.pn ?? '').trim();
    if (!selectedPn) {
        throw new Error('El registro seleccionado no tiene un Part Number.');
    }

    // Verificar que el estado es "revisado"
    const selectedEstado = String(selectedRow?.qa_revision_estado || '').trim().toLowerCase();
    if (selectedEstado !== 'revisado') {
        throw new Error('El registro seleccionado debe tener estado "Ok" (revisado) para aplicar esta operación.');
    }

    // Obtener acción del registro seleccionado
    const selectedAccion = String(selectedRow?.qa_revision_accion || '').trim();

    // Buscar todos los registros con igual part number y estado "copia"
    const targetRows = state.allData.filter(row => {
        if (row === selectedRow) return false; // Excluir el registro seleccionado
        const pn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
        const estado = String(row?.qa_revision_estado || '').trim().toLowerCase();
        return pn === selectedPn && estado === 'copia';
    });

    if (targetRows.length === 0) {
        return {
            success: true,
            message: 'No hay registros con el mismo Part Number en estado "Copia".',
            updated: 0,
            targetPn: selectedPn
        };
    }

    // Actualizar todos los registros encontrados
    const errors = [];
    for (const row of targetRows) {
        try {
            setRowRevision(row, 'revisado', selectedAccion);
        } catch (error) {
            errors.push({
                id: String(row?.ID || ''),
                error: error.message
            });
        }
    }

    return {
        success: errors.length === 0,
        message: `Se actualizaron ${targetRows.length} registros con Part Number "${selectedPn}" de "Copia" a "Ok".`,
        updated: targetRows.length,
        targetPn: selectedPn,
        errors: errors.length > 0 ? errors : undefined
    };
}
