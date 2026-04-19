/**
 * Visor PDF basado en PDF.js.
 */

import { state } from './state.js';

const PDF_FIT_WIDTH_MARGIN = 8;
const PDF_SELECTION_MAX_HIGHLIGHTS = 8;
const PDF_ZOOM_PERCENTAGES = new Set([75, 100, 125, 150, 200]);
const PDF_ZOOM_STEPS = ['fit', 75, 100, 125, 150, 200];
let pdfRelayoutRafId = 0;

if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function normalizePdfToken(value) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePdfZoom(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'fit') return 'fit';

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 'fit';

    const normalized = Math.round(parsed);
    return PDF_ZOOM_PERCENTAGES.has(normalized) ? normalized : 100;
}

function getCurrentPdfZoomFactor() {
    const currentZoom = normalizePdfZoom(state.currentPdfZoom);
    state.currentPdfZoom = currentZoom;
    if (currentZoom === 'fit') return 1;
    return Math.max(0.2, currentZoom / 100);
}

function applyPdfZoom(nextZoom, zoomSelect) {
    const normalizedZoom = normalizePdfZoom(nextZoom);
    state.currentPdfZoom = normalizedZoom;
    if (zoomSelect instanceof HTMLSelectElement) zoomSelect.value = String(normalizedZoom);

    if (state.rightPanelTab !== 'pdf') return;
    if (!state.currentPdfSource || state.currentPdfPageNumber <= 0) return;

    renderPdfPage(state.currentPdfSource, state.currentPdfPageNumber)
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

    const pos = selection.pos || '—';
    const pn = selection.pn || '—';
    const id = selection.id || '—';
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

    return {
        pn,
        pos,
        designationFinal,
        allowPnContains: false,
        allowPosContains: false,
        allowDesignationContains: designationFinal.length >= 8
    };
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

function buildPdfTextHighlights(textItems, viewport, selection) {
    const tokens = getSelectionSearchTokens(selection);
    if (!tokens) return [];

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

    const highlights = [];

    const pnRects = tokens.pn
        ? rects.filter(rect => tokenMatches(rect.normalizedText, tokens.pn, tokens.allowPnContains))
        : [];
    const posRects = tokens.pos
        ? rects.filter(rect => tokenMatches(rect.normalizedText, tokens.pos, tokens.allowPosContains))
        : [];

    pnRects.forEach(rect => {
        const matchRect = getTokenHighlightRect(rect, tokens.pn) || rect;
        highlights.push({
            left: Math.max(0, matchRect.left - 4),
            top: Math.max(0, matchRect.top - matchRect.height - 3),
            width: Math.max(24, matchRect.width + 8),
            height: Math.max(16, matchRect.height + 6),
            text: matchRect.text,
            priority: 6,
            type: 'pn'
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
            type: 'pos'
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
            type: 'designation-near-pn'
        });
    }

    highlights.sort((a, b) => b.priority - a.priority);
    return highlights.slice(0, PDF_SELECTION_MAX_HIGHLIGHTS);
}

function renderPdfSelectionHighlights(highlights, viewport) {
    const layer = getPdfSelectionLayer();
    if (!layer) return;

    layer.querySelectorAll('.pdf-selection-highlight').forEach(node => node.remove());
    state.currentPdfSelectionRects = highlights;

    const canvas = document.getElementById('pdfCanvas');
    const canvasWidth = canvas instanceof HTMLCanvasElement ? canvas.clientWidth : 0;
    const canvasHeight = canvas instanceof HTMLCanvasElement ? canvas.clientHeight : 0;
    const scaleX = viewport?.width > 0 && canvasWidth > 0 ? (canvasWidth / viewport.width) : 1;
    const scaleY = viewport?.height > 0 && canvasHeight > 0 ? (canvasHeight / viewport.height) : 1;

    let focusHighlight = null;
    highlights.forEach((rect) => {
        const box = document.createElement('div');
        box.className = 'pdf-selection-highlight';
        box.style.left = `${Math.max(0, rect.left * scaleX)}px`;
        box.style.top = `${Math.max(0, rect.top * scaleY)}px`;
        box.style.width = `${Math.max(20, rect.width * scaleX)}px`;
        box.style.height = `${Math.max(14, rect.height * scaleY)}px`;
        box.title = `Coincidencia: ${rect.text}`;
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
}

async function renderPdfSelectionOverlay(page, viewport) {
    const selection = state.currentPdfSelection;
    if (!selection) {
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
        const highlights = buildPdfTextHighlights(textContent.items || [], viewport, selection);
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
        clearPdfSelectionLayer();
        return;
    }

    state.currentPdfSelection = {
        id: String(row?.ID ?? '').trim(),
        pos: String(row?.POS ?? '').trim(),
        pn: String(row?.pn_final ?? row?.['PART NO.'] ?? row?.pn ?? '').trim(),
        designationFinal: String(row?.designation_final ?? row?.DESIGNATION ?? '').trim(),
        book: String(row?.engine_model ?? '').trim(),
        page: String(row?.['Source Page'] ?? '').trim(),
        renderBook: '',
        renderPageNum: 0
    };
}

export function setPdfStatus(message, isVisible = true) {
    const pdfStatus = document.getElementById('pdfStatus');
    if (!pdfStatus) return;
    pdfStatus.textContent = message;
    pdfStatus.classList.toggle('hidden', !isVisible);
}

export async function renderPdfPage(pdfUrl, pageNum) {
    if (!window.pdfjsLib) throw new Error('PDF.js no está disponible');

    const canvas = document.getElementById('pdfCanvas');
    const viewer = document.getElementById('pdfViewer');
    const viewerInner = document.querySelector('.pdfviewer-inner');
    if (!(canvas instanceof HTMLCanvasElement) || !viewer) return;

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
    const availableWidth = Math.max(120, (viewerInner?.clientWidth || viewer.clientWidth || baseViewport.width) - PDF_FIT_WIDTH_MARGIN);
    const fitScale = Math.max(0.1, availableWidth / baseViewport.width);
    const zoomFactor = getCurrentPdfZoomFactor();
    const viewport = page.getViewport({ scale: fitScale * zoomFactor });
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
    await renderPdfSelectionOverlay(page, viewport);
    if (requestToken !== state.currentPdfRequestToken) return;

    state.currentPdfRenderTask = null;
    viewer.scrollTop = 0;
    viewer.scrollLeft = 0;
    setPdfStatus('', false);
}

export async function loadPdfWithPage(book, page) {
    const pdfLabel = document.getElementById('pdfLabel');
    const pdfMeta = document.getElementById('pdfMeta');
    if (!pdfLabel) return;

    const bookClean = String(book).trim();
    const pageClean = String(page).trim();
    if (!bookClean || bookClean === '—' || !pageClean || pageClean === '—') {
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
        await renderPdfPage(pdfUrl, pageNum);
    } catch (error) {
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

    if (pdfLabel) pdfLabel.textContent = '—';
    if (pdfMeta) pdfMeta.textContent = 'Selecciona libro y página para ver el PDF';
    state.currentPdfPageNumber = 0;
    state.currentPdfSelectionRects = [];
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

export function requestPdfRelayout() {
    if (pdfRelayoutRafId) {
        cancelAnimationFrame(pdfRelayoutRafId);
        pdfRelayoutRafId = 0;
    }

    pdfRelayoutRafId = requestAnimationFrame(() => {
        pdfRelayoutRafId = 0;
        if (state.rightPanelTab !== 'pdf') return;
        if (!state.currentPdfSource || state.currentPdfPageNumber <= 0) return;

        renderPdfPage(state.currentPdfSource, state.currentPdfPageNumber)
            .catch(error => console.error('Error recalculando layout del PDF:', error));
    });
}
