// MILU — Fase G: capa analítica/diagnóstico SOBRE el espejo SQLite.
// SOLO LECTURA. No escribe nada, no toca engine_*.json, no exporta.
//
// Reutiliza la apertura segura de sqlite-mirror-read para no duplicar la lógica
// de manejo de errores (DB_NOT_FOUND, DRIVER_NOT_AVAILABLE, query_only=ON).

'use strict';

// Importamos sólo el helper interno de apertura vía un método público mínimo.
// Para evitar exponer la conexión, nos apoyamos en un require directo y
// replicamos el patrón withDb() local — pero usando la MISMA constante DB_PATH.
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DB_PATH = path.join(REPO_ROOT, 'data', 'db', 'milu_mirror.sqlite');

const cache = require('./analytics-cache');

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
                ok: false, source: 'sqlite_mirror', error: 'DB_NOT_FOUND',
                message: 'data/db/milu_mirror.sqlite no existe. Ejecuta npm run db:import.',
            };
        }
        if (!Database) {
            return {
                ok: false, source: 'sqlite_mirror', error: 'DRIVER_NOT_AVAILABLE',
                message: 'better-sqlite3 no instalado.',
            };
        }
        return {
            ok: false, source: 'sqlite_mirror', error: 'DB_OPEN_ERROR',
            message: _openError || 'Error desconocido al abrir la BD.',
        };
    }
    return safe(() => fn(db));
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers SQL compartidos
// ──────────────────────────────────────────────────────────────────────────

// Considera "con imagen real" a las filas con foto o exp_imagenes no-placeholder.
const HAS_REAL_IMAGE_EXPR = `
    (
        COALESCE(TRIM(r.ruta_foto), '') <> ''
        OR (
            COALESCE(TRIM(r.exp_imagenes), '') <> ''
            AND r.exp_imagenes NOT LIKE '%sin_imagen%'
            AND r.exp_imagenes NOT LIKE '%placeholder%'
        )
    )
`;
const HAS_SCHEMA_EXPR = `COALESCE(TRIM(r.ruta_esquemas_pos), '') <> ''`;
const HAS_PLACEHOLDER_EXPR = `
    (
        r.exp_imagenes LIKE '%sin_imagen%'
        OR r.exp_imagenes LIKE '%placeholder%'
    )
`;

function countWhere(db, whereSql) {
    return db.prepare(
        `SELECT COUNT(*) AS n FROM engine_rows r WHERE ${whereSql}`
    ).get()?.n ?? 0;
}

function countAccion(db, accionLike) {
    return db.prepare(`
        SELECT COUNT(*) AS n FROM engine_rows
        WHERE LOWER(TRIM(COALESCE(qa_revision_accion, ''))) LIKE ?
    `).get(accionLike)?.n ?? 0;
}

function countEstado(db, estadoLike) {
    return db.prepare(`
        SELECT COUNT(*) AS n FROM engine_rows
        WHERE LOWER(TRIM(COALESCE(qa_revision_estado, ''))) LIKE ?
    `).get(estadoLike)?.n ?? 0;
}

