/**

 * Visor PDF basado en PDF.js.

 */



import { state } from './state.js';



const PDF_FIT_WIDTH_MARGIN = 8;

const PDF_FIT_HEIGHT_MARGIN = 8;

const PDF_SELECTION_MAX_HIGHLIGHTS = 40;

const PDF_HEADER_DEBUG_ENABLED = false;

// Deprecated experimental column/header parser path. Kept disabled until a clean reimplementation.
const PDF_EXPERIMENTAL_COLUMN_FEATURES_ENABLED = false;

const PDF_ZOOM_PERCENTAGES = new Set([50, 75, 100, 125, 150, 200]);

const PDF_ZOOM_STEPS = ['fit', 'height', 50, 75, 100, 125, 150, 200];

let pdfRelayoutRafId = 0;

// Sistema de debug para detección de cabecera
let headerDetectionDebugLog = [];
function debugLog(stage, data) {
    if (!PDF_HEADER_DEBUG_ENABLED) return;
    headerDetectionDebugLog.push({ stage, data, timestamp: Date.now() });
    if (headerDetectionDebugLog.length > 400) {
        headerDetectionDebugLog = headerDetectionDebugLog.slice(-400);
    }
    console.log(`[PDF Header Debug] ${stage}:`, data);
    if (window.updateHeaderDetectionDebugPanel) {
        window.updateHeaderDetectionDebugPanel();
    }
}
function getHeaderDetectionDebug() {
    return headerDetectionDebugLog;
}
function clearHeaderDetectionDebug() {
    headerDetectionDebugLog = [];
}

// Exponer funciones de debug a window para acceso global
if (PDF_HEADER_DEBUG_ENABLED) {
    window.getHeaderDetectionDebug = getHeaderDetectionDebug;
    window.clearHeaderDetectionDebug = clearHeaderDetectionDebug;
}



if (window.pdfjsLib) {

    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

}



function normalizePdfToken(value) {

    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

}


function isPdfRenderCancelledError(error) {

    return String(error?.name || '') === 'RenderingCancelledException';

}



function normalizePdfZoom(value) {

    const raw = String(value ?? '').trim().toLowerCase();

    if (raw === 'fit') return 'fit';

    if (raw === 'height') return 'height';



    const parsed = Number(raw);

    if (!Number.isFinite(parsed)) return 'fit';



    const normalized = Math.round(parsed);

    return PDF_ZOOM_PERCENTAGES.has(normalized) ? normalized : 100;

}



function applyPdfZoom(nextZoom, zoomSelect) {

    const normalizedZoom = normalizePdfZoom(nextZoom);

    state.currentPdfZoom = normalizedZoom;

    if (zoomSelect instanceof HTMLSelectElement) zoomSelect.value = String(normalizedZoom);



    if (state.rightPanelTab !== 'pdf') return;

    if (!state.currentPdfSource || state.currentPdfPageNumber <= 0) return;



    const isFitMode = normalizedZoom === 'fit' || normalizedZoom === 'height';

    renderPdfPage(state.currentPdfSource, state.currentPdfPageNumber, {

        preserveViewport: !isFitMode,

        resetScroll: isFitMode

    })

        .catch(error => console.error('Error aplicando zoom del PDF:', error));

}



function getNextPdfZoom(currentZoom, direction) {

    const index = PDF_ZOOM_STEPS.indexOf(currentZoom);

    if (index < 0) return 'fit';



    const step = direction > 0 ? 1 : -1;

    const nextIndex = Math.min(PDF_ZOOM_STEPS.length - 1, Math.max(0, index + step));

    return PDF_ZOOM_STEPS[nextIndex];

}



export function initPdfZoomControls() {

    const zoomSelect = document.getElementById('pdfZoomSelect');

    const zoomOutBtn = document.getElementById('pdfZoomOutBtn');

    const zoomInBtn = document.getElementById('pdfZoomInBtn');

    if (!(zoomSelect instanceof HTMLSelectElement)) return;



    const currentZoom = normalizePdfZoom(state.currentPdfZoom);

    state.currentPdfZoom = currentZoom;



    if (!zoomSelect.querySelector('option[value="height"]')) {

        const fitOption = zoomSelect.querySelector('option[value="fit"]');

        const option = document.createElement('option');

        option.value = 'height';

        option.textContent = 'Ajustar vertical';

        if (fitOption && fitOption.nextSibling) {

            zoomSelect.insertBefore(option, fitOption.nextSibling);

        } else {

            zoomSelect.appendChild(option);

        }

    } else {

        const heightOption = zoomSelect.querySelector('option[value="height"]');

        if (heightOption) heightOption.textContent = 'Ajustar vertical';

    }



    if (!zoomSelect.querySelector('option[value="50"]')) {

        const option = document.createElement('option');

        option.value = '50';

        option.textContent = '50%';

        const seventyFiveOption = zoomSelect.querySelector('option[value="75"]');

        if (seventyFiveOption) {

            zoomSelect.insertBefore(option, seventyFiveOption);

        } else {

            zoomSelect.appendChild(option);

        }

    }



    zoomSelect.value = String(currentZoom);



    if (zoomSelect.dataset.boundZoom === 'true') return;

    zoomSelect.dataset.boundZoom = 'true';



    zoomSelect.addEventListener('change', () => {

        applyPdfZoom(zoomSelect.value, zoomSelect);

    });



    if (zoomOutBtn instanceof HTMLButtonElement) {

        zoomOutBtn.addEventListener('click', () => {

            const currentZoom = normalizePdfZoom(state.currentPdfZoom);

            const nextZoom = getNextPdfZoom(currentZoom, -1);

            applyPdfZoom(nextZoom, zoomSelect);

        });

    }



    if (zoomInBtn instanceof HTMLButtonElement) {

        zoomInBtn.addEventListener('click', () => {

            const currentZoom = normalizePdfZoom(state.currentPdfZoom);

            const nextZoom = getNextPdfZoom(currentZoom, 1);

            applyPdfZoom(nextZoom, zoomSelect);

        });

    }

}



function getPdfSelectionLayer() {

    const viewerInner = document.querySelector('.pdfviewer-inner');

    if (!(viewerInner instanceof HTMLElement)) return null;



    let layer = viewerInner.querySelector('.pdf-selection-layer');

    if (!(layer instanceof HTMLDivElement)) {

        layer = document.createElement('div');

        layer.className = 'pdf-selection-layer';

        layer.setAttribute('aria-hidden', 'true');

        viewerInner.appendChild(layer);

    }

    return layer;

}



function clearPdfSelectionLayer() {

    const layer = getPdfSelectionLayer();

    if (!layer) return;

    layer.innerHTML = '';

    layer.classList.remove('is-active', 'is-out-of-page');

    layer.style.inset = '0';

    layer.style.left = '';

    layer.style.top = '';

    layer.style.width = '';

    layer.style.height = '';

    delete layer.dataset.selectionLabel;

}



function normalizeExperimentalRowHighlights(highlights) {

    if (!Array.isArray(highlights)) return [];



    return highlights.map((item) => ({

        left: Number(item?.left) || 0,

        top: Number(item?.top) || 0,

        width: Number(item?.width) || 0,

        height: Number(item?.height) || 0,

        text: String(item?.text || '').trim(),

        kind: String(item?.kind || 'blue-token').trim().toLowerCase()

    })).filter((item) => item.width > 0 && item.height > 0);

}



function normalizeExperimentalRowSearch(search) {

    if (!search || typeof search !== 'object') return null;



    // Acepta tanto formato de entrada (pn/pnFinal/token) como formato ya normalizado (pnToken).
    const pnToken = normalizePdfToken(search?.pnToken || search?.pn || search?.pnFinal || search?.token);
    const headerOnly = Boolean(search?.headerOnly || search?.detectHeaderOnly);
    const rawMode = String(search?.mode || '').trim().toLowerCase();
    const mode = rawMode || (headerOnly ? 'header-only' : 'legacy');

    if (!pnToken && !headerOnly) return null;



    const yTolerance = Number(search?.yTolerance);

    return {
        mode,
        pnToken,
        headerOnly,
        yTolerance: Number.isFinite(yTolerance) && yTolerance > 0 ? yTolerance : 5
    };

}

function syncPdfSelectionLayerBounds(viewportWidth, viewportHeight, canvas) {

    const layer = getPdfSelectionLayer();

    const viewerInner = document.querySelector('.pdfviewer-inner');

    if (!layer || !(viewerInner instanceof HTMLElement)) return;



    const hasCanvasBox = canvas instanceof HTMLCanvasElement

        && canvas.clientWidth > 0

        && canvas.clientHeight > 0;



    const width = hasCanvasBox

        ? Math.max(1, Math.round(canvas.clientWidth))

        : Math.max(1, Math.floor(viewportWidth));

    const height = hasCanvasBox

        ? Math.max(1, Math.round(canvas.clientHeight))

        : Math.max(1, Math.floor(viewportHeight));

    const left = hasCanvasBox

        ? Math.round(canvas.offsetLeft)

        : Math.floor((viewerInner.clientWidth - width) / 2);

    const top = hasCanvasBox ? Math.round(canvas.offsetTop) : 0;



    // La capa de marcas debe compartir sistema de coordenadas con el canvas.

    layer.style.inset = 'auto';

    layer.style.left = `${left}px`;

    layer.style.top = `${top}px`;

    layer.style.width = `${width}px`;

    layer.style.height = `${height}px`;

}



function renderPdfSelectionBadge(selection, isSamePage) {

    const layer = getPdfSelectionLayer();

    if (!layer || !selection) {

        clearPdfSelectionLayer();

        return;

    }



    const badge = document.createElement('div');

    badge.className = 'pdfstatus';



    const pos = selection.pos || 'â€”';

    const pn = selection.pn || 'â€”';

    const id = selection.id || 'â€”';

    badge.textContent = isSamePage

        ? `Seleccionado: POS ${pos} · PN ${pn} · ID ${id}`

        : `Fila seleccionada: POS ${pos} · PN ${pn} · ID ${id}`;



    layer.appendChild(badge);

    layer.classList.add('is-active');

    layer.classList.toggle('is-out-of-page', !isSamePage);

    layer.dataset.selectionLabel = badge.textContent;

}



function getSelectionSearchTokens(selection) {

    if (!selection) return null;



    const pn = normalizePdfToken(selection.pn);

    const pos = normalizePdfToken(selection.pos);

    const designationFinal = normalizePdfToken(selection.designationFinal);

    if (!pn && !pos && !designationFinal) return null;



    const qty = normalizePdfToken(selection.qty);

    const measurement = normalizePdfToken(selection.measurement);

    const weight = normalizePdfToken(selection.weight);

    const model = normalizePdfToken(selection.model);



    return {

        pn,

        pos,

        designationFinal,

        qty,

        measurement,

        weight,

        model,

        allowPnContains: false,

        allowPosContains: false,

        allowDesignationContains: designationFinal.length >= 8,

        allowMeasurementContains: measurement.length >= 6,

        allowWeightContains: false,

        allowModelContains: false,

        allowQtyContains: false,

        fieldErrors: selection.fieldErrors ?? {}

    };

}



function getPnLineRects(rects, pnRects) {

    if (!pnRects.length) return [];

    const pnCenterY = pnRects.reduce((sum, r) => sum + r.centerY, 0) / pnRects.length;

    const lineHeight = Math.max(...pnRects.map(r => r.height || 12), 12);

    const threshold = lineHeight * 0.9 + 4;

    return rects.filter(r => Math.abs(r.centerY - pnCenterY) <= threshold);

}



function isBomFieldName(fieldName) {

    return String(fieldName ?? '').trim().toLowerCase().includes('bom');

}



function normalizeReadTokenEntries(entries) {

    if (!Array.isArray(entries)) return [];

    const normalized = [];

    const seen = new Set();



    entries.forEach((entry) => {

        const field = String(entry?.field ?? '').trim();

        const token = normalizePdfToken(entry?.token);

        if (!token) return;

        const key = `${field.toLowerCase()}|${token}`;

        if (seen.has(key)) return;

        seen.add(key);

        normalized.push({ field, token });

    });



    return normalized;

}



function buildReadTokenHighlights(rects, tokenEntries, pnRects = []) {

    if (!Array.isArray(rects) || rects.length === 0) return [];

    if (!Array.isArray(tokenEntries) || tokenEntries.length === 0) return [];



    const pnLineRects = getPnLineRects(rects, pnRects);

    const highlights = [];

    const seenBoxes = new Set();



    const pushHighlight = (box, field, text) => {

        const boxKey = `${Math.round(box.left)}|${Math.round(box.top)}|${Math.round(box.width)}|${Math.round(box.height)}|${field.toLowerCase()}`;

        if (seenBoxes.has(boxKey)) return;

        seenBoxes.add(boxKey);

        highlights.push({

            left: Math.max(0, box.left - 4),

            top: Math.max(0, box.top - box.height - 3),

            width: Math.max(24, box.width + 8),

            height: Math.max(16, box.height + 6),

            text,

            priority: 12,

            type: 'read-token',

            hasError: false

        });

    };



    tokenEntries.forEach((entry) => {

        const searchRects = isBomFieldName(entry.field)

            ? rects

            : pnLineRects;

        if (!searchRects.length) return;



        const directMatches = searchRects.filter((rect) => tokenMatches(rect.normalizedText, entry.token, false));

        if (directMatches.length > 0) {

            directMatches.forEach((rect) => {

                const matchRect = getTokenHighlightRect(rect, entry.token) || rect;

                pushHighlight(matchRect, entry.field, `${entry.field}: ${matchRect.text}`);

            });

            return;

        }



        const lines = buildLineGroups(searchRects);

        lines.forEach((line) => {

            const clusters = buildTextClusters(line.rects);

            clusters.forEach((cluster) => {

                if (!tokenMatches(cluster.normalizedText, entry.token, true)) return;

                pushHighlight(cluster, entry.field, `${entry.field}: ${cluster.text}`);

            });

        });

    });



    return highlights;

}



function tokenMatches(itemText, tokenValue, allowContains) {

    if (!itemText || !tokenValue) return false;

    if (itemText === tokenValue) return true;



    if (!allowContains) return false;



    // Si permitimos contains, buscar respetando límites de palabras (word boundaries)

    // Esto evita que "GEAR PUMP F" coincida dentro de "GEAR PUMP F - TYPE XYZ"

    // buscando que la coincidencia sea:

    // 1. Al inicio de la cadena

    // 2. Después de un espacio, guión u otro separador

    // 3. Seguida de espacio, guión u otro separador (o final de cadena)



    const separatorRegex = /[\s\-\,\.\;\/\(\)]/;

    let searchIndex = itemText.indexOf(tokenValue);



    while (searchIndex !== -1) {

        const endIndex = searchIndex + tokenValue.length;

        const beforeOk = searchIndex === 0 || separatorRegex.test(itemText[searchIndex - 1]);

        const afterOk = endIndex === itemText.length || separatorRegex.test(itemText[endIndex]);

        if (beforeOk && afterOk) return true;

        searchIndex = itemText.indexOf(tokenValue, searchIndex + 1);

    }



    return false;

}



function buildTextClusters(rects) {

    if (!Array.isArray(rects) || rects.length === 0) return [];



    const CLUSTER_GAP_MAX = 28;

    const sortedRects = [...rects].sort((a, b) => a.left - b.left);

    const clusters = [];

    let currentCluster = null;



    sortedRects.forEach((rect) => {

        if (!currentCluster) {

            currentCluster = {

                rects: [rect],

                left: rect.left,

                top: rect.top,

                right: rect.left + rect.width,

                bottom: rect.top,

                textParts: [rect.text],

                normalizedParts: [rect.normalizedText]

            };

            return;

        }



        const gap = rect.left - currentCluster.right;

        if (gap <= CLUSTER_GAP_MAX) {

            currentCluster.rects.push(rect);

            currentCluster.right = Math.max(currentCluster.right, rect.left + rect.width);

            currentCluster.top = Math.min(currentCluster.top, rect.top);

            currentCluster.bottom = Math.max(currentCluster.bottom, rect.top);

            currentCluster.textParts.push(rect.text);

            currentCluster.normalizedParts.push(rect.normalizedText);

            return;

        }



        clusters.push(currentCluster);

        currentCluster = {

            rects: [rect],

            left: rect.left,

            top: rect.top,

            right: rect.left + rect.width,

            bottom: rect.top,

            textParts: [rect.text],

            normalizedParts: [rect.normalizedText]

        };

    });



    if (currentCluster) clusters.push(currentCluster);



    return clusters.map(cluster => ({

        ...cluster,

        width: Math.max(1, cluster.right - cluster.left),

        height: Math.max(...cluster.rects.map(rect => rect.height || 12), 12),

        text: cluster.textParts.join(' ').replace(/\s+/g, ' ').trim(),

        normalizedText: cluster.normalizedParts.join(' ').replace(/\s+/g, ' ').trim(),

        centerY: cluster.rects.reduce((sum, rect) => sum + rect.centerY, 0) / cluster.rects.length

    }));

}



function buildLineGroups(rects) {

    if (!Array.isArray(rects) || rects.length === 0) return [];



    const sortedRects = [...rects].sort((a, b) => {

        const verticalDelta = b.centerY - a.centerY;

        if (Math.abs(verticalDelta) > 2) return verticalDelta;

        return a.left - b.left;

    });



    const lines = [];

    sortedRects.forEach((rect) => {

        const threshold = Math.max(rect.height || 12, 12) * 0.5 + 2;

        const line = lines.find(item => Math.abs(item.centerY - rect.centerY) <= threshold);

        if (line) {

            line.rects.push(rect);

            line.centerY = (line.centerY + rect.centerY) / 2;

            return;

        }

        lines.push({ centerY: rect.centerY, rects: [rect] });

    });



    return lines;

}



