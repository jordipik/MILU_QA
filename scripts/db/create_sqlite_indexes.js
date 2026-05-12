// MILU — Fase H.1: creación de índices auxiliares en el espejo SQLite.
//
// Operación DDL puntual sobre data/db/milu_mirror.sqlite.
// NO modifica ningún engine_*.json. NO escribe filas. Solo crea índices.
// Idempotente: usa CREATE INDEX IF NOT EXISTS.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DB_PATH = path.join(REPO_ROOT, 'data', 'db', 'milu_mirror.sqlite');
const REPORT_PATH = path.join(REPO_ROOT, 'data', 'output', 'validation', 'sqlite_indexes_report.md');

let Database;
try {
    Database = require('better-sqlite3');
} catch (err) {
    console.error('better-sqlite3 no disponible:', err && err.message);
    process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
    console.error(`No existe ${DB_PATH}. Ejecuta: npm run db:import`);
    process.exit(1);
}

// Índices candidatos. Sólo se crean si aportan: B-tree NO ayuda con LIKE '%...%'.
// Por eso NO indexamos exp_imagenes/ruta_esquemas_pos: las queries existentes los
// consumen con LIKE de comodín inicial.
const INDEXES = [
    {
        name: 'idx_engine_rows_source_row_id',
        sql: `CREATE INDEX IF NOT EXISTS idx_engine_rows_source_row_id
              ON engine_rows(source_row_id);`,
        rationale: 'Lookup directo por source_row_id (drilldown).',
    },
    {
        name: 'idx_engine_rows_pn_estado_accion',
        sql: `CREATE INDEX IF NOT EXISTS idx_engine_rows_pn_estado_accion
              ON engine_rows(pn_final, qa_revision_estado, qa_revision_accion);`,
        rationale: 'Agregados top_pn_conflicts y combinaciones estado/acción por PN (/db/analytics/qa).',
    },
    {
        name: 'idx_engine_rows_engine_pn',
        sql: `CREATE INDEX IF NOT EXISTS idx_engine_rows_engine_pn
              ON engine_rows(engine_id, pn_final);`,
        rationale: 'Joins engines × engine_rows agrupados por motor (/db/analytics/engines).',
    },
    {
        name: 'idx_engine_rows_part_no_raw',
        sql: `CREATE INDEX IF NOT EXISTS idx_engine_rows_part_no_raw
              ON engine_rows(part_no_raw);`,
        rationale: 'Buscador global PN (campo PART NO. crudo).',
    },
    {
        name: 'idx_engine_rows_estado_accion',
        sql: `CREATE INDEX IF NOT EXISTS idx_engine_rows_estado_accion
              ON engine_rows(qa_revision_estado, qa_revision_accion);`,
        rationale: 'Drilldown QA pending y combinaciones estado×acción.',
    },
    {
        name: 'idx_part_numbers_export_qa',
        sql: `CREATE INDEX IF NOT EXISTS idx_part_numbers_export_qa
              ON part_numbers(export_type, qa_decision);`,
        rationale: 'Agregados export pending / candidatos.',
    },
    {
        name: 'idx_part_numbers_engines_count',
        sql: `CREATE INDEX IF NOT EXISTS idx_part_numbers_engines_count
              ON part_numbers(engines_count);`,
        rationale: 'Filtro engines_count > 1 (PN multi-motor).',
    },
];

// Queries que vamos a medir antes/después.
const BENCH = [
    {
        name: 'top_pn_conflicts',
        sql: `SELECT r.pn_final,
                     COUNT(DISTINCT TRIM(COALESCE(r.qa_revision_estado, ''))
                                    || '|' || TRIM(COALESCE(r.qa_revision_accion, ''))) AS variants
              FROM engine_rows r
              WHERE r.pn_final IS NOT NULL AND r.pn_final <> ''
              GROUP BY r.pn_final
              HAVING variants > 1
              LIMIT 50`,
    },
    {
        name: 'engines_aggregate',
        sql: `SELECT e.engine_model,
                     COUNT(DISTINCT r.pn_final) AS unique_pn,
                     COUNT(*) AS rows_count
              FROM engines e LEFT JOIN engine_rows r ON r.engine_id = e.id
              GROUP BY e.id`,
    },
    {
        name: 'qa_combinations',
        sql: `SELECT qa_revision_estado, qa_revision_accion, COUNT(*) AS n
              FROM engine_rows GROUP BY qa_revision_estado, qa_revision_accion
              ORDER BY n DESC LIMIT 50`,
    },
    {
        name: 'pn_multi_engine',
        sql: `SELECT pn_final, engines_count, occurrences FROM part_numbers
              WHERE engines_count > 1 ORDER BY engines_count DESC LIMIT 100`,
    },
];

