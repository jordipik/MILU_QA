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
    const occurrenceById = new Map();
    const occurrenceByLegacyKey = new Map();
    rows.forEach((row) => {
        const id = String(row?.ID ?? '').trim();
        if (!id) {
            throw new Error('Se detecto una fila sin ID durante la asignacion de claves de revision.');
        }

        const nextIdOccurrence = (occurrenceById.get(id) || 0) + 1;
        occurrenceById.set(id, nextIdOccurrence);

        const legacyKey = buildLegacyRevisionKey(row);
        const nextOccurrence = (occurrenceByLegacyKey.get(legacyKey) || 0) + 1;
        occurrenceByLegacyKey.set(legacyKey, nextOccurrence);

        const idKey = nextIdOccurrence > 1
            ? `id=${id}||occ=${nextIdOccurrence}`
            : `id=${id}`;

        row.__qa_revision_legacy_key = legacyKey;
        row.__qa_revision_occ_key = `${legacyKey}||occ=${nextOccurrence}`;
        row.__qa_revision_key = idKey;
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

// ─── Mapeo de esquema antiguo al nuevo (Fase 1) ──────────────────────────────
// ESTADO: ok/revisado/en revisión/copia/descartado/vacío -> ok/pendiente
// ACCIÓN: mantener/revisar/actualizar/sustituir/eliminar/vacío → importar/revisar/eliminar

export function normalizeEstadoToNew(oldEstado) {
    const normalized = String(oldEstado || '').trim().toLowerCase();
    if (normalized === 'ok' || normalized === 'revisado') return 'ok';
    if (normalized === 'descartado') return 'ok';  // Histórico: mapeamos a ok
    if (normalized === 'en revisión' || normalized === 'en revision') return 'pendiente';
    if (normalized === 'copia') return 'pendiente';
    return 'pendiente';  // default: vacío → pendiente
}

export function normalizeAccionToNew(oldAccion) {
    const normalized = String(oldAccion || '').trim().toLowerCase();
    if (normalized === 'importar') return 'importar';
    if (normalized === 'mantener') return 'importar';
    if (normalized === 'revisar') return 'revisar';
    if (normalized === 'actualizar') return 'revisar';  // Campos pendientes → revisar
    if (normalized === 'sustituir') return 'revisar';     // Validación incompleta → revisar
    if (normalized === 'eliminar' || normalized === 'descartar') return 'eliminar';
    return 'importar';  // default: vacío → importar (asumir válido)
}

export function denormalizeAccionFromNew(newAccion) {
    // Persistimos valores canónicos nuevos; mantenemos compatibilidad de lectura en normalizeAccionToNew.
    const normalized = String(newAccion || '').trim().toLowerCase();
    if (normalized === 'importar' || normalized === 'mantener') return 'importar';
    if (normalized === 'revisar') return 'revisar';
    if (normalized === 'eliminar') return 'eliminar';
    return 'importar';
}

export function denormalizeEstadoFromNew(newEstado) {
    // Persistimos valores canónicos nuevos; mantenemos compatibilidad de lectura en normalizeEstadoToNew.
    const normalized = String(newEstado || '').trim().toLowerCase();
    if (normalized === 'ok' || normalized === 'revisado') return 'ok';
    return 'pendiente';
}

export function applyRevisionDataToRows(rows) {
    rows.forEach(row => {
        const rev = normalizeRevisionRecord({
            estado: row?.qa_revision_estado,
            accion: row?.qa_revision_accion,
            updated_at: row?.qa_revision_updated_at
        });
        row.qa_revision_estado = normalizeEstadoToNew(rev.estado);
        row.qa_revision_accion = normalizeAccionToNew(rev.accion);
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

async function persistRevisionRowToServer(row, changedFields = ['qa_revision_estado', 'qa_revision_accion']) {
    const engineFile = getEngineFileForRow(row);
    const id = String(row?.ID ?? '').trim();
    if (!engineFile || !id) {
        throw new Error('No se pudo determinar archivo/ID para guardar revisión.');
    }

    if (changedFields.includes('qa_revision_estado')) {
        await saveCellToServer(engineFile, id, 'qa_revision_estado', denormalizeEstadoFromNew(row.qa_revision_estado));
    }
    if (changedFields.includes('qa_revision_accion')) {
        await saveCellToServer(engineFile, id, 'qa_revision_accion', denormalizeAccionFromNew(row.qa_revision_accion));
    }
}

export function setRowRevision(row, estado, accion) {
    const prevEstado = normalizeEstadoToNew(row?.qa_revision_estado);
    const prevAccion = normalizeAccionToNew(row?.qa_revision_accion);
    const normalizedEstado = normalizeEstadoToNew(estado);
    const normalizedAccion = normalizeAccionToNew(accion);

    const changedFields = [];
    if (normalizedEstado !== prevEstado) changedFields.push('qa_revision_estado');
    if (normalizedAccion !== prevAccion) changedFields.push('qa_revision_accion');

    row.qa_revision_estado = normalizedEstado;
    row.qa_revision_accion = normalizedAccion;
    if (changedFields.length === 0) return;

    row.qa_revision_updated_at = new Date().toISOString();
    row.__qa_revision_save_failed = false;

    persistRevisionRowToServer(row, changedFields).catch(error => {
        row.__qa_revision_save_failed = true;
        const revisionKey = getRevisionKey(row);
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('qa:revision-save-failed', {
                detail: {
                    revisionKey,
                    message: String(error?.message || error || 'Error desconocido')
                }
            }));
        }
        console.warn('No se pudo guardar revisión en engine JSON:', error);
        alert(`No se pudo guardar la revisión en servidor: ${error.message}`);
    });
}

// ─── Clases visuales ─────────────────────────────────────────────────────────

export function getRevisionEstadoClass(value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return 'rev-empty';
    if (v === 'pendiente' || v === 'copia' || v === 'en revisión' || v === 'en revision') return 'rev-estado-en-revision';
    if (v === 'ok' || v === 'revisado') return 'rev-estado-revisado';
    if (v === 'descartado') return 'rev-estado-descartado';
    return 'rev-empty';
}

export function getRevisionAccionClass(value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return 'rev-empty';
    if (v === 'importar' || v === 'mantener') return 'rev-accion-mantener';
    if (v === 'revisar' || v === 'actualizar' || v === 'sustituir') return 'rev-accion-revisar';
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
 * @param {Object} selectedRow - La fila seleccionada (debe tener estado "OK")
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

    // Verificar que el estado es "ok"
    const selectedEstado = normalizeEstadoToNew(selectedRow?.qa_revision_estado);
    if (selectedEstado !== 'ok') {
        throw new Error('El registro seleccionado debe tener estado "OK" para aplicar esta operación.');
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
            setRowRevision(row, 'ok', selectedAccion);
        } catch (error) {
            errors.push({
                id: String(row?.ID || ''),
                error: error.message
            });
        }
    }

    return {
        success: errors.length === 0,
        message: `Se actualizaron ${targetRows.length} registros con Part Number "${selectedPn}" de "Pendiente" a "OK".`,
        updated: targetRows.length,
        targetPn: selectedPn,
        errors: errors.length > 0 ? errors : undefined
    };
}