function buildPnLineDebugHighlights(rects, search) {

    if (!Array.isArray(rects) || rects.length === 0) return [];

    const pnToken = normalizePdfToken(search?.pnToken);
    if (!pnToken) return [];

    const lines = buildLineGroups(rects);
    const matchedLines = [];

    lines.forEach((line) => {
        const directPnRects = line.rects.filter((rect) => tokenMatches(rect.normalizedText, pnToken, false));
        const hasClusterMatch = buildTextClusters(line.rects)
            .some((cluster) => tokenMatches(cluster.normalizedText, pnToken, true));

        if (!directPnRects.length && !hasClusterMatch) return;

        matchedLines.push({ line, directPnRects, hasClusterMatch });
    });

    if (!matchedLines.length) return [];

    const highlights = [];

    matchedLines.forEach(({ line, directPnRects, hasClusterMatch }) => {
        const directPnKeys = new Set(directPnRects.map((rect) => `${rect.left}|${rect.top}|${rect.width}|${rect.height}`));

        [...line.rects]
            .sort((a, b) => a.left - b.left)
            .forEach((rect) => {
                const rectKey = `${rect.left}|${rect.top}|${rect.width}|${rect.height}`;

                highlights.push({
                    left: Math.max(0, Number(rect.left || 0) - 4),
                    top: Math.max(0, Number(rect.top || 0) - Number(rect.height || 12) - 4),
                    width: Math.max(18, Number(rect.width || 0) + 8),
                    height: Math.max(14, Number(rect.height || 12) + 8),
                    text: String(rect.text || '').trim(),
                    kind: directPnKeys.has(rectKey) ? 'blue-token-pn' : 'blue-token'
                });
            });

        if (!directPnRects.length && hasClusterMatch) {
            const cluster = buildTextClusters(line.rects)
                .find((item) => tokenMatches(item.normalizedText, pnToken, true));

            if (cluster) {
                highlights.push({
                    left: Math.max(0, Number(cluster.left || 0) - 4),
                    top: Math.max(0, Number(cluster.top || 0) - Number(cluster.height || 12) - 4),
                    width: Math.max(18, Number(cluster.width || 0) + 8),
                    height: Math.max(14, Number(cluster.height || 12) + 8),
                    text: String(cluster.text || '').trim(),
                    kind: 'blue-token-pn'
                });
            }
        }
    });

    return highlights.slice(0, PDF_SELECTION_MAX_HIGHLIGHTS);

}


function buildRowBandFromLineRects(lineRects, viewport, options = {}) {

    if (!Array.isArray(lineRects) || lineRects.length === 0) return null;

    const minTop = Math.min(...lineRects.map((rect) => (Number(rect.top) || 0) - (Number(rect.height) || 12)));
    const maxBottom = Math.max(...lineRects.map((rect) => Number(rect.top) || 0));

    return {

        left: 0,

        top: Math.max(0, minTop - 4),

        width: Math.max(48, Number(viewport?.width || 0)),

        height: Math.max(16, (maxBottom - minTop) + 8),

        text: String(options.text || 'Fila completa'),

        kind: String(options.kind || 'red-row')

    };

}


function buildLineBandHighlightsForToken(rects, viewport, tokenValue, options = {}) {

    const normalizedToken = normalizePdfToken(tokenValue);

    if (!normalizedToken) return [];

    const lines = buildLineGroups(rects);
    const highlights = [];
    const directOnly = Boolean(options.directOnly);
    const maxBands = Number.isFinite(options.maxBands) && options.maxBands > 0
        ? options.maxBands
        : PDF_SELECTION_MAX_HIGHLIGHTS;

    const leftmostCellOnly = Boolean(options.leftmostCellOnly);

    for (const line of lines) {
        if (highlights.length >= maxBands) break;

        const sortedByX = [...line.rects].sort((a, b) => (a.left || 0) - (b.left || 0));
        const minLeft = sortedByX.length ? (sortedByX[0].left || 0) : 0;
        // Allow rects within a small horizontal window of the leftmost position
        const leftmostCellThreshold = minLeft + Math.max(20, (sortedByX[1]?.left ?? minLeft + 20) - minLeft - 1);

        const candidateRects = leftmostCellOnly
            ? line.rects.filter((r) => (r.left || 0) <= leftmostCellThreshold)
            : line.rects;

        const directMatches = candidateRects.filter((rect) => tokenMatches(rect.normalizedText, normalizedToken, false));
        if (!directMatches.length) {
            if (directOnly) continue;
            const hasClusterMatch = buildTextClusters(candidateRects)
                .some((cluster) => tokenMatches(cluster.normalizedText, normalizedToken, true));
            if (!hasClusterMatch) continue;
        }

        const rowBand = buildRowBandFromLineRects(line.rects, viewport, options);
        if (rowBand) highlights.push(rowBand);
    }

    return highlights;

}



const PDF_HEADER_LINE_WINDOW_PX = 220;

const PDF_HEADER_COLUMN_PATTERNS = [
    { key: 'arrow', label: 'ARROW', variants: ['arrow', 'sel', 'selector', 'icon'] },
    { key: 'pos', label: 'POS', variants: ['pos', 'pos.', 'position'] },
    { key: 'part_no', label: 'PART NO.', variants: ['part no', 'part no.', 'part number', 'partnumber', 'pn'] },
    { key: 'designation', label: 'DESIGNATION', variants: ['designation', 'description', 'denomination', 'designacion', 'descripcion'] },
    { key: 'model_type', label: 'MODEL/TYPE', variants: ['model/type', 'model type', 'modeltype', 'model typ'] },
    { key: 'qty', label: 'QTY', variants: ['qty', 'qty.', 'quantity', 'q ty'] },
    { key: 'units', label: 'UNITS', variants: ['units', 'unit'] },
    { key: 'weight', label: 'WEIGHT', variants: ['weight', 'wt', 'wgt'] },
    { key: 'fn', label: 'FN', variants: ['fn', 'footnote', 'f.n.', 'f n', 'f.n'] },
    { key: 'measurement', label: 'MEASUREMENT', variants: ['measurement', 'measure', 'meas', 'measurement / standard', 'measurement/standard'] },
    { key: 'standard', label: 'STANDARD', variants: ['standard', 'std', 'norma'] },
    { key: 'remarks', label: 'REMARKS', variants: ['remark', 'remarks', 'note', 'notes'] },
    { key: 'dimensions', label: 'DIMENSIONS', variants: ['dimensions', 'dimension', 'dims', 'dim'] }
];


function normalizePdfHeaderText(text) {

    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[_\-]/g, ' ')
        .replace(/[^a-z0-9\s.]/g, ' ')
        .replace(/\b0\b/g, 'o')
        .replace(/\s+/g, ' ')
        .trim();

}


function normalizePdfHeaderVariant(text) {

    return normalizePdfHeaderText(text)
        .replace(/\./g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

}


function resolveHeaderMatchBounds(cluster, variant) {

    const rects = Array.isArray(cluster?.rects)
        ? [...cluster.rects].sort((a, b) => Number(a?.left || 0) - Number(b?.left || 0))
        : [];
    const normalizedVariant = normalizePdfHeaderVariant(variant);
    if (!rects.length || !normalizedVariant) return null;

    const tokens = rects.map((rect) => ({
        rect,
        normalized: normalizePdfHeaderVariant(rect?.text || rect?.normalizedText || '')
    }));

    let best = null;

    for (let start = 0; start < tokens.length; start += 1) {
        let joined = '';
        for (let end = start; end < tokens.length; end += 1) {
            const token = tokens[end];
            joined = joined ? `${joined} ${token.normalized}`.trim() : token.normalized;
            const joinedCompact = joined.replace(/\s+/g, '');
            const variantCompact = normalizedVariant.replace(/\s+/g, '');
            const exact = joined === normalizedVariant || joinedCompact === variantCompact;
            const contains = joined.includes(normalizedVariant) || joinedCompact.includes(variantCompact);
            if (!exact && !contains) continue;

            const matchedRects = tokens.slice(start, end + 1).map((entry) => entry.rect);
            const left = Math.min(...matchedRects.map((entry) => Number(entry?.left || 0)));
            const right = Math.max(...matchedRects.map((entry) => Number(entry?.left || 0) + Number(entry?.width || 0)));
            const top = Math.min(...matchedRects.map((entry) => Number(entry?.top || 0) - Number(entry?.height || 12)));
            const bottom = Math.max(...matchedRects.map((entry) => Number(entry?.top || 0)));
            const candidate = {
                left,
                top,
                width: Math.max(1, right - left),
                height: Math.max(12, bottom - top),
                text: matchedRects.map((entry) => String(entry?.text || '').trim()).join(' ').replace(/\s+/g, ' ').trim(),
                exact,
                tokenCount: matchedRects.length
            };

            if (!best
                || (candidate.exact && !best.exact)
                || (candidate.exact === best.exact && candidate.tokenCount < best.tokenCount)
            ) {
                best = candidate;
            }

            if (exact) break;
        }
        if (best?.exact) break;
    }

    return best;

}


function getHeaderClusterMatches(cluster) {

    const source = normalizePdfHeaderText(cluster?.text || cluster?.normalizedText || '');
    if (!source) return [];

    const compact = source.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    const compactNoSpace = compact.replace(/\s+/g, '');
    const matches = [];

    PDF_HEADER_COLUMN_PATTERNS.forEach((definition) => {
        let bestVariant = '';
        let bestScore = 0;
        let bestBounds = null;

        definition.variants.forEach((variant) => {
            const normalizedVariant = normalizePdfHeaderVariant(variant);
            if (!normalizedVariant) return;

            const variantNoSpace = normalizedVariant.replace(/\s+/g, '');
            const exact = compact === normalizedVariant || compactNoSpace === variantNoSpace;
            const contains = compact.includes(normalizedVariant) || compactNoSpace.includes(variantNoSpace);

            let score = 0;
            if (exact) score = 1;
            else if (contains) score = 0.7;

            if (score > bestScore) {
                bestScore = score;
                bestVariant = normalizedVariant;
                bestBounds = resolveHeaderMatchBounds(cluster, normalizedVariant);
            }
        });

        if (bestScore > 0) {
            matches.push({
                key: definition.key,
                label: definition.label,
                variant: bestVariant,
                score: bestScore,
                bounds: bestBounds
            });
        }
    });

    return matches;

}


function detectHeaderLineGroups(lineGroups, targetLine) {

    if (!Array.isArray(lineGroups) || lineGroups.length === 0) {
        return { headerLine: null, matches: [], confidence: 'low', lineCandidates: [] };
    }

    const targetCenterY = Number(targetLine?.centerY);
    const hasTarget = Number.isFinite(targetCenterY);
    const lineCandidates = [];

    lineGroups.forEach((line) => {
        const clusters = buildTextClusters(line?.rects || []).sort((a, b) => a.left - b.left);
        if (!clusters.length) return;

        const matches = [];
        clusters.forEach((cluster) => {
            getHeaderClusterMatches(cluster).forEach((match) => {
                matches.push({ ...match, cluster });
            });
        });
        if (!matches.length) return;

        const uniqueKeys = new Set(matches.map((entry) => entry.key));
        const strongestMatch = Math.max(...matches.map((entry) => entry.score));
        let score = matches.reduce((sum, entry) => sum + entry.score, 0) + (uniqueKeys.size * 0.65) + strongestMatch;

        if (hasTarget) {
            const deltaAbove = targetCenterY - Number(line.centerY || 0);
            const inWindowAbove = deltaAbove >= 0 && deltaAbove <= PDF_HEADER_LINE_WINDOW_PX;
            if (inWindowAbove) {
                score += 1.2 - Math.min(0.9, deltaAbove / PDF_HEADER_LINE_WINDOW_PX);
            } else {
                score -= 0.5;
            }
        }

        lineCandidates.push({
            line,
            matches,
            clusters,
            uniqueKeys: Array.from(uniqueKeys),
            score
        });
    });

    if (!lineCandidates.length) {
        return { headerLine: null, matches: [], confidence: 'low', lineCandidates: [] };
    }

    lineCandidates.sort((a, b) => b.score - a.score);
    const best = lineCandidates[0];

    const confidence = best.score >= 6
        ? 'high'
        : best.score >= 4
            ? 'medium'
            : 'low';

    return {
        headerLine: best.line,
        matches: best.matches,
        confidence,
        lineCandidates
    };

}


function buildColumnRegionsFromHeaderLine(headerLine) {

    const viewportWidth = Math.max(1, Number(headerLine?.viewportWidth || 0));
    const matches = Array.isArray(headerLine?.matches) ? headerLine.matches : [];
    if (!matches.length) return [];

    const byKey = new Map();
    matches.forEach((entry) => {
        const key = String(entry?.key || '').trim();
        if (!key) return;
        const previous = byKey.get(key);
        if (!previous || Number(entry?.score || 0) > Number(previous?.score || 0)) {
            byKey.set(key, entry);
        }
    });

    const anchors = Array.from(byKey.values())
        .map((entry) => {
            const bounds = entry.bounds || entry.cluster || {};
            const left = Number(bounds.left || 0);
            const width = Math.max(12, Number(bounds.width || 0));
            return {
                key: entry.key,
                label: entry.label,
                centerX: left + (width / 2),
                left,
                right: left + width,
                confidence: Number(entry.score || 0) >= 0.95 ? 'high' : 'medium'
            };
        })
        .sort((a, b) => a.centerX - b.centerX);

    if (!anchors.length) return [];

    const regions = anchors.map((anchor, index) => {
        const prev = anchors[index - 1] || null;
        const next = anchors[index + 1] || null;

        const x1 = prev
            ? (prev.centerX + anchor.centerX) / 2
            : Math.max(0, anchor.left - Math.max(16, anchor.centerX * 0.18));

        const x2 = next
            ? (anchor.centerX + next.centerX) / 2
            : Math.min(viewportWidth, anchor.right + Math.max(16, (viewportWidth - anchor.centerX) * 0.15));

        return {
            key: anchor.key,
            label: anchor.label,
            x1: Math.max(0, Math.min(x1, viewportWidth)),
            x2: Math.max(0, Math.min(x2, viewportWidth)),
            confidence: anchor.confidence
        };
    }).filter((region) => region.x2 > region.x1 + 2);

    // Infer arrow region: if no arrow anchor was detected in the header text and the first
    // detected column starts far enough from the left edge, create a narrow arrow region.
    const ARROW_MIN_SPACE = 25;
    if (regions.length && regions[0].key !== 'arrow' && regions[0].x1 > ARROW_MIN_SPACE) {
        regions.unshift({
            key: 'arrow',
            label: 'ARROW',
            x1: 0,
            x2: regions[0].x1,
            confidence: 'low'
        });
    }

    return regions;

}


function assignTokensToColumnRegions(rowTokens, columnRegions) {

    const tokens = Array.isArray(rowTokens)
        ? [...rowTokens].sort((a, b) => Number(a?.left || 0) - Number(b?.left || 0))
        : [];
    const regions = Array.isArray(columnRegions) ? columnRegions : [];

    const grouped = {
        arrow: [],
        pos: [],
        part_no: [],
        designation: [],
        model_type: [],
        qty: [],
        units: [],
        weight: [],
        fn: [],
        measurement: [],
        standard: [],
        remarks: [],
        unknown: []
    };

    const assignments = tokens.map((token) => {
        const centerX = Number(token?.left || 0) + (Math.max(0, Number(token?.width || 0)) / 2);

        let region = regions.find((candidate) => centerX >= Number(candidate.x1 || 0) && centerX <= Number(candidate.x2 || 0));
        let confidence = 'high';

        if (!region && regions.length) {
            confidence = 'low';
            region = [...regions].sort((a, b) => {
                const da = Math.abs(centerX - ((Number(a.x1 || 0) + Number(a.x2 || 0)) / 2));
                const db = Math.abs(centerX - ((Number(b.x1 || 0) + Number(b.x2 || 0)) / 2));
                return da - db;
            })[0] || null;
        }

        const key = String(region?.key || 'unknown');
        const label = String(region?.label || 'UNKNOWN');
        const text = String(token?.text || '').trim();

        if (text) {
            const bucket = grouped[key] || grouped.unknown;
            bucket.push(text);
        }

        return {
            text,
            left: Number(token?.left || 0),
            top: Number(token?.top || 0),
            width: Math.max(0, Number(token?.width || 0)),
            height: Math.max(0, Number(token?.height || 0)),
            centerX,
            key,
            label,
            confidence
        };
    });

    return { grouped, assignments };

}


function detectHeaderColumns(rects, viewport, options = {}) {

    if (!Array.isArray(rects) || rects.length === 0) return [];

    const lineGroups = buildLineGroups(rects);
    if (!lineGroups.length) return [];

    const targetLine = lineGroups.find((line) => {
        if (!Number.isFinite(Number(options?.anchorCenterY))) return false;
        return Math.abs(Number(line.centerY || 0) - Number(options.anchorCenterY)) <= 10;
    }) || null;

    const detectedHeader = detectHeaderLineGroups(lineGroups, targetLine);
    if (!detectedHeader.headerLine || !Array.isArray(detectedHeader.matches) || !detectedHeader.matches.length) {
        return [];
    }

    const headerLinePayload = {
        line: detectedHeader.headerLine,
        matches: detectedHeader.matches,
        viewportWidth: Number(viewport?.width || 0)
    };

    const columnRegions = buildColumnRegionsFromHeaderLine(headerLinePayload);
    if (!columnRegions.length) return [];

    const pageWidth = Math.max(1, Number(viewport?.width || 0));
    const headerRects = Array.isArray(detectedHeader.headerLine.rects) ? detectedHeader.headerLine.rects : [];
    const headerTop = headerRects.length
        ? Math.min(...headerRects.map((rect) => (Number(rect.top || 0) - Number(rect.height || 12))))
        : Math.max(0, Number(detectedHeader.headerLine.centerY || 0) - 12);

    const highlights = [
        {
            left: 0,
            top: Math.max(0, headerTop - 4),
            width: pageWidth,
            height: 22,
            text: 'Fila cabecera',
            kind: 'violet-row'
        }
    ];

    detectedHeader.matches.forEach((entry) => {
        const cluster = entry?.cluster || null;
        if (!cluster) return;
        highlights.push({
            left: Math.max(0, Number(cluster.left || 0) - 3),
            top: Math.max(0, Number(cluster.top || 0) - Number(cluster.height || 12) - 3),
            width: Math.max(18, Number(cluster.width || 0) + 8),
            height: Math.max(14, Number(cluster.height || 12) + 8),
            text: String(cluster.text || '').trim(),
            kind: 'blue-token'
        });
    });

    columnRegions.forEach((region) => {
        highlights.push({
            left: Number(region.x1 || 0),
            top: Math.max(0, headerTop - 18),
            width: Math.max(6, Number(region.x2 || 0) - Number(region.x1 || 0)),
            height: 52,
            text: String(region.label || region.key || 'COLUMN'),
            kind: 'column-region'
        });
    });

    return highlights;

}



function findExactDesignationClusters(rects, designationText) {

    if (!Array.isArray(rects) || rects.length === 0 || !designationText) return [];



    const matches = [];

    const lines = buildLineGroups(rects);

    lines.forEach((line) => {

        const clusters = buildTextClusters(line.rects);

        clusters.forEach((cluster) => {

            if (tokenMatches(cluster.normalizedText, designationText, true)) {

                matches.push(cluster);

            }

        });

    });



    return matches;

}



function getTokenHighlightRect(rect, tokenValue) {

    if (!rect || !tokenValue) return null;



    const rectText = String(rect.normalizedText || '');

    if (!rectText) return null;



    const matchIndex = rectText.indexOf(tokenValue);

    if (matchIndex < 0) return null;



    if (rectText === tokenValue) {

        return {

            left: rect.left,

            top: rect.top,

            width: rect.width,

            height: rect.height,

            text: rect.text,

            centerY: rect.centerY

        };

    }



    const totalLength = Math.max(rectText.length, 1);

    const startRatio = matchIndex / totalLength;

    const endRatio = (matchIndex + tokenValue.length) / totalLength;

    const left = rect.left + (rect.width * startRatio);

    const width = Math.max(12, rect.width * (endRatio - startRatio));



    return {

        left,

        top: rect.top,

        width,

        height: rect.height,

        text: rect.text,

        centerY: rect.centerY

    };

}



function extractPdfTextRects(textItems, viewport) {

    const rects = [];



    for (const item of textItems) {

        const itemText = normalizePdfToken(item?.str);

        if (!itemText) continue;



        const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);

        const left = tx[4];

        const top = tx[5];

        const width = item.width * viewport.scale;

        const height = item.height * viewport.scale || 12;



        rects.push({

            text: String(item?.str || ''),

            normalizedText: itemText,

            left,

            top,

            width,

            height,

            centerY: top - (height / 2)

        });

    }



    return rects;

}



