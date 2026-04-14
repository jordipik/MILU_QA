/**
 * Visor PDF basado en PDF.js.
 */

import { state } from './state.js';

const PDF_FIT_WIDTH_MARGIN = 8;
const PDF_SELECTION_MAX_HIGHLIGHTS = 8;

if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function normalizePdfToken(value) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
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
    delete layer.dataset.selectionLabel;
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
        allowPnContains: pn.length >= 6,
        allowPosContains: false,
        allowDesignationContains: designationFinal.length >= 8
    };
}

function tokenMatches(itemText, tokenValue, allowContains) {
    if (!itemText || !tokenValue) return false;
    if (itemText === tokenValue) return true;
    return !!allowContains && itemText.includes(tokenValue);
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
        highlights.push({
            left: Math.max(0, rect.left - 4),
            top: Math.max(0, rect.top - rect.height - 3),
            width: Math.max(24, rect.width + 8),
            height: Math.max(16, rect.height + 6),
            text: rect.text,
            priority: 6,
            type: 'pn'
        });
    });

    posRects.forEach(rect => {
        highlights.push({
            left: Math.max(0, rect.left - 4),
            top: Math.max(0, rect.top - rect.height - 3),
            width: Math.max(24, rect.width + 8),
            height: Math.max(16, rect.height + 6),
            text: rect.text,
            priority: 5,
            type: 'pos'
        });
    });

    const designationRects = tokens.designationFinal
        ? rects.filter(rect => tokenMatches(rect.normalizedText, tokens.designationFinal, tokens.allowDesignationContains))
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

    let focusHighlight = null;
    highlights.forEach((rect) => {
        const box = document.createElement('div');
        box.className = 'pdf-selection-highlight';
        box.style.left = `${Math.max(0, rect.left)}px`;
        box.style.top = `${Math.max(0, rect.top)}px`;
        box.style.width = `${Math.max(20, rect.width)}px`;
        box.style.height = `${Math.max(14, rect.height)}px`;
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
        pn: String(row?.['PART NO.'] ?? row?.pn ?? '').trim(),
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
    const viewport = page.getViewport({ scale: fitScale });
    const outputScale = window.devicePixelRatio || 1;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo inicializar el canvas del PDF');

    canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
    canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
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
