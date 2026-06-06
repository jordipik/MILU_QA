const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');
const { getExportField, getExportType, isExportable } = require('../js/export-field-helper');
const { runUpdateFgFgs } = require('./update_fg_fgs_fields');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'data', '05-wordpress');
const AUDIT_OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'output', 'wordpress');
const FG_FGS_CATALOG_PATH = path.join(REPO_ROOT, 'EXCEL_FG-FGS.json');
const OLD_RELATION_SLOT_COUNT = 18;
const WP_UPLOADS_BASE = 'https://milu-naval.mystagingwebsite.com/wp-content/uploads';
const WP_PHOTOS_FIXED_BASE = '/srv/htdocs/wp-content/uploads/2026/fotos';
const WP_PRODUCT_OLD_BASE = 'https://milu-naval.com/producto/';
const POS_MODELS = [
    '12V4000M40A',
    '12V4000M53',
    '12V4000M70',
    '16V4000M61',
    '16V4000M73L',
    '16V4000M73',
    '16V4000M90',
    '20V4000M93L',
    '20V4000M93'
];
const IMAGE_FILE_RE = /\.(?:webp|png|jpe?g|gif)$/i;

function buildOldRelationHeaders() {
    const headers = [];
    for (let i = 1; i <= OLD_RELATION_SLOT_COUNT; i += 1) {
        const suffix = String(i).padStart(2, '0');
        headers.push(`old_number_${suffix}`);
        headers.push(`old_ruta_${suffix}`);
    }
    return headers;
}

const OLD_RELATION_HEADERS = buildOldRelationHeaders();

const NEW_V506_HEADERS = [
    'Id',
    'fecha_version',
    'POS',
    'designation',
    'engine',
    'model_type',
    'type',
    'pn',
    'nsn',
    'GESA_NORM',
    'GESA_NORMALIZADO',
    'fg_code',
    'fg_description',
    'fg_code_description',
    'weight',
    'weight_txt',
    'measurement',
    'TIPOARTICULO',
    'PAG',
    'BOM_no',
    'esquema_general',
    'exp_motor',
    'exp_categorias',
    'atributo',
    'SUST_TIPO',
    'new_pn_relacionado',
    'old_pn_relacionados',
    ...OLD_RELATION_HEADERS,
    'EN_EXCEL_SUSTITUCION',
    'ruta_foto',
    'exp_imagenes'
];

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