// ──────────────────────────────────────────────────────────────────────────
// 1) /db/analytics/overview
// ──────────────────────────────────────────────────────────────────────────
function getOverview() {
    return withDb((db) => {
        const total_rows = db.prepare('SELECT COUNT(*) AS n FROM engine_rows').get()?.n ?? 0;
        const unique_pn = db.prepare('SELECT COUNT(*) AS n FROM part_numbers').get()?.n ?? 0;
        const total_engines = db.prepare('SELECT COUNT(*) AS n FROM engines').get()?.n ?? 0;

        const qa_ok = countEstado(db, 'ok');
        const qa_pending = countEstado(db, '%pend%');
        const qa_importar = countAccion(db, '%import%');
        const qa_revisar = countAccion(db, '%revis%');
        const qa_eliminar = countAccion(db, '%elimin%');
        const qa_copia = countAccion(db, '%copi%');

        const rows_with_images = countWhere(db, HAS_REAL_IMAGE_EXPR);
        const rows_with_schema = countWhere(db, HAS_SCHEMA_EXPR);
        const rows_with_placeholder = countWhere(db, HAS_PLACEHOLDER_EXPR);
        const rows_without_images = countWhere(db, `NOT ${HAS_REAL_IMAGE_EXPR}`);
        const rows_without_schema = countWhere(db, `NOT (${HAS_SCHEMA_EXPR})`);

        const new_count = db.prepare(
            `SELECT COUNT(*) AS n FROM part_numbers WHERE export_type = 'new'`
        ).get()?.n ?? 0;
        const superseded_count = db.prepare(
            `SELECT COUNT(*) AS n FROM part_numbers WHERE export_type = 'superseded'`
        ).get()?.n ?? 0;

        return {
            total_rows,
            unique_pn,
            total_engines,
            qa_ok,
            qa_pending,
            qa_importar,
            qa_revisar,
            qa_eliminar,
            qa_copia,
            rows_with_images,
            rows_with_schema,
            rows_with_placeholder,
            rows_without_images,
            rows_without_schema,
            new_count,
            superseded_count,
            generated_at: new Date().toISOString(),
        };
    });
}

// ──────────────────────────────────────────────────────────────────────────
// 2) /db/analytics/engines
// ──────────────────────────────────────────────────────────────────────────
function getEngineAnalytics() {
    return withDb((db) => {
        const rows = db.prepare(`
            SELECT
                e.id,
                e.engine_model,
                e.filename,
                e.row_count,
                COUNT(DISTINCT r.pn_final) AS unique_pn,
                SUM(CASE WHEN ${HAS_PLACEHOLDER_EXPR} THEN 1 ELSE 0 END) AS placeholders,
                SUM(CASE WHEN NOT ${HAS_REAL_IMAGE_EXPR} THEN 1 ELSE 0 END) AS without_images,
                SUM(CASE WHEN NOT (${HAS_SCHEMA_EXPR}) THEN 1 ELSE 0 END) AS without_schema,
                SUM(CASE WHEN LOWER(TRIM(COALESCE(r.qa_revision_estado, ''))) LIKE '%pend%' THEN 1 ELSE 0 END) AS qa_pending,
                SUM(CASE WHEN LOWER(TRIM(COALESCE(r.qa_revision_estado, ''))) = 'ok' THEN 1 ELSE 0 END) AS qa_ok
            FROM engines e
            LEFT JOIN engine_rows r ON r.engine_id = e.id
            GROUP BY e.id
            ORDER BY e.engine_model
        `).all();
        return { count: rows.length, engines: rows };
    });
}

// ──────────────────────────────────────────────────────────────────────────
// 3) /db/analytics/images
// ──────────────────────────────────────────────────────────────────────────
function getImageAnalytics() {
    return withDb((db) => {
        const total_image_refs = db.prepare('SELECT COUNT(*) AS n FROM image_refs').get()?.n ?? 0;
        const placeholders = db.prepare(
            `SELECT COUNT(*) AS n FROM image_refs WHERE is_placeholder = 1`
        ).get()?.n ?? 0;
        const real_images = db.prepare(
            `SELECT COUNT(*) AS n FROM image_refs WHERE is_placeholder = 0`
        ).get()?.n ?? 0;

        const rows_with_ruta_foto = countWhere(db, `COALESCE(TRIM(r.ruta_foto), '') <> ''`);
        const rows_with_ruta_esquemas_pos = countWhere(db, HAS_SCHEMA_EXPR);
        const rows_without_any_image = countWhere(db,
            `NOT ${HAS_REAL_IMAGE_EXPR} AND NOT (${HAS_SCHEMA_EXPR})`
        );

        const top_engines_without_image = db.prepare(`
            SELECT e.engine_model,
                   SUM(CASE WHEN NOT ${HAS_REAL_IMAGE_EXPR} THEN 1 ELSE 0 END) AS rows_without_image
            FROM engines e
            JOIN engine_rows r ON r.engine_id = e.id
            GROUP BY e.id
            ORDER BY rows_without_image DESC
            LIMIT 10
        `).all();

        const top_engines_with_placeholders = db.prepare(`
            SELECT e.engine_model,
                   SUM(CASE WHEN ${HAS_PLACEHOLDER_EXPR} THEN 1 ELSE 0 END) AS placeholders
            FROM engines e
            JOIN engine_rows r ON r.engine_id = e.id
            GROUP BY e.id
            ORDER BY placeholders DESC
            LIMIT 10
        `).all();

        return {
            total_image_refs,
            placeholders,
            real_images,
            rows_with_ruta_foto,
            rows_with_ruta_esquemas_pos,
            rows_without_any_image,
            top_engines_without_image,
            top_engines_with_placeholders,
        };
    });
}

