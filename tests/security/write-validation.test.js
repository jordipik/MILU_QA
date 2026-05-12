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

    test('/save-json roundtrip HTTP: guarda y restaura designation_final', async () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const file = 'engine_12V4000M40A.json';
        const filePath = path.join(process.cwd(), file);
        const arr = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const row = arr[0];
        const id = String(row.ID);
        const originalValue = row.designation_final ?? '';
        const probe = `__VALIDATION_PROBE__${Date.now()}`;
        try {
            const ok = await requestJson('/save-json', { file, id, field: 'designation_final', value: probe });
            assert.equal(ok.status, 200);
            assert.equal(ok.json?.ok, true);
            const afterWrite = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            assert.equal(afterWrite[0].designation_final, probe);
        } finally {
            await requestJson('/save-json', { file, id, field: 'designation_final', value: originalValue });
        }
    });

    test('/save-json field=col alias sigue aceptandose', async () => {
        const res = await fetch(`${BASE_URL}/save-json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: 'engine_12V4000M40A.json', id: '999999999999', col: 'designation_final', value: 'x' })
        });
        // Debe validar col como alias y devolver 404 (id inexistente), no 400 FIELD_REQUIRED
        assert.ok([200, 404].includes(res.status), `status inesperado: ${res.status}`);
    });

    test('/save-json siempre responde JSON (nunca HTML)', async () => {
        const res = await fetch(`${BASE_URL}/save-json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: 'no.json', id: '1', field: 'designation_final', value: 'x' })
        });
        const contentType = res.headers.get('content-type') || '';
        assert.ok(contentType.includes('application/json'), `content-type inesperado: ${contentType}`);
    });

    test('/apply-revision-to-engines payload vacio -> 400 VALIDATION_ERROR', async () => {
        const res = await requestJson('/apply-revision-to-engines', {});
        assert.equal(res.status, 400);
        assert.equal(res.json?.error, 'VALIDATION_ERROR');
        assert.equal(res.json?.code, 'EMPTY_PAYLOAD');
    });

    test('/apply-revision-to-engines payload no-objeto -> 400', async () => {
        const res = await fetch(`${BASE_URL}/apply-revision-to-engines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([1, 2, 3])
        });
        const json = await res.json().catch(() => null);
        assert.equal(res.status, 400);
        assert.equal(json?.error, 'VALIDATION_ERROR');
    });

    test('/apply-revision-to-engines revisiones vacias -> 200 ok no-op', async () => {
        const res = await requestJson('/apply-revision-to-engines', { revisions: {} });
        assert.equal(res.status, 200);
        assert.equal(res.json?.ok, true);
        assert.ok(res.json?.result && typeof res.json.result === 'object');
        assert.ok(res.json.result.appliedByFile && typeof res.json.result.appliedByFile === 'object');
        // No debe haber escrito cambios reales
        for (const stats of Object.values(res.json.result.appliedByFile)) {
            assert.equal(stats?.changed ?? 0, 0);
        }
    });

    test('/apply-revision-to-engines payload demasiado grande -> 400 PAYLOAD_TOO_LARGE', async () => {
        // Generamos un objeto que supere los 32768 bytes permitidos
        const huge = {};
        for (let i = 0; i < 2000; i++) {
            huge[`idx=${i}`] = { estado: 'ok', accion: 'importar', updated_at: '2026-05-13T00:00:00Z' };
        }
        const res = await requestJson('/apply-revision-to-engines', huge);
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'PAYLOAD_TOO_LARGE');
    });
});
