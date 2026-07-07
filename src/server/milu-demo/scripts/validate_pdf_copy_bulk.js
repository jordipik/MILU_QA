#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = 'engine_12V4000M53.json';
const DEFAULT_BASE_URL = 'http://localhost:3000';

function readArg(name) {
    const index = process.argv.indexOf(name);
    if (index === -1) return '';
    return String(process.argv[index + 1] || '').trim();
}

function hasFlag(name) {
    return process.argv.includes(name);
}

function txt(value) {
    return String(value == null ? '' : value).trim();
}

function parseJsonSafe(raw) {
    try {
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function detectSampleId(fileName) {
    try {
        const filePath = path.resolve(__dirname, '..', fileName);
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        if (!Array.isArray(data) || data.length === 0) return '';
        const row = data.find((item) => txt(item?.ID));
        return txt(row?.ID);
    } catch (_) {
        return '';
    }
}

async function postJson(url, payload) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const bodyText = await res.text();
    const data = parseJsonSafe(bodyText);
    return { okHttp: res.ok, status: res.status, data, bodyText };
}

function summarizeResult(label, payload, response) {
    const result = response?.data?.result || {};
    const perFile = Array.isArray(result?.perFile) ? result.perFile : [];
    const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
    const errors = Array.isArray(result?.errors) ? result.errors : [];

    const filesProcessed = Number(result?.filesProcessed ?? perFile.length) || 0;
    const scanned = Number(result?.scanned ?? result?.totals?.scanned ?? 0) || 0;
    const changedRows = Number(result?.changedRows ?? result?.totals?.changedRows ?? 0) || 0;
    const unchangedRows = Number(result?.unchangedRows ?? result?.totals?.unchangedRows ?? 0) || 0;

    const endpointOk = Boolean(response?.okHttp) && Boolean(response?.data?.ok);
    const caseOk = endpointOk && errors.length === 0;

    return {
        label,
        pass: caseOk,
        payload,
        ok: Boolean(response?.data?.ok),
        status: Number(response?.status || 0),
        filesProcessed,
        scanned,
        changedRows,
        unchangedRows,
        warnings,
        errors,
        perFile
    };
}

function printCaseSummary(summary) {
    const header = `${summary.pass ? 'PASS' : 'FAIL'} | ${summary.label}`;
    console.log('\n' + header);
    console.log('-'.repeat(header.length));
    console.log(JSON.stringify({
        ok: summary.ok,
        status: summary.status,
        filesProcessed: summary.filesProcessed,
        scanned: summary.scanned,
        changedRows: summary.changedRows,
        unchangedRows: summary.unchangedRows,
        warnings: summary.warnings,
        errors: summary.errors,
        perFile: summary.perFile
    }, null, 2));
}

async function main() {
    const baseUrl = txt(readArg('--base-url')) || DEFAULT_BASE_URL;
    const file = txt(readArg('--file')) || DEFAULT_FILE;
    const explicitId = txt(readArg('--id'));
    const id = explicitId || detectSampleId(file);
    const runWrite = hasFlag('--run-write');

    const endpoint = `${baseUrl.replace(/\/$/, '')}/copy-pdf-to-pdf-all-books`;

    console.log('[pdf-copy-validate] endpoint:', endpoint);
    console.log('[pdf-copy-validate] file:', file);
    console.log('[pdf-copy-validate] id:', id || '(no disponible)');

    const caseSummaries = [];

    if (id) {
        const payloadCase1 = { file, id, writePdf: false };
        const responseCase1 = await postJson(endpoint, payloadCase1);
        const summaryCase1 = summarizeResult('CASO 1: ID concreto + libro (dry-run)', payloadCase1, responseCase1);
        caseSummaries.push(summaryCase1);
        printCaseSummary(summaryCase1);
    } else {
        const skipped = {
            label: 'CASO 1: ID concreto + libro (dry-run)',
            pass: false,
            ok: false,
            status: 0,
            filesProcessed: 0,
            scanned: 0,
            changedRows: 0,
            unchangedRows: 0,
            warnings: [],
            errors: ['No se pudo resolver ID de prueba. Use --id <ID_DE_PRUEBA>.'],
            perFile: []
        };
        caseSummaries.push(skipped);
        printCaseSummary(skipped);
    }

    const payloadCase2 = { file, writePdf: false };
    const responseCase2 = await postJson(endpoint, payloadCase2);
    const summaryCase2 = summarizeResult('CASO 2: libro completo (dry-run)', payloadCase2, responseCase2);
    caseSummaries.push(summaryCase2);
    printCaseSummary(summaryCase2);

    const payloadCase3 = { writePdf: false };
    const responseCase3 = await postJson(endpoint, payloadCase3);
    const summaryCase3 = summarizeResult('CASO 3: todos los libros (dry-run)', payloadCase3, responseCase3);
    caseSummaries.push(summaryCase3);
    printCaseSummary(summaryCase3);

    const passCount = caseSummaries.filter((item) => item.pass).length;
    const failCount = caseSummaries.length - passCount;

    console.log('\nRESUMEN DRY-RUN');
    console.log('---------------');
    console.log(JSON.stringify({
        pass: passCount,
        fail: failCount,
        endpoint,
        dryRun: true
    }, null, 2));

    const controlledPayload = {
        file,
        id: id || '<ID_DE_PRUEBA>',
        writePdf: true,
        backup: true
    };

    console.log('\nPRUEBA CONTROLADA PREPARADA');
    console.log('---------------------------');
    console.log(JSON.stringify(controlledPayload, null, 2));

    if (!runWrite) {
        console.log('No ejecutada (modo seguro por defecto). Use --run-write para ejecutarla.');
        process.exit(failCount === 0 ? 0 : 1);
    }

    if (!id) {
        console.error('No se puede ejecutar write=true sin ID. Use --id <ID_DE_PRUEBA>.');
        process.exit(2);
    }

    const responseWrite = await postJson(endpoint, controlledPayload);
    const summaryWrite = summarizeResult('WRITE CONTROLADO: ID + libro (writePdf=true, backup=true)', controlledPayload, responseWrite);
    printCaseSummary(summaryWrite);

    process.exit(summaryWrite.pass ? 0 : 3);
}

main().catch((error) => {
    console.error('[pdf-copy-validate] error:', String(error?.message || error));
    process.exit(99);
});
