'use strict';

const EXPORT_FIELD_ALIASES = {
    pn_final: ['pn_final', 'PART NO.', 'pn_excel', 'pn', 'sku'],
    qa_revision_estado: ['qa_revision_estado'],
    qa_revision_accion: ['qa_revision_accion'],
    hierarchie_final: ['hierarchie_final', 'sust_hierarchie', 'SUST_TIPO'],
    ruta_esquemas_pos: ['ruta_esquemas_pos', 'exp_imagenes']
};

function toText(value) {
    return String(value == null ? '' : value).trim();
}

function isEmpty(value) {
    return toText(value) === '';
}

function normalizeToken(value) {
    return toText(value).toLowerCase();
}

function getExportField(record, fieldName, defaultValue = '') {
    const row = record && typeof record === 'object' ? record : {};
    const field = toText(fieldName);
    if (!field) return defaultValue;

    const aliases = EXPORT_FIELD_ALIASES[field] || [field];
    for (const alias of aliases) {
        if (!Object.prototype.hasOwnProperty.call(row, alias)) continue;
        const value = row[alias];
        if (!isEmpty(value)) return value;
    }

    if (Object.prototype.hasOwnProperty.call(row, field) && !isEmpty(row[field])) {
        return row[field];
    }

    return defaultValue;
}

function getExportType(record) {
    const hierarchy = toText(getExportField(record, 'hierarchie_final', ''));
    return hierarchy === 'Superseded' ? 'superseded' : 'new';
}

function isExportable(record) {
    const estado = normalizeToken(getExportField(record, 'qa_revision_estado', ''));
    const accion = normalizeToken(getExportField(record, 'qa_revision_accion', ''));
    return estado === 'ok' && accion === 'importar';
}

module.exports = {
    EXPORT_FIELD_ALIASES,
    getExportField,
    getExportType,
    isExportable
};
