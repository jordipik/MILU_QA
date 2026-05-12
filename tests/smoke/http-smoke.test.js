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

const { getTimeout } = require('../helpers/smoke-config');
const { requestText, postJson } = require('../helpers/fetch-json');
const { parseJsonOrThrow, assertJsonContentType } = require('../helpers/assert-json-response');

const TIMEOUT_MS = getTimeout(10000);

describe('MILU smoke HTTP', () => {
    describe('Sistema', () => {
        test('GET /health -> 200 JSON con ok/service', async () => {
            const res = await requestText('/health', { method: 'GET' }, TIMEOUT_MS);
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            const body = parseJsonOrThrow(res);
            assert.ok(body.ok === true || typeof body.service === 'string',
                `Falta ok=true o service en /health: ${JSON.stringify(body)}`);
        });

        test('GET /version -> 200 JSON', async () => {
            const res = await requestText('/version', { method: 'GET' }, TIMEOUT_MS);
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            const body = parseJsonOrThrow(res);
            assert.ok(typeof body.version === 'string' || typeof body.appVersion === 'string',
                `Falta version en /version: ${JSON.stringify(body)}`);
        });
    });

    describe('Catálogo de engines', () => {
        test('GET /engines -> 9 engines y rowCount > 0', async () => {
            const res = await requestText('/engines', { method: 'GET' }, TIMEOUT_MS);
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            const body = parseJsonOrThrow(res);
            assert.equal(body.ok, true, 'Falta ok=true');
            assert.ok(Array.isArray(body.engines), 'engines debe ser array');
            assert.equal(body.engines.length, 9, `Deben existir 9 engines, hay ${body.engines.length}`);
            assert.ok(body.totals && typeof body.totals === 'object', 'Falta totals');
            assert.ok(Number(body.totals.rowCount) > 0, `totals.rowCount debe ser > 0 (=${body.totals.rowCount})`);
        });
    });

    describe('Revisión QA — solo lectura', () => {
        test('GET /qa_revision_sync.php -> JSON, no PHP/HTML', async () => {
            const res = await requestText('/qa_revision_sync.php', { method: 'GET' }, TIMEOUT_MS);
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            // No debe parecerse a PHP fuente ni a HTML
            assert.ok(!/^<\?php/i.test(res.text.trimStart()), 'Respuesta parece PHP fuente');
            assert.ok(!/^<!DOCTYPE/i.test(res.text.trimStart()), 'Respuesta parece HTML');
            const body = parseJsonOrThrow(res);
            assert.ok(body.meta || body.revisions,
                `Falta meta o revisions en respuesta: ${JSON.stringify(body).slice(0, 200)}`);
        });
    });

    describe('PN Review — solo lectura', () => {
        test('GET /pn-review/list -> ok + rows/total', async () => {
            const res = await requestText('/pn-review/list', { method: 'GET' }, TIMEOUT_MS);
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            const body = parseJsonOrThrow(res);
            assert.equal(body.ok, true, 'Falta ok=true');
            assert.ok(Array.isArray(body.rows) || typeof body.total === 'number',
                'Falta rows[] o total');
        });
    });

    describe('Export — solo lectura', () => {
        test('GET /export/status -> ok', async () => {
            const res = await requestText('/export/status', { method: 'GET' }, TIMEOUT_MS);
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            const body = parseJsonOrThrow(res);
            assert.equal(body.ok, true);
        });

        test('GET /export/files -> ok', async () => {
            const res = await requestText('/export/files', { method: 'GET' }, TIMEOUT_MS);
            assert.equal(res.status, 200);
            assertJsonContentType(res);
            const body = parseJsonOrThrow(res);
            assert.equal(body.ok, true);
        });
    });

    describe('Endpoints legacy desactivados (deben responder 410)', () => {
        const legacyGet = ['/pn/list'];
        const legacyPost = ['/export/run-synthetic', '/export/run-ai-conflicts', '/export/run-all'];

        for (const p of legacyGet) {
            test(`GET ${p} -> 410`, async () => {
                const res = await requestText(p, { method: 'GET' }, TIMEOUT_MS);
                assert.equal(res.status, 410, `Esperado 410 en ${p}, recibido ${res.status}`);
                // intentar parsear: debe indicar legacy
                try {
                    const body = parseJsonOrThrow(res);
                    assert.equal(body.legacy, true, 'Respuesta legacy debería incluir legacy:true');
                } catch { /* no JSON: aceptable mientras el código sea 410 */ }
            });
        }

        for (const p of legacyPost) {
            test(`POST ${p} -> 410`, async () => {
                const res = await postJson(p, {}, TIMEOUT_MS);
                assert.equal(res.status, 410, `Esperado 410 en ${p}, recibido ${res.status}`);
                try {
                    const body = parseJsonOrThrow(res);
                    assert.equal(body.legacy, true, 'Respuesta legacy debería incluir legacy:true');
                } catch { /* no JSON: aceptable mientras el código sea 410 */ }
            });
        }
    });
});
