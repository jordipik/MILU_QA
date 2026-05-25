#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { detectModelsFromEngineFiles } = require('./scripts/compare_rebuild_vs_engine');

const REPO_ROOT = __dirname;
const REBUILD_DIR = path.join(REPO_ROOT, 'data', '02-engine_rebuild');
const DEFAULT_OUT_DIR = path.join('data', 'output', 'rebuild_equivalence_analysis');

const BLOCK_FIELDS = {
    identity: ['ID', 'rebuild_legacy_engine_id', 'pn_final', 'pos_final', 'Source Page'],
    pdf: ['pn_pdf', 'pos_pdf', 'designation_pdf', 'qty_pdf', 'measure_pdf', 'norma_pdf', 'fg_fgs_pdf', 'bom_pdf'],
    final: ['designation_final', 'qty_final', 'units_final', 'weight_final', 'measure_final', 'norma_final', 'fn_final', 'fg_fgs_final', 'bom_final'],
    qa: ['qa_revision_estado', 'qa_revision_accion', 'total_error', 'has_error'],
    assets: ['filename_foto', 'ruta_foto', 'esquemas', 'esquemas_circulos', 'esquemas_circulos_all', 'ruta_esquemas_pos', 'exp_imagenes'],
    gesa: ['gesa', 'designation_gesa', 'nsn', 'norma', 'normalizado', 'dimensions_gesa', 'weight_gesa'],
    sust: ['sust_status', 'sust_hierarchie', 'sust_new_part_number', 'sust_superseded_list']
};

const CRITICAL_FIELDS = new Set([
    'ID',
    'pn_final',
    'pos_final',
    'Source Page',
    'designation_final',
    'qty_final',
    'units_final',
    'weight_final',
    'measure_final',
    'norma_final',
    'fg_fgs_final',
    'bom_final',
    'qa_revision_estado',
    'qa_revision_accion',
    'total_error',
    'has_error',
    'filename_foto',
    'ruta_foto',
    'esquemas',
    'esquemas_circulos',
    'esquemas_circulos_all',
    'ruta_esquemas_pos',
    'exp_imagenes',
    'gesa',
    'designation_gesa',
    'nsn',
    'norma',
    'normalizado',
    'dimensions_gesa',
    'weight_gesa',
    'sust_status',
    'sust_hierarchie',
    'sust_new_part_number',
    'sust_superseded_list'
]);

const EXPECTED_REBUILD_DIFF_FIELDS = new Set(['ID', 'rebuild_legacy_engine_id']);

const ORDERED_BLOCKS = ['identity', 'pdf', 'final', 'qa', 'assets', 'gesa', 'sust', 'legacy_metadata'];

function t(value) {
    return String(value == null ? '' : value).trim();
}

function normalizeModelToken(raw) {
    const text = t(raw);
    if (!text) return '';
    const match = text.match(/^(?:engine_|engine_rebuild_)?(.+?)(?:\.json)?$/i);
    return t(match ? match[1] : text);
}

function parseIntSafe(raw, fallback) {
    const n = Number.parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseArgs(argv) {
    const args = {
        engine: '',
        all: false,
        sample: 100,
        out: DEFAULT_OUT_DIR,
        dryRun: true,
        write: false,
        help: false
    };

    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];

        if (token === '--engine') {
            args.engine = t(argv[i + 1]);
            i += 1;
            continue;
        }
        if (token === '--all') {
            args.all = true;
            continue;
        }
        if (token === '--sample') {
            args.sample = parseIntSafe(argv[i + 1], 100);
            i += 1;
            continue;
        }
        if (token === '--out') {
            args.out = t(argv[i + 1]) || DEFAULT_OUT_DIR;
            i += 1;
            continue;
        }
        if (token === '--dry-run') {
            args.dryRun = true;
            continue;
        }
        if (token === '--write') {
            args.write = true;
            args.dryRun = false;
            continue;
        }
        if (token === '--help' || token === '-h') {
            args.help = true;
            continue;
        }

        throw new Error(`Argumento no reconocido: ${token}`);
    }

    if (args.help) return args;
    if (args.all && args.engine) throw new Error('Use solo uno: --all o --engine <MODEL>.');
    if (!args.all && !args.engine) throw new Error('Debe indicar --all o --engine <MODEL>.');

    if (!args.all) {
        args.engine = normalizeModelToken(args.engine);
        if (!args.engine) throw new Error('El valor de --engine no es valido.');
    }

    return args;
}

