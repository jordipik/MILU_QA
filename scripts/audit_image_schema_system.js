const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'output');
const WORDPRESS_OUTPUT_DIR = path.join(OUTPUT_DIR, 'wordpress');
const DOC_PATH = path.join(REPO_ROOT, 'docs', 'AUDITORIA_IMAGENES_ESQUEMAS_MILU.md');
const AUDIT_JSON_PATH = path.join(OUTPUT_DIR, 'image_schema_audit.json');
const INVENTORY_JSON_PATH = path.join(OUTPUT_DIR, 'image_inventory.json');
const INVENTORY_CSV_PATH = path.join(OUTPUT_DIR, 'image_inventory.csv');
const QA_INDEX_LIGHT_PATH = path.join(REPO_ROOT, 'qa_index_light.json');
const QA_INDEX_FULL_PATH = path.join(REPO_ROOT, 'qa_index.json');

const ENGINE_JSON_FILES = [
    'engine_12V4000M40A.json',
    'engine_12V4000M53.json',
    'engine_12V4000M70.json',
    'engine_16V4000M61.json',
    'engine_16V4000M73.json',
    'engine_16V4000M73L.json',
    'engine_16V4000M90.json',
    'engine_20V4000M93.json',
    'engine_20V4000M93L.json'
];

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.tiff']);
const WALK_IGNORE_DIRS = new Set(['.git', '.github', '.venv', 'node_modules', 'dist']);
const PLACEHOLDER_TOKENS = [
    'sin_imagen',
    'sin-imagen',
    'placeholder',
    'imagen-no-disponible',
    'image-not-available',
    'no-image',
    'missing-image'
];
const EMPTY_LIKE_TOKENS = new Set(['', '-', '--', 'null', 'undefined', 'none', 'nan', '[]', '{}']);

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