function buildExperimentalRowHighlightsFromSearch(textItems, viewport, search) {

    const normalizedSearch = normalizeExperimentalRowSearch(search);

    if (!normalizedSearch) {
        state.currentPdfExperimentalColumnDetection = null;
        debugLog('buildExperimentalRowHighlightsFromSearch:start', { status: 'no-normalized-search' });
        return [];
    }

    debugLog('buildExperimentalRowHighlightsFromSearch:start', {
        headerOnly: normalizedSearch.headerOnly,
        pnToken: !!normalizedSearch.pnToken
    });

    const rects = extractPdfTextRects(textItems, viewport);

    if (!rects.length) {
        state.currentPdfExperimentalColumnDetection = null;
        debugLog('buildExperimentalRowHighlightsFromSearch:extract', { rectCount: 0, status: 'no-rects' });
        return [];
    }

    debugLog('buildExperimentalRowHighlightsFromSearch:extract', { rectCount: rects.length });

    if (normalizedSearch.mode === 'pn-line') {
        state.currentPdfExperimentalColumnDetection = null;
        const rowKind = String(normalizedSearch.rowKind || 'red-row').trim().toLowerCase() === 'orange-row'
            ? 'orange-row'
            : 'red-row';
        const rowLabel = String(normalizedSearch.rowLabel || '').trim() || (rowKind === 'orange-row' ? 'Fila POS' : 'Fila PN');
        const result = buildLineBandHighlightsForToken(rects, viewport, normalizedSearch.pnToken, {
            kind: rowKind,
            text: rowLabel,
            directOnly: rowKind === 'orange-row',
            maxBands: rowKind === 'orange-row' ? 1 : PDF_SELECTION_MAX_HIGHLIGHTS,
            leftmostCellOnly: rowKind === 'orange-row'
        });

        debugLog('buildExperimentalRowHighlightsFromSearch:pn-line', {
            pnToken: normalizedSearch.pnToken,
            rowKind,
            columnsDisabled: !PDF_EXPERIMENTAL_COLUMN_FEATURES_ENABLED,
            highlightCount: result.length
        });
        return result;
    }

    state.currentPdfExperimentalColumnDetection = null;

    const tokens = getSelectionSearchTokens(state.currentPdfSelection);

    const pnToken = tokens?.pn || normalizedSearch.pnToken;

    const pnRects = pnToken
        ? rects.filter((rect) => tokenMatches(rect.normalizedText, pnToken, tokens?.allowPnContains ?? false))
        : [];

    // Estrategia header-first: detectar cabecera de forma global (sin depender de PN).
    const headerColumnHighlightsGlobal = detectHeaderColumns(rects, viewport);
    const headerColumnHighlightsAnchored = pnRects.length
        ? detectHeaderColumns(rects, viewport, { anchorCenterY: pnRects[0]?.centerY })
        : [];
    const headerColumnHighlights = detectHeaderColumns(rects, viewport, {
        anchorCenterY: pnRects[0]?.centerY
    });

    const resolvedHeaderHighlights = headerColumnHighlightsGlobal.length
        ? headerColumnHighlightsGlobal
        : (headerColumnHighlightsAnchored.length ? headerColumnHighlightsAnchored : headerColumnHighlights);

    debugLog('buildExperimentalRowHighlightsFromSearch:header-detection', {
        pnToken: !!pnToken,
        pnRectCount: pnRects.length,
        headerGlobalCount: headerColumnHighlightsGlobal.length,
        headerAnchoredCount: headerColumnHighlightsAnchored.length,
        headerFallbackCount: headerColumnHighlights.length,
        resolvedCount: resolvedHeaderHighlights.length,
        chosenStrategy: headerColumnHighlightsGlobal.length > 0 ? 'global' : (headerColumnHighlightsAnchored.length > 0 ? 'anchored' : 'fallback'),
        headerOnly: normalizedSearch.headerOnly
    });

    if (!pnToken || normalizedSearch.headerOnly) {
        debugLog('buildExperimentalRowHighlightsFromSearch:result', {
            strategy: 'header-only',
            highlightCount: resolvedHeaderHighlights.length
        });
        return resolvedHeaderHighlights;
    }

    if (!pnRects.length) return resolvedHeaderHighlights;

    const pnLineRects = getPnLineRects(rects, [pnRects[0]]);

    if (!pnLineRects.length) {

        const anchor = pnRects[0];

        return [{

            left: Math.max(0, (Number(anchor.left) || 0) - 16),

            top: Math.max(0, (Number(anchor.top) || 0) - (Number(anchor.height) || 12) - 8),

            width: Math.max(120, (Number(anchor.width) || 30) + 32),

            height: Math.max(18, (Number(anchor.height) || 12) + 12),

            text: 'Fila PN (fallback)',

            kind: 'red-row'

        }, ...resolvedHeaderHighlights];

    }

    if (!pnLineRects.length) return [];

    const minLeft = Math.min(...pnLineRects.map((rect) => Number(rect.left) || 0));

    const maxRight = Math.max(...pnLineRects.map((rect) => (Number(rect.left) || 0) + (Number(rect.width) || 0)));

    const minTop = Math.min(...pnLineRects.map((rect) => (Number(rect.top) || 0) - (Number(rect.height) || 0)));

    const maxBottom = Math.max(...pnLineRects.map((rect) => Number(rect.top) || 0));

    const rowBand = {

        left: 0,

        top: Math.max(0, minTop - 4),

        width: Math.max(48, Number(viewport?.width || 0)),

        height: Math.max(16, (maxBottom - minTop) + 8),

        text: 'Fila completa',

        kind: 'red-row'

    };

    return [rowBand, ...pnLineRects

        .sort((a, b) => a.left - b.left)

        .map((rect) => ({

            left: Math.max(0, rect.left - 4),

            top: Math.max(0, rect.top - rect.height - 4),

            width: Math.max(20, rect.width + 10),

            height: Math.max(16, rect.height + 10),

            text: rect.text,

            kind: 'blue-token'

        })), ...resolvedHeaderHighlights];

}



function buildPdfTextHighlights(textItems, viewport, selection) {

    return [];

}



function renderPdfSelectionHighlights(highlights, viewport) {

    const layer = getPdfSelectionLayer();

    if (!layer) {
        debugLog('renderPdfSelectionHighlights:error', { reason: 'no-layer' });
        return;
    }

    layer.querySelectorAll('.pdf-selection-highlight').forEach(node => node.remove());

    state.currentPdfSelectionRects = [];

    const canvas = document.getElementById('pdfCanvas');
    const canvasWidth = canvas instanceof HTMLCanvasElement ? canvas.clientWidth : 0;
    const canvasHeight = canvas instanceof HTMLCanvasElement ? canvas.clientHeight : 0;
    const scaleX = viewport?.width > 0 && canvasWidth > 0 ? (canvasWidth / viewport.width) : 1;
    const scaleY = viewport?.height > 0 && canvasHeight > 0 ? (canvasHeight / viewport.height) : 1;

    const rowHighlights = [
        ...normalizeExperimentalRowHighlights(state.currentPdfExperimentalRowHighlights),
        ...normalizeExperimentalRowHighlights(state.currentPdfHeaderOnlyOverlay || []),
        ...normalizeExperimentalRowHighlights(state.currentPdfHeaderColumnBodyHighlights || [])
    ];

    debugLog('renderPdfSelectionHighlights:start', {
        standardHighlightCount: highlights.length,
        rowHighlightCount: rowHighlights.length,
        rowHighlightKinds: rowHighlights.map(h => h.kind),
        scaleX,
        scaleY,
        canvasWidth,
        canvasHeight,
        viewportWidth: viewport?.width,
        viewportHeight: viewport?.height
    });

    let focusHighlight = null;



    rowHighlights.forEach((rect) => {

        const box = document.createElement('div');

        box.className = 'pdf-selection-highlight';

        if (rect.kind === 'red-row') {
            box.classList.add('pdf-row-highlight-red-row');
        } else if (rect.kind === 'violet-row') {
            box.classList.add('pdf-row-highlight-violet-row');
        } else if (rect.kind === 'violet-column') {
            box.classList.add('pdf-column-highlight-violet');
        } else if (rect.kind === 'column-region') {
            box.classList.add('pdf-column-debug-region');
        } else if (rect.kind === 'column-label') {
            box.classList.add('pdf-column-debug-label');
        } else if (rect.kind === 'blue-token-pn') {
            box.classList.add('pdf-line-debug-highlight', 'pdf-line-debug-highlight--pn');
        } else if (rect.kind === 'orange-header-token') {
            box.classList.add('pdf-header-orange-token');
        } else if (rect.kind === 'header-pos') {
            box.classList.add('pdf-header-pos');
        } else if (rect.kind === 'header-part-no') {
            box.classList.add('pdf-header-part-no');
        } else if (rect.kind === 'header-model-type') {
            box.classList.add('pdf-header-model-type');
        } else if (rect.kind === 'header-qty') {
            box.classList.add('pdf-header-qty');
        } else if (rect.kind === 'header-designation') {
            box.classList.add('pdf-header-designation');
        } else if (rect.kind === 'header-units') {
            box.classList.add('pdf-header-units');
        } else if (rect.kind === 'header-weight') {
            box.classList.add('pdf-header-weight');
        } else if (rect.kind === 'header-fn') {
            box.classList.add('pdf-header-fn');
        } else if (rect.kind === 'header-measurement') {
            box.classList.add('pdf-header-measurement');
        } else if (rect.kind === 'header-standard') {
            box.classList.add('pdf-header-standard');
        } else if (rect.kind === 'column-token') {
            box.classList.add('pdf-column-debug-token', 'pdf-line-debug-highlight');
        } else {
            box.classList.add('pdf-line-debug-highlight');
        }

        box.style.left = `${Math.max(0, rect.left * scaleX)}px`;

        box.style.top = `${Math.max(0, rect.top * scaleY)}px`;

        box.style.width = `${Math.max(18, rect.width * scaleX)}px`;

        box.style.height = `${Math.max(12, rect.height * scaleY)}px`;

        box.title = rect.text ? `Linea PDF: ${rect.text}` : 'Linea PDF';

        if (rect.kind === 'column-label') {
            box.textContent = String(rect.text || '').trim();
        }

        layer.appendChild(box);

        if (!focusHighlight) focusHighlight = box;

    });



    if (focusHighlight) {

        const viewer = document.getElementById('pdfViewer');

        if (viewer instanceof HTMLElement) {

            const boxTop = focusHighlight.offsetTop;

            const boxHeight = focusHighlight.offsetHeight;

            const viewerHeight = viewer.clientHeight;

            const scrollTop = viewer.scrollTop;



            const boxBottomAbsolute = boxTop + boxHeight;

            const viewerBottom = scrollTop + viewerHeight;



            const isAboveViewport = boxTop < scrollTop;

            const isBelowViewport = boxBottomAbsolute > viewerBottom;



            if (isAboveViewport || isBelowViewport) {

                const targetScroll = boxTop - (viewerHeight / 2) + (boxHeight / 2);

                viewer.scrollTop = Math.max(0, targetScroll);

            }

        }

    }

    // ── Table debug overlay (Fase 1-3) ─────────────────────────────────────
    const tableDebugItems = Array.isArray(state.currentPdfTableDebugOverlay)
        ? state.currentPdfTableDebugOverlay
        : [];

    tableDebugItems.forEach((item) => {
        const kind = String(item.kind || '');
        const box = document.createElement('div');
        box.className = 'pdf-selection-highlight';

        if (kind === 'table-debug-col') {
            box.classList.add('pdf-table-debug-col');
            if (item.color) box.style.setProperty('--td-col-color', item.color);
        } else if (kind === 'table-debug-col-label') {
            box.classList.add('pdf-table-debug-col-label');
            if (item.color) box.style.background = item.color;
            box.textContent = String(item.text || '');
        } else if (kind === 'table-debug-table-area') {
            box.classList.add('pdf-table-debug-area');
        } else if (kind === 'table-debug-table-top-line') {
            box.classList.add('pdf-table-debug-top-line');
        } else if (kind === 'table-debug-ignored-header') {
            box.classList.add('pdf-table-debug-ignored-header');
        } else if (kind === 'table-debug-stats') {
            box.classList.add('pdf-table-debug-stats');
            box.textContent = String(item.text || '');
        } else if (kind === 'table-debug-header-row') {
            box.classList.add('pdf-table-debug-header-row');
            box.textContent = String(item.text || '');
        } else if (kind === 'table-debug-header-label') {
            box.classList.add('pdf-table-debug-header-label');
            box.textContent = String(item.text || '');
        } else if (kind === 'table-debug-header') {
            box.classList.add('pdf-table-debug-header');
        } else if (kind === 'table-debug-row') {
            box.classList.add('pdf-table-debug-row');
        } else if (kind === 'table-debug-separator') {
            box.classList.add('pdf-table-debug-separator');
        } else if (kind === 'table-debug-natural-gap') {
            box.classList.add('pdf-table-debug-natural-gap');
        } else if (kind === 'table-debug-boundary-initial') {
            box.classList.add('pdf-table-debug-boundary-before');
        } else if (kind === 'table-debug-boundary-refined') {
            box.classList.add('pdf-table-debug-boundary-after');
        } else if (kind === 'table-debug-boundary-adjustment') {
            box.classList.add('pdf-table-debug-boundary-adjustment');
            box.textContent = String(item.text || '');
        } else if (kind === 'table-debug-overlap') {
            box.classList.add('pdf-table-debug-overlap');
        } else if (kind === 'table-debug-warning') {
            box.classList.add('pdf-table-debug-warning');
            box.textContent = String(item.text || '');
        } else if (kind === 'table-debug-text-assigned') {
            box.classList.add('pdf-table-debug-text-assigned');
            if (item.color) box.style.background = item.color;
        } else if (kind === 'table-debug-text-unassigned') {
            box.classList.add('pdf-table-debug-text-unassigned');
        } else if (kind === 'header-debug-row-bg') {
            box.classList.add('pdf-header-debug-row-bg');
        } else if (kind === 'header-debug-rect') {
            box.classList.add('pdf-header-debug-rect');
        } else if (kind === 'header-debug-label') {
            box.classList.add('pdf-header-debug-label');
            box.textContent = String(item.text || '');
        } else if (kind === 'header-debug-vline') {
            box.classList.add('pdf-header-debug-vline');
        } else if (kind === 'header-debug-stats') {
            box.classList.add('pdf-header-debug-stats');
            box.textContent = String(item.text || '');
        } else if (kind === 'header-left-line-initial') {
            box.classList.add('pdf-header-left-line-initial');
        } else if (kind === 'header-left-line-adjusted') {
            box.classList.add('pdf-header-left-line-adjusted');
            if (item.color) box.style.setProperty('--hll-color', item.color);
        } else if (kind === 'header-left-line-label') {
            box.classList.add('pdf-header-left-line-label');
            box.textContent = String(item.text || '');
            if (item.color) box.style.color = item.color;
            if (item.fontSize) box.style.fontSize = `${item.fontSize}px`;
        } else {
            return;
        }

        box.style.left = `${Math.max(0, (Number(item.left) || 0) * scaleX)}px`;
        box.style.top = `${Math.max(0, (Number(item.top) || 0) * scaleY)}px`;
        box.style.width = `${Math.max(2, (Number(item.width) || 0) * scaleX)}px`;
        box.style.height = `${Math.max(2, (Number(item.height) || 0) * scaleY)}px`;
        box.title = String(item.text || '');
        layer.appendChild(box);
    });

    debugLog('renderPdfSelectionHighlights:complete', {
        violetRowElements: layer.querySelectorAll('.pdf-row-highlight-violet-row').length,
        redRowElements: layer.querySelectorAll('.pdf-row-highlight-red-row').length,
        blueTokenElements: layer.querySelectorAll('.pdf-line-debug-highlight, .pdf-row-highlight-blue').length,
        totalHighlights: layer.querySelectorAll('.pdf-selection-highlight').length
    });

}


