// Simple Express backend para guardar cambios en archivos JSON
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ENGINE_JSON_FILES } = require('./engine_files');
const { recomputeEngineErrors } = require('./recompute_engine_errors');
const { runComparison } = require('./scripts/qa_pdf_compare');

const app = express();
const PORT = 3000;
const AUDIT_LOG_FILE = path.join(__dirname, 'qa_audit_log.json');
const AUDIT_LOG_MAX_ENTRIES = 10000;

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

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.redirect('/qa_milu.html');
});

app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'milu-save-backend' });
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
