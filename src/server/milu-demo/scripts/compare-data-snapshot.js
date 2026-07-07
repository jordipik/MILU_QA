'use strict';
/**
 * scripts/compare-data-snapshot.js
 * Compara un snapshot guardado con el estado actual de los engine_*.json
 *
 * Uso:
 *   node scripts/compare-data-snapshot.js                         # usa el último snapshot (latest.json)
 *   node scripts/compare-data-snapshot.js 2026-05-13_120000       # snapshot concreto
 *   node scripts/compare-data-snapshot.js --list                  # lista snapshots disponibles
 *   node scripts/compare-data-snapshot.js --json                  # salida en JSON (para CI/pipelines)
 *
 * Salida:
 *   - Resumen de cambios por fichero (añadido, eliminado, modificado, igual)
 *   - Diferencias en número de registros
 *   - Diferencias de checksum
 *   - Exit 0 si sin cambios, Exit 2 si hay diferencias, Exit 1 si error
 *
 * No requiere dependencias externas.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const SNAPSHOTS_DIR = path.join(REPO_ROOT, 'data', 'snapshots');
const LATEST_REF = path.join(SNAPSHOTS_DIR, 'latest.json');

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

function sha256Bytes(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function listSnapshots() {
    if (!fs.existsSync(SNAPSHOTS_DIR)) return [];
    return fs.readdirSync(SNAPSHOTS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
}

function resolveSnapshotDir(nameOrLatest) {
    if (!nameOrLatest) {
        // Use latest.json reference
        if (!fs.existsSync(LATEST_REF)) return null;
        const ref = JSON.parse(fs.readFileSync(LATEST_REF, 'utf8'));
        return path.join(SNAPSHOTS_DIR, ref.snapshot);
    }
    return path.join(SNAPSHOTS_DIR, nameOrLatest);
}

function loadManifest(snapshotDir) {
    const manifestPath = path.join(snapshotDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

/** Calcula estado actual de todos los engines */
function getCurrentState() {
    const state = {};
    for (const fileName of ENGINE_FILES) {
        const filePath = path.join(REPO_ROOT, fileName);
        if (!fs.existsSync(filePath)) {
            state[fileName] = null;
            continue;
        }
        const raw = fs.readFileSync(filePath);
        let records = null;
        try {
            const parsed = JSON.parse(raw);
            records = Array.isArray(parsed) ? parsed.length : null;
        } catch {
            records = null;
        }
        state[fileName] = {
            size_bytes: raw.length,
            sha256: sha256Bytes(raw),
            records,
        };
    }
    return state;
}

// ---------------------------------------------------------------------------
// Compare logic
// ---------------------------------------------------------------------------

