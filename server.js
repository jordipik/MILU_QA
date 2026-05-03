// Simple Express backend para guardar cambios en archivos JSON
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ENGINE_JSON_FILES } = require('./engine_files');
const { recomputeEngineErrors } = require('./recompute_engine_errors');
const { runComparison } = require('./scripts/qa_pdf_compare');
const { applyRevisionPayload } = require('./apply_revision_to_engines');
const { runSyntheticCompaction, runPreviewBuild } = require('./scripts/export_review_pipeline');

const app = express();
const PORT = 3000;
const AUDIT_LOG_FILE = path.join(__dirname, 'qa_audit_log.json');
const AUDIT_LOG_MAX_ENTRIES = 10000;
const REVISION_SYNC_FILE = path.join(__dirname, 'qa_revision_server_data.json');
const EXPORT_REVIEW_DIR = path.join(__dirname, 'data', 'output', 'export_review');
const PN_SYNTHETIC_NEW_FILE = path.join(EXPORT_REVIEW_DIR, 'synthetic_new_compacted.json');
const PN_SYNTHETIC_SUPERSEDED_FILE = path.join(EXPORT_REVIEW_DIR, 'synthetic_superseded_compacted.json');
const PN_TRACE_FILE = path.join(EXPORT_REVIEW_DIR, 'wordpress_export_trace.json');

const pnReviewCache = {
    loadedAt: null,
    files: {
        syntheticNew: null,
        syntheticSuperseded: null,
        trace: null
    },
    payload: null
};

