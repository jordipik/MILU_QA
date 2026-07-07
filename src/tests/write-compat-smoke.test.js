'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const { setField } = require(path.join(REPO_ROOT, 'js', 'write-field-helper.js'));

describe('write compatibility smoke (temp fixture only)', () => {
    it('updates normalized fields and keeps critical legacy aliases in a temp json fixture', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'milu-write-smoke-'));
        const tmpFile = path.join(tmpDir, 'engine_fixture.json');

        const fixture = [
            {
                ID: 'T-1',
                pn_final: 'OLD-PN',
                'PART NO.': 'OLD-PN',
                designation_final: 'OLD DES',
                DESIGNATION: 'OLD DES',
                qa_revision_estado: 'pendiente',
                qa_revision_accion: 'revisar',
                hierarchie_final: 'New',
                sust_hierarchie: 'New'
            }
        ];

        fs.writeFileSync(tmpFile, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
        const rows = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
        const row = rows[0];

        setField(row, 'pn_final', 'NEW-PN');
        setField(row, 'designation_final', 'NEW DES');
        setField(row, 'qa_revision_estado', 'ok');
        setField(row, 'qa_revision_accion', 'importar');
        setField(row, 'hierarchie_final', 'Superseded');

        fs.writeFileSync(tmpFile, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
        const outRow = JSON.parse(fs.readFileSync(tmpFile, 'utf8'))[0];

        assert.equal(outRow.pn_final, 'NEW-PN');
        assert.equal(outRow['PART NO.'], 'NEW-PN');
        assert.equal(outRow.designation_final, 'NEW DES');
        assert.equal(outRow.DESIGNATION, 'NEW DES');
        assert.equal(outRow.qa_revision_estado, 'ok');
        assert.equal(outRow.qa_revision_accion, 'importar');
        assert.equal(outRow.hierarchie_final, 'Superseded');
        assert.equal(outRow.sust_hierarchie, 'Superseded');
    });
});
