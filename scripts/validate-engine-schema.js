'use strict';
/**
 * scripts/validate-engine-schema.js
 * Validador ligero de engine_*.json contra schemas/engine-record.schema.json
 *
 * Uso:
 *   node scripts/validate-engine-schema.js                  # valida todos los engines
 *   node scripts/validate-engine-schema.js engine_12V4000M40A.json
 *   node scripts/validate-engine-schema.js --summary        # solo resumen, sin detalle de filas
 *
 * No usa dependencias externas. Implementa un subconjunto de JSON Schema draft-07
 * suficiente para validar los campos de engine-record.schema.json.
 *
 * Salida: exit 0 si todo OK, exit 1 si hay errores críticos.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'schemas', 'engine-record.schema.json');
const ENGINE_FILES = [
    'engine_12V4000M40A.json',
    'engine_12V4000M53.json',
    'engine_12V4000M70.json',
    'engine_16V4000M61.json',
    'engine_16V4000M73.json',
    'engine_16V4000M73L.json',
    'engine_16V4000M90.json',
    'engine_20V4000M93.json',
    'engine_20V4000M93L.json',
];

// ---------------------------------------------------------------------------
// Mini-validador (subconjunto draft-07 sin ajv)
// ---------------------------------------------------------------------------

/**
 * Valida un valor contra una definición de propiedad del esquema.
 * Devuelve array de strings con los errores encontrados (vacío = OK).
 *
 * Soporta:
 *   - type: string | integer | number | boolean | null | array | object
 *   - oneOf: [ { type }, ... ]
 *   - enum: [ ... ]
 *   - minimum / maximum (number)
 *   - pattern (string)
 *   - format: "date-time" (loose check)
 */
function validateValue(fieldName, value, propSchema) {
    const errors = [];

    if (propSchema.oneOf) {
        // value must match at least one sub-schema
        const matched = propSchema.oneOf.some((sub) => validateValue(fieldName, value, sub).length === 0);
        if (!matched) {
            const allowed = propSchema.oneOf.map((s) => s.type || JSON.stringify(s)).join(' | ');
            errors.push(`[${fieldName}] valor ${JSON.stringify(value)} no coincide con ningún tipo permitido (${allowed})`);
        }
        return errors;
    }

    const typeCheck = checkType(value, propSchema.type);
    if (!typeCheck) {
        errors.push(`[${fieldName}] tipo incorrecto: esperado '${propSchema.type}', recibido '${getType(value)}'`);
        return errors; // no continuar si el tipo base falla
    }

    if (propSchema.enum !== undefined) {
        if (!propSchema.enum.includes(value)) {
            errors.push(`[${fieldName}] valor ${JSON.stringify(value)} no está en enum [${propSchema.enum.map((v) => JSON.stringify(v)).join(', ')}]`);
        }
    }

    if (propSchema.minimum !== undefined && typeof value === 'number' && value < propSchema.minimum) {
        errors.push(`[${fieldName}] valor ${value} < mínimo ${propSchema.minimum}`);
    }

    if (propSchema.maximum !== undefined && typeof value === 'number' && value > propSchema.maximum) {
        errors.push(`[${fieldName}] valor ${value} > máximo ${propSchema.maximum}`);
    }

    if (propSchema.pattern && typeof value === 'string') {
        const re = new RegExp(propSchema.pattern);
        if (!re.test(value)) {
            errors.push(`[${fieldName}] valor ${JSON.stringify(value)} no cumple patrón /${propSchema.pattern}/`);
        }
    }

    if (propSchema.format === 'date-time' && typeof value === 'string') {
        // loose ISO 8601 check
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
            errors.push(`[${fieldName}] valor ${JSON.stringify(value)} no parece ISO 8601 date-time`);
        }
    }

    return errors;
}

function getType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function checkType(value, expectedType) {
    if (!expectedType) return true;
    const t = getType(value);
    if (expectedType === 'integer') return t === 'number' && Number.isInteger(value);
    return t === expectedType;
}

/**
 * Valida un registro completo contra el esquema.
 * Devuelve lista de mensajes de error.
 */
function validateRecord(record, schema) {
    const errors = [];

    // Required fields
    for (const req of (schema.required || [])) {
        if (!(req in record)) {
            errors.push(`[${req}] campo requerido ausente`);
        }
    }

    // Property validation
    for (const [fieldName, propSchema] of Object.entries(schema.properties || {})) {
        if (!(fieldName in record)) continue; // optional — ausencia permitida
        const fieldErrors = validateValue(fieldName, record[fieldName], propSchema);
        errors.push(...fieldErrors);
    }

    return errors;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run() {
    const args = process.argv.slice(2);
    const summaryOnly = args.includes('--summary');
    const fileArgs = args.filter((a) => !a.startsWith('--'));

    // Load schema
    let schema;
    try {
        schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    } catch (err) {
        console.error(`ERROR cargando esquema: ${err.message}`);
        process.exit(1);
    }

    const filesToValidate = fileArgs.length > 0
        ? fileArgs.map((f) => path.isAbsolute(f) ? f : path.join(REPO_ROOT, f))
        : ENGINE_FILES.map((f) => path.join(REPO_ROOT, f));

    let globalErrors = 0;
    let globalRecords = 0;
    let globalFiles = 0;

    for (const filePath of filesToValidate) {
        const fileName = path.basename(filePath);
        if (!fs.existsSync(filePath)) {
            console.warn(`WARN fichero no encontrado: ${filePath}`);
            continue;
        }

        let records;
        try {
            records = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
            console.error(`ERROR parseando ${fileName}: ${err.message}`);
            globalErrors++;
            continue;
        }

        if (!Array.isArray(records)) {
            console.error(`ERROR ${fileName}: se esperaba array de registros`);
            globalErrors++;
            continue;
        }

        let fileErrors = 0;
        let fileRecordErrors = 0;

        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const errs = validateRecord(record, schema);
            if (errs.length > 0) {
                fileRecordErrors++;
                globalErrors += errs.length;
                if (!summaryOnly) {
                    const id = record.ID ?? `idx=${i}`;
                    console.log(`  ${fileName} #${id}:`);
                    for (const e of errs) console.log(`    - ${e}`);
                }
            }
        }

        globalRecords += records.length;
        globalFiles++;

        const status = fileRecordErrors === 0 ? 'OK' : `${fileRecordErrors} registros con errores`;
        console.log(`${fileRecordErrors === 0 ? '✓' : '✗'} ${fileName.padEnd(30)} ${records.length.toString().padStart(6)} registros  ${status}`);
        fileErrors += fileRecordErrors;
    }

    console.log('');
    console.log(`─────────────────────────────────────────────────────────────`);
    console.log(`Ficheros:  ${globalFiles}  |  Registros totales: ${globalRecords}  |  Errores schema: ${globalErrors}`);

    if (globalErrors > 0) {
        console.log('RESULTADO: FAIL');
        process.exit(1);
    } else {
        console.log('RESULTADO: OK');
        process.exit(0);
    }
}

run();
