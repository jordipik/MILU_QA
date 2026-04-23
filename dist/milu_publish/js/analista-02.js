import { state } from './state.js';
import { getEngineJsonFiles, loadEngineDataByFileName, saveCellToServer } from './data-loader.js';
import { assignRevisionKeys, applyRevisionDataToRows } from './revision.js';
import { initPdfZoomControls, loadPdfClear, loadPdfWithPage, requestPdfRelayout, setPdfReadTokens, setPdfSelection } from './pdf-viewer.js';
import { evaluateQaChecksForField, evaluateRowQaChecks, getAllQaCheckCodes, getQaCheckLabel } from './qa-checks.js';

const $ = (id) => document.getElementById(id);

const FIELD_TO_ERROR_KEY = {
    'POS': 'pos_error',
    'PART NO.': 'pn_error',
    'DESIGNATION': 'designation_error',
    'WEIGHT': 'weight_error',
    'MEASUREMENT / STANDARD': 'measurement_error',
    'NORMA': 'norma_error',
    'BOM-No.': 'bom_error'
};

const FIELD_TO_PDF_AUTO_KEY = {
    'POS': 'pos_pdf',
    'PART NO.': 'pn_pdf',
    'DESIGNATION': 'designation_pdf',
    'MODEL/TYPE': 'model_type_pdf',
    'QTY': 'qty_pdf',
    'UNITS': 'units_pdf',
    'WEIGHT': 'weight_pdf',
    'FN': 'fn_pdf',
    'MEASUREMENT / STANDARD': 'measure_pdf',
    'FG/FGS': 'fg_fgs_pdf',
    'GESA': 'gesa_pdf',
    'NSN': 'nsn_pdf',
    'NORMALIZADO': 'normalizado_pdf',
    'NORMA': 'norma_pdf',
    'SUST_STATUS': 'sust_status_pdf',
    'HIERARCHI': 'hierarchi_pdf',
    'SUST_NEW_PART_NUMBER': 'sust_new_part_number_pdf',
    'SUST_SUPERSEDED_LIST': 'sust_superseded_list_pdf',
    'BOM-No.': 'bom_pdf'
};

const QA_LABELS = Object.fromEntries(getAllQaCheckCodes().map((code) => [code, getQaCheckLabel(code)]));

function getFieldChecks(row, entry, context = {}) {
    return evaluateQaChecksForField(row, entry?.field, context);
}

function getStoredFieldErrorCount(row, fieldName) {
    const errorKey = FIELD_TO_ERROR_KEY[String(fieldName ?? '').trim()];
    if (!errorKey) return 0;
    const value = Number(row?.[errorKey]);
    return Number.isFinite(value) ? value : 0;
}

function getStoredErrorSummary(row) {
    return Object.keys(FIELD_TO_ERROR_KEY)
        .map((fieldName) => ({ field: fieldName, count: getStoredFieldErrorCount(row, fieldName) }))
        .filter((entry) => entry.count > 0);
}

function getStoredPdfAutoValue(row, fieldName) {
    const pdfKey = FIELD_TO_PDF_AUTO_KEY[String(fieldName ?? '').trim()];
    if (!pdfKey) return '';
    return String(row?.[pdfKey] ?? '').trim();
}

let currentRow = null;
let currentProcessIndex = 0;
let comparisonRenderToken = 0;
const pdfDocumentPromiseCache = new Map();
const pdfPageTextCache = new Map();
const PDF_CLUSTER_GAP_MAX = 24;
const PDF_LINE_Y_TOLERANCE = 2;
const RIGHT_PANEL_WIDTH_KEY = 'analista02:right-panel-width';
const COMPARISON_WIDTHS_KEY = 'analista02:comparison-column-widths';
const COMPARISON_MIN_COL_WIDTH = 30;
const ENGINE_BOOK_FILES = getEngineJsonFiles();

function getStartupSelectionFromUrl() {
    const params = new URLSearchParams(window.location.search || '');
    const engine = String(params.get('engine') || '').trim();
    const record = String(params.get('record') || '').trim();
    return { engine, record };
}

function inferEngineModelFromFileName(fileName) {
    return String(fileName || '')
        .replace(/^engine_/i, '')
        .replace(/\.json$/i, '')
        .trim();
}

const ENGINE_BOOK_MODELS = ENGINE_BOOK_FILES.map(inferEngineModelFromFileName).filter(Boolean);

