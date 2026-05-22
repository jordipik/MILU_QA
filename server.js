// Simple Express backend para guardar cambios en archivos JSON
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ENGINE_JSON_FILES } = require('./engine_files');
const { recomputeEngineErrors, recomputeAllEngineErrors } = require('./recompute_engine_errors');
const { runVisualCopyComparison, applyCanonicalPdfCopyToRow } = require('./scripts/qa_pdf_visual_copy');
const { runPdfVisualCopyBatch } = require('./server/services/pdf-copy-batch');
const { createRevisionSyncService } = require('./server/services/revision-sync');
const { createRevisionApplyService } = require('./server/services/revision-apply');
const { createPnReviewQaCacheService } = require('./server/services/pn-review-qa-cache');
const { buildQaSummary: buildQaSummaryFromExport, decideByQa } = require('./scripts/export_wordpress_milu');
const {
    sendValidationError,
    validationError,
    isValidationError
} = require('./server/validation/payload-errors');
const {
    assertNonEmptyObject,
    assertPayloadSize,
    assertPlainObject,
    assertString,
    assertBooleanLike
} = require('./server/validation/validators');
const {
    isAllowedSaveJsonField,
    canonicalFieldName,
    normalizeEditableFieldValue,
} = require('./server/validation/allowed-fields');
const { setField: setWriteField } = require('./js/write-field-helper');
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
} = require('./server/validation/qa-validation');

const app = express();
const PORT = 3000;
const AUDIT_LOG_FILE = path.join(__dirname, 'qa_audit_log.json');
const AUDIT_LOG_MAX_ENTRIES = 10000;
const WORDPRESS_OUTPUT_DIR = path.join(__dirname, 'data', 'output', 'wordpress');

const pnReviewQaCacheService = createPnReviewQaCacheService({
    repoRoot: __dirname,
    buildQaSummaryFromExport,
    decideByQa,
    engineJsonFiles: ENGINE_JSON_FILES
});

