'use strict';
/**
 * tests/smoke/engine-schema.test.js
 * Verifica que el esquema JSON formal carga correctamente y que al menos uno de
 * los engine_*.json reales cumple el esquema sin errores.
 *
 * Usa node:test (sin dependencias externas).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'schemas', 'engine-record.schema.json');
const VALIDATOR_PATH = path.join(REPO_ROOT, 'scripts', 'validate-engine-schema.js');

// ---------------------------------------------------------------------------
// Helpers (duplicado mínimo del validador para no requerir importación de módulo)
// ---------------------------------------------------------------------------

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

function validateValue(fieldName, value, propSchema) {
    const errors = [];
    if (propSchema.oneOf) {
        const matched = propSchema.oneOf.some((sub) => validateValue(fieldName, value, sub).length === 0);
        if (!matched) {
            const allowed = propSchema.oneOf.map((s) => s.type || JSON.stringify(s)).join(' | ');
            errors.push(`[${fieldName}] valor ${JSON.stringify(value)} no coincide con ningún tipo (${allowed})`);
        }
        return errors;
    }
    if (!checkType(value, propSchema.type)) {
        errors.push(`[${fieldName}] tipo incorrecto: esperado '${propSchema.type}', recibido '${getType(value)}'`);
        return errors;
    }
    if (propSchema.enum !== undefined && !propSchema.enum.includes(value)) {
        errors.push(`[${fieldName}] valor ${JSON.stringify(value)} no está en enum`);
    }
    if (propSchema.minimum !== undefined && typeof value === 'number' && value < propSchema.minimum) {
        errors.push(`[${fieldName}] valor ${value} < mínimo ${propSchema.minimum}`);
    }
    return errors;
}

function validateRecord(record, schema) {
    const errors = [];
    for (const req of (schema.required || [])) {
        if (!(req in record)) errors.push(`[${req}] campo requerido ausente`);
    }
    for (const [fieldName, propSchema] of Object.entries(schema.properties || {})) {
        if (!(fieldName in record)) continue;
        errors.push(...validateValue(fieldName, record[fieldName], propSchema));
    }
    return errors;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DT-2: engine-record JSON schema', () => {

    it('el fichero schemas/engine-record.schema.json existe', () => {
        assert.ok(fs.existsSync(SCHEMA_PATH), `Esquema no encontrado en ${SCHEMA_PATH}`);
    });

    it('el esquema es JSON válido con $schema, title y required', () => {
        const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
        const schema = JSON.parse(raw); // lanza si no es JSON válido
        assert.ok(schema.$schema, 'Falta campo $schema');
        assert.ok(schema.title, 'Falta campo title');
        assert.ok(Array.isArray(schema.required) && schema.required.length > 0, 'required debe ser array no vacío');
        assert.ok(typeof schema.properties === 'object', 'Falta campo properties');
    });

    it('el esquema define los campos required mínimos esperados', () => {
        const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
        const expected = ['ID', 'engine_model', 'has_error', 'total_error', 'qa_revision_estado', 'qa_revision_accion'];
        for (const f of expected) {
            assert.ok(schema.required.includes(f), `Campo required '${f}' no está en el esquema`);
        }
    });

    it('el validador scripts/validate-engine-schema.js existe', () => {
        assert.ok(fs.existsSync(VALIDATOR_PATH), `Validador no encontrado en ${VALIDATOR_PATH}`);
    });

    it('engine_12V4000M40A.json cumple el esquema (0 errores)', () => {
        const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
        const enginePath = path.join(REPO_ROOT, 'engine_12V4000M40A.json');
        if (!fs.existsSync(enginePath)) {
            // skip en entornos CI sin engines
            return;
        }
        const records = JSON.parse(fs.readFileSync(enginePath, 'utf8'));
        assert.ok(Array.isArray(records) && records.length > 0, 'El engine debe ser un array no vacío');

        let totalErrors = 0;
        for (const record of records) {
            const errs = validateRecord(record, schema);
            totalErrors += errs.length;
        }
        assert.strictEqual(totalErrors, 0, `${totalErrors} errores de esquema en engine_12V4000M40A.json`);
    });

    it('un registro con campos required ausentes falla la validación', () => {
        const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
        // Registro intencionalmente incompleto (falta ID y engine_model)
        const bad = {
            has_error: false,
            total_error: 0,
            qa_revision_estado: 'ok',
            qa_revision_accion: 'importar',
        };
        const errs = validateRecord(bad, schema);
        assert.ok(errs.length > 0, 'Se esperaban errores en registro incompleto');
        const missing = errs.filter((e) => e.includes('campo requerido ausente'));
        assert.ok(missing.some((e) => e.includes('ID')), 'Debe reportar ID ausente');
        assert.ok(missing.some((e) => e.includes('engine_model')), 'Debe reportar engine_model ausente');
    });

    it('un registro con qa_revision_estado inválido falla la validación', () => {
        const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
        const bad = {
            ID: '999',
            engine_model: '12V4000M40A',
            has_error: false,
            total_error: 0,
            qa_revision_estado: 'invalido_valor',
            qa_revision_accion: 'importar',
        };
        const errs = validateRecord(bad, schema);
        assert.ok(errs.some((e) => e.includes('qa_revision_estado')), 'Debe reportar error en qa_revision_estado');
    });

    it('un registro completo válido pasa la validación', () => {
        const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
        const good = schema.examples?.[0];
        if (!good) return; // skip si no hay examples
        const errs = validateRecord(good, schema);
        assert.strictEqual(errs.length, 0, `Ejemplo del esquema no pasa validación: ${errs.join(', ')}`);
    });

});
