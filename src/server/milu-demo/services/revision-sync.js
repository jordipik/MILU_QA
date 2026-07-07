'use strict';

const fs = require('fs');

function normalizeRevisionRecord(record) {
    return {
        estado: String(record?.estado ?? '').trim(),
        accion: String(record?.accion ?? '').trim(),
        updated_at: String(record?.updated_at ?? '').trim()
    };
}

function revisionRecordHasData(record) {
    return !!(String(record?.estado || '').trim() || String(record?.accion || '').trim());
}

function createRevisionSyncService(revisionSyncFile) {
    function normalizeRevisionSyncPayload(input) {
        const revisions = input?.revisions;
        if (!revisions || typeof revisions !== 'object') {
            throw new Error('Falta objeto revisions.');
        }

        const version = Number.isFinite(Number(revisions.v)) ? Number(revisions.v) : 2;
        const rows = [];
        const legacy = {};

        if (Array.isArray(revisions.r)) {
            revisions.r.forEach((entry) => {
                if (!Array.isArray(entry) || entry.length < 3) return;
                const idx = Number(entry[0]);
                if (!Number.isFinite(idx) || idx <= 0) return;

                const normalized = normalizeRevisionRecord({
                    estado: entry[1],
                    accion: entry[2],
                    updated_at: ''
                });
                if (!revisionRecordHasData(normalized)) return;
                rows.push([Math.floor(idx), normalized.estado, normalized.accion]);
            });
        }

        if (revisions.k && typeof revisions.k === 'object') {
            Object.entries(revisions.k).forEach(([key, value]) => {
                const normalized = normalizeRevisionRecord(value);
                if (!revisionRecordHasData(normalized)) return;
                legacy[String(key)] = {
                    estado: normalized.estado,
                    accion: normalized.accion,
                    updated_at: ''
                };
            });
        }

        rows.sort((a, b) => a[0] - b[0]);

        return {
            meta: {
                updated_at: new Date().toISOString(),
                source: 'qa_revision_sync.php',
                version: 2,
                rows: rows.length + Object.keys(legacy).length
            },
            revisions: {
                v: version,
                r: rows,
                k: legacy
            }
        };
    }

    async function ensureRevisionSyncFile() {
        try {
            await fs.promises.access(revisionSyncFile, fs.constants.F_OK);
        } catch (_) {
            const emptyPayload = {
                meta: {
                    source: 'qa_revision_sync.php',
                    version: 2,
                    rows: 0
                },
                revisions: {
                    v: 2,
                    r: [],
                    k: {}
                }
            };
            await fs.promises.writeFile(revisionSyncFile, `${JSON.stringify(emptyPayload, null, 2)}\n`, 'utf8');
        }
    }

    async function readRevisionSyncPayload() {
        await ensureRevisionSyncFile();
        const raw = await fs.promises.readFile(revisionSyncFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('El JSON almacenado es invalido.');
        }
        return parsed;
    }

    async function writeRevisionSyncPayload(payload) {
        const tmpFile = `${revisionSyncFile}.tmp`;
        await fs.promises.writeFile(tmpFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
        await fs.promises.rename(tmpFile, revisionSyncFile);
    }

    return {
        normalizeRevisionSyncPayload,
        ensureRevisionSyncFile,
        readRevisionSyncPayload,
        writeRevisionSyncPayload,
    };
}

module.exports = {
    createRevisionSyncService,
};
