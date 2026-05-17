#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('./engine_files');

const FIELD_TO_ERROR_KEY = {
    'POS': 'pos_error',
    'PART NO.': 'pn_error',
    'DESIGNATION': 'designation_error',
    'WEIGHT': 'weight_error',
    'MEASUREMENT / STANDARD': 'measurement_error',
    'NORMA': 'norma_error',
    'BOM-No.': 'bom_error'
};

function printUsage() {
    console.log('Uso:');
    console.log('  node recompute_engine_errors.js --file=<engine_file.json> [--id=<ID>] [--dry-run] [--update-revision] [--no-backup]');
    console.log('');
    console.log('Ejemplos:');
    console.log('  node recompute_engine_errors.js --file=engine_12V4000M40A.json --id=12345');
    console.log('  node recompute_engine_errors.js --file=engine_12V4000M40A.json');
    console.log('  node recompute_engine_errors.js --file=engine_16V4000M73.json --dry-run');
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const out = {
        file: '',
        id: '',
        dryRun: false,
        updateRevision: false,
        backup: true
    };

    for (const arg of args) {
        if (arg === '--dry-run') {
            out.dryRun = true;
            continue;
        }
        if (arg === '--no-revision') {
            out.updateRevision = false;
            continue;
        }
        if (arg === '--update-revision') {
            out.updateRevision = true;
            continue;
        }
        if (arg === '--no-backup') {
            out.backup = false;
            continue;
        }
        if (arg.startsWith('--file=')) {
            out.file = arg.slice('--file='.length).trim();
            continue;
        }
        if (arg.startsWith('--id=')) {
            out.id = arg.slice('--id='.length).trim();
            continue;
        }
    }

    return out;
}

function text(value) {
    return String(value ?? '').trim();
}

