// MILU — Router /db de solo lectura sobre SQLite espejo.
// Fase F. Ningún endpoint escribe en disco.

'use strict';

const express = require('express');
const svc = require('../services/sqlite-mirror-read');

const router = express.Router();

function sendResult(res, result) {
    // Normaliza forma { ok, source, ...payload }
    if (result && result.ok === false) {
        const status = result.error === 'DB_NOT_FOUND' || result.error === 'DRIVER_NOT_AVAILABLE'
            ? 503
            : (result.error === 'INVALID_SKU' || result.error === 'QUERY_TOO_SHORT' ? 400 : 500);
        return res.status(status).json(result);
    }
    const payload = (result && result.data && typeof result.data === 'object') ? result.data : {};
    return res.json({ ok: true, source: 'sqlite_mirror', ...payload });
}

router.get('/status', (req, res) => {
    const r = svc.getDbStatus();
    // getDbStatus puede devolver tanto error directo como envelope withDb()
    if (r && r.ok === false) return sendResult(res, r);
    return sendResult(res, r);
});

router.get('/summary', (req, res) => sendResult(res, svc.getDbSummary()));
router.get('/engines', (req, res) => sendResult(res, svc.getEnginesSummary()));
router.get('/qa-summary', (req, res) => sendResult(res, svc.getQaSummary()));
router.get('/images-summary', (req, res) => sendResult(res, svc.getImagesSummary()));
router.get('/export-candidates-summary', (req, res) => sendResult(res, svc.getExportCandidatesSummary()));

router.get('/search', (req, res) => {
    const q = req.query.q;
    const limit = req.query.limit;
    return sendResult(res, svc.searchPartNumbers(q, limit));
});

router.get('/pn/:sku', (req, res) => {
    return sendResult(res, svc.getPnSummary(req.params.sku));
});

// Catch-all final: cualquier método/ruta no manejada bajo /db -> 405.
// (Express 5 no admite '*' como path; usamos middleware sin ruta.)
router.use((req, res) => {
    res.status(405).json({
        ok: false,
        source: 'sqlite_mirror',
        error: 'METHOD_NOT_ALLOWED',
        message: `Solo GET es soportado en ${req.baseUrl}${req.path}.`,
    });
});

module.exports = router;
