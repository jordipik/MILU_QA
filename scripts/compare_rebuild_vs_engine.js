#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { runModel } = require('./rebuild_engine_from_book_preview');

const REPO_ROOT = path.resolve(__dirname, '..');
const REBUILD_DIR = path.join(REPO_ROOT, 'data', 'output', 'rebuild');
const DEFAULT_OUT_DIR = path.join('data', 'output', 'rebuild_compare');
const MAX_EXAMPLES = 100;

const CRITICAL_FIELDS = [
    'ID',
    'Source Page',
    'POS',
    'PART NO.',
    'pn_final',
    'pos_final',
    'designation_final',
    'qty_final',
    'units_final',
    'weight_final',
    'measure_final',
    'norma_final',
    'fg_fgs_final',
    'bom_final',
    'filename_foto',
    'ruta_foto',
    'esquemas',
    'esquemas_circulos',
    'esquemas_circulos_all',
    'ruta_esquemas_pos',
    'exp_imagenes',
    'qa_revision_estado',
    'qa_revision_accion',
    'total_error',
    'has_error'
];

function t(value) {
    return String(value == null ? '' : value).trim();
}

function toJsonValue(value) {
    return value === undefined ? '__undefined__' : value;
}

function parseArgs(argv) {
    const args = {
        engine: '',
        all: false,
        dryRun: true,
        write: false,
        compareOnly: false,
        out: DEFAULT_OUT_DIR,
        help: false
    };

    let seenDryRun = false;
    let seenWrite = false;

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
        if (token === '--dry-run') {
            args.dryRun = true;
            seenDryRun = true;
            continue;
        }
        if (token === '--write') {
            args.write = true;
            args.dryRun = false;
            seenWrite = true;
            continue;
        }
        if (token === '--compare-only') {
            args.compareOnly = true;
            continue;
        }
        if (token === '--out') {
            args.out = t(argv[i + 1]) || DEFAULT_OUT_DIR;
            i += 1;
            continue;
        }
        if (token === '--help' || token === '-h') {
            args.help = true;
            continue;
        }

        throw new Error(`Argumento no reconocido: ${token}`);
    }

    if (args.help) return args;

    if (args.all && args.engine) {
        throw new Error('Use solo uno: --all o --engine <MODEL>.');
    }
    if (!args.all && !args.engine) {
        throw new Error('Debe indicar --all o --engine <MODEL>.');
    }

    // En compare-only permitimos generar reportes sin regenerar rebuild.
    // Si no se explicita --dry-run, asumimos escritura de reportes.
    if (args.compareOnly && !seenDryRun && !seenWrite) {
        args.dryRun = false;
    }

    return args;
}

function printHelp() {
    console.log([
        'Uso:',
        '  node scripts/compare_rebuild_vs_engine.js --engine 12V4000M40A --compare-only --dry-run',
        '  node scripts/compare_rebuild_vs_engine.js --engine 12V4000M40A --compare-only --out data/output/rebuild_compare/',
        '  node scripts/compare_rebuild_vs_engine.js --engine 12V4000M40A --write --out data/output/rebuild_compare/',
        '  node scripts/compare_rebuild_vs_engine.js --all --compare-only --dry-run',
        '  node scripts/compare_rebuild_vs_engine.js --all --compare-only --out data/output/rebuild_compare/',
        '  node scripts/compare_rebuild_vs_engine.js --all --write --out data/output/rebuild_compare/',
        '',
        'Flags:',
        '  --engine MODEL    Modelo concreto',
        '  --all             Todos los modelos detectados por engine_*.json',
        '  --dry-run         Modo seguro: no escribe rebuild ni reportes',
        '  --write           Regenera rebuild y escribe reportes',
        '  --compare-only    Solo compara rebuild existente; sin --dry-run escribe reportes',
        '  --out DIR         Carpeta de salida para reportes (default: data/output/rebuild_compare/)',
        '  --help            Muestra esta ayuda'
    ].join('\n'));
}

function normalizeModelToken(raw) {
    const text = t(raw);
    if (!text) return '';
    const match = text.match(/^(?:engine_|engine_rebuild_)?(.+?)(?:\.json)?$/i);
    return t(match ? match[1] : text);
}

function detectModelsFromEngineFiles(repoRoot) {
    const entries = fs.readdirSync(repoRoot, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => /^engine_.+\.json$/i.test(name))
        .filter((name) => !/^engine_rebuild_/i.test(name))
        .filter((name) => !/\.bak\.|\.backup\.|\.tmp\.|\.temp\./i.test(name))
        .map((name) => name.replace(/^engine_/i, '').replace(/\.json$/i, ''))
        .sort((a, b) => a.localeCompare(b));
}

