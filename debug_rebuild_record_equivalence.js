#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = __dirname;
const DEFAULT_OUT_DIR = path.join('data', 'output', 'rebuild_debug');

const PN_FIELDS = ['pn_final', 'pn_pdf', 'PART NO.'];

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

const EXPECTED_REBUILD_DIFF_FIELDS = new Set([
    'ID'
]);

const FIELD_SOURCES = {
    book_preview: [
        'Source Page',
        'POS',
        'PART NO.',
        'designation_pdf',
        'pn_pdf',
        'pos_pdf',
        'qty_pdf',
        'measure_pdf',
        'norma_pdf',
        'units_pdf'
    ],
    gesa_sust: [
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
    qa_errors_finals: [
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
        'qa_revision_estado',
        'qa_revision_accion',
        'total_error',
        'has_error'
    ]
};

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
        pn: '',
        id: '',
        out: DEFAULT_OUT_DIR,
        dryRun: true,
        writeReport: false,
        help: false
    };

    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];

        if (token === '--engine') {
            args.engine = t(argv[i + 1]);
            i += 1;
            continue;
        }
        if (token === '--pn') {
            args.pn = t(argv[i + 1]);
            i += 1;
            continue;
        }
        if (token === '--id') {
            args.id = t(argv[i + 1]);
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
        if (token === '--write-report') {
            args.writeReport = true;
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

    args.engine = normalizeModelToken(args.engine);
    if (!args.engine) throw new Error('Debe indicar --engine MODEL.');
    if (!args.pn) throw new Error('Debe indicar --pn PN.');

    return args;
}

function printHelp() {
    console.log([
        'Uso:',
        '  node debug_rebuild_record_equivalence.js --engine 12V4000M40A --pn 0049976736 --dry-run',
        '  node debug_rebuild_record_equivalence.js --engine 12V4000M40A --pn 0049976736 --id 12345 --write-report',
        '',
        'Flags:',
        '  --engine MODEL      Modelo (ej: 12V4000M40A)',
        '  --pn PN             Part number a analizar',
        '  --id ID             ID concreto de engine (opcional)',
        '  --out DIR           Carpeta salida reporte (default: data/output/rebuild_debug/)',
        '  --dry-run           No escribe reporte (default)',
        '  --write-report      Escribe reporte JSON',
        '  --help              Muestra esta ayuda'
    ].join('\n'));
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
    return path.join(REPO_ROOT, 'data', 'output', 'rebuild', `engine_rebuild_${model}.json`);
}

function getPnTokens(row) {
    const out = [];
    for (const field of PN_FIELDS) {
        const value = t(row && row[field]);
        if (value) out.push(value);
    }
    return out;
}

function hasPnMatch(row, targetPn) {
    const pn = t(targetPn);
    if (!pn) return false;
    for (const candidate of getPnTokens(row)) {
        if (candidate === pn) return true;
    }
    return false;
}

function getMatchReasonsEngine(row, targetPn, id) {
    const reasons = [];
    if (hasPnMatch(row, targetPn)) reasons.push('pn_match');
    if (id && t(row && row.ID) === id) reasons.push('id_match');
    return reasons;
}

function getMatchReasonsRebuild(row, selectedEngine, targetPn) {
    const reasons = [];
    const selectedEngineId = t(selectedEngine && selectedEngine.ID);
    const legacyId = t(row && row.rebuild_legacy_engine_id);

    if (selectedEngineId && legacyId && legacyId === selectedEngineId) {
        reasons.push('legacy_id_match');
    }
    if (hasPnMatch(row, targetPn)) {
        reasons.push('pn_match');
    }

    return reasons;
}

function scoreRebuildMatch(reasons) {
    let score = 0;
    for (const reason of reasons) {
        if (reason === 'legacy_id_match') score += 100;
        if (reason === 'pn_match') score += 10;
    }
    return score;
}

function selectEngineRecord(engineMatches, requestedId) {
    if (!engineMatches.length) return null;
    if (requestedId) {
        const byId = engineMatches.find((item) => t(item.row && item.row.ID) === requestedId);
        if (byId) return byId;
        return null;
    }

    const byPnFinal = engineMatches.find((item) => t(item.row && item.row.pn_final) !== '');
    return byPnFinal || engineMatches[0];
}

function selectRebuildRecord(rebuildMatches) {
    if (!rebuildMatches.length) return null;

    const sorted = rebuildMatches.slice().sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aLegacy = t(a.row && a.row.rebuild_legacy_engine_id);
        const bLegacy = t(b.row && b.row.rebuild_legacy_engine_id);
        if (aLegacy && !bLegacy) return -1;
        if (!aLegacy && bLegacy) return 1;
        return t(a.row && a.row.ID).localeCompare(t(b.row && b.row.ID));
    });

    return sorted[0];
}