// ──────────────────────────────────────────────────────────────────────────
// 4) /db/analytics/qa
// ──────────────────────────────────────────────────────────────────────────
function getQaAnalytics() {
    return withDb((db) => {
        const by_estado = db.prepare(`
            SELECT COALESCE(NULLIF(TRIM(qa_revision_estado), ''), '(empty)') AS value,
                   COUNT(*) AS count
            FROM engine_rows
            GROUP BY value ORDER BY count DESC
        `).all();
        const by_accion = db.prepare(`
            SELECT COALESCE(NULLIF(TRIM(qa_revision_accion), ''), '(empty)') AS value,
                   COUNT(*) AS count
            FROM engine_rows
            GROUP BY value ORDER BY count DESC
        `).all();
        const combinations = db.prepare(`
            SELECT
                COALESCE(NULLIF(TRIM(qa_revision_estado), ''), '(empty)') AS estado,
                COALESCE(NULLIF(TRIM(qa_revision_accion), ''), '(empty)') AS accion,
                COUNT(*) AS count
            FROM engine_rows
            GROUP BY estado, accion
            ORDER BY count DESC
            LIMIT 50
        `).all();

        const top_pn_conflicts = db.prepare(`
            SELECT r.pn_final,
                   COUNT(DISTINCT TRIM(COALESCE(r.qa_revision_estado, ''))
                                  || '|' || TRIM(COALESCE(r.qa_revision_accion, ''))) AS variants,
                   COUNT(*) AS rows_count,
                   COUNT(DISTINCT r.engine_id) AS engines_count
            FROM engine_rows r
            WHERE r.pn_final IS NOT NULL AND r.pn_final <> ''
            GROUP BY r.pn_final
            HAVING variants > 1
            ORDER BY variants DESC, rows_count DESC
            LIMIT 50
        `).all();

        const top_engines_pending = db.prepare(`
            SELECT e.engine_model,
                   SUM(CASE WHEN LOWER(TRIM(COALESCE(r.qa_revision_estado, ''))) LIKE '%pend%'
                            THEN 1 ELSE 0 END) AS qa_pending
            FROM engines e
            JOIN engine_rows r ON r.engine_id = e.id
            GROUP BY e.id
            ORDER BY qa_pending DESC
            LIMIT 10
        `).all();

        // Filas con combinaciones ambiguas.
        const ambig_ok_revisar = countWhere(db,
            `LOWER(TRIM(COALESCE(r.qa_revision_estado, ''))) = 'ok'
             AND LOWER(TRIM(COALESCE(r.qa_revision_accion, ''))) LIKE '%revis%'`);
        const ambig_pending_importar = countWhere(db,
            `LOWER(TRIM(COALESCE(r.qa_revision_estado, ''))) LIKE '%pend%'
             AND LOWER(TRIM(COALESCE(r.qa_revision_accion, ''))) LIKE '%import%'`);
        const ambig_ok_eliminar = countWhere(db,
            `LOWER(TRIM(COALESCE(r.qa_revision_estado, ''))) = 'ok'
             AND LOWER(TRIM(COALESCE(r.qa_revision_accion, ''))) LIKE '%elimin%'`);
        const ambig_pending_ok_accion = countWhere(db,
            `LOWER(TRIM(COALESCE(r.qa_revision_estado, ''))) LIKE '%pend%'
             AND LOWER(TRIM(COALESCE(r.qa_revision_accion, ''))) = 'ok'`);

        return {
            by_estado,
            by_accion,
            combinations,
            top_pn_conflicts,
            top_engines_pending,
            ambiguous: {
                ok_revisar: ambig_ok_revisar,
                pending_importar: ambig_pending_importar,
                ok_eliminar: ambig_ok_eliminar,
                pending_accion_ok: ambig_pending_ok_accion,
            },
        };
    });
}

