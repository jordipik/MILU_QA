const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('./engine_files');
const { applyQaErrorsToRows } = require('./qa_errors');

function normalizeRevisionRecord(record) {
    return {
        estado: String(record?.estado ?? '').trim(),
        accion: String(record?.accion ?? '').trim(),
        updated_at: String(record?.updated_at ?? '').trim()
    };
}

function revisionRecordHasData(record) {
    return !!(String(record?.estado || '').trim() || String(record?.accion || '').trim());
}

function normalizeRevisionDataObject(parsed) {
    if (!parsed || typeof parsed !== 'object') return {};
    const normalizedData = {};

    if (parsed.revisions && typeof parsed.revisions === 'object') {
        return normalizeRevisionDataObject(parsed.revisions);
    }

    if (parsed.v === 2 && Array.isArray(parsed.r)) {
        parsed.r.forEach((entry) => {
            const idx = Number(entry?.[0]);
            if (!Number.isFinite(idx) || idx <= 0) return;
            const key = `idx=${idx}`;
            const value = normalizeRevisionRecord({
                estado: entry?.[1],
                accion: entry?.[2],
                updated_at: ''
            });
            if (revisionRecordHasData(value)) normalizedData[key] = value;
        });
        if (parsed.k && typeof parsed.k === 'object') {
            Object.entries(parsed.k).forEach(([key, value]) => {
                const normalized = normalizeRevisionRecord(value);
                if (revisionRecordHasData(normalized)) normalizedData[key] = normalized;
            });
        }
        return normalizedData;
    }

    Object.entries(parsed).forEach(([key, value]) => {
        const normalized = normalizeRevisionRecord(value);
        if (revisionRecordHasData(normalized)) normalizedData[key] = normalized;
    });
    return normalizedData;
}

function buildLegacyRevisionKey(row) {
    const id = String(row?.ID ?? '').trim();
    const pn = String(row?.['PART NO.'] ?? row?.pn ?? '').trim();
    const page = String(row?.['Source Page'] ?? '').trim();
    const pos = String(row?.POS ?? '').trim();
    const source = String(row?.source_file ?? '').trim();
    return [id, pn, page, pos, source].join('||');
}

function applyRevisionPayload(parsed, options = {}) {
    const repoRoot = options.repoRoot || process.cwd();
    const sourceName = options.sourceName || 'inline_payload';
    const revisionData = normalizeRevisionDataObject(parsed);

    let globalIndex = 0;
    let totalApplied = 0;
    const appliedByFile = {};
    const occCounter = new Map();

    ENGINE_JSON_FILES.forEach((fileName) => {
        const filePath = path.join(repoRoot, fileName);
        if (!fs.existsSync(filePath)) {
            throw new Error(`No existe el JSON de libro: ${filePath}`);
        }

        const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(rows)) {
            throw new Error(`El archivo no contiene un array: ${fileName}`);
        }

        let changedInFile = 0;
        rows.forEach((row) => {
            globalIndex += 1;
            const idxKey = `idx=${globalIndex}`;
            const legacyKey = buildLegacyRevisionKey(row);
            const occ = (occCounter.get(legacyKey) || 0) + 1;
            occCounter.set(legacyKey, occ);
            const occKey = `${legacyKey}||occ=${occ}`;

            const rev = revisionData[idxKey] || revisionData[legacyKey] || revisionData[occKey];
            if (!rev) return;

            const nextEstado = String(rev.estado || '').trim();
            const nextAccion = String(rev.accion || '').trim();
            const prevEstado = String(row.qa_revision_estado || '').trim();
            const prevAccion = String(row.qa_revision_accion || '').trim();

            if (prevEstado === nextEstado && prevAccion === nextAccion) return;

            row.qa_revision_estado = nextEstado;
            row.qa_revision_accion = nextAccion;
            changedInFile += 1;
        });

        let qaErrorsSummary = null;
        if (changedInFile > 0) {
            qaErrorsSummary = applyQaErrorsToRows(rows);
            fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
        }

        appliedByFile[fileName] = {
            revisionChanges: changedInFile,
            qaErrors: qaErrorsSummary
        };
        totalApplied += changedInFile;
    });

    return {
        revisionFile: sourceName,
        revisionEntries: Object.keys(revisionData).length,
        totalApplied,
        appliedByFile
    };
}

function applyRevisionFile(revisionFilePath, options = {}) {
    const repoRoot = options.repoRoot || process.cwd();
    const absoluteRevisionPath = path.isAbsolute(revisionFilePath)
        ? revisionFilePath
        : path.join(repoRoot, revisionFilePath);

    if (!fs.existsSync(absoluteRevisionPath)) {
        throw new Error(`No existe el archivo de revisión: ${absoluteRevisionPath}`);
    }

    const parsed = JSON.parse(fs.readFileSync(absoluteRevisionPath, 'utf8'));
    return applyRevisionPayload(parsed, { repoRoot, sourceName: absoluteRevisionPath });
}

function main() {
    const revisionArg = process.argv[2] || 'qa_revision_2026-04-09T10-11-31-442Z.json';
    const result = applyRevisionFile(revisionArg);
    console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
    main();
}

module.exports = {
    applyRevisionFile,
    applyRevisionPayload
};
