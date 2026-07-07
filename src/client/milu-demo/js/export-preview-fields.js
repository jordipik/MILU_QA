import './fieldAdapter.js';

const EXPORT_PREVIEW_FIELD_FALLBACKS = {
    pn_final: ['PART NO.', 'pn', 'sku'],
    designation_final: ['DESIGNATION', 'designation_pdf', 'designation_gesa', 'designation'],
    model_type_final: ['MODEL/TYPE', 'model_type', 'model'],
    qty_final: ['QTY', 'qty'],
    qty_units_final: ['UNITS', 'units'],
    weight_final: ['WEIGHT', 'weight_txt', 'weight'],
    measure_final: ['measurement_final', 'MEASUREMENT / STANDARD', 'measure_pdf', 'measurement'],
    norma_final: ['norma', 'STANDARD', 'GESA_NORM'],
    pos_final: ['POS', 'pos'],

    source_page: ['Source Page', 'page4', 'PAG', 'source_pages'],
    engine_model: ['engine_model', '__engine_model', 'exp_motor', 'engine', 'motores'],
    engine_serie: ['engine_serie', 'engine_series'],
    engine_model_short: ['engine_model_short', 'model_type'],
    libro_pag: ['libro_pag', 'book_set', 'pages', 'PAG'],
    categoria: ['categoria', 'exp_categorias', 'atributo'],
    fg_fgs_final: ['FG/FGS', 'fgs_code_description', 'fg_code_description'],
    fg_fgs_excel: ['FG/FGS', 'fg_code'],

    ruta_foto: ['filename_foto'],
    ruta_esquemas_pos: ['exp_imagenes'],
    esquemas: ['esquemas'],
    esquemas_circulos: ['esquemas_circulos'],
    esquemas_circulos_all: ['esquemas_circulos_all'],

    qa_revision_estado: ['qa_revision_estado'],
    qa_revision_accion: ['qa_revision_accion'],

    is_subst_final: ['sust_status', 'is_subst_excel', 'EN_EXCEL_SUSTITUCION'],
    hierarchie_final: ['sust_hierarchie', 'SUST_TIPO'],
    new_pn_final: ['sust_new_part_number', 'new_part_number', 'pn_new', 'new_pn_relacionado'],
    subst_pnlist_final: ['sust_superseded_list', 'old_pn_relacionados'],

    is_gesa_final: ['is_gesa_excel', 'isgesa_excel', 'gesa', 'GESA_NORMALIZADO'],
    designation_gesa: ['designation_gesa', 'DESIGNATION'],
    nsn_gesa: ['nsn_gesa', 'nsn'],
    norma_gesa: ['norma_gesa', 'norma', 'GESA_NORM'],
    measure_number_gesa: ['measure_number_gesa', 'dimensions_gesa', 'measurement'],
    weight_number_gesa: ['weight_number_gesa', 'weight_gesa', 'weight'],
    weight_units_gesa: ['weight_units_gesa', 'units', 'UNITS']
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
        return Boolean(globalThis?.window?.EXPORT_PREVIEW_FIELD_DEBUG);
    } catch (_) {
        return false;
    }
}

function logDebug(record, fieldName, source, alias) {
    if (!getDebugEnabled()) return;
    const id = String(record?.ID ?? record?.Id ?? '').trim();
    const payload = { field: fieldName, source, alias: alias || '' };
    if (id) payload.id = id;
    console.debug('[Export Preview fieldAdapter]', payload);
}

export function getExportPreviewFieldValue(record, fieldName, defaultValue = '') {
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

    const fallbackKeys = EXPORT_PREVIEW_FIELD_FALLBACKS[field] || [];
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

export function getExportPreviewType(record) {
    const hierarchy = String(getExportPreviewFieldValue(record, 'hierarchie_final', '') || '').trim();
    return hierarchy === 'Superseded' ? 'superseded' : 'new';
}
