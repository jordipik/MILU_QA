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
            validateRowsHaveId(data, fileName);
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
    validateRowsHaveId(data, targetFile);

    const fallbackEngineModel = inferEngineModelFromFileName(targetFile);
    const normalizedRows = data.map(row => normalizeEngineModel(row, fallbackEngineModel));
    state.mainDataSourceLabel = targetFile;
    return normalizedRows;
}

function validateRowsHaveId(rows, fileName) {
    const missingIndexes = [];
    rows.forEach((row, index) => {
        const id = String(row?.ID ?? '').trim();
        if (!id) missingIndexes.push(index + 1);
    });

    if (!missingIndexes.length) return;

    const sample = missingIndexes.slice(0, 10).join(', ');
    const extra = missingIndexes.length > 10 ? ` (+${missingIndexes.length - 10} mas)` : '';
    throw new Error(
        `El archivo ${fileName} contiene filas sin ID. `
        + `Indices (1-based): ${sample}${extra}.`
    );
}

export async function loadFirstEngineData() {
    return loadEngineDataByFileName(ENGINE_JSON_FILES[0]);
}

/**
 * AR-1: catalogo de motores con metadatos (sin payload completo).
 * Fuente: GET /engines del backend Express.
 * Devuelve: { engines: [{file, engine_model, rowCount, fileSize, mtimeMs}], totals }
 */
export async function fetchEngineCatalog() {
    const url = getResourceUrl('engines');
    try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload || !Array.isArray(payload.engines)) {
            throw new Error('Respuesta /engines invalida');
        }
        const engines = payload.engines.filter(item => item && typeof item.file === 'string');
        const totals = payload.totals && typeof payload.totals === 'object'
            ? payload.totals
            : engines.reduce((acc, item) => {
                acc.rowCount += Number(item.rowCount || 0);
                acc.fileSize += Number(item.fileSize || 0);
                return acc;
            }, { rowCount: 0, fileSize: 0 });
        state.engineCatalog = engines;
        return { engines, totals };
    } catch (error) {
        // Fallback: si /engines no existe, sintetizamos catalogo minimo desde la lista local.
        const engines = ENGINE_JSON_FILES.map(file => ({
            file,
            engine_model: inferEngineModelFromFileName(file),
            rowCount: null,
            fileSize: null,
            mtimeMs: null
        }));
        state.engineCatalog = engines;
        throw new Error(`No se pudo obtener /engines: ${error.message}`);
    }
}

/**
 * AR-1: carga selectiva de motores. Sustituto incremental de loadPartitionedEngineData.
 * @param {string[]} fileNames Subconjunto de ENGINE_JSON_FILES a cargar.
 * @param {object} [options]
 * @param {boolean} [options.append=false] Si true, fusiona con los motores ya cargados; si false, reemplaza.
 * @returns {Promise<Array>} Filas (las nuevas + las previas si append).
 */
export async function loadEnginesByFileNames(fileNames, options = {}) {
    const { append = false } = options;
    const targets = (Array.isArray(fileNames) ? fileNames : [])
        .map(name => String(name || '').trim())
        .filter(name => ENGINE_JSON_FILES.includes(name));
    if (!targets.length) {
        throw new Error('loadEnginesByFileNames: no se indico ningun archivo valido.');
    }

    const previousLoaded = state.loadedEngineFiles instanceof Set
        ? state.loadedEngineFiles
        : new Set();
    const toFetch = append
        ? targets.filter(file => !previousLoaded.has(file))
        : targets;

    let loadedFileCount = 0;
    const chunks = await Promise.all(toFetch.map(async (fileName) => {
        try {
            const data = await fetchJsonSafe(fileName);
            if (!Array.isArray(data)) {
                console.warn(`Se ignora ${fileName}: no contiene un array`);
                return { fileName, rows: [] };
            }
            validateRowsHaveId(data, fileName);
            loadedFileCount += 1;
            const fallbackEngineModel = inferEngineModelFromFileName(fileName);
            return {
                fileName,
                rows: data.map(row => {
                    const normalized = normalizeEngineModel(row, fallbackEngineModel);
                    // Marca runtime no persistida para atribuir filas a su engine_*.json origen.
                    if (normalized && typeof normalized === 'object') {
                        normalized.__engine_file = fileName;
                    }
                    return normalized;
                })
            };
        } catch (error) {
            console.warn(`No se pudo cargar ${fileName}:`, error);
            return { fileName, rows: [] };
        }
    }));

    const nextLoaded = append ? new Set(previousLoaded) : new Set();
    chunks.forEach(({ fileName, rows }) => {
        if (rows.length) nextLoaded.add(fileName);
    });
    if (append) {
        // Mantenemos los previos que no estaban en targets si append
        previousLoaded.forEach(file => nextLoaded.add(file));
    }
    state.loadedEngineFiles = nextLoaded;

    const newRows = chunks.flatMap(chunk => chunk.rows);
    let mergedRows;
    if (append && Array.isArray(state.allData) && state.allData.length) {
        // Filtramos del estado anterior solo las filas de motores que NO se reemplazaron
        const replacedFiles = new Set(toFetch);
        const kept = state.allData.filter(row => {
            const file = String(row?.__engine_file || '').trim();
            // Si no podemos atribuir motor, se mantiene
            if (!file) return true;
            return !replacedFiles.has(file);
        });
        mergedRows = kept.concat(newRows);
    } else {
        mergedRows = newRows;
    }

    state.mainDataSourceLabel = `engine_*.json (${nextLoaded.size}/${ENGINE_JSON_FILES.length})`;
    return mergedRows;
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
    setSaveBackendState(true, {
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
    const normalizedHostname = currentHostname.toLowerCase();
    const isAlentioRoot = normalizedHostname === 'alentio.es';
    const isAlentioSubdomain = normalizedHostname.endsWith('.alentio.es');
    const isMiluSubdomain = normalizedHostname === 'milu.alentio.es';

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
        // En alentio.es la app vive bajo /milu/, por lo que /save-json.php en raiz da 404.
        if (isAlentioRoot) {
            return [
                pathnameHasMilu ? phpCandidate : '',
                miluPhpCandidate,
                'https://alentio.es/milu/save-json.php'
            ].filter(Boolean).filter((url, index, arr) => arr.indexOf(url) === index);
        }

        if (isMiluSubdomain) {
            return [
                sameOriginPhpCandidate,
                phpCandidate,
                'https://milu.alentio.es/save-json.php'
            ].filter(Boolean).filter((url, index, arr) => arr.indexOf(url) === index);
        }

        if (isAlentioSubdomain) {
            return [
                sameOriginPhpCandidate,
                phpCandidate
            ].filter(Boolean).filter((url, index, arr) => arr.indexOf(url) === index);
        }

        return [
            pathnameHasMilu ? phpCandidate : '',
            miluPhpCandidate,
            phpCandidate,
            sameOriginPhpCandidate
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
