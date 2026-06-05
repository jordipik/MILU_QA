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
        libro_pag: '12V4000M53-0010',
        atributo: 'AT-A',
        engine_model: '12V4000M53',
        Model: '12V4000M53',
        fg_code: 'A-100',
        fg_fgs_final: 'A-100-FINAL',
        fgs_description: 'FG Desc A',
        fgs_code_description: 'FG Code Desc A',
        norma_final: 'NORMA-A',
        normalizado_final: 'NORMAL-A',
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
        libro_pag: '16V4000M73-0020',
        atributo: 'AT-B',
        engine_model: '16V4000M73',
        Model: '16V4000M73',
        fg_code: 'B-200',
        fg_fgs_final: 'B-200-FINAL',
        fgs_description: 'FG Desc B',
        fgs_code_description: 'FG Code Desc B',
        norma_final: 'NORMA-B',
        normalizado_final: 'NORMAL-B',
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
        assert.equal(out.PAG, '12V4000M53-0010, 16V4000M73-0020');
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

    it('11) fecha_version is generated with timestamp format when missing', () => {
        const out = buildMergedRow([makeImportRow({ fecha_version: '' })], { sku: 'PN-001', hierarchy: 'New' });
        assert.match(out.fecha_version, /^\d{8}\.\d{4}$/);
    });

    it('12) GESA_NORM takes norma_final', () => {
        const out = buildMergedRow([makeImportRow({ norma_final: 'DIN-123', GESA_NORM: 'OLD-NORM' })], { sku: 'PN-001', hierarchy: 'New' });
        assert.equal(out.GESA_NORM, 'DIN-123');
    });

    it('13) GESA_NORMALIZADO takes normalizado_final', () => {
        const out = buildMergedRow([makeImportRow({ normalizado_final: 'YES', GESA_NORMALIZADO: 'OLD-NORMAL' })], { sku: 'PN-001', hierarchy: 'New' });
        assert.equal(out.GESA_NORMALIZADO, 'YES');
    });

    it('14) fg_code takes fg_fgs_final', () => {
        const out = buildMergedRow([makeImportRow({ fg_fgs_final: '507-97', fg_code: 'WRONG' })], { sku: 'PN-001', hierarchy: 'New' });
        assert.equal(out.fg_code, '507-97');
    });

    it('15) fg_description takes fgs_description', () => {
        const out = buildMergedRow([makeImportRow({ fgs_description: 'EXPECTED FG DESCRIPTION' })], { sku: 'PN-001', hierarchy: 'New' });
        assert.equal(out.fg_description, 'EXPECTED FG DESCRIPTION');
    });

    it('16) fg_code_description takes fgs_code_description', () => {
        const out = buildMergedRow([makeImportRow({ fgs_code_description: '507 EXPECTED FULL DESC' })], { sku: 'PN-001', hierarchy: 'New' });
        assert.equal(out.fg_code_description, '507 EXPECTED FULL DESC');
    });

    it('17) TIPOARTICULO is always piezas', () => {
        const out = buildMergedRow([makeImportRow({ TIPOARTICULO: 'otro' })], { sku: 'PN-001', hierarchy: 'New' });
        assert.equal(out.TIPOARTICULO, 'piezas');
    });

    it('18) PAG uses libro_pag values with engine-page 4-digit padding', () => {
        const rows = [
            makeImportRow({ libro_pag: '12V4000M40A-0208' }),
            makeCopyRow({ libro_pag: '20V4000M93L-1400' }),
            makeCopyRow({ libro_pag: '20V4000M93L-1780', engine_model: '20V4000M93L', Model: '20V4000M93L' })
        ];
        const out = buildMergedRow([rows[0]], { sku: 'PN-001', hierarchy: 'New', consolidatedRows: getConsolidationRows(rows) });
        assert.equal(out.PAG, '12V4000M40A-0208, 20V4000M93L-1400, 20V4000M93L-1780');
    });
});
