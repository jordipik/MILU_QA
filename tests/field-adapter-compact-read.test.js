'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const ADAPTER_PATH = path.join(REPO_ROOT, 'js', 'fieldAdapter.js');
const QA_TABLE_PATH = pathToFileURL(path.join(REPO_ROOT, 'js', 'qa-table.js')).href;

let getCompactFieldValue;
let getQaPosValue;

describe('compact table fieldAdapter read compatibility', () => {
    before(async () => {
        const adapter = require(ADAPTER_PATH);
        global.window = global.window || {};
        global.window.fieldAdapter = adapter;

        const qaTable = await import(QA_TABLE_PATH);
        getCompactFieldValue = qaTable.getCompactFieldValue;
        getQaPosValue = qaTable.getQaPosValue;
    });

    it('reads target compact fields from a legacy record', () => {
        const legacy = {
            'Source Page': '12',
            POS: '001',
            'PART NO.': '70042500158',
            DESIGNATION: 'BOLT',
            QTY: '2',
            UNITS: 'PCS',
            WEIGHT: '0.12',
            'MEASUREMENT / STANDARD': 'A 55 X 5',
            STANDARD: 'DIN 933',
            filename_foto: '70042500158.jpg',
            exp_imagenes: 'esquema_pos_12.png',
            qa_revision_estado: 'pendiente',
            qa_revision_accion: 'revisar'
        };

        assert.equal(getCompactFieldValue(legacy, 'source_page'), '12');
        assert.equal(getQaPosValue(legacy), '001');
        assert.equal(getCompactFieldValue(legacy, 'pn_final'), '70042500158');
        assert.equal(getCompactFieldValue(legacy, 'designation_final'), 'BOLT');
        assert.equal(getCompactFieldValue(legacy, 'qty_final'), '2');
        assert.equal(getCompactFieldValue(legacy, 'qty_units_final'), 'PCS');
        assert.equal(getCompactFieldValue(legacy, 'weight_final'), '0.12');
        assert.equal(getCompactFieldValue(legacy, 'measure_final'), 'A 55 X 5');
        assert.equal(getCompactFieldValue(legacy, 'norma_final'), 'DIN 933');
        assert.equal(getCompactFieldValue(legacy, 'ruta_foto'), '70042500158.jpg');
        assert.equal(getCompactFieldValue(legacy, 'ruta_esquemas_pos'), 'esquema_pos_12.png');
        assert.equal(getCompactFieldValue(legacy, 'qa_revision_estado'), 'pendiente');
        assert.equal(getCompactFieldValue(legacy, 'qa_revision_accion'), 'revisar');
    });

    it('reads target compact fields from a normalized record', () => {
        const normalized = {
            source_page: '12',
            pos_final: '001',
            pn_final: '70042500158',
            designation_final: 'BOLT',
            qty_final: '2',
            qty_units_final: 'PCS',
            weight_final: '0.12',
            measure_final: 'A 55 X 5',
            norma_final: 'DIN 933',
            ruta_foto: '70042500158.jpg',
            ruta_esquemas_pos: 'esquema_pos_12.png',
            qa_revision_estado: 'ok',
            qa_revision_accion: 'importar'
        };

        assert.equal(getCompactFieldValue(normalized, 'source_page'), '12');
        assert.equal(getQaPosValue(normalized), '001');
        assert.equal(getCompactFieldValue(normalized, 'pn_final'), '70042500158');
        assert.equal(getCompactFieldValue(normalized, 'designation_final'), 'BOLT');
        assert.equal(getCompactFieldValue(normalized, 'qty_final'), '2');
        assert.equal(getCompactFieldValue(normalized, 'qty_units_final'), 'PCS');
        assert.equal(getCompactFieldValue(normalized, 'weight_final'), '0.12');
        assert.equal(getCompactFieldValue(normalized, 'measure_final'), 'A 55 X 5');
        assert.equal(getCompactFieldValue(normalized, 'norma_final'), 'DIN 933');
        assert.equal(getCompactFieldValue(normalized, 'ruta_foto'), '70042500158.jpg');
        assert.equal(getCompactFieldValue(normalized, 'ruta_esquemas_pos'), 'esquema_pos_12.png');
        assert.equal(getCompactFieldValue(normalized, 'qa_revision_estado'), 'ok');
        assert.equal(getCompactFieldValue(normalized, 'qa_revision_accion'), 'importar');
    });
});
