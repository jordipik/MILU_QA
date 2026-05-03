const fs = require('fs');
const path = require('path');
const { runSyntheticCompaction } = require('./export_review_pipeline');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'output', 'wordpress');
const EXPORT_REVIEW_DIR = path.join(REPO_ROOT, 'data', 'output', 'export_review');

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

function splitCsvUnique(value) {
    return [...new Set(
        t(value)
            .split(',')
            .map((part) => t(part))
            .filter(Boolean)
    )];
}

function normalizeSourceRecords(row) {
    if (!Array.isArray(row?.source_records)) return [];
    return row.source_records.map((item) => ({
        id: t(item?.id),
        engine_model: t(item?.engine_model),
        source_file: t(item?.source_file),
        source_page: t(item?.source_page),
        pos: t(item?.pos),
        bom: t(item?.bom),
        designation_final: t(item?.designation_final),
        measure_final: t(item?.measure_final),
        weight_final: t(item?.weight_final),
        qa_revision_estado: key(item?.qa_revision_estado),
        qa_revision_accion: key(item?.qa_revision_accion)
    }));
}

function loadSyntheticRows() {
    ensureDir(EXPORT_REVIEW_DIR);

    const syntheticNewPath = path.join(EXPORT_REVIEW_DIR, 'synthetic_new_compacted.json');
    const syntheticSupPath = path.join(EXPORT_REVIEW_DIR, 'synthetic_superseded_compacted.json');

    let syntheticNew = readJson(syntheticNewPath, null);
    let syntheticSup = readJson(syntheticSupPath, null);

    if (!Array.isArray(syntheticNew) || !Array.isArray(syntheticSup)) {
        runSyntheticCompaction(REPO_ROOT);
        syntheticNew = readJson(syntheticNewPath, []);
        syntheticSup = readJson(syntheticSupPath, []);
    }

    const rows = [
        ...(Array.isArray(syntheticNew) ? syntheticNew : []),
        ...(Array.isArray(syntheticSup) ? syntheticSup : [])
    ];

    return rows.map((row) => ({
        ...row,
        pn: t(row?.pn),
        designation: t(row?.designation),
        measurement: t(row?.measurement),
        weight: t(row?.weight),
        source_records: normalizeSourceRecords(row)
    }));
}

function buildQaSummary(syntheticRow) {
    const sourceRows = Array.isArray(syntheticRow?.source_records) ? syntheticRow.source_records : [];
    const summary = {
        total_rows: sourceRows.length,
        count_ok_importar: 0,
        count_ok_eliminar: 0,
        count_pendiente: 0,
        count_revisar: 0
    };

    for (const row of sourceRows) {
        const estado = key(row.qa_revision_estado);
        const accion = key(row.qa_revision_accion);

        if (estado === 'ok' && accion === 'importar') summary.count_ok_importar += 1;
        if (estado === 'ok' && accion === 'eliminar') summary.count_ok_eliminar += 1;
        if (estado === 'pendiente' || estado === 'en revision' || estado === 'en revisión') summary.count_pendiente += 1;
        if (accion === 'revisar') summary.count_revisar += 1;
    }

    return summary;
}

function decidePnExport(syntheticRow) {
    const qaSummary = syntheticRow?.qa_summary || buildQaSummary(syntheticRow);

    if (qaSummary.count_ok_importar > 0) {
        return {
            decision: 'import',
            reason: 'validated_by_user',
            qa_validated: true
        };
    }

    if (qaSummary.total_rows > 0 && qaSummary.count_ok_eliminar === qaSummary.total_rows) {
        return {
            decision: 'discard',
            reason: 'all_rows_marked_delete',
            qa_validated: false
        };
    }

    return {
        decision: 'pending_review',
        reason: 'requires_review',
        qa_validated: false
    };
}

function buildSimpleAiSignals(syntheticRow) {
    const conflicts = Array.isArray(syntheticRow?.merge_quality?.real_conflict_fields)
        ? syntheticRow.merge_quality.real_conflict_fields.map((item) => key(item))
        : [];

    const codes = [];
    const pn = t(syntheticRow?.pn);
    const designation = t(syntheticRow?.designation);
    const measurement = t(syntheticRow?.measurement);
    const weight = t(syntheticRow?.weight);
    const occurrences = Number(syntheticRow?.total_occurrences_global || syntheticRow?.source_records?.length || 0);

    if (!pn) codes.push('pn_missing');
    if (!designation) codes.push('designation_missing');
    if (!measurement) codes.push('measure_missing');
    if (conflicts.includes('weight')) codes.push('weight_conflict');
    if (key(syntheticRow?.sust_tipo) === 'superseded' && !t(syntheticRow?.new_pn_relacionado) && !t(syntheticRow?.old_pn_relacionados)) {
        codes.push('sust_ambiguous');
    }
    if (occurrences > 1 && conflicts.length > 0) {
        codes.push('duplicate_inconsistent');
    }

    return {
        ai_conflict_codes: [...new Set(codes)],
        ai_reason_simple: codes.length ? codes.join('|') : 'none'
    };
}