function txt(value, fallback = '-') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeString(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeCompareValue(value) {
    const normalized = normalizeString(value);
    if (!normalized || normalized === '-') return '';
    return normalized
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function isCompareMatch(left, right) {
    const normalizedLeft = normalizeCompareValue(left);
    const normalizedRight = normalizeCompareValue(right);
    return normalizedLeft !== '' && normalizedRight !== '' && normalizedLeft === normalizedRight;
}

function isRequiredComparisonField(fieldName) {
    const normalized = String(fieldName ?? '').trim().toUpperCase();
    return normalized === 'POS' || normalized === 'PART NO.' || normalized === 'DESIGNATION';
}

function getComparisonCellClasses(entry, pdfValue, pdfAutoValue = '') {
    const rawValue = txt(entry?.raw);
    const sustValue = txt(entry?.sust);
    const finalValue = txt(entry?.final);
    const gesaValue = txt(entry?.gesa);
    const pdfResolvedValue = txt(pdfValue);
    const pdfAutoResolvedValue = txt(pdfAutoValue);

    const getMismatchClassAgainstFinal = (value) => {
        const normalizedValue = normalizeCompareValue(value);
        const normalizedFinal = normalizeCompareValue(finalValue);
        if (!normalizedValue || !normalizedFinal) return '';
        return normalizedValue === normalizedFinal ? 'compare-match' : 'compare-mismatch-soft';
    };

    const finalMissing = isRequiredComparisonField(entry?.field) && normalizeCompareValue(finalValue) === '';
    const rawMatchesSust = isCompareMatch(rawValue, sustValue);
    const gesaMatchesFinal = isCompareMatch(gesaValue, finalValue);
    const pdfMatchesFinal = isCompareMatch(pdfResolvedValue, finalValue);
    const pdfAutoMatchesFinal = isCompareMatch(pdfAutoResolvedValue, finalValue);
    const rawSustMatchClass = rawMatchesSust ? 'compare-raw-sust-match' : '';

    return {
        rawClass: [getMismatchClassAgainstFinal(rawValue), rawSustMatchClass].filter(Boolean).join(' '),
        sustClass: rawMatchesSust ? `compare-match ${rawSustMatchClass}` : '',
        finalClass: finalMissing ? 'compare-missing' : (gesaMatchesFinal || pdfMatchesFinal || pdfAutoMatchesFinal ? 'compare-match' : ''),
        gesaClass: getMismatchClassAgainstFinal(gesaValue),
        pdfClass: getMismatchClassAgainstFinal(pdfResolvedValue),
        pdfAutoClass: getMismatchClassAgainstFinal(pdfAutoResolvedValue)
    };
}

function normalizePdfToken(value) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function escapeRegExp(value) {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractExactPdfSubstring(sourceText, candidate) {
    const source = String(sourceText ?? '').trim();
    const rawCandidate = String(candidate ?? '').trim();
    if (!source || !rawCandidate) return '';

    const directIndex = source.toLowerCase().indexOf(rawCandidate.toLowerCase());
    if (directIndex >= 0) {
        return source.slice(directIndex, directIndex + rawCandidate.length);
    }

    const pattern = rawCandidate
        .split(/\s+/)
        .filter(Boolean)
        .map(part => escapeRegExp(part))
        .join('\\s+');
    if (!pattern) return '';

    const regex = new RegExp(pattern, 'i');
    const match = source.match(regex);
    return match?.[0] || '';
}

function tokenMatchesPdf(pageText, candidateValue) {
    if (!pageText || !candidateValue) return false;
    if (pageText === candidateValue) return true;

    if (!pageText.includes(candidateValue)) return false;

    const separatorRegex = /[\s\-\,\.\;\/\(\)]/;
    let searchIndex = pageText.indexOf(candidateValue);
    while (searchIndex !== -1) {
        const endIndex = searchIndex + candidateValue.length;
        const beforeOk = searchIndex === 0 || separatorRegex.test(pageText[searchIndex - 1]);
        const afterOk = endIndex === pageText.length || separatorRegex.test(pageText[endIndex]);
        if (beforeOk && afterOk) return true;
        searchIndex = pageText.indexOf(candidateValue, searchIndex + 1);
    }

    return false;
}

function resolvePdfPageNumber(value) {
    const parsed = Number(String(value ?? '').replace(/[^0-9]/g, ''));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getPdfPageNormalizedText(book, sourcePage) {
    if (!window.pdfjsLib) {
        return { normalizedText: '', items: [], clusters: [] };
    }

    const bookClean = String(book ?? '').trim();
    const pageNum = resolvePdfPageNumber(sourcePage);
    if (!bookClean || !pageNum) {
        return { normalizedText: '', items: [], clusters: [] };
    }

    const pageCacheKey = `${bookClean}::${pageNum}`;
    if (pdfPageTextCache.has(pageCacheKey)) {
        return pdfPageTextCache.get(pageCacheKey);
    }

    const pdfUrl = new URL(`pdf/${encodeURIComponent(bookClean)}.pdf`, new URL('.', window.location.href)).href;
    if (!pdfDocumentPromiseCache.has(pdfUrl)) {
        pdfDocumentPromiseCache.set(pdfUrl, window.pdfjsLib.getDocument(pdfUrl).promise);
    }

    const task = (async () => {
        const pdfDocument = await pdfDocumentPromiseCache.get(pdfUrl);
        if (pageNum < 1 || pageNum > pdfDocument.numPages) {
            return { normalizedText: '', items: [], clusters: [] };
        }

        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const rawItems = (textContent.items || []).map((item) => {
            const text = String(item?.str || '').trim();
            const tx = item?.transform || [];
            return {
                text,
                normalized: normalizePdfToken(text),
                left: Number(tx?.[4] || 0),
                top: Number(tx?.[5] || 0),
                width: Number(item?.width || 0)
            };
        }).filter((item) => item.normalized);

        const lines = [];
        rawItems.forEach((item) => {
            const line = lines.find((candidate) => Math.abs(candidate.top - item.top) <= PDF_LINE_Y_TOLERANCE);
            if (line) {
                line.items.push(item);
                line.top = (line.top + item.top) / 2;
            } else {
                lines.push({ top: item.top, items: [item] });
            }
        });

        lines.sort((a, b) => b.top - a.top);
        lines.forEach((line, index) => {
            line.lineIndex = index;
            line.items.forEach((item) => {
                item.lineIndex = index;
            });
        });

        const clusters = [];
        lines.forEach((line) => {
            const sorted = [...line.items].sort((a, b) => a.left - b.left);
            let currentCluster = null;

            sorted.forEach((item) => {
                if (!currentCluster) {
                    currentCluster = {
                        right: item.left + item.width,
                        parts: [item.text],
                        normalizedParts: [item.normalized]
                    };
                    return;
                }

                const gap = item.left - currentCluster.right;
                if (gap <= PDF_CLUSTER_GAP_MAX) {
                    currentCluster.parts.push(item.text);
                    currentCluster.normalizedParts.push(item.normalized);
                    currentCluster.right = Math.max(currentCluster.right, item.left + item.width);
                    return;
                }

                clusters.push({
                    text: currentCluster.parts.join(' ').replace(/\s+/g, ' ').trim(),
                    normalized: currentCluster.normalizedParts.join(' ').replace(/\s+/g, ' ').trim(),
                    lineIndex: line.lineIndex
                });

                currentCluster = {
                    right: item.left + item.width,
                    parts: [item.text],
                    normalizedParts: [item.normalized]
                };
            });

            if (currentCluster) {
                clusters.push({
                    text: currentCluster.parts.join(' ').replace(/\s+/g, ' ').trim(),
                    normalized: currentCluster.normalizedParts.join(' ').replace(/\s+/g, ' ').trim(),
                    lineIndex: line.lineIndex
                });
            }
        });

        const joined = rawItems.map((item) => item.text).join(' ');
        return {
            normalizedText: normalizePdfToken(joined),
            items: rawItems,
            clusters
        };
    })().catch((error) => {
        console.warn('No se pudo leer texto PDF para la comparativa:', error);
        return { normalizedText: '', items: [], clusters: [] };
    });

    pdfPageTextCache.set(pageCacheKey, task);
    return task;
}

function getPageSortValue(value) {
    const digits = String(value ?? '').replace(/[^0-9]/g, '');
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function getPosSortValue(value) {
    const digits = String(value ?? '').replace(/[^0-9]/g, '');
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sortRowsByBookPagePos(rows) {
    return [...rows].sort((a, b) => {
        const bookA = String(a?.engine_model ?? '').trim();
        const bookB = String(b?.engine_model ?? '').trim();
        const byBook = bookA.localeCompare(bookB, 'es', { numeric: true, sensitivity: 'base' });
        if (byBook !== 0) return byBook;

        const byPage = getPageSortValue(a?.['Source Page']) - getPageSortValue(b?.['Source Page']);
        if (byPage !== 0) return byPage;

        const byPos = getPosSortValue(a?.POS) - getPosSortValue(b?.POS);
        if (byPos !== 0) return byPos;

        return String(a?.ID ?? '').localeCompare(String(b?.ID ?? ''), 'es', { numeric: true, sensitivity: 'base' });
    });
}

function getQueueRows() {
    const engineFilter = String($('engineFilterSelect')?.value ?? '').trim();
    if (!engineFilter) return sortRowsByBookPagePos(state.allData || []);
    return sortRowsByBookPagePos((state.allData || []).filter(row => String(row?.engine_model ?? '').trim() === engineFilter));
}

function getRevisionKey(row) {
    return String(row?.__qa_revision_key ?? '').trim();
}

function getDisplayPn(row) {
    const pnFinal = String(row?.pn_final ?? '').trim();
    if (pnFinal) return pnFinal;
    const partNo = String(row?.['PART NO.'] ?? '').trim();
    if (partNo) return partNo;
    return '-';
}

function getDistinctRowKey(row) {
    const pnFinal = String(row?.pn_final ?? '').trim();
    if (pnFinal) return pnFinal.toLowerCase();

    const id = String(row?.ID ?? '').trim();
    if (id) return `id:${id.toLowerCase()}`;

    return `rev:${getRevisionKey(row).toLowerCase()}`;
}

function getRowCodes(row) {
    return evaluateRowQaChecks(row, getAllQaCheckCodes()).codes;
}

function getConsistencyWarnings(row) {
    const warnings = [];
    const designationRaw = normalizeString(row?.DESIGNATION);
    const designationFinal = normalizeString(row?.designation_final);

    if (designationRaw && designationFinal && designationRaw.toLowerCase() !== designationFinal.toLowerCase()) {
        warnings.push('Designation raw y designation_final no coinciden exactamente.');
    }

    return warnings;
}

function buildProcessSteps(row) {
    const codes = new Set(getRowCodes(row));
    const warnings = getConsistencyWarnings(row);

    return [
        {
            id: 'identity',
            title: 'Identidad minima (ID + POS)',
            pass: txt(row?.ID, '') !== '' && txt(row?.POS, '') !== '',
            detail: 'Permite trazar el registro en origen y en resultados.'
        },
        {
            id: 'part_no',
            title: 'PART NO. informado en raw',
            pass: !codes.has('missing_part_no'),
            detail: !codes.has('missing_part_no') ? 'PART NO. presente.' : 'Falta PART NO. en el registro raw.'
        },
        {
            id: 'pn_final_presence',
            title: 'pn_final presente',
            pass: !codes.has('missing_pn_final'),
            detail: !codes.has('missing_pn_final') ? 'pn_final informado.' : 'Falta pn_final en el registro final.'
        },
        {
            id: 'pn_final_equals_part_no',
            title: 'pn_final igual a PART NO.',
            pass: isCompareMatch(row?.pn_final, row?.['PART NO.']),
            detail: isCompareMatch(row?.pn_final, row?.['PART NO.']) ? 'pn_final coincide con PART NO.' : 'pn_final no coincide con PART NO.'
        },
        {
            id: 'designation_final_presence',
            title: 'designation_final presente',
            pass: !codes.has('missing_designation_final'),
            detail: !codes.has('missing_designation_final') ? 'designation_final informado.' : 'Falta designation_final.'
        },
        {
            id: 'designation_final_pdf',
            title: 'designation_final localizada en PDF',
            pass: !codes.has('designation_final_not_in_pdf'),
            detail: !codes.has('designation_final_not_in_pdf') ? 'Match de designation_final detectado en PDF.' : 'No hay match de designation_final en PDF.'
        },
        {
            id: 'cross_consistency',
            title: 'Consistencia entre fuentes',
            pass: warnings.length === 0,
            detail: warnings.length ? warnings[0] : 'No se detectan incoherencias basicas entre raw y final.'
        }
    ];
}

function computeProcessState(row) {
    const steps = buildProcessSteps(row);
    const executed = Math.max(0, Math.min(currentProcessIndex, steps.length));
    const executedSteps = steps.slice(0, executed);
    const failedExecuted = executedSteps.filter(step => !step.pass);

    if (executed < steps.length) {
        return {
            status: 'raw',
            title: 'Estado: REGISTRO_RAW',
            message: `Proceso en curso (${executed}/${steps.length}).`,
            steps,
            executed,
            failedExecuted
        };
    }

    if (failedExecuted.length > 0) {
        return {
            status: 'ko',
            title: 'Estado: REGISTRO_KO',
            message: `Proceso completo con ${failedExecuted.length} procesos fallidos.`,
            steps,
            executed,
            failedExecuted
        };
    }

    return {
        status: 'ok',
        title: 'Estado: REGISTRO_OK',
        message: 'Proceso completo sin fallos. Registro listo para OK.',
        steps,
        executed,
        failedExecuted
    };
}

function initHorizontalSplitter() {
    const layout = document.querySelector('.a2-layout');
    const splitter = $('a2Splitter');
    if (!(layout instanceof HTMLElement) || !(splitter instanceof HTMLElement)) return;

    const clampAndApplyWidth = (desiredWidth) => {
        const layoutWidth = Math.max(1, layout.getBoundingClientRect().width);
        const minWidth = 320;
        const maxWidth = Math.max(380, Math.floor(layoutWidth * 0.62));
        const clamped = Math.max(minWidth, Math.min(maxWidth, Math.round(desiredWidth)));
        layout.style.setProperty('--a2-right-width', `${clamped}px`);
        return clamped;
    };

    const savedWidth = Number(localStorage.getItem(RIGHT_PANEL_WIDTH_KEY));
    if (Number.isFinite(savedWidth) && savedWidth > 0) {
        clampAndApplyWidth(savedWidth);
    }

    let dragging = false;

    const onPointerMove = (event) => {
        if (!dragging) return;
        const rect = layout.getBoundingClientRect();
        const desiredWidth = rect.right - event.clientX;
        const applied = clampAndApplyWidth(desiredWidth);
        localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(applied));
        requestPdfRelayout();
        event.preventDefault();
    };

    const stopDragging = () => {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('a2-resizing');
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', stopDragging);
        requestPdfRelayout();
    };

    splitter.addEventListener('pointerdown', (event) => {
        if (window.matchMedia('(max-width: 1200px)').matches) return;
        dragging = true;
        document.body.classList.add('a2-resizing');
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', stopDragging);
        event.preventDefault();
    });

    splitter.addEventListener('keydown', (event) => {
        if (window.matchMedia('(max-width: 1200px)').matches) return;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

        const current = Number.parseInt(getComputedStyle(layout).getPropertyValue('--a2-right-width'), 10) || 420;
        const delta = event.key === 'ArrowLeft' ? 24 : -24;
        const applied = clampAndApplyWidth(current + delta);
        localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(applied));
        requestPdfRelayout();
        event.preventDefault();
    });
}

function saveComparisonColumnWidths() {
    const widths = {};
    document.querySelectorAll('.a2-compare-table thead th').forEach((th, index) => {
        const key = (th.dataset.sort || th.textContent || `idx_${index}`).trim();
        widths[key] = th.style.width || `${th.offsetWidth}px`;
    });
    try { localStorage.setItem(COMPARISON_WIDTHS_KEY, JSON.stringify(widths)); }
    catch (error) { console.warn('No se pudieron guardar anchos de comparativa:', error); }
}

function loadComparisonColumnWidths() {
    let widths = {};
    try { widths = JSON.parse(localStorage.getItem(COMPARISON_WIDTHS_KEY) || '{}'); }
    catch (error) {
        console.warn('No se pudieron cargar anchos de comparativa:', error);
        return;
    }
    if (!Object.keys(widths).length) return;

    document.querySelectorAll('.a2-compare-table thead th').forEach((th, index) => {
        const key = (th.dataset.sort || th.textContent || `idx_${index}`).trim();
        if (widths[key]) th.style.width = widths[key];
    });
}

function initComparisonColumnResize() {
    const table = document.querySelector('.a2-compare-table');
    if (!(table instanceof HTMLTableElement)) return;
    if (table.dataset.columnsResizable === '1') return;

    let resizingColumn = null;
    let startX = 0;
    let startWidth = 0;

    document.querySelectorAll('.a2-compare-table thead th').forEach((th) => {
        th.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            const rect = th.getBoundingClientRect();
            if (rect.right - event.clientX > 6) return;
            resizingColumn = th;
            startX = event.clientX;
            startWidth = th.offsetWidth;
            th.classList.add('resizing');
            event.preventDefault();
        });
    });

    document.addEventListener('mousemove', (event) => {
        if (!resizingColumn) return;
        const newWidth = Math.max(COMPARISON_MIN_COL_WIDTH, startWidth + (event.clientX - startX));
        resizingColumn.style.width = `${newWidth}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!resizingColumn) return;
        resizingColumn.classList.remove('resizing');
        saveComparisonColumnWidths();
        resizingColumn = null;
    });

    table.dataset.columnsResizable = '1';
}

function renderChecksModalBody() {
    const body = $('checksModalBody');
    if (!(body instanceof HTMLElement)) return;

    const checkEntries = (state.qaErrorCheckDefinitions || [])
        .map((definition) => ({
            field: String(definition?.field || '').trim() || '-',
            code: String(definition?.code || '').trim(),
            label: String(definition?.label || definition?.code || '').trim()
        }))
        .filter((definition) => definition.code);

    let html = '';

    html += `<p class="checks-group-title">Listado activo para ERR (${checkEntries.length})</p>`;
    if (checkEntries.length === 0) {
        html += `<p style="font-size:12px;color:#6b7280;margin:0">No hay checks configurados.</p>`;
    } else {
        html += `<ul class="checks-list">`;
        for (const entry of checkEntries) {
            html += `<li class="check-custom"><span class="check-code">${escapeHtml(entry.code)}</span><span class="check-label">${escapeHtml(entry.label)} <em style="color:#6b7280">(campo: ${escapeHtml(entry.field)})</em></span></li>`;
        }
        html += `</ul>`;
    }

    body.innerHTML = html;
}

function initChecksModal() {
    const header = $('errColHeader');
    const modal = $('checksModal');
    const closeBtn = $('checksModalClose');
    const backdrop = modal?.querySelector('.checks-modal-backdrop');

    if (!(header instanceof HTMLElement) || !(modal instanceof HTMLElement)) return;

    header.addEventListener('click', () => {
        renderChecksModalBody();
        modal.hidden = false;
    });

    closeBtn?.addEventListener('click', () => { modal.hidden = true; });
    backdrop?.addEventListener('click', () => { modal.hidden = true; });

    document.addEventListener('keydown', (event) => {
        if (!modal.hidden && event.key === 'Escape') modal.hidden = true;
    });
}

function initRecomputeModal() {
    const openBtn = $('openRecomputeModalBtn');
    const modal = $('recomputeModal');
    const closeBtn = $('recomputeModalClose');
    const backdrop = modal?.querySelector('.recompute-modal-backdrop');

    if (!(openBtn instanceof HTMLElement) || !(modal instanceof HTMLElement)) return;

    const closeModal = () => {
        modal.hidden = true;
    };

    openBtn.addEventListener('click', () => {
        syncRecomputeEngineSelect();
        setRecomputeStatus('Listo para ejecutar.', '');
        modal.hidden = false;
        const recomputeIdInput = $('recomputeIdInput');
        if (recomputeIdInput instanceof HTMLInputElement) {
            recomputeIdInput.focus();
        }
    });

    closeBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);

    document.addEventListener('keydown', (event) => {
        if (!modal.hidden && event.key === 'Escape') closeModal();
    });
}

function initEditRecordModal() {
    const modal = $('editRecordModal');
    const closeBtn = $('editRecordModalClose');
    const backdrop = modal?.querySelector('.edit-record-modal-backdrop');
    const form = $('editRecordForm');
    const resetBtn = $('editRecordResetBtn');

    if (!(modal instanceof HTMLElement)) return;

    const closeModal = () => {
        modal.hidden = true;
    };

    closeBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);

    document.addEventListener('keydown', (event) => {
        if (!modal.hidden && event.key === 'Escape') closeModal();
    });

    resetBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        if (currentRow) populateEditRecordForm(currentRow);
    });

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await saveEditRecordForm();
    });
}

function openEditRecordModalForRow(row = currentRow) {
    if (!row || typeof row !== 'object') return;

    const shellBridge = window.parent && window.parent !== window
        ? window.parent.miluShellOpenPdfRecordModal
        : null;
    if (typeof shellBridge === 'function') {
        const openedInPdfView = shellBridge({
            engine: String(row?.engine_model ?? '').trim(),
            record: String(row?.pn_final ?? row?.['PART NO.'] ?? '').trim(),
            id: String(row?.ID ?? '').trim()
        });
        if (openedInPdfView !== false) return;
    }

    populateEditRecordForm(row);
    setEditRecordStatus('', '');

    const modal = $('editRecordModal');
    if (!(modal instanceof HTMLElement)) return;

    modal.hidden = false;
    $('editRecordPnFinal')?.focus();
}

function openExportRecordModalForRow(row = currentRow) {
    if (!row || typeof row !== 'object') return;

    const shellBridge = window.parent && window.parent !== window
        ? window.parent.miluShellOpenPdfRecordModal
        : null;
    if (typeof shellBridge === 'function') {
        const openedInPdfView = shellBridge({
            mode: 'export',
            engine: String(row?.engine_model ?? '').trim(),
            record: String(row?.pn_final ?? row?.['PART NO.'] ?? '').trim(),
            id: String(row?.ID ?? '').trim()
        });
        if (openedInPdfView !== false) return;
    }

    openEditRecordModalForRow(row);
}

function populateEditRecordForm(row) {
    if (!row || typeof row !== 'object') return;

    const id = String(row?.ID ?? row?.id ?? '').trim();
    if (id) {
        $('editRecordId').value = id;
        const displayInput = $('editRecordIdDisplay');
        if (displayInput instanceof HTMLInputElement) {
            displayInput.value = id;
        }
    }
    if (row?.pn_final) $('editRecordPnFinal').value = String(row.pn_final);
    if (row?.designation_final) $('editRecordDesignationFinal').value = String(row.designation_final);
    if (row?.weight_final) $('editRecordWeightFinal').value = String(row.weight_final);
    if (row?.measurement_final) $('editRecordMeasurementFinal').value = String(row.measurement_final);
    if (row?.norma) $('editRecordNorma').value = String(row.norma);
    if (row?.qa_revision_estado) $('editRecordStatus').value = String(row.qa_revision_estado);
}

async function saveEditRecordForm() {
    try {
        const id = String($('editRecordId')?.value || '').trim();
        if (!id) {
            setEditRecordStatus('ID no válido.', 'error');
            return;
        }

        if (!currentRow) {
            setEditRecordStatus('No hay registro cargado.', 'error');
            return;
        }

        const engineFile = resolveEngineFile(currentRow);
        if (!engineFile) {
            setEditRecordStatus('No se pudo resolver archivo engine.', 'error');
            return;
        }

        const updates = {
            pn_final: String($('editRecordPnFinal')?.value || '').trim(),
            designation_final: String($('editRecordDesignationFinal')?.value || '').trim(),
            weight_final: String($('editRecordWeightFinal')?.value || '').trim(),
            measurement_final: String($('editRecordMeasurementFinal')?.value || '').trim(),
            norma: String($('editRecordNorma')?.value || '').trim(),
            qa_revision_estado: String($('editRecordStatus')?.value || '').trim()
        };

        let saved = false;

        // Guardar cada campo que cambió (incluso si es vacío)
        for (const [key, value] of Object.entries(updates)) {
            if (currentRow[key] !== value) {
                await saveCellToServer(engineFile, id, key, value);
                currentRow[key] = value;
                saved = true;
            }
        }

        if (saved) {
            setEditRecordStatus('Registro guardado correctamente.', 'ok');

            // Cerrar modal después de 800ms
            setTimeout(() => {
                const modal = $('editRecordModal');
                if (modal instanceof HTMLElement) modal.hidden = true;

                // Recargar UI completa
                renderComparison();
                renderRecordMeta();
                renderReviewStateButtons(currentRow);
                renderReviewStats();
            }, 800);
        } else {
            setEditRecordStatus('Sin cambios para guardar.', '');
        }

    } catch (error) {
        setEditRecordStatus(`Error: ${error.message}`, 'error');
        console.error(error);
    }
}

function setEditRecordStatus(message, type = '') {
    const statusEl = $('editRecordStatusMessage');
    if (!(statusEl instanceof HTMLElement)) return;

    statusEl.textContent = message;
    statusEl.className = 'edit-record-status';
    if (type) statusEl.classList.add(`is-${type}`);
}

function isEditableComparisonField(fieldName) {
    const field = String(fieldName ?? '').trim().toUpperCase();
    return field === 'PART NO.'
        || field === 'DESIGNATION'
        || field === 'WEIGHT'
        || field === 'MEASUREMENT / STANDARD'
        || field === 'NORMA';
}

function initComparisonEditTriggers() {
    const body = $('comparisonBody');
    if (!(body instanceof HTMLElement)) return;

    body.addEventListener('dblclick', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;

        const editableCell = target.closest('td[data-open-edit-record-modal="true"]');
        if (!editableCell || !currentRow) return;

        event.preventDefault();
        openEditRecordModalForRow(currentRow);
    });
}

function buildEngineOptions(selectedModel = '') {
    const select = $('engineFilterSelect');
    if (!(select instanceof HTMLSelectElement)) return;

    select.innerHTML = ENGINE_BOOK_MODELS.map((value) => `<option value="${value}">${value}</option>`).join('');
    const defaultModel = ENGINE_BOOK_MODELS[0] || '';
    select.value = selectedModel && ENGINE_BOOK_MODELS.includes(selectedModel) ? selectedModel : defaultModel;
}

function resolveEngineFileFromFilter(engineFilter) {
    const model = String(engineFilter || '').trim();
    if (!model) return ENGINE_BOOK_FILES[0] || '';

    const directMatch = ENGINE_BOOK_FILES.find((file) => inferEngineModelFromFileName(file) === model);
    return directMatch || '';
}

function getBackendCandidateUrls(endpointPath) {
    const currentOrigin = window.location.origin && window.location.origin !== 'null'
        ? window.location.origin
        : '';
    const currentHostname = String(window.location.hostname || '').trim();
    const cleanEndpoint = String(endpointPath || '').trim().replace(/^\/+/, '');
    const sameDirectoryCandidate = new URL(cleanEndpoint, new URL('.', window.location.href)).href;
    const localPortCandidate = currentHostname ? `http://${currentHostname}:3000/${cleanEndpoint}` : '';
    const sameOriginCandidate = currentOrigin ? `${currentOrigin}/${cleanEndpoint}` : `/${cleanEndpoint}`;

    return [
        localPortCandidate,
        `http://localhost:3000/${cleanEndpoint}`,
        sameDirectoryCandidate,
        sameOriginCandidate
    ].filter((url, index, arr) => url && arr.indexOf(url) === index);
}

function setRecomputeStatus(message, status = '') {
    const statusEl = $('recomputeStatusText');
    if (!(statusEl instanceof HTMLElement)) return;
    statusEl.classList.remove('is-ok', 'is-error');
    if (status === 'ok') statusEl.classList.add('is-ok');
    if (status === 'error') statusEl.classList.add('is-error');
    statusEl.textContent = message;
}

function syncRecomputeEngineSelect() {
    const source = $('engineFilterSelect');
    const target = $('recomputeEngineSelect');
    if (!(source instanceof HTMLSelectElement) || !(target instanceof HTMLSelectElement)) return;

    target.innerHTML = ENGINE_BOOK_MODELS
        .map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`)
        .join('');
    target.value = source.value;
}

async function runBackendRecompute() {
    const recomputeEngineSelect = $('recomputeEngineSelect');
    const recomputeIdInput = $('recomputeIdInput');
    const recomputeDryRunInput = $('recomputeDryRunInput');
    const recomputeRunBtn = $('recomputeRunBtn');
    const recomputePdfRunBtn = $('recomputePdfRunBtn');
    const engineFilterSelect = $('engineFilterSelect');

    if (!(recomputeEngineSelect instanceof HTMLSelectElement)
        || !(recomputeIdInput instanceof HTMLInputElement)
        || !(recomputeDryRunInput instanceof HTMLInputElement)
        || !(recomputeRunBtn instanceof HTMLButtonElement)
        || !(engineFilterSelect instanceof HTMLSelectElement)) {
        return;
    }

    const selectedModel = String(recomputeEngineSelect.value || '').trim();
    const file = resolveEngineFileFromFilter(selectedModel);
    const id = String(recomputeIdInput.value || '').trim();
    const dryRun = recomputeDryRunInput.checked;

    if (!file) {
        alert('No se pudo resolver el archivo engine para el recálculo.');
        return;
    }

    const payload = {
        file,
        dryRun,
        updateRevision: true,
        backup: true
    };
    if (id) payload.id = id;

    recomputeRunBtn.disabled = true;
    if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = true;
    setRecomputeStatus('Ejecutando recálculo en backend...', '');

    const urls = getBackendCandidateUrls('recompute-qa-errors');
    let lastError = '';
    let result = null;

    for (const url of urls) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const rawBody = await response.text();
            let data = null;
            try {
                data = rawBody ? JSON.parse(rawBody) : null;
            } catch (_parseError) {
                data = null;
            }

            if (!response.ok) {
                lastError = String(data?.error || `HTTP ${response.status}`).trim();
                continue;
            }

            const legacyTotals = data?.totals;
            const hasLegacyPayload = data?.ok === true && legacyTotals && typeof legacyTotals === 'object';

            if (!data || data.ok !== true || (!data.result && !hasLegacyPayload)) {
                const snippet = rawBody
                    ? rawBody.replace(/\s+/g, ' ').trim().slice(0, 140)
                    : '';
                lastError = snippet
                    ? `Respuesta invalida desde ${url}: ${snippet}`
                    : `Respuesta invalida desde ${url} (esperado JSON con { ok: true, result }).`;
                continue;
            }

            if (data.result && typeof data.result === 'object') {
                result = data.result;
            } else {
                result = {
                    file,
                    mode: id ? 'single-id' : 'full-book',
                    id: id || null,
                    dryRun,
                    updateRevision: true,
                    scanned: Number(legacyTotals.totalRows) || 0,
                    changedRows: Number(legacyTotals.changedRows) || 0,
                    okRows: Math.max((Number(legacyTotals.totalRows) || 0) - (Number(legacyTotals.rowsWithErrors) || 0), 0),
                    koRows: Number(legacyTotals.rowsWithErrors) || 0,
                    wroteFile: !dryRun && (Number(legacyTotals.changedRows) || 0) > 0
                };
            }
            break;
        } catch (error) {
            lastError = String(error?.message || error || 'Error de red');
        }
    }

    recomputeRunBtn.disabled = false;
    if (recomputePdfRunBtn instanceof HTMLButtonElement) recomputePdfRunBtn.disabled = false;

    if (!result) {
        setRecomputeStatus(
            `Error: ${lastError || 'No se pudo ejecutar el recálculo. Comprueba que server.js este activo en http://localhost:3000 y responde en /health.'}`,
            'error'
        );
        return;
    }

    const modeLabel = result.mode === 'single-id' ? `ID ${result.id}` : 'libro completo';
    setRecomputeStatus(
        `OK ${modeLabel} | scanned=${result.scanned} changed=${result.changedRows} ok=${result.okRows} ko=${result.koRows} dryRun=${result.dryRun ? 'si' : 'no'}`,
        'ok'
    );

    if (!result.dryRun && result.wroteFile) {
        const selectedMainModel = String(engineFilterSelect.value || '').trim();
        if (selectedMainModel === selectedModel) {
            const keepRecord = currentRow ? txt(currentRow?.ID, '') : '';
            await loadEngineForFilter(selectedMainModel);
            if (keepRecord) {
                const reloaded = findRecordByPrimaryKey(keepRecord, selectedMainModel);
                if (reloaded) {
                    currentRow = reloaded;
                    $('recordIdInput').value = getDisplayPn(reloaded);
                    currentProcessIndex = 0;
                    await revalidateCurrentRow();
                }
            }
            updateRecordSearchSuggestions();
        }
    }
}

async function runBackendRecomputePdfAuto() {
    const recomputeEngineSelect = $('recomputeEngineSelect');
    const recomputeIdInput = $('recomputeIdInput');
    const recomputeDryRunInput = $('recomputeDryRunInput');
    const recomputeRunBtn = $('recomputeRunBtn');
    const recomputePdfRunBtn = $('recomputePdfRunBtn');
    const engineFilterSelect = $('engineFilterSelect');

    if (!(recomputeEngineSelect instanceof HTMLSelectElement)
        || !(recomputeIdInput instanceof HTMLInputElement)
        || !(recomputeDryRunInput instanceof HTMLInputElement)
        || !(recomputeRunBtn instanceof HTMLButtonElement)
        || !(recomputePdfRunBtn instanceof HTMLButtonElement)
        || !(engineFilterSelect instanceof HTMLSelectElement)) {
        return;
    }

    const selectedModel = String(recomputeEngineSelect.value || '').trim();
    const file = resolveEngineFileFromFilter(selectedModel);
    const id = String(recomputeIdInput.value || '').trim();
    const dryRun = recomputeDryRunInput.checked;

    if (!file) {
        alert('No se pudo resolver el archivo engine para recalcular PDF_AUTO.');
        return;
    }

    const payload = {
        file,
        dryRun,
        backup: true
    };
    if (id) payload.id = id;

    recomputeRunBtn.disabled = true;
    recomputePdfRunBtn.disabled = true;
    setRecomputeStatus('Ejecutando recalculo PDF_AUTO en backend...', '');

    const urls = getBackendCandidateUrls('recompute-pdf-auto');
    let lastError = '';
    let result = null;

    for (const url of urls) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const rawBody = await response.text();
            let data = null;
            try {
                data = rawBody ? JSON.parse(rawBody) : null;
            } catch (_parseError) {
                data = null;
            }

            if (!response.ok) {
                lastError = String(data?.error || `HTTP ${response.status}`).trim();
                continue;
            }

            if (!data || data.ok !== true || !data.result || typeof data.result !== 'object') {
                const snippet = rawBody
                    ? rawBody.replace(/\s+/g, ' ').trim().slice(0, 140)
                    : '';
                lastError = snippet
                    ? `Respuesta invalida desde ${url}: ${snippet}`
                    : `Respuesta invalida desde ${url} (esperado JSON con { ok: true, result }).`;
                continue;
            }

            result = data.result;
            break;
        } catch (error) {
            lastError = String(error?.message || error || 'Error de red');
        }
    }

    recomputeRunBtn.disabled = false;
    recomputePdfRunBtn.disabled = false;

    if (!result) {
        setRecomputeStatus(
            `Error: ${lastError || 'No se pudo ejecutar el recalculo PDF_AUTO. Comprueba que server.js este activo en http://localhost:3000 y responde en /health.'}`,
            'error'
        );
        return;
    }

    const modeLabel = result.mode === 'single-id' ? `ID ${result.id}` : 'libro completo';
    setRecomputeStatus(
        `OK PDF_AUTO ${modeLabel} | scanned=${result.scanned} changed=${result.changedRows} missingPages=${result.missingPages || 0} dryRun=${result.dryRun ? 'si' : 'no'}`,
        'ok'
    );

    if (!result.dryRun && result.wroteFile) {
        const selectedMainModel = String(engineFilterSelect.value || '').trim();
        if (selectedMainModel === selectedModel) {
            const keepRecord = currentRow ? txt(currentRow?.ID, '') : '';
            await loadEngineForFilter(selectedMainModel);
            if (keepRecord) {
                const reloaded = findRecordByPrimaryKey(keepRecord, selectedMainModel);
                if (reloaded) {
                    currentRow = reloaded;
                    $('recordIdInput').value = getDisplayPn(reloaded);
                    currentProcessIndex = 0;
                    await revalidateCurrentRow();
                }
            }
            updateRecordSearchSuggestions();
        }
    }
}

async function loadEngineForFilter(engineFilter) {
    const engineFile = resolveEngineFileFromFilter(engineFilter);
    if (!engineFile) {
        throw new Error('No se pudo resolver el archivo engine para el filtro seleccionado.');
    }

    const loadedRows = await loadEngineDataByFileName(engineFile);
    state.allData = sortRowsByBookPagePos(loadedRows);

    assignRevisionKeys(state.allData);
    applyRevisionDataToRows(state.allData);
    renderReviewStats();

    const selectedModel = inferEngineModelFromFileName(engineFile);
    const engineSelect = $('engineFilterSelect');
    if (engineSelect instanceof HTMLSelectElement) {
        engineSelect.value = selectedModel;
    }

    const firstRow = state.allData[0] || null;
    if (firstRow) {
        currentRow = firstRow;
        $('recordIdInput').value = getDisplayPn(firstRow);
        currentProcessIndex = 0;
        renderRecord(firstRow);
        await revalidateCurrentRow();
        return;
    }

    currentRow = null;
    currentProcessIndex = 0;
    $('recordIdInput').value = '';
    renderMeta(null);
    renderReviewStateButtons(null);
    renderReviewStats([]);
    syncPdfWithCurrentRow(null);
}

function resolveEngineFile(row) {
    const sourceFile = String(row?.source_file ?? '').trim();
    if (sourceFile) {
        const base = sourceFile
            .replace(/^engine_/i, '')
            .replace(/\.xlsx$/i, '')
            .replace(/\.json$/i, '')
            .trim();
        if (base) return `engine_${base}.json`;
    }

    const engineModel = String(row?.engine_model ?? '').trim();
    if (!engineModel) return '';
    if (/^engine_/i.test(engineModel)) return `${engineModel}.json`;
    return `engine_${engineModel}.json`;
}

function fillEditFields(row) {
    const pnFinal = $('editPnFinal');
    const desigFinal = $('editDesignationFinal');
    const measFinal = $('editMeasurementFinal');
    const weightFinal = $('editWeightFinal');
    const revEstado = $('editRevisionEstado');
    const revAccion = $('editRevisionAccion');
    if (pnFinal) pnFinal.value = txt(row?.pn_final, '');
    if (desigFinal) desigFinal.value = txt(row?.designation_final, '');
    if (measFinal) measFinal.value = txt(row?.measurement_final, '');
    if (weightFinal) weightFinal.value = txt(row?.weight_final, '');
    if (revEstado) revEstado.value = txt(row?.qa_revision_estado, '');
    if (revAccion) revAccion.value = txt(row?.qa_revision_accion, '');
}

function getRowErrorCount(row) {
    const total = Number(row?.total_error);
    if (Number.isFinite(total)) return total;

    const fallback = [
        'pos_error',
        'pn_error',
        'designation_error',
        'weight_error',
        'measurement_error',
        'norma_error',
        'bom_error'
    ].reduce((sum, key) => {
        const value = Number(row?.[key]);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    if (fallback > 0) return fallback;
    return row?.has_error ? 1 : 0;
}

function getRowReviewBucket(row) {
    if (!row) return '';

    const estado = String(row?.qa_revision_estado ?? '').trim().toLowerCase();
    const action = String(row?.qa_revision_accion ?? '').trim().toLowerCase();

    // Si fue revisado manualmente (qa_revision_estado === 'revisado'), 
    // mantener el valor asignado sin recalcular
    if (estado === 'revisado') {
        if (action === 'mantener') return 'ok';
        if (action === 'revisar') return 'review';
        if (action === 'descartar') return 'ko';
    }

    // Si no fue revisado manualmente, recalcular basándose en errores
    const errorCount = getRowErrorCount(row);
    if (action === 'revisar' && errorCount === 0) return 'review';
    return errorCount > 0 ? 'ko' : 'ok';
}

function renderReviewStats(rows = getQueueRows(), row = currentRow) {
    const stats = {
        total: 0,
        ok: 0,
        review: 0,
        ko: 0
    };
    const uniqueStats = {
        total: new Set(),
        ok: new Set(),
        review: new Set(),
        ko: new Set()
    };

    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const bucket = getRowReviewBucket(row);
        if (!bucket) return;
        const distinctKey = getDistinctRowKey(row);
        stats.total += 1;
        stats[bucket] += 1;
        uniqueStats.total.add(distinctKey);
        uniqueStats[bucket].add(distinctKey);
    });

    const totalEl = $('statsTotalAnalysed');
    const currentEl = $('statsCurrentIndex');
    const totalUniqueEl = $('statsUniqueTotalAnalysed');
    const okEl = $('statsTotalOk');
    const okUniqueEl = $('statsUniqueTotalOk');
    const reviewEl = $('statsTotalReview');
    const reviewUniqueEl = $('statsUniqueTotalReview');
    const koEl = $('statsTotalKo');
    const koUniqueEl = $('statsUniqueTotalKo');

    let currentIndex = 0;
    if (row && stats.total > 0) {
        const idx = rows.findIndex(item => getRevisionKey(item) === getRevisionKey(row));
        currentIndex = idx >= 0 ? idx + 1 : 0;
    }

    if (totalEl instanceof HTMLElement) totalEl.textContent = String(stats.total);
    if (currentEl instanceof HTMLElement) currentEl.textContent = String(currentIndex);
    if (totalUniqueEl instanceof HTMLElement) totalUniqueEl.textContent = `· ${uniqueStats.total.size} únicos`;
    if (okEl instanceof HTMLElement) okEl.textContent = String(stats.ok);
    if (okUniqueEl instanceof HTMLElement) okUniqueEl.textContent = `· ${uniqueStats.ok.size} únicos`;
    if (reviewEl instanceof HTMLElement) reviewEl.textContent = String(stats.review);
    if (reviewUniqueEl instanceof HTMLElement) reviewUniqueEl.textContent = `· ${uniqueStats.review.size} únicos`;
    if (koEl instanceof HTMLElement) koEl.textContent = String(stats.ko);
    if (koUniqueEl instanceof HTMLElement) koUniqueEl.textContent = `· ${uniqueStats.ko.size} únicos`;
}

function renderReviewStateButtons(row) {
    const okBtn = $('statusOkBtn');
    const reviewBtn = $('statusReviewBtn');
    const koBtn = $('statusKoBtn');
    if (!(okBtn instanceof HTMLButtonElement) || !(reviewBtn instanceof HTMLButtonElement) || !(koBtn instanceof HTMLButtonElement)) return;

    const active = getRowReviewBucket(row);

    [okBtn, reviewBtn, koBtn].forEach((button) => {
        button.classList.remove('is-active');
        button.setAttribute('aria-pressed', 'false');
    });

    if (active === 'ok') {
        okBtn.classList.add('is-active');
        okBtn.setAttribute('aria-pressed', 'true');
    }
    if (active === 'review') {
        reviewBtn.classList.add('is-active');
        reviewBtn.setAttribute('aria-pressed', 'true');
    }
    if (active === 'ko') {
        koBtn.classList.add('is-active');
        koBtn.setAttribute('aria-pressed', 'true');
    }
}

function updateRecordSearchSuggestions() {
    const list = $('recordSearchList');
    if (!(list instanceof HTMLDataListElement)) return;

    const model = String($('engineFilterSelect')?.value || '').trim();
    const scopedRows = model
        ? (state.allData || []).filter((row) => String(row?.engine_model ?? '').trim() === model)
        : (state.allData || []);

    const seen = new Set();
    const options = [];
    scopedRows.forEach((row) => {
        const pn = getDisplayPn(row);
        const designation = txt(row?.designation_final || row?.DESIGNATION, '-');
        const id = txt(row?.ID, '-');
        const value = pn && pn !== '-' ? pn : id;
        if (!value || value === '-') return;
        const key = String(value).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        options.push({ value, label: `${designation} | ID ${id}` });
    });

    list.innerHTML = options
        .slice(0, 300)
        .map((option) => `<option value="${escapeHtml(option.value)}" label="${escapeHtml(option.label)}"></option>`)
        .join('');
}

function renderMeta(row) {
    const target = $('recordMeta');
    if (!(target instanceof HTMLElement)) return;

    if (!row) {
        target.textContent = 'Sin registro cargado.';
        return;
    }

    target.innerHTML = `<section class="a2-meta-block a2-meta-block-book">
<span class="a2-meta-label">Libro + Pag</span>
<strong class="a2-meta-value">${escapeHtml(txt(row?.engine_model))} Pag: ${escapeHtml(txt(row?.['Source Page']))}</strong>
</section>
<section class="a2-meta-block a2-meta-block-pos">
<span class="a2-meta-label">POS</span>
<strong class="a2-meta-value">${escapeHtml(txt(row?.POS))}</strong>
</section>
<section class="a2-meta-block a2-meta-block-pn">
<span class="a2-meta-label">PN</span>
<strong class="a2-meta-value">${escapeHtml(getDisplayPn(row))}</strong>
</section>
<section class="a2-meta-block a2-meta-block-designation">
<div class="a2-meta-designation-inner">
<span class="a2-meta-label">DESIGNATION</span>
<strong class="a2-meta-value">${escapeHtml(txt(row?.designation_final || row?.DESIGNATION))}</strong>
</div>
<div class="a2-meta-actions">
<button id="openEditRecordBtn" type="button" class="a2-meta-edit-btn">Editar</button>
<button id="openExportRecordBtn" type="button" class="a2-meta-edit-btn">Exportar</button>
</div>
</section>`;

    const editBtn = $('openEditRecordBtn');
    if (editBtn instanceof HTMLButtonElement) {
        editBtn.addEventListener('click', () => {
            openEditRecordModalForRow();
        });
    }

    const exportBtn = $('openExportRecordBtn');
    if (exportBtn instanceof HTMLButtonElement) {
        exportBtn.addEventListener('click', () => {
            openExportRecordModalForRow();
        });
    }
}

function getGesaPn(row) {
    const isGesaSi = String(row?.gesa ?? '').trim().toUpperCase() === 'SI';
    if (!isGesaSi) return null;
    return String(row?.pn_final ?? '').trim() || null;
}

function getSustPn(row) {
    const isSustSi = String(row?.sust_status ?? '').trim().toUpperCase() === 'SI';
    if (!isSustSi) return null;
    return String(row?.pn_final ?? '').trim() || null;
}

function getGesaWeightWithUnits(row) {
    renderReviewStats();
    const weight = String(row?.weight_gesa ?? '').trim();
    const units = String(row?.units ?? '').trim();
    if (weight && units) return `${weight} ${units}`;
    if (weight) return weight;
    return null;
}

function buildComparisonRows(row) {
    return [
        { field: 'POS', raw: row?.POS, gesa: null, sust: null, final: row?.pos_final, errFields: ['POS'] },
        { field: 'PART NO.', raw: row?.['PART NO.'], gesa: getGesaPn(row), sust: getSustPn(row), final: row?.pn_final, errFields: ['PART NO.', 'pn_final'] },
        { field: 'DESIGNATION', raw: row?.DESIGNATION, gesa: row?.designation_gesa, sust: null, final: row?.designation_final, errFields: ['designation_final'] },
        { field: 'MODEL/TYPE', raw: row?.['MODEL/TYPE'], gesa: null, sust: null, final: row?.['MODEL/TYPE'], errFields: [] },
        { field: 'QTY', raw: row?.QTY, gesa: null, sust: null, final: row?.qty_final, errFields: [] },
        { field: 'UNITS', raw: row?.UNITS, gesa: null, sust: null, final: row?.UNITS, errFields: [] },
        { field: 'WEIGHT', raw: row?.WEIGHT, gesa: getGesaWeightWithUnits(row), sust: null, final: row?.weight_final, errFields: [] },
        { field: 'FN', raw: row?.FN, gesa: null, sust: null, final: row?.FN, errFields: [] },
        { field: 'MEASUREMENT / STANDARD', raw: row?.['MEASUREMENT / STANDARD'], gesa: row?.dimensions_gesa, sust: null, final: row?.measure_final, errFields: [] },
        { field: 'FG/FGS', raw: row?.['FG/FGS'], gesa: null, sust: null, final: row?.['FG/FGS'], errFields: [] },
        { field: 'BOM-No.', raw: row?.['BOM-No.'], gesa: null, sust: null, final: row?.['BOM-No.'], errFields: [] },
        { field: 'GESA', raw: null, gesa: row?.gesa, sust: null, final: row?.gesa, separatorTop: true, errFields: [] },
        { field: 'NSN', raw: null, gesa: row?.nsn, sust: null, final: row?.nsn, errFields: [] },
        { field: 'NORMALIZADO', raw: null, gesa: row?.normalizado, sust: null, final: row?.normalizado, errFields: [] },
        { field: 'NORMA', raw: null, gesa: row?.norma, sust: null, final: row?.norma, errFields: [] },
        { field: 'SUST_STATUS', raw: null, gesa: null, sust: row?.sust_status, final: row?.sust_status, separatorTop: true, errFields: [] },
        { field: 'HIERARCHI', raw: null, gesa: null, sust: row?.hierarchi ?? row?.sust_hierarchie, final: row?.hierarchi ?? row?.sust_hierarchie, errFields: [] },
        { field: 'SUST_NEW_PART_NUMBER', raw: null, gesa: null, sust: row?.sust_new_part_number, final: row?.sust_new_part_number, errFields: [] },
        { field: 'SUST_SUPERSEDED_LIST', raw: null, gesa: null, sust: row?.sust_superseded_list, final: row?.sust_superseded_list, errFields: [] }
    ];
}

function isBomField(fieldName) {
    return String(fieldName ?? '').trim().toLowerCase().includes('bom');
}

function findPdfPnAnchor(row, pageText) {
    if (!pageText || !pageText.normalizedText) return null;

    const pnCandidates = [row?.pn_final, row?.['PART NO.']]
        .map(value => String(value ?? '').trim())
        .filter(Boolean);

    for (const candidate of pnCandidates) {
        const normalized = normalizePdfToken(candidate);
        const clusterMatch = pageText.clusters.find((cluster) => tokenMatchesPdf(cluster.normalized, normalized));
        if (clusterMatch) return { lineIndex: clusterMatch.lineIndex, token: normalized };

        const itemMatch = pageText.items.find((item) => tokenMatchesPdf(item.normalized, normalized));
        if (itemMatch) return { lineIndex: itemMatch.lineIndex, token: normalized };
    }

    return null;
}

function getPdfValueForRow(row, entry, pageText, pnAnchor) {
    if (!pageText || !pageText.normalizedText) return { value: '-', token: '' };
    if (!pnAnchor) return { value: '-', token: '' };

    const searchClustersLine = isBomField(entry.field)
        ? pageText.clusters
        : pageText.clusters.filter((cluster) => cluster.lineIndex === pnAnchor.lineIndex);
    const searchItemsLine = isBomField(entry.field)
        ? pageText.items
        : pageText.items.filter((item) => item.lineIndex === pnAnchor.lineIndex);

    const searchScopes = [
        { clusters: searchClustersLine, items: searchItemsLine },
        { clusters: pageText.clusters, items: pageText.items }
    ];

    const candidates = [entry.final, entry.gesa, entry.raw]
        .map(value => String(value ?? '').trim())
        .filter(value => value && value !== '-');

    const seen = new Set();
    for (const candidate of candidates) {
        const key = candidate.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const normalized = normalizePdfToken(candidate);
        for (const scope of searchScopes) {
            const clusterMatch = scope.clusters.find((cluster) => tokenMatchesPdf(cluster.normalized, normalized));
            if (clusterMatch) {
                const exactMatch = extractExactPdfSubstring(clusterMatch.text, candidate);
                if (exactMatch) {
                    return { value: exactMatch, token: normalizePdfToken(exactMatch) };
                }
            }

            const itemMatch = scope.items.find((item) => tokenMatchesPdf(item.normalized, normalized));
            if (itemMatch) {
                const exactMatch = extractExactPdfSubstring(itemMatch.text, candidate) || itemMatch.text;
                if (exactMatch) {
                    return { value: exactMatch, token: normalizePdfToken(exactMatch) };
                }
            }
        }

        if (tokenMatchesPdf(pageText.normalizedText, normalized)) {
            return { value: candidate, token: normalized };
        }
    }

    return { value: '-', token: '' };
}

async function renderComparisonTable(row) {
    const body = $('comparisonBody');
    if (!(body instanceof HTMLElement)) return;

    const rows = buildComparisonRows(row);
    setPdfReadTokens([]);

    body.innerHTML = rows.map((entry) => {
        const loadingClass = 'pdf-loading';
        const rowClass = entry.separatorTop ? 'separator-top' : '';
        const pdfAutoValue = getStoredPdfAutoValue(row, entry.field);
        const errCount = getStoredFieldErrorCount(row, entry.field);
        const errCellClass = errCount > 0 ? 'field-err has-errors' : 'field-err';
        const errTitle = errCount > 0 ? ` title="${escapeHtml(`Errores persistidos en JSON: ${errCount}`)}"` : '';
        const finalEditAttrs = isEditableComparisonField(entry.field)
            ? ' data-open-edit-record-modal="true" title="Doble clic para editar en modal"'
            : '';
        return `<tr class="${rowClass}">
            <td class="field">${escapeHtml(entry.field)}</td>
            <td>${escapeHtml(txt(entry.raw))}</td>
            <td>${escapeHtml(txt(entry.gesa))}</td>
            <td>${escapeHtml(txt(entry.sust))}</td>
            <td${finalEditAttrs}>${escapeHtml(txt(entry.final))}</td>
            <td class="${loadingClass}">${escapeHtml('...')}</td>
            <td>${escapeHtml(txt(pdfAutoValue))}</td>
            <td class="${errCellClass}"${errTitle}>${errCount > 0 ? errCount : ''}</td>
        </tr>`;
    }).join('');

    const renderToken = ++comparisonRenderToken;
    const pageText = await getPdfPageNormalizedText(row?.engine_model, row?.['Source Page']);
    if (renderToken !== comparisonRenderToken) return;
    const pnAnchor = findPdfPnAnchor(row, pageText);

    const readTokens = [];
    const fieldErrorAccum = {};

    body.innerHTML = rows.map((entry) => {
        const pdfRead = getPdfValueForRow(row, entry, pageText, pnAnchor);
        if (pdfRead.token) {
            readTokens.push({ field: entry.field, token: pdfRead.token });
        }
        const pdfAutoValue = getStoredPdfAutoValue(row, entry.field);
        const cellClasses = getComparisonCellClasses(entry, pdfRead.value, pdfAutoValue);
        const rowClass = entry.separatorTop ? 'separator-top' : '';
        const errCount = getStoredFieldErrorCount(row, entry.field);
        fieldErrorAccum[entry.field] = errCount;
        const errCellClass = errCount > 0 ? 'field-err has-errors' : 'field-err';
        const errTitle = errCount > 0 ? ` title="${escapeHtml(`Errores persistidos en JSON: ${errCount}`)}"` : '';
        const finalErrClass = errCount > 0 ? 'compare-final-error' : 'compare-final-ok';
        const finalFullClass = [cellClasses.finalClass, finalErrClass].filter(Boolean).join(' ');
        const finalEditAttrs = isEditableComparisonField(entry.field)
            ? ' data-open-edit-record-modal="true" title="Doble clic para editar en modal"'
            : '';
        return `<tr class="${rowClass}">
            <td class="field">${escapeHtml(entry.field)}</td>
            <td class="${cellClasses.rawClass}">${escapeHtml(txt(entry.raw))}</td>
            <td class="${cellClasses.gesaClass}">${escapeHtml(txt(entry.gesa))}</td>
            <td class="${cellClasses.sustClass}">${escapeHtml(txt(entry.sust))}</td>
            <td class="${finalFullClass}"${finalEditAttrs}>${escapeHtml(txt(entry.final))}</td>
            <td class="${cellClasses.pdfClass}">${escapeHtml(txt(pdfRead.value))}</td>
            <td class="${cellClasses.pdfAutoClass}">${escapeHtml(txt(pdfAutoValue))}</td>
            <td class="${errCellClass}"${errTitle}>${errCount > 0 ? errCount : ''}</td>
        </tr>`;
    }).join('');
    const dedupedReadTokens = [];
    const seenReadTokens = new Set();
    readTokens.forEach((entry) => {
        const key = `${String(entry.field || '').toLowerCase()}|${entry.token}`;
        if (seenReadTokens.has(key)) return;
        seenReadTokens.add(key);
        dedupedReadTokens.push(entry);
    });
    setPdfReadTokens(dedupedReadTokens);
}

function renderProcessList(row, processState) {
    const list = $('processList');
    const summary = $('processSummary');
    if (!(list instanceof HTMLElement) || !(summary instanceof HTMLElement)) return;

    const steps = processState.steps;
    summary.textContent = `${processState.executed}/${steps.length} procesos ejecutados`;

    list.innerHTML = steps.map((step, index) => {
        let cssClass = 'pending';
        let stateLabel = 'PENDIENTE';

        if (index < processState.executed) {
            if (step.pass) {
                cssClass = 'pass';
                stateLabel = 'PASS';
            } else {
                cssClass = 'fail';
                stateLabel = 'FAIL';
            }
        }

        return `<li class="${cssClass}">
            <div class="head">
                <span class="title">${index + 1}. ${step.title}</span>
                <span class="state">${stateLabel}</span>
            </div>
            <p>${step.detail}</p>
        </li>`;
    }).join('');
}

function renderEvidence(row, processState) {
    const statusText = $('statusText');
    const evidence = $('evidenceList');
    if (!(statusText instanceof HTMLElement) || !(evidence instanceof HTMLElement)) return;

    statusText.textContent = processState.message;

    const lines = [];
    lines.push(`<li>Registro: PN/PART NO ${getDisplayPn(row)} | ${txt(row?.engine_model)} / ${txt(row?.['Source Page'])} / POS ${txt(row?.POS)}</li>`);
    lines.push(`<li class="${processState.status === 'ok' ? 'ok' : processState.status === 'ko' ? 'ko' : ''}">Veredicto actual: ${processState.title}</li>`);

    const storedErrors = getStoredErrorSummary(row);
    if (storedErrors.length) {
        storedErrors.forEach((entry) => {
            lines.push(`<li class="ko">Error persistido: ${escapeHtml(entry.field)} = ${entry.count}</li>`);
        });
    } else {
        lines.push('<li class="ok">Sin errores persistidos en el JSON para este registro.</li>');
    }

    evidence.innerHTML = lines.join('');
}

function renderVerdict(processState) {
    const verdict = $('globalVerdict');
    if (!(verdict instanceof HTMLElement)) return;

    verdict.classList.remove('raw', 'ok', 'ko');
    verdict.classList.add(processState.status);
    verdict.textContent = processState.title;
}

function syncPdfWithCurrentRow(row) {
    if (!row) {
        setPdfSelection(null);
        loadPdfClear();
        return;
    }

    setPdfSelection(row);

    const book = String(row?.engine_model ?? '').trim();
    const page = String(row?.['Source Page'] ?? '').trim();
    if (!book || !page) {
        loadPdfClear();
        return;
    }

    loadPdfWithPage(book, page).catch((error) => {
        console.error('No se pudo cargar PDF del registro:', error);
    });
}

function renderRecord(row) {
    if (!row) {
        renderReviewStateButtons(null);
        renderReviewStats([], null);
        return;
    }

    renderReviewStats(getQueueRows(), row);
    renderMeta(row);
    renderComparisonTable(row).catch((error) => {
        console.warn('No se pudo renderizar la comparativa con PDF:', error);
    });
    fillEditFields(row);

    const processState = computeProcessState(row);
    renderProcessList(row, processState);
    renderEvidence(row, processState);
    renderVerdict(processState);
    renderReviewStateButtons(row);
    syncPdfWithCurrentRow(row);
}

function syncCurrentRowReference() {
    if (!currentRow) return;
    const key = getRevisionKey(currentRow);
    if (!key) return;

    const updated = (state.allData || []).find(row => getRevisionKey(row) === key);
    if (updated) currentRow = updated;
}

function getActiveCodes() {
    return (state.qaErrorCheckDefinitions || [])
        .map(def => String(def?.code ?? '').trim())
        .filter(Boolean);
}

async function revalidateCurrentRow() {
    if (!currentRow) {
        alert('Primero debes cargar un registro.');
        return;
    }

    syncCurrentRowReference();
    renderRecord(currentRow);
}

async function saveCurrentFieldChanges() {
    if (!currentRow) {
        alert('Primero debes cargar un registro.');
        return;
    }

    const engineFile = resolveEngineFile(currentRow);
    const id = txt(currentRow?.ID, '');
    if (!engineFile || !id) {
        alert('No se pudo resolver archivo engine o ID para guardar.');
        return;
    }

    const changes = [
        ['pn_final', $('editPnFinal')?.value ?? txt(currentRow?.pn_final, '')],
        ['designation_final', $('editDesignationFinal')?.value ?? txt(currentRow?.designation_final, '')],
        ['measurement_final', $('editMeasurementFinal')?.value ?? txt(currentRow?.measurement_final, '')],
        ['weight_final', $('editWeightFinal')?.value ?? txt(currentRow?.weight_final, '')],
        ['qa_revision_estado', $('editRevisionEstado')?.value ?? txt(currentRow?.qa_revision_estado, '')],
        ['qa_revision_accion', $('editRevisionAccion')?.value ?? txt(currentRow?.qa_revision_accion, '')]
    ];

    for (const [field, value] of changes) {
        if (String(currentRow?.[field] ?? '') === String(value ?? '')) continue;
        await saveCellToServer(engineFile, id, field, value);
        currentRow[field] = value;
    }

    renderReviewStats();
    await revalidateCurrentRow();
}

async function setOutcome(kind) {
    $('editRevisionEstado').value = kind === 'ok' ? 'revisado' : 'descartado';
    $('editRevisionAccion').value = kind === 'ok' ? 'mantener' : 'revisar';
    currentProcessIndex = buildProcessSteps(currentRow).length;
    await saveCurrentFieldChanges();
}

function findRecordByPrimaryKey(recordKey, engineFilter) {
    const key = String(recordKey ?? '').trim().toLowerCase();
    if (!key) return null;

    const source = engineFilter
        ? (state.allData || []).filter((row) => String(row?.engine_model ?? '').trim() === engineFilter)
        : (state.allData || []);

    const exact = source.find((row) => {
        const pnFinal = String(row?.pn_final ?? '').trim().toLowerCase();
        const partNo = String(row?.['PART NO.'] ?? '').trim().toLowerCase();
        const id = String(row?.ID ?? '').trim().toLowerCase();
        return pnFinal === key || partNo === key || id === key;
    });
    if (exact) return exact;

    return source.find((row) => {
        const searchHaystack = [
            row?.pn_final,
            row?.['PART NO.'],
            row?.ID,
            row?.designation_final,
            row?.DESIGNATION
        ].map(value => String(value ?? '').toLowerCase());
        return searchHaystack.some(value => value.includes(key));
    }) || null;
}

async function loadRecordFromControls() {
    const recordKey = $('recordIdInput').value;
    const engineFilter = $('engineFilterSelect').value;
    const found = findRecordByPrimaryKey(recordKey, engineFilter);

    if (!found) {
        alert('No se encontro ningun registro con ese PN/PART NO para el filtro seleccionado.');
        return;
    }

    currentRow = found;
    currentProcessIndex = 0;
    await revalidateCurrentRow();
}

async function loadRelativeRecord(direction) {
    const queue = getQueueRows();
    if (!queue.length) return;

    const currentIndex = currentRow
        ? queue.findIndex(row => getRevisionKey(row) === getRevisionKey(currentRow))
        : -1;

    const targetIndex = currentIndex < 0
        ? 0
        : Math.max(0, Math.min(queue.length - 1, currentIndex + direction));

    if (targetIndex === currentIndex) {
        alert(direction > 0 ? 'Ya estas en el ultimo registro.' : 'Ya estas en el primer registro.');
        return;
    }

    currentRow = queue[targetIndex];
    $('recordIdInput').value = getDisplayPn(currentRow);
    currentProcessIndex = 0;
    await revalidateCurrentRow();
}

function rowHasErrors(row) {
    return getRowErrorCount(row) > 0;
}

async function loadRelativeError(direction) {
    const queue = getQueueRows();
    if (!queue.length) return;

    const startIndex = currentRow
        ? queue.findIndex(row => getRevisionKey(row) === getRevisionKey(currentRow))
        : -1;

    let idx = startIndex;
    while (true) {
        idx += direction;
        if (idx < 0 || idx >= queue.length) {
            alert(direction > 0 ? 'No hay mas registros con error.' : 'No hay errores anteriores.');
            return;
        }
        if (rowHasErrors(queue[idx])) break;
    }

    currentRow = queue[idx];
    $('recordIdInput').value = getDisplayPn(currentRow);
    currentProcessIndex = 0;
    await revalidateCurrentRow();
}

async function setReviewStatus(kind) {
    if (!currentRow) {
        alert('Primero debes cargar un registro.');
        return;
    }

    const engineFile = resolveEngineFile(currentRow);
    const id = txt(currentRow?.ID, '');
    if (!engineFile || !id) {
        alert('No se pudo resolver archivo engine o ID para guardar estado.');
        return;
    }

    const mapping = {
        ok: { qa_revision_estado: 'revisado', qa_revision_accion: 'mantener' },
        review: { qa_revision_estado: 'revisado', qa_revision_accion: 'revisar' },
        ko: { qa_revision_estado: 'revisado', qa_revision_accion: 'descartar' }
    };
    const values = mapping[kind] || mapping.review;

    await saveCellToServer(engineFile, id, 'qa_revision_estado', values.qa_revision_estado);
    await saveCellToServer(engineFile, id, 'qa_revision_accion', values.qa_revision_accion);

    currentRow.qa_revision_estado = values.qa_revision_estado;
    currentRow.qa_revision_accion = values.qa_revision_accion;
    renderReviewStateButtons(currentRow);
    renderReviewStats();
}

async function runNextProcess() {
    if (!currentRow) {
        alert('Primero debes cargar un registro.');
        return;
    }

    await revalidateCurrentRow();

    const total = buildProcessSteps(currentRow).length;
    if (currentProcessIndex >= total) {
        alert('Todos los procesos ya fueron ejecutados para este registro.');
        return;
    }

    currentProcessIndex += 1;
    renderRecord(currentRow);
}

async function runAllProcesses() {
    if (!currentRow) {
        alert('Primero debes cargar un registro.');
        return;
    }

    await revalidateCurrentRow();
    currentProcessIndex = buildProcessSteps(currentRow).length;
    renderRecord(currentRow);
}

async function initialize() {
    try {
        state.rightPanelTab = 'pdf';
        initChecksModal();
        initRecomputeModal();
        initEditRecordModal();
        initComparisonEditTriggers();
        initHorizontalSplitter();
        initComparisonColumnResize();
        loadComparisonColumnWidths();
        initPdfZoomControls();
        loadPdfClear();

        const startup = getStartupSelectionFromUrl();
        const requestedModel = startup.engine && ENGINE_BOOK_MODELS.includes(startup.engine)
            ? startup.engine
            : '';

        buildEngineOptions(requestedModel);
        const initialModel = String($('engineFilterSelect')?.value || '').trim() || ENGINE_BOOK_MODELS[0] || '';
        await loadEngineForFilter(initialModel);
        syncRecomputeEngineSelect();
        updateRecordSearchSuggestions();

        if (startup.record) {
            $('recordIdInput').value = startup.record;
            await loadRecordFromControls();
        }
    } catch (error) {
        const statusText = $('statusText');
        if (statusText) statusText.textContent = `Error iniciando Analista 02: ${error.message}`;
        console.error(error);
    }
}

function bindClick(id, callback) {
    const element = $(id);
    if (!(element instanceof HTMLElement)) return;
    element.addEventListener('click', callback);
}

bindClick('loadRecordBtn', () => {
    loadRecordFromControls().catch((error) => alert(`No se pudo cargar el registro: ${error.message}`));
});

bindClick('prevRecordBtn', () => {
    loadRelativeRecord(-1).catch((error) => alert(`No se pudo cargar registro anterior: ${error.message}`));
});

bindClick('nextRecordBtn', () => {
    loadRelativeRecord(1).catch((error) => alert(`No se pudo cargar siguiente registro: ${error.message}`));
});

bindClick('prevErrorBtn', () => {
    loadRelativeError(-1).catch((error) => alert(`No se pudo cargar error anterior: ${error.message}`));
});

bindClick('nextErrorBtn', () => {
    loadRelativeError(1).catch((error) => alert(`No se pudo cargar siguiente error: ${error.message}`));
});

bindClick('recomputeRunBtn', () => {
    runBackendRecompute().catch((error) => {
        setRecomputeStatus(`Error: ${String(error?.message || error)}`, 'error');
    });
});

bindClick('recomputePdfRunBtn', () => {
    runBackendRecomputePdfAuto().catch((error) => {
        setRecomputeStatus(`Error: ${String(error?.message || error)}`, 'error');
    });
});

bindClick('statusOkBtn', () => {
    setReviewStatus('ok').catch((error) => alert(`No se pudo guardar estado OK: ${error.message}`));
});

bindClick('statusReviewBtn', () => {
    setReviewStatus('review').catch((error) => alert(`No se pudo guardar estado revisar: ${error.message}`));
});

bindClick('statusKoBtn', () => {
    setReviewStatus('ko').catch((error) => alert(`No se pudo guardar estado KO: ${error.message}`));
});

const recordIdInput = $('recordIdInput');
if (recordIdInput instanceof HTMLInputElement) {
    recordIdInput.addEventListener('input', () => {
        updateRecordSearchSuggestions();
    });

    recordIdInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        loadRecordFromControls().catch((error) => alert(`No se pudo cargar el registro: ${error.message}`));
    });
}

const engineFilterSelect = $('engineFilterSelect');
if (engineFilterSelect instanceof HTMLSelectElement) {
    engineFilterSelect.addEventListener('change', () => {
        const selectedModel = String(engineFilterSelect.value || '').trim();
        const recomputeEngineSelect = $('recomputeEngineSelect');
        if (recomputeEngineSelect instanceof HTMLSelectElement) {
            recomputeEngineSelect.value = selectedModel;
        }
        loadEngineForFilter(selectedModel).then(() => {
            updateRecordSearchSuggestions();
        }).catch((error) => {
            alert(`No se pudo cargar el libro seleccionado: ${error.message}`);
        });
    });
}

initialize();
