'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const { setField } = require(path.join(REPO_ROOT, 'js', 'write-field-helper.js'));

describe('write field helper', () => {
    it('writes pn_final and legacy aliases', () => {
        const row = {};
        const written = setField(row, 'pn_final', '70042500158');

        assert.ok(written.includes('pn_final'));
        assert.ok(written.includes('PART NO.'));
        assert.ok(written.includes('pn_excel'));
        assert.equal(row.pn_final, '70042500158');
        assert.equal(row['PART NO.'], '70042500158');
        assert.equal(row.pn_excel, '70042500158');
    });

    it('keeps measure_final and measurement_final aligned', () => {
        const row = {};
        setField(row, 'measure_final', 'A 55 X 5');

        assert.equal(row.measure_final, 'A 55 X 5');
        assert.equal(row.measurement_final, 'A 55 X 5');
    });

    it('mirrors schema image route aliases', () => {
        const row = {};
        setField(row, 'exp_imagenes', 'esquemas/12v4000m53/p44_pos08.webp');

        assert.equal(row.exp_imagenes, 'esquemas/12v4000m53/p44_pos08.webp');
        assert.equal(row.ruta_esquemas_pos, 'esquemas/12v4000m53/p44_pos08.webp');
    });
});