function buildExportRow(syntheticRow, decisionMeta) {
    const qaSummary = syntheticRow.qa_summary || buildQaSummary(syntheticRow);
    const aiSignals = decisionMeta.decision === 'pending_review'
        ? buildSimpleAiSignals(syntheticRow)
        : { ai_conflict_codes: [], ai_reason_simple: '' };

    const engines = splitCsvUnique(syntheticRow.engine_models_all).join(', ');
    const sourceIds = splitCsvUnique(syntheticRow.source_ids_all).join(', ');

    return {
        sku: t(syntheticRow.pn),
        designation_final: t(syntheticRow.designation),
        decision: decisionMeta.decision,
        reason: decisionMeta.reason,
        qa_validated: decisionMeta.qa_validated,
        occurrences: Number(syntheticRow.total_occurrences_global || syntheticRow.source_records.length || 0),
        engines,
        source_ids: sourceIds,
        qa_summary: JSON.stringify(qaSummary),
        ai_reason_simple: aiSignals.ai_reason_simple,
        ai_conflict_codes: aiSignals.ai_conflict_codes.join(','),
        import_decision: decisionMeta.decision,
        import_reason: decisionMeta.reason
    };
}

function run() {
    ensureDir(OUTPUT_DIR);

    const syntheticRows = loadSyntheticRows();
    const prepared = syntheticRows.map((row) => ({
        ...row,
        qa_summary: buildQaSummary(row)
    }));

    const importRows = [];
    const pendingRows = [];
    const discardedRows = [];

    for (const syntheticRow of prepared) {
        const decisionMeta = decidePnExport(syntheticRow);
        const outRow = buildExportRow(syntheticRow, decisionMeta);

        if (decisionMeta.decision === 'import') {
            importRows.push(outRow);
        } else if (decisionMeta.decision === 'discard') {
            discardedRows.push(outRow);
        } else {
            pendingRows.push(outRow);
        }
    }

    const headers = [
        'sku',
        'designation_final',
        'decision',
        'reason',
        'qa_validated',
        'occurrences',
        'engines',
        'source_ids',
        'qa_summary',
        'ai_reason_simple',
        'ai_conflict_codes',
        'import_decision',
        'import_reason'
    ];

    writeCsv(path.join(OUTPUT_DIR, 'milu_wp_import.csv'), importRows, headers);
    writeCsv(path.join(OUTPUT_DIR, 'milu_wp_pending_review.csv'), pendingRows, headers);
    writeCsv(path.join(OUTPUT_DIR, 'milu_wp_discarded.csv'), discardedRows, headers);

    writeJson(path.join(OUTPUT_DIR, 'milu_wp_import.json'), importRows);
    writeJson(path.join(OUTPUT_DIR, 'milu_wp_pending_review.json'), pendingRows);
    writeJson(path.join(OUTPUT_DIR, 'milu_wp_discarded.json'), discardedRows);

    // Compatibilidad temporal para consumidores legacy del pipeline.
    writeJson(path.join(OUTPUT_DIR, 'milu_wp_new_import.json'), importRows);
    writeJson(path.join(OUTPUT_DIR, 'milu_wp_superseded_import.json'), []);

    const report = {
        generated_at: new Date().toISOString(),
        source_rows: prepared.length,
        totals: {
            import: importRows.length,
            pending_review: pendingRows.length,
            discard: discardedRows.length
        },
        rules: {
            rule_1: 'if count_ok_importar > 0 => import',
            rule_2: 'if count_ok_eliminar == total_rows => discard',
            rule_3: 'else => pending_review'
        }
    };

    writeJson(path.join(OUTPUT_DIR, 'milu_wp_export_report.json'), report);

    const summary = [
        '# MILU WordPress Export Summary (QA-first)',
        '',
        `Generated at: ${report.generated_at}`,
        '',
        '## Totals',
        `- Synthetic PN rows: ${report.source_rows}`,
        `- Import: ${report.totals.import}`,
        `- Pending review: ${report.totals.pending_review}`,
        `- Discard: ${report.totals.discard}`,
        '',
        '## Decision Rules',
        '- Rule 1: if count_ok_importar > 0 => import',
        '- Rule 2: if count_ok_eliminar == total_rows => discard',
        '- Rule 3: else => pending_review'
    ].join('\n');

    fs.writeFileSync(path.join(OUTPUT_DIR, 'milu_wp_export_summary.md'), `${summary}\n`, 'utf8');

    console.log('WordPress export generated in data/output/wordpress (QA-first).');
    console.log(JSON.stringify(report.totals, null, 2));
}

if (require.main === module) {
    run();
}

module.exports = {
    buildQaSummary,
    decidePnExport,
    buildSimpleAiSignals,
    run
};
