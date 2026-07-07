// MILU — Smoke tests Fase G (capa analytics /db/analytics/*).
// Requiere: server.js levantado + BD espejo (npm run db:import).

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { BASE_URL, getTimeout } = require('../helpers/smoke-config');
const { getJson } = require('../helpers/fetch-json');
const { assertOkEnvelope } = require('../helpers/assert-json-response');

const TIMEOUT_MS = getTimeout(15000);

describe('MILU /db/analytics smoke', () => {

    test('GET /db/analytics/overview -> KPIs coherentes', async () => {
        const r = await getJson('/db/analytics/overview');
        assertOkEnvelope(r, '/db/analytics/overview', 'sqlite_mirror');
        const b = r.body;
        assert.ok(b.total_rows > 0, 'total_rows>0');
        assert.ok(b.unique_pn > 0, 'unique_pn>0');
        assert.ok(b.total_engines > 0, 'total_engines>0');
        // qa_* y rows_* son números enteros
        for (const k of ['qa_ok', 'qa_pending', 'qa_importar', 'qa_revisar', 'qa_eliminar', 'qa_copia',
            'rows_with_images', 'rows_with_schema', 'rows_with_placeholder',
            'rows_without_images', 'rows_without_schema', 'new_count', 'superseded_count']) {
            assert.equal(typeof b[k], 'number', `${k} debe ser number`);
            assert.ok(b[k] >= 0, `${k}>=0`);
        }
        // coherencia: with + without = total
        assert.equal(b.rows_with_images + b.rows_without_images, b.total_rows, 'sum images=total');
        assert.equal(b.rows_with_schema + b.rows_without_schema, b.total_rows, 'sum schema=total');
        assert.equal(typeof b.generated_at, 'string');
    });

    test('GET /db/analytics/engines -> array engines', async () => {
        const r = await getJson('/db/analytics/engines');
        assertOkEnvelope(r, '/db/analytics/engines', 'sqlite_mirror');
        assert.ok(Array.isArray(r.body.engines));
        assert.ok(r.body.count > 0);
        assert.equal(r.body.engines.length, r.body.count);
        const first = r.body.engines[0];
        for (const k of ['engine_model', 'row_count', 'unique_pn', 'placeholders',
            'without_images', 'without_schema', 'qa_pending', 'qa_ok']) {
            assert.ok(Object.prototype.hasOwnProperty.call(first, k), `engines[0].${k}`);
        }
    });

    test('GET /db/analytics/images -> totales y rankings', async () => {
        const r = await getJson('/db/analytics/images');
        assertOkEnvelope(r, '/db/analytics/images', 'sqlite_mirror');
        const b = r.body;
        for (const k of ['total_image_refs', 'placeholders', 'real_images',
            'rows_with_ruta_foto', 'rows_with_ruta_esquemas_pos', 'rows_without_any_image']) {
            assert.equal(typeof b[k], 'number');
        }
        assert.ok(Array.isArray(b.top_engines_without_image));
        assert.ok(Array.isArray(b.top_engines_with_placeholders));
        // los rankings no deberían superar 10 entradas
        assert.ok(b.top_engines_without_image.length <= 10);
        assert.ok(b.top_engines_with_placeholders.length <= 10);
    });

    test('GET /db/analytics/qa -> distribuciones y ambiguos', async () => {
        const r = await getJson('/db/analytics/qa');
        assertOkEnvelope(r, '/db/analytics/qa', 'sqlite_mirror');
        const b = r.body;
        assert.ok(Array.isArray(b.by_estado));
        assert.ok(Array.isArray(b.by_accion));
        assert.ok(Array.isArray(b.combinations));
        assert.ok(Array.isArray(b.top_pn_conflicts));
        assert.ok(Array.isArray(b.top_engines_pending));
        assert.ok(b.by_estado.length > 0);
        assert.ok(b.by_accion.length > 0);
        assert.ok(b.ambiguous && typeof b.ambiguous === 'object');
        for (const k of ['ok_revisar', 'pending_importar', 'ok_eliminar', 'pending_accion_ok']) {
            assert.equal(typeof b.ambiguous[k], 'number');
        }
        // límites razonables
        assert.ok(b.combinations.length <= 50);
        assert.ok(b.top_pn_conflicts.length <= 50);
    });

    test('GET /db/analytics/pn-conflicts -> summary + listas ≤100', async () => {
        const r = await getJson('/db/analytics/pn-conflicts');
        assertOkEnvelope(r, '/db/analytics/pn-conflicts', 'sqlite_mirror');
        const b = r.body;
        assert.ok(b.summary && typeof b.summary === 'object');
        for (const k of ['multi_engine', 'multi_sust', 'multi_designation', 'multi_measure', 'multi_weight']) {
            assert.ok(Array.isArray(b[k]), `${k} debe ser array`);
            assert.ok(b[k].length <= 100, `${k}.length <= 100`);
        }
        for (const k of ['multi_engine_total', 'multi_sust_total', 'multi_designation_total',
            'multi_measure_total', 'multi_weight_total']) {
            assert.equal(typeof b.summary[k], 'number');
        }
    });

    test('GET /db/analytics/export -> contadores y rankings', async () => {
        const r = await getJson('/db/analytics/export');
        assertOkEnvelope(r, '/db/analytics/export', 'sqlite_mirror');
        const b = r.body;
        for (const k of ['import_candidates', 'discard_candidates', 'pending_review',
            'new_count', 'superseded_count', 'mixed_count']) {
            assert.equal(typeof b[k], 'number');
        }
        assert.ok(Array.isArray(b.top_reasons));
        assert.ok(Array.isArray(b.top_engines_pending));
        assert.ok(b.top_reasons.length <= 20);
        assert.ok(b.top_engines_pending.length <= 10);
    });

    test('POST /db/analytics/overview -> 405', async () => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(`${BASE_URL}/db/analytics/overview`, { method: 'POST', signal: ctrl.signal });
            assert.equal(res.status, 405);
        } finally { clearTimeout(t); }
    });

    test('GET /db/analytics/nope -> 405', async () => {
        const r = await getJson('/db/analytics/nope');
        assert.equal(r.status, 405);
        assert.equal(r.body.ok, false);
        assert.equal(r.body.error, 'METHOD_NOT_ALLOWED');
    });

    // ── Fase H ─────────────────────────────────────────────────────────

    test('Cache TTL — 2ª llamada cached=true', async () => {
        const r1 = await getJson('/db/analytics/overview');
        assertOkEnvelope(r1, '/db/analytics/overview#1', 'sqlite_mirror');
        const r2 = await getJson('/db/analytics/overview');
        assertOkEnvelope(r2, '/db/analytics/overview#2', 'sqlite_mirror');
        assert.equal(r2.body.cached, true, `2ª llamada debe ser cached=true. body.cached=${r2.body.cached}`);
        assert.equal(typeof r2.body.cache_age_ms, 'number');
        assert.equal(typeof r2.body.cache_ttl_ms, 'number');
    });

    test('GET /db/analytics/cache -> stats', async () => {
        const r = await getJson('/db/analytics/cache');
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.ok(r.body.cache && typeof r.body.cache === 'object');
        assert.equal(typeof r.body.cache.size, 'number');
        assert.ok(Array.isArray(r.body.cache.entries));
    });

    test('Drilldown /engine/:engine -> stats + rows paginadas', async () => {
        const r = await getJson('/db/analytics/engine/12V4000M40A?limit=5');
        assert.equal(r.status, 200);
        assert.equal(r.body.found, true);
        assert.equal(r.body.engine.engine_model, '12V4000M40A');
        assert.ok(Array.isArray(r.body.rows));
        assert.ok(r.body.rows.length <= 5);
        assert.equal(r.body.limit, 5);
    });

    test('Drilldown /engine/inexistente -> found=false', async () => {
        const r = await getJson('/db/analytics/engine/NO_EXISTE_999');
        assert.equal(r.status, 200);
        assert.equal(r.body.found, false);
    });

    test('Drilldown /pn/:sku -> distintas variantes', async () => {
        const r = await getJson('/db/analytics/pn/304017008083');
        assert.equal(r.status, 200);
        assert.equal(r.body.found, true);
        assert.equal(r.body.pn_final, '304017008083');
        assert.ok(Array.isArray(r.body.engines));
        assert.ok(Array.isArray(r.body.rows));
    });

    test('Drilldown /qa/pending -> total + paginación', async () => {
        const r = await getJson('/db/analytics/qa/pending?limit=3');
        assert.equal(r.status, 200);
        assert.ok(typeof r.body.total === 'number' && r.body.total > 0);
        assert.ok(r.body.rows.length <= 3);
    });

    test('Drilldown /images/missing y /images/placeholders', async () => {
        const r1 = await getJson('/db/analytics/images/missing?limit=2');
        const r2 = await getJson('/db/analytics/images/placeholders?limit=2');
        assert.equal(r1.status, 200);
        assert.equal(r2.status, 200);
        assert.ok(r1.body.rows.length <= 2);
        assert.ok(r2.body.rows.length <= 2);
    });

    test('Drilldown /export/pending -> total + filas', async () => {
        const r = await getJson('/db/analytics/export/pending?limit=4');
        assert.equal(r.status, 200);
        assert.ok(typeof r.body.total === 'number');
        assert.ok(r.body.rows.length <= 4);
    });

    test('Search /search?q=304017 -> results agrupados', async () => {
        const r = await getJson('/db/analytics/search?q=304017&limit=5');
        assert.equal(r.status, 200);
        assert.equal(r.body.q, '304017');
        assert.ok(r.body.total > 0);
        assert.ok(Array.isArray(r.body.results));
        assert.ok(r.body.results.length <= 5);
    });

    test('Search /search?q=x -> 400 (q corto)', async () => {
        const r = await getJson('/db/analytics/search?q=x');
        assert.equal(r.status, 400);
        assert.equal(r.body.ok, false);
        assert.equal(r.body.error, 'INVALID_PARAM');
    });

    test('CSV /export-csv/pending-qa -> text/csv', async () => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(`${BASE_URL}/db/analytics/export-csv/pending-qa`, { signal: ctrl.signal });
            assert.equal(res.status, 200);
            const ct = res.headers.get('content-type') || '';
            assert.ok(ct.includes('text/csv'), `content-type=${ct}`);
            const text = await res.text();
            assert.ok(text.includes('engine_model'), 'CSV debe contener header');
        } finally { clearTimeout(t); }
    });

    test('CSV /export-csv/nope -> 404 UNKNOWN_VIEW', async () => {
        const r = await getJson('/db/analytics/export-csv/nope');
        assert.equal(r.status, 404);
        assert.equal(r.body.error, 'UNKNOWN_VIEW');
    });
});