function listModels(args, repoRoot) {
    if (args.all) {
        const models = detectModelsFromEngineFiles(repoRoot);
        if (models.length === 0) {
            throw new Error('No se detectaron archivos engine_<MODEL>.json en la raiz del repo.');
        }
        return models;
    }
    const model = normalizeModelToken(args.engine);
    if (!model) throw new Error('El valor de --engine no es valido.');
    return [model];
}

function readJsonArray(filePath, label) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error(`${label} no contiene un array JSON.`);
    }
    return parsed;
}

function getComparableId(row, isRebuild) {
    const rowId = t(row && row.ID);
    if (!isRebuild) return rowId;

    const legacyId = t(row && row.rebuild_legacy_engine_id);
    if (legacyId) return legacyId;
    return rowId;
}

function buildIdMap(rows, isRebuild) {
    const map = new Map();
    for (const row of rows) {
        const id = getComparableId(row, isRebuild);
        if (!id) continue;
        if (!map.has(id)) map.set(id, row || {});
    }
    return map;
}

function normalizeHardValue(value) {
    if (value === undefined) return '__undefined__';
    return value;
}

function normalizeSoftValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return '';
        return trimmed.replace(/\s+/g, ' ');
    }
    if (value === undefined) return '';
    return value;
}

function normalizeSnapshot(value, normalizePrimitive, depth, seen) {
    if (depth > 8) return '__max_depth__';

    if (Array.isArray(value)) {
        return value.map((item) => normalizeSnapshot(item, normalizePrimitive, depth + 1, seen));
    }

    if (value && typeof value === 'object') {
        if (seen.has(value)) return '__circular_ref__';
        seen.add(value);

        const out = {};
        const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
        for (const key of keys) {
            out[key] = normalizeSnapshot(value[key], normalizePrimitive, depth + 1, seen);
        }

        seen.delete(value);
        return out;
    }

    return normalizePrimitive(value);
}

function toComparableString(value, normalizePrimitive) {
    const snapshot = normalizeSnapshot(value, normalizePrimitive, 0, new WeakSet());
    return JSON.stringify(snapshot);
}

function isEqualHard(a, b) {
    return toComparableString(a, normalizeHardValue) === toComparableString(b, normalizeHardValue);
}

function isEqualSoft(a, b) {
    return toComparableString(a, normalizeSoftValue) === toComparableString(b, normalizeSoftValue);
}

function pushLimited(list, item, limit) {
    if (list.length < limit) {
        list.push(item);
    }
}

function inc(obj, key) {
    obj[key] = (obj[key] || 0) + 1;
}

function sortCountsDescending(mapObj) {
    return Object.entries(mapObj)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([field, count]) => ({ field, count }));
}

function isSyntheticRebuildRow(row) {
    const id = t(row && row.ID);
    const legacyId = t(row && row.rebuild_legacy_engine_id);
    return /^RB-/i.test(id) && !legacyId;
}

function buildSyntheticPageStats(rows) {
    const pages = [];
    const pageCounts = {};

    for (const row of rows) {
        const pageRaw = row && row['Source Page'];
        const page = Number.parseInt(String(pageRaw == null ? '' : pageRaw).trim(), 10);
        if (!Number.isFinite(page)) continue;
        pages.push(page);
        pageCounts[page] = (pageCounts[page] || 0) + 1;
    }

    return {
        rows_with_source_page: pages.length,
        min_source_page: pages.length ? Math.min(...pages) : null,
        max_source_page: pages.length ? Math.max(...pages) : null,
        unique_source_pages: Object.keys(pageCounts).length,
        top_source_pages: Object.entries(pageCounts)
            .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
            .slice(0, MAX_EXAMPLES)
            .map(([page, count]) => ({ source_page: Number(page), count }))
    };
}

