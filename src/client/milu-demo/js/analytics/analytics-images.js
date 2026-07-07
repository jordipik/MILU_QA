import { analyticsApi, buildKpi, buildTable, fmtInt, fmtPct, renderError, setStatus, engineLink, csvDownloadLink } from './analytics-api.js';

async function init() {
    const status = document.getElementById('status');
    const kpis = document.getElementById('kpis');
    const noImage = document.getElementById('top-no-image');
    const placeholders = document.getElementById('top-placeholders');
    setStatus(status, 'Cargando…', 'loading');

    const [imgRes, ovRes] = await Promise.all([analyticsApi.images(), analyticsApi.overview()]);
    if (!imgRes.ok) { renderError(kpis, imgRes); setStatus(status, 'Error', 'error'); return; }
    const d = imgRes.data;
    const totalRows = ovRes.ok ? ovRes.data.total_rows : 0;

    const cards = [
        buildKpi('image_refs totales', d.total_image_refs),
        buildKpi('Reales (no-placeholder)', d.real_images),
        buildKpi('Placeholders', d.placeholders),
        buildKpi('Filas con ruta_foto', d.rows_with_ruta_foto, fmtPct(d.rows_with_ruta_foto, totalRows)),
        buildKpi('Filas con ruta_esquemas_pos', d.rows_with_ruta_esquemas_pos, fmtPct(d.rows_with_ruta_esquemas_pos, totalRows)),
        buildKpi('Filas sin ninguna imagen', d.rows_without_any_image, fmtPct(d.rows_without_any_image, totalRows)),
    ];
    kpis.innerHTML = '';
    for (const c of cards) kpis.appendChild(c);

    noImage.innerHTML = '';
    noImage.appendChild(buildTable(
        ['Motor', 'Filas sin imagen'],
        d.top_engines_without_image.map(r => [engineLink(r.engine_model), fmtInt(r.rows_without_image)]),
    ));

    placeholders.innerHTML = '';
    placeholders.appendChild(buildTable(
        ['Motor', 'Placeholders'],
        d.top_engines_with_placeholders.map(r => [engineLink(r.engine_model), fmtInt(r.placeholders)]),
    ));

    setStatus(status, 'OK', 'ok');
}

document.addEventListener('DOMContentLoaded', init);