async function renderPdfSelectionOverlay(page, viewport, requestToken = state.currentPdfRequestToken) {

    debugLog('renderPdfSelectionOverlay:start', {
        hasSelection: !!state.currentPdfSelection,
        hasExperimentalRowSearch: !!state.currentPdfExperimentalRowSearch,
        experimentalRowSearchHeaderOnly: state.currentPdfExperimentalRowSearch?.headerOnly
    });

    if (requestToken !== state.currentPdfRequestToken) {
        debugLog('renderPdfSelectionOverlay:cancelled', { reason: 'request-token-mismatch' });
        return;
    }

    const selection = state.currentPdfSelection;

    if (!selection) {
        debugLog('renderPdfSelectionOverlay:cancelled', { reason: 'no-selection' });
        clearPdfSelectionLayer();
        state.currentPdfSelectionRects = [];
        return;
    }



    const currentBook = String(selection.book || '').trim();

    const currentPage = String(selection.page || '').trim();

    const currentPageNum = Number(currentPage.replace(/[^0-9]/g, ''));

    const isSamePage = currentBook === String(selection.renderBook || '').trim()

        && currentPageNum > 0

        && currentPageNum === Number(selection.renderPageNum || 0);



    if (!isSamePage) {

        clearPdfSelectionLayer();

        state.currentPdfSelectionRects = [];

        return;

    }



    try {

        // La caché de texto ya está populada por renderPdfPage antes de llamar aquí.
        const textItems = state.currentPdfLastTextItems || [];
        const viewport2 = state.currentPdfLastViewport || viewport;

        let rowHighlights = buildExperimentalRowHighlightsFromSearch(textItems, viewport2, state.currentPdfExperimentalRowSearch);

        state.currentPdfExperimentalRowHighlights = rowHighlights;

        if (requestToken !== state.currentPdfRequestToken) return;

        renderPdfSelectionHighlights([], viewport);

    } catch (error) {

        console.warn('No se pudo construir la marca sobre el PDF:', error);

        state.currentPdfSelectionRects = [];

    }

}



export function setPdfSelection(row) {

    if (!row) {

        state.currentPdfSelection = null;

        state.currentPdfSelectionRects = [];

        state.currentPdfExperimentalRowHighlights = [];

        state.currentPdfExperimentalRowSearch = null;

        clearPdfSelectionLayer();

        return;

    }



    state.currentPdfSelection = {

        id: String(row?.ID ?? '').trim(),

        pos: String(row?.POS ?? '').trim(),

        pn: String(row?.pn_final ?? row?.['PART NO.'] ?? row?.pn ?? '').trim(),

        designationFinal: String(row?.designation_final ?? row?.DESIGNATION ?? '').trim(),

        qty: String(row?.qty_final ?? row?.QTY ?? '').trim(),

        measurement: String(row?.measure_final ?? row?.measurement_final ?? row?.['MEASUREMENT / STANDARD'] ?? '').trim(),

        weight: String(row?.weight_final ?? row?.WEIGHT ?? '').trim(),

        model: String(row?.model_type_final ?? row?.['MODEL/TYPE'] ?? '').trim(),
        book: String(row?.engine_model ?? '').trim(),

        page: String(row?.['Source Page'] ?? '').trim(),

        renderBook: '',

        renderPageNum: 0

    };

    state.currentPdfExperimentalRowHighlights = [];
    state.currentPdfExperimentalColumnDetection = null;

}


export function refreshPdfSelectionOverlayFromCache() {

    if (!state.currentPdfSelection) return false;

    if (!Array.isArray(state.currentPdfLastTextItems) || !state.currentPdfLastTextItems.length) return false;

    if (!state.currentPdfLastViewport) return false;

    const highlights = buildPdfTextHighlights(
        state.currentPdfLastTextItems,
        state.currentPdfLastViewport,
        state.currentPdfSelection
    );

    renderPdfSelectionHighlights(highlights, state.currentPdfLastViewport);

    return true;

}



export function setPdfStatus(message, isVisible = true) {

    const pdfStatus = document.getElementById('pdfStatus');

    if (!pdfStatus) return;

    pdfStatus.textContent = message;

    pdfStatus.classList.toggle('hidden', !isVisible);

}



function clamp(value, min, max) {

    return Math.min(Math.max(value, min), max);

}



function captureViewerViewport(viewer) {

    if (!(viewer instanceof HTMLElement)) return null;

    return {

        scrollLeft: viewer.scrollLeft,

        scrollTop: viewer.scrollTop,

        clientWidth: viewer.clientWidth,

        clientHeight: viewer.clientHeight,

        scrollWidth: viewer.scrollWidth,

        scrollHeight: viewer.scrollHeight

    };

}



function restoreViewerViewport(viewer, snapshot) {

    if (!(viewer instanceof HTMLElement) || !snapshot) return;



    const prevCenterX = (snapshot.scrollLeft + snapshot.clientWidth / 2) / Math.max(snapshot.scrollWidth, 1);

    const prevCenterY = (snapshot.scrollTop + snapshot.clientHeight / 2) / Math.max(snapshot.scrollHeight, 1);



    const targetLeft = prevCenterX * Math.max(viewer.scrollWidth, 1) - viewer.clientWidth / 2;

    const targetTop = prevCenterY * Math.max(viewer.scrollHeight, 1) - viewer.clientHeight / 2;



    const maxLeft = Math.max(0, viewer.scrollWidth - viewer.clientWidth);

    const maxTop = Math.max(0, viewer.scrollHeight - viewer.clientHeight);



    viewer.scrollLeft = clamp(targetLeft, 0, maxLeft);

    viewer.scrollTop = clamp(targetTop, 0, maxTop);

}



export async function renderPdfPage(pdfUrl, pageNum, options = {}) {

    if (!window.pdfjsLib) throw new Error('PDF.js no está disponible');



    const preserveViewport = options?.preserveViewport === true;

    const resetScroll = options?.resetScroll === true;



    const canvas = document.getElementById('pdfCanvas');

    const viewer = document.getElementById('pdfViewer');

    const viewerInner = document.querySelector('.pdfviewer-inner');

    if (!(canvas instanceof HTMLCanvasElement) || !viewer) return;



    const viewportSnapshot = preserveViewport ? captureViewerViewport(viewer) : null;



    const requestToken = ++state.currentPdfRequestToken;



    if (state.currentPdfRenderTask) {

        try {

            state.currentPdfRenderTask.cancel();

        } catch (error) {

            console.warn('No se pudo cancelar el render PDF anterior:', error);

        }

        state.currentPdfRenderTask = null;

    }



    setPdfStatus('Cargando PDF...', true);



    if (!state.currentPdfDocument || state.currentPdfSource !== pdfUrl) {

        state.currentPdfDocument = await window.pdfjsLib.getDocument(pdfUrl).promise;

        state.currentPdfSource = pdfUrl;

    }

    if (requestToken !== state.currentPdfRequestToken) return;



    if (pageNum < 1 || pageNum > state.currentPdfDocument.numPages) {

        throw new Error(`La página ${pageNum} no existe en el PDF`);

    }



    const page = await state.currentPdfDocument.getPage(pageNum);

    if (requestToken !== state.currentPdfRequestToken) return;



    const baseViewport = page.getViewport({ scale: 1 });

    const innerStyles = viewerInner instanceof HTMLElement ? getComputedStyle(viewerInner) : null;

    const innerPaddingLeft = innerStyles ? (parseFloat(innerStyles.paddingLeft) || 0) : 0;

    const innerPaddingRight = innerStyles ? (parseFloat(innerStyles.paddingRight) || 0) : 0;

    const innerPaddingTop = innerStyles ? (parseFloat(innerStyles.paddingTop) || 0) : 0;

    const innerPaddingBottom = innerStyles ? (parseFloat(innerStyles.paddingBottom) || 0) : 0;

    const innerContentWidth = viewerInner instanceof HTMLElement

        ? viewerInner.clientWidth - innerPaddingLeft - innerPaddingRight

        : 0;

    const innerContentHeight = viewerInner instanceof HTMLElement

        ? viewerInner.clientHeight - innerPaddingTop - innerPaddingBottom

        : 0;

    const viewerEffectiveWidth = innerContentWidth > 0

        ? innerContentWidth

        : (viewer?.clientWidth || baseViewport.width);

    const viewerEffectiveHeight = (viewer instanceof HTMLElement && viewer.clientHeight > 0)

        ? viewer.clientHeight

        : (baseViewport.height);

    const availableWidth = Math.max(120, viewerEffectiveWidth - PDF_FIT_WIDTH_MARGIN);

    const availableHeight = Math.max(120, viewerEffectiveHeight - PDF_FIT_HEIGHT_MARGIN);

    const fitWidthScale = Math.max(0.1, availableWidth / baseViewport.width);

    const fitHeightScale = Math.max(0.1, availableHeight / baseViewport.height);



    const currentZoom = normalizePdfZoom(state.currentPdfZoom);

    state.currentPdfZoom = currentZoom;



    const effectiveScale = currentZoom === 'fit'

        ? fitWidthScale

        : currentZoom === 'height'

            ? fitHeightScale

            : fitWidthScale * Math.max(0.2, currentZoom / 100);



    const viewport = page.getViewport({ scale: effectiveScale });

    const outputScale = window.devicePixelRatio || 1;

    const context = canvas.getContext('2d');

    if (!context) throw new Error('No se pudo inicializar el canvas del PDF');



    canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));

    canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));

    canvas.style.width = `${Math.floor(viewport.width)}px`;

    canvas.style.height = `${Math.floor(viewport.height)}px`;

    syncPdfSelectionLayerBounds(viewport.width, viewport.height, canvas);

    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

    context.clearRect(0, 0, viewport.width, viewport.height);



    state.currentPdfRenderTask = page.render({ canvasContext: context, viewport });

    await state.currentPdfRenderTask.promise;

    if (requestToken !== state.currentPdfRequestToken) return;



    if (state.currentPdfSelection) {

        const renderBook = (() => {

            try {

                const fileName = new URL(pdfUrl).pathname.split('/').pop() || '';

                return decodeURIComponent(fileName).replace(/\.pdf$/i, '');

            } catch (_) {

                return String((state.currentPdfSource || '').split('/').pop() || '').replace(/\.pdf$/i, '');

            }

        })();

        state.currentPdfSelection.renderBook = renderBook;

        state.currentPdfSelection.renderPageNum = pageNum;

    }

    if (resetScroll) {

        viewer.scrollTop = 0;

        viewer.scrollLeft = 0;

    }



    if (preserveViewport) {

        restoreViewerViewport(viewer, viewportSnapshot);

    }



    state.currentPdfRenderTask = null;

    setPdfStatus('', false);



    // Extraer texto de la página incondicionalmente para rellenar la caché.
    // Esto garantiza que runPdfHeaderOnlyDetection() siempre tiene datos disponibles
    // independientemente de si hay selección activa o no.
    try {
        const textContent = await page.getTextContent();
        if (requestToken === state.currentPdfRequestToken) {
            state.currentPdfLastTextItems = textContent.items || [];
            state.currentPdfLastViewport = viewport;
            state.currentPdfLastTextSource = state.currentPdfSource;
            state.currentPdfLastTextPageNumber = state.currentPdfPageNumber;
        }
    } catch (e) {
        console.warn('No se pudo extraer texto del PDF:', e);
    }

    // Renderizar overlay de selección (usa la caché ya populada).
    await renderPdfSelectionOverlay(page, viewport, requestToken)
        .catch(error => console.warn('No se pudo renderizar overlay del PDF:', error));

}



export async function loadPdfWithPage(book, page) {

    // Cancel any pending relayout RAF to avoid racing with this full load
    if (pdfRelayoutRafId) {
        cancelAnimationFrame(pdfRelayoutRafId);
        pdfRelayoutRafId = 0;
    }

    const pdfLabel = document.getElementById('pdfLabel');

    const pdfMeta = document.getElementById('pdfMeta');

    if (!pdfLabel) return;



    const bookClean = String(book).trim();

    const pageClean = String(page).trim();

    if (!bookClean || bookClean === 'â€”' || !pageClean || pageClean === 'â€”') {

        loadPdfClear();

        return;

    }



    const pageNum = parseInt(pageClean.replace(/[^0-9]/g, ''), 10);

    if (!Number.isFinite(pageNum) || pageNum <= 0) {

        loadPdfClear();

        return;

    }



    const pdfUrl = new URL(`pdf/${encodeURIComponent(bookClean)}.pdf`, new URL('.', window.location.href)).href;

    pdfLabel.textContent = `${bookClean} • pág ${pageClean}`;

    if (pdfMeta) pdfMeta.textContent = `${bookClean}-${pageClean}`;

    state.currentPdfPageNumber = pageNum;



    try {

        await renderPdfPage(pdfUrl, pageNum, { resetScroll: true });

    } catch (error) {

        if (isPdfRenderCancelledError(error)) return;

        console.error('Error cargando PDF:', error);

        setPdfStatus(`Error cargando PDF: ${error.message}`, true);

    }

}



export function loadPdfClear() {

    const canvas = document.getElementById('pdfCanvas');

    const pdfLabel = document.getElementById('pdfLabel');

    const pdfMeta = document.getElementById('pdfMeta');



    state.currentPdfRequestToken += 1;

    if (state.currentPdfRenderTask) {

        try {

            state.currentPdfRenderTask.cancel();

        } catch (error) {

            console.warn('No se pudo cancelar el render PDF actual:', error);

        }

        state.currentPdfRenderTask = null;

    }



    if (pdfLabel) pdfLabel.textContent = 'â€”';

    if (pdfMeta) pdfMeta.textContent = 'Selecciona libro y página para ver el PDF';

    state.currentPdfPageNumber = 0;

    state.currentPdfSelectionRects = [];

    state.currentPdfExperimentalRowHighlights = [];

    state.currentPdfExperimentalColumnDetection = null;

    state.currentPdfExperimentalRowSearch = null;

    state.currentPdfHeaderOnlyOverlay = [];

    state.currentPdfHeaderOnlyDebug = null;

    state.currentPdfHeaderColumnBodyHighlights = [];

    state.currentPdfHeaderColumnBodyDebug = null;

    state.currentPdfTableDebugOverlay = [];

    state.currentPdfTableParseResult = null;

    state.currentPdfLastTextItems = [];

    state.currentPdfLastViewport = null;

    state.currentPdfLastTextSource = '';

    state.currentPdfLastTextPageNumber = 0;

    window.dispatchEvent(new CustomEvent('pdf-table-parse-updated'));

    clearPdfSelectionLayer();



    if (canvas instanceof HTMLCanvasElement) {

        const context = canvas.getContext('2d');

        if (context) context.clearRect(0, 0, canvas.width, canvas.height);

        canvas.width = 0;

        canvas.height = 0;

        canvas.style.width = '0';

        canvas.style.height = '0';

    }



    setPdfStatus('Selecciona libro y página para ver el PDF', true);

}



export function setPdfReadTokens(tokens) {

    state.currentPdfReadTokens = tokens;

}


export function getPdfExperimentalBlueTexts({ dedupe = true } = {}) {

    const texts = normalizeExperimentalRowHighlights(state.currentPdfExperimentalRowHighlights)
        .filter((item) => {
            const kind = String(item?.kind || '').trim().toLowerCase();
            return kind === 'blue-token' || kind === 'blue-token-pn';
        })
        .map((item) => String(item?.text || '').trim())
        .filter(Boolean);

    return dedupe ? Array.from(new Set(texts)) : texts;

}


export function getPdfExperimentalColumnTexts({ dedupe = true } = {}) {

    if (!PDF_EXPERIMENTAL_COLUMN_FEATURES_ENABLED) {
        return {
            status: 'disabled',
            message: 'La detección experimental de columnas está desactivada.',
            confidence: 'low',
            columns: { pos: [], part_no: [], designation: [], qty: [], remarks: [], unknown: [] },
            regions: [],
            assignments: [],
            header: null
        };
    }

    const detection = state.currentPdfExperimentalColumnDetection;
    if (!detection || typeof detection !== 'object') {
        return {
            status: 'no-data',
            message: 'No hay detección de columnas disponible.',
            confidence: 'low',
            columns: { pos: [], part_no: [], designation: [], qty: [], remarks: [], unknown: [] },
            regions: [],
            assignments: [],
            header: null
        };
    }

    const sourceColumns = detection.columns || {};
    const keys = ['pos', 'part_no', 'designation', 'qty', 'remarks', 'unknown'];
    const columns = {};

    keys.forEach((key) => {
        const values = Array.isArray(sourceColumns[key]) ? sourceColumns[key] : [];
        columns[key] = dedupe ? Array.from(new Set(values)) : [...values];
    });

    return {
        status: String(detection.status || 'no-data'),
        message: String(detection.message || ''),
        confidence: String(detection.confidence || 'low'),
        columns,
        regions: Array.isArray(detection.regions) ? detection.regions : [],
        assignments: Array.isArray(detection.assignments) ? detection.assignments : [],
        header: detection.header || null
    };

}


