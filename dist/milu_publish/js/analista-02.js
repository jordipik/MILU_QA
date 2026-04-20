import { state } from './state.js';
import { getEngineJsonFiles, loadEngineDataByFileName, saveCellToServer } from './data-loader.js';
import { assignRevisionKeys, applyRevisionDataToRows } from './revision.js';
import { initPdfZoomControls, loadPdfClear, loadPdfWithPage, requestPdfRelayout, setPdfReadTokens, setPdfSelection } from './pdf-viewer.js';
import { evaluateRowQaChecks, getAllQaCheckCodes, getQaCheckLabel } from './qa-checks.js';

const $ = (id) => document.getElementById(id);

const QA_LABELS = Object.fromEntries(getAllQaCheckCodes().map((code) => [code, getQaCheckLabel(code)]));

// Checks oficiales por campo para la columna ERR.
// Cada entrada: { code, label, needsPdf, check(row, entry, context) => boolean (true = pasa, false = falla) }
const FIELD_CUSTOM_CHECKS = {
    'POS': [
        { code: 'pos_required', label: 'POS: final lleno', needsPdf: false, check: (row, entry) => normalizeCompareValue(entry?.final) !== '' },
        { code: 'pos_final_pdf_match', label: 'POS: final coincide con PDF', needsPdf: true, check: (row, entry, context) => isCompareMatch(entry?.final, context?.pdfValue) }
    ],
    'PART NO.': [
        { code: 'pn_required', label: 'PN: final lleno', needsPdf: false, check: (row, entry) => normalizeCompareValue(entry?.final) !== '' },
        { code: 'pn_final_pdf_match', label: 'PN: final coincide con PDF', needsPdf: true, check: (row, entry, context) => isCompareMatch(entry?.final, context?.pdfValue) }
    ],
    'DESIGNATION': [
        { code: 'designation_required', label: 'DESIGNATION: final lleno', needsPdf: false, check: (row, entry) => normalizeCompareValue(entry?.final) !== '' },
        {
            code: 'designation_final_pdf_or_gesa_match',
            label: 'DESIGNATION: final coincide con PDF o GESA',
            needsPdf: true,
            check: (row, entry, context) => isCompareMatch(entry?.final, context?.pdfValue) || isCompareMatch(entry?.final, entry?.gesa)
        }
    ],
    'WEIGHT': [
        {
            code: 'weight_final_pdf_or_gesa_match',
            label: 'WEIGHT: final coincide con PDF o GESA',
            needsPdf: true,
            check: (row, entry, context) => isCompareMatch(entry?.final, context?.pdfValue) || isCompareMatch(entry?.final, entry?.gesa)
        }
    ],
    'MEASUREMENT / STANDARD': [
        {
            code: 'measurement_final_pdf_or_gesa_match',
            label: 'MEASUREMENT: final coincide con PDF o GESA',
            needsPdf: true,
            check: (row, entry, context) => {
                const finalValue = normalizeCompareValue(entry?.final);
                const pdfValue = normalizeCompareValue(context?.pdfValue);
                const gesaValue = normalizeCompareValue(entry?.gesa);
                if (!finalValue && !pdfValue && !gesaValue) return true;
                return isCompareMatch(entry?.final, context?.pdfValue) || isCompareMatch(entry?.final, entry?.gesa);
            }
        }
    ],
    'NORMA': [
        {
            code: 'norma_final_pdf_or_gesa_match',
            label: 'NORMA: final coincide con PDF o GESA (o todos vacios)',
            needsPdf: true,
            check: (row, entry, context) => {
                const finalValue = normalizeCompareValue(entry?.final);
                const pdfValue = normalizeCompareValue(context?.pdfValue);
                const gesaValue = normalizeCompareValue(entry?.gesa);
                if (!finalValue && !pdfValue && !gesaValue) return true;
                return isCompareMatch(entry?.final, context?.pdfValue) || isCompareMatch(entry?.final, entry?.gesa);
            }
        }
    ],
    'BOM-No.': [
        {
            code: 'bom_final_pdf_match',
            label: 'BOM: final coincide con PDF',
            needsPdf: true,
            check: (row, entry, context) => isCompareMatch(entry?.final, context?.pdfValue)
        }
    ]
};

