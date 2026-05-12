'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { validateSaveJsonPayload, normalizeRevisionAccion } = require('../../server/validation/qa-validation');

const BASE_URL = (process.env.MILU_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.MILU_SECURITY_TIMEOUT_MS || 10000);

let serverProcess = null;

function waitForServerReady() {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(async () => {
            if (Date.now() - startedAt > TIMEOUT_MS) {
                clearInterval(timer);
                reject(new Error('Timeout esperando /health'));
                return;
            }
            try {
                const res = await fetch(`${BASE_URL}/health`);
                if (res.ok) {
                    clearInterval(timer);
                    resolve();
                }
            } catch {
                // keep waiting
            }
        }, 250);
    });
}

async function requestJson(pathname, body) {
    const res = await fetch(`${BASE_URL}${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
        json = JSON.parse(text);
    } catch {
        json = null;
    }
    return { status: res.status, json, text };
}

before(async () => {
    if (process.env.MILU_BASE_URL) {
        return;
    }
    try {
        const probe = await fetch(`${BASE_URL}/health`);
        if (probe.ok) {
            return;
        }
    } catch {
        // start local server below
    }
    const serverPath = path.join(process.cwd(), 'server.js');
    serverProcess = spawn(process.execPath, [serverPath], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    await waitForServerReady();
});

after(async () => {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
    }
});

describe('MILU write validation', () => {
    test('field no permitido -> 400', async () => {
        const res = await requestJson('/save-json', {
            file: 'engine_12V4000M40A.json',
            id: '1',
            field: 'not_allowed',
            value: 'x'
        });
        assert.equal(res.status, 400);
        assert.equal(res.json?.error, 'VALIDATION_ERROR');
        assert.equal(res.json?.code, 'FIELD_NOT_ALLOWED');
    });

    test('qa_revision_estado invalido -> 400', async () => {
        const res = await requestJson('/save-json', {
            file: 'engine_12V4000M40A.json',
            id: '1',
            field: 'qa_revision_estado',
            value: 'invalid'
        });
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'INVALID_QA_REVISION_ESTADO');
    });

    test('qa_revision_accion invalido -> 400', async () => {
        const res = await requestJson('/save-json', {
            file: 'engine_12V4000M40A.json',
            id: '1',
            field: 'qa_revision_accion',
            value: 'wrong'
        });
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'INVALID_QA_REVISION_ACCION');
    });

    test('field raw_json -> bloqueado', async () => {
        const res = await requestJson('/save-json', {
            file: 'engine_12V4000M40A.json',
            id: '1',
            field: 'raw_json',
            value: '{}'
        });
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'FIELD_NOT_ALLOWED');
    });

    test('payload vacio -> 400', async () => {
        const res = await requestJson('/save-json', {});
        assert.equal(res.status, 400);
        assert.equal(res.json?.error, 'VALIDATION_ERROR');
    });

    test('id inexistente -> 404 o 400 consistente', async () => {
        const res = await requestJson('/save-json', {
            file: 'engine_12V4000M40A.json',
            id: '999999999999',
            field: 'designation_final',
            value: 'TEST'
        });
        assert.ok([400, 404].includes(res.status), `status inesperado: ${res.status}`);
    });

    test('file invalido -> 400', async () => {
        const res = await requestJson('/save-json', {
            file: 'nope.json',
            id: '1',
            field: 'designation_final',
            value: 'TEST'
        });
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'FILE_NOT_ALLOWED');
    });

    test('descartar -> aceptado y normalizado', async () => {
        assert.equal(normalizeRevisionAccion('descartar'), 'eliminar');
    });

    test('payload correcto -> sigue funcionando', async () => {
        const normalized = validateSaveJsonPayload({
            file: 'engine_12V4000M40A.json',
            id: '1',
            field: 'designation_final',
            value: 'VALIDATION_TEST'
        });
        assert.equal(normalized.file, 'engine_12V4000M40A.json');
        assert.equal(normalized.field, 'designation_final');
        assert.equal(normalized.value, 'VALIDATION_TEST');
    });
});
