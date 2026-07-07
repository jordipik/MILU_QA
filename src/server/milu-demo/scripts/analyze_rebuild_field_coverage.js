#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { detectModelsFromEngineFiles } = require('./compare_rebuild_vs_engine');

const REPO_ROOT = path.resolve(__dirname, '..');
const REBUILD_DIR = path.join(REPO_ROOT, 'data', '02-engine_rebuild');
const DEFAULT_OUT_DIR = path.join('data', 'output', 'rebuild_field_coverage');
const MAX_EXAMPLES = 100;

const PRIORITY_FIELDS = {
    identity: [
        'ID',
        'rebuild_legacy_engine_id',
        'pn_final',
        'pos_final',
        'designation_final'
    ],
    pdf: [
        'pn_pdf',
        'pos_pdf',
        'designation_pdf',
        'qty_pdf',
        'measure_pdf',
        'norma_pdf'
    ],
    final: [
        'qty_final',
        'measure_final',
        'norma_final',
        'weight_final',
        'fn_final',
        'fg_fgs_final',
        'bom_final'
    ],
    qa: [
        'qa_revision_estado',
        'qa_revision_accion',
        'total_error',
        'has_error'
    ],
    assets: [
        'filename_foto',
        'ruta_foto',
        'esquemas',
        'esquemas_circulos',
        'esquemas_circulos_all',
        'ruta_esquemas_pos',
        'exp_imagenes'
    ],
    gesa: [
        'gesa',
        'designation_gesa',
        'nsn',
        'norma',
        'normalizado',
        'dimensions_gesa',
        'weight_gesa'
    ],
    sust: [
        'sust_status',
        'sust_hierarchie',
        'sust_new_part_number',
        'sust_superseded_list'
    ]
};

const ALL_PRIORITY_FIELDS = Object.values(PRIORITY_FIELDS).flat();

function t(value) {
    return String(value == null ? '' : value).trim();
}

function normalizeModelToken(raw) {
    const text = t(raw);
    if (!text) return '';
    const match = text.match(/^(?:engine_|engine_rebuild_)?(.+?)(?:\.json)?$/i);
    return t(match ? match[1] : text);
}

function parseArgs(argv) {
    const args = {
        engine: '',
        all: false,
        dryRun: true,
        write: false,
        out: DEFAULT_OUT_DIR,
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
        if (token === '--dry-run') {
            args.dryRun = true;
            continue;
        }
        if (token === '--write') {
            args.write = true;
            args.dryRun = false;
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
    if (args.all && args.engine) throw new Error('Use solo uno: --all o --engine <MODEL>.');
    if (!args.all && !args.engine) throw new Error('Debe indicar --all o --engine <MODEL>.');
    return args;
}

function printHelp() {
    console.log([
        'Uso:',
        '  node scripts/analyze_rebuild_field_coverage.js --engine 20V4000M93L --dry-run',
        '  node scripts/analyze_rebuild_field_coverage.js --engine 20V4000M93L --write --out data/output/rebuild_field_coverage/',
        '  node scripts/analyze_rebuild_field_coverage.js --all --dry-run',
        '  node scripts/analyze_rebuild_field_coverage.js --all --write --out data/output/rebuild_field_coverage/',
        '',
        'Flags:',
        '  --engine MODEL    Modelo concreto',
        '  --all             Todos los modelos detectados por engine_*.json',
        '  --dry-run         No escribe reportes (default)',
        '  --write           Escribe reportes JSON/CSV',
        '  --out DIR         Carpeta de salida',
        '  --help            Muestra esta ayuda'
    ].join('\n'));
}

function listModels(args) {
    if (args.all) {
        const models = detectModelsFromEngineFiles(REPO_ROOT);
        if (models.length === 0) throw new Error('No se detectaron archivos engine_<MODEL>.json en la raiz del repo.');
        return models;
    }
    const model = normalizeModelToken(args.engine);
    if (!model) throw new Error('El valor de --engine no es valido.');
    return [model];
}

function readJsonArray(filePath, label) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`${label} no contiene un array JSON.`);
    return parsed;
}

