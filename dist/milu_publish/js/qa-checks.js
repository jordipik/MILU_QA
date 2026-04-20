const QA_CHECK_DEFINITIONS = [
    { code: 'pos_required', label: 'POS: final lleno', field: 'POS' },
    { code: 'pos_final_pdf_match', label: 'POS: final coincide con PDF', field: 'POS' },
    { code: 'pn_required', label: 'PN: final lleno', field: 'PART NO.' },
    { code: 'pn_final_pdf_match', label: 'PN: final coincide con PDF', field: 'PART NO.' },
    { code: 'designation_required', label: 'DESIGNATION: final lleno', field: 'DESIGNATION' },
    { code: 'designation_final_pdf_or_gesa_match', label: 'DESIGNATION: final coincide con PDF o GESA', field: 'DESIGNATION' },
    { code: 'weight_final_pdf_or_gesa_match', label: 'WEIGHT: final coincide con PDF o GESA', field: 'WEIGHT' },
    { code: 'measurement_final_pdf_or_gesa_match', label: 'MEASUREMENT: final coincide con PDF o GESA', field: 'MEASUREMENT / STANDARD' },
    { code: 'norma_final_pdf_or_gesa_match', label: 'NORMA: final coincide con PDF o GESA (o todos vacios)', field: 'NORMA' },
    { code: 'bom_final_pdf_match', label: 'BOM: final coincide con PDF', field: 'BOM-No.' }
];

const QA_CHECK_LABELS = Object.fromEntries(QA_CHECK_DEFINITIONS.map((item) => [item.code, item.label]));

function text(value) {
    return String(value ?? '').trim();
}

