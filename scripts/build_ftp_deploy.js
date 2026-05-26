const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const deployDir = path.join(rootDir, 'deploy_ftp');
const reportPath = path.join(rootDir, 'deploy_ftp_report.md');

const EXCLUDED_DIRS = new Set([
    '.git',
    '.github',
    '.venv',
    '.vscode',
    'dist',
    'zz_old',
    'zz_copias',
    'json_originales',
    'node_modules',
    'docs_legacy',
    'docs_v2',
    '__pycache__',
    'scripts',
    'server',
    'tests',
    'legacy',
    'reports',
    'python_lib'
]);

const EXCLUDED_EXTENSIONS = new Set([
    '.py',
    '.ps1',
    '.bat',
    '.rar',
    '.zip',
    '.7z',
    '.xlsx',
    '.xls',
    '.log',
    '.md',
    '.txt'
]);

const BACKEND_PATTERNS = [
    { label: 'localhost:3000', regex: /localhost:3000/gi },
    { label: '/api/', regex: /\/api\//gi },
    { label: '/save-json', regex: /\/save-json(?:\.php)?/gi },
    { label: '/qa_revision_sync.php', regex: /\/qa_revision_sync\.php/gi },
    { label: '/export/', regex: /\/export\//gi },
    { label: '/recompute', regex: /\/recompute[\w-]*/gi }
];

const copiedFiles = [];
const excludedItems = [];
const missingReferences = [];
const backendMatches = [];
const dependencyGraph = new Map();
const EXCLUSION_RULE_SUMMARY = [
    'Directorios excluidos: .git, .github, .venv, .vscode, dist, zz_old, zz_copias, json_originales, node_modules, docs_legacy, docs_v2, __pycache__, scripts, server, tests, legacy, reports, python_lib',
    'Extensiones excluidas: .py, .ps1, .bat, .rar, .zip, .7z, .xlsx, .xls, .log, .md, .txt',
    'Backups excluidos: *.backup* y *.bak*',
    'engine_*.json excluido por defecto'
];

function toPosix(relPath) {
    return relPath.split(path.sep).join('/');
}

function relFromRoot(absPath) {
    return toPosix(path.relative(rootDir, absPath));
}

function exists(absPath) {
    try {
        fs.accessSync(absPath, fs.constants.F_OK);
        return true;
    } catch (_) {
        return false;
    }
}

function isExcludedByPath(relPath) {
    const normalized = toPosix(relPath);
    const parts = normalized.split('/');

    for (const part of parts) {
        if (EXCLUDED_DIRS.has(part)) {
            return `excluded-dir:${part}`;
        }
    }

    if (/\.backup(\.|-|$)/i.test(normalized) || /\.bak(\.|$)/i.test(normalized)) {
        return 'backup-file';
    }

    if (/^engine_.*\.json$/i.test(path.basename(normalized))) {
        return 'engine-json-disabled-by-default';
    }

    const ext = path.extname(normalized).toLowerCase();
    if (EXCLUDED_EXTENSIONS.has(ext)) {
        return `excluded-ext:${ext}`;
    }

    return null;
}

function shouldIncludeRootHtml(name) {
    if (!name.toLowerCase().endsWith('.html')) return false;
    if (name.toLowerCase().includes('.backup')) return false;
    return true;
}

function gatherRootHtmlSeeds() {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    const htmlFiles = [];

    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!shouldIncludeRootHtml(entry.name)) continue;

        const relPath = toPosix(entry.name);
        const excludedReason = isExcludedByPath(relPath);
        if (excludedReason) {
            excludedItems.push({ path: relPath, reason: excludedReason, source: 'seed-html' });
            continue;
        }

        htmlFiles.push(relPath);
    }

    return htmlFiles.sort((a, b) => a.localeCompare(b));
}

function cleanUrlRef(value) {
    if (!value) return '';
    const stripped = String(value).trim();
    if (!stripped) return '';

    if (
        stripped.startsWith('http://') ||
        stripped.startsWith('https://') ||
        stripped.startsWith('data:') ||
        stripped.startsWith('mailto:') ||
        stripped.startsWith('tel:') ||
        stripped.startsWith('javascript:') ||
        stripped.startsWith('#') ||
        stripped.startsWith('//')
    ) {
        return '';
    }

    const noQuery = stripped.split('#')[0].split('?')[0].trim();
    if (!noQuery) return '';
    return noQuery;
}

