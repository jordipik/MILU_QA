#!/usr/bin/env node
// MILU — Consultas de ejemplo sobre la BD espejo SQLite.
//
// SOLO LECTURA. No modifica datos.
//
// Uso:
//   npm run db:queries

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DB_PATH = path.join(REPO_ROOT, 'data', 'db', 'milu_mirror.sqlite');
const OUT_DIR = path.join(REPO_ROOT, 'data', 'output', 'validation');
const OUT_MD = path.join(OUT_DIR, 'sqlite_sample_queries.md');

let Database;
try {
    Database = require('better-sqlite3');
} catch {
    console.error('[db:queries] Falta `better-sqlite3`. Instala con: npm install --save-dev better-sqlite3');
    process.exit(2);
}

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function tableMd(rows, columns) {
    if (rows.length === 0) return '_(sin resultados)_\n';
    const cols = columns || Object.keys(rows[0]);
    const lines = [];
    lines.push(`| ${cols.join(' | ')} |`);
    lines.push(`| ${cols.map(() => '---').join(' | ')} |`);
    for (const r of rows) {
        lines.push(`| ${cols.map((c) => (r[c] === null || r[c] === undefined ? '' : String(r[c]))).join(' | ')} |`);
    }
    return lines.join('\n') + '\n';
}

function main() {
    if (!fs.existsSync(DB_PATH)) {
        console.error(`[db:queries] No existe la BD: ${path.relative(REPO_ROOT, DB_PATH)}`);
        console.error('  Ejecuta primero:  npm run db:import');
        process.exit(2);
    }
    const db = new Database(DB_PATH, { readonly: true });
    const L = [];
    L.push('# MILU — Consultas de ejemplo sobre la BD espejo');
    L.push('');
    L.push(`> Generado: ${new Date().toISOString()}`);
    L.push(`> Origen: \`data/db/milu_mirror.sqlite\`  (espejo, no fuente de verdad)`);
    L.push('');

    function section(title, sql, rows, cols) {
        L.push(`## ${title}`);
        L.push('');
        L.push('```sql');
        L.push(sql.trim());
        L.push('```');
        L.push('');
        L.push(tableMd(rows, cols));
        L.push('');
    }

    // Totales
    {
        const sql = `SELECT
                        (SELECT COUNT(*) FROM engines) AS engines,
                        (SELECT COUNT(*) FROM engine_rows) AS rows,
                        (SELECT COUNT(*) FROM part_numbers) AS unique_pn,
                        (SELECT COUNT(*) FROM qa_reviews) AS qa_reviews,
                        (SELECT COUNT(*) FROM image_refs) AS image_refs`;
        section('Totales', sql, [db.prepare(sql).get()]);
    }

    // Filas por engine
    {
        const sql = `
            SELECT e.engine_model, e.filename, e.row_count, e.imported_at
            FROM engines e
            ORDER BY e.engine_model
        `;
        section('Filas por engine', sql, db.prepare(sql).all());
    }

    // Top PN por apariciones
    {
        const sql = `
            SELECT pn_final, occurrences, engines_count, has_image, has_schema, qa_decision, export_type
            FROM part_numbers
            ORDER BY occurrences DESC
            LIMIT 20
        `;
        section('Top 20 PN por apariciones', sql, db.prepare(sql).all());
    }

    // Conteo qa_revision_estado
    {
        const sql = `
            SELECT COALESCE(NULLIF(TRIM(qa_revision_estado), ''), '(empty)') AS estado, COUNT(*) AS n
            FROM engine_rows GROUP BY estado ORDER BY n DESC
        `;
        section('Conteo por `qa_revision_estado`', sql, db.prepare(sql).all());
    }

    // Conteo qa_revision_accion
    {
        const sql = `
            SELECT COALESCE(NULLIF(TRIM(qa_revision_accion), ''), '(empty)') AS accion, COUNT(*) AS n
            FROM engine_rows GROUP BY accion ORDER BY n DESC
        `;
        section('Conteo por `qa_revision_accion`', sql, db.prepare(sql).all());
    }

    // Conteo sust_hierarchie
    {
        const sql = `
            SELECT COALESCE(NULLIF(TRIM(sust_hierarchie), ''), '(empty)') AS sust, COUNT(*) AS n
            FROM engine_rows GROUP BY sust ORDER BY n DESC
        `;
        section('Conteo por `sust_hierarchie` (New / Superseded)', sql, db.prepare(sql).all());
    }

    // Sin imagen
    {
        const sql = `
            SELECT COUNT(*) AS rows_sin_imagen
            FROM engine_rows
            WHERE (COALESCE(TRIM(ruta_foto), '') = '')
              AND (COALESCE(TRIM(exp_imagenes), '') = ''
                   OR exp_imagenes LIKE '%sin_imagen%'
                   OR exp_imagenes LIKE '%placeholder%')
        `;
        section('Filas sin imagen', sql, [db.prepare(sql).get()]);
    }

    // Sin esquema
    {
        const sql = `SELECT COUNT(*) AS rows_sin_esquema FROM engine_rows WHERE COALESCE(TRIM(ruta_esquemas_pos), '') = ''`;
        section('Filas sin esquema', sql, [db.prepare(sql).get()]);
    }

    // Placeholder
    {
        const sql = `
            SELECT COUNT(DISTINCT engine_row_id) AS rows_con_placeholder
            FROM image_refs WHERE is_placeholder = 1
        `;
        section('Filas con referencia placeholder (`sin_imagen`)', sql, [db.prepare(sql).get()]);
    }

    // Pendientes de revisión
    {
        const sql = `
            SELECT COUNT(*) AS pendientes
            FROM engine_rows WHERE LOWER(COALESCE(qa_revision_estado, '')) = 'pendiente'
        `;
        section('Filas pendientes de revisión', sql, [db.prepare(sql).get()]);
    }

    // Importables
    {
        const sql = `
            SELECT COUNT(*) AS importables
            FROM engine_rows WHERE LOWER(COALESCE(qa_revision_accion, '')) = 'importar'
        `;
        section('Filas marcadas como `importar`', sql, [db.prepare(sql).get()]);
    }

    // Descartados (legacy "descartar" + "eliminar")
    {
        const sql = `
            SELECT LOWER(COALESCE(qa_revision_accion, '(empty)')) AS accion, COUNT(*) AS n
            FROM engine_rows
            WHERE LOWER(COALESCE(qa_revision_accion, '')) IN ('eliminar', 'descartar')
            GROUP BY accion ORDER BY n DESC
        `;
        section('Filas marcadas como `eliminar` / `descartar` (legacy)', sql, db.prepare(sql).all());
    }

    // Última ejecución de import
    {
        const sql = `
            SELECT id, started_at, finished_at, source, total_files, total_rows, status, notes
            FROM import_runs ORDER BY id DESC LIMIT 5
        `;
        section('Últimas 5 ejecuciones de `db:import`', sql, db.prepare(sql).all());
    }

    db.close();
    ensureDir(OUT_DIR);
    fs.writeFileSync(OUT_MD, L.join('\n'), 'utf8');
    process.stdout.write(`[db:queries] informe: ${path.relative(REPO_ROOT, OUT_MD)}\n`);
}

main();
