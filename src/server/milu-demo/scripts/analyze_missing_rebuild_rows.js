#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { detectModelsFromEngineFiles } = require('./compare_rebuild_vs_engine');

const REPO_ROOT = path.resolve(__dirname, '..');
const REBUILD_DIR = path.join(REPO_ROOT, 'data', '02-engine_rebuild');
const REBUILD_COMPARE_DIR = path.join(REPO_ROOT, 'data', 'output', 'rebuild_compare');
const DEFAULT_OUT_DIR = path.join('data', 'output', 'rebuild_missing_analysis');
const MAX_EXAMPLES = 100;
const MAX_TOP = 100;

const NOISE_RULES = {
    designationTokens: [
        'CRANKCASE',
        'ENGINE',
        'CYLINDER BLOCK',
        'SECTION',
        'GROUP',
        'ASSY',
        'ASSEMBLY'
    ],
    introPageThreshold: 20,
    qtyOneTokens: ['1', '1.0']
};

function t(value) {
    return String(value == null ? '' : value).trim();
}

function normalizeText(value) {
    return t(value).replace(/\s+/g, ' ').toUpperCase();
}

function normalizeModelToken(raw) {
    const text = t(raw);
    if (!text) return '';
    const match = text.match(/^(?:engine_|engine_rebuild_)?(.+?)(?:\.json)?$/i);
    return t(match ? match[1] : text);
}

function parseBoolish(value) {
    if (typeof value === 'boolean') return value;
    const text = normalizeText(value);
    return text === 'TRUE' || text === '1' || text === 'YES' || text === 'SI';
}

