// Simple Express backend para guardar cambios en archivos JSON
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ENGINE_JSON_FILES } = require('./engine_files');
const { recomputeEngineErrors } = require('./recompute_engine_errors');
const { runComparison } = require('./scripts/qa_pdf_compare');
const { applyRevisionPayload } = require('./apply_revision_to_engines');

const app = express();
const PORT = 3000;
const AUDIT_LOG_FILE = path.join(__dirname, 'qa_audit_log.json');
const AUDIT_LOG_MAX_ENTRIES = 10000;
const REVISION_SYNC_FILE = path.join(__dirname, 'qa_revision_server_data.json');

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