function extractHtmlRefs(content) {
    const refs = new Set();
    const regexes = [
        /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi,
        /\bsrcset\s*=\s*["']([^"']+)["']/gi
    ];

    for (const regex of regexes) {
        let match;
        while ((match = regex.exec(content)) !== null) {
            const raw = match[1] || '';
            if (regex.source.includes('srcset')) {
                const candidates = raw.split(',').map((item) => item.trim().split(/\s+/)[0]);
                for (const candidate of candidates) {
                    const ref = cleanUrlRef(candidate);
                    if (ref) refs.add(ref);
                }
            } else {
                const ref = cleanUrlRef(raw);
                if (ref) refs.add(ref);
            }
        }
    }

    // Captura imports/fetch dentro de <script> inline para no perder dependencias ES modules.
    const inlineScriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let scriptMatch;
    while ((scriptMatch = inlineScriptRegex.exec(content)) !== null) {
        const scriptBody = scriptMatch[1] || '';
        const scriptRefs = extractJsRefs(scriptBody);
        for (const ref of scriptRefs) {
            refs.add(ref);
        }
    }

    return Array.from(refs);
}

function extractJsRefs(content) {
    const refs = new Set();
    const regexes = [
        /\bimport\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g,
        /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
        /\bfetch\s*\(\s*["']([^"']+)["']\s*\)/g,
        /\bnew\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g
    ];

    for (const regex of regexes) {
        let match;
        while ((match = regex.exec(content)) !== null) {
            const ref = cleanUrlRef(match[1] || '');
            if (!ref) continue;
            if (ref.startsWith('/api/') || ref.startsWith('/export/') || ref.startsWith('/recompute') || ref.startsWith('/save-json') || ref.startsWith('/qa_revision_sync.php')) {
                continue;
            }
            refs.add(ref);
        }
    }

    return Array.from(refs);
}

function extractCssRefs(content) {
    const refs = new Set();
    const regexes = [
        /@import\s+(?:url\()?\s*["']([^"']+)["']\s*\)?/gi,
        /url\(\s*["']?([^"')]+)["']?\s*\)/gi
    ];

    for (const regex of regexes) {
        let match;
        while ((match = regex.exec(content)) !== null) {
            const ref = cleanUrlRef(match[1] || '');
            if (ref) refs.add(ref);
        }
    }

    return Array.from(refs);
}

function resolveLocalReference(fromRelPath, reference) {
    const normalizedRef = toPosix(reference);

    if (normalizedRef.startsWith('/')) {
        return toPosix(normalizedRef.replace(/^\/+/, ''));
    }

    const fromDir = path.posix.dirname(fromRelPath);
    return path.posix.normalize(path.posix.join(fromDir, normalizedRef));
}

function resolveCandidateFiles(relPath) {
    const candidates = [relPath];
    const ext = path.posix.extname(relPath);

    if (!ext) {
        candidates.push(`${relPath}.js`);
        candidates.push(`${relPath}.mjs`);
        candidates.push(`${relPath}.css`);
        candidates.push(`${relPath}.json`);
        candidates.push(path.posix.join(relPath, 'index.js'));
        candidates.push(path.posix.join(relPath, 'index.html'));
    }

    return candidates;
}

function extractRefsByFileType(relPath, content) {
    const ext = path.posix.extname(relPath).toLowerCase();
    if (ext === '.html') return extractHtmlRefs(content);
    if (ext === '.js' || ext === '.mjs') return extractJsRefs(content);
    if (ext === '.css') return extractCssRefs(content);
    return [];
}