function getFieldChecks(row, entry, context = {}) {
    const issues = [];
    const customChecks = FIELD_CUSTOM_CHECKS[entry?.field] ?? [];
    for (const check of customChecks) {
        if (check.needsPdf && !context.pdfReady) continue;
        if (!check.check(row, entry, context)) {
            issues.push({ code: check.code, label: check.label });
        }
    }

    const seen = new Set();
    return issues.filter(issue => {
        if (seen.has(issue.code)) return false;
        seen.add(issue.code);
        return true;
    });
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

function getComparisonCellClasses(entry, pdfValue) {
    const rawValue = txt(entry?.raw);
    const sustValue = txt(entry?.sust);
    const finalValue = txt(entry?.final);
    const gesaValue = txt(entry?.gesa);
    const pdfResolvedValue = txt(pdfValue);
    const finalMissing = isRequiredComparisonField(entry?.field) && normalizeCompareValue(finalValue) === '';
    const rawMatchesSust = isCompareMatch(rawValue, sustValue);
    const gesaMatchesFinal = isCompareMatch(gesaValue, finalValue);
    const pdfMatchesFinal = isCompareMatch(pdfResolvedValue, finalValue);

    return {
        rawClass: rawMatchesSust ? 'compare-match' : '',
        sustClass: rawMatchesSust ? 'compare-match' : '',
        finalClass: finalMissing ? 'compare-missing' : (gesaMatchesFinal || pdfMatchesFinal ? 'compare-match' : ''),
        gesaClass: gesaMatchesFinal ? 'compare-match' : '',
        pdfClass: pdfMatchesFinal ? 'compare-match' : ''
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
            id: 'pn_final_equals_pn_pdf',
            title: 'pn_final igual a pn_pdf',
            pass: !codes.has('pn_final_not_equal_pn_pdf'),
            detail: !codes.has('pn_final_not_equal_pn_pdf') ? 'pn_final coincide con pn_pdf.' : 'pn_final no coincide con pn_pdf.'
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

    const checkEntries = [];
    for (const [field, checks] of Object.entries(FIELD_CUSTOM_CHECKS)) {
        for (const check of checks) {
            checkEntries.push({ field, code: check.code, label: check.label });
        }
    }

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

async function loadEngineForFilter(engineFilter) {
    const engineFile = resolveEngineFileFromFilter(engineFilter);
    if (!engineFile) {
        throw new Error('No se pudo resolver el archivo engine para el filtro seleccionado.');
    }

    const loadedRows = await loadEngineDataByFileName(engineFile);
    state.allData = sortRowsByBookPagePos(loadedRows);

    assignRevisionKeys(state.allData);
    applyRevisionDataToRows(state.allData);

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
    renderRecordPosition(null);
    renderMeta(null);
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

function renderRecordPosition(row) {
    const target = $('recordPositionText');
    if (!(target instanceof HTMLElement)) return;

    const queue = getQueueRows();
    if (!row || !queue.length) {
        target.textContent = 'Registro 0 de 0';
        return;
    }

    const idx = queue.findIndex(item => getRevisionKey(item) === getRevisionKey(row));
    target.textContent = `Registro ${idx >= 0 ? idx + 1 : 0} de ${queue.length}`;
}

function renderMeta(row) {
    const target = $('recordMeta');
    if (!(target instanceof HTMLElement)) return;

    if (!row) {
        target.textContent = 'Sin registro cargado.';
        return;
    }

    target.textContent = `PN/PART NO=${getDisplayPn(row)} | POS=${txt(row?.POS)} | Libro=${txt(row?.engine_model)} | Pagina=${txt(row?.['Source Page'])}`;
}

function getGesaPn(row) {
    const isGesaSi = String(row?.gesa ?? '').trim().toUpperCase() === 'SI';
    if (!isGesaSi) return null;
    return String(row?.pn_final ?? '').trim() || null;
}

function getSustPn(row) {
    const isGesaSi = String(row?.gesa ?? '').trim().toUpperCase() === 'SI';
    if (!isGesaSi) return null;
    return String(row?.pn_final ?? '').trim() || null;
}

function getGesaWeightWithUnits(row) {
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
        { field: 'SUST', raw: null, gesa: null, sust: row?.sust, final: row?.sust, errFields: [] },
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

    const searchClusters = isBomField(entry.field)
        ? pageText.clusters
        : pageText.clusters.filter((cluster) => cluster.lineIndex === pnAnchor.lineIndex);
    const searchItems = isBomField(entry.field)
        ? pageText.items
        : pageText.items.filter((item) => item.lineIndex === pnAnchor.lineIndex);

    const candidates = [entry.final, entry.gesa, entry.raw]
        .map(value => String(value ?? '').trim())
        .filter(value => value && value !== '-');

    const seen = new Set();
    for (const candidate of candidates) {
        const key = candidate.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const normalized = normalizePdfToken(candidate);
        const clusterMatch = searchClusters.find((cluster) => tokenMatchesPdf(cluster.normalized, normalized));
        if (clusterMatch) {
            const exactMatch = extractExactPdfSubstring(clusterMatch.text, candidate);
            if (exactMatch) {
                return { value: exactMatch, token: normalizePdfToken(exactMatch) };
            }
        }

        const itemMatch = searchItems.find((item) => tokenMatchesPdf(item.normalized, normalized));
        if (itemMatch) {
            const exactMatch = extractExactPdfSubstring(itemMatch.text, candidate) || itemMatch.text;
            if (exactMatch) {
                return { value: exactMatch, token: normalizePdfToken(exactMatch) };
            }
        }

        if (tokenMatchesPdf(pageText.normalizedText, normalized)) continue;
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
        const fieldIssues = getFieldChecks(row, entry, { pdfReady: false, pdfValue: '' });
        const errCount = fieldIssues.length;
        const errCellClass = errCount > 0 ? 'field-err has-errors' : 'field-err';
        const errTitle = errCount > 0 ? ` title="${fieldIssues.map(i => escapeHtml(i.label)).join('&#10;')}"` : '';
        return `<tr class="${rowClass}">
            <td class="field">${escapeHtml(entry.field)}</td>
            <td>${escapeHtml(txt(entry.raw))}</td>
            <td>${escapeHtml(txt(entry.gesa))}</td>
            <td>${escapeHtml(txt(entry.sust))}</td>
            <td>${escapeHtml(txt(entry.final))}</td>
            <td class="${loadingClass}">${escapeHtml('...')}</td>
            <td class="${errCellClass}"${errTitle}>${errCount > 0 ? errCount : ''}</td>
        </tr>`;
    }).join('');

    const renderToken = ++comparisonRenderToken;
    const pageText = await getPdfPageNormalizedText(row?.engine_model, row?.['Source Page']);
    if (renderToken !== comparisonRenderToken) return;
    const pnAnchor = findPdfPnAnchor(row, pageText);

    const readTokens = [];

    body.innerHTML = rows.map((entry) => {
        const pdfRead = getPdfValueForRow(row, entry, pageText, pnAnchor);
        if (pdfRead.token) {
            readTokens.push({ field: entry.field, token: pdfRead.token });
        }
        const cellClasses = getComparisonCellClasses(entry, pdfRead.value);
        const rowClass = entry.separatorTop ? 'separator-top' : '';
        const fieldIssues = getFieldChecks(row, entry, { pdfReady: true, pdfValue: pdfRead.value });
        const errCount = fieldIssues.length;
        const errCellClass = errCount > 0 ? 'field-err has-errors' : 'field-err';
        const errTitle = errCount > 0 ? ` title="${fieldIssues.map(i => escapeHtml(i.label)).join('&#10;')}"` : '';
        const finalErrClass = errCount > 0 ? 'compare-final-error' : 'compare-final-ok';
        const finalFullClass = [cellClasses.finalClass, finalErrClass].filter(Boolean).join(' ');
        return `<tr class="${rowClass}">
            <td class="field">${escapeHtml(entry.field)}</td>
            <td class="${cellClasses.rawClass}">${escapeHtml(txt(entry.raw))}</td>
            <td class="${cellClasses.gesaClass}">${escapeHtml(txt(entry.gesa))}</td>
            <td class="${cellClasses.sustClass}">${escapeHtml(txt(entry.sust))}</td>
            <td class="${finalFullClass}">${escapeHtml(txt(entry.final))}</td>
            <td class="${cellClasses.pdfClass}">${escapeHtml(txt(pdfRead.value))}</td>
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

    const codes = getRowCodes(row);
    if (codes.length) {
        codes.forEach((code) => {
            lines.push(`<li class="ko">Check activo: ${QA_LABELS[code] || code}</li>`);
        });
    } else {
        lines.push('<li class="ok">Sin checks QA activos para este registro.</li>');
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
    if (!row) return;

    renderRecordPosition(row);
    renderMeta(row);
    renderComparisonTable(row).catch((error) => {
        console.warn('No se pudo renderizar la comparativa con PDF:', error);
    });
    fillEditFields(row);

    const processState = computeProcessState(row);
    renderProcessList(row, processState);
    renderEvidence(row, processState);
    renderVerdict(processState);
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

    return source.find((row) => {
        const pnFinal = String(row?.pn_final ?? '').trim().toLowerCase();
        const partNo = String(row?.['PART NO.'] ?? '').trim().toLowerCase();
        const id = String(row?.ID ?? '').trim().toLowerCase();
        return pnFinal === key || partNo === key || id === key;
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
        initHorizontalSplitter();
        initComparisonColumnResize();
        loadComparisonColumnWidths();
        initPdfZoomControls();
        loadPdfClear();

        buildEngineOptions();
        const initialModel = String($('engineFilterSelect')?.value || '').trim() || ENGINE_BOOK_MODELS[0] || '';
        await loadEngineForFilter(initialModel);
    } catch (error) {
        const statusText = $('statusText');
        if (statusText) statusText.textContent = `Error iniciando Analista 02: ${error.message}`;
        console.error(error);
    }
}

$('loadRecordBtn').addEventListener('click', () => {
    loadRecordFromControls().catch((error) => alert(`No se pudo cargar el registro: ${error.message}`));
});

$('prevRecordBtn').addEventListener('click', () => {
    loadRelativeRecord(-1).catch((error) => alert(`No se pudo cargar registro anterior: ${error.message}`));
});

$('nextRecordBtn').addEventListener('click', () => {
    loadRelativeRecord(1).catch((error) => alert(`No se pudo cargar siguiente registro: ${error.message}`));
});

$('revalidateBtn').addEventListener('click', () => {
    revalidateCurrentRow().catch((error) => alert(`No se pudo revalidar: ${error.message}`));
});


$('recordIdInput').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    loadRecordFromControls().catch((error) => alert(`No se pudo cargar el registro: ${error.message}`));
});

$('engineFilterSelect').addEventListener('change', () => {
    const selectedModel = String($('engineFilterSelect')?.value || '').trim();
    loadEngineForFilter(selectedModel).catch((error) => {
        alert(`No se pudo cargar el libro seleccionado: ${error.message}`);
    });
});

initialize();
