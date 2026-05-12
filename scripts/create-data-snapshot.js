'use strict';
/**
 * scripts/create-data-snapshot.js
 * Crea un snapshot versionado de los engine_*.json bajo data/snapshots/<timestamp>/
 *
 * Uso:
 *   node scripts/create-data-snapshot.js
 *   node scripts/create-data-snapshot.js --label="pre-depuracion"
 *   node scripts/create-data-snapshot.js --no-validate   (omite validación de esquema)
 *   node scripts/create-data-snapshot.js --dry-run       (muestra lo que haría, no escribe)
 *
 * Salida:
 *   data/snapshots/<YYYY-MM-DD_HHMMSS>/
 *     engine_*.json        (copias de los engines)
 *     manifest.json        (metadatos del snapshot)
 *
 * No requiere dependencias externas.
 * Exit 0 = OK, Exit 1 = error crítico.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');
const SNAPSHOTS_DIR = path.join(REPO_ROOT, 'data', 'snapshots');
const SCHEMA_PATH = path.join(REPO_ROOT, 'schemas', 'engine-record.schema.json');
const VALIDATOR_PATH = path.join(REPO_ROOT, 'scripts', 'validate-engine-schema.js');

const ENGINE_FILES = [
    'engine_12V4000M40A.json',
    'engine_12V4000M53.json',
    'engine_12V4000M70.json',
    'engine_16V4000M61.json',
    'engine_16V4000M73.json',
    'engine_16V4000M73L.json',
    'engine_16V4000M90.json',
    'engine_20V4000M93.json',
    'engine_20V4000M93L.json',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    const args = { label: null, validate: true, dryRun: false };
    for (const arg of argv) {
        if (arg.startsWith('--label=')) args.label = arg.slice('--label='.length).trim();
        if (arg === '--no-validate') args.validate = false;
        if (arg === '--dry-run') args.dryRun = true;
    }
    return args;
}

function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}

function makeTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return (
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    );
}

function readSchemaVersion() {
    try {
        const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
        // Extract version from $id: "https://milu.local/schemas/engine-record/v1.0"
        const match = schema.$id?.match(/\/v(\d+\.\d+)$/);
        return match ? match[1] : 'unknown';
    } catch {
        return 'unknown';
    }
}

/** Inline minimal schema validator (same logic as validate-engine-schema.js but imported inline) */
function runSchemaValidation() {
    // Run as child process to reuse the existing validator
    const { spawnSync } = require('child_process');
    const result = spawnSync(
        process.execPath,
        [VALIDATOR_PATH, '--summary'],
        { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return {
        ok: result.status === 0,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run() {
    const args = parseArgs(process.argv.slice(2));
    const timestamp = makeTimestamp();
    const snapshotDir = path.join(SNAPSHOTS_DIR, timestamp);
    const manifestPath = path.join(snapshotDir, 'manifest.json');

    console.log(`[snapshot] Iniciando snapshot: ${timestamp}`);
    if (args.label) console.log(`[snapshot] Label: ${args.label}`);
    if (args.dryRun) console.log('[snapshot] Modo DRY-RUN — no se escribirá nada.');

    // 1. Validación de esquema previa (opcional)
    if (args.validate) {
        console.log('[snapshot] Validando esquema antes del snapshot...');
        if (!fs.existsSync(VALIDATOR_PATH)) {
            console.warn('[snapshot] WARN: validador no encontrado, omitiendo validación.');
        } else {
            const result = runSchemaValidation();
            if (!result.ok) {
                console.error('[snapshot] ERROR: validación de esquema falló. Abortando snapshot.');
                console.error(result.stdout);
                process.exit(1);
            }
            console.log('[snapshot] Esquema OK.');
        }
    }

    // 2. Recopilar info de cada engine
    const engineEntries = [];
    let totalRecords = 0;
    const missing = [];

    for (const fileName of ENGINE_FILES) {
        const srcPath = path.join(REPO_ROOT, fileName);
        if (!fs.existsSync(srcPath)) {
            console.warn(`[snapshot] WARN: fichero no encontrado: ${fileName}`);
            missing.push(fileName);
            continue;
        }

        const raw = fs.readFileSync(srcPath);
        let records;
        try {
            records = JSON.parse(raw);
        } catch (e) {
            console.error(`[snapshot] ERROR parseando ${fileName}: ${e.message}`);
            process.exit(1);
        }

        const recordCount = Array.isArray(records) ? records.length : null;
        const checksum = crypto.createHash('sha256').update(raw).digest('hex');
        const sizeBytes = raw.length;

        engineEntries.push({
            file: fileName,
            engine_model: fileName.replace('engine_', '').replace('.json', ''),
            records: recordCount,
            size_bytes: sizeBytes,
            sha256: checksum,
        });

        if (recordCount !== null) totalRecords += recordCount;
        console.log(`  ✓ ${fileName.padEnd(28)} ${String(recordCount).padStart(6)} registros  sha256: ${checksum.slice(0, 16)}...`);
    }

    // 3. Construir manifest
    const manifest = {
        snapshot_version: '1',
        created_at: new Date().toISOString(),
        label: args.label || null,
        host: os.hostname(),
        node_version: process.version,
        schema_version: readSchemaVersion(),
        total_engines: engineEntries.length,
        total_records: totalRecords,
        engines: engineEntries,
        missing_files: missing.length > 0 ? missing : undefined,
        validated_before_snapshot: args.validate && missing.length === 0,
    };

    // 4. Escribir snapshot
    if (args.dryRun) {
        console.log('\n[snapshot] DRY-RUN — manifest que se escribiría:');
        console.log(JSON.stringify(manifest, null, 2));
        console.log(`\n[snapshot] DRY-RUN completado. Directorio destino: ${snapshotDir}`);
        return;
    }

    fs.mkdirSync(snapshotDir, { recursive: true });

    // Copiar engines
    for (const entry of engineEntries) {
        const srcPath = path.join(REPO_ROOT, entry.file);
        const dstPath = path.join(snapshotDir, entry.file);
        fs.copyFileSync(srcPath, dstPath);
    }

    // Escribir manifest
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // 5. Escribir referencia al último snapshot
    const latestRefPath = path.join(SNAPSHOTS_DIR, 'latest.json');
    fs.writeFileSync(latestRefPath, JSON.stringify({ snapshot: timestamp, manifest: manifestPath }, null, 2), 'utf8');

    console.log('');
    console.log(`[snapshot] ✅ Snapshot creado en: data/snapshots/${timestamp}/`);
    console.log(`[snapshot]    Engines: ${manifest.total_engines}  |  Registros totales: ${manifest.total_records}`);
    console.log(`[snapshot]    Schema version: ${manifest.schema_version}`);
    if (args.label) console.log(`[snapshot]    Label: ${args.label}`);
    process.exit(0);
}

run();
