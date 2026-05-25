const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../../../engine_files');
const mergeRules = require('./synthetic_merge_rules');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const WORDPRESS_DIR = path.join(REPO_ROOT, 'data', '05-wordpress');
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

// Fase 2 — jerarquía explícita de fuentes por campo (mayor a menor prioridad).
function designationTiers(row) {
    return [
        [collapseSpaces(row.designation_gesa)],
        [collapseSpaces(row.designation_final)],
        [collapseSpaces(row.DESIGNATION)]
    ];
}

function measureTiers(row) {
    return [
        [collapseSpaces(row.dimensions_gesa)],
        [collapseSpaces(row.measure_final || row.measurement_final)],
        [collapseSpaces(row['MEASUREMENT / STANDARD'])]
    ];
}

function weightTiers(row) {
    return [
        [collapseSpaces(row.weight_gesa)],
        [collapseSpaces(row.weight_final)],
        [collapseSpaces(row.WEIGHT)]
    ];
}

// Acumula los tiers de un grupo en arrays paralelos por nivel jerárquico.
function aggregateTiers(rows, tiersFn) {
    const aggregated = [[], [], []];
    for (const row of rows) {
        const tiers = tiersFn(row);
        for (let i = 0; i < aggregated.length; i += 1) {
            for (const value of tiers[i] || []) {
                if (value) aggregated[i].push(value);
            }
        }
    }
    return aggregated;
}

function flatOccurrences(rows, getter) {
    const out = [];
    for (const row of rows) {
        const value = getter(row);
        if (value) out.push(value);
    }
    return out;
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

        // Particionar por jerarquía superseded.
        const supersededRows = groupRows.filter((r) => key(r.sust_hierarchie) === 'superseded');
        const newRows = groupRows.filter((r) => key(r.sust_hierarchie) !== 'superseded');

        if (newRows.length > 0) {
            const merged = mergeGroupForSynthetic({
                pn,
                groupRows: newRows,
                aggregation,
                sourceRecords,
                mode: 'new'
            });
            if (merged) syntheticNew.push(merged);
        }

        if (supersededRows.length > 0) {
            const merged = mergeGroupForSynthetic({
                pn,
                groupRows: supersededRows,
                aggregation,
                sourceRecords,
                mode: 'superseded'
            });
            if (merged) syntheticSuperseded.push(merged);
        }
    }

    syntheticNew.sort((a, b) => a.pn.localeCompare(b.pn, 'es', { numeric: true, sensitivity: 'base' }));
    syntheticSuperseded.sort((a, b) => a.pn.localeCompare(b.pn, 'es', { numeric: true, sensitivity: 'base' }));

    return { syntheticNew, syntheticSuperseded };
}

