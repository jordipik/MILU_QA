import { analyticsApi, buildKpi, buildTable, fmtInt, renderError, setStatus, engineLink } from './analytics-api.js';

async function init() {
    const status = document.getElementById('status');
    const kpis = document.getElementById('kpis');
    const enginesBox = document.getElementById('engines');
    setStatus(status, 'Cargando KPIs…', 'loading');

    const [ovRes, enRes] = await Promise.all([analyticsApi.overview(), analyticsApi.engines()]);
    if (!ovRes.ok) { renderError(kpis, ovRes); setStatus(status, 'Error', 'error'); return; }
    const d = ovRes.data;

    const cards = [
        buildKpi('Filas totales', d.total_rows),
        buildKpi('PN únicos', d.unique_pn),
        buildKpi('Motores', d.total_engines),
        buildKpi('QA OK', d.qa_ok, `${((d.qa_ok / d.total_rows) * 100).toFixed(1)}%`),
        buildKpi('QA pendiente', d.qa_pending),
        buildKpi('Importar', d.qa_importar),
        buildKpi('Revisar', d.qa_revisar),
        buildKpi('Eliminar', d.qa_eliminar),
        buildKpi('Copia', d.qa_copia),
        buildKpi('Con imagen', d.rows_with_images),
        buildKpi('Con esquema', d.rows_with_schema),
        buildKpi('Con placeholder', d.rows_with_placeholder),
        buildKpi('Sin imagen', d.rows_without_images),
        buildKpi('Sin esquema', d.rows_without_schema),
        buildKpi('PN new', d.new_count),
        buildKpi('PN superseded', d.superseded_count),
    ];
    kpis.innerHTML = '';
    for (const c of cards) kpis.appendChild(c);

    document.getElementById('generated').textContent = 'Generado: ' + (d.generated_at || '');

    if (!enRes.ok) { renderError(enginesBox, enRes); }
    else {
        const rows = enRes.data.engines.map(e => [
            engineLink(e.engine_model),
            fmtInt(e.row_count),
            fmtInt(e.unique_pn),
            fmtInt(e.qa_ok),
            fmtInt(e.qa_pending),
            fmtInt(e.without_images),
            fmtInt(e.without_schema),
            fmtInt(e.placeholders),
        ]);
        enginesBox.innerHTML = '';
        enginesBox.appendChild(buildTable(
            ['Motor', 'Filas', 'PN únicos', 'QA OK', 'QA pendiente', 'Sin imagen', 'Sin esquema', 'Placeholders'],
            rows,
        ));
    }
    setStatus(status, 'OK', 'ok');
}

document.addEventListener('DOMContentLoaded', init);
