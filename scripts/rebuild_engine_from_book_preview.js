#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');

const PDF_FIELDS = [
    'pos_pdf',
    'pn_pdf',
    'designation_pdf',
    'model_type_pdf',
    'qty_pdf',
    'units_pdf',
    'weight_pdf',
    'fn_pdf',
    'measure_pdf',
    'norma_pdf',
    'bom_pdf',
    'fg_fgs_pdf'
];

const OTHER_EMPTY_FIELDS = [
    'pos_pdf',
    'pn_pdf',
    'model_type_pdf',
    'qty_pdf',
    'units_pdf',
    'weight_pdf',
    'fn_pdf',
    'measure_pdf',
    'norma_pdf'
];

const OUTPUT_DIR = path.join('data', 'output', 'rebuild');

/**
 * Reglas de rango de páginas por motor.
 * Los registros con source_page fuera del rango definido se descartan antes del rebuild.
 * Útil para PDFs mixtos donde una parte del libro corresponde a otra serie de motor.
 */
const REBUILD_BOOK_PAGE_RULES = {
    '20V4000M93L': {
        minSourcePage: 1115,
        reason: 'PDF mixto: se ignora la parte inicial de serie 2000'
    }
};

function t(value) {
    return String(value == null ? '' : value).trim();
}

function asInt(value) {
    if (value == null || value === '') return null;
    const n = Number.parseInt(String(value).trim(), 10);
    return Number.isFinite(n) ? n : null;
}

function normalizeModelToken(raw) {
    const text = t(raw);
    if (!text) return '';
    const match = text.match(/^(?:engine_|book_preview_)?(.+?)(?:\.json)?$/i);
    return t(match ? match[1] : text);
}

function getPnCandidates(row) {
    const out = [];
    for (const key of ['pn_pdf', 'PART NO.', 'pn_final', 'pn_excel']) {
        const value = t(row && row[key]);
        if (value) out.push(value);
    }
    return [...new Set(out)];
}

function getEnginePage(row) {
    return asInt(row && row['Source Page']);
}

function getEnginePos(row) {
    return t((row && (row.POS || row.pos_pdf || row.pos_final)) || '');
}

function buildEnginePagePosIndex(engineRows) {
    const map = new Map();
    for (let i = 0; i < engineRows.length; i += 1) {
        const row = engineRows[i] || {};
        const page = getEnginePage(row);
        const pos = getEnginePos(row);
        if (!page || !pos) continue;
        const key = `${page}|${pos}`;
        const list = map.get(key) || [];
        list.push(i);
        map.set(key, list);
    }
    return map;
}

function buildEnginePagePnIndex(engineRows) {
    const map = new Map();
    for (let i = 0; i < engineRows.length; i += 1) {
        const row = engineRows[i] || {};
        const page = getEnginePage(row);
        if (!page) continue;
        const pnCandidates = getPnCandidates(row);
        for (const pn of pnCandidates) {
            const key = `${page}|${pn}`;
            const list = map.get(key) || [];
            list.push(i);
            map.set(key, list);
        }
    }
    return map;
}

function selectByPagePos(engineRows, pagePosIdx, page, pos, pnPdf) {
    const candidates = pagePosIdx.get(`${page}|${pos}`) || [];
    if (candidates.length === 0) return { index: null, status: 'not-found' };
    if (candidates.length === 1) return { index: candidates[0], status: 'unique' };

    if (pnPdf) {
        const byPn = candidates.filter((i) => getPnCandidates(engineRows[i]).includes(pnPdf));
        if (byPn.length === 1) return { index: byPn[0], status: 'tiebreak-pn' };
    }

    return { index: null, status: 'ambiguous', candidates };
}

function selectByPagePn(pagePnIdx, page, pnPdf) {
    if (!pnPdf) return { index: null, status: 'not-found' };
    const candidates = pagePnIdx.get(`${page}|${pnPdf}`) || [];
    if (candidates.length === 0) return { index: null, status: 'not-found' };
    if (candidates.length === 1) return { index: candidates[0], status: 'page-pn' };
    return { index: null, status: 'ambiguous', candidates };
}

