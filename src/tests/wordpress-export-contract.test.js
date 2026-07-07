'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXPORTER_PATH = path.join(REPO_ROOT, 'scripts', 'export_wordpress_milu.js');
const FIXTURE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'wordpress_export_columns_v104.json');
const CURRENT_NEW_CSV_PATH = path.join(REPO_ROOT, 'data', 'output', 'wordpress', 'milu_wp_new_import.csv');
const ASSERT_GENERATED_CSV_HEADER = process.env.MILU_ASSERT_GENERATED_CSV_HEADER === '1';

function getCanonicalColumns() {
    const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed) && parsed.length > 0, 'tests/fixtures/wordpress_export_columns_v104.json must contain at least one column');
    return parsed;
}

function getExporterColumns() {
    const exporter = require(EXPORTER_PATH);
    const columns = exporter?.NEW_V506_HEADERS;
    assert.ok(Array.isArray(columns), 'scripts/export_wordpress_milu.js must export NEW_V506_HEADERS array');
    return columns;
}

function getCsvHeaderColumns(csvPath) {
    const raw = fs.readFileSync(csvPath, 'utf8');
    const firstLine = raw.split(/\r?\n/)[0].replace(/^\uFEFF/, '');
    return firstLine.split(';');
}

function assertHeaderContract(columns, canonicalColumns, sourceName) {
    assert.equal(columns.length, 66, `${sourceName}: expected 66 columns`);
    assert.equal(columns.length, canonicalColumns.length, `${sourceName}: unexpected column count`);
    assert.deepEqual(columns, canonicalColumns, `${sourceName}: header/order/case mismatch`);

    const missing = canonicalColumns.filter((column) => !columns.includes(column));
    const extra = columns.filter((column) => !canonicalColumns.includes(column));
    assert.deepEqual(missing, [], `${sourceName}: missing columns -> ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `${sourceName}: extra columns -> ${extra.join(', ')}`);
}

describe('WordPress export canonical header contract', () => {
    it('fixture v1.04 defines 66 canonical columns in exact order', () => {
        const canonicalColumns = getCanonicalColumns();
        assert.equal(canonicalColumns.length, 66, 'canonical fixture must define 66 columns');
    });

    it('exporter NEW_V506_HEADERS matches canonical columns exactly', () => {
        const canonicalColumns = getCanonicalColumns();
        const exporterColumns = getExporterColumns();
        assertHeaderContract(exporterColumns, canonicalColumns, 'scripts/export_wordpress_milu.js::NEW_V506_HEADERS');
    });

    it('current new import CSV header matches canonical columns exactly when explicitly enabled', { skip: !ASSERT_GENERATED_CSV_HEADER || !fs.existsSync(CURRENT_NEW_CSV_PATH) }, () => {
        const canonicalColumns = getCanonicalColumns();
        const csvColumns = getCsvHeaderColumns(CURRENT_NEW_CSV_PATH);
        assertHeaderContract(csvColumns, canonicalColumns, 'data/output/wordpress/milu_wp_new_import.csv');
    });
});