function buildFgFgsCatalogIndex() {
    const rows = readJson(FG_FGS_CATALOG_PATH, []);
    if (!Array.isArray(rows)) return new Map();

    const index = new Map();
    for (const row of rows) {
        const code = normalizeFgCode(row?.code);
        const model = t(row?.model).toUpperCase();
        const description = collapseSpaces(row?.description);
        if (!code || !model || !description) continue;
        index.set(`${model}::${code}`, description);
    }
    return index;
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function removeIfExists(filePath) {
    try {
        fs.unlinkSync(filePath);
    } catch (_) {
        // Ignore missing legacy aliases.
    }
}

function writeCsv(filePath, rows, headers) {
    const escapeCell = (value) => {
        const text = String(value == null ? '' : value);
        if (text.includes('"') || text.includes(';') || text.includes('\n') || text.includes('\r')) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    };

    const lines = [headers.join(';')];
    for (const row of rows) {
        lines.push(headers.map((h) => escapeCell(row[h])).join(';'));
    }
    fs.writeFileSync(filePath, `\uFEFF${lines.join('\n')}\n`, 'utf8');
}

function t(value) {
    return String(value == null ? '' : value).trim();
}

function key(value) {
    return t(value).toLowerCase();
}

function collapseSpaces(value) {
    return t(value).replace(/\s+/g, ' ');
}

function normalizeAssetBasename(value) {
    return path.basename(String(value || '').split('?')[0].split('#')[0]).trim().toLowerCase();
}

function uniq(values) {
    return [...new Set(values.filter(Boolean))];
}

function splitCommaList(value) {
    return value
        .split(',')
        .map((item) => collapseSpaces(item))
        .filter(Boolean);
}

function normalizeOldRouteValue(value) {
    const token = collapseSpaces(value);
    if (!token) return '';
    const slug = token.replace(/\//g, '-');
    return `${WP_PRODUCT_OLD_BASE}${slug}`;
}

function normalizeProductSlug(value) {
    const token = collapseSpaces(value);
    if (!token) return '';
    return token.replace(/\//g, '-');
}

function buildProductVinculo(value) {
    const slug = normalizeProductSlug(value);
    if (!slug) return '';
    return `milu-naval.mystagingwebsite.com/producto/${slug}`;
}

function inferModelFromText(rawValue) {
    const text = t(rawValue).toUpperCase();
    if (!text) return '';

    for (const model of POS_MODELS) {
        if (text.includes(model)) return model;
    }

    const shortTokens = text.match(/\b\d+VM\d+[A-Z]?\b/g) || [];
    for (const token of shortTokens) {
        const mapped = token.replace(/^([0-9]+)VM(\d+[A-Z]?)$/i, '$1V4000M$2');
        if (POS_MODELS.includes(mapped)) return mapped;
    }

    return '';
}

function inferModelFromAssetFilename(rawValue) {
    const fileName = path.basename(String(rawValue || '').split('?')[0].split('#')[0]).toUpperCase();
    if (!fileName) return '';
    for (const model of POS_MODELS) {
        if (fileName.startsWith(`${model}-`) || fileName.startsWith(`${model}_`)) return model;
    }
    return '';
}

function inferModelFromContext(context = {}) {
    const candidates = [
        context.engine_model,
        context.exp_motor,
        context.model_type,
        context.__engine_file,
        context.engine
    ];
    for (const candidate of candidates) {
        const model = inferModelFromText(candidate);
        if (model) return model;
    }
    return '';
}

function isMonthlyUploadsUrl(value) {
    return /\/wp-content\/uploads\/2026\/(?:01|02)\//i.test(value);
}

function isPosFolderUrl(value) {
    return POS_MODELS.some((model) => value.includes(`/wp-content/uploads/${model}-POS/`));
}

function buildModelWarning(input, context, code = 'URL_MODEL_NOT_FOUND') {
    return {
        code,
        input: t(input),
        context_engine_model: t(context?.engine_model),
        context_exp_motor: t(context?.exp_motor),
        context_model_type: t(context?.model_type),
        context_engine_file: t(context?.__engine_file)
    };
}

function buildSinImagenUrl(context = {}) {
    void context;
    return `${WP_UPLOADS_BASE}/sin_imagen.jpeg`;
}

function normalizeWordPressAssetUrl(url, context = {}) {
    const original = t(url);
    if (!original) {
        return { value: '', warning: null };
    }

    if (original.toLowerCase().includes('sin_imagen.jpeg')) {
        return { value: buildSinImagenUrl(context), warning: null };
    }

    if (isPosFolderUrl(original)) {
        return { value: original, warning: null };
    }

    const basename = path.basename(original.split('?')[0].split('#')[0]);
    if (!basename) {
        return { value: original, warning: null };
    }

    const modelFromName = inferModelFromAssetFilename(basename);
    const modelFromContext = inferModelFromContext(context);
    const model = modelFromName || modelFromContext;

    const isMonthly = isMonthlyUploadsUrl(original);
    const isFilenameOnly = !/^https?:\/\//i.test(original) && !original.includes('/');
    const looksLikeAsset = IMAGE_FILE_RE.test(basename);

    if (isMonthly || (isFilenameOnly && looksLikeAsset)) {
        if (!model) {
            return { value: original, warning: buildModelWarning(original, context) };
        }
        return {
            value: `${WP_UPLOADS_BASE}/${model}-POS/${basename}`,
            warning: null
        };
    }

    return { value: original, warning: null };
}

function normalizeWordPressAssetList(value, context = {}) {
    const warnings = [];
    const tokens = splitCsvValues(value);
    if (tokens.length === 0) {
        const one = normalizeWordPressAssetUrl(value, context);
        if (one.warning) warnings.push(one.warning);
        return { value: one.value, warnings };
    }

    const out = [];
    const seen = new Set();
    for (const token of tokens) {
        const normalized = normalizeWordPressAssetUrl(token, context);
        if (normalized.warning) warnings.push(normalized.warning);
        const next = t(normalized.value);
        if (!next) continue;
        const tokenKey = key(next);
        if (seen.has(tokenKey)) continue;
        seen.add(tokenKey);
        out.push(next);
    }

    return { value: out.join(', '), warnings };
}

function splitAssetList(value) {
    return String(value == null ? '' : value)
        .split(/[|,;]+/)
        .map((item) => collapseSpaces(item))
        .filter(Boolean);
}

function buildWordPressAssetUrlFromFilename(filename, context = {}, options = {}) {
    const original = collapseSpaces(filename);
    const assetType = t(options.assetType || 'pos').toLowerCase();
    if (!original) {
        return { value: '', warning: null };
    }

    const basename = path.basename(original.split('?')[0].split('#')[0]);
    if (!basename) {
        return { value: '', warning: null };
    }

    if (assetType === 'photo') {
        return {
            value: `${WP_PHOTOS_FIXED_BASE}/${basename}`,
            warning: null
        };
    }

    if (/^https?:\/\//i.test(original)) {
        return normalizeWordPressAssetUrl(original, context);
    }

    const model = inferModelFromAssetFilename(basename) || inferModelFromContext(context);
    if (!model) {
        return { value: basename, warning: buildModelWarning(basename, context) };
    }

    return {
        value: `${WP_UPLOADS_BASE}/${model}-POS/${basename}`,
        warning: null
    };
}

function buildExpImagenesFromBaseAssets(groupRows, principalRow) {
    const rows = Array.isArray(groupRows) ? groupRows : [];
    const warnings = [];
    const context = {
        engine_model: pickMostFrequent(rows.map((row) => row?.engine_model)) || t(principalRow?.engine_model),
        exp_motor: pickMostFrequent(rows.map((row) => row?.exp_motor)) || t(principalRow?.exp_motor),
        model_type: pickMostFrequent(rows.map((row) => row?.model_type_final)) || t(principalRow?.model_type_final),
        __engine_file: pickMostFrequent(rows.map((row) => row?.__engine_file)) || t(principalRow?.__engine_file),
        engine: pickMostFrequent(rows.map((row) => row?.engine)) || t(principalRow?.engine)
    };

    const buckets = {
        filename_foto: [],
        esquemas_circulos: [],
        esquemas: []
    };

    for (const row of rows) {
        buckets.filename_foto.push(...splitAssetList(row?.filename_foto));
        buckets.esquemas_circulos.push(...splitAssetList(row?.esquemas_circulos));
        buckets.esquemas.push(...splitAssetList(row?.esquemas));
    }

    const appendNormalized = (collector, sourceList, assetType = 'pos') => {
        for (const candidate of sourceList) {
            const normalized = buildWordPressAssetUrlFromFilename(candidate, context, { assetType });
            if (normalized.warning) warnings.push(normalized.warning);
            if (!t(normalized.value)) continue;
            collector.push(normalized.value);
        }
    };

    const deduped = [];
    const seenBase = new Set();
    const appendUnique = (sourceList, assetType = 'pos') => {
        const normalizedList = [];
        appendNormalized(normalizedList, sourceList, assetType);
        for (const item of normalizedList) {
            const basename = normalizeAssetBasename(item);
            const dedupeKey = basename || key(item);
            if (!dedupeKey) continue;
            if (seenBase.has(dedupeKey)) continue;
            seenBase.add(dedupeKey);
            deduped.push(item);
        }
    };

    // Official priority for exp_imagenes:
    // 1) filename_foto, 2) esquemas_circulos,
    // 3) esquemas only if nothing was selected yet,
    // 4) sin_imagen.jpeg only if still empty.
    appendUnique(buckets.filename_foto, 'photo');
    appendUnique(buckets.esquemas_circulos, 'pos');
    if (deduped.length === 0) {
        appendUnique(buckets.esquemas, 'pos');
    }
    if (deduped.length === 0) {
        deduped.push(buildSinImagenUrl(context));
    }

    deduped.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }));
    const capped = deduped.slice(0, 10);

    return {
        value: capped.length > 0 ? capped.join(', ') : buildSinImagenUrl(context),
        warnings
    };
}

function buildOldPnFields(rowOrGroup) {
    const sourceRows = Array.isArray(rowOrGroup)
        ? rowOrGroup
        : Array.isArray(rowOrGroup?.sourceRows)
            ? rowOrGroup.sourceRows
            : rowOrGroup && typeof rowOrGroup === 'object'
                ? [rowOrGroup]
                : [];

    const consolidatedRows = Array.isArray(rowOrGroup?.consolidatedRows)
        ? rowOrGroup.consolidatedRows
        : sourceRows;

    const candidates = [];
    const seen = new Set();

    const pushToken = (raw) => {
        const token = collapseSpaces(raw);
        if (!token) return;
        const tokenKey = key(token);
        if (seen.has(tokenKey)) return;
        seen.add(tokenKey);
        candidates.push(token);
    };

    const pushList = (raw) => {
        for (const token of splitCsvValues(raw)) {
            pushToken(token);
        }
    };

    pushList(rowOrGroup?.old_pn_relacionados);
    pushList(rowOrGroup?.supersededList);
    pushList(rowOrGroup?.subst_pnlist_final);

    for (const row of sourceRows) {
        pushList(row?.old_pn_relacionados);
        pushList(row?.subst_pnlist_final);
    }

    for (const row of consolidatedRows) {
        pushList(row?.old_pn_relacionados);
        pushList(row?.subst_pnlist_final);
    }

    const limited = candidates.slice(0, OLD_RELATION_SLOT_COUNT);
    const fields = {};
    for (let i = 1; i <= OLD_RELATION_SLOT_COUNT; i += 1) {
        const suffix = String(i).padStart(2, '0');
        const value = limited[i - 1] || '';
        fields[`old_number_${suffix}`] = value;
        fields[`old_ruta_${suffix}`] = value ? normalizeOldRouteValue(value) : '';
    }
    return fields;
}