function isOtherRow(row) {
    const allCoreEmpty = OTHER_EMPTY_FIELDS.every((field) => !t(row && row[field]));
    if (allCoreEmpty) return true;

    const onlyPnFilled = t(row && row.pn_pdf)
        && OTHER_EMPTY_FIELDS
            .filter((field) => field !== 'pn_pdf')
            .every((field) => !t(row && row[field]));

    return Boolean(onlyPnFilled);
}

function readJsonArray(filePath, label) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error(`${label} no contiene un array JSON.`);
    }
    return parsed;
}

function readJsonObject(filePath, label) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${label} no contiene un objeto JSON.`);
    }
    return parsed;
}

function flattenPreviewRows(preview) {
    const out = [];
    const pages = Array.isArray(preview.pages) ? preview.pages : [];
    for (const pageBlock of pages) {
        const page = asInt(pageBlock && pageBlock.source_page);
        const rows = Array.isArray(pageBlock && pageBlock.rows) ? pageBlock.rows : [];
        for (const row of rows) {
            out.push({
                page,
                row
            });
        }
    }
    return out;
}

function defaultQaFields() {
    return {
        pos_error: 0,
        pn_error: 0,
        designation_error: 0,
        model_type_error: 0,
        qty_error: 0,
        units_error: 0,
        weight_error: 0,
        fn_error: 0,
        measure_error: 0,
        norma_error: 0,
        fg_fgs_error: 0,
        bom_error: 0,
        total_error: 0,
        has_error: false,
        qa_revision_estado: 'pendiente',
        qa_revision_accion: '',
        qa_revision_updated_at: ''
    };
}

function collectFieldOrder(rows) {
    const order = [];
    const seen = new Set();
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        for (const key of Object.keys(row)) {
            if (seen.has(key)) continue;
            seen.add(key);
            order.push(key);
        }
    }
    return order;
}

function pickDefaultFromStats(stats) {
    if (stats.boolean > 0 && stats.number === 0 && stats.string === 0) {
        return false;
    }
    if (stats.number > 0 && stats.boolean === 0 && stats.string === 0) {
        return 0;
    }
    if (stats.string > 0) {
        return stats.emptyString > 0 ? '' : null;
    }
    if (stats.number > 0) return 0;
    if (stats.boolean > 0) return false;
    return null;
}

function inferDefaultsByField(rows, orderedFields) {
    const statsByField = new Map();

    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        for (const field of orderedFields) {
            const value = row[field];
            let stats = statsByField.get(field);
            if (!stats) {
                stats = {
                    emptyString: 0,
                    nullish: 0,
                    string: 0,
                    number: 0,
                    boolean: 0,
                    other: 0
                };
                statsByField.set(field, stats);
            }

            if (value == null) {
                stats.nullish += 1;
            } else if (typeof value === 'string') {
                stats.string += 1;
                if (value === '') stats.emptyString += 1;
            } else if (typeof value === 'number') {
                stats.number += 1;
            } else if (typeof value === 'boolean') {
                stats.boolean += 1;
            } else {
                stats.other += 1;
            }
        }
    }

    const out = {};
    for (const field of orderedFields) {
        const stats = statsByField.get(field) || {
            emptyString: 0,
            nullish: 0,
            string: 0,
            number: 0,
            boolean: 0,
            other: 0
        };
        out[field] = pickDefaultFromStats(stats);
    }
    return out;
}

function buildOfficialContract(engineRows) {
    const orderedFields = collectFieldOrder(engineRows);
    const defaultsByField = inferDefaultsByField(engineRows, orderedFields);
    return {
        orderedFields,
        defaultsByField,
        fieldSet: new Set(orderedFields)
    };
}

function buildRowWithOfficialContract(baseRow, contract) {
    const ordered = {};

    for (const field of contract.orderedFields) {
        if (Object.prototype.hasOwnProperty.call(baseRow, field)) {
            ordered[field] = baseRow[field];
        } else {
            ordered[field] = contract.defaultsByField[field];
        }
    }

    for (const key of Object.keys(baseRow)) {
        if (contract.fieldSet.has(key)) continue;
        ordered[key] = baseRow[key];
    }

    return ordered;
}

function toRebuildRow(model, sequence, page, previewRow, matchInfo) {
    const pos = t(previewRow.pos_pdf);
    const pn = t(previewRow.pn_pdf);
    const designation = t(previewRow.designation_pdf);
    const modelType = t(previewRow.model_type_pdf);
    const qty = t(previewRow.qty_pdf);
    const units = t(previewRow.units_pdf);
    const weight = t(previewRow.weight_pdf);
    const fn = t(previewRow.fn_pdf);
    const measure = t(previewRow.measure_pdf);
    const norma = t(previewRow.norma_pdf);
    const fgFgs = t(previewRow.fg_fgs_pdf);
    const bom = t(previewRow.bom_pdf);

    return {
        ID: `RB-${model}-${String(sequence).padStart(6, '0')}`,
        POS: pos,
        'PART NO.': pn,
        DESIGNATION: designation,
        'MODEL/TYPE': modelType,
        QTY: qty,
        UNITS: units,
        WEIGHT: weight,
        FN: fn,
        'MEASUREMENT / STANDARD': measure,
        'FG/FGS': fgFgs,
        'BOM-No.': bom,
        'Source Page': page,
        engine_model: model,
        source_file: `book_preview_${model}.json`,
        source_sheet: null,
        pos_pdf: pos,
        pn_pdf: pn,
        designation_pdf: designation,
        model_type_pdf: modelType,
        qty_pdf: qty,
        units_pdf: units,
        weight_pdf: weight,
        fn_pdf: fn,
        measure_pdf: measure,
        norma_pdf: norma,
        fg_fgs_pdf: fgFgs,
        bom_pdf: bom,
        pos_final: pos,
        pn_final: pn,
        designation_final: designation,
        model_type_final: modelType,
        qty_final: qty,
        units_final: units,
        weight_final: weight,
        fn_final: fn,
        measure_final: measure,
        norma_final: norma,
        fg_fgs_final: fgFgs,
        bom_final: bom,
        rebuild_source_page: page,
        rebuild_source_row_index: asInt(previewRow.row_index),
        rebuild_source_confidence: Number(previewRow.confidence || 0),
        rebuild_source_warnings: Array.isArray(previewRow.warnings) ? previewRow.warnings : [],
        rebuild_match_status: matchInfo.status,
        rebuild_legacy_engine_id: t(matchInfo.legacyId),
        ...defaultQaFields()
    };
}

function parseArgs(argv) {
    const args = {
        all: false,
        engine: '',
        writePreview: false,
        dryRun: false,
        help: false
    };

    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];

        if (token === '--all') {
            args.all = true;
            continue;
        }
        if (token === '--engine') {
            args.engine = t(argv[i + 1]);
            i += 1;
            continue;
        }
        if (token === '--write-preview') {
            args.writePreview = true;
            continue;
        }
        if (token === '--dry-run') {
            args.dryRun = true;
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

    if (args.writePreview && args.dryRun) {
        throw new Error('Use solo uno: --dry-run o --write-preview.');
    }
    if (!args.writePreview && !args.dryRun) {
        args.dryRun = true;
    }

    return args;
}

function printHelp() {
    console.log([
        'Uso:',
        '  node scripts/rebuild_engine_from_book_preview.js --engine 12V4000M40A --dry-run',
        '  node scripts/rebuild_engine_from_book_preview.js --engine 12V4000M40A --write-preview',
        '  node scripts/rebuild_engine_from_book_preview.js --all --dry-run',
        '  node scripts/rebuild_engine_from_book_preview.js --all --write-preview'
    ].join('\n'));
}

function listModels(args) {
    if (args.all) {
        return ENGINE_JSON_FILES
            .map((file) => file.replace(/^engine_/i, '').replace(/\.json$/i, ''))
            .sort((a, b) => a.localeCompare(b));
    }
    const model = normalizeModelToken(args.engine);
    if (!model) throw new Error('El valor de --engine no es valido.');
    return [model];
}

function summarizeDuplicates(rebuildRows) {
    const byPagePos = new Map();
    for (const row of rebuildRows) {
        const page = asInt(row['Source Page']);
        const pos = t(row.POS);
        if (!page || !pos) continue;
        const key = `${page}|${pos}`;
        byPagePos.set(key, (byPagePos.get(key) || 0) + 1);
    }

    const duplicates = [...byPagePos.entries()]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => {
            const [page, pos] = key.split('|');
            return { page: Number(page), pos, count };
        })
        .sort((a, b) => b.count - a.count || a.page - b.page)
        .slice(0, 20);

    return {
        duplicate_page_pos_total: duplicates.length,
        duplicate_page_pos_samples: duplicates
    };
}

function runModel(repoRoot, model, options) {
    const previewPath = path.join(repoRoot, 'json_originales', `book_preview_${model}.json`);
    const enginePath = path.join(repoRoot, `engine_${model}.json`);

    if (!fs.existsSync(previewPath)) {
        throw new Error(`No existe el preview para ${model}: ${previewPath}`);
    }
    if (!fs.existsSync(enginePath)) {
        throw new Error(`No existe el engine base para ${model}: ${enginePath}`);
    }

    const preview = readJsonObject(previewPath, path.basename(previewPath));
    const engineRows = readJsonArray(enginePath, path.basename(enginePath));
    const contract = buildOfficialContract(engineRows);

    const pagePosIdx = buildEnginePagePosIndex(engineRows);
    const pagePnIdx = buildEnginePagePnIndex(engineRows);

    const flatRows = flattenPreviewRows(preview);
    const pageRule = REBUILD_BOOK_PAGE_RULES[model] || null;
    const report = {
        model,
        mode: options.writePreview ? 'WRITE_PREVIEW' : 'DRY_RUN',
        generated_at: new Date().toISOString(),
        source: {
            preview_path: path.relative(repoRoot, previewPath).replace(/\\/g, '/'),
            engine_path: path.relative(repoRoot, enginePath).replace(/\\/g, '/'),
            preview_book: t(preview.book),
            preview_generated_at: t(preview.generated_at),
            preview_rows_total: flatRows.length,
            preview_pages_total: Array.isArray(preview.pages) ? preview.pages.length : 0
        },
        page_range: pageRule
            ? { min_source_page: pageRule.minSourcePage, reason: pageRule.reason }
            : null,
        stats: {
            skipped_page_range: 0,
            skipped_other: 0,
            used_rows: 0,
            rows_generated: 0,
            rows_with_pos: 0,
            rows_with_pn: 0,
            rows_with_pos_and_pn: 0,
            matched_unique: 0,
            matched_tiebreak_pn: 0,
            matched_page_pn_no_pos: 0,
            matched_page_pn_pos_mismatch: 0,
            ambiguous: 0,
            not_found: 0
        },
        samples: {
            skipped_other: [],
            ambiguous: [],
            not_found: []
        },
        compare: {
            engine_rows_existing: engineRows.length,
            rows_generated_delta_vs_engine: 0,
            match_coverage_percent: 0
        },
        duplicates: {},
        field_contract: {
            engine_field_count: contract.orderedFields.length,
            generated_field_count: 0,
            missing_vs_engine: [],
            extra_vs_engine: [],
            defaults_applied: []
        }
    };

    const rebuildRows = [];
    let sequence = 1;

    for (const item of flatRows) {
        const page = item.page;
        const row = item.row || {};
        if (!page) continue;

        if (pageRule && page < pageRule.minSourcePage) {
            report.stats.skipped_page_range += 1;
            continue;
        }

        if (isOtherRow(row)) {
            report.stats.skipped_other += 1;
            if (report.samples.skipped_other.length < 20) {
                report.samples.skipped_other.push({
                    page,
                    row_index: asInt(row.row_index),
                    pos_pdf: t(row.pos_pdf),
                    pn_pdf: t(row.pn_pdf),
                    designation_pdf: t(row.designation_pdf),
                    reason: 'other'
                });
            }
            continue;
        }

        report.stats.used_rows += 1;

        const pos = t(row.pos_pdf);
        const pn = t(row.pn_pdf);

        if (pos) report.stats.rows_with_pos += 1;
        if (pn) report.stats.rows_with_pn += 1;
        if (pos && pn) report.stats.rows_with_pos_and_pn += 1;

        let selectedIndex = null;
        let status = 'not-found';
        let ambiguousCandidates = [];

        if (!pos) {
            const fallback = selectByPagePn(pagePnIdx, page, pn);
            selectedIndex = fallback.index;
            status = fallback.status === 'page-pn' ? 'page-pn-no-pos' : fallback.status;
            ambiguousCandidates = fallback.candidates || [];
        } else {
            const direct = selectByPagePos(engineRows, pagePosIdx, page, pos, pn);
            selectedIndex = direct.index;
            status = direct.status;
            ambiguousCandidates = direct.candidates || [];

            if (status === 'not-found' && pn) {
                const fallback = selectByPagePn(pagePnIdx, page, pn);
                if (fallback.index != null) {
                    selectedIndex = fallback.index;
                    status = 'page-pn-pos-mismatch';
                } else if (fallback.status === 'ambiguous') {
                    status = 'ambiguous';
                    ambiguousCandidates = fallback.candidates || [];
                }
            }
        }

        if (status === 'unique') report.stats.matched_unique += 1;
        else if (status === 'tiebreak-pn') report.stats.matched_tiebreak_pn += 1;
        else if (status === 'page-pn-no-pos') report.stats.matched_page_pn_no_pos += 1;
        else if (status === 'page-pn-pos-mismatch') report.stats.matched_page_pn_pos_mismatch += 1;
        else if (status === 'ambiguous') {
            report.stats.ambiguous += 1;
            if (report.samples.ambiguous.length < 20) {
                report.samples.ambiguous.push({
                    page,
                    row_index: asInt(row.row_index),
                    pos_pdf: pos,
                    pn_pdf: pn,
                    candidate_count: ambiguousCandidates.length,
                    candidate_ids: ambiguousCandidates
                        .slice(0, 10)
                        .map((idx) => t(engineRows[idx] && engineRows[idx].ID))
                });
            }
        } else {
            report.stats.not_found += 1;
            if (report.samples.not_found.length < 20) {
                report.samples.not_found.push({
                    page,
                    row_index: asInt(row.row_index),
                    pos_pdf: pos,
                    pn_pdf: pn,
                    designation_pdf: t(row.designation_pdf),
                    reason: 'no-engine-match'
                });
            }
        }

        const legacyRow = selectedIndex != null ? (engineRows[selectedIndex] || {}) : {};
        const rebuildRowBase = toRebuildRow(model, sequence, page, row, {
            status,
            legacyId: t(legacyRow.ID)
        });
        const rebuildRow = buildRowWithOfficialContract(rebuildRowBase, contract);

        rebuildRows.push(rebuildRow);
        sequence += 1;
    }

    report.stats.rows_generated = rebuildRows.length;
    report.compare.rows_generated_delta_vs_engine = rebuildRows.length - engineRows.length;

    const matchedTotal = report.stats.matched_unique
        + report.stats.matched_tiebreak_pn
        + report.stats.matched_page_pn_no_pos
        + report.stats.matched_page_pn_pos_mismatch;

    report.compare.match_coverage_percent = report.stats.used_rows > 0
        ? Number(((matchedTotal * 100) / report.stats.used_rows).toFixed(2))
        : 0;

    report.duplicates = summarizeDuplicates(rebuildRows);

    const generatedOrder = collectFieldOrder(rebuildRows);
    const generatedSet = new Set(generatedOrder);
    const missingVsEngine = contract.orderedFields.filter((field) => !generatedSet.has(field));
    const extraVsEngine = generatedOrder.filter((field) => !contract.fieldSet.has(field));
    const defaultsApplied = contract.orderedFields
        .filter((field) => !Object.prototype.hasOwnProperty.call(toRebuildRow(model, 0, '', {}, { status: '', legacyId: '' }), field))
        .map((field) => ({
            field,
            default_value: contract.defaultsByField[field],
            reason: 'not_in_rebuild_logic'
        }));

    report.field_contract = {
        engine_field_count: contract.orderedFields.length,
        generated_field_count: generatedOrder.length,
        missing_vs_engine: missingVsEngine,
        extra_vs_engine: extraVsEngine,
        defaults_applied: defaultsApplied
    };

    return {
        model,
        previewPath,
        enginePath,
        rebuildRows,
        report
    };
}

function ensureOutputDir(repoRoot) {
    const dir = path.join(repoRoot, OUTPUT_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function writeOutputs(repoRoot, model, rebuildRows, report) {
    const outDir = ensureOutputDir(repoRoot);
    const rebuildPath = path.join(outDir, `engine_rebuild_${model}.json`);
    const reportPath = path.join(outDir, `rebuild_report_${model}.json`);

    fs.writeFileSync(rebuildPath, `${JSON.stringify(rebuildRows, null, 2)}\n`, 'utf8');
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    return {
        rebuildPath,
        reportPath
    };
}

function printModelSummary(result, writtenPaths) {
    const stats = result.report.stats;
    const compare = result.report.compare;

    console.log(`\n[rebuild] ${result.model}`);
    if (result.report.page_range) {
        console.log(`  - page_range: min_source_page=${result.report.page_range.min_source_page} (${result.report.page_range.reason})`);
        console.log(`  - skipped_page_range: ${stats.skipped_page_range}`);
    }
    console.log(`  - used_rows: ${stats.used_rows}`);
    console.log(`  - skipped_other: ${stats.skipped_other}`);
    console.log(`  - rows_generated: ${stats.rows_generated}`);
    console.log(`  - matched_unique: ${stats.matched_unique}`);
    console.log(`  - matched_tiebreak_pn: ${stats.matched_tiebreak_pn}`);
    console.log(`  - matched_page_pn_no_pos: ${stats.matched_page_pn_no_pos}`);
    console.log(`  - matched_page_pn_pos_mismatch: ${stats.matched_page_pn_pos_mismatch}`);
    console.log(`  - ambiguous: ${stats.ambiguous}`);
    console.log(`  - not_found: ${stats.not_found}`);
    console.log(`  - match_coverage_percent: ${compare.match_coverage_percent}%`);

    if (writtenPaths) {
        console.log(`  - output_rebuild: ${writtenPaths.rebuildPath}`);
        console.log(`  - output_report: ${writtenPaths.reportPath}`);
    }
}

function main(argv) {
    let args;
    try {
        args = parseArgs(argv);
    } catch (error) {
        console.error(`[error] ${error.message}`);
        printHelp();
        return 1;
    }

    if (args.help) {
        printHelp();
        return 0;
    }

    const repoRoot = path.resolve(__dirname, '..');
    let models;
    try {
        models = listModels(args);
    } catch (error) {
        console.error(`[error] ${error.message}`);
        return 1;
    }

    console.log(`[mode] ${args.writePreview ? 'WRITE_PREVIEW' : 'DRY_RUN'}`);
    console.log(`[models] ${models.join(', ')}`);

    const failures = [];
    const summaries = [];

    for (const model of models) {
        try {
            const result = runModel(repoRoot, model, args);
            let writtenPaths = null;
            if (args.writePreview) {
                writtenPaths = writeOutputs(repoRoot, model, result.rebuildRows, result.report);
            }

            printModelSummary(result, writtenPaths);
            summaries.push({ model, ok: true, report: result.report });
        } catch (error) {
            failures.push({ model, error: error.message });
            console.error(`\n[rebuild] ${model}`);
            console.error(`  - ERROR: ${error.message}`);
        }
    }

    const totals = summaries.reduce((acc, item) => {
        const s = item.report.stats;
        acc.usedRows += s.used_rows;
        acc.generated += s.rows_generated;
        acc.ambiguous += s.ambiguous;
        acc.notFound += s.not_found;
        return acc;
    }, {
        usedRows: 0,
        generated: 0,
        ambiguous: 0,
        notFound: 0
    });

    console.log('\n[summary]');
    console.log(`  - models_ok: ${summaries.length}`);
    console.log(`  - models_failed: ${failures.length}`);
    console.log(`  - total_used_rows: ${totals.usedRows}`);
    console.log(`  - total_generated_rows: ${totals.generated}`);
    console.log(`  - total_ambiguous: ${totals.ambiguous}`);
    console.log(`  - total_not_found: ${totals.notFound}`);

    if (failures.length > 0) {
        console.log('  - failure_models:');
        for (const fail of failures) {
            console.log(`    * ${fail.model}: ${fail.error}`);
        }
        return 1;
    }

    return 0;
}

if (require.main === module) {
    const code = main(process.argv);
    process.exitCode = code;
}

module.exports = {
    main,
    runModel,
    isOtherRow
};
