#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../config/engine_files');

function text(value) {
    return String(value == null ? '' : value).trim();
}

function normalizeSpaces(value) {
    return text(value).replace(/\s+/g, ' ');
}

function normalizeEngineToken(value) {
    const raw = text(value);
    if (!raw) return '';
    if (raw.toUpperCase() === 'ALL') return 'ALL';

    const match = raw.match(/^(?:engine_)?(.+?)(?:\.json)?$/i);
    const model = text(match ? match[1] : raw);
    if (!model) return '';
    return model;
}

function readJsonArray(filePath, label) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
        throw new Error(`${label} no contiene un array JSON.`);
    }
    return data;
}

function resolveFgFgsPath(rootDir) {
    const candidates = [
        path.join(rootDir, 'src', 'data', 'json', 'EXCEL_FG-FGS.json'),
        path.join(rootDir, 'src', 'data', 'excel', 'EXCEL_FG-FGS.json'),
        path.join(rootDir, 'data', 'EXCEL_FG-FGS.json'),
        path.join(rootDir, 'EXCEL_FG-FGS.json')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error(
        `No se encontró EXCEL_FG-FGS.json. Rutas probadas: ${candidates.join(', ')}`
    );
}

function getEngineJsonDir(repoRoot) {
    return path.join(repoRoot, 'src', 'data', 'json');
}

function resolveEngineFiles(repoRoot, options = {}) {
    const engineJsonDir = getEngineJsonDir(repoRoot);

    if (options.all || normalizeEngineToken(options.engine) === 'ALL') {
        return ENGINE_JSON_FILES.filter((file) => {
            return fs.existsSync(path.join(engineJsonDir, file));
        });
    }

    const engineToken = normalizeEngineToken(options.engine);
    if (!engineToken) {
        throw new Error('Debe indicar --all o --engine <modelo>.');
    }

    const file = `engine_${engineToken}.json`;
    const fullPath = path.join(engineJsonDir, file);

    if (!fs.existsSync(fullPath)) {
        throw new Error(`No existe el engine solicitado: ${fullPath}`);
    }

    return [file];
}

function buildFgMasterIndex(masterRows) {
    const byModelCode = new Map();

    for (const row of masterRows) {
        const model = text(row?.model).toUpperCase();
        const code = Number(row?.code);
        if (!model || !Number.isFinite(code)) continue;

        const normalizedDescription = text(row?.description);
        const normalizedCodeDescription = normalizeSpaces(row?.FG_Descripcion);
        const key = `${model}::${code}`;

        byModelCode.set(key, {
            code,
            description: normalizedDescription || null,
            codeDescription: normalizedCodeDescription || null
        });
    }

    return byModelCode;
}

function extractFgCodeFromFinal(value) {
    const raw = text(value);
    if (!raw) return null;

    const match = raw.match(/^(\d+)/);
    if (!match) return null;

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
}

function createBackup(enginePath) {
    const backupPath = `${enginePath}.bak.${Date.now()}`;
    fs.copyFileSync(enginePath, backupPath);
    return backupPath;
}

function applyFgFields(row, nextValues) {
    const beforeFgCode = row?.fg_code == null ? null : Number(row.fg_code);
    const beforeDescription = row?.fgs_description == null ? null : row.fgs_description;
    const beforeCodeDescription = row?.fgs_code_description == null ? null : row.fgs_code_description;

    const afterFgCode = nextValues.fg_code;
    const afterDescription = nextValues.fgs_description;
    const afterCodeDescription = nextValues.fgs_code_description;

    let changed = false;

    if (!Object.is(beforeFgCode, afterFgCode)) {
        row.fg_code = afterFgCode;
        changed = true;
    }

    if (!Object.is(beforeDescription, afterDescription)) {
        row.fgs_description = afterDescription;
        changed = true;
    }

    if (!Object.is(beforeCodeDescription, afterCodeDescription)) {
        row.fgs_code_description = afterCodeDescription;
        changed = true;
    }

    return changed;
}

function parseArgs(argv) {
    const out = {
        all: false,
        engine: '',
        write: false,
        dryRun: true,
        backup: false,
        fgPath: '',
        help: false
    };

    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];

        if (token === '--all') {
            out.all = true;
            continue;
        }
        if (token === '--write') {
            out.write = true;
            out.dryRun = false;
            continue;
        }
        if (token === '--dry-run') {
            out.write = false;
            out.dryRun = true;
            continue;
        }
        if (token === '--backup') {
            out.backup = true;
            continue;
        }
        if (token === '--no-backup') {
            out.backup = false;
            continue;
        }
        if (token === '--help' || token === '-h') {
            out.help = true;
            continue;
        }

        if (token === '--engine' || token === '--fg-path') {
            const value = text(argv[i + 1]);
            if (!value) {
                throw new Error(`Debe indicar un valor para ${token}`);
            }
            if (token === '--engine') out.engine = value;
            if (token === '--fg-path') out.fgPath = value;
            i += 1;
            continue;
        }

        if (token.startsWith('--engine=')) {
            out.engine = text(token.slice('--engine='.length));
            continue;
        }
        if (token.startsWith('--fg-path=')) {
            out.fgPath = text(token.slice('--fg-path='.length));
            continue;
        }

        throw new Error(`Argumento no reconocido: ${token}`);
    }

    if (!out.all && !out.engine) {
        throw new Error('Debe indicar --all o --engine <modelo|engine_xxx.json>.');
    }
    if (out.all && out.engine) {
        throw new Error('No puede usar --all y --engine al mismo tiempo.');
    }

    return out;
}