// ──────────────────────────────────────────────────────────────────────────
// 5) /db/analytics/pn-conflicts
// ──────────────────────────────────────────────────────────────────────────
function getPnConflicts() {
    return withDb((db) => {
        const multi_engine = db.prepare(`
            SELECT pn_final, engines_count, occurrences
            FROM part_numbers
            WHERE engines_count > 1
            ORDER BY engines_count DESC, occurrences DESC
            LIMIT 100
        `).all();

        const multi_sust = db.prepare(`
            SELECT r.pn_final,
                   COUNT(DISTINCT TRIM(COALESCE(r.sust_hierarchie, ''))) AS variants,
                   COUNT(*) AS rows_count
            FROM engine_rows r
            WHERE r.pn_final IS NOT NULL AND r.pn_final <> ''
            GROUP BY r.pn_final
            HAVING variants > 1
            ORDER BY variants DESC, rows_count DESC
            LIMIT 100
        `).all();

        const multi_designation = db.prepare(`
            SELECT r.pn_final,
                   COUNT(DISTINCT TRIM(COALESCE(r.designation_final, ''))) AS variants,
                   COUNT(*) AS rows_count
            FROM engine_rows r
            WHERE r.pn_final IS NOT NULL AND r.pn_final <> ''
            GROUP BY r.pn_final
            HAVING variants > 1
            ORDER BY variants DESC, rows_count DESC
            LIMIT 100
        `).all();

        const multi_measure = db.prepare(`
            SELECT r.pn_final,
                   COUNT(DISTINCT TRIM(COALESCE(r.measure_final, ''))) AS variants,
                   COUNT(*) AS rows_count
            FROM engine_rows r
            WHERE r.pn_final IS NOT NULL AND r.pn_final <> ''
            GROUP BY r.pn_final
            HAVING variants > 1
            ORDER BY variants DESC, rows_count DESC
            LIMIT 100
        `).all();

        const multi_weight = db.prepare(`
            SELECT r.pn_final,
                   COUNT(DISTINCT TRIM(COALESCE(r.weight_final, ''))) AS variants,
                   COUNT(*) AS rows_count
            FROM engine_rows r
            WHERE r.pn_final IS NOT NULL AND r.pn_final <> ''
            GROUP BY r.pn_final
            HAVING variants > 1
            ORDER BY variants DESC, rows_count DESC
            LIMIT 100
        `).all();

        return {
            summary: {
                multi_engine_total: db.prepare(
                    `SELECT COUNT(*) AS n FROM part_numbers WHERE engines_count > 1`
                ).get()?.n ?? 0,
                multi_sust_total: multi_sust.length,
                multi_designation_total: multi_designation.length,
                multi_measure_total: multi_measure.length,
                multi_weight_total: multi_weight.length,
            },
            multi_engine,
            multi_sust,
            multi_designation,
            multi_measure,
            multi_weight,
        };
    });
}

