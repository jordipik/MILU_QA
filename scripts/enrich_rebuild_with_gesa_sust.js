#!/usr/bin/env node
/**
 * enrich_rebuild_with_gesa_sust.js
 *
 * FASE 4 (P4-1 + P4-2): Aplica enriquecimiento GESA y SUST sobre los archivos
 * reconstruidos en data/output/rebuild/engine_rebuild_<MODEL>.json.
 *
 * NO modifica engine_*.json originales.
 *
 * Uso:
 *   node scripts/enrich_rebuild_with_gesa_sust.js --engine 12V4000M40A --dry-run
 *   node scripts/enrich_rebuild_with_gesa_sust.js --engine 12V4000M40A --write
 *   node scripts/enrich_rebuild_with_gesa_sust.js --all --dry-run
 *   node scripts/enrich_rebuild_with_gesa_sust.js --all --write
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REBUILD_DIR = path.join('data', 'output', 'rebuild');

const GESA_FIELDS = [
    'gesa',
    'designation_gesa',
    'nsn',
    'norma',
    'normalizado',
    'dimensions_gesa',
    'weight_gesa',
    'units',
    'existeix_gesa'
];

const SUST_FIELDS = [
    'sust_status',
    'sust_hierarchie',
    'sust_new_part_number',
    'sust_superseded_list',
    'existeix_sust_new',
    'existeix_sust_old'
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function txt(value) {
    return String(value == null ? '' : value).trim();
}

function parseSeq(value) {
    const raw = txt(value);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

function normalizeModelToken(value) {
    const raw = txt(value);
    if (!raw) return '';
    const match = raw.match(/^(?:engine_)?(.+?)(?:\.json)?$/i);
    return txt(match ? match[1] : raw);
}

function readJsonArray(filePath, label) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
        throw new Error(`${label} no contiene un array JSON.`);
    }
    return data;
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function ensureOutputDir(repoRoot) {
    const dir = path.join(repoRoot, REBUILD_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// ---------------------------------------------------------------------------
// GESA index and mapping
// ---------------------------------------------------------------------------

function buildGesaMap(gesaRows) {
    const map = new Map();
    const stats = { total: gesaRows.length, withPN: 0, missing: 0, duplicates: 0 };

    for (let i = 0; i < gesaRows.length; i++) {
        const pn = txt(gesaRows[i]?.['PART NUMBER']);
        if (!pn) { stats.missing++; continue; }
        stats.withPN++;
        if (map.has(pn)) stats.duplicates++;
        map.set(pn, gesaRows[i]);
    }

    return { map, stats };
}

function gesaMatchFields(gesaRow) {
    const norma = txt(gesaRow?.['NORM']);
    return {
        gesa: 'SI',
        designation_gesa: gesaRow?.['DESIGNATION (english)'] ?? '',
        nsn: gesaRow?.['NATO-VERS.-NR'] ?? '',
        norma,
        normalizado: norma ? 'SI' : 'NO',
        dimensions_gesa: gesaRow?.['DIMENSIONS'] ?? '',
        weight_gesa: gesaRow?.['UNIT WEIGHT'] ?? '',
        units: gesaRow?.['UNIT OF WEIGHT'] ?? '',
        existeix_gesa: true
    };
}

function gesaNoMatchFields() {
    return {
        gesa: 'NO',
        designation_gesa: '',
        nsn: '',
        norma: '',
        normalizado: 'NO',
        dimensions_gesa: '',
        weight_gesa: '',
        units: '',
        existeix_gesa: false
    };
}

// ---------------------------------------------------------------------------
// SUST index and matching
// ---------------------------------------------------------------------------

function sortBySeq(items) {
    const arr = items.map((item, i) => ({ ...item, __ord: Number(item.__ord ?? i) }));
    const hasSeq = arr.some((item) => item.seq != null);
    if (!hasSeq) return arr.sort((a, b) => a.__ord - b.__ord);
    return arr.sort((a, b) => {
        const aH = a.seq != null;
        const bH = b.seq != null;
        if (aH && bH && a.seq !== b.seq) return a.seq - b.seq;
        if (aH !== bH) return aH ? -1 : 1;
        return a.__ord - b.__ord;
    });
}

function buildSustIndex(rows) {
    const byNew = new Map();
    const bySuperseded = new Map();

    rows.forEach((row, index) => {
        const newPart = txt(row?.['New Part Number']);
        const supersededPart = txt(row?.['Superseded Part Number']);
        const hierarchie = txt(row?.Hierarchie);
        const seq = parseSeq(row?.['Seq no']);
        const entry = { row, newPart, supersededPart, hierarchie, seq, __ord: index };

        if (newPart) {
            if (!byNew.has(newPart)) byNew.set(newPart, []);
            byNew.get(newPart).push(entry);
        }
        if (supersededPart) {
            if (!bySuperseded.has(supersededPart)) bySuperseded.set(supersededPart, []);
            bySuperseded.get(supersededPart).push(entry);
        }
    });

    return { byNew, bySuperseded };
}

function getSupersededList(index, newPart) {
    if (!newPart) return null;
    const rows = sortBySeq(index.byNew.get(newPart) || [])
        .filter((item) => txt(item.hierarchie).toLowerCase() === 'superseded');
    const seen = new Set();
    const values = [];
    for (const item of rows) {
        const v = txt(item.supersededPart);
        if (!v || seen.has(v)) continue;
        seen.add(v);
        values.push(v);
    }
    return values.length ? values.join(', ') : null;
}

function pickNewCandidate(candidates) {
    const ordered = sortBySeq(candidates);
    if (!ordered.length) return null;
    return ordered.find((item) => txt(item.hierarchie).toLowerCase() === 'new') || ordered[0];
}

function computeSustFields(index, pn) {
    const normPn = txt(pn);
    if (!normPn) return { kind: 'not_found', fields: sustNoMatchFields() };

    const asNew = index.byNew.get(normPn) || [];
    if (asNew.length > 0) {
        const main = pickNewCandidate(asNew);
        const mainNew = txt(main?.newPart) || normPn;
        return {
            kind: 'matched_new',
            fields: {
                sust_status: 'SI',
                sust_hierarchie: txt(main?.hierarchie) || null,
                sust_new_part_number: mainNew || null,
                sust_superseded_list: getSupersededList(index, mainNew),
                existeix_sust_new: true,
                existeix_sust_old: false
            }
        };
    }

    const asSuperseded = sortBySeq(index.bySuperseded.get(normPn) || []);
    if (asSuperseded.length > 0) {
        const main = asSuperseded[0];
        const targetNew = txt(main?.newPart) || null;
        return {
            kind: 'matched_superseded',
            fields: {
                sust_status: 'SI',
                sust_hierarchie: 'Superseded',
                sust_new_part_number: targetNew,
                sust_superseded_list: getSupersededList(index, targetNew),
                existeix_sust_new: false,
                existeix_sust_old: true
            }
        };
    }

    return { kind: 'not_found', fields: sustNoMatchFields() };
}

function sustNoMatchFields() {
    return {
        sust_status: 'NO',
        sust_hierarchie: null,
        sust_new_part_number: null,
        sust_superseded_list: null,
        existeix_sust_new: false,
        existeix_sust_old: false
    };
}

// ---------------------------------------------------------------------------
// Apply fields to row
// ---------------------------------------------------------------------------

function applyFields(row, fields, fieldList) {
    let changed = false;
    for (const key of fieldList) {
        const before = row[key];
        const after = fields[key];
        if (!Object.is(before, after)) {
            row[key] = after;
            changed = true;
        }
    }
    return changed;
}

// ---------------------------------------------------------------------------
// Resolve source paths
// ---------------------------------------------------------------------------

function resolveGesaPath(repoRoot) {
    const candidates = [
        path.join(repoRoot, 'EXCEL_GESA2026.json'),
        path.join(repoRoot, 'data', 'EXCEL_GESA2026.json')
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    throw new Error(`No existe EXCEL_GESA2026.json. Rutas probadas: ${candidates.join(', ')}`);
}

function resolveSustPath(repoRoot) {
    const candidates = [
        path.join(repoRoot, 'EXCEL_SUSTITUCION.json'),
        path.join(repoRoot, 'data', 'EXCEL_SUSTITUCION.json')
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    throw new Error(`No existe EXCEL_SUSTITUCION.json. Rutas probadas: ${candidates.join(', ')}`);
}

function resolveRebuildModels(repoRoot, options) {
    if (options.all) {
        return ENGINE_JSON_FILES
            .map((f) => normalizeModelToken(f))
            .filter((model) => {
                const rebuildPath = path.join(repoRoot, REBUILD_DIR, `engine_rebuild_${model}.json`);
                return fs.existsSync(rebuildPath);
            });
    }

    const model = normalizeModelToken(options.engine);
    if (!model) throw new Error('Debe indicar --engine <MODEL> o --all.');
    const rebuildPath = path.join(repoRoot, REBUILD_DIR, `engine_rebuild_${model}.json`);
    if (!fs.existsSync(rebuildPath)) {
        throw new Error(`No existe el rebuild para ${model}: ${rebuildPath}`);
    }
    return [model];
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    const args = { engine: '', all: false, write: false, help: false };

    for (let i = 2; i < argv.length; i++) {
        const token = argv[i];
        if (token === '--all') { args.all = true; continue; }
        if (token === '--write') { args.write = true; continue; }
        if (token === '--dry-run') { args.write = false; continue; }
        if (token === '--help' || token === '-h') { args.help = true; continue; }
        if (token === '--engine') {
            const val = txt(argv[i + 1]);
            if (!val) throw new Error('Debe indicar un valor para --engine');
            args.engine = val;
            i++;
            continue;
        }
        if (token.startsWith('--engine=')) {
            args.engine = txt(token.slice('--engine='.length));
            continue;
        }
        throw new Error(`Argumento no reconocido: ${token}`);
    }

    if (!args.all && !args.engine) {
        throw new Error('Debe indicar --engine <MODEL> o --all.');
    }
    if (args.all && args.engine) {
        throw new Error('No puede usar --all y --engine al mismo tiempo.');
    }

    return args;
}

function printHelp() {
    console.log([
        'Uso:',
        '  node scripts/enrich_rebuild_with_gesa_sust.js --engine 12V4000M40A --dry-run',
        '  node scripts/enrich_rebuild_with_gesa_sust.js --engine 12V4000M40A --write',
        '  node scripts/enrich_rebuild_with_gesa_sust.js --all --dry-run',
        '  node scripts/enrich_rebuild_with_gesa_sust.js --all --write',
        '',
        'Opciones:',
        '  --engine <MODEL>   Procesar un único motor (ej: 12V4000M40A)',
        '  --all              Procesar todos los engines con rebuild disponible',
        '  --write            Escribir cambios en engine_rebuild_<MODEL>.json',
        '  --dry-run          Solo informe, sin escribir (por defecto)',
    ].join('\n'));
}

// ---------------------------------------------------------------------------
// Per-model processing
// ---------------------------------------------------------------------------

function processModel(repoRoot, model, gesaMap, sustIndex, options) {
    const rebuildPath = path.join(repoRoot, REBUILD_DIR, `engine_rebuild_${model}.json`);
    const rows = readJsonArray(rebuildPath, `engine_rebuild_${model}.json`);

    const report = {
        model,
        mode: options.write ? 'WRITE' : 'DRY_RUN',
        generated_at: new Date().toISOString(),
        source: {
            rebuild_path: path.relative(repoRoot, rebuildPath).replace(/\\/g, '/'),
            total_rows: rows.length
        },
        gesa: {
            matched: 0,
            not_found: 0,
            changed_rows: 0,
            examples_matched: [],
            examples_not_found: []
        },
        sust: {
            matched_new: 0,
            matched_superseded: 0,
            not_found: 0,
            changed_rows: 0,
            examples_matched_new: [],
            examples_matched_superseded: [],
            examples_not_found: []
        }
    };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const pn = txt(row?.pn_final) || txt(row?.['PART NO.']);

        // --- GESA ---
        const gesaRow = pn ? gesaMap.get(pn) : null;
        const gesaFields = gesaRow ? gesaMatchFields(gesaRow) : gesaNoMatchFields();
        const gesaChanged = applyFields(row, gesaFields, GESA_FIELDS);

        if (gesaRow) {
            report.gesa.matched++;
            if (gesaChanged) report.gesa.changed_rows++;
            if (report.gesa.examples_matched.length < 10) {
                report.gesa.examples_matched.push({
                    row_index: i,
                    pn,
                    designation_gesa: txt(gesaFields.designation_gesa),
                    dimensions_gesa: txt(gesaFields.dimensions_gesa),
                    weight_gesa: gesaFields.weight_gesa,
                    norma: txt(gesaFields.norma)
                });
            }
        } else {
            report.gesa.not_found++;
            if (report.gesa.examples_not_found.length < 10) {
                report.gesa.examples_not_found.push({ row_index: i, pn });
            }
        }

        // --- SUST ---
        const sustResult = computeSustFields(sustIndex, pn);
        const sustChanged = applyFields(row, sustResult.fields, SUST_FIELDS);

        if (sustResult.kind === 'matched_new') {
            report.sust.matched_new++;
            if (sustChanged) report.sust.changed_rows++;
            if (report.sust.examples_matched_new.length < 10) {
                report.sust.examples_matched_new.push({
                    row_index: i, pn,
                    sust_hierarchie: sustResult.fields.sust_hierarchie,
                    sust_new_part_number: sustResult.fields.sust_new_part_number
                });
            }
        } else if (sustResult.kind === 'matched_superseded') {
            report.sust.matched_superseded++;
            if (sustChanged) report.sust.changed_rows++;
            if (report.sust.examples_matched_superseded.length < 10) {
                report.sust.examples_matched_superseded.push({
                    row_index: i, pn,
                    sust_new_part_number: sustResult.fields.sust_new_part_number
                });
            }
        } else {
            report.sust.not_found++;
            if (report.sust.examples_not_found.length < 5) {
                report.sust.examples_not_found.push({ row_index: i, pn });
            }
        }
    }

    return { model, rows, report, rebuildPath };
}

// ---------------------------------------------------------------------------
// Summary console output
// ---------------------------------------------------------------------------

function printModelSummary(result) {
    const { model, report } = result;
    const g = report.gesa;
    const s = report.sust;
    console.log(`\n[enrich] ${model} [${report.mode}]`);
    console.log(`  GESA  matched=${g.matched}  not_found=${g.not_found}  changed_rows=${g.changed_rows}`);
    console.log(`  SUST  new=${s.matched_new}  superseded=${s.matched_superseded}  not_found=${s.not_found}  changed_rows=${s.changed_rows}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(argv) {
    let args;
    try {
        args = parseArgs(argv);
    } catch (err) {
        console.error(`[error] ${err.message}`);
        printHelp();
        return 1;
    }

    if (args.help) {
        printHelp();
        return 0;
    }

    const repoRoot = path.resolve(__dirname, '..');

    // Load GESA
    const gesaPath = resolveGesaPath(repoRoot);
    console.log(`[gesa] Cargando ${path.basename(gesaPath)}...`);
    const gesaRows = readJsonArray(gesaPath, path.basename(gesaPath));
    const { map: gesaMap, stats: gesaStats } = buildGesaMap(gesaRows);
    console.log(`[gesa] ${gesaStats.withPN} entradas indexadas (${gesaStats.duplicates} duplicados)`);

    // Load SUST
    const sustPath = resolveSustPath(repoRoot);
    console.log(`[sust] Cargando ${path.basename(sustPath)}...`);
    const sustRows = readJsonArray(sustPath, path.basename(sustPath));
    const sustIndex = buildSustIndex(sustRows);
    console.log(`[sust] ${sustIndex.byNew.size} New Part Numbers, ${sustIndex.bySuperseded.size} Superseded Part Numbers indexados`);

    // Resolve models
    const models = resolveRebuildModels(repoRoot, args);
    if (models.length === 0) {
        console.error('[error] No se encontraron archivos engine_rebuild_*.json en data/output/rebuild/');
        return 1;
    }
    console.log(`\n[mode] ${args.write ? 'WRITE' : 'DRY_RUN'}`);
    console.log(`[models] ${models.join(', ')}`);

    ensureOutputDir(repoRoot);

    const allResults = [];
    let totalGesaMatched = 0;
    let totalSustMatched = 0;

    for (const model of models) {
        let result;
        try {
            result = processModel(repoRoot, model, gesaMap, sustIndex, args);
        } catch (err) {
            console.error(`\n[error] ${model}: ${err.message}`);
            continue;
        }

        printModelSummary(result);

        // Write enriched rebuild file
        if (args.write) {
            writeJson(result.rebuildPath, result.rows);
            console.log(`  -> escrito: ${path.relative(repoRoot, result.rebuildPath).replace(/\\/g, '/')}`);
        }

        // Always write the report
        const outDir = path.join(repoRoot, REBUILD_DIR);
        const reportPath = path.join(outDir, `phase4_report_gesa_sust_${model}.json`);
        writeJson(reportPath, result.report);
        console.log(`  -> reporte: ${path.relative(repoRoot, reportPath).replace(/\\/g, '/')}`);

        totalGesaMatched += result.report.gesa.matched;
        totalSustMatched += result.report.sust.matched_new + result.report.sust.matched_superseded;
        allResults.push(result.report);
    }

    console.log('\n[summary]');
    console.log(`  - models_processed: ${allResults.length}`);
    console.log(`  - total_gesa_matched: ${totalGesaMatched}`);
    console.log(`  - total_sust_matched: ${totalSustMatched}`);

    return 0;
}

module.exports = { main };

if (require.main === module) {
    process.exitCode = main(process.argv) || 0;
}
