// MILU — Smoke tests HTTP de endpoints críticos.
//
// REQUISITO: servidor levantado en http://localhost:3000 (o MILU_BASE_URL).
// NO se llama a ningún endpoint que escriba en disco.
//
// Ejecutar:
//   node --test tests/smoke/http-smoke.test.js
//   npm run test:smoke

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');

const { getTimeout } = require('../helpers/smoke-config');
const { requestText, postJson } = require('../helpers/fetch-json');
const { parseJsonOrThrow, assertJsonContentType } = require('../helpers/assert-json-response');

const TIMEOUT_MS = getTimeout(10000);

// ---------- helpers de arranque ------------------------------------------

const SERVER_PORT = 3000;
const ROOT_DIR = path.resolve(__dirname, '..', '..');

/**
 * Devuelve true si ya hay algo escuchando en el puerto (servidor externo).
 */
function probePort(port, timeoutMs = 800) {
    return new Promise((resolve) => {
        const sock = net.createConnection(port, '127.0.0.1');
        const tid = setTimeout(() => { sock.destroy(); resolve(false); }, timeoutMs);
        sock.once('connect', () => { clearTimeout(tid); sock.destroy(); resolve(true); });
        sock.once('error', () => { clearTimeout(tid); resolve(false); });
    });
}

/**
 * Espera hasta que el puerto acepte conexiones o lanza un error.
 */
async function waitForPort(port, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await probePort(port, 400)) return;
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`El servidor no arrancó en el puerto ${port} en ${timeoutMs} ms`);
}

// -------------------------------------------------------------------------

let _serverProcess = null;

describe('MILU smoke HTTP', () => {
    before(async () => {
        // Si el servidor ya está corriendo (dev local), no arrancamos uno nuevo.
        if (await probePort(SERVER_PORT)) return;

        _serverProcess = spawn(process.execPath, ['server.js'], {
            cwd: ROOT_DIR,
            stdio: 'pipe',
            env: { ...process.env, NODE_ENV: 'test' },
        });

        _serverProcess.once('error', (err) => {
            throw new Error(`No se pudo arrancar server.js: ${err.message}`);
        });

        // Capturar stderr para facilitar debug en caso de fallo.
        _serverProcess.stderr.on('data', (chunk) => {
            process.stderr.write(`[server.js] ${chunk}`);
        });

        await waitForPort(SERVER_PORT, 20000);
    });

    after(async () => {
        if (_serverProcess) {
            _serverProcess.kill('SIGTERM');
            await once(_serverProcess, 'exit').catch(() => {});
            _serverProcess = null;
        }
    });
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
            assert.ok(/<option\s+value=["']pdf["'][^>]*>\s*Vista\s+(compacta|PDF)\s*<\/option>/i.test(res.text),
                'Falta opcion de vista value="pdf" en qa_milu.html');
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