function printHelp() {
    console.log([
        'Uso:',
        '  node analyze_rebuild_equivalence_causes.js --engine 12V4000M40A --sample 100 --dry-run',
        '  node analyze_rebuild_equivalence_causes.js --all --sample 50 --dry-run',
        '  node analyze_rebuild_equivalence_causes.js --all --sample 200 --write',
        '',
        'Flags:',
        '  --engine MODEL      Modelo concreto',
        '  --all               Todos los modelos detectados por engine_*.json',
        '  --sample N          Maximo de registros engine analizados por modelo (default: 100)',
        '  --out DIR           Carpeta de salida (default: data/output/rebuild_equivalence_analysis/)',
        '  --dry-run           No escribe reportes (default)',
        '  --write             Escribe reportes JSON/CSV',
        '  --help              Muestra esta ayuda'
    ].join('\n'));
}

function listModels(args) {
    if (args.all) {
        const models = detectModelsFromEngineFiles(REPO_ROOT);
        if (!models.length) {
            throw new Error('No se detectaron archivos engine_<MODEL>.json en la raiz del repo.');
        }
        return models;
    }
    return [args.engine];
}

function readJsonArray(filePath, label) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error(`${label} no contiene un array JSON.`);
    }
    return parsed;
}

function getEnginePath(model) {
    return path.join(REPO_ROOT, `engine_${model}.json`);
}

function getRebuildPath(model) {
    return path.join(REBUILD_DIR, `engine_rebuild_${model}.json`);
}

function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function isEmpty(value) {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

function sortDeep(value) {
    if (Array.isArray(value)) return value.map(sortDeep);
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
        const out = {};
        for (const key of keys) out[key] = sortDeep(value[key]);
        return out;
    }
    return value;
}

function stableStringify(value) {
    return JSON.stringify(sortDeep(value));
}

function normalizeForFormatting(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ');
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return stableStringify(value);
}

