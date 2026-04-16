const fs = require('fs');

const REVISION_ESTADO_ALLOWED = new Set(['', 'pendiente', 'en revision', 'revisado', 'descartado']);
const REVISION_ACCION_ALLOWED = new Set(['', 'mantener', 'actualizar', 'revisar', 'sustituir', 'eliminar']);

function text(value) {
    if (value == null) return '';
    return String(value).trim();
}

function normalizeSpaces(value) {
    return text(value).replace(/\s+/g, ' ').trim();
}

function normalizeRevisionValue(value) {
    return normalizeSpaces(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function isGesaRow(row) {
    return text(row?.gesa).toUpperCase() === 'SI';
}

function getFinalDesignation(row) {
    const explicit = text(row?.designation_final);
    if (explicit) return explicit;
    return isGesaRow(row) ? text(row?.designation_gesa) : text(row?.DESIGNATION);
}

function getFinalMeasurement(row) {
    const fromGesa = normalizeSpaces(row?.dimensions_gesa);
    if (fromGesa) return fromGesa;
    const fromRaw = normalizeSpaces(row?.['MEASUREMENT / STANDARD']);
    if (fromRaw) return fromRaw;
    return normalizeSpaces(row?.measurement_final);
}

function getFinalWeight(row) {
    const explicit = text(row?.weight_final);
    if (explicit) return explicit;

    if (!isGesaRow(row)) return text(row?.WEIGHT);

    const w = text(row?.weight_gesa);
    const units = text(row?.units);
    if (!w) return '';
    return units ? `${w} ${units}` : w;
}

function createContext(rows) {
    const idCount = new Map();
    const logicalKeyCount = new Map();

    rows.forEach((row) => {
        const id = text(row?.ID);
        if (id) idCount.set(id, (idCount.get(id) || 0) + 1);

        const pn = text(row?.['PART NO.'] || row?.pn_final || row?.pn);
        const page = text(row?.['Source Page']);
        const pos = text(row?.POS);
        const source = text(row?.source_file);
        if (pn && page && pos && source) {
            const key = `${pn}||${page}||${pos}||${source}`.toLowerCase();
            logicalKeyCount.set(key, (logicalKeyCount.get(key) || 0) + 1);
        }
    });

    return { idCount, logicalKeyCount };
}

function addIssue(target, code, severity, fields, message) {
    if (!target.codes.includes(code)) target.codes.push(code);

    fields.forEach((field) => {
        if (!field) return;
        if (!target.fields[field]) target.fields[field] = [];
        if (!target.fields[field].includes(code)) target.fields[field].push(code);
    });

    target.issues.push({ code, severity, fields, message });

    if (severity === 'critical' || (severity === 'warning' && target.severity === 'none')) {
        target.severity = severity;
    }
}

function validateRow(row, context) {
    const result = {
        version: 1,
        severity: 'none',
        codes: [],
        fields: {},
        issues: []
    };

    const id = text(row?.ID);
    const pn = text(row?.['PART NO.'] || row?.pn_final || row?.pn);
    const sourceFile = text(row?.source_file);
    const sourcePage = text(row?.['Source Page']);
    const pos = text(row?.POS);

    if (!id) {
        addIssue(result, 'missing_id', 'critical', ['ID'], 'ID vacio');
    }

    if (!pn) {
        addIssue(result, 'missing_part_no', 'critical', ['PART NO.', 'pn_final', 'pn'], 'Sin PN en PART NO./pn_final/pn');
    }

    if (!sourceFile) {
        addIssue(result, 'missing_source_file', 'warning', ['source_file'], 'source_file vacio');
    }

    if (!sourcePage) {
        addIssue(result, 'missing_source_page', 'warning', ['Source Page'], 'Source Page vacio');
    }

    if (!pos) {
        addIssue(result, 'missing_pos', 'warning', ['POS'], 'POS vacio');
    }

    if (!getFinalDesignation(row)) {
        addIssue(result, 'missing_designation_final', 'warning', ['designation_final', 'designation_gesa', 'DESIGNATION'], 'designation_final vacio');
    }

    if (!getFinalMeasurement(row)) {
        addIssue(result, 'missing_measurement_final', 'warning', ['measurement_final', 'dimensions_gesa', 'MEASUREMENT / STANDARD'], 'measurement_final vacio');
    }

    if (!getFinalWeight(row)) {
        addIssue(result, 'missing_weight_final', 'warning', ['weight_final', 'weight_gesa', 'units', 'WEIGHT', 'UNITS'], 'weight_final vacio');
    }

    if (id && (context.idCount.get(id) || 0) > 1) {
        addIssue(result, 'duplicate_id', 'critical', ['ID'], 'ID repetido dentro del mismo engine_*.json');
    }

    if (pn && sourcePage && pos && sourceFile) {
        const key = `${pn}||${sourcePage}||${pos}||${sourceFile}`.toLowerCase();
        if ((context.logicalKeyCount.get(key) || 0) > 1) {
            addIssue(result, 'duplicate_logical_row', 'warning', ['PART NO.', 'Source Page', 'POS', 'source_file'], 'Duplicado por PN+Page+POS+source_file');
        }
    }

    const revisionEstado = normalizeRevisionValue(row?.qa_revision_estado);
    if (!REVISION_ESTADO_ALLOWED.has(revisionEstado)) {
        addIssue(result, 'invalid_revision_estado', 'warning', ['qa_revision_estado'], 'qa_revision_estado fuera del catalogo permitido');
    }

    const revisionAccion = normalizeRevisionValue(row?.qa_revision_accion);
    if (!REVISION_ACCION_ALLOWED.has(revisionAccion)) {
        addIssue(result, 'invalid_revision_accion', 'warning', ['qa_revision_accion'], 'qa_revision_accion fuera del catalogo permitido');
    }

    const enWeb = row?.EN_WEB === true || String(row?.EN_WEB || '').toLowerCase() === 'true';
    const hasPhoto = !!(text(row?.filename_foto) || text(row?.ruta_foto));
    if (enWeb && !hasPhoto) {
        addIssue(result, 'en_web_without_photo', 'warning', ['EN_WEB', 'filename_foto', 'ruta_foto'], 'EN_WEB=true sin imagen');
    }

    result.codes.sort((a, b) => a.localeCompare(b));
    Object.keys(result.fields).forEach((field) => {
        result.fields[field].sort((a, b) => a.localeCompare(b));
    });

    return result;
}

function stableSnapshot(errors) {
    if (!errors || typeof errors !== 'object') {
        return JSON.stringify({ version: 1, severity: 'none', codes: [], fields: {}, issues: [] });
    }

    const normalized = {
        version: Number.isFinite(Number(errors.version)) ? Number(errors.version) : 1,
        severity: text(errors.severity).toLowerCase() || 'none',
        codes: Array.isArray(errors.codes) ? [...new Set(errors.codes.map((code) => text(code)).filter(Boolean))].sort((a, b) => a.localeCompare(b)) : [],
        fields: {},
        issues: Array.isArray(errors.issues)
            ? errors.issues.map((issue) => ({
                code: text(issue?.code),
                severity: text(issue?.severity).toLowerCase() || 'warning',
                fields: Array.isArray(issue?.fields) ? issue.fields.map((field) => text(field)).filter(Boolean).sort((a, b) => a.localeCompare(b)) : [],
                message: text(issue?.message)
            })).sort((a, b) => `${a.code}|${a.message}`.localeCompare(`${b.code}|${b.message}`))
            : []
    };

    if (errors.fields && typeof errors.fields === 'object') {
        Object.keys(errors.fields).sort((a, b) => a.localeCompare(b)).forEach((field) => {
            const codes = Array.isArray(errors.fields[field])
                ? [...new Set(errors.fields[field].map((code) => text(code)).filter(Boolean))].sort((a, b) => a.localeCompare(b))
                : [];
            if (codes.length > 0) normalized.fields[field] = codes;
        });
    }

    return JSON.stringify(normalized);
}

function applyQaErrorsToRows(rows, options = {}) {
    if (!Array.isArray(rows)) {
        throw new Error('applyQaErrorsToRows espera un array de filas');
    }

    const nowIso = text(options.nowIso) || new Date().toISOString();
    const context = createContext(rows);
    let changedRows = 0;
    let rowsWithErrors = 0;

    rows.forEach((row) => {
        const next = validateRow(row, context);
        if (next.codes.length > 0) rowsWithErrors += 1;

        const prev = row?.qa_errors;
        if (stableSnapshot(prev) === stableSnapshot(next)) {
            if (!row.qa_errors || typeof row.qa_errors !== 'object') {
                row.qa_errors = { ...next, updated_at: nowIso };
                changedRows += 1;
            }
            return;
        }

        row.qa_errors = { ...next, updated_at: nowIso };
        changedRows += 1;
    });

    return {
        totalRows: rows.length,
        rowsWithErrors,
        changedRows
    };
}

function recomputeQaErrorsInFile(filePath, options = {}) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) {
        throw new Error(`El archivo no contiene un array JSON: ${filePath}`);
    }

    const summary = applyQaErrorsToRows(rows, options);
    if (summary.changedRows > 0 || options.forceWrite === true) {
        fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
    }

    return summary;
}

