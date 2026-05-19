#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function txt(value) {
    return String(value == null ? '' : value).trim();
}

function readArg(name, fallback = '') {
    const index = process.argv.indexOf(name);
    if (index === -1) return fallback;
    return txt(process.argv[index + 1] || fallback);
}

function parseJsonSafe(raw) {
    try {
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function readJsonArray(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('El engine no contiene un array JSON.');
    return data;
}

function getPdfFieldDiff(beforeRow = {}, afterRow = {}) {
    const allKeys = new Set([
        ...Object.keys(beforeRow || {}).filter((k) => k.endsWith('_pdf')),
        ...Object.keys(afterRow || {}).filter((k) => k.endsWith('_pdf'))
    ]);

    const changed = [];
    for (const key of allKeys) {
        const before = txt(beforeRow?.[key]);
        const after = txt(afterRow?.[key]);
        if (before !== after) changed.push({ field: key, before, after });
    }
    return changed.sort((a, b) => a.field.localeCompare(b.field));
}

function rowFingerprint(row) {
    return JSON.stringify(row || {});
}

function computeChangedIds(beforeRows, afterRows) {
    const byIdBefore = new Map(beforeRows.map((row) => [txt(row?.ID), row]));
    const byIdAfter = new Map(afterRows.map((row) => [txt(row?.ID), row]));

    const allIds = new Set([...byIdBefore.keys(), ...byIdAfter.keys()]);
    const changedIds = [];

    for (const id of allIds) {
        const before = byIdBefore.get(id);
        const after = byIdAfter.get(id);
        if (rowFingerprint(before) !== rowFingerprint(after)) changedIds.push(id);
    }

    return changedIds.sort();
}

async function postJson(url, payload) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const bodyText = await response.text();
    const body = parseJsonSafe(bodyText);
    return { response, body, bodyText };
}

async function main() {
    const repoRoot = path.resolve(__dirname, '..');
    const file = readArg('--file', 'engine_12V4000M53.json');
    const id = readArg('--id', '1200001');
    const baseUrl = readArg('--base-url', 'http://localhost:3000');

    if (!id) {
        throw new Error('Debe indicar --id <ID_DE_PRUEBA>.');
    }

    const enginePath = path.join(repoRoot, file);
    if (!fs.existsSync(enginePath)) throw new Error(`No existe ${enginePath}`);

    const backupPath = `${enginePath}.backup`;
    const backupBefore = fs.existsSync(backupPath) ? fs.statSync(backupPath).mtimeMs : 0;

    const beforeRows = readJsonArray(enginePath);
    const beforeRow = beforeRows.find((row) => txt(row?.ID) === id);
    if (!beforeRow) throw new Error(`No existe ID=${id} en ${file}`);

    const payload = {
        file,
        id,
        writePdf: true,
        backup: true
    };

    const endpoint = `${baseUrl.replace(/\/$/, '')}/copy-pdf-to-pdf-all-books`;
    const { response, body } = await postJson(endpoint, payload);
    const result = body?.result || {};

    const scanned = Number(result?.scanned ?? result?.totals?.scanned ?? 0) || 0;
    const filesProcessed = Number(result?.filesProcessed ?? (Array.isArray(result?.perFile) ? result.perFile.length : 0)) || 0;
    const errorsCount = Array.isArray(result?.errors) ? result.errors.length : 0;

    const afterRows = readJsonArray(enginePath);
    const afterRow = afterRows.find((row) => txt(row?.ID) === id);
    const changedIds = computeChangedIds(beforeRows, afterRows);
    const touchedOtherIds = changedIds.filter((changedId) => changedId !== id);
    const pdfFieldChanges = getPdfFieldDiff(beforeRow, afterRow);

    const backupAfterExists = fs.existsSync(backupPath);
    const backupAfter = backupAfterExists ? fs.statSync(backupPath).mtimeMs : 0;
    const backupCreatedOrUpdated = backupAfterExists && backupAfter > backupBefore;

    const checks = [
        { name: 'endpoint ok=true', pass: Boolean(body?.ok === true && response.ok) },
        { name: 'scanned=1', pass: scanned === 1 },
        { name: 'filesProcessed=1', pass: filesProcessed === 1 },
        { name: 'errors=0', pass: errorsCount === 0 },
        { name: 'backup creado/actualizado', pass: backupCreatedOrUpdated },
        { name: 'solo se toca el ID objetivo', pass: touchedOtherIds.length === 0 }
    ];

    const passCount = checks.filter((item) => item.pass).length;
    const failCount = checks.length - passCount;

    const summary = {
        payload,
        endpoint,
        result: {
            ok: body?.ok === true,
            status: response.status,
            scanned,
            filesProcessed,
            errorsCount
        },
        backup: {
            path: backupPath,
            exists: backupAfterExists,
            createdOrUpdated: backupCreatedOrUpdated,
            beforeMtimeMs: backupBefore,
            afterMtimeMs: backupAfter
        },
        changed: {
            changedIds,
            touchedOtherIds,
            targetPdfFieldChanges: pdfFieldChanges,
            targetPdfFieldChangesCount: pdfFieldChanges.length
        },
        checks,
        passCount,
        failCount,
        finalStatus: failCount === 0 ? 'PASS' : 'FAIL'
    };

    console.log(JSON.stringify(summary, null, 2));
    process.exit(failCount === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error('CONTROLLED_WRITE_VALIDATION_FAILED', String(error?.message || error));
    process.exit(99);
});
