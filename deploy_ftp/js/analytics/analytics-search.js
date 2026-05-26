import { analyticsApi, setStatus, renderError, buildTable, pnLink, engineLink } from './analytics-api.js';

const form = document.getElementById('search-form');
const qInput = document.getElementById('q');
const limitInput = document.getElementById('limit');
const status = document.getElementById('status');
const meta = document.getElementById('meta');
const results = document.getElementById('results');

// Prefill desde ?q=
const params = new URLSearchParams(location.search);
const initialQ = params.get('q') || '';
if (initialQ) qInput.value = initialQ;

form.addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch();
});

if (initialQ.length >= 2) runSearch();

async function runSearch() {
    const q = qInput.value.trim();
    const limit = Number(limitInput.value) || 50;
    if (q.length < 2) {
        setStatus(status, 'Mínimo 2 caracteres', 'error');
        return;
    }
    setStatus(status, 'Buscando…', 'loading');
    results.innerHTML = '';
    meta.textContent = '';
    const r = await analyticsApi.search(q, { limit });
    if (!r.ok) { renderError(results, r); setStatus(status, 'Error', 'error'); return; }
    const d = r.data;
    setStatus(status, 'OK', 'ok');
    meta.textContent = `q="${d.q}" · total=${d.total} · mostrando ${d.returned} · cached=${!!d.cached}`;
    const rows = (d.results || []).map((row) => [
        pnLink(row.pn_final),
        row.engines_count,
        row.rows_count,
        row.any_image ? 'sí' : 'no',
        (row.designations || '').slice(0, 80),
        (row.sust_hierarchies || '').slice(0, 40),
        row.engines || '',
    ]);
    results.appendChild(buildTable(
        ['PN', 'motores', 'filas', 'imagen', 'designations', 'sust', 'motores (lista)'],
        rows,
    ));
    history.replaceState(null, '', `?q=${encodeURIComponent(q)}`);
}