function getRebuildPath(model) {
    return path.join(REBUILD_DIR, `engine_rebuild_${model}.json`);
}

function isEmptyField(value) {
    if (value == null) return true;
    if (value === false) return false;
    if (value === 0) return false;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return t(value) === '';
}

function pct(filled, total) {
    if (total === 0) return 0;
    return Number(((filled * 100) / total).toFixed(2));
}

function analyzeField(rows, field) {
    let filled = 0;
    let empty = 0;
    for (const row of rows) {
        if (isEmptyField(row[field])) {
            empty += 1;
        } else {
            filled += 1;
        }
    }
    return {
        field,
        filled_count: filled,
        empty_count: empty,
        filled_percent: pct(filled, rows.length)
    };
}

function analyzeFieldSet(rows, fields) {
    const result = {};
    for (const field of fields) {
        result[field] = analyzeField(rows, field);
    }
    return result;
}

function countRowsWithAllEmpty(rows, fields) {
    let count = 0;
    for (const row of rows) {
        if (fields.every((field) => isEmptyField(row[field]))) count += 1;
    }
    return count;
}

function avgCoverage(fieldStats) {
    const values = Object.values(fieldStats).map((f) => f.filled_percent);
    if (!values.length) return 0;
    return Number((values.reduce((acc, n) => acc + n, 0) / values.length).toFixed(2));
}

function topEmptyFields(allFieldStats, n) {
    return Object.values(allFieldStats)
        .sort((a, b) => a.filled_percent - b.filled_percent || a.field.localeCompare(b.field))
        .slice(0, n)
        .map(({ field, filled_percent, empty_count }) => ({ field, filled_percent, empty_count }));
}