function writeJson(filePath, value, options = {}) {
    const { pretty = true } = options;
    const spacing = pretty ? 2 : 0;
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, spacing)}\n`, 'utf8');
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
        lines.push(headers.map((header) => escapeCell(row[header])).join(';'));
    }
    fs.writeFileSync(filePath, `\uFEFF${lines.join('\n')}\n`, 'utf8');
}

function toText(value) {
    return String(value == null ? '' : value).trim();
}

function lower(value) {
    return toText(value).toLowerCase();
}

function collapseSpaces(value) {
    return toText(value).replace(/\s+/g, ' ');
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function sortText(values) {
    return [...values].sort((left, right) => String(left).localeCompare(String(right), 'es', { numeric: true, sensitivity: 'base' }));
}

function fileExists(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.F_OK);
        return true;
    } catch (_) {
        return false;
    }
}

function pathToPosix(value) {
    return String(value || '').replace(/\\/g, '/');
}

function stripQueryAndHash(value) {
    return String(value || '').split('#')[0].split('?')[0];
}

function decodeSafe(value) {
    try {
        return decodeURIComponent(value);
    } catch (_) {
        return value;
    }
}

function extractFileName(value) {
    const raw = toText(value);
    if (!raw) return '';
    const clean = decodeSafe(stripQueryAndHash(raw));
    try {
        const parsed = new URL(clean);
        return decodeSafe(path.basename(parsed.pathname));
    } catch (_) {
        return decodeSafe(path.basename(clean.replace(/\\/g, '/')));
    }
}

function stripImageExtension(value) {
    return toText(value).replace(/\.(png|jpg|jpeg|webp|gif|tiff)$/i, '');
}

function splitMultiValue(rawValue) {
    if (Array.isArray(rawValue)) {
        return rawValue.flatMap((item) => splitMultiValue(item));
    }
    if (rawValue == null) return [];
    if (typeof rawValue === 'object') {
        return [];
    }
    return String(rawValue)
        .split(/[\n;,|]+/)
        .map((part) => collapseSpaces(part))
        .filter(Boolean);
}

function isEmptyLike(value) {
    const text = lower(value);
    return EMPTY_LIKE_TOKENS.has(text);
}

function isArtificialValue(value) {
    const text = lower(value);
    if (!text) return true;
    if (isEmptyLike(text)) return true;
    if (/^[-_]+$/.test(text)) return true;
    return false;
}

function hasPlaceholderToken(value) {
    const text = lower(value);
    return PLACEHOLDER_TOKENS.some((token) => text.includes(token));
}

function isProbablyUrl(value) {
    return /^https?:\/\//i.test(toText(value));
}

function normalizeReference(value) {
    const raw = collapseSpaces(value);
    if (!raw) return '';
    const stripped = stripQueryAndHash(raw);
    if (isProbablyUrl(stripped)) {
        try {
            const url = new URL(stripped);
            return `${url.origin}${decodeSafe(url.pathname)}`;
        } catch (_) {
            return decodeSafe(stripped);
        }
    }
    return pathToPosix(decodeSafe(stripped));
}

function normalizeComparableToken(value) {
    return lower(decodeSafe(stripQueryAndHash(value)));
}

function inferImageType(relativePath, fileName) {
    const rel = lower(relativePath);
    const base = lower(fileName);
    if (hasPlaceholderToken(rel) || hasPlaceholderToken(base)) return 'placeholder';
    if (rel.includes('esquemas_pos_circulos') || rel.includes('-pos/')) return 'esquema_pos';
    if (rel.includes('esquemas/')) return 'esquema';
    if (rel.includes('fotos_articulos') || rel.includes('fotos_motores')) return 'foto';
    return 'other';
}

function inferEngineModel(value) {
    const text = toText(value);
    if (!text) return '';
    const match = text.match(/\b(12V4000M40A|12V4000M53|12V4000M70|16V4000M61|16V4000M73L|16V4000M73|16V4000M90|20V4000M93L|20V4000M93)\b/i);
    return match ? match[1].toUpperCase() : '';
}

function inferBookPagePos(value) {
    const text = stripImageExtension(extractFileName(value));
    const match = text.match(/(12V4000M40A|12V4000M53|12V4000M70|16V4000M61|16V4000M73L|16V4000M73|16V4000M90|20V4000M93L|20V4000M93)-(\d{4})-(\d{2})-(\d+[A-Z]*)/i);
    if (!match) {
        return {
            engine_model: inferEngineModel(text),
            libro: '',
            pagina: '',
            pos: ''
        };
    }
    return {
        engine_model: match[1].toUpperCase(),
        libro: match[1].toUpperCase(),
        pagina: `${match[2]}-${match[3]}`,
        pos: match[4]
    };
}

function walkImages(rootDir, currentDir = rootDir, output = []) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            if (WALK_IGNORE_DIRS.has(entry.name)) continue;
            walkImages(rootDir, fullPath, output);
            continue;
        }
        const extension = lower(path.extname(entry.name));
        if (!IMAGE_EXTENSIONS.has(extension)) continue;
        const stats = fs.statSync(fullPath);
        const relativePath = pathToPosix(path.relative(rootDir, fullPath));
        const inferred = inferBookPagePos(entry.name);
        output.push({
            filename: entry.name,
            relative_path: relativePath,
            absolute_path: fullPath,
            extension: extension.replace(/^\./, ''),
            size_bytes: stats.size,
            size_kb: Number((stats.size / 1024).toFixed(2)),
            size_mb: Number((stats.size / (1024 * 1024)).toFixed(3)),
            modified_at: stats.mtime.toISOString(),
            possible_type: inferImageType(relativePath, entry.name),
            engine_model: inferred.engine_model,
            libro: inferred.libro,
            pagina: inferred.pagina,
            pos: inferred.pos
        });
    }
    return output;
}

function buildInventoryIndex(inventory) {
    const byFileName = new Map();
    const byRelativePath = new Map();
    const byComparable = new Map();

    for (const item of inventory) {
        const fileNameKey = lower(item.filename);
        const relKey = lower(pathToPosix(item.relative_path));
        const comparableValues = new Set([
            relKey,
            lower(item.filename),
            lower(stripImageExtension(item.filename))
        ]);

        if (!byFileName.has(fileNameKey)) byFileName.set(fileNameKey, []);
        byFileName.get(fileNameKey).push(item);

        if (!byRelativePath.has(relKey)) byRelativePath.set(relKey, []);
        byRelativePath.get(relKey).push(item);

        for (const comparable of comparableValues) {
            if (!comparable) continue;
            if (!byComparable.has(comparable)) byComparable.set(comparable, []);
            byComparable.get(comparable).push(item);
        }
    }

    return { byFileName, byRelativePath, byComparable };
}

function makeLocalSchemaCandidates(bookValue, token) {
    const book = toText(bookValue).replace(/\.pdf$/i, '');
    const cleanToken = toText(token);
    if (!book || !cleanToken) return [];

    const tokenNoExt = stripImageExtension(extractFileName(cleanToken) || cleanToken);
    const names = [tokenNoExt];
    if (!lower(tokenNoExt).startsWith(lower(`${book}-`))) {
        names.push(`${book}-${tokenNoExt}`);
    }

    const values = [];
    const seen = new Set();
    const pushValue = (value) => {
        const normalized = pathToPosix(value);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        values.push(normalized);
    };

    if (/\.(png|webp|jpg|jpeg)$/i.test(cleanToken)) {
        pushValue(`esquemas/${book}_esquemas/${extractFileName(cleanToken)}`);
    }
    for (const name of names) {
        ['png', 'webp', 'jpg', 'jpeg'].forEach((extension) => {
            pushValue(`esquemas/${book}_esquemas/${name}.${extension}`);
        });
    }
    return values;
}

function makeLocalSchemaPosCandidates(bookValue, token) {
    const book = toText(bookValue).replace(/\.pdf$/i, '');
    const cleanToken = toText(token);
    if (!book || !cleanToken) return [];

    const fileName = extractFileName(cleanToken) || cleanToken;
    const tokenNoExt = stripImageExtension(fileName);
    const extensionMatch = fileName.match(/\.(png|webp|jpg|jpeg)$/i);
    const extensions = extensionMatch ? [extensionMatch[1].toLowerCase()] : ['png', 'webp', 'jpg', 'jpeg'];
    const names = [tokenNoExt];
    if (!lower(tokenNoExt).startsWith(lower(`${book}-`))) {
        names.push(`${book}-${tokenNoExt}`);
    }

    const values = [];
    const seen = new Set();
    const pushValue = (value) => {
        const normalized = pathToPosix(value);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        values.push(normalized);
    };

    for (const name of names) {
        extensions.forEach((extension) => {
            pushValue(`esquemas_pos_circulos/${book}-POS/${name}.${extension}`);
        });
    }
    return values;
}

function buildRecordKey(row, engineFile) {
    return [
        toText(row.ID),
        toText(row['PART NO.'] || row.pn_final || row.pn),
        toText(row.engine_model),
        toText(row['Source Page']),
        toText(engineFile)
    ].join('|');
}

function buildReferenceObjects(values, sourceField, referenceType) {
    const refs = [];
    const seen = new Set();
    for (const value of values) {
        const raw = toText(value);
        if (!raw) continue;
        const normalized = normalizeReference(raw);
        if (!normalized || seen.has(`${sourceField}|${normalized}`)) continue;
        seen.add(`${sourceField}|${normalized}`);
        refs.push({
            raw,
            normalized,
            source_field: sourceField,
            reference_type: referenceType,
            file_name: extractFileName(raw),
            comparable: normalizeComparableToken(raw),
            is_placeholder: hasPlaceholderToken(raw),
            is_empty_like: isEmptyLike(raw),
            is_artificial: isArtificialValue(raw)
        });
    }
    return refs;
}

function matchReferenceToInventory(ref, inventoryIndex) {
    const candidates = [];
    const comparable = ref.comparable;
    const normalized = lower(pathToPosix(ref.normalized));
    const fileName = lower(ref.file_name);

    const addMatches = (items) => {
        for (const item of items || []) {
            if (!candidates.includes(item)) candidates.push(item);
        }
    };

    addMatches(inventoryIndex.byRelativePath.get(normalized));
    if (comparable) addMatches(inventoryIndex.byComparable.get(comparable));
    if (fileName) addMatches(inventoryIndex.byFileName.get(fileName));
    if (!candidates.length && fileName) {
        addMatches(inventoryIndex.byComparable.get(lower(stripImageExtension(fileName))));
    }

    return candidates;
}

function loadEngineRows() {
    const rows = [];
    for (const fileName of ENGINE_JSON_FILES) {
        const filePath = path.join(REPO_ROOT, fileName);
        const parsed = readJson(filePath, []);
        if (!Array.isArray(parsed)) continue;
        for (const row of parsed) {
            rows.push({ ...row, __engine_file: fileName });
        }
    }
    return rows;
}

function loadWordPressExports() {
    const importRows = readJson(path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_import.json'), []);
    const supersededRows = readJson(path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_superseded.json'), []);
    const pendingRows = readJson(path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_pending.json'), []);
    const discardedRows = readJson(path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_discarded.json'), []);
    const trace = readJson(path.join(WORDPRESS_OUTPUT_DIR, 'milu_wp_trace.json'), {});
    return {
        importRows: Array.isArray(importRows) ? importRows : [],
        supersededRows: Array.isArray(supersededRows) ? supersededRows : [],
        pendingRows: Array.isArray(pendingRows) ? pendingRows : [],
        discardedRows: Array.isArray(discardedRows) ? discardedRows : [],
        trace: trace && typeof trace === 'object' ? trace : {}
    };
}

function groupRowsByPn(rows) {
    const byPn = new Map();
    for (const row of rows) {
        const pn = toText(row.pn_final || row['PART NO.'] || row.pn);
        if (!pn) continue;
        const key = lower(pn);
        if (!byPn.has(key)) byPn.set(key, []);
        byPn.get(key).push(row);
    }
    return byPn;
}

function buildWordPressAuditRows(wordpressData, rowsByPn) {
    const result = [];
    const pushRows = (rows, exportType) => {
        for (const row of rows) {
            const pn = toText(row.pn || row.sku);
            const matchedEngineRows = rowsByPn.get(lower(pn)) || [];
            result.push({
                ...row,
                export_type: exportType,
                _engine_rows: matchedEngineRows,
                _trace: wordpressData.trace[pn] || wordpressData.trace[row.sku] || null
            });
        }
    };
    pushRows(wordpressData.importRows, 'new');
    pushRows(wordpressData.supersededRows, 'superseded');
    pushRows(wordpressData.pendingRows, 'pending');
    pushRows(wordpressData.discardedRows, 'discarded');
    return result;
}

function analyzeRecord(row, inventoryIndex) {
    const book = toText(row.engine_model);
    const localSchemaRefs = splitMultiValue(row.esquemas).flatMap((token) => makeLocalSchemaCandidates(book, token));
    const localSchemaPosRefs = [
        ...splitMultiValue(row.esquemas_circulos).flatMap((token) => makeLocalSchemaPosCandidates(book, token)),
        ...splitMultiValue(row.ruta_esquemas_pos).flatMap((token) => makeLocalSchemaPosCandidates(book, token))
    ];

    const references = [
        ...buildReferenceObjects(splitMultiValue(row.ruta_foto), 'ruta_foto', 'photo_url'),
        ...buildReferenceObjects(splitMultiValue(row.ruta_esquemas_pos), 'ruta_esquemas_pos', 'schema_pos_url'),
        ...buildReferenceObjects(splitMultiValue(row.exp_imagenes), 'exp_imagenes', 'export_images'),
        ...buildReferenceObjects(splitMultiValue(row.img_urls), 'img_urls', 'img_urls'),
        ...buildReferenceObjects(splitMultiValue(row.schema_urls), 'schema_urls', 'schema_urls'),
        ...buildReferenceObjects(localSchemaRefs, 'esquemas', 'schema_local_candidate'),
        ...buildReferenceObjects(localSchemaPosRefs, 'esquemas_circulos', 'schema_pos_local_candidate')
    ];

    for (const ref of references) {
        const matches = matchReferenceToInventory(ref, inventoryIndex);
        ref.inventory_matches = matches.map((item) => item.relative_path);
        ref.inventory_match_count = matches.length;
        ref.exists_in_inventory = matches.length > 0;
        ref.matched_types = unique(matches.map((item) => item.possible_type));
    }

    const imageRefs = references.filter((ref) => ['photo_url', 'export_images', 'img_urls'].includes(ref.reference_type));
    const schemaRefs = references.filter((ref) => ['schema_pos_url', 'schema_urls', 'schema_local_candidate', 'schema_pos_local_candidate'].includes(ref.reference_type));

    const realImageRefs = imageRefs.filter((ref) => !ref.is_placeholder && !ref.is_empty_like && !ref.is_artificial);
    const realSchemaRefs = schemaRefs.filter((ref) => !ref.is_placeholder && !ref.is_empty_like && !ref.is_artificial);

    const existingRealImageRefs = realImageRefs.filter((ref) => ref.exists_in_inventory);
    const brokenRealImageRefs = realImageRefs.filter((ref) => !ref.exists_in_inventory);
    const existingRealSchemaRefs = realSchemaRefs.filter((ref) => ref.exists_in_inventory);
    const brokenRealSchemaRefs = realSchemaRefs.filter((ref) => !ref.exists_in_inventory);

    const hasPhoto = existingRealImageRefs.some((ref) => ref.reference_type === 'photo_url' || ref.matched_types.includes('foto'));
    const hasSchema = existingRealSchemaRefs.length > 0;
    const hasPlaceholder = imageRefs.some((ref) => ref.is_placeholder);
    const hasAnyImageField = imageRefs.length > 0;
    const hasAnySchemaField = schemaRefs.length > 0 || splitMultiValue(row.esquemas).length > 0 || splitMultiValue(row.esquemas_circulos).length > 0;

    let imageStatus = 'NO_IMAGE';
    if (hasPhoto && hasSchema) imageStatus = 'PHOTO_AND_SCHEMA';
    else if (hasPhoto) imageStatus = 'PHOTO_ONLY';
    else if (hasSchema) imageStatus = 'SCHEMA_ONLY';
    else if (brokenRealImageRefs.length > 0) imageStatus = 'BROKEN_IMAGE_PATH';
    else if (hasPlaceholder) imageStatus = 'ONLY_PLACEHOLDER';
    else if (existingRealImageRefs.length > 0) imageStatus = 'OK_REAL_IMAGE';

    let schemaStatus = 'NO_SCHEMA';
    if (existingRealSchemaRefs.length > 0) schemaStatus = 'OK_SCHEMA';
    else if (brokenRealSchemaRefs.length > 0 && splitMultiValue(row.schema_urls).length > 0) schemaStatus = 'SCHEMA_ROUTE_BUT_FILE_NOT_FOUND';
    else if (splitMultiValue(row.esquemas).length > 0 || splitMultiValue(row.esquemas_circulos).length > 0) schemaStatus = 'SCHEMA_FILENAME_BUT_NO_ROUTE';
    else if (splitMultiValue(row.schema_urls).length > 0) schemaStatus = 'SCHEMA_NOT_IN_INVENTORY';

    const issues = [];
    if (!hasAnyImageField && !hasSchema) issues.push('missing_image_fields');
    if (hasPlaceholder && !existingRealImageRefs.length) issues.push('placeholder_only');
    if (brokenRealImageRefs.length > 0) issues.push('broken_image_reference');
    if (!hasAnySchemaField) issues.push('missing_schema_fields');
    if (brokenRealSchemaRefs.length > 0) issues.push('broken_schema_reference');
    if (splitMultiValue(row.img_urls).length === 0) issues.push('img_urls_empty');
    if (splitMultiValue(row.schema_urls).length === 0) issues.push('schema_urls_empty');
    if (splitMultiValue(row.esquemas).length === 0) issues.push('esquemas_empty');
    if (splitMultiValue(row.esquemas_circulos).length === 0) issues.push('esquemas_circulos_empty');
    if (splitMultiValue(row.ruta_esquemas_pos).length === 0 && hasAnySchemaField) issues.push('schema_without_final_wordpress_route');
    if (splitMultiValue(row.ruta_esquemas_pos).length > 0 && !existingRealSchemaRefs.length) issues.push('wordpress_schema_route_without_local_file');
    if (splitMultiValue(row.ruta_foto).length > 0 && !existingRealImageRefs.length && !hasPlaceholder) issues.push('wordpress_photo_route_without_local_file');

    return {
        record_key: buildRecordKey(row, row.__engine_file),
        part_number: toText(row.pn_final || row['PART NO.'] || row.pn),
        engine_model: book,
        libro: book,
        source_page: toText(row['Source Page']),
        export_type: toText(row.sust_hierarchie) === 'Superseded' ? 'superseded' : 'new',
        ruta_foto: splitMultiValue(row.ruta_foto),
        ruta_esquemas_pos: splitMultiValue(row.ruta_esquemas_pos),
        img_urls: splitMultiValue(row.img_urls),
        schema_urls: splitMultiValue(row.schema_urls),
        esquemas: splitMultiValue(row.esquemas),
        esquemas_circulos: splitMultiValue(row.esquemas_circulos),
        exp_imagenes: splitMultiValue(row.exp_imagenes),
        image_status: imageStatus,
        schema_status: schemaStatus,
        has_real_photo: hasPhoto,
        has_real_schema: hasSchema,
        issues: sortText(unique(issues)),
        references,
        __engine_file: row.__engine_file,
        __source_id: toText(row.ID)
    };
}

function summarizeWordPressRows(wordpressRows) {
    const exportableRows = wordpressRows.filter((row) => row.export_type === 'new' || row.export_type === 'superseded');
    const details = exportableRows.map((row) => {
        const sourceRows = Array.isArray(row._engine_rows) ? row._engine_rows : [];
        const photoRefs = unique(sourceRows.flatMap((item) => splitMultiValue(item.ruta_foto)));
        const schemaRefs = unique(sourceRows.flatMap((item) => splitMultiValue(item.ruta_esquemas_pos)));
        const expRefs = unique(sourceRows.flatMap((item) => splitMultiValue(item.exp_imagenes)));
        const allRefs = unique([...photoRefs, ...schemaRefs, ...expRefs]);
        const placeholderRefs = allRefs.filter((value) => hasPlaceholderToken(value));
        const realRefs = allRefs.filter((value) => !hasPlaceholderToken(value) && !isArtificialValue(value));
        return {
            pn: toText(row.pn || row.sku),
            export_type: row.export_type,
            photo_refs: photoRefs,
            schema_refs: schemaRefs,
            all_refs: allRefs,
            placeholder_refs: placeholderRefs,
            real_refs: realRefs,
            has_multiple_images: allRefs.length > 1,
            has_ruta_foto_real: photoRefs.some((value) => !hasPlaceholderToken(value) && !isArtificialValue(value)),
            has_ruta_esquemas_pos: schemaRefs.some((value) => !isArtificialValue(value)),
            has_broken_or_inconsistent: allRefs.some((value) => isArtificialValue(value))
        };
    });

    return {
        total_export_wordpress: exportableRows.length,
        without_image: details.filter((item) => item.real_refs.length === 0 && item.placeholder_refs.length === 0).length,
        only_placeholder: details.filter((item) => item.real_refs.length === 0 && item.placeholder_refs.length > 0).length,
        with_real_image: details.filter((item) => item.real_refs.length > 0).length,
        with_ruta_foto_real: details.filter((item) => item.has_ruta_foto_real).length,
        with_ruta_esquemas_pos: details.filter((item) => item.has_ruta_esquemas_pos).length,
        with_multiple_images: details.filter((item) => item.has_multiple_images).length,
        broken_empty_or_inconsistent: details.filter((item) => item.has_broken_or_inconsistent).length,
        placeholder_token_counts: PLACEHOLDER_TOKENS.reduce((acc, token) => {
            acc[token] = details.reduce((count, item) => count + item.all_refs.filter((value) => lower(value).includes(token)).length, 0);
            return acc;
        }, {})
    };
}

function buildSummary(recordAudits, inventory, wordpressSummary, qaIndexInfo) {
    return {
        total_export_wordpress: wordpressSummary.total_export_wordpress,
        total_engine_records: recordAudits.length,
        without_image: recordAudits.filter((row) => row.image_status === 'NO_IMAGE').length,
        only_placeholder: recordAudits.filter((row) => row.image_status === 'ONLY_PLACEHOLDER').length,
        with_real_image: recordAudits.filter((row) => row.image_status === 'PHOTO_ONLY' || row.image_status === 'PHOTO_AND_SCHEMA').length,
        without_schema: recordAudits.filter((row) => row.schema_status === 'NO_SCHEMA').length,
        broken_paths: recordAudits.filter((row) => row.issues.includes('broken_image_reference') || row.issues.includes('broken_schema_reference')).length,
        unused_images: inventory.filter((item) => !item.is_used).length,
        qa_index_present: qaIndexInfo.exists,
        qa_index_rows: qaIndexInfo.total_rows
    };
}

function markInventoryUsage(inventory, recordAudits) {
    const usedPaths = new Set();
    for (const row of recordAudits) {
        for (const ref of row.references) {
            for (const match of ref.inventory_matches || []) {
                usedPaths.add(lower(match));
            }
        }
    }
    for (const item of inventory) {
        item.is_used = usedPaths.has(lower(item.relative_path));
    }
}

function buildAuditLists(recordAudits, inventory) {
    const missingByReference = new Map();
    const unusedImages = inventory
        .filter((item) => !item.is_used)
        .map((item) => ({
            filename: item.filename,
            relative_path: item.relative_path,
            possible_type: item.possible_type,
            engine_model: item.engine_model,
            libro: item.libro,
            pagina: item.pagina,
            pos: item.pos,
            image_status: 'UNUSED_IMAGE'
        }));

    for (const row of recordAudits) {
        for (const ref of row.references) {
            if (ref.is_placeholder || ref.is_empty_like || ref.is_artificial) continue;
            if (ref.exists_in_inventory) continue;
            const key = [ref.reference_type, ref.source_field, lower(ref.normalized)].join('|');
            if (!missingByReference.has(key)) {
                missingByReference.set(key, {
                    source_field: ref.source_field,
                    reference_type: ref.reference_type,
                    reference: ref.raw,
                    normalized_reference: ref.normalized,
                    count: 0,
                    engine_models: new Set(),
                    sample_records: []
                });
            }
            const bucket = missingByReference.get(key);
            bucket.count += 1;
            if (row.engine_model) bucket.engine_models.add(row.engine_model);
            if (bucket.sample_records.length < 10) {
                bucket.sample_records.push({
                    record_key: row.record_key,
                    part_number: row.part_number,
                    engine_model: row.engine_model,
                    source_page: row.source_page
                });
            }
        }
    }

    const missingImages = sortText([...missingByReference.keys()]).map((key) => {
        const item = missingByReference.get(key);
        return {
            source_field: item.source_field,
            reference_type: item.reference_type,
            reference: item.reference,
            normalized_reference: item.normalized_reference,
            count: item.count,
            engine_models: sortText([...item.engine_models]),
            sample_records: item.sample_records
        };
    });

    return {
        missingImages,
        brokenReferences: missingImages,
        unusedImages
    };
}

function compactRecordAudit(row) {
    const compact = {
        record_key: row.record_key,
        part_number: row.part_number,
        engine_model: row.engine_model,
        libro: row.libro,
        source_page: row.source_page,
        export_type: row.export_type,
        ruta_foto: row.ruta_foto.length <= 1 ? (row.ruta_foto[0] || '') : row.ruta_foto.join(', '),
        ruta_esquemas_pos: row.ruta_esquemas_pos.length <= 1 ? (row.ruta_esquemas_pos[0] || '') : row.ruta_esquemas_pos.join(', '),
        image_status: row.image_status,
        schema_status: row.schema_status,
        issues: row.issues,
        reference_counts: {
            total: row.references.length,
            broken: row.references.filter((ref) => !ref.is_placeholder && !ref.is_empty_like && !ref.is_artificial && !ref.exists_in_inventory).length,
            matched: row.references.filter((ref) => ref.exists_in_inventory).length,
            placeholders: row.references.filter((ref) => ref.is_placeholder).length
        }
    };

    if (row.img_urls.length > 0) compact.img_urls = row.img_urls;
    if (row.schema_urls.length > 0) compact.schema_urls = row.schema_urls;
    return compact;
}

function loadQaIndexInfo() {
    const light = readJson(QA_INDEX_LIGHT_PATH, null);
    const full = readJson(QA_INDEX_FULL_PATH, null);
    const lightRows = Array.isArray(light) ? light.length : 0;
    const fullRows = Array.isArray(full) ? full.length : 0;
    return {
        exists: Array.isArray(light) || Array.isArray(full),
        total_rows: fullRows || lightRows,
        light_rows: lightRows,
        full_rows: fullRows,
        note: lightRows || fullRows ? 'qa_index presente' : 'qa_index ausente; app.js lo referencia como flujo legacy local.'
    };
}

function buildMarkdownReport(context) {
    const { summary, wordpressSummary, qaMetrics, inventory, auditLists, qaIndexInfo } = context;
    const lines = [];
    lines.push('# AUDITORIA IMAGENES Y ESQUEMAS MILU');
    lines.push('');
    lines.push(`Generado: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('## Resumen ejecutivo');
    lines.push(`- Registros engine auditados: ${summary.total_engine_records}`);
    lines.push(`- Articulos exportables WordPress analizados: ${summary.total_export_wordpress}`);
    lines.push(`- Registros sin imagen real: ${summary.without_image}`);
    lines.push(`- Registros solo con placeholder: ${summary.only_placeholder}`);
    lines.push(`- Registros sin esquema: ${summary.without_schema}`);
    lines.push(`- Referencias rotas detectadas: ${summary.broken_paths}`);
    lines.push(`- Imagenes fisicas no utilizadas: ${summary.unused_images}`);
    lines.push('');
    lines.push('## Campos y datasets actuales');
    lines.push('- engine_*.json: dataset principal consumido por qa_milu.html.');
    lines.push('- data/output/wordpress/milu_wp_import.json y milu_wp_superseded.json: export actual a WordPress.');
    lines.push('- data/output/wordpress/milu_wp_trace.json: traza por PN hacia source_records.');
    lines.push('- qa_index.json / qa_index_light.json: flujo legacy referenciado en app.js, no presente en el repo actual.');
    lines.push('');
    lines.push('## Flujo actual de generacion de rutas');
    lines.push('- add_final_fields.py: genera exp_imagenes priorizando ruta_foto y luego ruta_esquemas_pos; si faltan ambas usa sin_imagen.');
    lines.push('- generate_synthetic_exports.js: hereda exp_imagenes desde engine_*.json; no recalcula rutas locales.');
    lines.push('- js/schemas.js: reconstruye rutas locales de esquemas y esquemas_pos por convencion de nombres y carpetas.');
    lines.push('- scripts/export_wordpress_milu.js: genera JSON/CSV de export, pero hoy no persiste campos de imagen en los JSON finales.');
    lines.push('');
    lines.push('## Metricas WordPress');
    lines.push(`- Sin ninguna imagen: ${wordpressSummary.without_image}`);
    lines.push(`- Solo placeholder: ${wordpressSummary.only_placeholder}`);
    lines.push(`- Con imagen real: ${wordpressSummary.with_real_image}`);
    lines.push(`- Con ruta_foto real: ${wordpressSummary.with_ruta_foto_real}`);
    lines.push(`- Con ruta_esquemas_pos: ${wordpressSummary.with_ruta_esquemas_pos}`);
    lines.push(`- Con varias imagenes: ${wordpressSummary.with_multiple_images}`);
    lines.push(`- Rotas, vacias o inconsistentes: ${wordpressSummary.broken_empty_or_inconsistent}`);
    lines.push('');
    lines.push('## Metricas QA / engine rows');
    lines.push(`- Registros con esquemas vacios: ${qaMetrics.esquemas_empty}`);
    lines.push(`- Registros con esquemas_circulos vacio: ${qaMetrics.esquemas_circulos_empty}`);
    lines.push(`- Registros con schema_urls vacio: ${qaMetrics.schema_urls_empty}`);
    lines.push(`- Registros con img_urls vacio: ${qaMetrics.img_urls_empty}`);
    lines.push(`- Registros sin esquema vinculado: ${qaMetrics.without_any_schema}`);
    lines.push(`- Registros con esquema pero sin ruta final WordPress: ${qaMetrics.schema_without_wordpress_route}`);
    lines.push(`- Registros con esquema por libro/pagina pero sin imagen exportada: ${qaMetrics.schema_but_no_export_image}`);
    lines.push('');
    lines.push('## Inventario fisico');
    lines.push(`- Imagenes inventariadas: ${inventory.length}`);
    lines.push(`- Fotos: ${inventory.filter((item) => item.possible_type === 'foto').length}`);
    lines.push(`- Esquemas: ${inventory.filter((item) => item.possible_type === 'esquema').length}`);
    lines.push(`- Esquemas POS: ${inventory.filter((item) => item.possible_type === 'esquema_pos').length}`);
    lines.push(`- Placeholders: ${inventory.filter((item) => item.possible_type === 'placeholder').length}`);
    lines.push('');
    lines.push('## Problemas detectados');
    lines.push('- El export actual de WordPress no conserva campos de imagen en los JSON finales; la auditoria los recompone desde engine_*.json y milu_wp_trace.json.');
    lines.push('- qa_index no existe en el repo actual, por lo que cualquier cruce con ese dataset queda marcado como legacy ausente.');
    lines.push('- La UI QA resuelve esquemas locales por convencion de nombre, no por inventario persistido, lo que facilita rutas rotas silenciosas.');
    lines.push('- Hay placeholders y rutas finales WordPress que no siempre tienen equivalente local verificable.');
    lines.push('');
    lines.push('## Listados principales');
    lines.push(`- Referencias faltantes: ${auditLists.missingImages.length}`);
    lines.push(`- Referencias rotas: ${auditLists.brokenReferences.length}`);
    lines.push(`- Imagenes huerfanas: ${auditLists.unusedImages.length}`);
    lines.push(`- qa_index: ${qaIndexInfo.note}`);
    lines.push('');
    lines.push('## Plan de correccion');
    lines.push('- Fase 1: mantener solo diagnostico; congelar logica productiva y versionar copia de seguridad de outputs e inventario.');
    lines.push('- Fase 2: unificar deteccion de placeholders y normalizar tokens sin_imagen, placeholder y variantes.');
    lines.push('- Fase 3: recalcular rutas de esquemas desde inventario real y persistir un indice verificable de correspondencias.');
    lines.push('- Fase 4: corregir scripts de export_WordPress para incluir y validar campos de imagen antes de generar JSON/CSV finales.');
    lines.push('- Fase 5: construir pantalla visual QA de imagenes/esquemas usando image_schema_audit.json.');
    lines.push('');
    lines.push('## Recomendaciones');
    lines.push('- No cambiar logica productiva hasta revisar estos artefactos: image_inventory.json, image_schema_audit.json, image_inventory.csv y este informe.');
    lines.push('- Antes de cualquier correccion, regenerar copia de seguridad de data/output/wordpress y de los engine_*.json afectados.');
    lines.push('- Introducir una comprobacion automatica que falle si una ruta WordPress no encuentra fichero local equivalente o si solo se resuelve a placeholder.');
    lines.push('');
    return `${lines.join('\n')}\n`;
}

