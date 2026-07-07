'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const PYTHON = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'refactor_json_fields.py');
const REGISTRY_PATH = path.join(REPO_ROOT, 'data', 'field_registry.json');
const INPUT_ENGINE = path.join(REPO_ROOT, 'engine_12V4000M40A.json');
const OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'normalized_test');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'engine_12V4000M40A.normalized.json');

function runMigration(extraArgs = []) {
    const args = [
        SCRIPT_PATH,
        '--input',
        INPUT_ENGINE,
        '--registry',
        REGISTRY_PATH,
        '--output-dir',
        OUTPUT_DIR,
        ...extraArgs,
    ];

    return execFileSync(PYTHON, args, {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
    });
}

describe('field registry migration script', () => {
    let originalText;
    let originalRows;

    before(() => {
        originalText = fs.readFileSync(INPUT_ENGINE, 'utf8');
        originalRows = JSON.parse(originalText);
        fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    });

    after(() => {
        fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    });

    it('does not overwrite original engine file and keeps record count', () => {
        runMigration(['--include-legacy']);

        const afterText = fs.readFileSync(INPUT_ENGINE, 'utf8');
        assert.equal(afterText, originalText, 'Original engine JSON was modified');

        assert.ok(fs.existsSync(OUTPUT_FILE), 'Normalized output was not created');
        const normalizedRows = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        assert.equal(normalizedRows.length, originalRows.length, 'Record count changed after migration');
    });

    it('keeps critical final/qa/image fields intact', () => {
        const normalizedRows = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));

        const source = originalRows[0];
        const target = normalizedRows[0];

        assert.equal(target.pn_final, source.pn_final);
        assert.equal(target.qa_revision_estado, source.qa_revision_estado);
        assert.equal(target.qa_revision_accion, source.qa_revision_accion);
        assert.equal(target.ruta_foto, source.ruta_foto);
        assert.equal(target.ruta_esquemas_pos, source.ruta_esquemas_pos);
    });

    it('creates source_page from Source Page', () => {
        const normalizedRows = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
        const source = originalRows[0];
        const target = normalizedRows[0];

        assert.equal(String(target.source_page), String(source['Source Page']));
    });

    it('moves deleted fields with value to _legacy when include-legacy is enabled', () => {
        const normalizedRows = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));

        const withLegacyValue = originalRows.find((row) => row && row.exp_imagenes);
        assert.ok(withLegacyValue, 'Expected at least one row with exp_imagenes');

        const normalized = normalizedRows.find((row) => String(row.id_excel) === String(withLegacyValue.ID));
        assert.ok(normalized, 'Matching normalized row not found');
        assert.ok(normalized._legacy, 'Expected _legacy block to exist');
        assert.equal(normalized._legacy.exp_imagenes, withLegacyValue.exp_imagenes);
    });
});
