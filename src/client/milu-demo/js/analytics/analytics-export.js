import { analyticsApi, buildKpi, buildTable, fmtInt, renderError, setStatus } from './analytics-api.js';

async function init() {
    const status = document.getElementById('status');
    const kpis = document.getElementById('kpis');
    const reasons = document.getElementById('top-reasons');
    const engines = document.getElementById('top-engines');
    setStatus(status, 'Cargando…', 'loading');

    const r = await analyticsApi.export();
    if (!r.ok) { renderError(kpis, r); setStatus(status, 'Error', 'error'); return; }
    const d = r.data;

    kpis.innerHTML = '';
    const cards = [
        buildKpi('Importables', d.import_candidates),
        buildKpi('Descartables', d.discard_candidates),
        buildKpi('Pendientes', d.pending_review),
        buildKpi('PN new', d.new_count),
        buildKpi('PN superseded', d.superseded_count),
        buildKpi('PN mixed', d.mixed_count),
    ];
    for (const c of cards) kpis.appendChild(c);

    reasons.innerHTML = '';
    reasons.appendChild(buildTable(
        ['Estado', 'Acción', 'Filas', 'PN únicos'],
        d.top_reasons.map(x => [x.estado, x.accion, fmtInt(x.rows_count), fmtInt(x.pns_count)]),
    ));

    engines.innerHTML = '';
    engines.appendChild(buildTable(
        ['Motor', 'PN pendientes'],
        d.top_engines_pending.map(x => [x.engine_model, fmtInt(x.pns_pending)]),
    ));

    setStatus(status, 'OK', 'ok');
}

document.addEventListener('DOMContentLoaded', init);
