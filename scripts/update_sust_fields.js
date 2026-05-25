#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');

const SUST_FIELDS = [
    'sust_status',
    'sust_hierarchie',
    'sust_new_part_number',
    'sust_superseded_list'
];

function text(value) {
    return String(value == null ? '' : value).trim();
}

function parseSeq(value) {
    const raw = text(value);
    if (!raw) return null;
    const asNumber = Number(raw);
    return Number.isFinite(asNumber) ? asNumber : null;
}

function parseArgs(argv) {
    const out = {
        all: false,
        engine: '',
        sust: '',
        write: false,
        backup: true,
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
            continue;
        }
        if (token === '--dry-run') {
            out.write = false;
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

        if (token === '--engine' || token === '--sust') {
            const value = text(argv[i + 1]);
            if (!value) {
                throw new Error(`Debe indicar un valor para ${token}`);
            }
            if (token === '--engine') out.engine = value;
            if (token === '--sust') out.sust = value;
            i += 1;
            continue;
        }

        if (token.startsWith('--engine=')) {
            out.engine = text(token.slice('--engine='.length));
            continue;
        }
        if (token.startsWith('--sust=')) {
            out.sust = text(token.slice('--sust='.length));
            continue;
        }

        throw new Error(`Argumento no reconocido: ${token}`);
    }

    if (!out.all && !out.engine) {
        throw new Error('Debe indicar --engine <modelo|engine_xxx.json> o --all.');
    }
    if (out.all && out.engine) {
        throw new Error('No puede usar --all y --engine al mismo tiempo.');
    }

    return out;
}

