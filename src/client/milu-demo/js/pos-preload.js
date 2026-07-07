/**
 * Precarga de imágenes de posición/círculo para la fila visible.
 */

import { getPosSchemasForRow } from './schemas.js';
import { state } from './state.js';

const POS_PRELOAD_CONCURRENCY = 6;
const posCirclePreloadCache = new Set();
const posCirclePreloadQueued = new Set();
const posCirclePreloadQueue = [];
let posCirclePreloadActive = 0;

function getFileNameFromUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw, window.location.href);
        return decodeURIComponent(parsed.pathname.split('/').pop() || '').toLowerCase();
    } catch (_) {
        return decodeURIComponent(raw.replace(/\\/g, '/').split(/[?#]/)[0].split('/').pop() || '').toLowerCase();
    }
}

function pumpPosCirclePreloadQueue() {
    while (posCirclePreloadActive < POS_PRELOAD_CONCURRENCY && posCirclePreloadQueue.length > 0) {
        const src = posCirclePreloadQueue.shift();
        posCirclePreloadQueued.delete(src);
        if (!src || posCirclePreloadCache.has(src)) continue;
        posCirclePreloadActive += 1;
        const img = new Image();
        const finalize = () => {
            posCirclePreloadCache.add(src);
            posCirclePreloadActive = Math.max(0, posCirclePreloadActive - 1);
            pumpPosCirclePreloadQueue();
        };
        img.onload = finalize; img.onerror = finalize; img.decoding = 'async'; img.src = src;
    }
}

function enqueuePosCircleCandidates(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return;
    if (!state.esquemasPosIndexLoaded) return;
    candidates.forEach(src => {
        if (state.esquemasPosIndexLoaded && state.esquemasPosFileSet.size === 0) return;
        if (state.esquemasPosFileSet.size > 0) {
            const fileName = getFileNameFromUrl(src);
            if (!fileName || !state.esquemasPosFileSet.has(fileName)) return;
        }
        if (!src || posCirclePreloadCache.has(src) || posCirclePreloadQueued.has(src)) return;
        posCirclePreloadQueued.add(src); posCirclePreloadQueue.push(src);
    });
    pumpPosCirclePreloadQueue();
}

function preloadVisiblePosCircleImages(rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    const candidates = [];
    rows.forEach(row => {
        getPosSchemasForRow(row).forEach(item => { item.candidates.forEach(path => candidates.push(path)); });
    });
    enqueuePosCircleCandidates(candidates);
}

export function scheduleVisiblePosCirclePreload(rows) {
    const payload = Array.isArray(rows) ? rows.slice() : [];
    if (!payload.length) return;
    const run = () => preloadVisiblePosCircleImages(payload);
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 900 });
    } else {
        setTimeout(run, 80);
    }
}