// Fusión inteligente Fase 3-6: jerarquía + dominante + tolerancia OCR + score + decisión.
function mergeGroupForSynthetic({ pn, groupRows, aggregation, sourceRecords, mode }) {
    const designationTierValues = aggregateTiers(groupRows, designationTiers);
    const measureTierValues = aggregateTiers(groupRows, measureTiers);
    const weightTierValues = aggregateTiers(groupRows, weightTiers);

    const designationOccurrences = flatOccurrences(groupRows, getDesignation);
    const measureOccurrences = flatOccurrences(groupRows, getMeasure);
    const weightOccurrences = flatOccurrences(groupRows, getWeight);

    const designationResolution = mergeRules.resolveTextField(designationTierValues, designationOccurrences);
    const measureResolution = mergeRules.resolveTextField(measureTierValues, measureOccurrences);
    const weightResolution = mergeRules.resolveTextField(weightTierValues, weightOccurrences);

    const fieldResolutions = {
        designation: designationResolution,
        measure: measureResolution,
        weight: weightResolution
    };
    const consistency = mergeRules.computeConsistencyMetrics(fieldResolutions);

    // Categoría: dominante tolerante.
    const categoryDominant = mergeRules.pickDominant(flatOccurrences(groupRows, getCategory));
    const category = categoryDominant.value || '';

    // SUST: prioridad sust_new_part_number; debe ser único entre fuentes para ser consistente.
    const sustNewSet = mergeRules.uniqueNonEmpty(groupRows.map((r) => r.sust_new_part_number || r['New Part Number']));
    const sustOldSet = mergeRules.uniqueNonEmpty(groupRows.map((r) => r.sust_superseded_list || r['Superseded Part Number']));
    const sustNewDominant = mergeRules.pickDominant(groupRows.map((r) => r.sust_new_part_number || r['New Part Number']));
    const sustOldDominant = mergeRules.pickDominant(groupRows.map((r) => r.sust_superseded_list || r['Superseded Part Number']));

    const hasSupersededSignal = mode === 'superseded';
    const hasClearSupersededRelation = hasSupersededSignal
        ? (sustNewSet.length === 1 || sustNewDominant.agreement >= 0.6)
        : true;

    const qaActions = mergeRules.uniqueNonEmpty(groupRows.map((r) => r.qa_revision_accion)).map((v) => v.toLowerCase());
    const qaStates = mergeRules.uniqueNonEmpty(groupRows.map((r) => r.qa_revision_estado)).map((v) => v.toLowerCase());

    const decision = mergeRules.computeMergeDecision({
        pn,
        consistency,
        hasDesignation: !!designationResolution.value,
        hasMeasure: !!measureResolution.value,
        hasSupersededSignal,
        hasClearSupersededRelation,
        qaActions,
        qaStates
    });

    const sustTipo = hasSupersededSignal ? 'Superseded' : 'New';

    const base = {
        pn,
        designation: designationResolution.value,
        measurement: measureResolution.value,
        weight: weightResolution.value,
        categoria: category,
        sust_tipo: sustTipo,
        ...aggregation,
        merge_quality: {
            consistency_score: consistency.consistency_score,
            field_agreement_ratio: consistency.field_agreement_ratio,
            conflict_severity: consistency.conflict_severity,
            real_conflict_fields: consistency.real_conflict_fields,
            truncation_only_fields: consistency.truncation_only_fields,
            field_resolutions: {
                designation: {
                    source_tier: designationResolution.source_tier,
                    agreement: Number(designationResolution.agreement.toFixed(3)),
                    distinct_values: designationResolution.distinct_values,
                    truncation_likely: designationResolution.truncation_likely,
                    conflict_real: designationResolution.conflict_real
                },
                measure: {
                    source_tier: measureResolution.source_tier,
                    agreement: Number(measureResolution.agreement.toFixed(3)),
                    distinct_values: measureResolution.distinct_values,
                    truncation_likely: measureResolution.truncation_likely,
                    conflict_real: measureResolution.conflict_real
                },
                weight: {
                    source_tier: weightResolution.source_tier,
                    agreement: Number(weightResolution.agreement.toFixed(3)),
                    distinct_values: weightResolution.distinct_values,
                    truncation_likely: weightResolution.truncation_likely,
                    conflict_real: weightResolution.conflict_real
                }
            }
        },
        merge_decision: decision.decision,
        merge_decision_reasons: decision.reasons,
        source_records: sourceRecords
    };

    if (hasSupersededSignal) {
        base.new_pn_relacionado = sustNewDominant.value || sustNewSet[0] || '';
        base.old_pn_relacionados = sustOldDominant.value || sustOldSet[0] || '';
    }

    return base;
}

function buildPreviewAndTraceArtifacts(allRows, compacted) {
    const wpImport = readJson(path.join(WORDPRESS_DIR, 'milu_wp_import.json'), null);
    const wpNew = Array.isArray(wpImport)
        ? wpImport
        : readJson(path.join(WORDPRESS_DIR, 'milu_wp_new_import.json'), []);
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
        preview_import: previewRows.filter((row) => {
            const decision = key(row.import_decision);
            return decision === 'import' || decision === 'import_new' || decision === 'import_superseded';
        }).length,
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
        `- import: ${summary.preview_import}`,
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
