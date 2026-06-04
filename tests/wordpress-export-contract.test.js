'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const EXPORTER_PATH = path.join(REPO_ROOT, 'scripts', 'export_wordpress_milu.js');
const REFERENCE_PATH = path.join(REPO_ROOT, 'MILU_New_v506.json');
const CURRENT_NEW_CSV_PATH = path.join(REPO_ROOT, 'data', 'output', 'wordpress', 'milu_wp_new_import.csv');

const CANONICAL_COLUMNS = [
    'Id',
    'fecha_version',
    'POS',
    'designation',
    'engine',
    'model_type',
    'type',
    'pn',
    'nsn',
    'GESA_NORM',
    'GESA_NORMALIZADO',
    'fg_code',
    'fg_description',
    'fg_code_description',
    'weight',
    'weight_txt',
    'measurement',
    'TIPOARTICULO',
    'PAG',
    'BOM_no',
    'esquema_general',
    'exp_motor',
    'exp_categorias',
    'atributo',
    'SUST_TIPO',
    'new_pn_relacionado',
    'old_pn_relacionados',
    'EN_EXCEL_SUSTITUCION',
    'ruta_foto',
    'exp_imagenes'
];

function getReferenceColumns() {
    const raw = fs.readFileSync(REFERENCE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed) && parsed.length > 0, 'MILU_New_v506.json must contain at least one row');
    return Object.keys(parsed[0]);
}

function getExporterColumns() {
    const source = fs.readFileSync(EXPORTER_PATH, 'utf8');
    const match = source.match(/const\s+NEW_V506_HEADERS\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(match, 'Could not find NEW_V506_HEADERS in exporter');

    const body = match[1];
    const columns = [...body.matchAll(/'([^']+)'/g)].map((token) => token[1]);
    return columns;
}

function getCsvHeaderColumns(csvPath) {
    const raw = fs.readFileSync(csvPath, 'utf8');
    const firstLine = raw.split(/\r?\n/)[0].replace(/^\uFEFF/, '');
    return firstLine.split(';');
}

function assertHeaderContract(columns, sourceName) {
    assert.equal(columns.length, CANONICAL_COLUMNS.length, `${sourceName}: unexpected column count`);
    assert.deepEqual(columns, CANONICAL_COLUMNS, `${sourceName}: header/order/case mismatch`);

    const missing = CANONICAL_COLUMNS.filter((column) => !columns.includes(column));
    const extra = columns.filter((column) => !CANONICAL_COLUMNS.includes(column));
    assert.deepEqual(missing, [], `${sourceName}: missing columns -> ${missing.join(', ')}`);
    assert.deepEqual(extra, [], `${sourceName}: extra columns -> ${extra.join(', ')}`);
}

describe('WordPress export canonical header contract', () => {
    it('reference file MILU_New_v506.json matches canonical columns exactly', () => {
        const referenceColumns = getReferenceColumns();
        assertHeaderContract(referenceColumns, 'MILU_New_v506.json');
    });

    it('exporter NEW_V506_HEADERS matches canonical columns exactly', () => {
        const exporterColumns = getExporterColumns();
        assertHeaderContract(exporterColumns, 'scripts/export_wordpress_milu.js::NEW_V506_HEADERS');
    });

    it('current new import CSV header matches canonical columns exactly when file exists', { skip: !fs.existsSync(CURRENT_NEW_CSV_PATH) }, () => {
        const csvColumns = getCsvHeaderColumns(CURRENT_NEW_CSV_PATH);
        assertHeaderContract(csvColumns, 'data/output/wordpress/milu_wp_new_import.csv');
    });
});
