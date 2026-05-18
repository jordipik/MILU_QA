#!/usr/bin/env node

const { runPdfVisualCopyBatch } = require('../server/services/pdf-copy-batch');

function hasFlag(name) {
    return process.argv.includes(name);
}

function readFlagValue(name) {
    const index = process.argv.indexOf(name);
    if (index === -1) return '';
    return String(process.argv[index + 1] || '').trim();
}

function parseFilesArg() {
    const raw = readFlagValue('--files');
    if (!raw) return undefined;
    return raw.split(',').map((part) => String(part || '').trim()).filter(Boolean);
}

async function main() {
    const explicitWrite = hasFlag('--write-pdf');
    const dryRun = hasFlag('--dry-run') || !explicitWrite;
    const noBackup = hasFlag('--no-backup');
    const files = parseFilesArg();

    const result = await runPdfVisualCopyBatch({
        writePdf: !dryRun,
        backup: !noBackup,
        files
    });

    console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
    console.error('BATCH_FAILED', String(error?.message || error));
    process.exit(1);
});
