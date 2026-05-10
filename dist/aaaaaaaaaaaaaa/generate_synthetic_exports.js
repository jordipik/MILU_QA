const fs = require('fs');
const path = require('path');

const ENGINE_JSON_FILES = [
    'engine_12V4000M40A.json',
    'engine_12V4000M53.json',
    'engine_12V4000M70.json',
    'engine_16V4000M61.json',
    'engine_16V4000M73.json',
    'engine_16V4000M73L.json',
    'engine_16V4000M90.json',
    'engine_20V4000M93.json',
    'engine_20V4000M93L.json'
];

function norm(value) {
    return String(value ?? '').trim().toLowerCase();
}

function val(row, key) {
    const v = row?.[key];
    return v != null && String(v).trim() !== '' ? v : '';
}

function isSupersededArticle(row) {
    const hierarchy = String(row?.sust_hierarchie ?? '').trim().toUpperCase();
    return hierarchy.includes('SUPERSEDED');
}

function isGesaRow(row) {
    return String(row?.gesa || '').trim().toUpperCase() === 'SI';
}

function getRowValueForColumn(row, key) {
    const normalizeMeasurementText = (value) => {
        const text = String(value ?? '').trim();
        return text ? text.replace(/\s{2,}/g, ' ') : '';
    };

    switch (key) {
        case 'designation_final': {
            const explicitFinal = String(row?.designation_final ?? '').trim();
            if (explicitFinal) return explicitFinal;
            if (isGesaRow(row)) return String(val(row, 'designation_gesa'));
            return String(val(row, 'DESIGNATION'));
        }
        case 'measurement_final': {
            const gesaMeasurement = normalizeMeasurementText(row?.dimensions_gesa);
            if (gesaMeasurement) return gesaMeasurement;

            const rawMeasurement = normalizeMeasurementText(row?.['MEASUREMENT / STANDARD']);
            if (rawMeasurement) return rawMeasurement;

            return normalizeMeasurementText(row?.measure_final ?? row?.measurement_final);
        }
        case 'weight_final': {
            const explicitFinal = String(row?.weight_final ?? '').trim();
            if (explicitFinal) return explicitFinal;
            if (!isGesaRow(row)) return String(val(row, 'WEIGHT'));
            const weightValue = String(row?.weight_gesa ?? '').trim();
            const unitsValue = String(row?.units ?? '').trim();
            if (!weightValue) return '';
            return unitsValue ? `${weightValue} ${unitsValue}` : weightValue;
        }
        default:
            return String(val(row, key));
    }
}

