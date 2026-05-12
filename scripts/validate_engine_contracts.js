#!/usr/bin/env node
// MILU — Validador de contratos sobre engine_*.json.
//
// SOLO REPORTA. No modifica ningún archivo de datos.
//
// Genera:
//   data/output/validation/engine_contract_validation.json
//   data/output/validation/engine_contract_validation.md
//
// Uso:
//   node scripts/validate_engine_contracts.js
//   npm run validate:engines

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
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

const ALLOWED_ESTADO = new Set(['ok', 'pendiente']);
const ALLOWED_ACCION = new Set(['importar', 'revisar', 'eliminar', 'copia']);
const ALLOWED_SUST_HIERARCHIE = new Set(['New', 'Superseded']);

// Para evitar informes inflados, no se persiste un issue por fila para hallazgos
// recurrentes: se acumulan en contadores y, opcionalmente, se muestrean.
const MAX_SAMPLES_PER_CODE = 50;
const sampleCount = new Map();
function shouldEmit(code) {
    const n = sampleCount.get(code) || 0;
    if (n >= MAX_SAMPLES_PER_CODE) return false;
    sampleCount.set(code, n + 1);
    return true;
}

const LEGACY_FIELDS = [
    'measurement_final',
    'wheight_final',
    'qa_errors',
    'qa_errors_active',
];
const DERIVED_ERROR_FIELDS = [
    'pos_error', 'pn_error', 'designation_error', 'weight_error',
    'measurement_error', 'norma_error', 'bom_error', 'total_error',
    'has_error',
];

