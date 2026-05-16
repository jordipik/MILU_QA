/**

 * Visor PDF basado en PDF.js.

 */



import { state } from './state.js';

import { evaluateRowQaChecks } from './qa-checks.js';



const PDF_FIT_WIDTH_MARGIN = 8;

const PDF_FIT_HEIGHT_MARGIN = 8;

const PDF_SELECTION_MAX_HIGHLIGHTS = 40;

const PDF_ZOOM_PERCENTAGES = new Set([50, 75, 100, 125, 150, 200]);

const PDF_ZOOM_STEPS = ['fit', 'height', 50, 75, 100, 125, 150, 200];

let pdfRelayoutRafId = 0;

// Sistema de debug para detección de cabecera
let headerDetectionDebugLog = [];
function debugLog(stage, data) {
    headerDetectionDebugLog.push({ stage, data, timestamp: Date.now() });
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
window.getHeaderDetectionDebug = getHeaderDetectionDebug;
window.clearHeaderDetectionDebug = clearHeaderDetectionDebug;



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


function buildRowBandFromLineRects(lineRects, viewport) {

    if (!Array.isArray(lineRects) || lineRects.length === 0) return null;

    const minTop = Math.min(...lineRects.map((rect) => (Number(rect.top) || 0) - (Number(rect.height) || 12)));
    const maxBottom = Math.max(...lineRects.map((rect) => Number(rect.top) || 0));

    return {

        left: 0,

        top: Math.max(0, minTop - 4),

        width: Math.max(48, Number(viewport?.width || 0)),

        height: Math.max(16, (maxBottom - minTop) + 8),

        text: 'Fila completa',

        kind: 'red-row'

    };

}



function detectHeaderColumns(rects, viewport, options = {}) {

    if (!Array.isArray(rects) || rects.length === 0) {
        debugLog('detectHeaderColumns:start', { rectCount: 0, status: 'no-rects' });
        return [];
    }

    debugLog('detectHeaderColumns:start', { rectCount: rects.length, viewportWidth: viewport?.width, viewportHeight: viewport?.height, options });

    const lines = buildLineGroups(rects);
    debugLog('detectHeaderColumns:lines', { lineCount: lines.length });

    const sanitizeForOcrMatch = (value) => String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .replace(/0/g, 'o')
        .replace(/1/g, 'l')
        .replace(/5/g, 's');

    // Tokens fuertes y débiles para tolerar OCR fragmentado.
    const strongHeaderTokens = [
        'pos',
        'partno',
        'designation',
        'modeltype',
        'qty'
    ];

    const weakHeaderTokens = [
        'part',
        'no',
        'desig',
        'model',
        'type',
        'unit',
        'weight',
        'measure',
        'standard'
    ];

    const getHeaderTokenScore = (text) => {
        const raw = String(text || '');
        const compact = sanitizeForOcrMatch(raw);
        if (!compact) return 0;

        let score = 0;
        if (strongHeaderTokens.some((token) => compact.includes(token))) score += 3;
        if (weakHeaderTokens.some((token) => compact.includes(token))) score += 1;
        return score;
    };

    const hasHeaderKeyword = (text) => getHeaderTokenScore(text) > 0;
    const anchorCenterYRaw = Number(options?.anchorCenterY);
    const hasAnchorCenterY = Number.isFinite(anchorCenterYRaw);
    const anchorCenterY = hasAnchorCenterY ? anchorCenterYRaw : 0;

    let bestClusters = null;
    let bestScore = 0;
    let scoredLines = [];

    lines.forEach((line) => {
        const clusters = buildTextClusters(line.rects).sort((a, b) => a.left - b.left);
        if (!clusters.length) return;

        let score = 0;
        clusters.forEach((cluster) => {
            score += getHeaderTokenScore(cluster.normalizedText);
        });

        // Priorizamos cabeceras que suelen estar en la parte alta de la página.
        const topBoost = Number(line.centerY || 0) > Number(viewport?.height || 0) * 0.6 ? 0.75 : 0;
        score += topBoost;

        // Si tenemos ancla de la fila PN, favorecemos explícitamente líneas justo por encima.
        if (hasAnchorCenterY) {
            const delta = Number(line.centerY || 0) - anchorCenterY;
            if (delta > 0 && delta <= 260) {
                score += 2.2 - (delta / 180);
            } else if (delta <= 0 && Math.abs(delta) <= 90) {
                score += 0.25;
            } else {
                score -= 0.35;
            }
        }

        scoredLines.push({ lineIndex: scoredLines.length, score, clusterCount: clusters.length, centerY: line.centerY });

        if (score > bestScore) {
            bestScore = score;
            bestClusters = clusters;
        }
    });

    debugLog('detectHeaderColumns:scores', {
        totalLines: scoredLines.length,
        bestScore,
        clusterCount: bestClusters?.length || 0,
        threshold: 2.5,
        passedThreshold: bestScore >= 2.5,
        topScoredLines: scoredLines.sort((a, b) => b.score - a.score).slice(0, 5),
        allScores: scoredLines.map(l => l.score).sort((a, b) => b - a)
    });

    const pageWidth = Math.max(1, Number(viewport?.width || 0));
    const pageHeight = Math.max(1, Number(viewport?.height || 0));

    if (!bestClusters || bestScore < 2.5) {
        debugLog('detectHeaderColumns:rejected', {
            bestScore,
            hasbestClusters: !!bestClusters,
            reason: !bestClusters ? 'no-best-clusters' : 'below-threshold',
            threshold: 2.5
        });
        return [];
    }

    // Debug: mostrar TODOS los clusters antes de filtrar
    debugLog('detectHeaderColumns:all-clusters-before-filter', {
        totalClusters: bestClusters.length,
        clusterTexts: bestClusters.map(c => ({ text: c.text, normalized: c.normalizedText })).slice(0, 10)
    });

    const headerClusters = bestClusters
        .filter((cluster) => hasHeaderKeyword(cluster.normalizedText))
        .sort((a, b) => a.left - b.left);

    debugLog('detectHeaderColumns:filtered', {
        headerClusterCount: headerClusters.length,
        headerClusterTexts: headerClusters.map(c => c.text).slice(0, 5)
    });

    if (headerClusters.length < 1) {
        debugLog('detectHeaderColumns:rejected', { reason: 'no-header-clusters' });
        return [];
    }

    const headerTop = Math.min(...headerClusters.map((cluster) => (Number(cluster.top || 0) - Number(cluster.height || 12))));
    const headerBottom = Math.max(...headerClusters.map((cluster) => Number(cluster.top || 0)));
    const rowTop = Math.max(0, headerTop - 4);
    const rowHeight = Math.max(16, Math.min(pageHeight - rowTop, (headerBottom - headerTop) + 8));

    const violetRow = {
        left: 0,
        top: rowTop,
        width: pageWidth,
        height: rowHeight,
        text: 'Fila cabecera',
        kind: 'violet-row'
    };

    const blueTexts = headerClusters.map((cluster) => ({
        left: Math.max(0, Number(cluster.left || 0) - 3),
        top: Math.max(0, Number(cluster.top || 0) - Number(cluster.height || 12) - 3),
        width: Math.max(18, Number(cluster.width || 0) + 8),
        height: Math.max(14, Number(cluster.height || 12) + 8),
        text: String(cluster.text || '').trim(),
        kind: 'blue-token'
    }));

    const result = [violetRow, ...blueTexts];
    debugLog('detectHeaderColumns:success', {
        violetRowTop: violetRow.top,
        violetRowHeight: violetRow.height,
        blueTokenCount: blueTexts.length,
        totalHighlights: result.length
    });
    return result;

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
        debugLog('buildExperimentalRowHighlightsFromSearch:start', { status: 'no-normalized-search' });
        return [];
    }

    debugLog('buildExperimentalRowHighlightsFromSearch:start', {
        headerOnly: normalizedSearch.headerOnly,
        pnToken: !!normalizedSearch.pnToken
    });

    const rects = extractPdfTextRects(textItems, viewport);

    if (!rects.length) {
        debugLog('buildExperimentalRowHighlightsFromSearch:extract', { rectCount: 0, status: 'no-rects' });
        return [];
    }

    debugLog('buildExperimentalRowHighlightsFromSearch:extract', { rectCount: rects.length });

    if (normalizedSearch.mode === 'pn-line') {
        const lineHighlights = buildPnLineDebugHighlights(rects, normalizedSearch);

        const pnRects = rects.filter((rect) => tokenMatches(rect.normalizedText, normalizedSearch.pnToken, false));
        const pnLineRects = pnRects.length ? getPnLineRects(rects, pnRects) : [];
        const rowBand = buildRowBandFromLineRects(pnLineRects, viewport);

        const headerHighlights = detectHeaderColumns(rects, viewport, {
            anchorCenterY: pnRects[0]?.centerY
        });

        const result = [
            ...(rowBand ? [rowBand] : []),
            ...lineHighlights,
            ...headerHighlights
        ];

        debugLog('buildExperimentalRowHighlightsFromSearch:pn-line', {
            pnToken: normalizedSearch.pnToken,
            pnRectCount: pnRects.length,
            lineRectCount: pnLineRects.length,
            rowBand: !!rowBand,
            headerCount: headerHighlights.length,
            highlightCount: result.length
        });
        return result;
    }

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

    const tokens = getSelectionSearchTokens(selection);

    if (!tokens) return [];



    const rects = extractPdfTextRects(textItems, viewport);



    const highlights = [];



    const pnRects = tokens.pn

        ? rects.filter(rect => tokenMatches(rect.normalizedText, tokens.pn, tokens.allowPnContains))

        : [];

    const posRects = tokens.pos

        ? rects.filter(rect => tokenMatches(rect.normalizedText, tokens.pos, tokens.allowPosContains))

        : [];



    const readTokenHighlights = buildReadTokenHighlights(

        rects,

        normalizeReadTokenEntries(state.currentPdfReadTokens),

        pnRects

    );

    highlights.push(...readTokenHighlights);



    pnRects.forEach(rect => {

        const matchRect = getTokenHighlightRect(rect, tokens.pn) || rect;

        highlights.push({

            left: Math.max(0, matchRect.left - 4),

            top: Math.max(0, matchRect.top - matchRect.height - 3),

            width: Math.max(24, matchRect.width + 8),

            height: Math.max(16, matchRect.height + 6),

            text: matchRect.text,

            priority: 6,

            type: 'pn',

            hasError: tokens.fieldErrors.pn ?? false

        });

    });



    posRects.forEach(rect => {

        const matchRect = getTokenHighlightRect(rect, tokens.pos) || rect;

        highlights.push({

            left: Math.max(0, matchRect.left - 4),

            top: Math.max(0, matchRect.top - matchRect.height - 3),

            width: Math.max(24, matchRect.width + 8),

            height: Math.max(16, matchRect.height + 6),

            text: matchRect.text,

            priority: 5,

            type: 'pos',

            hasError: tokens.fieldErrors.pos ?? false

        });

    });



    const designationRects = tokens.designationFinal

        ? findExactDesignationClusters(rects, tokens.designationFinal)

        : [];



    let bestPair = null;

    let bestScore = Number.POSITIVE_INFINITY;



    if (pnRects.length && designationRects.length) {

        designationRects.forEach(designationRect => {

            pnRects.forEach(pnRect => {

                const verticalGap = Math.abs(designationRect.centerY - pnRect.centerY);

                const sameLineThreshold = Math.max(designationRect.height, pnRect.height) * 0.9 + 6;

                if (verticalGap > sameLineThreshold) return;



                const horizontalDelta = designationRect.left - (pnRect.left + pnRect.width);

                const horizontalGap = Math.abs(horizontalDelta);

                const nearThreshold = Math.max(220, (designationRect.width + pnRect.width) * 2.5);

                if (horizontalGap > nearThreshold) return;



                const leftSidePenalty = horizontalDelta < -20 ? 40 : 0;

                const score = verticalGap * 5 + horizontalGap + leftSidePenalty;

                if (score < bestScore) {

                    bestScore = score;

                    bestPair = { designationRect, pnRect };

                }

            });

        });

    }



    if (bestPair) {

        highlights.push({

            left: Math.max(0, bestPair.designationRect.left - 4),

            top: Math.max(0, bestPair.designationRect.top - bestPair.designationRect.height - 3),

            width: Math.max(24, bestPair.designationRect.width + 8),

            height: Math.max(16, bestPair.designationRect.height + 6),

            text: bestPair.designationRect.text,

            priority: 9,

            type: 'designation-near-pn',

            hasError: tokens.fieldErrors.designation ?? false

        });

    }



    // Same-line highlights for extra fields (qty, measurement, weight, model)

    const extraFieldTokens = [

        { key: 'qty', allowContainsKey: 'allowQtyContains', priority: 3, type: 'qty', hasError: tokens.fieldErrors.qty ?? false },

        { key: 'measurement', allowContainsKey: 'allowMeasurementContains', priority: 4, type: 'measurement', hasError: tokens.fieldErrors.measurement ?? false },

        { key: 'weight', allowContainsKey: 'allowWeightContains', priority: 3, type: 'weight', hasError: tokens.fieldErrors.weight ?? false },

        { key: 'model', allowContainsKey: 'allowModelContains', priority: 3, type: 'model', hasError: tokens.fieldErrors.model ?? false },

    ];



    if (pnRects.length > 0) {

        const pnLineRects = getPnLineRects(rects, pnRects);



        for (const fieldDef of extraFieldTokens) {

            const tokenValue = tokens[fieldDef.key];

            if (!tokenValue) continue;



            const allowContains = tokens[fieldDef.allowContainsKey] || false;



            // Try direct rect match first

            const directMatches = pnLineRects.filter(r => tokenMatches(r.normalizedText, tokenValue, false));

            if (directMatches.length > 0) {

                directMatches.forEach(rect => {

                    highlights.push({

                        left: Math.max(0, rect.left - 4),

                        top: Math.max(0, rect.top - rect.height - 3),

                        width: Math.max(20, rect.width + 8),

                        height: Math.max(14, rect.height + 6),

                        text: rect.text,

                        priority: fieldDef.priority,

                        type: fieldDef.type,

                        hasError: fieldDef.hasError

                    });

                });

                continue;

            }



            // Try cluster match for multi-word values

            if (allowContains || tokenValue.length >= 4) {

                const lines = buildLineGroups(pnLineRects);

                for (const line of lines) {

                    const clusters = buildTextClusters(line.rects);

                    for (const cluster of clusters) {

                        if (tokenMatches(cluster.normalizedText, tokenValue, allowContains)) {

                            highlights.push({

                                left: Math.max(0, cluster.left - 4),

                                top: Math.max(0, cluster.top - cluster.height - 3),

                                width: Math.max(24, cluster.width + 8),

                                height: Math.max(16, cluster.height + 6),

                                text: cluster.text,

                                priority: fieldDef.priority,

                                type: fieldDef.type,

                                hasError: fieldDef.hasError

                            });

                        }

                    }

                }

            }

        }

    }



    highlights.sort((a, b) => b.priority - a.priority);

    return highlights.slice(0, PDF_SELECTION_MAX_HIGHLIGHTS);

}