function pickMostFrequent(values) {
    const counts = new Map();
    let bestKey = '';
    let bestValue = '';
    let bestCount = 0;
    for (const raw of values) {
        const value = collapseSpaces(raw);
        if (!value) continue;
        const k = key(value);
        const current = counts.get(k) || { count: 0, value };
        current.count += 1;
        if (value.length > current.value.length) current.value = value;
        counts.set(k, current);
        if (
            current.count > bestCount
            || (current.count === bestCount && current.value.length > bestValue.length)
        ) {
            bestCount = current.count;
            bestValue = current.value;
            bestKey = k;
        }
    }
    return bestKey ? bestValue : '';
}

function splitCsvValues(value) {
    return String(value == null ? '' : value)
        .split(',')
        .map((item) => collapseSpaces(item))
        .filter(Boolean);
}

function joinUnique(values) {
    return uniq(values.filter(Boolean)).join(', ');
}

function joinUniqueSorted(values, maxItems = 0) {
    const seen = new Set();
    const uniqueValues = [];
    for (const raw of values) {
        const value = collapseSpaces(raw);
        if (!value) continue;
        const valueKey = key(value);
        if (seen.has(valueKey)) continue;
        seen.add(valueKey);
        uniqueValues.push(value);
    }

    uniqueValues.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }));
    const sliced = maxItems > 0 ? uniqueValues.slice(0, maxItems) : uniqueValues;
    return sliced.join(', ');
}

function splitMultiValues(value) {
    return String(value == null ? '' : value)
        .split(/[|,;]+/)
        .map((item) => collapseSpaces(item))
        .filter(Boolean);
}

