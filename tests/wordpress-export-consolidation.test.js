'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildMergedRow,
    buildOldPnFields,
    normalizeWordPressAssetUrl,
    normalizeWordPressAssetList,
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
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M53-POS/esq_01.png',
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M53-POS/esq_12.png',
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M53-POS/img_01.jpg',
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M53-POS/img_02.jpg',
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M53-POS/img_03.jpg',
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M53-POS/img_04.jpg',
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M53-POS/img_05.jpg',
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M53-POS/img_06.jpg',
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M53-POS/img_07.jpg',
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M53-POS/img_08.jpg'
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

    it('19) old_number/old_ruta fills first 3 slots and leaves the rest empty', () => {
        const out = buildMergedRow([
            makeImportRow({
                subst_pnlist_final: '200439016200, 635D01023/1, 0009976290'
            })
        ], {
            sku: 'PN-001',
            hierarchy: 'New'
        });

        assert.equal(out.old_number_01, '200439016200');
        assert.equal(out.old_ruta_01, '200439016200');
        assert.equal(out.old_number_02, '635D01023/1');
        assert.equal(out.old_ruta_02, '635D01023/1');
        assert.equal(out.old_number_03, '0009976290');
        assert.equal(out.old_ruta_03, '0009976290');
        assert.equal(out.old_number_04, '');
        assert.equal(out.old_ruta_04, '');
        assert.equal(out.old_number_18, '');
        assert.equal(out.old_ruta_18, '');
    });

    it('20) old_number/old_ruta exports maximum 18 values', () => {
        const many = [];
        for (let i = 1; i <= 20; i += 1) {
            many.push(`PN${String(i).padStart(3, '0')}`);
        }

        const out = buildMergedRow([
            makeImportRow({
                subst_pnlist_final: many.join(', ')
            })
        ], {
            sku: 'PN-001',
            hierarchy: 'New'
        });

        assert.equal(out.old_number_01, 'PN001');
        assert.equal(out.old_number_18, 'PN018');
        assert.equal(out.old_ruta_18, 'PN018');
        assert.equal(out.old_number_19, undefined);
    });

    it('21) old fields deduplicate repeated PN values with stable order', () => {
        const fields = buildOldPnFields({
            old_pn_relacionados: 'A1, A1, A2, A1, A3, A2'
        });

        assert.equal(fields.old_number_01, 'A1');
        assert.equal(fields.old_number_02, 'A2');
        assert.equal(fields.old_number_03, 'A3');
        assert.equal(fields.old_number_04, '');
    });

    it('22) old_ruta is generated from old_number with URL-safe spacing normalization', () => {
        const fields = buildOldPnFields({
            old_pn_relacionados: 'OLD PN 100,   SECOND  PN'
        });

        assert.equal(fields.old_number_01, 'OLD PN 100');
        assert.equal(fields.old_ruta_01, 'OLD-PN-100');
        assert.equal(fields.old_number_02, 'SECOND PN');
        assert.equal(fields.old_ruta_02, 'SECOND-PN');
    });

    it('23) compatibility: old_pn_relacionados remains in merged row', () => {
        const out = buildMergedRow([
            makeImportRow({
                subst_pnlist_final: 'X-1, X-2'
            })
        ], {
            sku: 'PN-001',
            hierarchy: 'New'
        });

        assert.equal(out.old_pn_relacionados, 'X-1, X-2');
        assert.equal(typeof out.old_pn_relacionados, 'string');
    });

    it('24) URL /2026/02 with 12V4000M40A filename becomes /12V4000M40A-POS/', () => {
        const out = normalizeWordPressAssetUrl(
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02/12V4000M40A-0208-01-70.webp',
            {}
        );
        assert.equal(out.warning, null);
        assert.equal(
            out.value,
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M40A-POS/12V4000M40A-0208-01-70.webp'
        );
    });

    it('25) URL /2026/01 with 20V4000M93L filename becomes /20V4000M93L-POS/', () => {
        const out = normalizeWordPressAssetUrl(
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/20V4000M93L-1374-01-400.webp',
            {}
        );
        assert.equal(out.warning, null);
        assert.equal(
            out.value,
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/20V4000M93L-POS/20V4000M93L-1374-01-400.webp'
        );
    });

    it('26) URL already normalized /<MODEL>-POS/ is unchanged', () => {
        const url = 'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M53-POS/12V4000M53-0110-01.webp';
        const out = normalizeWordPressAssetUrl(url, {});
        assert.equal(out.warning, null);
        assert.equal(out.value, url);
    });

    it('27) exp_imagenes list normalizes each item and keeps stable order', () => {
        const out = normalizeWordPressAssetList(
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02/12V4000M40A-0208-01-70.webp, https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/20V4000M93L-1374-01-400.webp',
            {}
        );
        assert.deepEqual(out.warnings, []);
        assert.equal(
            out.value,
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M40A-POS/12V4000M40A-0208-01-70.webp, https://milu-naval.mystagingwebsite.com/wp-content/uploads/20V4000M93L-POS/20V4000M93L-1374-01-400.webp'
        );
    });

    it('28) sin_imagen.jpeg is never transformed', () => {
        const url = 'https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg';
        const out = normalizeWordPressAssetUrl(url, { engine_model: '12V4000M40A' });
        assert.equal(out.warning, null);
        assert.equal(out.value, url);
    });

    it('29) bare filename with model is converted using context when needed', () => {
        const out = normalizeWordPressAssetUrl('12V4000M53-0110-01.webp', { engine_model: '12V4000M53' });
        assert.equal(out.warning, null);
        assert.equal(
            out.value,
            'https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M53-POS/12V4000M53-0110-01.webp'
        );
    });

    it('30) bare filename without model emits URL_MODEL_NOT_FOUND warning and keeps original', () => {
        const out = normalizeWordPressAssetUrl('asset-sin-modelo.webp', {});
        assert.equal(out.value, 'asset-sin-modelo.webp');
        assert.equal(out.warning?.code, 'URL_MODEL_NOT_FOUND');
    });
});