function isEmpty(v) {
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function fileEngineModel(file) {
    const m = /^engine_(.+)\.json$/i.exec(file);
    return m ? m[1] : null;
}

function mkIssue(severity, code, file, row, field, value, message) {
    return {
        severity,
        code,
        file,
        row_id: row ? (row.ID ?? null) : null,
        engine_model: row ? (row.engine_model ?? fileEngineModel(file)) : fileEngineModel(file),
        field: field ?? null,
        value: value === undefined ? null : value,
        message,
    };
}

// Contadores totales reales (independientes del muestreo).
const totalByCode = new Map();
const totalBySeverity = { error: 0, warning: 0, info: 0 };
function pushIssue(issues, issue) {
    totalByCode.set(issue.code, (totalByCode.get(issue.code) || 0) + 1);
    totalBySeverity[issue.severity] = (totalBySeverity[issue.severity] || 0) + 1;
    if (shouldEmit(issue.code)) issues.push(issue);
}

function validateRow(file, row, issues, counters) {
    // Identidad
    if (isEmpty(row.ID)) {
        pushIssue(issues, mkIssue('error', 'ID_MISSING', file, row, 'ID', null, 'Falta ID en la fila'));
    }
    const pn = row['PART NO.'] ?? row.pn_final ?? row.pn_raw;
    if (isEmpty(pn)) {
        pushIssue(issues, mkIssue('error', 'PN_MISSING', file, row, 'PART NO.|pn_final|pn_raw', null,
            'Fila sin PART NO. / pn_final / pn_raw'));
    }
    if (isEmpty(row.engine_model) && !fileEngineModel(file)) {
        pushIssue(issues, mkIssue('warning', 'ENGINE_MODEL_MISSING', file, row, 'engine_model', null,
            'Sin engine_model y no inferible del filename'));
    }

    // QA estado
    const estado = row.qa_revision_estado;
    if (isEmpty(estado)) {
        counters.qa_estado_empty++;
        pushIssue(issues, mkIssue('warning', 'QA_ESTADO_EMPTY', file, row, 'qa_revision_estado', estado,
            'qa_revision_estado vacío/null'));
    } else if (!ALLOWED_ESTADO.has(String(estado).toLowerCase())) {
        pushIssue(issues, mkIssue('error', 'QA_ESTADO_INVALID', file, row, 'qa_revision_estado', estado,
            `qa_revision_estado fuera del contrato (esperado ok|pendiente): "${estado}"`));
    }

    // QA acción
    const accion = row.qa_revision_accion;
    if (isEmpty(accion)) {
        counters.qa_accion_empty++;
        pushIssue(issues, mkIssue('warning', 'QA_ACCION_EMPTY', file, row, 'qa_revision_accion', accion,
            'qa_revision_accion vacío/null'));
    } else {
        const v = String(accion).toLowerCase();
        if (v === 'descartar') {
            counters.qa_accion_descartar++;
            pushIssue(issues, mkIssue('error', 'QA_ACCION_DESCARTAR', file, row, 'qa_revision_accion', accion,
                'qa_revision_accion="descartar" es legacy: el contrato exige "eliminar"'));
        } else if (!ALLOWED_ACCION.has(v)) {
            pushIssue(issues, mkIssue('error', 'QA_ACCION_INVALID', file, row, 'qa_revision_accion', accion,
                `qa_revision_accion fuera del contrato (importar|revisar|eliminar|copia): "${accion}"`));
        }
    }

    // Campos legacy
    for (const f of LEGACY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(row, f) && !isEmpty(row[f])) {
            counters.legacy_by_field[f] = (counters.legacy_by_field[f] || 0) + 1;
            pushIssue(issues, mkIssue('warning', 'LEGACY_FIELD', file, row, f, row[f],
                `Campo legacy presente: ${f}`));
        }
    }
    // Campos derivados *_error en disco — solo contadores, NO se emite issue por fila
    // (millones de ocurrencias inflarían el informe sin aportar señal).
    for (const f of DERIVED_ERROR_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(row, f) && !isEmpty(row[f])) {
            counters.derived_error_by_field[f] = (counters.derived_error_by_field[f] || 0) + 1;
        }
    }

    // SUST hierarchie
    const sh = row.sust_hierarchie;
    if (!isEmpty(sh) && !ALLOWED_SUST_HIERARCHIE.has(String(sh))) {
        pushIssue(issues, mkIssue('error', 'SUST_HIERARCHIE_INVALID', file, row, 'sust_hierarchie', sh,
            `sust_hierarchie fuera del contrato (New|Superseded|vacío): "${sh}"`));
    }
    if (!isEmpty(sh)) {
        counters.sust_hierarchie[sh] = (counters.sust_hierarchie[sh] || 0) + 1;
    }
    if (!isEmpty(row.sust_status)) {
        counters.sust_status[row.sust_status] = (counters.sust_status[row.sust_status] || 0) + 1;
    }

    // Imágenes
    if (isEmpty(row.exp_imagenes)) {
        counters.img_no_exp_imagenes++;
    } else {
        const raw = String(row.exp_imagenes);
        if (/sin[_-]?imagen|placeholder/i.test(raw)) {
            counters.img_placeholder++;
        }
    }
    if (!isEmpty(row.ruta_foto)) counters.img_ruta_foto++;
    if (!isEmpty(row.ruta_esquemas_pos)) counters.img_ruta_esquemas_pos++;
}

function validateFile(file, issues, byFile, counters) {
    const fullPath = path.join(REPO_ROOT, file);
    let data;
    try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        data = JSON.parse(raw);
    } catch (err) {
        pushIssue(issues, mkIssue('error', 'FILE_PARSE_ERROR', file, null, null, null,
            `No se pudo leer/parsear ${file}: ${err.message}`));
        byFile[file] = { rows: 0, ok: false, error: err.message };
        return;
    }
    if (!Array.isArray(data)) {
        pushIssue(issues, mkIssue('error', 'FILE_NOT_ARRAY', file, null, null, null,
            `${file} no es un array JSON`));
        byFile[file] = { rows: 0, ok: false, error: 'not_array' };
        return;
    }
    if (data.length === 0) {
        pushIssue(issues, mkIssue('warning', 'FILE_EMPTY', file, null, null, null,
            `${file} contiene 0 filas`));
    }
    byFile[file] = { rows: data.length, ok: true };
    for (const row of data) {
        counters.total_rows++;
        if (!row || typeof row !== 'object') {
            pushIssue(issues, mkIssue('error', 'ROW_NOT_OBJECT', file, null, null, null,
                'Fila no es objeto'));
            continue;
        }
        validateRow(file, row, issues, counters);
    }
}