function queueDependencies(seedFiles) {
    const queue = [...seedFiles];
    const queued = new Set(seedFiles);
    const visited = new Set();
    const requiredFiles = new Set(seedFiles);

    while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);

        const absCurrent = path.join(rootDir, current);
        if (!exists(absCurrent)) {
            missingReferences.push({ from: 'SEED', ref: current, resolved: current, reason: 'missing-seed' });
            continue;
        }

        const stat = fs.statSync(absCurrent);
        if (!stat.isFile()) continue;

        const content = fs.readFileSync(absCurrent, 'utf8');
        const refs = extractRefsByFileType(current, content);

        if (!dependencyGraph.has(current)) {
            dependencyGraph.set(current, new Set());
        }

        for (const ref of refs) {
            const resolvedBase = resolveLocalReference(current, ref);
            const candidates = resolveCandidateFiles(resolvedBase);

            let selected = null;
            for (const candidate of candidates) {
                const absCandidate = path.join(rootDir, candidate);
                if (exists(absCandidate) && fs.statSync(absCandidate).isFile()) {
                    selected = candidate;
                    break;
                }
            }

            if (!selected) {
                missingReferences.push({
                    from: current,
                    ref,
                    resolved: resolvedBase,
                    reason: 'missing-reference'
                });
                continue;
            }

            const excludedReason = isExcludedByPath(selected);
            if (excludedReason) {
                excludedItems.push({
                    path: selected,
                    reason: excludedReason,
                    source: current
                });
                continue;
            }

            dependencyGraph.get(current).add(selected);
            requiredFiles.add(selected);

            if (!queued.has(selected)) {
                queued.add(selected);
                queue.push(selected);
            }
        }
    }

    return Array.from(requiredFiles).sort((a, b) => a.localeCompare(b));
}

function scanBackendPatterns(relPath, content) {
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        for (const pattern of BACKEND_PATTERNS) {
            pattern.regex.lastIndex = 0;
            if (!pattern.regex.test(line)) continue;

            backendMatches.push({
                file: relPath,
                line: i + 1,
                type: pattern.label,
                excerpt: line.trim().slice(0, 220)
            });
        }
    }
}

function ensureCleanDeployDir() {
    fs.rmSync(deployDir, { recursive: true, force: true });
    fs.mkdirSync(deployDir, { recursive: true });
}

function copyFileToDeploy(relPath) {
    const src = path.join(rootDir, relPath);
    const dst = path.join(deployDir, relPath);

    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copiedFiles.push(relPath);

    const ext = path.extname(relPath).toLowerCase();
    if (ext === '.html' || ext === '.js' || ext === '.mjs' || ext === '.css') {
        const content = fs.readFileSync(src, 'utf8');
        scanBackendPatterns(relPath, content);
    }
}

function uniqueSorted(items, keyFn) {
    const map = new Map();
    for (const item of items) {
        const key = keyFn(item);
        if (!map.has(key)) {
            map.set(key, item);
        }
    }
    return Array.from(map.values()).sort((a, b) => keyFn(a).localeCompare(keyFn(b)));
}

function buildReverseDependencyMap(seedPages) {
    const reverse = new Map();

    for (const seed of seedPages) {
        reverse.set(seed, new Set([seed]));
    }

    const queue = [...seedPages];
    const visited = new Set();

    while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);

        const children = dependencyGraph.get(current) || new Set();
        const currentSeeds = reverse.get(current) || new Set();

        for (const child of children) {
            if (!reverse.has(child)) reverse.set(child, new Set());
            const set = reverse.get(child);
            let changed = false;
            for (const seed of currentSeeds) {
                if (!set.has(seed)) {
                    set.add(seed);
                    changed = true;
                }
            }
            if (changed) {
                queue.push(child);
            }
        }
    }

    return reverse;
}

function groupBackendByPage(seedPages) {
    const reverseMap = buildReverseDependencyMap(seedPages);
    const grouped = new Map();

    for (const match of backendMatches) {
        const seeds = reverseMap.get(match.file);
        if (!seeds || seeds.size === 0) continue;

        for (const seed of seeds) {
            if (!grouped.has(seed)) grouped.set(seed, []);
            grouped.get(seed).push(match);
        }
    }

    return grouped;
}