function printHelp() {
    console.log([
        'Uso:',
        '  node scripts/update_fg_fgs_fields.js --engine 12V4000M40A --dry-run',
        '  node scripts/update_fg_fgs_fields.js --engine 12V4000M40A --write --backup',
        '  node scripts/update_fg_fgs_fields.js --all --dry-run',
        '  node scripts/update_fg_fgs_fields.js --all --write --backup',
        '',
        'Regla aplicada:',
        '  - Lee exclusivamente row.fg_fgs_final (sin fallbacks).',
        '  - Si fg_fgs_final esta vacio => fg_code/fgs_description/fgs_code_description = null.',
        '  - Si hay valor, extrae el primer bloque numerico y hace match por model+code en EXCEL_FG-FGS.json.'
    ].join('\n'));
}

function runUpdateFgFgs(optionsInput = {}) {
    const options = {
        engine: text(optionsInput.engine || ''),
        all: Boolean(optionsInput.all),
        write: Boolean(optionsInput.write),
        backup: optionsInput.backup === true,
        fgPath: text(optionsInput.fgPath || ''),
        rootDir: text(optionsInput.rootDir || path.resolve(__dirname, '../../../..'))
    };

    const repoRoot = options.rootDir;
    const resolvedMasterPath = resolveFgFgsPath(repoRoot, options.fgPath);
    const masterRows = readJsonArray(resolvedMasterPath, path.basename(resolvedMasterPath));
    const masterByModelCode = buildFgMasterIndex(masterRows);

    const engineFiles = resolveEngineFiles(repoRoot, {
        all: options.all,
        engine: options.engine
    });

    if (engineFiles.length === 0) {
        throw new Error('No se encontraron archivos engine_*.json para procesar.');
    }

    const summary = {
        ok: true,
        mode: options.write ? 'WRITE' : 'DRY-RUN',
        masterSource: resolvedMasterPath,
        enginesProcesados: 0,
        registrosEscaneados: 0,
        conFgDetectado: 0,
        matched: 0,
        notFound: 0,
        changedRows: 0,
        backupsCreated: 0,
        backups: [],
        engineDetails: []
    };

    for (const engineFile of engineFiles) {
        const enginePath = path.join(getEngineJsonDir(repoRoot), engineFile);
        const rows = readJsonArray(enginePath, engineFile);

        let scanned = 0;
        let withFgCode = 0;
        let matched = 0;
        let notFound = 0;
        let changedRows = 0;

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex] || {};
            scanned += 1;
            summary.registrosEscaneados += 1;

            const fgFinal = text(row?.fg_fgs_final);
            if (!fgFinal) {
                const changed = applyFgFields(row, {
                    fg_code: null,
                    fgs_description: null,
                    fgs_code_description: null
                });
                if (changed) {
                    changedRows += 1;
                    summary.changedRows += 1;
                }
                continue;
            }

            const fgCode = extractFgCodeFromFinal(fgFinal);
            if (fgCode == null) {
                const changed = applyFgFields(row, {
                    fg_code: null,
                    fgs_description: null,
                    fgs_code_description: null
                });
                if (changed) {
                    changedRows += 1;
                    summary.changedRows += 1;
                }
                continue;
            }

            withFgCode += 1;
            summary.conFgDetectado += 1;

            const rowModel = text(row?.engine_model) || text(row?.book_set);
            const lookupKey = `${rowModel.toUpperCase()}::${fgCode}`;
            const masterMatch = masterByModelCode.get(lookupKey) || null;

            if (masterMatch) {
                matched += 1;
                summary.matched += 1;

                const changed = applyFgFields(row, {
                    fg_code: masterMatch.code,
                    fgs_description: masterMatch.description,
                    fgs_code_description: masterMatch.codeDescription
                });

                if (changed) {
                    changedRows += 1;
                    summary.changedRows += 1;
                }
            } else {
                notFound += 1;
                summary.notFound += 1;

                const changed = applyFgFields(row, {
                    fg_code: fgCode,
                    fgs_description: null,
                    fgs_code_description: null
                });

                if (changed) {
                    changedRows += 1;
                    summary.changedRows += 1;
                }
            }
        }

        const wroteFile = Boolean(options.write && changedRows > 0);
        let backupFile = null;

        if (wroteFile) {
            if (options.backup) {
                const backupPath = createBackup(enginePath);
                backupFile = path.basename(backupPath);
                summary.backupsCreated += 1;
                summary.backups.push(backupFile);
            }
            fs.writeFileSync(enginePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
        }

        summary.enginesProcesados += 1;
        summary.engineDetails.push({
            engine: engineFile,
            scanned,
            conFgDetectado: withFgCode,
            matched,
            notFound,
            changedRows,
            wroteFile,
            backup: backupFile
        });
    }

    return summary;
}

