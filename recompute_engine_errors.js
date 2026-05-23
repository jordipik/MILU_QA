#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('./engine_files');

const FIELD_TO_ERROR_KEY = {
    'POS': 'pos_error',
    'PART NO.': 'pn_error',
    'DESIGNATION': 'designation_error',
    'MODEL/TYPE': 'model_type_error',
    'QTY': 'qty_error',
    'UNITS': 'units_error',
    'WEIGHT': 'weight_error',
    'FN': 'fn_error',
    'MEASUREMENT / STANDARD': 'measure_error',
    'FG/FGS': 'fg_fgs_error',
    'BOM-No.': 'bom_error',
    'NORMA': 'norma_error'
};

const ERROR_KEY_TO_FIELD = Object.fromEntries(
    Object.entries(FIELD_TO_ERROR_KEY).map(([field, errorKey]) => [errorKey, field])
);

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
    return String(value ?? '');
}

function isCompareMatch(left, right) {
    const normalizedLeft = normalizeCompareValue(left);
    const normalizedRight = normalizeCompareValue(right);
    return normalizedLeft !== '' && normalizedRight !== '' && normalizedLeft === normalizedRight;
}

function normalizeTokenSet(value) {
    const normalized = normalizeCompareValue(value).toUpperCase();
    if (!normalized) return new Set();
    return new Set(
        normalized
            .split(/[^A-Z0-9]+/)
            .map((token) => token.trim())
            .filter(Boolean)
    );
}

function isFnCompareMatch(left, right) {
    if (isCompareMatch(left, right)) return true;

    const leftTokens = normalizeTokenSet(left);
    const rightTokens = normalizeTokenSet(right);
    if (!leftTokens.size || !rightTokens.size) return false;

    const leftInRight = [...leftTokens].every((token) => rightTokens.has(token));
    const rightInLeft = [...rightTokens].every((token) => leftTokens.has(token));
    return leftInRight || rightInLeft;
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
        'MODEL/TYPE': {
            final: row?.model_type_final ?? row?.model_final,
            pdf: row?.model_type_pdf ?? row?.['MODEL/TYPE'],
            gesa: null
        },
        'QTY': {
            final: row?.qty_final,
            pdf: row?.qty_pdf ?? row?.QTY,
            gesa: null
        },
        'UNITS': {
            final: row?.units_final,
            pdf: row?.units_pdf ?? row?.UNITS,
            gesa: null
        },
        'WEIGHT': {
            final: row?.weight_final,
            pdf: row?.weight_pdf ?? row?.WEIGHT,
            gesa: getGesaWeightWithUnits(row),
            gesaRaw: row?.weight_gesa
        },
        'FN': {
            final: row?.fn_final,
            pdf: row?.fn_pdf ?? row?.FN,
            gesa: null
        },
        'MEASUREMENT / STANDARD': {
            final: row?.measure_final ?? row?.measurement_final,
            pdf: row?.measure_pdf ?? row?.['MEASUREMENT / STANDARD'],
            gesa: row?.dimensions_gesa ?? row?.measure_gesa
        },
        'FG/FGS': {
            final: row?.fg_fgs_final,
            pdf: row?.fg_fgs_pdf ?? row?.['FG/FGS'],
            gesa: null
        },
        'BOM-No.': {
            final: row?.bom_final ?? row?.['BOM-No.'],
            pdf: row?.bom_pdf ?? row?.['BOM-No.'],
            gesa: null
        },
        'NORMA': {
            final: row?.norma_final ?? row?.norma,
            pdf: row?.norma_pdf ?? row?.norma_raw ?? row?.norma,
            gesa: row?.norma_gesa ?? row?.norma
        }
    };
}