function buildReport(seedPages) {
    const copied = [...copiedFiles].sort((a, b) => a.localeCompare(b));
    const excluded = uniqueSorted(excludedItems, (item) => `${item.path}|${item.reason}|${item.source}`);
    const missing = uniqueSorted(missingReferences, (item) => `${item.from}|${item.ref}|${item.resolved}|${item.reason}`);
    const backend = uniqueSorted(backendMatches, (item) => `${item.file}|${item.line}|${item.type}|${item.excerpt}`);

    const backendByPage = groupBackendByPage(seedPages);

    const lines = [];
    lines.push('# deploy_ftp report');
    lines.push('');
    lines.push(`- Fecha: ${new Date().toISOString()}`);
    lines.push(`- Carpeta destino: deploy_ftp/`);
    lines.push(`- Seed pages auditadas: ${seedPages.length}`);
    lines.push(`- Archivos copiados: ${copied.length}`);
    lines.push(`- Excluidos registrados: ${excluded.length}`);
    lines.push(`- Referencias faltantes: ${missing.length}`);
    lines.push(`- Referencias backend detectadas: ${backend.length}`);
    lines.push('');

    lines.push('## Seed pages auditadas');
    lines.push('');
    for (const page of seedPages) {
        lines.push(`- ${page}`);
    }
    lines.push('');

    lines.push('## Archivos copiados');
    lines.push('');
    for (const file of copied) {
        lines.push(`- ${file}`);
    }
    lines.push('');

    lines.push('## Archivos excluidos');
    lines.push('');
    lines.push('### Reglas de exclusion aplicadas');
    lines.push('');
    for (const rule of EXCLUSION_RULE_SUMMARY) {
        lines.push(`- ${rule}`);
    }
    lines.push('');
    lines.push('### Exclusiones detectadas durante auditoria');
    lines.push('');
    if (excluded.length === 0) {
        lines.push('- Ninguno');
    } else {
        for (const item of excluded) {
            lines.push(`- ${item.path} | reason=${item.reason} | source=${item.source}`);
        }
    }
    lines.push('');

    lines.push('## Referencias locales faltantes');
    lines.push('');
    if (missing.length === 0) {
        lines.push('- Ninguna');
    } else {
        for (const item of missing) {
            lines.push(`- from=${item.from} ref=${item.ref} resolved=${item.resolved} reason=${item.reason}`);
        }
    }
    lines.push('');

    lines.push('## Rutas problemáticas backend detectadas');
    lines.push('');
    if (backend.length === 0) {
        lines.push('- Ninguna');
    } else {
        for (const item of backend) {
            lines.push(`- ${item.file}:${item.line} | ${item.type} | ${item.excerpt}`);
        }
    }
    lines.push('');

    lines.push('## Dependencias backend/datos dinámicos por página');
    lines.push('');
    if (backendByPage.size === 0) {
        lines.push('- Ninguna página con dependencias detectadas');
    } else {
        const pages = Array.from(backendByPage.keys()).sort((a, b) => a.localeCompare(b));
        for (const page of pages) {
            const matches = uniqueSorted(backendByPage.get(page), (item) => `${item.file}|${item.line}|${item.type}|${item.excerpt}`);
            const typeSet = new Set(matches.map((m) => m.type));
            lines.push(`- ${page}`);
            lines.push(`  - total_refs=${matches.length}`);
            lines.push(`  - tipos=${Array.from(typeSet).sort((a, b) => a.localeCompare(b)).join(', ')}`);
            for (const m of matches.slice(0, 12)) {
                lines.push(`  - ${m.file}:${m.line} | ${m.type}`);
            }
            if (matches.length > 12) {
                lines.push(`  - ... ${matches.length - 12} mas`);
            }
        }
    }
    lines.push('');

    lines.push('## Notas');
    lines.push('');
    lines.push('- engine_*.json se excluye por defecto en este build FTP.');
    lines.push('- Endpoints backend (localhost/api/export/save/recompute/qa_revision_sync.php) no funcionaran en hosting FTP estatico sin backend adicional.');

    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
}

function main() {
    const seedPages = gatherRootHtmlSeeds();
    const forcedStaticFiles = ['version.json'].filter((relPath) => exists(path.join(rootDir, relPath)));
    const requiredFiles = queueDependencies([...seedPages, ...forcedStaticFiles]);

    ensureCleanDeployDir();

    for (const relPath of requiredFiles) {
        const absPath = path.join(rootDir, relPath);
        if (!exists(absPath)) continue;

        const excludedReason = isExcludedByPath(relPath);
        if (excludedReason) {
            excludedItems.push({ path: relPath, reason: excludedReason, source: 'required-files' });
            continue;
        }

        copyFileToDeploy(relPath);
    }

    buildReport(seedPages);

    console.log(`Seed pages: ${seedPages.length}`);
    console.log(`Required files resolved: ${requiredFiles.length}`);
    console.log(`Copied files: ${copiedFiles.length}`);
    console.log(`Excluded records: ${excludedItems.length}`);
    console.log(`Missing refs: ${missingReferences.length}`);
    console.log(`Backend refs: ${backendMatches.length}`);
    console.log('Deploy folder rebuilt: deploy_ftp/');
    console.log('Report generated: deploy_ftp_report.md');
}

main();
