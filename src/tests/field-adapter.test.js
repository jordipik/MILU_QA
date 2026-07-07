'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'data', 'field_registry.json');
const ADAPTER_PATH = path.join(REPO_ROOT, 'js', 'fieldAdapter.js');

let adapter;

describe('field adapter compatibility', () => {
    before(() => {
        adapter = require(ADAPTER_PATH);
        const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
        adapter.configureFieldRegistry(registry);
    });

    it('getField reads new fields directly', () => {
        const record = { pn_final: '70042500158' };
        assert.equal(adapter.getField(record, 'pn_final'), '70042500158');
    });

    it('getField reads legacy fields if new does not exist', () => {
        const record = { 'PART NO.': '0049976736' };
        assert.equal(adapter.getField(record, 'pn_final'), '0049976736');
    });

    it('source_page resolves Source Page legacy name', () => {
        const record = { 'Source Page': '13' };
        assert.equal(adapter.getField(record, 'source_page'), '13');
    });

    it('measure_error resolves measurement_error', () => {
        const record = { measurement_error: 2 };
        assert.equal(adapter.getField(record, 'measure_error'), 2);
    });

    it('is_gesa_* resolves legacy variants', () => {
        const record = { isgesa_excel: 'YES' };
        assert.equal(adapter.getField(record, 'is_gesa_excel'), 'YES');

        const record2 = { gesa: 'NO' };
        assert.equal(adapter.getField(record2, 'is_gesa_excel'), 'NO');
    });

    it('setField writes preferred new field name', () => {
        const record = { 'PART NO.': '123' };
        const written = adapter.setField(record, 'PART NO.', 'ABC');

        assert.equal(written, 'pn_excel');
        assert.equal(record.pn_excel, 'ABC');
    });
});