function compareModel(model, engineRows, rebuildRows) {
    const engineMap = buildIdMap(engineRows, false);
    const rebuildMap = buildIdMap(rebuildRows, true);

    const engineIds = [...engineMap.keys()].sort((a, b) => a.localeCompare(b));
    const rebuildIds = [...rebuildMap.keys()].sort((a, b) => a.localeCompare(b));

    const missingInRebuild = engineIds.filter((id) => !rebuildMap.has(id));

    const syntheticRebuildRows = rebuildRows.filter((row) => isSyntheticRebuildRow(row));
    const syntheticRebuildIds = new Set(syntheticRebuildRows.map((row) => t(row && row.ID)).filter(Boolean));

    const extraInRebuild = rebuildIds
        .filter((id) => !engineMap.has(id))
        .filter((id) => !syntheticRebuildIds.has(id));

    const idsCommon = engineIds.filter((id) => rebuildMap.has(id));

    const hardDiffs = [];
    const softDiffs = [];
    const hardCountByField = {};
    const softCountByField = {};
    const hardIds = new Set();
    const softIds = new Set();
    const allDiffRowsForCsv = [];

    for (const id of idsCommon) {
        const engineRow = engineMap.get(id) || {};
        const rebuildRow = rebuildMap.get(id) || {};

        for (const field of CRITICAL_FIELDS) {
            const engineValue = engineRow[field];
            const rebuildValue = rebuildRow[field];

            if (isEqualHard(engineValue, rebuildValue)) {
                continue;
            }

            const diff = {
                id,
                field,
                engine_value: toJsonValue(engineValue),
                rebuild_value: toJsonValue(rebuildValue)
            };

            if (isEqualSoft(engineValue, rebuildValue)) {
                pushLimited(softDiffs, diff, MAX_EXAMPLES);
                softIds.add(id);
                inc(softCountByField, field);
                allDiffRowsForCsv.push({
                    model,
                    id,
                    diff_type: 'soft_diff',
                    field,
                    engine_value: engineValue,
                    rebuild_value: rebuildValue
                });
            } else {
                pushLimited(hardDiffs, diff, MAX_EXAMPLES);
                hardIds.add(id);
                inc(hardCountByField, field);
                allDiffRowsForCsv.push({
                    model,
                    id,
                    diff_type: 'hard_diff',
                    field,
                    engine_value: engineValue,
                    rebuild_value: rebuildValue
                });
            }
        }
    }

    const fieldsCombined = {};
    for (const field of Object.keys(hardCountByField)) {
        fieldsCombined[field] = (fieldsCombined[field] || 0) + hardCountByField[field];
    }
    for (const field of Object.keys(softCountByField)) {
        fieldsCombined[field] = (fieldsCombined[field] || 0) + softCountByField[field];
    }

    for (const id of missingInRebuild) {
        allDiffRowsForCsv.push({
            model,
            id,
            diff_type: 'missing_in_rebuild',
            field: 'ID',
            engine_value: id,
            rebuild_value: ''
        });
    }
    for (const id of extraInRebuild) {
        allDiffRowsForCsv.push({
            model,
            id,
            diff_type: 'extra_in_rebuild',
            field: 'ID',
            engine_value: '',
            rebuild_value: id
        });
    }
    for (const row of syntheticRebuildRows) {
        allDiffRowsForCsv.push({
            model,
            id: t(row && row.ID),
            diff_type: 'synthetic_rebuild_row',
            field: 'ID',
            engine_value: '',
            rebuild_value: t(row && row.ID)
        });
    }

    const affectedAll = new Set([...hardIds, ...softIds]);

    const syntheticRebuildRowsSample = syntheticRebuildRows.slice(0, MAX_EXAMPLES).map((row) => ({
        ID: t(row && row.ID),
        source_page: row && row['Source Page'],
        POS: t(row && row.POS),
        part_no: t(row && row['PART NO.'])
    }));

    const syntheticPageStats = buildSyntheticPageStats(syntheticRebuildRows);

    return {
        model,
        generated_at: new Date().toISOString(),
        summary: {
            total_engine: engineRows.length,
            total_rebuild: rebuildRows.length,
            ids_common: idsCommon.length,
            ids_missing_in_rebuild: missingInRebuild.length,
            ids_extra_in_rebuild: extraInRebuild.length,
            synthetic_rebuild_rows_total: syntheticRebuildRows.length,
            hard_diffs_total: Object.values(hardCountByField).reduce((acc, n) => acc + n, 0),
            soft_diffs_total: Object.values(softCountByField).reduce((acc, n) => acc + n, 0),
            ids_affected_total: affectedAll.size
        },
        synthetic_rebuild_rows_total: syntheticRebuildRows.length,
        synthetic_rebuild_rows_sample: syntheticRebuildRowsSample,
        synthetic_page_stats: syntheticPageStats,
        samples: {
            missing_in_rebuild: missingInRebuild.slice(0, MAX_EXAMPLES),
            extra_in_rebuild: extraInRebuild.slice(0, MAX_EXAMPLES),
            hard_diffs: hardDiffs,
            soft_diffs: softDiffs
        },
        fields_with_most_differences: {
            hard: sortCountsDescending(hardCountByField),
            soft: sortCountsDescending(softCountByField),
            combined: sortCountsDescending(fieldsCombined)
        },
        ids_affected: {
            hard_total: hardIds.size,
            soft_total: softIds.size,
            total: affectedAll.size,
            hard_sample: [...hardIds].sort((a, b) => a.localeCompare(b)).slice(0, MAX_EXAMPLES),
            soft_sample: [...softIds].sort((a, b) => a.localeCompare(b)).slice(0, MAX_EXAMPLES),
            all_sample: [...affectedAll].sort((a, b) => a.localeCompare(b)).slice(0, MAX_EXAMPLES)
        },
        csv_rows_all: allDiffRowsForCsv
    };
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function csvEscape(value) {
    const text = String(value == null ? '' : value);
    if (!/[",\n\r]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

function valueForCsv(value) {
    if (value === undefined) return '__undefined__';
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function writeCsv(filePath, rows) {
    const header = ['model', 'id', 'diff_type', 'field', 'engine_value', 'rebuild_value'];
    const lines = [header.join(',')];
    for (const row of rows) {
        lines.push([
            csvEscape(row.model),
            csvEscape(row.id),
            csvEscape(row.diff_type),
            csvEscape(row.field),
            csvEscape(valueForCsv(row.engine_value)),
            csvEscape(valueForCsv(row.rebuild_value))
        ].join(','));
    }
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function writeRebuildWithBackup(rebuildPath, rebuildRows) {
    let backupPath = null;
    if (fs.existsSync(rebuildPath)) {
        backupPath = `${rebuildPath}.bak.${Date.now()}`;
        fs.copyFileSync(rebuildPath, backupPath);
    }
    writeJson(rebuildPath, rebuildRows);
    return backupPath;
}

function getEnginePath(model) {
    return path.join(REPO_ROOT, `engine_${model}.json`);
}

function getRebuildPath(model) {
    return path.join(REBUILD_DIR, `engine_rebuild_${model}.json`);
}

function runComparisonFlow(args) {
    const models = listModels(args, REPO_ROOT);
    const outDir = path.resolve(REPO_ROOT, args.out);

    console.log(`[mode] ${args.dryRun ? 'DRY_RUN' : 'WRITE'}`);
    console.log(`[phase2] ${args.compareOnly ? 'COMPARE_ONLY (sin regenerar rebuild)' : 'REGENERATE_REBUILD + COMPARE'}`);
    console.log(`[models] ${models.join(', ')}`);
    console.log(`[out] ${path.relative(REPO_ROOT, outDir).replace(/\\/g, '/')}`);

    const failures = [];
    const modelReports = [];
    const csvRows = [];
    const rebuildWriteInfo = [];

    for (const model of models) {
        try {
            const enginePath = getEnginePath(model);
            if (!fs.existsSync(enginePath)) {
                throw new Error(`No existe engine base: ${path.relative(REPO_ROOT, enginePath)}`);
            }
            const engineRows = readJsonArray(enginePath, path.basename(enginePath));

            let rebuildRows;
            const rebuildPath = getRebuildPath(model);

            if (args.compareOnly) {
                if (!fs.existsSync(rebuildPath)) {
                    throw new Error(`No existe rebuild para compare-only: ${path.relative(REPO_ROOT, rebuildPath)}`);
                }
                rebuildRows = readJsonArray(rebuildPath, path.basename(rebuildPath));
            } else {
                const rebuildResult = runModel(REPO_ROOT, model, { writePreview: false });
                rebuildRows = rebuildResult.rebuildRows;

                if (args.write) {
                    ensureDir(REBUILD_DIR);
                    const backupPath = writeRebuildWithBackup(rebuildPath, rebuildRows);
                    rebuildWriteInfo.push({
                        model,
                        rebuild_path: path.relative(REPO_ROOT, rebuildPath).replace(/\\/g, '/'),
                        backup_path: backupPath
                            ? path.relative(REPO_ROOT, backupPath).replace(/\\/g, '/')
                            : null
                    });
                }
            }

            const modelReport = compareModel(model, engineRows, rebuildRows);
            modelReport.paths = {
                engine: path.relative(REPO_ROOT, enginePath).replace(/\\/g, '/'),
                rebuild: path.relative(REPO_ROOT, rebuildPath).replace(/\\/g, '/')
            };
            for (const row of modelReport.csv_rows_all) {
                csvRows.push(row);
            }
            modelReports.push(modelReport);

            console.log(`\n[model] ${model}`);
            console.log(`  - total_engine: ${modelReport.summary.total_engine}`);
            console.log(`  - total_rebuild: ${modelReport.summary.total_rebuild}`);
            console.log(`  - ids_common: ${modelReport.summary.ids_common}`);
            console.log(`  - ids_missing_in_rebuild: ${modelReport.summary.ids_missing_in_rebuild}`);
            console.log(`  - ids_extra_in_rebuild: ${modelReport.summary.ids_extra_in_rebuild}`);
            console.log(`  - synthetic_rebuild_rows_total: ${modelReport.summary.synthetic_rebuild_rows_total}`);
            console.log(`  - hard_diffs_total: ${modelReport.summary.hard_diffs_total}`);
            console.log(`  - soft_diffs_total: ${modelReport.summary.soft_diffs_total}`);
        } catch (error) {
            failures.push({ model, error: error.message });
            console.error(`\n[model] ${model}`);
            console.error(`  - ERROR: ${error.message}`);
        }
    }

    const totals = modelReports.reduce((acc, report) => {
        acc.total_engine += report.summary.total_engine;
        acc.total_rebuild += report.summary.total_rebuild;
        acc.ids_common += report.summary.ids_common;
        acc.ids_missing_in_rebuild += report.summary.ids_missing_in_rebuild;
        acc.ids_extra_in_rebuild += report.summary.ids_extra_in_rebuild;
        acc.synthetic_rebuild_rows_total += report.summary.synthetic_rebuild_rows_total;
        acc.hard_diffs_total += report.summary.hard_diffs_total;
        acc.soft_diffs_total += report.summary.soft_diffs_total;
        acc.ids_affected_total += report.summary.ids_affected_total;
        return acc;
    }, {
        total_engine: 0,
        total_rebuild: 0,
        ids_common: 0,
        ids_missing_in_rebuild: 0,
        ids_extra_in_rebuild: 0,
        synthetic_rebuild_rows_total: 0,
        hard_diffs_total: 0,
        soft_diffs_total: 0,
        ids_affected_total: 0
    });

    const globalReport = {
        generated_at: new Date().toISOString(),
        mode: args.dryRun ? 'DRY_RUN' : 'WRITE',
        compare_only: args.compareOnly,
        models_requested: models,
        models_ok: modelReports.map((r) => r.model),
        models_failed: failures,
        totals,
        rebuild_write_info: rebuildWriteInfo,
        per_model_summary: modelReports.map((r) => ({
            model: r.model,
            ...r.summary
        }))
    };

    console.log('\n[summary]');
    console.log(`  - models_ok: ${modelReports.length}`);
    console.log(`  - models_failed: ${failures.length}`);
    console.log(`  - total_engine: ${totals.total_engine}`);
    console.log(`  - total_rebuild: ${totals.total_rebuild}`);
    console.log(`  - ids_common: ${totals.ids_common}`);
    console.log(`  - ids_missing_in_rebuild: ${totals.ids_missing_in_rebuild}`);
    console.log(`  - ids_extra_in_rebuild: ${totals.ids_extra_in_rebuild}`);
    console.log(`  - synthetic_rebuild_rows_total: ${totals.synthetic_rebuild_rows_total}`);
    console.log(`  - hard_diffs_total: ${totals.hard_diffs_total}`);
    console.log(`  - soft_diffs_total: ${totals.soft_diffs_total}`);

    if (!args.dryRun) {
        ensureDir(outDir);

        for (const report of modelReports) {
            const perModelPath = path.join(outDir, `rebuild_compare_${report.model}.json`);
            const outReport = { ...report };
            delete outReport.csv_rows_all;
            writeJson(perModelPath, outReport);
        }

        const globalPath = path.join(outDir, 'rebuild_compare_ALL.json');
        writeJson(globalPath, globalReport);

        const csvPath = path.join(outDir, 'rebuild_compare_ALL.csv');
        writeCsv(csvPath, csvRows);

        console.log(`  - output_global_json: ${path.relative(REPO_ROOT, globalPath).replace(/\\/g, '/')}`);
        console.log(`  - output_global_csv: ${path.relative(REPO_ROOT, csvPath).replace(/\\/g, '/')}`);
    } else {
        console.log('  - dry_run: no se escribieron rebuild ni reportes');
    }

    if (failures.length > 0) {
        console.log('  - failure_models:');
        for (const fail of failures) {
            console.log(`    * ${fail.model}: ${fail.error}`);
        }
        return 1;
    }

    return 0;
}

function main(argv) {
    try {
        const args = parseArgs(argv);
        if (args.help) {
            printHelp();
            return 0;
        }
        return runComparisonFlow(args);
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
    compareModel,
    detectModelsFromEngineFiles
};