function printHelp() {
    console.log([
        'Uso:',
        '  node scripts/update_sust_fields.js --engine engine_12V4000M40A.json --sust EXCEL_SUSTITUCION.json --dry-run',
        '  node scripts/update_sust_fields.js --engine engine_12V4000M40A.json --sust EXCEL_SUSTITUCION.json --write',
        '  node scripts/update_sust_fields.js --all --sust EXCEL_SUSTITUCION.json --write',
        '',
        'Notas:',
        '  - Si no se indica --sust, busca data/EXCEL_SUSTITUCION.json y luego EXCEL_SUSTITUCION.json.',
        '  - --write escribe cambios. Sin --write, corre en dry-run.',
        '  - --no-backup evita crear backup en modo write.'
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

function normalizeEngineToken(value) {
    const raw = text(value);
    if (!raw) return '';
    if (raw.toUpperCase() === 'ALL') return 'ALL';

    const match = raw.match(/^(?:engine_)?(.+?)(?:\.json)?$/i);
    const model = text(match ? match[1] : raw);
    if (!model) return '';
    return model;
}

function resolveEngineFiles(repoRoot, options = {}) {
    if (options.all || normalizeEngineToken(options.engine) === 'ALL') {
        return ENGINE_JSON_FILES.filter((file) => fs.existsSync(path.join(repoRoot, file)));
    }

    const engineToken = normalizeEngineToken(options.engine);
    if (!engineToken) {
        throw new Error('Debe indicar un engine valido o usar ALL.');
    }

    const file = `engine_${engineToken}.json`;
    const fullPath = path.join(repoRoot, file);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`No existe el engine solicitado: ${file}`);
    }
    return [file];
}

function resolveSustPath(repoRoot, suppliedPath = '') {
    const input = text(suppliedPath);

    const candidates = [];
    if (input) {
        if (path.isAbsolute(input)) {
            candidates.push(input);
        } else {
            candidates.push(path.join(repoRoot, input));
            candidates.push(path.join(repoRoot, 'data', input));
        }
    } else {
        candidates.push(path.join(repoRoot, 'data', 'EXCEL_SUSTITUCION.json'));
        candidates.push(path.join(repoRoot, 'EXCEL_SUSTITUCION.json'));
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }

    throw new Error(`No se encontro el archivo SUST. Rutas probadas: ${candidates.join(', ')}`);
}

function sortBySeq(items = []) {
    const withIndex = items.map((item, index) => ({ ...item, __originOrder: Number(item?.__originOrder ?? index) }));
    const hasAnySeq = withIndex.some((item) => item.seq != null);

    if (!hasAnySeq) {
        return withIndex.sort((a, b) => a.__originOrder - b.__originOrder);
    }

    return withIndex.sort((a, b) => {
        const aHas = a.seq != null;
        const bHas = b.seq != null;

        if (aHas && bHas && a.seq !== b.seq) return a.seq - b.seq;
        if (aHas !== bHas) return aHas ? -1 : 1;
        return a.__originOrder - b.__originOrder;
    });
}

function buildSustIndex(rows = []) {
    const byNew = new Map();
    const bySuperseded = new Map();

    rows.forEach((row, index) => {
        const newPart = text(row?.['New Part Number']);
        const supersededPart = text(row?.['Superseded Part Number']);
        const hierarchie = text(row?.Hierarchie);
        const seq = parseSeq(row?.['Seq no']);
        const indexedRow = {
            row,
            newPart,
            supersededPart,
            hierarchie,
            seq,
            __originOrder: index
        };

        if (newPart) {
            if (!byNew.has(newPart)) byNew.set(newPart, []);
            byNew.get(newPart).push(indexedRow);
        }

        if (supersededPart) {
            if (!bySuperseded.has(supersededPart)) bySuperseded.set(supersededPart, []);
            bySuperseded.get(supersededPart).push(indexedRow);
        }
    });

    return { byNew, bySuperseded };
}

function getSupersededListByNewPart(index, newPart) {
    if (!newPart) return null;

    const rows = sortBySeq(index.byNew.get(newPart) || []).filter((item) => text(item.hierarchie).toLowerCase() === 'superseded');
    const seen = new Set();
    const values = [];

    for (const item of rows) {
        const value = text(item.supersededPart);
        if (!value) continue;
        if (seen.has(value)) continue;
        seen.add(value);
        values.push(value);
    }

    return values.length ? values.join(', ') : null;
}

function pickNewCandidate(candidates = []) {
    const ordered = sortBySeq(candidates);
    if (!ordered.length) return null;

    // Criterio requerido: si hay varias filas para un PN como New Part Number,
    // priorizar Hierarchie == New; si no existe, usar la primera por Seq no/orden origen.
    const preferred = ordered.find((item) => text(item.hierarchie).toLowerCase() === 'new');
    return preferred || ordered[0];
}

function getNoMatchFields() {
    return {
        sust_status: 'NO',
        sust_hierarchie: null,
        sust_new_part_number: null,
        sust_superseded_list: null
    };
}

function computeSustFieldsForPn(index, pn) {
    const normalizedPn = text(pn);
    if (!normalizedPn) {
        return {
            kind: 'not_found',
            fields: getNoMatchFields()
        };
    }

    const asNew = index.byNew.get(normalizedPn) || [];
    if (asNew.length > 0) {
        const main = pickNewCandidate(asNew);
        const mainNewPart = text(main?.newPart) || normalizedPn;
        return {
            kind: 'matched_new',
            fields: {
                sust_status: 'SI',
                sust_hierarchie: text(main?.hierarchie) || null,
                sust_new_part_number: mainNewPart || null,
                sust_superseded_list: getSupersededListByNewPart(index, mainNewPart)
            }
        };
    }

    const asSuperseded = sortBySeq(index.bySuperseded.get(normalizedPn) || []);
    if (asSuperseded.length > 0) {
        const main = asSuperseded[0];
        const targetNewPart = text(main?.newPart) || null;
        return {
            kind: 'matched_superseded',
            fields: {
                sust_status: 'SI',
                sust_hierarchie: 'Superseded',
                sust_new_part_number: targetNewPart,
                sust_superseded_list: getSupersededListByNewPart(index, targetNewPart)
            }
        };
    }

    return {
        kind: 'not_found',
        fields: getNoMatchFields()
    };
}

function applySustFields(row, fields) {
    let changed = false;
    for (const key of SUST_FIELDS) {
        const before = row[key];
        const after = fields[key];
        if (!Object.is(before, after)) {
            row[key] = after;
            changed = true;
        }
    }
    return changed;
}

function createBackup(enginePath) {
    const stamp = new Date().toISOString().replace(/[.:]/g, '-');
    const backupPath = `${enginePath}.backup-sust-${stamp}`;
    fs.copyFileSync(enginePath, backupPath);
    return backupPath;
}

function initSummary(mode, sustPath) {
    return {
        ok: true,
        mode,
        sustSource: sustPath,
        enginesProcesados: 0,
        registrosEscaneados: 0,
        matchedNew: 0,
        matchedSuperseded: 0,
        notFound: 0,
        changedRows: 0,
        backupsCreated: 0,
        backups: [],
        engineDetails: [],
        examples: {
            matched_new: [],
            matched_superseded: [],
            not_found: [],
            changed: []
        }
    };
}

function runUpdateSust(optionsInput = {}) {
    const options = {
        engine: text(optionsInput.engine || ''),
        all: Boolean(optionsInput.all),
        sustPath: text(optionsInput.sustPath || ''),
        write: Boolean(optionsInput.write),
        backup: optionsInput.backup !== false,
        rootDir: text(optionsInput.rootDir || path.join(__dirname, '..'))
    };

    const repoRoot = options.rootDir;
    const resolvedSustPath = resolveSustPath(repoRoot, options.sustPath);
    const sustRows = readJsonArray(resolvedSustPath, path.basename(resolvedSustPath));
    const index = buildSustIndex(sustRows);

    const engineFiles = resolveEngineFiles(repoRoot, {
        all: options.all,
        engine: options.engine
    });
    if (engineFiles.length === 0) {
        throw new Error('No se encontraron archivos engine_*.json para procesar.');
    }

    const summary = initSummary(options.write ? 'WRITE' : 'DRY-RUN', resolvedSustPath);

    for (const engineFile of engineFiles) {
        const enginePath = path.join(repoRoot, engineFile);
        const rows = readJsonArray(enginePath, engineFile);

        let scanned = 0;
        let matchedNew = 0;
        let matchedSuperseded = 0;
        let notFound = 0;
        let changedRows = 0;

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const row = rows[rowIndex] || {};
            const pn = text(row?.pn_final) || text(row?.['PART NO.']);

            scanned += 1;
            summary.registrosEscaneados += 1;

            const computed = computeSustFieldsForPn(index, pn);
            if (computed.kind === 'matched_new') {
                matchedNew += 1;
                summary.matchedNew += 1;
                if (summary.examples.matched_new.length < 6) {
                    summary.examples.matched_new.push({
                        engine: engineFile,
                        rowIndex,
                        id: text(row?.ID),
                        pn,
                        sust_new_part_number: computed.fields.sust_new_part_number
                    });
                }
            } else if (computed.kind === 'matched_superseded') {
                matchedSuperseded += 1;
                summary.matchedSuperseded += 1;
                if (summary.examples.matched_superseded.length < 6) {
                    summary.examples.matched_superseded.push({
                        engine: engineFile,
                        rowIndex,
                        id: text(row?.ID),
                        pn,
                        sust_new_part_number: computed.fields.sust_new_part_number
                    });
                }
            } else {
                notFound += 1;
                summary.notFound += 1;
                if (summary.examples.not_found.length < 6) {
                    summary.examples.not_found.push({
                        engine: engineFile,
                        rowIndex,
                        id: text(row?.ID),
                        pn
                    });
                }
            }

            const before = {
                sust_status: row?.sust_status,
                sust_hierarchie: row?.sust_hierarchie,
                sust_new_part_number: row?.sust_new_part_number,
                sust_superseded_list: row?.sust_superseded_list
            };

            const changed = applySustFields(row, computed.fields);
            if (changed) {
                changedRows += 1;
                summary.changedRows += 1;
                if (summary.examples.changed.length < 10) {
                    summary.examples.changed.push({
                        engine: engineFile,
                        rowIndex,
                        id: text(row?.ID),
                        pn,
                        before,
                        after: computed.fields
                    });
                }
            }
        }

        let backupFile = null;
        const wroteFile = Boolean(options.write && changedRows > 0);
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
            matched_new: matchedNew,
            matched_superseded: matchedSuperseded,
            not_found: notFound,
            changed_rows: changedRows,
            wrote_file: wroteFile,
            backup: backupFile
        });
    }

    return summary;
}

