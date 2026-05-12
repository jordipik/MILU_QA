// MILU — Smoke tests de la capa /db (Fase F).
// Requiere: server.js levantado + BD espejo generada (npm run db:import).

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { BASE_URL, getTimeout } = require('../helpers/smoke-config');
const { getJson } = require('../helpers/fetch-json');

const TIMEOUT_MS = getTimeout(10000);

describe('MILU /db read layer', () => {
    let pnSample = null;

    test('GET /db/status -> 200 ok source=sqlite_mirror', async () => {
        const r = await getJson('/db/status', TIMEOUT_MS);
        assert.equal(r.status, 200, `Status inesperado: ${r.status} body=${r.text.slice(0, 200)}`);
        assert.ok(r.body, 'No JSON');
        assert.equal(r.body.ok, true);
        assert.equal(r.body.source, 'sqlite_mirror');
        assert.equal(typeof r.body.db_path, 'string');
        assert.equal(r.body.driver_available, true);
    });

    test('GET /db/summary -> total_rows > 0 y unique_pn > 0', async () => {
        const r = await getJson('/db/summary', TIMEOUT_MS);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.ok(r.body.total_rows > 0, `total_rows=${r.body.total_rows}`);
        assert.ok(r.body.unique_pn > 0, `unique_pn=${r.body.unique_pn}`);
        assert.ok(r.body.engines > 0);
    });

    test('GET /db/engines -> 9 engines', async () => {
        const r = await getJson('/db/engines', TIMEOUT_MS);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.equal(r.body.count, 9, `engines.count=${r.body.count}`);
        assert.ok(Array.isArray(r.body.engines));
        assert.equal(r.body.engines.length, 9);
    });

    test('GET /db/qa-summary -> by_estado y by_accion arrays', async () => {
        const r = await getJson('/db/qa-summary', TIMEOUT_MS);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.ok(Array.isArray(r.body.by_estado));
        assert.ok(Array.isArray(r.body.by_accion));
        assert.ok(r.body.by_estado.length > 0);
        assert.ok(r.body.by_accion.length > 0);
    });

    test('GET /db/images-summary -> totals con rows_with_image', async () => {
        const r = await getJson('/db/images-summary', TIMEOUT_MS);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.ok(r.body.totals);
        assert.equal(typeof r.body.totals.rows_with_image, 'number');
        assert.equal(typeof r.body.totals.rows_with_schema, 'number');
        assert.ok(Array.isArray(r.body.by_kind));
    });

    test('GET /db/export-candidates-summary -> ok', async () => {
        const r = await getJson('/db/export-candidates-summary', TIMEOUT_MS);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.ok(Array.isArray(r.body.by_export_type));
        assert.ok(Array.isArray(r.body.by_qa_decision));
        assert.equal(typeof r.body.importables, 'number');
    });

    test('GET /db/search?q=... -> rows[]', async () => {
        // Buscar prefijo común numérico que casi seguro existe en MTU.
        const r = await getJson('/db/search?q=05&limit=10', TIMEOUT_MS);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.ok(Array.isArray(r.body.rows));
        // Guardar un PN real para el siguiente test
        if (r.body.rows.length > 0) {
            pnSample = r.body.rows[0].pn_final;
        }
    });

    test('GET /db/pn/:sku -> detalle de un PN encontrado en /db/search', async () => {
        if (!pnSample) {
            // fallback: tomar uno cualquiera del summary del primer engine via /db/search amplio
            const r2 = await getJson('/db/search?q=0&limit=1', TIMEOUT_MS);
            if (r2.body && r2.body.rows && r2.body.rows[0]) {
                pnSample = r2.body.rows[0].pn_final;
            }
        }
        assert.ok(pnSample, 'No se obtuvo un PN de muestra');
        const enc = encodeURIComponent(pnSample);
        const r = await getJson(`/db/pn/${enc}`, TIMEOUT_MS);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.equal(r.body.pn_final, pnSample);
        assert.ok(Array.isArray(r.body.rows));
        assert.equal(r.body.found, true);
    });

    test('GET /db/search con q corto -> 400', async () => {
        const r = await getJson('/db/search?q=a', TIMEOUT_MS);
        assert.equal(r.status, 400);
        assert.equal(r.body.ok, false);
        assert.equal(r.body.error, 'QUERY_TOO_SHORT');
        assert.equal(r.body.source, 'sqlite_mirror');
    });

    test('POST /db/status -> 405 (read-only)', async () => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(`${BASE_URL}/db/status`, { method: 'POST', signal: ctrl.signal });
            assert.equal(res.status, 405);
        } finally { clearTimeout(t); }
    });
});
