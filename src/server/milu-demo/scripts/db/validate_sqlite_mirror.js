#!/usr/bin/env node
// MILU — Valida que la BD espejo SQLite refleja fielmente los engine_*.json.
//
// SOLO LECTURA. No modifica ni JSON ni BD (más allá de abrirla en modo lectura).
//
// Uso:
//   npm run db:validate

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DB_PATH = path.join(REPO_ROOT, 'data', 'db', 'milu_mirror.sqlite');
const OUT_DIR = path.join(REPO_ROOT, 'data', 'output', 'validation');

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
    console.error('[db:validate] Falta la dependencia `better-sqlite3`.');
    console.error('  Instálala con:  npm install --save-dev better-sqlite3');
    process.exit(2);
}

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function isEmpty(v) { return v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
function engineModelFromFile(file) {
    const m = /^engine_(.+)\.json$/i.exec(file);
    return m ? m[1] : file;
}
function pickPn(row) {
    if (!isEmpty(row.pn_final)) return String(row.pn_final);
    if (!isEmpty(row['PART NO.'])) return String(row['PART NO.']);
    if (!isEmpty(row.pn_raw)) return String(row.pn_raw);
    return null;
}
function isPlaceholderText(v) {
    if (isEmpty(v)) return false;
    return /sin[_-]?imagen|placeholder/i.test(String(v));
}

function summarizeJson() {
    const summary = {
        engines: {},
        total_rows: 0,
        unique_pn: new Set(),
        qa_estado_counts: {},
        qa_accion_counts: {},
        sust_hierarchie_counts: {},
        rows_with_image: 0,
        rows_with_schema: 0,
        rows_with_placeholder: 0,
    };
    for (const file of ENGINE_FILES) {
        const p = path.join(REPO_ROOT, file);
        if (!fs.existsSync(p)) { summary.engines[file] = { rows: 0, missing: true }; continue; }
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (!Array.isArray(data)) { summary.engines[file] = { rows: 0, error: 'not_array' }; continue; }
        let withImage = 0, withSchema = 0, withPlaceholder = 0;
        for (const row of data) {
            if (!row || typeof row !== 'object') continue;
            summary.total_rows++;
            const pn = pickPn(row);
            if (pn) summary.unique_pn.add(pn);
            const est = isEmpty(row.qa_revision_estado) ? '(empty)' : String(row.qa_revision_estado);
            summary.qa_estado_counts[est] = (summary.qa_estado_counts[est] || 0) + 1;
            const acc = isEmpty(row.qa_revision_accion) ? '(empty)' : String(row.qa_revision_accion);
            summary.qa_accion_counts[acc] = (summary.qa_accion_counts[acc] || 0) + 1;
            const sh = isEmpty(row.sust_hierarchie) ? '(empty)' : String(row.sust_hierarchie);
            summary.sust_hierarchie_counts[sh] = (summary.sust_hierarchie_counts[sh] || 0) + 1;

            const hasImage = !isEmpty(row.ruta_foto)
                || (!isEmpty(row.exp_imagenes) && !isPlaceholderText(row.exp_imagenes));
            const hasSchema = !isEmpty(row.ruta_esquemas_pos);
            if (hasImage) { withImage++; summary.rows_with_image++; }
            if (hasSchema) { withSchema++; summary.rows_with_schema++; }
            if (isPlaceholderText(row.exp_imagenes) || isPlaceholderText(row.ruta_foto)) {
                withPlaceholder++; summary.rows_with_placeholder++;
            }
        }
        summary.engines[file] = {
            engine_model: engineModelFromFile(file),
            rows: data.length,
            with_image: withImage,
            with_schema: withSchema,
            with_placeholder: withPlaceholder,
        };
    }
    return summary;
}

function summarizeDb(db) {
    const summary = {
        engines: {},
        total_rows: 0,
        unique_pn: 0,
        qa_estado_counts: {},
        qa_accion_counts: {},
        sust_hierarchie_counts: {},
        rows_with_image: 0,
        rows_with_schema: 0,
        rows_with_placeholder: 0,
    };

    summary.total_rows = db.prepare('SELECT COUNT(*) AS n FROM engine_rows').get().n;
    summary.unique_pn = db.prepare(
        `SELECT COUNT(*) AS n FROM (SELECT DISTINCT pn_final FROM engine_rows WHERE pn_final IS NOT NULL AND TRIM(pn_final) <> '')`
    ).get().n;

    const perEngine = db.prepare(`
        SELECT e.filename, e.engine_model,
               COUNT(r.id) AS rows,
               SUM(CASE WHEN (COALESCE(TRIM(r.ruta_foto), '') <> '')
                          OR (COALESCE(TRIM(r.exp_imagenes), '') <> ''
                              AND r.exp_imagenes NOT LIKE '%sin_imagen%'
                              AND r.exp_imagenes NOT LIKE '%placeholder%')
                        THEN 1 ELSE 0 END) AS with_image,
               SUM(CASE WHEN COALESCE(TRIM(r.ruta_esquemas_pos), '') <> '' THEN 1 ELSE 0 END) AS with_schema,
               SUM(CASE WHEN r.exp_imagenes LIKE '%sin_imagen%' OR r.exp_imagenes LIKE '%placeholder%'
                          OR r.ruta_foto LIKE '%sin_imagen%' OR r.ruta_foto LIKE '%placeholder%'
                        THEN 1 ELSE 0 END) AS with_placeholder
        FROM engines e LEFT JOIN engine_rows r ON r.engine_id = e.id
        GROUP BY e.id
    `).all();
    for (const e of perEngine) {
        summary.engines[e.filename] = {
            engine_model: e.engine_model,
            rows: e.rows,
            with_image: e.with_image || 0,
            with_schema: e.with_schema || 0,
            with_placeholder: e.with_placeholder || 0,
        };
        summary.rows_with_image += e.with_image || 0;
        summary.rows_with_schema += e.with_schema || 0;
        summary.rows_with_placeholder += e.with_placeholder || 0;
    }

    const estado = db.prepare(`
        SELECT COALESCE(NULLIF(TRIM(qa_revision_estado), ''), '(empty)') AS k, COUNT(*) AS n
        FROM engine_rows GROUP BY k
    `).all();
    for (const r of estado) summary.qa_estado_counts[r.k] = r.n;

    const accion = db.prepare(`
        SELECT COALESCE(NULLIF(TRIM(qa_revision_accion), ''), '(empty)') AS k, COUNT(*) AS n
        FROM engine_rows GROUP BY k
    `).all();
    for (const r of accion) summary.qa_accion_counts[r.k] = r.n;

    const sust = db.prepare(`
        SELECT COALESCE(NULLIF(TRIM(sust_hierarchie), ''), '(empty)') AS k, COUNT(*) AS n
        FROM engine_rows GROUP BY k
    `).all();
    for (const r of sust) summary.sust_hierarchie_counts[r.k] = r.n;

    return summary;
}

function diffCounts(jsonObj, dbObj) {
    const keys = new Set([...Object.keys(jsonObj), ...Object.keys(dbObj)]);
    const out = [];
    for (const k of keys) {
        const j = jsonObj[k] ?? 0;
        const d = dbObj[k] ?? 0;
        if (j !== d) out.push({ key: k, json: j, db: d, diff: d - j });
    }
    return out;
}

function buildMarkdown(report) {
    const L = [];
    L.push('# MILU — Validación BD espejo SQLite vs `engine_*.json`');
    L.push('');
    L.push(`> Generado: ${report.generated_at}`);
    L.push('');
    L.push('> **No se ha modificado ningún engine_*.json.** Solo lectura.');
    L.push('');
    L.push(`## Resultado global: ${report.ok ? '✅ OK' : '❌ DIFERENCIAS'}`);
    L.push('');
    L.push('| Métrica | JSON | SQLite | Δ |');
    L.push('|---|---:|---:|---:|');
    L.push(`| Engines | ${report.totals.engines.json} | ${report.totals.engines.db} | ${report.totals.engines.db - report.totals.engines.json} |`);
    L.push(`| Filas totales | ${report.totals.rows.json} | ${report.totals.rows.db} | ${report.totals.rows.db - report.totals.rows.json} |`);
    L.push(`| PN únicos | ${report.totals.unique_pn.json} | ${report.totals.unique_pn.db} | ${report.totals.unique_pn.db - report.totals.unique_pn.json} |`);
    L.push(`| Filas con imagen | ${report.totals.rows_with_image.json} | ${report.totals.rows_with_image.db} | ${report.totals.rows_with_image.db - report.totals.rows_with_image.json} |`);
    L.push(`| Filas con esquema | ${report.totals.rows_with_schema.json} | ${report.totals.rows_with_schema.db} | ${report.totals.rows_with_schema.db - report.totals.rows_with_schema.json} |`);
    L.push(`| Filas con placeholder | ${report.totals.rows_with_placeholder.json} | ${report.totals.rows_with_placeholder.db} | ${report.totals.rows_with_placeholder.db - report.totals.rows_with_placeholder.json} |`);
    L.push('');

    L.push('## Por engine');
    L.push('');
    L.push('| Archivo | JSON filas | DB filas | Δ |');
    L.push('|---|---:|---:|---:|');
    for (const row of report.by_engine) {
        L.push(`| \`${row.file}\` | ${row.json_rows} | ${row.db_rows} | ${row.db_rows - row.json_rows} |`);
    }
    L.push('');

    function block(title, diff) {
        L.push(`### ${title}`);
        L.push('');
        if (diff.length === 0) {
            L.push('- Sin diferencias.');
        } else {
            L.push('| Clave | JSON | DB | Δ |');
            L.push('|---|---:|---:|---:|');
            for (const d of diff) L.push(`| \`${d.key}\` | ${d.json} | ${d.db} | ${d.diff} |`);
        }
        L.push('');
    }
    block('Diferencias en `qa_revision_estado`', report.diffs.qa_estado);
    block('Diferencias en `qa_revision_accion`', report.diffs.qa_accion);
    block('Diferencias en `sust_hierarchie`', report.diffs.sust_hierarchie);

    L.push('## Warnings');
    L.push('');
    if (report.warnings.length === 0) L.push('- (ninguno)');
    else for (const w of report.warnings) L.push(`- ${w}`);
    L.push('');

    L.push('## Recomendaciones');
    L.push('');
    if (report.ok) {
        L.push('- La BD espejo refleja fielmente los JSON. Apta para análisis de solo lectura.');
        L.push('- Volver a ejecutar `npm run db:import` y `npm run db:validate` tras cualquier cambio en los `engine_*.json`.');
    } else {
        L.push('- Investigar diferencias antes de usar la BD para análisis.');
        L.push('- Verificar que `npm run db:import` se ha ejecutado tras los últimos cambios en JSON.');
        L.push('- Revisar el mapeo de campos en `scripts/db/import_engines_to_sqlite.js`.');
    }
    L.push('');
    L.push('> La BD espejo NO es fuente de verdad. Cualquier divergencia se resuelve regenerándola, nunca editándola a mano.');
    return L.join('\n') + '\n';
}

function main() {
    if (!fs.existsSync(DB_PATH)) {
        console.error(`[db:validate] No existe la BD: ${path.relative(REPO_ROOT, DB_PATH)}`);
        console.error('  Ejecuta primero:  npm run db:import');
        process.exit(2);
    }

    const db = new Database(DB_PATH, { readonly: true });
    const jsonSum = summarizeJson();
    const dbSum = summarizeDb(db);

    const enginesJsonCount = ENGINE_FILES.filter((f) => fs.existsSync(path.join(REPO_ROOT, f))).length;
    const enginesDbCount = db.prepare('SELECT COUNT(*) AS n FROM engines').get().n;

    const byEngine = ENGINE_FILES.map((f) => ({
        file: f,
        json_rows: jsonSum.engines[f]?.rows ?? 0,
        db_rows: dbSum.engines[f]?.rows ?? 0,
    }));

    const diffs = {
        qa_estado: diffCounts(jsonSum.qa_estado_counts, dbSum.qa_estado_counts),
        qa_accion: diffCounts(jsonSum.qa_accion_counts, dbSum.qa_accion_counts),
        sust_hierarchie: diffCounts(jsonSum.sust_hierarchie_counts, dbSum.sust_hierarchie_counts),
    };

    const warnings = [];
    if (enginesJsonCount !== enginesDbCount) {
        warnings.push(`Número de engines difiere: JSON=${enginesJsonCount} DB=${enginesDbCount}`);
    }
    for (const row of byEngine) {
        if (row.json_rows !== row.db_rows) {
            warnings.push(`Filas por engine difieren en ${row.file}: JSON=${row.json_rows} DB=${row.db_rows}`);
        }
    }
    if (jsonSum.unique_pn.size !== dbSum.unique_pn) {
        warnings.push(`PN únicos difieren: JSON=${jsonSum.unique_pn.size} DB=${dbSum.unique_pn}`);
    }

    const ok = (
        jsonSum.total_rows === dbSum.total_rows
        && jsonSum.unique_pn.size === dbSum.unique_pn
        && enginesJsonCount === enginesDbCount
        && diffs.qa_estado.length === 0
        && diffs.qa_accion.length === 0
        && diffs.sust_hierarchie.length === 0
        && jsonSum.rows_with_image === dbSum.rows_with_image
        && jsonSum.rows_with_schema === dbSum.rows_with_schema
        && jsonSum.rows_with_placeholder === dbSum.rows_with_placeholder
    );

    const report = {
        generated_at: new Date().toISOString(),
        ok,
        totals: {
            engines: { json: enginesJsonCount, db: enginesDbCount },
            rows: { json: jsonSum.total_rows, db: dbSum.total_rows },
            unique_pn: { json: jsonSum.unique_pn.size, db: dbSum.unique_pn },
            rows_with_image: { json: jsonSum.rows_with_image, db: dbSum.rows_with_image },
            rows_with_schema: { json: jsonSum.rows_with_schema, db: dbSum.rows_with_schema },
            rows_with_placeholder: { json: jsonSum.rows_with_placeholder, db: dbSum.rows_with_placeholder },
        },
        by_engine: byEngine,
        diffs,
        warnings,
    };

    db.close();
    ensureDir(OUT_DIR);
    const jsonPath = path.join(OUT_DIR, 'sqlite_mirror_validation.json');
    const mdPath = path.join(OUT_DIR, 'sqlite_mirror_validation.md');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(mdPath, buildMarkdown(report), 'utf8');

    process.stdout.write(
        `[db:validate] ok=${ok} engines=${enginesJsonCount}/${enginesDbCount} ` +
        `rows=${jsonSum.total_rows}/${dbSum.total_rows} warnings=${warnings.length}\n`
    );
    process.stdout.write(`  JSON: ${path.relative(REPO_ROOT, jsonPath)}\n`);
    process.stdout.write(`  MD:   ${path.relative(REPO_ROOT, mdPath)}\n`);
    if (!ok) process.exitCode = 1;
}

main();
