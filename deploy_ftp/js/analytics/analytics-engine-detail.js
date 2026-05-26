import { analyticsApi, setStatus, renderError, buildTable, pnLink, fmtInt } from './analytics-api.js';

const params = new URLSearchParams(location.search);
const engine = params.get('engine') || '';
let offset = Number(params.get('offset')) || 0;
const LIMIT = 100;

const title = document.getElementById('title');
const status = document.getElementById('status');
const statsEl = document.getElementById('stats');
const rowsEl = document.getElementById('rows');
const pagingEl = document.getElementById('paging');

title.firstChild.textContent = `Detalle motor: ${engine} `;

if (!engine) {
    setStatus(status, 'Falta ?engine=', 'error');
} else {
    load();
}

async function load() {
    setStatus(status, 'Cargando…', 'loading');
    const r = await analyticsApi.engineDetail(engine, { limit: LIMIT, offset });
    if (!r.ok) { renderError(statsEl, r); setStatus(status, 'Error', 'error'); return; }
    const d = r.data;
    setStatus(status, d.found ? 'OK' : 'no encontrado', d.found ? 'ok' : 'warn');
    if (!d.found) { statsEl.textContent = 'Motor no encontrado.'; return; }

    const s = d.stats || {};
    statsEl.innerHTML = '';
    statsEl.appendChild(buildTable(['Métrica', 'Valor'], [
        ['Modelo', d.engine.engine_model],
        ['Fichero', d.engine.filename],
        ['Filas totales', fmtInt(s.total_rows)],
        ['PN únicos', fmtInt(s.unique_pn)],
        ['Placeholders', fmtInt(s.placeholders)],
        ['Sin imagen', fmtInt(s.without_images)],
        ['Sin esquema', fmtInt(s.without_schema)],
        ['QA pendiente', fmtInt(s.qa_pending)],
        ['QA ok', fmtInt(s.qa_ok)],
    ]));

    rowsEl.innerHTML = '';
    const rows = (d.rows || []).map((r2) => [
        r2.source_row_id,
        r2.pn_final ? pnLink(r2.pn_final) : '',
        r2.designation_final ?? '',
        r2.qa_revision_estado ?? '',
        r2.qa_revision_accion ?? '',
        r2.sust_hierarchie ?? '',
        r2.has_image ? 'sí' : 'no',
        r2.has_placeholder ? 'sí' : 'no',
        r2.has_schema ? 'sí' : 'no',
    ]);
    rowsEl.appendChild(buildTable(
        ['row_id', 'PN', 'designation', 'estado', 'acción', 'sust', 'img', 'placeholder', 'esquema'],
        rows,
    ));

    pagingEl.innerHTML = '';
    const info = document.createElement('span');
    info.textContent = `offset=${offset} · mostrando ${d.returned} de ${s.total_rows} `;
    pagingEl.appendChild(info);
    if (offset > 0) {
        const prev = document.createElement('button');
        prev.textContent = '← Anterior';
        prev.onclick = () => { offset = Math.max(0, offset - LIMIT); navigate(); };
        pagingEl.appendChild(prev);
    }
    if (offset + d.returned < s.total_rows) {
        const next = document.createElement('button');
        next.textContent = 'Siguiente →';
        next.onclick = () => { offset += LIMIT; navigate(); };
        pagingEl.appendChild(next);
    }
}

function navigate() {
    const p = new URLSearchParams({ engine, offset: String(offset) });
    location.search = '?' + p.toString();
}
