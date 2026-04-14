/**
 * Gestión de datos de revisión (estado, acción) por fila.
 * Los datos viven en los propios engine_*.json y se guardan vía backend.
 */

import { state } from './state.js';
import { saveCellToServer } from './data-loader.js';

const REVISION_APPLY_ENDPOINT = '/apply-revision-to-engines';

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

export function normalizeRevisionDataObject(parsed) {
    if (!parsed || typeof parsed !== 'object') return {};
    const normalizedData = {};

    if (parsed.revisions && typeof parsed.revisions === 'object') {
        return normalizeRevisionDataObject(parsed.revisions);
    }

    if (parsed.v === 2 && Array.isArray(parsed.r)) {
        parsed.r.forEach(entry => {
            const idx = Number(entry?.[0]);
            if (!Number.isFinite(idx) || idx <= 0) return;
            const key = `idx=${idx}`;
            const value = normalizeRevisionRecord({ estado: entry?.[1], accion: entry?.[2], updated_at: '' });
            if (revisionRecordHasData(value)) normalizedData[key] = value;
        });
        if (parsed.k && typeof parsed.k === 'object') {
            Object.entries(parsed.k).forEach(([key, value]) => {
                const normalized = normalizeRevisionRecord(value);
                if (revisionRecordHasData(normalized)) normalizedData[key] = normalized;
            });
        }
        return normalizedData;
    }

    Object.entries(parsed).forEach(([key, value]) => {
        const normalized = normalizeRevisionRecord(value);
        if (revisionRecordHasData(normalized)) normalizedData[key] = normalized;
    });
    return normalizedData;
}

export async function loadRevisionData() {
    // Las revisiones ya vienen en qa_revision_* dentro de engine_*.json.
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

export function setRowRevisionNoSave(row, estado, accion) {
    const normalizedEstado = String(estado || '').trim();
    const normalizedAccion = String(accion || '').trim();
    row.qa_revision_estado = normalizedEstado;
    row.qa_revision_accion = normalizedAccion;
    row.qa_revision_updated_at = new Date().toISOString();
}

// ─── Clases visuales ─────────────────────────────────────────────────────────

export function getRevisionEstadoClass(value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return 'rev-empty';
    if (v === 'pendiente') return 'rev-estado-pendiente';
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
        'rev-estado-pendiente', 'rev-estado-en-revision', 'rev-estado-revisado', 'rev-estado-descartado',
        'rev-accion-mantener', 'rev-accion-actualizar', 'rev-accion-revisar', 'rev-accion-sustituir', 'rev-accion-eliminar'
    ];
    td.classList.remove(...allRevClasses);
    const visualClass = field === 'estado' ? getRevisionEstadoClass(selectEl.value) : getRevisionAccionClass(selectEl.value);
    td.classList.add('revision-cell', visualClass);
}

// ─── Export / Import ─────────────────────────────────────────────────────────

export function createRevisionExportPayload() {
    const revisions = {};
    state.allData.forEach(row => {
        const revision = normalizeRevisionRecord({
            estado: row?.qa_revision_estado,
            accion: row?.qa_revision_accion,
            updated_at: row?.qa_revision_updated_at
        });
        if (!revisionRecordHasData(revision)) return;
        revisions[getRevisionKey(row)] = revision;
    });

    return {
        meta: { exported_at: new Date().toISOString(), source: 'qa_milu.html', version: 1, rows: Object.keys(revisions).length },
        revisions
    };
}

export function handleExportRevision() {
    const payload = createRevisionExportPayload();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `qa_revision_${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}

export async function handleImportRevisionFile(file) {
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    const importedRevisions = parsed?.revisions;
    if (!importedRevisions || typeof importedRevisions !== 'object') {
        throw new Error('JSON de revisión no válido: falta "revisions"');
    }
    const normalizedImport = normalizeRevisionDataObject(parsed);

    state.allData.forEach(row => {
        const aliases = getRevisionKeyAliases(row);
        let imported = null;
        for (const alias of aliases) {
            if (normalizedImport[alias]) {
                imported = normalizedImport[alias];
                break;
            }
        }
        if (!imported) return;

        const normalized = normalizeRevisionRecord(imported);
        row.qa_revision_estado = normalized.estado;
        row.qa_revision_accion = normalized.accion;
        row.qa_revision_updated_at = normalized.updated_at || new Date().toISOString();
    });

    return parsed;
}

export async function applyImportedRevisionToEngineJson(parsedRevisionPayload) {
    if (!parsedRevisionPayload || typeof parsedRevisionPayload !== 'object') {
        throw new Error('No hay payload de revisión para aplicar en backend.');
    }

    const response = await fetch(REVISION_APPLY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedRevisionPayload)
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
    }

    return await response.json();
}
