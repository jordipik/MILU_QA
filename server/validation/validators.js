'use strict';

const { validationError } = require('./payload-errors');

const DEFAULT_MAX_STRING_LENGTH = 4096;
const DEFAULT_MAX_PAYLOAD_BYTES = 24 * 1024;

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function payloadByteLength(payload) {
    try {
        return Buffer.byteLength(JSON.stringify(payload ?? {}), 'utf8');
    } catch (_) {
        return Number.POSITIVE_INFINITY;
    }
}

function assertPlainObject(value, field = 'payload') {
    if (!isPlainObject(value)) {
        throw validationError({
            code: 'INVALID_PAYLOAD',
            field,
            message: `${field} debe ser un objeto JSON.`
        });
    }
    return value;
}

function assertNonEmptyObject(value, field = 'payload') {
    assertPlainObject(value, field);
    if (Object.keys(value).length === 0) {
        throw validationError({
            code: 'EMPTY_PAYLOAD',
            field,
            message: `${field} no puede estar vacio.`
        });
    }
    return value;
}

function assertPayloadSize(value, maxBytes = DEFAULT_MAX_PAYLOAD_BYTES, field = 'payload') {
    const size = payloadByteLength(value);
    if (size > maxBytes) {
        throw validationError({
            code: 'PAYLOAD_TOO_LARGE',
            field,
            message: `${field} supera el tamano permitido (${maxBytes} bytes).`
        });
    }
    return size;
}

function assertAllowedKeys(value, allowedKeys, field = 'payload') {
    assertPlainObject(value, field);
    const allowed = new Set((allowedKeys || []).map((key) => String(key)));
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            throw validationError({
                code: 'FIELD_NOT_ALLOWED',
                field: key,
                message: `Campo no permitido: ${key}`
            });
        }
    }
    return value;
}

function assertScalar(value, field = 'value') {
    if (Array.isArray(value) || isPlainObject(value)) {
        throw validationError({
            code: 'INVALID_VALUE_TYPE',
            field,
            message: `${field} debe ser un valor escalar.`
        });
    }
    return value;
}

function assertString(value, options = {}) {
    const field = options.field || 'value';
    const allowEmpty = options.allowEmpty === true;
    const maxLength = Number.isFinite(options.maxLength) ? options.maxLength : DEFAULT_MAX_STRING_LENGTH;
    const normalized = value == null ? '' : String(value);
    assertScalar(value, field);
    const text = normalized.trim();
    if (!allowEmpty && text === '') {
        throw validationError({
            code: 'VALUE_REQUIRED',
            field,
            message: `${field} es obligatorio.`
        });
    }
    if (text.length > maxLength) {
        throw validationError({
            code: 'VALUE_TOO_LONG',
            field,
            message: `${field} supera la longitud maxima permitida (${maxLength}).`
        });
    }
    return text;
}

function assertBooleanLike(value, field = 'value') {
    if (typeof value === 'boolean') {
        return value;
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw validationError({
        code: 'INVALID_VALUE_TYPE',
        field,
        message: `${field} debe ser booleano.`
    });
}

function normalizeWhitespace(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

module.exports = {
    DEFAULT_MAX_STRING_LENGTH,
    DEFAULT_MAX_PAYLOAD_BYTES,
    isPlainObject,
    payloadByteLength,
    assertPlainObject,
    assertNonEmptyObject,
    assertPayloadSize,
    assertAllowedKeys,
    assertScalar,
    assertString,
    assertBooleanLike,
    normalizeWhitespace,
};