function parseNumber(value) {
    const n = Number.parseFloat(String(value == null ? '' : value).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

function isEmptyValue(value) {
    if (value == null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return t(value) === '';
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

    if (args.all && args.engine) {
        throw new Error('Use solo uno: --all o --engine <MODEL>.');
    }
    if (!args.all && !args.engine) {
        throw new Error('Debe indicar --all o --engine <MODEL>.');
    }

    return args;
}

function printHelp() {
    console.log([
        'Uso:',
        '  node scripts/analyze_missing_rebuild_rows.js --engine 20V4000M93L --dry-run',
        '  node scripts/analyze_missing_rebuild_rows.js --engine 20V4000M93L --write --out data/output/rebuild_missing_analysis/',
        '  node scripts/analyze_missing_rebuild_rows.js --all --dry-run',
        '  node scripts/analyze_missing_rebuild_rows.js --all --write --out data/output/rebuild_missing_analysis/',
        '',
        'Flags:',
        '  --engine MODEL    Modelo concreto',
        '  --all             Todos los modelos detectados por engine_*.json',
        '  --dry-run         No escribe reportes (default)',
        '  --write           Escribe reportes JSON/CSV',
        '  --out DIR         Carpeta de salida (default: data/output/rebuild_missing_analysis/)',
        '  --help            Muestra esta ayuda'
    ].join('\n'));
}

function listModels(args) {
    if (args.all) {
        const models = detectModelsFromEngineFiles(REPO_ROOT);
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

function readJsonObjectIfExists(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

function getEnginePath(model) {
    return path.join(REPO_ROOT, `engine_${model}.json`);
}

function getRebuildPath(model) {
    return path.join(REBUILD_DIR, `engine_rebuild_${model}.json`);
}

function getComparePath(model) {
    return path.join(REBUILD_COMPARE_DIR, `rebuild_compare_${model}.json`);
}

function getComparableIdFromRebuildRow(row) {
    const legacyId = t(row && row.rebuild_legacy_engine_id);
    if (legacyId) return legacyId;
    return t(row && row.ID);
}

function isSyntheticRow(row) {
    const id = t(row && row.ID);
    const legacyId = t(row && row.rebuild_legacy_engine_id);
    return /^RB-/i.test(id) && !legacyId;
}

function buildMapById(rows, idResolver) {
    const map = new Map();
    for (const row of rows) {
        const id = idResolver(row);
        if (!id) continue;
        if (!map.has(id)) map.set(id, row || {});
    }
    return map;
}

function increment(mapObj, key) {
    mapObj[key] = (mapObj[key] || 0) + 1;
}

function topCounts(mapObj, maxItems) {
    return Object.entries(mapObj)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, maxItems)
        .map(([key, count]) => ({ key, count }));
}

function firstNonEmpty(row, fields) {
    for (const field of fields) {
        const value = row && row[field];
        if (!isEmptyValue(value)) return value;
    }
    return '';
}

function buildSyntheticIndexes(rebuildRows) {
    const syntheticRows = rebuildRows.filter((row) => isSyntheticRow(row));
    const pnSet = new Set();
    const posSet = new Set();
    const designationSet = new Set();

    for (const row of syntheticRows) {
        const pn = normalizeText(firstNonEmpty(row, ['pn_final', 'PART NO.']));
        const pos = normalizeText(firstNonEmpty(row, ['pos_final', 'POS']));
        const des = normalizeText(firstNonEmpty(row, ['designation_final', 'DESIGNATION']));
        if (pn) pnSet.add(pn);
        if (pos) posSet.add(pos);
        if (des) designationSet.add(des);
    }

    return {
        rows: syntheticRows,
        pnSet,
        posSet,
        designationSet
    };
}

function evaluateNoiseHeuristic(row) {
    const designation = normalizeText(firstNonEmpty(row, ['designation_final', 'DESIGNATION']));
    const pn = normalizeText(firstNonEmpty(row, ['pn_final', 'PART NO.']));
    const qtyText = t(firstNonEmpty(row, ['qty_final', 'QTY']));
    const sourcePage = parseNumber(firstNonEmpty(row, ['Source Page']));
    const fg = normalizeText(firstNonEmpty(row, ['fg_fgs_final', 'FG/FGS']));

    const hasNoiseDesignation = NOISE_RULES.designationTokens.some((token) => designation.includes(token));
    const emptyPn = !pn;
    const qtyIsOne = NOISE_RULES.qtyOneTokens.includes(qtyText);
    const introPage = sourcePage != null && sourcePage <= NOISE_RULES.introPageThreshold;
    const emptyFg = !fg;

    const score = [emptyPn, qtyIsOne, introPage, emptyFg].filter(Boolean).length;
    return hasNoiseDesignation || score >= 2;
}

function classifyMissingRow(row, syntheticIndex) {
    const categories = [];

    const pnFinal = t(row && row.pn_final);
    const pnLegacy = t(row && row['PART NO.']);
    const posFinal = t(row && row.pos_final);
    const posLegacy = t(row && row.POS);
    const fnFinal = normalizeText(row && row.fn_final);
    const fnLegacy = normalizeText(row && row.FN);
    const totalError = parseNumber(row && row.total_error) || 0;
    const hasError = parseBoolish(row && row.has_error);
    const qaEstado = normalizeText(row && row.qa_revision_estado);
    const qaAccion = normalizeText(row && row.qa_revision_accion);
    const withoutAssets = isEmptyValue(row && row.filename_foto)
        && isEmptyValue(row && row.esquemas)
        && isEmptyValue(row && row.ruta_esquemas_pos);

    if (!pnFinal || !pnLegacy) categories.push('missing_with_empty_pn');
    if (!posFinal || !posLegacy) categories.push('missing_with_empty_pos');
    if (fnFinal === 'KE' || fnLegacy === 'KE') categories.push('missing_ke');
    if (totalError > 0 || hasError) categories.push('missing_with_errors');
    if (qaEstado !== 'OK' || qaAccion !== 'IMPORTAR') categories.push('missing_pending_revision');
    if (withoutAssets) categories.push('missing_without_assets');
    if (evaluateNoiseHeuristic(row)) categories.push('missing_probably_noise');

    const pnNorm = normalizeText(firstNonEmpty(row, ['pn_final', 'PART NO.']));
    const posNorm = normalizeText(firstNonEmpty(row, ['pos_final', 'POS']));
    const desNorm = normalizeText(firstNonEmpty(row, ['designation_final', 'DESIGNATION']));

    const mergedMatches = [];
    if (pnNorm && syntheticIndex.pnSet.has(pnNorm)) mergedMatches.push('pn_final');
    if (posNorm && syntheticIndex.posSet.has(posNorm)) mergedMatches.push('pos_final');
    if (desNorm && syntheticIndex.designationSet.has(desNorm)) mergedMatches.push('designation_final');
    if (mergedMatches.length > 0) categories.push('missing_probably_merged');

    return {
        categories,
        merged_matches: mergedMatches
    };
}

function getMissingIdsFromRows(engineRows, rebuildRows) {
    const engineMap = buildMapById(engineRows, (row) => t(row && row.ID));
    const rebuildMap = buildMapById(rebuildRows, (row) => getComparableIdFromRebuildRow(row));
    const missing = [];
    for (const id of engineMap.keys()) {
        if (!rebuildMap.has(id)) missing.push(id);
    }
    return missing.sort((a, b) => a.localeCompare(b));
}

function baseCsvRow(model, row) {
    return {
        model,
        id: t(row && row.ID),
        pn_final: t(firstNonEmpty(row, ['pn_final', 'PART NO.'])),
        pos_final: t(firstNonEmpty(row, ['pos_final', 'POS'])),
        designation_final: t(firstNonEmpty(row, ['designation_final', 'DESIGNATION'])),
        source_page: t(row && row['Source Page']),
        fg_fgs_final: t(firstNonEmpty(row, ['fg_fgs_final', 'FG/FGS'])),
        qa_revision_estado: t(row && row.qa_revision_estado),
        qa_revision_accion: t(row && row.qa_revision_accion)
    };
}

function buildModelAnalysis(model, engineRows, rebuildRows, compareReport) {
    const engineMap = buildMapById(engineRows, (row) => t(row && row.ID));
    const missingIds = getMissingIdsFromRows(engineRows, rebuildRows);
    const syntheticIndex = buildSyntheticIndexes(rebuildRows);

    const categoriesOrder = [
        'missing_with_empty_pn',
        'missing_with_empty_pos',
        'missing_ke',
        'missing_with_errors',
        'missing_pending_revision',
        'missing_without_assets',
        'missing_probably_noise',
        'missing_probably_merged'
    ];

    const categoryCounts = {};
    const categorySamples = {};
    for (const category of categoriesOrder) {
        categoryCounts[category] = 0;
        categorySamples[category] = [];
    }

    const byPage = {};
    const byFg = {};
    const csvRows = [];
    const missingRowsAnalyzed = [];

    for (const id of missingIds) {
        const row = engineMap.get(id) || {};
        const info = classifyMissingRow(row, syntheticIndex);
        const rowBase = baseCsvRow(model, row);
        const sampleBase = {
            ...rowBase,
            merged_matches: info.merged_matches
        };

        const sourcePage = t(rowBase.source_page);
        if (sourcePage) increment(byPage, sourcePage);
        const fg = rowBase.fg_fgs_final || '(empty)';
        increment(byFg, fg);

        for (const category of info.categories) {
            categoryCounts[category] += 1;
            if (categorySamples[category].length < MAX_EXAMPLES) {
                categorySamples[category].push(sampleBase);
            }
            csvRows.push({ ...rowBase, category });
        }

        if (info.categories.length === 0) {
            csvRows.push({ ...rowBase, category: 'missing_uncategorized' });
        }

        if (missingRowsAnalyzed.length < MAX_EXAMPLES) {
            missingRowsAnalyzed.push({
                ...sampleBase,
                categories: info.categories
            });
        }
    }

    const compareSummary = compareReport && compareReport.summary ? compareReport.summary : null;

    return {
        model,
        generated_at: new Date().toISOString(),
        source: {
            compare_report_path: fs.existsSync(getComparePath(model))
                ? path.relative(REPO_ROOT, getComparePath(model)).replace(/\\/g, '/')
                : null,
            compare_report_loaded: Boolean(compareReport),
            compare_summary: compareSummary
        },
        summary: {
            total_engine: engineRows.length,
            total_rebuild: rebuildRows.length,
            total_missing: missingIds.length,
            missing_with_empty_pn: categoryCounts.missing_with_empty_pn,
            missing_with_empty_pos: categoryCounts.missing_with_empty_pos,
            missing_ke: categoryCounts.missing_ke,
            missing_with_errors: categoryCounts.missing_with_errors,
            missing_pending_revision: categoryCounts.missing_pending_revision,
            missing_without_assets: categoryCounts.missing_without_assets,
            missing_probably_noise: categoryCounts.missing_probably_noise,
            missing_probably_merged: categoryCounts.missing_probably_merged,
            synthetic_rebuild_rows_total: syntheticIndex.rows.length
        },
        ids_missing_in_rebuild: missingIds,
        category_counts: categoryCounts,
        category_samples: categorySamples,
        missing_by_source_page: topCounts(byPage, MAX_TOP),
        missing_by_fg: topCounts(byFg, MAX_TOP),
        missing_rows_sample: missingRowsAnalyzed,
        synthetic_rebuild_rows_total: syntheticIndex.rows.length,
        synthetic_rebuild_rows_sample: syntheticIndex.rows.slice(0, MAX_EXAMPLES).map((row) => ({
            ID: t(row && row.ID),
            source_page: t(row && row['Source Page']),
            pn_final: t(firstNonEmpty(row, ['pn_final', 'PART NO.'])),
            pos_final: t(firstNonEmpty(row, ['pos_final', 'POS'])),
            designation_final: t(firstNonEmpty(row, ['designation_final', 'DESIGNATION']))
        })),
        csv_rows_all: csvRows
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

function writeCsv(filePath, rows) {
    const header = [
        'model',
        'id',
        'category',
        'pn_final',
        'pos_final',
        'designation_final',
        'source_page',
        'fg_fgs_final',
        'qa_revision_estado',
        'qa_revision_accion'
    ];

    const lines = [header.join(',')];
    for (const row of rows) {
        lines.push([
            csvEscape(row.model),
            csvEscape(row.id),
            csvEscape(row.category),
            csvEscape(row.pn_final),
            csvEscape(row.pos_final),
            csvEscape(row.designation_final),
            csvEscape(row.source_page),
            csvEscape(row.fg_fgs_final),
            csvEscape(row.qa_revision_estado),
            csvEscape(row.qa_revision_accion)
        ].join(','));
    }
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function printModelSummary(report) {
    const s = report.summary;
    console.log(`\n[model] ${report.model}`);
    console.log(`  - total_missing: ${s.total_missing}`);
    console.log(`  - missing_probably_noise: ${s.missing_probably_noise}`);
    console.log(`  - missing_probably_merged: ${s.missing_probably_merged}`);
    console.log(`  - missing_with_empty_pn: ${s.missing_with_empty_pn}`);
    console.log(`  - missing_ke: ${s.missing_ke}`);
    console.log(`  - missing_pending_revision: ${s.missing_pending_revision}`);

    const topPages = report.missing_by_source_page.slice(0, 5)
        .map((x) => `${x.key}:${x.count}`)
        .join(', ');
    const topFg = report.missing_by_fg.slice(0, 5)
        .map((x) => `${x.key}:${x.count}`)
        .join(', ');
    console.log(`  - top_pages: ${topPages || '-'}`);
    console.log(`  - top_fg: ${topFg || '-'}`);
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
            const enginePath = getEnginePath(model);
            const rebuildPath = getRebuildPath(model);
            if (!fs.existsSync(enginePath)) {
                throw new Error(`No existe engine base: ${path.relative(REPO_ROOT, enginePath)}`);
            }
            if (!fs.existsSync(rebuildPath)) {
                throw new Error(`No existe rebuild: ${path.relative(REPO_ROOT, rebuildPath)}`);
            }

            const engineRows = readJsonArray(enginePath, path.basename(enginePath));
            const rebuildRows = readJsonArray(rebuildPath, path.basename(rebuildPath));
            const compareReport = readJsonObjectIfExists(getComparePath(model));

            const report = buildModelAnalysis(model, engineRows, rebuildRows, compareReport);
            report.paths = {
                engine: path.relative(REPO_ROOT, enginePath).replace(/\\/g, '/'),
                rebuild: path.relative(REPO_ROOT, rebuildPath).replace(/\\/g, '/'),
                compare: fs.existsSync(getComparePath(model))
                    ? path.relative(REPO_ROOT, getComparePath(model)).replace(/\\/g, '/')
                    : null
            };

            for (const row of report.csv_rows_all) {
                csvRows.push(row);
            }
            modelReports.push(report);
            printModelSummary(report);
        } catch (error) {
            failures.push({ model, error: error.message });
            console.error(`\n[model] ${model}`);
            console.error(`  - ERROR: ${error.message}`);
        }
    }

    const byEngine = modelReports.map((report) => ({
        model: report.model,
        ...report.summary
    }));

    const totals = byEngine.reduce((acc, row) => {
        acc.total_missing += row.total_missing;
        acc.missing_probably_noise += row.missing_probably_noise;
        acc.missing_probably_merged += row.missing_probably_merged;
        acc.missing_with_empty_pn += row.missing_with_empty_pn;
        acc.missing_ke += row.missing_ke;
        acc.missing_pending_revision += row.missing_pending_revision;
        acc.missing_with_errors += row.missing_with_errors;
        acc.missing_without_assets += row.missing_without_assets;
        return acc;
    }, {
        total_missing: 0,
        missing_probably_noise: 0,
        missing_probably_merged: 0,
        missing_with_empty_pn: 0,
        missing_ke: 0,
        missing_pending_revision: 0,
        missing_with_errors: 0,
        missing_without_assets: 0
    });

    const globalPages = {};
    const globalFg = {};
    for (const report of modelReports) {
        for (const item of report.missing_by_source_page) {
            const key = `${report.model}:${item.key}`;
            globalPages[key] = item.count;
        }
        for (const item of report.missing_by_fg) {
            const key = `${report.model}:${item.key}`;
            globalFg[key] = item.count;
        }
    }

    const globalReport = {
        generated_at: new Date().toISOString(),
        mode: args.dryRun ? 'DRY_RUN' : 'WRITE',
        models_requested: models,
        models_ok: modelReports.map((r) => r.model),
        models_failed: failures,
        totals,
        missing_by_engine: byEngine,
        top_pages: topCounts(globalPages, MAX_TOP),
        top_fg: topCounts(globalFg, MAX_TOP)
    };

    console.log('\n[summary]');
    console.log(`  - models_ok: ${modelReports.length}`);
    console.log(`  - models_failed: ${failures.length}`);
    console.log(`  - total_missing: ${totals.total_missing}`);
    console.log(`  - missing_probably_noise: ${totals.missing_probably_noise}`);
    console.log(`  - missing_probably_merged: ${totals.missing_probably_merged}`);
    console.log(`  - missing_with_empty_pn: ${totals.missing_with_empty_pn}`);
    console.log(`  - missing_ke: ${totals.missing_ke}`);
    console.log(`  - missing_pending_revision: ${totals.missing_pending_revision}`);
    console.log(`  - top_pages: ${(globalReport.top_pages.slice(0, 5).map((x) => `${x.key}:${x.count}`).join(', ')) || '-'}`);
    console.log(`  - top_fg: ${(globalReport.top_fg.slice(0, 5).map((x) => `${x.key}:${x.count}`).join(', ')) || '-'}`);

    if (!args.dryRun) {
        ensureDir(outDir);

        for (const report of modelReports) {
            const perModelPath = path.join(outDir, `missing_analysis_${report.model}.json`);
            const outReport = { ...report };
            delete outReport.csv_rows_all;
            writeJson(perModelPath, outReport);
        }

        const globalPath = path.join(outDir, 'missing_analysis_ALL.json');
        writeJson(globalPath, globalReport);

        const csvPath = path.join(outDir, 'missing_analysis_ALL.csv');
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

module.exports = {
    main,
    buildModelAnalysis,
    classifyMissingRow
};
