#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');

const ALLOWED_FIELDS = [
    'gesa',
    'designation_gesa',
    'nsn',
    'norma',
    'normalizado',
    'dimensions_gesa',
    'weight_gesa',
    'units'
];

function txt(value) {
    return String(value == null ? '' : value).trim();
}

function normalizeEngineToken(value) {
    const raw = txt(value);
    if (!raw) return '';
    if (raw.toUpperCase() === 'ALL') return 'ALL';

    const match = raw.match(/^(?:engine_)?(.+?)(?:\.json)?$/i);
    const model = txt(match ? match[1] : raw);
    if (!model) return '';
    return model;
}

function parseArgs(argv) {
    const args = { write: false, only: '' };

    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '--write') {
            args.write = true;
            continue;
        }
        if (token === '--only') {
            args.only = txt(argv[i + 1]);
            i += 1;
            continue;
        }
        if (token === '--help' || token === '-h') {
            args.help = true;
            continue;
        }
        throw new Error(`Argumento no reconocido: ${token}`);
    }

    if (argv.includes('--only') && !args.only) {
        throw new Error('Debe indicar un valor para --only (ej: --only 12V4000M53).');
    }

    return args;
}

function printHelp() {
    console.log([
        'Uso:',
        '  node scripts/update_gesa_fields_from_excel.js',
        '  node scripts/update_gesa_fields_from_excel.js --write',
        '  node scripts/update_gesa_fields_from_excel.js --only 12V4000M53',
        '  node scripts/update_gesa_fields_from_excel.js --only 12V4000M53 --write'
    ].join('\n'));
}

function resolveOnlyToEngineFilename(onlyArg) {
    const raw = txt(onlyArg);
    if (!raw) return '';

    if (/^engine_.+\.json$/i.test(raw)) return raw;
    if (/\.json$/i.test(raw)) return raw;
    return `engine_${raw}.json`;
}

function readJsonArray(filePath, label) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
        throw new Error(`${label} no contiene un array JSON.`);
    }
    return data;
}

function listEngineFiles(repoRoot, onlyArg) {
    const onlyFile = resolveOnlyToEngineFilename(onlyArg);

    if (onlyFile) {
        const absolutePath = path.join(repoRoot, onlyFile);
        if (!fs.existsSync(absolutePath)) {
            throw new Error(`No existe el engine solicitado con --only: ${onlyFile}`);
        }
        return [onlyFile];
    }

    return ENGINE_JSON_FILES
        .filter((file) => fs.existsSync(path.join(repoRoot, file)))
        .sort((a, b) => a.localeCompare(b));
}

function buildGesaMap(gesaRows) {
    const map = new Map();
    const stats = {
        totalRows: gesaRows.length,
        rowsWithPartNumber: 0,
        rowsMissingPartNumber: 0,
        duplicatePartNumbers: 0,
        missingPartNumberExamples: [],
        duplicateExamples: []
    };

    for (let idx = 0; idx < gesaRows.length; idx += 1) {
        const row = gesaRows[idx] || {};
        const partNumber = txt(row['PART NUMBER']);

        if (!partNumber) {
            stats.rowsMissingPartNumber += 1;
            if (stats.missingPartNumberExamples.length < 5) {
                stats.missingPartNumberExamples.push({ index: idx, rowSample: row });
            }
            continue;
        }

        stats.rowsWithPartNumber += 1;

        if (map.has(partNumber)) {
            stats.duplicatePartNumbers += 1;
            if (stats.duplicateExamples.length < 5) {
                stats.duplicateExamples.push({
                    partNumber,
                    firstIndex: map.get(partNumber).__index,
                    duplicateIndex: idx
                });
            }
        }

        map.set(partNumber, { ...row, __index: idx });
    }

    return { map, stats };
}

