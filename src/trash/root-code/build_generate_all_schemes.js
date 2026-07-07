#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { ENGINE_JSON_FILES } = require('./engine_files');

const DEFAULT_POS_PUBLIC_BASE = 'https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02';
const NOT_FOUND_STATUSES = new Set(['missing_data', 'pos_not_found', 'no_red_boxes']);

function txt(value) {
    return String(value == null ? '' : value).trim();
}

function normalizeEngineToken(value) {
    const raw = txt(value);
    if (!raw) return '';
    if (raw.toUpperCase() === 'ALL') return 'ALL';
    const match = raw.match(/^(?:engine_)?(.+?)(?:\.json)?$/i);
    return txt(match ? match[1] : raw);
}

function toInt(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    const text = txt(value);
    if (!text) return null;
    const numeric = Number(text);
    if (Number.isFinite(numeric)) return Math.trunc(numeric);
    const match = text.match(/\d+/);
    return match ? Number(match[0]) : null;
}

function normalizePosHint(row) {
    const raw = txt(row?.pos_final || row?.POS || '');
    return raw.replace(/\D+/g, '');
}

function splitCsvUnique(value) {
    const chunks = txt(value)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

    const result = [];
    const seen = new Set();
    for (const chunk of chunks) {
        const key = chunk.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(chunk);
    }
    return result;
}

function mergeCsvUnique(currentValue, valueToAdd) {
    const merged = splitCsvUnique(currentValue);
    const existing = new Set(merged.map((item) => item.toLowerCase()));
    for (const item of splitCsvUnique(valueToAdd)) {
        const key = item.toLowerCase();
        if (existing.has(key)) continue;
        existing.add(key);
        merged.push(item);
    }
    return merged.join(', ');
}

function setIfChanged(row, key, value) {
    if (Object.is(row[key], value)) return false;
    row[key] = value;
    return true;
}

function resolveEngineFiles(rootDir, engineToken) {
    if (engineToken === 'ALL') {
        return ENGINE_JSON_FILES
            .map((file) => path.join(rootDir, file))
            .filter((filePath) => fs.existsSync(filePath));
    }

    const model = normalizeEngineToken(engineToken);
    if (!model) {
        throw new Error('engine es obligatorio');
    }

    const filePath = path.join(rootDir, `engine_${model}.json`);
    if (!fs.existsSync(filePath)) {
        throw new Error(`No existe ${path.basename(filePath)}`);
    }
    return [filePath];
}

async function runPythonGenerateOne(options) {
    const reportPath = path.join(
        os.tmpdir(),
        `milu_generate_schemes_${Date.now()}_${process.pid}_${Math.random().toString(16).slice(2)}.json`
    );

    const args = [
        'generate_esquema_pos.py',
        '--engine', options.engine,
        '--id', options.id,
        '--pdf', options.pdf,
        '--out-dir', options.outDir,
        '--page-offset', '-1',
        '--dpi', '200',
        '--format', options.format,
        '--quality', '90',
        '--out-report', reportPath
    ];

    if (options.withoutCircle) args.push('--without-circle');
    if (options.dryRun) {
        args.push('--dry-run');
    } else {
        args.push('--write-images');
    }
    if (options.overwrite) args.push('--overwrite');
    if (Number.isInteger(options.sourcePageHint) && options.sourcePageHint > 0) {
        args.push('--source-page-hint', String(options.sourcePageHint));
    }
    if (txt(options.posHint)) args.push('--pos-hint', options.posHint);
    if (txt(options.partNoHint)) args.push('--part-no-hint', options.partNoHint);
    if (txt(options.designationHint)) args.push('--designation-hint', options.designationHint);

    return new Promise((resolve) => {
        const child = spawn('python', args, {
            cwd: options.rootDir,
            windowsHide: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            stdout += String(chunk || '');
        });

        child.stderr.on('data', (chunk) => {
            stderr += String(chunk || '');
        });

        child.on('error', (error) => {
            resolve({
                ok: false,
                exitCode: null,
                status: 'error',
                filename: '',
                report: null,
                stdout,
                stderr,
                error: String(error?.message || error)
            });
        });

        child.on('close', (code) => {
            let report = null;
            if (fs.existsSync(reportPath)) {
                try {
                    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                } catch (_) {
                    report = null;
                }
                try {
                    fs.unlinkSync(reportPath);
                } catch (_) {
                    // ignore cleanup error
                }
            }

            const status = txt(report?.status) || (code === 0 ? 'generated' : 'error');
            const filename = txt(report?.filename);
            resolve({
                ok: code === 0,
                exitCode: code,
                status,
                filename,
                report,
                stdout,
                stderr,
                error: code === 0 ? '' : txt(report?.reason) || txt(stderr) || `python exited with code=${code}`
            });
        });
    });
}

