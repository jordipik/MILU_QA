const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'output', 'wordpress');

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeCsv(filePath, rows, headers) {
    const escapeCell = (value) => {
        const text = String(value == null ? '' : value);
        if (text.includes('"') || text.includes(';') || text.includes('\n') || text.includes('\r')) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    };

    const lines = [headers.join(';')];
    for (const row of rows) {
        lines.push(headers.map((h) => escapeCell(row[h])).join(';'));
    }
    fs.writeFileSync(filePath, `\uFEFF${lines.join('\n')}\n`, 'utf8');
}

function t(value) {
    return String(value == null ? '' : value).trim();
}

function key(value) {
    return t(value).toLowerCase();
}

function collapseSpaces(value) {
    return t(value).replace(/\s+/g, ' ');
}

function uniq(values) {
    return [...new Set(values.filter(Boolean))];
}

function pickMostFrequent(values) {
    const counts = new Map();
    let bestKey = '';
    let bestValue = '';
    let bestCount = 0;
    for (const raw of values) {
        const value = collapseSpaces(raw);
        if (!value) continue;
        const k = key(value);
        const current = counts.get(k) || { count: 0, value };
        current.count += 1;
        if (value.length > current.value.length) current.value = value;
        counts.set(k, current);
        if (
            current.count > bestCount
            || (current.count === bestCount && current.value.length > bestValue.length)
        ) {
            bestCount = current.count;
            bestValue = current.value;
            bestKey = k;
        }
    }
    return bestKey ? bestValue : '';
}

function getPn(row) {
    return t(row['PART NO.'] || row.pn || row.pn_final);
}

function getDesignation(row) {
    return pickMostFrequent([
        row.designation_final,
        row.designation_gesa,
        row.DESIGNATION
    ]);
}

function getMeasurement(row) {
    return pickMostFrequent([
        row.measure_final,
        row.measurement_final,
        row.dimensions_gesa,
        row['MEASUREMENT / STANDARD']
    ]);
}

function getWeight(row) {
    return pickMostFrequent([
        row.weight_final,
        row.weight_gesa,
        row.WEIGHT
    ]);
}

function loadEngineRows() {
    const rows = [];
    for (const fileName of ENGINE_JSON_FILES) {
        const filePath = path.join(REPO_ROOT, fileName);
        const parsed = readJson(filePath, []);
        if (!Array.isArray(parsed)) continue;
        for (const row of parsed) {
            rows.push({ ...row, __engine_file: fileName });
        }
    }
    return rows;
}

function buildQaSummary(rows) {
    const summary = {
        total_rows: rows.length,
        count_ok_importar: 0,
        count_ok_eliminar: 0,
        count_pending: 0,
        count_review_action: 0,
        count_other: 0
    };

    for (const row of rows) {
        const estado = key(row.qa_revision_estado);
        const accion = key(row.qa_revision_accion);
        if (estado === 'ok' && accion === 'importar') {
            summary.count_ok_importar += 1;
            continue;
        }
        if (estado === 'ok' && accion === 'eliminar') {
            summary.count_ok_eliminar += 1;
            continue;
        }
        if (estado === 'pendiente' || estado === 'en revision' || estado === 'en revisión') {
            summary.count_pending += 1;
        }
        if (accion === 'revisar') {
            summary.count_review_action += 1;
        }
        if (!(estado === 'ok' && (accion === 'importar' || accion === 'eliminar'))) {
            summary.count_other += 1;
        }
    }

    return summary;
}

function decideByQa(rows, qaSummary) {
    const hasImport = qaSummary.count_ok_importar > 0;
    if (hasImport) {
        return { decision: 'import', reason: 'qa_ok_importar_found', qa_validated: true };
    }

    const allDelete = rows.length > 0 && rows.every((row) => {
        const estado = key(row.qa_revision_estado);
        const accion = key(row.qa_revision_accion);
        return estado === 'ok' && accion === 'eliminar';
    });
    if (allDelete) {
        return { decision: 'discard', reason: 'qa_all_ok_eliminar', qa_validated: true };
    }

    return { decision: 'pending_review', reason: 'qa_pending_or_mixed', qa_validated: false };
}

function buildAggregates(rows) {
    const engines = uniq(rows.map((row) => t(row.engine_model || row.model || row.engine || row.__engine_file))).join(', ');
    const sourceIds = uniq(rows.map((row) => t(row.ID))).join(', ');
    const sourcePages = uniq(rows.map((row) => t(row['Source Page']))).join(', ');

    return { engines, sourceIds, sourcePages };
}

function buildTraceEntry(sku, rows, merged, decisionMeta, qaSummary) {
    const sourceRecords = rows.map((row) => ({
        id: t(row.ID),
        engine_model: t(row.engine_model || row.model || row.engine),
        source_file: t(row.__engine_file),
        source_page: t(row['Source Page']),
        pos: t(row.POS || row.pos_final),
        bom: t(row['BOM-No.']),
        designation_final: getDesignation(row),
        measure_final: getMeasurement(row),
        weight_final: getWeight(row),
        qa_revision_estado: t(row.qa_revision_estado),
        qa_revision_accion: t(row.qa_revision_accion)
    }));

    return {
        sku,
        preview: {
            import_decision: decisionMeta.decision,
            import_reason: decisionMeta.reason
        },
        compacted: {
            pn: sku,
            designation: merged.designation_final,
            measurement: merged.measurement_final,
            weight: merged.weight_final,
            total_occurrences_global: merged.occurrences,
            engine_models_all: merged.engines,
            source_ids_all: merged.source_ids,
            source_pages_all: merged.source_pages
        },
        qa_summary: qaSummary,
        source_records: sourceRecords
    };
}

