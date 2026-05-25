const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const versionJsonPath = path.join(rootDir, 'version.json');
const distDir = path.join(rootDir, 'dist');
const publishSourceDir = path.join(distDir, 'milu_publish');

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const skipBump = args.has('--no-bump');
const includeDateInFolderName = !args.has('--no-date');
const skipCleanup = args.has('--no-cleanup');
const keepLastArg = process.argv.slice(2).find((arg) => arg.startsWith('--keep-last='));
const keepLastCount = keepLastArg ? Number.parseInt(keepLastArg.split('=')[1], 10) : 5;

const EXCLUDED_DIRS = new Set([
    'fotos_articulos',
    'fotos_motores',
    'esquemas',
    'esquemas_pos_circulos',
    'pdf'
]);

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    const payload = JSON.stringify(value, null, 2) + '\n';
    fs.writeFileSync(filePath, payload, 'utf8');
}

function parseAppVersion(raw) {
    const value = String(raw || '').trim();
    const match = value.match(/^(\d+)\.(\d{2})\.(\d{3})$/);
    if (!match) {
        throw new Error(`Invalid appVersion format: ${value}. Expected A.BB.CCC`);
    }

    return {
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
        patch: Number.parseInt(match[3], 10)
    };
}

function formatAppVersion(parts) {
    return `${parts.major}.${String(parts.minor).padStart(2, '0')}.${String(parts.patch).padStart(3, '0')}`;
}

function bumpAppVersion(version) {
    const next = { ...version };
    next.patch += 1;

    if (next.patch > 999) {
        next.patch = 0;
        next.minor += 1;
    }
    if (next.minor > 99) {
        next.minor = 0;
        next.major += 1;
    }

    return next;
}

function appVersionToFolder(version) {
    return `Milu_QA_v${version.replace(/\./g, '_')}`;
}

