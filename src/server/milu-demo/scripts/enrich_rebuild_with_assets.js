#!/usr/bin/env node
/**
 * enrich_rebuild_with_assets.js
 *
 * FASE 4B ASSETS: Enriquecer engine_rebuild_<MODEL>.json con:
 * - fotos (fotos_articulos)
 * - esquemas (esquemas)
 * - esquemas_pos_circulos (esquemas_pos_circulos)
 *
 * Uso:
 *   node scripts/enrich_rebuild_with_assets.js --engine 12V4000M40A --dry-run
 *   node scripts/enrich_rebuild_with_assets.js --engine 12V4000M40A --write
 *   node scripts/enrich_rebuild_with_assets.js --all --dry-run
 *   node scripts/enrich_rebuild_with_assets.js --all --write
 *
 * Opciones adicionales:
 *   --wp-fotos-base <url>
 *   --wp-esquemas-base <url>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../config/engine_files');

const REBUILD_DIR = path.join('data', '02-engine_rebuild');
const ENGINE_REPORT_DIR = path.join('data', 'output', 'assets_engine_reports');

const WP_BASE_FOTOS_DEFAULT =
    'https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01';

const WP_BASE_ESQUEMAS_POS_DEFAULT =
    'https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02';

const FOTO_EXT_PRIORITY = ['.jpeg', '.jpg', '.png', '.webp'];
const EXAMPLES_LIMIT = 30;

function txt(value) {
    return String(value == null ? '' : value).trim();
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

function ensureOutputDir(repoRoot, mode) {
    const dir = mode === 'engine'
        ? path.join(repoRoot, ENGINE_REPORT_DIR)
        : path.join(repoRoot, REBUILD_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function normalizePos(value) {
    return txt(value).replace(/\s+/g, '');
}

function page4FromRow(row) {
    const src = txt(row?.['Source Page']);
    if (!src) return '';
    const n = Number(src);
    if (Number.isFinite(n)) return String(Math.trunc(n)).padStart(4, '0');
    const digits = src.match(/\d+/g);
    if (!digits || !digits.length) return '';
    return digits[0].padStart(4, '0');
}

function resolveTargetModels(repoRoot, options) {
    const mode = options.mode === 'engine' ? 'engine' : 'rebuild';

    function targetExists(model) {
        const targetPath = mode === 'engine'
            ? path.join(repoRoot, `engine_${model}.json`)
            : path.join(repoRoot, REBUILD_DIR, `engine_rebuild_${model}.json`);
        return fs.existsSync(targetPath);
    }

    if (options.all) {
        return ENGINE_JSON_FILES
            .map((f) => normalizeModelToken(f))
            .filter((model) => {
                return targetExists(model);
            });
    }

    const model = normalizeModelToken(options.engine);
    if (!model) throw new Error('Debe indicar --engine <MODEL> o --all.');

    const targetPath = mode === 'engine'
        ? path.join(repoRoot, `engine_${model}.json`)
        : path.join(repoRoot, REBUILD_DIR, `engine_rebuild_${model}.json`);

    if (!fs.existsSync(targetPath)) {
        const targetType = mode === 'engine' ? 'engine' : 'rebuild';
        throw new Error(`No existe el ${targetType} para ${model}: ${targetPath}`);
    }
    return [model];
}

function parseArgs(argv) {
    const args = {
        mode: 'rebuild',
        engine: '',
        all: false,
        write: false,
        help: false,
        wpFotosBase: WP_BASE_FOTOS_DEFAULT,
        wpEsquemasBase: WP_BASE_ESQUEMAS_POS_DEFAULT
    };

    for (let i = 2; i < argv.length; i++) {
        const token = argv[i];
        if (token === '--all') { args.all = true; continue; }
        if (token === '--write') { args.write = true; continue; }
        if (token === '--dry-run') { args.write = false; continue; }
        if (token === '--help' || token === '-h') { args.help = true; continue; }

        if (token === '--mode') {
            const val = txt(argv[i + 1]).toLowerCase();
            if (!val) throw new Error('Debe indicar un valor para --mode');
            args.mode = val;
            i++;
            continue;
        }

        if (token.startsWith('--mode=')) {
            args.mode = txt(token.slice('--mode='.length)).toLowerCase();
            continue;
        }

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

        if (token === '--wp-fotos-base') {
            const val = txt(argv[i + 1]);
            if (!val) throw new Error('Debe indicar un valor para --wp-fotos-base');
            args.wpFotosBase = val.replace(/\/$/, '');
            i++;
            continue;
        }

        if (token.startsWith('--wp-fotos-base=')) {
            args.wpFotosBase = txt(token.slice('--wp-fotos-base='.length)).replace(/\/$/, '');
            continue;
        }

        if (token === '--wp-esquemas-base') {
            const val = txt(argv[i + 1]);
            if (!val) throw new Error('Debe indicar un valor para --wp-esquemas-base');
            args.wpEsquemasBase = val.replace(/\/$/, '');
            i++;
            continue;
        }

        if (token.startsWith('--wp-esquemas-base=')) {
            args.wpEsquemasBase = txt(token.slice('--wp-esquemas-base='.length)).replace(/\/$/, '');
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

    if (!['rebuild', 'engine'].includes(args.mode)) {
        throw new Error('mode debe ser rebuild o engine.');
    }

    return args;
}

function printHelp() {
    console.log([
        'Uso:',
        '  node scripts/enrich_rebuild_with_assets.js --mode rebuild --engine 12V4000M40A --dry-run',
        '  node scripts/enrich_rebuild_with_assets.js --mode rebuild --engine 12V4000M40A --write',
        '  node scripts/enrich_rebuild_with_assets.js --mode rebuild --all --dry-run',
        '  node scripts/enrich_rebuild_with_assets.js --mode rebuild --all --write',
        '  node scripts/enrich_rebuild_with_assets.js --mode engine --engine 12V4000M40A --dry-run',
        '  node scripts/enrich_rebuild_with_assets.js --mode engine --engine 12V4000M40A --write',
        '  node scripts/enrich_rebuild_with_assets.js --mode engine --all --dry-run',
        '  node scripts/enrich_rebuild_with_assets.js --mode engine --all --write',
        '',
        'Opciones:',
        '  --mode <rebuild|engine> Modo de trabajo (por defecto: rebuild)',
        '  --engine <MODEL>        Procesar un unico motor',
        '  --all                   Procesar todos los engines con rebuild disponible',
        '  --write                 Escribir cambios en engine_rebuild_<MODEL>.json',
        '  --dry-run               Solo informe (por defecto)',
        '  --wp-fotos-base <url>   Base URL temporal para ruta_foto',
        '  --wp-esquemas-base <url> Base URL temporal para ruta_esquemas_pos',
    ].join('\n'));
}

function pushExample(list, payload) {
    if (list.length < EXAMPLES_LIMIT) {
        list.push(payload);
    }
}

function setField(row, key, value, counters) {
    const before = row[key];
    if (!Object.is(before, value)) {
        row[key] = value;
        counters.changedFields++;
        counters.rowChanged = true;
    }
}

function listFilesSafe(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
}

function gatherFilesFromDirs(dirs) {
    const files = [];
    for (const d of dirs) {
        for (const f of listFilesSafe(d)) {
            files.push({ dir: d, name: f });
        }
    }
    return files;
}

function buildFotosIndex(repoRoot) {
    const fotosDir = path.join(repoRoot, 'fotos_articulos');
    const entries = gatherFilesFromDirs([fotosDir]);
    const grouped = new Map();

    for (const entry of entries) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!FOTO_EXT_PRIORITY.includes(ext)) continue;
        const pnKey = path.basename(entry.name, path.extname(entry.name)).toLowerCase();
        if (!pnKey) continue;
        if (!grouped.has(pnKey)) grouped.set(pnKey, []);
        grouped.get(pnKey).push(entry.name);
    }

    const index = new Map();
    for (const [pnKey, names] of grouped.entries()) {
        const sorted = [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
        let chosen = null;
        for (const wantedExt of FOTO_EXT_PRIORITY) {
            const match = sorted.find((n) => path.extname(n).toLowerCase() === wantedExt);
            if (match) {
                chosen = match;
                break;
            }
        }
        if (chosen) index.set(pnKey, chosen);
    }

    return index;
}

function collectCandidateDirs(baseDir, model, suffix) {
    const dirs = [];
    const modelDir = path.join(baseDir, `${model}${suffix}`);
    if (fs.existsSync(modelDir)) dirs.push(modelDir);
    if (fs.existsSync(baseDir)) dirs.push(baseDir);
    return dirs;
}

function buildEsquemasIndex(repoRoot, model) {
    const baseDir = path.join(repoRoot, 'esquemas');
    const dirs = collectCandidateDirs(baseDir, model, '_esquemas');
    const files = gatherFilesFromDirs(dirs);

    const byPage = new Map();
    const regex = /^(.+)-(\d{4})-(\d+)\.png$/i;
    for (const entry of files) {
        const m = entry.name.match(regex);
        if (!m) continue;
        const book = txt(m[1]);
        const page4 = txt(m[2]);
        if (book.toLowerCase() !== model.toLowerCase()) continue;
        if (!byPage.has(page4)) byPage.set(page4, []);
        byPage.get(page4).push(entry.name);
    }

    for (const [k, arr] of byPage.entries()) {
        byPage.set(k, [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    }

    return byPage;
}

function buildCirculosIndex(repoRoot, model) {
    const baseDir = path.join(repoRoot, 'esquemas_pos_circulos');
    const dirs = collectCandidateDirs(baseDir, model, '-POS');
    const files = gatherFilesFromDirs(dirs);

    const byPagePos = new Map();
    const regex = /^(.+)-(\d{4})-(\d+)-(.+)\.webp$/i;
    for (const entry of files) {
        const m = entry.name.match(regex);
        if (!m) continue;
        const book = txt(m[1]);
        const page4 = txt(m[2]);
        const pos = normalizePos(m[4]);
        if (book.toLowerCase() !== model.toLowerCase()) continue;
        if (!page4 || !pos) continue;
        const key = `${page4}|${pos}`;
        if (!byPagePos.has(key)) byPagePos.set(key, []);
        byPagePos.get(key).push(entry.name);
    }

    for (const [k, arr] of byPagePos.entries()) {
        byPagePos.set(k, [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    }

    return byPagePos;
}

function backupFile(filePath) {
    const ts = Date.now();
    const bakPath = `${filePath}.bak.${ts}`;
    fs.copyFileSync(filePath, bakPath);
    return bakPath;
}

function processModel(repoRoot, model, options, fotosIndex) {
    const mode = options.mode === 'engine' ? 'engine' : 'rebuild';
    const targetPath = mode === 'engine'
        ? path.join(repoRoot, `engine_${model}.json`)
        : path.join(repoRoot, REBUILD_DIR, `engine_rebuild_${model}.json`);
    const targetLabel = mode === 'engine' ? `engine_${model}.json` : `engine_rebuild_${model}.json`;
    const rows = readJsonArray(targetPath, targetLabel);

    const esquemasByPage = buildEsquemasIndex(repoRoot, model);
    const circulosByPagePos = buildCirculosIndex(repoRoot, model);

    const report = {
        model,
        generated_at: new Date().toISOString(),
        rows_total: rows.length,
        fotos_found: 0,
        fotos_missing: 0,
        esquemas_found: 0,
        esquemas_missing: 0,
        esquemas_multiple: 0,
        circulos_found: 0,
        circulos_missing: 0,
        circulos_multiple: 0,
        circulos_all_equals_selected_count: 0,
        circulos_all_multiple_count: 0,
        circulos_all_empty_count: 0,
        missing_assets_rows: 0,
        changed_rows: 0,
        changed_fields: 0,
        examples: {
            fotos_missing: [],
            esquemas_missing: [],
            circulos_missing: [],
            circulos_multiple: []
        }
    };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const counters = { rowChanged: false, changedFields: 0 };

        const book = txt(row.engine_model) || model;
        const page4 = page4FromRow(row);
        const pages = book && page4 ? `${book}-${page4}` : '';
        const pos = normalizePos(row.pos_final || row.pos_pdf || row.POS);

        setField(row, 'page4', page4 || '', counters);
        setField(row, 'pages', pages || '', counters);
        setField(row, 'book_set', book || '', counters);
        setField(row, 'libro_pag', pages || '', counters);

        // FOTOS
        const pnFoto = txt(row.pn_final || row.pn_pdf || row['PART NO.']);
        const fotoName = pnFoto ? (fotosIndex.get(pnFoto.toLowerCase()) || null) : null;
        const rutaFoto = fotoName ? `${options.wpFotosBase}/${fotoName}` : null;

        setField(row, 'filename_foto', fotoName, counters);
        setField(row, 'ruta_foto', rutaFoto, counters);

        if (fotoName) {
            report.fotos_found++;
        } else {
            report.fotos_missing++;
            pushExample(report.examples.fotos_missing, {
                row_index: i,
                id: txt(row.ID),
                pn: pnFoto,
                source_page: txt(row['Source Page']),
                pos: txt(row.pos_final || row.pos_pdf || row.POS)
            });
        }

        // ESQUEMAS
        const esquemasMatches = page4 ? (esquemasByPage.get(page4) || []) : [];
        const esquemasValue = esquemasMatches.length ? esquemasMatches.join(' , ') : null;
        setField(row, 'esquemas', esquemasValue, counters);

        if (esquemasMatches.length) {
            report.esquemas_found++;
            if (esquemasMatches.length > 1) report.esquemas_multiple++;
        } else {
            report.esquemas_missing++;
            pushExample(report.examples.esquemas_missing, {
                row_index: i,
                id: txt(row.ID),
                page4,
                source_page: txt(row['Source Page'])
            });
        }

        // CIRCULOS
        const circlesKey = page4 && pos ? `${page4}|${pos}` : '';
        const circleMatches = circlesKey ? (circulosByPagePos.get(circlesKey) || []) : [];

        let esquemasCirculos = null;
        let esquemasCirculosAll = null;
        if (circleMatches.length === 1) {
            esquemasCirculos = circleMatches[0];
            esquemasCirculosAll = circleMatches[0];
        } else if (circleMatches.length > 1) {
            esquemasCirculos = circleMatches[0];
            esquemasCirculosAll = circleMatches.join(' , ');
        }

        const rutaEsquemasPos = esquemasCirculos
            ? `${options.wpEsquemasBase}/${esquemasCirculos}`
            : null;

        setField(row, 'esquemas_circulos', esquemasCirculos, counters);
        setField(row, 'esquemas_circulos_all', esquemasCirculosAll, counters);
        setField(row, 'ruta_esquemas_pos', rutaEsquemasPos, counters);

        const expImagenes = [rutaFoto, rutaEsquemasPos].filter(Boolean).join(', ');
        setField(row, 'exp_imagenes', expImagenes || '', counters);

        if (circleMatches.length === 0) {
            report.circulos_missing++;
            report.circulos_all_empty_count++;
            pushExample(report.examples.circulos_missing, {
                row_index: i,
                id: txt(row.ID),
                page4,
                pos,
                source_page: txt(row['Source Page'])
            });
        } else if (circleMatches.length === 1) {
            report.circulos_found++;
            report.circulos_all_equals_selected_count++;
        } else {
            report.circulos_found++;
            report.circulos_multiple++;
            report.circulos_all_multiple_count++;
            pushExample(report.examples.circulos_multiple, {
                row_index: i,
                id: txt(row.ID),
                page4,
                pos,
                matches: circleMatches
            });
        }

        const hasMissingAnyAsset = !fotoName || esquemasMatches.length === 0 || circleMatches.length === 0;
        if (hasMissingAnyAsset) {
            report.missing_assets_rows++;
        }

        if (counters.rowChanged) {
            report.changed_rows++;
            report.changed_fields += counters.changedFields;
        }
    }

    return { rows, report, targetPath, mode };
}

function printModelSummary(result, mode) {
    const r = result.report;
    console.log(`\n[assets] ${r.model} [${mode}]`);
    console.log(`  fotos     found=${r.fotos_found} missing=${r.fotos_missing}`);
    console.log(`  esquemas  found=${r.esquemas_found} missing=${r.esquemas_missing} multiple=${r.esquemas_multiple}`);
    console.log(`  circulos  found=${r.circulos_found} missing=${r.circulos_missing} multiple=${r.circulos_multiple}`);
    console.log(`  cambios   rows=${r.changed_rows} fields=${r.changed_fields}`);
}

function runEnrichAssets(options = {}) {
    const repoRoot = options.rootDir || path.resolve(__dirname, '../../../..');
    const mode = options.mode === 'engine' ? 'engine' : 'rebuild';
    const shouldWrite = Boolean(options.write);
    const logger = options.logger || console.log;
    const wpFotosBase = txt(options.wpFotosBase || WP_BASE_FOTOS_DEFAULT).replace(/\/$/, '');
    const wpEsquemasBase = txt(options.wpEsquemasBase || WP_BASE_ESQUEMAS_POS_DEFAULT).replace(/\/$/, '');

    ensureOutputDir(repoRoot, mode);

    const models = resolveTargetModels(repoRoot, {
        mode,
        all: Boolean(options.all),
        engine: options.engine || ''
    });

    const reportOutputDir = mode === 'engine'
        ? path.join(repoRoot, ENGINE_REPORT_DIR)
        : path.join(repoRoot, REBUILD_DIR);

    const runModeLabel = shouldWrite ? 'WRITE' : 'DRY_RUN';
    logger(`[mode] ${runModeLabel}`);
    logger(`[target_mode] ${mode}`);
    logger(`[models] ${models.join(', ')}`);
    logger(`[wp_fotos_base] ${wpFotosBase}`);
    logger(`[wp_esquemas_base] ${wpEsquemasBase}`);

    const fotosIndex = buildFotosIndex(repoRoot);
    logger(`[fotos] indexadas ${fotosIndex.size} PNs con imagen`);

    const details = [];
    let processed = 0;
    let changedRowsTotal = 0;
    let changedFieldsTotal = 0;
    let recordsProcessed = 0;
    let photosLinked = 0;
    let schemasLinked = 0;
    let schemaPosLinked = 0;
    let missingAssets = 0;
    let backupsCreated = 0;
    const errors = [];

    for (const model of models) {
        let result;
        try {
            result = processModel(repoRoot, model, {
                mode,
                wpFotosBase,
                wpEsquemasBase
            }, fotosIndex);
        } catch (err) {
            const message = String(err && err.message ? err.message : err);
            logger(`\n[error] ${model}: ${message}`);
            errors.push({ model, error: message });
            continue;
        }

        printModelSummary(result, runModeLabel);

        const reportPrefix = mode === 'engine' ? 'assets_engine_report_' : 'assets_report_';
        const reportPath = path.join(reportOutputDir, `${reportPrefix}${model}.json`);

        let backupPath = null;
        if (shouldWrite) {
            backupPath = backupFile(result.targetPath);
            writeJson(result.targetPath, result.rows);
            backupsCreated += 1;
            logger(`  -> backup: ${path.relative(repoRoot, backupPath).replace(/\\/g, '/')}`);
            logger(`  -> escrito: ${path.relative(repoRoot, result.targetPath).replace(/\\/g, '/')}`);
        }

        writeJson(reportPath, result.report);
        logger(`  -> reporte: ${path.relative(repoRoot, reportPath).replace(/\\/g, '/')}`);

        processed++;
        recordsProcessed += result.report.rows_total;
        photosLinked += result.report.fotos_found;
        schemasLinked += result.report.esquemas_found;
        schemaPosLinked += result.report.circulos_found;
        missingAssets += result.report.missing_assets_rows;
        changedRowsTotal += result.report.changed_rows;
        changedFieldsTotal += result.report.changed_fields;

        details.push({
            model,
            mode,
            rowsTotal: result.report.rows_total,
            photosLinked: result.report.fotos_found,
            schemasLinked: result.report.esquemas_found,
            schemaPosLinked: result.report.circulos_found,
            missingAssets: result.report.missing_assets_rows,
            updatedRows: result.report.changed_rows,
            updatedFields: result.report.changed_fields,
            targetPath: path.relative(repoRoot, result.targetPath).replace(/\\/g, '/'),
            reportPath: path.relative(repoRoot, reportPath).replace(/\\/g, '/'),
            backupPath: backupPath ? path.relative(repoRoot, backupPath).replace(/\\/g, '/') : ''
        });
    }

    logger('\n[summary]');
    logger(`  - models_processed: ${processed}`);
    logger(`  - changed_rows_total: ${changedRowsTotal}`);
    logger(`  - changed_fields_total: ${changedFieldsTotal}`);

    return {
        ok: errors.length === 0,
        mode,
        dryRun: !shouldWrite,
        enginesProcessed: processed,
        recordsProcessed,
        photosLinked,
        schemasLinked,
        schemaPosLinked,
        updatedRows: changedRowsTotal,
        updatedFields: changedFieldsTotal,
        missingAssets,
        backupCreated: shouldWrite ? backupsCreated > 0 : false,
        backupsCreated,
        details,
        errors
    };
}

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

    try {
        const result = runEnrichAssets({
            rootDir: path.resolve(__dirname, '../../../..'),
            mode: args.mode,
            engine: args.engine,
            all: args.all,
            write: args.write,
            wpFotosBase: args.wpFotosBase,
            wpEsquemasBase: args.wpEsquemasBase,
            logger: console.log
        });
        return result.errors.length ? 1 : 0;
    } catch (err) {
        console.error(`[error] ${String(err && err.message ? err.message : err)}`);
        return 1;
    }
}

module.exports = { main, runEnrichAssets };

if (require.main === module) {
    process.exitCode = main(process.argv) || 0;
}

