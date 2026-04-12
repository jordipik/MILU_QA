/**
 * Carga de datos: archivos engine_*.json y ficheros auxiliares.
 */

import { state } from './state.js';
import { inferEngineModelFromFileName, normalizeEngineModel } from './helpers.js';

const ENGINE_JSON_FILES = [
    'engine_12V4000M40A.json',
    'engine_12V4000M53.json',
    'engine_16V4000M61.json',
    'engine_16V4000M73.json',
    'engine_16V4000M73L.json',
    'engine_16V4000M90.json',
    'engine_20V4000M93.json',
    'engine_20V4000M93L.json'
];

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

/**
 * Guarda un cambio de celda en el servidor (POST /save-json).
 * @param {string} file - Nombre del archivo engine_*.json
 * @param {string|number} id - ID del registro
 * @param {string} col - Clave del campo a modificar
 * @param {*} value - Nuevo valor
 */
export async function saveCellToServer(file, id, col, value) {
    const currentOrigin = window.location.origin && window.location.origin !== 'null'
        ? window.location.origin
        : '';
    const currentHostname = String(window.location.hostname || '').trim();
    const localPortCandidate = currentHostname ? `http://${currentHostname}:3000/save-json` : '';
    const candidateUrls = [
        currentOrigin ? `${currentOrigin}/save-json` : '/save-json',
        localPortCandidate,
        'http://localhost:3000/save-json'
    ].filter((url, index, arr) => arr.indexOf(url) === index);

    let lastError = null;
    for (const url of candidateUrls) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file, id: String(id), col, value })
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                const message = data.error || `HTTP ${response.status}`;
                if (response.status === 404 || response.status === 405) {
                    lastError = new Error(`Endpoint ${url} no disponible: ${message}`);
                    continue;
                }
                throw new Error(message);
            }

            return await response.json();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw new Error(lastError?.message || 'No se pudo conectar con el backend de guardado. Ejecuta server.js en localhost:3000.');
}
