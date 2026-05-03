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

function readJsonFileSafe(filePath, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return fallback;
    }
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