window.getPdfExperimentalBlueTexts = getPdfExperimentalBlueTexts;
window.getPdfExperimentalColumnTexts = getPdfExperimentalColumnTexts;
window.setPdfHeaderDebugMode = setPdfHeaderDebugMode;

// ─── Exports del parser tabular (Fase 1-3) ───────────────────────────────────

/**
 * Activa o desactiva el overlay de debug tabular.
 * Cuando se activa, el overlay se recalcula en cada render de página.
 */
export function enablePdfTableDebug(enabled) {
    void enabled;
    state.pdfTableDebugEnabled = false;
    state.currentPdfTableDebugOverlay = [];
    state.currentPdfTableParseResult = null;
    state.currentPdfHeaderDetection = null;
}

// Backward-compatible API used by analista-02.js
export function setPdfTableParserDebugEnabled(enabled, options = {}) {
    void options;
    enablePdfTableDebug(enabled);
}

/**
 * Devuelve los textItems y viewport de la última página renderizada.
 * Útil para que módulos externos puedan correr el parser sin re-renderizar.
 */
export function getPdfLastPageData() {
    return {
        textItems: state.currentPdfLastTextItems || [],
        viewport: state.currentPdfLastViewport || null,
    };
}

/**
 * Devuelve el número total de páginas del PDF actualmente cargado.
 * Devuelve 0 si todavía no hay documento PDF cargado.
 */
export function getCurrentPdfPageCount() {
    const doc = state.currentPdfDocument;
    if (!doc) return 0;
    const num = Number(doc.numPages || 0);
    return Number.isFinite(num) && num > 0 ? num : 0;
}

/**
 * Devuelve el resultado completo del último parse tabular.
 */
export function getPdfTableParseResult() {
    return state.currentPdfTableParseResult || null;
}

/**
 * Borra el overlay de debug tabular sin desactivar el modo debug.
 */
export function clearPdfTableDebugOverlay() {
    state.currentPdfTableDebugOverlay = [];
}

/**
 * Activa o desactiva el modo de debug SOLO de headers.
 * 'headers-only': solo muestra headers BOM detectados
 * null: desactiva el modo
 */
export function setPdfHeaderDebugMode(mode) {
    void mode;
    state.pdfHeaderDebugMode = null;
    state.currentPdfHeaderDetection = null;
}

/**
 * Devuelve el resultado de detección de headers del último parse.
 */
export function getPdfHeaderDetection() {
    return PDF_EXPERIMENTAL_COLUMN_FEATURES_ENABLED ? (state.currentPdfHeaderDetection || null) : null;
}

// All expected header keys, used to report missing headers.
const HEADER_DETECTION_ALL_KEYS = ['pos', 'part_no', 'designation', 'model_type', 'qty', 'units', 'weight', 'fn', 'measurement', 'standard'];

// Maps each header key to a CSS kind token.
const HEADER_KEY_TO_KIND = {
    pos: 'header-pos',
    part_no: 'header-part-no',
    designation: 'header-designation',
    model_type: 'header-model-type',
    qty: 'header-qty',
    units: 'header-units',
    weight: 'header-weight',
    fn: 'header-fn',
    measurement: 'header-measurement',
    standard: 'header-standard'
};

const HEADER_SPLIT_PAIRS = [
    {
        leftKey: 'pos',
        rightKey: 'part_no',
        leftTokens: ['pos'],
        rightTokens: ['part no', 'part no.', 'part number', 'partnumber', 'pn']
    },
    {
        leftKey: 'designation',
        rightKey: 'model_type',
        leftTokens: ['designation', 'description', 'denomination', 'designacion', 'descripcion'],
        rightTokens: ['model/type', 'model type', 'modeltype', 'model typ']
    },
    {
        leftKey: 'fn',
        rightKey: 'measurement',
        leftTokens: ['fn', 'footnote', 'f.n.', 'f n', 'f.n'],
        rightTokens: ['measurement', 'measure', 'meas', 'measurement / standard', 'measurement/standard']
    },
    {
        leftKey: 'units',
        rightKey: 'weight',
        leftTokens: ['units', 'unit'],
        rightTokens: ['weight', 'wt', 'wgt']
    }
];

function trimHeaderBoundsWhitespace(bounds) {
    if (!bounds) return null;

    const rawText = String(bounds.text || '');
    const trimmedText = rawText.trim();
    const left = Number(bounds.left || 0);
    const top = Number(bounds.top || 0);
    const width = Math.max(1, Number(bounds.width || 0));
    const height = Math.max(12, Number(bounds.height || 12));

    if (!rawText || !trimmedText || rawText === trimmedText) {
        return { left, top, width, height, text: trimmedText || rawText };
    }

    const leading = (rawText.match(/^\s+/) || [''])[0].length;
    const trailing = (rawText.match(/\s+$/) || [''])[0].length;
    const total = rawText.length;

    if (total <= 0 || leading + trailing <= 0 || leading + trailing >= total) {
        return { left, top, width, height, text: trimmedText || rawText };
    }

    const startRatio = leading / total;
    const endRatio = (total - trailing) / total;
    const nextLeft = left + (width * startRatio);
    const nextRight = left + (width * endRatio);

    return {
        left: nextLeft,
        top,
        width: Math.max(8, nextRight - nextLeft),
        height,
        text: trimmedText
    };
}

function findHeaderTokenIndex(source, variants) {
    const normalizedSource = normalizePdfHeaderText(source);
    if (!normalizedSource) return { index: -1, token: '' };

    let bestIndex = -1;
    let bestToken = '';

    (variants || []).forEach((variant) => {
        const token = normalizePdfHeaderVariant(variant);
        if (!token) return;
        const index = normalizedSource.indexOf(token);
        if (index < 0) return;
        if (bestIndex < 0 || index < bestIndex) {
            bestIndex = index;
            bestToken = token;
        }
    });

    return { index: bestIndex, token: bestToken };
}

function refineCombinedHeaderBounds(match, key) {
    const bounds = match?.bounds || match?.cluster;
    if (!bounds) return null;

    const left = Number(bounds.left || 0);
    const top = Number(bounds.top || 0);
    const width = Math.max(1, Number(bounds.width || 0));
    const height = Math.max(12, Number(bounds.height || 12));
    const text = String((match?.bounds?.text || match?.cluster?.text || '')).trim();

    if (!text || width < 24) {
        return trimHeaderBoundsWhitespace({ left, top, width, height, text });
    }

    const normalizedText = normalizePdfHeaderText(text);
    if (!normalizedText) {
        return trimHeaderBoundsWhitespace({ left, top, width, height, text });
    }

    for (const pair of HEADER_SPLIT_PAIRS) {
        if (key !== pair.leftKey && key !== pair.rightKey) continue;

        const leftMatch = findHeaderTokenIndex(normalizedText, pair.leftTokens);
        const rightMatch = findHeaderTokenIndex(normalizedText, pair.rightTokens);

        if (leftMatch.index < 0 || rightMatch.index < 0) continue;
        if (leftMatch.index === rightMatch.index) continue;

        const firstIsLeft = leftMatch.index < rightMatch.index;
        const first = firstIsLeft ? leftMatch : rightMatch;
        const second = firstIsLeft ? rightMatch : leftMatch;

        const sourceLen = Math.max(1, normalizedText.length);
        const firstEnd = Math.min(sourceLen, first.index + Math.max(1, first.token.length));
        // Use end-of-left-token and start-of-right-token as split edges (not midpoint),
        // so neither box includes the space character between the two tokens.
        const leftEndRatio = Math.max(0.1, Math.min(0.9, firstEnd / sourceLen));
        const rightStartRatio = Math.max(0.1, Math.min(0.9, second.index / sourceLen));
        const leftEndX = left + (width * leftEndRatio);
        const rightStartX = left + (width * rightStartRatio);

        const visibleLeftKey = firstIsLeft ? pair.leftKey : pair.rightKey;
        const visibleRightKey = firstIsLeft ? pair.rightKey : pair.leftKey;

        if (key === visibleLeftKey) {
            return trimHeaderBoundsWhitespace({
                left,
                top,
                width: Math.max(10, leftEndX - left),
                height,
                text
            });
        }

        if (key === visibleRightKey) {
            return trimHeaderBoundsWhitespace({
                left: rightStartX,
                top,
                width: Math.max(10, (left + width) - rightStartX),
                height,
                text
            });
        }
    }

    return trimHeaderBoundsWhitespace({ left, top, width, height, text });
}

/**
 * Detector mínimo de headers BOM.
 * Detecta la fila de cabecera y devuelve highlights coloreados por tipo + info de debug.
 * No detecta columnas ni parsea filas.
 */
export function runPdfHeaderOnlyDetection() {
    const { textItems, viewport } = getPdfLastPageData();
    if (!textItems || !textItems.length || !viewport) {
        state.currentPdfHeaderOnlyOverlay = [];
        state.currentPdfHeaderOnlyDebug = { error: 'no-page-data', entries: [] };
        requestPdfRelayout();
        return state.currentPdfHeaderOnlyDebug;
    }

    const rects = extractPdfTextRects(textItems, viewport);
    if (!rects.length) {
        state.currentPdfHeaderOnlyOverlay = [];
        state.currentPdfHeaderOnlyDebug = { error: 'no-rects', entries: [] };
        requestPdfRelayout();
        return state.currentPdfHeaderOnlyDebug;
    }

    const lineGroups = buildLineGroups(rects);
    const detection = detectHeaderLineGroups(lineGroups, null);

    const highlights = [];
    const foundKeys = new Set();

    // Best match per key (highest score wins).
    const bestByKey = new Map();
    if (detection.headerLine && detection.matches.length) {
        detection.matches.forEach((match) => {
            const key = match.key;
            const prev = bestByKey.get(key);
            if (!prev || match.score > prev.score) bestByKey.set(key, match);
        });
    }

    const entries = [];

    bestByKey.forEach((match, key) => {
        const bounds = refineCombinedHeaderBounds(match, key);
        if (!bounds) return;
        const top = Number(bounds.top || 0);
        const left = Number(bounds.left || 0);
        const width = Number(bounds.width || 0);
        const height = Number(bounds.height || 12);
        const kind = HEADER_KEY_TO_KIND[key] || 'orange-header-token';
        foundKeys.add(key);
        highlights.push({
            left: Math.max(0, left - 3),
            top: Math.max(0, top - 3),
            width: Math.max(18, width + 8),
            height: Math.max(14, height + 8),
            text: String(bounds.text || '').trim(),
            kind
        });
        entries.push({
            text: String(bounds.text || '').trim(),
            key,
            label: match.label,
            variant: match.variant,
            x0: Math.round(left),
            x1: Math.round(left + width),
            y0: Math.round(top),
            y1: Math.round(top + height),
            confidence: match.score >= 1 ? 'exact' : match.score >= 0.7 ? 'contains' : 'partial',
            score: match.score,
            method: 'header-line-group',
            found: true
        });
    });

    // Report missing keys (no position).
    HEADER_DETECTION_ALL_KEYS.forEach((key) => {
        if (!foundKeys.has(key)) {
            const def = PDF_HEADER_COLUMN_PATTERNS.find((p) => p.key === key);
            entries.push({
                text: '',
                key,
                label: def ? def.label : key.toUpperCase(),
                variant: '',
                x0: null, x1: null, y0: null, y1: null,
                confidence: 'missing',
                score: 0,
                method: 'header-line-group',
                found: false
            });
        }
    });

    // Sort detected entries by x0; missing go to the end.
    entries.sort((a, b) => {
        if (a.found && b.found) return a.x0 - b.x0;
        if (a.found) return -1;
        return 1;
    });

    state.currentPdfHeaderOnlyOverlay = highlights;
    state.currentPdfHeaderOnlyDebug = {
        error: null,
        confidence: detection.confidence,
        headerLineCenterY: Number(detection.headerLine?.centerY || 0),
        matchCount: foundKeys.size,
        entries
    };

    requestPdfRelayout();
    return state.currentPdfHeaderOnlyDebug;
}

/**
 * Borra el overlay de header-only sin relanzar detección.
 */
export function clearPdfHeaderOnlyOverlay() {
    state.currentPdfHeaderOnlyOverlay = [];
    state.currentPdfHeaderOnlyDebug = null;
    // Limpiar también el body highlighting al limpiar headers
    state.currentPdfHeaderColumnBodyHighlights = [];
    state.currentPdfHeaderColumnBodyDebug = null;
    requestPdfRelayout();
}

/**
 * Fase experimental: colorea los textos del cuerpo de tabla por columnas.
 * Las columnas se definen usando los límites izquierdos (x0) de los headers detectados.
 * Cada texto del cuerpo se pinta con el color del header de su columna.
 */
/**
 * Devuelve true si el texto parece un Part Number.
 * Regla endurecida: sin espacios y con patrones fuertes de PN.
 */
function isLikelyPartNumber(text) {
    if (!text) return false;
    const t = text.trim();
    if (t.length < 3 || t.length > 40) return false;
    if (/\s/.test(t)) return false;

    const upper = t.toUpperCase();
    const designationWords = [
        'PRESSURE', 'SENSOR', 'WIRING', 'HARNESS', 'BUSHING', 'THREADED',
        'WASHER', 'TEMPERATURE', 'CONNECTOR', 'PLUG', 'COUPLING'
    ];
    if (designationWords.some((w) => upper.includes(w))) return false;

    const digitCount = (t.match(/\d/g) || []).length;
    const compactAlphaNum = /^[A-Z0-9][A-Z0-9\-./]{7,}$/i.test(t);

    if (/^X00/i.test(t)) return true;
    if (/^000/.test(t)) return true;
    if (/\d{6,}/.test(t)) return true;
    if (compactAlphaNum && digitCount >= 4) return true;

    return false;
}

/**
 * Devuelve true si el texto parece DESIGNATION (descripción) y no PN compacto.
 */
function isLikelyDesignationText(text) {
    if (!text) return false;
    const t = String(text).trim();
    if (!t) return false;

    const upper = t.toUpperCase();
    const hasSpaces = /\s/.test(t);
    const longWords = upper.match(/[A-Z]{6,}/g) || [];
    const designationWords = [
        'PRESSURE', 'SENSOR', 'WIRING', 'HARNESS', 'BUSHING', 'THREADED',
        'WASHER', 'TEMPERATURE', 'CONNECTOR', 'PLUG', 'COUPLING',
        'VALVE', 'SWITCH', 'FILTER', 'ASSEMBLY', 'HOUSING'
    ];
    const hasDesignationWord = designationWords.some((w) => upper.includes(w));
    const manyLetters = (upper.match(/[A-Z]/g) || []).length >= 6;

    if (hasSpaces) return true;
    if (longWords.length > 0) return true;
    if (hasDesignationWord) return true;
    if (t.length > 14 && manyLetters) return true;
    return false;
}

const PDF_ALLOWED_FN_CODES = new Set([
    'AB',
    'AC',
    'ACN',
    'EM',
    'EMN',
    'KD',
    'KE',
    'KF',
    'KFN',
    'M',
    'MN',
    'MUB',
    'NN',
    'P',
    'SB',
    'UA',
    'UB'
]);

/**
 * Devuelve true si el texto parece un token de columna FN.
 * Solo acepta codigos canonicos permitidos (incluye combinaciones como AB EM).
 */
function isLikelyFnToken(text) {
    if (!text) return false;
    const t = String(text).trim().replace(/\s+/g, ' ').toUpperCase();
    if (!t || t.length > 14) return false;
    if (/\d/.test(t)) return false;
    if (/[\/\-=,\.]/.test(t)) return false;
    if (/\b(?:G|KG|MM|CM|BAR|PSI|PC|PCS)\b/.test(t)) return false;

    const tokens = t.split(/\s+/).filter(Boolean);
    if (tokens.length < 1 || tokens.length > 3) return false;
    if (tokens.some((tok) => !PDF_ALLOWED_FN_CODES.has(tok))) return false;
    return true;
}

/**
 * Señal inversa para FN: cuando parece measurement técnico, no debe tratarse como FN.
 */
function isLikelyMeasurementTechnicalText(text) {
    if (!text) return false;
    const t = String(text).trim().toUpperCase();
    if (!t) return false;
    if (/\d/.test(t)) return true;
    if (/[\/\-,]/.test(t)) return true;
    if (/\b(?:G|KG|MM|CM|M|BAR|PSI|PC|PCS|NM|KW|HZ|V|A)\b/.test(t)) return true;
    if (t.length > 8) return true;
    return false;
}

/**
 * Filtra ruido de footer típico de PDFs impresos/exportados.
 */
function isPdfFooterNoise(text, rect, pageInfo) {
    if (!text || !rect || !pageInfo) return false;
    const t = String(text).trim();
    if (!t) return false;
    const lower = t.toLowerCase();
    const keywords = [
        'business portal online print',
        'mtu friedrichshafen',
        'page:'
    ];
    if (keywords.some((k) => lower.includes(k))) return true;
    if (t.includes('©')) return true;

    const rectTop = rect.top - rect.height;
    const tableBottom = Number(pageInfo.tableBottom || 0);
    const pageHeight = Number(pageInfo.pageHeight || 0);

    if (tableBottom > 0 && rectTop >= tableBottom + 6) return true;
    if (pageHeight > 0 && rectTop >= pageHeight * 0.92) return true;
    return false;
}

/**
 * Calcula el ratio de solapamiento horizontal entre un rect y un rango de columna.
 * Devuelve un valor en [0, 1]: fracción del ancho del rect solapada con la columna.
 */
