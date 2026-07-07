// MILU — Fase F: capa de lectura sobre la BD espejo SQLite.
// SOLO LECTURA. Nunca escribe en la BD ni toca engine_*.json.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DB_PATH = path.join(REPO_ROOT, 'data', 'db', 'milu_mirror.sqlite');

let Database = null;
let driverError = null;
try {
    Database = require('better-sqlite3');
} catch (err) {
    driverError = err;
}

let _db = null;
let _openError = null;

function openDb() {
    if (_db) return _db;
    if (!Database) {
        _openError = `better-sqlite3 no disponible: ${driverError && driverError.message}`;
        return null;
    }
    if (!fs.existsSync(DB_PATH)) {
        _openError = 'DB_NOT_FOUND';
        return null;
    }
    try {
        _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
        _db.pragma('query_only = ON');
        _openError = null;
        return _db;
    } catch (err) {
        _openError = err.message;
        return null;
    }
}

function closeDb() {
    if (_db) {
        try { _db.close(); } catch { /* noop */ }
        _db = null;
    }
}

function tableExists(db, name) {
    try {
        const row = db.prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`
        ).get(name);
        return Boolean(row);
    } catch {
        return false;
    }
}

function safe(fn) {
    try {
        const data = fn();
        return { ok: true, source: 'sqlite_mirror', data };
    } catch (err) {
        return { ok: false, source: 'sqlite_mirror', error: 'QUERY_ERROR', message: err.message };
    }
}

function withDb(fn) {
    const db = openDb();
    if (!db) {
        if (_openError === 'DB_NOT_FOUND') {
            return {
                ok: false,
                source: 'sqlite_mirror',
                error: 'DB_NOT_FOUND',
                message: `${path.relative(REPO_ROOT, DB_PATH)} no existe. Ejecuta npm run db:import.`,
            };
        }
        if (!Database) {
            return {
                ok: false,
                source: 'sqlite_mirror',
                error: 'DRIVER_NOT_AVAILABLE',
                message: 'better-sqlite3 no instalado. Ejecuta npm install --save-dev better-sqlite3.',
            };
        }
        return {
            ok: false,
            source: 'sqlite_mirror',
            error: 'DB_OPEN_ERROR',
            message: _openError || 'Error desconocido al abrir la BD.',
        };
    }
    return safe(() => fn(db));
}

// ──────────────────────────────────────────────────────────────────────────
// API pública
// ──────────────────────────────────────────────────────────────────────────

function getDbStatus() {
    const exists = fs.existsSync(DB_PATH);
    const stat = exists ? fs.statSync(DB_PATH) : null;
    if (!exists) {
        return {
            ok: false,
            source: 'sqlite_mirror',
            error: 'DB_NOT_FOUND',
            message: 'BD espejo no encontrada. Ejecuta npm run db:import.',
            db_path: path.relative(REPO_ROOT, DB_PATH),
            driver_available: Boolean(Database),
        };
    }
    return withDb((db) => {
        const lastImport = tableExists(db, 'import_runs')
            ? db.prepare(`SELECT id, started_at, finished_at, total_files, total_rows, status
                          FROM import_runs ORDER BY id DESC LIMIT 1`).get()
            : null;
        return {
            db_path: path.relative(REPO_ROOT, DB_PATH),
            size_bytes: stat.size,
            modified_at: stat.mtime.toISOString(),
            driver_available: true,
            last_import: lastImport || null,
        };
    });
}

function getDbSummary() {
    return withDb((db) => {
        const get1 = (sql) => {
            try { return db.prepare(sql).get(); } catch { return null; }
        };
        return {
            engines: get1('SELECT COUNT(*) AS n FROM engines')?.n ?? 0,
            total_rows: get1('SELECT COUNT(*) AS n FROM engine_rows')?.n ?? 0,
            unique_pn: get1('SELECT COUNT(*) AS n FROM part_numbers')?.n ?? 0,
            qa_reviews: get1('SELECT COUNT(*) AS n FROM qa_reviews')?.n ?? 0,
            image_refs: get1('SELECT COUNT(*) AS n FROM image_refs')?.n ?? 0,
            import_runs: get1('SELECT COUNT(*) AS n FROM import_runs')?.n ?? 0,
        };
    });
}

function getEnginesSummary() {
    return withDb((db) => {
        const rows = db.prepare(`
            SELECT e.id, e.engine_model, e.filename, e.row_count, e.imported_at
            FROM engines e
            ORDER BY e.engine_model
        `).all();
        return { count: rows.length, engines: rows };
    });
}

function getPnSummary(skuRaw) {
    const sku = String(skuRaw ?? '').trim();
    if (!sku) {
        return { ok: false, source: 'sqlite_mirror', error: 'INVALID_SKU', message: 'sku vacío' };
    }
    return withDb((db) => {
        const summary = db.prepare(`
            SELECT pn_final, occurrences, engines_count, has_gesa, has_sust,
                   has_image, has_schema, qa_decision, export_type
            FROM part_numbers WHERE pn_final = ?
        `).get(sku);
        const rows = db.prepare(`
            SELECT r.id, r.engine_id, e.engine_model, r.source_json_file, r.source_row_id,
                   r.pn_final, r.part_no_raw, r.pos, r.designation_final,
                   r.measure_final, r.weight_final,
                   r.sust_status, r.sust_hierarchie,
                   r.qa_revision_estado, r.qa_revision_accion, r.qa_revision_updated_at,
                   r.exp_imagenes, r.ruta_foto, r.ruta_esquemas_pos
            FROM engine_rows r
            JOIN engines e ON e.id = r.engine_id
            WHERE r.pn_final = ?
            ORDER BY e.engine_model, r.id
            LIMIT 500
        `).all(sku);
        return {
            pn_final: sku,
            summary: summary || null,
            rows,
            row_count: rows.length,
            found: Boolean(summary) || rows.length > 0,
        };
    });
}

function searchPartNumbers(queryRaw, limitRaw) {
    const q = String(queryRaw ?? '').trim();
    let limit = Number(limitRaw);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    limit = Math.min(limit, 500);
    if (q.length < 2) {
        return {
            ok: false,
            source: 'sqlite_mirror',
            error: 'QUERY_TOO_SHORT',
            message: 'Mínimo 2 caracteres en `q`.',
        };
    }
    return withDb((db) => {
        const like = `%${q.replace(/[%_]/g, (c) => '\\' + c)}%`;
        const rows = db.prepare(`
            SELECT pn_final, occurrences, engines_count, has_image, has_schema, qa_decision, export_type
            FROM part_numbers
            WHERE pn_final LIKE ? ESCAPE '\\'
            ORDER BY occurrences DESC, pn_final ASC
            LIMIT ?
        `).all(like, limit);
        return { query: q, limit, count: rows.length, rows };
    });
}

function getQaSummary() {
    return withDb((db) => {
        const estado = db.prepare(`
            SELECT COALESCE(NULLIF(TRIM(qa_revision_estado), ''), '(empty)') AS k, COUNT(*) AS n
            FROM engine_rows GROUP BY k ORDER BY n DESC
        `).all();
        const accion = db.prepare(`
            SELECT COALESCE(NULLIF(TRIM(qa_revision_accion), ''), '(empty)') AS k, COUNT(*) AS n
            FROM engine_rows GROUP BY k ORDER BY n DESC
        `).all();
        return {
            by_estado: estado.map((r) => ({ value: r.k, count: r.n })),
            by_accion: accion.map((r) => ({ value: r.k, count: r.n })),
        };
    });
}

function getImagesSummary() {
    return withDb((db) => {
        const totals = db.prepare(`
            SELECT
                (SELECT COUNT(*) FROM engine_rows) AS total_rows,
                (SELECT COUNT(*) FROM engine_rows
                 WHERE (COALESCE(TRIM(ruta_foto), '') <> '')
                    OR (COALESCE(TRIM(exp_imagenes), '') <> ''
                        AND exp_imagenes NOT LIKE '%sin_imagen%'
                        AND exp_imagenes NOT LIKE '%placeholder%')) AS rows_with_image,
                (SELECT COUNT(*) FROM engine_rows
                 WHERE COALESCE(TRIM(ruta_esquemas_pos), '') <> '') AS rows_with_schema,
                (SELECT COUNT(DISTINCT engine_row_id) FROM image_refs WHERE is_placeholder = 1) AS rows_with_placeholder
        `).get();
        const byKind = db.prepare(`
            SELECT kind, COUNT(*) AS n, SUM(is_placeholder) AS placeholders
            FROM image_refs GROUP BY kind ORDER BY kind
        `).all();
        return { totals, by_kind: byKind };
    });
}

function getExportCandidatesSummary() {
    return withDb((db) => {
        const byExportType = db.prepare(`
            SELECT COALESCE(export_type, '(none)') AS export_type, COUNT(*) AS pns
            FROM part_numbers GROUP BY export_type ORDER BY pns DESC
        `).all();
        const byQaDecision = db.prepare(`
            SELECT COALESCE(qa_decision, '(none)') AS qa_decision, COUNT(*) AS pns
            FROM part_numbers GROUP BY qa_decision ORDER BY pns DESC
        `).all();
        const importables = db.prepare(`
            SELECT COUNT(*) AS pns
            FROM part_numbers WHERE qa_decision = 'importar'
        `).get();
        const new_only = db.prepare(`
            SELECT COUNT(*) AS pns FROM part_numbers WHERE export_type = 'new'
        `).get();
        const superseded_only = db.prepare(`
            SELECT COUNT(*) AS pns FROM part_numbers WHERE export_type = 'superseded'
        `).get();
        const mixed = db.prepare(`
            SELECT COUNT(*) AS pns FROM part_numbers WHERE export_type = 'mixed'
        `).get();
        return {
            by_export_type: byExportType,
            by_qa_decision: byQaDecision,
            importables: importables?.pns ?? 0,
            new_only: new_only?.pns ?? 0,
            superseded_only: superseded_only?.pns ?? 0,
            mixed: mixed?.pns ?? 0,
        };
    });
}

module.exports = {
    getDbStatus,
    getDbSummary,
    getEnginesSummary,
    getPnSummary,
    searchPartNumbers,
    getQaSummary,
    getImagesSummary,
    getExportCandidatesSummary,
    _closeDb: closeDb, // útil para tests
    DB_PATH,
};