function createEngineCounters(engine) {
    return {
        engine,
        processed: 0,
        generatedBase: 0,
        alreadyExistsBase: 0,
        generatedPos: 0,
        alreadyExistsPos: 0,
        linked: 0,
        changedRows: 0,
        notFound: 0,
        errors: 0,
        backupPath: '',
        wroteFile: false
    };
}

function shouldCountAsSuccess(status) {
    return status === 'generated' || status === 'already_exists';
}

function updateSummaryCounter(summary, key) {
    summary[key] = Number(summary[key] || 0) + 1;
}

async function runGenerateAllSchemes(optionsInput = {}) {
    const options = {
        rootDir: txt(optionsInput.rootDir || __dirname),
        engine: normalizeEngineToken(optionsInput.engine || 'ALL') || 'ALL',
        id: txt(optionsInput.id || ''),
        dryRun: Boolean(optionsInput.dryRun),
        backup: optionsInput.backup !== false,
        overwrite: Boolean(optionsInput.overwrite),
        posPublicBase: txt(optionsInput.posPublicBase || process.env.MILU_SCHEMAS_POS_PUBLIC_BASE || DEFAULT_POS_PUBLIC_BASE)
    };

    const engineFiles = resolveEngineFiles(options.rootDir, options.engine);
    const summary = {
        engine: options.engine,
        id: options.id,
        dryRun: options.dryRun,
        backup: options.backup,
        overwrite: options.overwrite,
        processed: 0,
        generatedBase: 0,
        alreadyExistsBase: 0,
        generatedPos: 0,
        alreadyExistsPos: 0,
        linked: 0,
        changedRows: 0,
        notFound: 0,
        errors: 0,
        perEngine: []
    };

    for (const engineFilePath of engineFiles) {
        const fileName = path.basename(engineFilePath);
        const engineModel = normalizeEngineToken(fileName);
        const counters = createEngineCounters(fileName);

        const rows = JSON.parse(fs.readFileSync(engineFilePath, 'utf8'));
        if (!Array.isArray(rows)) {
            throw new Error(`${fileName} no contiene un array JSON`);
        }

        for (const row of rows) {
            if (!row || typeof row !== 'object') continue;

            const rowId = txt(row.ID);
            if (!rowId) continue;
            if (options.id && options.id !== rowId) continue;

            const sourcePageHint = toInt(row['Source Page']);
            const posHint = normalizePosHint(row);
            if (!Number.isInteger(sourcePageHint) || sourcePageHint <= 0 || !posHint) {
                updateSummaryCounter(summary, 'notFound');
                updateSummaryCounter(counters, 'notFound');
                continue;
            }

            updateSummaryCounter(summary, 'processed');
            updateSummaryCounter(counters, 'processed');

            const partNoHint = txt(row['PART NO.']);
            const designationHint = txt(row.DESIGNATION);

            const baseResult = await runPythonGenerateOne({
                rootDir: options.rootDir,
                engine: engineModel,
                id: rowId,
                pdf: `${engineModel}.pdf`,
                outDir: 'esquemas',
                format: 'png',
                withoutCircle: true,
                dryRun: options.dryRun,
                overwrite: options.overwrite,
                sourcePageHint,
                posHint,
                partNoHint,
                designationHint
            });

            const posResult = await runPythonGenerateOne({
                rootDir: options.rootDir,
                engine: engineModel,
                id: rowId,
                pdf: `${engineModel}.pdf`,
                outDir: 'esquemas_pos_circulos',
                format: 'webp',
                withoutCircle: false,
                dryRun: options.dryRun,
                overwrite: options.overwrite,
                sourcePageHint,
                posHint,
                partNoHint,
                designationHint
            });

            if (baseResult.status === 'generated') {
                updateSummaryCounter(summary, 'generatedBase');
                updateSummaryCounter(counters, 'generatedBase');
            } else if (baseResult.status === 'already_exists') {
                updateSummaryCounter(summary, 'alreadyExistsBase');
                updateSummaryCounter(counters, 'alreadyExistsBase');
            }

            if (posResult.status === 'generated') {
                updateSummaryCounter(summary, 'generatedPos');
                updateSummaryCounter(counters, 'generatedPos');
            } else if (posResult.status === 'already_exists') {
                updateSummaryCounter(summary, 'alreadyExistsPos');
                updateSummaryCounter(counters, 'alreadyExistsPos');
            }

            let rowChanged = false;

            if (shouldCountAsSuccess(baseResult.status) && txt(baseResult.filename)) {
                rowChanged = setIfChanged(row, 'esquemas', baseResult.filename) || rowChanged;
            }

            if (shouldCountAsSuccess(posResult.status) && txt(posResult.filename)) {
                const posUrl = `${options.posPublicBase.replace(/\/$/, '')}/${posResult.filename}`;
                const nextCirculosAll = mergeCsvUnique(row.esquemas_circulos_all, posResult.filename);
                const nextExpImagenes = mergeCsvUnique(row.exp_imagenes, posUrl);

                rowChanged = setIfChanged(row, 'esquemas_circulos', posResult.filename) || rowChanged;
                rowChanged = setIfChanged(row, 'esquemas_circulos_all', nextCirculosAll) || rowChanged;
                rowChanged = setIfChanged(row, 'ruta_esquemas_pos', posUrl) || rowChanged;
                rowChanged = setIfChanged(row, 'exp_imagenes', nextExpImagenes) || rowChanged;

                updateSummaryCounter(summary, 'linked');
                updateSummaryCounter(counters, 'linked');
            }

            const rowHasNotFound = NOT_FOUND_STATUSES.has(baseResult.status) || NOT_FOUND_STATUSES.has(posResult.status);
            if (rowHasNotFound) {
                updateSummaryCounter(summary, 'notFound');
                updateSummaryCounter(counters, 'notFound');
            }

            const rowHasError = [baseResult, posResult].some((result) => {
                if (shouldCountAsSuccess(result.status)) return false;
                if (NOT_FOUND_STATUSES.has(result.status)) return false;
                return true;
            });
            if (rowHasError) {
                updateSummaryCounter(summary, 'errors');
                updateSummaryCounter(counters, 'errors');
            }

            if (rowChanged) {
                updateSummaryCounter(summary, 'changedRows');
                updateSummaryCounter(counters, 'changedRows');
            }
        }

        if (!options.dryRun && counters.changedRows > 0) {
            if (options.backup) {
                const backupPath = `${engineFilePath}.backup-schemes-${Date.now()}`;
                fs.copyFileSync(engineFilePath, backupPath);
                counters.backupPath = backupPath;
            }
            fs.writeFileSync(engineFilePath, JSON.stringify(rows, null, 2), 'utf8');
            counters.wroteFile = true;
        }

        summary.perEngine.push(counters);
    }

    return summary;
}

