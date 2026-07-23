// Simple Express backend para guardar cambios en archivos JSON
const express = require('express');
const fs = require('fs');
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const { spawn } = require('child_process');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ENGINE_JSON_FILES } = require('./milu-demo/config/engine_files');
const { recomputeEngineErrors, recomputeAllEngineErrors } = require('./milu-demo/scripts/recompute_engine_errors');
const { updateRevisionStates, normalizeEngineToken } = require('./milu-demo/scripts/update_revision_states');
const { runUpdateGesa } = require('./milu-demo/scripts/update_gesa_fields_from_excel');
const { runUpdateSust } = require('./milu-demo/scripts/update_sust_fields');
const { runUpdateFgFgs } = require('./milu-demo/scripts/update_fg_fgs_fields');
const { runRebuildFromPreview } = require('./milu-demo/scripts/rebuild_engine_from_book_preview');
const { runEnrichAssets } = require('./milu-demo/scripts/enrich_rebuild_with_assets');
const { runVisualCopyComparison, applyCanonicalPdfCopyToRow } = require('./milu-demo/scripts/qa_pdf_visual_copy');
const { runPdfVisualCopyBatch } = require('./milu-demo/services/pdf-copy-batch');
const { createRevisionSyncService } = require('./milu-demo/services/revision-sync');
const { createRevisionApplyService } = require('./milu-demo/services/revision-apply');
const { createPnReviewQaCacheService } = require('./milu-demo/services/pn-review-qa-cache');
const { buildQaSummary: buildQaSummaryFromExport, decideByQa } = require('./milu-demo/scripts/export_wordpress_milu');
const {
    sendValidationError,
    validationError,
    isValidationError
} = require('./milu-demo/validation/payload-errors');
const {
    assertNonEmptyObject,
    assertPayloadSize,
    assertPlainObject,
    assertString,
    assertBooleanLike
} = require('./milu-demo/validation/validators');
const {
    isAllowedSaveJsonField,
    canonicalFieldName,
    normalizeEditableFieldValue,
} = require('./milu-demo/validation/allowed-fields');
const { setField: setWriteField } = require('./milu-demo/lib/write-field-helper');
const {
    validateSaveJsonPayload,
    validateEngineFilePayload,
    validateRevisionApplyPayload,
    validateAuditLogPayload,
    validatePnReviewApplyDecisionPayload,
    validatePnReviewApplyValuesPayload,
    validateSiblingBulkPayload,
    validateWriteTargetInvariants,
    normalizeRevisionEstado,
    normalizeRevisionAccion,
} = require('./milu-demo/validation/qa-validation');
const { authRouter } = require('./auth/auth-router');
const { projectRouter } = require('./projects/project-router');

const app = express();
const PORT = 3000;
const SRC_ROOT = path.join(REPO_ROOT, 'src');
const DATA_ROOT = path.join(SRC_ROOT, 'data');
const DATA_JSON_DIR = path.join(DATA_ROOT, 'json');
const DATA_EXCEL_DIR = path.join(DATA_ROOT, 'excel');
const ASSETS_ROOT = path.join(SRC_ROOT, 'assets');
const TOOLS_ROOT = path.join(SRC_ROOT, 'tools');
const AUDIT_LOG_FILE = path.join(DATA_JSON_DIR, 'qa_audit_log.json');
const AUDIT_LOG_MAX_ENTRIES = 10000;
const WORDPRESS_OUTPUT_DIR = path.join(DATA_ROOT, 'legacy-data', '05-wordpress');

function getEngineJsonPath(fileName) {
    return path.join(DATA_JSON_DIR, String(fileName || ''));
}

function resolveRuntimePath(...segments) {
    const normalized = segments.map((segment) => String(segment || '')).filter(Boolean);
    if (normalized.length === 1) {
        const fileName = normalized[0];
        if (/^engine_[^/\\]+\.json(?:\.bak\.[^/\\]+)?$/i.test(fileName)) return path.join(DATA_JSON_DIR, fileName);
        if (/^(MILU_|product-export-|qa_synthetic_|qa_revision_|qa_audit_log|df_).*\.json$/i.test(fileName)) {
            return path.join(DATA_JSON_DIR, fileName);
        }
        if (fileName === 'version.json') return path.join(DATA_JSON_DIR, fileName);
    }
    if (normalized[0] === 'data') return path.join(DATA_ROOT, 'legacy-data', ...normalized.slice(1));
    if (normalized[0] === 'pdf') return path.join(ASSETS_ROOT, 'pdf', ...normalized.slice(1));
    if (['fotos_articulos', 'fotos_motores', 'esquemas', 'esquemas_pos_circulos'].includes(normalized[0])) {
        return path.join(ASSETS_ROOT, ...normalized);
    }
    if (normalized[0] === 'tools') return path.join(TOOLS_ROOT, ...normalized.slice(1));
    return path.join(REPO_ROOT, ...normalized);
}

const pnReviewQaCacheService = createPnReviewQaCacheService({
    repoRoot: DATA_JSON_DIR,
    buildQaSummaryFromExport,
    decideByQa,
    engineJsonFiles: ENGINE_JSON_FILES
});

const revisionSyncService = createRevisionSyncService(path.join(DATA_JSON_DIR, 'qa_revision_server_data.json'));
const revisionApplyService = createRevisionApplyService({
    repoRoot: DATA_JSON_DIR,
    onApplied: () => pnReviewQaCacheService.invalidate()
});
const {
    normalizeRevisionSyncPayload,
    readRevisionSyncPayload,
    writeRevisionSyncPayload,
} = revisionSyncService;

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

function isDangerousWriteEnabled() {
    const raw = String(process.env.SERVER_ENABLE_DANGEROUS_WRITE || '').trim().toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes';
}

