import './fieldAdapter.js';

const QA_ARTICULOS_FIELD_FALLBACKS = {
    source_page: ['Source Page', 'page4'],
    engine_model: ['engine_model', '__engine_model', 'engine', 'model'],
    source_file: ['source_file', '__engine_file'],
    source_sheet: ['source_sheet', 'sheet'],
    libro_pag: ['libro_pag', 'book_set', 'pages'],

    pos_final: ['POS'],
    pn_final: ['PART NO.', 'pn'],
    designation_final: ['DESIGNATION', 'designation_gesa'],
    model_type_final: ['MODEL/TYPE', 'model'],
    qty_final: ['QTY'],
    qty_units_final: ['UNITS', 'units'],
    weight_final: ['WEIGHT', 'weight_gesa', 'weight_pdf'],
    measure_final: ['measurement_final', 'MEASUREMENT / STANDARD', 'dimensions_gesa', 'measure_pdf'],
    norma_final: ['norma', 'STANDARD', 'norma_pdf'],
    fg_fgs_final: ['FG/FGS', 'fgs_code_description', 'fg_code'],
    bom_final: ['BOM-No.'],

    pn_excel: ['pn_excel', 'pn_raw', 'PART NO.', 'pn'],
    designation_excel: ['designation_excel', 'DESIGNATION', 'designation_gesa'],
    pos_excel: ['pos_excel', 'POS'],
    qty_excel: ['qty_excel', 'QTY'],
    qty_units_excel: ['qty_units_excel', 'UNITS', 'units'],
    weight_excel: ['weight_excel', 'WEIGHT', 'weight_gesa'],
    measure_excel: ['measure_excel', 'MEASUREMENT / STANDARD', 'dimensions_gesa'],
    norma_excel: ['norma_excel', 'STANDARD', 'norma'],
    fg_fgs_excel: ['fg_fgs_excel', 'FG/FGS', 'fg_code'],
    bom_excel: ['bom_excel', 'BOM-No.'],

    pn_pdf: ['pn_pdf', 'PART NO.', 'pn_final'],
    designation_pdf: ['designation_pdf', 'DESIGNATION', 'designation_final'],
    pos_pdf: ['pos_pdf', 'POS', 'pos_final'],
    qty_pdf: ['qty_pdf', 'QTY', 'qty_final'],
    qty_units_pdf: ['qty_units_pdf', 'UNITS', 'qty_units_final'],
    weight_pdf: ['weight_pdf', 'WEIGHT', 'weight_final'],
    measure_pdf: ['measure_pdf', 'MEASUREMENT / STANDARD', 'measure_final'],
    norma_pdf: ['norma_pdf', 'STANDARD', 'norma_final'],
    fg_fgs_pdf: ['fg_fgs_pdf', 'FG/FGS', 'fg_fgs_final'],
    bom_pdf: ['bom_pdf', 'BOM-No.', 'bom_final'],

    designation_gesa: ['designation_gesa', 'DESIGNATION'],
    weight_number_gesa: ['weight_number_gesa', 'weight_gesa'],
    weight_units_gesa: ['weight_units_gesa', 'units'],
    measure_number_gesa: ['measure_number_gesa', 'dimensions_gesa'],
    norma_gesa: ['norma_gesa', 'norma', 'STANDARD'],
    nsn_gesa: ['nsn_gesa', 'nsn'],
    is_gesa_gesa: ['is_gesa_gesa', 'gesa', 'is_gesa_excel'],
    is_norma_gesa: ['is_norma_gesa'],

    is_subst_final: ['sust_status', 'is_subst_excel'],
    hierarchie_final: ['sust_hierarchie', 'hierarchie_excel'],
    new_pn_final: ['sust_new_part_number', 'new_part_number', 'pn_new'],
    subst_pnlist_final: ['sust_superseded_list'],

    ruta_foto: ['filename_foto'],
    ruta_esquemas_pos: [],
    esquemas: ['esquemas'],
    esquemas_circulos: ['esquemas_circulos'],
    esquemas_circulos_all: ['esquemas_circulos_all'],

    qa_revision_estado: ['qa_revision_estado'],
    qa_revision_accion: ['qa_revision_accion'],

    measure_error: ['measurement_error', 'measure_error']
};

function isEmptyFieldValue(value) {
    const text = String(value ?? '').trim();
    return text === '' || text === '-' || text === 'null' || text === 'undefined';
}

function getFieldAdapterApi() {
    try {
        const adapter = globalThis?.window?.fieldAdapter;
        if (adapter && typeof adapter.getField === 'function') return adapter;
    } catch (_) {
        // Ignore window access issues in non-browser contexts.
    }
    return null;
}

function getDebugEnabled() {
    try {
        return Boolean(globalThis?.window?.QA_ARTICULOS_FIELD_DEBUG);
    } catch (_) {
        return false;
    }
}

function logDebug(record, fieldName, source, alias) {
    if (!getDebugEnabled()) return;
    const id = String(record?.ID ?? '').trim();
    const payload = { field: fieldName, source, alias: alias || '' };
    if (id) payload.id = id;
    console.debug('[QA Articulos fieldAdapter]', payload);
}

export function getQaArticulosFieldValue(record, fieldName, defaultValue = '') {
    const row = record && typeof record === 'object' ? record : {};
    const field = String(fieldName || '').trim();
    if (!field) return defaultValue;

    const adapter = getFieldAdapterApi();
    if (adapter) {
        const adapterValue = adapter.getField(row, field);
        if (!isEmptyFieldValue(adapterValue)) {
            let aliasUsed = field;
            if (typeof adapter.getFieldAliases === 'function') {
                const aliases = adapter.getFieldAliases(field);
                if (Array.isArray(aliases)) {
                    const matched = aliases.find((alias) => Object.prototype.hasOwnProperty.call(row, alias) && !isEmptyFieldValue(row[alias]));
                    if (matched) aliasUsed = matched;
                }
            }
            logDebug(row, field, 'adapter', aliasUsed);
            return adapterValue;
        }
    }

    const direct = row[field];
    if (!isEmptyFieldValue(direct)) {
        logDebug(row, field, 'direct', field);
        return direct;
    }

    const fallbackKeys = QA_ARTICULOS_FIELD_FALLBACKS[field] || [];
    for (const key of fallbackKeys) {
        const candidate = row[key];
        if (!isEmptyFieldValue(candidate)) {
            logDebug(row, field, 'fallback', key);
            return candidate;
        }
    }

    logDebug(row, field, 'missing', '');
    return defaultValue;
}