const revisionSyncService = createRevisionSyncService(path.join(__dirname, 'qa_revision_server_data.json'));
const revisionApplyService = createRevisionApplyService({
    repoRoot: __dirname,
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
                rootDir: __dirname
            })
            : recomputeEngineErrors({
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

// LEGACY: mantiene compatibilidad con el flujo historico basado en Python.
app.post('/calculate-final-fields', async (req, res) => {
    try {
        // Ejecutar el script Python copy_gesa_fields_to_final.py
        const python = spawn('python', ['copy_gesa_fields_to_final.py'], {
            cwd: __dirname,
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

// ── Aplica book_preview_*.json a engine_*.json mediante el script Python oficial ──
// Reemplaza el flujo del boton "1. Importar de PDF" del modal de recalculo.
// Ejecuta:
//   - apply_book_preview_to_engine.py --book-preview ... --engine ... --write --overwrite  (si engine)
//   - apply_all_book_previews.py --write --overwrite                                       (si todos)
app.post('/api/pdf-preview/apply-to-engine', async (req, res) => {
    const tag = '[apply_book_preview_to_engine]';
    try {
        const path = require('path');
        const fs = require('fs');
        const os = require('os');
        const engineRaw = typeof req.body?.engine === 'string' ? req.body.engine.trim() : '';
        const previewsDir = 'json_originales';

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
            if (!fs.existsSync(path.join(__dirname, previewFile))) {
                return res.status(404).json({ ok: false, error: `No existe book preview: ${previewFile}` });
            }
        }

        const script = engineRaw ? 'apply_book_preview_to_engine.py' : 'apply_all_book_previews.py';
        const reportPath = path.join(os.tmpdir(), `milu_apply_book_preview_report_${Date.now()}_${process.pid}.json`);
        const args = engineRaw
            ? [script, '--book-preview', previewFile, '--engine', engineFile, '--write', '--overwrite', '--report', reportPath]
            : [script, '--write', '--overwrite', '--report', reportPath];

        console.log(`${tag} script=${script} engine=${engineFile || '(all)'} preview=${previewFile || '(all)'}`);
        console.log(`${tag} spawn python ${args.join(' ')}`);

        const python = spawn('python', args, {
            cwd: __dirname,
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
            } catch (reportError) {
                console.warn(`${tag} report parse error:`, reportError);
            }
            // Parseo del informe del script unitario (apply_book_preview_to_engine.py).
            const num = (re) => {
                const m = out.match(re);
                return m ? Number(m[1]) : 0;
            };
            const stats = {
                preview_pages: num(/P[áa]ginas en preview\s*:\s*(\d+)/i),
                preview_rows: num(/Filas en preview\s*:\s*(\d+)/i),
                matched_unique: num(/Match [úu]nico\s*:\s*(\d+)/i),
                matched_tiebreak_pn: num(/Match desempate por PN\s*:\s*(\d+)/i),
                ambiguous: num(/Ambiguos[^:]*:\s*(\d+)/i),
                not_found: num(/No encontrados\s*:\s*(\d+)/i),
                rows_changed: num(/Filas con cambios\s*:\s*(\d+)/i),
                fields_changed: num(/Campos modificados\s*:\s*(\d+)/i),
                fields_skipped_nonempty: num(/Campos no vac[íi]os saltados\s*:\s*(\d+)/i)
            };
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

app.post('/recalculate-revision-status', async (req, res) => {
    try {
        let totalRecords = 0;
        let changedRecords = 0;

        // Recalcular estado/acción para todos los libros
        for (const engineFile of ENGINE_JSON_FILES) {
            const filePath = path.join(__dirname, engineFile);

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
                    rootDir: __dirname
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

app.post('/recompute-pdf-auto', async (req, res) => {
    return res.status(410).json({
        ok: false,
        legacy: true,
        error: 'Endpoint legacy desactivado. Use /recompute-pdf-auto-visual.'
    });
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
            const filePath = path.join(__dirname, targetFile);
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

        const perFile = [];
        let grandRecords = 0;
        let grandFields = 0;

        for (const fileName of targetFiles) {
            const filePath = path.join(__dirname, fileName);
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

            for (const record of data) {
                if (!record || typeof record !== 'object') continue;
                let touched = 0;
                for (const key of Object.keys(record)) {
                    if (!suffixes.some((suf) => key.endsWith(suf))) continue;
                    if (exclude.has(key)) continue;
                    if (record[key] !== '') touched += 1;
                    record[key] = '';
                }
                if (touched > 0) {
                    records += 1;
                    fields += touched;
                }
            }

            if (!dryRun && fields > 0) {
                await writeJsonAtomic(filePath, data);
            }

            grandRecords += records;
            grandFields += fields;
            perFile.push({ file: fileName, records, fields });
        }

        return res.json({
            ok: true,
            result: {
                dryRun,
                suffixes,
                exclude: Array.from(exclude),
                summary: { totalRecords: grandRecords, totalFields: grandFields },
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
        const data = pnReviewQaCacheService.load();
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

        pnReviewQaCacheService.invalidate();

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
        const filePath = path.join(__dirname, file);

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

app.use(express.static(__dirname, staticOptions));

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

    const filePath = path.join(__dirname, payload.file);
    try {
        await withSaveJsonFileLock(payload.file, async () => {
            const data = await fs.promises.readFile(filePath, 'utf8');
            let json;
            try {
                json = JSON.parse(data);
            } catch (_parseError) {
                const parseError = new Error('JSON inválido');
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
        if (error?.message === 'JSON inválido' || error?.message === 'Registro no encontrado') {
            return res.status(status).json({ error: error.message });
        }
        return res.status(500).json({ error: 'No se pudo guardar el archivo' });
    }
}

// Ruta para guardar cambios en un archivo JSON.
app.post('/save-json', handleSaveJson);
app.post('/save-json.php', handleSaveJson);

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

        const filePath = path.join(__dirname, file);
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

app.post('/apply-qa-checks-filter', async (req, res) => {
    return legacyQaPipelineDisabled(res);
});

app.listen(PORT, () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
