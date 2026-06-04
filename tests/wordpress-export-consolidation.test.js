'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildMergedRow,
    getConsolidationRows,
    hasImportableRow
} = require('../scripts/export_wordpress_milu.js');

function makeImportRow(overrides = {}) {
    return {
        pn: 'PN-001',
        hierarchy_type: 'New',
        qa_revision_estado: 'ok',
        qa_revision_accion: 'importar',
        DESIGNATION: 'Principal designation',
        PAG: '10',
        atributo: 'AT-A',
        engine_model: '12V4000M53',
        Model: '12V4000M53',
        fg_code: 'A-100',
        esquema_general: 'ESQ-A',
        esquemas: 'ESQ-ALT-A',
        exp_motor: 'MOTOR-A',
        filename_foto: 'img_03.jpg',
        ruta_esquemas_pos: 'esq_03.png',
        ...overrides
    };
}

function makeCopyRow(overrides = {}) {
    return {
        pn: 'PN-001',
        hierarchy_type: 'New',
        qa_revision_estado: 'ok',
        qa_revision_accion: 'Copia',
        PAG: '20',
        atributo: 'AT-B',
        engine_model: '16V4000M73',
        Model: '16V4000M73',
        fg_code: 'B-200',
        esquema_general: 'ESQ-B',
        esquemas: 'ESQ-ALT-B',
        exp_motor: 'MOTOR-B',
        filename_foto: 'img_01.jpg',
        ruta_esquemas_pos: 'esq_01.png',
        ...overrides
    };
}

function splitOut(value) {
    return String(value || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
}

describe('WordPress consolidation behavior (canonical V1.04)', () => {
    it('1) PAG consolidates Importar + Copia with stable alphabetical order', () => {
        const rows = [makeImportRow(), makeCopyRow()];
        const out = buildMergedRow([rows[0]], { sku: 'PN-001', hierarchy: 'New', consolidatedRows: getConsolidationRows(rows) });
        assert.equal(out.PAG, '10, 20');
    });

    it('2) atributo consolidates Importar + Copia with stable alphabetical order', () => {
        const rows = [makeImportRow(), makeCopyRow()];
        const out = buildMergedRow([rows[0]], { sku: 'PN-001', hierarchy: 'New', consolidatedRows: getConsolidationRows(rows) });
        assert.equal(out.atributo, 'AT-A, AT-B');
    });

    it('3) engine consolidates unique engines across Importar + Copia', () => {
        const rows = [makeImportRow(), makeCopyRow()];
        const out = buildMergedRow([rows[0]], { sku: 'PN-001', hierarchy: 'New', consolidatedRows: getConsolidationRows(rows) });
        assert.equal(out.engine, '12V4000M53, 16V4000M73');
    });

    it('4) model_type consolidates tokens across Importar + Copia', () => {
        const rows = [makeImportRow(), makeCopyRow()];
        const out = buildMergedRow([rows[0]], { sku: 'PN-001', hierarchy: 'New', consolidatedRows: getConsolidationRows(rows) });
        assert.equal(out.model_type, '12VM53, 16VM73');
    });

    it('5) esquema_general consolidates esquema_general + esquemas across siblings', () => {
        const rows = [makeImportRow(), makeCopyRow()];
        const out = buildMergedRow([rows[0]], { sku: 'PN-001', hierarchy: 'New', consolidatedRows: getConsolidationRows(rows) });
        assert.equal(out.esquema_general, 'ESQ-A, ESQ-ALT-A, ESQ-ALT-B, ESQ-B');
    });

    it('6) exp_motor consolidates values across siblings', () => {
        const rows = [makeImportRow(), makeCopyRow()];
        const out = buildMergedRow([rows[0]], { sku: 'PN-001', hierarchy: 'New', consolidatedRows: getConsolidationRows(rows) });
        assert.equal(out.exp_motor, 'MOTOR-A, MOTOR-B');
    });

    it('7) exp_categorias consolidates model_type-fg_code across siblings', () => {
        const rows = [makeImportRow(), makeCopyRow()];
        const out = buildMergedRow([rows[0]], { sku: 'PN-001', hierarchy: 'New', consolidatedRows: getConsolidationRows(rows) });
        assert.equal(out.exp_categorias, '12VM53-A, 16VM73-B');
    });

    it('8) exp_imagenes consolidates siblings, dedupes, sorts and caps to 10', () => {
        const importRow = makeImportRow({
            filename_foto: 'img_12.jpg',
            ruta_esquemas_pos: 'esq_12.png'
        });
        const copyRow = makeCopyRow({
            filename_foto: 'img_01.jpg',
            ruta_esquemas_pos: 'esq_01.png'
        });

        const extraRows = [
            makeCopyRow({ filename_foto: 'img_02.jpg', ruta_esquemas_pos: '' }),
            makeCopyRow({ filename_foto: 'img_03.jpg', ruta_esquemas_pos: '' }),
            makeCopyRow({ filename_foto: 'img_04.jpg', ruta_esquemas_pos: '' }),
            makeCopyRow({ filename_foto: 'img_05.jpg', ruta_esquemas_pos: '' }),
            makeCopyRow({ filename_foto: 'img_06.jpg', ruta_esquemas_pos: '' }),
            makeCopyRow({ filename_foto: 'img_07.jpg', ruta_esquemas_pos: '' }),
            makeCopyRow({ filename_foto: 'img_08.jpg', ruta_esquemas_pos: '' }),
            makeCopyRow({ filename_foto: 'img_09.jpg', ruta_esquemas_pos: '' }),
            makeCopyRow({ filename_foto: 'img_10.jpg', ruta_esquemas_pos: '' }),
            makeCopyRow({ filename_foto: 'img_11.jpg', ruta_esquemas_pos: '' })
        ];

        const allRows = [importRow, copyRow, ...extraRows];
        const out = buildMergedRow([importRow], { sku: 'PN-001', hierarchy: 'New', consolidatedRows: getConsolidationRows(allRows) });

        const values = splitOut(out.exp_imagenes);
        assert.equal(values.length, 10);
        assert.deepEqual(values, [
            'esq_01.png',
            'esq_12.png',
            'img_01.jpg',
            'img_02.jpg',
            'img_03.jpg',
            'img_04.jpg',
            'img_05.jpg',
            'img_06.jpg',
            'img_07.jpg',
            'img_08.jpg'
        ]);
    });

    it('9) Copia contributes to consolidated fields while principal fields remain from Importar', () => {
        const rows = [
            makeImportRow({ DESIGNATION: 'Only principal designation' }),
            makeCopyRow({ DESIGNATION: 'Copy designation should not replace principal' })
        ];

        const out = buildMergedRow([rows[0]], { sku: 'PN-001', hierarchy: 'New', consolidatedRows: getConsolidationRows(rows) });

        assert.equal(out.designation, 'Only principal designation');
        assert.equal(out.atributo, 'AT-A, AT-B');
    });

    it('10) Copia rows alone never qualify as importable rows', () => {
        const onlyCopy = [makeCopyRow()];
        const mixed = [makeImportRow(), makeCopyRow()];

        assert.equal(hasImportableRow(onlyCopy), false);
        assert.equal(hasImportableRow(mixed), true);
    });
});