function getMappedGesaFields(gesaRow) {
    const norma = txt(gesaRow?.['NORM']);
    return {
        gesa: 'SI',
        designation_gesa: gesaRow?.['DESIGNATION (english)'] ?? '',
        nsn: gesaRow?.['NATO-VERS.-NR'] ?? '',
        norma: gesaRow?.['NORM'] ?? '',
        normalizado: norma ? 'SI' : 'NO',
        dimensions_gesa: gesaRow?.['DIMENSIONS'] ?? '',
        weight_gesa: gesaRow?.['UNIT WEIGHT'] ?? '',
        units: gesaRow?.['UNIT OF WEIGHT'] ?? ''
    };
}

function getNoMatchFields() {
    return {
        gesa: 'NO',
        designation_gesa: '',
        nsn: '',
        norma: '',
        normalizado: 'NO',
        dimensions_gesa: '',
        weight_gesa: '',
        units: ''
    };
}

function applyAllowedFields(row, nextFields) {
    let changed = false;

    for (const field of ALLOWED_FIELDS) {
        const before = row[field];
        const after = nextFields[field];
        if (!Object.is(before, after)) {
            row[field] = after;
            changed = true;
        }
    }

    return changed;
}

function createBackup(enginePath) {
    const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
    const backupPath = `${enginePath}.backup-gesa-${timestamp}`;
    fs.copyFileSync(enginePath, backupPath);
    return backupPath;
}

function resolveGesaPath(repoRoot, suppliedPath = '') {
    const input = txt(suppliedPath);
    const candidates = [];

    if (input) {
        if (path.isAbsolute(input)) {
            candidates.push(input);
        } else {
            candidates.push(path.join(repoRoot, input));
            candidates.push(path.join(repoRoot, 'data', input));
        }
    } else {
        candidates.push(path.join(repoRoot, 'EXCEL_GESA2026.json'));
        candidates.push(path.join(repoRoot, 'data', 'EXCEL_GESA2026.json'));
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }

    throw new Error(`No existe EXCEL_GESA2026.json. Rutas probadas: ${candidates.join(', ')}`);
}

function runUpdateGesa(optionsInput = {}) {
    const options = {
        engine: txt(optionsInput.engine || ''),
        all: Boolean(optionsInput.all),
        write: Boolean(optionsInput.write),
        backup: optionsInput.backup !== false,
        gesaPath: txt(optionsInput.gesaPath || ''),
        rootDir: txt(optionsInput.rootDir || path.resolve(__dirname, '..'))
    };

    const repoRoot = options.rootDir;
    const resolvedGesaPath = resolveGesaPath(repoRoot, options.gesaPath);
    const gesaRows = readJsonArray(resolvedGesaPath, path.basename(resolvedGesaPath));
    const { map: gesaByPartNumber, stats: gesaStats } = buildGesaMap(gesaRows);

    if (gesaByPartNumber.size === 0) {
        throw new Error('No hay PART NUMBER validos para hacer match en EXCEL_GESA2026.json.');
    }

    const normalizedEngine = normalizeEngineToken(options.engine);
    const onlyArg = options.all || normalizedEngine === 'ALL' ? '' : normalizedEngine;
    const engineFiles = listEngineFiles(repoRoot, onlyArg);

    if (engineFiles.length === 0) {
        throw new Error('No se encontraron archivos engine_*.json para procesar.');
    }

    const summary = {
        ok: true,
        mode: options.write ? 'WRITE' : 'DRY-RUN',
        gesaSource: resolvedGesaPath,
        enginesProcesados: 0,
        registrosEscaneados: 0,
        matchesGesa: 0,
        noEncontrados: 0,
        registrosModificados: 0,
        backupsCreados: 0,
        backups: [],
        engineDetails: [],
        matchExamples: [],
        noMatchExamples: [],
        gesaInputStats: gesaStats
    };

    for (const engineFile of engineFiles) {
        const enginePath = path.join(repoRoot, engineFile);
        const rows = readJsonArray(enginePath, engineFile);

        let engineScanned = 0;
        let engineMatches = 0;
        let engineNoMatches = 0;
        let engineChanged = 0;

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex] || {};
            const pnFinal = txt(row.pn_final);
            const gesaRow = gesaByPartNumber.get(pnFinal);

            engineScanned += 1;
            summary.registrosEscaneados += 1;

            let nextFields;
            if (gesaRow) {
                nextFields = getMappedGesaFields(gesaRow);
                engineMatches += 1;
                summary.matchesGesa += 1;
                if (summary.matchExamples.length < 8) {
                    summary.matchExamples.push({
                        engine: engineFile,
                        rowIndex,
                        id: txt(row.ID),
                        pn_final: pnFinal,
                        part_number: txt(gesaRow['PART NUMBER'])
                    });
                }
            } else {
                nextFields = getNoMatchFields();
                engineNoMatches += 1;
                summary.noEncontrados += 1;
                if (summary.noMatchExamples.length < 8) {
                    summary.noMatchExamples.push({
                        engine: engineFile,
                        rowIndex,
                        id: txt(row.ID),
                        pn_final: pnFinal
                    });
                }
            }

            const changed = applyAllowedFields(row, nextFields);
            if (changed) {
                engineChanged += 1;
                summary.registrosModificados += 1;
            }
        }

        let backupFile = null;
        const wroteFile = Boolean(options.write && engineChanged > 0);
        if (wroteFile) {
            if (options.backup) {
                const backupPath = createBackup(enginePath);
                backupFile = path.basename(backupPath);
                summary.backupsCreados += 1;
                summary.backups.push(backupFile);
            }
            fs.writeFileSync(enginePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
        }

        summary.enginesProcesados += 1;
        summary.engineDetails.push({
            engine: engineFile,
            scanned: engineScanned,
            matches: engineMatches,
            noMatches: engineNoMatches,
            modified: engineChanged,
            wroteFile,
            backup: backupFile
        });
    }

    return summary;
}