function printSummary(summary) {
    console.log('=== UPDATE SUST FROM EXCEL_SUSTITUCION ===');
    console.log(`Modo: ${summary.mode}`);
    console.log(`Fuente SUST: ${summary.sustSource}`);
    console.log(`Engines procesados: ${summary.enginesProcesados}`);
    console.log(`Registros escaneados: ${summary.registrosEscaneados}`);
    console.log(`matched_new: ${summary.matchedNew}`);
    console.log(`matched_superseded: ${summary.matchedSuperseded}`);
    console.log(`not_found: ${summary.notFound}`);
    console.log(`changed_rows: ${summary.changedRows}`);
    console.log(`backup creado: ${summary.backupsCreated}`);
    console.log('');
    console.log('Ejemplos de cambios:');
    console.log(JSON.stringify(summary.examples.changed.slice(0, 5), null, 2));
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

    const summary = runUpdateSust({
        engine: args.engine,
        all: args.all,
        sustPath: args.sust,
        write: args.write,
        backup: args.backup,
        rootDir: path.join(__dirname, '..')
    });

    printSummary(summary);
}

module.exports = {
    runUpdateSust,
    normalizeEngineToken
};

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error('UPDATE_SUST_FIELDS_FAILED:', String(error?.message || error));
        process.exit(1);
    }
}
