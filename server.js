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
const { buildQaSummary: buildQaSummaryFromExport, decideByQa } = require('./scripts/export_wordpress_milu');

const app = express();
const PORT = 3000;
const AUDIT_LOG_FILE = path.join(__dirname, 'qa_audit_log.json');
const AUDIT_LOG_MAX_ENTRIES = 10000;
const REVISION_SYNC_FILE = path.join(__dirname, 'qa_revision_server_data.json');
const WORDPRESS_OUTPUT_DIR = path.join(__dirname, 'data', 'output', 'wordpress');

const pnReviewQaCache = {
    loadedAt: null,
    engineFingerprints: {},
    payload: null
};

function readJsonFileSafe(filePath, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

function readFirstJsonFileSafe(baseDir, fileNames, fallback = null) {
    for (const name of fileNames || []) {
        const fullPath = path.join(baseDir, name);
        if (!fs.existsSync(fullPath)) continue;
        return readJsonFileSafe(fullPath, fallback);
    }
    return fallback;
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
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.mtimeMs === b.mtimeMs && a.size === b.size;
}

function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeText(value) {
    return String(value == null ? '' : value).trim();
}

function lowerKey(value) {
    return normalizeText(value).toLowerCase();
}

function collapseSpaces(value) {
    return normalizeText(value).replace(/\s+/g, ' ');
}

function splitCsvUnique(value) {
    const parts = normalizeText(value)
        .split(',')
        .map((part) => normalizeText(part))
        .filter(Boolean);
    return [...new Set(parts)];
}

function pnKey(value) {
    return lowerKey(value);
}

function uniq(values) {
    return [...new Set((values || []).filter(Boolean))];
}

function pickMostFrequent(values) {
    const counts = new Map();
    let bestKey = '';
    let bestValue = '';
    let bestCount = 0;

    for (const raw of values || []) {
        const value = collapseSpaces(raw);
        if (!value) continue;
        const key = lowerKey(value);
        const current = counts.get(key) || { count: 0, value };
        current.count += 1;
        if (value.length > current.value.length) current.value = value;
        counts.set(key, current);

        if (
            current.count > bestCount
            || (current.count === bestCount && current.value.length > bestValue.length)
        ) {
            bestCount = current.count;
            bestValue = current.value;
            bestKey = key;
        }
    }

    return bestKey ? bestValue : '';
}

function getRowPn(row) {
    // Prioriza pn_final (valor depurado) para evitar partir grupos por PART NO. contaminado.
    return normalizeText(row?.pn_final || row?.['PART NO.'] || row?.pn);
}

function getRowDesignation(row) {
    return pickMostFrequent([
        row?.designation_final,
        row?.designation_gesa,
        row?.designation_pdf,
        row?.DESIGNATION
    ]);
}

function getRowMeasure(row) {
    return pickMostFrequent([
        row?.measure_final,
        row?.measurement_final,
        row?.dimensions_gesa,
        row?.measure_pdf,
        row?.['MEASUREMENT / STANDARD']
    ]);
}

function getRowWeight(row) {
    return pickMostFrequent([
        row?.weight_final,
        row?.weight_gesa,
        row?.weight_pdf,
        row?.WEIGHT
    ]);
}

function parseImagesFromValue(value) {
    if (Array.isArray(value)) {
        return uniq(value.map((item) => normalizeText(item)).filter(Boolean));
    }

    const text = normalizeText(value);
    if (!text) return [];

    return uniq(text
        .split(/[\n,;|]/)
        .map((part) => normalizeText(part))
        .filter(Boolean));
}

function rowHasAnySust(row) {
    return Boolean(
        normalizeText(row?.sust_status)
        || normalizeText(row?.sust_hierarchie)
        || normalizeText(row?.sust_new_part_number)
        || normalizeText(row?.sust_superseded_list)
    );
}

function uniqueValues(rows, picker) {
    return uniq((rows || [])
        .map((row) => collapseSpaces(picker(row)))
        .filter(Boolean)
    );
}

function uniqueNormalizedValues(rows, picker) {
    return uniq((rows || [])
        .map((row) => lowerKey(collapseSpaces(picker(row))))
        .filter(Boolean)
    );
}

function normalizeQaSummary(qaSummary) {
    return {
        total_rows: toNumber(qaSummary?.total_rows, 0),
        ok_importar: toNumber(qaSummary?.count_ok_importar, 0),
        ok_eliminar: toNumber(qaSummary?.count_ok_eliminar, 0),
        pendiente: toNumber(qaSummary?.count_pending, 0),
        revisar: toNumber(qaSummary?.count_review_action, 0),
        otros: toNumber(qaSummary?.count_other, 0)
    };
}

function buildMergedFields(rows) {
    const designationFinal = pickMostFrequent(rows.map(getRowDesignation));
    const measureFinal = pickMostFrequent(rows.map(getRowMeasure));
    const weightFinal = pickMostFrequent(rows.map(getRowWeight));
    const sustNewPartNumber = pickMostFrequent(rows.map((row) => row?.sust_new_part_number));
    const sustSupersededList = pickMostFrequent(rows.map((row) => row?.sust_superseded_list));
    const categories = uniq(rows.map((row) => normalizeText(row?.categoria)).filter(Boolean));
    const tags = uniq(rows.flatMap((row) => splitCsvUnique(row?.tags)).filter(Boolean));
    const images = uniq(rows.flatMap((row) => parseImagesFromValue(row?.exp_imagenes)));

    return {
        designation_final: designationFinal,
        measure_final: measureFinal,
        weight_final: weightFinal,
        images,
        sust_new_part_number: sustNewPartNumber,
        sust_superseded_list: sustSupersededList,
        categories,
        tags
    };
}

function buildPnValidation(sku, rows, mergedFields) {
    const distinctDesignation = uniqueNormalizedValues(rows, getRowDesignation);
    const distinctMeasure = uniqueNormalizedValues(rows, getRowMeasure);
    const distinctWeight = uniqueNormalizedValues(rows, getRowWeight);
    const distinctSustNew = uniqueNormalizedValues(rows, (row) => row?.sust_new_part_number);
    const conflictCodes = [];

    if (distinctDesignation.length > 1) conflictCodes.push('designation_conflict');
    if (distinctWeight.length > 1) conflictCodes.push('weight_conflict');
    if (distinctMeasure.length > 1) conflictCodes.push('measure_conflict');
    if (distinctSustNew.length > 1) conflictCodes.push('sust_new_part_number_conflict');

    return {
        has_pn: Boolean(normalizeText(sku)),
        has_designation: Boolean(normalizeText(mergedFields?.designation_final)),
        has_image: Array.isArray(mergedFields?.images) && mergedFields.images.length > 0,
        has_measure: Boolean(normalizeText(mergedFields?.measure_final)),
        has_weight: Boolean(normalizeText(mergedFields?.weight_final)),
        has_sust: rows.some((row) => rowHasAnySust(row)),
        has_conflicts: conflictCodes.length > 0,
        conflict_codes: conflictCodes
    };
}

function buildMappedSourceRow(row) {
    return {
        ID: normalizeText(row?.ID),
        engine_model: normalizeText(row?.engine_model || row?.model || row?.engine),
        source_file: normalizeText(row?.__engine_file || row?.source_file),
        'Source Page': normalizeText(row?.['Source Page']),
        POS: normalizeText(row?.POS || row?.pos_final),
        'PART NO.': normalizeText(row?.['PART NO.']),
        pn_final: normalizeText(row?.pn_final),
        DESIGNATION: normalizeText(row?.DESIGNATION),
        designation_final: getRowDesignation(row),
        designation_gesa: normalizeText(row?.designation_gesa),
        designation_pdf: normalizeText(row?.designation_pdf),
        measure_final: getRowMeasure(row),
        dimensions_gesa: normalizeText(row?.dimensions_gesa),
        measure_pdf: normalizeText(row?.measure_pdf),
        weight_final: getRowWeight(row),
        weight_gesa: normalizeText(row?.weight_gesa),
        weight_pdf: normalizeText(row?.weight_pdf),
        sust_status: normalizeText(row?.sust_status),
        sust_hierarchie: normalizeText(row?.sust_hierarchie),
        sust_new_part_number: normalizeText(row?.sust_new_part_number),
        sust_superseded_list: normalizeText(row?.sust_superseded_list),
        qa_revision_estado: normalizeText(row?.qa_revision_estado),
        qa_revision_accion: normalizeText(row?.qa_revision_accion),
        exp_imagenes: normalizeText(row?.exp_imagenes)
    };
}

function buildPnPropagationFields(input = {}) {
    return {
        pn_final: normalizeText(input?.pn_final),
        designation_final: normalizeText(input?.designation_final),
        measure_final: normalizeText(input?.measure_final ?? input?.measurement_final),
        weight_final: normalizeText(input?.weight_final),
        sust_status: normalizeText(input?.sust_status),
        sust_hierarchie: normalizeText(input?.sust_hierarchie),
        sust_new_part_number: normalizeText(input?.sust_new_part_number),
        sust_superseded_list: normalizeText(input?.sust_superseded_list)
    };
}

function applyPnPropagationFields(row, fields) {
    row.pn_final = fields.pn_final;
    row.designation_final = fields.designation_final;
    row.measure_final = fields.measure_final;
    row.weight_final = fields.weight_final;
    row.sust_status = fields.sust_status;
    row.sust_hierarchie = fields.sust_hierarchie;
    row.sust_new_part_number = fields.sust_new_part_number;
    row.sust_superseded_list = fields.sust_superseded_list;
}

function buildSustSummary(rows) {
    return {
        statuses: uniqueValues(rows, (row) => row?.sust_status),
        hierarchies: uniqueValues(rows, (row) => row?.sust_hierarchie),
        new_part_numbers: uniqueValues(rows, (row) => row?.sust_new_part_number),
        superseded_lists: uniqueValues(rows, (row) => row?.sust_superseded_list)
    };
}

function buildConflictSummary(rows, validation) {
    return {
        has_conflicts: Boolean(validation?.has_conflicts),
        conflict_codes: Array.isArray(validation?.conflict_codes) ? validation.conflict_codes : [],
        distinct_values: {
            designation_final: uniqueValues(rows, getRowDesignation),
            measure_final: uniqueValues(rows, getRowMeasure),
            weight_final: uniqueValues(rows, getRowWeight),
            sust_new_part_number: uniqueValues(rows, (row) => row?.sust_new_part_number)
        }
    };
}

function getEngineFingerprints() {
    const fingerprints = {};
    for (const file of ENGINE_JSON_FILES) {
        fingerprints[file] = getFileFingerprint(path.join(__dirname, file));
    }
    return fingerprints;
}

function fingerprintsByFileEqual(a, b) {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (const key of keys) {
        if (!fingerprintsEqual(a?.[key], b?.[key])) return false;
    }
    return true;
}

function ensurePnReviewQaDataLoaded() {
    const fingerprints = getEngineFingerprints();
    const upToDate = pnReviewQaCache.payload && fingerprintsByFileEqual(pnReviewQaCache.engineFingerprints, fingerprints);

    if (upToDate) {
        return pnReviewQaCache.payload;
    }

    const index = new Map();
    const list = [];

    for (const file of ENGINE_JSON_FILES) {
        const filePath = path.join(__dirname, file);
        const rows = readJsonFileSafe(filePath, []);
        if (!Array.isArray(rows)) continue;

        const engineModel = String(file).replace(/^engine_/, '').replace(/\.json$/i, '');
        for (const row of rows) {
            const sku = getRowPn(row);
            if (!sku) continue;
            const key = pnKey(sku);
            if (!index.has(key)) {
                index.set(key, { sku, rows: [] });
            }
            index.get(key).rows.push({ ...row, __engine_file: file, __engine_model: engineModel });
        }
    }

    for (const group of index.values()) {
        const rows = group.rows;
        const qaSummaryRaw = buildQaSummaryFromExport(rows);
        const qaSummary = normalizeQaSummary(qaSummaryRaw);
        const decisionMeta = decideByQa(rows, qaSummaryRaw);
        const mergedFields = buildMergedFields(rows);
        const validation = buildPnValidation(group.sku, rows, mergedFields);
        const engineModels = uniq(rows.map((row) => normalizeText(row?.__engine_model || row?.engine_model || row?.model || row?.engine)).filter(Boolean));
        const sourcePages = uniq(rows.map((row) => normalizeText(row?.['Source Page'])).filter(Boolean));
        const sourceRows = rows.map((row) => buildMappedSourceRow(row));

        const detail = {
            sku: group.sku,
            decision: decisionMeta.decision,
            reason: decisionMeta.reason,
            export_row: {
                sku: group.sku,
                designation_final: mergedFields.designation_final,
                measure_final: mergedFields.measure_final,
                weight_final: mergedFields.weight_final,
                decision: decisionMeta.decision,
                reason: decisionMeta.reason,
                occurrences: rows.length,
                engine_models: engineModels
            },
            qa_summary: qaSummary,
            validation,
            merged_fields: mergedFields,
            source_rows_preview: sourceRows.slice(0, 120),
            source_row_ids: uniq(sourceRows.map((row) => row.ID).filter(Boolean)),
            engine_models_all: engineModels,
            source_pages_all: sourcePages,
            images_all: mergedFields.images,
            sust_summary: buildSustSummary(rows),
            conflict_summary: buildConflictSummary(rows, validation),
            source_rows_all: sourceRows
        };

        list.push({
            sku: group.sku,
            decision: decisionMeta.decision,
            reason: decisionMeta.reason,
            designation_final: mergedFields.designation_final,
            measure_final: mergedFields.measure_final,
            weight_final: mergedFields.weight_final,
            occurrences: rows.length,
            engine_models: engineModels,
            source_pages_count: sourcePages.length,
            images_count: mergedFields.images.length,
            qa_summary: qaSummary,
            validation
        });

        index.set(pnKey(group.sku), detail);
    }

    list.sort((a, b) => String(a.sku).localeCompare(String(b.sku), 'es', { numeric: true, sensitivity: 'base' }));

    pnReviewQaCache.engineFingerprints = fingerprints;
    pnReviewQaCache.loadedAt = new Date().toISOString();
    pnReviewQaCache.payload = { list, index };
    return pnReviewQaCache.payload;
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

// Fase G — Capa analítica SQLite espejo (read-only). Se monta ANTES de /db
// para que /db/analytics/* no caiga en el catch-all 405 del router de Fase F.
try {
    const dbAnalyticsRouter = require('./server/routers/db-analytics-router');
    app.use('/db/analytics', dbAnalyticsRouter);
} catch (err) {
    console.warn('[db-analytics] router no montado:', err && err.message);
}

// Fase F — Capa de lectura SQLite espejo (read-only). No interfiere con endpoints existentes.
try {
    const dbReadRouter = require('./server/routers/db-read-router');
    app.use('/db', dbReadRouter);
} catch (err) {
    console.warn('[db-read] router no montado:', err && err.message);
}

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
        invalidatePnReviewQaCache();
        return res.json({ ok: true, result });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

function legacyExportEndpoint(res, endpointName) {
    return res.status(410).json({
        ok: false,
        legacy: true,
        endpoint: endpointName,
        error: 'Endpoint legacy desactivado en flujo oficial QA-only. Use /export/run-wordpress.'
    });
}

app.post('/export/run-synthetic', async (_req, res) => legacyExportEndpoint(res, 'run-synthetic'));

app.post('/export/run-wordpress', async (_req, res) => {
    try {
        const result = await withExportLock('run-wordpress', async () => {
            const wordpressRun = await runNodeScript(path.join('scripts', 'export_wordpress_milu.js'));
            const importRows = readJsonFileSafe(path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_import.json'), []);
            const pendingRows = readFirstJsonFileSafe(WORDPRESS_OUTPUT_DIR, ['milu_wp_pending.json', 'milu_wp_pending_review.json'], []);
            const discardedRows = readJsonFileSafe(path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_discarded.json'), []);
            const summary = {
                import: Array.isArray(importRows) ? importRows.length : 0,
                pending: Array.isArray(pendingRows) ? pendingRows.length : 0,
                discard: Array.isArray(discardedRows) ? discardedRows.length : 0
            };
            return { wordpress: wordpressRun, summary };
        });
        return res.json({ ok: true, result, run_state: exportRunState });
    } catch (error) {
        const status = error?.statusCode || 500;
        return res.status(status).json({ ok: false, error: String(error?.message || error), run_state: exportRunState });
    }
});

app.post('/export/run-ai-conflicts', async (_req, res) => legacyExportEndpoint(res, 'run-ai-conflicts'));

app.get('/export/preview', async (_req, res) => {
    try {
        const summaryPath = path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_export_summary.md');
        const importRows = readJsonFileSafe(path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_import.json'), []);
        const pendingRows = readFirstJsonFileSafe(WORDPRESS_OUTPUT_DIR, ['milu_wp_pending.json', 'milu_wp_pending_review.json'], []);
        const discardRows = readJsonFileSafe(path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_discarded.json'), []);
        const allRows = [
            ...(Array.isArray(importRows) ? importRows : []),
            ...(Array.isArray(pendingRows) ? pendingRows : []),
            ...(Array.isArray(discardRows) ? discardRows : [])
        ].map((row) => ({
            ...row,
            total_occurrences_global: toNumber(row?.total_occurrences_global, toNumber(row?.occurrences, 0))
        }));

        const markdownSummary = fs.existsSync(summaryPath)
            ? fs.readFileSync(summaryPath, 'utf8')
            : '';

        const parsedSummary = {
            generated_at: null,
            preview_total: allRows.length,
            preview_import: Array.isArray(importRows) ? importRows.length : 0,
            preview_pending: Array.isArray(pendingRows) ? pendingRows.length : 0,
            preview_discarded: Array.isArray(discardRows) ? discardRows.length : 0,
            conflict_rows: (Array.isArray(pendingRows) ? pendingRows.length : 0) + (Array.isArray(discardRows) ? discardRows.length : 0)
        };

        return res.json({
            ok: true,
            summary: parsedSummary,
            markdownSummary,
            rows: allRows
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.get('/export/wordpress-decisions', async (_req, res) => {
    try {
        const wpDir = path.join(__dirname, 'data', 'output', 'wordpress');
        const importRows = readJsonFileSafe(path.join(wpDir, 'milu_wp_import.json'), []);
        const pendingRows = readFirstJsonFileSafe(wpDir, ['milu_wp_pending.json', 'milu_wp_pending_review.json'], []);
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
                pending: Array.isArray(pendingRows) ? pendingRows.length : 0,
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
        const tracePath = path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_trace.json');
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

function invalidatePnReviewQaCache() {
    pnReviewQaCache.loadedAt = null;
    pnReviewQaCache.engineFingerprints = {};
    pnReviewQaCache.payload = null;
}

async function writeJsonAtomic(filePath, payload) {
    const tmpPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    await fs.promises.rename(tmpPath, filePath);
}

function normalizeEngineFileName(value) {
    const raw = normalizeText(value);
    if (!raw) return '';
    if (/^engine_.*\.json$/i.test(raw)) return raw;
    if (/^.*\.json$/i.test(raw)) return raw;
    return `engine_${raw}.json`;
}

function engineFileKey(value) {
    return lowerKey(String(value || '').replace(/^engine_/i, '').replace(/\.json$/i, ''));
}

function resolveEngineFileCandidates(engineModelOrFile) {
    const normalized = normalizeEngineFileName(engineModelOrFile);
    const candidates = [];

    if (normalized && ENGINE_JSON_FILES.includes(normalized)) {
        candidates.push(normalized);
    }

    const modelNormalized = lowerKey(String(engineModelOrFile || '').replace(/^engine_/i, '').replace(/\.json$/i, ''));
    if (modelNormalized) {
        for (const file of ENGINE_JSON_FILES) {
            const fileModel = lowerKey(String(file).replace(/^engine_/i, '').replace(/\.json$/i, ''));
            if (fileModel === modelNormalized && !candidates.includes(file)) {
                candidates.push(file);
            }
        }
    }

    for (const file of ENGINE_JSON_FILES) {
        if (!candidates.includes(file)) candidates.push(file);
    }

    return candidates;
}

function normalizeIdForCompare(value) {
    const text = normalizeText(value);
    if (!text) return '';

    const numeric = text.replace(/^0+/, '');
    if (/^\d+$/.test(text)) return numeric || '0';

    return lowerKey(text);
}

function idsEquivalent(a, b) {
    const aText = normalizeText(a);
    const bText = normalizeText(b);
    if (!aText || !bText) return false;
    if (aText === bText) return true;
    return normalizeIdForCompare(aText) === normalizeIdForCompare(bText);
}

app.get('/pn-review/list', async (req, res) => {
    try {
        const data = ensurePnReviewQaDataLoaded();
        const decision = lowerKey(req.query?.decision);
        const q = lowerKey(req.query?.q);
        const offsetRaw = Number(req.query?.offset);
        const limitRaw = Number(req.query?.limit);
        const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
        const limit = Number.isFinite(limitRaw) && limitRaw > 0
            ? Math.min(Math.floor(limitRaw), 20000)
            : data.list.length;

        let rows = data.list;
        if (decision) {
            rows = rows.filter((row) => lowerKey(row.decision) === decision);
        }
        if (q) {
            rows = rows.filter((row) => {
                return lowerKey(row.sku).includes(q) || lowerKey(row.designation_final).includes(q);
            });
        }

        const pagedRows = rows.slice(offset, offset + limit);
        return res.json({
            ok: true,
            rows: pagedRows,
            total: rows.length,
            loaded_at: pnReviewQaCache.loadedAt
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.get('/pn-review/:sku', async (req, res) => {
    const sku = normalizeText(req.params?.sku);
    if (!sku) {
        return res.status(400).json({ ok: false, error: 'SKU requerido.' });
    }

    try {
        const data = ensurePnReviewQaDataLoaded();
        const detail = data.index.get(pnKey(sku));
        if (!detail) {
            return res.status(404).json({ ok: false, error: `PN no encontrado: ${sku}` });
        }

        return res.json({
            ok: true,
            sku: detail.sku,
            export_row: detail.export_row,
            qa_summary: detail.qa_summary,
            validation: detail.validation,
            merged_fields: detail.merged_fields,
            source_rows_preview: detail.source_rows_preview,
            source_row_ids: detail.source_row_ids,
            engine_models_all: detail.engine_models_all,
            source_pages_all: detail.source_pages_all,
            images_all: detail.images_all,
            sust_summary: detail.sust_summary,
            conflict_summary: detail.conflict_summary,
            decision: detail.decision,
            reason: detail.reason
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.get('/pn-review/:sku/sources', async (req, res) => {
    const sku = normalizeText(req.params?.sku);
    if (!sku) {
        return res.status(400).json({ ok: false, error: 'SKU requerido.' });
    }

    try {
        const data = ensurePnReviewQaDataLoaded();
        const detail = data.index.get(pnKey(sku));
        if (!detail) {
            return res.status(404).json({ ok: false, error: `PN no encontrado: ${sku}` });
        }

        return res.json({
            ok: true,
            sku: detail.sku,
            count: detail.source_rows_all.length,
            rows: detail.source_rows_all
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.post('/pn-review/apply-siblings-bulk', async (req, res) => {
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!itemsRaw.length) {
        return res.status(400).json({ ok: false, error: 'items requerido (array no vacío).' });
    }

    try {
        const data = ensurePnReviewQaDataLoaded();
        const nowIso = new Date().toISOString();
        const updatesByFile = new Map();
        const itemResults = [];
        const errors = [];

        for (const item of itemsRaw) {
            const pn = normalizeText(item?.pn);
            const key = pnKey(pn);
            const currentId = normalizeText(item?.current_id);
            const currentEngineFile = normalizeEngineFileName(item?.current_engine_file || item?.current_engine || '');
            const currentEngineKey = engineFileKey(currentEngineFile);

            if (!pn || !key) {
                itemResults.push({
                    pn,
                    current_id: currentId,
                    found_sources: 0,
                    target_siblings: 0,
                    planned_updates: 0,
                    skipped: true,
                    reason: 'missing-pn'
                });
                continue;
            }

            const detail = data.index.get(key);
            if (!detail) {
                itemResults.push({
                    pn,
                    current_id: currentId,
                    found_sources: 0,
                    target_siblings: 0,
                    planned_updates: 0,
                    skipped: true,
                    reason: 'pn-not-found'
                });
                continue;
            }

            const allSources = Array.isArray(detail.source_rows_all) ? detail.source_rows_all : [];
            let targetSiblings = 0;
            let plannedUpdates = 0;

            for (const src of allSources) {
                const srcId = normalizeText(src?.ID);
                const srcFile = normalizeEngineFileName(src?.source_file || src?.engine_file || '');
                const srcFileKey = engineFileKey(srcFile);
                if (!srcId || !srcFile || !ENGINE_JSON_FILES.includes(srcFile)) continue;

                if (srcId === currentId && srcFileKey === currentEngineKey) {
                    continue;
                }

                const estado = lowerKey(src?.qa_revision_estado);
                const accion = lowerKey(src?.qa_revision_accion);
                if (estado === 'ok' && accion === 'copia') {
                    continue;
                }

                targetSiblings += 1;

                let ids = updatesByFile.get(srcFile);
                if (!ids) {
                    ids = new Set();
                    updatesByFile.set(srcFile, ids);
                }

                const beforeSize = ids.size;
                ids.add(String(srcId));
                if (ids.size > beforeSize) {
                    plannedUpdates += 1;
                }
            }

            itemResults.push({
                pn,
                current_id: currentId,
                found_sources: allSources.length,
                target_siblings: targetSiblings,
                planned_updates: plannedUpdates,
                skipped: false
            });
        }

        const filesTouched = [];
        let rowsUpdated = 0;

        for (const [file, idSet] of updatesByFile.entries()) {
            if (!ENGINE_JSON_FILES.includes(file)) {
                errors.push({ file, error: 'Archivo no permitido' });
                continue;
            }

            const filePath = path.join(__dirname, file);
            try {
                await withSaveJsonFileLock(file, async () => {
                    const raw = await fs.promises.readFile(filePath, 'utf8');
                    const json = JSON.parse(raw);
                    if (!Array.isArray(json)) {
                        throw new Error('Contenido JSON invalido: se esperaba array.');
                    }

                    let touched = false;
                    for (const row of json) {
                        const rowId = normalizeText(row?.ID);
                        if (!rowId || !idSet.has(String(rowId))) continue;
                        row.qa_revision_estado = 'ok';
                        row.qa_revision_accion = 'copia';
                        row.qa_revision_updated_at = nowIso;
                        rowsUpdated += 1;
                        touched = true;
                    }

                    if (touched) {
                        await writeJsonAtomic(filePath, json);
                        filesTouched.push(file);
                    }
                });
            } catch (error) {
                errors.push({ file, error: String(error?.message || error) });
            }
        }

        invalidatePnReviewQaCache();

        const plannedUpdates = itemResults.reduce((acc, item) => acc + Number(item?.planned_updates || 0), 0);
        const pnsWithChanges = itemResults.filter((item) => Number(item?.planned_updates || 0) > 0).length;

        return res.json({
            ok: errors.length === 0,
            result: {
                scanned_items: itemResults.length,
                pns_with_changes: pnsWithChanges,
                planned_updates: plannedUpdates,
                rows_updated: rowsUpdated,
                files_touched: filesTouched,
                item_results: itemResults,
                errors
            }
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.post('/pn-review/:sku/apply-decision', async (req, res) => {
    const sku = normalizeText(req.params?.sku);
    const skuNormalized = pnKey(sku);
    const action = lowerKey(req.body?.action);
    const estadoRaw = lowerKey(req.body?.estado);
    const accionRaw = lowerKey(req.body?.accion);

    const decisionMap = {
        validar: { estado: 'ok', accion: 'importar' },
        descartar: { estado: 'ok', accion: 'eliminar' },
        revisar: { estado: 'pendiente', accion: 'revisar' }
    };

    const explicitMap = {
        'ok|importar': 'validar',
        'ok|eliminar': 'descartar',
        'pendiente|revisar': 'revisar'
    };

    if (!sku || !skuNormalized) {
        return res.status(400).json({ ok: false, error: 'SKU requerido.' });
    }

    let decisionApplied = '';
    let targetEstado = '';
    let targetAccion = '';

    if (action) {
        if (!decisionMap[action]) {
            return res.status(400).json({ ok: false, error: 'action invalida. Permitidas: validar, revisar, descartar.' });
        }
        decisionApplied = action;
        targetEstado = decisionMap[action].estado;
        targetAccion = decisionMap[action].accion;
    } else {
        const explicitKey = `${estadoRaw}|${accionRaw}`;
        const mappedDecision = explicitMap[explicitKey];
        if (!mappedDecision) {
            return res.status(400).json({ ok: false, error: 'Payload invalido. Envia action=validar|revisar|descartar o una combinacion valida estado/accion.' });
        }
        decisionApplied = mappedDecision;
        targetEstado = decisionMap[mappedDecision].estado;
        targetAccion = decisionMap[mappedDecision].accion;
    }

    const nowIso = new Date().toISOString();
    const errors = [];
    const filesTouched = [];
    let rowsUpdated = 0;

    for (const file of ENGINE_JSON_FILES) {
        const filePath = path.join(__dirname, file);
        try {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const json = JSON.parse(raw);
            if (!Array.isArray(json)) {
                throw new Error('Contenido JSON invalido: se esperaba array.');
            }

            let touched = false;
            for (const row of json) {
                if (pnKey(getRowPn(row)) !== skuNormalized) continue;
                row.qa_revision_estado = targetEstado;
                row.qa_revision_accion = targetAccion;
                row.qa_revision_updated_at = nowIso;
                rowsUpdated += 1;
                touched = true;
            }

            if (touched) {
                await writeJsonAtomic(filePath, json);
                filesTouched.push(file);
            }
        } catch (error) {
            errors.push({ file, error: String(error?.message || error) });
        }
    }

    if (rowsUpdated === 0) {
        return res.status(404).json({
            ok: false,
            error: `No se encontraron apariciones para PN ${sku}`,
            rows_updated: 0,
            files_touched: [],
            errors
        });
    }

    invalidatePnReviewQaCache();

    console.info('[PN Review] decision applied by SKU', {
        sku,
        decision_applied: decisionApplied,
        rows_updated: rowsUpdated,
        files_touched: filesTouched
    });

    return res.json({
        ok: errors.length === 0,
        sku,
        target_estado: targetEstado,
        target_accion: targetAccion,
        decision_applied: decisionApplied,
        rows_updated: rowsUpdated,
        files_touched: filesTouched,
        errors
    });
});

app.post('/pn-review/:sku/apply-values', async (req, res) => {
    const sku = normalizeText(req.params?.sku);
    const skuNormalized = pnKey(sku);
    const fields = buildPnPropagationFields(req.body?.fields || req.body || {});

    if (!sku || !skuNormalized) {
        return res.status(400).json({ ok: false, error: 'SKU requerido.' });
    }

    const hasAnyField = Object.values(fields).some((value) => normalizeText(value));
    if (!hasAnyField) {
        return res.status(400).json({ ok: false, error: 'No hay campos para propagar.' });
    }

    const nowIso = new Date().toISOString();
    const errors = [];
    const filesTouched = [];
    let rowsUpdated = 0;

    for (const file of ENGINE_JSON_FILES) {
        const filePath = path.join(__dirname, file);
        try {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const json = JSON.parse(raw);
            if (!Array.isArray(json)) {
                throw new Error('Contenido JSON invalido: se esperaba array.');
            }

            let touched = false;
            for (const row of json) {
                if (pnKey(getRowPn(row)) !== skuNormalized) continue;
                applyPnPropagationFields(row, fields);
                row.qa_revision_updated_at = nowIso;
                rowsUpdated += 1;
                touched = true;
            }

            if (touched) {
                await writeJsonAtomic(filePath, json);
                filesTouched.push(file);
            }
        } catch (error) {
            errors.push({ file, error: String(error?.message || error) });
        }
    }

    if (rowsUpdated === 0) {
        return res.status(404).json({
            ok: false,
            error: `No se encontraron apariciones para PN ${sku}`,
            rows_updated: 0,
            files_touched: [],
            applied_fields: fields,
            errors
        });
    }

    invalidatePnReviewQaCache();

    console.info('[PN Review] values propagated by SKU', {
        sku,
        rows_updated: rowsUpdated,
        files_touched: filesTouched,
        applied_fields: fields
    });

    return res.json({
        ok: errors.length === 0,
        sku,
        applied_fields: fields,
        rows_updated: rowsUpdated,
        files_touched: filesTouched,
        errors
    });
});

app.post('/pn-review/by-id/:id/apply-decision', async (req, res) => {
    const rowId = normalizeText(req.params?.id);
    const action = lowerKey(req.body?.action);
    const engineModel = normalizeText(req.body?.engine_model);
    const sourceFile = normalizeText(req.body?.source_file);
    const sourcePage = normalizeText(req.body?.source_page);
    const sourcePos = normalizeText(req.body?.pos);
    const sourcePartNo = normalizeText(req.body?.part_no);
    const estadoRaw = lowerKey(req.body?.estado);
    const accionRaw = lowerKey(req.body?.accion);

    const decisionMap = {
        validar: { estado: 'ok', accion: 'importar' },
        descartar: { estado: 'ok', accion: 'eliminar' },
        revisar: { estado: 'pendiente', accion: 'revisar' }
    };

    const explicitMap = {
        'ok|importar': 'validar',
        'ok|eliminar': 'descartar',
        'pendiente|revisar': 'revisar'
    };

    if (!rowId) {
        return res.status(400).json({ ok: false, error: 'ID requerido.' });
    }

    let decisionApplied = '';
    let targetEstado = '';
    let targetAccion = '';

    if (action) {
        if (!decisionMap[action]) {
            return res.status(400).json({ ok: false, error: 'action invalida. Permitidas: validar, revisar, descartar.' });
        }
        decisionApplied = action;
        targetEstado = decisionMap[action].estado;
        targetAccion = decisionMap[action].accion;
    } else {
        const explicitKey = `${estadoRaw}|${accionRaw}`;
        const mappedDecision = explicitMap[explicitKey];
        if (!mappedDecision) {
            return res.status(400).json({ ok: false, error: 'Payload invalido. Envia action=validar|revisar|descartar o una combinacion valida estado/accion.' });
        }
        decisionApplied = mappedDecision;
        targetEstado = decisionMap[mappedDecision].estado;
        targetAccion = decisionMap[mappedDecision].accion;
    }

    const nowIso = new Date().toISOString();
    const candidateSeed = sourceFile || engineModel;
    const filesByPriority = resolveEngineFileCandidates(candidateSeed);
    const errors = [];
    const filesTouched = [];

    let found = false;
    let rowsUpdated = 0;
    let updatedTarget = null;

    for (const file of filesByPriority) {
        if (found) break;
        const filePath = path.join(__dirname, file);

        try {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const json = JSON.parse(raw);
            if (!Array.isArray(json)) {
                throw new Error('Contenido JSON invalido: se esperaba array.');
            }

            let idx = json.findIndex((row) => idsEquivalent(row?.ID, rowId));
            if (idx < 0) {
                idx = json.findIndex((row) => {
                    if (sourcePage && normalizeText(row?.['Source Page']) !== sourcePage) return false;
                    if (sourcePos && normalizeText(row?.POS) !== sourcePos) return false;
                    if (sourcePartNo && normalizeText(row?.['PART NO.']) !== sourcePartNo) return false;
                    return idsEquivalent(row?.ID, rowId);
                });
            }
            if (idx < 0) continue;

            json[idx].qa_revision_estado = targetEstado;
            json[idx].qa_revision_accion = targetAccion;
            json[idx].qa_revision_updated_at = nowIso;

            await writeJsonAtomic(filePath, json);

            found = true;
            rowsUpdated = 1;
            filesTouched.push(file);
            updatedTarget = {
                id: rowId,
                qa_revision_estado: targetEstado,
                qa_revision_accion: targetAccion,
                engine_file: file,
                engine_model: String(file).replace(/^engine_/i, '').replace(/\.json$/i, '')
            };
        } catch (error) {
            errors.push({ file, error: String(error?.message || error) });
        }
    }

    if (!found) {
        return res.status(404).json({
            ok: false,
            error: `No se encontro registro con ID ${rowId}`,
            id: rowId,
            rows_updated: 0,
            files_touched: [],
            errors
        });
    }

    invalidatePnReviewQaCache();

    console.info('[PN Review] decision applied by ID', {
        id: rowId,
        decision_applied: decisionApplied,
        rows_updated: rowsUpdated,
        files_touched: filesTouched
    });

    return res.json({
        ok: errors.length === 0,
        id: rowId,
        target: updatedTarget,
        target_estado: targetEstado,
        target_accion: targetAccion,
        decision_applied: decisionApplied,
        rows_updated: rowsUpdated,
        files_touched: filesTouched,
        errors
    });
});

app.get('/pn/list', async (_req, res) => legacyExportEndpoint(res, 'pn/list'));

app.get('/pn/:sku', async (_req, res) => legacyExportEndpoint(res, 'pn/:sku'));

app.get('/pn/:sku/sources', async (_req, res) => legacyExportEndpoint(res, 'pn/:sku/sources'));

// =============================================================================
// Export Manager — listado de archivos generados, preview y orquestador (lock).
// =============================================================================

const EXPORT_BASE_DIR = path.join(__dirname, 'data', 'output');
const EXPORT_FOLDER_WHITELIST = new Set(['wordpress']);
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

function parseCsvLine(line, separator) {
    const output = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const ch = line[index];
        if (inQuotes) {
            if (ch === '"' && line[index + 1] === '"') {
                current += '"';
                index += 1;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === separator) {
            output.push(current);
            current = '';
        } else {
            current += ch;
        }
    }

    output.push(current);
    return output;
}

function parseCsvText(content, maxRows = 500) {
    const text = String(content || '');
    const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const lines = normalized.split(/\r?\n/).filter((line) => line.length > 0);
    if (!lines.length) {
        return { headers: [], rows: [], total_rows: 0 };
    }

    const separator = lines[0].includes(';') ? ';' : ',';
    const headers = parseCsvLine(lines[0], separator);
    const dataLines = lines.slice(1);
    const rows = dataLines.slice(0, maxRows).map((line) => {
        const cols = parseCsvLine(line, separator);
        const record = {};
        headers.forEach((header, idx) => {
            record[header] = cols[idx] == null ? '' : cols[idx];
        });
        return record;
    });

    return {
        headers,
        rows,
        total_rows: dataLines.length,
        truncated: dataLines.length > rows.length
    };
}

function getWordpressStatusSnapshot() {
    const fileCandidates = {
        new: ['milu_wp_import.json', 'milu_wp_new_import.json'],
        superseded: ['milu_wp_superseded.json', 'milu_wp_superseded_import.json'],
        pending: ['milu_wp_pending.json', 'milu_wp_pending_review.json'],
        discarded: ['milu_wp_discarded.json']
    };

    const resolvedFiles = {
        new: null,
        superseded: null,
        pending: null,
        discarded: null
    };

    const counts = {
        new: 0,
        superseded: 0,
        pending: 0,
        discarded: 0
    };

    for (const [key, names] of Object.entries(fileCandidates)) {
        for (const name of names) {
            const fullPath = path.join(WORDPRESS_OUTPUT_DIR, name);
            if (!fs.existsSync(fullPath)) continue;
            const rows = readJsonFileSafe(fullPath, []);
            resolvedFiles[key] = name;
            counts[key] = Array.isArray(rows) ? rows.length : 0;
            break;
        }
    }

    const reportPath = path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_export_report.json');
    const report = readJsonFileSafe(reportPath, null);

    if (report?.totals && typeof report.totals === 'object') {
        counts.new = toNumber(report.totals.new, counts.new);
        counts.superseded = toNumber(report.totals.superseded, counts.superseded);
        counts.pending = toNumber(report.totals.pending, toNumber(report.totals.pending_review, counts.pending));
        counts.discarded = toNumber(report.totals.discard, counts.discarded);
    }

    let lastGeneratedAt = String(report?.generated_at || '').trim() || null;
    if (!lastGeneratedAt) {
        const files = listExportFolder('wordpress');
        for (const item of files) {
            if (!lastGeneratedAt || item.mtime > lastGeneratedAt) {
                lastGeneratedAt = item.mtime;
            }
        }
    }

    return {
        counts,
        files: resolvedFiles,
        last_generated_at: lastGeneratedAt,
        report: report || null
    };
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
    try {
        const snapshot = getWordpressStatusSnapshot();
        return res.json({
            ok: true,
            run_state: exportRunState,
            timestamp: snapshot.last_generated_at,
            counts: snapshot.counts,
            files: snapshot.files,
            report: snapshot.report
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.get('/export/file', (req, res) => {
    const folder = safeFolderName(req.query?.folder || 'wordpress');
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
                result.data = parsed;
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
        } else if (ext === '.csv') {
            result.text = content;
            result.csv = parseCsvText(content);
        } else {
            result.text = content;
        }
        return res.json(result);
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.get('/export/download', (req, res) => {
    const folder = safeFolderName(req.query?.folder || 'wordpress');
    let name = safeFileName(req.query?.name);

    if (folder && !name) {
        const csvFiles = listExportFolder(folder)
            .filter((file) => String(file.type || '').toLowerCase() === 'csv')
            .sort((a, b) => String(b.mtime || '').localeCompare(String(a.mtime || '')));
        if (csvFiles.length) {
            name = csvFiles[0].name;
        }
    }

    if (!folder || !name) {
        return res.status(400).json({ ok: false, error: 'Carpeta o archivo no permitidos.' });
    }
    const fullPath = path.join(EXPORT_BASE_DIR, folder, name);
    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ ok: false, error: 'Archivo no encontrado.' });
    }
    return res.download(fullPath, name);
});

app.post('/export/run-all', async (_req, res) => legacyExportEndpoint(res, 'run-all'));

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
    const phpPath = String(req.path || '').toLowerCase();
    const allowedPhpRoutes = new Set(['/qa_revision_sync.php', '/save-json.php']);
    if (/\.php$/i.test(req.path) && !allowedPhpRoutes.has(phpPath)) {
        return res.status(404).json({ ok: false, error: 'Ruta no disponible en backend local.' });
    }
    return next();
});

// Compatibilidad local: esta ruta debe resolverse por Express antes del static middleware.
app.get('/save-json.php', (_req, res) => {
    res.json({ ok: true, service: 'milu-save-backend', route: '/save-json.php' });
});

// Índice de archivos existentes en esquemas_pos_circulos/.
// Devuelve un array plano de basenames (sin ruta) para que el frontend pueda
// construir un Set y comprobar existencia sin hacer fetch por cada fila.
// Cacheado en memoria: se recalcula en cada arranque del servidor.
let _esquemasPosIndexCache = null;
app.get('/api/esquemas-pos-index', async (_req, res) => {
    try {
        if (!_esquemasPosIndexCache) {
            const baseDir = path.join(__dirname, 'esquemas_pos_circulos');
            const folders = await fs.promises.readdir(baseDir);
            const allFiles = [];
            for (const folder of folders) {
                const folderPath = path.join(baseDir, folder);
                let stat;
                try { stat = await fs.promises.stat(folderPath); } catch { continue; }
                if (!stat.isDirectory()) continue;
                const files = await fs.promises.readdir(folderPath);
                for (const file of files) {
                    allFiles.push(file.toLowerCase());
                }
            }
            _esquemasPosIndexCache = allFiles;
        }
        res.json({ ok: true, files: _esquemasPosIndexCache });
    } catch (err) {
        console.error('[esquemas-pos-index] Error:', err.message);
        res.json({ ok: false, files: [], error: String(err.message) });
    }
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
        res.json({ version: pkg.appVersion || pkg.version || '0.0.0' });
    } catch (_) {
        res.json({ version: '0.0.0' });
    }
});

const saveJsonFileLocks = new Map();

async function withSaveJsonFileLock(file, task) {
    const previous = saveJsonFileLocks.get(file) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
        release = resolve;
    });
    const queued = previous.then(() => current);
    saveJsonFileLocks.set(file, queued);

    await previous;
    try {
        return await task();
    } finally {
        release();
        if (saveJsonFileLocks.get(file) === queued) {
            saveJsonFileLocks.delete(file);
        }
    }
}

async function handleSaveJson(req, res) {
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
        await withSaveJsonFileLock(file, async () => {
            const data = await fs.promises.readFile(filePath, 'utf8');
            let json;
            try {
                json = JSON.parse(data);
            } catch (_parseError) {
                const parseError = new Error('JSON inválido');
                parseError.status = 500;
                throw parseError;
            }
            const row = json.find(r => String(r.ID) === String(id));
            if (!row) {
                const notFoundError = new Error('Registro no encontrado');
                notFoundError.status = 404;
                throw notFoundError;
            }
            row[col] = value;
            stripLegacyQaFields(json);
            await fs.promises.writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
            invalidatePnReviewQaCache();
        });
        return res.json({ ok: true });
    } catch (error) {
        console.error('[save-json] Error guardando', error);
        const status = Number(error?.status || 500);
        if (error?.message === 'JSON inválido' || error?.message === 'Registro no encontrado') {
            return res.status(status).json({ error: error.message });
        }
        return res.status(500).json({ error: 'No se pudo guardar el archivo' });
    }
}

// Ruta para guardar cambios en un archivo JSON.
app.post('/save-json', handleSaveJson);
app.post('/save-json.php', handleSaveJson);

app.post('/apply-qa-checks-filter', async (req, res) => {
    return legacyQaPipelineDisabled(res);
});

app.listen(PORT, () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
