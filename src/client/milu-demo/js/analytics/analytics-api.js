// MILU — analytics-api.js
// Pequeña fachada fetch contra /db/analytics/*. Todas las funciones
// devuelven {ok, data?, error?} y nunca lanzan. Sin dependencias.

const BASE = '/db/analytics';

async function getJson(path) {
    try {
        const res = await fetch(`${BASE}${path}`, { headers: { 'Accept': 'application/json' } });
        const text = await res.text();
        let body = null;
        try { body = JSON.parse(text); } catch { /* */ }
        if (!res.ok) {
            return { ok: false, status: res.status, error: body?.error || 'HTTP_ERROR', message: body?.message || text.slice(0, 200) };
        }
        return { ok: true, status: res.status, data: body };
    } catch (err) {
        return { ok: false, status: 0, error: 'NETWORK_ERROR', message: String(err && err.message || err) };
    }
}

export const analyticsApi = {
    overview: () => getJson('/overview'),
    engines: () => getJson('/engines'),
    images: () => getJson('/images'),
    qa: () => getJson('/qa'),
    pnConflicts: () => getJson('/pn-conflicts'),
    export: () => getJson('/export'),
    // Fase H
    cacheStats: () => getJson('/cache'),
    engineDetail: (engine, opts = {}) =>
        getJson(`/engine/${encodeURIComponent(engine)}?limit=${opts.limit ?? 100}&offset=${opts.offset ?? 0}`),
    pnDetail: (sku) => getJson(`/pn/${encodeURIComponent(sku)}`),
    qaPending: (opts = {}) => getJson(`/qa/pending?limit=${opts.limit ?? 100}&offset=${opts.offset ?? 0}`),
    imagesMissing: (opts = {}) => getJson(`/images/missing?limit=${opts.limit ?? 100}&offset=${opts.offset ?? 0}`),
    imagesPlaceholders: (opts = {}) => getJson(`/images/placeholders?limit=${opts.limit ?? 100}&offset=${opts.offset ?? 0}`),
    exportPending: (opts = {}) => getJson(`/export/pending?limit=${opts.limit ?? 100}&offset=${opts.offset ?? 0}`),
    search: (q, opts = {}) => getJson(`/search?q=${encodeURIComponent(q)}&limit=${opts.limit ?? 50}&offset=${opts.offset ?? 0}`),
    csvUrl: (view) => `${BASE}/export-csv/${encodeURIComponent(view)}`,
};

// Utilidades de formato compartidas por las páginas.
export function fmtInt(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
    return n.toLocaleString('es-ES');
}

export function fmtPct(num, total) {
    if (!total || !Number.isFinite(num)) return '—';
    return ((num / total) * 100).toFixed(1) + '%';
}

export function setStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'analytics-status' + (kind ? ' analytics-status--' + kind : '');
}

export function renderError(container, result) {
    if (!container) return;
    container.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'analytics-error';
    div.textContent = `Error: ${result.error || 'desconocido'} — ${result.message || ''}`;
    container.appendChild(div);
}

export function buildKpi(label, value, sub) {
    const card = document.createElement('div');
    card.className = 'kpi-card';
    const v = document.createElement('div');
    v.className = 'kpi-value';
    v.textContent = (typeof value === 'number') ? fmtInt(value) : (value ?? '—');
    const l = document.createElement('div');
    l.className = 'kpi-label';
    l.textContent = label;
    card.appendChild(v);
    card.appendChild(l);
    if (sub) {
        const s = document.createElement('div');
        s.className = 'kpi-sub';
        s.textContent = sub;
        card.appendChild(s);
    }
    return card;
}

export function buildTable(headers, rows) {
    const t = document.createElement('table');
    t.className = 'analytics-table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    for (const h of headers) {
        const th = document.createElement('th');
        th.textContent = h;
        trh.appendChild(th);
    }
    thead.appendChild(trh);
    t.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const r of rows) {
        const tr = document.createElement('tr');
        for (const cell of r) {
            const td = document.createElement('td');
            if (cell instanceof Node) td.appendChild(cell);
            else td.textContent = (cell === null || cell === undefined) ? '' : String(cell);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    t.appendChild(tbody);
    return t;
}

// Helpers de navegación (Fase H).
export function pnLink(pn) {
    const a = document.createElement('a');
    a.href = `analytics_pn_detail.html?sku=${encodeURIComponent(pn)}`;
    a.textContent = pn;
    a.className = 'analytics-link';
    return a;
}

export function engineLink(engineModel) {
    const a = document.createElement('a');
    a.href = `analytics_engine_detail.html?engine=${encodeURIComponent(engineModel)}`;
    a.textContent = engineModel;
    a.className = 'analytics-link';
    return a;
}

export function csvDownloadLink(view, label) {
    const a = document.createElement('a');
    a.href = `/db/analytics/export-csv/${encodeURIComponent(view)}`;
    a.textContent = label || `Descargar CSV (${view})`;
    a.className = 'analytics-link analytics-csv-link';
    return a;
}
