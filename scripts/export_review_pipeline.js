const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');

const REPO_ROOT = path.resolve(__dirname, '..');
const WORDPRESS_DIR = path.join(REPO_ROOT, 'data', 'output', 'wordpress');
const EXPORT_REVIEW_DIR = path.join(REPO_ROOT, 'data', 'output', 'export_review');

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

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
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

function uniqueSorted(values) {
    return [...new Set((values || []).map((item) => t(item)).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
}

function splitList(value) {
    return String(value == null ? '' : value)
        .split(',')
        .map((item) => t(item))
        .filter(Boolean);
}

function getPn(row) {
    return t(row['PART NO.'] || row.pn || row.pn_final);
}

function getDesignation(row) {
    return collapseSpaces(row.designation_final || row.designation_gesa || row.DESIGNATION);
}

function getMeasure(row) {
    const fromGesa = collapseSpaces(row.dimensions_gesa);
    if (fromGesa) return fromGesa;
    const fromRaw = collapseSpaces(row['MEASUREMENT / STANDARD']);
    if (fromRaw) return fromRaw;
    return collapseSpaces(row.measure_final || row.measurement_final);
}

function getWeight(row) {
    return collapseSpaces(row.weight_final || row.WEIGHT || row.weight_gesa);
}

function getCategory(row) {
    return collapseSpaces(row.exp_categorias || row.categoria || row.atributo);
}

function getImages(row) {
    return uniqueSorted([
        ...splitList(row.exp_imagenes),
        t(row.ruta_foto)
    ]);
}

function getSchemas(row) {
    return uniqueSorted([
        ...splitList(row.esquema_general),
        ...splitList(row.esquema_circulos),
        ...splitList(row.schema),
        ...splitList(row.schemas)
    ]);
}

function loadAllEngineRows(repoRoot = REPO_ROOT) {
    const rows = [];
    for (const fileName of ENGINE_JSON_FILES) {
        const filePath = path.join(repoRoot, fileName);
        const parsed = readJson(filePath, []);
        if (!Array.isArray(parsed)) continue;
        for (const row of parsed) {
            rows.push({ ...row, __engine_file: fileName });
        }
    }
    return rows;
}

function scoreRepresentative(row) {
    let score = 0;
    if (getDesignation(row)) score += 4;
    if (getMeasure(row)) score += 2;
    if (getWeight(row)) score += 1;
    if (getImages(row).length > 0) score += 1;
    const hierarchy = key(row.sust_hierarchie);
    if (hierarchy === 'new') score += 2;
    if (hierarchy === 'superseded') score += 2;
    return score;
}

function chooseRepresentative(rows, mode) {
    const normalizedMode = mode === 'superseded' ? 'superseded' : 'new';
    const prioritized = rows.filter((row) => {
        const hierarchy = key(row.sust_hierarchie);
        if (normalizedMode === 'superseded') {
            return hierarchy === 'superseded' || t(row.sust_new_part_number || row['New Part Number']);
        }
        return hierarchy !== 'superseded';
    });

    const pool = prioritized.length ? prioritized : rows;
    return [...pool].sort((a, b) => scoreRepresentative(b) - scoreRepresentative(a))[0] || null;
}

function buildGlobalAggregation(groupRows) {
    return {
        total_occurrences_global: groupRows.length,
        engine_models_all: uniqueSorted(groupRows.map((row) => row.engine_model || row.model || row.engine)).join(', '),
        source_files_all: uniqueSorted(groupRows.map((row) => row.__engine_file)).join(', '),
        source_pages_all: uniqueSorted(groupRows.map((row) => row['Source Page'])).join(', '),
        pos_all: uniqueSorted(groupRows.map((row) => row.POS || row.pos_final)).join(', '),
        bom_all: uniqueSorted(groupRows.map((row) => row['BOM-No.'])).join(', '),
        source_ids_all: uniqueSorted(groupRows.map((row) => row.ID)).join(', '),
        images_all: uniqueSorted(groupRows.flatMap((row) => getImages(row))).join(', '),
        schemas_all: uniqueSorted(groupRows.flatMap((row) => getSchemas(row))).join(', ')
    };
}

function buildSourceRecords(groupRows) {
    return groupRows.map((row) => ({
        id: t(row.ID),
        engine_model: t(row.engine_model || row.model || row.engine),
        source_file: t(row.__engine_file),
        source_page: t(row['Source Page']),
        pos: t(row.POS || row.pos_final),
        bom: t(row['BOM-No.']),
        designation_final: getDesignation(row),
        measure_final: getMeasure(row),
        weight_final: getWeight(row),
        qa_revision_estado: t(row.qa_revision_estado),
        qa_revision_accion: t(row.qa_revision_accion)
    }));
}

function buildSyntheticCompactedRows(allRows) {
    const byPn = new Map();
    for (const row of allRows) {
        const pn = getPn(row);
        if (!pn) continue;
        const pnKey = key(pn);
        if (!byPn.has(pnKey)) byPn.set(pnKey, []);
        byPn.get(pnKey).push(row);
    }

    const syntheticNew = [];
    const syntheticSuperseded = [];

    for (const groupRows of byPn.values()) {
        const pn = getPn(groupRows[0]);
        const aggregation = buildGlobalAggregation(groupRows);
        const sourceRecords = buildSourceRecords(groupRows);

        const representativeNew = chooseRepresentative(groupRows, 'new');
        if (representativeNew && key(representativeNew.sust_hierarchie) !== 'superseded') {
            syntheticNew.push({
                pn,
                designation: getDesignation(representativeNew),
                measurement: getMeasure(representativeNew),
                weight: getWeight(representativeNew),
                categoria: getCategory(representativeNew),
                sust_tipo: t(representativeNew.sust_hierarchie) || 'New',
                ...aggregation,
                source_records: sourceRecords
            });
        }

        const representativeSup = chooseRepresentative(groupRows, 'superseded');
        if (representativeSup && key(representativeSup.sust_hierarchie) === 'superseded') {
            syntheticSuperseded.push({
                pn,
                designation: getDesignation(representativeSup),
                measurement: getMeasure(representativeSup),
                weight: getWeight(representativeSup),
                categoria: getCategory(representativeSup),
                sust_tipo: 'Superseded',
                new_pn_relacionado: t(representativeSup.sust_new_part_number || representativeSup['New Part Number']),
                old_pn_relacionados: t(representativeSup.sust_superseded_list || representativeSup['Superseded Part Number']),
                ...aggregation,
                source_records: sourceRecords
            });
        }
    }

    syntheticNew.sort((a, b) => a.pn.localeCompare(b.pn, 'es', { numeric: true, sensitivity: 'base' }));
    syntheticSuperseded.sort((a, b) => a.pn.localeCompare(b.pn, 'es', { numeric: true, sensitivity: 'base' }));

    return { syntheticNew, syntheticSuperseded };
}

function buildPreviewAndTraceArtifacts(allRows, compacted) {
    const wpNew = readJson(path.join(WORDPRESS_DIR, 'milu_wp_new_import.json'), []);
    const wpSup = readJson(path.join(WORDPRESS_DIR, 'milu_wp_superseded_import.json'), []);
    const wpPending = readJson(path.join(WORDPRESS_DIR, 'milu_wp_pending_review.json'), []);
    const wpDiscarded = readJson(path.join(WORDPRESS_DIR, 'milu_wp_discarded.json'), []);

    const allWpRows = [
        ...(Array.isArray(wpNew) ? wpNew : []),
        ...(Array.isArray(wpSup) ? wpSup : []),
        ...(Array.isArray(wpPending) ? wpPending : []),
        ...(Array.isArray(wpDiscarded) ? wpDiscarded : [])
    ];

    const compactedIndex = new Map();
    for (const row of compacted.syntheticNew) compactedIndex.set(key(row.pn), { type: 'new', row });
    for (const row of compacted.syntheticSuperseded) compactedIndex.set(key(row.pn), { type: 'superseded', row });

    const byPnRows = new Map();
    for (const row of allRows) {
        const pn = getPn(row);
        if (!pn) continue;
        const pnKey = key(pn);
        if (!byPnRows.has(pnKey)) byPnRows.set(pnKey, []);
        byPnRows.get(pnKey).push(row);
    }

    const previewRows = allWpRows.map((row) => {
        const sku = t(row.sku || row.pn_final || row.pn || row['PART NO.']);
        const pnKey = key(sku);
        const compactedMatch = compactedIndex.get(pnKey);

        return {
            sku,
            import_decision: t(row.import_decision),
            import_reason: t(row.import_reason),
            designation_final: t(row.designation_final || row['meta:designation_final']),
            measure_final: t(row.measure_final || row['meta:measure_final']),
            weight_final: t(row.weight_final || row['meta:weight_final']),
            source_engine_file: t(row.source_engine_file),
            source_id: t(row.source_id),
            total_occurrences_global: Number(compactedMatch?.row?.total_occurrences_global || 0),
            engine_models_all: t(compactedMatch?.row?.engine_models_all),
            source_pages_all: t(compactedMatch?.row?.source_pages_all),
            source_ids_all: t(compactedMatch?.row?.source_ids_all),
            compacted_type: t(compactedMatch?.type)
        };
    });

    const traceMap = {};
    for (const preview of previewRows) {
        const sku = t(preview.sku);
        if (!sku) continue;
        const pnKey = key(sku);
        const sourceRows = byPnRows.get(pnKey) || [];
        const compactedMatch = compactedIndex.get(pnKey);

        traceMap[sku] = {
            sku,
            preview,
            compacted: compactedMatch ? compactedMatch.row : null,
            source_records: buildSourceRecords(sourceRows)
        };
    }

    const conflictRows = previewRows.filter((row) => {
        const decision = key(row.import_decision);
        return decision === 'pending_review' || decision === 'discard';
    });

    const summary = {
        generated_at: new Date().toISOString(),
        preview_total: previewRows.length,
        preview_new: previewRows.filter((row) => key(row.import_decision) === 'import_new').length,
        preview_superseded: previewRows.filter((row) => key(row.import_decision) === 'import_superseded').length,
        preview_pending: previewRows.filter((row) => key(row.import_decision) === 'pending_review').length,
        preview_discarded: previewRows.filter((row) => key(row.import_decision) === 'discard').length,
        conflict_rows: conflictRows.length,
        synthetic_new_compacted: compacted.syntheticNew.length,
        synthetic_superseded_compacted: compacted.syntheticSuperseded.length
    };

    return { previewRows, traceMap, conflictRows, summary };
}

function writeSummaryMarkdown(summary, filePath) {
    const lines = [
        '# WordPress Export Review Summary',
        '',
        `Generated at: ${summary.generated_at}`,
        '',
        '## Preview',
        `- Total rows: ${summary.preview_total}`,
        `- import_new: ${summary.preview_new}`,
        `- import_superseded: ${summary.preview_superseded}`,
        `- pending_review: ${summary.preview_pending}`,
        `- discard: ${summary.preview_discarded}`,
        '',
        '## Compacted Synthetic',
        `- synthetic_new_compacted: ${summary.synthetic_new_compacted}`,
        `- synthetic_superseded_compacted: ${summary.synthetic_superseded_compacted}`,
        '',
        `## Conflict rows: ${summary.conflict_rows}`
    ];
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function runSyntheticCompaction(repoRoot = REPO_ROOT) {
    ensureDir(EXPORT_REVIEW_DIR);
    const allRows = loadAllEngineRows(repoRoot);
    const compacted = buildSyntheticCompactedRows(allRows);

    writeJson(path.join(EXPORT_REVIEW_DIR, 'synthetic_new_compacted.json'), compacted.syntheticNew);
    writeJson(path.join(EXPORT_REVIEW_DIR, 'synthetic_superseded_compacted.json'), compacted.syntheticSuperseded);

    return {
        all_rows: allRows.length,
        synthetic_new_compacted: compacted.syntheticNew.length,
        synthetic_superseded_compacted: compacted.syntheticSuperseded.length
    };
}

function runPreviewBuild(repoRoot = REPO_ROOT) {
    ensureDir(EXPORT_REVIEW_DIR);
    const allRows = loadAllEngineRows(repoRoot);

    const syntheticNew = readJson(path.join(EXPORT_REVIEW_DIR, 'synthetic_new_compacted.json'), null);
    const syntheticSuperseded = readJson(path.join(EXPORT_REVIEW_DIR, 'synthetic_superseded_compacted.json'), null);
    const compacted = (Array.isArray(syntheticNew) && Array.isArray(syntheticSuperseded))
        ? { syntheticNew, syntheticSuperseded }
        : buildSyntheticCompactedRows(allRows);

    if (!Array.isArray(syntheticNew) || !Array.isArray(syntheticSuperseded)) {
        writeJson(path.join(EXPORT_REVIEW_DIR, 'synthetic_new_compacted.json'), compacted.syntheticNew);
        writeJson(path.join(EXPORT_REVIEW_DIR, 'synthetic_superseded_compacted.json'), compacted.syntheticSuperseded);
    }

    const artifacts = buildPreviewAndTraceArtifacts(allRows, compacted);

    writeJson(path.join(EXPORT_REVIEW_DIR, 'wordpress_export_preview.json'), artifacts.previewRows);
    writeJson(path.join(EXPORT_REVIEW_DIR, 'wordpress_export_trace.json'), artifacts.traceMap);

    writeCsv(
        path.join(EXPORT_REVIEW_DIR, 'wordpress_export_preview.csv'),
        artifacts.previewRows,
        [
            'sku',
            'import_decision',
            'import_reason',
            'designation_final',
            'measure_final',
            'weight_final',
            'source_engine_file',
            'source_id',
            'total_occurrences_global',
            'engine_models_all',
            'source_pages_all',
            'source_ids_all',
            'compacted_type'
        ]
    );

    writeCsv(
        path.join(EXPORT_REVIEW_DIR, 'wordpress_export_conflicts.csv'),
        artifacts.conflictRows,
        [
            'sku',
            'import_decision',
            'import_reason',
            'designation_final',
            'source_engine_file',
            'source_id',
            'total_occurrences_global'
        ]
    );

    writeSummaryMarkdown(artifacts.summary, path.join(EXPORT_REVIEW_DIR, 'wordpress_export_summary.md'));

    return artifacts.summary;
}

function runAll(repoRoot = REPO_ROOT) {
    const synthetic = runSyntheticCompaction(repoRoot);
    const summary = runPreviewBuild(repoRoot);
    return { synthetic, summary };
}

if (require.main === module) {
    const mode = String(process.argv[2] || 'all').trim().toLowerCase();
    if (mode === 'synthetic') {
        const result = runSyntheticCompaction(REPO_ROOT);
        console.log(JSON.stringify({ ok: true, mode, result }, null, 2));
    } else if (mode === 'preview') {
        const result = runPreviewBuild(REPO_ROOT);
        console.log(JSON.stringify({ ok: true, mode, result }, null, 2));
    } else {
        const result = runAll(REPO_ROOT);
        console.log(JSON.stringify({ ok: true, mode: 'all', result }, null, 2));
    }
}

module.exports = {
    runSyntheticCompaction,
    runPreviewBuild,
    runAll
};
