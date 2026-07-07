'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

const CRITICAL_FILES = [
    'server.js',
    'js/qa-milu.js',
    'js/qa-table.js',
    'js/data-loader.js',
    'js/revision.js',
    'js/column-view.js',
    'js/cell-editor.js',
    'js/helpers.js',
    'js/state.js',
    'js/schemas.js',
    'js/pdf-viewer.js'
];

function walkJsFiles(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkJsFiles(fullPath));
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(path.relative(REPO_ROOT, fullPath));
        }
    }
    return files;
}

function uniq(list) {
    return Array.from(new Set(list));
}

function runNodeCheck(relativeFile) {
    const absFile = path.join(REPO_ROOT, relativeFile);
    const result = spawnSync(process.execPath, ['--check', absFile], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    return {
        file: relativeFile,
        status: result.status,
        stdout: String(result.stdout || ''),
        stderr: String(result.stderr || '')
    };
}

function main() {
    const testFiles = walkJsFiles(path.join(REPO_ROOT, 'tests'));
    const filesToCheck = uniq([...CRITICAL_FILES, ...testFiles]).filter((file) => {
        return fs.existsSync(path.join(REPO_ROOT, file));
    });

    if (!filesToCheck.length) {
        console.log('[lint] No hay archivos JS para validar.');
        return;
    }

    console.log(`[lint] Validando sintaxis JS en ${filesToCheck.length} archivos...`);

    let hasErrors = false;
    for (const file of filesToCheck) {
        const check = runNodeCheck(file);
        if (check.status === 0) {
            continue;
        }
        hasErrors = true;
        console.error(`\n[lint] ERROR en ${check.file}`);
        if (check.stdout.trim()) console.error(check.stdout.trim());
        if (check.stderr.trim()) console.error(check.stderr.trim());
    }

    if (hasErrors) {
        console.error('\n[lint] Fallo de sintaxis detectado.');
        process.exit(1);
    }

    console.log('[lint] OK: sintaxis valida en archivos criticos y tests.');
}

main();
