// MILU — Cache TTL en memoria (Fase H.2). Read-only, sin persistencia.
// Uso exclusivo: agregados de la capa /db/analytics/*.

'use strict';

const DEFAULT_TTL_MS = Number(process.env.MILU_ANALYTICS_CACHE_TTL_MS || 30000);

const store = new Map();

function getCached(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
    }
    return entry;
}

function setCached(key, payload, ttlMs) {
    const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
    const now = Date.now();
    store.set(key, { payload, generatedAt: now, expiresAt: now + ttl, ttlMs: ttl });
}

function invalidate(prefix) {
    if (!prefix) { store.clear(); return; }
    for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}

function withCache(key, ttlMs, compute) {
    const hit = getCached(key);
    if (hit) {
        const age = Date.now() - hit.generatedAt;
        return {
            ok: true,
            source: 'sqlite_mirror',
            data: {
                ...hit.payload,
                cached: true,
                generated_at: new Date(hit.generatedAt).toISOString(),
                cache_age_ms: age,
                cache_ttl_ms: hit.ttlMs,
            },
        };
    }
    const result = compute();
    // Sólo cacheamos respuestas OK con `data` objeto.
    if (result && result.ok === true && result.data && typeof result.data === 'object') {
        setCached(key, result.data, ttlMs);
        return {
            ok: true,
            source: 'sqlite_mirror',
            data: {
                ...result.data,
                cached: false,
                generated_at: new Date().toISOString(),
                cache_age_ms: 0,
                cache_ttl_ms: ttlMs ?? DEFAULT_TTL_MS,
            },
        };
    }
    return result;
}

function stats() {
    const entries = [];
    for (const [k, v] of store.entries()) {
        entries.push({
            key: k,
            generated_at: new Date(v.generatedAt).toISOString(),
            age_ms: Date.now() - v.generatedAt,
            expires_in_ms: Math.max(0, v.expiresAt - Date.now()),
            ttl_ms: v.ttlMs,
        });
    }
    return { size: store.size, default_ttl_ms: DEFAULT_TTL_MS, entries };
}

module.exports = {
    DEFAULT_TTL_MS,
    withCache,
    invalidate,
    stats,
};