function buildDateStamp(date = new Date()) {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function buildOutputFolderName(version) {
    const baseName = appVersionToFolder(version);
    if (!includeDateInFolderName) return baseName;
    return `${baseName}__${buildDateStamp()}`;
}

function shouldExcludeDir(relPath) {
    const normalized = relPath.split(path.sep).join('/').toLowerCase();
    const segments = normalized.split('/').filter(Boolean);
    return segments.some((segment) => EXCLUDED_DIRS.has(segment));
}

function shouldExcludeFile(fileName) {
    return String(fileName || '').toLowerCase().endsWith('.json');
}

function resolvePublishSourceDir() {
    if (fs.existsSync(publishSourceDir)) {
        return publishSourceDir;
    }

    throw new Error('Missing dist/milu_publish. Run npm run pages:prepare first.');
}

function listReleaseDirs() {
    if (!fs.existsSync(distDir)) return [];

    return fs.readdirSync(distDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => /^Milu_QA_v\d+_\d{2}_\d{3}(?:__\d{4}-\d{2}-\d{2})?$/.test(name));
}

function parseReleaseVersionFromFolder(folderName) {
    const match = String(folderName || '').match(/^Milu_QA_v(\d+)_(\d{2})_(\d{3})(?:__(\d{4})-(\d{2})-(\d{2}))?$/);
    if (!match) {
        return {
            major: 0,
            minor: 0,
            patch: 0,
            year: 0,
            month: 0,
            day: 0
        };
    }

    return {
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
        patch: Number.parseInt(match[3], 10),
        year: Number.parseInt(match[4] || '0', 10),
        month: Number.parseInt(match[5] || '0', 10),
        day: Number.parseInt(match[6] || '0', 10)
    };
}

function compareReleaseFolders(a, b) {
    const av = parseReleaseVersionFromFolder(a);
    const bv = parseReleaseVersionFromFolder(b);

    if (av.major !== bv.major) return av.major - bv.major;
    if (av.minor !== bv.minor) return av.minor - bv.minor;
    if (av.patch !== bv.patch) return av.patch - bv.patch;
    if (av.year !== bv.year) return av.year - bv.year;
    if (av.month !== bv.month) return av.month - bv.month;
    if (av.day !== bv.day) return av.day - bv.day;
    return a.localeCompare(b);
}

function pruneOldReleaseDirs(currentFolderName) {
    if (skipCleanup) return [];
    if (!Number.isInteger(keepLastCount) || keepLastCount < 1) {
        throw new Error(`Invalid --keep-last value: ${keepLastCount}. Use an integer >= 1.`);
    }

    const allReleaseDirs = listReleaseDirs().sort(compareReleaseFolders);
    const protectedSet = new Set([currentFolderName]);
    const keepSet = new Set();

    for (let i = allReleaseDirs.length - 1; i >= 0 && keepSet.size < keepLastCount; i -= 1) {
        keepSet.add(allReleaseDirs[i]);
    }

    const removed = [];
    for (const dirName of allReleaseDirs) {
        if (protectedSet.has(dirName) || keepSet.has(dirName)) continue;

        removed.push(dirName);
        if (!isDryRun) {
            fs.rmSync(path.join(distDir, dirName), { recursive: true, force: true });
        }
    }

    return removed;
}

function copyTreeFiltered(srcDir, destDir) {
    const stack = [{ src: srcDir, rel: '' }];
    let copiedFiles = 0;
    let skippedFiles = 0;
    let skippedDirs = 0;

    while (stack.length > 0) {
        const current = stack.pop();
        const entries = fs.readdirSync(current.src, { withFileTypes: true });

        for (const entry of entries) {
            const relPath = current.rel ? path.join(current.rel, entry.name) : entry.name;
            const srcPath = path.join(srcDir, relPath);
            const destPath = path.join(destDir, relPath);

            if (entry.isDirectory()) {
                if (shouldExcludeDir(relPath)) {
                    skippedDirs += 1;
                    continue;
                }
                if (!isDryRun) fs.mkdirSync(destPath, { recursive: true });
                stack.push({ src: srcPath, rel: relPath });
                continue;
            }

            if (!entry.isFile()) continue;

            if (shouldExcludeFile(entry.name)) {
                skippedFiles += 1;
                continue;
            }

            copiedFiles += 1;
            if (!isDryRun) {
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    return { copiedFiles, skippedFiles, skippedDirs };
}

function copyVersionJson(destDir) {
    const destPath = path.join(destDir, 'version.json');

    if (isDryRun) {
        console.log('[dry-run] copy version.json');
        return false;
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(versionJsonPath, destPath);
    return true;
}

function copyStaticDataFolder(destDir) {
    const srcPath = path.join(rootDir, 'data', '05-wordpress');
    const destPath = path.join(destDir, 'data', '05-wordpress');

    if (!fs.existsSync(srcPath)) {
        return false;
    }

    if (isDryRun) {
        console.log('[dry-run] copy data/05-wordpress');
        return true;
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.cpSync(srcPath, destPath, { recursive: true, force: true });
    return true;
}

function main() {
    const publishSourceDir = resolvePublishSourceDir();

    const pkg = readJson(packageJsonPath);
    const currentVersionParts = parseAppVersion(pkg.appVersion);
    const nextVersionParts = skipBump ? currentVersionParts : bumpAppVersion(currentVersionParts);
    const nextVersion = formatAppVersion(nextVersionParts);
    const outputFolderName = buildOutputFolderName(nextVersion);
    const outputFolderPath = path.join(distDir, outputFolderName);

    if (!skipBump) {
        pkg.appVersion = nextVersion;
        if (!isDryRun) writeJson(packageJsonPath, pkg);

        const versionJson = fs.existsSync(versionJsonPath) ? readJson(versionJsonPath) : {};
        versionJson.version = nextVersion;
        if (!isDryRun) writeJson(versionJsonPath, versionJson);
    }

    if (!isDryRun) {
        fs.rmSync(outputFolderPath, { recursive: true, force: true });
        fs.mkdirSync(outputFolderPath, { recursive: true });
    }

    const stats = copyTreeFiltered(publishSourceDir, outputFolderPath);
    const copiedVersionJson = copyVersionJson(outputFolderPath);
    const copiedStaticDataFolder = copyStaticDataFolder(outputFolderPath);
    const removedReleaseDirs = pruneOldReleaseDirs(outputFolderName);

    console.log('Release folder prepared successfully.');
    console.log(`Version: ${nextVersion}${skipBump ? ' (no bump)' : ''}`);
    console.log(`Source: dist/${path.basename(publishSourceDir)}`);
    console.log(`Output: dist/${outputFolderName}`);
    console.log(`Copied files: ${stats.copiedFiles}`);
    console.log(`Copied version.json: ${copiedVersionJson ? 'yes' : 'no'}`);
    console.log(`Copied data/05-wordpress: ${copiedStaticDataFolder ? 'yes' : 'no'}`);
    console.log(`Skipped json files: ${stats.skippedFiles}`);
    console.log(`Skipped excluded dirs: ${stats.skippedDirs}`);
    console.log(`Cleanup old release dirs: ${removedReleaseDirs.length}`);
    if (removedReleaseDirs.length > 0) {
        console.log(`Removed: ${removedReleaseDirs.join(', ')}`);
    }
    if (isDryRun) {
        console.log('Dry-run mode enabled: no files were written.');
    }
}

try {
    main();
} catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
}