function renderPdfSelectionHighlights(highlights, viewport) {

    const layer = getPdfSelectionLayer();

    if (!layer) {
        debugLog('renderPdfSelectionHighlights:error', { reason: 'no-layer' });
        return;
    }

    layer.querySelectorAll('.pdf-selection-highlight').forEach(node => node.remove());

    state.currentPdfSelectionRects = highlights;

    const canvas = document.getElementById('pdfCanvas');
    const canvasWidth = canvas instanceof HTMLCanvasElement ? canvas.clientWidth : 0;
    const canvasHeight = canvas instanceof HTMLCanvasElement ? canvas.clientHeight : 0;
    const scaleX = viewport?.width > 0 && canvasWidth > 0 ? (canvasWidth / viewport.width) : 1;
    const scaleY = viewport?.height > 0 && canvasHeight > 0 ? (canvasHeight / viewport.height) : 1;

    const rowHighlights = normalizeExperimentalRowHighlights(state.currentPdfExperimentalRowHighlights);

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

    // Modo diagnóstico: si hay marcas azules experimentales, ocultamos temporalmente
    // los resaltados estándar para verificar claramente su visibilidad.
    const suppressStandardHighlights = rowHighlights.length > 0;



    let focusHighlight = null;

    if (!suppressStandardHighlights) highlights.forEach((rect) => {

        const box = document.createElement('div');

        box.className = 'pdf-selection-highlight';

        box.classList.add(rect.hasError ? 'is-error' : 'is-ok');

        box.style.left = `${Math.max(0, rect.left * scaleX)}px`;

        box.style.top = `${Math.max(0, rect.top * scaleY)}px`;

        box.style.width = `${Math.max(20, rect.width * scaleX)}px`;

        box.style.height = `${Math.max(14, rect.height * scaleY)}px`;

        box.title = `Coincidencia: ${rect.text}`;

        layer.appendChild(box);

        if (!focusHighlight) focusHighlight = box;

    });



    rowHighlights.forEach((rect) => {

        const box = document.createElement('div');

        box.className = 'pdf-selection-highlight';

        if (rect.kind === 'red-row') {
            box.classList.add('pdf-row-highlight-red-row');
        } else if (rect.kind === 'violet-row') {
            box.classList.add('pdf-row-highlight-violet-row');
        } else if (rect.kind === 'violet-column') {
            box.classList.add('pdf-column-highlight-violet');
        } else if (rect.kind === 'blue-token-pn') {
            box.classList.add('pdf-line-debug-highlight', 'pdf-line-debug-highlight--pn');
        } else {
            box.classList.add('pdf-line-debug-highlight');
        }

        box.style.left = `${Math.max(0, rect.left * scaleX)}px`;

        box.style.top = `${Math.max(0, rect.top * scaleY)}px`;

        box.style.width = `${Math.max(18, rect.width * scaleX)}px`;

        box.style.height = `${Math.max(12, rect.height * scaleY)}px`;

        box.title = rect.text ? `Linea PN: ${rect.text}` : 'Linea PN';

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

        const textContent = await page.getTextContent();

        if (requestToken !== state.currentPdfRequestToken) return;
        const highlights = buildPdfTextHighlights(textContent.items || [], viewport, selection);

        let rowHighlights = buildExperimentalRowHighlightsFromSearch(textContent.items || [], viewport, state.currentPdfExperimentalRowSearch);

        if (
            state.currentPdfExperimentalRowSearch
            && state.currentPdfExperimentalRowSearch.mode !== 'pn-line'
            && (!Array.isArray(rowHighlights) || rowHighlights.length === 0)
        ) {

            const pnHighlights = highlights.filter((item) => String(item?.type || '') === 'pn');

            if (pnHighlights.length > 0) {

                const minLeft = Math.min(...pnHighlights.map((item) => Number(item.left) || 0));

                const maxRight = Math.max(...pnHighlights.map((item) => (Number(item.left) || 0) + (Number(item.width) || 0)));

                const minTop = Math.min(...pnHighlights.map((item) => Number(item.top) || 0));

                const maxBottom = Math.max(...pnHighlights.map((item) => (Number(item.top) || 0) + (Number(item.height) || 0)));

                const bandTop = Math.max(0, minTop - 6);

                const bandHeight = Math.max(24, (maxBottom - minTop) + 12);

                const bandBottom = bandTop + bandHeight;

                const textRects = extractPdfTextRects(textContent.items || [], viewport);

                const blueInBand = textRects

                    .filter((rect) => {

                        const rectTop = Number(rect.top || 0) - Number(rect.height || 12);

                        const rectBottom = Number(rect.top || 0);

                        return rectBottom >= bandTop && rectTop <= bandBottom;

                    })

                    .sort((a, b) => Number(a.left || 0) - Number(b.left || 0))

                    .map((rect) => ({

                        left: Math.max(0, Number(rect.left || 0) - 4),

                        top: Math.max(0, Number(rect.top || 0) - Number(rect.height || 12) - 4),

                        width: Math.max(20, Number(rect.width || 0) + 10),

                        height: Math.max(16, Number(rect.height || 12) + 10),

                        text: String(rect.text || '').trim(),

                        kind: 'blue-token'

                    }));

                rowHighlights = [{

                    left: 0,

                    top: bandTop,

                    width: Math.max(160, Number(viewport?.width || 0)),

                    height: bandHeight,

                    text: 'Fila PN (fallback PN verde)',

                    kind: 'red-row'

                }, ...blueInBand];

            }

        }

        state.currentPdfExperimentalRowHighlights = rowHighlights;

        if (requestToken !== state.currentPdfRequestToken) return;

        renderPdfSelectionHighlights(highlights, viewport);

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



    const qaFields = evaluateRowQaChecks(row, [...(state.activeQaErrorChecks || [])]).fields || {};

    const fieldHasError = (...keys) => keys.some(k => (qaFields[k]?.length ?? 0) > 0);



    state.currentPdfSelection = {

        id: String(row?.ID ?? '').trim(),

        pos: String(row?.POS ?? '').trim(),

        pn: String(row?.pn_final ?? row?.['PART NO.'] ?? row?.pn ?? '').trim(),

        designationFinal: String(row?.designation_final ?? row?.DESIGNATION ?? '').trim(),

        qty: String(row?.qty_final ?? row?.QTY ?? '').trim(),

        measurement: String(row?.measure_final ?? row?.measurement_final ?? row?.['MEASUREMENT / STANDARD'] ?? '').trim(),

        weight: String(row?.weight_final ?? row?.WEIGHT ?? '').trim(),

        model: String(row?.model_type_final ?? row?.['MODEL/TYPE'] ?? '').trim(),

        fieldErrors: {

            pn: fieldHasError('pn_final', 'PART NO.', 'pn'),

            pos: fieldHasError('pos_final', 'POS'),

            designation: fieldHasError('designation_final', 'DESIGNATION'),

            qty: fieldHasError('qty_final', 'QTY'),

            measurement: fieldHasError('measurement_final', 'MEASUREMENT / STANDARD'),

            weight: fieldHasError('weight_final', 'WEIGHT'),

            model: fieldHasError('model_type_final', 'MODEL/TYPE')

        },
        book: String(row?.engine_model ?? '').trim(),

        page: String(row?.['Source Page'] ?? '').trim(),

        renderBook: '',

        renderPageNum: 0

    };

    if (state.currentPdfExperimentalRowSearch?.mode === 'pn-line') {

        const nextPnToken = normalizePdfToken(state.currentPdfSelection?.pn);

        if (nextPnToken) {

            state.currentPdfExperimentalRowSearch = {

                ...state.currentPdfExperimentalRowSearch,

                pnToken: nextPnToken

            };

        } else {

            state.currentPdfExperimentalRowSearch = null;

        }

    }

    state.currentPdfExperimentalRowHighlights = [];

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

    const viewerEffectiveHeight = innerContentHeight > 0

        ? innerContentHeight

        : (viewer?.clientHeight || baseViewport.height);

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



    // Mejora de rendimiento percibido: primero mostrar canvas, luego overlays.

    renderPdfSelectionOverlay(page, viewport, requestToken)

        .catch(error => console.warn('No se pudo renderizar overlay del PDF:', error));

}



export async function loadPdfWithPage(book, page) {

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

    state.currentPdfExperimentalRowSearch = null;

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


window.getPdfExperimentalBlueTexts = getPdfExperimentalBlueTexts;



export function setPdfExperimentalRowHighlights(search) {

    console.log('[setPdfExperimentalRowHighlights] Input search object:', search);

    const normalized = normalizeExperimentalRowSearch(search);

    console.log('[setPdfExperimentalRowHighlights] Normalized result:', normalized);

    state.currentPdfExperimentalRowSearch = normalized;

    if (!state.currentPdfExperimentalRowSearch) {

        state.currentPdfExperimentalRowHighlights = [];

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