function parseArgs(argv) {
    const args = {
        engine: 'ALL',
        id: '',
        dryRun: true,
        backup: true,
        overwrite: false
    };

    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--engine') {
            args.engine = txt(argv[i + 1]);
            i += 1;
            continue;
        }
        if (token.startsWith('--engine=')) {
            args.engine = txt(token.slice('--engine='.length));
            continue;
        }
        if (token === '--id') {
            args.id = txt(argv[i + 1]);
            i += 1;
            continue;
        }
        if (token.startsWith('--id=')) {
            args.id = txt(token.slice('--id='.length));
            continue;
        }
        if (token === '--dry-run') {
            args.dryRun = true;
            continue;
        }
        if (token === '--write') {
            args.dryRun = false;
            continue;
        }
        if (token === '--no-backup') {
            args.backup = false;
            continue;
        }
        if (token === '--overwrite') {
            args.overwrite = true;
            continue;
        }
        if (token === '--help' || token === '-h') {
            args.help = true;
            continue;
        }
        throw new Error(`Argumento no reconocido: ${token}`);
    }

    return args;
}

function printHelp() {
    console.log([
        'Uso:',
        '  node build_generate_all_schemes.js --engine ALL --dry-run',
        '  node build_generate_all_schemes.js --engine 12V4000M40A --write',
        '  node build_generate_all_schemes.js --engine 12V4000M40A --id RB-12V4000M40A-000008 --write',
        '',
        'Opciones:',
        '  --engine <ALL|MODEL>',
        '  --id <ROW_ID>        Opcional, filtra a un registro concreto',
        '  --dry-run            Simula sin escribir engine_*.json (por defecto)',
        '  --write              Escribe cambios en engine_*.json',
        '  --no-backup          No crea backup al escribir',
        '  --overwrite          Sobrescribe imagenes existentes'
    ].join('\n'));
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printHelp();
        return 0;
    }

    const result = await runGenerateAllSchemes({
        rootDir: __dirname,
        engine: args.engine,
        id: args.id,
        dryRun: args.dryRun,
        backup: args.backup,
        overwrite: args.overwrite
    });

    console.log(JSON.stringify({ ok: result.errors === 0, result }, null, 2));
    return result.errors === 0 ? 0 : 1;
}

if (require.main === module) {
    main()
        .then((code) => {
            process.exit(code);
        })
        .catch((error) => {
            console.error(String(error?.stack || error));
            process.exit(1);
        });
}

module.exports = {
    runGenerateAllSchemes,
    normalizeEngineToken
};