function emptyCounters() {
    return {
        total_rows: 0,
        qa_estado_empty: 0,
        qa_accion_empty: 0,
        qa_accion_descartar: 0,
        legacy_by_field: {},
        derived_error_by_field: {},
        sust_hierarchie: {},
        sust_status: {},
        img_no_exp_imagenes: 0,
        img_placeholder: 0,
        img_ruta_foto: 0,
        img_ruta_esquemas_pos: 0,
    };
}

function ensureDir(p) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function topIssues(issues, n = 20) {
    const byCode = new Map();
    for (const it of issues) {
        byCode.set(it.code, (byCode.get(it.code) || 0) + 1);
    }
    return [...byCode.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([code, count]) => ({ code, count }));
}

function buildMarkdown(report) {
    const lines = [];
    lines.push('# MILU — Validación de contratos sobre `engine_*.json`');
    lines.push('');
    lines.push(`> Generado: ${report.generated_at}`);
    lines.push('');
    lines.push('> **No se ha modificado ningún dato.** Este script es solo de lectura y reporte.');
    lines.push('');
    lines.push('## Resumen ejecutivo');
    lines.push('');
    lines.push(`- Archivos escaneados: **${report.files_scanned}**`);
    lines.push(`- Filas totales: **${report.total_rows}**`);
    lines.push(`- Issues totales (reales): **${report.total_issues}** (errors: ${report.issues_by_severity.error}, warnings: ${report.issues_by_severity.warning}, info: ${report.issues_by_severity.info})`);
    lines.push(`- Muestras conservadas en el JSON: ${report.issues.length} (máx ${report.sampling.max_samples_per_code} por código)`);
    lines.push('');
    lines.push('### Contadores destacados');
    lines.push('');
    lines.push(`- \`qa_revision_estado\` vacío: ${report.summary.qa_estado_empty}`);
    lines.push(`- \`qa_revision_accion\` vacío: ${report.summary.qa_accion_empty}`);
    lines.push(`- \`qa_revision_accion="descartar"\` (legacy, contrato exige "eliminar"): **${report.summary.qa_accion_descartar}**`);
    lines.push(`- Filas sin \`exp_imagenes\`: ${report.summary.img_no_exp_imagenes}`);
    lines.push(`- Filas con placeholder (sin_imagen): ${report.summary.img_placeholder}`);
    lines.push(`- Filas con \`ruta_foto\`: ${report.summary.img_ruta_foto}`);
    lines.push(`- Filas con \`ruta_esquemas_pos\`: ${report.summary.img_ruta_esquemas_pos}`);
    lines.push('');

    lines.push('### Campos legacy en disco');
    lines.push('');
    const legacyEntries = Object.entries(report.summary.legacy_by_field);
    if (legacyEntries.length === 0) {
        lines.push('- (ninguno)');
    } else {
        for (const [f, n] of legacyEntries) lines.push(`- \`${f}\`: ${n}`);
    }
    lines.push('');

    lines.push('### Campos derivados `*_error` en disco');
    lines.push('');
    const derivedEntries = Object.entries(report.summary.derived_error_by_field);
    if (derivedEntries.length === 0) {
        lines.push('- (ninguno)');
    } else {
        for (const [f, n] of derivedEntries) lines.push(`- \`${f}\`: ${n}`);
    }
    lines.push('');

    lines.push('### `sust_hierarchie` (valores encontrados)');
    lines.push('');
    const shEntries = Object.entries(report.summary.sust_hierarchie);
    if (shEntries.length === 0) {
        lines.push('- (ninguno con valor)');
    } else {
        for (const [v, n] of shEntries) lines.push(`- \`${v}\`: ${n}`);
    }
    lines.push('');

    lines.push('### `sust_status` (valores encontrados — solo informativo)');
    lines.push('');
    const ssEntries = Object.entries(report.summary.sust_status);
    if (ssEntries.length === 0) {
        lines.push('- (ninguno con valor)');
    } else {
        for (const [v, n] of ssEntries) lines.push(`- \`${v}\`: ${n}`);
    }
    lines.push('');

    lines.push('## Por archivo');
    lines.push('');
    lines.push('| Archivo | Filas | Estado |');
    lines.push('|---|---:|---|');
    for (const [file, info] of Object.entries(report.by_file)) {
        const st = info.ok ? 'ok' : `ERROR: ${info.error}`;
        lines.push(`| \`${file}\` | ${info.rows} | ${st} |`);
    }
    lines.push('');

    lines.push('## Top issues por código');
    lines.push('');
    lines.push('| Código | Ocurrencias |');
    lines.push('|---|---:|');
    for (const t of report.top_issues) {
        lines.push(`| \`${t.code}\` | ${t.count} |`);
    }
    lines.push('');

    lines.push('## Recomendaciones (siguiente fase)');
    lines.push('');
    lines.push('1. Migrar filas con `qa_revision_accion="descartar"` a `"eliminar"` (con script dedicado y backup).');
    lines.push('2. Limpiar `measurement_final` redundante respecto a `measure_final` en la siguiente pasada de `depuracion_json.py`.');
    lines.push('3. Decidir si `qa_errors` / `qa_errors_active` deben eliminarse de disco proactivamente (hoy se limpian en cada guardado).');
    lines.push('4. Decidir el estatuto de los campos derivados `*_error` / `has_error`: persistidos oficiales o eliminables.');
    lines.push('5. Volver a ejecutar este validador tras cada migración para medir progreso.');
    lines.push('');
    lines.push('> Detalle completo en el JSON acompañante (`engine_contract_validation.json`).');
    return lines.join('\n') + '\n';
}