function run() {
    ensureDir(OUTPUT_DIR);
    const allRows = loadEngineRows();

    const byPn = new Map();
    for (const row of allRows) {
        const pn = getPn(row);
        if (!pn) continue;
        const pnKey = key(pn);
        if (!byPn.has(pnKey)) byPn.set(pnKey, { pn, rows: [] });
        byPn.get(pnKey).rows.push(row);
    }

    const importRows = [];
    const pendingRows = [];
    const discardedRows = [];
    const traceBySku = {};

    for (const group of byPn.values()) {
        const rows = group.rows;
        const sku = group.pn;
        const qaSummary = buildQaSummary(rows);
        const decisionMeta = decideByQa(rows, qaSummary);
        const agg = buildAggregates(rows);

        const designation = pickMostFrequent(rows.map(getDesignation));
        const measurement = pickMostFrequent(rows.map(getMeasurement));
        const weight = pickMostFrequent(rows.map(getWeight));

        const merged = {
            sku,
            designation_final: designation,
            measurement_final: measurement,
            weight_final: weight,
            decision: decisionMeta.decision,
            reason: decisionMeta.reason,
            qa_validated: decisionMeta.qa_validated,
            occurrences: rows.length,
            total_occurrences_global: rows.length,
            engines: agg.engines,
            source_ids: agg.sourceIds,
            source_pages: agg.sourcePages,
            qa_summary_json: JSON.stringify(qaSummary),
            import_decision: decisionMeta.decision,
            import_reason: decisionMeta.reason
        };

        if (decisionMeta.decision === 'import') importRows.push(merged);
        else if (decisionMeta.decision === 'discard') discardedRows.push(merged);
        else pendingRows.push(merged);

        traceBySku[sku] = buildTraceEntry(sku, rows, merged, decisionMeta, qaSummary);
    }

    const sortBySku = (a, b) => String(a.sku || '').localeCompare(String(b.sku || ''), 'es', { numeric: true, sensitivity: 'base' });
    importRows.sort(sortBySku);
    pendingRows.sort(sortBySku);
    discardedRows.sort(sortBySku);

    const headers = [
        'sku',
        'designation_final',
        'measurement_final',
        'weight_final',
        'decision',
        'reason',
        'qa_validated',
        'occurrences',
        'engines',
        'source_ids',
        'source_pages',
        'qa_summary_json',
        'import_decision',
        'import_reason'
    ];

    writeCsv(path.join(OUTPUT_DIR, 'milu_wp_import.csv'), importRows, headers);
    writeCsv(path.join(OUTPUT_DIR, 'milu_wp_pending_review.csv'), pendingRows, headers);
    writeCsv(path.join(OUTPUT_DIR, 'milu_wp_discarded.csv'), discardedRows, headers);

    writeJson(path.join(OUTPUT_DIR, 'milu_wp_import.json'), importRows);
    writeJson(path.join(OUTPUT_DIR, 'milu_wp_pending_review.json'), pendingRows);
    writeJson(path.join(OUTPUT_DIR, 'milu_wp_discarded.json'), discardedRows);
    writeJson(path.join(OUTPUT_DIR, 'milu_wp_trace.json'), traceBySku);

    const report = {
        generated_at: new Date().toISOString(),
        engines_processed: ENGINE_JSON_FILES.length,
        occurrences_processed: allRows.length,
        pn_unique: byPn.size,
        totals: {
            import: importRows.length,
            pending_review: pendingRows.length,
            discard: discardedRows.length
        },
        rules: {
            rule_1: 'Si un PN tiene al menos una fila con qa_revision_estado=ok y qa_revision_accion=importar => import',
            rule_2: 'Si todas las filas del PN tienen qa_revision_estado=ok y qa_revision_accion=eliminar => discard',
            rule_3: 'Cualquier otro caso => pending_review'
        }
    };

    const summary = [
        '# MILU WordPress Export Summary (QA only)',
        '',
        `Generated at: ${report.generated_at}`,
        '',
        '## Totals',
        `- Engines processed: ${report.engines_processed}`,
        `- Occurrences processed: ${report.occurrences_processed}`,
        `- PN unique: ${report.pn_unique}`,
        `- Importables: ${report.totals.import}`,
        `- Pending review: ${report.totals.pending_review}`,
        `- Discarded: ${report.totals.discard}`,
        '',
        '## Official Rules',
        '- Rule 1: at least one row ok/importar => import',
        '- Rule 2: all rows ok/eliminar => discard',
        '- Rule 3: otherwise => pending_review',
        '',
        'La decision final depende solo de QA humana.'
    ].join('\n');

    fs.writeFileSync(path.join(OUTPUT_DIR, 'milu_wp_export_summary.md'), `${summary}\n`, 'utf8');
    console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
    run();
}

module.exports = {
    buildQaSummary,
    decideByQa,
    run
};
