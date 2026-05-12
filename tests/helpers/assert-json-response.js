'use strict';

const assert = require('node:assert/strict');

function parseJsonOrThrow(res) {
    try {
        return JSON.parse(res.text);
    } catch (err) {
        throw new Error(
            `Response is not valid JSON (${res.url}): ${err.message}\n` +
            `First 200 chars: ${String(res.text || '').slice(0, 200)}`
        );
    }
}

function assertJsonContentType(res) {
    const ct = res.headers.get('content-type') || '';
    assert.ok(
        ct.toLowerCase().includes('application/json'),
        `Content-Type should be application/json in ${res.url}, received: ${ct}`
    );
}

function assertOkEnvelope(response, path, expectedSource) {
    assert.equal(
        response.status,
        200,
        `${path} -> ${response.status} body=${String(response.text || '').slice(0, 200)}`
    );
    assert.ok(response.body, `${path} without JSON body`);
    assert.equal(response.body.ok, true, `${path} ok=${response.body.ok}`);
    if (expectedSource) {
        assert.equal(response.body.source, expectedSource);
    }
}

module.exports = {
    parseJsonOrThrow,
    assertJsonContentType,
    assertOkEnvelope,
};
