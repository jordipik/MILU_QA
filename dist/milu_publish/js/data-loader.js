/**
 * Carga de datos: archivos engine_*.json y ficheros auxiliares.
 */

import { state } from './state.js';
import { inferEngineModelFromFileName, normalizeEngineModel } from './helpers.js';

const ENGINE_JSON_FILES = [
    'engine_12V4000M40A.json',
    'engine_12V4000M53.json',
    'engine_12V4000M70.json',
    'engine_16V4000M61.json',
    'engine_16V4000M73.json',
    'engine_16V4000M73L.json',
    'engine_16V4000M90.json',
    'engine_20V4000M93.json',
    'engine_20V4000M93L.json'
];

const saveBackendState = {
    writable: null,
    checkedAt: 0,
    url: '',
    error: ''
};

export function getEngineJsonFiles() {
    return [...ENGINE_JSON_FILES];
}

export function getSaveBackendState() {
    return { ...saveBackendState };
}

export function setSaveBackendState(writable, options = {}) {
    const normalizedWritable = writable === null ? null : Boolean(writable);
    saveBackendState.writable = normalizedWritable;
    saveBackendState.checkedAt = Date.now();
    saveBackendState.url = String(options.url || saveBackendState.url || '').trim();
    saveBackendState.error = String(options.error || '').trim();
}

export function getResourceUrl(resourceName) {
    return new URL(resourceName, new URL('.', window.location.href)).href;
}

export async function fetchJsonSafe(resourceName) {
    const url = getResourceUrl(resourceName);
    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        if (resourceName.endsWith('.gz')) {
            const buffer = await response.arrayBuffer();
            const decompressed = window.pako.ungzip(buffer, { to: 'string' });
            return JSON.parse(decompressed);
        }
        return await response.json();
    } catch (error) {
        throw new Error(`No se pudo cargar ${resourceName} (ruta ${url}): ${error.message}`);
    }
}

export async function loadPartitionedEngineData() {
    let loadedFileCount = 0;
    const chunks = await Promise.all(ENGINE_JSON_FILES.map(async fileName => {
        try {
            const data = await fetchJsonSafe(fileName);
            if (!Array.isArray(data)) {
                console.warn(`Se ignora ${fileName}: no contiene un array`);
                return [];
            }
            loadedFileCount += 1;
            const fallbackEngineModel = inferEngineModelFromFileName(fileName);
            return data.map(row => normalizeEngineModel(row, fallbackEngineModel));
        } catch (error) {
            console.warn(`No se pudo cargar ${fileName}:`, error);
            return [];
        }
    }));
    const merged = chunks.flat();
    if (!merged.length) {
        throw new Error(`No se pudo cargar ningún archivo engine_*.json (${ENGINE_JSON_FILES.length} intentados)`);
    }
    state.mainDataSourceLabel = `engine_*.json (${loadedFileCount}/${ENGINE_JSON_FILES.length})`;
    return merged;
}

export async function loadEngineDataByFileName(fileName) {
    const targetFile = String(fileName ?? '').trim();
    if (!targetFile) {
        throw new Error('No se indico ningun archivo engine_*.json para cargar.');
    }

    if (!ENGINE_JSON_FILES.includes(targetFile)) {
        throw new Error(`Archivo engine no soportado: ${targetFile}`);
    }

    const data = await fetchJsonSafe(targetFile);
    if (!Array.isArray(data)) {
        throw new Error(`Se ignora ${targetFile}: no contiene un array`);
    }

    const fallbackEngineModel = inferEngineModelFromFileName(targetFile);
    const normalizedRows = data.map(row => normalizeEngineModel(row, fallbackEngineModel));
    state.mainDataSourceLabel = targetFile;
    return normalizedRows;
}

export async function loadFirstEngineData() {
    return loadEngineDataByFileName(ENGINE_JSON_FILES[0]);
}

/**
 * Guarda un cambio de celda en el servidor (POST /save-json).
 * @param {string} file - Nombre del archivo engine_*.json
 * @param {string|number} id - ID del registro
 * @param {string} col - Clave del campo a modificar
 * @param {*} value - Nuevo valor
 */
