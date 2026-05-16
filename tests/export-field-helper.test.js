'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const {
    getExportField,
    getExportType,
    isExportable
} = require(path.join(REPO_ROOT, 'js', 'export-field-helper.js'));

describe('export field helper', () => {
    it('reads normalized and legacy aliases for pn_final', () => {
        const normalized = { pn_final: '70042500158' };
        const legacy = { 'PART NO.': '0049976736' };

        assert.equal(getExportField(normalized, 'pn_final'), '70042500158');
        assert.equal(getExportField(legacy, 'pn_final'), '0049976736');
    });

    it('prefers ruta_esquemas_pos over exp_imagenes', () => {
        const record = {
            ruta_esquemas_pos: 'esquemas/12v4000m53/p44_pos08.webp',
            exp_imagenes: 'legacy/pos08.png'
        };

        assert.equal(
            getExportField(record, 'ruta_esquemas_pos'),
            'esquemas/12v4000m53/p44_pos08.webp'
        );
    });

    it('classifies superseded only from hierarchy fields', () => {
        const normalized = { hierarchie_final: 'Superseded', status: 'New' };
        const legacy = { sust_hierarchie: 'Superseded', status: 'New' };
        const statusOnly = { status: 'Superseded' };

        assert.equal(getExportType(normalized), 'superseded');
        assert.equal(getExportType(legacy), 'superseded');
        assert.equal(getExportType(statusOnly), 'new');
    });

    it('isExportable is driven only by qa_revision_estado and qa_revision_accion', () => {
        assert.equal(isExportable({ qa_revision_estado: 'ok', qa_revision_accion: 'importar' }), true);
        assert.equal(isExportable({ qa_revision_estado: 'ok', qa_revision_accion: 'revisar' }), false);
        assert.equal(isExportable({ qa_revision_estado: 'pendiente', qa_revision_accion: 'importar' }), false);
        assert.equal(
            isExportable({ qa_revision_estado: 'ok', qa_revision_accion: 'importar', status: 'discarded' }),
            true
        );
    });
});