function valueForCsv(value) {
    if (value === undefined) return '__undefined__';
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function csvEscape(value) {
    const text = String(value == null ? '' : value);
    if (!/[",\n\r]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(filePath, rows) {
    const header = ['model', 'engine_id', 'rebuild_id', 'block', 'field', 'diff_type', 'engine_value', 'rebuild_value'];
    const lines = [header.join(',')];
    for (const row of rows) {
        lines.push([
            csvEscape(row.model),
            csvEscape(row.engine_id),
            csvEscape(row.rebuild_id),
            csvEscape(row.block),
            csvEscape(row.field),
            csvEscape(row.diff_type),
            csvEscape(valueForCsv(row.engine_value)),
            csvEscape(valueForCsv(row.rebuild_value))
        ].join(','));
    }
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function toSet(values) {
    return new Set(values);
}

function getKnownBlockFieldSet() {
    const all = [];
    for (const fields of Object.values(BLOCK_FIELDS)) {
        for (const field of fields) all.push(field);
    }
    return toSet(all);
}

const KNOWN_BLOCK_FIELDS = getKnownBlockFieldSet();

function getBlockForField(field) {
    for (const [block, fields] of Object.entries(BLOCK_FIELDS)) {
        if (fields.includes(field)) return block;
    }
    return 'legacy_metadata';
}

function getPnToken(row) {
    return t(row && row.pn_final);
}

function isSyntheticRebuildRow(row) {
    const id = t(row && row.ID);
    const legacy = t(row && row.rebuild_legacy_engine_id);
    return /^RB-/i.test(id) && !legacy;
}

function hasAssetData(row) {
    const fields = BLOCK_FIELDS.assets;
    return fields.some((field) => !isEmpty(row && row[field]));
}

function hasQaData(row) {
    const fields = BLOCK_FIELDS.qa;
    return fields.some((field) => !isEmpty(row && row[field]));
}

function hasFinalData(row) {
    const fields = BLOCK_FIELDS.final;
    return fields.some((field) => !isEmpty(row && row[field]));
}

function hasGesaSustData(row) {
    return [...BLOCK_FIELDS.gesa, ...BLOCK_FIELDS.sust].some((field) => !isEmpty(row && row[field]));
}

function hasErrors(row) {
    const totalError = Number(row && row.total_error);
    if (Number.isFinite(totalError) && totalError > 0) return true;
    return String(row && row.has_error).toLowerCase() === 'true';
}

function hasKeMarker(row) {
    const probes = [
        row && row.designation_final,
        row && row.designation_pdf,
        row && row.DESIGNATION,
        row && row.pn_final,
        row && row['PART NO.'],
        row && row['Denomination (New Part Number)']
    ];
    return probes.some((value) => /\bKE\b/i.test(t(value)));
}

function buildRebuildIndexes(rebuildRows) {
    const byLegacyId = new Map();
    const byPn = new Map();
    const syntheticByPn = new Map();

    for (let index = 0; index < rebuildRows.length; index += 1) {
        const row = rebuildRows[index] || {};
        const legacyId = t(row.rebuild_legacy_engine_id);
        const pn = getPnToken(row);
        const synthetic = isSyntheticRebuildRow(row);

        if (legacyId) {
            if (!byLegacyId.has(legacyId)) byLegacyId.set(legacyId, []);
            byLegacyId.get(legacyId).push({ row, index });
        }

        if (pn) {
            if (!byPn.has(pn)) byPn.set(pn, []);
            byPn.get(pn).push({ row, index });
            if (synthetic) {
                if (!syntheticByPn.has(pn)) syntheticByPn.set(pn, []);
                syntheticByPn.get(pn).push({ row, index });
            }
        }
    }

    return { byLegacyId, byPn, syntheticByPn };
}

function scoreCandidate(engineRow, candidate, hasLegacyMatch) {
    let score = 0;
    if (hasLegacyMatch) score += 100;

    if (getPnToken(engineRow) && getPnToken(candidate.row) && getPnToken(engineRow) === getPnToken(candidate.row)) score += 20;
    if (t(engineRow && engineRow.pos_final) && t(engineRow && engineRow.pos_final) === t(candidate.row && candidate.row.pos_final)) score += 8;
    if (t(engineRow && engineRow['Source Page']) && t(engineRow && engineRow['Source Page']) === t(candidate.row && candidate.row['Source Page'])) score += 5;

    if (!isSyntheticRebuildRow(candidate.row)) score += 2;
    if (hasAssetData(candidate.row)) score += 1;

    return score;
}

function pickBestRebuildMatch(engineRow, rebuildIndexes) {
    const engineId = t(engineRow && engineRow.ID);
    const pn = getPnToken(engineRow);

    const candidates = [];
    const seen = new Set();

    const fromLegacy = rebuildIndexes.byLegacyId.get(engineId) || [];
    for (const c of fromLegacy) {
        const key = `${c.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({ ...c, reasons: ['legacy_id_match'] });
    }

    const fromPn = (pn ? rebuildIndexes.byPn.get(pn) : null) || [];
    for (const c of fromPn) {
        const key = `${c.index}`;
        if (seen.has(key)) {
            const existing = candidates.find((x) => x.index === c.index);
            if (existing && !existing.reasons.includes('pn_match')) existing.reasons.push('pn_match');
            continue;
        }
        seen.add(key);
        candidates.push({ ...c, reasons: ['pn_match'] });
    }

    if (!candidates.length) return null;

    for (const candidate of candidates) {
        const hasLegacy = candidate.reasons.includes('legacy_id_match');
        candidate.score = scoreCandidate(engineRow, candidate, hasLegacy);
    }

    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return t(a.row && a.row.ID).localeCompare(t(b.row && b.row.ID));
    });

    return {
        selected: candidates[0],
        candidates
    };
}

function buildEngineCandidates(engineRows, rebuildIndexes) {
    const candidates = [];
    for (let index = 0; index < engineRows.length; index += 1) {
        const engineRow = engineRows[index] || {};
        const match = pickBestRebuildMatch(engineRow, rebuildIndexes);
        if (!match) continue;

        const pn = getPnToken(engineRow);
        const hasSyntheticContext = Boolean((pn && rebuildIndexes.syntheticByPn.get(pn) && rebuildIndexes.syntheticByPn.get(pn).length) || false);

        const flags = {
            assets: hasAssetData(engineRow),
            qa: hasQaData(engineRow),
            finals: hasFinalData(engineRow),
            gesa_sust: hasGesaSustData(engineRow),
            synthetic_rows: hasSyntheticContext,
            errors: hasErrors(engineRow),
            ke: hasKeMarker(engineRow)
        };

        const score =
            (flags.assets ? 20 : 0) +
            (flags.qa ? 12 : 0) +
            (flags.finals ? 12 : 0) +
            (flags.gesa_sust ? 10 : 0) +
            (flags.synthetic_rows ? 8 : 0) +
            (flags.errors ? 10 : 0) +
            (flags.ke ? 6 : 0) +
            match.selected.score;

        candidates.push({
            engine_index: index,
            engine_row: engineRow,
            rebuild_selected: match.selected,
            rebuild_candidates_count: match.candidates.length,
            flags,
            score
        });
    }
    return candidates;
}

function selectSample(candidates, sampleSize) {
    const sorted = candidates.slice().sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aId = t(a.engine_row && a.engine_row.ID);
        const bId = t(b.engine_row && b.engine_row.ID);
        return aId.localeCompare(bId);
    });

    return sorted.slice(0, Math.min(sampleSize, sorted.length));
}

function initBlockStats() {
    const stats = {};
    for (const block of ORDERED_BLOCKS) {
        stats[block] = {
            equal_count: 0,
            diff_count: 0,
            missing_count: 0,
            coverage_percent: 0,
            diff_types: {
                exact_match: 0,
                formatting_diff: 0,
                empty_vs_value: 0,
                expected_rebuild_diff: 0,
                critical_missing: 0
            }
        };
    }
    return stats;
}

function classifyFieldDiff(field, engineValue, rebuildValue, engineRow, rebuildRow) {
    if (stableStringify(engineValue) === stableStringify(rebuildValue)) return 'exact_match';
    if (normalizeForFormatting(engineValue) === normalizeForFormatting(rebuildValue)) return 'formatting_diff';

    if (EXPECTED_REBUILD_DIFF_FIELDS.has(field)) {
        if (field === 'ID') {
            const legacy = t(rebuildRow && rebuildRow.rebuild_legacy_engine_id);
            const engineId = t(engineRow && engineRow.ID);
            if (legacy && engineId && legacy === engineId) return 'expected_rebuild_diff';
        } else {
            return 'expected_rebuild_diff';
        }
    }

    const engineEmpty = isEmpty(engineValue);
    const rebuildEmpty = isEmpty(rebuildValue);

    if (!engineEmpty && rebuildEmpty && CRITICAL_FIELDS.has(field)) return 'critical_missing';
    return 'empty_vs_value';
}

function addTopCount(counter, key, increment) {
    const inc = Number.isFinite(increment) ? increment : 1;
    counter[key] = (counter[key] || 0) + inc;
}

function buildLegacyFields(engineRow, rebuildRow) {
    const keys = new Set([...Object.keys(engineRow || {}), ...Object.keys(rebuildRow || {})]);
    const out = [];
    for (const key of keys) {
        if (!KNOWN_BLOCK_FIELDS.has(key)) out.push(key);
    }
    return out.sort((a, b) => a.localeCompare(b));
}

function analyzePair(model, engineRow, rebuildRow, blockStats, csvRows, counters) {
    const engineId = t(engineRow && engineRow.ID);
    const rebuildId = t(rebuildRow && rebuildRow.ID);

    for (const block of ORDERED_BLOCKS) {
        const fields = block === 'legacy_metadata'
            ? buildLegacyFields(engineRow, rebuildRow)
            : BLOCK_FIELDS[block];

        for (const field of fields) {
            const hasEngine = hasOwn(engineRow || {}, field);
            const hasRebuild = hasOwn(rebuildRow || {}, field);

            if (!hasEngine && !hasRebuild) {
                continue;
            }

            const engineValue = hasEngine ? engineRow[field] : undefined;
            const rebuildValue = hasRebuild ? rebuildRow[field] : undefined;

            let diffType = 'exact_match';
            let missing = false;
            let equal = false;

            if (hasEngine && !hasRebuild) {
                missing = true;
                diffType = CRITICAL_FIELDS.has(field) && !isEmpty(engineValue) ? 'critical_missing' : 'empty_vs_value';
            } else if (!hasEngine && hasRebuild) {
                diffType = 'expected_rebuild_diff';
            } else {
                diffType = classifyFieldDiff(field, engineValue, rebuildValue, engineRow, rebuildRow);
                equal = diffType === 'exact_match';
                if (diffType === 'critical_missing') missing = true;
            }

            const target = blockStats[block];
            target.diff_types[diffType] += 1;

            if (equal) {
                target.equal_count += 1;
            } else if (missing) {
                target.missing_count += 1;
            } else {
                target.diff_count += 1;
            }

            if (diffType !== 'exact_match') {
                csvRows.push({
                    model,
                    engine_id: engineId,
                    rebuild_id: rebuildId,
                    block,
                    field,
                    diff_type: diffType,
                    engine_value: engineValue,
                    rebuild_value: rebuildValue
                });

                addTopCount(counters.topDiffFields, `${block}::${field}`);
                if (diffType === 'critical_missing') addTopCount(counters.topCriticalMissingFields, `${block}::${field}`);
                if (diffType === 'formatting_diff') addTopCount(counters.topFormattingDiffs, `${block}::${field}`);
            }
        }
    }
}

function finalizeCoverage(blockStats) {
    for (const block of ORDERED_BLOCKS) {
        const entry = blockStats[block];
        const total = entry.equal_count + entry.diff_count + entry.missing_count;
        entry.coverage_percent = total > 0 ? Number(((entry.equal_count * 100) / total).toFixed(2)) : 0;
    }
}

function sortCounter(counter, mapFn) {
    return Object.entries(counter)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([key, count]) => mapFn(key, count));
}

function parseBlockField(key) {
    const idx = key.indexOf('::');
    if (idx === -1) return { block: 'unknown', field: key };
    return {
        block: key.slice(0, idx),
        field: key.slice(idx + 2)
    };
}

function summarizeFlags(rows) {
    const out = {
        assets: 0,
        qa: 0,
        finals: 0,
        gesa_sust: 0,
        synthetic_rows: 0,
        errors: 0,
        ke: 0
    };
    for (const item of rows) {
        for (const key of Object.keys(out)) {
            if (item.flags[key]) out[key] += 1;
        }
    }
    return out;
}

function analyzeModel(model, args) {
    const enginePath = getEnginePath(model);
    const rebuildPath = getRebuildPath(model);

    if (!fs.existsSync(enginePath)) {
        throw new Error(`No existe engine: ${path.relative(REPO_ROOT, enginePath).replace(/\\/g, '/')}`);
    }
    if (!fs.existsSync(rebuildPath)) {
        throw new Error(`No existe rebuild: ${path.relative(REPO_ROOT, rebuildPath).replace(/\\/g, '/')}`);
    }

    const engineRows = readJsonArray(enginePath, path.basename(enginePath));
    const rebuildRows = readJsonArray(rebuildPath, path.basename(rebuildPath));
    const rebuildIndexes = buildRebuildIndexes(rebuildRows);

    const candidates = buildEngineCandidates(engineRows, rebuildIndexes);
    const sampleRows = selectSample(candidates, args.sample);

    const blockStats = initBlockStats();
    const csvRows = [];
    const counters = {
        topDiffFields: {},
        topCriticalMissingFields: {},
        topFormattingDiffs: {}
    };

    for (const item of sampleRows) {
        analyzePair(model, item.engine_row, item.rebuild_selected.row, blockStats, csvRows, counters);
    }

    finalizeCoverage(blockStats);

    const topMissingBlocks = ORDERED_BLOCKS
        .map((block) => ({ block, missing_count: blockStats[block].missing_count }))
        .sort((a, b) => b.missing_count - a.missing_count || a.block.localeCompare(b.block));

    const topDiffFields = sortCounter(counters.topDiffFields, (key, count) => {
        const parsed = parseBlockField(key);
        return { block: parsed.block, field: parsed.field, count };
    });

    const topCriticalMissingFields = sortCounter(counters.topCriticalMissingFields, (key, count) => {
        const parsed = parseBlockField(key);
        return { block: parsed.block, field: parsed.field, count };
    });

    const topFormattingDiffs = sortCounter(counters.topFormattingDiffs, (key, count) => {
        const parsed = parseBlockField(key);
        return { block: parsed.block, field: parsed.field, count };
    });

    const syntheticRowsAll = rebuildRows.filter((row) => isSyntheticRebuildRow(row));
    const enginePnSet = new Set(engineRows.map((row) => getPnToken(row)).filter(Boolean));
    const syntheticRowsMatchedByPn = syntheticRowsAll.filter((row) => enginePnSet.has(getPnToken(row)));
    const selectedSyntheticContext = sampleRows.filter((row) => row.flags.synthetic_rows).length;
    const selectedRebuildSynthetic = sampleRows.filter((row) => isSyntheticRebuildRow(row.rebuild_selected.row)).length;

    const totalCompared = ORDERED_BLOCKS.reduce((acc, block) => {
        const entry = blockStats[block];
        return acc + entry.equal_count + entry.diff_count + entry.missing_count;
    }, 0);
    const totalEqual = ORDERED_BLOCKS.reduce((acc, block) => acc + blockStats[block].equal_count, 0);

    return {
        model,
        generated_at: new Date().toISOString(),
        input: {
            engine_path: path.relative(REPO_ROOT, enginePath).replace(/\\/g, '/'),
            rebuild_path: path.relative(REPO_ROOT, rebuildPath).replace(/\\/g, '/'),
            sample_limit: args.sample
        },
        sampling: {
            engine_total: engineRows.length,
            rebuild_total: rebuildRows.length,
            matched_engine_candidates: candidates.length,
            selected_sample: sampleRows.length,
            selected_flags_summary: summarizeFlags(sampleRows)
        },
        equivalence_percent_by_block: ORDERED_BLOCKS.reduce((out, block) => {
            out[block] = blockStats[block].coverage_percent;
            return out;
        }, {}),
        blocks: blockStats,
        top_missing_blocks: topMissingBlocks,
        top_diff_fields: topDiffFields,
        top_critical_missing_fields: topCriticalMissingFields,
        top_formatting_diffs: topFormattingDiffs,
        critical_missing_summary: {
            total: topCriticalMissingFields.reduce((acc, item) => acc + item.count, 0),
            top_fields: topCriticalMissingFields.slice(0, 20)
        },
        formatting_diff_summary: {
            total: topFormattingDiffs.reduce((acc, item) => acc + item.count, 0),
            top_fields: topFormattingDiffs.slice(0, 20)
        },
        synthetic_rows_summary: {
            rebuild_total_synthetic_rows: syntheticRowsAll.length,
            rebuild_synthetic_rows_matched_by_pn: syntheticRowsMatchedByPn.length,
            selected_pairs_with_synthetic_context: selectedSyntheticContext,
            selected_rebuild_rows_that_are_synthetic: selectedRebuildSynthetic
        },
        equivalence_summary: {
            total_compared_fields: totalCompared,
            total_equal_fields: totalEqual,
            overall_equivalence_percent: totalCompared > 0 ? Number(((totalEqual * 100) / totalCompared).toFixed(2)) : 0
        },
        csv_rows: csvRows
    };
}

function aggregateGlobal(modelReports, args, failures) {
    const blocks = initBlockStats();
    const diffFieldsCounter = {};
    const criticalCounter = {};
    const formattingCounter = {};

    const syntheticRowsSummary = {
        rebuild_total_synthetic_rows: 0,
        rebuild_synthetic_rows_matched_by_pn: 0,
        selected_pairs_with_synthetic_context: 0,
        selected_rebuild_rows_that_are_synthetic: 0
    };

    let totalCompared = 0;
    let totalEqual = 0;

    for (const report of modelReports) {
        for (const block of ORDERED_BLOCKS) {
            const src = report.blocks[block];
            const dst = blocks[block];
            dst.equal_count += src.equal_count;
            dst.diff_count += src.diff_count;
            dst.missing_count += src.missing_count;
            for (const diffType of Object.keys(dst.diff_types)) {
                dst.diff_types[diffType] += src.diff_types[diffType] || 0;
            }
        }

        totalCompared += report.equivalence_summary.total_compared_fields;
        totalEqual += report.equivalence_summary.total_equal_fields;

        syntheticRowsSummary.rebuild_total_synthetic_rows += report.synthetic_rows_summary.rebuild_total_synthetic_rows;
        syntheticRowsSummary.rebuild_synthetic_rows_matched_by_pn += report.synthetic_rows_summary.rebuild_synthetic_rows_matched_by_pn;
        syntheticRowsSummary.selected_pairs_with_synthetic_context += report.synthetic_rows_summary.selected_pairs_with_synthetic_context;
        syntheticRowsSummary.selected_rebuild_rows_that_are_synthetic += report.synthetic_rows_summary.selected_rebuild_rows_that_are_synthetic;

        for (const item of report.top_diff_fields) {
            addTopCount(diffFieldsCounter, `${item.block}::${item.field}`, item.count);
        }
        for (const item of report.top_critical_missing_fields) {
            addTopCount(criticalCounter, `${item.block}::${item.field}`, item.count);
        }
        for (const item of report.top_formatting_diffs) {
            addTopCount(formattingCounter, `${item.block}::${item.field}`, item.count);
        }
    }

    finalizeCoverage(blocks);

    const topMissingBlocks = ORDERED_BLOCKS
        .map((block) => ({ block, missing_count: blocks[block].missing_count }))
        .sort((a, b) => b.missing_count - a.missing_count || a.block.localeCompare(b.block));

    const topDiffFields = sortCounter(diffFieldsCounter, (key, count) => {
        const parsed = parseBlockField(key);
        return { block: parsed.block, field: parsed.field, count };
    });

    const topCriticalMissingFields = sortCounter(criticalCounter, (key, count) => {
        const parsed = parseBlockField(key);
        return { block: parsed.block, field: parsed.field, count };
    });

    const topFormattingDiffs = sortCounter(formattingCounter, (key, count) => {
        const parsed = parseBlockField(key);
        return { block: parsed.block, field: parsed.field, count };
    });

    return {
        generated_at: new Date().toISOString(),
        mode: args.dryRun ? 'DRY_RUN' : 'WRITE',
        sample_limit: args.sample,
        models_ok: modelReports.map((r) => r.model),
        models_failed: failures,
        equivalence_percent_by_block: ORDERED_BLOCKS.reduce((out, block) => {
            out[block] = blocks[block].coverage_percent;
            return out;
        }, {}),
        blocks,
        top_missing_blocks: topMissingBlocks,
        top_diff_fields: topDiffFields,
        top_critical_missing_fields: topCriticalMissingFields,
        top_formatting_diffs: topFormattingDiffs,
        critical_missing_summary: {
            total: topCriticalMissingFields.reduce((acc, item) => acc + item.count, 0),
            top_fields: topCriticalMissingFields.slice(0, 30)
        },
        formatting_diff_summary: {
            total: topFormattingDiffs.reduce((acc, item) => acc + item.count, 0),
            top_fields: topFormattingDiffs.slice(0, 30)
        },
        synthetic_rows_summary: syntheticRowsSummary,
        equivalence_summary: {
            total_compared_fields: totalCompared,
            total_equal_fields: totalEqual,
            overall_equivalence_percent: totalCompared > 0 ? Number(((totalEqual * 100) / totalCompared).toFixed(2)) : 0
        },
        per_model_summary: modelReports.map((report) => ({
            model: report.model,
            selected_sample: report.sampling.selected_sample,
            overall_equivalence_percent: report.equivalence_summary.overall_equivalence_percent,
            equivalence_percent_by_block: report.equivalence_percent_by_block
        }))
    };
}

function printGlobalSummary(globalReport) {
    console.log('[summary]');
    console.log(`  - models_ok: ${globalReport.models_ok.length}`);
    console.log(`  - models_failed: ${globalReport.models_failed.length}`);
    console.log(`  - overall_equivalence_percent: ${globalReport.equivalence_summary.overall_equivalence_percent}`);

    console.log('  - equivalence_percent_by_block:');
    for (const block of ORDERED_BLOCKS) {
        console.log(`    * ${block}: ${globalReport.equivalence_percent_by_block[block]}%`);
    }

    console.log('  - top_missing_blocks:');
    for (const item of globalReport.top_missing_blocks.slice(0, 8)) {
        console.log(`    * ${item.block}: ${item.missing_count}`);
    }

    console.log('  - top_diff_fields:');
    for (const item of globalReport.top_diff_fields.slice(0, 10)) {
        console.log(`    * ${item.block}.${item.field}: ${item.count}`);
    }

    console.log('  - critical_missing_summary:');
    console.log(`    * total: ${globalReport.critical_missing_summary.total}`);
    for (const item of globalReport.critical_missing_summary.top_fields.slice(0, 10)) {
        console.log(`    * ${item.block}.${item.field}: ${item.count}`);
    }

    console.log('  - formatting_diff_summary:');
    console.log(`    * total: ${globalReport.formatting_diff_summary.total}`);
    for (const item of globalReport.formatting_diff_summary.top_fields.slice(0, 10)) {
        console.log(`    * ${item.block}.${item.field}: ${item.count}`);
    }

    console.log('  - synthetic_rows_summary:');
    console.log(`    * rebuild_total_synthetic_rows: ${globalReport.synthetic_rows_summary.rebuild_total_synthetic_rows}`);
    console.log(`    * rebuild_synthetic_rows_matched_by_pn: ${globalReport.synthetic_rows_summary.rebuild_synthetic_rows_matched_by_pn}`);
    console.log(`    * selected_pairs_with_synthetic_context: ${globalReport.synthetic_rows_summary.selected_pairs_with_synthetic_context}`);
    console.log(`    * selected_rebuild_rows_that_are_synthetic: ${globalReport.synthetic_rows_summary.selected_rebuild_rows_that_are_synthetic}`);
}

function run(args) {
    const models = listModels(args);
    const modelReports = [];
    const failures = [];
    const csvRowsAll = [];

    console.log(`[mode] ${args.dryRun ? 'DRY_RUN' : 'WRITE'}`);
    console.log(`[sample] ${args.sample}`);
    console.log(`[models] ${models.join(', ')}`);

    for (const model of models) {
        try {
            const report = analyzeModel(model, args);
            modelReports.push(report);
            csvRowsAll.push(...report.csv_rows);

            console.log(`\n[model] ${model}`);
            console.log(`  - selected_sample: ${report.sampling.selected_sample}`);
            console.log(`  - matched_engine_candidates: ${report.sampling.matched_engine_candidates}`);
            console.log(`  - overall_equivalence_percent: ${report.equivalence_summary.overall_equivalence_percent}`);
            console.log(`  - top_missing_block: ${report.top_missing_blocks[0] ? `${report.top_missing_blocks[0].block} (${report.top_missing_blocks[0].missing_count})` : 'n/a'}`);
        } catch (error) {
            failures.push({ model, error: error.message });
            console.error(`\n[model] ${model}`);
            console.error(`  - ERROR: ${error.message}`);
        }
    }

    const globalReport = aggregateGlobal(modelReports, args, failures);
    printGlobalSummary(globalReport);

    if (!args.dryRun) {
        const outDir = path.resolve(REPO_ROOT, args.out);
        ensureDir(outDir);

        for (const report of modelReports) {
            const outPath = path.join(outDir, `rebuild_equivalence_analysis_${report.model}.json`);
            const payload = { ...report };
            delete payload.csv_rows;
            writeJson(outPath, payload);
        }

        const globalPath = path.join(outDir, 'rebuild_equivalence_analysis_ALL.json');
        writeJson(globalPath, globalReport);

        const csvPath = path.join(outDir, 'rebuild_equivalence_analysis_ALL.csv');
        writeCsv(csvPath, csvRowsAll);

        console.log(`[write] ${path.relative(REPO_ROOT, globalPath).replace(/\\/g, '/')}`);
        console.log(`[write] ${path.relative(REPO_ROOT, csvPath).replace(/\\/g, '/')}`);
    } else {
        console.log('[dry-run] no se escribieron reportes');
    }

    if (failures.length) return 1;
    return 0;
}

function main(argv) {
    try {
        const args = parseArgs(argv);
        if (args.help) {
            printHelp();
            return 0;
        }
        return run(args);
    } catch (error) {
        console.error(`[error] ${error.message}`);
        printHelp();
        return 1;
    }
}

if (require.main === module) {
    process.exitCode = main(process.argv);
}

module.exports = {
    main,
    parseArgs,
    analyzeModel
};
