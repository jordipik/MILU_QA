const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist', 'milu_publish');

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const isIncremental = args.has('--incremental');
const shouldPrune = !args.has('--no-prune');
const includeEngineJson = args.has('--with-json') && !args.has('--no-json');

const requiredStaticEntries = [
    'index.html',
    'milu_shell.html',
    'qa_milu.html',
    'qa_lista_agrupada.html',
    'analista_02.html',
    'qa_analista_registro.html',
    'qa_auditoria.html',
    'styles.css',
    'qa_revision_sync.php',
    'save-json.php',
    'CNAME',
    'js',
    'styles',
    'pdf',
    'esquemas',
    'esquemas_pos_circulos'
];

function ensureExists(relPath) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`Missing required path: ${relPath}`);
    }
    return fullPath;
}

function copyEntry(relPath) {
    const src = ensureExists(relPath);
    const dest = path.join(outDir, relPath);

    if (isDryRun) {
        console.log(`[dry-run] copy ${relPath}`);
        return;
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true, force: true });
    console.log(`copied ${relPath}`);
}

function normalizeRelativePath(relPath) {
    return relPath.split(path.sep).join('/');
}

function walkFilesRecursively(dirPath, currentRel = '') {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const rel = currentRel ? path.join(currentRel, entry.name) : entry.name;
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkFilesRecursively(full, rel));
            continue;
        }
        if (entry.isFile()) {
            files.push(normalizeRelativePath(rel));
        }
    }

    return files;
}

function buildManagedFileList(relEntries) {
    const managedFiles = [];

    for (const relPath of relEntries) {
        const src = ensureExists(relPath);
        const stat = fs.statSync(src);

        if (stat.isDirectory()) {
            const dirFiles = walkFilesRecursively(src);
            for (const relFile of dirFiles) {
                managedFiles.push(normalizeRelativePath(path.join(relPath, relFile)));
            }
            continue;
        }

        if (stat.isFile()) {
            managedFiles.push(normalizeRelativePath(relPath));
        }
    }

    return managedFiles;
}

function filesAreEqual(src, dest) {
    if (!fs.existsSync(dest)) return false;
    const srcStat = fs.statSync(src);
    const destStat = fs.statSync(dest);
    if (!srcStat.isFile() || !destStat.isFile()) return false;
    if (srcStat.size !== destStat.size) return false;

    const srcBuf = fs.readFileSync(src);
    const destBuf = fs.readFileSync(dest);
    return Buffer.compare(srcBuf, destBuf) === 0;
}

function ensureOutputFolder() {
    if (isDryRun) return;
    fs.mkdirSync(outDir, { recursive: true });
}

function copyManagedFiles(managedFiles) {
    let copied = 0;
    let skipped = 0;

    for (const relFile of managedFiles) {
        const src = path.join(rootDir, relFile);
        const dest = path.join(outDir, relFile);

        if (isIncremental && filesAreEqual(src, dest)) {
            skipped += 1;
            if (isDryRun) console.log(`[dry-run] skip ${relFile}`);
            continue;
        }

        copied += 1;
        if (isDryRun) {
            console.log(`[dry-run] copy ${relFile}`);
            continue;
        }

        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        console.log(`copied ${relFile}`);
    }

    return { copied, skipped };
}

function pruneOutputFolder(managedFiles) {
    if (!shouldPrune || !fs.existsSync(outDir)) {
        return { pruned: 0 };
    }

    const managedSet = new Set(managedFiles);
    const currentFiles = walkFilesRecursively(outDir);
    let pruned = 0;

    for (const relFile of currentFiles) {
        const normalized = normalizeRelativePath(relFile);
        if (managedSet.has(normalized)) continue;

        pruned += 1;
        if (isDryRun) {
            console.log(`[dry-run] prune ${normalized}`);
            continue;
        }

        fs.rmSync(path.join(outDir, normalized), { force: true });
        console.log(`pruned ${normalized}`);
    }

    return { pruned };
}

function listEngineJsonFiles() {
    const engineFiles = ENGINE_JSON_FILES
        .filter((fileName) => fs.existsSync(path.join(rootDir, fileName)))
        .sort((a, b) => a.localeCompare(b));

    if (engineFiles.length === 0) {
        throw new Error('No official engine JSON files found in repository root.');
    }

    return engineFiles;
}

function resetOutputFolder() {
    if (isDryRun) {
        console.log(`[dry-run] reset ${path.relative(rootDir, outDir)}`);
        return;
    }

    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
}

function main() {
    console.log('Preparing GitHub Pages dist folder...');
    if (isDryRun) {
        console.log('Running in dry-run mode: no files will be copied.');
    }
    if (isIncremental) {
        console.log('Incremental mode enabled: copying only changed files.');
    }
    if (includeEngineJson) {
        console.log('Engine JSON mode: enabled (--with-json).');
    } else {
        console.log('Engine JSON mode: disabled by default.');
    }

    const engineFiles = includeEngineJson ? listEngineJsonFiles() : [];
    const managedEntries = [...requiredStaticEntries, ...engineFiles];
    const managedFiles = buildManagedFileList(managedEntries);

    if (isIncremental) {
        ensureOutputFolder();
    } else {
        resetOutputFolder();
    }

    const { copied, skipped } = copyManagedFiles(managedFiles);
    const { pruned } = pruneOutputFolder(managedFiles);

    console.log('Done.');
    console.log(`Engine files included: ${engineFiles.length}`);
    console.log(`Managed files: ${managedFiles.length}`);
    console.log(`Copied files: ${copied}`);
    console.log(`Skipped unchanged: ${skipped}`);
    console.log(`Pruned files: ${pruned}`);
    console.log(`Output folder: ${path.relative(rootDir, outDir)}`);
}

try {
    main();
} catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
}
