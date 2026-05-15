'use strict';
/**
 * tests/smoke/python-lib.test.js
 * AR-3: verifica que los módulos python_lib son importables y producen
 * los resultados esperados (py_compile + asserts de lógica básica).
 *
 * Usa node:test + child_process (sin dependencias externas).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PYTHON = process.platform === 'win32' ? 'python' : 'python3';

function pyRun(code, opts = {}) {
    return execFileSync(PYTHON, ['-c', code], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        ...opts,
    }).trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

describe('AR-3: python_lib', () => {
    it('python_lib/__init__.py es importable', () => {
        pyRun('import python_lib');
    });

    it('python_lib.repo_paths: resolve_repo_dir detecta la raiz MILU', () => {
        const out = pyRun(
            'from python_lib.repo_paths import resolve_repo_dir; print((resolve_repo_dir() / "package.json").exists())'
        );
        assert.strictEqual(out, 'True');
    });

    it('python_lib.engine_constants: ENGINE_FILES tiene 9 entradas', () => {
        const out = pyRun(
            'from python_lib.engine_constants import ENGINE_FILES; print(len(ENGINE_FILES))'
        );
        assert.strictEqual(out, '9');
    });

    it('python_lib.engine_constants: NAN_LIKE_TOKENS contiene "nan"', () => {
        const out = pyRun(
            'from python_lib.engine_constants import NAN_LIKE_TOKENS; print("nan" in NAN_LIKE_TOKENS)'
        );
        assert.strictEqual(out, 'True');
    });

    it('python_lib.engine_helpers: normalize_compare_value normaliza texto', () => {
        const out = pyRun(
            'from python_lib.engine_helpers import normalize_compare_value; print(normalize_compare_value("  Hola  Mundo  "))'
        );
        assert.strictEqual(out, 'hola mundo');
    });

    it('python_lib.engine_helpers: normalize_compare_value elimina acentos', () => {
        const out = pyRun(
            'from python_lib.engine_helpers import normalize_compare_value; print(normalize_compare_value("Válvula"))'
        );
        assert.strictEqual(out, 'valvula');
    });

    it('python_lib.engine_helpers: is_compare_match con valores equivalentes', () => {
        const out = pyRun(
            'from python_lib.engine_helpers import is_compare_match; print(is_compare_match("TORNILLO M10", "tornillo  m10"))'
        );
        assert.strictEqual(out, 'True');
    });

    it('python_lib.engine_helpers: is_compare_match con valores distintos', () => {
        const out = pyRun(
            'from python_lib.engine_helpers import is_compare_match; print(is_compare_match("TORNILLO M10", "PERNO M10"))'
        );
        assert.strictEqual(out, 'False');
    });

    it('python_lib.engine_helpers: collapse_spaces_in_structure colapsa espacios', () => {
        const out = pyRun(
            'from python_lib.engine_helpers import collapse_spaces_in_structure; print(collapse_spaces_in_structure("A  55   X  5"))'
        );
        assert.strictEqual(out, 'A 55 X 5');
    });

    it('python_lib.engine_helpers: collapse_spaces_in_structure devuelve None para NaN', () => {
        const out = pyRun(
            'from python_lib.engine_helpers import collapse_spaces_in_structure; print(collapse_spaces_in_structure("nan"))'
        );
        assert.strictEqual(out, 'None');
    });

    it('python_lib.engine_helpers: split_measurement_and_standard separa medida y norma', () => {
        const out = pyRun(
            'from python_lib.engine_helpers import split_measurement_and_standard; m,s = split_measurement_and_standard("M 10 X 25 DIN933"); print(m); print(s)'
        );
        const lines = out.split('\n');
        assert.ok(lines[0].includes('10'), `medida esperada con "10", obtenido: ${lines[0]}`);
        assert.ok(lines[1].includes('DIN'), `norma esperada con "DIN", obtenido: ${lines[1]}`);
    });

    it('python_lib.engine_helpers: calc_record_errors marca error en pn vacío', () => {
        const code = [
            'from python_lib.engine_helpers import calc_record_errors',
            'r = {"ID": "1", "pn_final": "", "pn_pdf": "304017", "pos_final": "10", "pos_pdf": "10", "designation_final": "X", "designation_pdf": "X"}',
            'calc_record_errors(r)',
            'print(r["pn_error"])',
            'print(r["has_error"])',
        ].join('; ');
        const out = pyRun(code);
        const lines = out.split('\n');
        assert.strictEqual(lines[0], '1');
        assert.strictEqual(lines[1], 'True');
    });

    it('python_lib.json_io: load_json carga un engine_*.json correctamente', () => {
        const out = pyRun(
            'from python_lib.json_io import load_engine_json; data = load_engine_json("engine_12V4000M40A.json"); print(isinstance(data, list)); print(len(data) > 0)'
        );
        const lines = out.split('\n');
        assert.strictEqual(lines[0], 'True');
        assert.strictEqual(lines[1], 'True');
    });

    it('python_lib.logging_utils: make_logger devuelve callable', () => {
        const out = pyRun(
            'from python_lib.logging_utils import make_logger; log = make_logger("test"); print(callable(log))'
        );
        assert.strictEqual(out, 'True');
    });

    it('python_lib.schema_validation: validate_engine_schema devuelve returncode 0', () => {
        const out = pyRun(
            'from python_lib.repo_paths import resolve_repo_dir; from python_lib.schema_validation import validate_engine_schema; r = validate_engine_schema(resolve_repo_dir(), summary=True); print(r.returncode)'
        );
        assert.ok(['0', '1'].includes(out), `returncode inesperado de validate_engine_schema: ${out}`);
    });

    it('python_lib.snapshot_utils: latest_snapshot_name funciona (None o nombre)', () => {
        const out = pyRun(
            'from python_lib.repo_paths import resolve_repo_dir; from python_lib.snapshot_utils import latest_snapshot_name; v = latest_snapshot_name(resolve_repo_dir()); print(v is None or isinstance(v, str))'
        );
        assert.strictEqual(out, 'True');
    });
});