function printSummary(summary) {
    if (summary.gesaInputStats.rowsMissingPartNumber > 0) {
        console.warn('[WARN] Filas GESA sin PART NUMBER:', summary.gesaInputStats.rowsMissingPartNumber);
    }
    if (summary.gesaInputStats.duplicatePartNumbers > 0) {
        console.warn('[WARN] PART NUMBER duplicados en GESA (se usa la ultima fila):', summary.gesaInputStats.duplicatePartNumbers);
    }

    console.log('=== UPDATE GESA FROM EXCEL ===');
    console.log(`Modo: ${summary.mode}`);
    console.log(`Fuente GESA: ${summary.gesaSource}`);
    console.log(`Engines procesados: ${summary.enginesProcesados}`);
    console.log(`Registros escaneados: ${summary.registrosEscaneados}`);
    console.log(`Matches GESA: ${summary.matchesGesa}`);
    console.log(`No encontrados: ${summary.noEncontrados}`);
    console.log(`Registros modificados: ${summary.registrosModificados}`);
    console.log(`Backups creados: ${summary.backupsCreados}`);
    console.log('');
    console.log('Ejemplos match exacto (PART NUMBER == pn_final):');
    console.log(JSON.stringify(summary.matchExamples.slice(0, 5), null, 2));
    console.log('');
    console.log('Ejemplos sin match exacto:');
    console.log(JSON.stringify(summary.noMatchExamples.slice(0, 5), null, 2));
    console.log('');
    console.log('Resumen por engine:');
    console.log(JSON.stringify(summary.engineDetails, null, 2));
    console.log('');
    console.log('Input GESA stats:');
    console.log(JSON.stringify(summary.gesaInputStats, null, 2));
}

function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printHelp();
        return;
    }

    const summary = runUpdateGesa({
        engine: args.only,
        all: false,
        write: args.write,
        backup: true,
        rootDir: path.resolve(__dirname, '..')
    });
    printSummary(summary);
}

module.exports = {
    runUpdateGesa,
    normalizeEngineToken
};

try {
    main();
} catch (error) {
    console.error('UPDATE_GESA_FIELDS_FAILED:', String(error?.message || error));
    process.exit(1);
}