function computeRectColumnOverlap(rectLeft, rectWidth, colX0, colX1) {
    if (rectWidth <= 0) return 0;
    const rectRight = rectLeft + rectWidth;
    const overlapLeft = Math.max(rectLeft, colX0);
    const overlapRight = Math.min(rectRight, colX1);
    const overlapWidth = Math.max(0, overlapRight - overlapLeft);
    return overlapWidth / rectWidth;
}

/**
 * Divide visualmente rects combinados WEIGHT+FN del estilo "105,200 g AB".
 * Devuelve null si no parece un combinado.
 */
function splitWeightFnCombinedRect(text, rect, columns) {
    if (!text || !rect || !columns || !columns.length) return null;
    const raw = String(text).trim();
    const match = raw.match(/^(.+?\b(?:g|kg|pc)\b)\s+([A-Z]{1,4}(?:\s+[A-Z]{1,4}){0,2})$/i);
    if (!match) return null;

    const weightText = (match[1] || '').trim();
    const fnText = (match[2] || '').trim();
    if (!weightText || !fnText) return null;

    const fnTokens = fnText.split(/\s+/).filter(Boolean);
    if (fnTokens.length === 0 || fnTokens.some((tok) => !isLikelyFnToken(tok))) return null;

    const fnColumn = columns.find((c) => c.key === 'fn');
    const totalLen = Math.max(1, raw.length);
    const ratio = Math.max(0.2, Math.min(0.9, weightText.length / totalLen));
    let splitX = rect.left + rect.width * ratio;
    if (fnColumn && Number.isFinite(fnColumn.x0)) {
        splitX = Math.max(splitX, fnColumn.x0 - 2);
    }

    const rectRight = rect.left + rect.width;
    const weightWidth = Math.max(8, splitX - rect.left);
    const fnWidth = Math.max(8, rectRight - splitX);

    return {
        splitType: 'weight_fn',
        originalText: raw,
        splitMethod: 'proportional',
        splitX,
        weightText,
        fnText,
        parts: [
            {
                text: weightText,
                normalizedText: normalizePdfToken(weightText),
                left: rect.left,
                top: rect.top,
                width: weightWidth,
                height: rect.height,
                centerY: rect.centerY,
                _forcedKey: 'weight',
                _splitInfo: {
                    splitFromCombined: true,
                    splitType: 'weight_fn',
                    originalText: raw,
                    splitX,
                    splitMethod: 'proportional',
                    weightText,
                    fnText
                }
            },
            {
                text: fnText,
                normalizedText: normalizePdfToken(fnText),
                left: splitX,
                top: rect.top,
                width: fnWidth,
                height: rect.height,
                centerY: rect.centerY,
                _forcedKey: 'fn',
                _splitInfo: {
                    splitFromCombined: true,
                    splitType: 'weight_fn',
                    originalText: raw,
                    splitX,
                    splitMethod: 'proportional',
                    weightText,
                    fnText
                }
            }
        ]
    };
}

/**
 * Divide visualmente rects combinados WEIGHT + FN + MEASUREMENT.
 * Ejemplo: "120.000 g AB 1X2X0.60MM / G/NV".
 */
function splitWeightFnMeasurementCombinedRect(text, rect, columns) {
    if (!text || !rect || !columns || !columns.length) return null;
    const raw = String(text).trim().replace(/\s+/g, ' ');
    const match = raw.match(/^(.+?\b(?:g|kg|pc|pcs)\b)\s+([A-Z]{1,4}(?:\s+[A-Z]{1,4}){0,2})\s+(.+)$/i);
    if (!match) return null;

    const weightText = (match[1] || '').trim();
    const fnText = (match[2] || '').trim();
    const measurementText = (match[3] || '').trim();
    if (!weightText || !fnText || !measurementText) return null;
    if (!isLikelyFnToken(fnText)) return null;
    if (!isLikelyMeasurementTechnicalText(measurementText)) return null;

    const totalLen = Math.max(1, raw.length);
    const weightRatio = Math.max(0.15, Math.min(0.75, weightText.length / totalLen));
    let splitX = rect.left + rect.width * weightRatio;

    const fnColumn = columns.find((c) => c.key === 'fn');
    if (fnColumn && Number.isFinite(fnColumn.x0)) {
        splitX = Math.max(splitX, fnColumn.x0 - 2);
    }

    const rectRight = rect.left + rect.width;
    splitX = Math.max(rect.left + 8, Math.min(rectRight - 8, splitX));
    const weightWidth = Math.max(8, splitX - rect.left);
    const rightWidth = Math.max(8, rectRight - splitX);

    const fnMeasurementText = `${fnText} ${measurementText}`.trim();

    return {
        splitType: 'weight_fn_measurement',
        originalText: raw,
        splitMethod: 'proportional',
        splitX,
        weightText,
        fnText,
        measurementText,
        parts: [
            {
                text: weightText,
                normalizedText: normalizePdfToken(weightText),
                left: rect.left,
                top: rect.top,
                width: weightWidth,
                height: rect.height,
                centerY: rect.centerY,
                _forcedKey: 'weight',
                _splitInfo: {
                    splitFromCombined: true,
                    splitType: 'weight_fn_measurement',
                    originalText: raw,
                    splitX,
                    splitMethod: 'proportional',
                    weightText,
                    fnText,
                    measurementText
                }
            },
            {
                text: fnMeasurementText,
                normalizedText: normalizePdfToken(fnMeasurementText),
                left: splitX,
                top: rect.top,
                width: rightWidth,
                height: rect.height,
                centerY: rect.centerY,
                _splitInfo: {
                    splitFromCombined: true,
                    splitType: 'weight_fn_measurement',
                    originalText: raw,
                    splitX,
                    splitMethod: 'proportional',
                    weightText,
                    fnText,
                    measurementText
                }
            }
        ]
    };
}

/**
 * Divide visualmente un textRect combinado usando la frontera entre dos columnas.
 * Caso principal: FN + MEASUREMENT cuando un texto cruza x0 de MEASUREMENT.
 */
function splitCombinedRectAtColumnBoundary(text, rect, leftColumn, rightColumn, options = {}) {
    const raw = String(text || '').trim().replace(/\s+/g, ' ');
    const boundary = options.boundary || 'fn_measurement';
    const maxDistancePx = Number.isFinite(options.maxDistancePx) ? options.maxDistancePx : 12;
    const leftValidator = typeof options.leftValidator === 'function' ? options.leftValidator : isLikelyFnToken;
    const rightDisallowValidator = typeof options.rightDisallowValidator === 'function'
        ? options.rightDisallowValidator
        : isLikelyFnToken;

    const result = {
        splitType: 'column_boundary_space',
        boundary,
        boundaryX: Number.isFinite(rightColumn?.x0) ? rightColumn.x0 : null,
        splitSpaceIndex: null,
        splitSpaceX: null,
        splitDistancePx: null,
        leftText: null,
        rightText: null,
        splitAccepted: false,
        splitRejectedReason: null,
        parts: null
    };

    if (!raw || !rect || !leftColumn || !rightColumn) {
        result.splitRejectedReason = 'missing-input';
        return result;
    }

    const leftKey = String(leftColumn.key || '').toLowerCase();
    const rightKey = String(rightColumn.key || '').toLowerCase();
    if (!(leftKey === 'fn' && rightKey === 'measurement')) {
        result.splitRejectedReason = 'unsupported-boundary';
        return result;
    }

    if (!Number.isFinite(result.boundaryX)) {
        result.splitRejectedReason = 'invalid-boundary-x';
        return result;
    }

    const rectRight = rect.left + rect.width;
    if (!(rect.left < result.boundaryX && rectRight > result.boundaryX)) {
        result.splitRejectedReason = 'rect-does-not-cross-boundary';
        return result;
    }

    if (!/\s/.test(raw)) {
        result.splitRejectedReason = 'no-space-in-text';
        return result;
    }

    const spaceIndices = [];
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] === ' ') spaceIndices.push(i);
    }
    if (spaceIndices.length === 0) {
        result.splitRejectedReason = 'no-splittable-space';
        return result;
    }

    const textLen = Math.max(1, raw.length);
    let bestSpaceIndex = null;
    let bestSpaceX = null;
    let bestDistance = Infinity;

    spaceIndices.forEach((spaceIdx) => {
        const charX = rect.left + rect.width * (spaceIdx / textLen);
        const distance = Math.abs(charX - result.boundaryX);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestSpaceIndex = spaceIdx;
            bestSpaceX = charX;
        }
    });

    result.splitSpaceIndex = bestSpaceIndex;
    result.splitSpaceX = bestSpaceX;
    result.splitDistancePx = Number.isFinite(bestDistance) ? Math.round(bestDistance * 100) / 100 : null;

    if (!Number.isFinite(bestDistance) || bestDistance > maxDistancePx) {
        result.splitRejectedReason = 'space-too-far-from-boundary';
        return result;
    }

    const leftText = raw.slice(0, bestSpaceIndex).trim();
    const rightText = raw.slice(bestSpaceIndex + 1).trim();
    result.leftText = leftText;
    result.rightText = rightText;

    if (!leftText || !rightText) {
        result.splitRejectedReason = 'empty-side-after-split';
        return result;
    }

    if (!leftValidator(leftText)) {
        result.splitRejectedReason = 'left-not-valid-fn';
        return result;
    }

    if (rightDisallowValidator(rightText)) {
        result.splitRejectedReason = 'right-looks-like-fn';
        return result;
    }

    // Caso ambiguo conocido: "M" aislada delante de una medida tecnica.
    // En ese escenario, no forzar split hacia FN; dejar que el bloque completo
    // se asigne por scoring normal a MEASUREMENT.
    if (leftText.toUpperCase() === 'M') {
        result.splitRejectedReason = 'left-ambiguous-single-m';
        return result;
    }

    const rightUpper = rightText.toUpperCase();
    const looksMeasurement =
        isLikelyMeasurementTechnicalText(rightText)
        || /\b(?:DIN|ISO|CODE|MM)\b/.test(rightUpper)
        || /\bM\d/.test(rightUpper)
        || /X/.test(rightUpper)
        || /[0-9/\-=\.]/.test(rightUpper)
        || rightUpper.length >= 10;

    if (!looksMeasurement) {
        result.splitRejectedReason = 'right-not-measurement-like';
        return result;
    }

    const splitX = Math.max(rect.left + 8, Math.min(rectRight - 8, bestSpaceX));
    const leftWidth = Math.max(8, splitX - rect.left);
    const rightWidth = Math.max(8, rectRight - splitX);

    result.splitAccepted = true;
    result.parts = [
        {
            text: leftText,
            normalizedText: normalizePdfToken(leftText),
            left: rect.left,
            top: rect.top,
            width: leftWidth,
            height: rect.height,
            centerY: rect.centerY,
            _forcedKey: leftKey,
            _splitInfo: {
                splitFromCombined: true,
                splitType: 'column_boundary_space',
                boundary,
                originalText: raw,
                boundaryX: result.boundaryX,
                splitSpaceIndex: result.splitSpaceIndex,
                splitSpaceX: result.splitSpaceX,
                splitDistancePx: result.splitDistancePx,
                splitAccepted: true,
                splitRejectedReason: null,
                leftText,
                rightText,
                splitX,
                splitMethod: 'boundary_space'
            }
        },
        {
            text: rightText,
            normalizedText: normalizePdfToken(rightText),
            left: splitX,
            top: rect.top,
            width: rightWidth,
            height: rect.height,
            centerY: rect.centerY,
            _forcedKey: rightKey,
            _splitInfo: {
                splitFromCombined: true,
                splitType: 'column_boundary_space',
                boundary,
                originalText: raw,
                boundaryX: result.boundaryX,
                splitSpaceIndex: result.splitSpaceIndex,
                splitSpaceX: result.splitSpaceX,
                splitDistancePx: result.splitDistancePx,
                splitAccepted: true,
                splitRejectedReason: null,
                leftText,
                rightText,
                splitX,
                splitMethod: 'boundary_space'
            }
        }
    ];

    return result;
}

/**
 * Divide visualmente rects combinados POS + PART NO.
 * Ejemplo: "1000 0005359960" -> ["1000", "0005359960"].
 */
function splitPosPartNoCombinedRect(text, rect, columns) {
    if (!text || !rect || !columns || !columns.length) return null;

    const raw = String(text).trim().replace(/\s+/g, ' ');
    const match = raw.match(/^(\d{2,5}[A-Z]?)\s+([A-Z0-9][A-Z0-9./-]{5,})$/i);
    if (!match) return null;

    const posText = (match[1] || '').trim();
    const pnText = (match[2] || '').trim();
    if (!posText || !pnText) return null;

    if (!/^\d{2,5}[A-Z]?$/.test(posText)) return null;
    if (!isLikelyPartNumber(pnText)) return null;

    const posColumn = columns.find((c) => c.key === 'pos');
    const partNoColumn = columns.find((c) => c.key === 'part_no');
    if (!posColumn || !partNoColumn) return null;

    const partNoOverlap = computeRectColumnOverlap(rect.left, rect.width, partNoColumn.x0, partNoColumn.x1);
    const posOverlap = computeRectColumnOverlap(rect.left, rect.width, posColumn.x0, posColumn.x1);
    const rectRight = rect.left + rect.width;
    const crossesBoundary = rect.left < partNoColumn.x0 && rectRight > partNoColumn.x0;
    const overlapBoth = posOverlap >= 0.08 && partNoOverlap >= 0.08;
    if (!crossesBoundary && !overlapBoth) return null;

    const splitRatio = Math.max(0.2, Math.min(0.8, posText.length / Math.max(1, raw.length)));
    let splitX = rect.left + rect.width * splitRatio;
    splitX = Math.max(rect.left + 8, Math.min(rectRight - 8, splitX));

    const posWidth = Math.max(8, splitX - rect.left);
    const pnWidth = Math.max(8, rectRight - splitX);

    return {
        splitType: 'pos_part_no',
        originalText: raw,
        splitMethod: 'proportional',
        splitX,
        posText,
        pnText,
        parts: [
            {
                text: posText,
                normalizedText: normalizePdfToken(posText),
                left: rect.left,
                top: rect.top,
                width: posWidth,
                height: rect.height,
                centerY: rect.centerY,
                _forcedKey: 'pos',
                _splitInfo: {
                    splitFromCombined: true,
                    splitType: 'pos_part_no',
                    originalText: raw,
                    posText,
                    pnText,
                    splitX,
                    splitMethod: 'proportional'
                }
            },
            {
                text: pnText,
                normalizedText: normalizePdfToken(pnText),
                left: splitX,
                top: rect.top,
                width: pnWidth,
                height: rect.height,
                centerY: rect.centerY,
                _forcedKey: 'part_no',
                _splitInfo: {
                    splitFromCombined: true,
                    splitType: 'pos_part_no',
                    originalText: raw,
                    posText,
                    pnText,
                    splitX,
                    splitMethod: 'proportional'
                }
            }
        ]
    };
}

/**
 * Divide visualmente rects combinados PART NO + DESIGNATION.
 * Ejemplo: "X00E50208388 PRESSURE SENSOR" -> ["X00E50208388", "PRESSURE SENSOR"]
 */
function splitPartNoDesignationCombinedRect(text, rect, columns) {
    if (!text || !rect || !columns || !columns.length) return null;
    const raw = String(text).trim();
    const match = raw.match(/^([A-Z0-9][A-Z0-9./-]{5,})\s+(.+)$/i);
    if (!match) return null;

    const pnText = (match[1] || '').trim();
    const designationText = (match[2] || '').trim();
    if (!pnText || !designationText) return null;
    if (!isLikelyPartNumber(pnText)) return null;
    if (!isLikelyDesignationText(designationText)) return null;

    // Evitar falsos positivos (solo unidades/peso/FN al final)
    if (/^(?:g|kg|pc|pcs|ea|lb|lbs)$/i.test(designationText)) return null;
    if (/^\d+[\d,\.]*\s*(?:g|kg|pc|pcs)?$/i.test(designationText)) return null;
    if (designationText.split(/\s+/).every((tok) => isLikelyFnToken(tok))) return null;

    const partNoColumn = columns.find((c) => c.key === 'part_no');
    const designationColumn = columns.find((c) => c.key === 'designation');
    if (!partNoColumn || !designationColumn) return null;

    const partNoOverlap = computeRectColumnOverlap(rect.left, rect.width, partNoColumn.x0, partNoColumn.x1);
    const designationOverlap = computeRectColumnOverlap(rect.left, rect.width, designationColumn.x0, designationColumn.x1);
    const rectRight = rect.left + rect.width;
    const crossesBoundary = rect.left < designationColumn.x0 && rectRight > designationColumn.x0;
    const overlapBoth = partNoOverlap >= 0.1 && designationOverlap >= 0.1;
    if (!crossesBoundary && !overlapBoth) return null;

    const splitRatio = Math.max(0.2, Math.min(0.8, pnText.length / Math.max(1, raw.length)));
    const splitMethod = 'proportional';
    const smallGap = 1;
    let splitX = rect.left + rect.width * splitRatio;
    splitX = Math.max(rect.left + 8, Math.min(rectRight - 8, splitX));

    const pnWidth = Math.max(8, splitX - rect.left - smallGap);
    const designationWidth = Math.max(8, rectRight - splitX - smallGap);

    return {
        splitType: 'part_no_designation',
        originalText: raw,
        splitMethod,
        splitX,
        pnText,
        designationText,
        parts: [
            {
                text: pnText,
                normalizedText: normalizePdfToken(pnText),
                left: rect.left,
                top: rect.top,
                width: pnWidth,
                height: rect.height,
                centerY: rect.centerY,
                _forcedKey: 'part_no',
                _splitInfo: {
                    splitFromCombined: true,
                    splitType: 'part_no_designation',
                    originalText: raw,
                    pnText,
                    designationText,
                    splitX,
                    splitMethod
                }
            },
            {
                text: designationText,
                normalizedText: normalizePdfToken(designationText),
                left: splitX + smallGap,
                top: rect.top,
                width: designationWidth,
                height: rect.height,
                centerY: rect.centerY,
                _forcedKey: 'designation',
                _splitInfo: {
                    splitFromCombined: true,
                    splitType: 'part_no_designation',
                    originalText: raw,
                    pnText,
                    designationText,
                    splitX,
                    splitMethod
                }
            }
        ]
    };
}

