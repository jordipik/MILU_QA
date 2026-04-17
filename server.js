// Simple Express backend para guardar cambios en archivos JSON
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { applyRevisionPayload } = require('./apply_revision_to_engines');
const { ENGINE_JSON_FILES } = require('./engine_files');
const { DEFAULT_ACTIVE_QA_CODES, applyQaErrorsToRows, applyActiveQaErrorsToRows, recomputeQaErrorsInFile, getQaErrorsStats, validateRow, filterQaErrorsByCodes, getActiveCodesSignature } = require('./qa_errors');

const app = express();
const PORT = 3000;
const REVISION_DATA_FILE = path.join(__dirname, 'qa_revision_server_data.json');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

function buildEmptyRevisionPayload() {
    return {
        meta: {
            source: 'server.js',
            version: 2,
            rows: 0
        },
        revisions: {
            v: 2,
            r: [],
            k: {}
        }
    };
}

function readRevisionPayloadFromDisk() {
    if (!fs.existsSync(REVISION_DATA_FILE)) return buildEmptyRevisionPayload();
    const raw = fs.readFileSync(REVISION_DATA_FILE, 'utf8').trim();
    if (!raw) return buildEmptyRevisionPayload();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return buildEmptyRevisionPayload();
    return parsed;
}

function sanitizeIncomingRevisions(revisions) {
    const version = Number.isFinite(Number(revisions?.v)) ? Number(revisions.v) : 2;
    const rows = [];
    const legacy = {};

    if (Array.isArray(revisions?.r)) {
        revisions.r.forEach(entry => {
            if (!Array.isArray(entry) || entry.length < 3) return;
            const idx = Number(entry[0]);
            if (!Number.isFinite(idx) || idx <= 0) return;
            const estado = String(entry[1] ?? '').trim();
            const accion = String(entry[2] ?? '').trim();
            if (!estado && !accion) return;
            rows.push([idx, estado, accion]);
        });
    }

    if (revisions?.k && typeof revisions.k === 'object' && !Array.isArray(revisions.k)) {
        Object.entries(revisions.k).forEach(([key, value]) => {
            if (!value || typeof value !== 'object') return;
            const estado = String(value.estado ?? '').trim();
            const accion = String(value.accion ?? '').trim();
            if (!estado && !accion) return;
            legacy[String(key)] = { estado, accion, updated_at: '' };
        });
    }

    rows.sort((a, b) => a[0] - b[0]);
    return { version, rows, legacy };
}