function formatExportVersionStamp(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}.${hour}${minute}`;
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeModelTypeForExport(row) {
    const rawModel = String(row?.model ?? '').trim();
    if (rawModel) return rawModel;
    const engineModel = String(row?.engine_model ?? '').trim();
    if (!engineModel) return '';
    return engineModel.replace('4000', '').trim();
}

function normalizePageLabelForExport(row) {
    const book = String(row?.engine_model ?? '').trim();
    const pageRaw = String(row?.['Source Page'] ?? '').trim();
    if (!book || !pageRaw) return '';
    const digits = pageRaw.replace(/[^0-9]/g, '');
    const page = digits ? digits.padStart(4, '0') : pageRaw;
    return `${book}-${page}`;
}

function uniqueSortedValues(values, numeric = false) {
    const unique = [...new Set(values.map(v => String(v ?? '').trim()).filter(Boolean))];
    return unique.sort((a, b) => {
        if (numeric) return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });
        return a.localeCompare(b, 'es', { sensitivity: 'base' });
    });
}

function parseWeightNumber(value) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const normalized = text.replace(/\s+/g, ' ');
    const match = normalized.match(/(\d+[\d.,]*)\s*(KGM|KG|G)\b/i);
    if (!match) return null;

    let numericText = match[1].replace(/\s/g, '');
    if (numericText.includes(',') && numericText.includes('.')) {
        numericText = numericText.replace(/\./g, '').replace(',', '.');
    } else if (numericText.includes(',')) {
        numericText = numericText.replace(',', '.');
    }

    const parsed = Number(numericText);
    if (!Number.isFinite(parsed)) return null;

    const unit = match[2].toUpperCase();
    if (unit === 'G') return parsed / 1000;
    return parsed;
}

function resolveWeightForExport(row) {
    const gesaWeight = Number(row?.weight_gesa);
    if (Number.isFinite(gesaWeight)) return gesaWeight;
    const finalWeight = parseWeightNumber(getRowValueForColumn(row, 'weight_final'));
    if (Number.isFinite(finalWeight)) return finalWeight;
    return parseWeightNumber(row?.WEIGHT);
}

function formatWeightTextForExport(row, weightValue) {
    if (!Number.isFinite(weightValue)) {
        return String(getRowValueForColumn(row, 'weight_final') || row?.WEIGHT || '').trim();
    }
    const unit = String(row?.units || 'KGM').trim() || 'KGM';
    return `${weightValue.toFixed(3)} ${unit}`;
}

function resolveMeasurementForExport(row) {
    const gesaMeasurement = String(row?.dimensions_gesa ?? '').trim().replace(/\s{2,}/g, ' ');
    if (gesaMeasurement) return gesaMeasurement;

    let rawMeasurement = String(row?.['MEASUREMENT / STANDARD'] ?? '').trim().replace(/\s{2,}/g, ' ');
    const norma = String(row?.norma ?? '').trim();
    if (rawMeasurement && norma) {
        rawMeasurement = rawMeasurement.replace(new RegExp(`\\b${escapeRegExp(norma)}\\b`, 'ig'), '').trim();
    }
    if (rawMeasurement) return rawMeasurement;

    return String(row?.measure_final ?? row?.measurement_final ?? '').trim().replace(/\s{2,}/g, ' ');
}

function firstNonEmptyValue(rows, getter) {
    for (const row of rows) {
        const value = getter(row);
        if (value != null && String(value).trim() !== '') return value;
    }
    return null;
}

function mergeImageValues(primaryValue, secondaryValue) {
    const merged = [];
    const seen = new Set();

    const addValue = (value) => {
        const parts = String(value ?? '')
            .split(',')
            .map(part => part.trim())
            .filter(Boolean);
        for (const part of parts) {
            const key = norm(part);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(part);
        }
    };

    addValue(primaryValue);
    addValue(secondaryValue);
    return merged.join(', ');
}

function buildSyntheticNewExportRow(row, matches) {
    if (!matches.length) return null;
    if (isSupersededArticle(row)) return null;

    // Synthetic New output mapping (high level):
    // - Row-level fields come from selected representative row (row).
    // - Aggregate fields (PAG, model_type, exp_motor, categories) are built from all grouped rows (matches).
    // - Measurement and weight use fallback chains to preserve best available normalized value.
    const modelType = String(row?.model ?? '').trim();
    const engineModels = uniqueSortedValues(matches.map(item => String(item?.engine_model ?? '').trim()), true);
    const categoryValues = uniqueSortedValues(matches.map(item => String(item?.categoria ?? '').trim()));
    const imageValue = firstNonEmptyValue([row, ...matches], item => item?.exp_imagenes || '');
    const normalizedPn = String(row?.pn_final ?? row?.['PART NO.'] ?? row?.pn ?? '').trim();
    const hierarchy = String(row?.sust_hierarchie ?? '').trim();
    const supersededList = String(row?.sust_superseded_list ?? '').trim();
    const hasSubstitution = hierarchy !== '' || supersededList !== '' || String(row?.sust_new_part_number ?? '').trim() !== '';

    return {
        fecha_version: formatExportVersionStamp(),
        pn: normalizedPn,
        designation: String(row?.designation_final ?? '').trim(),
        engine: String(row?.engine ?? '').trim(),
        model_type: modelType,
        type: '',
        nsn: String(row?.nsn ?? '').trim(),
        GESA_NORM: String(row?.norma ?? '').trim(),
        GESA_NORMALIZADO: String(row?.normalizado ?? '').trim(),
        fg_code: row?.fg_code ?? '',
        fg_description: String(row?.fgs_description ?? '').trim(),
        fg_code_description: String(row?.fgs_code_description ?? '').trim(),
        weight: '',
        weight_txt: String(row?.weight_final ?? '').trim(),
        measurement: String(row?.measure_final ?? row?.measurement_final ?? '').trim(),
        TIPOARTICULO: 'piezas',
        PAG: String(row?.pages ?? '').trim(),
        BOM_no: String(row?.['BOM-No.'] ?? '').trim(),
        esquema_general: '',
        exp_motor: engineModels.join(', '),
        exp_categorias: categoryValues.join(', '),
        atributo: categoryValues.join(', '),
        SUST_TIPO: hierarchy || '',
        new_pn_relacionado: hierarchy === 'New' ? normalizedPn : (String(row?.sust_new_part_number ?? '').trim() || null),
        old_pn_relacionados: supersededList || null,
        EN_EXCEL_SUSTITUCION: hasSubstitution ? 'SI' : '',
        ruta_foto: String(row?.ruta_foto ?? '').trim() || null,
        exp_imagenes: imageValue
    };
}

function buildSyntheticSupersededExportRow(row, matches) {
    if (!matches.length) return null;
    if (!isSupersededArticle(row)) return null;

    // Synthetic Superseded output mapping mirrors New mapping, but:
    // - Forces substitution semantics (SUST_TIPO/New PN linkage).
    // - Adds vinculo URL using related new PN when available.
    const hierarchy = String(row?.sust_hierarchie ?? '').trim();
    const relatedNewPn = String(row?.sust_new_part_number ?? '').trim() || String(row?.['New Part Number'] ?? '').trim();
    if (!relatedNewPn && hierarchy !== 'Superseded') return null;

    const modelType = String(row?.model ?? '').trim();
    const engineModels = uniqueSortedValues(matches.map(item => String(item?.engine_model ?? '').trim()), true);
    const categoryValues = uniqueSortedValues(matches.map(item => String(item?.categoria ?? '').trim()));
    const imageValue = firstNonEmptyValue([row, ...matches], item => item?.exp_imagenes || '');
    const normalizedPn = String(row?.pn_final ?? row?.['PART NO.'] ?? row?.pn ?? '').trim();
    const resolvedRelatedPn = relatedNewPn || normalizedPn;
    const hasSubstitution = hierarchy === 'Superseded' || resolvedRelatedPn !== '';

    return {
        fecha_version: formatExportVersionStamp(),
        pn: normalizedPn,
        designation: String(row?.designation_final ?? '').trim(),
        engine: String(row?.engine ?? '').trim(),
        model_type: modelType,
        type: '',
        nsn: String(row?.nsn ?? '').trim(),
        GESA_NORM: String(row?.norma ?? '').trim(),
        GESA_NORMALIZADO: String(row?.normalizado ?? '').trim(),
        fg_code: row?.fg_code ?? '',
        fg_description: String(row?.fgs_description ?? '').trim(),
        fg_code_description: String(row?.fgs_code_description ?? '').trim(),
        weight: '',
        weight_txt: String(row?.weight_final ?? '').trim(),
        measurement: String(row?.measure_final ?? row?.measurement_final ?? '').trim(),
        TIPOARTICULO: 'piezas',
        PAG: String(row?.pages ?? '').trim(),
        BOM_no: String(row?.['BOM-No.'] ?? '').trim(),
        esquema_general: '',
        exp_motor: engineModels.join(', '),
        exp_categorias: categoryValues.join(', '),
        atributo: categoryValues.join(', '),
        SUST_TIPO: hierarchy || 'Superseded',
        new_pn_relacionado: resolvedRelatedPn || null,
        old_pn_relacionados: null,
        EN_EXCEL_SUSTITUCION: hasSubstitution ? 'SI' : '',
        ruta_foto: String(row?.ruta_foto ?? '').trim() || null,
        exp_imagenes: imageValue,
        vinculo: resolvedRelatedPn ? `milu-naval.mystagingwebsite.com/producto/${resolvedRelatedPn}` : ''
    };
}

function loadAllRows(repoRoot) {
    const allRows = [];
    ENGINE_JSON_FILES.forEach(fileName => {
        const filePath = path.join(repoRoot, fileName);
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(parsed)) return;
        parsed.forEach(row => {
            allRows.push({ ...row, __engine_file: fileName });
        });
    });
    return allRows;
}

function selectRepresentativeRowForNew(rows) {
    const candidates = rows.filter(row => String(row?.sust_hierarchie ?? '').trim() === 'New');
    const pool = candidates.length ? candidates : rows;
    return [...pool].sort((a, b) => String(a?.ID ?? '').localeCompare(String(b?.ID ?? ''), 'es', { numeric: true }))[0] || null;
}

function selectRepresentativeRowForSuperseded(rows) {
    const exact = rows.filter(row => String(row?.sust_hierarchie ?? '').trim() === 'Superseded');
    const withLinkedNew = rows.filter(row => String(row?.sust_new_part_number ?? row?.['New Part Number'] ?? '').trim() !== '');
    const pool = exact.length ? exact : (withLinkedNew.length ? withLinkedNew : rows);
    return [...pool].sort((a, b) => String(a?.ID ?? '').localeCompare(String(b?.ID ?? ''), 'es', { numeric: true }))[0] || null;
}

function main() {
    const repoRoot = __dirname;
    const outputNewPath = process.argv[2]
        ? path.resolve(repoRoot, process.argv[2])
        : path.join(repoRoot, 'qa_synthetic_new.json');
    const outputSupersededPath = process.argv[3]
        ? path.resolve(repoRoot, process.argv[3])
        : path.join(repoRoot, 'qa_synthetic_superseded.json');

    const allRows = loadAllRows(repoRoot);
    // Group all engine rows by PN key before emitting unique synthetic exports.
    const byPn = new Map();

    allRows.forEach(row => {
        const pn = String(row?.pn_final ?? row?.['PART NO.'] ?? row?.pn ?? '').trim();
        if (!pn) return;
        const key = norm(pn);
        if (!byPn.has(key)) byPn.set(key, []);
        byPn.get(key).push(row);
    });

    const pnEntries = [...byPn.entries()].map(([pnKey, rows]) => ({
        pnKey,
        pn: String(rows?.[0]?.pn_final ?? rows?.[0]?.['PART NO.'] ?? rows?.[0]?.pn ?? '').trim(),
        rows
    }));

    const syntheticNew = [];
    const syntheticSuperseded = [];

    pnEntries.forEach(entry => {
        const newRow = selectRepresentativeRowForNew(entry.rows);
        const supersededRow = selectRepresentativeRowForSuperseded(entry.rows);

        const newExport = newRow ? buildSyntheticNewExportRow(newRow, entry.rows) : null;
        const supersededExport = supersededRow ? buildSyntheticSupersededExportRow(supersededRow, entry.rows) : null;

        const newTipo = String(newExport?.SUST_TIPO ?? '').trim();
        if (newExport && (newTipo === 'New' || newTipo === '')) {
            syntheticNew.push(newExport);
        }

        const supersededTipo = String(supersededExport?.SUST_TIPO ?? '').trim();
        if (supersededExport && supersededTipo === 'Superseded') {
            syntheticSuperseded.push(supersededExport);
        }
    });

    fs.writeFileSync(outputNewPath, `${JSON.stringify(syntheticNew, null, 2)}\n`, 'utf8');
    fs.writeFileSync(outputSupersededPath, `${JSON.stringify(syntheticSuperseded, null, 2)}\n`, 'utf8');

    console.log(`OK New: ${outputNewPath}`);
    console.log(`OK Superseded: ${outputSupersededPath}`);
    console.log(`Rows: ${allRows.length}`);
    console.log(`Unique PN: ${pnEntries.length}`);
    console.log(`Unique New exports: ${syntheticNew.length}`);
    console.log(`Unique Superseded exports: ${syntheticSuperseded.length}`);
}

if (require.main === module) {
    main();
}
