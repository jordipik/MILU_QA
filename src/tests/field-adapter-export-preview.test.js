'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..');
const ADAPTER_PATH = path.join(REPO_ROOT, 'js', 'fieldAdapter.js');
const EXPORT_PREVIEW_FIELDS_PATH = pathToFileURL(path.join(REPO_ROOT, 'js', 'export-preview-fields.js')).href;

let getExportPreviewFieldValue;
let getExportPreviewType;

describe('export preview fieldAdapter read compatibility', () => {
    before(async () => {
        const adapter = require(ADAPTER_PATH);
        global.window = global.window || {};
        global.window.fieldAdapter = adapter;

        const exportPreviewFields = await import(EXPORT_PREVIEW_FIELDS_PATH);
        getExportPreviewFieldValue = exportPreviewFields.getExportPreviewFieldValue;
        getExportPreviewType = exportPreviewFields.getExportPreviewType;
    });

    it('reads normalized fields directly', () => {
        const normalized = {
            pn_final: '70042500158',
            source_page: '44',
            ruta_foto: 'fotos/70042500158.webp',
            ruta_esquemas_pos: 'esquemas/12v4000m53/p44_pos08.webp',
            qa_revision_estado: 'ok',
            qa_revision_accion: 'importar',
            hierarchie_final: 'Superseded'
        };

        assert.equal(getExportPreviewFieldValue(normalized, 'pn_final'), '70042500158');
        assert.equal(getExportPreviewFieldValue(normalized, 'source_page'), '44');
        assert.equal(getExportPreviewFieldValue(normalized, 'ruta_foto'), 'fotos/70042500158.webp');
        assert.equal(getExportPreviewFieldValue(normalized, 'ruta_esquemas_pos'), 'esquemas/12v4000m53/p44_pos08.webp');
        assert.equal(getExportPreviewFieldValue(normalized, 'qa_revision_estado'), 'ok');
        assert.equal(getExportPreviewFieldValue(normalized, 'qa_revision_accion'), 'importar');
        assert.equal(getExportPreviewType(normalized), 'superseded');
    });

    it('resolves legacy aliases required by export preview', () => {
        const legacy = {
            'PART NO.': '0049976736',
            'Source Page': '12',
            filename_foto: 'fotos/0049976736.jpg',
            exp_imagenes: 'esquemas_pos/p12_pos01.png',
            qa_revision_estado: 'ok',
            qa_revision_accion: 'importar',
            sust_hierarchie: 'New'
        };

        assert.equal(getExportPreviewFieldValue(legacy, 'pn_final'), '0049976736');
        assert.equal(getExportPreviewFieldValue(legacy, 'source_page'), '12');
        assert.equal(getExportPreviewFieldValue(legacy, 'ruta_foto'), 'fotos/0049976736.jpg');
        assert.equal(getExportPreviewFieldValue(legacy, 'ruta_esquemas_pos'), 'esquemas_pos/p12_pos01.png');
        assert.equal(getExportPreviewFieldValue(legacy, 'qa_revision_estado'), 'ok');
        assert.equal(getExportPreviewFieldValue(legacy, 'qa_revision_accion'), 'importar');
        assert.equal(getExportPreviewType(legacy), 'new');
    });

    it('decides superseded only from hierarchy, not from legacy status', () => {
        const legacyStatusOnly = {
            qa_revision_estado: 'ok',
            qa_revision_accion: 'importar',
            sust_status: 'SI',
            status: 'Superseded'
        };

        assert.equal(getExportPreviewFieldValue(legacyStatusOnly, 'is_subst_final'), 'SI');
        assert.equal(getExportPreviewType(legacyStatusOnly), 'new');
    });

    it('keeps New when sust_status is SI and hierarchy is not Superseded', () => {
        const record = {
            qa_revision_estado: 'ok',
            qa_revision_accion: 'importar',
            sust_status: 'SI',
            sust_hierarchie: 'New'
        };

        assert.equal(getExportPreviewType(record), 'new');
    });
});
