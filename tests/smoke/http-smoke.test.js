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

        test('GET /qa_milu.html -> selector de vista compacta disponible', async () => {
            const res = await requestText('/qa_milu.html', { method: 'GET' }, TIMEOUT_MS);
            assert.equal(res.status, 200);
            assert.ok(/id=["']columnViewSelect["']/.test(res.text), 'Falta #columnViewSelect en qa_milu.html');
            assert.ok(/<option\s+value=["']pdf["'][^>]*>\s*Vista compacta\s*<\/option>/i.test(res.text),
                'Falta opcion compacta (value="pdf") en qa_milu.html');
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

        test('GET /pn-review/:sku/sources -> ok + rows para SKU existente', async () => {
            const listRes = await requestText('/pn-review/list?limit=1', { method: 'GET' }, TIMEOUT_MS);
            assert.equal(listRes.status, 200);
            assertJsonContentType(listRes);
            const listBody = parseJsonOrThrow(listRes);
            assert.equal(listBody.ok, true, 'Falta ok=true en /pn-review/list');
            assert.ok(Array.isArray(listBody.rows), 'rows debe ser array en /pn-review/list');
            assert.ok(listBody.rows.length > 0, 'Se necesita al menos un SKU en /pn-review/list para probar /sources');

            const sku = String(listBody.rows[0]?.sku || '').trim();
            assert.ok(sku, `SKU invalido obtenido desde /pn-review/list: ${JSON.stringify(listBody.rows[0])}`);

            const res = await requestText(`/pn-review/${encodeURIComponent(sku)}/sources`, { method: 'GET' }, TIMEOUT_MS);
            assert.equal(res.status, 200, `Esperado 200 en /pn-review/${sku}/sources, recibido ${res.status} con body: ${res.text}`);
            assertJsonContentType(res);
            assert.ok(!/ReferenceError/i.test(res.text), 'La respuesta contiene ReferenceError');

            const body = parseJsonOrThrow(res);
            assert.equal(body.ok, true, 'Falta ok=true en /pn-review/:sku/sources');
            assert.equal(body.sku, sku, `sku devuelto no coincide (${body.sku} !== ${sku})`);
            assert.ok(Number.isInteger(body.count) && body.count >= 0, `count invalido: ${body.count}`);
            assert.ok(Array.isArray(body.rows), 'rows debe ser array en /pn-review/:sku/sources');
            assert.equal(body.rows.length, body.count, `rows.length (${body.rows.length}) debe coincidir con count (${body.count})`);
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
