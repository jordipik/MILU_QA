'use strict';

const QA_EDITABLE_FIELDS = new Set([
    'qa_revision_estado',
    'qa_revision_accion',
    'qa_revision_updated_at'
]);

const OPERATIONAL_EDITABLE_FIELDS = new Set([
    'designation_final',
    'measure_final',
    'weight_final',
    'pn_final',
    'exp_imagenes',
    'pos_pdf',
    'pn_pdf',
    'designation_pdf',
    'model_type_pdf',
    'qty_pdf',
    'units_pdf',
    'weight_pdf',
    'fn_pdf',
    'measure_pdf',
    'fg_fgs_pdf',
    'gesa_pdf',
    'nsn_pdf',
    'normalizado_pdf',
    'norma_pdf',
    'sust_status_pdf',
    'hierarchi_pdf',
    'sust_new_part_number_pdf',
    'sust_superseded_list_pdf',
    'bom_pdf'
]);

const PROHIBITED_FIELDS = new Set([
    'raw_json',
    'source_json_file',
    'engine_model',
    'id',
    'qa_errors',
    'qa_errors_active'
]);

const FIELD_ALIASES = new Map([
    ['measurement_final', 'measure_final'],
]);

function canonicalFieldName(name) {
    const normalized = String(name == null ? '' : name).trim().toLowerCase();
    if (!normalized) return '';
    return FIELD_ALIASES.get(normalized) || normalized;
}

function isProhibitedField(name) {
    const normalized = canonicalFieldName(name);
    if (!normalized) return true;
    if (PROHIBITED_FIELDS.has(normalized)) return true;
    if (/_error$/i.test(normalized)) return true;
    return false;
}

function isAllowedSaveJsonField(name) {
    const normalized = canonicalFieldName(name);
    return QA_EDITABLE_FIELDS.has(normalized) || OPERATIONAL_EDITABLE_FIELDS.has(normalized);
}

function normalizeEditableFieldValue(name, value) {
    const field = canonicalFieldName(name);
    if (!field) return value;
    return value;
}

module.exports = {
    QA_EDITABLE_FIELDS,
    OPERATIONAL_EDITABLE_FIELDS,
    PROHIBITED_FIELDS,
    FIELD_ALIASES,
    canonicalFieldName,
    isProhibitedField,
    isAllowedSaveJsonField,
    normalizeEditableFieldValue,
};
