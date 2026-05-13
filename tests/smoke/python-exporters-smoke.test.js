'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

function runPython(args, options = {}) {
    return execFileSync(PYTHON, args, {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        ...options,
    });
}

describe('AR-3: python exporters smoke', () => {
    it('convert_engine_to_excel.py exporta JSON temporal a XLSX', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'milu-exporter-engine-'));
        const enginePath = path.join(tempDir, 'engine_tmp.json');

        const sampleRows = [
            { ID: '1', 'PART NO.': '304017', DESIGNATION: 'VALVE', QTY: '1' },
            { ID: '2', 'PART NO.': '304018', DESIGNATION: 'BOLT', QTY: '2' },
        ];
        fs.writeFileSync(enginePath, JSON.stringify(sampleRows, null, 2), 'utf-8');

        runPython(['convert_engine_to_excel.py', enginePath]);

        const outXlsx = enginePath.replace(/\.json$/i, '.xlsx');
        assert.ok(fs.existsSync(outXlsx), `No se genero XLSX esperado: ${outXlsx}`);
    });

    it('convert_excel_to_json.py convierte Excel temporal a JSON', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'milu-exporter-excel-'));
        const excelPath = path.join(tempDir, 'input.xlsx');
        const jsonPath = path.join(tempDir, 'output.json');

        const createExcelCode = [
            'import pandas as pd',
            `df = pd.DataFrame([{"sku": "A1", "qty": 1}, {"sku": "B2", "qty": 2}])`,
            `df.to_excel(r"${excelPath.replace(/\\/g, '\\\\')}", index=False)`,
        ].join('; ');
        runPython(['-c', createExcelCode]);

        runPython(['convert_excel_to_json.py', '--excel', excelPath, '--json', jsonPath]);

        assert.ok(fs.existsSync(jsonPath), `No se genero JSON esperado: ${jsonPath}`);
        const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        assert.strictEqual(Array.isArray(payload), true);
        assert.strictEqual(payload.length, 2);
        assert.strictEqual(payload[0].sku, 'A1');
    });
});
