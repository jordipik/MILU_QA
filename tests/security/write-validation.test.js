'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { validateSaveJsonPayload, normalizeRevisionAccion } = require('../../server/validation/qa-validation');

const BASE_URL = (process.env.MILU_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.MILU_SECURITY_TIMEOUT_MS || 10000);

let serverProcess = null;

function waitForServerReady() {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(async () => {
            if (Date.now() - startedAt > TIMEOUT_MS) {
                clearInterval(timer);
                reject(new Error('Timeout esperando /health'));
                return;
            }
            try {
                const res = await fetch(`${BASE_URL}/health`);
                if (res.ok) {
                    clearInterval(timer);
                    resolve();
                }
            } catch {
                // keep waiting
            }
        }, 250);
    });
}

async function requestJson(pathname, body) {
    const res = await fetch(`${BASE_URL}${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
        json = JSON.parse(text);
    } catch {
        json = null;
    }
    return { status: res.status, json, text };
}

async function requestGetJson(pathname) {
    const res = await fetch(`${BASE_URL}${pathname}`);
    const text = await res.text();
    let json = null;
    try {
        json = JSON.parse(text);
    } catch {
        json = null;
    }
    return { status: res.status, json, text };
}

function restoreEngineRowFields(file, id, fields) {
    const filePath = path.join(process.cwd(), file);
    const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const row = rows.find((item) => String(item?.ID || '').trim() === String(id).trim());
    if (!row) {
        throw new Error(`No se pudo restaurar el registro ${id} en ${file}`);
    }

    for (const [field, value] of Object.entries(fields)) {
        row[field] = value;
    }

    fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
    fs.rmSync(`${filePath}.tmp`, { force: true });
}

function readEngineRowFields(file, id) {
    const filePath = path.join(process.cwd(), file);
    const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const row = rows.find((item) => String(item?.ID || '').trim() === String(id).trim());
    if (!row) {
        throw new Error(`No se pudo leer el registro ${id} en ${file}`);
    }
    return {
        qa_revision_estado: row.qa_revision_estado,
        qa_revision_accion: row.qa_revision_accion,
        qa_revision_updated_at: row.qa_revision_updated_at,
    };
}

before(async () => {
    if (process.env.MILU_BASE_URL) {
        return;
    }
    try {
        const probe = await fetch(`${BASE_URL}/health`);
        if (probe.ok) {
            return;
        }
    } catch {
        // start local server below
    }
    const serverPath = path.join(process.cwd(), 'server.js');
    serverProcess = spawn(process.execPath, [serverPath], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    await waitForServerReady();
});

after(async () => {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
    }
});

describe('MILU write validation', () => {
    test('field no permitido -> 400', async () => {
        const res = await requestJson('/save-json', {
            file: 'engine_12V4000M40A.json',
            id: '1',
            field: 'not_allowed',
            value: 'x'
        });
        assert.equal(res.status, 400);
        assert.equal(res.json?.error, 'VALIDATION_ERROR');
        assert.equal(res.json?.code, 'FIELD_NOT_ALLOWED');
    });

    test('fn_final permitido -> 200', async () => {
        const res = await requestJson('/save-json', {
            file: 'engine_12V4000M40A.json',
            id: '1',
            field: 'fn_final',
            value: 'FN-TEST'
        });
        assert.ok([200, 404].includes(res.status), `status inesperado: ${res.status}`);
    });

    test('model_type_final permitido -> 200', async () => {
        const res = await requestJson('/save-json', {
            file: 'engine_12V4000M40A.json',
            id: '1',
            field: 'model_type_final',
            value: 'MODEL-TYPE-TEST'
        });
        assert.ok([200, 404].includes(res.status), `status inesperado: ${res.status}`);
    });

    test('qa_revision_estado invalido -> 400', async () => {
        const res = await requestJson('/save-json', {
            file: 'engine_12V4000M40A.json',
            id: '1',
            field: 'qa_revision_estado',
            value: 'invalid'
        });
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'INVALID_QA_REVISION_ESTADO');
    });

    test('qa_revision_accion invalido -> 400', async () => {
        const res = await requestJson('/save-json', {
            file: 'engine_12V4000M40A.json',
            id: '1',
            field: 'qa_revision_accion',
            value: 'wrong'
        });
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'INVALID_QA_REVISION_ACCION');
    });

    test('field raw_json -> bloqueado', async () => {
        const res = await requestJson('/save-json', {
            file: 'engine_12V4000M40A.json',
            id: '1',
            field: 'raw_json',
            value: '{}'
        });
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'FIELD_NOT_ALLOWED');
    });

    test('payload vacio -> 400', async () => {
        const res = await requestJson('/save-json', {});
        assert.equal(res.status, 400);
        assert.equal(res.json?.error, 'VALIDATION_ERROR');
    });

    test('id inexistente -> 404 o 400 consistente', async () => {
        const res = await requestJson('/save-json', {
            file: 'engine_12V4000M40A.json',
            id: '999999999999',
            field: 'designation_final',
            value: 'TEST'
        });
        assert.ok([400, 404].includes(res.status), `status inesperado: ${res.status}`);
    });

    test('file invalido -> 400', async () => {
        const res = await requestJson('/save-json', {
            file: 'nope.json',
            id: '1',
            field: 'designation_final',
            value: 'TEST'
        });
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'FILE_NOT_ALLOWED');
    });

    test('descartar -> aceptado y normalizado', async () => {
        assert.equal(normalizeRevisionAccion('descartar'), 'eliminar');
    });

    test('payload correcto -> sigue funcionando', async () => {
        const normalized = validateSaveJsonPayload({
            file: 'engine_12V4000M40A.json',
            id: '1',
            field: 'designation_final',
            value: 'VALIDATION_TEST'
        });
        assert.equal(normalized.file, 'engine_12V4000M40A.json');
        assert.equal(normalized.field, 'designation_final');
        assert.equal(normalized.value, 'VALIDATION_TEST');
    });

    test('/save-json roundtrip HTTP: guarda y restaura designation_final', async () => {
        const file = 'engine_12V4000M40A.json';
        const filePath = path.join(process.cwd(), file);
        const arr = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const row = arr[0];
        const id = String(row.ID);
        const originalValue = row.designation_final ?? '';
        const probe = `__VALIDATION_PROBE__${Date.now()}`;
        try {
            const ok = await requestJson('/save-json', { file, id, field: 'designation_final', value: probe });
            assert.equal(ok.status, 200);
            assert.equal(ok.json?.ok, true);
            const afterWrite = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            assert.equal(afterWrite[0].designation_final, probe);
        } finally {
            await requestJson('/save-json', { file, id, field: 'designation_final', value: originalValue });
        }
    });

    test('/save-json field=col alias sigue aceptandose', async () => {
        const res = await fetch(`${BASE_URL}/save-json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: 'engine_12V4000M40A.json', id: '999999999999', col: 'designation_final', value: 'x' })
        });
        // Debe validar col como alias y devolver 404 (id inexistente), no 400 FIELD_REQUIRED
        assert.ok([200, 404].includes(res.status), `status inesperado: ${res.status}`);
    });

    test('/save-json siempre responde JSON (nunca HTML)', async () => {
        const res = await fetch(`${BASE_URL}/save-json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: 'no.json', id: '1', field: 'designation_final', value: 'x' })
        });
        const contentType = res.headers.get('content-type') || '';
        assert.ok(contentType.includes('application/json'), `content-type inesperado: ${contentType}`);
    });

    test('/apply-revision-to-engines payload vacio -> 400 VALIDATION_ERROR', async () => {
        const res = await requestJson('/apply-revision-to-engines', {});
        assert.equal(res.status, 400);
        assert.equal(res.json?.error, 'VALIDATION_ERROR');
        assert.equal(res.json?.code, 'EMPTY_PAYLOAD');
    });

    test('/apply-revision-to-engines payload no-objeto -> 400', async () => {
        const res = await fetch(`${BASE_URL}/apply-revision-to-engines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([1, 2, 3])
        });
        const json = await res.json().catch(() => null);
        assert.equal(res.status, 400);
        assert.equal(json?.error, 'VALIDATION_ERROR');
    });

    test('/apply-revision-to-engines revisiones vacias -> 200 ok no-op', async () => {
        const res = await requestJson('/apply-revision-to-engines', { revisions: {} });
        assert.equal(res.status, 200);
        assert.equal(res.json?.ok, true);
        assert.ok(res.json?.result && typeof res.json.result === 'object');
        assert.ok(res.json.result.appliedByFile && typeof res.json.result.appliedByFile === 'object');
        // No debe haber escrito cambios reales
        for (const stats of Object.values(res.json.result.appliedByFile)) {
            assert.equal(stats?.changed ?? 0, 0);
        }
    });

    test('/apply-revision-to-engines payload demasiado grande -> 400 PAYLOAD_TOO_LARGE', async () => {
        // Generamos un objeto que supere los 32768 bytes permitidos
        const huge = {};
        for (let i = 0; i < 2000; i++) {
            huge[`idx=${i}`] = { estado: 'ok', accion: 'importar', updated_at: '2026-05-13T00:00:00Z' };
        }
        const res = await requestJson('/apply-revision-to-engines', huge);
        assert.equal(res.status, 400);
        assert.equal(res.json?.code, 'PAYLOAD_TOO_LARGE');
    });

    test('/pn-review/by-id/:id/apply-decision roundtrip HTTP: aplica y restaura una decision', async () => {
        const decisionByPair = new Map([
            ['ok|importar', 'validar'],
            ['ok|eliminar', 'descartar'],
            ['pendiente|revisar', 'revisar'],
        ]);

        const listRes = await requestGetJson('/pn-review/list?limit=10');
        assert.equal(listRes.status, 200);
        assert.equal(listRes.json?.ok, true);
        assert.ok(Array.isArray(listRes.json?.rows), 'rows debe ser array en /pn-review/list');

        let candidate = null;
        for (const item of listRes.json.rows) {
            const sku = String(item?.sku || '').trim();
            if (!sku) continue;

            const sourcesRes = await requestGetJson(`/pn-review/${encodeURIComponent(sku)}/sources`);
            if (sourcesRes.status !== 200 || sourcesRes.json?.ok !== true || !Array.isArray(sourcesRes.json?.rows)) {
                continue;
            }

            const row = sourcesRes.json.rows.find((sourceRow) => {
                const estado = String(sourceRow?.qa_revision_estado || '').trim().toLowerCase();
                const accion = String(sourceRow?.qa_revision_accion || '').trim().toLowerCase();
                const pair = `${estado}|${accion}`;
                return decisionByPair.has(pair)
                    && String(sourceRow?.ID || '').trim()
                    && String(sourceRow?.source_file || '').trim();
            });

            if (row) {
                const estado = String(row.qa_revision_estado || '').trim().toLowerCase();
                const accion = String(row.qa_revision_accion || '').trim().toLowerCase();
                const originalFields = readEngineRowFields(String(row.source_file).trim(), String(row.ID).trim());
                candidate = {
                    id: String(row.ID).trim(),
                    source_file: String(row.source_file).trim(),
                    source_page: String(row['Source Page'] || '').trim(),
                    pos: String(row.POS || '').trim(),
                    part_no: String(row['PART NO.'] || '').trim(),
                    originalAction: decisionByPair.get(`${estado}|${accion}`),
                    originalEstado: originalFields.qa_revision_estado,
                    originalAccion: originalFields.qa_revision_accion,
                    originalUpdatedAt: originalFields.qa_revision_updated_at,
                };
                break;
            }
        }

        assert.ok(candidate, 'No se encontro candidato reversible para probar /pn-review/by-id/:id/apply-decision');

        const nextAction = candidate.originalAction === 'revisar' ? 'validar' : 'revisar';
        const payload = {
            action: nextAction,
            source_file: candidate.source_file,
            source_page: candidate.source_page,
            pos: candidate.pos,
            part_no: candidate.part_no,
        };

        try {
            const applyRes = await requestJson(`/pn-review/by-id/${encodeURIComponent(candidate.id)}/apply-decision`, payload);
            assert.equal(applyRes.status, 200, `status inesperado: ${applyRes.status} body=${applyRes.text}`);
            assert.equal(applyRes.json?.ok, true);
            assert.equal(applyRes.json?.id, candidate.id);
            assert.equal(applyRes.json?.decision_applied, nextAction);
            assert.equal(applyRes.json?.rows_updated, 1);
            assert.ok(Array.isArray(applyRes.json?.files_touched), 'files_touched debe ser array');
            assert.ok(applyRes.json.files_touched.length >= 1, 'Debe tocar al menos un fichero');
        } finally {
            const restoreRes = await requestJson(
                `/pn-review/by-id/${encodeURIComponent(candidate.id)}/apply-decision`,
                { ...payload, action: candidate.originalAction }
            );
            assert.equal(restoreRes.status, 200, `No se pudo restaurar decision original: ${restoreRes.status} body=${restoreRes.text}`);
            assert.equal(restoreRes.json?.ok, true);
            assert.equal(restoreRes.json?.decision_applied, candidate.originalAction);
            restoreEngineRowFields(candidate.source_file, candidate.id, {
                qa_revision_estado: candidate.originalEstado,
                qa_revision_accion: candidate.originalAccion,
                qa_revision_updated_at: candidate.originalUpdatedAt,
            });
        }
    });
});
