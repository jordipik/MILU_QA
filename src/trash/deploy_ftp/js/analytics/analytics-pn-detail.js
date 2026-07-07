import { analyticsApi, setStatus, renderError, buildTable, engineLink, fmtInt } from './analytics-api.js';

const sku = new URLSearchParams(location.search).get('sku') || '';
const title = document.getElementById('title');
const status = document.getElementById('status');
const summary = document.getElementById('summary');
const rowsEl = document.getElementById('rows');

title.firstChild.textContent = `Detalle PN: ${sku} `;

if (!sku) {
    setStatus(status, 'Falta ?sku=', 'error');
} else {
    load();
}

async function load() {
    setStatus(status, 'Cargando…', 'loading');
    const r = await analyticsApi.pnDetail(sku);
    if (!r.ok) { renderError(summary, r); setStatus(status, 'Error', 'error'); return; }
    const d = r.data;
    setStatus(status, d.found ? 'OK' : 'no encontrado', d.found ? 'ok' : 'warn');

    const sumRows = [
        ['PN final', d.pn_final],
        ['Encontrado', d.found ? 'sí' : 'no'],
        ['Motores', `${d.engines_count} (${(d.engines || []).join(', ')})`],
        ['Filas totales', fmtInt(d.rows_count)],
        ['Decisión QA', d.summary?.qa_decision ?? '—'],
        ['Export type', d.summary?.export_type ?? '—'],
        ['¿Tiene gesa?', d.summary?.has_gesa ? 'sí' : 'no'],
        ['¿Tiene sust?', d.summary?.has_sust ? 'sí' : 'no'],
        ['¿Tiene imagen?', d.summary?.has_image ? 'sí' : 'no'],
        ['¿Tiene esquema?', d.summary?.has_schema ? 'sí' : 'no'],
        ['Designations distintas', (d.distinct_designations || []).join(' | ').slice(0, 200) || '—'],
        ['Sust distintas', (d.distinct_sust || []).join(' | ') || '—'],
        ['Medidas distintas', (d.distinct_measures || []).join(' | ') || '—'],
        ['Pesos distintos', (d.distinct_weights || []).join(' | ') || '—'],
    ];
    summary.innerHTML = '';
    summary.appendChild(buildTable(['Campo', 'Valor'], sumRows));

    rowsEl.innerHTML = '';
    const rows = (d.rows || []).map((r2) => [
        r2.source_row_id,
        engineLink(r2.engine_model),
        r2.designation_final ?? '',
        r2.qa_revision_estado ?? '',
        r2.qa_revision_accion ?? '',
        r2.sust_hierarchie ?? '',
        r2.measure_final ?? '',
        r2.weight_final ?? '',
        r2.has_image ? 'sí' : 'no',
        r2.has_placeholder ? 'sí' : 'no',
        r2.has_schema ? 'sí' : 'no',
    ]);
    rowsEl.appendChild(buildTable(
        ['row_id', 'motor', 'designation', 'estado', 'acción', 'sust', 'medida', 'peso', 'img', 'placeholder', 'esquema'],
        rows,
    ));
}
