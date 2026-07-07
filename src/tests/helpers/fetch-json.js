'use strict';

const { BASE_URL } = require('./smoke-config');

async function requestText(path, options, timeoutMs) {
    const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), effectiveTimeoutMs);
    try {
        const res = await fetch(`${BASE_URL}${path}`, { ...(options || {}), signal: ctrl.signal });
        const text = await res.text();
        return {
            status: res.status,
            headers: res.headers,
            text,
            url: `${BASE_URL}${path}`,
        };
    } finally {
        clearTimeout(t);
    }
}

async function getJson(path, timeoutMs) {
    const res = await requestText(path, { method: 'GET' }, timeoutMs);
    let body = null;
    try {
        body = JSON.parse(res.text);
    } catch {
        // Keep null; caller can assert if JSON is required.
    }
    return { ...res, body };
}

async function postJson(path, payload, timeoutMs) {
    return requestText(
        path,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload ?? {}),
        },
        timeoutMs
    );
}

module.exports = {
    requestText,
    getJson,
    postJson,
};