function readJsonFileSafe(filePath, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

function getFileFingerprint(filePath) {
    try {
        const stat = fs.statSync(filePath);
        return { mtimeMs: stat.mtimeMs, size: stat.size };
    } catch (_) {
        return null;
    }
}

function fingerprintsEqual(a, b) {
    return !!a && !!b && a.mtimeMs === b.mtimeMs && a.size === b.size;
}

function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function splitCsvUnique(value) {
    const parts = String(value || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    return [...new Set(parts)];
}

function pnKey(value) {
    return String(value || '').trim().toLowerCase();
}

function buildPnListItem(compactedRow, traceEntry) {
    const sku = String(compactedRow?.pn || traceEntry?.sku || '').trim();
    const decision = String(
        traceEntry?.preview?.import_decision || compactedRow?.merge_decision || 'pending_review'
    ).trim();
    const confidence = Number(toNumber(compactedRow?.merge_quality?.consistency_score, 0).toFixed(3));
    const occurrences = toNumber(compactedRow?.total_occurrences_global, Array.isArray(compactedRow?.source_records) ? compactedRow.source_records.length : 0);
    const conflicts = Array.isArray(compactedRow?.merge_quality?.real_conflict_fields)
        ? compactedRow.merge_quality.real_conflict_fields
        : [];
    const enginesCount = splitCsvUnique(compactedRow?.engine_models_all).length;

    return {
        sku,
        decision,
        confidence,
        occurrences,
        conflicts_count: conflicts.length,
        engines_count: enginesCount,
        sust_tipo: String(compactedRow?.sust_tipo || '').trim(),
        conflict_severity: String(compactedRow?.merge_quality?.conflict_severity || '').trim()
    };
}

function buildFieldStatuses(compactedRow) {
    const fieldResolutions = compactedRow?.merge_quality?.field_resolutions || {};

    const fields = [
        { key: 'designation', label: 'designation', value: String(compactedRow?.designation || '') },
        { key: 'measurement', label: 'measurement', value: String(compactedRow?.measurement || '') },
        { key: 'weight', label: 'weight', value: String(compactedRow?.weight || '') },
        { key: 'categoria', label: 'categoria', value: String(compactedRow?.categoria || '') },
        { key: 'new_pn_relacionado', label: 'new_pn_relacionado', value: String(compactedRow?.new_pn_relacionado || '') },
        { key: 'old_pn_relacionados', label: 'old_pn_relacionados', value: String(compactedRow?.old_pn_relacionados || '') }
    ];

    return fields.map((field) => {
        const resolutionKey = field.key === 'measurement' ? 'measure' : field.key;
        const resolution = fieldResolutions?.[resolutionKey] || {};
        const value = String(field.value || '').trim();
        let status = 'OK';
        let reason = 'consistente';

        if (!value) {
            status = 'ERROR';
            reason = 'valor_vacio';
        } else if (resolution?.conflict_real) {
            status = 'ERROR';
            reason = 'conflicto_real';
        } else if (resolution?.truncation_likely) {
            status = 'WARNING';
            reason = 'truncacion_probable';
        }

        return {
            field: field.label,
            value,
            status,
            reason,
            source_tier: toNumber(resolution?.source_tier, 0),
            agreement: Number(toNumber(resolution?.agreement, 0).toFixed(3)),
            distinct_values: toNumber(resolution?.distinct_values, 0)
        };
    });
}

function buildSourceDiffMeta(sourceRows) {
    const columns = ['designation_final', 'measure_final', 'weight_final', 'bom', 'pos', 'engine_model', 'source_page'];
    const conflictColumns = [];
    const distinctByColumn = {};

    for (const column of columns) {
        const values = [...new Set((sourceRows || []).map((row) => String(row?.[column] || '').trim()).filter(Boolean))];
        distinctByColumn[column] = values;
        if (values.length > 1) conflictColumns.push(column);
    }

    return { columns, conflictColumns, distinctByColumn };
}

function ensurePnReviewDataLoaded() {
    const fingerprints = {
        syntheticNew: getFileFingerprint(PN_SYNTHETIC_NEW_FILE),
        syntheticSuperseded: getFileFingerprint(PN_SYNTHETIC_SUPERSEDED_FILE),
        trace: getFileFingerprint(PN_TRACE_FILE)
    };

    const upToDate = pnReviewCache.payload
        && fingerprintsEqual(pnReviewCache.files.syntheticNew, fingerprints.syntheticNew)
        && fingerprintsEqual(pnReviewCache.files.syntheticSuperseded, fingerprints.syntheticSuperseded)
        && fingerprintsEqual(pnReviewCache.files.trace, fingerprints.trace);

    if (upToDate) {
        return pnReviewCache.payload;
    }

    const syntheticNew = readJsonFileSafe(PN_SYNTHETIC_NEW_FILE, []);
    const syntheticSuperseded = readJsonFileSafe(PN_SYNTHETIC_SUPERSEDED_FILE, []);
    const traceMap = readJsonFileSafe(PN_TRACE_FILE, {});

    const index = new Map();
    const traceIndex = new Map();
    const list = [];

    if (traceMap && typeof traceMap === 'object') {
        for (const [sku, entry] of Object.entries(traceMap)) {
            traceIndex.set(pnKey(sku), entry);
        }
    }

    const indexRows = [];
    if (Array.isArray(syntheticNew)) indexRows.push(...syntheticNew);
    if (Array.isArray(syntheticSuperseded)) indexRows.push(...syntheticSuperseded);

    for (const row of indexRows) {
        const sku = String(row?.pn || '').trim();
        if (!sku) continue;
        const key = pnKey(sku);
        const traceEntry = traceIndex.get(key) || null;

        if (!index.has(key)) {
            list.push(buildPnListItem(row, traceEntry));
        }
        index.set(key, {
            sku,
            compacted: row,
            trace: traceEntry
        });
    }

    list.sort((a, b) => String(a.sku).localeCompare(String(b.sku), 'es', { numeric: true, sensitivity: 'base' }));

    pnReviewCache.files = fingerprints;
    pnReviewCache.loadedAt = new Date().toISOString();
    pnReviewCache.payload = { list, index };
    return pnReviewCache.payload;
}

function runNodeScript(scriptRelativePath, args = []) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, scriptRelativePath);
        const child = spawn(process.execPath, [scriptPath, ...args], {
            cwd: __dirname,
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            stdout += String(chunk || '');
        });
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk || '');
        });
        child.on('error', (error) => {
            reject(error);
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolve({ ok: true, code, stdout, stderr });
                return;
            }
            reject(new Error(`Script ${scriptRelativePath} finalizo con codigo ${code}. ${stderr || stdout}`));
        });
    });
}

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
        await fs.promises.access(REVISION_SYNC_FILE, fs.constants.F_OK);
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
        await fs.promises.writeFile(REVISION_SYNC_FILE, `${JSON.stringify(emptyPayload, null, 2)}\n`, 'utf8');
    }
}

async function readRevisionSyncPayload() {
    await ensureRevisionSyncFile();
    const raw = await fs.promises.readFile(REVISION_SYNC_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('El JSON almacenado es invalido.');
    }
    return parsed;
}

