#!/usr/bin/env node
// MILU — Importa los 9 engine_*.json a data/db/milu_mirror.sqlite.
//
// SOLO LECTURA respecto a los JSON. No los modifica.
// La BD resultante es regenerable: se hace DROP + CREATE de las tablas espejo.
//
// Uso:
//   npm run db:import
//
// Requiere la dependencia `better-sqlite3` instalada.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DB_DIR = path.join(REPO_ROOT, 'data', 'db');
const DB_PATH = path.join(DB_DIR, 'milu_mirror.sqlite');

const ENGINE_FILES = [
    'engine_12V4000M40A.json',
    'engine_12V4000M53.json',
    'engine_12V4000M70.json',
    'engine_16V4000M61.json',
    'engine_16V4000M73.json',
    'engine_16V4000M73L.json',
    'engine_16V4000M90.json',
    'engine_20V4000M93.json',
    'engine_20V4000M93L.json',
];

let Database;
try {
    Database = require('better-sqlite3');
} catch (err) {
    console.error('[db:import] Falta la dependencia `better-sqlite3`.');
    console.error('  Instálala con:  npm install --save-dev better-sqlite3');
    console.error('  Detalle:', err.message);
    process.exit(2);
}

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function nowIso() { return new Date().toISOString(); }
function isEmpty(v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
function strOrNull(v) { return isEmpty(v) ? null : String(v); }

function engineModelFromFile(file) {
    const m = /^engine_(.+)\.json$/i.exec(file);
    return m ? m[1] : file;
}

function pickPn(row) {
    return strOrNull(row.pn_final) || strOrNull(row['PART NO.']) || strOrNull(row.pn_raw);
}

function isPlaceholder(value) {
    if (isEmpty(value)) return 0;
    return /sin[_-]?imagen|placeholder/i.test(String(value)) ? 1 : 0;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS engines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    engine_model TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS engine_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    engine_id INTEGER NOT NULL,
    source_json_file TEXT NOT NULL,
    source_row_id TEXT,
    pn_final TEXT,
    part_no_raw TEXT,
    pos TEXT,
    libro TEXT,
    source_page TEXT,
    designation_final TEXT,
    measure_final TEXT,
    weight_final TEXT,
    sust_status TEXT,
    sust_hierarchie TEXT,
    qa_revision_estado TEXT,
    qa_revision_accion TEXT,
    qa_revision_updated_at TEXT,
    exp_imagenes TEXT,
    ruta_foto TEXT,
    ruta_esquemas_pos TEXT,
    raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_engine_rows_engine ON engine_rows(engine_id);
CREATE INDEX IF NOT EXISTS idx_engine_rows_pn ON engine_rows(pn_final);
CREATE INDEX IF NOT EXISTS idx_engine_rows_estado ON engine_rows(qa_revision_estado);
CREATE INDEX IF NOT EXISTS idx_engine_rows_accion ON engine_rows(qa_revision_accion);
CREATE INDEX IF NOT EXISTS idx_engine_rows_sust ON engine_rows(sust_hierarchie);
-- Fase H.1: índices compuestos / auxiliares para drilldown y agregados.
CREATE INDEX IF NOT EXISTS idx_engine_rows_source_row_id ON engine_rows(source_row_id);
CREATE INDEX IF NOT EXISTS idx_engine_rows_pn_estado_accion ON engine_rows(pn_final, qa_revision_estado, qa_revision_accion);
CREATE INDEX IF NOT EXISTS idx_engine_rows_engine_pn ON engine_rows(engine_id, pn_final);
CREATE INDEX IF NOT EXISTS idx_engine_rows_part_no_raw ON engine_rows(part_no_raw);
CREATE INDEX IF NOT EXISTS idx_engine_rows_estado_accion ON engine_rows(qa_revision_estado, qa_revision_accion);

CREATE TABLE IF NOT EXISTS part_numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pn_final TEXT NOT NULL UNIQUE,
    occurrences INTEGER NOT NULL DEFAULT 0,
    engines_count INTEGER NOT NULL DEFAULT 0,
    has_gesa INTEGER NOT NULL DEFAULT 0,
    has_sust INTEGER NOT NULL DEFAULT 0,
    has_image INTEGER NOT NULL DEFAULT 0,
    has_schema INTEGER NOT NULL DEFAULT 0,
    qa_decision TEXT,
    export_type TEXT
);
CREATE INDEX IF NOT EXISTS idx_pn_qa ON part_numbers(qa_decision);
CREATE INDEX IF NOT EXISTS idx_pn_export ON part_numbers(export_type);
CREATE INDEX IF NOT EXISTS idx_part_numbers_export_qa ON part_numbers(export_type, qa_decision);
CREATE INDEX IF NOT EXISTS idx_part_numbers_engines_count ON part_numbers(engines_count);

CREATE TABLE IF NOT EXISTS qa_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    engine_row_id INTEGER NOT NULL,
    qa_revision_estado TEXT,
    qa_revision_accion TEXT,
    qa_revision_updated_at TEXT,
    source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qa_row ON qa_reviews(engine_row_id);
CREATE INDEX IF NOT EXISTS idx_qa_estado ON qa_reviews(qa_revision_estado);
CREATE INDEX IF NOT EXISTS idx_qa_accion ON qa_reviews(qa_revision_accion);

CREATE TABLE IF NOT EXISTS image_refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    engine_row_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    value TEXT,
    is_placeholder INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_img_row ON image_refs(engine_row_id);
CREATE INDEX IF NOT EXISTS idx_img_kind ON image_refs(kind);
CREATE INDEX IF NOT EXISTS idx_img_placeholder ON image_refs(is_placeholder);

CREATE TABLE IF NOT EXISTS import_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    source TEXT NOT NULL,
    total_files INTEGER,
    total_rows INTEGER,
    status TEXT,
    notes TEXT
);
`;

function rebuildMirrorTables(db) {
    // import_runs se conserva (histórico append-only). Las demás se regeneran.
    db.exec(`
        DROP TABLE IF EXISTS image_refs;
        DROP TABLE IF EXISTS qa_reviews;
        DROP TABLE IF EXISTS part_numbers;
        DROP TABLE IF EXISTS engine_rows;
        DROP TABLE IF EXISTS engines;
    `);
    db.exec(SCHEMA);
}

function insertRows(db, fileList) {
    const insEngine = db.prepare(`
        INSERT INTO engines (engine_model, filename, row_count, imported_at)
        VALUES (?, ?, ?, ?)
    `);
    const insRow = db.prepare(`
        INSERT INTO engine_rows (
            engine_id, source_json_file, source_row_id, pn_final, part_no_raw,
            pos, libro, source_page, designation_final, measure_final, weight_final,
            sust_status, sust_hierarchie,
            qa_revision_estado, qa_revision_accion, qa_revision_updated_at,
            exp_imagenes, ruta_foto, ruta_esquemas_pos, raw_json
        ) VALUES (
            @engine_id, @source_json_file, @source_row_id, @pn_final, @part_no_raw,
            @pos, @libro, @source_page, @designation_final, @measure_final, @weight_final,
            @sust_status, @sust_hierarchie,
            @qa_revision_estado, @qa_revision_accion, @qa_revision_updated_at,
            @exp_imagenes, @ruta_foto, @ruta_esquemas_pos, @raw_json
        )
    `);
    const insQa = db.prepare(`
        INSERT INTO qa_reviews (engine_row_id, qa_revision_estado, qa_revision_accion, qa_revision_updated_at, source)
        VALUES (?, ?, ?, ?, 'engine_json')
    `);
    const insImg = db.prepare(`
        INSERT INTO image_refs (engine_row_id, kind, value, is_placeholder) VALUES (?, ?, ?, ?)
    `);

    let totalRows = 0;
    const imported_at = nowIso();
    const txn = db.transaction(() => {
        for (const file of fileList) {
            const fullPath = path.join(REPO_ROOT, file);
            if (!fs.existsSync(fullPath)) {
                console.warn(`[db:import] WARN: no existe ${file}, se omite.`);
                continue;
            }
            let data;
            try {
                data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            } catch (err) {
                console.warn(`[db:import] WARN: error parseando ${file}: ${err.message}`);
                continue;
            }
            if (!Array.isArray(data)) {
                console.warn(`[db:import] WARN: ${file} no es array, se omite.`);
                continue;
            }
            const engineModel = engineModelFromFile(file);
            const engineRes = insEngine.run(engineModel, file, data.length, imported_at);
            const engineId = engineRes.lastInsertRowid;

            for (const row of data) {
                if (!row || typeof row !== 'object') continue;
                const rec = {
                    engine_id: engineId,
                    source_json_file: file,
                    source_row_id: strOrNull(row.ID),
                    pn_final: pickPn(row),
                    part_no_raw: strOrNull(row['PART NO.']),
                    pos: strOrNull(row.POS ?? row.pos),
                    libro: strOrNull(row.libro ?? row.LIBRO),
                    source_page: strOrNull(row.source_page ?? row.PAGINA ?? row.pagina),
                    designation_final: strOrNull(row.designation_final ?? row.DESIGNATION),
                    measure_final: strOrNull(row.measure_final),
                    weight_final: strOrNull(row.weight_final),
                    sust_status: strOrNull(row.sust_status),
                    sust_hierarchie: strOrNull(row.sust_hierarchie),
                    qa_revision_estado: strOrNull(row.qa_revision_estado),
                    qa_revision_accion: strOrNull(row.qa_revision_accion),
                    qa_revision_updated_at: strOrNull(row.qa_revision_updated_at),
                    exp_imagenes: strOrNull(row.exp_imagenes),
                    ruta_foto: strOrNull(row.ruta_foto),
                    ruta_esquemas_pos: strOrNull(row.ruta_esquemas_pos),
                    raw_json: JSON.stringify(row),
                };
                const r = insRow.run(rec);
                const rowId = r.lastInsertRowid;

                insQa.run(rowId, rec.qa_revision_estado, rec.qa_revision_accion, rec.qa_revision_updated_at);

                if (!isEmpty(rec.ruta_foto)) {
                    insImg.run(rowId, 'foto', rec.ruta_foto, isPlaceholder(rec.ruta_foto));
                }
                if (!isEmpty(rec.ruta_esquemas_pos)) {
                    insImg.run(rowId, 'esquema', rec.ruta_esquemas_pos, isPlaceholder(rec.ruta_esquemas_pos));
                }
                if (!isEmpty(rec.exp_imagenes)) {
                    insImg.run(rowId, 'exp_imagenes', rec.exp_imagenes, isPlaceholder(rec.exp_imagenes));
                }

                totalRows++;
            }
        }
    });
    txn();
    return totalRows;
}

function rebuildPartNumbers(db) {
    // qa_decision: prioridad importar > revisar > eliminar > copia
    db.exec(`
        INSERT INTO part_numbers (pn_final, occurrences, engines_count, has_gesa, has_sust, has_image, has_schema, qa_decision, export_type)
        SELECT
            r.pn_final,
            COUNT(*) AS occurrences,
            COUNT(DISTINCT r.engine_id) AS engines_count,
            MAX(CASE WHEN json_extract(r.raw_json, '$.pn_gesa') IS NOT NULL
                          AND TRIM(COALESCE(json_extract(r.raw_json, '$.pn_gesa'), '')) <> '' THEN 1 ELSE 0 END) AS has_gesa,
            MAX(CASE WHEN COALESCE(TRIM(r.sust_hierarchie), '') <> '' THEN 1 ELSE 0 END) AS has_sust,
            MAX(CASE
                    WHEN COALESCE(TRIM(r.ruta_foto), '') <> ''
                      OR (COALESCE(TRIM(r.exp_imagenes), '') <> ''
                          AND r.exp_imagenes NOT LIKE '%sin_imagen%'
                          AND r.exp_imagenes NOT LIKE '%placeholder%')
                    THEN 1 ELSE 0 END) AS has_image,
            MAX(CASE WHEN COALESCE(TRIM(r.ruta_esquemas_pos), '') <> '' THEN 1 ELSE 0 END) AS has_schema,
            CASE
                WHEN SUM(CASE WHEN LOWER(r.qa_revision_accion) = 'importar' THEN 1 ELSE 0 END) > 0 THEN 'importar'
                WHEN SUM(CASE WHEN LOWER(r.qa_revision_accion) = 'revisar' THEN 1 ELSE 0 END) > 0 THEN 'revisar'
                WHEN SUM(CASE WHEN LOWER(r.qa_revision_accion) = 'eliminar' THEN 1 ELSE 0 END) > 0 THEN 'eliminar'
                WHEN SUM(CASE WHEN LOWER(r.qa_revision_accion) = 'copia' THEN 1 ELSE 0 END) > 0 THEN 'copia'
                ELSE NULL
            END AS qa_decision,
            CASE
                WHEN SUM(CASE WHEN r.sust_hierarchie = 'New' THEN 1 ELSE 0 END) > 0
                 AND SUM(CASE WHEN r.sust_hierarchie = 'Superseded' THEN 1 ELSE 0 END) > 0 THEN 'mixed'
                WHEN SUM(CASE WHEN r.sust_hierarchie = 'New' THEN 1 ELSE 0 END) > 0 THEN 'new'
                WHEN SUM(CASE WHEN r.sust_hierarchie = 'Superseded' THEN 1 ELSE 0 END) > 0 THEN 'superseded'
                ELSE 'none'
            END AS export_type
        FROM engine_rows r
        WHERE r.pn_final IS NOT NULL AND TRIM(r.pn_final) <> ''
        GROUP BY r.pn_final
    `);
}

function main() {
    ensureDir(DB_DIR);
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = OFF');
    db.pragma('synchronous = NORMAL');

    const started_at = nowIso();
    // Garantizar que import_runs exista antes de tocar nada (no se borra entre runs).
    db.exec(`
        CREATE TABLE IF NOT EXISTS import_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            source TEXT NOT NULL,
            total_files INTEGER,
            total_rows INTEGER,
            status TEXT,
            notes TEXT
        );
    `);
    const runIns = db.prepare(`
        INSERT INTO import_runs (started_at, source, total_files, total_rows, status, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    let totalRows = 0;
    let status = 'ok';
    let notes = '';

    try {
        rebuildMirrorTables(db);
        totalRows = insertRows(db, ENGINE_FILES);
        rebuildPartNumbers(db);
        db.exec('ANALYZE;');
    } catch (err) {
        status = 'error';
        notes = err.message;
        console.error('[db:import] ERROR:', err);
    }

    const finished_at = nowIso();
    runIns.run(started_at, 'engine_json_v1', ENGINE_FILES.length, totalRows, status, notes || null);
    db.prepare(`UPDATE import_runs SET finished_at = ? WHERE id = (SELECT MAX(id) FROM import_runs)`).run(finished_at);

    // Resumen
    const engines = db.prepare('SELECT COUNT(*) AS n FROM engines').get().n;
    const rows = db.prepare('SELECT COUNT(*) AS n FROM engine_rows').get().n;
    const pns = db.prepare('SELECT COUNT(*) AS n FROM part_numbers').get().n;
    const qa = db.prepare('SELECT COUNT(*) AS n FROM qa_reviews').get().n;
    const imgs = db.prepare('SELECT COUNT(*) AS n FROM image_refs').get().n;

    db.close();

    process.stdout.write(
        `[db:import] status=${status} engines=${engines} rows=${rows} pns=${pns} ` +
        `qa_reviews=${qa} image_refs=${imgs}\n`
    );
    process.stdout.write(`  DB: ${path.relative(REPO_ROOT, DB_PATH)}\n`);
    if (status !== 'ok') process.exitCode = 1;
}

main();
