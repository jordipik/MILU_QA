import { analyticsApi, buildKpi, buildTable, fmtInt, renderError, setStatus, pnLink } from './analytics-api.js';

async function init() {
    const status = document.getElementById('status');
    const kpis = document.getElementById('kpis');
    const sections = {
        multi_engine: document.getElementById('multi-engine'),
        multi_sust: document.getElementById('multi-sust'),
        multi_designation: document.getElementById('multi-designation'),
        multi_measure: document.getElementById('multi-measure'),
        multi_weight: document.getElementById('multi-weight'),
    };
    setStatus(status, 'Cargando…', 'loading');

    const r = await analyticsApi.pnConflicts();
    if (!r.ok) { renderError(kpis, r); setStatus(status, 'Error', 'error'); return; }
    const d = r.data;

    kpis.innerHTML = '';
    kpis.appendChild(buildKpi('PN en >1 motor', d.summary.multi_engine_total));
    kpis.appendChild(buildKpi('PN con sust_hierarchie variable', d.summary.multi_sust_total));
    kpis.appendChild(buildKpi('PN con designación variable', d.summary.multi_designation_total));
    kpis.appendChild(buildKpi('PN con medida variable', d.summary.multi_measure_total));
    kpis.appendChild(buildKpi('PN con peso variable', d.summary.multi_weight_total));

    sections.multi_engine.innerHTML = '';
    sections.multi_engine.appendChild(buildTable(
        ['PN', 'Motores', 'Apariciones'],
        d.multi_engine.map(x => [pnLink(x.pn_final), fmtInt(x.engines_count), fmtInt(x.occurrences)]),
    ));

    const renderVariants = (host, list) => {
        host.innerHTML = '';
        host.appendChild(buildTable(
            ['PN', 'Variantes', 'Filas'],
            list.map(x => [pnLink(x.pn_final), fmtInt(x.variants), fmtInt(x.rows_count)]),
        ));
    };
    renderVariants(sections.multi_sust, d.multi_sust);
    renderVariants(sections.multi_designation, d.multi_designation);
    renderVariants(sections.multi_measure, d.multi_measure);
    renderVariants(sections.multi_weight, d.multi_weight);

    setStatus(status, 'OK', 'ok');
}

document.addEventListener('DOMContentLoaded', init);