async function writeRevisionSyncPayload(payload) {
    const tmpFile = `${REVISION_SYNC_FILE}.tmp`;
    await fs.promises.writeFile(tmpFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await fs.promises.rename(tmpFile, REVISION_SYNC_FILE);
}

async function ensureAuditLogFile() {
    try {
        await fs.promises.access(AUDIT_LOG_FILE, fs.constants.F_OK);
    } catch (_) {
        await fs.promises.writeFile(AUDIT_LOG_FILE, '[]\n', 'utf8');
    }
}

async function readAuditLogFile() {
    await ensureAuditLogFile();
    const raw = await fs.promises.readFile(AUDIT_LOG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
}

async function writeAuditLogFile(entries) {
    const safeEntries = Array.isArray(entries)
        ? entries.slice(-AUDIT_LOG_MAX_ENTRIES)
        : [];
    await fs.promises.writeFile(AUDIT_LOG_FILE, `${JSON.stringify(safeEntries, null, 2)}\n`, 'utf8');
}

function sanitizeAuditEntry(input) {
    const entry = {
        id: String(input?.id || '').trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        timestamp: String(input?.timestamp || '').trim() || new Date().toISOString(),
        kind: String(input?.kind || '').trim(),
        type: String(input?.type || '').trim(),
        module: String(input?.module || '').trim(),
        action: String(input?.action || '').trim(),
        description: String(input?.description || '').trim(),
        target: input?.target && typeof input.target === 'object' ? input.target : {},
        changeId: String(input?.changeId || '').trim(),
        data: input?.data && typeof input.data === 'object' ? input.data : {}
    };
    return entry;
}

function stripLegacyQaFields(value) {
    if (Array.isArray(value)) {
        value.forEach(stripLegacyQaFields);
        return value;
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    delete value.qa_errors;
    delete value.qa_errors_active;

    Object.values(value).forEach(stripLegacyQaFields);
    return value;
}

function legacyQaPipelineDisabled(res) {
    return res.status(410).json({
        ok: false,
        error: 'El pipeline legado de qa_errors persistidos en engine_*.json esta desactivado.'
    });
}

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

app.post('/recompute-qa-errors', async (req, res) => {
    const file = String(req.body?.file ?? '').trim();
    const id = String(req.body?.id ?? '').trim();
    const dryRun = Boolean(req.body?.dryRun);
    const updateRevision = req.body?.updateRevision === true;
    const forceRevision = req.body?.forceRevision === true;
    const backup = req.body?.backup !== false;

    if (!file) {
        return res.status(400).json({ ok: false, error: 'Falta parametro requerido: file' });
    }

    if (!ENGINE_JSON_FILES.includes(file)) {
        return res.status(400).json({
            ok: false,
            error: 'Archivo no permitido',
            allowedFiles: ENGINE_JSON_FILES
        });
    }

    try {
        const result = recomputeEngineErrors({
            file,
            id,
            dryRun,
            updateRevision,
            forceRevision,
            backup,
            rootDir: __dirname
        });
        return res.json({ ok: true, result });
    } catch (error) {
        const message = String(error?.message || error || 'Error desconocido');
        const isNotFound = /no se encontro ningun registro con id=/i.test(message);
        return res.status(isNotFound ? 404 : 500).json({ ok: false, error: message });
    }
});

app.post('/recompute-pdf-auto', async (req, res) => {
    const file = String(req.body?.file ?? '').trim();
    const id = String(req.body?.id ?? '').trim();
    const dryRun = Boolean(req.body?.dryRun);
    const backup = req.body?.backup !== false;

    if (!file) {
        return res.status(400).json({ ok: false, error: 'Falta parametro requerido: file' });
    }

    if (!ENGINE_JSON_FILES.includes(file)) {
        return res.status(400).json({
            ok: false,
            error: 'Archivo no permitido',
            allowedFiles: ENGINE_JSON_FILES
        });
    }

    try {
        const comparisonResult = await runComparison({
            file,
            id,
            writePdf: !dryRun,
            recomputeErrors: false,
            backup,
            output: ''
        });

        const report = comparisonResult?.report || {};
        const result = {
            file,
            mode: id ? 'single-id' : 'full-book',
            id: id || null,
            dryRun,
            scanned: Number(report.scanned_rows) || 0,
            changedRows: Number(report.changed_pdf_fields_rows) || 0,
            missingPages: Array.isArray(report.missing_pages) ? report.missing_pages.length : 0,
            wroteFile: Boolean(report.wrote_engine_file),
            output: String(comparisonResult?.outputPath || '')
        };

        return res.json({ ok: true, result });
    } catch (error) {
        const message = String(error?.message || error || 'Error desconocido');
        const isNotFound = /no se encontro ningun registro con id=/i.test(message);
        return res.status(isNotFound ? 404 : 500).json({ ok: false, error: message });
    }
});

app.get('/qa_revision_sync.php', async (_req, res) => {
    try {
        const payload = await readRevisionSyncPayload();
        return res.json(payload);
    } catch (error) {
        return res.status(500).json({ ok: false, error: `No se pudo leer revisiones: ${error.message}` });
    }
});

app.post('/qa_revision_sync.php', async (req, res) => {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ ok: false, error: 'JSON no valido.' });
    }

    try {
        const normalized = normalizeRevisionSyncPayload(payload);
        await writeRevisionSyncPayload(normalized);
        return res.json({ ok: true, saved_rows: Number(normalized?.meta?.rows) || 0 });
    } catch (error) {
        return res.status(400).json({ ok: false, error: String(error?.message || error) });
    }
});