function writeRevisionPayloadToDisk(payload) {
    const tmp = `${REVISION_DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, REVISION_DATA_FILE);
}

app.options('/qa_revision_sync.php', (_req, res) => {
    res.sendStatus(204);
});

app.get('/qa_revision_sync.php', (_req, res) => {
    try {
        const payload = readRevisionPayloadFromDisk();
        res.json(payload);
    } catch (error) {
        res.status(500).json({ ok: false, error: `No se pudo leer revisiones: ${error.message}` });
    }
});

app.post('/qa_revision_sync.php', (req, res) => {
    try {
        const revisions = req.body?.revisions;
        if (!revisions || typeof revisions !== 'object' || Array.isArray(revisions)) {
            return res.status(400).json({ ok: false, error: 'Falta objeto revisions.' });
        }

        const { version, rows, legacy } = sanitizeIncomingRevisions(revisions);
        const payload = {
            meta: {
                updated_at: new Date().toISOString(),
                source: 'server.js',
                version: 2,
                rows: rows.length + Object.keys(legacy).length
            },
            revisions: {
                v: version,
                r: rows,
                k: legacy
            }
        };

        writeRevisionPayloadToDisk(payload);
        return res.json({ ok: true, saved_rows: payload.meta.rows });
    } catch (error) {
        return res.status(500).json({ ok: false, error: `No se pudo guardar revisiones: ${error.message}` });
    }
});

app.post('/apply-revision-to-engines', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return res.status(400).json({ ok: false, error: 'Payload de revisión no válido.' });
        }

        const result = await applyRevisionPayload(payload, {
            repoRoot: __dirname,
            sourceName: 'import_from_ui'
        });

        return res.json({ ok: true, ...result });
    } catch (error) {
        return res.status(500).json({ ok: false, error: `No se pudo aplicar revisión a libros: ${error.message}` });
    }
});

app.post('/recompute-qa-errors', async (_req, res) => {
    try {
        const perFile = {};
        let totalRows = 0;
        let rowsWithErrors = 0;
        let changedRows = 0;

        for (const fileName of ENGINE_JSON_FILES) {
            const filePath = path.join(__dirname, fileName);
            const summary = await recomputeQaErrorsInFile(filePath, { activeCodes: DEFAULT_ACTIVE_QA_CODES });
            perFile[fileName] = summary;
            totalRows += summary.totalRows;
            rowsWithErrors += summary.rowsWithErrors;
            changedRows += summary.changedRows;
        }

        return res.json({
            ok: true,
            totals: { totalRows, rowsWithErrors, changedRows },
            perFile
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: `No se pudo recalcular qa_errors: ${error.message}` });
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
        const qaErrorsSummary = await applyQaErrorsToRows(json);
        applyActiveQaErrorsToRows(json, DEFAULT_ACTIVE_QA_CODES);
        await fs.promises.writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
        return res.json({ ok: true, qaErrorsSummary });
    } catch (_error) {
        return res.status(500).json({ error: 'No se pudo guardar el archivo' });
    }
});

app.post('/apply-qa-checks-filter', async (req, res) => {
    const { activeCodes, scope, revisionKeys } = req.body;
    if (!Array.isArray(activeCodes)) {
        return res.status(400).json({ error: 'activeCodes debe ser un array' });
    }

    const resolvedScope = String(scope || 'all').trim().toLowerCase() === 'visible' ? 'visible' : 'all';

    if (resolvedScope === 'visible') {
        const parsedIndexes = Array.isArray(revisionKeys)
            ? revisionKeys
                .map(key => {
                    const match = String(key || '').match(/^idx=(\d+)$/);
                    if (!match) return null;
                    const parsed = Number(match[1]);
                    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
                })
                .filter(Number.isInteger)
            : [];

        const uniqueIndexes = new Set(parsedIndexes);
        if (uniqueIndexes.size === 0) {
            return res.status(400).json({ error: 'Para scope=visible se requiere revisionKeys con formato idx=<n>.' });
        }

        const signature = getActiveCodesSignature(activeCodes);
        const touchedRows = [];
        const touchedRowsPayload = [];
        let globalIndex = 0;
        let updatedRows = 0;

        try {
            for (const file of ENGINE_JSON_FILES) {
                const filePath = path.join(__dirname, file);
                if (!fs.existsSync(filePath)) continue;

                const data = fs.readFileSync(filePath, 'utf8');
                const rows = JSON.parse(data);
                if (!Array.isArray(rows)) continue;

                let fileChanged = false;
                for (const row of rows) {
                    globalIndex += 1;
                    if (!uniqueIndexes.has(globalIndex)) continue;

                    const nextQaErrors = await validateRow(row);
                    const nowIso = new Date().toISOString();
                    row.qa_errors = {
                        ...nextQaErrors,
                        updated_at: nowIso
                    };

                    row.qa_errors_active = {
                        ...filterQaErrorsByCodes(row.qa_errors, activeCodes),
                        signature
                    };

                    touchedRows.push(row);
                    touchedRowsPayload.push({
                        revisionKey: `idx=${globalIndex}`,
                        qa_errors: row.qa_errors,
                        qa_errors_active: row.qa_errors_active
                    });
                    updatedRows += 1;
                    fileChanged = true;
                }

                if (fileChanged) {
                    fs.writeFileSync(filePath, JSON.stringify(rows, null, 2) + '\n', 'utf8');
                }
            }

            const visibleStats = getQaErrorsStats(touchedRows, activeCodes);
            return res.json({
                ok: true,
                scope: 'visible',
                activeCodes,
                updatedRows,
                rows: touchedRowsPayload,
                stats: visibleStats,
                timestamp: new Date().toISOString()
            });
        } catch (err) {
            console.error('Error in /apply-qa-checks-filter (visible):', err);
            return res.status(500).json({ error: 'Error al procesar el filtro visible de QA checks' });
        }
    }

    const globalStats = {
        totalRows: 0,
        rowsWithErrors: 0,
        rowsOk: 0,
        codeCount: {},
        severityCount: { none: 0, warning: 0, critical: 0 },
        fileStats: {}
    };

    try {
        for (const file of ENGINE_JSON_FILES) {
            const filePath = path.join(__dirname, file);
            if (!fs.existsSync(filePath)) return;

            const data = fs.readFileSync(filePath, 'utf8');
            const rows = JSON.parse(data);
            if (!Array.isArray(rows)) return;

            // Recalcular el conjunto completo de errores y persistirlo en disco.
            await applyQaErrorsToRows(rows);
            applyActiveQaErrorsToRows(rows, activeCodes);

            fs.writeFileSync(filePath, JSON.stringify(rows, null, 2) + '\n', 'utf8');

            const fileStats = getQaErrorsStats(rows, activeCodes);
            globalStats.fileStats[file] = fileStats;

            // Actualizar estadísticas globales
            globalStats.totalRows += fileStats.totalRows;
            globalStats.rowsWithErrors += fileStats.rowsWithErrors;
            globalStats.rowsOk += fileStats.rowsOk;

            Object.entries(fileStats.codeCount).forEach(([code, count]) => {
                globalStats.codeCount[code] = (globalStats.codeCount[code] || 0) + count;
            });

            Object.entries(fileStats.severityCount).forEach(([severity, count]) => {
                globalStats.severityCount[severity] = (globalStats.severityCount[severity] || 0) + count;
            });
        }

        res.json({
            ok: true,
            scope: 'all',
            activeCodes,
            timestamp: new Date().toISOString(),
            stats: globalStats
        });
    } catch (err) {
        console.error('Error in /apply-qa-checks-filter:', err);
        res.status(500).json({ error: 'Error al procesar el filtro de QA checks' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
