#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');

function text(value) {
    return String(value == null ? '' : value).trim();
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

function engineTokenToFile(engineToken) {
    const normalized = normalizeEngineToken(engineToken);
    if (!normalized) {
        throw new Error('Falta parametro requerido: engine');
    }
    if (normalized === 'ALL') return 'ALL';

    const file = `engine_${normalized}.json`;
    if (!ENGINE_JSON_FILES.includes(file)) {
        throw new Error(`Engine no permitido (${engineToken}). Permitidos: ${ENGINE_JSON_FILES.join(', ')}, ALL`);
    }
    return file;
}

function normalizeFnIsKe(value) {
    return text(value).replace(/\s+/g, '').toUpperCase() === 'KE';
}

function rowHasErrors(row) {
    const totalError = Number(row?.total_error);
    if (Number.isFinite(totalError)) {
        return totalError > 0;
    }

    const hasError = row?.has_error;
    if (typeof hasError === 'boolean') return hasError;
    const normalized = text(hasError).toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'si';
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const out = {
        engine: '',
        id: '',
        backup: true,
        rootDir: __dirname
    };

    for (const arg of args) {
        if (arg === '--no-backup') {
            out.backup = false;
            continue;
        }
        if (arg.startsWith('--engine=')) {
            out.engine = text(arg.slice('--engine='.length));
            continue;
        }
        if (arg.startsWith('--id=')) {
            out.id = text(arg.slice('--id='.length));
            continue;
        }
        if (arg.startsWith('--root-dir=')) {
            out.rootDir = text(arg.slice('--root-dir='.length));
            continue;
        }
    }

    return out;
}

function printUsage() {
    console.log('Uso:');
    console.log('  node scripts/update_revision_states.js --engine=<12V4000M40A|ALL> [--id=<ID>] [--no-backup]');
    console.log('');
    console.log('Ejemplos:');
    console.log('  node scripts/update_revision_states.js --engine=12V4000M40A');
    console.log('  node scripts/update_revision_states.js --engine=12V4000M40A --id=12345');
    console.log('  node scripts/update_revision_states.js --engine=ALL');
}

function initSummary() {
    return {
        ok: true,
        enginesProcessed: 0,
        recordsProcessed: 0,
        updated: 0,
        importar: 0,
        eliminar: 0,
        revisar: 0,
        unchanged: 0,
        errors: []
    };
}

function updateRevisionStates(optionsInput = {}) {
    const options = {
        engine: text(optionsInput.engine || ''),
        id: text(optionsInput.id || ''),
        backup: optionsInput.backup !== false,
        rootDir: text(optionsInput.rootDir || path.join(__dirname, '..'))
    };

    const targetFileOrAll = engineTokenToFile(options.engine);
    if (targetFileOrAll === 'ALL' && options.id) {
        throw new Error('engine=ALL no admite filtro por ID.');
    }

    const filesToProcess = targetFileOrAll === 'ALL' ? ENGINE_JSON_FILES : [targetFileOrAll];
    const summary = initSummary();

    filesToProcess.forEach((engineFile) => {
        const filePath = path.join(options.rootDir, engineFile);

        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`No existe ${engineFile}`);
            }

            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (!Array.isArray(parsed)) {
                throw new Error(`${engineFile} no contiene un array JSON.`);
            }

            const rows = parsed;
            const targetRows = options.id
                ? rows.filter((row) => text(row?.ID) === options.id)
                : rows;

            if (options.id && targetRows.length === 0) {
                throw new Error(`No se encontro ningun registro con ID=${options.id} en ${engineFile}`);
            }

            summary.enginesProcessed += 1;
            summary.recordsProcessed += targetRows.length;

            let fileUpdated = false;

            targetRows.forEach((row) => {
                const isKe = normalizeFnIsKe(row?.fn_final);
                const hasErrors = rowHasErrors(row);

                let nextEstado = 'ok';
                let nextAccion = 'importar';

                if (isKe) {
                    nextEstado = 'ok';
                    nextAccion = 'eliminar';
                } else if (hasErrors) {
                    nextEstado = 'pendiente';
                    nextAccion = 'revisar';
                }

                if (nextAccion === 'importar') summary.importar += 1;
                if (nextAccion === 'eliminar') summary.eliminar += 1;
                if (nextAccion === 'revisar') summary.revisar += 1;

                const currentEstado = text(row?.qa_revision_estado).toLowerCase();
                const currentAccion = text(row?.qa_revision_accion).toLowerCase();
                const changed = currentEstado !== nextEstado || currentAccion !== nextAccion;

                if (changed) {
                    row.qa_revision_estado = nextEstado;
                    row.qa_revision_accion = nextAccion;
                    summary.updated += 1;
                    fileUpdated = true;
                } else {
                    summary.unchanged += 1;
                }
            });

            if (fileUpdated) {
                if (options.backup) {
                    const backupPath = `${filePath}.backup.${Date.now()}`;
                    fs.copyFileSync(filePath, backupPath);
                }
                fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
            }
        } catch (error) {
            summary.errors.push({
                engine: engineFile,
                message: String(error?.message || error)
            });
        }
    });

    if (summary.errors.length > 0) {
        summary.ok = false;
    }

    return summary;
}

function main() {
    const options = parseArgs(process.argv);
    if (!options.engine) {
        printUsage();
        process.exit(1);
    }

    try {
        const result = updateRevisionStates({
            engine: options.engine,
            id: options.id,
            backup: options.backup,
            rootDir: path.join(__dirname, '..')
        });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.ok ? 0 : 1);
    } catch (error) {
        console.error(String(error?.message || error));
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    updateRevisionStates,
    normalizeEngineToken
};