function dangerousWriteForbidden(res, endpoint) {
    return res.status(403).json({
        ok: false,
        endpoint,
        error: 'Dangerous write disabled. Set SERVER_ENABLE_DANGEROUS_WRITE=true to enable.'
    });
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
        fingerprints[file] = getFileFingerprint(resolveRuntimePath(file));
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

function runNodeScript(scriptRelativePath, args = []) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(REPO_ROOT, scriptRelativePath);
        const child = spawn(process.execPath, [scriptPath, ...args], {
            cwd: REPO_ROOT,
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

app.use(cors());
app.use(bodyParser.json({ limit: '120mb' }));
app.use('/api/auth', authRouter);
app.use('/api/projects', projectRouter);

// Fase G ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Capa analÃƒÆ’Ã‚Â­tica SQLite espejo (read-only). Se monta ANTES de /db
// para que /db/analytics/* no caiga en el catch-all 405 del router de Fase F.
try {
    const dbAnalyticsRouter = require('./milu-demo/routers/db-analytics-router');
    app.use('/db/analytics', dbAnalyticsRouter);
} catch (err) {
    console.warn('[db-analytics] router no montado:', err && err.message);
}

// Fase F ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Capa de lectura SQLite espejo (read-only). No interfiere con endpoints existentes.
try {
    const dbReadRouter = require('./milu-demo/routers/db-read-router');
    app.use('/db', dbReadRouter);
} catch (err) {
    console.warn('[db-read] router no montado:', err && err.message);
}

app.post('/recompute-qa-errors', async (req, res) => {
    let scope;
    let file;
    let id;
    let dryRun;
    let updateRevision;
    let forceRevision;
    let backup;

    try {
        assertPayloadSize(req.body, { maxBytes: 12288 });
        scope = assertString(req.body?.scope ?? 'book', { field: 'scope', allowEmpty: false, maxLength: 32 }).toLowerCase();
        if (!['current', 'book', 'all'].includes(scope)) {
            throw validationError({ code: 'INVALID_SCOPE', field: 'scope', message: 'scope debe ser current, book o all' });
        }

        if (scope !== 'all') {
            const validated = validateEngineFilePayload(req.body, { maxBytes: 12288 });
            file = validated.file;
            if (!ENGINE_JSON_FILES.includes(file)) {
                throw validationError({ code: 'FILE_NOT_ALLOWED', field: 'file', message: 'Archivo no permitido' });
            }
        }
        id = assertString(req.body?.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });
        if (scope === 'book') id = '';
        if (scope === 'all' && id) {
            throw validationError({ code: 'ID_NOT_ALLOWED_FOR_ALL_SCOPE', field: 'id', message: 'scope=all no admite id puntual' });
        }
        dryRun = assertBooleanLike(req.body?.dryRun ?? false, 'dryRun');
        updateRevision = assertBooleanLike(req.body?.updateRevision ?? false, 'updateRevision');
        forceRevision = assertBooleanLike(req.body?.forceRevision ?? false, 'forceRevision');
        backup = req.body?.backup === false ? false : true;
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/recompute-qa-errors' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const result = scope === 'all'
            ? recomputeAllEngineErrors({
                dryRun,
                updateRevision,
                forceRevision,
                backup,
                rootDir: REPO_ROOT
            })
            : recomputeEngineErrors({
                file,
                id,
                dryRun,
                updateRevision,
                forceRevision,
                backup,
                rootDir: REPO_ROOT
            });
        return res.json({ ok: true, result });
    } catch (error) {
        const message = String(error?.message || error || 'Error desconocido');
        const isNotFound = /no se encontro ningun registro con id=/i.test(message);
        return res.status(isNotFound ? 404 : 500).json({ ok: false, error: message });
    }
});

app.post('/api/recompute-simple/update-states', async (req, res) => {
    let engine;
    let id;
    let backup;

    try {
        assertPayloadSize(req.body, { maxBytes: 12288 });
        engine = assertString(req.body?.engine ?? 'ALL', { field: 'engine', allowEmpty: false, maxLength: 64 });
        id = assertString(req.body?.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });
        backup = req.body?.backup === false ? false : true;

        const normalizedEngine = normalizeEngineToken(engine);
        if (!normalizedEngine) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine es obligatorio' });
        }

        if (normalizedEngine === 'ALL' && id) {
            throw validationError({ code: 'ID_NOT_ALLOWED_FOR_ALL_SCOPE', field: 'id', message: 'engine=ALL no admite id puntual' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/update-states' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const result = updateRevisionStates({
            engine,
            id,
            backup,
            rootDir: REPO_ROOT
        });

        const statusCode = result.ok ? 200 : 207;
        return res.status(statusCode).json(result);
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

app.post('/api/recompute-simple/update-sust', async (req, res) => {
    let engine;
    let id;
    let backup;
    let dryRun;

    try {
        assertPayloadSize(req.body, { maxBytes: 12288 });
        engine = assertString(req.body?.engine ?? 'ALL', { field: 'engine', allowEmpty: false, maxLength: 64 });
        id = assertString(req.body?.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });
        backup = req.body?.backup === false ? false : true;
        dryRun = assertBooleanLike(req.body?.dryRun ?? false, 'dryRun');

        const normalizedEngine = normalizeEngineToken(engine);
        if (!normalizedEngine) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine es obligatorio' });
        }

        if (normalizedEngine === 'ALL' && id) {
            throw validationError({ code: 'ID_NOT_ALLOWED_FOR_ALL_SCOPE', field: 'id', message: 'engine=ALL no admite id puntual' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/update-sust' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const normalizedEngine = normalizeEngineToken(engine);
        const result = runUpdateSust({
            engine: normalizedEngine,
            all: normalizedEngine === 'ALL',
            write: !dryRun,
            backup,
            rootDir: REPO_ROOT
        });

        return res.json({
            ok: true,
            result,
            ignoredId: Boolean(id)
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

app.post('/api/recompute-simple/enrich-assets', async (req, res) => {
    let engine;
    let id;
    let dryRun;
    let backup;

    try {
        assertPayloadSize(req.body, { maxBytes: 12288 });
        engine = assertString(req.body?.engine ?? 'ALL', { field: 'engine', allowEmpty: false, maxLength: 64 });
        id = assertString(req.body?.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });
        dryRun = assertBooleanLike(req.body?.dryRun ?? false, 'dryRun');
        backup = req.body?.backup === false ? false : true;

        const normalizedEngine = normalizeEngineToken(engine);
        if (!normalizedEngine) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine es obligatorio' });
        }

        if (normalizedEngine === 'ALL' && id) {
            throw validationError({ code: 'ID_NOT_ALLOWED_FOR_ALL_SCOPE', field: 'id', message: 'engine=ALL no admite id puntual' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/enrich-assets' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const os = require('os');
        const normalizedEngine = normalizeEngineToken(engine);

        if (!dryRun && !isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/api/recompute-simple/enrich-assets');
        }

        const reportPath = path.join(os.tmpdir(), `milu_recompute_assets_${Date.now()}_${process.pid}.json`);
        const args = ['src/server/milu-demo/python/rebuild_assets_for_record.py'];

        if (normalizedEngine === 'ALL') {
            args.push('--all');
        } else {
            args.push('--engine', normalizedEngine);
            if (id) {
                args.push('--id', id);
            } else {
                args.push('--all-book');
            }
        }

        if (!dryRun) {
            args.push('--write');
        }

        args.push('--report', reportPath);

        const execResult = await new Promise((resolve, reject) => {
            const pythonCmd = process.env.MILU_PYTHON && String(process.env.MILU_PYTHON).trim()
                ? String(process.env.MILU_PYTHON).trim()
                : 'python';

            const python = spawn(pythonCmd, args, {
                cwd: REPO_ROOT,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });

            python.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            python.on('error', reject);
            python.on('close', async (code) => {
                let report = null;
                try {
                    if (fs.existsSync(reportPath)) {
                        report = JSON.parse(await fs.promises.readFile(reportPath, 'utf8'));
                    }
                } catch (reportError) {
                    return reject(reportError);
                } finally {
                    try {
                        if (fs.existsSync(reportPath)) {
                            fs.unlinkSync(reportPath);
                        }
                    } catch (_cleanupError) {
                        // noop
                    }
                }

                resolve({
                    code: Number(code),
                    stdout,
                    stderr,
                    report
                });
            });
        });

        const report = execResult.report && typeof execResult.report === 'object'
            ? execResult.report
            : {};
        const engineReports = Array.isArray(report?.engine_reports) ? report.engine_reports : [];
        const recordsByEngine = engineReports.map((engineReport) => {
            const records = Array.isArray(engineReport?.records) ? engineReport.records : [];
            const missingAssets = records.reduce((acc, record) => {
                const logs = Array.isArray(record?.logs) ? record.logs : [];
                const hasMiss = logs.some((line) => String(line || '').startsWith('[MISS]'));
                return acc + (hasMiss ? 1 : 0);
            }, 0);

            return {
                model: String(engineReport?.engine || ''),
                rowsTotal: Number(engineReport?.records_processed || records.length || 0),
                photosLinked: 0,
                schemasLinked: records.reduce((acc, record) => acc + Number(record?.schemes_found || 0), 0),
                schemaPosLinked: records.reduce((acc, record) => acc + Number(record?.pos_found || 0), 0),
                updatedRows: records.reduce((acc, record) => acc + (record?.json_updated ? 1 : 0), 0),
                missingAssets,
                backupPath: '-'
            };
        });

        const errors = engineReports
            .filter((engineReport) => String(engineReport?.status || '').toLowerCase() !== 'ok')
            .map((engineReport) => ({
                model: String(engineReport?.engine || ''),
                error: String(engineReport?.reason || 'Error desconocido')
            }));

        const result = {
            enginesProcessed: Number(engineReports.length || 0),
            recordsProcessed: Number(report?.records_processed || 0),
            photosLinked: 0,
            schemasLinked: Number(report?.schemes_found || 0),
            schemaPosLinked: Number(report?.pos_found || 0),
            updatedRows: Number(report?.records_with_json_update || 0),
            missingAssets: recordsByEngine.reduce((acc, item) => acc + Number(item?.missingAssets || 0), 0),
            backupCreated: false,
            dryRun: !Boolean(report?.write),
            details: recordsByEngine,
            errors,
            rawReport: report
        };

        const hasErrors = errors.length > 0 || execResult.code !== 0;
        const statusCode = hasErrors ? 207 : 200;

        return res.status(statusCode).json({
            ok: !hasErrors,
            result,
            ignoredId: false,
            notes: {
                backupRequested: backup,
                backupApplied: false,
                endpointRunner: 'src/server/milu-demo/python/rebuild_assets_for_record.py',
                exitCode: execResult.code,
                stderr: execResult.stderr || ''
            }
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

const ENRICH_ASSETS_JOB_TTL_MS = 1000 * 60 * 30;
const ENRICH_ASSETS_LOG_LIMIT = 300;
const enrichAssetsJobs = new Map();

function cleanupFileIfExists(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (_error) {
        // noop
    }
}

function pruneEnrichAssetsJobs() {
    const now = Date.now();
    for (const [jobId, job] of enrichAssetsJobs.entries()) {
        if (!job || !job.finishedAt) continue;
        if (now - job.finishedAt > ENRICH_ASSETS_JOB_TTL_MS) {
            enrichAssetsJobs.delete(jobId);
        }
    }
}

function parseEnrichAssetsPayload(body) {
    assertPayloadSize(body, { maxBytes: 12288 });
    const engine = assertString(body?.engine ?? 'ALL', { field: 'engine', allowEmpty: false, maxLength: 64 });
    const id = assertString(body?.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });
    const dryRun = assertBooleanLike(body?.dryRun ?? false, 'dryRun');
    const backup = body?.backup === false ? false : true;

    const normalizedEngine = normalizeEngineToken(engine);
    if (!normalizedEngine) {
        throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine es obligatorio' });
    }

    if (normalizedEngine === 'ALL' && id) {
        throw validationError({ code: 'ID_NOT_ALLOWED_FOR_ALL_SCOPE', field: 'id', message: 'engine=ALL no admite id puntual' });
    }

    const ocr = assertBooleanLike(body?.ocr ?? true, 'ocr');
    const ocrSecondPass = assertBooleanLike(body?.ocrSecondPass ?? true, 'ocrSecondPass');

    return {
        engine,
        id,
        dryRun,
        backup,
        ocr,
        ocrSecondPass,
        normalizedEngine
    };
}

function buildEnrichAssetsCommand(payload) {
    const os = require('os');
    const reportPath = path.join(os.tmpdir(), `milu_recompute_assets_${Date.now()}_${process.pid}_${Math.floor(Math.random() * 100000)}.json`);
    const args = ['src/server/milu-demo/python/rebuild_assets_for_record.py'];

    if (payload.normalizedEngine === 'ALL') {
        args.push('--all');
    } else {
        args.push('--engine', payload.normalizedEngine);
        if (payload.id) {
            args.push('--id', payload.id);
        } else {
            args.push('--all-book');
        }
    }

    if (!payload.dryRun) {
        args.push('--write');
    }

    if (payload.ocr === false) {
        args.push('--no-ocr');
    }
    if (payload.ocrSecondPass === false) {
        args.push('--no-ocr-second-pass');
    }

    args.push('--report', reportPath);

    return { args, reportPath };
}

function buildEnrichAssetsResponse(execResult, backupRequested) {
    const report = execResult?.report && typeof execResult.report === 'object'
        ? execResult.report
        : {};
    const engineReports = Array.isArray(report?.engine_reports) ? report.engine_reports : [];
    const recordsByEngine = engineReports.map((engineReport) => {
        const records = Array.isArray(engineReport?.records) ? engineReport.records : [];
        const missingAssets = records.reduce((acc, record) => {
            const logs = Array.isArray(record?.logs) ? record.logs : [];
            const hasMiss = logs.some((line) => String(line || '').startsWith('[MISS]'));
            return acc + (hasMiss ? 1 : 0);
        }, 0);

        return {
            model: String(engineReport?.engine || ''),
            rowsTotal: Number(engineReport?.records_processed || records.length || 0),
            photosLinked: 0,
            schemasLinked: records.reduce((acc, record) => acc + Number(record?.schemes_found || 0), 0),
            schemaPosLinked: records.reduce((acc, record) => acc + Number(record?.pos_found || 0), 0),
            updatedRows: records.reduce((acc, record) => acc + (record?.json_updated ? 1 : 0), 0),
            missingAssets,
            backupPath: '-'
        };
    });

    const errors = engineReports
        .filter((engineReport) => String(engineReport?.status || '').toLowerCase() !== 'ok')
        .map((engineReport) => ({
            model: String(engineReport?.engine || ''),
            error: String(engineReport?.reason || 'Error desconocido')
        }));

    const result = {
        enginesProcessed: Number(engineReports.length || 0),
        recordsProcessed: Number(report?.records_processed || 0),
        photosLinked: 0,
        schemasLinked: Number(report?.schemes_found || 0),
        schemaPosLinked: Number(report?.pos_found || 0),
        updatedRows: Number(report?.records_with_json_update || 0),
        missingAssets: recordsByEngine.reduce((acc, item) => acc + Number(item?.missingAssets || 0), 0),
        backupCreated: false,
        dryRun: !Boolean(report?.write),
        details: recordsByEngine,
        errors,
        rawReport: report
    };

    const hasErrors = errors.length > 0 || Number(execResult?.code) !== 0;
    const statusCode = hasErrors ? 207 : 200;

    return {
        statusCode,
        payload: {
            ok: !hasErrors,
            result,
            ignoredId: false,
            notes: {
                backupRequested: backupRequested !== false,
                backupApplied: false,
                endpointRunner: 'src/server/milu-demo/python/rebuild_assets_for_record.py',
                exitCode: Number(execResult?.code) || 0,
                stderr: String(execResult?.stderr || '')
            }
        }
    };
}

async function tryCountRecordsForAssets(payload) {
    try {
        const targetFiles = resolveEngineFilesForRecompute(payload.normalizedEngine);
        let total = 0;

        for (const file of targetFiles) {
            const filePath = resolveRuntimePath(file);
            if (!fs.existsSync(filePath)) continue;
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const rows = JSON.parse(raw);
            if (!Array.isArray(rows)) continue;

            if (payload.id) {
                total += rows.some((row) => normalizeText(row?.ID) === payload.id) ? 1 : 0;
            } else {
                total += rows.length;
            }
        }

        return total > 0 ? total : null;
    } catch (_error) {
        return null;
    }
}

function pushJobLog(job, stream, line) {
    const text = String(line || '').replace(/\r/g, '').trim();
    if (!text) return;
    job.logSeq += 1;
    job.logs.push({
        seq: job.logSeq,
        at: new Date().toISOString(),
        stream,
        line: text
    });
    if (job.logs.length > ENRICH_ASSETS_LOG_LIMIT) {
        job.logs = job.logs.slice(job.logs.length - ENRICH_ASSETS_LOG_LIMIT);
    }

    if (text.startsWith('[RECORD]')) {
        job.processedRecords += 1;
        job.lastMessage = text;
    } else if (text.startsWith('[REPORT]')) {
        job.lastMessage = 'Reporte generado';
    }
}

function serializeEnrichAssetsJob(job) {
    const isDone = ['completed', 'failed', 'cancelled'].includes(String(job?.status || ''));
    const total = Number(job?.totalRecords || 0);
    const processed = Number(job?.processedRecords || 0);

    let percent = null;
    if (total > 0) {
        if (isDone) {
            percent = 100;
        } else {
            percent = Math.min(99, Math.floor((processed / total) * 100));
        }
    }

    return {
        ok: true,
        job: {
            id: job.id,
            status: job.status,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
            pid: job.pid || null,
            cancelRequested: Boolean(job.cancelRequested),
            cancellable: !isDone,
            progress: {
                totalRecords: total || null,
                processedRecords: processed,
                percent,
                lastMessage: job.lastMessage || ''
            },
            logs: job.logs.slice(-40),
            result: job.resultPayload || null,
            error: job.error || null,
            exitCode: Number.isFinite(job.exitCode) ? job.exitCode : null
        }
    };
}

async function runEnrichAssetsSync(payload) {
    const { args, reportPath } = buildEnrichAssetsCommand(payload);

    const execResult = await new Promise((resolve, reject) => {
        const pythonCmd = process.env.MILU_PYTHON && String(process.env.MILU_PYTHON).trim()
            ? String(process.env.MILU_PYTHON).trim()
            : 'python';

        const python = spawn(pythonCmd, args, {
            cwd: REPO_ROOT,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });

        python.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        python.on('error', reject);
        python.on('close', async (code) => {
            let report = null;
            try {
                if (fs.existsSync(reportPath)) {
                    report = JSON.parse(await fs.promises.readFile(reportPath, 'utf8'));
                }
            } catch (reportError) {
                return reject(reportError);
            } finally {
                cleanupFileIfExists(reportPath);
            }

            resolve({
                code: Number(code),
                stdout,
                stderr,
                report
            });
        });
    });

    return buildEnrichAssetsResponse(execResult, payload.backup);
}

async function createEnrichAssetsJob(payload) {
    pruneEnrichAssetsJobs();

    const { args, reportPath } = buildEnrichAssetsCommand(payload);
    const pythonCmd = process.env.MILU_PYTHON && String(process.env.MILU_PYTHON).trim()
        ? String(process.env.MILU_PYTHON).trim()
        : 'python';

    const jobId = crypto.randomUUID();
    const job = {
        id: jobId,
        status: 'starting',
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        pid: null,
        cancelRequested: false,
        totalRecords: await tryCountRecordsForAssets(payload),
        processedRecords: 0,
        lastMessage: 'Inicializando proceso ASSETS...',
        logs: [],
        logSeq: 0,
        error: null,
        exitCode: null,
        resultPayload: null,
        child: null
    };

    enrichAssetsJobs.set(jobId, job);

    try {
        const child = spawn(pythonCmd, args, {
            cwd: REPO_ROOT,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        job.child = child;
        job.pid = child.pid || null;
        job.startedAt = new Date().toISOString();
        job.status = 'running';

        let stdoutBuffer = '';
        let stderrBuffer = '';
        let stdoutRaw = '';
        let stderrRaw = '';

        child.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            stdoutRaw += text;
            stdoutBuffer += text;

            const lines = stdoutBuffer.split(/\r?\n/);
            stdoutBuffer = lines.pop() || '';
            lines.forEach((line) => pushJobLog(job, 'stdout', line));
        });

        child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderrRaw += text;
            stderrBuffer += text;

            const lines = stderrBuffer.split(/\r?\n/);
            stderrBuffer = lines.pop() || '';
            lines.forEach((line) => pushJobLog(job, 'stderr', line));
        });

        child.on('error', (error) => {
            job.status = 'failed';
            job.error = `No se pudo lanzar python: ${String(error?.message || error)}`;
            job.finishedAt = new Date().toISOString();
            job.exitCode = -1;
            cleanupFileIfExists(reportPath);
        });

        child.on('close', async (code) => {
            if (stdoutBuffer) pushJobLog(job, 'stdout', stdoutBuffer);
            if (stderrBuffer) pushJobLog(job, 'stderr', stderrBuffer);

            let report = null;
            try {
                if (fs.existsSync(reportPath)) {
                    report = JSON.parse(await fs.promises.readFile(reportPath, 'utf8'));
                }
            } catch (reportError) {
                job.status = 'failed';
                job.error = String(reportError?.message || reportError);
                job.finishedAt = new Date().toISOString();
                job.exitCode = Number(code);
                cleanupFileIfExists(reportPath);
                return;
            }

            cleanupFileIfExists(reportPath);

            job.exitCode = Number(code);
            job.finishedAt = new Date().toISOString();
            job.child = null;

            if (job.cancelRequested) {
                job.status = 'cancelled';
                job.error = 'Proceso cancelado por usuario';
                return;
            }

            const response = buildEnrichAssetsResponse({
                code: Number(code),
                stdout: stdoutRaw,
                stderr: stderrRaw,
                report
            }, payload.backup);

            job.resultPayload = response.payload;

            if (response.payload.ok === true) {
                job.status = 'completed';
                job.error = null;
            } else {
                job.status = 'failed';
                job.error = normalizeText(response?.payload?.notes?.stderr) || 'ASSETS finalizado con incidencias';
            }
        });
    } catch (error) {
        job.status = 'failed';
        job.error = String(error?.message || error || 'Error desconocido');
        job.finishedAt = new Date().toISOString();
        cleanupFileIfExists(reportPath);
    }

    return job;
}

app.post('/api/recompute-simple/enrich-assets/start', async (req, res) => {
    let payload;
    try {
        payload = parseEnrichAssetsPayload(req.body || {});
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/enrich-assets/start' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const job = await createEnrichAssetsJob(payload);
        return res.json({
            ok: true,
            jobId: job.id,
            status: job.status,
            progress: {
                totalRecords: job.totalRecords,
                processedRecords: job.processedRecords,
                percent: 0,
                lastMessage: job.lastMessage
            }
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

app.get('/api/recompute-simple/enrich-assets/jobs/:jobId', (req, res) => {
    pruneEnrichAssetsJobs();
    const jobId = normalizeText(req.params?.jobId);
    const job = enrichAssetsJobs.get(jobId);

    if (!job) {
        return res.status(404).json({ ok: false, error: 'Trabajo de ASSETS no encontrado' });
    }

    return res.json(serializeEnrichAssetsJob(job));
});

app.post('/api/recompute-simple/enrich-assets/jobs/:jobId/cancel', (req, res) => {
    pruneEnrichAssetsJobs();
    const jobId = normalizeText(req.params?.jobId);
    const job = enrichAssetsJobs.get(jobId);

    if (!job) {
        return res.status(404).json({ ok: false, error: 'Trabajo de ASSETS no encontrado' });
    }

    if (['completed', 'failed', 'cancelled'].includes(String(job.status))) {
        return res.json({ ok: true, alreadyFinished: true, status: job.status });
    }

    job.cancelRequested = true;
    job.lastMessage = 'CancelaciÃƒÆ’Ã‚Â³n solicitada por usuario...';

    try {
        if (job.child && typeof job.child.kill === 'function') {
            job.child.kill();
        }
    } catch (_error) {
        // noop
    }

    return res.json({ ok: true, status: 'cancelling' });
});

app.post('/api/recompute-simple/recompute-hermanos', async (req, res) => {
    let engine;
    let dryRun;
    let backup;

    try {
        assertPayloadSize(req.body, { maxBytes: 12288 });
        engine = assertString(req.body?.engine ?? 'ALL', { field: 'engine', allowEmpty: false, maxLength: 64 });
        dryRun = assertBooleanLike(req.body?.dryRun ?? false, 'dryRun');
        backup = assertBooleanLike(req.body?.backup ?? true, 'backup');
        resolveEngineFilesForRecompute(engine);
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/recompute-hermanos' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        if (!dryRun && !isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/api/recompute-simple/recompute-hermanos');
        }

        const targetFiles = resolveEngineFilesForRecompute(engine);
        const items = [];
        const perEngine = [];
        let recordsScanned = 0;

        for (const file of targetFiles) {
            const filePath = resolveRuntimePath(file);
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const json = JSON.parse(raw);
            if (!Array.isArray(json)) {
                throw new Error(`Contenido JSON invalido en ${file}: se esperaba array.`);
            }

            const uniquePnRows = new Map();
            let fileScannedRows = 0;

            for (const row of json) {
                fileScannedRows += 1;
                recordsScanned += 1;

                const pn = getRowPn(row);
                if (!pn) continue;

                const key = lowerKey(pn);
                if (!uniquePnRows.has(key)) {
                    uniquePnRows.set(key, {
                        pn,
                        current_id: normalizeText(row?.ID),
                        current_engine_file: file
                    });
                }
            }

            const fileItems = Array.from(uniquePnRows.values());
            items.push(...fileItems);
            perEngine.push({
                engine: file,
                records_scanned: fileScannedRows,
                pn_groups_detected: fileItems.length
            });
        }

        // Reutiliza la logica oficial de Analisis para hermanos/copias via el mismo motor backend.
        const siblingResult = await applySiblingBulkUpdates(items, { dryRun, backup });
        const itemResults = Array.isArray(siblingResult?.item_results) ? siblingResult.item_results : [];

        const result = {
            books_processed: targetFiles.length,
            records_scanned: recordsScanned,
            pn_groups_detected: items.length,
            pns_with_changes: Number(siblingResult?.pns_with_changes || 0),
            planned_updates: Number(siblingResult?.planned_updates || 0),
            rows_updated: Number(siblingResult?.rows_updated || 0),
            files_touched: siblingResult?.files_touched || [],
            errors: siblingResult?.errors || [],
            backup_paths: siblingResult?.backup_paths || [],
            dry_run: Boolean(siblingResult?.dry_run),
            item_results: itemResults,
            per_engine: perEngine.map((entry) => {
                const fileItemResults = itemResults.filter((item) => normalizeEngineFileName(item?.current_engine_file) === entry.engine);
                return {
                    engine: entry.engine,
                    records_scanned: entry.records_scanned,
                    pn_groups_detected: entry.pn_groups_detected,
                    pns_with_changes: fileItemResults.filter((item) => Number(item?.planned_updates || 0) > 0).length,
                    rows_updated: fileItemResults.reduce((acc, item) => acc + Number(item?.planned_updates || 0), 0)
                };
            })
        };

        const statusCode = result.errors.length > 0 ? 207 : 200;
        return res.status(statusCode).json({
            ok: result.errors.length === 0,
            result
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

app.post('/api/recompute-simple/generate-missing-esquema-pos', async (req, res) => {
    let engine;
    let id;
    let writeImages;
    let writeJson;
    let overwrite;
    let limit;

    try {
        assertPayloadSize(req.body, { maxBytes: 12288 });
        engine = assertString(req.body?.engine ?? 'ALL', { field: 'engine', allowEmpty: false, maxLength: 64 });
        id = assertString(req.body?.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });
        writeImages = assertBooleanLike(req.body?.writeImages ?? true, 'writeImages');
        writeJson = assertBooleanLike(req.body?.writeJson ?? true, 'writeJson');
        overwrite = assertBooleanLike(req.body?.overwrite ?? false, 'overwrite');

        const parsedLimit = Number(req.body?.limit ?? 0);
        if (!Number.isFinite(parsedLimit) || parsedLimit < 0 || parsedLimit > 100000) {
            throw validationError({ code: 'INVALID_LIMIT', field: 'limit', message: 'limit debe ser un numero entre 0 y 100000' });
        }
        limit = Math.floor(parsedLimit);

        const normalizedEngine = normalizeEngineToken(engine);
        if (!normalizedEngine) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine es obligatorio' });
        }

        if (normalizedEngine === 'ALL' && id) {
            throw validationError({ code: 'ID_NOT_ALLOWED_FOR_ALL_SCOPE', field: 'id', message: 'engine=ALL no admite id puntual' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/generate-missing-esquema-pos' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const os = require('os');
        const normalizedEngine = normalizeEngineToken(engine);
        const reportPath = path.join(os.tmpdir(), `milu_rebuild_schemes_circles_report_${Date.now()}_${process.pid}.json`);

        const args = ['src/server/milu-demo/python/rebuild_schemes_circles_from_esquemas.py'];
        if (normalizedEngine === 'ALL') {
            args.push('--all');
        } else if (id) {
            args.push('--engine', normalizedEngine, '--id', id);
        } else {
            args.push('--engine', normalizedEngine, '--all-book');
        }

        // En el script oficial, write/dry-run aplican conjuntamente a imagen + JSON.
        if (writeImages && writeJson) {
            args.push('--write');
        } else {
            args.push('--dry-run');
        }
        if (overwrite) {
            args.push('--force-regenerate');
        }
        if (limit > 0) {
            args.push('--limit', String(limit));
        }
        args.push('--report', reportPath);

        const execResult = await new Promise((resolve, reject) => {
            const python = spawn('python', args, {
                cwd: REPO_ROOT,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });

            python.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            python.on('error', reject);
            python.on('close', (code) => {
                let report = null;
                try {
                    if (fs.existsSync(reportPath)) {
                        report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                    }
                } catch (reportError) {
                    return reject(reportError);
                } finally {
                    try {
                        if (fs.existsSync(reportPath)) {
                            fs.unlinkSync(reportPath);
                        }
                    } catch (_cleanupError) {
                        // noop
                    }
                }

                resolve({
                    code: Number(code),
                    stdout,
                    stderr,
                    report
                });
            });
        });

        const report = execResult.report && typeof execResult.report === 'object'
            ? execResult.report
            : { engine_reports: [] };
        const hasErrors = execResult.code !== 0;

        if (execResult.code === 0) {
            return res.status(200).json({
                ok: true,
                result: {
                    ...report,
                    reportPath
                },
                ignoredId: false,
                notes: {
                    writeImages,
                    writeJson,
                    overwrite,
                    limit
                }
            });
        }

        if (hasErrors && report) {
            return res.status(207).json({
                ok: false,
                error: 'Proceso completado con incidencias parciales',
                result: {
                    ...report,
                    reportPath
                },
                ignoredId: false,
                notes: {
                    writeImages,
                    writeJson,
                    overwrite,
                    limit,
                    exitCode: execResult.code
                }
            });
        }

        return res.status(500).json({
            ok: false,
            error: String(execResult.stderr || execResult.stdout || `Error ejecutando batch de esquema POS (code=${execResult.code})`)
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

function getPythonCmd() {
    return process.env.MILU_PYTHON && String(process.env.MILU_PYTHON).trim()
        ? String(process.env.MILU_PYTHON).trim()
        : 'python';
}

function parseJsonObjectFromText(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return null;

    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch (_error) {
        // try extracting from mixed stdout
    }

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;

    try {
        const extracted = text.slice(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(extracted);
        if (parsed && typeof parsed === 'object') return parsed;
    } catch (_error) {
        return null;
    }

    return null;
}

async function runPythonScriptWithReport({ scriptName, scriptArgs = [], reportPrefix = 'milu_report' }) {
    const os = require('os');
    const reportPath = path.join(os.tmpdir(), `${reportPrefix}_${Date.now()}_${process.pid}.json`);
    const args = [scriptName, ...scriptArgs, '--report', reportPath];

    const execResult = await new Promise((resolve, reject) => {
        const python = spawn(getPythonCmd(), args, {
            cwd: REPO_ROOT,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (chunk) => {
            stdout += String(chunk || '');
        });

        python.stderr.on('data', (chunk) => {
            stderr += String(chunk || '');
        });

        python.on('error', reject);
        python.on('close', async (code) => {
            let report = null;
            try {
                if (fs.existsSync(reportPath)) {
                    report = JSON.parse(await fs.promises.readFile(reportPath, 'utf8'));
                }
            } catch (reportError) {
                return reject(reportError);
            } finally {
                cleanupFileIfExists(reportPath);
            }

            resolve({
                code: Number(code),
                stdout,
                stderr,
                report,
                reportPath
            });
        });
    });

    return execResult;
}

function tryResolveManualPickerRecord(engineFile, recordId) {
    const idNeedle = normalizeText(recordId);
    if (!engineFile || !idNeedle) return null;

    try {
        const filePath = resolveRuntimePath(engineFile);
        if (!fs.existsSync(filePath)) return null;
        const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(rows)) return null;
        return rows.find((row) => normalizeText(row?.ID) === idNeedle) || null;
    } catch (_error) {
        return null;
    }
}

function pickFirstCsvToken(value) {
    const raw = normalizeText(value);
    if (!raw) return '';
    const tokens = raw
        .split(/[,;\n]/)
        .map((item) => normalizeText(item))
        .filter(Boolean);
    return tokens[0] || '';
}

function pickRecordPageForManualPicker(row) {
    if (!row || typeof row !== 'object') return '';
    const candidates = ['Source Page', 'source_page', 'PAG', 'page', 'source_page_num'];
    for (const key of candidates) {
        const value = normalizeText(row?.[key]);
        if (value) return value;
    }
    return '';
}

app.post('/api/recompute-simple/rebuild-schemes-by-bom', async (req, res) => {
    let engine;
    let id;
    let dryRun;
    let forceRegenerate;

    try {
        assertPayloadSize(req.body, { maxBytes: 12288 });
        engine = assertString(req.body?.engine ?? 'ALL', { field: 'engine', allowEmpty: false, maxLength: 64 });
        id = assertString(req.body?.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });
        dryRun = assertBooleanLike(req.body?.dryRun ?? true, 'dryRun');
        forceRegenerate = assertBooleanLike(req.body?.forceRegenerate ?? false, 'forceRegenerate');

        const normalizedEngine = normalizeEngineToken(engine);
        if (!normalizedEngine) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine es obligatorio' });
        }
        if (normalizedEngine === 'ALL' && id) {
            throw validationError({ code: 'ID_NOT_ALLOWED_FOR_ALL_SCOPE', field: 'id', message: 'engine=ALL no admite id puntual' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/rebuild-schemes-by-bom' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const normalizedEngine = normalizeEngineToken(engine);
        if (!dryRun && !isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/api/recompute-simple/rebuild-schemes-by-bom');
        }

        const scriptArgs = [];

        if (normalizedEngine === 'ALL') {
            scriptArgs.push('--all');
        } else {
            scriptArgs.push('--engine', normalizedEngine);
            if (id) scriptArgs.push('--id', id);
            else scriptArgs.push('--all-book');
        }

        if (dryRun) scriptArgs.push('--dry-run');
        else scriptArgs.push('--write');

        if (forceRegenerate) {
            scriptArgs.push('--force-regenerate');
        }

        const execResult = await runPythonScriptWithReport({
            scriptName: 'src/server/milu-demo/python/rebuild_schemes_by_bom.py',
            scriptArgs,
            reportPrefix: 'milu_rebuild_schemes_by_bom'
        });

        const report = execResult.report && typeof execResult.report === 'object'
            ? execResult.report
            : { engine_reports: [], totals: {} };

        const payload = {
            result: {
                ...report,
                report_path: execResult.reportPath
            },
            notes: {
                exitCode: execResult.code,
                stderr: String(execResult.stderr || ''),
                dryRun: Boolean(dryRun)
            },
            ignoredId: false
        };

        if (execResult.code === 0) {
            return res.status(200).json({ ok: true, ...payload });
        }

        if (execResult.report) {
            return res.status(207).json({
                ok: false,
                error: 'Proceso completado con incidencias parciales',
                ...payload
            });
        }

        return res.status(500).json({
            ok: false,
            error: String(execResult.stderr || execResult.stdout || `Error ejecutando rebuild_schemes_by_bom.py (code=${execResult.code})`)
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

app.post('/api/recompute-simple/rebuild-schemes-circles-from-esquemas', async (req, res) => {
    let engine;
    let id;
    let dryRun;
    let forceRegenerate;
    let useManualOverrides;
    let overridesJson;

    try {
        assertPayloadSize(req.body, { maxBytes: 12288 });
        engine = assertString(req.body?.engine ?? 'ALL', { field: 'engine', allowEmpty: false, maxLength: 64 });
        id = assertString(req.body?.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });
        dryRun = assertBooleanLike(req.body?.dryRun ?? true, 'dryRun');
        forceRegenerate = assertBooleanLike(req.body?.forceRegenerate ?? false, 'forceRegenerate');
        useManualOverrides = assertBooleanLike(req.body?.useManualOverrides ?? true, 'useManualOverrides');
        overridesJson = assertString(
            req.body?.overridesJson ?? 'rebuild_schemes_circles_manual_overrides.json',
            { field: 'overridesJson', allowEmpty: true, maxLength: 260 }
        );

        const normalizedEngine = normalizeEngineToken(engine);
        if (!normalizedEngine) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine es obligatorio' });
        }
        if (normalizedEngine === 'ALL' && id) {
            throw validationError({ code: 'ID_NOT_ALLOWED_FOR_ALL_SCOPE', field: 'id', message: 'engine=ALL no admite id puntual' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/rebuild-schemes-circles-from-esquemas' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const normalizedEngine = normalizeEngineToken(engine);
        if (!dryRun && !isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/api/recompute-simple/rebuild-schemes-circles-from-esquemas');
        }

        const scriptArgs = [];

        if (normalizedEngine === 'ALL') {
            scriptArgs.push('--all');
        } else {
            scriptArgs.push('--engine', normalizedEngine);
            if (id) scriptArgs.push('--id', id);
            else scriptArgs.push('--all-book');
        }

        if (dryRun) scriptArgs.push('--dry-run');
        else scriptArgs.push('--write');

        if (forceRegenerate) {
            scriptArgs.push('--force-regenerate');
        }

        if (useManualOverrides && overridesJson) {
            scriptArgs.push('--overrides-json', overridesJson);
        }

        const execResult = await runPythonScriptWithReport({
            scriptName: 'src/server/milu-demo/python/rebuild_schemes_circles_from_esquemas.py',
            scriptArgs,
            reportPrefix: 'milu_rebuild_schemes_circles_from_esquemas'
        });

        const report = execResult.report && typeof execResult.report === 'object'
            ? execResult.report
            : { engine_reports: [], totals_by_status: {} };

        const payload = {
            result: {
                ...report,
                report_path: execResult.reportPath
            },
            notes: {
                exitCode: execResult.code,
                stderr: String(execResult.stderr || ''),
                dryRun: Boolean(dryRun),
                useManualOverrides: Boolean(useManualOverrides),
                overridesJson: overridesJson || ''
            },
            ignoredId: false
        };

        if (execResult.code === 0) {
            return res.status(200).json({ ok: true, ...payload });
        }

        if (execResult.report) {
            return res.status(207).json({
                ok: false,
                error: 'Proceso completado con incidencias parciales',
                ...payload
            });
        }

        return res.status(500).json({
            ok: false,
            error: String(execResult.stderr || execResult.stdout || `Error ejecutando rebuild_schemes_circles_from_esquemas.py (code=${execResult.code})`)
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

app.post('/api/recompute-simple/manual-override-picker', async (req, res) => {
    let engine;
    let id;
    let page;
    let baseScheme;
    let pos;

    try {
        assertPayloadSize(req.body, { maxBytes: 16384 });
        engine = assertString(req.body?.engine ?? '', { field: 'engine', allowEmpty: false, maxLength: 64 });
        id = assertString(req.body?.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });
        page = assertString(req.body?.page ?? '', { field: 'page', allowEmpty: true, maxLength: 32 });
        baseScheme = assertString(req.body?.baseScheme ?? '', { field: 'baseScheme', allowEmpty: true, maxLength: 260 });
        pos = assertString(req.body?.pos ?? '', { field: 'pos', allowEmpty: true, maxLength: 64 });

        const normalizedEngine = normalizeEngineToken(engine);
        if (!normalizedEngine || normalizedEngine === 'ALL') {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'Selecciona un engine concreto para abrir el picker manual' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/manual-override-picker' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const normalizedEngine = normalizeEngineToken(engine);
        const [engineFile] = resolveEngineFilesForRecompute(normalizedEngine);
        const record = tryResolveManualPickerRecord(engineFile, id);

        const resolvedBase = baseScheme || pickFirstCsvToken(record?.esquemas);
        const resolvedPos = pos || normalizeText(record?.pos_final || record?.POS || '');
        const resolvedPage = page || pickRecordPageForManualPicker(record);

        const pickerParams = new URLSearchParams();
        pickerParams.set('engine', normalizedEngine);
        if (id) pickerParams.set('id', id);
        if (resolvedPos) pickerParams.set('pos', resolvedPos);
        if (resolvedBase) pickerParams.set('base', path.basename(resolvedBase));
        if (resolvedPage) pickerParams.set('page', resolvedPage);

        if (record) {
            const schemasValue = normalizeText(record?.esquemas);
            if (schemasValue) pickerParams.set('schemas', schemasValue);
        }

        const pickerUrl = `/tools/manual_override_picker.html?${pickerParams.toString()}`;
        return res.json({
            ok: true,
            mode: 'embedded-express',
            pickerUrl,
            rebuildEndpoint: '/api/recompute-simple/rebuild-schemes-circles-from-esquemas',
            overridesJson: 'rebuild_schemes_circles_manual_overrides.json',
            context: {
                engine: normalizedEngine,
                id: id || '',
                page: resolvedPage || '',
                baseScheme: resolvedBase || '',
                pos: resolvedPos || ''
            },
            notes: {
                pickerHtml: '/tools/manual_override_picker.html',
                localManualServerCommand: 'python src/tools/manual_override_picker_server.py --overrides-json rebuild_schemes_circles_manual_overrides.json'
            }
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

app.post('/api/recompute-simple/update-gesa', async (req, res) => {
    let engine;
    let id;
    let backup;
    let dryRun;

    try {
        assertPayloadSize(req.body, { maxBytes: 12288 });
        engine = assertString(req.body?.engine ?? 'ALL', { field: 'engine', allowEmpty: false, maxLength: 64 });
        id = assertString(req.body?.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });
        backup = req.body?.backup === false ? false : true;
        dryRun = assertBooleanLike(req.body?.dryRun ?? false, 'dryRun');

        const normalizedEngine = normalizeEngineToken(engine);
        if (!normalizedEngine) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine es obligatorio' });
        }

        if (normalizedEngine === 'ALL' && id) {
            throw validationError({ code: 'ID_NOT_ALLOWED_FOR_ALL_SCOPE', field: 'id', message: 'engine=ALL no admite id puntual' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/update-gesa' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const normalizedEngine = normalizeEngineToken(engine);
        const result = runUpdateGesa({
            engine: normalizedEngine,
            all: normalizedEngine === 'ALL',
            write: !dryRun,
            backup,
            rootDir: REPO_ROOT
        });

        return res.json({
            ok: true,
            result,
            ignoredId: Boolean(id)
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

app.post('/api/recompute-simple/update-fg-fgs', async (req, res) => {
    let engine;
    let backup;
    let dryRun;

    try {
        assertPayloadSize(req.body, { maxBytes: 12288 });
        engine = assertString(req.body?.engine ?? 'ALL', { field: 'engine', allowEmpty: false, maxLength: 64 });
        backup = req.body?.backup === false ? false : true;
        dryRun = assertBooleanLike(req.body?.dryRun ?? false, 'dryRun');

        const normalizedEngine = normalizeEngineToken(engine);
        if (!normalizedEngine) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine es obligatorio' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/update-fg-fgs' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const normalizedEngine = normalizeEngineToken(engine);
        const result = runUpdateFgFgs({
            engine: normalizedEngine,
            all: normalizedEngine === 'ALL',
            write: !dryRun,
            backup,
            rootDir: REPO_ROOT
        });

        return res.json({
            ok: true,
            result
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

app.post('/api/recompute-simple/fill-missing-fg-fgs', async (req, res) => {
    let engine;
    let dryRun;
    let backup;

    try {
        assertPayloadSize(req.body, { maxBytes: 12288 });
        engine = assertString(req.body?.engine ?? 'ALL', { field: 'engine', allowEmpty: false, maxLength: 64 });
        dryRun = assertBooleanLike(req.body?.dryRun ?? true, 'dryRun');
        backup = req.body?.backup === false ? false : true;

        const normalizedEngine = normalizeEngineToken(engine);
        if (!normalizedEngine) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine es obligatorio' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/fill-missing-fg-fgs' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const normalizedEngine = normalizeEngineToken(engine);
        if (!dryRun && !isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/api/recompute-simple/fill-missing-fg-fgs');
        }

        const args = ['src/server/milu-demo/scripts/fill_missing_fg_fgs_by_bom.py', '--engine', normalizedEngine];
        if (dryRun) args.push('--dry-run');
        else args.push('--write');
        if (backup) args.push('--backup');

        const execResult = await new Promise((resolve, reject) => {
            const python = spawn(getPythonCmd(), args, {
                cwd: REPO_ROOT,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (chunk) => {
                stdout += String(chunk || '');
            });

            python.stderr.on('data', (chunk) => {
                stderr += String(chunk || '');
            });

            python.on('error', reject);
            python.on('close', (code) => {
                resolve({
                    code: Number(code),
                    stdout,
                    stderr
                });
            });
        });

        const parsed = parseJsonObjectFromText(execResult.stdout);
        if (!parsed) {
            return res.status(500).json({
                ok: false,
                error: 'No se pudo parsear JSON del script fill_missing_fg_fgs_by_bom.py',
                notes: {
                    exitCode: execResult.code,
                    stderr: String(execResult.stderr || ''),
                    stdout: String(execResult.stdout || '')
                }
            });
        }

        const totals = parsed?.totals || {};
        const payload = {
            ok: execResult.code === 0,
            dryRun: Boolean(dryRun),
            engine: normalizedEngine,
            summary: {
                recordsProcessed: Number(totals.processed) || 0,
                alreadyHadFgFgs: Number(totals.untouched_existing) || 0,
                missingFgFgs: Number(totals.empty_fg_fgs_final) || 0,
                withBom: Number(totals.with_bom) || 0,
                withoutBom: Number(totals.without_bom) || 0,
                bomFound: Number(totals.bom_found) || 0,
                bomNotFound: Number(totals.bom_not_found) || 0,
                recordsFillable: Number(totals.fillable) || 0,
                recordsUpdated: Number(dryRun ? totals.fillable : (parsed?.engines || []).reduce((acc, item) => acc + (Number(item?.write_changes) || 0), 0)) || 0,
                conflicts: Number(parsed?.catalog_conflicts) || 0
            },
            reportPath: path.join('docs', 'v1.04', 'FG_FGS_FILL_MISSING_DRYRUN_REPORT.md'),
            notes: {
                mode: String(parsed?.mode || (dryRun ? 'DRY-RUN' : 'WRITE')),
                exitCode: execResult.code,
                stderr: String(execResult.stderr || ''),
                stdout: String(execResult.stdout || '')
            }
        };

        if (execResult.code === 0) {
            return res.status(200).json(payload);
        }

        return res.status(500).json({
            ok: false,
            error: String(execResult.stderr || execResult.stdout || 'Error ejecutando fill_missing_fg_fgs_by_bom.py'),
            ...payload
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

app.post('/api/recompute-simple/rebuild-json', async (req, res) => {
    let engine;
    let dryRun;
    let backup;

    try {
        assertPayloadSize(req.body, { maxBytes: 12288 });
        engine = assertString(req.body?.engine ?? 'ALL', { field: 'engine', allowEmpty: false, maxLength: 64 });
        dryRun = assertBooleanLike(req.body?.dryRun ?? false, 'dryRun');
        backup = assertBooleanLike(req.body?.backup ?? true, 'backup');

        const normalizedEngine = normalizeEngineToken(engine);
        if (!normalizedEngine) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine es obligatorio' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/recompute-simple/rebuild-json' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        const normalizedEngine = normalizeEngineToken(engine);
        const result = runRebuildFromPreview({
            engine: normalizedEngine,
            dryRun
        });

        const statusCode = result.ok ? 200 : 207;
        return res.status(statusCode).json({
            ok: result.ok,
            result,
            notes: {
                backupIgnored: true,
                backupRequested: backup,
                writesOnlyTo: 'data/02-engine_rebuild',
                engineFilesModified: false
            }
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Error desconocido')
        });
    }
});

// LEGACY: mantiene compatibilidad con el flujo historico basado en Python.
app.post('/calculate-final-fields', async (req, res) => {
    try {
        // Ejecutar el script Python copy_gesa_fields_to_final.py
        const python = spawn('python', ['src/server/milu-demo/python/copy_gesa_fields_to_final.py'], {
            cwd: REPO_ROOT,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        python.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        python.on('close', (code) => {
            if (code !== 0) {
                console.error('Script error:', stderr);
                return res.status(500).json({
                    ok: false,
                    error: `Script execution failed with code ${code}: ${stderr}`
                });
            }

            // Parsear la salida del script para extraer los totales
            let affectedRecords = 0;
            let updatedFields = 0;

            const resumenMatch = stdout.match(/Resumen:\s+(\d+)\s+registros\s+afectados,\s+(\d+)\s+campos\s+actualizados/i);
            if (resumenMatch) {
                affectedRecords = parseInt(resumenMatch[1], 10);
                updatedFields = parseInt(resumenMatch[2], 10);
            }

            res.json({
                ok: true,
                legacy: true,
                result: {
                    affectedRecords,
                    updatedFields,
                    message: `Successfully calculated FINAL fields: ${affectedRecords} records, ${updatedFields} fields updated`
                }
            });
        });

    } catch (error) {
        console.error('Backend error:', error);
        res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Unknown error')
        });
    }
});

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Aplica book_preview_*.json a engine_*.json mediante el script Python oficial ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
// Reemplaza el flujo del boton "1. Importar de PDF" del modal de recalculo.
// Ejecuta:
//   - apply_book_preview_to_engine.py --book-preview ... --engine ... --write --overwrite  (si engine)
//   - apply_all_book_previews.py --write --overwrite                                       (si todos)
app.post('/api/pdf-preview/apply-to-engine', async (req, res) => {
    const tag = '[apply_book_preview_to_engine]';
    try {
        if (!isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/api/pdf-preview/apply-to-engine');
        }

        const fs = require('fs');
        const os = require('os');
        const engineRaw = typeof req.body?.engine === 'string' ? req.body.engine.trim() : '';
        const conflictDecisions = (req.body && typeof req.body.conflictDecisions === 'object' && req.body.conflictDecisions !== null)
            ? req.body.conflictDecisions
            : null;
        const previewsDir = path.join('data', '01-engine_preview');

        // Validacion estricta para evitar inyeccion via argumentos (aunque no usemos shell).
        if (engineRaw && !/^[A-Za-z0-9._-]+$/.test(engineRaw)) {
            return res.status(400).json({ ok: false, error: `Engine no valido: ${engineRaw}` });
        }

        // Normaliza el nombre de engine: acepta "12V4000M40A" o "engine_12V4000M40A.json".
        let engineModel = '';
        let engineFile = '';
        let previewFile = '';
        if (engineRaw) {
            const m = engineRaw.match(/^(?:engine_)?(.+?)(?:\.json)?$/);
            engineModel = m ? m[1] : engineRaw;
            engineFile = `engine_${engineModel}.json`;
            previewFile = path.join(previewsDir, `book_preview_${engineModel}.json`);

            if (!ENGINE_JSON_FILES.includes(engineFile)) {
                return res.status(400).json({ ok: false, error: `Engine desconocido: ${engineFile}` });
            }
            if (!fs.existsSync(path.join(REPO_ROOT, previewFile))) {
                return res.status(404).json({ ok: false, error: `No existe book preview: ${previewFile}` });
            }
        }

        const script = engineRaw ? 'src/server/milu-demo/python/apply_book_preview_to_engine.py' : 'src/server/milu-demo/python/apply_all_book_previews.py';
        const reportPath = path.join(os.tmpdir(), `milu_apply_book_preview_report_${Date.now()}_${process.pid}.json`);
        let conflictDecisionsPath = '';
        if (engineRaw && conflictDecisions && Object.keys(conflictDecisions).length > 0) {
            conflictDecisionsPath = path.join(os.tmpdir(), `milu_apply_book_preview_conflicts_${Date.now()}_${process.pid}.json`);
            fs.writeFileSync(conflictDecisionsPath, JSON.stringify(conflictDecisions, null, 2), 'utf8');
        }

        const args = engineRaw
            ? [
                script,
                '--book-preview', previewFile,
                '--engine', engineFile,
                '--write',
                '--overwrite',
                '--report', reportPath,
                ...(conflictDecisionsPath ? ['--conflict-decisions', conflictDecisionsPath] : [])
            ]
            : [script, '--write', '--overwrite', '--report', reportPath];

        console.log(`${tag} script=${script} engine=${engineFile || '(all)'} preview=${previewFile || '(all)'}`);
        console.log(`${tag} spawn python ${args.join(' ')}`);

        const python = spawn('python', args, {
            cwd: REPO_ROOT,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        let stdout = '';
        let stderr = '';
        python.stdout.on('data', (d) => { stdout += d.toString(); });
        python.stderr.on('data', (d) => { stderr += d.toString(); });

        python.on('close', (code) => {
            const out = stdout;
            let reportData = null;
            try {
                if (fs.existsSync(reportPath)) {
                    reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                    fs.unlinkSync(reportPath);
                }
                if (conflictDecisionsPath && fs.existsSync(conflictDecisionsPath)) {
                    fs.unlinkSync(conflictDecisionsPath);
                }
            } catch (reportError) {
                console.warn(`${tag} report parse error:`, reportError);
            }
            // Parseo del informe del script unitario (apply_book_preview_to_engine.py).
            const num = (re) => {
                const m = out.match(re);
                return m ? Number(m[1]) : 0;
            };
            const parsedStats = {
                preview_pages: num(/P[ÃƒÆ’Ã‚Â¡a]ginas en preview\s*:\s*(\d+)/i),
                preview_rows: num(/Filas en preview\s*:\s*(\d+)/i),
                matched_unique: num(/Match [ÃƒÆ’Ã‚Âºu]nico\s*:\s*(\d+)/i),
                matched_tiebreak_pn: num(/Match desempate por PN\s*:\s*(\d+)/i),
                matched_page_pn_no_pos: num(/Match page\+PN sin POS\s*:\s*(\d+)/i),
                matched_page_pn_pos_mismatch: num(/Match page\+PN por mismatch POS\s*:\s*(\d+)/i),
                matched_ambiguous_all_equal: num(/Match ambiguo \(todos iguales\)\s*:\s*(\d+)/i),
                matched_ambiguous_manual: num(/Match ambiguo \(decision manual\)\s*:\s*(\d+)/i),
                ambiguous: num(/Ambiguos[^:]*:\s*(\d+)/i),
                not_found: num(/No encontrados\s*:\s*(\d+)/i),
                rows_changed: num(/Filas con cambios\s*:\s*(\d+)/i),
                fields_changed: num(/Campos modificados\s*:\s*(\d+)/i),
                fields_skipped_nonempty: num(/Campos no vac[ÃƒÆ’Ã‚Â­i]os saltados\s*:\s*(\d+)/i)
            };
            const stats = reportData?.stats && typeof reportData.stats === 'object'
                ? reportData.stats
                : parsedStats;
            // Warnings: lineas [WARN]/[SKIP] del barrido o stderr no vacio.
            const warnings = [];
            for (const line of out.split(/\r?\n/)) {
                if (/^\[(WARN|SKIP|INFO)\]/i.test(line)) warnings.push(line.trim());
            }
            if (stderr.trim()) warnings.push(`stderr: ${stderr.trim().slice(0, 500)}`);

            const ok = code === 0;
            console.log(`${tag} done code=${code} engine=${engineFile || '(all)'} rows_changed=${stats.rows_changed} fields_changed=${stats.fields_changed} ambiguous=${stats.ambiguous} not_found=${stats.not_found} warnings=${warnings.length}`);

            const status = ok ? 200 : 500;
            return res.status(status).json({
                ok,
                exitCode: code,
                script,
                engine: engineFile || null,
                preview: previewFile || null,
                stats,
                not_found_rows: Array.isArray(reportData?.not_found_rows) ? reportData.not_found_rows : [],
                action_required_conflicts: Array.isArray(reportData?.action_required_conflicts) ? reportData.action_required_conflicts : [],
                applied_manual_decisions: Array.isArray(reportData?.applied_manual_decisions) ? reportData.applied_manual_decisions : [],
                warnings,
                stdout: out,
                stderr,
                error: ok ? null : `python ${script} salio con code=${code}`
            });
        });

        python.on('error', (err) => {
            console.error(`${tag} spawn error:`, err);
            res.status(500).json({ ok: false, error: `No se pudo lanzar python: ${String(err?.message || err)}` });
        });
    } catch (error) {
        console.error(`${tag} backend error:`, error);
        res.status(500).json({ ok: false, error: String(error?.message || error || 'Unknown error') });
    }
});

// Endpoint del editor de registro (registrado aqui para asegurar disponibilidad).
app.post('/api/record-editor/update-record', handleRecordEditorUpdateRecord);

app.post('/recalculate-revision-status', async (req, res) => {
    try {
        let totalRecords = 0;
        let changedRecords = 0;

        // Recalcular estado/acciÃƒÆ’Ã‚Â³n para todos los libros
        for (const engineFile of ENGINE_JSON_FILES) {
            const filePath = resolveRuntimePath(engineFile);

            if (!fs.existsSync(filePath)) {
                console.warn(`Engine file not found: ${filePath}`);
                continue;
            }

            try {
                const result = recomputeEngineErrors({
                    file: engineFile,
                    dryRun: false,
                    updateRevision: true,
                    forceRevision: false,
                    backup: true,
                    rootDir: REPO_ROOT
                });

                totalRecords += Number(result?.scanned) || 0;
                changedRecords += Number(result?.changedRows) || 0;
            } catch (error) {
                console.error(`Error processing ${engineFile}:`, error?.message);
                // Continuar con el siguiente archivo
            }
        }

        res.json({
            ok: true,
            result: {
                totalRecords,
                changedRecords,
                message: `Revision status recalculated: ${totalRecords} records, ${changedRecords} updated`
            }
        });

    } catch (error) {
        console.error('Backend error:', error);
        res.status(500).json({
            ok: false,
            error: String(error?.message || error || 'Unknown error')
        });
    }
});

app.post('/recompute-pdf-auto-visual', async (req, res) => {
    let file;
    let id;
    let dryRun;
    let backup;

    try {
        const validated = validateEngineFilePayload(req.body, { maxBytes: 12288 });
        file = validated.file;
        if (!ENGINE_JSON_FILES.includes(file)) {
            throw validationError({ code: 'FILE_NOT_ALLOWED', field: 'file', message: 'Archivo no permitido' });
        }
        id = assertString(req.body?.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });
        dryRun = assertBooleanLike(req.body?.dryRun ?? false, 'dryRun');
        backup = req.body?.backup === false ? false : true;
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/recompute-pdf-auto-visual' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        if (!dryRun && !isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/recompute-pdf-auto-visual');
        }

        console.log(`[pdf-copy] fn=runVisualCopyComparison caller=endpoint endpoint=/recompute-pdf-auto-visual file=${file} id=${id || '-'} dryRun=${Boolean(dryRun)}`);
        const comparisonResult = await runVisualCopyComparison({
            file,
            id,
            writePdf: !dryRun,
            backup,
            endpointName: '/recompute-pdf-auto-visual'
        });

        const report = comparisonResult?.report || {};
        const result = {
            file,
            mode: id ? 'single-id' : 'full-book',
            id: id || null,
            algorithm: 'visual-compatible-backend',
            dryRun,
            scanned: Number(report.scanned_rows) || 0,
            changedRows: Number(report.changed_pdf_fields_rows) || 0,
            missingPages: Array.isArray(report.missing_pages) ? report.missing_pages.length : 0,
            wroteFile: Boolean(report.wrote_engine_file),
            fieldsWithDetectedValues: 0,
            totalComparedFields: 0,
            fieldSummary: []
        };

        return res.json({ ok: true, result });
    } catch (error) {
        const message = String(error?.message || error || 'Error desconocido');
        const isNotFound = /no se encontro ningun registro con id=/i.test(message);
        return res.status(isNotFound ? 404 : 500).json({ ok: false, error: message });
    }
});

app.post('/copy-pdf-to-pdf-all-books', async (req, res) => {
    const payload = req.body || {};

    try {
        assertPlainObject(payload, 'payload');
        assertPayloadSize(payload, 12288, 'payload');

        const file = String(payload.file || '').trim();
        const files = Array.isArray(payload.files)
            ? payload.files.map((value) => String(value || '').trim()).filter(Boolean)
            : [];
        const id = assertString(payload.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });

        const writePdf = assertBooleanLike(payload.writePdf ?? true, 'writePdf');
        const backup = assertBooleanLike(payload.backup ?? true, 'backup');
        const clearPdfBeforeCopy = assertBooleanLike(payload.clearPdfBeforeCopy ?? true, 'clearPdfBeforeCopy');

        if (writePdf && !isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/copy-pdf-to-pdf-all-books');
        }

        const result = await runPdfVisualCopyBatch({
            writePdf,
            backup,
            clearPdfBeforeCopy,
            id: id || undefined,
            files: files.length > 0 ? files : (file ? [file] : undefined)
        });

        console.log(
            `[pdf-copy] fn=runPdfVisualCopyBatch caller=endpoint endpoint=/copy-pdf-to-pdf-all-books files=${(result?.options?.files || []).length} id=${id || '-'} scanned=${Number(result?.scanned || 0)} changedRows=${Number(result?.changedRows || 0)} errors=${Array.isArray(result?.errors) ? result.errors.length : 0}`
        );

        return res.json({ ok: true, result });
    } catch (error) {
        if (isValidationError(error)) {
            return sendValidationError(res, error, { endpoint: '/copy-pdf-to-pdf-all-books' });
        }

        const message = String(error?.message || error || 'Error desconocido');
        return res.status(400).json({ ok: false, error: message });
    }
});

const FINAL_FIELDS_V1_MAPPINGS_BACKEND = [
    { finalKey: 'pos_final', label: 'POS', sources: [{ key: 'pos_pdf', source: 'PDF' }, { key: 'POS', source: 'BASE' }] },
    { finalKey: 'pn_final', label: 'PART NO.', sources: [{ key: 'pn_pdf', source: 'PDF' }, { key: 'PART NO.', source: 'BASE' }] },
    { finalKey: 'designation_final', label: 'DESIGNATION', sources: [{ key: 'designation_gesa', source: 'GESA' }, { key: 'designation_pdf', source: 'PDF' }] },
    { finalKey: 'model_type_final', label: 'MODEL/TYPE', sources: [{ key: 'model_type_pdf', source: 'PDF' }, { key: 'MODEL/TYPE', source: 'BASE' }] },
    { finalKey: 'qty_final', label: 'QTY', sources: [{ key: 'qty_pdf', source: 'PDF' }, { key: 'QTY', source: 'BASE' }] },
    { finalKey: 'units_final', label: 'UNITS', sources: [{ key: 'units_pdf', source: 'PDF' }, { key: 'UNITS', source: 'BASE' }] },
    { finalKey: 'weight_final', label: 'WEIGHT', sources: [{ key: 'weight_gesa', source: 'GESA' }, { key: 'weight_pdf', source: 'PDF' }] },
    { finalKey: 'fn_final', label: 'FN', sources: [{ key: 'fn_pdf', source: 'PDF' }] },
    { finalKey: 'measure_final', label: 'MEASUREMENT / STANDARD', sources: [{ key: 'dimensions_gesa', source: 'GESA' }, { key: 'measure_pdf', source: 'PDF' }] },
    { finalKey: 'fg_fgs_final', label: 'FG/FGS', sources: [{ key: 'fg_fgs_pdf', source: 'PDF' }, { key: 'FG/FGS', source: 'BASE' }] },
    { finalKey: 'bom_final', label: 'BOM-No.', sources: [{ key: 'bom_pdf', source: 'PDF' }, { key: 'BOM-No.', source: 'BASE' }] },
    { finalKey: 'gesa_final', label: 'GESA', sources: [{ key: 'gesa', source: 'GESA' }] },
    { finalKey: 'nsn_final', label: 'NSN', sources: [{ key: 'nsn', source: 'GESA' }] },
    { finalKey: 'normalizado_final', label: 'NORMALIZADO', sources: [{ key: 'normalizado', source: 'GESA' }] },
    { finalKey: 'norma_final', label: 'NORMA', sources: [{ key: 'norma', source: 'GESA' }, { key: 'norma_pdf', source: 'PDF' }] },
    { finalKey: 'sust_status_final', label: 'SUST_STATUS', sources: [{ key: 'sust_status', source: 'SUST' }] },
    { finalKey: 'hierarchie_final', label: 'SUST_HIERARCHIE', sources: [{ key: 'sust_hierarchie', source: 'SUST' }] },
    { finalKey: 'new_pn_final', label: 'SUST_NEW_PART_NUMBER', sources: [{ key: 'sust_new_part_number', source: 'SUST' }] },
    { finalKey: 'subst_pnlist_final', label: 'SUST_SUPERSEDED_LIST', sources: [{ key: 'sust_superseded_list', source: 'SUST' }] }
];

function stringifyFinalFieldValue(value) {
    return value == null ? '' : String(value);
}

function hasNonEmptyFinalFieldValue(value) {
    return stringifyFinalFieldValue(value).trim() !== '';
}

function compareFinalFieldValue(value) {
    return stringifyFinalFieldValue(value).trim();
}

function collapseInnerSpaces(value) {
    return compareFinalFieldValue(value).replace(/\s+/g, ' ');
}

function removeAllSpaces(value) {
    return compareFinalFieldValue(value).replace(/\s+/g, '');
}

function getWeightFinalFromGesa(row) {
    const weight = compareFinalFieldValue(row?.weight_gesa);
    if (!weight) return '';
    const units = compareFinalFieldValue(row?.units);
    return units ? `${weight} ${units}` : weight;
}

function resolveFinalFieldValueForRow(row, mapping) {
    if (mapping.finalKey === 'designation_final') {
        const gesaDesignation = compareFinalFieldValue(row?.designation_gesa);
        const pdfDesignation = compareFinalFieldValue(row?.designation_pdf);
        if (gesaDesignation && pdfDesignation) {
            const sameWords = collapseInnerSpaces(gesaDesignation) === collapseInnerSpaces(pdfDesignation);
            const sameWithoutSpaces = removeAllSpaces(gesaDesignation) === removeAllSpaces(pdfDesignation);
            const rawDifferent = gesaDesignation !== pdfDesignation;
            if ((sameWords || sameWithoutSpaces) && rawDifferent) {
                return {
                    value: pdfDesignation,
                    source: 'PDF',
                    sourceKey: 'designation_pdf'
                };
            }
        }
    }

    if (mapping.finalKey === 'weight_final') {
        const weightWithUnits = getWeightFinalFromGesa(row);
        if (weightWithUnits) {
            return {
                value: weightWithUnits,
                source: 'GESA',
                sourceKey: 'weight_gesa+units'
            };
        }
    }

    for (const candidate of mapping.sources) {
        const rawValue = row?.[candidate.key];
        if (!hasNonEmptyFinalFieldValue(rawValue)) continue;
        return {
            value: stringifyFinalFieldValue(rawValue),
            source: candidate.source,
            sourceKey: candidate.key
        };
    }

    return {
        value: '',
        source: 'EMPTY',
        sourceKey: null
    };
}

function resolvePdfToFinalUpdatesForRow(row) {
    return FINAL_FIELDS_V1_MAPPINGS_BACKEND
        .map((mapping) => {
            const resolved = resolveFinalFieldValueForRow(row, mapping);
            const finalValue = compareFinalFieldValue(row?.[mapping.finalKey]);
            const nextValue = compareFinalFieldValue(resolved.value);
            if (finalValue === nextValue) {
                return null;
            }

            return {
                finalKey: mapping.finalKey,
                label: mapping.label,
                value: resolved.value,
                source: resolved.source,
                sourceKey: resolved.sourceKey
            };
        })
        .filter(Boolean);
}

// OFFICIAL: aplica FINAL_FIELDS_V1 con prioridad simple A/B por campo.
app.post('/copy-pdf-to-final-all-books', async (req, res) => {
    const payload = req.body || {};

    try {
        assertPlainObject(payload, 'payload');
        assertPayloadSize(payload, 12288, 'payload');

        const file = String(payload.file || '').trim();
        const files = Array.isArray(payload.files)
            ? payload.files.map((value) => String(value || '').trim()).filter(Boolean)
            : [];
        const backup = assertBooleanLike(payload.backup ?? true, 'backup');

        const requestedFiles = files.length > 0
            ? [...new Set(files)]
            : (file ? [file] : [...ENGINE_JSON_FILES]);

        if (!isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/copy-pdf-to-final-all-books');
        }

        const invalidFiles = requestedFiles.filter((entry) => !ENGINE_JSON_FILES.includes(entry));
        if (invalidFiles.length > 0) {
            throw validationError({
                code: 'FILE_NOT_ALLOWED',
                field: 'files',
                message: `Archivo(s) no permitido(s): ${invalidFiles.join(', ')}`
            });
        }

        const perFile = [];
        let scannedRows = 0;
        let changedRows = 0;
        let updatedFields = 0;
        let filesWritten = 0;

        for (const targetFile of requestedFiles) {
            const filePath = resolveRuntimePath(targetFile);
            let fileScannedRows = 0;
            let fileChangedRows = 0;
            let fileUpdatedFields = 0;
            let wroteFile = false;
            const sourceCounts = { PDF: 0, GESA: 0, SUST: 0, BASE: 0, EMPTY: 0 };
            const fieldCounts = {};
            const changedRecordIdsPreview = [];

            await withSaveJsonFileLock(targetFile, async () => {
                const raw = await fs.promises.readFile(filePath, 'utf8');
                const json = JSON.parse(raw);
                if (!Array.isArray(json)) {
                    throw new Error(`Formato invalido en ${targetFile}: se esperaba un array de registros`);
                }

                fileScannedRows = json.length;

                for (const row of json) {
                    const updates = resolvePdfToFinalUpdatesForRow(row);
                    if (!updates.length) continue;

                    fileChangedRows += 1;
                    if (changedRecordIdsPreview.length < 25) {
                        changedRecordIdsPreview.push(String(row?.ID ?? row?.id ?? ''));
                    }
                    for (const update of updates) {
                        setWriteField(row, update.finalKey, update.value);
                        fileUpdatedFields += 1;
                        sourceCounts[update.source] = (sourceCounts[update.source] || 0) + 1;
                        fieldCounts[update.finalKey] = (fieldCounts[update.finalKey] || 0) + 1;
                    }
                }

                if (fileUpdatedFields > 0) {
                    if (backup) {
                        const backupPath = `${filePath}.backup.${Date.now()}`;
                        await fs.promises.copyFile(filePath, backupPath);
                    }
                    stripLegacyQaFields(json);
                    await writeJsonAtomic(filePath, json);
                    pnReviewQaCacheService.invalidate();
                    wroteFile = true;
                }
            });

            scannedRows += fileScannedRows;
            changedRows += fileChangedRows;
            updatedFields += fileUpdatedFields;
            if (wroteFile) filesWritten += 1;

            console.log(
                `[final-fields-v1] file=${targetFile} scannedRows=${fileScannedRows} changedRows=${fileChangedRows} updatedFields=${fileUpdatedFields} `
                + `sources=${JSON.stringify(sourceCounts)} fields=${JSON.stringify(fieldCounts)} changedIds=${JSON.stringify(changedRecordIdsPreview)}`
            );

            perFile.push({
                file: targetFile,
                scannedRows: fileScannedRows,
                changedRows: fileChangedRows,
                updatedFields: fileUpdatedFields,
                wroteFile,
                sourceCounts,
                fieldCounts,
                changedRecordIdsPreview
            });
        }

        return res.json({
            ok: true,
            official: true,
            result: {
                files: requestedFiles,
                backup,
                totals: {
                    filesProcessed: requestedFiles.length,
                    filesWritten,
                    scannedRows,
                    changedRows,
                    updatedFields
                },
                perFile
            }
        });
    } catch (error) {
        if (isValidationError(error)) {
            return sendValidationError(res, error, { endpoint: '/copy-pdf-to-final-all-books' });
        }

        const message = String(error?.message || error || 'Error desconocido');
        return res.status(400).json({ ok: false, error: message });
    }
});

// Vacia campos cuyo nombre termina en alguno de los sufijos indicados
// (por defecto _pdf y _final) en los engine_*.json seleccionados.
app.post('/clear-engine-fields', async (req, res) => {
    const payload = req.body || {};

    try {
        assertPlainObject(payload, 'payload');
        assertPayloadSize(payload, 8192, 'payload');

        const rawSuffixes = Array.isArray(payload.suffixes) && payload.suffixes.length > 0
            ? payload.suffixes
            : ['_pdf', '_final'];

        const suffixes = rawSuffixes
            .map((value) => String(value || '').trim())
            .filter((value) => value.length > 0 && value.startsWith('_'));

        if (suffixes.length === 0) {
            return res.status(400).json({ ok: false, error: 'Debes indicar al menos un sufijo valido (ej: _pdf).' });
        }

        const exclude = new Set(
            (Array.isArray(payload.exclude) ? payload.exclude : [])
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        );

        const requestedFiles = Array.isArray(payload.files)
            ? payload.files.map((value) => String(value || '').trim()).filter(Boolean)
            : [];

        const allowedFiles = new Set(ENGINE_JSON_FILES);
        const targetFiles = requestedFiles.length > 0
            ? requestedFiles.filter((name) => allowedFiles.has(name))
            : ENGINE_JSON_FILES;

        if (targetFiles.length === 0) {
            return res.status(400).json({ ok: false, error: 'Ningun archivo engine valido en la peticion.' });
        }

        const dryRun = assertBooleanLike(payload.dryRun ?? false, 'dryRun');
        const resetQaRevision = assertBooleanLike(payload.resetQaRevision ?? false, 'resetQaRevision');
        const qaRevisionUpdatedAt = new Date().toISOString();

        if (!dryRun && !isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/clear-engine-fields');
        }

        const perFile = [];
        let grandRecords = 0;
        let grandFields = 0;
        let grandRevisionRecords = 0;

        for (const fileName of targetFiles) {
            const filePath = resolveRuntimePath(fileName);
            if (!fs.existsSync(filePath)) {
                perFile.push({ file: fileName, missing: true, records: 0, fields: 0 });
                continue;
            }

            const data = readJsonFileSafe(filePath, null);
            if (!Array.isArray(data)) {
                perFile.push({ file: fileName, error: 'Formato inesperado (se esperaba array)', records: 0, fields: 0 });
                continue;
            }

            let records = 0;
            let fields = 0;
            let revisionRecords = 0;

            for (const record of data) {
                if (!record || typeof record !== 'object') continue;
                let touched = 0;
                for (const key of Object.keys(record)) {
                    if (!suffixes.some((suf) => key.endsWith(suf))) continue;
                    if (exclude.has(key)) continue;
                    if (record[key] !== '') touched += 1;
                    record[key] = '';
                }

                let revisionTouched = false;
                if (resetQaRevision) {
                    if (record.qa_revision_estado !== 'pendiente') {
                        record.qa_revision_estado = 'pendiente';
                        revisionTouched = true;
                    }
                    if (record.qa_revision_accion !== 'revisar') {
                        record.qa_revision_accion = 'revisar';
                        revisionTouched = true;
                    }
                    if (record.qa_revision_updated_at !== qaRevisionUpdatedAt) {
                        record.qa_revision_updated_at = qaRevisionUpdatedAt;
                        revisionTouched = true;
                    }
                }

                if (touched > 0) {
                    records += 1;
                    fields += touched;
                }
                if (revisionTouched) {
                    revisionRecords += 1;
                }
            }

            if (!dryRun && (fields > 0 || revisionRecords > 0)) {
                await writeJsonAtomic(filePath, data);
            }

            grandRecords += records;
            grandFields += fields;
            grandRevisionRecords += revisionRecords;
            perFile.push({ file: fileName, records, fields, revisionRecords });
        }

        return res.json({
            ok: true,
            result: {
                dryRun,
                suffixes,
                exclude: Array.from(exclude),
                resetQaRevision,
                qaRevisionUpdatedAt: resetQaRevision ? qaRevisionUpdatedAt : null,
                summary: {
                    totalRecords: grandRecords,
                    totalFields: grandFields,
                    totalRevisionRecords: grandRevisionRecords
                },
                perFile
            }
        });
    } catch (error) {
        if (isValidationError(error)) {
            return sendValidationError(res, error, { endpoint: '/clear-engine-fields' });
        }
        const message = String(error?.message || error || 'Error desconocido');
        return res.status(400).json({ ok: false, error: message });
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

    try {
        assertNonEmptyObject(payload, 'payload');
        assertPayloadSize(payload, 32768, 'payload');
        const normalized = normalizeRevisionSyncPayload(payload);
        await writeRevisionSyncPayload(normalized);
        return res.json({ ok: true, saved_rows: Number(normalized?.meta?.rows) || 0 });
    } catch (error) {
        if (isValidationError(error)) {
            return sendValidationError(res, error, { endpoint: '/qa_revision_sync.php' });
        }
        return res.status(400).json({ ok: false, error: String(error?.message || error) });
    }
});

app.post('/apply-revision-to-engines', async (req, res) => {
    const payload = req.body;

    try {
        if (!isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/apply-revision-to-engines');
        }

        validateRevisionApplyPayload(payload);
        const result = await revisionApplyService.applyFromApi(payload);
        return res.json({ ok: true, result });
    } catch (error) {
        if (isValidationError(error)) {
            return sendValidationError(res, error, { endpoint: '/apply-revision-to-engines' });
        }
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.post('/export/run-wordpress', async (_req, res) => {
    try {
        const result = await withExportLock('run-wordpress', async () => {
            const wordpressRun = await runNodeScript(
                path.join('src', 'server', 'milu-demo', 'scripts', 'export_wordpress_milu.js')
            );
            const importRows = readFirstJsonFileSafe(WORDPRESS_OUTPUT_DIR, ['milu_wp_new_import.json', 'milu_wp_import.json'], []);
            const supersededRows = readFirstJsonFileSafe(WORDPRESS_OUTPUT_DIR, ['milu_wp_superseded_import.json', 'milu_wp_superseded.json'], []);
            const summary = {
                import: Array.isArray(importRows) ? importRows.length : 0,
                superseded: Array.isArray(supersededRows) ? supersededRows.length : 0,
                pending: 0,
                discard: 0
            };
            return { wordpress: wordpressRun, summary };
        });
        return res.json({ ok: true, result, run_state: exportRunState });
    } catch (error) {
        const status = error?.statusCode || 500;
        return res.status(status).json({ ok: false, error: String(error?.message || error), run_state: exportRunState });
    }
});

app.get('/export/preview', async (_req, res) => {
    try {
        const summaryPath = path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_export_summary.md');
        const importRows = readFirstJsonFileSafe(WORDPRESS_OUTPUT_DIR, ['milu_wp_new_import.json', 'milu_wp_import.json'], []);
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
        const wpDir = path.join(DATA_ROOT, 'legacy-data', '05-wordpress');
        const importRows = readFirstJsonFileSafe(wpDir, ['milu_wp_new_import.json', 'milu_wp_import.json'], []);
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

async function writeJsonAtomic(filePath, payload) {
    const tmpPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    const RETRYABLE_CODES = new Set(['EPERM', 'EACCES']);
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            await fs.promises.rename(tmpPath, filePath);
            return;
        } catch (error) {
            const code = String(error?.code || '');
            const isLastAttempt = attempt === maxAttempts;
            if (!RETRYABLE_CODES.has(code) || isLastAttempt) {
                throw error;
            }
            const backoffMs = 40 * attempt;
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
    }
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

function isOkImportarRow(row) {
    return lowerKey(row?.qa_revision_estado) === 'ok' && lowerKey(row?.qa_revision_accion) === 'importar';
}

function getSiblingRowSourcePage(row) {
    return normalizeText(row?.['Source Page'] || row?.source_page || row?.page || row?.PAGE);
}

function getSiblingRowPos(row) {
    return normalizeText(row?.pos_final || row?.POS || row?.pos || row?.position);
}

function getSiblingRowEngineKey(row) {
    const sourceFile = normalizeEngineFileName(row?.source_file || row?.engine_file || '');
    if (sourceFile) {
        return engineFileKey(sourceFile);
    }
    return lowerKey(row?.engine_model || row?.engine || row?.model);
}

function toComparableNumber(value) {
    const text = normalizeText(value);
    if (!text) return null;

    const compact = text.replace(/\s+/g, '').replace(',', '.');
    const num = Number(compact);
    return Number.isFinite(num) ? num : null;
}

function compareNumberText(aValue, bValue) {
    const aNum = toComparableNumber(aValue);
    const bNum = toComparableNumber(bValue);
    if (aNum != null && bNum != null && aNum !== bNum) return aNum - bNum;
    if (aNum != null && bNum == null) return -1;
    if (aNum == null && bNum != null) return 1;

    const aText = lowerKey(aValue);
    const bText = lowerKey(bValue);
    if (aText === bText) return 0;
    return aText.localeCompare(bText, 'es', { numeric: true, sensitivity: 'base' });
}

function compareSiblingRowsStable(a, b) {
    const byEngine = getSiblingRowEngineKey(a).localeCompare(getSiblingRowEngineKey(b), 'es', { numeric: true, sensitivity: 'base' });
    if (byEngine !== 0) return byEngine;

    const byPage = compareNumberText(getSiblingRowSourcePage(a), getSiblingRowSourcePage(b));
    if (byPage !== 0) return byPage;

    const byPos = compareNumberText(getSiblingRowPos(a), getSiblingRowPos(b));
    if (byPos !== 0) return byPos;

    return compareNumberText(normalizeIdForCompare(a?.ID), normalizeIdForCompare(b?.ID));
}

function getSiblingRowToken(row) {
    const rowId = normalizeText(row?.ID);
    const rowPn = pnKey(getRowPn(row));
    const rowPage = lowerKey(getSiblingRowSourcePage(row));
    const rowPos = lowerKey(getSiblingRowPos(row));
    if (!rowId || !rowPn) return '';
    return `${normalizeIdForCompare(rowId)}|${rowPn}|${rowPage}|${rowPos}`;
}

function resolveEngineFilesForRecompute(engine) {
    const normalizedEngine = normalizeEngineToken(engine);
    if (!normalizedEngine) {
        throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine es obligatorio' });
    }
    if (normalizedEngine === 'ALL') {
        return [...ENGINE_JSON_FILES];
    }

    const matchedFile = ENGINE_JSON_FILES.find((file) => engineFileKey(file) === engineFileKey(normalizedEngine));
    if (!matchedFile) {
        throw validationError({ code: 'ENGINE_NOT_ALLOWED', field: 'engine', message: `Motor no permitido: ${engine}` });
    }
    return [matchedFile];
}

async function applySiblingBulkUpdates(itemsRaw, options = {}) {
    const dryRun = Boolean(options?.dryRun);
    const backup = Boolean(options?.backup);
    const data = pnReviewQaCacheService.load();
    const nowIso = new Date().toISOString();
    const updatesByFile = new Map();
    const itemResults = [];
    const errors = [];

    const selectedPnByKey = new Map();
    for (const item of Array.isArray(itemsRaw) ? itemsRaw : []) {
        const pn = normalizeText(item?.pn);
        const key = pnKey(pn);
        if (!pn || !key || selectedPnByKey.has(key)) continue;
        selectedPnByKey.set(key, {
            pn,
            current_id: normalizeText(item?.current_id),
            current_engine_file: normalizeEngineFileName(item?.current_engine_file || item?.current_engine || '')
        });
    }

    const scheduleUpdate = (sourceRow, desired) => {
        const sourceFile = normalizeEngineFileName(sourceRow?.source_file || sourceRow?.engine_file || '');
        if (!sourceFile || !ENGINE_JSON_FILES.includes(sourceFile)) return false;

        const token = getSiblingRowToken(sourceRow);
        if (!token) return false;

        let fileTargets = updatesByFile.get(sourceFile);
        if (!fileTargets) {
            fileTargets = new Map();
            updatesByFile.set(sourceFile, fileTargets);
        }

        fileTargets.set(token, desired);
        return true;
    };

    for (const [key, selected] of selectedPnByKey.entries()) {
        const detail = data.index.get(key);
        if (!detail) {
            itemResults.push({
                pn: selected.pn,
                current_id: selected.current_id,
                current_engine_file: selected.current_engine_file,
                found_sources: 0,
                target_siblings: 0,
                planned_updates: 0,
                skipped: true,
                reason: 'pn-not-found'
            });
            continue;
        }

        const allSources = Array.isArray(detail.source_rows_all) ? detail.source_rows_all : [];
        const normalizedSources = allSources
            .filter((src) => {
                const sourceFile = normalizeEngineFileName(src?.source_file || src?.engine_file || '');
                return Boolean(sourceFile && ENGINE_JSON_FILES.includes(sourceFile));
            })
            .filter((src) => pnKey(getRowPn(src)) === key);

        if (normalizedSources.length === 0) {
            itemResults.push({
                pn: selected.pn,
                current_id: selected.current_id,
                current_engine_file: selected.current_engine_file,
                found_sources: 0,
                target_siblings: 0,
                planned_updates: 0,
                skipped: true,
                reason: 'pn-without-sources'
            });
            continue;
        }

        const ordered = [...normalizedSources].sort(compareSiblingRowsStable);
        const existingOkImportar = ordered.filter((row) => isOkImportarRow(row));
        const winner = existingOkImportar[0] || ordered[0];
        const winnerToken = getSiblingRowToken(winner);
        const winnerId = normalizeText(winner?.ID);
        const winnerPn = normalizeText(getRowPn(winner));

        let plannedUpdates = 0;
        for (const source of ordered) {
            const sourceToken = getSiblingRowToken(source);
            if (!sourceToken) continue;

            const isWinner = sourceToken === winnerToken;
            const desired = isWinner
                ? {
                    qa_revision_estado: 'ok',
                    qa_revision_accion: 'importar',
                    copia_de_id: '',
                    copia_de_pn: ''
                }
                : {
                    qa_revision_estado: 'ok',
                    qa_revision_accion: 'copia',
                    copia_de_id: winnerId,
                    copia_de_pn: winnerPn
                };

            const scheduled = scheduleUpdate(source, desired);
            if (scheduled) {
                plannedUpdates += 1;
            }
        }

        itemResults.push({
            pn: selected.pn,
            current_id: selected.current_id,
            current_engine_file: selected.current_engine_file,
            found_sources: ordered.length,
            target_siblings: Math.max(0, ordered.length - 1),
            planned_updates: plannedUpdates,
            winner_id: winnerId,
            winner_engine_file: normalizeEngineFileName(winner?.source_file || winner?.engine_file || ''),
            winner_was_existing_ok_importar: existingOkImportar.length > 0,
            skipped: false
        });
    }

    const filesTouched = [];
    const backupPaths = [];
    let rowsUpdated = 0;

    for (const [file, targetMap] of updatesByFile.entries()) {
        if (!ENGINE_JSON_FILES.includes(file)) {
            errors.push({ file, error: 'Archivo no permitido' });
            continue;
        }

        const filePath = resolveRuntimePath(file);
        try {
            await withSaveJsonFileLock(file, async () => {
                const raw = await fs.promises.readFile(filePath, 'utf8');
                const json = JSON.parse(raw);
                if (!Array.isArray(json)) {
                    throw new Error('Contenido JSON invalido: se esperaba array.');
                }

                let touched = false;
                for (const row of json) {
                    const rowToken = getSiblingRowToken({
                        ...row,
                        source_file: file
                    });
                    if (!rowToken) continue;

                    const desired = targetMap.get(rowToken);
                    if (!desired) continue;

                    const currentEstado = lowerKey(row?.qa_revision_estado);
                    const currentAccion = lowerKey(row?.qa_revision_accion);
                    const currentCopiaId = normalizeText(row?.copia_de_id);
                    const currentCopiaPn = normalizeText(row?.copia_de_pn);

                    const desiredEstado = lowerKey(desired.qa_revision_estado);
                    const desiredAccion = lowerKey(desired.qa_revision_accion);
                    const desiredCopiaId = normalizeText(desired.copia_de_id);
                    const desiredCopiaPn = normalizeText(desired.copia_de_pn);

                    if (
                        currentEstado === desiredEstado
                        && currentAccion === desiredAccion
                        && currentCopiaId === desiredCopiaId
                        && currentCopiaPn === desiredCopiaPn
                    ) {
                        continue;
                    }

                    row.qa_revision_estado = desired.qa_revision_estado;
                    row.qa_revision_accion = desired.qa_revision_accion;
                    row.copia_de_id = desired.copia_de_id;
                    row.copia_de_pn = desired.copia_de_pn;
                    row.qa_revision_updated_at = nowIso;
                    rowsUpdated += 1;
                    touched = true;
                }

                if (touched && !dryRun) {
                    if (backup) {
                        const backupPath = `${filePath}.backup.${Date.now()}`;
                        await fs.promises.copyFile(filePath, backupPath);
                        backupPaths.push(path.basename(backupPath));
                    }
                    await writeJsonAtomic(filePath, json);
                    filesTouched.push(file);
                }
            });
        } catch (error) {
            errors.push({ file, error: String(error?.message || error) });
        }
    }

    const plannedUpdates = itemResults.reduce((acc, item) => acc + Number(item?.planned_updates || 0), 0);
    const pnsWithChanges = itemResults.filter((item) => Number(item?.target_siblings || 0) > 0).length;

    if (!dryRun && (filesTouched.length > 0 || errors.length > 0)) {
        pnReviewQaCacheService.invalidate();
    }

    return {
        scanned_items: itemResults.length,
        pns_with_changes: pnsWithChanges,
        planned_updates: plannedUpdates,
        rows_updated: dryRun ? plannedUpdates : rowsUpdated,
        files_touched: filesTouched,
        item_results: itemResults,
        errors,
        backup_paths: backupPaths,
        dry_run: dryRun,
        backup_requested: backup
    };
}

app.get('/pn-review/list', async (req, res) => {
    try {
        const data = pnReviewQaCacheService.load();
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
            loaded_at: pnReviewQaCacheService.getLoadedAt()
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
        const data = pnReviewQaCacheService.load();
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
        const data = pnReviewQaCacheService.load();
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

// DEPRECATED: use POST /api/recompute-simple/recompute-hermanos.
app.post('/pn-review/apply-siblings-bulk', async (req, res) => {
    let itemsRaw;
    try {
        itemsRaw = validateSiblingBulkPayload(req.body);
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/pn-review/apply-siblings-bulk' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    try {
        if (!isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/pn-review/apply-siblings-bulk');
        }

        console.warn('[DEPRECATED] POST /pn-review/apply-siblings-bulk invoked. Use /api/recompute-simple/recompute-hermanos.');

        const result = await applySiblingBulkUpdates(itemsRaw, { dryRun: false, backup: true });

        return res.json({
            ok: Array.isArray(result?.errors) ? result.errors.length === 0 : true,
            deprecated: true,
            warning: 'Use /api/recompute-simple/recompute-hermanos.',
            result
        });
    } catch (error) {
        return res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
});

app.post('/pn-review/:sku/apply-decision', async (req, res) => {
    const sku = normalizeText(req.params?.sku);
    const skuNormalized = pnKey(sku);
    let action;
    let estadoRaw;
    let accionRaw;

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

    try {
        ({ action, estado: estadoRaw, accion: accionRaw } = validatePnReviewApplyDecisionPayload(req.body));
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/pn-review/:sku/apply-decision' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
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
        const filePath = resolveRuntimePath(file);
        try {
            await withSaveJsonFileLock(file, async () => {
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
            });
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

    pnReviewQaCacheService.invalidate();

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
    let fields;

    if (!sku || !skuNormalized) {
        return res.status(400).json({ ok: false, error: 'SKU requerido.' });
    }

    try {
        const fieldsInput = validatePnReviewApplyValuesPayload(req.body || {});
        fields = buildPnPropagationFields(fieldsInput);
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/pn-review/:sku/apply-values' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
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
        const filePath = resolveRuntimePath(file);
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

    pnReviewQaCacheService.invalidate();

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
    let action;
    const engineModel = normalizeText(req.body?.engine_model);
    const sourceFile = normalizeText(req.body?.source_file);
    const sourcePage = normalizeText(req.body?.source_page);
    const sourcePos = normalizeText(req.body?.pos);
    const sourcePartNo = normalizeText(req.body?.part_no);
    let estadoRaw;
    let accionRaw;

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

    try {
        ({ action, estado: estadoRaw, accion: accionRaw } = validatePnReviewApplyDecisionPayload(req.body));
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/pn-review/by-id/:id/apply-decision' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
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
        const filePath = resolveRuntimePath(file);

        try {
            await withSaveJsonFileLock(file, async () => {
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
                if (idx < 0) return;

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
            });
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

    pnReviewQaCacheService.invalidate();

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

// =============================================================================
// Export Manager ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â listado de archivos generados, preview y orquestador (lock).
// =============================================================================

const EXPORT_BASE_DIR = path.join(DATA_ROOT, 'legacy-data');
const WORDPRESS_EXPORT_FOLDER = '05-wordpress';
const EXPORT_FOLDER_WHITELIST = new Set([WORDPRESS_EXPORT_FOLDER]);
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
    if (value === 'wordpress') return WORDPRESS_EXPORT_FOLDER;
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
            path: path.relative(REPO_ROOT, fullPath).replace(/\\/g, '/'),
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
        new: ['milu_wp_new_import.json', 'milu_wp_import.json'],
        superseded: ['milu_wp_superseded_import.json', 'milu_wp_superseded.json'],
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

    let lastGeneratedAt = null;
    if (!lastGeneratedAt) {
        const files = listExportFolder(WORDPRESS_EXPORT_FOLDER);
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
        report: null
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
    const folder = safeFolderName(req.query?.folder || WORDPRESS_EXPORT_FOLDER);
    const name = safeFileName(req.query?.name);
    if (!folder || !name) {
        return res.status(400).json({ ok: false, error: 'Carpeta o archivo no permitidos.' });
    }
    const fullPath = path.join(EXPORT_BASE_DIR, folder, name);
    if (!fs.existsSync(fullPath)) {
        console.warn('[EXPORT FILE] Missing file', {
            folder,
            name,
            fullPath
        });
        return res.status(404).json({
            ok: false,
            error: 'Archivo no encontrado.',
            folder,
            name,
            full_path: fullPath
        });
    }

    console.info('[EXPORT FILE] Loading export file', {
        folder,
        name,
        fullPath
    });

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
            full_path: fullPath,
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
    const folder = safeFolderName(req.query?.folder || WORDPRESS_EXPORT_FOLDER);
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
        console.warn('[EXPORT DOWNLOAD] Missing file', {
            folder,
            name,
            fullPath
        });
        return res.status(404).json({
            ok: false,
            error: 'Archivo no encontrado.',
            folder,
            name,
            full_path: fullPath
        });
    }

    console.info('[EXPORT DOWNLOAD] Sending export file', {
        folder,
        name,
        fullPath
    });

    return res.download(fullPath, name);
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

    try {
        validateAuditLogPayload(payload);
        const entries = await readAuditLogFile();
        const entry = sanitizeAuditEntry(payload);
        entries.push(entry);
        await writeAuditLogFile(entries);
        return res.json({ ok: true, entry });
    } catch (error) {
        if (isValidationError(error)) {
            return sendValidationError(res, error, { endpoint: '/audit-log' });
        }
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
    const allowedPhpRoutes = new Set(['/qa_revision_sync.php', '/save-json.php', '/delete-json.php']);
    if (/\.php$/i.test(req.path) && !allowedPhpRoutes.has(phpPath)) {
        return res.status(404).json({ ok: false, error: 'Ruta no disponible en backend local.' });
    }
    return next();
});

// Compatibilidad local: esta ruta debe resolverse por Express antes del static middleware.
app.get('/save-json.php', (_req, res) => {
    res.json({ ok: true, service: 'milu-save-backend', route: '/save-json.php' });
});

app.get('/delete-json.php', (_req, res) => {
    res.json({ ok: true, service: 'milu-delete-backend', route: '/delete-json.php' });
});

app.get('/api/esquemas-pos-index', async (_req, res) => {
    try {
        const baseDir = path.join(ASSETS_ROOT, 'esquemas_pos_circulos');
        const allFiles = [];

        async function walkDirRecursive(currentDir) {
            const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    await walkDirRecursive(fullPath);
                    continue;
                }
                if (!entry.isFile()) continue;
                if (!/\.(webp|png|jpe?g)$/i.test(entry.name)) continue;
                allFiles.push(entry.name.toLowerCase());
            }
        }

        await walkDirRecursive(baseDir);
        const files = [...new Set(allFiles)];
        res.json({ ok: true, files });
    } catch (err) {
        console.error('[esquemas-pos-index] Error:', err.message);
        res.json({ ok: false, files: [], error: String(err.message) });
    }
});

app.post('/api/esquemas/generate-one', async (req, res) => {
    const tag = '[api:esquemas:generate-one]';
    const os = require('os');

    let engine;
    let id;
    let pdf;
    let outDir;
    let dryRun;
    let writeImages;
    let overwrite;
    let pageOffset;
    let dpi;
    let format;
    let quality;
    let sourcePageHint = null;
    let posHint = '';
    let partNoHint = '';
    let designationHint = '';
    let autoRedFrames = false;
    let preferManualFramedPdf = true;

    try {
        assertPayloadSize(req.body, { maxBytes: 16384 });

        engine = assertString(req.body?.engine, { field: 'engine', allowEmpty: false, maxLength: 64 });
        id = assertString(req.body?.id, { field: 'id', allowEmpty: false, maxLength: 128 });
        pdf = assertString(req.body?.pdf, { field: 'pdf', allowEmpty: false, maxLength: 260 });
        outDir = assertString(req.body?.outDir ?? 'esquemas', { field: 'outDir', allowEmpty: false, maxLength: 260 });

        dryRun = assertBooleanLike(req.body?.dryRun ?? false, 'dryRun');
        writeImages = assertBooleanLike(req.body?.writeImages ?? true, 'writeImages');
        overwrite = assertBooleanLike(req.body?.overwrite ?? false, 'overwrite');
        autoRedFrames = assertBooleanLike(req.body?.autoRedFrames ?? false, 'autoRedFrames');
        preferManualFramedPdf = assertBooleanLike(req.body?.preferManualFramedPdf ?? true, 'preferManualFramedPdf');

        pageOffset = Number(req.body?.pageOffset ?? -1);
        dpi = Number(req.body?.dpi ?? 200);
        quality = Number(req.body?.quality ?? 90);
        format = String(req.body?.format ?? 'png').trim().toLowerCase();

        sourcePageHint = req.body?.sourcePageHint == null ? null : Number(req.body?.sourcePageHint);
        if (sourcePageHint != null && (!Number.isFinite(sourcePageHint) || !Number.isInteger(sourcePageHint) || sourcePageHint < 0 || sourcePageHint > 100000)) {
            throw validationError({ code: 'INVALID_SOURCE_PAGE_HINT', field: 'sourcePageHint', message: 'sourcePageHint debe ser entero entre 0 y 100000' });
        }
        posHint = assertString(req.body?.posHint ?? '', { field: 'posHint', allowEmpty: true, maxLength: 64 });
        partNoHint = assertString(req.body?.partNoHint ?? '', { field: 'partNoHint', allowEmpty: true, maxLength: 128 });
        designationHint = assertString(req.body?.designationHint ?? '', { field: 'designationHint', allowEmpty: true, maxLength: 512 });

        if (!/^[A-Za-z0-9._-]+$/.test(engine)) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine contiene caracteres no permitidos' });
        }
        if (!/^[A-Za-z0-9._:-]+$/.test(id)) {
            throw validationError({ code: 'INVALID_ID', field: 'id', message: 'id contiene caracteres no permitidos' });
        }
        if (!/^[A-Za-z0-9._\-\\/ ]+$/.test(pdf) || pdf.includes('..')) {
            throw validationError({ code: 'INVALID_PDF_PATH', field: 'pdf', message: 'pdf contiene una ruta no permitida' });
        }
        if (!/^[A-Za-z0-9._\-\\/ ]+$/.test(outDir) || outDir.includes('..')) {
            throw validationError({ code: 'INVALID_OUT_DIR', field: 'outDir', message: 'outDir contiene una ruta no permitida' });
        }
        if (posHint && !/^[A-Za-z0-9._\-\/, ]+$/.test(posHint)) {
            throw validationError({ code: 'INVALID_POS_HINT', field: 'posHint', message: 'posHint contiene caracteres no permitidos' });
        }
        if (partNoHint && !/^[A-Za-z0-9._\-\/, ]+$/.test(partNoHint)) {
            throw validationError({ code: 'INVALID_PART_NO_HINT', field: 'partNoHint', message: 'partNoHint contiene caracteres no permitidos' });
        }
        if (!Number.isInteger(pageOffset) || pageOffset < -50 || pageOffset > 50) {
            throw validationError({ code: 'INVALID_PAGE_OFFSET', field: 'pageOffset', message: 'pageOffset debe ser entero entre -50 y 50' });
        }
        if (!Number.isFinite(dpi) || dpi < 72 || dpi > 600) {
            throw validationError({ code: 'INVALID_DPI', field: 'dpi', message: 'dpi debe estar entre 72 y 600' });
        }
        if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
            throw validationError({ code: 'INVALID_QUALITY', field: 'quality', message: 'quality debe estar entre 1 y 100' });
        }
        if (!['webp', 'png', 'jpg', 'jpeg', 'tiff'].includes(format)) {
            throw validationError({ code: 'INVALID_FORMAT', field: 'format', message: 'format no soportado' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/esquemas/generate-one' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    const reportPath = path.join(os.tmpdir(), `milu_generate_esquema_${Date.now()}_${process.pid}.json`);
    const args = [
        'src/server/milu-demo/python/generate_esquema_pos.py',
        '--engine', engine,
        '--id', id,
        '--pdf', pdf,
        '--out-dir', outDir,
        '--page-offset', String(pageOffset),
        '--dpi', String(Math.round(dpi)),
        '--format', format,
        '--quality', String(Math.round(quality)),
        '--out-report', reportPath,
        '--without-circle'
    ];

    if (dryRun || !writeImages) args.push('--dry-run');
    if (writeImages) args.push('--write-images');
    if (overwrite) args.push('--overwrite');
    if (sourcePageHint != null) args.push('--source-page-hint', String(sourcePageHint));
    if (posHint) args.push('--pos-hint', posHint);
    if (partNoHint) args.push('--part-no-hint', partNoHint);
    if (designationHint) args.push('--designation-hint', designationHint);
    if (autoRedFrames) args.push('--auto-red-frames');
    if (!preferManualFramedPdf) args.push('--no-prefer-manual-framed-pdf');

    try {
        console.log(`${tag} spawn python ${args.join(' ')}`);

        const python = spawn('python', args, {
            cwd: REPO_ROOT,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (chunk) => {
            stdout += String(chunk || '');
        });
        python.stderr.on('data', (chunk) => {
            stderr += String(chunk || '');
        });

        python.on('error', (error) => {
            console.error(`${tag} spawn error:`, error);
            return res.status(500).json({
                ok: false,
                error: `No se pudo lanzar python: ${String(error?.message || error)}`
            });
        });

        python.on('close', async (code) => {
            let report = null;
            try {
                if (fs.existsSync(reportPath)) {
                    report = JSON.parse(await fs.promises.readFile(reportPath, 'utf8'));
                    await fs.promises.unlink(reportPath).catch(() => { });
                }
            } catch (error) {
                console.warn(`${tag} report parse error:`, error);
            }

            const ok = code === 0;
            const statusCode = ok ? 200 : 422;
            return res.status(statusCode).json({
                ok,
                exitCode: code,
                report,
                stdout,
                stderr,
                error: ok ? null : `python generate_esquema_pos.py salio con code=${code}`
            });
        });
    } catch (error) {
        console.error(`${tag} backend error:`, error);
        return res.status(500).json({ ok: false, error: String(error?.message || error || 'Error desconocido') });
    }
});

app.post('/api/esquemas-pos/generate-one', async (req, res) => {
    const tag = '[api:esquemas-pos:generate-one]';
    const os = require('os');

    let engine;
    let id;
    let pdf;
    let outDir;
    let dryRun;
    let writeImages;
    let overwrite;
    let pageOffset;
    let dpi;
    let format;
    let quality;

    try {
        assertPayloadSize(req.body, { maxBytes: 16384 });

        engine = assertString(req.body?.engine, { field: 'engine', allowEmpty: false, maxLength: 64 });
        id = assertString(req.body?.id, { field: 'id', allowEmpty: false, maxLength: 128 });
        pdf = assertString(req.body?.pdf, { field: 'pdf', allowEmpty: false, maxLength: 260 });
        outDir = assertString(req.body?.outDir ?? 'esquemas_pos_circulos', { field: 'outDir', allowEmpty: false, maxLength: 260 });

        dryRun = assertBooleanLike(req.body?.dryRun ?? false, 'dryRun');
        writeImages = assertBooleanLike(req.body?.writeImages ?? true, 'writeImages');
        overwrite = assertBooleanLike(req.body?.overwrite ?? false, 'overwrite');

        pageOffset = Number(req.body?.pageOffset ?? -1);
        dpi = Number(req.body?.dpi ?? 200);
        quality = Number(req.body?.quality ?? 90);
        format = String(req.body?.format ?? 'webp').trim().toLowerCase();

        if (!/^[A-Za-z0-9._-]+$/.test(engine)) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine contiene caracteres no permitidos' });
        }
        if (!/^[A-Za-z0-9._:-]+$/.test(id)) {
            throw validationError({ code: 'INVALID_ID', field: 'id', message: 'id contiene caracteres no permitidos' });
        }
        if (!/^[A-Za-z0-9._\-\\/ ]+$/.test(pdf) || pdf.includes('..')) {
            throw validationError({ code: 'INVALID_PDF_PATH', field: 'pdf', message: 'pdf contiene una ruta no permitida' });
        }
        if (!/^[A-Za-z0-9._\-\\/ ]+$/.test(outDir) || outDir.includes('..')) {
            throw validationError({ code: 'INVALID_OUT_DIR', field: 'outDir', message: 'outDir contiene una ruta no permitida' });
        }
        if (!Number.isInteger(pageOffset) || pageOffset < -50 || pageOffset > 50) {
            throw validationError({ code: 'INVALID_PAGE_OFFSET', field: 'pageOffset', message: 'pageOffset debe ser entero entre -50 y 50' });
        }
        if (!Number.isFinite(dpi) || dpi < 72 || dpi > 600) {
            throw validationError({ code: 'INVALID_DPI', field: 'dpi', message: 'dpi debe estar entre 72 y 600' });
        }
        if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
            throw validationError({ code: 'INVALID_QUALITY', field: 'quality', message: 'quality debe estar entre 1 y 100' });
        }
        if (!['webp', 'png', 'jpg', 'jpeg', 'tiff'].includes(format)) {
            throw validationError({ code: 'INVALID_FORMAT', field: 'format', message: 'format no soportado' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/esquemas-pos/generate-one' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    const reportPath = path.join(os.tmpdir(), `milu_rebuild_esquema_pos_one_${Date.now()}_${process.pid}.json`);
    const args = [
        'src/server/milu-demo/python/rebuild_schemes_circles_from_esquemas.py',
        '--engine', engine,
        '--id', id,
        '--pos-dir', outDir,
        '--report', reportPath
    ];

    // En el script oficial, write/dry-run aplican conjuntamente a imagen + JSON.
    if (dryRun || !writeImages) {
        args.push('--dry-run');
    } else {
        args.push('--write');
    }
    if (overwrite) args.push('--force-regenerate');

    try {
        console.log(`${tag} spawn python ${args.join(' ')}`);

        const python = spawn('python', args, {
            cwd: REPO_ROOT,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (chunk) => {
            stdout += String(chunk || '');
        });
        python.stderr.on('data', (chunk) => {
            stderr += String(chunk || '');
        });

        python.on('error', (error) => {
            console.error(`${tag} spawn error:`, error);
            return res.status(500).json({
                ok: false,
                error: `No se pudo lanzar python: ${String(error?.message || error)}`
            });
        });

        python.on('close', async (code) => {
            let report = null;
            try {
                if (fs.existsSync(reportPath)) {
                    report = JSON.parse(await fs.promises.readFile(reportPath, 'utf8'));
                    await fs.promises.unlink(reportPath).catch(() => { });
                }
            } catch (error) {
                console.warn(`${tag} report parse error:`, error);
            }

            const firstRecord = report?.engine_reports?.[0]?.records?.[0] || null;
            const generatedList = Array.isArray(firstRecord?.generated) ? firstRecord.generated : [];
            const reusedList = Array.isArray(firstRecord?.reused) ? firstRecord.reused : [];
            const inferredFilename = String(generatedList[0] || reusedList[0] || '').trim();
            const inferredStatus = inferredFilename
                ? (generatedList.length > 0 ? 'generated' : 'already_exists')
                : (String(firstRecord?.status || '').startsWith('MISS_') ? 'pos_not_found' : 'error');

            const legacyReport = {
                id,
                engine,
                status: inferredStatus,
                filename: inferredFilename || null,
                reason: String(firstRecord?.reason || '').trim() || null,
                source: 'rebuild_schemes_circles_from_esquemas',
                raw: report
            };

            const ok = code === 0 && (inferredStatus === 'generated' || inferredStatus === 'already_exists');
            const statusCode = ok ? 200 : 422;
            return res.status(statusCode).json({
                ok,
                exitCode: code,
                report: legacyReport,
                stdout,
                stderr,
                error: ok ? null : `python rebuild_schemes_circles_from_esquemas.py salio con code=${code}`
            });
        });
    } catch (error) {
        console.error(`${tag} backend error:`, error);
        return res.status(500).json({ ok: false, error: String(error?.message || error || 'Error desconocido') });
    }
});

app.post('/api/apply-batch', async (req, res) => {
    const tag = '[api:apply-batch]';

    function inferEngineFromBase(baseName) {
        const match = String(baseName || '').match(/^(.+)-\d{4}-\d{2}\.[A-Za-z0-9]+$/);
        return match ? String(match[1]) : '';
    }

    function normalizePayloadItem(payload) {
        const recordId = assertString(payload?.id, { field: 'id', allowEmpty: false, maxLength: 128 });
        const base = assertString(payload?.base, { field: 'base', allowEmpty: false, maxLength: 260 });
        const engineRaw = assertString(payload?.engine ?? '', { field: 'engine', allowEmpty: true, maxLength: 64 });
        const pos = assertString(payload?.pos, { field: 'pos', allowEmpty: false, maxLength: 64 });
        const pxRaw = Array.isArray(payload?.item?.px) ? payload.item.px : null;
        if (!pxRaw || pxRaw.length !== 4) {
            throw validationError({ code: 'INVALID_PX', field: 'item.px', message: 'item.px debe ser lista de 4 valores' });
        }

        const px = pxRaw.map((value) => Math.round(Number(value)));
        if (px.some((value) => !Number.isFinite(value))) {
            throw validationError({ code: 'INVALID_PX_VALUE', field: 'item.px', message: 'item.px contiene valores no numericos' });
        }

        const engine = engineRaw || inferEngineFromBase(base);
        if (!engine) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'No se pudo inferir engine desde base' });
        }

        if (!/^[A-Za-z0-9._:-]+$/.test(recordId)) {
            throw validationError({ code: 'INVALID_ID', field: 'id', message: 'id contiene caracteres no permitidos' });
        }
        if (!/^[A-Za-z0-9._-]+$/.test(engine)) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine contiene caracteres no permitidos' });
        }
        if (!/^[A-Za-z0-9._-]+$/.test(path.basename(base))) {
            throw validationError({ code: 'INVALID_BASE', field: 'base', message: 'base contiene caracteres no permitidos' });
        }
        if (!/^[A-Za-z0-9._-]+$/.test(pos)) {
            throw validationError({ code: 'INVALID_POS', field: 'pos', message: 'pos contiene caracteres no permitidos' });
        }

        return { recordId, base: path.basename(base), engine, pos, px };
    }

    function upsertOverride(entries, item) {
        const found = entries.find((entry) =>
            String(entry?.id || '').trim() === item.recordId
            && String(entry?.base || '').trim() === item.base
            && String(entry?.pos || '').trim() === item.pos
        );
        if (found) {
            found.item = { px: item.px };
            return false;
        }
        entries.push({
            id: item.recordId,
            base: item.base,
            pos: item.pos,
            item: { px: item.px }
        });
        return true;
    }

    const overridePath = path.join(DATA_JSON_DIR, 'rebuild_schemes_circles_manual_overrides.json');

    try {
        assertPayloadSize(req.body, { maxBytes: 1024 * 1024 });
        const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : null;
        if (!itemsRaw || !itemsRaw.length) {
            throw validationError({ code: 'INVALID_ITEMS', field: 'items', message: 'items debe ser una lista no vacia' });
        }

        const items = itemsRaw.map((raw) => normalizePayloadItem(raw));

        let entries = [];
        if (fs.existsSync(overridePath)) {
            const raw = JSON.parse(await fs.promises.readFile(overridePath, 'utf8'));
            if (Array.isArray(raw)) entries = raw.filter((entry) => entry && typeof entry === 'object');
            else if (raw && typeof raw === 'object' && Array.isArray(raw.overrides)) entries = raw.overrides.filter((entry) => entry && typeof entry === 'object');
        }

        let createdCount = 0;
        items.forEach((item) => {
            const created = upsertOverride(entries, item);
            if (created) createdCount += 1;
        });

        await fs.promises.writeFile(overridePath, `${JSON.stringify(entries, null, 4)}\n`, 'utf8');
        return res.json({
            ok: true,
            count: items.length,
            created_count: createdCount,
            overrides_json: path.basename(overridePath)
        });
    } catch (error) {
        if (isValidationError(error)) {
            return sendValidationError(res, error, { endpoint: '/api/apply-batch' });
        }
        console.error(`${tag} error:`, error);
        return res.status(400).json({ ok: false, error: String(error?.message || error) });
    }
});

app.post('/api/apply-generate-batch', async (req, res) => {
    const tag = '[api:apply-generate-batch]';
    const os = require('os');

    function inferEngineFromBase(baseName) {
        const match = String(baseName || '').match(/^(.+)-\d{4}-\d{2}\.[A-Za-z0-9]+$/);
        return match ? String(match[1]) : '';
    }

    function normalizePayloadItem(payload) {
        const recordId = assertString(payload?.id, { field: 'id', allowEmpty: false, maxLength: 128 });
        const base = assertString(payload?.base, { field: 'base', allowEmpty: false, maxLength: 260 });
        const engineRaw = assertString(payload?.engine ?? '', { field: 'engine', allowEmpty: true, maxLength: 64 });
        const pos = assertString(payload?.pos, { field: 'pos', allowEmpty: false, maxLength: 64 });
        const pxRaw = Array.isArray(payload?.item?.px) ? payload.item.px : null;
        if (!pxRaw || pxRaw.length !== 4) {
            throw validationError({ code: 'INVALID_PX', field: 'item.px', message: 'item.px debe ser lista de 4 valores' });
        }

        const px = pxRaw.map((value) => Math.round(Number(value)));
        if (px.some((value) => !Number.isFinite(value))) {
            throw validationError({ code: 'INVALID_PX_VALUE', field: 'item.px', message: 'item.px contiene valores no numericos' });
        }

        const engine = engineRaw || inferEngineFromBase(base);
        if (!engine) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'No se pudo inferir engine desde base' });
        }

        if (!/^[A-Za-z0-9._:-]+$/.test(recordId)) {
            throw validationError({ code: 'INVALID_ID', field: 'id', message: 'id contiene caracteres no permitidos' });
        }
        if (!/^[A-Za-z0-9._-]+$/.test(engine)) {
            throw validationError({ code: 'INVALID_ENGINE', field: 'engine', message: 'engine contiene caracteres no permitidos' });
        }
        if (!/^[A-Za-z0-9._-]+$/.test(path.basename(base))) {
            throw validationError({ code: 'INVALID_BASE', field: 'base', message: 'base contiene caracteres no permitidos' });
        }
        if (!/^[A-Za-z0-9._-]+$/.test(pos)) {
            throw validationError({ code: 'INVALID_POS', field: 'pos', message: 'pos contiene caracteres no permitidos' });
        }

        return { recordId, base: path.basename(base), engine, pos, px };
    }

    function upsertOverride(entries, item) {
        const found = entries.find((entry) =>
            String(entry?.id || '').trim() === item.recordId
            && String(entry?.base || '').trim() === item.base
            && String(entry?.pos || '').trim() === item.pos
        );
        if (found) {
            found.item = { px: item.px };
            return false;
        }
        entries.push({
            id: item.recordId,
            base: item.base,
            pos: item.pos,
            item: { px: item.px }
        });
        return true;
    }

    const overridePath = path.join(DATA_JSON_DIR, 'rebuild_schemes_circles_manual_overrides.json');
    const pythonBin = process.env.MILU_PYTHON || 'python';

    try {
        if (!isDangerousWriteEnabled()) {
            return dangerousWriteForbidden(res, '/api/apply-generate-batch');
        }

        assertPayloadSize(req.body, { maxBytes: 1024 * 1024 });
        const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : null;
        if (!itemsRaw || !itemsRaw.length) {
            throw validationError({ code: 'INVALID_ITEMS', field: 'items', message: 'items debe ser una lista no vacia' });
        }

        const items = itemsRaw.map((raw) => normalizePayloadItem(raw));

        let entries = [];
        if (fs.existsSync(overridePath)) {
            const raw = JSON.parse(await fs.promises.readFile(overridePath, 'utf8'));
            if (Array.isArray(raw)) entries = raw.filter((entry) => entry && typeof entry === 'object');
            else if (raw && typeof raw === 'object' && Array.isArray(raw.overrides)) entries = raw.overrides.filter((entry) => entry && typeof entry === 'object');
        }

        let createdCount = 0;
        items.forEach((item) => {
            const created = upsertOverride(entries, item);
            if (created) createdCount += 1;
        });

        await fs.promises.writeFile(overridePath, `${JSON.stringify(entries, null, 4)}\n`, 'utf8');

        const imageFiles = [];
        const errors = [];

        for (const item of items) {
            const reportPath = path.join(os.tmpdir(), `milu_manual_circle_${Date.now()}_${process.pid}_${Math.random().toString(16).slice(2)}.json`);
            const args = [
                'src/server/milu-demo/python/rebuild_schemes_circles_from_esquemas.py',
                '--engine', item.engine,
                '--id', item.recordId,
                '--write',
                '--force-regenerate',
                '--overrides-json', overridePath,
                '--report', reportPath
            ];

            const runResult = await new Promise((resolve) => {
                const child = spawn(pythonBin, args, {
                    cwd: REPO_ROOT,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    windowsHide: true,
                    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
                });

                let stdout = '';
                let stderr = '';
                child.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
                child.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
                child.on('error', (error) => resolve({ ok: false, code: -1, stdout, stderr, error: String(error?.message || error) }));
                child.on('close', (code) => resolve({ ok: code === 0, code, stdout, stderr, error: null }));
            });

            const imageFile = `${path.parse(item.base).name}-${item.pos}.webp`;
            imageFiles.push(imageFile);

            if (!runResult.ok) {
                errors.push({
                    id: item.recordId,
                    pos: item.pos,
                    error: runResult.error || runResult.stderr || runResult.stdout || `python exited with ${runResult.code}`
                });
            }

            if (fs.existsSync(reportPath)) {
                await fs.promises.unlink(reportPath).catch(() => { });
            }
        }

        if (errors.length) {
            console.error(`${tag} partial errors:`, errors);
            return res.status(207).json({
                ok: false,
                error: 'Algunos registros no se pudieron generar',
                count: items.length,
                created_count: createdCount,
                image_files: imageFiles,
                overrides_json: path.basename(overridePath),
                errors
            });
        }

        return res.json({
            ok: true,
            count: items.length,
            created_count: createdCount,
            image_files: imageFiles,
            overrides_json: path.basename(overridePath)
        });
    } catch (error) {
        if (isValidationError(error)) {
            return sendValidationError(res, error, { endpoint: '/api/apply-generate-batch' });
        }
        console.error(`${tag} error:`, error);
        return res.status(400).json({ ok: false, error: String(error?.message || error) });
    }
});

// Configurar express.static con tipos MIME correctos incluyendo charset
const staticOptions = {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        }
    }
};

app.use('/src', express.static(SRC_ROOT, staticOptions));
app.use('/pdf', express.static(path.join(ASSETS_ROOT, 'pdf'), staticOptions));
app.use('/fotos_articulos', express.static(path.join(ASSETS_ROOT, 'fotos_articulos'), staticOptions));
app.use('/fotos_motores', express.static(path.join(ASSETS_ROOT, 'fotos_motores'), staticOptions));
app.use('/esquemas', express.static(path.join(ASSETS_ROOT, 'esquemas'), staticOptions));
app.use('/esquemas_pos_circulos', express.static(path.join(ASSETS_ROOT, 'esquemas_pos_circulos'), staticOptions));
app.use('/tools', express.static(TOOLS_ROOT, staticOptions));
app.use(express.static(REPO_ROOT, staticOptions));

app.get('/favicon.svg', (_req, res) => {
    res.sendFile(path.join(ASSETS_ROOT, 'icons', 'favicon.svg'));
});

app.get([
    '/analista_02.html',
    '/analytics_dashboard.html',
    '/analytics_engine_detail.html',
    '/analytics_export.html',
    '/analytics_images.html',
    '/analytics_pn.html',
    '/analytics_pn_detail.html',
    '/analytics_qa.html',
    '/analytics_search.html',
    '/auto_depuracion.html',
    '/export_wordpress.html',
    '/exportacion.html',
    '/import_pdf.html',
    '/index.html',
    '/milu_shell.html',
    '/qa_analista_registro.html',
    '/qa_auditoria.html',
    '/qa_imagenes.html',
    '/qa_lista_agrupada.html',
    '/qa_milu.html',
    '/recompute_simple.html'
], (req, res) => {
    const target = `/src/client/milu-demo/pages${req.path}`;
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(`${target}${query}`);
});

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
    const filePath = resolveRuntimePath(file);
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
        const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
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
    let payload;
    try {
        payload = validateSaveJsonPayload(req.body);
        if (!ENGINE_JSON_FILES.includes(payload.file)) {
            throw validationError({ code: 'FILE_NOT_ALLOWED', field: 'file', message: 'Archivo no permitido' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/save-json' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    const filePath = getEngineJsonPath(path.basename(payload.file));
    try {
        await withSaveJsonFileLock(payload.file, async () => {
            const data = await fs.promises.readFile(filePath, 'utf8');
            let json;
            try {
                json = JSON.parse(data);
            } catch (_parseError) {
                const parseError = new Error('JSON invÃƒÆ’Ã‚Â¡lido');
                parseError.status = 500;
                throw parseError;
            }
            const row = json.find(r => String(r.ID) === String(payload.id));
            if (!row) {
                const notFoundError = new Error('Registro no encontrado');
                notFoundError.status = 404;
                throw notFoundError;
            }
            setWriteField(row, payload.field, payload.value);
            stripLegacyQaFields(json);
            await writeJsonAtomic(filePath, json);
            pnReviewQaCacheService.invalidate();
        });
        return res.json({ ok: true });
    } catch (error) {
        console.error('[save-json] Error guardando', error);
        const status = Number(error?.status || 500);
        if (error?.message === 'JSON invÃƒÆ’Ã‚Â¡lido' || error?.message === 'Registro no encontrado') {
            return res.status(status).json({ error: error.message });
        }
        return res.status(500).json({ error: 'No se pudo guardar el archivo' });
    }
}

async function handleDeleteJson(req, res) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const file = String(body.file || '').trim();
    const id = String(body.id || '').trim();

    try {
        if (!file) {
            throw validationError({ code: 'INVALID_FILE', field: 'file', message: 'file es obligatorio' });
        }
        if (!id) {
            throw validationError({ code: 'INVALID_ID', field: 'id', message: 'id es obligatorio' });
        }
        if (!ENGINE_JSON_FILES.includes(file)) {
            throw validationError({ code: 'FILE_NOT_ALLOWED', field: 'file', message: 'Archivo no permitido' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/delete-json' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    const filePath = resolveRuntimePath(file);
    try {
        let remaining = 0;
        await withSaveJsonFileLock(file, async () => {
            const data = await fs.promises.readFile(filePath, 'utf8');
            let json;
            try {
                json = JSON.parse(data);
            } catch (_parseError) {
                const parseError = new Error('JSON invÃƒÆ’Ã‚Â¡lido');
                parseError.status = 500;
                throw parseError;
            }
            if (!Array.isArray(json)) {
                const parseError = new Error('JSON invÃƒÆ’Ã‚Â¡lido');
                parseError.status = 500;
                throw parseError;
            }
            const index = json.findIndex((row) => String(row?.ID) === String(id));
            if (index < 0) {
                const notFoundError = new Error('Registro no encontrado');
                notFoundError.status = 404;
                throw notFoundError;
            }
            json.splice(index, 1);
            remaining = json.length;
            stripLegacyQaFields(json);
            await writeJsonAtomic(filePath, json);
            pnReviewQaCacheService.invalidate();
        });
        return res.json({ ok: true, deleted: true, file, id, remaining });
    } catch (error) {
        console.error('[delete-json] Error borrando', error);
        const status = Number(error?.status || 500);
        if (error?.message === 'JSON invÃƒÆ’Ã‚Â¡lido' || error?.message === 'Registro no encontrado') {
            return res.status(status).json({ error: error.message });
        }
        return res.status(500).json({ error: 'No se pudo borrar el registro' });
    }
}

// Ruta para guardar cambios en un archivo JSON.
app.post('/save-json', handleSaveJson);
app.post('/save-json.php', handleSaveJson);
app.post('/delete-json', handleDeleteJson);
app.post('/delete-json.php', handleDeleteJson);

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
// Record Editor: actualizaciÃƒÆ’Ã‚Â³n segura de mÃƒÆ’Ã‚Âºltiples campos en un solo registro.
// Payload: { engine, id, changes: { field: value, ... } }
// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

const RECORD_EDITOR_BLOCKED_FIELDS = new Set([
    'id',
    'ID',
    'engine_model',
    'source_json_file',
    'raw_json',
    'total_error',
    'has_error',
    'qa_errors',
    'qa_errors_active',
    'exp_imagenes',
    'esquema',
    'esquema_pos',
]);

function isBlockedRecordEditorField(name) {
    const raw = String(name == null ? '' : name).trim();
    if (!raw) return true;
    if (RECORD_EDITOR_BLOCKED_FIELDS.has(raw)) return true;
    if (/_error$/i.test(raw)) return true;
    if (/^qa_revision_/i.test(raw)) return true;
    if (/^(has_img|en_web|fotos_|esquemas_)/i.test(raw)) return true;
    return false;
}

async function handleRecordEditorUpdateRecord(req, res) {
    const payload = req.body || {};

    let engineRaw, idRaw, changesRaw;

    try {
        assertPlainObject(payload, 'payload');
        assertPayloadSize(payload, 32768, 'payload');

        engineRaw = assertString(payload.engine ?? '', { field: 'engine', allowEmpty: true, maxLength: 128 });
        idRaw = assertString(payload.id ?? '', { field: 'id', allowEmpty: true, maxLength: 128 });

        if (!engineRaw) {
            throw validationError({ code: 'MISSING_FIELD', field: 'engine', message: 'engine es requerido' });
        }
        if (!idRaw) {
            throw validationError({ code: 'MISSING_FIELD', field: 'id', message: 'id es requerido' });
        }

        changesRaw = payload.changes;
        if (!changesRaw || typeof changesRaw !== 'object' || Array.isArray(changesRaw)) {
            throw validationError({ code: 'MISSING_FIELD', field: 'changes', message: 'changes debe ser un objeto' });
        }
    } catch (error) {
        return isValidationError(error)
            ? sendValidationError(res, error, { endpoint: '/api/record-editor/update-record' })
            : res.status(400).json({ ok: false, error: String(error?.message || error) });
    }

    // Resolver nombre del archivo engine
    const engineFile = (() => {
        const direct = String(engineRaw || '').trim();

        if (ENGINE_JSON_FILES.includes(direct)) return direct;

        const normalized = direct
            .replace(/^book_preview_/i, '')
            .replace(/^preview_/i, '')
            .replace(/^engine_/i, '')
            .replace(/\.json$/i, '')
            .trim();

        const withPrefix = `engine_${normalized}.json`;

        if (ENGINE_JSON_FILES.includes(withPrefix)) return withPrefix;

        const withPrefixLower = withPrefix.toLowerCase();

        return ENGINE_JSON_FILES.find((file) => {
            return String(file).toLowerCase() === withPrefixLower;
        }) || null;
    })();

    if (!engineFile) {
        return res.status(400).json({
            ok: false,
            error: `Motor no permitido: ${engineRaw}. Valores permitidos: ${ENGINE_JSON_FILES.join(', ')}`
        });
    }

    // Validar campos del changes
    const blockedFields = [];
    const notAllowedFields = [];

    for (const fieldName of Object.keys(changesRaw)) {
        if (isBlockedRecordEditorField(fieldName)) {
            blockedFields.push(fieldName);
        } else if (!isAllowedSaveJsonField(fieldName)) {
            notAllowedFields.push(fieldName);
        }
    }

    if (blockedFields.length > 0) {
        return res.status(400).json({
            ok: false,
            error: `Campos bloqueados no editables: ${blockedFields.join(', ')}`
        });
    }

    if (notAllowedFields.length > 0) {
        return res.status(400).json({
            ok: false,
            error: `Campos no permitidos en whitelist: ${notAllowedFields.join(', ')}`
        });
    }

    const filePath = resolveRuntimePath(engineFile);

    try {
        let updatedFields = [];
        let notFoundId = false;

        await withSaveJsonFileLock(engineFile, async () => {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            let json;
            try {
                json = JSON.parse(raw);
            } catch (_parseError) {
                throw Object.assign(new Error('JSON invÃƒÆ’Ã‚Â¡lido'), { status: 500 });
            }

            if (!Array.isArray(json)) {
                throw Object.assign(new Error('Formato inesperado: se esperaba array'), { status: 500 });
            }

            const rowIndex = json.findIndex((r) => idsEquivalent(r?.ID, idRaw));
            if (rowIndex < 0) {
                notFoundId = true;
                return;
            }

            const row = json[rowIndex];
            const changes = [];

            for (const [fieldName, newValue] of Object.entries(changesRaw)) {
                const canonical = canonicalFieldName(fieldName);
                if (!canonical) continue;

                const oldValue = String(row[canonical] == null ? '' : row[canonical]);
                const normalizedNew = String(newValue == null ? '' : newValue);

                if (oldValue === normalizedNew) continue;

                changes.push({ field: canonical, oldValue, newValue: normalizedNew });
                setWriteField(row, canonical, normalizedNew);
            }

            if (changes.length === 0) {
                updatedFields = [];
                return;
            }

            // Backup antes de escribir
            const backupPath = `${filePath}.backup.${Date.now()}`;
            await fs.promises.copyFile(filePath, backupPath);

            stripLegacyQaFields(json);
            await writeJsonAtomic(filePath, json);
            pnReviewQaCacheService.invalidate();

            updatedFields = changes;
        });

        if (notFoundId) {
            return res.status(404).json({
                ok: false,
                error: `Registro no encontrado con ID ${idRaw} en ${engineFile}`
            });
        }

        console.info(
            `[record-editor] file=${engineFile} id=${idRaw} fields=${updatedFields.length}`,
            updatedFields.map((c) => c.field)
        );

        return res.json({
            ok: true,
            engine: engineFile,
            id: idRaw,
            updatedCount: updatedFields.length,
            updatedFields
        });

    } catch (error) {
        console.error('[record-editor] Error guardando', error);
        const status = Number(error?.status || 500);
        return res.status(status).json({
            ok: false,
            error: String(error?.message || 'No se pudo guardar el archivo')
        });
    }
}

app.post('/copy-pdf-to-pdf', async (req, res) => {
    const payload = req.body;

    try {
        assertNonEmptyObject(payload, 'payload');
        assertPayloadSize(payload, 32768, 'payload');

        const file = assertString(payload.file, { field: 'file', maxLength: 128 });
        const id = assertString(payload.id, { field: 'id', maxLength: 128 });
        const clearPdfBeforeCopy = payload.clearPdfBeforeCopy === true || payload.clearPdfBeforeCopy === 'true';
        const rawValues = payload.valuesToCopy;
        if (!rawValues || typeof rawValues !== 'object' || Array.isArray(rawValues)) {
            throw validationError({ code: 'INVALID_VALUES', field: 'valuesToCopy', message: 'valuesToCopy debe ser un objeto' });
        }
        if (!ENGINE_JSON_FILES.includes(file)) {
            throw validationError({ code: 'FILE_NOT_ALLOWED', field: 'file', message: 'Archivo no permitido' });
        }

        const filePath = resolveRuntimePath(file);
        const changedFields = [];

        await withSaveJsonFileLock(file, async () => {
            const data = await fs.promises.readFile(filePath, 'utf8');
            let json;
            try {
                json = JSON.parse(data);
            } catch (_) {
                const e = new Error('JSON invalido');
                e.status = 500;
                throw e;
            }

            const row = json.find(r => String(r.ID) === String(id));
            if (!row) {
                const e = new Error('Registro no encontrado');
                e.status = 404;
                throw e;
            }

            const normalizedValues = {};
            for (const [rawField, value] of Object.entries(rawValues)) {
                const field = canonicalFieldName(rawField);
                if (!field || !isAllowedSaveJsonField(field)) continue;
                const normalized = normalizeEditableFieldValue(field, value);
                if (normalized === undefined || normalized === null) continue;
                normalizedValues[field] = normalized;
            }

            const appliedFields = applyCanonicalPdfCopyToRow(row, {
                valuesToCopy: normalizedValues,
                clearPdfBeforeCopy
            });
            changedFields.push(...appliedFields);

            console.log(
                `[pdf-copy] fn=applyCanonicalPdfCopyToRow caller=endpoint endpoint=/copy-pdf-to-pdf file=${file} book=${String(row?.engine_model || '').trim() || '-'} id=${id} changedFields=${appliedFields.length}`
            );

            stripLegacyQaFields(json);
            await writeJsonAtomic(filePath, json);
            pnReviewQaCacheService.invalidate();
        });

        return res.json({ ok: true, changedFields });
    } catch (error) {
        if (isValidationError(error)) {
            return sendValidationError(res, error, { endpoint: '/copy-pdf-to-pdf' });
        }
        console.error('[copy-pdf-to-pdf] Error:', error);
        const status = Number(error?.status || 500);
        return res.status(status).json({ ok: false, error: String(error?.message || error) });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