function compareSnapshots(manifest, currentState) {
    const results = [];
    const snapshotFiles = new Set(manifest.engines.map((e) => e.file));
    const currentFiles = new Set(Object.keys(currentState).filter((k) => currentState[k] !== null));

    // Files in snapshot but missing now
    for (const f of snapshotFiles) {
        if (!currentFiles.has(f)) {
            results.push({ file: f, status: 'DELETED', snap: manifest.engines.find((e) => e.file === f), current: null });
        }
    }

    // Files now but not in snapshot
    for (const f of currentFiles) {
        if (!snapshotFiles.has(f)) {
            results.push({ file: f, status: 'ADDED', snap: null, current: currentState[f] });
        }
    }

    // Files in both — compare
    for (const snapEntry of manifest.engines) {
        const f = snapEntry.file;
        const cur = currentState[f];
        if (!cur) continue; // already handled as DELETED

        if (cur.sha256 === snapEntry.sha256) {
            results.push({ file: f, status: 'UNCHANGED', snap: snapEntry, current: cur });
        } else {
            const recordDiff = cur.records !== null && snapEntry.records !== null
                ? cur.records - snapEntry.records
                : null;
            results.push({
                file: f,
                status: 'MODIFIED',
                snap: snapEntry,
                current: cur,
                record_diff: recordDiff,
            });
        }
    }

    return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run() {
    const args = process.argv.slice(2);
    const jsonOutput = args.includes('--json');
    const listMode = args.includes('--list');
    const snapshotName = args.find((a) => !a.startsWith('--')) || null;

    // List mode
    if (listMode) {
        const snapshots = listSnapshots();
        if (snapshots.length === 0) {
            console.log('No hay snapshots disponibles en data/snapshots/');
        } else {
            console.log(`Snapshots disponibles (${snapshots.length}):`);
            for (const s of snapshots) {
                const manifestPath = path.join(SNAPSHOTS_DIR, s, 'manifest.json');
                let info = '';
                if (fs.existsSync(manifestPath)) {
                    try {
                        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                        info = `  ${m.total_engines} engines, ${m.total_records} registros` +
                            (m.label ? `, label: "${m.label}"` : '');
                    } catch { /* skip */ }
                }
                console.log(`  ${s}${info}`);
            }
        }
        return;
    }

    // Resolve snapshot
    const snapshotDir = resolveSnapshotDir(snapshotName);
    if (!snapshotDir || !fs.existsSync(snapshotDir)) {
        console.error(snapshotName
            ? `ERROR: snapshot no encontrado: ${snapshotName}`
            : 'ERROR: no hay snapshots disponibles. Ejecuta npm run data:snapshot primero.'
        );
        process.exit(1);
    }

    const manifest = loadManifest(snapshotDir);
    if (!manifest) {
        console.error(`ERROR: manifest.json no encontrado en ${snapshotDir}`);
        process.exit(1);
    }

    const snapshotId = path.basename(snapshotDir);
    console.log(`[compare] Snapshot: ${snapshotId}  (${manifest.created_at})`);
    if (manifest.label) console.log(`[compare] Label: ${manifest.label}`);
    console.log(`[compare] Schema version snapshot: ${manifest.schema_version}`);
    console.log('');

    // Get current state
    const currentState = getCurrentState();

    // Compare
    const results = compareSnapshots(manifest, currentState);

    // Sort: MODIFIED first, then DELETED, ADDED, UNCHANGED
    const order = { MODIFIED: 0, DELETED: 1, ADDED: 2, UNCHANGED: 3 };
    results.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

    let hasChanges = false;
    const modified = results.filter((r) => r.status !== 'UNCHANGED');
    if (modified.length > 0) hasChanges = true;

    if (jsonOutput) {
        console.log(JSON.stringify({ snapshot: snapshotId, manifest_created_at: manifest.created_at, results }, null, 2));
    } else {
        for (const r of results) {
            const icon = { UNCHANGED: '=', MODIFIED: '~', ADDED: '+', DELETED: '-' }[r.status] || '?';
            let line = `  [${icon}] ${r.file.padEnd(32)} ${r.status}`;
            if (r.status === 'MODIFIED') {
                const snapRec = r.snap?.records ?? '?';
                const curRec = r.current?.records ?? '?';
                const diff = r.record_diff !== null ? (r.record_diff >= 0 ? `+${r.record_diff}` : String(r.record_diff)) : '?';
                line += `  (registros: ${snapRec} → ${curRec}, Δ${diff})`;
                line += `\n       sha256: ${r.snap?.sha256?.slice(0, 16)}... → ${r.current?.sha256?.slice(0, 16)}...`;
            }
            if (r.status === 'DELETED') {
                line += `  (estaba en snapshot, ya no existe)`;
            }
            if (r.status === 'ADDED') {
                line += `  (nuevo, no estaba en snapshot)`;
            }
            console.log(line);
        }
    }

    // Summary
    const counts = { UNCHANGED: 0, MODIFIED: 0, ADDED: 0, DELETED: 0 };
    for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;

    const snapshotTotalRecords = manifest.total_records;
    const currentTotalRecords = Object.values(currentState)
        .filter(Boolean)
        .reduce((acc, e) => acc + (e.records || 0), 0);

    console.log('');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`Sin cambios: ${counts.UNCHANGED}  |  Modificados: ${counts.MODIFIED}  |  Añadidos: ${counts.ADDED}  |  Eliminados: ${counts.DELETED}`);
    console.log(`Registros snapshot: ${snapshotTotalRecords}  →  Registros actuales: ${currentTotalRecords}  (Δ${currentTotalRecords - snapshotTotalRecords})`);

    if (hasChanges) {
        console.log('RESULTADO: DIFERENCIAS DETECTADAS');
        process.exit(2);
    } else {
        console.log('RESULTADO: SIN CAMBIOS');
        process.exit(0);
    }
}

run();