function getActiveCodesSignature(activeCodes) {
    if (!Array.isArray(activeCodes)) return '';
    return [...new Set(activeCodes.map(code => String(code || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .join('|');
}

function filterQaErrorsByCodes(qaErrors, activeCodes) {
    if (!qaErrors || !Array.isArray(activeCodes)) {
        return qaErrors;
    }

    const activeSet = new Set(activeCodes.map(c => String(c).trim()).filter(c => c));
    if (activeSet.size === 0) {
        return {
            version: qaErrors.version || 1,
            severity: 'none',
            codes: [],
            fields: {},
            issues: [],
            updated_at: new Date().toISOString()
        };
    }

    const filteredCodes = (qaErrors.codes || []).filter(code => activeSet.has(code));
    const filteredFields = {};
    const filteredIssues = [];

    (qaErrors.issues || []).forEach((issue) => {
        if (!activeSet.has(issue.code)) return;
        filteredIssues.push(issue);
        (issue.fields || []).forEach((field) => {
            if (!field) return;
            if (!filteredFields[field]) filteredFields[field] = [];
            if (!filteredFields[field].includes(issue.code)) {
                filteredFields[field].push(issue.code);
            }
        });
    });

    let severity = 'none';
    filteredIssues.forEach((issue) => {
        if (issue.severity === 'critical') severity = 'critical';
        else if (issue.severity === 'warning' && severity !== 'critical') severity = 'warning';
    });

    return {
        version: qaErrors.version || 1,
        severity,
        codes: filteredCodes,
        fields: filteredFields,
        issues: filteredIssues,
        signature: getActiveCodesSignature(activeCodes),
        updated_at: qaErrors.updated_at || new Date().toISOString()
    };
}

function applyActiveQaErrorsToRows(rows, activeCodes) {
    if (!Array.isArray(rows)) {
        throw new Error('applyActiveQaErrorsToRows espera un array de filas');
    }

    const signature = getActiveCodesSignature(activeCodes);
    let changedRows = 0;

    rows.forEach((row) => {
        const next = filterQaErrorsByCodes(row?.qa_errors || null, activeCodes);
        const prev = row?.qa_errors_active;
        const nextSnapshot = JSON.stringify(next || null);
        const prevSnapshot = JSON.stringify(prev || null);
        if (nextSnapshot !== prevSnapshot) {
            row.qa_errors_active = next ? { ...next, signature } : null;
            changedRows += 1;
        } else if (row?.qa_errors_active && row.qa_errors_active.signature !== signature) {
            row.qa_errors_active.signature = signature;
            changedRows += 1;
        }
    });

    return { changedRows, signature };
}

function getQaErrorsStats(rows, activeCodes) {
    let totalRows = 0;
    let rowsWithErrors = 0;
    const codeCount = {};
    const severityCount = { none: 0, warning: 0, critical: 0 };

    rows.forEach((row) => {
        totalRows++;
        const qaErrors = row.qa_errors_active || filterQaErrorsByCodes(row.qa_errors, activeCodes);
        if (!qaErrors) {
            severityCount.none++;
            return;
        }

        if (qaErrors.codes.length > 0) {
            rowsWithErrors++;
            severityCount[qaErrors.severity] = (severityCount[qaErrors.severity] || 0) + 1;
            qaErrors.codes.forEach((code) => {
                codeCount[code] = (codeCount[code] || 0) + 1;
            });
        } else {
            severityCount.none++;
        }
    });

    return {
        totalRows,
        rowsWithErrors,
        rowsOk: totalRows - rowsWithErrors,
        codeCount,
        severityCount
    };
}

module.exports = {
    applyQaErrorsToRows,
    applyActiveQaErrorsToRows,
    recomputeQaErrorsInFile,
    validateRow,
    filterQaErrorsByCodes,
    getQaErrorsStats,
    getActiveCodesSignature
};
