'use strict';

const { validationError } = require('./payload-errors');
const { assertNonEmptyObject, assertPayloadSize, assertPlainObject, assertScalar, assertString, normalizeWhitespace } = require('./validators');
const { canonicalFieldName, isAllowedSaveJsonField, isProhibitedField } = require('./allowed-fields');

const REVISION_STATE_MAP = new Map([
    ['ok', 'ok'],
    ['pendiente', 'pendiente'],
    ['revisado', 'ok'],
    ['descartado', 'ok'],
    ['copia', 'pendiente'],
    ['en revision', 'pendiente'],
    ['en revisión', 'pendiente'],
]);

const REVISION_ACTION_MAP = new Map([
    ['importar', 'importar'],
    ['revisar', 'revisar'],
    ['eliminar', 'eliminar'],
    ['copia', 'copia'],
    ['descartar', 'eliminar'],
    ['mantener', 'importar'],
    ['actualizar', 'revisar'],
    ['sustituir', 'revisar'],
]);

function normalizeRevisionEstado(value, field = 'qa_revision_estado') {
    const raw = normalizeWhitespace(value).toLowerCase();
    if (!raw) {
        throw validationError({
            code: 'VALUE_REQUIRED',
            field,
            message: `${field} es obligatorio.`
        });
    }
    const normalized = REVISION_STATE_MAP.get(raw);
    if (!normalized) {
        throw validationError({
            code: 'INVALID_QA_REVISION_ESTADO',
            field,
            message: `${field} solo admite ok o pendiente.`
        });
    }
    return normalized;
}

function normalizeRevisionAccion(value, field = 'qa_revision_accion') {
    const raw = normalizeWhitespace(value).toLowerCase();
    if (!raw) {
        throw validationError({
            code: 'VALUE_REQUIRED',
            field,
            message: `${field} es obligatorio.`
        });
    }
    const normalized = REVISION_ACTION_MAP.get(raw);
    if (!normalized) {
        throw validationError({
            code: 'INVALID_QA_REVISION_ACCION',
            field,
            message: `${field} solo admite importar, revisar, eliminar o copia.`
        });
    }
    return normalized;
}

function normalizeSaveJsonFieldName(rawField) {
    const field = canonicalFieldName(rawField);
    if (!field) {
        throw validationError({
            code: 'FIELD_REQUIRED',
            field: 'field',
            message: 'field es obligatorio.'
        });
    }
    if (isProhibitedField(field)) {
        throw validationError({
            code: 'FIELD_NOT_ALLOWED',
            field,
            message: `Campo no permitido: ${field}`
        });
    }
    if (!isAllowedSaveJsonField(field)) {
        throw validationError({
            code: 'FIELD_NOT_ALLOWED',
            field,
            message: `Campo no permitido: ${field}`
        });
    }
    return field;
}

function normalizeSaveJsonValue(field, value) {
    assertScalar(value, field);

    if (field === 'qa_revision_estado') {
        return normalizeRevisionEstado(value, field);
    }

    if (field === 'qa_revision_accion') {
        return normalizeRevisionAccion(value, field);
    }

    if (field === 'measure_final') {
        return normalizeWhitespace(value);
    }

    if (field === 'exp_imagenes' || field === 'designation_final' || field === 'weight_final' || field === 'pn_final') {
        return normalizeWhitespace(value);
    }

    if (value == null) {
        return '';
    }

    return typeof value === 'string' ? value.trim() : value;
}

function validateSaveJsonPayload(payload) {
    assertNonEmptyObject(payload, 'payload');
    assertPayloadSize(payload, 16384, 'payload');

    const file = assertString(payload.file, { field: 'file', maxLength: 128 });
    const id = assertString(payload.id, { field: 'id', maxLength: 128 });
    const rawField = payload.field ?? payload.col;
    const field = normalizeSaveJsonFieldName(rawField);
    const value = normalizeSaveJsonValue(field, payload.value);

    return { file, id, field, value };
}

function validateEngineFilePayload(payload, options = {}) {
    assertNonEmptyObject(payload, 'payload');
    assertPayloadSize(payload, options.maxBytes || 12288, 'payload');
    const file = assertString(payload.file, { field: 'file', maxLength: 128 });
    const id = payload.id == null ? '' : assertString(payload.id, { field: 'id', allowEmpty: true, maxLength: 128 });
    return { file, id };
}

function validateRevisionApplyPayload(payload) {
    assertNonEmptyObject(payload, 'payload');
    assertPayloadSize(payload, 32768, 'payload');
    return payload;
}

function validateAuditLogPayload(payload) {
    assertNonEmptyObject(payload, 'payload');
    assertPayloadSize(payload, 12288, 'payload');
    return payload;
}

function validatePnReviewApplyDecisionPayload(payload) {
    assertNonEmptyObject(payload, 'payload');
    assertPayloadSize(payload, 12288, 'payload');

    const action = payload?.action != null ? normalizeWhitespace(payload.action).toLowerCase() : '';
    const estado = payload?.estado != null ? normalizeWhitespace(payload.estado).toLowerCase() : '';
    const accion = payload?.accion != null ? normalizeWhitespace(payload.accion).toLowerCase() : '';

    return { action, estado, accion };
}

function validatePnReviewApplyValuesPayload(payload) {
    assertNonEmptyObject(payload, 'payload');
    assertPayloadSize(payload, 12288, 'payload');
    if (!payload.fields || typeof payload.fields !== 'object' || Array.isArray(payload.fields)) {
        throw validationError({
            code: 'INVALID_PAYLOAD',
            field: 'fields',
            message: 'fields debe ser un objeto JSON.'
        });
    }
    return payload.fields;
}

function validateSiblingBulkPayload(payload) {
    assertNonEmptyObject(payload, 'payload');
    assertPayloadSize(payload, 524288, 'payload');
    const items = Array.isArray(payload.items) ? payload.items : null;
    if (!items || items.length === 0) {
        throw validationError({
            code: 'VALUE_REQUIRED',
            field: 'items',
            message: 'items requerido (array no vacío).'
        });
    }
    if (items.length > 5000) {
        throw validationError({
            code: 'PAYLOAD_TOO_LARGE',
            field: 'items',
            message: 'items supera el limite permitido (5000).'
        });
    }
    return items;
}

function validateWriteTargetInvariants({ file, id, field, value }) {
    if (!file) {
        throw validationError({ code: 'FIELD_REQUIRED', field: 'file', message: 'file es obligatorio.' });
    }
    if (!id) {
        throw validationError({ code: 'FIELD_REQUIRED', field: 'id', message: 'id es obligatorio.' });
    }
    if (!field) {
        throw validationError({ code: 'FIELD_REQUIRED', field: 'field', message: 'field es obligatorio.' });
    }
    return { file, id, field, value };
}

module.exports = {
    normalizeRevisionEstado,
    normalizeRevisionAccion,
    normalizeSaveJsonFieldName,
    normalizeSaveJsonValue,
    validateSaveJsonPayload,
    validateEngineFilePayload,
    validateRevisionApplyPayload,
    validateAuditLogPayload,
    validatePnReviewApplyDecisionPayload,
    validatePnReviewApplyValuesPayload,
    validateSiblingBulkPayload,
    validateWriteTargetInvariants,
};