function timeQuery(db, sql, runs = 3) {
    const times = [];
    for (let i = 0; i < runs; i++) {
        const t0 = process.hrtime.bigint();
        db.prepare(sql).all();
        const dt = Number(process.hrtime.bigint() - t0) / 1e6;
        times.push(dt);
    }
    return {
        runs: times.map((t) => Math.round(t * 10) / 10),
        avg: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10,
    };
}

function listIndexes(db) {
    return db.prepare(
        `SELECT name, tbl_name FROM sqlite_master
         WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name, name`
    ).all();
}

function main() {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    const before_indexes = listIndexes(db);
    const before = {};
    for (const b of BENCH) before[b.name] = timeQuery(db, b.sql, 3);

    const created = [];
    const t0 = process.hrtime.bigint();
    for (const idx of INDEXES) {
        const existed = db.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`
        ).get(idx.name);
        db.exec(idx.sql);
        created.push({ name: idx.name, was_new: !existed, rationale: idx.rationale });
    }
    db.exec('ANALYZE;');
    const create_ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e6);

    const after_indexes = listIndexes(db);
    const after = {};
    for (const b of BENCH) after[b.name] = timeQuery(db, b.sql, 3);

    db.close();

    // Generar report
    let md = '';
    md += `# Fase H.1 — Índices SQLite\n\n`;
    md += `Fecha: ${new Date().toISOString()}\n`;
    md += `BD: \`${path.relative(REPO_ROOT, DB_PATH).replace(/\\/g, '/')}\`\n`;
    md += `Tiempo total de creación + ANALYZE: **${create_ms} ms**.\n\n`;

    md += `## Índices añadidos\n\n`;
    md += `| Nombre | Nuevo | Justificación |\n|---|---|---|\n`;
    for (const c of created) {
        md += `| \`${c.name}\` | ${c.was_new ? 'sí' : 'ya existía'} | ${c.rationale} |\n`;
    }
    md += `\n`;

    md += `## Inventario completo de índices tras la operación\n\n`;
    md += `| Tabla | Índice |\n|---|---|\n`;
    for (const r of after_indexes) md += `| \`${r.tbl_name}\` | \`${r.name}\` |\n`;
    md += `\nÍndices totales antes: ${before_indexes.length}, después: ${after_indexes.length}.\n\n`;

    md += `## Benchmark queries (3 corridas, ms)\n\n`;
    md += `| Query | Antes (avg) | Después (avg) | Mejora |\n|---|---:|---:|---:|\n`;
    for (const b of BENCH) {
        const a = before[b.name].avg;
        const d = after[b.name].avg;
        const mejora = a > 0 ? Math.round(((a - d) / a) * 100) : 0;
        md += `| \`${b.name}\` | ${a} | ${d} | ${mejora >= 0 ? '+' : ''}${mejora}% |\n`;
    }
    md += `\n`;

    md += `## Detalle por corrida\n\n`;
    for (const b of BENCH) {
        md += `### \`${b.name}\`\n`;
        md += `- Antes: ${before[b.name].runs.join(', ')} ms\n`;
        md += `- Después: ${after[b.name].runs.join(', ')} ms\n\n`;
    }

    md += `## Notas\n\n`;
    md += `- \`exp_imagenes\` y \`ruta_esquemas_pos\` **no** se indexan porque las queries existentes usan \`LIKE '%...%'\` (comodín inicial), que no aprovecha B-tree.\n`;
    md += `- \`engines.engine_model\` ya está cubierto por UNIQUE.\n`;
    md += `- Operación idempotente: \`CREATE INDEX IF NOT EXISTS\`. Re-ejecutable sin riesgo.\n`;
    md += `- No se ha modificado ningún \`engine_*.json\` ni datos de la BD. Sólo metadata de índices.\n`;

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, md, 'utf8');
    console.log(`OK · ${created.length} índices procesados · informe: ${path.relative(REPO_ROOT, REPORT_PATH)}`);
}

main();