/**
 * Detecta y elimina una columna decorativa izquierda (flecha/icono) antes de POS.
 * Una columna es decorativa si es muy estrecha (<20px) o su clave no es reconocida.
 */
function filterDecorativeLeftColumns(columns) {
    if (columns.length < 2) {
        return { filteredColumns: columns, decorativeColumnIgnored: false, decorativeColumn: null };
    }
    const first = columns[0];
    const knownKeys = ['pos', 'part_no', 'designation', 'model_type', 'qty', 'units', 'weight', 'fn', 'measurement', 'standard'];
    const firstWidth = first.x1 - first.x0;
    const isNarrow = firstWidth < 20;
    const isUnknown = !knownKeys.includes(first.key);
    if (isNarrow || isUnknown) {
        return { filteredColumns: columns.slice(1), decorativeColumnIgnored: true, decorativeColumn: first };
    }
    return { filteredColumns: columns, decorativeColumnIgnored: false, decorativeColumn: null };
}

/**
 * Fase experimental: colorea los textos del cuerpo de tabla por columnas.
 * Las columnas se definen usando los límites izquierdos (x0) de los headers detectados.
 * Aplica heurísticas para PART NO. (isLikelyPartNumber) y FN (isLikelyFnToken),
 * detecta columnas decorativas izquierdas y marca candidatos multiline en debug.
 */
export function buildHeaderColumnBodyHighlights() {
    const headerDebug = state.currentPdfHeaderOnlyDebug;
    const textItems = state.currentPdfLastTextItems || [];
    const viewport = state.currentPdfLastViewport;

    // Validar precondiciones
    if (!headerDebug || !headerDebug.entries || headerDebug.entries.length === 0) {
        state.currentPdfHeaderColumnBodyHighlights = [];
        state.currentPdfHeaderColumnBodyDebug = {
            error: 'no-headers-detected',
            message: 'Ejecuta primero "Detectar Headers" para usar esta funcionalidad.',
            columnCount: 0,
            textCount: 0,
            highlightCount: 0,
            assignedByColumn: {},
            ignoredRects: 0,
            warnings: []
        };
        return state.currentPdfHeaderColumnBodyDebug;
    }

    if (!textItems || !textItems.length || !viewport) {
        state.currentPdfHeaderColumnBodyHighlights = [];
        state.currentPdfHeaderColumnBodyDebug = {
            error: 'no-text-data',
            message: 'No hay datos de texto disponibles en la página actual.',
            columnCount: 0,
            textCount: 0,
            highlightCount: 0,
            assignedByColumn: {},
            ignoredRects: 0,
            warnings: []
        };
        return state.currentPdfHeaderColumnBodyDebug;
    }

    // Extraer headers encontrados (con x0, y0, y1) ordenados por x0
    const foundHeaders = headerDebug.entries.filter((entry) => entry.found && entry.x0 !== null);
    if (!foundHeaders.length) {
        state.currentPdfHeaderColumnBodyHighlights = [];
        state.currentPdfHeaderColumnBodyDebug = {
            error: 'no-found-headers',
            message: 'Ningún header fue detectado exitosamente.',
            columnCount: 0,
            textCount: 0,
            highlightCount: 0,
            assignedByColumn: {},
            ignoredRects: 0,
            warnings: ['Se detectaron headers pero ninguno fue validado.']
        };
        return state.currentPdfHeaderColumnBodyDebug;
    }

    // Definir columnas a partir del x0 de cada header
    const rawColumns = foundHeaders.map((header, idx) => {
        const nextHeader = foundHeaders[idx + 1];
        const x1 = nextHeader ? nextHeader.x0 : Math.max(1, viewport.width);
        return {
            key: header.key,
            label: header.label,
            x0: header.x0,
            x1: x1,
            headerY0: header.y0,
            headerY1: header.y1,
            kind: HEADER_KEY_TO_KIND[header.key] || 'orange-header-token'
        };
    });

    // Filtrar columna decorativa izquierda (flecha/icono antes de POS)
    const { filteredColumns: columns, decorativeColumnIgnored, decorativeColumn } =
        filterDecorativeLeftColumns(rawColumns);

    // Calcular límite inferior de headers para definir "cuerpo"
    const headerMaxY1 = Math.max(...foundHeaders.map((h) => h.y1 || 0), 0);
    const bodyMargin = Math.max(2, Math.round(Math.min(...foundHeaders.map((h) => h.y1 - h.y0), 20) * 0.25));
    const bodyTop = headerMaxY1 + bodyMargin;

    // Extraer rects de texto del cuerpo
    const rects = extractPdfTextRects(textItems, viewport);
    const pageWidth = viewport.width || 500;
    const pageHeight = viewport.height || 0;

    // Delimitar horizontalmente el área de tabla para no arrastrar notas/pie fuera de columnas.
    const tableLeft = columns.length > 0 ? (columns[0].x0 - 6) : 0;
    const tableRight = columns.length > 0 ? (columns[columns.length - 1].x1 + 6) : pageWidth;

    const candidateBodyRects = rects.filter((rect) => {
        const rectTop = rect.top - rect.height;
        const rectRight = rect.left + rect.width;
        const inVerticalBand = rectTop >= bodyTop && rect.top < pageHeight;
        const intersectsTableBand = rectRight >= tableLeft && rect.left <= tableRight;
        return inVerticalBand && intersectsTableBand;
    });

    // Recorte inferior dinámico: buscar la última franja "densa" de texto de tabla.
    const densityBinSize = 8;
    const densityBins = new Map();
    candidateBodyRects.forEach((rect) => {
        const cy = rect.top - rect.height / 2;
        const bin = Math.round(cy / densityBinSize) * densityBinSize;
        densityBins.set(bin, (densityBins.get(bin) || 0) + 1);
    });

    const minDenseCount = 2;
    const sortedBins = Array.from(densityBins.entries()).sort((a, b) => a[0] - b[0]);
    let lastDenseY = null;
    sortedBins.forEach(([binY, count]) => {
        if (binY >= bodyTop && count >= minDenseCount) {
            lastDenseY = binY;
        }
    });

    const pageBottomSafety = pageHeight - Math.max(26, Math.round(pageHeight * 0.04));
    let bodyBottom = Math.max(bodyTop + 40, pageBottomSafety);
    if (lastDenseY !== null) {
        bodyBottom = Math.min(bodyBottom, lastDenseY + Math.max(18, densityBinSize * 2));
    }

    const bodyRects = candidateBodyRects.filter((rect) => rect.top <= bodyBottom);
    const footerRectsIgnored = Math.max(0, candidateBodyRects.length - bodyRects.length);

    const partNoColumn = columns.find((c) => c.key === 'part_no') || null;
    const designationColumn = columns.find((c) => c.key === 'designation') || null;
    const weightColumn = columns.find((c) => c.key === 'weight') || null;
    const fnColumn = columns.find((c) => c.key === 'fn') || null;
    const measurementColumn = columns.find((c) => c.key === 'measurement') || null;
    const standardColumn = columns.find((c) => c.key === 'standard') || null;

    // Límite izquierdo de la primera columna: rects más a la izq se omiten en nearest-fallback
    const leftmostColumnX0 = columns.length > 0 ? columns[0].x0 : 0;

    // Asignar textos a columnas y generar highlights
    // Safety cap to avoid freezing the UI on pathological PDFs, but high enough
    // to paint the full table body in normal pages.
    const MAX_HIGHLIGHTS = 2000;
    const highlights = [];
    const assignedByColumn = new Map();
    const rectDebugList = [];
    const weightFnMeasurementSplits = [];
    const posPartNoSplits = [];
    const partNoDesignationSplits = [];
    const columnBoundarySplits = [];
    const measurementStandardBoundaryWarnings = [];
    const footerNoiseIgnoredExamples = [];
    let footerNoiseIgnoredCount = 0;
    let fnMeasurementCorrectionsCount = 0;
    let ignoredCount = 0;

    bodyRects.forEach((rect) => {
        if (highlights.length >= MAX_HIGHLIGHTS) return;

        // Ignorar rects vacíos o muy pequeños
        if (!rect.text || rect.text.trim().length === 0) {
            ignoredCount++;
            return;
        }
        if (rect.width < 4 || rect.height < 4) {
            ignoredCount++;
            return;
        }
        if (isPdfFooterNoise(rect.text, rect, { pageHeight, tableBottom: bodyBottom })) {
            footerNoiseIgnoredCount++;
            if (footerNoiseIgnoredExamples.length < 8) {
                footerNoiseIgnoredExamples.push(String(rect.text || '').trim());
            }
            ignoredCount++;
            return;
        }

        // Orden de splits: 1) WEIGHT+FN+MEASUREMENT 2) WEIGHT+FN 3) FN+MEASUREMENT por frontera 4) POS+PART NO 5) PART_NO+DESIGNATION 6) scoring normal.
        const weightFnMeasurementSplitResult = splitWeightFnMeasurementCombinedRect(rect.text, rect, columns);
        if (weightFnMeasurementSplitResult) {
            weightFnMeasurementSplits.push({
                originalText: weightFnMeasurementSplitResult.originalText,
                weightText: weightFnMeasurementSplitResult.weightText,
                fnText: weightFnMeasurementSplitResult.fnText,
                measurementText: weightFnMeasurementSplitResult.measurementText,
                splitX: Math.round(weightFnMeasurementSplitResult.splitX),
                splitMethod: weightFnMeasurementSplitResult.splitMethod
            });
        }
        const weightSplitResult = weightFnMeasurementSplitResult || splitWeightFnCombinedRect(rect.text, rect, columns);
        const weightParts = weightSplitResult ? weightSplitResult.parts : [rect];
        const finalParts = [];

        weightParts.forEach((weightPart) => {
            const boundarySplit = splitCombinedRectAtColumnBoundary(
                weightPart.text,
                weightPart,
                fnColumn,
                measurementColumn,
                { boundary: 'fn_measurement', maxDistancePx: 12 }
            );

            if (boundarySplit) {
                columnBoundarySplits.push({
                    splitType: boundarySplit.splitType,
                    boundary: boundarySplit.boundary,
                    originalText: String(weightPart.text || '').trim(),
                    boundaryX: boundarySplit.boundaryX != null ? Math.round(boundarySplit.boundaryX) : null,
                    splitSpaceIndex: boundarySplit.splitSpaceIndex,
                    splitSpaceX: boundarySplit.splitSpaceX != null ? Math.round(boundarySplit.splitSpaceX) : null,
                    splitDistancePx: boundarySplit.splitDistancePx,
                    leftText: boundarySplit.leftText,
                    rightText: boundarySplit.rightText,
                    splitAccepted: boundarySplit.splitAccepted,
                    splitRejectedReason: boundarySplit.splitRejectedReason
                });
            }

            const boundaryParts = boundarySplit?.splitAccepted && Array.isArray(boundarySplit.parts)
                ? boundarySplit.parts
                : [weightPart];

            boundaryParts.forEach((boundaryPart) => {
                const posPartNoSplit = splitPosPartNoCombinedRect(boundaryPart.text, boundaryPart, columns);
                const posPartNoParts = posPartNoSplit ? posPartNoSplit.parts : [boundaryPart];
                if (posPartNoSplit) {
                    posPartNoSplits.push({
                        originalText: posPartNoSplit.originalText,
                        posText: posPartNoSplit.posText,
                        pnText: posPartNoSplit.pnText,
                        splitX: Math.round(posPartNoSplit.splitX),
                        splitMethod: posPartNoSplit.splitMethod
                    });
                }

                posPartNoParts.forEach((posPnPart) => {
                    const pnDesignationSplit = splitPartNoDesignationCombinedRect(posPnPart.text, posPnPart, columns);
                    if (pnDesignationSplit) {
                        finalParts.push(...pnDesignationSplit.parts);
                        partNoDesignationSplits.push({
                            originalText: pnDesignationSplit.originalText,
                            pnText: pnDesignationSplit.pnText,
                            designationText: pnDesignationSplit.designationText,
                            splitX: Math.round(pnDesignationSplit.splitX),
                            splitMethod: pnDesignationSplit.splitMethod
                        });
                    } else {
                        finalParts.push(posPnPart);
                    }
                });
            });
        });

        finalParts.forEach((part) => {
            if (highlights.length >= MAX_HIGHLIGHTS) return;

            const textPN = isLikelyPartNumber(part.text);
            const textFN = isLikelyFnToken(part.text);
            const textMeasurementTech = isLikelyMeasurementTechnicalText(part.text);
            const textDesignation = isLikelyDesignationText(part.text);
            const splitInfo = part._splitInfo || null;
            const splitFromCombined = Boolean(splitInfo?.splitFromCombined);
            const splitType = splitInfo?.splitType || null;
            const originalText = splitInfo?.originalText || String(rect.text || '').trim();
            const centerX = part.left + part.width / 2;
            const rectX1 = part.left + part.width;
            const measurementOverlap = measurementColumn
                ? computeRectColumnOverlap(part.left, part.width, measurementColumn.x0, measurementColumn.x1)
                : 0;
            const standardOverlap = standardColumn
                ? computeRectColumnOverlap(part.left, part.width, standardColumn.x0, standardColumn.x1)
                : 0;

            // Puntuar cada columna con solapamiento real o donde caiga centerX
            let bestColumn = null;
            let bestScore = -Infinity;
            let bestOverlapRatio = 0;
            let assignedBy = 'none';
            const candidateColumns = [];

            for (const col of columns) {
                const overlapRatio = computeRectColumnOverlap(part.left, part.width, col.x0, col.x1);
                const inCenter = centerX >= col.x0 && centerX < col.x1;

                // Solo considerar columnas con solapamiento significativo o donde caiga centerX
                if (overlapRatio < 0.05 && !inCenter) continue;

                candidateColumns.push({ key: col.key, overlapRatio: Math.round(overlapRatio * 100) / 100 });

                // Score base: overlap y centerX
                let score = overlapRatio * 2;
                if (inCenter) score += 1.0;

                // Proximidad del borde izquierdo del rect al borde izquierdo de la columna
                const leftEdgeDist = Math.abs(part.left - col.x0);
                score += Math.max(0, 1 - leftEdgeDist / pageWidth) * 0.3;

                // Heurística DESIGNATION vs PART NO.
                if (textDesignation) {
                    if (col.key === 'part_no') score -= 2.0;
                    if (col.key === 'designation') score += 1.2;
                }

                // Heurística PART NO.: solo bonificar si overlap razonable o center claro
                if (textPN) {
                    const pnStrong = overlapRatio >= 0.35 || inCenter;
                    if (col.key === 'part_no' && pnStrong) score += 1.2;
                    if (col.key === 'designation') score -= 0.8;
                }

                // Heurística FN: favorecer fn, penalizar weight
                if (textFN) {
                    if (col.key === 'fn') score += 2.0;
                    if (col.key === 'weight') score -= 2.0;
                    if (col.key === 'measurement') score -= 1.6;
                }

                // Regla inversa: si parece measurement técnico, no debe caer en FN.
                if (textMeasurementTech) {
                    if (col.key === 'fn') score -= 2.5;
                    if (col.key === 'measurement') score += 1.4;
                }

                // Frenar invasiones: FN no debe comerse MEASUREMENT/ STANDARD.
                if (measurementColumn && col.key === 'fn') {
                    const smallMargin = 4;
                    if (part.left >= measurementColumn.x0 - smallMargin) score -= 2.0;
                    if (/\s/.test(String(part.text || '').trim()) && String(part.text || '').trim().length > 4) score -= 1.2;
                }

                if (measurementColumn && col.key === 'measurement' && part.left >= measurementColumn.x0 - 4) {
                    score += 1.4;
                }
                if (standardColumn && col.key === 'standard' && part.left >= standardColumn.x0 - 4) {
                    score += 1.6;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestColumn = col;
                    bestOverlapRatio = overlapRatio;
                    assignedBy = inCenter ? 'centerX' : (overlapRatio > 0.3 ? 'overlap' : 'heuristic');
                }
            }

            // Fallback: columna más cercana por centerX, solo si el rect está dentro del rango de columnas
            if (!bestColumn && columns.length > 0 && centerX >= leftmostColumnX0) {
                let minDist = Infinity;
                for (const col of columns) {
                    const colCenterX = (col.x0 + col.x1) / 2;
                    const dist = Math.abs(centerX - colCenterX);
                    if (dist < minDist) {
                        minDist = dist;
                        bestColumn = col;
                        bestOverlapRatio = computeRectColumnOverlap(part.left, part.width, col.x0, col.x1);
                        assignedBy = 'nearest';
                    }
                }
            }

            if (!bestColumn) {
                ignoredCount++;
                return;
            }

            const assignedColumnBeforeCorrection = bestColumn.key;
            let assignedColumn = bestColumn;
            let boundaryCase = null;
            let correctedFromMeasurementToFn = false;
            let fnMeasurementReason = null;

            // Corrección frontera PART NO. vs DESIGNATION
            if (partNoColumn && designationColumn) {
                const partNoOverlap = computeRectColumnOverlap(part.left, part.width, partNoColumn.x0, partNoColumn.x1);
                const designationOverlap = computeRectColumnOverlap(part.left, part.width, designationColumn.x0, designationColumn.x1);
                const touchesBoundary = partNoOverlap > 0.05 && designationOverlap > 0.05;
                if (touchesBoundary) {
                    boundaryCase = 'part_no_designation';
                    const distToPartNo = Math.abs(part.left - partNoColumn.x0);
                    const distToDesignation = Math.abs(part.left - designationColumn.x0);
                    const startsInDesignation = part.left >= designationColumn.x0;
                    const hasSpaces = /\s/.test(String(part.text || '').trim());
                    if (startsInDesignation || hasSpaces || distToDesignation < distToPartNo) {
                        assignedColumn = designationColumn;
                        assignedBy = 'heuristic';
                    }
                }

                // Si parece designación, no dejarla en PART NO salvo solape mayoritario claro
                if (textDesignation && assignedColumn.key === 'part_no' && partNoOverlap < 0.6) {
                    assignedColumn = designationColumn;
                    assignedBy = 'heuristic';
                    boundaryCase = boundaryCase || 'part_no_designation';
                }
            }

            // Corrección WEIGHT vs FN por borde derecho de WEIGHT y tokens FN cortos
            if (weightColumn && fnColumn) {
                const smallMargin = 4;
                const fnRightLimit = measurementColumn ? (measurementColumn.x0 - smallMargin) : Infinity;
                const fnMeasurementRight = measurementColumn ? (measurementColumn.x0 + 8) : fnRightLimit;
                const inWeightToMeasurementBand = measurementColumn
                    ? (centerX >= weightColumn.x0 && centerX <= fnMeasurementRight)
                    : (centerX >= weightColumn.x0 && centerX <= fnColumn.x1);

                if (part.left >= fnColumn.x0 - smallMargin && part.left < fnRightLimit && textFN) {
                    assignedColumn = fnColumn;
                    assignedBy = 'heuristic';
                    boundaryCase = 'weight_fn';
                } else if (textFN && inWeightToMeasurementBand) {
                    assignedColumn = fnColumn;
                    assignedBy = 'heuristic';
                    boundaryCase = 'weight_fn';
                }
            }

            // Corrección frontera FN/MEASUREMENT: tokens FN cortos se quedan en FN.
            if (fnColumn && measurementColumn && weightColumn) {
                const inFnMeasurementBand = centerX >= weightColumn.x0 && centerX <= (measurementColumn.x0 + 8);
                const nearMeasurementEdge = part.left < measurementColumn.x0 + 8;
                const partTextUpper = String(part.text || '').trim().toUpperCase();
                const ambiguousSingleM = partTextUpper === 'M' && nearMeasurementEdge;
                if (textFN && !textMeasurementTech && inFnMeasurementBand && nearMeasurementEdge && !ambiguousSingleM) {
                    correctedFromMeasurementToFn = assignedColumn.key === 'measurement' || assignedColumnBeforeCorrection === 'measurement';
                    assignedColumn = fnColumn;
                    assignedBy = 'heuristic';
                    boundaryCase = 'fn_measurement';
                    fnMeasurementReason = nearMeasurementEdge
                        ? 'short-fn-near-measurement-edge'
                        : 'short-fn-in-weight-measurement-band';
                    if (correctedFromMeasurementToFn) {
                        fnMeasurementCorrectionsCount++;
                        measurementStandardBoundaryWarnings.push({
                            type: 'fn_measurement',
                            text: String(part.text || '').trim(),
                            left: Math.round(part.left),
                            centerX: Math.round(centerX)
                        });
                    }
                }
                if (ambiguousSingleM && assignedColumn.key === 'fn') {
                    assignedColumn = measurementColumn;
                    assignedBy = 'heuristic';
                    boundaryCase = 'fn_measurement';
                    fnMeasurementReason = 'single-m-near-measurement-edge';
                }
            }

            // Regla inversa: textos técnicos/largos no deben quedar en FN.
            if (measurementColumn && assignedColumn.key === 'fn' && textMeasurementTech) {
                assignedColumn = measurementColumn;
                assignedBy = 'heuristic';
                boundaryCase = boundaryCase || 'fn_measurement';
                fnMeasurementReason = fnMeasurementReason || 'fn-disqualified-technical';
            }

            // Corrección frontera MEASUREMENT -> STANDARD
            if (standardColumn) {
                const smallMargin = 4;
                const clearlyRight = part.left >= standardColumn.x0 - smallMargin;
                const shortRightToken = String(part.text || '').trim().length <= 16 && centerX >= standardColumn.x0;
                if (clearlyRight || shortRightToken) {
                    if (assignedColumn.key !== 'standard') {
                        measurementStandardBoundaryWarnings.push({
                            type: 'measurement_standard',
                            text: String(part.text || '').trim(),
                            left: Math.round(part.left),
                            centerX: Math.round(centerX)
                        });
                    }
                    assignedColumn = standardColumn;
                    assignedBy = 'heuristic';
                    boundaryCase = 'measurement_standard';
                }
            }

            // Forzado de split WEIGHT/FN combinado
            if (part._forcedKey) {
                const forcedColumn = columns.find((c) => c.key === part._forcedKey);
                if (forcedColumn) {
                    assignedColumn = forcedColumn;
                    assignedBy = 'split';
                    if (splitType === 'part_no_designation') {
                        boundaryCase = 'part_no_designation';
                    } else if (splitType === 'pos_part_no') {
                        boundaryCase = 'pos_part_no';
                    } else if (splitType === 'column_boundary_space') {
                        boundaryCase = splitInfo?.boundary || 'fn_measurement';
                    } else {
                        boundaryCase = 'weight_fn';
                    }
                }
            }

            if (!assignedByColumn.has(assignedColumn.key)) {
                assignedByColumn.set(assignedColumn.key, []);
            }
            assignedByColumn.get(assignedColumn.key).push(part.text);

            rectDebugList.push({
                text: part.text,
                originalText,
                column: assignedColumn.key,
                overlapRatio: Math.round(bestOverlapRatio * 100) / 100,
                assignedBy,
                candidateColumns,
                x0: Math.round(part.left),
                x1: Math.round(rectX1),
                centerX: Math.round(centerX),
                overlapMeasurement: Math.round(measurementOverlap * 100) / 100,
                overlapStandard: Math.round(standardOverlap * 100) / 100,
                isLikelyPartNumber: textPN,
                isLikelyFnToken: textFN,
                correctedFromMeasurementToFn,
                fnMeasurementReason,
                isLikelyDesignationText: textDesignation,
                boundaryCase,
                splitFromCombined,
                splitType,
                pnText: splitInfo?.pnText || null,
                designationText: splitInfo?.designationText || null,
                splitX: splitInfo?.splitX != null ? Math.round(splitInfo.splitX) : null,
                splitMethod: splitInfo?.splitMethod || null,
                splitBoundary: splitInfo?.boundary || null,
                splitSpaceIndex: splitInfo?.splitSpaceIndex ?? null,
                splitSpaceX: splitInfo?.splitSpaceX != null ? Math.round(splitInfo.splitSpaceX) : null,
                splitDistancePx: splitInfo?.splitDistancePx ?? null,
                splitAccepted: splitInfo?.splitAccepted ?? null,
                splitRejectedReason: splitInfo?.splitRejectedReason || null,
                splitLeftText: splitInfo?.leftText || null,
                splitRightText: splitInfo?.rightText || null,
                assignedColumnBeforeCorrection,
                assignedColumnAfterCorrection: assignedColumn.key,
                rectLeft: Math.round(part.left),
                rectTop: Math.round(part.top),
                rectWidth: Math.round(part.width),
                multilineCandidate: false
            });

            highlights.push({
                left: Math.max(0, part.left - 2),
                top: Math.max(0, part.top - part.height - 2),
                width: Math.max(12, part.width + 4),
                height: Math.max(10, part.height + 4),
                text: String(part.text || '').trim(),
                kind: assignedColumn.kind,
                _assignedBy: assignedBy,
                _overlapRatio: Math.round(bestOverlapRatio * 100) / 100,
                _isPN: textPN,
                _isFN: textFN,
                _isDesignation: textDesignation,
                _boundaryCase: boundaryCase,
                _splitFromCombined: splitFromCombined,
                _splitType: splitType,
                _pnText: splitInfo?.pnText || null,
                _designationText: splitInfo?.designationText || null,
                _splitX: splitInfo?.splitX ?? null,
                _splitMethod: splitInfo?.splitMethod || null,
                _assignedColumnBeforeCorrection: assignedColumnBeforeCorrection,
                _assignedColumnAfterCorrection: assignedColumn.key,
                _originalText: originalText,
                _multilineCandidate: false
            });
        });
    });

    // Detectar candidatos multiline (mismo cuerpo, misma columna, Y cercanos, al menos uno estrecho)
    // Solo para debug; no se fusionan.
    const multilineCandidateIndices = new Set();
    for (let i = 0; i < rectDebugList.length; i++) {
        const ri = rectDebugList[i];
        for (let j = i + 1; j < rectDebugList.length; j++) {
            const rj = rectDebugList[j];
            if (ri.column !== rj.column) continue;
            const yDiff = Math.abs(ri.rectTop - rj.rectTop);
            if (yDiff > 30) continue; // ~2.5× altura típica de línea 12px
            if (ri.rectWidth > 80 && rj.rectWidth > 80) continue; // ambos anchos → no candidatos
            multilineCandidateIndices.add(i);
            multilineCandidateIndices.add(j);
        }
    }

    const multilineCandidates = [];
    multilineCandidateIndices.forEach((idx) => {
        if (rectDebugList[idx]) {
            rectDebugList[idx].multilineCandidate = true;
            multilineCandidates.push({ text: rectDebugList[idx].text, column: rectDebugList[idx].column });
        }
        if (highlights[idx]) highlights[idx]._multilineCandidate = true;
    });

    // Compilar estadísticas de columnas
    const columnStats = {};
    columns.forEach((col) => {
        const texts = assignedByColumn.get(col.key) || [];
        columnStats[col.label] = {
            key: col.key,
            x0: col.x0,
            x1: col.x1,
            textCount: texts.length,
            samples: texts.slice(0, 5)
        };
    });

    const warnings = [];
    if (bodyRects.length === 0) {
        warnings.push('No se encontraron textos en el área de cuerpo de tabla.');
    }
    if (ignoredCount > bodyRects.length * 0.5) {
        warnings.push(`Se ignoró más del 50% de los rects (${ignoredCount}/${bodyRects.length}).`);
    }
    if (highlights.length >= MAX_HIGHLIGHTS) {
        warnings.push(`Límite de highlights alcanzado (${MAX_HIGHLIGHTS}); algunos textos no se mostraron.`);
    }
    if (decorativeColumnIgnored && decorativeColumn) {
        const dw = Math.round((decorativeColumn.x1 ?? 0) - (decorativeColumn.x0 ?? 0));
        warnings.push(`Columna decorativa ignorada: "${decorativeColumn.key}" (x0=${decorativeColumn.x0}, ancho=${dw}px).`);
    }
    if (multilineCandidates.length > 0) {
        warnings.push(`${multilineCandidates.length} posible(s) candidato(s) multiline detectado(s) (solo debug; no fusionados).`);
    }
    if (partNoDesignationSplits.length > 0) {
        warnings.push(`${partNoDesignationSplits.length} split(s) PART NO + DESIGNATION aplicado(s) (visual/debug).`);
    }
    if (weightFnMeasurementSplits.length > 0) {
        warnings.push(`${weightFnMeasurementSplits.length} split(s) WEIGHT + FN + MEASUREMENT aplicado(s) (visual/debug).`);
    }
    if (posPartNoSplits.length > 0) {
        warnings.push(`${posPartNoSplits.length} split(s) POS + PART NO aplicado(s) (visual/debug).`);
    }
    const acceptedColumnBoundarySplits = columnBoundarySplits.filter((s) => s.splitAccepted).length;
    if (acceptedColumnBoundarySplits > 0) {
        warnings.push(`${acceptedColumnBoundarySplits} split(s) FN+MEASUREMENT por frontera/espacio aplicado(s) (visual/debug).`);
    }
    if (footerRectsIgnored > 0) {
        warnings.push(`${footerRectsIgnored} rect(s) de zona de pie ignorado(s) para no colorear footer.`);
    }
    if (footerNoiseIgnoredCount > 0) {
        warnings.push(`${footerNoiseIgnoredCount} footer noise rect(s) ignorado(s) por texto/patrón de pie.`);
    }
    if (measurementStandardBoundaryWarnings.length > 0) {
        warnings.push(`${measurementStandardBoundaryWarnings.length} correccion(es) en frontera FN/MEASUREMENT/STANDARD aplicada(s).`);
    }
    if (fnMeasurementCorrectionsCount > 0) {
        warnings.push(`${fnMeasurementCorrectionsCount} correccion(es) measurement→fn aplicada(s) en frontera FN/MEASUREMENT.`);
    }

    const measurementRectsCount = (assignedByColumn.get('measurement') || []).length;
    const standardRectsCount = (assignedByColumn.get('standard') || []).length;
    const fnRectsCount = (assignedByColumn.get('fn') || []).length;

    state.currentPdfHeaderColumnBodyHighlights = highlights;
    state.currentPdfHeaderColumnBodyDebug = {
        error: null,
        message: 'Body column highlighting completado.',
        columnCount: columns.length,
        textCount: bodyRects.length,
        highlightCount: highlights.length,
        headerMaxY1,
        bodyTop,
        bodyBottom,
        bodyMargin,
        assignedByColumn: Object.fromEntries(assignedByColumn),
        columnStats,
        ignoredRects: ignoredCount,
        footerRectsIgnored,
        footerNoiseIgnoredCount,
        footerNoiseIgnoredExamples,
        decorativeColumnIgnored,
        decorativeColumn: decorativeColumn
            ? { key: decorativeColumn.key, x0: decorativeColumn.x0, x1: decorativeColumn.x1 }
            : null,
        partNoDesignationSplits,
        partNoDesignationSplitCount: partNoDesignationSplits.length,
        weightFnMeasurementSplits,
        weightFnMeasurementSplitCount: weightFnMeasurementSplits.length,
        posPartNoSplits,
        posPartNoSplitCount: posPartNoSplits.length,
        columnBoundarySplits: columnBoundarySplits.slice(0, 50),
        columnBoundarySplitCount: columnBoundarySplits.length,
        columnBoundarySplitAcceptedCount: acceptedColumnBoundarySplits,
        measurementRectsCount,
        standardRectsCount,
        fnRectsCount,
        fnMeasurementCorrectionsCount,
        measurementStandardBoundaryWarnings,
        multilineCandidates,
        multilineCandidateCount: multilineCandidates.length,
        // Keep the full list for downstream row matching (copy-to-_pdf).
        // UI panels still render a short preview on their side.
        rectDebug: rectDebugList,
        warnings
    };

    return state.currentPdfHeaderColumnBodyDebug;
}


