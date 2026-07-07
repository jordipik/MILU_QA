'use strict';

const ALIAS_WRITES = {
    pn_final: ['PART NO.', 'pn_excel'],
    designation_final: ['DESIGNATION'],
    measure_final: ['measurement_final'],
    weight_final: ['WEIGHT'],
    exp_imagenes: ['ruta_esquemas_pos'],
    ruta_esquemas_pos: ['exp_imagenes'],
    qa_revision_estado: ['qa_status'],
    qa_revision_accion: ['qa_action'],
    hierarchie_final: ['sust_hierarchie', 'SUST_TIPO'],
    sust_hierarchie: ['hierarchie_final', 'SUST_TIPO'],
    is_subst_final: ['sust_status', 'EN_EXCEL_SUSTITUCION'],
    sust_status: ['is_subst_final', 'EN_EXCEL_SUSTITUCION']
};

const CANONICAL_FIELD = new Map([
    ['measurement_final', 'measure_final'],
    ['PART NO.', 'pn_final'],
    ['pn_excel', 'pn_final'],
    ['sust_hierarchie', 'sust_hierarchie'],
    ['hierarchie_final', 'hierarchie_final'],
    ['exp_imagenes', 'exp_imagenes'],
    ['ruta_esquemas_pos', 'ruta_esquemas_pos']
]);

function normalizeFieldName(fieldName) {
    const raw = String(fieldName == null ? '' : fieldName).trim();
    if (!raw) return '';
    return CANONICAL_FIELD.get(raw) || raw;
}

function setField(record, fieldName, value, options = {}) {
    if (!record || typeof record !== 'object') {
        throw new TypeError('setField expects a record object');
    }

    const mirrorLegacy = options.mirrorLegacy !== false;
    const normalizedField = normalizeFieldName(fieldName);
    if (!normalizedField) {
        throw new TypeError('setField expects a non-empty field name');
    }

    const written = [];
    const assign = (name) => {
        if (!name) return;
        record[name] = value;
        written.push(name);
    };

    assign(normalizedField);

    if (mirrorLegacy) {
        const aliases = ALIAS_WRITES[normalizedField] || [];
        for (const alias of aliases) {
            assign(alias);
        }
    }

    return written;
}

module.exports = {
    ALIAS_WRITES,
    normalizeFieldName,
    setField
};