function printSummary(summary) {
    console.log('=== UPDATE FG/FGS FROM EXCEL_FG-FGS ===');
    console.log(`Modo: ${summary.mode}`);
    console.log(`Fuente FG/FGS: ${summary.masterSource}`);
    console.log(`enginesProcesados: ${summary.enginesProcesados}`);
    console.log(`registrosEscaneados: ${summary.registrosEscaneados}`);
    console.log(`conFgDetectado: ${summary.conFgDetectado}`);
    console.log(`matched: ${summary.matched}`);
    console.log(`notFound: ${summary.notFound}`);
    console.log(`changedRows: ${summary.changedRows}`);
    console.log(`backupsCreated: ${summary.backupsCreated}`);
    console.log('');
    console.log('Resumen por engine:');
    console.log(JSON.stringify(summary.engineDetails, null, 2));
}

function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printHelp();
        return;
    }

    const result = runUpdateFgFgs({
        all: args.all,
        engine: args.engine,
        write: args.write,
        backup: args.backup,
        fgPath: args.fgPath,
        rootDir: path.resolve(__dirname, '../../../..')
    });

    printSummary(result);
}

module.exports = {
    main,
    runUpdateFgFgs,
    normalizeEngineToken,
    extractFgCodeFromFinal
};

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error('UPDATE_FG_FGS_FIELDS_FAILED:', String(error?.message || error));
        process.exit(1);
    }
}