function main() {
    ensureDir(OUTPUT_DIR);

    const inventory = walkImages(REPO_ROOT);
    const inventoryIndex = buildInventoryIndex(inventory);
    const engineRows = loadEngineRows();
    const wordpressData = loadWordPressExports();
    const rowsByPn = groupRowsByPn(engineRows);
    const wordpressRows = buildWordPressAuditRows(wordpressData, rowsByPn);
    const recordAudits = engineRows.map((row) => analyzeRecord(row, inventoryIndex));

    markInventoryUsage(inventory, recordAudits);

    const auditLists = buildAuditLists(recordAudits, inventory);
    const wordpressSummary = summarizeWordPressRows(wordpressRows);
    const qaIndexInfo = loadQaIndexInfo();

    const qaMetrics = {
        esquemas_empty: recordAudits.filter((row) => row.issues.includes('esquemas_empty')).length,
        esquemas_circulos_empty: recordAudits.filter((row) => row.issues.includes('esquemas_circulos_empty')).length,
        schema_urls_empty: recordAudits.filter((row) => row.issues.includes('schema_urls_empty')).length,
        img_urls_empty: recordAudits.filter((row) => row.issues.includes('img_urls_empty')).length,
        without_any_schema: recordAudits.filter((row) => row.schema_status === 'NO_SCHEMA').length,
        schema_without_wordpress_route: recordAudits.filter((row) => row.issues.includes('schema_without_final_wordpress_route')).length,
        schema_but_no_export_image: recordAudits.filter((row) => row.has_real_schema && (row.image_status === 'SCHEMA_ONLY' || row.image_status === 'NO_IMAGE')).length
    };

    const summary = buildSummary(recordAudits, inventory, wordpressSummary, qaIndexInfo);
    const auditPayload = {
        generated_at: new Date().toISOString(),
        summary,
        wordpress_summary: wordpressSummary,
        qa_metrics: qaMetrics,
        qa_index_info: qaIndexInfo,
        records: recordAudits.map((row) => compactRecordAudit(row)),
        unused_images: auditLists.unusedImages,
        missing_images: auditLists.missingImages,
        broken_references: auditLists.brokenReferences
    };

    const inventoryForJson = sortText(inventory.map((item) => item.relative_path)).map((relativePath) => inventory.find((item) => item.relative_path === relativePath));

    writeJson(AUDIT_JSON_PATH, auditPayload, { pretty: false });
    writeJson(INVENTORY_JSON_PATH, inventoryForJson);
    writeCsv(INVENTORY_CSV_PATH, inventoryForJson, [
        'filename',
        'relative_path',
        'absolute_path',
        'extension',
        'size_kb',
        'size_mb',
        'modified_at',
        'possible_type',
        'engine_model',
        'libro',
        'pagina',
        'pos',
        'is_used'
    ]);
    fs.writeFileSync(DOC_PATH, buildMarkdownReport({ summary, wordpressSummary, qaMetrics, inventory, auditLists, qaIndexInfo }), 'utf8');

    console.log(`Audit JSON: ${AUDIT_JSON_PATH}`);
    console.log(`Inventory JSON: ${INVENTORY_JSON_PATH}`);
    console.log(`Inventory CSV: ${INVENTORY_CSV_PATH}`);
    console.log(`Report: ${DOC_PATH}`);
    console.log(`Records: ${recordAudits.length}`);
    console.log(`Inventory files: ${inventory.length}`);
    console.log(`Missing references: ${auditLists.missingImages.length}`);
    console.log(`Unused images: ${auditLists.unusedImages.length}`);
}

if (require.main === module) {
    main();
}