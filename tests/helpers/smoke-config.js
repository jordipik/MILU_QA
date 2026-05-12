'use strict';

const BASE_URL = (process.env.MILU_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

function getTimeout(defaultMs) {
    const raw = process.env.MILU_SMOKE_TIMEOUT_MS;
    if (!raw) {
        return defaultMs;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

module.exports = {
    BASE_URL,
    getTimeout,
};