function buildModelAnalysis(model, rows) {
    const total = rows.length;

    const fieldGroups = {};
    const allFieldStats = {};

    for (const [group, fields] of Object.entries(PRIORITY_FIELDS)) {
        const groupStats = analyzeFieldSet(rows, fields);
        fieldGroups[group] = {
            fields: groupStats,
            avg_filled_percent: avgCoverage(groupStats)
        };
        Object.assign(allFieldStats, groupStats);
    }

    const fields100 = Object.values(allFieldStats)
        .filter((f) => f.filled_percent === 100)
        .map((f) => f.field)
        .sort();

    const fieldsBelow10 = Object.values(allFieldStats)
        .filter((f) => f.filled_percent < 10)
        .sort((a, b) => a.filled_percent - b.filled_percent || a.field.localeCompare(b.field))
        .map(({ field, filled_percent, empty_count }) => ({ field, filled_percent, empty_count }));

    const rows_without_any_assets = countRowsWithAllEmpty(rows, ['filename_foto', 'esquemas', 'esquemas_circulos']);
    const rows_without_qa = countRowsWithAllEmpty(rows, ['qa_revision_estado', 'qa_revision_accion']);
    const rows_without_finals = countRowsWithAllEmpty(rows, ['pn_final', 'pos_final', 'designation_final', 'qty_final']);
    const rows_without_gesa = countRowsWithAllEmpty(rows, PRIORITY_FIELDS.gesa);
    const rows_without_sust = countRowsWithAllEmpty(rows, PRIORITY_FIELDS.sust);

    let syntheticCount = 0;
    let withLegacyId = 0;
    let withoutLegacyId = 0;
    for (const row of rows) {
        const id = t(row && row.ID);
        const legacyId = t(row && row.rebuild_legacy_engine_id);
        if (/^RB-/i.test(id) && !legacyId) {
            syntheticCount += 1;
        }
        if (legacyId) withLegacyId += 1;
        else withoutLegacyId += 1;
    }

    return {
        model,
        generated_at: new Date().toISOString(),
        summary: {
            total_rows: total,
            synthetic_rows: syntheticCount,
            rows_with_legacy_id: withLegacyId,
            rows_without_legacy_id: withoutLegacyId,
            rows_without_any_assets,
            rows_without_assets_pct: pct(rows_without_any_assets, total),
            rows_without_qa,
            rows_without_qa_pct: pct(rows_without_qa, total),
            rows_without_finals,
            rows_without_finals_pct: pct(rows_without_finals, total),
            rows_without_gesa,
            rows_without_gesa_pct: pct(rows_without_gesa, total),
            rows_without_sust,
            rows_without_sust_pct: pct(rows_without_sust, total)
        },
        coverage_by_group: Object.fromEntries(
            Object.entries(fieldGroups).map(([group, data]) => [group, {
                avg_filled_percent: data.avg_filled_percent,
                fields: Object.fromEntries(
                    Object.entries(data.fields).map(([f, s]) => [f, {
                        filled_count: s.filled_count,
                        empty_count: s.empty_count,
                        filled_percent: s.filled_percent
                    }])
                )
            }])
        ),
        fields_100_percent: fields100,
        fields_below_10_percent: fieldsBelow10,
        top_empty_fields: topEmptyFields(allFieldStats, MAX_EXAMPLES),
        synthetic_rows_stats: {
            total_rows: total,
            synthetic_rb_rows: syntheticCount,
            rows_with_legacy_id: withLegacyId,
            rows_without_legacy_id: withoutLegacyId
        },
        all_field_stats: allFieldStats
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

function writeCsv(filePath, csvRows) {
    const header = ['model', 'field', 'filled_count', 'empty_count', 'filled_percent'];
    const lines = [header.join(',')];
    for (const row of csvRows) {
        lines.push([
            csvEscape(row.model),
            csvEscape(row.field),
            csvEscape(String(row.filled_count)),
            csvEscape(String(row.empty_count)),
            csvEscape(String(row.filled_percent))
        ].join(','));
    }
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function printModelSummary(report) {
    const s = report.summary;
    const cg = report.coverage_by_group;

    console.log(`\n[model] ${report.model}`);
    console.log(`  - total_rows: ${s.total_rows}`);
    console.log(`  - synthetic_rb_rows: ${s.synthetic_rows}`);
    console.log(`  - rows_with_legacy_id: ${s.rows_with_legacy_id}`);

    const groups = ['identity', 'pdf', 'final', 'qa', 'assets', 'gesa', 'sust'];
    for (const g of groups) {
        if (cg[g]) console.log(`  - ${g}_coverage: ${cg[g].avg_filled_percent}%`);
    }

    console.log(`  - rows_without_any_assets: ${s.rows_without_any_assets} (${s.rows_without_assets_pct}%)`);
    console.log(`  - rows_without_gesa: ${s.rows_without_gesa} (${s.rows_without_gesa_pct}%)`);
    console.log(`  - rows_without_sust: ${s.rows_without_sust} (${s.rows_without_sust_pct}%)`);

    const topEmpty = report.top_empty_fields.slice(0, 5)
        .map((f) => `${f.field}:${f.filled_percent}%`)
        .join(', ');
    console.log(`  - top_empty_fields: ${topEmpty || '-'}`);
}

function runAnalysis(args) {
    const models = listModels(args);
    const outDir = path.resolve(REPO_ROOT, args.out);

    console.log(`[mode] ${args.dryRun ? 'DRY_RUN' : 'WRITE'}`);
    console.log(`[models] ${models.join(', ')}`);
    console.log(`[out] ${path.relative(REPO_ROOT, outDir).replace(/\\/g, '/')}`);

    const failures = [];
    const modelReports = [];
    const csvRows = [];

    for (const model of models) {
        try {
            const rebuildPath = getRebuildPath(model);
            if (!fs.existsSync(rebuildPath)) {
                throw new Error(`No existe rebuild: ${path.relative(REPO_ROOT, rebuildPath)}`);
            }

            const rebuildRows = readJsonArray(rebuildPath, path.basename(rebuildPath));
            const report = buildModelAnalysis(model, rebuildRows);
            report.paths = {
                rebuild: path.relative(REPO_ROOT, rebuildPath).replace(/\\/g, '/')
            };

            for (const field of ALL_PRIORITY_FIELDS) {
                const stats = report.all_field_stats[field];
                if (stats) {
                    csvRows.push({
                        model,
                        field: stats.field,
                        filled_count: stats.filled_count,
                        empty_count: stats.empty_count,
                        filled_percent: stats.filled_percent
                    });
                }
            }

            modelReports.push(report);
            printModelSummary(report);
        } catch (error) {
            failures.push({ model, error: error.message });
            console.error(`\n[model] ${model}`);
            console.error(`  - ERROR: ${error.message}`);
        }
    }

    // Global totals aggregated across all models
    const aggByField = {};
    for (const report of modelReports) {
        for (const [field, stats] of Object.entries(report.all_field_stats)) {
            if (!aggByField[field]) {
                aggByField[field] = { field, filled_count: 0, empty_count: 0, total: 0 };
            }
            aggByField[field].filled_count += stats.filled_count;
            aggByField[field].empty_count += stats.empty_count;
            aggByField[field].total += stats.filled_count + stats.empty_count;
        }
    }
    const globalFieldStats = Object.fromEntries(
        Object.entries(aggByField).map(([field, s]) => [field, {
            field,
            filled_count: s.filled_count,
            empty_count: s.empty_count,
            filled_percent: pct(s.filled_count, s.total)
        }])
    );

    const globalTotals = modelReports.reduce((acc, r) => {
        const s = r.summary;
        acc.total_rows += s.total_rows;
        acc.synthetic_rows += s.synthetic_rows;
        acc.rows_with_legacy_id += s.rows_with_legacy_id;
        acc.rows_without_any_assets += s.rows_without_any_assets;
        acc.rows_without_qa += s.rows_without_qa;
        acc.rows_without_finals += s.rows_without_finals;
        acc.rows_without_gesa += s.rows_without_gesa;
        acc.rows_without_sust += s.rows_without_sust;
        return acc;
    }, {
        total_rows: 0,
        synthetic_rows: 0,
        rows_with_legacy_id: 0,
        rows_without_any_assets: 0,
        rows_without_qa: 0,
        rows_without_finals: 0,
        rows_without_gesa: 0,
        rows_without_sust: 0
    });

    const globalGroupCoverage = {};
    for (const [group, fields] of Object.entries(PRIORITY_FIELDS)) {
        const groupPcts = fields
            .map((f) => globalFieldStats[f] ? globalFieldStats[f].filled_percent : 0);
        globalGroupCoverage[group] = groupPcts.length
            ? Number((groupPcts.reduce((a, n) => a + n, 0) / groupPcts.length).toFixed(2))
            : 0;
    }

    const globalReport = {
        generated_at: new Date().toISOString(),
        mode: args.dryRun ? 'DRY_RUN' : 'WRITE',
        models_requested: models,
        models_ok: modelReports.map((r) => r.model),
        models_failed: failures,
        totals: globalTotals,
        coverage_by_group_global: globalGroupCoverage,
        top_empty_fields: topEmptyFields(globalFieldStats, MAX_EXAMPLES),
        fields_100_percent: Object.values(globalFieldStats)
            .filter((f) => f.filled_percent === 100)
            .map((f) => f.field)
            .sort(),
        fields_below_10_percent: Object.values(globalFieldStats)
            .filter((f) => f.filled_percent < 10)
            .sort((a, b) => a.filled_percent - b.filled_percent || a.field.localeCompare(b.field))
            .map(({ field, filled_percent, empty_count }) => ({ field, filled_percent, empty_count })),
        coverage_by_model: modelReports.map((r) => ({
            model: r.model,
            total_rows: r.summary.total_rows,
            synthetic_rows: r.summary.synthetic_rows,
            rows_with_legacy_id: r.summary.rows_with_legacy_id,
            rows_without_any_assets: r.summary.rows_without_any_assets,
            rows_without_gesa: r.summary.rows_without_gesa,
            rows_without_sust: r.summary.rows_without_sust,
            identity_avg: r.coverage_by_group.identity ? r.coverage_by_group.identity.avg_filled_percent : 0,
            pdf_avg: r.coverage_by_group.pdf ? r.coverage_by_group.pdf.avg_filled_percent : 0,
            final_avg: r.coverage_by_group.final ? r.coverage_by_group.final.avg_filled_percent : 0,
            qa_avg: r.coverage_by_group.qa ? r.coverage_by_group.qa.avg_filled_percent : 0,
            assets_avg: r.coverage_by_group.assets ? r.coverage_by_group.assets.avg_filled_percent : 0,
            gesa_avg: r.coverage_by_group.gesa ? r.coverage_by_group.gesa.avg_filled_percent : 0,
            sust_avg: r.coverage_by_group.sust ? r.coverage_by_group.sust.avg_filled_percent : 0
        })),
        all_field_stats: globalFieldStats
    };

    // Console summary
    console.log('\n[summary]');
    console.log(`  - models_ok: ${modelReports.length}`);
    console.log(`  - models_failed: ${failures.length}`);
    console.log(`  - total_rows: ${globalTotals.total_rows}`);
    console.log(`  - synthetic_rows: ${globalTotals.synthetic_rows}`);
    console.log(`  - rows_with_legacy_id: ${globalTotals.rows_with_legacy_id}`);

    const gcg = globalReport.coverage_by_group_global;
    console.log(`  - identity_coverage: ${gcg.identity}%`);
    console.log(`  - pdf_coverage: ${gcg.pdf}%`);
    console.log(`  - final_coverage: ${gcg.final}%`);
    console.log(`  - qa_coverage: ${gcg.qa}%`);
    console.log(`  - assets_coverage: ${gcg.assets}%`);
    console.log(`  - gesa_coverage: ${gcg.gesa}%`);
    console.log(`  - sust_coverage: ${gcg.sust}%`);

    console.log(`  - rows_without_any_assets: ${globalTotals.rows_without_any_assets}`);
    console.log(`  - rows_without_qa: ${globalTotals.rows_without_qa}`);
    console.log(`  - rows_without_finals: ${globalTotals.rows_without_finals}`);
    console.log(`  - rows_without_gesa: ${globalTotals.rows_without_gesa}`);
    console.log(`  - rows_without_sust: ${globalTotals.rows_without_sust}`);

    const topEmpty = globalReport.top_empty_fields.slice(0, 8)
        .map((f) => `${f.field}:${f.filled_percent}%`)
        .join(', ');
    console.log(`  - top_empty_fields: ${topEmpty || '-'}`);
    console.log(`  - fields_100_percent: ${globalReport.fields_100_percent.slice(0, 8).join(', ') || '-'}`);

    if (!args.dryRun) {
        ensureDir(outDir);

        for (const report of modelReports) {
            const perModelPath = path.join(outDir, `rebuild_field_coverage_${report.model}.json`);
            const outReport = { ...report };
            delete outReport.all_field_stats;
            writeJson(perModelPath, outReport);
        }

        const globalPath = path.join(outDir, 'rebuild_field_coverage_ALL.json');
        writeJson(globalPath, globalReport);

        const csvPath = path.join(outDir, 'rebuild_field_coverage_ALL.csv');
        writeCsv(csvPath, csvRows);

        console.log(`  - output_global_json: ${path.relative(REPO_ROOT, globalPath).replace(/\\/g, '/')}`);
        console.log(`  - output_global_csv: ${path.relative(REPO_ROOT, csvPath).replace(/\\/g, '/')}`);
    } else {
        console.log('  - dry_run: no se escribieron reportes');
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
        return runAnalysis(args);
    } catch (error) {
        console.error(`[error] ${error.message}`);
        printHelp();
        return 1;
    }
}

if (require.main === module) {
    process.exitCode = main(process.argv);
}

module.exports = { main, buildModelAnalysis };