export async function saveCellToServer(file, id, col, value) {
    if (saveBackendState.writable === false) {
        const detail = saveBackendState.error
            ? ` (${saveBackendState.error})`
            : '';
        throw new Error(`Guardado desactivado: backend no disponible${detail}.`);
    }

    const candidateUrls = getSaveBackendCandidateUrls();

    let lastError = null;
    let lastTriedUrl = '';
    for (const url of candidateUrls) {
        lastTriedUrl = url;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file, id: String(id), col, value })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                const message = data.error || `HTTP ${response.status}`;
                lastError = new Error(`Guardado no disponible en ${url}: ${message}`);
                continue;
            }

            setSaveBackendState(true, { url, error: '' });
            return await response.json();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    const lastMessage = String(lastError?.message || '').trim();
    const isNetworkError = /failed to fetch|networkerror|load failed|fetch/i.test(lastMessage);
    if (isNetworkError || !lastMessage) {
        setSaveBackendState(false, {
            url: lastTriedUrl,
            error: lastMessage || 'sin respuesta del backend'
        });
        throw new Error(
            `No se pudo conectar con el backend de guardado (${lastTriedUrl || 'sin URL'}). `
            + 'Comprueba que la ruta de guardado este disponible (save-json.php en produccion o server.js en local).'
        );
    }
    setSaveBackendState(false, {
        url: lastTriedUrl,
        error: lastMessage
    });
    throw new Error(lastMessage);
}

function getSaveBackendCandidateUrls() {
    const currentOrigin = window.location.origin && window.location.origin !== 'null'
        ? window.location.origin
        : '';
    const currentPathname = String(window.location.pathname || '/');
    const currentHostname = String(window.location.hostname || '').trim();
    const isLocalhost = currentHostname === 'localhost' || currentHostname === '127.0.0.1' || currentHostname === '';

    const phpCandidate = new URL('save-json.php', new URL('.', window.location.href)).href;
    const sameOriginPhpCandidate = currentOrigin ? `${currentOrigin}/save-json.php` : '/save-json.php';
    const miluPhpCandidate = currentOrigin ? `${currentOrigin}/milu/save-json.php` : '/milu/save-json.php';
    const pathnameHasMilu = /(^|\/)milu(\/|$)/i.test(currentPathname);
    const isMiluSubdomain = /^milu\./i.test(currentHostname);
    const isAlentioHost = /(^|\.)alentio\.es$/i.test(currentHostname);
    const apexHost = isMiluSubdomain ? currentHostname.replace(/^milu\./i, '') : currentHostname;
    const apexOrigin = apexHost ? `${window.location.protocol}//${apexHost}` : '';
    const apexMiluPhpCandidate = apexOrigin ? `${apexOrigin}/milu/save-json.php` : '';
    const miluSubdomainPhpCandidate = currentHostname
        ? `${window.location.protocol}//milu.${apexHost || currentHostname}/save-json.php`
        : '';

    if (isLocalhost) {
        // En local: probar Express en puerto 3000
        const localPortCandidate = currentHostname ? `http://${currentHostname}:3000/save-json` : '';
        const sameOriginCandidate = currentOrigin ? `${currentOrigin}/save-json` : '/save-json';
        return [
            localPortCandidate,
            'http://localhost:3000/save-json',
            sameOriginCandidate,
            phpCandidate
        ].filter(Boolean).filter((url, index, arr) => arr.indexOf(url) === index);
    } else {
        // En servidor remoto (Arsys, etc.): usar save-json.php (sin Express)
        const domainPinnedCandidates = isAlentioHost
            ? isMiluSubdomain
                ? [
                    'https://milu.alentio.es/save-json.php',
                    'https://alentio.es/milu/save-json.php'
                ]
                : [
                    'https://alentio.es/milu/save-json.php',
                    'https://milu.alentio.es/save-json.php'
                ]
            : [];

        return [
            ...domainPinnedCandidates,
            phpCandidate,
            pathnameHasMilu ? miluPhpCandidate : '',
            sameOriginPhpCandidate,
            miluPhpCandidate,
            apexMiluPhpCandidate,
            miluSubdomainPhpCandidate
        ].filter(Boolean).filter((url, index, arr) => arr.indexOf(url) === index);
    }
}

export async function checkSaveBackendConnection() {
    const saveUrls = getSaveBackendCandidateUrls();
    let lastError = null;
    for (const saveUrl of saveUrls) {
        // Para el endpoint PHP, GET sobre el mismo archivo devuelve {"ok":true} (health check integrado).
        // Para Express, se sustituye /save-json por /health.
        const healthUrl = saveUrl.endsWith('.php')
            ? saveUrl
            : saveUrl.replace(/\/save-json$/i, '/health');
        try {
            const response = await fetch(healthUrl, {
                method: 'GET',
                cache: 'no-store'
            });
            if (response.ok) {
                const payload = { ok: true, url: saveUrl };
                setSaveBackendState(true, { url: saveUrl, error: '' });
                return payload;
            }
            lastError = new Error(`HTTP ${response.status}`);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    const payload = {
        ok: false,
        url: saveUrls[0] || '',
        error: String(lastError?.message || 'sin respuesta')
    };
    setSaveBackendState(false, {
        url: payload.url,
        error: payload.error
    });
    return payload;
}