export function getPdfHeaderColumnBodyDebug() {
    return state.currentPdfHeaderColumnBodyDebug || null;
}

/**
 * Limpia el overlay de body column highlighting.
 */
export function clearPdfHeaderColumnBodyHighlights() {
    state.currentPdfHeaderColumnBodyHighlights = [];
    state.currentPdfHeaderColumnBodyDebug = null;
    requestPdfRelayout();
}


export function clearPdfAllOverlays() {
    state.currentPdfExperimentalRowHighlights = [];
    state.currentPdfExperimentalRowSearch = null;
    state.currentPdfExperimentalColumnDetection = null;
    state.currentPdfHeaderOnlyOverlay = [];
    state.currentPdfHeaderOnlyDebug = null;
    state.currentPdfHeaderColumnBodyHighlights = [];
    state.currentPdfHeaderColumnBodyDebug = null;
    state.currentPdfTableDebugOverlay = [];
    state.currentPdfTableParseResult = null;
    state.currentPdfHeaderDetection = null;
    clearPdfSelectionLayer();
    requestPdfRelayout();
}

/**
 * Limpia overlays de selección/experimentales pero conserva los overlays de
 * header y body-column para que no desaparezcan al cambiar de registro.
 * Los overlays de header/body se limpian explícitamente antes de recargarlos.
 */
export function clearPdfOverlaysExceptHeaders() {
    state.currentPdfExperimentalRowHighlights = [];
    state.currentPdfExperimentalRowSearch = null;
    state.currentPdfExperimentalColumnDetection = null;
    state.currentPdfTableDebugOverlay = [];
    state.currentPdfTableParseResult = null;
    state.currentPdfHeaderDetection = null;
    clearPdfSelectionLayer();
    requestPdfRelayout();
}


export function setPdfExperimentalRowHighlights(search) {

    console.log('[setPdfExperimentalRowHighlights] Input search object:', search);

    const normalized = normalizeExperimentalRowSearch(search);

    console.log('[setPdfExperimentalRowHighlights] Normalized result:', normalized);

    state.currentPdfExperimentalRowSearch = normalized;

    if (!state.currentPdfExperimentalRowSearch) {

        state.currentPdfExperimentalRowHighlights = [];
        state.currentPdfExperimentalColumnDetection = null;

    }

    console.log('[setPdfExperimentalRowHighlights] Final state:', state.currentPdfExperimentalRowSearch);

}



export function requestPdfRelayout() {

    if (pdfRelayoutRafId) {

        cancelAnimationFrame(pdfRelayoutRafId);

        pdfRelayoutRafId = 0;

    }



    pdfRelayoutRafId = requestAnimationFrame(() => {

        pdfRelayoutRafId = 0;

        if (state.rightPanelTab !== 'pdf') return;

        if (!state.currentPdfSource || state.currentPdfPageNumber <= 0) return;



        renderPdfPage(state.currentPdfSource, state.currentPdfPageNumber, { preserveViewport: true })

            .catch((error) => {

                const errorName = String(error?.name || '');

                if (errorName === 'RenderingCancelledException') return;

                console.error('Error recalculando layout del PDF:', error);

            });

    });

}