function main() {
    const generated_at = new Date().toISOString();
    const issues = [];
    const byFile = {};
    const counters = emptyCounters();

    // Comprobar exactamente 9 archivos esperados
    const presentEngines = new Set();
    const dirEntries = fs.readdirSync(REPO_ROOT)
        .filter((f) => /^engine_.+\.json$/i.test(f) && !/\.backup$/i.test(f));
    for (const f of dirEntries) presentEngines.add(f);
    const missingExpected = ENGINE_FILES.filter((f) => !presentEngines.has(f));
    const unexpectedPresent = [...presentEngines].filter((f) => !ENGINE_FILES.includes(f));
    for (const f of missingExpected) {
        pushIssue(issues, mkIssue('error', 'ENGINE_FILE_MISSING', f, null, null, null,
            `Falta archivo esperado: ${f}`));
    }
    for (const f of unexpectedPresent) {
        pushIssue(issues, mkIssue('warning', 'ENGINE_FILE_UNEXPECTED', f, null, null, null,
            `Archivo engine_*.json no esperado: ${f}`));
    }

    const filesToScan = ENGINE_FILES.filter((f) => presentEngines.has(f));
    for (const f of filesToScan) {
        validateFile(f, issues, byFile, counters);
    }

    const issues_by_severity = { ...totalBySeverity };
    const total_issues = totalBySeverity.error + totalBySeverity.warning + totalBySeverity.info;
    const top_issues_real = [...totalByCode.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([code, count]) => ({ code, count }));

    const report = {
        generated_at,
        repo_root: REPO_ROOT,
        files_scanned: filesToScan.length,
        files_expected: ENGINE_FILES.length,
        total_rows: counters.total_rows,
        total_issues,
        summary: counters,
        issues_by_severity,
        top_issues: top_issues_real,
        by_file: byFile,
        sampling: {
            max_samples_per_code: MAX_SAMPLES_PER_CODE,
            note: 'El array `issues` contiene hasta MAX_SAMPLES_PER_CODE ejemplos por código. Los conteos reales están en `top_issues` y `issues_by_severity`.',
        },
        issues,
    };

    ensureDir(OUT_DIR);
    const jsonPath = path.join(OUT_DIR, 'engine_contract_validation.json');
    const mdPath = path.join(OUT_DIR, 'engine_contract_validation.md');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(mdPath, buildMarkdown(report), 'utf8');

    // Resumen en stdout
    process.stdout.write(
        `[validate_engine_contracts] files=${report.files_scanned}/${report.files_expected} ` +
        `rows=${report.total_rows} issues=${total_issues} ` +
        `(error=${issues_by_severity.error}, warning=${issues_by_severity.warning}, info=${issues_by_severity.info}) ` +
        `samples=${issues.length}\n`
    );
    process.stdout.write(`  JSON: ${path.relative(REPO_ROOT, jsonPath)}\n`);
    process.stdout.write(`  MD:   ${path.relative(REPO_ROOT, mdPath)}\n`);
}

main();