// ──────────────────────────────────────────────────────────────────────────
// 6) /db/analytics/export
// ──────────────────────────────────────────────────────────────────────────
function getExportAnalytics() {
    return withDb((db) => {
        const get1 = (sql, ...args) => db.prepare(sql).get(...args)?.n ?? 0;

        const import_candidates = get1(
            `SELECT COUNT(*) AS n FROM part_numbers WHERE LOWER(COALESCE(qa_decision, '')) = 'importar'`
        );
        const discard_candidates = get1(
            `SELECT COUNT(*) AS n FROM part_numbers
             WHERE LOWER(COALESCE(qa_decision, '')) IN ('eliminar', 'descartar')`
        );
        const pending_review = get1(
            `SELECT COUNT(*) AS n FROM part_numbers
             WHERE COALESCE(qa_decision, '') = '' OR LOWER(qa_decision) LIKE '%pend%' OR LOWER(qa_decision) LIKE '%revis%'`
        );
        const new_count = get1(`SELECT COUNT(*) AS n FROM part_numbers WHERE export_type = 'new'`);
        const superseded_count = get1(`SELECT COUNT(*) AS n FROM part_numbers WHERE export_type = 'superseded'`);
        const mixed_count = get1(`SELECT COUNT(*) AS n FROM part_numbers WHERE export_type = 'mixed'`);

        // "Top reasons de pending": agrupado por estado/acción de las filas cuyo
        // pn_final está en part_numbers como pending (qa_decision vacío/pend/revis).
        const top_reasons = db.prepare(`
            SELECT
                COALESCE(NULLIF(TRIM(r.qa_revision_estado), ''), '(empty)') AS estado,
                COALESCE(NULLIF(TRIM(r.qa_revision_accion), ''), '(empty)') AS accion,
                COUNT(*) AS rows_count,
                COUNT(DISTINCT r.pn_final) AS pns_count
            FROM engine_rows r
            JOIN part_numbers p ON p.pn_final = r.pn_final
            WHERE COALESCE(p.qa_decision, '') = ''
               OR LOWER(p.qa_decision) LIKE '%pend%'
               OR LOWER(p.qa_decision) LIKE '%revis%'
            GROUP BY estado, accion
            ORDER BY rows_count DESC
            LIMIT 20
        `).all();

        const top_engines_pending = db.prepare(`
            SELECT e.engine_model,
                   COUNT(DISTINCT r.pn_final) AS pns_pending
            FROM engines e
            JOIN engine_rows r ON r.engine_id = e.id
            JOIN part_numbers p ON p.pn_final = r.pn_final
            WHERE COALESCE(p.qa_decision, '') = ''
               OR LOWER(p.qa_decision) LIKE '%pend%'
               OR LOWER(p.qa_decision) LIKE '%revis%'
            GROUP BY e.id
            ORDER BY pns_pending DESC
            LIMIT 10
        `).all();

        return {
            import_candidates,
            discard_candidates,
            pending_review,
            new_count,
            superseded_count,
            mixed_count,
            top_reasons,
            top_engines_pending,
        };
    });
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers de paginación
// ──────────────────────────────────────────────────────────────────────────
function parsePaging(opts = {}) {
    const MAX_LIMIT = 500;
    const DEFAULT_LIMIT = 100;
    let limit = Number.parseInt(opts.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    let offset = Number.parseInt(opts.offset, 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
    return { limit, offset };
}

// ──────────────────────────────────────────────────────────────────────────
// Drilldown: /db/analytics/engine/:engine
// ──────────────────────────────────────────────────────────────────────────
function getEngineDetail(engineModel, opts = {}) {
    if (!engineModel || typeof engineModel !== 'string') {
        return { ok: false, source: 'sqlite_mirror', error: 'INVALID_PARAM', message: 'engine requerido' };
    }
    const { limit, offset } = parsePaging(opts);
    return withDb((db) => {
        const engine = db.prepare(
            `SELECT id, engine_model, filename, row_count FROM engines WHERE engine_model = ?`
        ).get(engineModel);
        if (!engine) {
            return { found: false, engine_model: engineModel, limit, offset };
        }
        const stats = db.prepare(`
            SELECT
                COUNT(*) AS total_rows,
                COUNT(DISTINCT r.pn_final) AS unique_pn,
                SUM(CASE WHEN ${HAS_PLACEHOLDER_EXPR} THEN 1 ELSE 0 END) AS placeholders,
                SUM(CASE WHEN NOT ${HAS_REAL_IMAGE_EXPR} THEN 1 ELSE 0 END) AS without_images,
                SUM(CASE WHEN NOT (${HAS_SCHEMA_EXPR}) THEN 1 ELSE 0 END) AS without_schema,
                SUM(CASE WHEN LOWER(TRIM(COALESCE(r.qa_revision_estado, ''))) LIKE '%pend%' THEN 1 ELSE 0 END) AS qa_pending,
                SUM(CASE WHEN LOWER(TRIM(COALESCE(r.qa_revision_estado, ''))) = 'ok' THEN 1 ELSE 0 END) AS qa_ok
            FROM engine_rows r WHERE r.engine_id = ?
        `).get(engine.id);
        const rows = db.prepare(`
            SELECT r.source_row_id, r.pn_final, r.part_no_raw, r.designation_final,
                   r.qa_revision_estado, r.qa_revision_accion,
                   r.sust_hierarchie, r.measure_final, r.weight_final,
                   (${HAS_REAL_IMAGE_EXPR}) AS has_image,
                   (${HAS_PLACEHOLDER_EXPR}) AS has_placeholder,
                   (${HAS_SCHEMA_EXPR}) AS has_schema
            FROM engine_rows r WHERE r.engine_id = ?
            ORDER BY r.source_row_id LIMIT ? OFFSET ?
        `).all(engine.id, limit, offset);
        return { found: true, engine, stats, rows, limit, offset, returned: rows.length };
    });
}

// ──────────────────────────────────────────────────────────────────────────
// Drilldown: /db/analytics/pn/:sku
// ──────────────────────────────────────────────────────────────────────────
function getPnDetail(pn) {
    if (!pn || typeof pn !== 'string') {
        return { ok: false, source: 'sqlite_mirror', error: 'INVALID_PARAM', message: 'sku requerido' };
    }
    return withDb((db) => {
        const pn_row = db.prepare(`SELECT * FROM part_numbers WHERE pn_final = ?`).get(pn);
        const rows = db.prepare(`
            SELECT r.source_row_id, e.engine_model, r.pn_final, r.part_no_raw, r.designation_final,
                   r.qa_revision_estado, r.qa_revision_accion,
                   r.sust_hierarchie, r.measure_final, r.weight_final,
                   (${HAS_REAL_IMAGE_EXPR}) AS has_image,
                   (${HAS_PLACEHOLDER_EXPR}) AS has_placeholder,
                   (${HAS_SCHEMA_EXPR}) AS has_schema
            FROM engine_rows r
            JOIN engines e ON e.id = r.engine_id
            WHERE r.pn_final = ?
            ORDER BY e.engine_model, r.source_row_id
        `).all(pn);
        const engines = [...new Set(rows.map((r) => r.engine_model))];
        const distinct = (key) => [...new Set(rows.map((r) => (r[key] || '').trim()).filter(Boolean))];
        return {
            found: rows.length > 0,
            pn_final: pn,
            summary: pn_row || null,
            engines,
            rows_count: rows.length,
            engines_count: engines.length,
            distinct_designations: distinct('designation_final'),
            distinct_sust: distinct('sust_hierarchie'),
            distinct_measures: distinct('measure_final'),
            distinct_weights: distinct('weight_final'),
            rows,
        };
    });
}

// ──────────────────────────────────────────────────────────────────────────
// Drilldown: /db/analytics/qa/pending
// ──────────────────────────────────────────────────────────────────────────
function getQaPending(opts = {}) {
    const { limit, offset } = parsePaging(opts);
    return withDb((db) => {
        const total = db.prepare(`
            SELECT COUNT(*) AS n FROM engine_rows r
            WHERE LOWER(TRIM(COALESCE(r.qa_revision_estado, ''))) LIKE '%pend%'
        `).get()?.n ?? 0;
        const rows = db.prepare(`
            SELECT r.source_row_id, e.engine_model, r.pn_final, r.designation_final,
                   r.qa_revision_estado, r.qa_revision_accion, r.sust_hierarchie,
                   (${HAS_REAL_IMAGE_EXPR}) AS has_image
            FROM engine_rows r JOIN engines e ON e.id = r.engine_id
            WHERE LOWER(TRIM(COALESCE(r.qa_revision_estado, ''))) LIKE '%pend%'
            ORDER BY e.engine_model, r.source_row_id
            LIMIT ? OFFSET ?
        `).all(limit, offset);
        return { total, limit, offset, returned: rows.length, rows };
    });
}

// ──────────────────────────────────────────────────────────────────────────
// Drilldown: /db/analytics/images/missing
// ──────────────────────────────────────────────────────────────────────────
function getMissingImages(opts = {}) {
    const { limit, offset } = parsePaging(opts);
    return withDb((db) => {
        const where = `NOT ${HAS_REAL_IMAGE_EXPR}`;
        const total = db.prepare(
            `SELECT COUNT(*) AS n FROM engine_rows r WHERE ${where}`
        ).get()?.n ?? 0;
        const rows = db.prepare(`
            SELECT r.source_row_id, e.engine_model, r.pn_final, r.designation_final,
                   r.exp_imagenes, r.ruta_foto, r.ruta_esquemas_pos,
                   (${HAS_SCHEMA_EXPR}) AS has_schema
            FROM engine_rows r JOIN engines e ON e.id = r.engine_id
            WHERE ${where}
            ORDER BY e.engine_model, r.source_row_id
            LIMIT ? OFFSET ?
        `).all(limit, offset);
        return { total, limit, offset, returned: rows.length, rows };
    });
}

// ──────────────────────────────────────────────────────────────────────────
// Drilldown: /db/analytics/images/placeholders
// ──────────────────────────────────────────────────────────────────────────
function getPlaceholderImages(opts = {}) {
    const { limit, offset } = parsePaging(opts);
    return withDb((db) => {
        const where = HAS_PLACEHOLDER_EXPR;
        const total = db.prepare(
            `SELECT COUNT(*) AS n FROM engine_rows r WHERE ${where}`
        ).get()?.n ?? 0;
        const rows = db.prepare(`
            SELECT r.source_row_id, e.engine_model, r.pn_final, r.designation_final,
                   r.exp_imagenes, r.ruta_foto
            FROM engine_rows r JOIN engines e ON e.id = r.engine_id
            WHERE ${where}
            ORDER BY e.engine_model, r.source_row_id
            LIMIT ? OFFSET ?
        `).all(limit, offset);
        return { total, limit, offset, returned: rows.length, rows };
    });
}

// ──────────────────────────────────────────────────────────────────────────
// Drilldown: /db/analytics/export/pending
// ──────────────────────────────────────────────────────────────────────────
function getExportPending(opts = {}) {
    const { limit, offset } = parsePaging(opts);
    return withDb((db) => {
        const total = db.prepare(`
            SELECT COUNT(*) AS n FROM part_numbers p
            WHERE COALESCE(p.qa_decision, '') = ''
               OR LOWER(p.qa_decision) LIKE '%pend%'
               OR LOWER(p.qa_decision) LIKE '%revis%'
        `).get()?.n ?? 0;
        const rows = db.prepare(`
            SELECT p.pn_final, p.engines_count, p.occurrences, p.has_gesa, p.has_sust,
                   p.has_image, p.has_schema, p.qa_decision, p.export_type
            FROM part_numbers p
            WHERE COALESCE(p.qa_decision, '') = ''
               OR LOWER(p.qa_decision) LIKE '%pend%'
               OR LOWER(p.qa_decision) LIKE '%revis%'
            ORDER BY p.engines_count DESC, p.occurrences DESC, p.pn_final
            LIMIT ? OFFSET ?
        `).all(limit, offset);
        return { total, limit, offset, returned: rows.length, rows };
    });
}

// ──────────────────────────────────────────────────────────────────────────
// Search: /db/analytics/search?q=...
// Busca en pn_final, part_no_raw, designation_final con LIKE %q%.
// ──────────────────────────────────────────────────────────────────────────
function searchPn(opts = {}) {
    const q = String(opts.q || '').trim();
    if (q.length < 2) {
        return { ok: false, source: 'sqlite_mirror', error: 'INVALID_PARAM', message: 'q debe tener al menos 2 caracteres' };
    }
    const { limit, offset } = parsePaging(opts);
    const like = `%${q}%`;
    return withDb((db) => {
        // Total agrupado por pn_final.
        const total = db.prepare(`
            SELECT COUNT(DISTINCT r.pn_final) AS n
            FROM engine_rows r
            WHERE r.pn_final LIKE ?
               OR r.part_no_raw LIKE ?
               OR r.designation_final LIKE ?
        `).get(like, like, like)?.n ?? 0;

        const rows = db.prepare(`
            SELECT r.pn_final,
                   GROUP_CONCAT(DISTINCT e.engine_model) AS engines,
                   COUNT(*) AS rows_count,
                   COUNT(DISTINCT r.engine_id) AS engines_count,
                   MAX(${HAS_REAL_IMAGE_EXPR}) AS any_image,
                   GROUP_CONCAT(DISTINCT TRIM(COALESCE(r.designation_final, ''))) AS designations,
                   GROUP_CONCAT(DISTINCT TRIM(COALESCE(r.sust_hierarchie, ''))) AS sust_hierarchies
            FROM engine_rows r
            JOIN engines e ON e.id = r.engine_id
            WHERE r.pn_final LIKE ?
               OR r.part_no_raw LIKE ?
               OR r.designation_final LIKE ?
            GROUP BY r.pn_final
            ORDER BY engines_count DESC, rows_count DESC, r.pn_final
            LIMIT ? OFFSET ?
        `).all(like, like, like, limit, offset);

        return { q, total, limit, offset, returned: rows.length, results: rows };
    });
}

module.exports = {
    // Versiones cacheadas (uso público / endpoints).
    getOverview: () => cache.withCache('overview', undefined, () => getOverview()),
    getEngineAnalytics: () => cache.withCache('engines', undefined, () => getEngineAnalytics()),
    getImageAnalytics: () => cache.withCache('images', undefined, () => getImageAnalytics()),
    getQaAnalytics: () => cache.withCache('qa', undefined, () => getQaAnalytics()),
    getPnConflicts: () => cache.withCache('pn_conflicts', undefined, () => getPnConflicts()),
    getExportAnalytics: () => cache.withCache('export', undefined, () => getExportAnalytics()),

    // Versiones sin cache (útiles para tests).
    _getOverviewRaw: getOverview,
    _getEngineAnalyticsRaw: getEngineAnalytics,
    _getImageAnalyticsRaw: getImageAnalytics,
    _getQaAnalyticsRaw: getQaAnalytics,
    _getPnConflictsRaw: getPnConflicts,
    _getExportAnalyticsRaw: getExportAnalytics,

    // Drilldowns y search (sin cache: dependen de params).
    getEngineDetail,
    getPnDetail,
    getQaPending,
    getMissingImages,
    getPlaceholderImages,
    getExportPending,
    searchPn,

    // Cache control.
    cache,

    _closeDb: closeDb,
    DB_PATH,
};