function normalizeCompareValue(value) {
    return text(value)
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function isCompareMatch(left, right) {
    const normalizedLeft = normalizeCompareValue(left);
    const normalizedRight = normalizeCompareValue(right);
    return normalizedLeft !== '' && normalizedRight !== '' && normalizedLeft === normalizedRight;
}

function getGesaPn(row) {
    const isGesaSi = text(row?.gesa).toUpperCase() === 'SI';
    if (!isGesaSi) return null;
    return text(row?.pn_final) || null;
}

function getGesaWeightWithUnits(row) {
    const weight = text(row?.weight_gesa);
    const units = text(row?.units);
    if (weight && units) return `${weight} ${units}`;
    if (weight) return weight;
    return null;
}

function getEntryMap(row) {
    return {
        'POS': {
            final: row?.pos_final,
            pdf: row?.pos_pdf ?? row?.POS,
            gesa: null
        },
        'PART NO.': {
            final: row?.pn_final,
            pdf: row?.pn_pdf ?? row?.['PART NO.'],
            gesa: null
        },
        'DESIGNATION': {
            final: row?.designation_final,
            pdf: row?.designation_pdf ?? row?.DESIGNATION,
            gesa: row?.designation_gesa
        },
        'WEIGHT': {
            final: row?.weight_final,
            pdf: row?.weight_pdf ?? row?.WEIGHT,
            gesa: getGesaWeightWithUnits(row)
        },
        'MEASUREMENT / STANDARD': {
            final: row?.measure_final ?? row?.measurement_final,
            pdf: row?.measure_pdf ?? row?.['MEASUREMENT / STANDARD'],
            gesa: row?.dimensions_gesa ?? row?.measure_gesa
        },
        'NORMA': {
            final: row?.norma_final ?? row?.norma,
            pdf: row?.norma_pdf ?? row?.norma_raw ?? row?.norma,
            gesa: row?.norma_gesa ?? row?.norma
        },
        'BOM-No.': {
            final: row?.['BOM-No.'],
            pdf: row?.bom_pdf,
            gesa: null
        }
    };
}

const QA_FIELD_CHECKS = {
    'POS': [
        (entry) => normalizeCompareValue(entry?.final) !== '',
        (entry) => isCompareMatch(entry?.final, entry?.pdf)
    ],
    'PART NO.': [
        (entry) => normalizeCompareValue(entry?.final) !== '',
        (entry) => isCompareMatch(entry?.final, entry?.pdf)
    ],
    'DESIGNATION': [
        (entry) => normalizeCompareValue(entry?.final) !== '',
        (entry) => isCompareMatch(entry?.final, entry?.pdf) || isCompareMatch(entry?.final, entry?.gesa)
    ],
    'WEIGHT': [
        (entry) => {
            const finalValue = normalizeCompareValue(entry?.final);
            const pdfValue = normalizeCompareValue(entry?.pdf);
            const gesaValue = normalizeCompareValue(entry?.gesa);
            if (!finalValue && !pdfValue && !gesaValue) return true;
            return isCompareMatch(entry?.final, entry?.pdf) || isCompareMatch(entry?.final, entry?.gesa);
        }
    ],
    'MEASUREMENT / STANDARD': [
        (entry) => {
            const finalValue = normalizeCompareValue(entry?.final);
            const pdfValue = normalizeCompareValue(entry?.pdf);
            const gesaValue = normalizeCompareValue(entry?.gesa);
            if (!finalValue && !pdfValue && !gesaValue) return true;
            return isCompareMatch(entry?.final, entry?.pdf) || isCompareMatch(entry?.final, entry?.gesa);
        }
    ],
    'NORMA': [
        (entry) => {
            const finalValue = normalizeCompareValue(entry?.final);
            const pdfValue = normalizeCompareValue(entry?.pdf);
            const gesaValue = normalizeCompareValue(entry?.gesa);
            if (!finalValue && !pdfValue && !gesaValue) return true;
            return isCompareMatch(entry?.final, entry?.pdf) || isCompareMatch(entry?.final, entry?.gesa);
        }
    ],
    'BOM-No.': [
        (entry) => normalizeCompareValue(entry?.pdf) === '' || isCompareMatch(entry?.final, entry?.pdf)
    ]
};

function computeErrorPayload(row) {
    const entryMap = getEntryMap(row);
    const payload = {};
    let total = 0;

    Object.entries(FIELD_TO_ERROR_KEY).forEach(([field, errorKey]) => {
        const checks = QA_FIELD_CHECKS[field] || [];
        const entry = entryMap[field] || {};
        const failedChecks = checks.reduce((count, checkFn) => count + (checkFn(entry) ? 0 : 1), 0);
        payload[errorKey] = failedChecks;
        total += failedChecks;
    });

    payload.total_error = total;
    return payload;
}

function stripLegacyQaFields(value) {
    if (Array.isArray(value)) {
        value.forEach(stripLegacyQaFields);
        return value;
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    delete value.qa_errors;
    delete value.qa_errors_active;

    Object.values(value).forEach(stripLegacyQaFields);
    return value;
}

function assignIfChanged(target, key, nextValue) {
    const current = target?.[key];
    if (String(current ?? '') === String(nextValue ?? '')) return false;
    target[key] = nextValue;
    return true;
}

function applyToRow(row, options) {
    let changed = false;

    const currentEstado = String(row?.qa_revision_estado || '').trim().toLowerCase();
    const currentAccion = String(row?.qa_revision_accion || '').trim().toLowerCase();
    // Solo tratamos como resuelto cuando estado y accion son coherentes de cierre.
    // Antes se usaba OR y acababa evitando el recálculo real en demasiados registros.
    const isResolved = currentEstado === 'ok'
        && (currentAccion === 'importar' || currentAccion === 'eliminar' || currentAccion === 'copia');

    let errorPayload;
    if (isResolved) {
        errorPayload = {};
        Object.values(FIELD_TO_ERROR_KEY).forEach(key => { errorPayload[key] = 0; });
        errorPayload.total_error = 0;
    } else {
        errorPayload = computeErrorPayload(row);
    }
    const hasErrors = Number(errorPayload.total_error) > 0;
    Object.entries(errorPayload).forEach(([key, value]) => {
        if (assignIfChanged(row, key, value)) changed = true;
    });
    if (assignIfChanged(row, 'has_error', hasErrors)) changed = true;

    if (options.updateRevision) {
        const isNoiseFooter = String(row?.criterio_pn || '').trim() === 'C_NOISE_FOOTER'
            || String(row?.status || '').trim().toUpperCase() === 'NOISE';
        if (isNoiseFooter) {
            // Registros footer/ruido: siempre marcar OK/Eliminar (salvo que ya esté ok/eliminar y no se fuerza)
            const currentEstado = String(row?.qa_revision_estado || '').trim().toLowerCase();
            const currentAccion = String(row?.qa_revision_accion || '').trim().toLowerCase();
            const alreadySet = currentEstado === 'ok' && currentAccion === 'eliminar';
            if (!alreadySet || options.forceRevision) {
                if (assignIfChanged(row, 'qa_revision_estado', 'ok')) changed = true;
                if (assignIfChanged(row, 'qa_revision_accion', 'eliminar')) changed = true;
            }
        } else if (hasErrors) {
            // Si ya fue revisado manualmente como 'ok', respetar esa decisión (salvo forceRevision)
            const currentEstado = String(row?.qa_revision_estado || '').trim().toLowerCase();
            const isManuallyOk = currentEstado === 'ok' || currentEstado === 'revisado';
            if (!isManuallyOk || options.forceRevision) {
                if (assignIfChanged(row, 'qa_revision_estado', 'pendiente')) changed = true;
                if (assignIfChanged(row, 'qa_revision_accion', 'revisar')) changed = true;
            }
        } else {
            if (assignIfChanged(row, 'qa_revision_estado', 'ok')) changed = true;
            if (assignIfChanged(row, 'qa_revision_accion', 'importar')) changed = true;
        }
    }

    return {
        changed,
        totalError: Number(errorPayload.total_error) || 0
    };
}

function recomputeEngineErrors(optionsInput = {}) {
    const options = {
        file: String(optionsInput.file ?? '').trim(),
        id: String(optionsInput.id ?? '').trim(),
        dryRun: Boolean(optionsInput.dryRun),
        updateRevision: optionsInput.updateRevision === true,
        forceRevision: optionsInput.forceRevision === true,
        backup: optionsInput.backup !== false,
        rootDir: String(optionsInput.rootDir ?? __dirname).trim() || __dirname
    };

    if (!options.file) {
        throw new Error('Falta parametro requerido: file');
    }

    if (!ENGINE_JSON_FILES.includes(options.file)) {
        throw new Error(`Archivo no permitido (${options.file}). Permitidos: ${ENGINE_JSON_FILES.join(', ')}`);
    }

    const filePath = path.join(options.rootDir, options.file);
    if (!fs.existsSync(filePath)) {
        throw new Error(`No existe el archivo ${filePath}`);
    }

    let rows;
    try {
        rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        throw new Error(`Error leyendo/parsing ${options.file}: ${error.message}`);
    }

    if (!Array.isArray(rows)) {
        throw new Error(`${options.file} no contiene un array JSON.`);
    }

    const targetRows = options.id
        ? rows.filter((row) => String(row?.ID ?? '').trim() === options.id)
        : rows;

    if (options.id && targetRows.length === 0) {
        throw new Error(`No se encontro ningun registro con ID=${options.id} en ${options.file}`);
    }

    let scanned = 0;
    let changedRows = 0;
    let koRows = 0;
    let okRows = 0;

    targetRows.forEach((row) => {
        const result = applyToRow(row, options);
        scanned += 1;
        if (result.changed) changedRows += 1;
        if (result.totalError > 0) koRows += 1;
        else okRows += 1;
    });

    stripLegacyQaFields(rows);

    if (!options.dryRun && changedRows > 0) {
        if (options.backup) {
            fs.copyFileSync(filePath, `${filePath}.backup`);
        }
        fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
    }

    return {
        file: options.file,
        mode: options.id ? 'single-id' : 'full-book',
        id: options.id || null,
        dryRun: options.dryRun,
        updateRevision: options.updateRevision,
        scanned,
        changedRows,
        okRows,
        koRows,
        wroteFile: !options.dryRun && changedRows > 0
    };
}

function main() {
    const options = parseArgs(process.argv);
    if (!options.file) {
        printUsage();
        process.exit(1);
    }

    try {
        const result = recomputeEngineErrors(options);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error(String(error?.message || error));
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    recomputeEngineErrors
};
