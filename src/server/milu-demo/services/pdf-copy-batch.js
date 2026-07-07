const { ENGINE_JSON_FILES } = require('../config/engine_files');
const { runVisualCopyComparison } = require('../scripts/qa_pdf_visual_copy');

function toBoolean(value, defaultValue) {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return defaultValue;
}

function resolveFiles(fileOrFiles) {
    if (!fileOrFiles) return [...ENGINE_JSON_FILES];

    const asList = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    const uniqueFiles = [...new Set(asList.map((value) => String(value || '').trim()).filter(Boolean))];

    const invalid = uniqueFiles.filter((file) => !ENGINE_JSON_FILES.includes(file));
    if (invalid.length > 0) {
        throw new Error(`Archivo(s) no permitido(s): ${invalid.join(', ')}`);
    }

    return uniqueFiles;
}

async function runPdfVisualCopyBatch(options = {}) {
    const writePdf = toBoolean(options.writePdf, true);
    const backup = toBoolean(options.backup, true);
    const clearPdfBeforeCopy = toBoolean(options.clearPdfBeforeCopy, true);
    const id = String(options.id || '').trim();
    const files = resolveFiles(options.files || options.file);

    const perFile = [];
    const missingPageStatusCounts = new Map();
    const warnings = [];
    const errors = [];
    const startedAt = new Date();

    for (const file of files) {
        try {
            const { report } = await runVisualCopyComparison({
                file,
                id: id || undefined,
                writePdf,
                backup,
                clearPdfBeforeCopy,
                endpointName: '/copy-pdf-to-pdf-all-books'
            });

            const rows = Array.isArray(report?.rows) ? report.rows : [];
            const missingPages = Array.isArray(report?.missing_pages) ? report.missing_pages : [];

            const changedFields = new Set();
            let pnAnchorMissing = 0;

            for (const row of rows) {
                if (!row?.pn_anchor_found) pnAnchorMissing += 1;
                const changed = Array.isArray(row?.changed_fields) ? row.changed_fields : [];
                for (const field of changed) changedFields.add(String(field || '').trim());
            }

            for (const missing of missingPages) {
                const status = String(missing?.status || 'unknown').trim() || 'unknown';
                missingPageStatusCounts.set(status, (missingPageStatusCounts.get(status) || 0) + 1);
            }

            if (missingPages.length > 0) {
                warnings.push({
                    type: 'missing-pages',
                    file,
                    count: missingPages.length
                });
            }

            if (pnAnchorMissing > 0) {
                warnings.push({
                    type: 'pn-anchor-missing',
                    file,
                    count: pnAnchorMissing
                });
            }

            perFile.push({
                ok: true,
                file,
                id: id || null,
                scanned: Number(report?.scanned_rows) || 0,
                changedRows: Number(report?.changed_pdf_fields_rows) || 0,
                unchangedRows: Math.max(0, (Number(report?.scanned_rows) || 0) - (Number(report?.changed_pdf_fields_rows) || 0)),
                missingPages: missingPages.length,
                pnAnchorMissing,
                wroteFile: Boolean(report?.wrote_engine_file),
                changedFieldsDistinct: Array.from(changedFields).filter(Boolean).sort(),
                warnings: [
                    ...(missingPages.length > 0 ? [`missing_pages=${missingPages.length}`] : []),
                    ...(pnAnchorMissing > 0 ? [`pn_anchor_missing=${pnAnchorMissing}`] : [])
                ],
                errors: []
            });
        } catch (error) {
            const message = String(error?.message || error || 'Error desconocido');
            errors.push({ file, id: id || null, message });
            perFile.push({
                ok: false,
                file,
                id: id || null,
                scanned: 0,
                changedRows: 0,
                unchangedRows: 0,
                missingPages: 0,
                pnAnchorMissing: 0,
                wroteFile: false,
                changedFieldsDistinct: [],
                warnings: [],
                errors: [message]
            });
        }
    }

    const totals = perFile.filter((item) => item.ok).reduce((acc, item) => {
        acc.scanned += item.scanned;
        acc.changedRows += item.changedRows;
        acc.unchangedRows += item.unchangedRows;
        acc.missingPages += item.missingPages;
        acc.pnAnchorMissing += item.pnAnchorMissing;
        if (item.wroteFile) acc.filesWritten += 1;
        return acc;
    }, {
        scanned: 0,
        changedRows: 0,
        unchangedRows: 0,
        missingPages: 0,
        pnAnchorMissing: 0,
        filesWritten: 0
    });

    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

    const filesProcessed = perFile.length;
    const resultOk = errors.length === 0;

    return {
        ok: resultOk,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
        filesProcessed,
        scanned: totals.scanned,
        changedRows: totals.changedRows,
        unchangedRows: totals.unchangedRows,
        warnings,
        errors,
        options: {
            writePdf,
            backup,
            clearPdfBeforeCopy,
            id: id || null,
            files
        },
        totals,
        missingPageStatusBreakdown: Object.fromEntries(
            [...missingPageStatusCounts.entries()].sort((a, b) => Number(b[1]) - Number(a[1]))
        ),
        perFile
    };
}

module.exports = {
    runPdfVisualCopyBatch
};
