// MILU — Smoke tests HTTP de endpoints críticos.
//
// REQUISITO: servidor levantado en http://localhost:3000 (o MILU_BASE_URL).
// NO se llama a ningún endpoint que escriba en disco.
//
// Ejecutar:
//   node --test tests/smoke/http-smoke.test.js
//   npm run test:smoke

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = (process.env.MILU_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.MILU_SMOKE_TIMEOUT_MS || 10000);

async function httpGet(path) {
    const url = `${BASE_URL}${path}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
        const text = await res.text();
        return { status: res.status, headers: res.headers, text, url };
    } finally {
        clearTimeout(t);
    }
}

async function httpPost(path, body) {
    const url = `${BASE_URL}${path}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body ?? {}),
            signal: ctrl.signal,
        });
        const text = await res.text();
        return { status: res.status, headers: res.headers, text, url };
    } finally {
        clearTimeout(t);
    }
}

function parseJson(res) {
    try {
        return JSON.parse(res.text);
    } catch (err) {
        throw new Error(`Respuesta no es JSON válido (${res.url}): ${err.message}\nPrimeros 200 chars: ${res.text.slice(0, 200)}`);
    }
}

function assertJsonContentType(res) {
    const ct = res.headers.get('content-type') || '';
    assert.ok(
        ct.toLowerCase().includes('application/json'),
        `Content-Type debería ser application/json en ${res.url}, recibido: ${ct}`
    );
}

describe('MILU smoke HTTP', () => {
    describe('Sistema', () => {
        test('GET /health -> 200 JSON con ok/service', async () => {
            const res = await httpGet('/health');
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            const body = parseJson(res);
            assert.ok(body.ok === true || typeof body.service === 'string',
                `Falta ok=true o service en /health: ${JSON.stringify(body)}`);
        });

        test('GET /version -> 200 JSON', async () => {
            const res = await httpGet('/version');
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            const body = parseJson(res);
            assert.ok(typeof body.version === 'string' || typeof body.appVersion === 'string',
                `Falta version en /version: ${JSON.stringify(body)}`);
        });
    });

    describe('Catálogo de engines', () => {
        test('GET /engines -> 9 engines y rowCount > 0', async () => {
            const res = await httpGet('/engines');
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            const body = parseJson(res);
            assert.equal(body.ok, true, 'Falta ok=true');
            assert.ok(Array.isArray(body.engines), 'engines debe ser array');
            assert.equal(body.engines.length, 9, `Deben existir 9 engines, hay ${body.engines.length}`);
            assert.ok(body.totals && typeof body.totals === 'object', 'Falta totals');
            assert.ok(Number(body.totals.rowCount) > 0, `totals.rowCount debe ser > 0 (=${body.totals.rowCount})`);
        });
    });

    describe('Revisión QA — solo lectura', () => {
        test('GET /qa_revision_sync.php -> JSON, no PHP/HTML', async () => {
            const res = await httpGet('/qa_revision_sync.php');
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            // No debe parecerse a PHP fuente ni a HTML
            assert.ok(!/^<\?php/i.test(res.text.trimStart()), 'Respuesta parece PHP fuente');
            assert.ok(!/^<!DOCTYPE/i.test(res.text.trimStart()), 'Respuesta parece HTML');
            const body = parseJson(res);
            assert.ok(body.meta || body.revisions,
                `Falta meta o revisions en respuesta: ${JSON.stringify(body).slice(0, 200)}`);
        });
    });

    describe('PN Review — solo lectura', () => {
        test('GET /pn-review/list -> ok + rows/total', async () => {
            const res = await httpGet('/pn-review/list');
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            const body = parseJson(res);
            assert.equal(body.ok, true, 'Falta ok=true');
            assert.ok(Array.isArray(body.rows) || typeof body.total === 'number',
                'Falta rows[] o total');
        });
    });

    describe('Export — solo lectura', () => {
        test('GET /export/status -> ok', async () => {
            const res = await httpGet('/export/status');
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            const body = parseJson(res);
            assert.equal(body.ok, true);
        });

        test('GET /export/files -> ok', async () => {
            const res = await httpGet('/export/files');
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            const body = parseJson(res);
            assert.equal(body.ok, true);
        });
    });

    describe('Endpoints legacy desactivados (deben responder 410)', () => {
        const legacyGet = ['/pn/list'];
        const legacyPost = ['/export/run-synthetic', '/export/run-ai-conflicts', '/export/run-all'];

        for (const p of legacyGet) {
            test(`GET ${p} -> 410`, async () => {
                const res = await httpGet(p);
                assert.equal(res.status, 410, `Esperado 410 en ${p}, recibido ${res.status}`);
                // intentar parsear: debe indicar legacy
                try {
                    const body = parseJson(res);
                    assert.equal(body.legacy, true, 'Respuesta legacy debería incluir legacy:true');
                } catch { /* no JSON: aceptable mientras el código sea 410 */ }
            });
        }

        for (const p of legacyPost) {
            test(`POST ${p} -> 410`, async () => {
                const res = await httpPost(p, {});
                assert.equal(res.status, 410, `Esperado 410 en ${p}, recibido ${res.status}`);
                try {
                    const body = parseJson(res);
                    assert.equal(body.legacy, true, 'Respuesta legacy debería incluir legacy:true');
                } catch { /* no JSON: aceptable mientras el código sea 410 */ }
            });
        }
    });
});
