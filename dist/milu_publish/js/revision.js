/**
 * Gestión de datos de revisión (estado, acción) por fila.
 * Los datos se guardan en localStorage y opcionalmente en un servidor PHP.
 */

import { state } from './state.js';

export const REVISION_STORAGE_KEY = 'milu_revision_data_v1';
export const REVISION_REMOTE_SYNC_URL = '/qa_revision_sync.php';

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

// ─── Payload de sincronización ───────────────────────────────────────────────

export function createRevisionRemotePayload() {
    const compactRows = [];
    const legacyKeys = {};
    Object.entries(state.revisionData).forEach(([key, value]) => {
        const normalized = normalizeRevisionRecord(value);
        if (!revisionRecordHasData(normalized)) return;
        const idx = parseStableRevisionIndex(key);
        if (idx != null) {
            compactRows.push([idx, normalized.estado, normalized.accion]);
        } else {
            legacyKeys[key] = { estado: normalized.estado, accion: normalized.accion, updated_at: '' };
        }
    });
    compactRows.sort((a, b) => a[0] - b[0]);
    return { v: 2, r: compactRows, k: legacyKeys };
}

function detectUnsupportedRemoteSyncContent(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return false;
    return text.startsWith('<?php') || text.includes('declare(strict_types=1);');
}

// ─── Remote sync ─────────────────────────────────────────────────────────────

