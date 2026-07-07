'use strict';

class PayloadValidationError extends Error {
    constructor({ code, field = '', message, status = 400 }) {
        super(message || 'Payload no valido');
        this.name = 'PayloadValidationError';
        this.code = code || 'VALIDATION_ERROR';
        this.field = field || '';
        this.status = Number.isFinite(status) ? status : 400;
    }
}

function validationError({ code, field = '', message, status = 400 }) {
    return new PayloadValidationError({ code, field, message, status });
}

function isValidationError(error) {
    return Boolean(error) && (error.name === 'PayloadValidationError' || error.code === 'VALIDATION_ERROR');
}

function formatValidationResponse(error) {
    return {
        ok: false,
        error: 'VALIDATION_ERROR',
        code: String(error?.code || 'VALIDATION_ERROR'),
        field: String(error?.field || ''),
        message: String(error?.message || 'Payload no valido')
    };
}

function sendValidationError(res, error, context = {}) {
    const payload = formatValidationResponse(error);
    const status = Number.isFinite(error?.status) ? error.status : 400;
    const logContext = context && typeof context === 'object' ? context : {};
    console.warn('[validation]', {
        ...logContext,
        code: payload.code,
        field: payload.field,
        message: payload.message
    });
    return res.status(status).json(payload);
}

module.exports = {
    PayloadValidationError,
    validationError,
    isValidationError,
    formatValidationResponse,
    sendValidationError,
};
