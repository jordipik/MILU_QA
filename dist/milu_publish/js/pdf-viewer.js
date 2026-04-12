/**
 * Visor PDF basado en PDF.js.
 */

import { state } from './state.js';

const PDF_FIT_WIDTH_MARGIN = 8;

if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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

    const pdfUrl = `../pdf/${encodeURIComponent(bookClean)}.pdf`;
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