export async function loadRevisionDataFromRemote() {
    if (!REVISION_REMOTE_SYNC_URL || !state.revisionRemoteSyncEnabled) return;
    try {
        const response = await fetch(`${REVISION_REMOTE_SYNC_URL}?t=${Date.now()}`, { method: 'GET', cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        const raw = await response.text();
        if (detectUnsupportedRemoteSyncContent(raw)) {
            state.revisionRemoteSyncEnabled = false;
            console.warn('Sincronizacion remota desactivada: el endpoint no ejecuta PHP en este hosting.');
            return;
        }
        const parsed = JSON.parse(raw);
        const normalized = normalizeRevisionDataObject(parsed);
        if (Object.keys(normalized).length) state.revisionData = normalized;
    } catch (error) {
        console.warn('No se pudo cargar revisión remota:', error);
    }
}

export async function saveRevisionDataToRemoteNow() {
    if (!REVISION_REMOTE_SYNC_URL || !state.revisionRemoteSyncEnabled) return;
    try {
        const response = await fetch(REVISION_REMOTE_SYNC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                meta: { updated_at: new Date().toISOString(), source: 'qa_milu.html', version: 2 },
                revisions: createRevisionRemotePayload()
            })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        const raw = await response.text();
        if (detectUnsupportedRemoteSyncContent(raw)) {
            state.revisionRemoteSyncEnabled = false;
            console.warn('Sincronizacion remota desactivada: el endpoint no ejecuta PHP en este hosting.');
            return;
        }
        state.revisionRemoteErrorShown = false;
    } catch (error) {
        console.warn('No se pudo guardar revisión remota:', error);
        if (!state.revisionRemoteErrorShown) {
            state.revisionRemoteErrorShown = true;
            alert('No se pudo guardar la revisión en servidor. Se mantiene guardada en este navegador.');
        }
    }
}

export function scheduleRemoteRevisionSync() {
    if (!REVISION_REMOTE_SYNC_URL || !state.revisionRemoteSyncEnabled) return;
    if (state.revisionRemoteSyncTimeout) clearTimeout(state.revisionRemoteSyncTimeout);
    state.revisionRemoteSyncTimeout = setTimeout(() => { saveRevisionDataToRemoteNow(); }, 500);
}

// ─── localStorage ────────────────────────────────────────────────────────────

export function loadRevisionDataFromStorage() {
    try {
        const raw = localStorage.getItem(REVISION_STORAGE_KEY);
        if (!raw) { state.revisionData = {}; return; }
        state.revisionData = normalizeRevisionDataObject(JSON.parse(raw));
    } catch (error) {
        console.warn('No se pudo cargar revisión local:', error);
        state.revisionData = {};
    }
}

export function saveRevisionDataToStorage() {
    try {
        const payload = createRevisionRemotePayload();
        localStorage.setItem(REVISION_STORAGE_KEY, JSON.stringify(payload));
        scheduleRemoteRevisionSync();
    } catch (error) {
        console.warn('No se pudo guardar revisión local:', error);
        if (!state.revisionStorageErrorShown) {
            state.revisionStorageErrorShown = true;
            alert('No se pudo guardar la revisión en este navegador/origen. Comprueba permisos de almacenamiento local.');
        }
    }
}

export async function loadRevisionData() {
    loadRevisionDataFromStorage();
    await loadRevisionDataFromRemote();
    saveRevisionDataToStorage();
}

// ─── Aplicar revisiones a las filas ──────────────────────────────────────────

export function applyRevisionDataToRows(rows) {
    rows.forEach(row => {
        const aliases = getRevisionKeyAliases(row);
        let rev = null;
        for (const alias of aliases) {
            if (state.revisionData[alias]) { rev = state.revisionData[alias]; break; }
        }
        if (!rev) {
            const fromRow = normalizeRevisionRecord({
                estado: row?.qa_revision_estado,
                accion: row?.qa_revision_accion,
                updated_at: row?.qa_revision_updated_at
            });
            rev = revisionRecordHasData(fromRow) ? fromRow : { estado: '', accion: '', updated_at: '' };
        }

        row.qa_revision_estado = rev.estado || '';
        row.qa_revision_accion = rev.accion || '';
        row.qa_revision_updated_at = rev.updated_at || '';

        const primaryKey = aliases[0];
        if (primaryKey && rev && !state.revisionData[primaryKey] && (rev.estado || rev.accion)) {
            state.revisionData[primaryKey] = normalizeRevisionRecord(rev);
        }
    });
}

export function setRowRevision(row, estado, accion) {
    const normalizedEstado = String(estado || '').trim();
    const normalizedAccion = String(accion || '').trim();
    const aliases = getRevisionKeyAliases(row);
    const key = aliases[0];
    if (!key) return;
    if (!normalizedEstado && !normalizedAccion) {
        aliases.forEach(alias => { delete state.revisionData[alias]; });
    } else {
        state.revisionData[key] = { estado: normalizedEstado, accion: normalizedAccion, updated_at: new Date().toISOString() };
        aliases.slice(1).forEach(alias => { delete state.revisionData[alias]; });
    }
    row.qa_revision_estado = normalizedEstado;
    row.qa_revision_accion = normalizedAccion;
    row.qa_revision_updated_at = state.revisionData[key]?.updated_at || '';
    saveRevisionDataToStorage();
}

export function setRowRevisionNoSave(row, estado, accion) {
    const normalizedEstado = String(estado || '').trim();
    const normalizedAccion = String(accion || '').trim();
    const aliases = getRevisionKeyAliases(row);
    const key = aliases[0];
    if (!key) return;
    if (!normalizedEstado && !normalizedAccion) {
        aliases.forEach(alias => { delete state.revisionData[alias]; });
    } else {
        state.revisionData[key] = { estado: normalizedEstado, accion: normalizedAccion, updated_at: new Date().toISOString() };
        aliases.slice(1).forEach(alias => { delete state.revisionData[alias]; });
    }
    row.qa_revision_estado = normalizedEstado;
    row.qa_revision_accion = normalizedAccion;
    row.qa_revision_updated_at = state.revisionData[key]?.updated_at || '';
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
    return {
        meta: { exported_at: new Date().toISOString(), source: 'qa_milu.html', version: 1, rows: Object.keys(state.revisionData).length },
        revisions: state.revisionData
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
    Object.entries(importedRevisions).forEach(([key, value]) => {
        const normalized = normalizeRevisionRecord(value);
        if (!normalized.estado && !normalized.accion) {
            delete state.revisionData[key];
        } else {
            state.revisionData[key] = normalized;
        }
    });
    saveRevisionDataToStorage();
}