function formatExportTimestamp(date = new Date()) {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}.${hour}${minute}`;
}

function normalizeLibroPag(row) {
    const libroPag = collapseSpaces(row?.libro_pag);
    if (libroPag) return libroPag;

    const engine = getEngineName(row);
    const pageCandidate = collapseSpaces(row?.['Source Page']);
    if (!engine || !pageCandidate) return '';

    const numericPage = String(pageCandidate).match(/\d+/)?.[0] || '';
    if (!numericPage) return '';
    return `${engine}-${numericPage.padStart(4, '0')}`;
}

function normalizeFgCode(rawValue) {
    const text = t(rawValue);
    if (!text) return '';
    const firstChunk = text.split('-')[0].trim();
    const digits = firstChunk.replace(/\D/g, '');
    if (!digits) return firstChunk;
    const asNumber = Number.parseInt(digits, 10);
    return Number.isFinite(asNumber) ? String(asNumber) : digits;
}

function normalizeModelTypeShort(rawValue) {
    const text = t(rawValue);
    if (!text) return '';

    const noPrefix = text.replace(/^engine_/i, '').replace(/\.json$/i, '');
    if (/^\d+V4000M/i.test(noPrefix)) {
        return noPrefix.replace('V4000M', 'VM');
    }

    if (/^\d+VM/i.test(noPrefix)) {
        return noPrefix;
    }

    return '';
}

function normalizeEngineForSynthetic(rawValue) {
    const text = t(rawValue);
    if (!text) return '';

    const noPrefix = text.replace(/^engine_/i, '').replace(/\.json$/i, '');
    if (/^\d+V4000M/i.test(noPrefix)) {
        return noPrefix;
    }

    const shortMatch = noPrefix.match(/^(\d+)V(M.+)$/i);
    if (shortMatch) {
        return `${shortMatch[1]}V4000${shortMatch[2].toUpperCase()}`;
    }

    return noPrefix;
}

function normalizeEngineModelForLookup(rawValue) {
    return normalizeEngineForSynthetic(rawValue).toUpperCase();
}

function extractPrimaryFgCode(row) {
    return normalizeFgCode(pickMostFrequent([
        row?.fg_fgs_final,
        row?.fg_code,
        row?.['FG/FGS']
    ]));
}

function deriveModelTypeToken(row) {
    return normalizeModelTypeShort(pickMostFrequent([
        row?.engine_model,
        row?.engine,
        row?.__engine_file,
        row?.model,
        row?.model_type_final
    ]));
}

function deriveFgDescription() {
    return '';
}

const FG_FGS_INDEX = buildFgFgsCatalogIndex();

function lookupFgDescriptionByCodeAndModel(code, engineModel) {
    const normalizedCode = normalizeFgCode(code);
    const normalizedModel = normalizeEngineModelForLookup(engineModel);
    if (!normalizedCode || !normalizedModel) return '';
    return t(FG_FGS_INDEX.get(`${normalizedModel}::${normalizedCode}`));
}

function deriveExpCategorias(rows) {
    const values = [];
    for (const row of rows) {
        const modelType = deriveModelTypeToken(row);
        const fgCode = extractPrimaryFgCode(row);
        if (!modelType || !fgCode) continue;
        values.push(`${modelType}-${fgCode}`);
    }
    return joinUniqueSorted(values);
}

function deriveExpImagenes(rows, principalRow) {
    return buildExpImagenesFromBaseAssets(rows, principalRow).value;
}

function mergeCsvField(a, b) {
    return joinUniqueSorted([
        ...splitCsvValues(a),
        ...splitCsvValues(b)
    ]);
}

function getPn(row) {
    return t(getExportField(row, 'pn_final', row.pn));
}

function getNewPartNumber(row) {
    return pickMostFrequent([
        row.new_pn_final,
        row.sust_new_part_number,
        row['New Part Number']
    ]);
}

function getSupersededListValue(row) {
    return pickMostFrequent([
        row.subst_pnlist_final
    ]);
}

function getHierarchy(row) {
    return t(getExportField(row, 'hierarchie_final'));
}

function getDesignation(row) {
    return pickMostFrequent([
        row.designation_final,
        row.designation_gesa,
        row.DESIGNATION
    ]);
}

function getMeasurement(row) {
    return pickMostFrequent([
        row.measure_final,
        row.measurement_final,
        row.dimensions_gesa,
        row['MEASUREMENT / STANDARD']
    ]);
}

function getWeight(row) {
    return pickMostFrequent([
        row.weight_final,
        row.weight_gesa,
        row.WEIGHT
    ]);
}

function getEngineName(row) {
    return t(row.engine_model);
}

function getSourceId(row) {
    return t(row.ID);
}

function getSourcePage(row) {
    return t(row['Source Page']);
}

function getPos(row) {
    return t(row.pos_final);
}

function isSupersededRow(row) {
    const hierarchy = key(getHierarchy(row));
    if (hierarchy === 'superseded') return true;
    return getExportType(row) === 'superseded';
}

function completenessScore(row) {
    let score = 0;
    if (t(row.sku || row.pn || row.pn_final || row['PART NO.'])) score += 5;
    if (t(row.designation_final || row.DESIGNATION)) score += 3;
    if (t(row.measurement_final || row.measure_final)) score += 2;
    if (t(row.weight_final)) score += 1;
    if (t(row.new_pn_final || row.sust_new_part_number)) score += 1;
    if (t(row.sust_superseded_list || row.subst_pnlist_final)) score += 1;
    if (t(row.engines)) score += 1;
    if (t(row.source_ids)) score += 1;
    return score;
}

function isInternalDebugRecord(row) {
    return Boolean(row && row._internal_debug_record === true);
}

function loadEngineRows() {
    const rows = [];
    for (const fileName of ENGINE_JSON_FILES) {
        const filePath = path.join(REPO_ROOT, fileName);
        const parsed = readJson(filePath, []);
        if (!Array.isArray(parsed)) continue;
        for (const row of parsed) {
            if (isInternalDebugRecord(row)) continue;
            rows.push({ ...row, __engine_file: fileName });
        }
    }
    return rows;
}

function buildQaSummary(rows) {
    const summary = {
        total_rows: rows.length,
        count_ok_importar: 0,
        count_ok_eliminar: 0,
        count_pending: 0,
        count_review_action: 0,
        count_other: 0
    };

    for (const row of rows) {
        const estado = key(row.qa_revision_estado);
        const accion = key(row.qa_revision_accion);
        if (estado === 'ok' && accion === 'importar') {
            summary.count_ok_importar += 1;
            continue;
        }
        if (estado === 'ok' && accion === 'eliminar') {
            summary.count_ok_eliminar += 1;
            continue;
        }
        if (estado === 'pendiente' || estado === 'en revision' || estado === 'en revisión') {
            summary.count_pending += 1;
        }
        if (accion === 'revisar') {
            summary.count_review_action += 1;
        }
        if (!(estado === 'ok' && (accion === 'importar' || accion === 'eliminar'))) {
            summary.count_other += 1;
        }
    }

    return summary;
}

function decideByQa(rows, qaSummary) {
    const hasImport = qaSummary.count_ok_importar > 0;
    if (hasImport) {
        return { decision: 'import', reason: 'qa_ok_importar_found', qa_validated: true };
    }

    const allDelete = rows.length > 0 && rows.every((row) => {
        const estado = key(row.qa_revision_estado);
        const accion = key(row.qa_revision_accion);
        return estado === 'ok' && accion === 'eliminar';
    });
    if (allDelete) {
        return { decision: 'discard', reason: 'qa_all_ok_eliminar', qa_validated: true };
    }

    return { decision: 'pending_review', reason: 'qa_pending_or_mixed', qa_validated: false };
}

function buildAggregates(rows) {
    const engines = uniq(rows.map((row) => getEngineName(row))).join(', ');
    const sourceIds = uniq(rows.map((row) => getSourceId(row))).join(', ');
    const sourcePages = joinUniqueSorted(rows.flatMap((row) => splitMultiValues(row?.pages)));

    return { engines, sourceIds, sourcePages };
}

function buildTraceEntry(sku, rows, merged, decisionMeta, qaSummary) {
    const sourceRecords = rows.map((row) => ({
        id: t(row.ID),
        engine_model: getEngineName(row),
        source_file: t(row.__engine_file),
        source_page: getSourcePage(row),
        pos: t(row.pos_final),
        bom: t(row['BOM-No.']),
        designation_final: getDesignation(row),
        measure_final: getMeasurement(row),
        weight_final: getWeight(row),
        qa_revision_estado: t(row.qa_revision_estado),
        qa_revision_accion: t(row.qa_revision_accion)
    }));

    return {
        sku,
        preview: {
            import_decision: decisionMeta.decision,
            import_reason: decisionMeta.reason
        },
        compacted: {
            pn: sku,
            designation: merged.designation_final,
            measurement: merged.measurement_final,
            weight: merged.weight_final,
            total_occurrences_global: merged.occurrences,
            engine_models_all: merged.engines,
            source_ids_all: merged.source_ids,
            source_pages_all: merged.source_pages
        },
        qa_summary: qaSummary,
        source_records: sourceRecords
    };
}

function isQaOkImportRow(row) {
    return isExportable(row);
}

function isQaOkCopyRow(row) {
    return key(getExportField(row, 'qa_revision_estado')) === 'ok' && key(getExportField(row, 'qa_revision_accion')) === 'copia';
}

function hasImportableRow(rows) {
    return rows.some((row) => isQaOkImportRow(row));
}

function getConsolidationRows(rows) {
    const allRows = Array.isArray(rows) ? rows : [];
    const scoped = allRows.filter((row) => isQaOkImportRow(row) || isQaOkCopyRow(row));
    return scoped.length > 0 ? scoped : allRows;
}

function isQaOkDeleteRow(row) {
    return key(getExportField(row, 'qa_revision_estado')) === 'ok' && key(getExportField(row, 'qa_revision_accion')) === 'eliminar';
}

function isQaPendingOrReviewRow(row) {
    const estado = key(getExportField(row, 'qa_revision_estado'));
    const accion = key(getExportField(row, 'qa_revision_accion'));
    if (estado === 'pendiente' || estado === 'en revision' || estado === 'en revisión') return true;
    if (accion === 'revisar') return true;
    return false;
}

function parseArgs(argv) {
    const args = Array.isArray(argv) ? argv : [];
    return {
        dryRun: args.includes('--dry-run'),
        writeAuditMirror: args.includes('--audit-mirror')
    };
}

function addExample(auditExamples, keyName, payload, max = 5) {
    if (!Array.isArray(auditExamples[keyName])) return;
    if (auditExamples[keyName].length >= max) return;
    auditExamples[keyName].push(payload);
}

function buildMergedRow(rows, options = {}) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const consolidatedRows = Array.isArray(options.consolidatedRows) && options.consolidatedRows.length > 0
        ? options.consolidatedRows
        : sourceRows;
    const sku = t(options.sku || pickMostFrequent(sourceRows.map((row) => getPn(row))));
    const hierarchy = t(
        (options.hierarchy !== undefined && options.hierarchy !== null)
            ? options.hierarchy
            : pickMostFrequent(sourceRows.map((row) => getHierarchy(row)))
    );
    const agg = buildAggregates(consolidatedRows);
    const qaSummary = buildQaSummary(sourceRows);

    const designation = t(options.designation || pickMostFrequent(sourceRows.map((row) => getDesignation(row))));
    const measurement = t(options.measurement || pickMostFrequent(sourceRows.map((row) => getMeasurement(row))));
    const weight = t(options.weight || pickMostFrequent(sourceRows.map((row) => getWeight(row))));
    const newPn = t(options.newPn || pickMostFrequent(sourceRows.map((row) => getNewPartNumber(row))));
    const supersededList = t(options.supersededList || pickMostFrequent(sourceRows.map((row) => getSupersededListValue(row))));
    const vinculo = t(options.vinculo || (key(hierarchy) === 'superseded' ? buildProductVinculo(newPn) : ''));
    const oldPnFields = buildOldPnFields({
        sourceRows,
        consolidatedRows,
        old_pn_relacionados: supersededList,
        supersededList
    });
    const engineValues = consolidatedRows.map((row) => getEngineName(row));
    const engineBase = t(options.engine || joinUniqueSorted(engineValues));
    const engine = options.syntheticSource ? normalizeEngineForSynthetic(engineBase) : engineBase;
    const modelType = t(options.modelType || joinUniqueSorted(consolidatedRows.map((row) => deriveModelTypeToken(row))));
    const fgCode = t(options.fgCode || pickMostFrequent(sourceRows.map((row) => row.fg_fgs_final || row.fg_code || row['FG/FGS'])));
    const fgCodeLookup = normalizeFgCode(fgCode);
    const resolvedFgDescription = t(options.fgDescription || pickMostFrequent(sourceRows.map((row) => row.fgs_description)) || lookupFgDescriptionByCodeAndModel(fgCodeLookup, engine));
    const fgDescription = resolvedFgDescription || deriveFgDescription();
    const fgCodeDescription = t(options.fgCodeDescription || pickMostFrequent(sourceRows.map((row) => row.fgs_code_description)) || [fgCode, fgDescription].filter(Boolean).join(' '));
    const expCategorias = t(options.expCategorias || deriveExpCategorias(consolidatedRows));
    const expImagenesBuilt = buildExpImagenesFromBaseAssets(consolidatedRows, sourceRows[0]);
    const expImagenes = t(options.expImagenes || expImagenesBuilt.value);

    const id = t(options.id || pickMostFrequent(sourceRows.map((row) => getSourceId(row))));
    const fechaVersion = t(options.fechaVersion || pickMostFrequent(sourceRows.map((row) => row.fecha_version)) || formatExportTimestamp());
    const pos = t(options.pos || pickMostFrequent(sourceRows.map((row) => getPos(row))));
    const type = t(options.type || pickMostFrequent(sourceRows.map((row) => row.type)));
    const nsn = t(options.nsn || pickMostFrequent(sourceRows.map((row) => row.nsn)));
    const gesaNorm = t(options.gesaNorm || pickMostFrequent(sourceRows.map((row) => row.norma_final || row.GESA_NORM)));
    const gesaNormalizado = t(options.gesaNormalizado || pickMostFrequent(sourceRows.map((row) => row.normalizado_final || row.GESA_NORMALIZADO)));
    const weightTxt = t(options.weightTxt || pickMostFrequent(sourceRows.map((row) => row.weight_txt)) || weight);
    const tipoArticulo = t(options.tipoArticulo || 'piezas');
    const pag = t(options.pag || joinUniqueSorted(consolidatedRows.flatMap((row) => splitMultiValues(normalizeLibroPag(row)))));
    const bomNo = t(options.bomNo || pickMostFrequent(sourceRows.map((row) => row.BOM_no || row['BOM-No.'])));
    const esquemaGeneral = t(options.esquemaGeneral || joinUniqueSorted(consolidatedRows.flatMap((row) => [
        ...splitMultiValues(row.esquema_general),
        ...splitMultiValues(row.esquemas)
    ])));
    const expMotor = t(options.expMotor || joinUniqueSorted(consolidatedRows.flatMap((row) => {
        const fromField = splitMultiValues(row.exp_motor);
        if (fromField.length > 0) return fromField;
        return splitMultiValues(getEngineName(row));
    })) || engine);
    const atributo = t(options.atributo || joinUniqueSorted(consolidatedRows.flatMap((row) => splitMultiValues(row.atributo))));
    const enExcelSustitucion = t(options.enExcelSustitucion || pickMostFrequent(sourceRows.map((row) => row.EN_EXCEL_SUSTITUCION)));
    const rutaFoto = t(options.rutaFoto || pickMostFrequent(sourceRows.map((row) => row.filename_foto)));

    const urlContext = {
        engine_model: pickMostFrequent(sourceRows.map((row) => row.engine_model)) || engineBase,
        exp_motor: expMotor,
        model_type: modelType,
        __engine_file: pickMostFrequent(sourceRows.map((row) => row.__engine_file)),
        engine
    };

    const rutaFotoNorm = buildWordPressAssetUrlFromFilename(rutaFoto, urlContext, { assetType: 'photo' });
    const expImagenesNorm = normalizeWordPressAssetList(expImagenes, urlContext);
    const oldRutaWarnings = [];
    for (let i = 1; i <= OLD_RELATION_SLOT_COUNT; i += 1) {
        const suffix = String(i).padStart(2, '0');
        const field = `old_ruta_${suffix}`;
        const norm = normalizeWordPressAssetUrl(oldPnFields[field], urlContext);
        oldPnFields[field] = norm.value;
        if (norm.warning) oldRutaWarnings.push(norm.warning);
    }

    const urlWarnings = [
        ...expImagenesBuilt.warnings,
        ...expImagenesNorm.warnings,
        ...oldRutaWarnings,
        ...(rutaFotoNorm.warning ? [rutaFotoNorm.warning] : [])
    ];

    return {
        Id: id,
        fecha_version: fechaVersion,
        POS: pos,
        designation: designation,
        engine,
        model_type: modelType,
        type,
        pn: sku,
        nsn,
        GESA_NORM: gesaNorm,
        GESA_NORMALIZADO: gesaNormalizado,
        fg_code: fgCode,
        fg_description: fgDescription,
        fg_code_description: fgCodeDescription,
        weight,
        weight_txt: weightTxt,
        measurement,
        TIPOARTICULO: tipoArticulo,
        PAG: pag,
        BOM_no: bomNo,
        esquema_general: esquemaGeneral,
        exp_motor: expMotor,
        exp_categorias: expCategorias,
        atributo,
        SUST_TIPO: hierarchy,
        new_pn_relacionado: newPn,
        old_pn_relacionados: supersededList,
        ...oldPnFields,
        vinculo,
        EN_EXCEL_SUSTITUCION: enExcelSustitucion,
        ruta_foto: rutaFotoNorm.value,
        exp_imagenes: expImagenesNorm.value,
        sku,
        pn: sku,
        pn_final: sku,
        'PART NO.': sku,
        engine,
        model_type: modelType,
        fg_code: fgCode,
        fg_description: fgDescription,
        fg_code_description: fgCodeDescription,
        exp_categorias: expCategorias,
        exp_imagenes: expImagenesNorm.value,
        designation_final: designation,
        DESIGNATION: designation,
        measure_final: measurement,
        measurement_final: measurement,
        weight_final: weight,
        sust_hierarchie: hierarchy,
        hierarchie_final: hierarchy,
        sust_new_part_number: newPn,
        new_pn_final: newPn,
        sust_superseded_list: supersededList,
        subst_pnlist_final: supersededList,
        decision: t(options.decision || 'import'),
        reason: t(options.reason || 'qa_ok_importar_found'),
        qa_validated: options.qaValidated !== false,
        occurrences: sourceRows.length,
        apariciones: sourceRows.length,
        total_occurrences_global: sourceRows.length,
        engines: agg.engines,
        motores: agg.engines,
        source_ids: agg.sourceIds,
        source_pages: agg.sourcePages,
        qa_revision_estado: 'ok',
        qa_revision_accion: 'importar',
        qa_summary_json: JSON.stringify(qaSummary),
        import_decision: t(options.decision || 'import'),
        import_reason: t(options.reason || 'qa_ok_importar_found'),
        synthetic_source: t(options.syntheticSource || ''),
        data_quality: t(options.dataQuality || ''),
        synthetic_parent_id: t(options.syntheticParentId || ''),
        synthetic_parent_pn: t(options.syntheticParentPn || ''),
        synthetic_parent_engine: t(options.syntheticParentEngine || ''),
        synthetic_child_id: t(options.syntheticChildId || ''),
        synthetic_child_pn: t(options.syntheticChildPn || ''),
        synthetic_child_engine: t(options.syntheticChildEngine || ''),
        url_normalization_warnings_json: JSON.stringify(urlWarnings),
        dedupe_trace: ''
    };
}

function makeSyntheticSuperseded(parentRow, supersededPn) {
    const parentPn = getPn(parentRow);
    const parentId = getSourceId(parentRow);
    const parentEngine = getEngineName(parentRow);
    const designation = getDesignation(parentRow);

    return buildMergedRow([parentRow], {
        sku: supersededPn,
        hierarchy: 'Superseded',
        designation,
        measurement: getMeasurement(parentRow),
        weight: '',
        newPn: parentPn,
        decision: 'import',
        reason: 'synthetic_superseded_from_list',
        qaValidated: true,
        syntheticSource: 'sust_superseded_list',
        dataQuality: 'unknown_superseded',
        syntheticParentId: parentId,
        syntheticParentPn: parentPn,
        syntheticParentEngine: parentEngine
    });
}

function makeSyntheticNewFromOrphanSuperseded(supersededRow, newPn) {
    const childPn = getPn(supersededRow);
    const childId = getSourceId(supersededRow);
    const childEngine = getEngineName(supersededRow);
    const designation = pickMostFrequent([
        supersededRow['Denomination (New Part Number)'],
        supersededRow.designation_final,
        supersededRow.DESIGNATION
    ]);

    return buildMergedRow([supersededRow], {
        sku: newPn,
        hierarchy: 'New',
        designation,
        measurement: '',
        weight: '',
        newPn: '',
        supersededList: '',
        decision: 'import',
        reason: 'synthetic_new_from_orphan_superseded',
        qaValidated: true,
        syntheticSource: 'orphan_superseded_new',
        dataQuality: 'unknown_new_from_superseded',
        syntheticChildId: childId,
        syntheticChildPn: childPn,
        syntheticChildEngine: childEngine
    });
}

function chooseBetterCandidate(current, incoming) {
    const currentSynthetic = Boolean(t(current.synthetic_source));
    const incomingSynthetic = Boolean(t(incoming.synthetic_source));
    if (currentSynthetic !== incomingSynthetic) {
        return incomingSynthetic ? current : incoming;
    }

    const currentScore = completenessScore(current);
    const incomingScore = completenessScore(incoming);
    if (incomingScore !== currentScore) {
        return incomingScore > currentScore ? incoming : current;
    }

    const currentOcc = Number(current.occurrences || 0);
    const incomingOcc = Number(incoming.occurrences || 0);
    if (incomingOcc !== currentOcc) {
        return incomingOcc > currentOcc ? incoming : current;
    }

    return current;
}

function dedupeByPn(candidates, audit, dedupeBucketName) {
    const byPn = new Map();
    for (const row of candidates) {
        const pn = t(row.sku || row.pn || row.pn_final || row['PART NO.']);
        if (!pn) continue;
        const pnKey = key(pn);
        if (!byPn.has(pnKey)) {
            byPn.set(pnKey, { ...row, sku: pn, pn: pn, pn_final: pn, 'PART NO.': pn });
            continue;
        }

        audit.duplicates_avoided += 1;
        const kept = byPn.get(pnKey);
        const winner = chooseBetterCandidate(kept, row);
        const loser = winner === kept ? row : kept;

        winner.model_type = mergeCsvField(winner.model_type, loser.model_type);
        winner.exp_categorias = mergeCsvField(winner.exp_categorias, loser.exp_categorias);
        winner.exp_imagenes = mergeCsvField(winner.exp_imagenes, loser.exp_imagenes);
        if (!t(winner.fg_code)) winner.fg_code = t(loser.fg_code);
        if (!t(winner.fg_description)) winner.fg_description = t(loser.fg_description);
        if (!t(winner.fg_code_description)) {
            winner.fg_code_description = t(loser.fg_code_description);
        }

        const traceParts = uniq([
            t(winner.dedupe_trace),
            t(`kept:${winner.synthetic_source || 'real'}:${winner.reason || ''}`),
            t(`dropped:${loser.synthetic_source || 'real'}:${loser.reason || ''}`)
        ]).filter(Boolean);
        winner.dedupe_trace = traceParts.join(' | ');

        byPn.set(pnKey, winner);

        addExample(audit.examples, dedupeBucketName, {
            pn,
            kept_source: t(winner.synthetic_source || 'real'),
            dropped_source: t(loser.synthetic_source || 'real'),
            kept_reason: t(winner.reason),
            dropped_reason: t(loser.reason)
        });
    }
    return [...byPn.values()];
}

function writeOutputs(dirPath, payload) {
    ensureDir(dirPath);

    const {
        importRows,
        supersededRows,
        traceBySku,
        summary,
        headers,
        supersededHeaders
    } = payload;

    [
        'milu_wp_new_import.csv',
        'milu_wp_new_import.json',
        'milu_wp_superseded_import.csv',
        'milu_wp_superseded_import.json',
        'milu_wp_trace.json',
        'milu_wp_export_summary.md',
        // Legacy aliases kept here only to ensure cleanup from previous runs.
        'milu_wp_import.csv',
        'milu_wp_import.json',
        'milu_wp_superseded.csv',
        'milu_wp_superseded.json',
        'milu_wp_pending_review.csv',
        'milu_wp_pending_review.json',
        'milu_wp_pending.csv',
        'milu_wp_pending.json',
        'milu_wp_discarded.csv',
        'milu_wp_discarded.json',
        'milu_wp_export_report.json'
    ].forEach((name) => removeIfExists(path.join(dirPath, name)));

    writeJson(path.join(dirPath, 'milu_wp_new_import.json'), importRows);
    writeJson(path.join(dirPath, 'milu_wp_superseded_import.json'), supersededRows);

    writeCsv(path.join(dirPath, 'milu_wp_new_import.csv'), importRows, headers);
    writeCsv(path.join(dirPath, 'milu_wp_superseded_import.csv'), supersededRows, supersededHeaders);

    writeJson(path.join(dirPath, 'milu_wp_trace.json'), traceBySku);
    fs.writeFileSync(path.join(dirPath, 'milu_wp_export_summary.md'), `${summary}\n`, 'utf8');
}

function run(options = {}) {
    const dryRun = Boolean(options.dryRun);
    const writeAuditMirror = Boolean(options.writeAuditMirror);

    const fgUpdateSummary = runUpdateFgFgs({
        all: true,
        write: true,
        backup: false,
        rootDir: REPO_ROOT
    });

    ensureDir(OUTPUT_DIR);
    if (writeAuditMirror) ensureDir(AUDIT_OUTPUT_DIR);

    const allRows = loadEngineRows();

    const allRealPnKeys = new Set();
    for (const row of allRows) {
        const pn = getPn(row);
        if (!pn) continue;
        allRealPnKeys.add(key(pn));
    }

    const byPn = new Map();
    for (const row of allRows) {
        const pn = getPn(row);
        if (!pn) continue;
        const pnKey = key(pn);
        if (!byPn.has(pnKey)) byPn.set(pnKey, { pn, rows: [] });
        byPn.get(pnKey).rows.push(row);
    }

    const newCandidates = [];
    const supersededCandidates = [];
    const pendingRows = [];
    const discardedRows = [];
    const traceBySku = {};

    const audit = {
        total_new_real: 0,
        total_new_synthetic: 0,
        total_superseded_real: 0,
        total_superseded_synthetic_from_list: 0,
        total_superseded_omitted_existing: 0,
        total_orphan_superseded_generated_new: 0,
        duplicates_avoided: 0,
        examples: {
            new_real: [],
            new_synthetic: [],
            superseded_real: [],
            superseded_synthetic_from_list: [],
            superseded_omitted_existing: [],
            orphan_superseded_generated_new: [],
            duplicates_new: [],
            duplicates_superseded: []
        }
    };

    for (const group of byPn.values()) {
        const rows = group.rows;
        const okImportRows = rows.filter((row) => isQaOkImportRow(row));
        const pendingOrReviewRows = rows.filter((row) => isQaPendingOrReviewRow(row));
        const okDeleteRows = rows.filter((row) => isQaOkDeleteRow(row));

        const sku = group.pn;
        let selectedRows = rows;
        let decisionMeta = { decision: 'pending_review', reason: 'qa_pending_or_mixed', qa_validated: false };

        if (okImportRows.length > 0) {
            selectedRows = okImportRows;
            decisionMeta = { decision: 'import', reason: 'qa_ok_importar_found', qa_validated: true };
        } else if (pendingOrReviewRows.length > 0) {
            selectedRows = pendingOrReviewRows;
            decisionMeta = { decision: 'pending_review', reason: 'qa_pending_or_review_found', qa_validated: false };
        } else if (okDeleteRows.length > 0) {
            selectedRows = okDeleteRows;
            decisionMeta = { decision: 'discard', reason: 'qa_ok_eliminar_found', qa_validated: true };
        } else {
            selectedRows = rows;
            decisionMeta = { decision: 'pending_review', reason: 'qa_without_supported_state', qa_validated: false };
        }

        const qaSummary = buildQaSummary(selectedRows);
        const consolidationRows = getConsolidationRows(rows);

        if (decisionMeta.decision === 'import') {
            const realSupersededRows = selectedRows.filter((row) => isSupersededRow(row));
            const realNewRows = selectedRows.filter((row) => !isSupersededRow(row));

            if (realNewRows.length > 0) {
                const mergedNew = buildMergedRow(realNewRows, {
                    sku,
                    hierarchy: pickMostFrequent(realNewRows.map((row) => getHierarchy(row))),
                    decision: decisionMeta.decision,
                    reason: decisionMeta.reason,
                    qaValidated: decisionMeta.qa_validated,
                    consolidatedRows: consolidationRows
                });
                newCandidates.push(mergedNew);
                audit.total_new_real += 1;
                addExample(audit.examples, 'new_real', { pn: sku, engines: mergedNew.engines });

                for (const row of realNewRows) {
                    const listValues = uniq([
                        ...splitCommaList(t(row.sust_superseded_list)),
                        ...splitCommaList(t(row.subst_pnlist_final))
                    ]);

                    for (const supersededPn of listValues) {
                        const supersededKey = key(supersededPn);
                        if (!supersededKey) continue;

                        if (allRealPnKeys.has(supersededKey)) {
                            audit.total_superseded_omitted_existing += 1;
                            addExample(audit.examples, 'superseded_omitted_existing', {
                                parent_pn: sku,
                                omitted_pn: supersededPn
                            });
                            continue;
                        }

                        const syntheticSuperseded = makeSyntheticSuperseded(row, supersededPn);
                        supersededCandidates.push(syntheticSuperseded);
                        audit.total_superseded_synthetic_from_list += 1;
                        addExample(audit.examples, 'superseded_synthetic_from_list', {
                            parent_pn: sku,
                            synthetic_pn: supersededPn
                        });
                    }
                }
            }

            if (realSupersededRows.length > 0) {
                const mergedSuperseded = buildMergedRow(realSupersededRows, {
                    sku,
                    hierarchy: 'Superseded',
                    decision: decisionMeta.decision,
                    reason: decisionMeta.reason,
                    qaValidated: decisionMeta.qa_validated,
                    consolidatedRows: consolidationRows
                });
                supersededCandidates.push(mergedSuperseded);
                audit.total_superseded_real += 1;
                addExample(audit.examples, 'superseded_real', { pn: sku, engines: mergedSuperseded.engines });

                for (const supersededRow of realSupersededRows) {
                    const orphanNewPn = getNewPartNumber(supersededRow);
                    if (!orphanNewPn) continue;
                    if (allRealPnKeys.has(key(orphanNewPn))) continue;

                    const syntheticNew = makeSyntheticNewFromOrphanSuperseded(supersededRow, orphanNewPn);
                    newCandidates.push(syntheticNew);
                    audit.total_new_synthetic += 1;
                    audit.total_orphan_superseded_generated_new += 1;
                    addExample(audit.examples, 'orphan_superseded_generated_new', {
                        superseded_pn: getPn(supersededRow),
                        synthetic_new_pn: orphanNewPn
                    });
                    addExample(audit.examples, 'new_synthetic', {
                        source: 'orphan_superseded_new',
                        synthetic_new_pn: orphanNewPn
                    });
                }
            }
        } else if (decisionMeta.decision === 'discard') {
            const mergedDiscard = buildMergedRow(selectedRows, {
                sku,
                hierarchy: pickMostFrequent(selectedRows.map((row) => getHierarchy(row))),
                decision: decisionMeta.decision,
                reason: decisionMeta.reason,
                qaValidated: decisionMeta.qa_validated
            });
            mergedDiscard.qa_revision_estado = 'ok';
            mergedDiscard.qa_revision_accion = 'eliminar';
            discardedRows.push(mergedDiscard);
        } else {
            const mergedPending = buildMergedRow(selectedRows, {
                sku,
                hierarchy: pickMostFrequent(selectedRows.map((row) => getHierarchy(row))) || (isSupersededRow(selectedRows[0]) ? 'Superseded' : ''),
                decision: decisionMeta.decision,
                reason: decisionMeta.reason,
                qaValidated: decisionMeta.qa_validated
            });
            mergedPending.qa_revision_estado = 'pendiente';
            mergedPending.qa_revision_accion = 'revisar';
            pendingRows.push(mergedPending);
        }

        const compactedForTrace = buildMergedRow(selectedRows, {
            sku,
            hierarchy: pickMostFrequent(selectedRows.map((row) => getHierarchy(row))) || (isSupersededRow(selectedRows[0]) ? 'Superseded' : ''),
            decision: decisionMeta.decision,
            reason: decisionMeta.reason,
            qaValidated: decisionMeta.qa_validated,
            consolidatedRows: consolidationRows
        });
        traceBySku[sku] = buildTraceEntry(sku, selectedRows, compactedForTrace, decisionMeta, qaSummary);
    }

    const importRows = dedupeByPn(newCandidates, audit, 'duplicates_new');
    const supersededRows = dedupeByPn(supersededCandidates, audit, 'duplicates_superseded');

    const sortBySku = (a, b) => String(a.sku || '').localeCompare(String(b.sku || ''), 'es', { numeric: true, sensitivity: 'base' });
    importRows.sort(sortBySku);
    supersededRows.sort(sortBySku);
    pendingRows.sort(sortBySku);
    discardedRows.sort(sortBySku);

    const headers = [...NEW_V506_HEADERS];
    const supersededHeaders = [...NEW_V506_HEADERS, 'vinculo'];

    const report = {
        generated_at: new Date().toISOString(),
        dry_run: dryRun,
        fg_fgs_update: fgUpdateSummary,
        engines_processed: ENGINE_JSON_FILES.length,
        occurrences_processed: allRows.length,
        pn_unique: byPn.size,
        totals: {
            import: importRows.length + supersededRows.length,
            new: importRows.length,
            superseded: supersededRows.length,
            pending: pendingRows.length,
            discard: discardedRows.length
        },
        superseded_audit: {
            total_new_real: audit.total_new_real,
            total_new_synthetic: audit.total_new_synthetic,
            total_superseded_real: audit.total_superseded_real,
            total_superseded_synthetic_from_list: audit.total_superseded_synthetic_from_list,
            total_superseded_omitted_existing: audit.total_superseded_omitted_existing,
            total_orphan_superseded_generated_new: audit.total_orphan_superseded_generated_new,
            duplicates_avoided: audit.duplicates_avoided,
            examples: audit.examples
        },
        rules: {
            rule_qa: 'Base QA-only intacta: solo PN con ok/importar entra en export',
            rule_real_superseded: 'SUP real: sust_hierarchie=Superseded o hierarchie_final=Superseded',
            rule_synthetic_superseded: 'SUP sintetico desde sust_superseded_list/subst_pnlist_final para NEW exportables',
            rule_orphan_superseded: 'SUP real huerfano genera NEW sintetico minimo cuando no existe PN new real',
            rule_dedupe: 'Dedupe por PN dentro de NEW y SUP: real > sintetico > mayor completitud'
        },
        warnings: {
            URL_MODEL_NOT_FOUND: {
                total: 0,
                examples: []
            }
        }
    };

    const warningRows = [...importRows, ...supersededRows, ...pendingRows, ...discardedRows];
    for (const row of warningRows) {
        const raw = t(row.url_normalization_warnings_json);
        if (!raw) continue;
        let parsed = [];
        try {
            parsed = JSON.parse(raw);
        } catch (_) {
            parsed = [];
        }
        if (!Array.isArray(parsed)) continue;

        for (const warning of parsed) {
            if (!warning || warning.code !== 'URL_MODEL_NOT_FOUND') continue;
            report.warnings.URL_MODEL_NOT_FOUND.total += 1;
            if (report.warnings.URL_MODEL_NOT_FOUND.examples.length < 10) {
                report.warnings.URL_MODEL_NOT_FOUND.examples.push(warning);
            }
        }
    }

    const summary = [
        '# MILU WordPress Export Summary (QA only)',
        '',
        `Generated at: ${report.generated_at}`,
        `Dry run: ${dryRun ? 'yes' : 'no'}`,
        '',
        '## Totals',
        `- Engines processed: ${report.engines_processed}`,
        `- Occurrences processed: ${report.occurrences_processed}`,
        `- PN unique: ${report.pn_unique}`,
        `- Importables (total): ${report.totals.import}`,
        `- New: ${report.totals.new}`,
        `- Superseded: ${report.totals.superseded}`,
        `- Pending review: ${report.totals.pending}`,
        `- Discarded: ${report.totals.discard}`,
        '',
        '## Superseded Audit',
        `- Total New reales: ${audit.total_new_real}`,
        `- Total New sinteticos: ${audit.total_new_synthetic}`,
        `- Total Superseded reales: ${audit.total_superseded_real}`,
        `- Total Superseded sinteticos desde lista: ${audit.total_superseded_synthetic_from_list}`,
        `- Total Superseded omitidos por existir en JSON: ${audit.total_superseded_omitted_existing}`,
        `- Total Superseded huerfanos que generan New sintetico: ${audit.total_orphan_superseded_generated_new}`,
        `- Duplicados evitados: ${audit.duplicates_avoided}`,
        '',
        '## Official Rules',
        '- Rule 1: Base QA-only: solo ok/importar entra en export.',
        '- Rule 2: Superseded real por sust_hierarchie/hierarchie_final = Superseded.',
        '- Rule 3: Superseded sintetico desde sust_superseded_list/subst_pnlist_final (sin duplicar PNs reales).',
        '- Rule 4: Superseded real huerfano puede crear New sintetico minimo.',
        '- Rule 5: Dedupe por PN dentro de cada salida, priorizando real y mayor completitud.'
    ].join('\n');

    const payload = {
        importRows,
        supersededRows,
        pendingRows,
        discardedRows,
        traceBySku,
        report,
        summary,
        headers,
        supersededHeaders
    };

    if (!dryRun) {
        writeOutputs(OUTPUT_DIR, payload);
        if (writeAuditMirror) {
            writeOutputs(AUDIT_OUTPUT_DIR, payload);
        }
    }

    console.log(JSON.stringify(report, null, 2));
    return payload;
}

if (require.main === module) {
    const cliOptions = parseArgs(process.argv.slice(2));
    run(cliOptions);
}

module.exports = {
    NEW_V506_HEADERS,
    buildOldPnFields,
    splitAssetList,
    normalizeAssetBasename,
    inferModelFromAssetFilename,
    buildWordPressAssetUrlFromFilename,
    buildExpImagenesFromBaseAssets,
    normalizeWordPressAssetUrl,
    normalizeWordPressAssetList,
    buildQaSummary,
    decideByQa,
    buildMergedRow,
    getConsolidationRows,
    hasImportableRow,
    run,
    parseArgs
};
