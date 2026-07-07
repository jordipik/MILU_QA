// MILU — Router /db/analytics (Fase G). SOLO GET. SOLO LECTURA.

'use strict';

const express = require('express');
const svc = require('../services/sqlite-mirror-analytics');

const router = express.Router();

function sendResult(res, result) {
    if (result && result.ok === false) {
        const status =
            result.error === 'DB_NOT_FOUND' || result.error === 'DRIVER_NOT_AVAILABLE' ? 503 :
                result.error === 'INVALID_INPUT' || result.error === 'INVALID_PARAM' ? 400 :
                    500;
        return res.status(status).json(result);
    }
    const payload = (result && result.data && typeof result.data === 'object') ? result.data : {};
    return res.json({ ok: true, source: 'sqlite_mirror', ...payload });
}

function pagingFromQuery(q) {
    return { limit: q.limit, offset: q.offset };
}

// ──────────────────────────────────────────────────────────────────────────
// CSV helpers
// ──────────────────────────────────────────────────────────────────────────
function csvEscape(v) {
    if (v === null || v === undefined) return '';
    let s = String(v);
    // Replace newlines, then escape quotes.
    s = s.replace(/\r?\n/g, ' ');
    if (s.includes('"') || s.includes(',') || s.includes(';')) {
        s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function rowsToCsv(rows, columns) {
    const header = columns.join(',');
    const body = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(',')).join('\n');
    return header + '\n' + body + (rows.length ? '\n' : '');
}

function sendCsv(res, filename, csv) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM para Excel.
    res.send('\uFEFF' + csv);
}

router.get('/overview', (req, res) => sendResult(res, svc.getOverview()));
router.get('/engines', (req, res) => sendResult(res, svc.getEngineAnalytics()));
router.get('/images', (req, res) => sendResult(res, svc.getImageAnalytics()));
router.get('/qa', (req, res) => sendResult(res, svc.getQaAnalytics()));
router.get('/pn-conflicts', (req, res) => sendResult(res, svc.getPnConflicts()));
router.get('/export', (req, res) => sendResult(res, svc.getExportAnalytics()));

// Diagnóstico de cache.
router.get('/cache', (req, res) => res.json({
    ok: true, source: 'sqlite_mirror', cache: svc.cache.stats(),
}));

// ──────────────────────────────────────────────────────────────────────────
// Drilldowns
// ──────────────────────────────────────────────────────────────────────────
router.get('/engine/:engine', (req, res) =>
    sendResult(res, svc.getEngineDetail(req.params.engine, pagingFromQuery(req.query))));

router.get('/pn/:sku', (req, res) =>
    sendResult(res, svc.getPnDetail(req.params.sku)));

router.get('/qa/pending', (req, res) =>
    sendResult(res, svc.getQaPending(pagingFromQuery(req.query))));

router.get('/images/missing', (req, res) =>
    sendResult(res, svc.getMissingImages(pagingFromQuery(req.query))));

router.get('/images/placeholders', (req, res) =>
    sendResult(res, svc.getPlaceholderImages(pagingFromQuery(req.query))));

router.get('/export/pending', (req, res) =>
    sendResult(res, svc.getExportPending(pagingFromQuery(req.query))));

// ──────────────────────────────────────────────────────────────────────────
// Search
// ──────────────────────────────────────────────────────────────────────────
router.get('/search', (req, res) =>
    sendResult(res, svc.searchPn({ q: req.query.q, limit: req.query.limit, offset: req.query.offset })));

// ──────────────────────────────────────────────────────────────────────────
// CSV exports
// ──────────────────────────────────────────────────────────────────────────
const CSV_VIEWS = {
    'pending-qa': {
        fetch: () => svc.getQaPending({ limit: 5000, offset: 0 }),
        columns: ['source_row_id', 'engine_model', 'pn_final', 'designation_final',
            'qa_revision_estado', 'qa_revision_accion', 'sust_hierarchie', 'has_image'],
    },
    'missing-images': {
        fetch: () => svc.getMissingImages({ limit: 5000, offset: 0 }),
        columns: ['source_row_id', 'engine_model', 'pn_final', 'designation_final',
            'exp_imagenes', 'ruta_foto', 'ruta_esquemas_pos', 'has_schema'],
    },
    'placeholders': {
        fetch: () => svc.getPlaceholderImages({ limit: 5000, offset: 0 }),
        columns: ['source_row_id', 'engine_model', 'pn_final', 'designation_final',
            'exp_imagenes', 'ruta_foto'],
    },
    'pn-conflicts': {
        // Para CSV exportamos la lista plana de multi_engine + sufijo de conflictos.
        fetch: () => svc.getPnConflicts(),
        extract: (data) => (data.multi_engine || []).map((r) => ({
            pn_final: r.pn_final,
            engines_count: r.engines_count,
            occurrences: r.occurrences,
        })),
        columns: ['pn_final', 'engines_count', 'occurrences'],
    },
};

router.get('/export-csv/:view', (req, res) => {
    const view = req.params.view;
    const cfg = CSV_VIEWS[view];
    if (!cfg) {
        return res.status(404).json({
            ok: false, source: 'sqlite_mirror', error: 'UNKNOWN_VIEW',
            message: `Vista CSV desconocida: ${view}. Válidas: ${Object.keys(CSV_VIEWS).join(', ')}.`,
        });
    }
    const result = cfg.fetch();
    if (!result || result.ok === false) return sendResult(res, result);
    const data = (result.data && typeof result.data === 'object') ? result.data : {};
    const rows = cfg.extract ? cfg.extract(data) : (data.rows || []);
    const csv = rowsToCsv(rows, cfg.columns);
    const filename = `milu_${view}_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    return sendCsv(res, filename, csv);
});

// 405 catch-all (Express 5 no admite '*' como path string).
router.use((req, res) => {
    res.status(405).json({
        ok: false,
        source: 'sqlite_mirror',
        error: 'METHOD_NOT_ALLOWED',
        message: `Solo GET es soportado en ${req.baseUrl}${req.path}.`,
    });
});

module.exports = router;