app.post('/apply-revision-to-engines', async (req, res) => {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ ok: false, error: 'JSON no valido.' });
    }

    try {
        const result = await applyRevisionPayload(payload, {
            repoRoot: __dirname,
            sourceName: 'api:/apply-revision-to-engines'
        });
        return res.json({ ok: true, result });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.post('/export/run-synthetic', async (_req, res) => {
    try {
        const result = await withExportLock('run-synthetic', async () => {
            const synthetic = runSyntheticCompaction(__dirname);
            const previewSummary = runPreviewBuild(__dirname);
            return { synthetic, export_review_summary: previewSummary };
        });
        return res.json({ ok: true, result, run_state: exportRunState });
    } catch (error) {
        const status = error?.statusCode || 500;
        return res.status(status).json({ ok: false, error: String(error?.message || error), run_state: exportRunState });
    }
});

app.post('/export/run-wordpress', async (_req, res) => {
    try {
        const result = await withExportLock('run-wordpress', async () => {
            const wordpressRun = await runNodeScript(path.join('scripts', 'export_wordpress_milu.js'));
            const summary = runPreviewBuild(__dirname);
            return { wordpress: wordpressRun, export_review_summary: summary };
        });
        return res.json({ ok: true, result, run_state: exportRunState });
    } catch (error) {
        const status = error?.statusCode || 500;
        return res.status(status).json({ ok: false, error: String(error?.message || error), run_state: exportRunState });
    }
});

app.post('/export/run-ai-conflicts', async (_req, res) => {
    try {
        const result = await withExportLock('run-ai-conflicts', async () => {
            const aiRun = await runNodeScript(path.join('scripts', 'ai_conflict_rules.js'));
            return { ai: aiRun };
        });
        return res.json({ ok: true, result, run_state: exportRunState });
    } catch (error) {
        const status = error?.statusCode || 500;
        return res.status(status).json({ ok: false, error: String(error?.message || error), run_state: exportRunState });
    }
});

app.get('/export/preview', async (_req, res) => {
    try {
        const summaryPath = path.join(EXPORT_REVIEW_DIR, 'wordpress_export_summary.md');
        const previewPath = path.join(EXPORT_REVIEW_DIR, 'wordpress_export_preview.json');

        const previewRows = readJsonFileSafe(previewPath, []);
        const markdownSummary = fs.existsSync(summaryPath)
            ? fs.readFileSync(summaryPath, 'utf8')
            : '';

        const parsedSummary = {
            generated_at: null,
            preview_total: Array.isArray(previewRows) ? previewRows.length : 0,
            preview_import: Array.isArray(previewRows) ? previewRows.filter((r) => {
                const decision = String(r?.import_decision || '').toLowerCase();
                return decision === 'import' || decision === 'import_new' || decision === 'import_superseded';
            }).length : 0,
            preview_new: Array.isArray(previewRows) ? previewRows.filter((r) => String(r?.import_decision || '').toLowerCase() === 'import_new').length : 0,
            preview_superseded: Array.isArray(previewRows) ? previewRows.filter((r) => String(r?.import_decision || '').toLowerCase() === 'import_superseded').length : 0,
            preview_pending: Array.isArray(previewRows) ? previewRows.filter((r) => String(r?.import_decision || '').toLowerCase() === 'pending_review').length : 0,
            preview_discarded: Array.isArray(previewRows) ? previewRows.filter((r) => String(r?.import_decision || '').toLowerCase() === 'discard').length : 0,
            conflict_rows: Array.isArray(previewRows) ? previewRows.filter((r) => {
                const decision = String(r?.import_decision || '').toLowerCase();
                return decision === 'pending_review' || decision === 'discard';
            }).length : 0
        };

        return res.json({
            ok: true,
            summary: parsedSummary,
            markdownSummary,
            rows: Array.isArray(previewRows) ? previewRows : []
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.get('/export/wordpress-decisions', async (_req, res) => {
    try {
        const wpDir = path.join(__dirname, 'data', 'output', 'wordpress');
        const importRows = readJsonFileSafe(path.join(wpDir, 'milu_wp_import.json'), []);
        const pendingRows = readJsonFileSafe(path.join(wpDir, 'milu_wp_pending_review.json'), []);
        const discardRows = readJsonFileSafe(path.join(wpDir, 'milu_wp_discarded.json'), []);

        const allRows = [
            ...(Array.isArray(importRows) ? importRows : []),
            ...(Array.isArray(pendingRows) ? pendingRows : []),
            ...(Array.isArray(discardRows) ? discardRows : [])
        ];

        return res.json({
            ok: true,
            rows: allRows,
            summary: {
                total: allRows.length,
                import: Array.isArray(importRows) ? importRows.length : 0,
                pending_review: Array.isArray(pendingRows) ? pendingRows.length : 0,
                discard: Array.isArray(discardRows) ? discardRows.length : 0,
                qa_validated: allRows.filter((row) => String(row?.qa_validated).toLowerCase() === 'true').length
            }
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.get('/export/trace/:sku', async (req, res) => {
    const sku = String(req.params?.sku || '').trim();
    if (!sku) {
        return res.status(400).json({ ok: false, error: 'SKU requerido.' });
    }

    try {
        const tracePath = path.join(EXPORT_REVIEW_DIR, 'wordpress_export_trace.json');
        const trace = readJsonFileSafe(tracePath, {});
        const entry = trace && typeof trace === 'object' ? trace[sku] : null;
        if (!entry) {
            return res.status(404).json({ ok: false, error: `No hay traza para SKU ${sku}` });
        }
        return res.json({ ok: true, sku, trace: entry });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.get('/pn/list', async (req, res) => {
    try {
        const { list } = ensurePnReviewDataLoaded();

        const query = String(req.query?.q || '').trim().toLowerCase();
        const decision = String(req.query?.decision || '').trim().toLowerCase();
        const minConfidence = req.query?.minConfidence == null ? null : toNumber(req.query.minConfidence, 0);
        const maxConfidence = req.query?.maxConfidence == null ? null : toNumber(req.query.maxConfidence, 1);
        const sortBy = String(req.query?.sort || 'sku').trim();
        const order = String(req.query?.order || 'asc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
        const limitRaw = toNumber(req.query?.limit, 2000);
        const offsetRaw = toNumber(req.query?.offset, 0);
        const limit = Math.min(Math.max(1, Math.floor(limitRaw)), 10000);
        const offset = Math.max(0, Math.floor(offsetRaw));

        let rows = list;

        if (query) {
            rows = rows.filter((row) => String(row.sku || '').toLowerCase().includes(query));
        }
        if (decision) {
            rows = rows.filter((row) => String(row.decision || '').toLowerCase() === decision);
        }
        if (minConfidence != null) {
            rows = rows.filter((row) => toNumber(row.confidence, 0) >= minConfidence);
        }
        if (maxConfidence != null) {
            rows = rows.filter((row) => toNumber(row.confidence, 0) <= maxConfidence);
        }

        const sortable = new Set(['sku', 'decision', 'confidence', 'occurrences', 'conflicts_count', 'engines_count']);
        const effectiveSort = sortable.has(sortBy) ? sortBy : 'sku';

        rows = [...rows].sort((a, b) => {
            const av = a[effectiveSort];
            const bv = b[effectiveSort];
            let cmp = 0;
            if (typeof av === 'number' && typeof bv === 'number') {
                cmp = av - bv;
            } else {
                cmp = String(av || '').localeCompare(String(bv || ''), 'es', { numeric: true, sensitivity: 'base' });
            }
            return order === 'desc' ? -cmp : cmp;
        });

        const total = rows.length;
        const page = rows.slice(offset, offset + limit);

        return res.json({
            ok: true,
            rows: page,
            total,
            offset,
            limit,
            loaded_at: pnReviewCache.loadedAt
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.get('/pn/:sku', async (req, res) => {
    try {
        const sku = String(req.params?.sku || '').trim();
        if (!sku) {
            return res.status(400).json({ ok: false, error: 'SKU requerido.' });
        }

        const { index } = ensurePnReviewDataLoaded();
        const entry = index.get(pnKey(sku));
        if (!entry) {
            return res.status(404).json({ ok: false, error: `PN no encontrado: ${sku}` });
        }

        const compacted = entry.compacted || {};
        const sourceRecords = Array.isArray(compacted?.source_records)
            ? compacted.source_records
            : (Array.isArray(entry?.trace?.source_records) ? entry.trace.source_records : []);

        const conflicts = (compacted?.merge_quality?.real_conflict_fields || []).map((field) => ({
            field,
            severity: String(compacted?.merge_quality?.conflict_severity || 'medium')
        }));

        const exportableFields = buildFieldStatuses(compacted);

        const rulesApplied = [
            ...(Array.isArray(compacted?.merge_decision_reasons) ? compacted.merge_decision_reasons : []),
            ...exportableFields
                .filter((field) => field.source_tier > 0)
                .map((field) => `${field.field}:tier_${field.source_tier}`)
        ];

        const sourceDiffMeta = buildSourceDiffMeta(sourceRecords);

        return res.json({
            ok: true,
            sku: entry.sku,
            decision: String(entry?.trace?.preview?.import_decision || compacted?.merge_decision || ''),
            confidence: Number(toNumber(compacted?.merge_quality?.consistency_score, 0).toFixed(3)),
            score: {
                consistency_score: toNumber(compacted?.merge_quality?.consistency_score, 0),
                field_agreement_ratio: toNumber(compacted?.merge_quality?.field_agreement_ratio, 0),
                conflict_severity: String(compacted?.merge_quality?.conflict_severity || ''),
                conflicts_count: conflicts.length
            },
            resumen_fusion: {
                total_occurrences_global: toNumber(compacted?.total_occurrences_global, sourceRecords.length),
                engines_count: splitCsvUnique(compacted?.engine_models_all).length,
                engine_models_all: String(compacted?.engine_models_all || ''),
                source_pages_all: String(compacted?.source_pages_all || ''),
                source_ids_all: String(compacted?.source_ids_all || ''),
                merge_decision: String(compacted?.merge_decision || ''),
                merge_decision_reasons: Array.isArray(compacted?.merge_decision_reasons) ? compacted.merge_decision_reasons : []
            },
            exportable_fields: exportableFields,
            rules_applied: [...new Set(rulesApplied)],
            conflicts,
            compacted,
            trace: entry.trace || null,
            source_diff_meta: sourceDiffMeta
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.get('/pn/:sku/sources', async (req, res) => {
    try {
        const sku = String(req.params?.sku || '').trim();
        if (!sku) {
            return res.status(400).json({ ok: false, error: 'SKU requerido.' });
        }

        const { index } = ensurePnReviewDataLoaded();
        const entry = index.get(pnKey(sku));
        if (!entry) {
            return res.status(404).json({ ok: false, error: `PN no encontrado: ${sku}` });
        }

        const sourceRecords = Array.isArray(entry?.compacted?.source_records)
            ? entry.compacted.source_records
            : (Array.isArray(entry?.trace?.source_records) ? entry.trace.source_records : []);

        return res.json({
            ok: true,
            sku: entry.sku,
            count: sourceRecords.length,
            rows: sourceRecords,
            diff: buildSourceDiffMeta(sourceRecords)
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

// =============================================================================
// Export Manager — listado de archivos generados, preview y orquestador (lock).
// =============================================================================

const EXPORT_BASE_DIR = path.join(__dirname, 'data', 'output');
const EXPORT_FOLDER_WHITELIST = new Set(['wordpress', 'ai_review', 'export_review']);
const EXPORT_EXT_WHITELIST = new Set(['.json', '.csv', '.md', '.txt']);
const EXPORT_PREVIEW_MAX_BYTES = 512 * 1024; // 512KB

const exportRunState = {
    running: false,
    currentJob: null,
    startedAt: null,
    lastJob: null,
    lastResult: null,
    lastError: null,
    finishedAt: null
};

async function withExportLock(jobName, runner) {
    if (exportRunState.running) {
        const error = new Error(`Ya hay un proceso de exportacion en curso: ${exportRunState.currentJob}`);
        error.statusCode = 409;
        throw error;
    }
    exportRunState.running = true;
    exportRunState.currentJob = jobName;
    exportRunState.startedAt = new Date().toISOString();
    exportRunState.lastError = null;
    try {
        const result = await runner();
        exportRunState.lastResult = result;
        exportRunState.lastJob = jobName;
        exportRunState.finishedAt = new Date().toISOString();
        return result;
    } catch (error) {
        exportRunState.lastError = String(error?.message || error);
        exportRunState.lastJob = jobName;
        exportRunState.finishedAt = new Date().toISOString();
        throw error;
    } finally {
        exportRunState.running = false;
        exportRunState.currentJob = null;
    }
}

function safeFolderName(folder) {
    const value = String(folder || '').trim();
    if (!EXPORT_FOLDER_WHITELIST.has(value)) return null;
    return value;
}

function safeFileName(name) {
    const value = String(name || '').trim();
    if (!value) return null;
    if (value.includes('..') || value.includes('/') || value.includes('\\')) return null;
    const ext = path.extname(value).toLowerCase();
    if (!EXPORT_EXT_WHITELIST.has(ext)) return null;
    return value;
}

function listExportFolder(folderName) {
    const dir = path.join(EXPORT_BASE_DIR, folderName);
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!EXPORT_EXT_WHITELIST.has(ext)) continue;
        const fullPath = path.join(dir, entry.name);
        const stat = fs.statSync(fullPath);
        files.push({
            folder: folderName,
            name: entry.name,
            path: path.relative(__dirname, fullPath).replace(/\\/g, '/'),
            size: stat.size,
            mtime: stat.mtime.toISOString(),
            type: ext.replace(/^\./, '')
        });
    }
    return files;
}

app.get('/export/files', (_req, res) => {
    try {
        const allFiles = [];
        const byFolder = {};
        for (const folder of EXPORT_FOLDER_WHITELIST) {
            const files = listExportFolder(folder);
            byFolder[folder] = files.length;
            allFiles.push(...files);
        }
        let totalSize = 0;
        let lastModified = null;
        for (const f of allFiles) {
            totalSize += f.size;
            if (!lastModified || f.mtime > lastModified) lastModified = f.mtime;
        }
        return res.json({
            ok: true,
            files: allFiles,
            summary: {
                totalFiles: allFiles.length,
                totalSize,
                lastModified,
                byFolder
            },
            run_state: exportRunState
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.get('/export/status', (_req, res) => {
    res.json({ ok: true, run_state: exportRunState });
});

app.get('/export/file', (req, res) => {
    const folder = safeFolderName(req.query?.folder);
    const name = safeFileName(req.query?.name);
    if (!folder || !name) {
        return res.status(400).json({ ok: false, error: 'Carpeta o archivo no permitidos.' });
    }
    const fullPath = path.join(EXPORT_BASE_DIR, folder, name);
    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ ok: false, error: 'Archivo no encontrado.' });
    }
    try {
        const stat = fs.statSync(fullPath);
        const ext = path.extname(name).toLowerCase();
        const truncated = stat.size > EXPORT_PREVIEW_MAX_BYTES;
        const fd = fs.openSync(fullPath, 'r');
        const bufferSize = Math.min(stat.size, EXPORT_PREVIEW_MAX_BYTES);
        const buffer = Buffer.alloc(bufferSize);
        fs.readSync(fd, buffer, 0, bufferSize, 0);
        fs.closeSync(fd);
        const content = buffer.toString('utf8');

        const result = {
            ok: true,
            folder,
            name,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
            type: ext.replace(/^\./, ''),
            truncated,
            preview_bytes: bufferSize
        };

        if (ext === '.json') {
            try {
                const fullText = truncated ? fs.readFileSync(fullPath, 'utf8') : content;
                const parsed = JSON.parse(fullText);
                result.json = {
                    is_array: Array.isArray(parsed),
                    length: Array.isArray(parsed) ? parsed.length : null,
                    keys: !Array.isArray(parsed) && parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 50) : null,
                    sample: Array.isArray(parsed) ? parsed.slice(0, 20) : parsed
                };
                result.truncated = false;
            } catch (parseError) {
                result.json_parse_error = String(parseError?.message || parseError);
                result.text = content;
            }
        } else {
            result.text = content;
        }
        return res.json(result);
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.get('/export/download', (req, res) => {
    const folder = safeFolderName(req.query?.folder);
    const name = safeFileName(req.query?.name);
    if (!folder || !name) {
        return res.status(400).json({ ok: false, error: 'Carpeta o archivo no permitidos.' });
    }
    const fullPath = path.join(EXPORT_BASE_DIR, folder, name);
    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ ok: false, error: 'Archivo no encontrado.' });
    }
    return res.download(fullPath, name);
});

app.post('/export/run-all', async (_req, res) => {
    try {
        const result = await withExportLock('run-all', async () => {
            const synthetic = runSyntheticCompaction(__dirname);
            const wordpress = await runNodeScript(path.join('scripts', 'export_wordpress_milu.js'));
            const previewSummary = runPreviewBuild(__dirname);
            let aiResult = null;
            try {
                aiResult = await runNodeScript(path.join('scripts', 'ai_conflict_rules.js'));
            } catch (aiError) {
                aiResult = { ok: false, error: String(aiError?.message || aiError) };
            }
            return {
                synthetic,
                wordpress,
                export_review_summary: previewSummary,
                ai: aiResult
            };
        });
        return res.json({ ok: true, result, run_state: exportRunState });
    } catch (error) {
        const status = error?.statusCode || 500;
        return res.status(status).json({ ok: false, error: String(error?.message || error), run_state: exportRunState });
    }
});

app.get('/audit-log', async (req, res) => {
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), AUDIT_LOG_MAX_ENTRIES)
        : 500;

    try {
        const entries = await readAuditLogFile();
        const recent = entries.slice(-limit).reverse();
        return res.json({ ok: true, count: recent.length, entries: recent });
    } catch (error) {
        return res.status(500).json({ ok: false, error: `No se pudo leer auditoria: ${error.message}` });
    }
});

app.post('/audit-log', async (req, res) => {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ ok: false, error: 'Payload de auditoria invalido' });
    }

    try {
        const entries = await readAuditLogFile();
        const entry = sanitizeAuditEntry(payload);
        entries.push(entry);
        await writeAuditLogFile(entries);
        return res.json({ ok: true, entry });
    } catch (error) {
        return res.status(500).json({ ok: false, error: `No se pudo guardar auditoria: ${error.message}` });
    }
});

app.delete('/audit-log', async (_req, res) => {
    try {
        await writeAuditLogFile([]);
        return res.json({ ok: true });
    } catch (error) {
        return res.status(500).json({ ok: false, error: `No se pudo limpiar auditoria: ${error.message}` });
    }
});

app.use((req, res, next) => {
    if (/\.php$/i.test(req.path) && req.path.toLowerCase() !== '/qa_revision_sync.php') {
        return res.status(404).json({ ok: false, error: 'Ruta no disponible en backend local.' });
    }
    return next();
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.redirect('/qa_milu.html');
});

app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'milu-save-backend' });
});

// Cache en memoria de metadatos de engine_*.json. Clave: fileName -> { rowCount, mtimeMs, size }
const engineMetaCache = new Map();

function inferEngineModelFromFile(file) {
    return String(file || '').replace(/^engine_/, '').replace(/\.json$/i, '');
}

async function getEngineMetadata(file) {
    const filePath = path.join(__dirname, file);
    const stat = await fs.promises.stat(filePath);
    const cached = engineMetaCache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return { file, engine_model: inferEngineModelFromFile(file), rowCount: cached.rowCount, fileSize: stat.size, mtimeMs: stat.mtimeMs };
    }
    const raw = await fs.promises.readFile(filePath, 'utf8');
    let rowCount = 0;
    try {
        const arr = JSON.parse(raw);
        rowCount = Array.isArray(arr) ? arr.length : 0;
    } catch (_) {
        rowCount = 0;
    }
    engineMetaCache.set(file, { rowCount, mtimeMs: stat.mtimeMs, size: stat.size });
    return { file, engine_model: inferEngineModelFromFile(file), rowCount, fileSize: stat.size, mtimeMs: stat.mtimeMs };
}

// Catalogo de motores (metadatos sin payload). Pensado para AR-1 (carga incremental).
app.get('/engines', async (req, res) => {
    try {
        const items = await Promise.all(ENGINE_JSON_FILES.map(async (file) => {
            try {
                return await getEngineMetadata(file);
            } catch (err) {
                return { file, engine_model: inferEngineModelFromFile(file), rowCount: 0, fileSize: 0, mtimeMs: 0, error: String(err && err.message || err) };
            }
        }));
        const totals = items.reduce((acc, item) => {
            acc.rowCount += Number(item.rowCount || 0);
            acc.fileSize += Number(item.fileSize || 0);
            return acc;
        }, { rowCount: 0, fileSize: 0 });
        res.json({ ok: true, engines: items, totals });
    } catch (error) {
        res.status(500).json({ ok: false, error: String(error && error.message || error) });
    }
});

app.get('/version', (req, res) => {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        res.json({ version: pkg.version || '0.0.0' });
    } catch (_) {
        res.json({ version: '0.0.0' });
    }
});

// Ruta para guardar cambios en un archivo JSON
app.post('/save-json', async (req, res) => {
    const { file, id, col, value } = req.body;
    if (!file || !id || !col) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }
    // Solo permitir archivos válidos
    const allowedFiles = ENGINE_JSON_FILES;
    if (!allowedFiles.includes(file)) {
        return res.status(400).json({ error: 'Archivo no permitido' });
    }
    const filePath = path.join(__dirname, file);
    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        let json;
        try {
            json = JSON.parse(data);
        } catch (_parseError) {
            return res.status(500).json({ error: 'JSON inválido' });
        }
        const row = json.find(r => String(r.ID) === String(id));
        if (!row) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }
        row[col] = value;
        stripLegacyQaFields(json);
        await fs.promises.writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
        return res.json({ ok: true });
    } catch (_error) {
        return res.status(500).json({ error: 'No se pudo guardar el archivo' });
    }
});

app.post('/apply-qa-checks-filter', async (req, res) => {
    return legacyQaPipelineDisabled(res);
});

app.listen(PORT, () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
