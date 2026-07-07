import { analyticsApi, buildKpi, buildTable, fmtInt, renderError, setStatus, pnLink, engineLink } from './analytics-api.js';

async function init() {
    const status = document.getElementById('status');
    const estado = document.getElementById('by-estado');
    const accion = document.getElementById('by-accion');
    const combos = document.getElementById('combinations');
    const conflicts = document.getElementById('pn-conflicts');
    const pending = document.getElementById('top-engines-pending');
    const ambig = document.getElementById('ambiguous');
    setStatus(status, 'Cargando…', 'loading');

    const r = await analyticsApi.qa();
    if (!r.ok) { renderError(estado, r); setStatus(status, 'Error', 'error'); return; }
    const d = r.data;

    estado.innerHTML = '';
    estado.appendChild(buildTable(
        ['Estado', 'Filas'],
        d.by_estado.map(x => [x.value, fmtInt(x.count)]),
    ));

    accion.innerHTML = '';
    accion.appendChild(buildTable(
        ['Acción', 'Filas'],
        d.by_accion.map(x => [x.value, fmtInt(x.count)]),
    ));

    combos.innerHTML = '';
    combos.appendChild(buildTable(
        ['Estado', 'Acción', 'Filas'],
        d.combinations.map(x => [x.estado, x.accion, fmtInt(x.count)]),
    ));

    conflicts.innerHTML = '';
    conflicts.appendChild(buildTable(
        ['PN', 'Variantes (estado|acción)', 'Filas', 'Motores'],
        d.top_pn_conflicts.map(x => [pnLink(x.pn_final), fmtInt(x.variants), fmtInt(x.rows_count), fmtInt(x.engines_count)]),
    ));

    pending.innerHTML = '';
    pending.appendChild(buildTable(
        ['Motor', 'Filas pendientes'],
        d.top_engines_pending.map(x => [engineLink(x.engine_model), fmtInt(x.qa_pending)]),
    ));

    ambig.innerHTML = '';
    const cards = [
        buildKpi('OK + revisar', d.ambiguous.ok_revisar),
        buildKpi('Pendiente + importar', d.ambiguous.pending_importar),
        buildKpi('OK + eliminar', d.ambiguous.ok_eliminar),
        buildKpi('Pendiente + acción OK', d.ambiguous.pending_accion_ok),
    ];
    for (const c of cards) ambig.appendChild(c);

    setStatus(status, 'OK', 'ok');
}

document.addEventListener('DOMContentLoaded', init);