const QA_FIELD_CHECKS = {
    'POS': [
        (entry) => normalizeCompareValue(entry?.final) !== '',
        (entry) => {
            const pdfValue = normalizeCompareValue(entry?.pdf);
            if (pdfValue === '') return true;
            return isCompareMatch(entry?.final, entry?.pdf);
        }
    ],
    'PART NO.': [
        (entry) => normalizeCompareValue(entry?.final) !== '',
        (entry) => {
            const pdfValue = normalizeCompareValue(entry?.pdf);
            if (pdfValue === '') return true;
            return isCompareMatch(entry?.final, entry?.pdf);
        }
    ],
    'DESIGNATION': [
        (entry) => normalizeCompareValue(entry?.final) !== '',
        (entry) => {
            const pdfValue = normalizeCompareValue(entry?.pdf);
            const gesaValue = normalizeCompareValue(entry?.gesa);
            if (pdfValue === '' && gesaValue === '') return true;
            return isCompareMatch(entry?.final, entry?.pdf)
                || isCompareMatch(entry?.final, entry?.gesa);
        }
    ],
    'MODEL/TYPE': [
        (entry) => {
            const finalValue = normalizeCompareValue(entry?.final);
            const pdfValue = normalizeCompareValue(entry?.pdf);
            if (!finalValue && !pdfValue) return true;
            if (pdfValue !== '') return isCompareMatch(entry?.final, entry?.pdf);
            return true;
        }
    ],
    'QTY': [
        (entry) => {
            const finalValue = normalizeCompareValue(entry?.final);
            const pdfValue = normalizeCompareValue(entry?.pdf);
            if (!finalValue && !pdfValue) return true;
            if (pdfValue !== '') return isCompareMatch(entry?.final, entry?.pdf);
            return true;
        }
    ],
    'UNITS': [
        (entry) => {
            const finalValue = normalizeCompareValue(entry?.final);
            const pdfValue = normalizeCompareValue(entry?.pdf);
            if (!finalValue && !pdfValue) return true;
            if (pdfValue !== '') return isCompareMatch(entry?.final, entry?.pdf);
            return true;
        }
    ],
    'WEIGHT': [
        (entry) => {
            const finalValue = normalizeCompareValue(entry?.final);
            const pdfValue = normalizeCompareValue(entry?.pdf);
            const gesaValue = normalizeCompareValue(entry?.gesa);
            const gesaRawValue = normalizeCompareValue(entry?.gesaRaw);
            if (!finalValue && !pdfValue && !gesaValue && !gesaRawValue) return true;
            return isCompareMatch(entry?.final, entry?.pdf)
                || isCompareMatch(entry?.final, entry?.gesa)
                || isCompareMatch(entry?.final, entry?.gesaRaw);
        }
    ],
    'FN': [
        (entry) => {
            const finalValue = normalizeCompareValue(entry?.final);
            const pdfValue = normalizeCompareValue(entry?.pdf);
            if (!finalValue && !pdfValue) return true;
            if (pdfValue !== '') return isFnCompareMatch(entry?.final, entry?.pdf);
            return true;
        }
    ],
    'MEASUREMENT / STANDARD': [
        (entry) => {
            const finalValue = normalizeCompareValue(entry?.final);
            const pdfValue = normalizeCompareValue(entry?.pdf);
            const gesaValue = normalizeCompareValue(entry?.gesa);
            if (!finalValue && !pdfValue && !gesaValue) return true;
            return isCompareMatch(entry?.final, entry?.pdf)
                || isCompareMatch(entry?.final, entry?.gesa);
        }
    ],
    'FG/FGS': [
        (entry) => {
            const finalValue = normalizeCompareValue(entry?.final);
            const pdfValue = normalizeCompareValue(entry?.pdf);
            if (!finalValue && !pdfValue) return true;
            if (pdfValue !== '') return isCompareMatch(entry?.final, entry?.pdf);
            return true;
        }
    ],
    'BOM-No.': [
        (entry) => {
            const finalValue = normalizeCompareValue(entry?.final);
            const pdfValue = normalizeCompareValue(entry?.pdf);
            if (!finalValue && !pdfValue) return true;
            if (pdfValue !== '') return isCompareMatch(entry?.final, entry?.pdf);
            return true;
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

    // Siempre recalcular QA real para reflejar discrepancias actuales.
    // El estado manual se respeta mas abajo al decidir qa_revision_* cuando updateRevision=true.
    const errorPayload = computeErrorPayload(row);
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

function createAggregateSummary() {
    return {
        booksProcessed: 0,
        recordsProcessed: 0,
        recordsWithErrors: 0,
        errorsFound: 0,
        warningsFound: 0,
        changedRows: 0,
        wroteFiles: 0,
        errorTypes: {},
        warningTypes: {}
    };
}

function mergeBookResultIntoSummary(summary, bookResult) {
    summary.booksProcessed += 1;
    summary.recordsProcessed += Number(bookResult?.scanned) || 0;
    summary.recordsWithErrors += Number(bookResult?.koRows) || 0;
    summary.changedRows += Number(bookResult?.changedRows) || 0;
    summary.wroteFiles += bookResult?.wroteFile ? 1 : 0;

    const errorTypeCounts = bookResult?.errorTypeCounts;
    if (errorTypeCounts && typeof errorTypeCounts === 'object') {
        Object.entries(errorTypeCounts).forEach(([errorKey, count]) => {
            const safeCount = Number(count) || 0;
            if (safeCount <= 0) return;
            summary.errorTypes[errorKey] = (summary.errorTypes[errorKey] || 0) + safeCount;
            summary.errorsFound += safeCount;
        });
    }

    return summary;
}

function buildRuleSummaryMap(counterMap) {
    return Object.entries(counterMap || {})
        .map(([errorKey, count]) => ({
            code: errorKey,
            label: ERROR_KEY_TO_FIELD[errorKey] || errorKey,
            count: Number(count) || 0,
            severity: 'error'
        }))
        .filter((item) => item.count > 0)
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function recomputeAllEngineErrors(optionsInput = {}) {
    const options = {
        id: String(optionsInput.id ?? '').trim(),
        dryRun: Boolean(optionsInput.dryRun),
        updateRevision: optionsInput.updateRevision === true,
        forceRevision: optionsInput.forceRevision === true,
        backup: optionsInput.backup !== false,
        rootDir: String(optionsInput.rootDir ?? __dirname).trim() || __dirname
    };

    if (options.id) {
        throw new Error('El alcance global no admite ID puntual. Usa scope=current o scope=book.');
    }

    const startedAt = new Date().toISOString();
    const summary = createAggregateSummary();
    const books = [];

    ENGINE_JSON_FILES.forEach((file) => {
        const result = recomputeEngineErrors({
            file,
            dryRun: options.dryRun,
            updateRevision: options.updateRevision,
            forceRevision: options.forceRevision,
            backup: options.backup,
            rootDir: options.rootDir
        });
        books.push(result);
        mergeBookResultIntoSummary(summary, result);
    });

    return {
        scope: 'all',
        mode: 'all-books',
        id: null,
        dryRun: options.dryRun,
        updateRevision: options.updateRevision,
        backup: options.backup,
        startedAt,
        finishedAt: new Date().toISOString(),
        books,
        booksProcessed: summary.booksProcessed,
        scanned: summary.recordsProcessed,
        changedRows: summary.changedRows,
        okRows: Math.max(summary.recordsProcessed - summary.recordsWithErrors, 0),
        koRows: summary.recordsWithErrors,
        wroteFile: summary.wroteFiles > 0,
        wroteFiles: summary.wroteFiles,
        errorsFound: summary.errorsFound,
        warningsFound: summary.warningsFound,
        errorTypeCounts: summary.errorTypes,
        warningTypeCounts: summary.warningTypes,
        ruleSummary: buildRuleSummaryMap(summary.errorTypes)
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
    const errorTypeCounts = {};

    targetRows.forEach((row) => {
        const result = applyToRow(row, options);
        scanned += 1;
        if (result.changed) changedRows += 1;
        if (result.totalError > 0) koRows += 1;
        else okRows += 1;
        Object.values(FIELD_TO_ERROR_KEY).forEach((errorKey) => {
            const count = Number(row?.[errorKey]) || 0;
            if (count > 0) errorTypeCounts[errorKey] = (errorTypeCounts[errorKey] || 0) + count;
        });
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
        wroteFile: !options.dryRun && changedRows > 0,
        errorsFound: Object.values(errorTypeCounts).reduce((total, count) => total + (Number(count) || 0), 0),
        warningsFound: 0,
        errorTypeCounts,
        warningTypeCounts: {},
        ruleSummary: buildRuleSummaryMap(errorTypeCounts)
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
    recomputeEngineErrors,
    recomputeAllEngineErrors
};
