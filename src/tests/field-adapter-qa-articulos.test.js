'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const ADAPTER_PATH = path.join(REPO_ROOT, 'js', 'fieldAdapter.js');
const QA_ARTICULOS_FIELDS_PATH = pathToFileURL(path.join(REPO_ROOT, 'js', 'qa-articulos-fields.js')).href;

let getQaArticulosFieldValue;

describe('qa articulos fieldAdapter read compatibility', () => {
    before(async () => {
        const adapter = require(ADAPTER_PATH);
        global.window = global.window || {};
        global.window.fieldAdapter = adapter;

        const qaArticulosFields = await import(QA_ARTICULOS_FIELDS_PATH);
        getQaArticulosFieldValue = qaArticulosFields.getQaArticulosFieldValue;
    });

    it('reads normalized fields directly', () => {
        const normalized = {
            source_page: '44',
            pn_final: '70042500158',
            qa_revision_estado: 'ok',
            qa_revision_accion: 'mantener',
            ruta_esquemas_pos: 'esquemas/12v4000m53/p44_pos08.webp',
            measure_error: 'ERR_MEASURE_MISMATCH',
            measure_pdf: 'A 55 X 5',
            measure_final: 'A 55 X 5',
            designation_final: 'BOLT',
            hierarchie_final: 'SUPERSEDED',
            new_pn_final: '70042500160'
        };

        assert.equal(getQaArticulosFieldValue(normalized, 'source_page'), '44');
        assert.equal(getQaArticulosFieldValue(normalized, 'pn_final'), '70042500158');
        assert.equal(getQaArticulosFieldValue(normalized, 'qa_revision_estado'), 'ok');
        assert.equal(getQaArticulosFieldValue(normalized, 'qa_revision_accion'), 'mantener');
        assert.equal(getQaArticulosFieldValue(normalized, 'ruta_esquemas_pos'), 'esquemas/12v4000m53/p44_pos08.webp');
        assert.equal(getQaArticulosFieldValue(normalized, 'measure_error'), 'ERR_MEASURE_MISMATCH');
        assert.equal(getQaArticulosFieldValue(normalized, 'measure_pdf'), 'A 55 X 5');
        assert.equal(getQaArticulosFieldValue(normalized, 'measure_final'), 'A 55 X 5');
        assert.equal(getQaArticulosFieldValue(normalized, 'hierarchie_final'), 'SUPERSEDED');
        assert.equal(getQaArticulosFieldValue(normalized, 'new_pn_final'), '70042500160');
    });

    it('resolves legacy aliases for analysis read fields', () => {
        const legacy = {
            'Source Page': '12',
            'PART NO.': '0049976736',
            sust_hierarchie: 'NEW',
            sust_new_part_number: '0049976736N',
            exp_imagenes: 'esquemas_pos/p12_pos01.png',
            measure_error: 'ERR_MEASURE_UNIT',
            measure_pdf: 'M 10 x 1.5',
            'MEASUREMENT / STANDARD': 'M 10 x 1.5',
            DESIGNATION: 'NUT',
            qa_revision_estado: 'pendiente',
            qa_revision_accion: 'revisar'
        };

        assert.equal(getQaArticulosFieldValue(legacy, 'source_page'), '12');
        assert.equal(getQaArticulosFieldValue(legacy, 'pn_final'), '0049976736');
        assert.equal(getQaArticulosFieldValue(legacy, 'hierarchie_final'), 'NEW');
        assert.equal(getQaArticulosFieldValue(legacy, 'new_pn_final'), '0049976736N');
        assert.equal(getQaArticulosFieldValue(legacy, 'ruta_esquemas_pos'), 'esquemas_pos/p12_pos01.png');
        assert.equal(getQaArticulosFieldValue(legacy, 'measure_error'), 'ERR_MEASURE_UNIT');
        assert.equal(getQaArticulosFieldValue(legacy, 'measure_pdf'), 'M 10 x 1.5');
        assert.equal(getQaArticulosFieldValue(legacy, 'measure_final'), 'M 10 x 1.5');
        assert.equal(getQaArticulosFieldValue(legacy, 'designation_final'), 'NUT');
        assert.equal(getQaArticulosFieldValue(legacy, 'qa_revision_estado'), 'pendiente');
        assert.equal(getQaArticulosFieldValue(legacy, 'qa_revision_accion'), 'revisar');
    });

    it('keeps qa revision fields independent from fallback chains', () => {
        const mixed = {
            'PART NO.': '1000000001',
            qa_revision_estado: 'ok',
            qa_revision_accion: 'eliminar'
        };

        assert.equal(getQaArticulosFieldValue(mixed, 'pn_final'), '1000000001');
        assert.equal(getQaArticulosFieldValue(mixed, 'qa_revision_estado'), 'ok');
        assert.equal(getQaArticulosFieldValue(mixed, 'qa_revision_accion'), 'eliminar');
    });
});