export function normalizeCompareValue(value) {
    return text(value)
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export function isCompareMatch(left, right) {
    const normalizedLeft = normalizeCompareValue(left);
    const normalizedRight = normalizeCompareValue(right);
    return normalizedLeft !== '' && normalizedRight !== '' && normalizedLeft === normalizedRight;
}

export function getQaActiveSignature(activeCodes) {
    return [...new Set((activeCodes || []).map((code) => text(code)).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .join('|');
}

export function getAllQaCheckCodes() {
    return QA_CHECK_DEFINITIONS.map((item) => item.code);
}

export function getQaCheckDefinitions() {
    return QA_CHECK_DEFINITIONS.map((item) => ({ ...item }));
}

export function getQaCheckLabel(code) {
    return QA_CHECK_LABELS[text(code)] || text(code);
}

function getActiveCodeSet(activeCodes) {
    const resolved = Array.isArray(activeCodes) ? activeCodes : getAllQaCheckCodes();
    return new Set(resolved.map((code) => text(code)).filter(Boolean));
}

function getGesaPn(row) {
    const isGesaSi = text(row?.gesa).toUpperCase() === 'SI';
    if (!isGesaSi) return null;
    return text(row?.pn_final) || null;
}

function getGesaWeightWithUnits(row) {
    const weight = text(row?.weight_gesa);
    const units = text(row?.units);
    if (weight && units) return `${weight} ${units}`;
    if (weight) return weight;
    return null;
}

function getEntryMap(row) {
    return {
        'POS': {
            final: row?.pos_final,
            pdf: row?.pos_pdf ?? row?.POS,
            gesa: null,
            fields: ['POS', 'pos_final', 'pos_pdf']
        },
        'PART NO.': {
            final: row?.pn_final,
            pdf: row?.pn_pdf ?? row?.['PART NO.'],
            gesa: getGesaPn(row),
            fields: ['PART NO.', 'pn_final', 'pn_pdf']
        },
        'DESIGNATION': {
            final: row?.designation_final,
            pdf: row?.designation_pdf ?? row?.DESIGNATION,
            gesa: row?.designation_gesa,
            fields: ['DESIGNATION', 'designation_final', 'designation_gesa']
        },
        'WEIGHT': {
            final: row?.weight_final,
            pdf: row?.weight_pdf ?? row?.WEIGHT,
            gesa: getGesaWeightWithUnits(row),
            fields: ['WEIGHT', 'weight_final', 'weight_gesa']
        },
        'MEASUREMENT / STANDARD': {
            final: row?.measure_final ?? row?.measurement_final,
            pdf: row?.measure_pdf ?? row?.['MEASUREMENT / STANDARD'],
            gesa: row?.dimensions_gesa ?? row?.measure_gesa,
            fields: ['MEASUREMENT / STANDARD', 'measure_final', 'dimensions_gesa']
        },
        'NORMA': {
            final: row?.norma_final ?? row?.norma,
            pdf: row?.norma_pdf ?? row?.norma_raw ?? row?.norma,
            gesa: row?.norma_gesa,
            fields: ['NORMA', 'norma_final', 'norma_gesa', 'norma_raw']
        },
        'BOM-No.': {
            final: row?.['BOM-No.'],
            pdf: row?.bom_pdf,
            gesa: null,
            fields: ['BOM-No.', 'bom_pdf']
        }
    };
}

function addIssue(result, code, fields) {
    const normalizedCode = text(code);
    const normalizedFields = (fields || []).map((field) => text(field)).filter(Boolean);
    if (!normalizedCode) return;

    if (!result.codes.includes(normalizedCode)) result.codes.push(normalizedCode);
    normalizedFields.forEach((field) => {
        if (!result.fields[field]) result.fields[field] = [];
        if (!result.fields[field].includes(normalizedCode)) result.fields[field].push(normalizedCode);
    });
    result.issues.push({
        code: normalizedCode,
        severity: 'critical',
        fields: normalizedFields,
        message: getQaCheckLabel(normalizedCode)
    });
    result.severity = 'critical';
}

export function evaluateRowQaChecks(row, activeCodes) {
    const activeSet = getActiveCodeSet(activeCodes);
    const entries = getEntryMap(row);
    const result = {
        version: 1,
        severity: 'none',
        codes: [],
        fields: {},
        issues: [],
        signature: getQaActiveSignature([...activeSet]),
        updated_at: ''
    };

    const pos = entries['POS'];
    if (activeSet.has('pos_required') && normalizeCompareValue(pos.final) === '') {
        addIssue(result, 'pos_required', pos.fields);
    }
    if (activeSet.has('pos_final_pdf_match') && !isCompareMatch(pos.final, pos.pdf)) {
        addIssue(result, 'pos_final_pdf_match', pos.fields);
    }

    const pn = entries['PART NO.'];
    if (activeSet.has('pn_required') && normalizeCompareValue(pn.final) === '') {
        addIssue(result, 'pn_required', pn.fields);
    }
    if (activeSet.has('pn_final_pdf_match') && !isCompareMatch(pn.final, pn.pdf)) {
        addIssue(result, 'pn_final_pdf_match', pn.fields);
    }

    const designation = entries['DESIGNATION'];
    if (activeSet.has('designation_required') && normalizeCompareValue(designation.final) === '') {
        addIssue(result, 'designation_required', designation.fields);
    }
    if (activeSet.has('designation_final_pdf_or_gesa_match')
        && !isCompareMatch(designation.final, designation.pdf)
        && !isCompareMatch(designation.final, designation.gesa)) {
        addIssue(result, 'designation_final_pdf_or_gesa_match', designation.fields);
    }

    const weight = entries['WEIGHT'];
    if (activeSet.has('weight_final_pdf_or_gesa_match')
        && !isCompareMatch(weight.final, weight.pdf)
        && !isCompareMatch(weight.final, weight.gesa)) {
        addIssue(result, 'weight_final_pdf_or_gesa_match', weight.fields);
    }

    const measurement = entries['MEASUREMENT / STANDARD'];
    const measurementAllEmpty = [measurement.final, measurement.pdf, measurement.gesa].every((value) => normalizeCompareValue(value) === '');
    if (activeSet.has('measurement_final_pdf_or_gesa_match')
        && !measurementAllEmpty
        && !isCompareMatch(measurement.final, measurement.pdf)
        && !isCompareMatch(measurement.final, measurement.gesa)) {
        addIssue(result, 'measurement_final_pdf_or_gesa_match', measurement.fields);
    }

    const norma = entries['NORMA'];
    const normaAllEmpty = [norma.final, norma.pdf, norma.gesa].every((value) => normalizeCompareValue(value) === '');
    if (activeSet.has('norma_final_pdf_or_gesa_match')
        && !normaAllEmpty
        && !isCompareMatch(norma.final, norma.pdf)
        && !isCompareMatch(norma.final, norma.gesa)) {
        addIssue(result, 'norma_final_pdf_or_gesa_match', norma.fields);
    }

    const bom = entries['BOM-No.'];
    if (activeSet.has('bom_final_pdf_match') && normalizeCompareValue(bom.pdf) !== '' && !isCompareMatch(bom.final, bom.pdf)) {
        addIssue(result, 'bom_final_pdf_match', bom.fields);
    }

    result.codes.sort((a, b) => a.localeCompare(b));
    Object.keys(result.fields).forEach((field) => {
        result.fields[field].sort((a, b) => a.localeCompare(b));
    });
    result.issues.sort((left, right) => left.code.localeCompare(right.code));
    return result;
}