function stableStringify(value) {
    return JSON.stringify(sortDeep(value));
}

function sortDeep(value) {
    if (Array.isArray(value)) {
        return value.map((item) => sortDeep(item));
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
        const out = {};
        for (const key of keys) {
            out[key] = sortDeep(value[key]);
        }
        return out;
    }
    return value;
}

function normalizeForFormatting(value) {
    if (value == null) return '';
    if (typeof value === 'string') {
        return value.trim().replace(/\s+/g, ' ');
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return stableStringify(value);
}

function isEmpty(value) {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

function classifyDifference(field, engineValue, rebuildValue, selectedEngine, selectedRebuild) {
    if (engineValue === null && rebuildValue === '') return 'null_vs_empty';
    if (engineValue === '' && rebuildValue === null) return 'null_vs_empty';

    const engineEmpty = isEmpty(engineValue);
    const rebuildEmpty = isEmpty(rebuildValue);
    if ((engineEmpty && !rebuildEmpty) || (!engineEmpty && rebuildEmpty)) {
        return 'empty_vs_value';
    }

    if (normalizeForFormatting(engineValue) === normalizeForFormatting(rebuildValue)) {
        return 'formatting_diff';
    }

    if (EXPECTED_REBUILD_DIFF_FIELDS.has(field)) {
        if (field === 'ID') {
            const legacy = t(selectedRebuild && selectedRebuild.rebuild_legacy_engine_id);
            const engineId = t(selectedEngine && selectedEngine.ID);
            if (legacy && engineId && legacy === engineId) {
                return 'expected_rebuild_diff';
            }
        } else {
            return 'expected_rebuild_diff';
        }
    }

    return 'exact_diff';
}

function classifyMissing(field) {
    if (CRITICAL_FIELDS.has(field)) return 'critical_missing';
    return 'empty_vs_value';
}

function getFieldSource(field) {
    for (const [source, fields] of Object.entries(FIELD_SOURCES)) {
        if (fields.includes(field)) return source;
    }
    return 'unknown';
}

function sanitizeTokenForFile(value) {
    const cleaned = t(value).replace(/[^a-zA-Z0-9._-]+/g, '_');
    return cleaned || 'empty';
}

function compareRecords(selectedEngine, selectedRebuild) {
    const engine = selectedEngine || {};
    const rebuild = selectedRebuild || {};

    const engineKeys = Object.keys(engine);
    const rebuildKeys = Object.keys(rebuild);

    const allKeys = [...new Set([...engineKeys, ...rebuildKeys])].sort((a, b) => a.localeCompare(b));

    const fieldsEqual = [];
    const fieldsDifferent = [];
    const fieldsMissingInRebuild = [];
    const fieldsExtraInRebuild = [];

    for (const field of allKeys) {
        const hasEngine = Object.prototype.hasOwnProperty.call(engine, field);
        const hasRebuild = Object.prototype.hasOwnProperty.call(rebuild, field);

        if (hasEngine && !hasRebuild) {
            fieldsMissingInRebuild.push({
                field,
                engine_value: engine[field],
                classification: classifyMissing(field),
                is_critical: CRITICAL_FIELDS.has(field),
                source_guess: getFieldSource(field)
            });
            continue;
        }

        if (!hasEngine && hasRebuild) {
            fieldsExtraInRebuild.push({
                field,
                rebuild_value: rebuild[field],
                classification: 'expected_rebuild_diff',
                is_critical: false,
                source_guess: getFieldSource(field)
            });
            continue;
        }

        const engineValue = engine[field];
        const rebuildValue = rebuild[field];
        const equal = stableStringify(engineValue) === stableStringify(rebuildValue);

        if (equal) {
            fieldsEqual.push({ field, value: engineValue });
            continue;
        }

        fieldsDifferent.push({
            field,
            engine_value: engineValue,
            rebuild_value: rebuildValue,
            classification: classifyDifference(field, engineValue, rebuildValue, engine, rebuild),
            is_critical: CRITICAL_FIELDS.has(field),
            source_guess: getFieldSource(field)
        });
    }

    return {
        fields_equal: fieldsEqual,
        fields_different: fieldsDifferent,
        fields_missing_in_rebuild: fieldsMissingInRebuild,
        fields_extra_in_rebuild: fieldsExtraInRebuild
    };
}

function buildSourceSummary(diffBlocks) {
    const summary = {
        book_preview: { missing: 0, different: 0, extra: 0 },
        gesa_sust: { missing: 0, different: 0, extra: 0 },
        assets: { missing: 0, different: 0, extra: 0 },
        qa_errors_finals: { missing: 0, different: 0, extra: 0 },
        unknown: { missing: 0, different: 0, extra: 0 }
    };

    for (const item of diffBlocks.fields_missing_in_rebuild) {
        summary[item.source_guess].missing += 1;
    }
    for (const item of diffBlocks.fields_different) {
        summary[item.source_guess].different += 1;
    }
    for (const item of diffBlocks.fields_extra_in_rebuild) {
        summary[item.source_guess].extra += 1;
    }

    return summary;
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function formatRowPreview(row) {
    if (!row) return null;
    return {
        ID: t(row.ID),
        rebuild_legacy_engine_id: t(row.rebuild_legacy_engine_id),
        pn_final: t(row.pn_final),
        pn_pdf: t(row.pn_pdf),
        part_no: t(row['PART NO.']),
        pos_final: t(row.pos_final),
        source_page: t(row['Source Page'])
    };
}

function run(args) {
    const enginePath = getEnginePath(args.engine);
    const rebuildPath = getRebuildPath(args.engine);

    if (!fs.existsSync(enginePath)) {
        throw new Error(`No existe engine base: ${path.relative(REPO_ROOT, enginePath).replace(/\\/g, '/')}`);
    }
    if (!fs.existsSync(rebuildPath)) {
        throw new Error(`No existe rebuild: ${path.relative(REPO_ROOT, rebuildPath).replace(/\\/g, '/')}`);
    }

    const engineRows = readJsonArray(enginePath, path.basename(enginePath));
    const rebuildRows = readJsonArray(rebuildPath, path.basename(rebuildPath));

    const engineMatches = engineRows
        .map((row, index) => ({ row, index, reasons: getMatchReasonsEngine(row, args.pn, args.id) }))
        .filter((item) => item.reasons.length > 0)
        .filter((item) => !args.id || t(item.row && item.row.ID) === args.id);

    if (!engineMatches.length) {
        throw new Error(`No hay registros en engine_${args.engine}.json con PN ${args.pn}${args.id ? ` e ID ${args.id}` : ''}.`);
    }

    const selectedEngineMatch = selectEngineRecord(engineMatches, args.id);
    if (!selectedEngineMatch) {
        throw new Error(`No se pudo seleccionar registro engine para ID ${args.id}.`);
    }

    const selectedEngine = selectedEngineMatch.row;
    const selectedEngineId = t(selectedEngine && selectedEngine.ID);

    const rebuildMatches = rebuildRows
        .map((row, index) => {
            const reasons = getMatchReasonsRebuild(row, selectedEngine, args.pn);
            return { row, index, reasons, score: scoreRebuildMatch(reasons) };
        })
        .filter((item) => item.reasons.length > 0);

    if (!rebuildMatches.length) {
        throw new Error(`No hay registros en rebuild con PN ${args.pn} ni rebuild_legacy_engine_id ${selectedEngineId}.`);
    }

    const selectedRebuildMatch = selectRebuildRecord(rebuildMatches);
    const selectedRebuild = selectedRebuildMatch.row;

    const diffBlocks = compareRecords(selectedEngine, selectedRebuild);
    const criticalMissingCount = diffBlocks.fields_missing_in_rebuild.filter((x) => x.is_critical).length;

    const summary = {
        model: args.engine,
        pn: args.pn,
        engine_matches: engineMatches.length,
        rebuild_matches: rebuildMatches.length,
        selected_engine_id: selectedEngineId,
        selected_rebuild_id: t(selectedRebuild && selectedRebuild.ID),
        equal_fields_count: diffBlocks.fields_equal.length,
        different_fields_count: diffBlocks.fields_different.length,
        missing_fields_count: diffBlocks.fields_missing_in_rebuild.length,
        critical_missing_count: criticalMissingCount
    };

    const report = {
        generated_at: new Date().toISOString(),
        mode: args.dryRun ? 'DRY_RUN' : 'WRITE_REPORT',
        input: {
            model: args.engine,
            pn: args.pn,
            id: args.id || null,
            engine_path: path.relative(REPO_ROOT, enginePath).replace(/\\/g, '/'),
            rebuild_path: path.relative(REPO_ROOT, rebuildPath).replace(/\\/g, '/')
        },
        summary,
        selected_records: {
            engine: formatRowPreview(selectedEngine),
            rebuild: formatRowPreview(selectedRebuild)
        },
        candidates: {
            engine: engineMatches.map((m) => ({
                index: m.index,
                reasons: m.reasons,
                row: formatRowPreview(m.row)
            })),
            rebuild: rebuildMatches
                .sort((a, b) => b.score - a.score)
                .map((m) => ({
                    index: m.index,
                    score: m.score,
                    reasons: m.reasons,
                    row: formatRowPreview(m.row)
                }))
        },
        equivalence: diffBlocks,
        source_summary: buildSourceSummary(diffBlocks)
    };

    console.log('[summary]');
    console.log(`  - model: ${summary.model}`);
    console.log(`  - pn: ${summary.pn}`);
    console.log(`  - engine_matches: ${summary.engine_matches}`);
    console.log(`  - rebuild_matches: ${summary.rebuild_matches}`);
    console.log(`  - selected_engine_id: ${summary.selected_engine_id}`);
    console.log(`  - selected_rebuild_id: ${summary.selected_rebuild_id}`);
    console.log(`  - equal_fields_count: ${summary.equal_fields_count}`);
    console.log(`  - different_fields_count: ${summary.different_fields_count}`);
    console.log(`  - missing_fields_count: ${summary.missing_fields_count}`);
    console.log(`  - critical_missing_count: ${summary.critical_missing_count}`);

    let reportPath = null;
    if (args.writeReport) {
        const outDir = path.resolve(REPO_ROOT, args.out);
        ensureDir(outDir);
        const fileName = `rebuild_record_equivalence_${sanitizeTokenForFile(args.engine)}_${sanitizeTokenForFile(args.pn)}.json`;
        reportPath = path.join(outDir, fileName);
        writeJson(reportPath, report);
        console.log(`  - report: ${path.relative(REPO_ROOT, reportPath).replace(/\\/g, '/')}`);
    } else {
        console.log('  - report: dry-run (no se escribio archivo)');
    }

    return {
        report,
        reportPath
    };
}

function main(argv) {
    try {
        const args = parseArgs(argv);
        if (args.help) {
            printHelp();
            return 0;
        }
        run(args);
        return 0;
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
    run,
    compareRecords,
    parseArgs
};
