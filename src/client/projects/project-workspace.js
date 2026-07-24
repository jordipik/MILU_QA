import { runTableParser } from '../milu-demo/js/pdf-table-parser.js';

const WORKSPACE_TEMPLATE_URL = new URL('./project-workspace.html', import.meta.url).href;
const TOKEN_KEY = 'milu:auth:token:v1';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const CHARTJS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
const ANIMEJS_URL = 'https://cdn.jsdelivr.net/npm/animejs@3.2.2/lib/anime.min.js';

const TABLE_COLUMNS = [
    { key: 'page', label: 'Pagina', readonly: true },
    { key: 'pos', label: 'POS' },
    { key: 'partNo', label: 'PART NO.' },
    { key: 'designation', label: 'DESIGNATION' },
    { key: 'modelType', label: 'MODEL/TYPE' },
    { key: 'qty', label: 'QTY' },
    { key: 'units', label: 'UNITS' },
    { key: 'weight', label: 'WEIGHT' },
    { key: 'fn', label: 'FN' },
    { key: 'measurement', label: 'MEASUREMENT' },
    { key: 'standard', label: 'STANDARD' },
    { key: 'status', label: 'Estado' },
    { key: 'actions', label: '', readonly: true }
];

let workspaceTemplatePromise = null;
let pdfJsPromise = null;
let chartJsPromise = null;
let animeJsPromise = null;
let activePdfDocument = null;
let activePdfRenderTask = null;
let activeWordPressConnection = null;
let availableWordPressSites = [];
let activeWorkspaceProject = null;
let activeWordPressAutoRun = null;
let activeWordPressCustomers = [];
let activeAnalysisSummary = null;
let activeSeoAudit = null;
let activeSeoEditorItem = null;
let activeSeoUpdatedIds = new Set();
let activeAnalysisCharts = {};
let activeStartSplashCleanup = null;
let activeHeaderMenuController = null;
let activeInvoicePdfDocuments = new Map();
let activeInvoicePdfFiles = new Map();
let activeInvoiceExpandedIds = new Set();
let activeInvoiceBatchReviewId = '';

function bindResponsiveHeaderMenu() {
    activeHeaderMenuController?.abort();
    activeHeaderMenuController = new AbortController();
    const { signal } = activeHeaderMenuController;
    const topbar = document.querySelector('[data-project-workspace-topbar]');
    const toggle = topbar?.querySelector('[data-project-header-menu-toggle]');
    const menu = topbar?.querySelector('[data-project-header-menu]');
    if (!topbar || !toggle || !menu) return;

    const closeMenu = () => {
        menu.classList.remove('is-open');
        document.body.classList.remove('project-header-menu-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Abrir menú del proyecto');
    };

    const openMenu = () => {
        menu.classList.add('is-open');
        document.body.classList.add('project-header-menu-open');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Cerrar menú del proyecto');
    };

    toggle.addEventListener('click', () => {
        if (menu.classList.contains('is-open')) closeMenu();
        else openMenu();
    }, { signal });

    menu.addEventListener('click', (event) => {
        if (event.target === menu || event.target.closest('button')) closeMenu();
    }, { signal });

    document.addEventListener('click', (event) => {
        if (!topbar.contains(event.target)) closeMenu();
    }, { signal });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeMenu();
            toggle.focus();
        }
    }, { signal });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 1100) closeMenu();
    }, { signal });
}
let activePdfRenderNonce = 0;
let activePdfPageNumber = 1;

function syncPdfPageNavigation(workspace, pageNumber = activePdfPageNumber) {
    const navigation = workspace?.querySelector('[data-project-pdf-page-navigation]');
    if (!navigation) return;
    const total = Number(activePdfDocument?.numPages || 0);
    const current = Math.max(1, Math.min(total || 1, Number(pageNumber || 1)));
    activePdfPageNumber = current;
    navigation.hidden = total <= 1;
    const count = navigation.querySelector('[data-project-pdf-page-count]');
    const previous = navigation.querySelector('[data-project-pdf-previous-page]');
    const next = navigation.querySelector('[data-project-pdf-next-page]');
    if (count) count.textContent = `${current} / ${Math.max(1, total)}`;
    if (previous) previous.disabled = current <= 1;
    if (next) next.disabled = !total || current >= total;
}

function apiUrl(pathname) {
    const pathnameCurrent = String(window.location.pathname || '/');
    const basePath = /^\/milu(\/|$)/i.test(pathnameCurrent) ? '/milu' : '';
    return `${basePath}${pathname}`;
}

function authHeaders() {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function ensureWorkspaceStylesheet() {
    if (document.getElementById('alentioProjectWorkspaceStyles')) return;

    const link = document.createElement('link');
    link.id = 'alentioProjectWorkspaceStyles';
    link.rel = 'stylesheet';
    link.href = new URL('./project-workspace.css', import.meta.url).href;
    document.head.appendChild(link);
}

async function loadWorkspaceTemplate() {
    if (!workspaceTemplatePromise) {
        workspaceTemplatePromise = fetch(WORKSPACE_TEMPLATE_URL).then(async (response) => {
            if (!response.ok) {
                throw new Error(`No se pudo cargar project-workspace.html (${response.status})`);
            }

            const holder = document.createElement('div');
            holder.innerHTML = await response.text();

            return holder;
        });
    }

    return workspaceTemplatePromise;
}

function hideMiluApplication() {
    document.body.classList.add('project-shell-active');
}

function showMiluApplication() {
    stopSplashScene();
    document.body.classList.remove('project-shell-active');
    document.querySelectorAll('[data-project-workspace], [data-project-workspace-topbar]').forEach((node) => {
        node.remove();
    });
}

async function logoutProjectSession() {
    try {
        await fetch(apiUrl('/api/auth/logout'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders()
            },
            body: '{}'
        });
    } catch (_) {
        // La sesion local se limpia igualmente aunque el backend no responda.
    }

    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem('alentio:selected-project');

    const url = new URL(window.location.href);
    url.searchParams.delete('project');
    window.location.replace(url.href);
}

function getProjectStorageKey(project) {
    return `alentio:project-workspace:${project.id}:rows`;
}

async function fetchWorkspaceApi(project, options = {}) {
    const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/workspace`), {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data.workspace;
}

async function fetchProjectJson(pathname, options = {}) {
    const response = await fetch(apiUrl(pathname), {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
}

async function fetchProjectBlob(pathname, options = {}) {
    const response = await fetch(apiUrl(pathname), {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
            ...(options.headers || {})
        }
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
    }

    return {
        blob: await response.blob(),
        filename: getDownloadFilename(response.headers.get('Content-Disposition'))
    };
}

function getDownloadFilename(contentDisposition) {
    const header = String(contentDisposition || '');
    const encoded = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (encoded) return decodeURIComponent(encoded[1]);
    const quoted = header.match(/filename="([^"]+)"/i);
    if (quoted) return quoted[1];
    const plain = header.match(/filename=([^;]+)/i);
    return plain ? plain[1].trim() : '';
}

function buildWorkspacePayload(workspaceState) {
    const normalizedState = normalizeWorkspaceDocumentState(workspaceState);

    return {
        documentType: normalizedState.documentType || '',
        documentKind: normalizedState.documentKind || '',
        fileName: normalizedState.fileName || '',
        pageCount: Number(normalizedState.pageCount || 0),
        headerLabels: normalizedState.headerLabels || {},
        columns: normalizedState.columns || [],
        rows: normalizedState.rows || [],
        preview: normalizedState.preview || null,
        invoice: normalizedState.invoice || null,
        invoices: Array.isArray(normalizedState.invoices) ? normalizedState.invoices : [],
        activeInvoiceId: normalizedState.activeInvoiceId || '',
        extractionReport: normalizedState.extractionReport || null,
        updatedAt: normalizedState.updatedAt || ''
    };
}

function toPdfFileName(fileName, fallback = 'documento.pdf') {
    const value = safeText(fileName);
    if (!value) return fallback;
    if (/\.pdf$/i.test(value)) return value;
    if (/\.[a-z0-9]+$/i.test(value)) return value.replace(/\.[a-z0-9]+$/i, '.pdf');
    return `${value}.pdf`;
}

function normalizeInvoiceRecordForPdf(record) {
    if (!record || typeof record !== 'object') return record;

    const convertedPdfFileName = toPdfFileName(
        record.convertedPdfFileName || record.pdfFileName || record.fileName || record.invoice?.fileName,
        'factura.pdf'
    );

    return {
        ...record,
        fileName: convertedPdfFileName,
        convertedPdfFileName,
        documentKind: 'pdf',
        preview: null,
        invoice: record.invoice && typeof record.invoice === 'object'
            ? {
                ...record.invoice,
                fileName: convertedPdfFileName
            }
            : record.invoice
    };
}

function normalizeWorkspaceDocumentState(source) {
    const state = {
        ...(source || {})
    };

    if (state.documentType === 'invoices') {
        const invoices = Array.isArray(state.invoices)
            ? state.invoices.map((record) => normalizeInvoiceRecordForPdf(record))
            : [];
        const activeRecord = state.activeInvoiceId
            ? invoices.find((record) => record.id === state.activeInvoiceId)
            : null;
        const fileName = activeRecord?.fileName
            || toPdfFileName(state.convertedPdfFileName || state.fileName || state.invoice?.fileName, 'factura.pdf');

        return {
            ...state,
            documentKind: 'pdf',
            fileName,
            preview: null,
            invoices,
            invoice: state.invoice && typeof state.invoice === 'object'
                ? {
                    ...state.invoice,
                    fileName
                }
                : state.invoice
        };
    }

    if (state.documentType === 'products' || state.documentType === 'product') {
        return {
            ...state,
            documentType: 'products',
            documentKind: 'pdf',
            fileName: toPdfFileName(state.convertedPdfFileName || state.fileName, 'documento.pdf'),
            preview: null
        };
    }

    return state;
}

function getActiveInvoiceRecord(workspaceState) {
    if (workspaceState?.documentType !== 'invoices' || !workspaceState.activeInvoiceId) return null;
    const records = Array.isArray(workspaceState.invoices) ? workspaceState.invoices : [];
    return records.find((record) => record.id === workspaceState.activeInvoiceId) || null;
}

function buildSavedWorkspacePayload(workspaceState) {
    const payload = buildWorkspacePayload(workspaceState);
    if (payload.documentType !== 'invoices') return payload;

    const activeRecord = workspaceState.invoice ? getActiveInvoiceRecord(workspaceState) : null;
    if (!activeRecord) {
        return {
            ...payload,
            invoice: null,
            activeInvoiceId: '',
            rows: [],
            columns: [],
            headerLabels: {}
        };
    }

    return {
        ...payload,
        fileName: activeRecord.fileName || payload.fileName,
        pageCount: Number(activeRecord.pageCount || payload.pageCount || 0),
        invoice: null,
        invoices: [activeRecord],
        activeInvoiceId: '',
        rows: [],
        columns: [],
        headerLabels: {},
        extractionReport: activeRecord.extractionReport || payload.extractionReport
    };
}

function replaceWorkspaceState(target, source) {
    const normalizedSource = normalizeWorkspaceDocumentState(source);
    Object.keys(target).forEach((key) => {
        delete target[key];
    });
    Object.assign(target, {
        rows: [],
        preview: null,
        fileName: '',
        pageCount: 0,
        documentType: '',
        documentKind: '',
        headerLabels: {},
        columns: [],
        invoice: null,
        invoices: [],
        activeInvoiceId: '',
        extractionReport: null,
        ...(normalizedSource || {})
    });
}

async function listSavedWorkspaces(project, documentType = '') {
    const suffix = documentType ? `?type=${encodeURIComponent(documentType)}` : '';
    const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/saved-workspaces${suffix}`);
    return Array.isArray(data.files) ? data.files : [];
}

async function saveSavedWorkspace(project, workspaceState, name) {
    const savedWorkspace = buildSavedWorkspacePayload(workspaceState);
    const payload = {
        name,
        workspace: savedWorkspace
    };

    const invoicePdfs = await buildInvoicePdfPayload(savedWorkspace);
    if (invoicePdfs.length) {
        payload.invoicePdfs = invoicePdfs;
    }

    const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/saved-workspaces`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    return data.file;
}

async function restoreSavedWorkspace(project, fileId) {
    const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/saved-workspaces/${encodeURIComponent(fileId)}/load`, {
        method: 'POST',
        body: '{}'
    });

    return data.workspace;
}

function safeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
    const chunkSize = 0x8000;
    let binary = '';

    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }

    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(String(base64 || ''));
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes.buffer;
}

async function buildInvoicePdfPayload(workspaceState) {
    if (workspaceState?.documentType !== 'invoices') return [];

    const records = Array.isArray(workspaceState.invoices) ? workspaceState.invoices : [];
    const payload = [];

    for (const record of records) {
        let entry = activeInvoicePdfFiles.get(record.id);

        if (!entry?.buffer && records.length === 1 && activeWorkspaceProject?.id) {
            try {
                const loaded = await loadProjectActivePdfDocument(activeWorkspaceProject);
                const fileName = toPdfFileName(
                    record.convertedPdfFileName || record.fileName || workspaceState.fileName || 'factura.pdf',
                    'factura.pdf'
                );

                activeInvoicePdfDocuments.set(record.id, loaded.pdfDocument);
                activeInvoicePdfFiles.set(record.id, {
                    fileName,
                    buffer: loaded.buffer.slice(0)
                });
                entry = activeInvoicePdfFiles.get(record.id);
            } catch (error) {
                console.warn('No se pudo adjuntar el PDF convertido al guardado:', error);
            }
        }

        if (!entry?.buffer) continue;

        payload.push({
            id: record.id,
            fileName: entry.fileName || record.fileName || 'factura.pdf',
            data: arrayBufferToBase64(entry.buffer)
        });
    }

    return payload;
}

function normalizePdfText(text) {
    return String(text || '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .replace(/[.:]/g, '')
        .trim();
}

function getPageText(textItems) {
    return (Array.isArray(textItems) ? textItems : [])
        .map((item) => safeText(item?.str))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function includesNormalizedToken(text, token) {
    const escapedToken = String(token || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!escapedToken) return false;
    const tokenRegex = new RegExp(`(^|\\s)${escapedToken}(?=\\s|$)`);
    return tokenRegex.test(text);
}

function isPartsTablePage(pageText) {
    const text = normalizePdfText(pageText);
    if (!text) return false;

    const hasPos = includesNormalizedToken(text, 'POS');
    const hasPartNo = includesNormalizedToken(text, 'PART NO')
        || includesNormalizedToken(text, 'PARTNO')
        || includesNormalizedToken(text, 'PART NUMBER')
        || includesNormalizedToken(text, 'PART');
    const hasDesignation = includesNormalizedToken(text, 'DESIGNATION')
        || includesNormalizedToken(text, 'DESCRIPTION')
        || includesNormalizedToken(text, 'DESC');
    if (!(hasPos && hasPartNo && hasDesignation)) return false;

    const optionalTokens = [
        'QTY',
        'UNITS',
        'WEIGHT',
        'FN',
        'MEASUREMENT',
        'STANDARD'
    ];

    return optionalTokens.filter((token) => includesNormalizedToken(text, token)).length >= 2;
}

function isUsefulRow(row) {
    return Boolean(row.pos || row.partNo || row.designation || row.qty || row.standard);
}

function looksLikePartNumber(value) {
    const text = safeText(value).toUpperCase();
    return /[0-9]/.test(text) && /^[A-Z0-9./-]{5,}$/.test(text);
}

function isLikelyTableDataRow(row) {
    const pos = safeText(row.pos);
    const hasNumericPos = /^\d+[A-Z]?$/.test(pos);
    const hasPartNo = looksLikePartNumber(row.partNo);
    const hasDesignation = safeText(row.designation).length >= 2;
    const hasTableValue = Boolean(safeText(row.qty) || safeText(row.units) || safeText(row.weight) || safeText(row.fn) || safeText(row.measurement) || safeText(row.standard));
    const junkText = `${row.partNo} ${row.designation} ${row.measurement} ${row.standard}`.toUpperCase();

    if (/COPYRIGHT|ALL RIGHTS RESERVED|PAGE\s*:|EQUI TYPE|SERIAL NUMBER|PRODUCT TYPE|BOM-NO|FG\/FGS/.test(junkText)) {
        return false;
    }

    return hasNumericPos && (hasPartNo || (hasDesignation && hasTableValue));
}

function isHeaderLikeRow(row) {
    const text = `${row.pos} ${row.partNo} ${row.designation} ${row.qty} ${row.standard}`.toUpperCase();
    return /\b(POS|PART\s*NO|DESIGNATION|QTY|STANDARD)\b/.test(text)
        && !/\d/.test(`${row.pos}${row.partNo}${row.qty}`);
}

function normalizeParserRow(gridRow, pageNumber, rowIndex) {
    const cells = gridRow?.cells || {};
    const row = {
        id: `p${pageNumber}-r${rowIndex}`,
        page: String(pageNumber),
        pos: safeText(cells.pos),
        partNo: safeText(cells.part_no),
        designation: safeText(cells.designation),
        modelType: safeText(cells.model_type),
        qty: safeText(cells.qty),
        units: safeText(cells.units),
        weight: safeText(cells.weight),
        fn: safeText(cells.fn),
        measurement: safeText(cells.measurement),
        standard: safeText(cells.standard),
        status: 'Pendiente',
        edited: false,
        geometry: {
            page: pageNumber,
            y1: Number(gridRow?.y1 || 0),
            y2: Number(gridRow?.y2 || 0),
            pageWidth: Number(gridRow?.pageWidth || 0),
            pageHeight: Number(gridRow?.pageHeight || 0)
        }
    };

    return row;
}

function buildHeaderLabels(parserResult) {
    const labels = {};
    (parserResult?.columns || []).forEach((column) => {
        const keyMap = {
            part_no: 'partNo',
            model_type: 'modelType'
        };
        const key = keyMap[column.key] || column.key;
        if (key && column.label) labels[key] = String(column.label);
    });

    return labels;
}

function toTextRects(textItems, viewport) {
    if (!Array.isArray(textItems) || !viewport || !window.pdfjsLib?.Util?.transform) return [];

    return textItems
        .flatMap((item) => {
            const text = safeText(item?.str);
            if (!text) return [];

            const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
            const left = Number(tx[4] || 0);
            const baseline = Number(tx[5] || 0);
            const width = Math.max(1, Number(item.width || 0) * Number(viewport.scale || 1));
            const height = Math.max(6, Math.abs(Number(item.height || 0) * Number(viewport.scale || 1)) || 8);
            const visualTop = baseline - height;

            const baseRect = {
                text,
                left,
                right: left + width,
                top: visualTop,
                bottom: baseline,
                centerX: left + (width / 2),
                centerY: baseline - (height / 2),
                height
            };

            if (!/\s{3,}/.test(text) || text.length < 4) return [baseRect];

            const charWidth = width / Math.max(1, text.length);
            const segments = [...text.matchAll(/\S(?:.*?\S)?(?=\s{3,}|$)/g)];
            if (segments.length <= 1) return [baseRect];

            return segments.map((match) => {
                const word = safeText(match[0]);
                const wordLeft = left + (Number(match.index || 0) * charWidth);
                const wordWidth = Math.max(1, word.length * charWidth);

                return {
                    text: word,
                    left: wordLeft,
                    right: wordLeft + wordWidth,
                    top: visualTop,
                    bottom: baseline,
                    centerX: wordLeft + (wordWidth / 2),
                    centerY: baseline - (height / 2),
                    height
                };
            });
        })
        .filter((rect) => rect.left >= 0 && rect.top >= 0 && rect.left <= viewport.width && rect.top <= viewport.height);
}

function groupRectsIntoLines(rects, tolerance = 6) {
    const lines = [];
    const sorted = [...rects].sort((a, b) => a.centerY - b.centerY || a.left - b.left);

    sorted.forEach((rect) => {
        let line = lines.find((candidate) => Math.abs(candidate.centerY - rect.centerY) <= tolerance);
        if (!line) {
            line = { rects: [], centerY: rect.centerY };
            lines.push(line);
        }

        line.rects.push(rect);
        line.centerY = line.rects.reduce((sum, item) => sum + item.centerY, 0) / line.rects.length;
    });

    return lines
        .map((line) => {
            const rectsInLine = line.rects.sort((a, b) => a.left - b.left);
            return {
                rects: rectsInLine,
                text: rectsInLine.map((rect) => rect.text).join(' '),
                left: Math.min(...rectsInLine.map((rect) => rect.left)),
                right: Math.max(...rectsInLine.map((rect) => rect.right)),
                top: Math.min(...rectsInLine.map((rect) => rect.top)),
                bottom: Math.max(...rectsInLine.map((rect) => rect.bottom)),
                centerY: line.centerY
            };
        })
        .sort((a, b) => a.centerY - b.centerY);
}

function normalizeColumnKey(label, index) {
    const slug = safeText(label)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 42);

    return slug || `col_${index + 1}`;
}

function isDataLikeLine(line) {
    const text = normalizePdfText(line?.text || '');
    if (!text) return false;
    if (/COPYRIGHT|ALL RIGHTS RESERVED|^PAG\b|^PAGE\b|EQUI TYPE|SERIAL NUMBER|PRODUCT TYPE|BOM-NO|FG\/FGS/.test(text)) return false;
    return /\d/.test(text) && line.rects.length >= 2;
}

function scoreHeaderLine(line, viewportWidth) {
    const text = normalizePdfText(line?.text || '');
    const alphaTokens = line.rects.filter((rect) => /[A-Z]/i.test(rect.text)).length;
    const coverage = (Number(line?.right || 0) - Number(line?.left || 0)) / Math.max(1, viewportWidth);
    const headerHits = [
        'POS',
        'PART',
        'PART NO',
        'PART NUMBER',
        'DESIGNATION',
        'DESCRIPTION',
        'QTY',
        'QUANTITY',
        'UNITS',
        'WEIGHT',
        'MEASUREMENT',
        'STANDARD'
    ].filter((token) => includesNormalizedToken(text, token)).length;

    return (headerHits * 4) + Math.min(alphaTokens, 8) + (coverage >= 0.35 ? 3 : 0) + (line.rects.length >= 4 ? 2 : 0);
}

function clusterHeaderRects(rects) {
    const clusters = [];
    const shouldMergeHeaderTokens = (previous, rect) => {
        if (!previous) return false;

        const gap = rect.left - previous.right;
        const mergedLabel = normalizePdfText(`${previous.label} ${rect.text}`);
        const knownMultiWordHeaders = new Set([
            'PART NO',
            'PART NUMBER',
            'MODEL TYPE',
            'SERIAL NUMBER'
        ]);

        if (knownMultiWordHeaders.has(mergedLabel)) return true;
        return gap <= 3 && previous.rects.length === 1 && rect.text.length <= 3;
    };

    [...rects].sort((a, b) => a.left - b.left).forEach((rect) => {
        const previous = clusters[clusters.length - 1];

        if (shouldMergeHeaderTokens(previous, rect)) {
            previous.rects.push(rect);
            previous.left = Math.min(previous.left, rect.left);
            previous.right = Math.max(previous.right, rect.right);
            previous.top = Math.min(previous.top, rect.top);
            previous.bottom = Math.max(previous.bottom, rect.bottom);
            previous.label = previous.rects.map((item) => item.text).join(' ');
        } else {
            clusters.push({
                rects: [rect],
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                label: rect.text
            });
        }
    });

    return clusters
        .map((cluster, index) => ({
            key: normalizeColumnKey(cluster.label, index),
            label: safeText(cluster.label).toUpperCase(),
            left: cluster.left,
            right: cluster.right,
            centerX: (cluster.left + cluster.right) / 2
        }))
        .filter((column) => column.label.length > 0);
}

function buildColumnBounds(columns, viewportWidth) {
    return columns.map((column, index) => {
        const next = columns[index + 1] || null;
        const rightBoundary = next
            ? Number(next.left || next.centerX) - 1
            : Math.min(viewportWidth, Number(column.right || viewportWidth) + 48);

        return {
            ...column,
            x1: Math.max(0, Number(column.left || column.centerX) - 2),
            x2: Math.min(viewportWidth, rightBoundary)
        };
    });
}

function getHorizontalOverlap(rect, column) {
    return Math.max(0, Math.min(rect.right, column.x2) - Math.max(rect.left, column.x1));
}

function findColumnForRect(rect, columns) {
    if (!rect || !Array.isArray(columns) || !columns.length) return null;

    const matches = columns
        .map((column) => ({
            column,
            overlap: getHorizontalOverlap(rect, column),
            distance: Math.abs(
                Number(rect.centerX || rect.left || 0) -
                Number(column.centerX || column.x1 || 0)
            )
        }))
        .filter((item) => item.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap || a.distance - b.distance);

    if (matches.length) {
        return matches[0].column;
    }

    return columns.reduce((best, column) => {
        const distance = Math.abs(
            Number(rect.centerX || rect.left || 0) -
            Number(column.centerX || column.x1 || 0)
        );

        return !best || distance < best.distance
            ? { column, distance }
            : best;
    }, null)?.column || null;
}

function findColumnIndexForRectStart(rect, columns) {
    const left = Number(rect.left || 0);
    let index = columns.findIndex((column) => left >= column.x1 && left < column.x2);
    if (index >= 0) return index;

    index = columns.reduce((best, column, columnIndex) => {
        const distance = Math.abs(left - column.x1);
        return !best || distance < best.distance ? { columnIndex, distance } : best;
    }, null)?.columnIndex;

    return Number.isFinite(index) ? index : 0;
}

function assignLineRectsSequentially(line, columns) {
    const cells = {};
    const cellRects = {};

    columns.forEach((column) => {
        cells[column.key] = [];
        cellRects[column.key] = [];
    });

    const sortedRects = [...line.rects].sort((a, b) => Number(a.left || 0) - Number(b.left || 0));

    sortedRects.forEach((rect) => {
        const column = findColumnForRect(rect, columns);
        if (!column) return;

        cells[column.key].push(rect.text);
        cellRects[column.key].push(rect);
    });

    return { cells, cellRects };
}

function buildCellGeometry(cellRects, pageNumber, viewport) {
    const geometry = {};

    Object.entries(cellRects).forEach(([key, rects]) => {
        if (!Array.isArray(rects) || !rects.length) return;

        geometry[key] = {
            page: pageNumber,
            x1: Math.min(...rects.map((rect) => Number(rect.left || 0))),
            x2: Math.max(...rects.map((rect) => Number(rect.right || 0))),
            y1: Math.min(...rects.map((rect) => Number(rect.top || 0))),
            y2: Math.max(...rects.map((rect) => Number(rect.bottom || 0))),
            pageWidth: Number(viewport.width || 0),
            pageHeight: Number(viewport.height || 0)
        };
    });

    return geometry;
}

function findColumnByLabels(columns, labels) {
    const expected = labels.map((label) => normalizePdfText(label));
    return columns.find((column) => {
        const normalized = normalizePdfText(column.label || column.key);
        return expected.some((label) => normalized === label || normalized.includes(label));
    }) || null;
}

function getColumnByNormalizedLabel(columns, labels) {
    const expected = labels.map((label) => normalizePdfText(label));
    return columns.find((column) => {
        const normalized = normalizePdfText(column.label || column.key);
        return expected.some((label) => normalized === label || normalized.includes(label));
    }) || null;
}

function scoreTableDataUnderHeader(lines, headerIndex, header, viewport) {
    const candidateLines = lines.slice(headerIndex + 1, headerIndex + 14)
        .filter((line) => line.centerY > header.headerBottom + 2 && line.centerY < viewport.height - 20)
        .filter(isDataLikeLine);
    const partColumn = getColumnByNormalizedLabel(header.columns, ['PN', 'PART NO', 'PART NUMBER', 'PARTNO']);
    const posColumn = getColumnByNormalizedLabel(header.columns, ['POS', 'POSITION']);

    let rowsWithPartNumber = 0;
    let rowsWithPos = 0;
    let rowsWithSeveralColumns = 0;

    candidateLines.forEach((line) => {
        const columnsHit = new Set();
        line.rects.forEach((rect) => {
            const column = findColumnForRect(rect, header.columns);
            if (column) columnsHit.add(column.key);
        });

        if (columnsHit.size >= Math.min(4, header.columns.length)) rowsWithSeveralColumns += 1;

        if (partColumn) {
            const partText = line.rects
                .filter((rect) => findColumnForRect(rect, header.columns)?.key === partColumn.key)
                .map((rect) => rect.text)
                .join('');
            if (looksLikePartNumber(partText)) rowsWithPartNumber += 1;
        }

        if (posColumn) {
            const posText = line.rects
                .filter((rect) => findColumnForRect(rect, header.columns)?.key === posColumn.key)
                .map((rect) => rect.text)
                .join('');
            if (/^\d{1,4}[A-Z]?$/.test(safeText(posText))) rowsWithPos += 1;
        }
    });

    return {
        dataLines: candidateLines.length,
        rowsWithPartNumber,
        rowsWithPos,
        rowsWithSeveralColumns,
        score: (rowsWithPartNumber * 6) + (rowsWithPos * 3) + (rowsWithSeveralColumns * 2)
    };
}

function normalizeGenericRowCells(cells, columns) {
    const normalized = { ...cells };
    const weightColumn = findColumnByLabels(columns, ['WEIGHT', 'PESO']);
    const standardColumn = findColumnByLabels(columns, ['STANDARD', 'NORMA']);
    const errorsColumn = findColumnByLabels(columns, ['ERRORS', 'ERRORES', 'ERROR']);

    if (weightColumn && standardColumn) {
        const standardValue = safeText(normalized[standardColumn.key]);
        const standardWeightMatch = standardValue.match(/^([\d.,]+\s*(?:KGM|KG|GRM|G|TO))(?:\s+(.+))$/i);
        if (standardWeightMatch && !safeText(normalized[weightColumn.key])) {
            normalized[weightColumn.key] = standardWeightMatch[1];
            normalized[standardColumn.key] = safeText(standardWeightMatch[2]);
        }

        const weightValue = safeText(normalized[weightColumn.key]);
        const weightStandardMatch = weightValue.match(/^(.+?\b(?:KGM|KG|GRM|G|TO))\s+((?:DIN|ISO|MMN|MTN|N)\S.*)$/i);
        if (weightStandardMatch && !safeText(normalized[standardColumn.key])) {
            normalized[weightColumn.key] = safeText(weightStandardMatch[1]);
            normalized[standardColumn.key] = safeText(weightStandardMatch[2]);
        }
    }

    if (standardColumn && errorsColumn) {
        const errorsValue = safeText(normalized[errorsColumn.key]);
        const errorsStandardMatch = errorsValue.match(/^((?:DIN|ISO|MMN|MTN|N)\S*)\s+(.+)$/i);
        if (errorsStandardMatch && !safeText(normalized[standardColumn.key])) {
            normalized[standardColumn.key] = errorsStandardMatch[1];
            normalized[errorsColumn.key] = safeText(errorsStandardMatch[2]);
        }
    }

    return normalized;
}

function findGenericTableHeader(lines, viewport) {
    const maxHeaderY = viewport.height * 0.72;
    const candidates = lines
        .map((line, index) => ({ line, index, score: scoreHeaderLine(line, viewport.width) }))
        .filter((candidate) => candidate.line.centerY <= maxHeaderY && candidate.score >= 8);
    const validCandidates = [];

    for (const candidate of candidates) {
        const nextLines = lines.slice(candidate.index + 1, candidate.index + 8);
        const dataLines = nextLines.filter(isDataLikeLine);
        if (dataLines.length < 1) continue;

        const nextLine = lines[candidate.index + 1] || null;
        const shouldMergeNext = nextLine
            && !isDataLikeLine(nextLine)
            && Math.abs(nextLine.centerY - candidate.line.centerY) <= 22
            && scoreHeaderLine(nextLine, viewport.width) >= 4;
        const headerRects = shouldMergeNext
            ? [...candidate.line.rects, ...nextLine.rects]
            : candidate.line.rects;
        const columns = buildColumnBounds(clusterHeaderRects(headerRects), viewport.width);

        const labels = columns.map((column) => normalizePdfText(column.label));
        const hasPartColumn = labels.some((label) => label === 'PN' || label.includes('PART'));
        const hasDesignationColumn = labels.some((label) => label.includes('DESIGNATION') || label.includes('DESCRIPTION'));
        const hasPosColumn = labels.some((label) => label === 'POS' || label.includes('POSITION'));
        if (columns.length >= 3 && (hasPartColumn || hasDesignationColumn) && hasPosColumn) {
            const header = {
                columns,
                headerBottom: shouldMergeNext ? Math.max(candidate.line.bottom, nextLine.bottom) : candidate.line.bottom,
                headerTop: candidate.line.top
            };
            const dataScore = scoreTableDataUnderHeader(lines, candidate.index, header, viewport);
            if (
                    dataScore.rowsWithPartNumber >= 1
                    || (dataScore.rowsWithPos >= 1 && dataScore.rowsWithSeveralColumns >= 1)
                ) {
                validCandidates.push({
                    ...header,
                    candidateScore: candidate.score + dataScore.score,
                    dataScore
                });
            }
        }
    }

    return validCandidates.sort((a, b) => b.candidateScore - a.candidateScore || a.headerTop - b.headerTop)[0] || null;
}

function isPdfJunkLine(line) {
    const text = normalizePdfText(line?.text || '');

    if (!text) return true;

    return /COPYRIGHT|ALL RIGHTS RESERVED|BUSINESS PORTAL|ONLINE PRINT|MTU FRIEDRICHSHAFEN|PAGE\s*:|PAG\s*:|EQUI TYPE|SERIAL NUMBER|PRODUCT TYPE|BOM-NO|FG\/FGS/.test(text);
}

function lineInsideTableX(line, header, tolerance = 20) {
    const columns = header?.columns || [];
    if (!columns.length) return false;

    const tableLeft = Math.min(...columns.map((column) => Number(column.x1 ?? column.left ?? 0)));
    const tableRight = Math.max(...columns.map((column) => Number(column.x2 ?? column.right ?? 0)));

    return Number(line.left || 0) >= tableLeft - tolerance
        && Number(line.right || 0) <= tableRight + tolerance;
}

function lineHasTableRowStart(line) {
    const text = safeText(line?.text || '');
    return /^\d{1,4}[A-Z]?\s/.test(text);
}

function lineHasValidTableShape(line, header) {
    if (!line || !header?.columns?.length) return false;
    if (isPdfJunkLine(line)) return false;
    if (!lineInsideTableX(line, header, 25)) return false;

    const columnsHit = new Set();

    line.rects.forEach((rect) => {
        const column = findColumnForRect(rect, header.columns);
        if (column) columnsHit.add(column.key);
    });

    const text = normalizePdfText(line.text || '');

    const hasPosAtStart = /^\d{1,4}[A-Z]?\s/.test(text);
    const hasEnoughColumns = columnsHit.size >= 3;
    const hasAnyNumber = /\d/.test(text);

    return hasPosAtStart && hasEnoughColumns && hasAnyNumber;
}

function detectTableBottom(lines, header, viewport) {
    const candidates = lines.filter((line) => (
        line.centerY > header.headerBottom + 3
        && line.centerY < viewport.height * 0.88
    ));

    let lastGoodLine = null;
    let emptyAfterTable = 0;

    for (const line of candidates) {
        const isRowStart = lineHasValidTableShape(line, header);
        const isContinuation = lastGoodLine
            && !lineHasTableRowStart(line)
            && lineInsideTableX(line, header, 30)
            && isDataLikeLine(line);

        if (isRowStart || isContinuation) {
            lastGoodLine = line;
            emptyAfterTable = 0;
            continue;
        }

        if (lastGoodLine) {
            emptyAfterTable += 1;
        }

        if (emptyAfterTable >= 4) {
            break;
        }
    }

    return lastGoodLine
        ? Math.min(lastGoodLine.bottom + 10, viewport.height * 0.88)
        : Math.min(header.headerBottom + 140, viewport.height * 0.88);
}

function mergeCellGeometry(targetGeometry, sourceGeometry) {
    Object.entries(sourceGeometry || {}).forEach(([key, source]) => {
        if (!source) return;

        if (!targetGeometry[key]) {
            targetGeometry[key] = { ...source };
            return;
        }

        targetGeometry[key] = {
            ...targetGeometry[key],
            x1: Math.min(Number(targetGeometry[key].x1 || 0), Number(source.x1 || 0)),
            x2: Math.max(Number(targetGeometry[key].x2 || 0), Number(source.x2 || 0)),
            y1: Math.min(Number(targetGeometry[key].y1 || 0), Number(source.y1 || 0)),
            y2: Math.max(Number(targetGeometry[key].y2 || 0), Number(source.y2 || 0)),
            pageWidth: targetGeometry[key].pageWidth || source.pageWidth,
            pageHeight: targetGeometry[key].pageHeight || source.pageHeight,
            page: targetGeometry[key].page || source.page
        };
    });
}

function mergeContinuationRowIntoPrevious(previousRow, continuationRow) {
    if (!previousRow || !continuationRow) return false;

    Object.entries(continuationRow.cells || {}).forEach(([key, value]) => {
        const text = safeText(value);
        if (!text) return;

        const current = safeText(previousRow.cells?.[key]);
        if (!previousRow.cells) previousRow.cells = {};

        previousRow.cells[key] = current
            ? `${current} ${text}`.replace(/\s+/g, ' ').trim()
            : text;
    });

    if (!previousRow.cellGeometry) previousRow.cellGeometry = {};
    mergeCellGeometry(previousRow.cellGeometry, continuationRow.cellGeometry);

    previousRow.geometry = {
        ...previousRow.geometry,
        y1: Math.min(Number(previousRow.geometry?.y1 || 0), Number(continuationRow.geometry?.y1 || 0)),
        y2: Math.max(Number(previousRow.geometry?.y2 || 0), Number(continuationRow.geometry?.y2 || 0))
    };

    return true;
}

function rowHasPos(row) {
    return /^\d{1,4}[A-Z]?$/.test(safeText(row?.cells?.pos));
}

function rowHasUsefulContent(row) {
    const values = Object.values(row?.cells || {}).map(safeText).filter(Boolean);
    return values.length >= 1 && values.join(' ').length >= 2;
}

function parseGenericTablePage(textItems, viewport, pageNumber) {
    const rects = toTextRects(textItems, viewport);
    if (rects.length < 12) return null;

    const lines = groupRectsIntoLines(rects);
    const header = findGenericTableHeader(lines, viewport);
    if (!header) return null;

    const tableBottom = detectTableBottom(lines, header, viewport);

    const columns = header.columns.map((column) => ({
        key: column.key,
        label: column.label
    }));

    const rawBodyLines = lines.filter((line) => (
        line.centerY > header.headerBottom + 3
        && line.centerY < tableBottom
        && !isPdfJunkLine(line)
        && lineInsideTableX(line, header, 30)
        && isDataLikeLine(line)
    ));

    const rows = [];

    rawBodyLines.forEach((line, index) => {
        const { cells, cellRects } = assignLineRectsSequentially(line, header.columns);

        const rawCells = Object.fromEntries(
            Object.entries(cells).map(([key, values]) => [
                key,
                values.join(' ').replace(/\s+/g, ' ').trim()
            ])
        );

        const normalizedCells = normalizeGenericRowCells(rawCells, header.columns);
        const filledCells = Object.values(normalizedCells).filter(Boolean).length;

        if (!filledCells) return;

        const row = {
            id: `p${pageNumber}-g${index + 1}`,
            page: String(pageNumber),
            cells: normalizedCells,
            columns,
            status: 'Pendiente',
            edited: false,
            cellGeometry: buildCellGeometry(cellRects, pageNumber, viewport),
            geometry: {
                page: pageNumber,
                y1: Number(line.top || 0),
                y2: Number(line.bottom || line.top || 0) + 2,
                pageWidth: Number(viewport.width || 0),
                pageHeight: Number(viewport.height || 0)
            }
        };

        // Si tiene POS, es una fila nueva real.
        if (rowHasPos(row)) {
            rows.push(row);
            return;
        }

        // Si no tiene POS, pero tiene texto útil, es continuación de la fila anterior.
        if (rows.length && rowHasUsefulContent(row)) {
            mergeContinuationRowIntoPrevious(rows[rows.length - 1], row);
        }
    });

    const cleanRows = rows.filter((row) => {
        const values = Object.values(row.cells || {}).map(safeText).filter(Boolean);
        const hasPos = rowHasPos(row);
        const hasEnoughData = values.length >= 3;
        const hasAnyNumber = values.some((value) => /\d/.test(value));

        return hasPos && hasEnoughData && hasAnyNumber;
    });

    if (!cleanRows.length) return null;

    return {
        columns,
        rows: cleanRows
    };
}

async function ensurePdfJs() {
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return window.pdfjsLib;
    }

    if (!pdfJsPromise) {
        pdfJsPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = PDFJS_URL;
            script.async = true;
            script.onload = () => {
                if (!window.pdfjsLib) {
                    reject(new Error('PDF.js no quedo disponible.'));
                    return;
                }

                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
                resolve(window.pdfjsLib);
            };
            script.onerror = () => reject(new Error('No se pudo cargar PDF.js.'));
            document.head.appendChild(script);
        });
    }

    return pdfJsPromise;
}

async function ensureChartJs() {
    if (window.Chart) return window.Chart;

    if (!chartJsPromise) {
        chartJsPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = CHARTJS_URL;
            script.onload = () => resolve(window.Chart);
            script.onerror = () => reject(new Error('No se pudo cargar Chart.js'));
            document.head.appendChild(script);
        });
    }

    return chartJsPromise;
}

async function ensureAnimeJs() {
    if (window.anime) return window.anime;

    if (!animeJsPromise) {
        animeJsPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = ANIMEJS_URL;
            script.onload = () => resolve(window.anime);
            script.onerror = () => reject(new Error('No se pudo cargar Anime.js'));
            document.head.appendChild(script);
        });
    }

    return animeJsPromise;
}

function drawStartCanvas(canvas) {
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let frameId = 0;
    let width = 0;
    let height = 0;
    let dots = [];

    const resize = () => {
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        width = Math.max(1, Math.floor(rect.width));
        height = Math.max(1, Math.floor(rect.height));
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        const count = Math.max(42, Math.min(92, Math.floor(width / 22)));
        dots = Array.from({ length: count }, (_, index) => ({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: 1.1 + Math.random() * 2.4,
            speed: 0.22 + Math.random() * 0.52,
            phase: Math.random() * Math.PI * 2,
            hue: index % 3
        }));
    };

    const render = (time = 0) => {
        context.clearRect(0, 0, width, height);
        context.globalCompositeOperation = 'source-over';

        dots.forEach((dot, index) => {
            dot.x += dot.speed;
            dot.y += Math.sin(time / 900 + dot.phase) * 0.12;
            if (dot.x > width + 24) dot.x = -24;

            for (let next = index + 1; next < dots.length; next += 1) {
                const other = dots[next];
                const distance = Math.hypot(dot.x - other.x, dot.y - other.y);
                if (distance > 150) continue;
                context.strokeStyle = `rgba(37, 99, 235, ${0.11 * (1 - distance / 150)})`;
                context.lineWidth = 1;
                context.beginPath();
                context.moveTo(dot.x, dot.y);
                context.lineTo(other.x, other.y);
                context.stroke();
            }

            const colors = ['37, 99, 235', '6, 182, 212', '20, 184, 166'];
            context.fillStyle = `rgba(${colors[dot.hue]}, 0.55)`;
            context.beginPath();
            context.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
            context.fill();
        });

        frameId = window.requestAnimationFrame(render);
    };

    resize();
    render();
    window.addEventListener('resize', resize, { passive: true });

    return () => {
        window.cancelAnimationFrame(frameId);
        window.removeEventListener('resize', resize);
    };
}

function startSplashScene(workspace) {
    const screen = workspace.querySelector('[data-project-start-screen]');
    if (!screen || screen.hidden || screen.dataset.projectStartReady === 'true') return;
    screen.dataset.projectStartReady = 'true';

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) {
        if (activeStartSplashCleanup) activeStartSplashCleanup();
        activeStartSplashCleanup = drawStartCanvas(screen.querySelector('[data-project-start-canvas]')) || null;
    }

    ensureAnimeJs()
        .then((anime) => {
            if (!anime || reduceMotion) return;

            anime({
                targets: screen.querySelector('.project-start-card'),
                opacity: [0, 1],
                translateY: [34, 0],
                scale: [0.94, 1],
                duration: 900,
                easing: 'easeOutExpo'
            });

            anime({
                targets: screen.querySelectorAll('.project-start-panel, .project-start-flow, .project-start-glow'),
                opacity: [0, 1],
                translateY: (_, index) => [index % 2 ? -28 : 28, 0],
                delay: anime.stagger(90),
                duration: 1000,
                easing: 'easeOutExpo'
            });

            anime({
                targets: screen.querySelector('.project-start-orb'),
                translateY: [-4, 7],
                rotate: [-1.5, 1.5],
                direction: 'alternate',
                loop: true,
                duration: 2600,
                easing: 'easeInOutSine'
            });

            anime({
                targets: screen.querySelectorAll('.project-start-panel-a, .project-start-panel-b'),
                translateY: (_, index) => index ? [0, 18] : [0, -18],
                rotate: (_, index) => index ? [8, 4] : [-8, -4],
                direction: 'alternate',
                loop: true,
                duration: 5200,
                easing: 'easeInOutSine'
            });

            anime({
                targets: screen.querySelectorAll('.project-start-flow'),
                scaleX: [0.72, 1.06],
                opacity: [0.34, 0.78],
                direction: 'alternate',
                loop: true,
                duration: 2400,
                delay: anime.stagger(420),
                easing: 'easeInOutSine'
            });
        })
        .catch(() => {});
}

function stopSplashScene() {
    if (activeStartSplashCleanup) {
        activeStartSplashCleanup();
        activeStartSplashCleanup = null;
    }
}

function mergeDetectedColumns(currentColumns, newColumns) {
    const map = new Map();

    const preferredOrder = [
        'POS',
        'PART NO',
        'PART NUMBER',
        'PARTNO',
        'DESIGNATION',
        'DESCRIPTION',
        'MODELTYPE',
        'MODEL TYPE',
        'MODEL/TYPE',
        'QTY',
        'QUANTITY',
        'UNITS',
        'UNIT',
        'WEIGHT',
        'FN',
        'MEASUREMENT',
        'STANDARD'
    ];

    const addColumn = (column) => {
        const label = safeText(column?.label || column?.key);
        if (!label) return;

        const normalizedLabel = normalizePdfText(label);
        if (!normalizedLabel) return;

        if (!map.has(normalizedLabel)) {
            map.set(normalizedLabel, {
                key: column.key,
                label: column.label || column.key
            });
        }
    };

    (currentColumns || []).forEach(addColumn);
    (newColumns || []).forEach(addColumn);

    return Array.from(map.values()).sort((a, b) => {
        const ai = preferredOrder.indexOf(normalizePdfText(a.label));
        const bi = preferredOrder.indexOf(normalizePdfText(b.label));

        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;

        return 0;
    });
}

async function parsePdfRows(file, onProgress) {
    const pdfjsLib = await ensurePdfJs();
    const data = await file.arrayBuffer();
    const documentTask = pdfjsLib.getDocument({ data });
    const pdfDocument = await documentTask.promise;
    const rows = [];
    let headerLabels = {};
    let detectedColumns = [];
    let skippedPages = 0;
    let tablePages = 0;

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        onProgress?.(`Leyendo pagina ${pageNumber} de ${pdfDocument.numPages}...`);
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();
        const textItems = textContent.items || [];
        const pageText = getPageText(textItems);
        const genericResult = parseGenericTablePage(textItems, viewport, pageNumber);

        if (genericResult && Array.isArray(genericResult.rows) && genericResult.rows.length) {
            tablePages += 1;

            detectedColumns = mergeDetectedColumns(detectedColumns, genericResult.columns);

            headerLabels = Object.fromEntries(
                detectedColumns.map((column) => [column.key, column.label])
            );

            genericResult.rows
                .filter((row) => {
                    const values = Object.values(row.cells || {}).map(safeText).filter(Boolean);
                    return values.length >= 3 && rowHasPos(row);
                })
                .forEach((row) => rows.push(row));

            continue;
        }

        if (!isPartsTablePage(pageText)) {
            skippedPages += 1;
            continue;
        }

        tablePages += 1;
        const parserResult = runTableParser(textItems, viewport, {
            buildDebug: false,
            columnDetectionMode: 'header-left-lines-mark-only'
        });

        if (!Object.keys(headerLabels).length) {
            headerLabels = buildHeaderLabels(parserResult);
        }

        const pageRows = Array.isArray(parserResult?.grid) ? parserResult.grid : [];
        const fixedRows = pageRows
            .map((gridRow, index) => normalizeParserRow({
                ...gridRow,
                pageWidth: viewport.width,
                pageHeight: viewport.height
            }, pageNumber, index + 1))
            .filter(isUsefulRow)
            .filter((row) => !isHeaderLikeRow(row))
            .filter(isLikelyTableDataRow);

        if (!fixedRows.length) {
            skippedPages += 1;
            tablePages -= 1;
            continue;
        }

        fixedRows.forEach((row) => rows.push(row));
    }

    return {
        fileName: file.name,
        pageCount: pdfDocument.numPages,
        columns: detectedColumns,
        headerLabels,
        pdfDocument,
        skippedPages,
        tablePages,
        rows
    };
}

function isPdfArrayBuffer(data) {
    if (!data || !data.byteLength) return false;
    const bytes = data instanceof Uint8Array
        ? data
        : new Uint8Array(data, 0, Math.min(5, data.byteLength));
    return bytes.length >= 5
        && bytes[0] === 0x25
        && bytes[1] === 0x50
        && bytes[2] === 0x44
        && bytes[3] === 0x46
        && bytes[4] === 0x2d;
}

async function loadPdfDocumentFromFile(file) {
    const pdfjsLib = await ensurePdfJs();
    const data = await file.arrayBuffer();
    if (!isPdfArrayBuffer(data)) {
        throw new Error(`El archivo "${file?.name || 'documento'}" no es un PDF real.`);
    }
    return pdfjsLib.getDocument({ data: data.slice(0) }).promise;
}

async function loadProjectActivePdfDocument(project) {
    const cacheKey = Date.now().toString(36);
    const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/pdf?cache=${cacheKey}`), {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache',
            ...authHeaders()
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.arrayBuffer();
    if (!isPdfArrayBuffer(data)) {
        throw new Error('El documento activo del proyecto no es un PDF convertido valido.');
    }
    const pdfjsLib = await ensurePdfJs();
    const pdfDocument = await pdfjsLib.getDocument({ data: data.slice(0) }).promise;
    return { pdfDocument, buffer: data };
}

const SUPPORTED_DOCUMENT_UPLOAD_PATTERN = /\.(pdf|xlsx|xls|csv|docx|doc)$/i;

function getFileExtension(fileName) {
    const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
}

function getUploadDocumentKind(file) {
    const extension = getFileExtension(file?.name);
    if (extension === 'pdf') return 'pdf';
    if (['xlsx', 'xls', 'csv'].includes(extension)) return 'spreadsheet';
    if (['docx', 'doc'].includes(extension)) return 'word';
    return 'unknown';
}

function getUploadContentType(file) {
    const extension = getFileExtension(file?.name);
    if (extension === 'pdf') return file?.type || 'application/pdf';
    if (extension === 'xlsx') return file?.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (extension === 'xls') return file?.type || 'application/vnd.ms-excel';
    if (extension === 'csv') return file?.type || 'text/csv';
    if (extension === 'docx') return file?.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (extension === 'doc') return file?.type || 'application/msword';
    return file?.type || 'application/octet-stream';
}

function isPdfUpload(file) {
    return getUploadDocumentKind(file) === 'pdf';
}

function readLocalWorkspace(project) {
    return {
        rows: [],
        fileName: '',
        pageCount: 0,
        documentType: '',
        documentKind: '',
        headerLabels: {},
        columns: [],
        invoice: null,
        invoices: [],
        activeInvoiceId: '',
        extractionReport: null,
        updatedAt: ''
    };
}

async function readSavedWorkspace(project) {
    return readLocalWorkspace(project);
}

async function saveWorkspace(project, workspaceState) {
    const payload = {
        documentType: workspaceState.documentType || '',
        documentKind: workspaceState.documentKind || '',
        fileName: workspaceState.fileName || '',
        pageCount: Number(workspaceState.pageCount || 0),
        headerLabels: workspaceState.headerLabels || {},
        columns: workspaceState.columns || [],
        rows: workspaceState.rows || [],
        invoice: workspaceState.invoice || null,
        invoices: Array.isArray(workspaceState.invoices) ? workspaceState.invoices : [],
        activeInvoiceId: workspaceState.activeInvoiceId || '',
        extractionReport: workspaceState.extractionReport || null,
        updatedAt: new Date().toISOString()
    };

    workspaceState.updatedAt = payload.updatedAt;

    try {
        await fetchWorkspaceApi(project, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.warn('[project-workspace] No se pudo guardar en backend; queda copia local.', error);
    }
}

function syncSaveFileButton(workspaceState) {
    const button = document.querySelector('[data-project-save-file-button]');
    if (!button) return;

    const hasRows = Array.isArray(workspaceState?.rows) && workspaceState.rows.length;
    const hasInvoice = Boolean(workspaceState?.documentType === 'invoices' && workspaceState?.invoice);
    const hasInvoiceBatch = Boolean(
        workspaceState?.documentType === 'invoices'
        && Array.isArray(workspaceState?.invoices)
        && workspaceState.invoices.length
    );
    const hasInvoiceBatchPdf = hasInvoiceBatch && activeInvoicePdfDocuments.size > 0;
    const ready = Boolean(
        (activePdfDocument || hasInvoiceBatchPdf)
        && workspaceState?.fileName
        && (hasRows || hasInvoice || hasInvoiceBatch)
    );

    button.hidden = !ready;
    button.disabled = !ready;
}

async function saveProjectPdf(project, file) {
    const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/pdf`), {
        method: 'PUT',
        headers: {
            'Content-Type': getUploadContentType(file),
            'X-File-Name': encodeURIComponent(file.name || 'documento'),
            ...authHeaders()
        },
        body: file
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data.pdf;
}

async function extractProjectPdfWithBackend(project) {
    const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/pdf/extract`, {
        method: 'POST',
        body: '{}'
    });

    const workspace = data.extractor?.workspace || {};
    const report = data.extractor?.report || null;
    const rows = Array.isArray(workspace.rows) ? workspace.rows : [];
    const convertedDocument = data.convertedDocument || null;
    const resolvedFileName = toPdfFileName(
        convertedDocument?.fileName || workspace.convertedPdfFileName || workspace.fileName || 'documento.pdf',
        'documento.pdf'
    );

    return {
        fileName: resolvedFileName,
        pageCount: Number(workspace.pageCount || 0),
        documentKind: 'pdf',
        headerLabels: workspace.headerLabels && typeof workspace.headerLabels === 'object' ? workspace.headerLabels : {},
        columns: Array.isArray(workspace.columns) ? workspace.columns : [],
        rows,
        extractionReport: report,
        convertedDocument
    };
}

async function extractProjectInvoiceWithBackend(project) {
    const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/pdf/extract-invoice`, {
        method: 'POST',
        body: '{}'
    });

    const workspace = data.extractor?.workspace || {};
    const report = data.extractor?.report || null;
    const convertedDocument = data.convertedDocument || null;
    const resolvedFileName = toPdfFileName(
        convertedDocument?.fileName || workspace.convertedPdfFileName || workspace.fileName || 'factura.pdf',
        'factura.pdf'
    );

    return {
        fileName: resolvedFileName,
        pageCount: Number(workspace.pageCount || 0),
        documentKind: 'pdf',
        headerLabels: workspace.headerLabels && typeof workspace.headerLabels === 'object' ? workspace.headerLabels : {},
        columns: Array.isArray(workspace.columns) ? workspace.columns : [],
        rows: Array.isArray(workspace.rows) ? workspace.rows : [],
        invoice: workspace.invoice || null,
        preview: null,
        extractionReport: report,
        convertedDocument
    };
}

const INVOICE_TABLE_COLUMNS = [
    { key: 'code', label: 'Codigo', dynamic: true },
    { key: 'description', label: 'Descripcion', dynamic: true },
    { key: 'quantity', label: 'Cantidad', dynamic: true },
    { key: 'unit', label: 'Unidad', dynamic: true },
    { key: 'unitPrice', label: 'Precio ud.', dynamic: true },
    { key: 'discount', label: 'Descuento', dynamic: true },
    { key: 'taxRate', label: 'IVA %', dynamic: true },
    { key: 'total', label: 'Total', dynamic: true }
];

const INVOICE_HEADER_LABELS = {
    code: 'Codigo',
    description: 'Descripcion',
    quantity: 'Cantidad',
    unit: 'Unidad',
    unitPrice: 'Precio ud.',
    discount: 'Descuento',
    taxRate: 'IVA %',
    total: 'Total'
};

function buildInvoiceRows(invoice) {
    const invoiceLines = Array.isArray(invoice?.lineItems) ? invoice.lineItems : [];
    return invoiceLines.map((item, index) => ({
        id: item.id || `invoice-line-${index + 1}`,
        page: item.sourceBox?.page || '',
        cells: {
            code: item.code || '',
            description: item.description || '',
            quantity: item.quantity ?? '',
            unit: item.unit ?? '',
            unitPrice: item.unitPrice ?? '',
            discount: item.discount ?? '',
            taxRate: item.taxRate ?? '',
            total: item.total ?? ''
        },
        geometry: item.sourceBox ? {
            page: item.sourceBox.page || 1,
            y1: item.sourceBox.y1,
            y2: item.sourceBox.y2,
            pageHeight: item.sourceBox.pageHeight
        } : null,
        status: 'Pendiente'
    }));
}

function buildInvoiceFromDocumentRows(result, file) {
    const columns = Array.isArray(result?.columns) ? result.columns : [];
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const lineItems = rows.map((row, index) => {
        const cells = row?.cells && typeof row.cells === 'object' ? row.cells : {};
        const values = columns
            .map((column) => safeText(cells[column.key]))
            .filter(Boolean);
        return {
            id: row?.id || `document-line-${index + 1}`,
            description: values.join(' | ') || `Linea ${index + 1}`,
            code: safeText(cells.code || cells.article || cells.sku || cells.referencia),
            quantity: safeText(cells.quantity || cells.qty || cells.cantidad),
            unit: safeText(cells.unit || cells.um || cells.unidad),
            unitPrice: safeText(cells.unitPrice || cells.price || cells.precio),
            discount: safeText(cells.discount || cells.descuento || cells.dte),
            taxRate: safeText(cells.taxRate || cells.iva || cells.vat || cells.tax),
            total: safeText(cells.total || cells.importe),
            sourceBox: null
        };
    });

    return {
        type: 'Documento importado',
        fileName: result?.fileName || file?.name || '',
        invoiceNumber: '',
        detectedFields: rows.length,
        fields: [],
        amounts: {},
        payment: {},
        supplier: {},
        customer: {},
        lineItems,
        language: null
    };
}

function parseLooseInvoiceAmount(value) {
    const text = safeText(value);
    const matches = text.match(/[-+]?\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d+)|[-+]?\d+(?:[,.]\d+)?/g);
    if (!matches?.length) return null;
    const raw = matches[matches.length - 1].replace(/\s/g, '');
    const normalized = raw.includes(',') && raw.lastIndexOf(',') > raw.lastIndexOf('.')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

function detectLooseInvoiceCurrency(text) {
    if (/\bUSD\b|\$/i.test(text)) return 'USD';
    if (/\bGBP\b|\u00a3/i.test(text)) return 'GBP';
    if (/\bCNY\b|\bRMB\b|\u00a5|\u7f8e\u5143|\u4eba\u6c11\u5e01/i.test(text)) return 'CNY';
    if (/\bEUR\b|\u20ac/i.test(text)) return 'EUR';
    return '';
}

function extractLooseInvoiceDate(text) {
    if (/[$\u20ac\u00a3\u00a5]|eur|usd|gbp|cny/i.test(text)) return '';
    const match = safeText(text).match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/);
    return match ? match[1].replace(/\./g, '-') : '';
}

function getInvoiceRecordDocumentKind(record) {
    if (record?.id && activeInvoicePdfDocuments.has(record.id)) return 'pdf';
    if (record?.id && activeInvoicePdfFiles.has(record.id)) return 'pdf';

    const explicitKind = safeText(record?.documentKind).toLowerCase();
    const pdfName = safeText(record?.convertedPdfFileName || record?.pdfFileName || record?.fileName || record?.invoice?.fileName).toLowerCase();
    if (explicitKind === 'pdf' || /\.pdf(?:$|\?)/.test(pdfName)) return 'pdf';

    return 'pdf';
}

async function cacheProjectActivePdfForInvoiceRecord(project, record) {
    const loadedPdf = await loadProjectActivePdfDocument(project);

    if (record?.id) {
        activeInvoicePdfDocuments.set(record.id, loadedPdf.pdfDocument);
        activeInvoicePdfFiles.set(record.id, {
            fileName: record.convertedPdfFileName || record.fileName || record.invoice?.fileName || 'factura.pdf',
            buffer: loadedPdf.buffer.slice(0)
        });
    }

    return loadedPdf.pdfDocument;
}

async function ensureInvoiceRecordPdfDocument(project, workspaceState, record) {
    if (!record?.id) return null;

    const cachedDocument = activeInvoicePdfDocuments.get(record.id);
    if (cachedDocument) return cachedDocument;

    const cachedFile = activeInvoicePdfFiles.get(record.id);
    if (cachedFile?.buffer) {
        const pdfjsLib = await ensurePdfJs();
        const pdfDocument = await pdfjsLib.getDocument({ data: cachedFile.buffer.slice(0) }).promise;
        activeInvoicePdfDocuments.set(record.id, pdfDocument);
        return pdfDocument;
    }

    const records = Array.isArray(workspaceState?.invoices) ? workspaceState.invoices : [];
    if (records.length > 1) return null;

    try {
        return await cacheProjectActivePdfForInvoiceRecord(project, record);
    } catch (error) {
        console.warn('No se pudo cargar el PDF de la factura:', error);
        return null;
    }
}

function enhanceImportedInvoice(invoice) {
    const source = invoice && typeof invoice === 'object' ? invoice : {};
    const lineItems = Array.isArray(source.lineItems) ? source.lineItems : [];
    const rawText = [
        source.fileName,
        source.invoiceNumber,
        ...(Array.isArray(source.fields) ? source.fields.map((field) => `${field?.label || ''} ${field?.value || ''}`) : []),
        ...lineItems.map((line) => [line.description, line.quantity, line.unitPrice, line.total].map(safeText).filter(Boolean).join(' | '))
    ].join('\n');
    const rawLines = rawText.split(/\n/).map(safeText).filter(Boolean);
    const currency = source.currency || detectLooseInvoiceCurrency(rawText) || 'EUR';
    const fields = Array.isArray(source.fields) ? [...source.fields] : [];
    const amounts = { ...(source.amounts || {}) };
    const payment = { ...(source.payment || {}) };
    const supplier = { ...(source.supplier || {}) };
    const customer = { ...(source.customer || {}) };

    const findLineBy = (regex) => rawLines.find((entry) => regex.test(entry)) || '';
    const findValueAfterLabel = (regex) => {
        for (const line of rawLines) {
            const parts = line.split(/\s*\|\s*/).map(safeText).filter(Boolean);
            const index = parts.findIndex((part) => regex.test(part));
            if (index < 0) continue;

            const sameCell = parts[index].match(/[:\uff1a]\s*(.+)$/);
            if (sameCell?.[1]) return safeText(sameCell[1]);

            for (let next = index + 1; next < parts.length; next += 1) {
                const value = safeText(parts[next]);
                if (value && !regex.test(value)) return value;
            }
        }

        return '';
    };

    const assignAmount = (key, regex) => {
        if (amounts[key] != null) return;
        const line = findValueAfterLabel(regex) || findLineBy(regex);
        const parsed = parseLooseInvoiceAmount(line || '');
        if (parsed != null) amounts[key] = parsed;
    };

    assignAmount('subtotal', /subtotal|base\s*imponible|netto|\u672a\u7a0e|\u5c0f\u8ba1/i);
    assignAmount('tax', /iva|vat|tax|impuesto|mwst|\u7a0e|\u589e\u503c\u7a0e/i);
    assignAmount('total', /grand\s*total|^total\b|gesamtbetrag|amount\s*due|pendiente|\u5408\u8ba1|\u603b\u8ba1|\u5e94\u4ed8/i);

    const numericTotal = Number(amounts.total);
    const numericTax = Number(amounts.tax);
    const hasExplicitTaxAmount = fields.some((field) => {
        const section = safeText(field?.section).toLowerCase();
        const label = safeText(field?.label).toLowerCase();
        if (!/importe|amount/.test(section)) return false;
        if (/nif|cif|tax\s*id|vat\s*(id|number|no)/.test(label)) return false;
        return /iva|vat|tax|impuesto/.test(label) && parseLooseInvoiceAmount(field?.value) != null;
    });
    if (
        !hasExplicitTaxAmount
        || !Number.isFinite(numericTax)
        || numericTax < 0
        || numericTax > 10000000
        || (Number.isFinite(numericTotal) && numericTotal >= 0 && numericTax > numericTotal * 2)
    ) {
        amounts.tax = 0;
    }

    if (!payment.iban) {
        const iban = rawText.match(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){8,34}\b/i);
        if (iban) payment.iban = iban[0].replace(/\s+/g, '').toUpperCase();
    }

    if (!supplier.email && !customer.email) {
        const email = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
        if (email) supplier.email = email;
    }

    if (!supplier.name) {
        supplier.name = findValueAfterLabel(/supplier|vendor|proveedor|emisor|razon\s*social|raz\u00f3n\s*social|company|empresa|lieferant|\u4f9b\u5e94\u5546|\u516c\u53f8/i);
    }

    if (!customer.name) {
        customer.name = findValueAfterLabel(/customer|client|cliente|bill\s*to|receptor|kunde|\u5ba2\u6237/i);
    }

    const labeledNumber = findValueAfterLabel(/invoice\s*(no|number|num)?|factura|numero\s*de\s*factura|n\u00famero\s*de\s*factura|num\.?\s*factura|rechnung|rechnungsnummer|\u53d1\u7968|\u7f16\u53f7|\u53f7\u7801/i);
    const invoiceNumber = source.invoiceNumber || labeledNumber || rawText.match(/(?:INV|F|US|RE)[-\s]?[A-Z0-9]{2,}|\b\d{4,}\b/i)?.[0] || '';
    const date = source.date
        || extractLooseInvoiceDate(findValueAfterLabel(/invoice\s*date|^date$|fecha|rechnungsdatum|datum|\u65e5\u671f|\u5f00\u7968\u65e5\u671f/i))
        || extractLooseInvoiceDate(findLineBy(/date|fecha|datum|\u65e5\u671f/i));
    const dueDate = source.dueDate
        || extractLooseInvoiceDate(findValueAfterLabel(/due|vence|vencimiento|faellig|f\u00e4llig|zahlungsziel|\u5230\u671f|\u622a\u6b62/i))
        || extractLooseInvoiceDate(findLineBy(/due|vence|vencimiento|faellig|f\u00e4llig|\u5230\u671f/i));
    const isInvoiceLineDescriptionBlocked = (description) => {
        const value = safeText(description);
        if (!value || value === '-' || /^\s*0\s*$/.test(value)) return true;
        const normalized = value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
        if (/^(subtotal|total|grand total|base imponible|iva|vat|tax|impuestos?|iban|payment|forma de pago|vencimiento|due|observaciones?|notes?)\b/.test(normalized)) return true;
        if (/^(gross\s*wgt|net\s*wgt|expiry|non\s*imp\.?art|invoicing\s*policy|rolls\s*nr)\b/.test(normalized)) return true;
        return !/[a-z\u00c0-\u024f\u4e00-\u9fff]{2,}/i.test(value);
    };
    const isInvoiceQuantityValue = (value) => {
        const text = safeText(value);
        if (!text || extractLooseInvoiceDate(text)) return false;
        if (/[$\u20ac\u00a3\u00a5]|eur|usd|gbp|cny|rmb/i.test(text)) return false;
        return /^\d+(?:[,.]\d+)?$/.test(text) && Number.isFinite(Number(text.replace(',', '.')));
    };
    const isInvoiceAmountValue = (value) => {
        const text = safeText(value);
        if (!text || extractLooseInvoiceDate(text)) return false;
        const parsed = parseLooseInvoiceAmount(text);
        return parsed != null && Number.isFinite(parsed) && parsed >= 0;
    };
    const isValidInvoiceLine = (item) => (
        !isInvoiceLineDescriptionBlocked(item?.description)
        && (
            isInvoiceAmountValue(item?.unitPrice)
            || isInvoiceAmountValue(item?.total)
            || (isInvoiceQuantityValue(item?.quantity) && Boolean(item?.sourceBox))
        )
    );

    let enhancedLines = lineItems.map((item, index) => {
        const parts = safeText(item.description).split(/\s*\|\s*/).filter(Boolean);
        if (parts.length < 3) return item;
        const quantityIndex = parts.findIndex((part) => /^\d+(?:[,.]\d+)?$/.test(part));
        const moneyIndexes = parts
            .map((part, partIndex) => ({ part, partIndex }))
            .filter(({ part, partIndex }) => partIndex !== quantityIndex && parseLooseInvoiceAmount(part) != null)
            .map(({ partIndex }) => partIndex);
        const descriptionIndex = parts.findIndex((part, partIndex) => (
            partIndex !== quantityIndex
            && !moneyIndexes.includes(partIndex)
            && /[A-Za-z\u00c0-\u024f\u4e00-\u9fff]/.test(part)
            && !isInvoiceLineDescriptionBlocked(part)
        ));
        if (descriptionIndex < 0) return item;
        return {
            ...item,
            id: item.id || `invoice-line-${index + 1}`,
            description: parts[descriptionIndex],
            quantity: item.quantity || (quantityIndex >= 0 ? parts[quantityIndex] : ''),
            unitPrice: item.unitPrice || (moneyIndexes.length > 1 ? parts[moneyIndexes[moneyIndexes.length - 2]] : ''),
            total: item.total || (moneyIndexes.length ? parts[moneyIndexes[moneyIndexes.length - 1]] : '')
        };
    }).filter(isValidInvoiceLine).filter((item, index, items) => {
        const signature = [item.description, item.quantity, item.unit, item.unitPrice, item.total]
            .map(safeText)
            .join('|')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9|]+/g, '');
        return items.findIndex((candidate) => [candidate.description, candidate.quantity, candidate.unit, candidate.unitPrice, candidate.total]
            .map(safeText)
            .join('|')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9|]+/g, '') === signature) === index;
    });

    if (!enhancedLines.length) {
        const goodsFields = fields.filter((field) => (
            /mercancia|goods|items?|lineas?/i.test(safeText(field?.section))
            && /descripcion|description|concepto|producto|article|item/i.test(safeText(field?.label))
            && !isInvoiceLineDescriptionBlocked(field?.value)
        ));
        const descriptions = goodsFields
            .flatMap((field) => safeText(field.value).split(/\s*;\s*/))
            .map(safeText)
            .filter((value, index, values) => value && values.indexOf(value) === index);
        if (descriptions.length === 1) {
            const explicitPriceField = fields.find((field) => (
                /mercancia|goods|items?|lineas?/i.test(safeText(field?.section))
                && /precio|price|importe|amount/i.test(safeText(field?.label))
                && isInvoiceAmountValue(field?.value)
            ));
            const fallbackPrice = explicitPriceField?.value ?? amounts.subtotal ?? amounts.total;
            if (isInvoiceAmountValue(fallbackPrice)) {
                const parsedPrice = parseLooseInvoiceAmount(fallbackPrice);
                enhancedLines = [{
                    id: 'invoice-line-recovered-1',
                    description: descriptions[0],
                    quantity: '',
                    unit: '',
                    unitPrice: parsedPrice,
                    total: parsedPrice,
                    sourceBox: goodsFields[0]?.sourceBox || null
                }];
            }
        }
    }

    return {
        ...source,
        invoiceNumber,
        date,
        dueDate,
        currency,
        language: source.language || source.detectedLanguage || '',
        detectedLanguage: source.detectedLanguage || source.language || '',
        amounts,
        payment,
        supplier,
        customer,
        fields,
        lineItems: enhancedLines,
        detectedFields: fields.length || source.detectedFields || 0
    };
}

function getInvoiceRecordId(file, index) {
    const base = safeText(file?.webkitRelativePath || file?.name || `factura-${index + 1}`);
    return `invoice-${Date.now()}-${index + 1}-${base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)}`;
}

function getInvoiceDisplayParty(invoice, key) {
    const party = invoice?.[key] && typeof invoice[key] === 'object' ? invoice[key] : {};
    return safeText(party.name || party.email || party.taxId || party.address);
}

function getInvoiceLanguageLabel(language) {
    if (typeof language === 'string') return safeText(language) || '-';
    const data = language && typeof language === 'object' ? language : {};
    const name = safeText(data.name || data.label || '');
    const code = safeText(data.code || '').toUpperCase();
    if (name && code && name.toUpperCase() !== code) return `${name} (${code})`;
    return name || code || '-';
}

function getInvoiceRecordSummary(record) {
    const invoice = enhanceImportedInvoice(record?.invoice || {});
    if (record && record.invoice !== invoice) record.invoice = invoice;
    const currency = invoice.currency || 'EUR';
    const amounts = invoice.amounts || {};
    const payment = invoice.payment || {};
    const detectedIban = Array.isArray(invoice.fields)
        ? invoice.fields.find((field) => /iban/i.test(`${field?.label || ''} ${field?.key || ''}`))?.value
        : '';
    const subtotal = amounts.subtotal == null ? '' : formatInvoiceAmount(amounts.subtotal, currency);
    const taxes = amounts.tax == null ? '' : formatInvoiceAmount(amounts.tax, currency);
    const total = amounts.total == null ? '' : formatInvoiceAmount(amounts.total, currency);
    return {
        fileName: record?.fileName || invoice.fileName || 'Factura',
        invoiceNumber: invoice.invoiceNumber || '-',
        date: invoice.date || '-',
        dueDate: invoice.dueDate || '',
        supplier: getInvoiceDisplayParty(invoice, 'supplier') || '-',
        customer: getInvoiceDisplayParty(invoice, 'customer') || '-',
        subtotal,
        taxes,
        total: total || '-',
        language: getInvoiceLanguageLabel(invoice.language),
        paymentMethod: safeText(payment.method || ''),
        iban: safeText(payment.iban || detectedIban || ''),
        fields: Number(invoice.detectedFields || invoice.fields?.length || 0),
        lines: Number(invoice.lineItems?.length || 0)
    };
}

async function importInvoiceFiles(project, workspace, workspaceState, files, onStatus, options = {}) {
    const documentFiles = [...files].filter((file) => SUPPORTED_DOCUMENT_UPLOAD_PATTERN.test(file.name || ''));
    if (!documentFiles.length) {
        throw new Error('No se encontraron archivos compatibles en la seleccion.');
    }

    const shouldAppend = Boolean(options.append && workspaceState.documentType === 'invoices');
    const existingRecords = shouldAppend && Array.isArray(workspaceState.invoices)
        ? [...workspaceState.invoices]
        : [];
    const records = [...existingRecords];
    const previousReport = shouldAppend && workspaceState.extractionReport
        ? workspaceState.extractionReport
        : null;

    if (!shouldAppend) {
        activeInvoicePdfDocuments = new Map();
        activeInvoicePdfFiles = new Map();
    }

    activeInvoiceExpandedIds = new Set();
    activeInvoiceBatchReviewId = '';
    const reports = [];
    let totalPages = existingRecords.reduce((sum, record) => sum + Number(record?.pageCount || 0), 0);
    let totalLines = existingRecords.reduce((sum, record) => {
        if (Array.isArray(record?.rows)) return sum + record.rows.length;
        if (Array.isArray(record?.invoice?.lineItems)) return sum + record.invoice.lineItems.length;
        return sum;
    }, 0);

    for (const [index, file] of documentFiles.entries()) {
        const actionLabel = shouldAppend ? 'Anadiendo' : 'Analizando';
        onStatus?.(`${actionLabel} factura ${index + 1} de ${documentFiles.length}: ${file.name}`);
        const isPdf = isPdfUpload(file);
        let pdfBuffer = null;
        let pdfDocument = null;
        activePdfDocument = null;
        await saveProjectPdf(project, file);
        const invoiceResult = await extractProjectInvoiceWithBackend(project);

        console.log('[FACTURA RESULTADO]', {
            convertedDocument: invoiceResult?.convertedDocument,
            hasData: Boolean(invoiceResult?.convertedDocument?.data),
            dataLength: invoiceResult?.convertedDocument?.data?.length || 0,
            fileName: invoiceResult?.convertedDocument?.fileName
        });

        const convertedDocument = invoiceResult.convertedDocument || null;
        const resolvedPdfFileName = toPdfFileName(
            convertedDocument?.fileName || invoiceResult.convertedPdfFileName || invoiceResult.fileName || file.name,
            'factura.pdf'
        );

        try {
            const convertedPdfBase64 =
                invoiceResult?.convertedDocument?.data || '';

            if (convertedPdfBase64) {
                pdfBuffer = base64ToArrayBuffer(convertedPdfBase64);

                if (!isPdfArrayBuffer(pdfBuffer)) {
                    throw new Error(
                        'El documento convertido recibido no es un PDF válido.'
                    );
                }

                const pdfjsLib = await ensurePdfJs();

                pdfDocument = await pdfjsLib
                    .getDocument({
                        data: pdfBuffer.slice(0)
                    })
                    .promise;
            } else {
                /*
                * Compatibilidad con PDFs subidos directamente o con respuestas
                * antiguas del backend.
                */
                const convertedPdf =
                    await loadProjectActivePdfDocument(project);

                pdfDocument = convertedPdf.pdfDocument;
                pdfBuffer = convertedPdf.buffer;
            }
        } catch (error) {
            if (!isPdf) {
                console.warn(
                    'No se pudo cargar el PDF convertido para el visor:',
                    error
                );
            } else {
                console.warn(
                    'No se pudo cargar el PDF activo. Usando el PDF subido:',
                    error
                );

                pdfBuffer = await file.arrayBuffer();
                pdfDocument = await loadPdfDocumentFromFile(file);
            }

            if (!isPdf) {
                console.warn('No se pudo cargar el PDF convertido para el visor:', error);
            } else {
                console.warn('No se pudo cargar el PDF activo del proyecto. Usando el PDF subido:', error);
                pdfBuffer = await file.arrayBuffer();
                pdfDocument = await loadPdfDocumentFromFile(file);
            }
        }

        if (!pdfDocument || !pdfBuffer) {
            throw new Error(`No se pudo convertir "${file.name}" a PDF para usar el extractor de facturas.`);
        }

        const invoice = enhanceImportedInvoice(invoiceResult.invoice || buildInvoiceFromDocumentRows(invoiceResult, file));
        const rows = buildInvoiceRows(invoice);
        const recordId = getInvoiceRecordId(file, records.length + index);

        activeInvoicePdfDocuments.set(recordId, pdfDocument);
        activeInvoicePdfFiles.set(recordId, {
            fileName: resolvedPdfFileName,
            buffer: pdfBuffer.slice(0)
        });
        const recordDocumentKind = 'pdf';
        const recordFileName = resolvedPdfFileName;
        totalPages += Number(invoiceResult.pageCount || pdfDocument?.numPages || 0);
        totalLines += rows.length;
        if (invoiceResult.extractionReport) reports.push(invoiceResult.extractionReport);

        records.push({
            id: recordId,
            fileName: recordFileName,
            originalFileName: file.name,
            convertedPdfFileName: recordFileName,
            relativePath: recordFileName,
            originalPath: file.webkitRelativePath || file.name,
            documentKind: recordDocumentKind,
            pageCount: Number(invoiceResult.pageCount || pdfDocument?.numPages || 0),
            invoice,
            preview: null,
            rows,
            columns: INVOICE_TABLE_COLUMNS,
            headerLabels: INVOICE_HEADER_LABELS,
            extractionReport: invoiceResult.extractionReport || null
        });
    }

    const allReports = records.map((record) => record?.extractionReport).filter(Boolean);
    const avgPrecision = allReports.length
        ? allReports.reduce((sum, report) => sum + Number(report?.precision || 0), 0) / allReports.length
        : 0;
    const previousProblems = Array.isArray(previousReport?.problems) ? previousReport.problems : [];
    const previousEngines = Array.isArray(previousReport?.engines) ? previousReport.engines : [];
    const processMs = Number(previousReport?.processMs || 0)
        + reports.reduce((sum, report) => sum + Number(report?.processMs || 0), 0);

    workspaceState.documentType = 'invoices';
    workspaceState.documentKind = 'pdf';
    workspaceState.preview = null;
    workspaceState.fileName = `${records.length} facturas importadas`;
    workspaceState.pageCount = totalPages;
    workspaceState.headerLabels = {};
    workspaceState.columns = [];
    workspaceState.rows = [];
    workspaceState.invoice = null;
    workspaceState.invoices = records;
    workspaceState.activeInvoiceId = '';
    workspaceState.extractionReport = {
        selectedEngine: 'invoice-batch',
        tablesDetected: records.length,
        rowsExtracted: totalLines,
        precision: avgPrecision,
        processMs: processMs || null,
        problems: [
            ...previousProblems,
            ...reports.flatMap((report) => Array.isArray(report?.problems) ? report.problems : [])
        ],
        engines: [
            ...previousEngines,
            ...reports.flatMap((report) => Array.isArray(report?.engines) ? report.engines : [])
        ]
    };

    activePdfDocument = null;
    await saveWorkspace(project, workspaceState);
    renderWorkspace(workspace, project, workspaceState);
    syncWordPressUi(workspace, workspaceState);
    onStatus?.(shouldAppend
        ? `${documentFiles.length} facturas anadidas. Total: ${records.length}.`
        : `${records.length} facturas analizadas. Selecciona una para revisar sus campos y marcas.`);
}

function samePdfFileName(left, right) {
    return safeText(left).toLowerCase() === safeText(right).toLowerCase();
}

async function loadMatchingSavedWorkspacePdf(project, workspace, workspaceState) {
    const expectedFileName = String(workspaceState.fileName || '').trim();
    if (!expectedFileName) return false;

    if (workspaceState.documentType !== 'invoices') {
        clearInvoiceViewerState(workspace);
    }

    const rowCount = Number((workspaceState.rows || []).length);
    const files = await listSavedWorkspaces(project);
    const match = files.find((file) => samePdfFileName(file.fileName, expectedFileName) && Number(file.rows || 0) === rowCount)
        || files.find((file) => samePdfFileName(file.fileName, expectedFileName));
    if (!match) return false;

    const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/saved-workspaces/${encodeURIComponent(match.id)}/pdf`), {
        headers: authHeaders()
    });
    if (!response.ok) return false;

    const data = await response.arrayBuffer();
    const pdfjsLib = await ensurePdfJs();
    activePdfDocument = await pdfjsLib.getDocument({ data }).promise;
    syncSaveFileButton(workspaceState);

    const pdfStatus = workspace.querySelector('[data-project-pdf-status]');
    const pageLabel = workspace.querySelector('[data-project-pdf-page-label]');
    if (pageLabel) pageLabel.textContent = 'PDF';
    if (pdfStatus) {
        pdfStatus.textContent = `PDF cargado desde guardados (${match.name || expectedFileName}). ${rowCount} filas disponibles.`;
    }

    if (workspaceState.documentType === 'invoices' && workspaceState.invoice) {
        renderPdfFirstPage(workspace, workspaceState.invoice);
    } else if (rowCount) {
        setActiveTableRow(workspace, 0, workspaceState);
    }

    return true;
}

async function loadSavedProjectPdf(project, workspace, workspaceState) {
    if (!workspaceState.fileName && !(workspaceState.rows || []).length) return;

    const pdfStatus = workspace.querySelector('[data-project-pdf-status]');
    const pageLabel = workspace.querySelector('[data-project-pdf-page-label]');

    try {
        if (workspaceState.documentType !== 'invoices') {
            clearInvoiceViewerState(workspace);
        }

        if (pdfStatus && workspaceState.fileName) {
            pdfStatus.textContent = `Cargando PDF guardado: ${workspaceState.fileName}...`;
        }

        const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/pdf`), {
            headers: authHeaders()
        });
        if (response.status === 404) {
            if (await loadMatchingSavedWorkspacePdf(project, workspace, workspaceState)) return;
            activePdfDocument = null;
            syncSaveFileButton(workspaceState);
            if (pageLabel) pageLabel.textContent = 'PDF no cargado en esta sesion';
            return;
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const loadedFileName = decodeURIComponent(response.headers.get('X-File-Name') || '').trim();
        const expectedFileName = String(workspaceState.fileName || '').trim();
        if (loadedFileName && expectedFileName && !samePdfFileName(loadedFileName, expectedFileName)) {
            activePdfDocument = null;
            clearPdfCellHighlights(workspace);
            if (await loadMatchingSavedWorkspacePdf(project, workspace, workspaceState)) return;
            syncSaveFileButton(workspaceState);
            if (pageLabel) pageLabel.textContent = 'PDF no corresponde';
            if (pdfStatus) {
                pdfStatus.textContent = `La tabla es de ${expectedFileName}, pero el PDF activo es ${loadedFileName}. Abre el guardado correcto o vuelve a subir ese PDF.`;
            }
            return;
        }

        const data = await response.arrayBuffer();
        const pdfjsLib = await ensurePdfJs();
        activePdfDocument = await pdfjsLib.getDocument({ data }).promise;
        syncSaveFileButton(workspaceState);

        if (pageLabel) pageLabel.textContent = 'PDF';
        if (pdfStatus) {
            pdfStatus.textContent = workspaceState.rows?.length
                ? `PDF guardado cargado. ${workspaceState.rows.length} filas disponibles.`
                : 'PDF guardado cargado.';
        }

        if (workspaceState.documentType === 'invoices' && workspaceState.invoice) {
            renderPdfFirstPage(workspace, workspaceState.invoice);
        } else if ((workspaceState.rows || []).length) {
            setActiveTableRow(workspace, 0, workspaceState);
        }
    } catch (error) {
        activePdfDocument = null;
        syncSaveFileButton(workspaceState);
        if (pdfStatus) {
            pdfStatus.textContent = `No se pudo cargar el PDF guardado: ${String(error?.message || error)}`;
        }
    }
}

async function loadSavedInvoiceBatchPdfs(project, savedFileId, workspaceState) {
    const records = Array.isArray(workspaceState?.invoices) ? workspaceState.invoices : [];
    activePdfDocument = null;
    activeInvoicePdfDocuments = new Map();
    activeInvoicePdfFiles = new Map();

    if (!records.length || !savedFileId) return;

    const pdfjsLib = await ensurePdfJs();

    for (const record of records) {
        try {
            const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/saved-workspaces/${encodeURIComponent(savedFileId)}/invoices/${encodeURIComponent(record.id)}/pdf`), {
                headers: authHeaders()
            });
            if (!response.ok) continue;

            const buffer = await response.arrayBuffer();
            activeInvoicePdfFiles.set(record.id, {
                fileName: record.fileName || 'factura.pdf',
                buffer: buffer.slice(0)
            });
            activeInvoicePdfDocuments.set(record.id, await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise);
        } catch (error) {
            console.warn('[project-workspace] No se pudo cargar PDF de factura guardada.', record.id, error);
        }
    }
}

function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
}

function toCsvCell(value) {
    const text = String(value ?? '');
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatCurrency(value) {
    const amount = Number(value || 0);
    return `${amount.toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} EUR`;
}

function formatCustomerDate(value) {
    const text = safeText(value);
    if (!text) return '-';

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;

    return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function projectFileBaseName(project) {
    return String(project?.key || project?.name || 'proyecto')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'proyecto';
}

function getColumnLabel(column, workspaceState) {
    if (column.key === 'actions') return '';
    return workspaceState.headerLabels?.[column.key] || column.label;
}

function getActiveColumns(workspaceState) {
    const dynamicColumns = Array.isArray(workspaceState.columns) ? workspaceState.columns : [];
    const wordpressColumn = {
        key: 'wordpressMatch',
        label: 'WordPress',
        readonly: true,
        wordpress: true
    };
    const shouldShowWordPress = Boolean(activeWordPressConnection)
        || (Array.isArray(workspaceState.rows) && workspaceState.rows.some((row) => row?.wordpressMatch));

    if (dynamicColumns.length) {
        return [
            { key: 'page', label: 'Pagina', readonly: true },
            ...dynamicColumns.map((column) => ({
                key: column.key,
                label: column.label || column.key,
                dynamic: true
            })),
            ...(shouldShowWordPress ? [wordpressColumn] : []),
            { key: 'status', label: 'Estado' },
            { key: 'actions', label: '', readonly: true }
        ];
    }

    return shouldShowWordPress
        ? [
            ...TABLE_COLUMNS.filter((column) => column.key !== 'status' && column.key !== 'actions'),
            wordpressColumn,
            TABLE_COLUMNS.find((column) => column.key === 'status'),
            TABLE_COLUMNS.find((column) => column.key === 'actions')
        ].filter(Boolean)
        : TABLE_COLUMNS;
}

function getRowValue(row, column) {
    if (column.wordpress) {
        if (!row?.wordpressMatch?.checked) return '';
        return row.wordpressMatch.exists ? 'OK' : 'NO';
    }

    if (column.dynamic) return row?.cells?.[column.key] || '';
    return row?.[column.key] || '';
}

function getPartNumberColumn(workspaceState) {
    const dynamicColumns = Array.isArray(workspaceState.columns) ? workspaceState.columns : [];
    return dynamicColumns.find((column) => {
        const label = normalizePdfText(column.label || column.key);
        return label === 'PN' || label === 'PART NO' || label === 'PART NUMBER' || label === 'PARTNO';
    }) || null;
}

function isPartNumberColumn(column, workspaceState) {
    if (!column) return false;
    if (!column.dynamic) return column.key === 'partNo';

    const dynamicPartColumn = getPartNumberColumn(workspaceState);
    if (dynamicPartColumn) return column.key === dynamicPartColumn.key;

    const label = normalizePdfText(column.label || column.key);
    return label === 'PN' || label === 'PART NO' || label === 'PART NUMBER' || label === 'PARTNO';
}

function getRowPartNumber(row, workspaceState) {
    const dynamicPartColumn = getPartNumberColumn(workspaceState);
    if (dynamicPartColumn) return safeText(row?.cells?.[dynamicPartColumn.key]);
    return safeText(row?.partNo);
}

function hasPartNumberValue(row, workspaceState) {
    return Boolean(getRowPartNumber(row, workspaceState));
}

function getWordPressMatchTitle(match) {
    if (!match?.checked) return 'Sin comprobar';
    if (!match.exists) return `No existe en WordPress: ${match.partNumber || 'PN'}`;

    const firstMatch = Array.isArray(match.matches) ? match.matches[0] : null;
    return firstMatch?.title
        ? `Existe en WordPress: ${firstMatch.title}`
        : `Existe en WordPress: ${match.partNumber || 'PN'}`;
}

function renderWordPressMatch(row) {
    const marker = document.createElement('span');
    const match = row?.wordpressMatch || null;
    marker.className = 'project-wp-match';
    marker.title = getWordPressMatchTitle(match);

    if (!match?.checked) {
        marker.classList.add('is-pending');
        marker.textContent = '-';
    } else if (match.exists) {
        marker.classList.add('is-ok');
        marker.textContent = 'OK';
    } else {
        marker.classList.add('is-missing');
        marker.textContent = 'NO';
    }

    return marker;
}

function setRowValue(row, column, value) {
    if (column.dynamic) {
        if (!row.cells || typeof row.cells !== 'object') row.cells = {};
        row.cells[column.key] = value;
        return;
    }

    row[column.key] = value;
}

function renderTableHead(workspace, workspaceState) {
    const headRow = workspace.querySelector('[data-project-import-head]');
    if (!headRow) return;

    headRow.replaceChildren();
    getActiveColumns(workspaceState).forEach((column) => {
        const th = document.createElement('th');
        th.textContent = getColumnLabel(column, workspaceState);
        headRow.appendChild(th);
    });
}

function getRowGeometry(row) {
    const geometry = row?.geometry || {};
    const y1 = Number(geometry.y1 || 0);
    const y2 = Number(geometry.y2 || 0);
    const pageHeight = Number(geometry.pageHeight || 0);
    if (pageHeight && Number.isFinite(y1) && Number.isFinite(y2) && y2 > y1) {
        return {
            page: Number(geometry.page || row.page || 1),
            y1,
            y2,
            pageHeight
        };
    }

    const cellGeometry = row?.cellGeometry && typeof row.cellGeometry === 'object'
        ? Object.values(row.cellGeometry)
            .filter((cell) => cell && typeof cell === 'object')
            .map((cell) => ({
                page: Number(cell.page || row?.page || 1),
                y1: Number(cell.y1 || 0),
                y2: Number(cell.y2 || 0),
                pageHeight: Number(cell.pageHeight || 0)
            }))
            .filter((cell) => cell.pageHeight && Number.isFinite(cell.y1) && Number.isFinite(cell.y2) && cell.y2 > cell.y1)
        : [];

    if (!cellGeometry.length) return null;

    const firstCell = cellGeometry[0];

    return {
        page: firstCell.page,
        y1: Math.min(...cellGeometry.map((cell) => cell.y1)),
        y2: Math.max(...cellGeometry.map((cell) => cell.y2)),
        pageHeight: firstCell.pageHeight
    };
}

function clearPdfCellHighlights(workspace) {
    workspace.querySelectorAll('.project-pdf-cell-highlight').forEach((node) => node.remove());
}

function clearInvoiceViewerState(workspace, { clearDocuments = true } = {}) {
    workspace.querySelector('[data-project-invoice-thumbnail-gallery]')?.remove();
    clearDocumentPreview(workspace);
    activeInvoiceExpandedIds = new Set();
    activeInvoiceBatchReviewId = '';

    if (clearDocuments) {
        activeInvoicePdfDocuments = new Map();
        activeInvoicePdfFiles = new Map();
    }

    const canvas = workspace.querySelector('[data-project-pdf-canvas]');
    if (canvas) {
        canvas.hidden = false;
        canvas.style.display = '';
    }
}

function clearPdfViewer(workspace, message = 'Selecciona una factura') {
    const canvas = workspace.querySelector('[data-project-pdf-canvas]');
    const highlight = workspace.querySelector('[data-project-pdf-highlight]');
    const pageLabel = workspace.querySelector('[data-project-pdf-page-label]');
    const activeLabel = workspace.querySelector('[data-project-active-row-label]');

    clearPdfCellHighlights(workspace);
    clearDocumentPreview(workspace);
    activePdfRenderNonce += 1;
    if (activePdfRenderTask) {
        try {
            activePdfRenderTask.cancel();
        } catch (_) {
            // PDF.js puede lanzar si la tarea ya termino.
        }
        activePdfRenderTask = null;
    }
    clearInvoiceViewerState(workspace, { clearDocuments: false });
    if (highlight) highlight.hidden = true;
    if (pageLabel) pageLabel.textContent = 'PDF';
    if (activeLabel) activeLabel.textContent = message;
    if (canvas) {
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
        canvas.removeAttribute('width');
        canvas.removeAttribute('height');
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.hidden = false;
    }
}

function getPdfCellHighlightColor(key, index = 0) {
    const normalized = normalizePdfText(key)
        .replace(/[_/-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const colors = {
        ITEM: {
            border: '#2563eb',
            background: 'rgba(37, 99, 235, 0.14)'
        },
        POS: {
            border: '#2563eb',
            background: 'rgba(37, 99, 235, 0.14)'
        },
        PARTNO: {
            border: '#16a34a',
            background: 'rgba(22, 163, 74, 0.14)'
        },
        'PART NO': {
            border: '#16a34a',
            background: 'rgba(22, 163, 74, 0.14)'
        },
        'PART NUMBER': {
            border: '#16a34a',
            background: 'rgba(22, 163, 74, 0.14)'
        },
        DESCRIPTION: {
            border: '#dc2626',
            background: 'rgba(220, 38, 38, 0.12)'
        },
        DESIGNATION: {
            border: '#dc2626',
            background: 'rgba(220, 38, 38, 0.12)'
        },
        MODELTYPE: {
            border: '#9333ea',
            background: 'rgba(147, 51, 234, 0.13)'
        },
        'MODEL TYPE': {
            border: '#9333ea',
            background: 'rgba(147, 51, 234, 0.13)'
        },
        QTY: {
            border: '#ea580c',
            background: 'rgba(234, 88, 12, 0.14)'
        },
        UNITS: {
            border: '#0891b2',
            background: 'rgba(8, 145, 178, 0.14)'
        },
        WEIGHT: {
            border: '#ca8a04',
            background: 'rgba(202, 138, 4, 0.16)'
        },
        FN: {
            border: '#db2777',
            background: 'rgba(219, 39, 119, 0.13)'
        },
        MEASUREMENT: {
            border: '#4f46e5',
            background: 'rgba(79, 70, 229, 0.13)'
        },
        STANDARD: {
            border: '#059669',
            background: 'rgba(5, 150, 105, 0.13)'
        },
        NOTES: {
            border: '#059669',
            background: 'rgba(5, 150, 105, 0.13)'
        }
    };

    const fallbackColors = [
        { border: '#2563eb', background: 'rgba(37, 99, 235, 0.14)' },
        { border: '#16a34a', background: 'rgba(22, 163, 74, 0.14)' },
        { border: '#dc2626', background: 'rgba(220, 38, 38, 0.12)' },
        { border: '#9333ea', background: 'rgba(147, 51, 234, 0.13)' },
        { border: '#ea580c', background: 'rgba(234, 88, 12, 0.14)' },
        { border: '#0891b2', background: 'rgba(8, 145, 178, 0.14)' },
        { border: '#ca8a04', background: 'rgba(202, 138, 4, 0.16)' },
        { border: '#db2777', background: 'rgba(219, 39, 119, 0.13)' }
    ];

    return colors[normalized] || fallbackColors[index % fallbackColors.length];
}

function renderPdfCellHighlights(workspace, row, canvas, scale) {
    const viewer = workspace.querySelector('[data-project-pdf-viewer]');
    const cells = row?.cellGeometry && typeof row.cellGeometry === 'object' ? row.cellGeometry : {};

    if (!viewer || !canvas || !Object.keys(cells).length) return;

    Object.entries(cells).forEach(([key, cell], index) => {
        const x1 = Number(cell.x1 || 0);
        const x2 = Number(cell.x2 || 0);
        const y1 = Number(cell.y1 || 0);
        const y2 = Number(cell.y2 || 0);

        if (!(x2 > x1) || !(y2 > y1)) return;

        const column = Array.isArray(row?.columns)
            ? row.columns.find((item) => item.key === key)
            : null;

        const color = getPdfCellHighlightColor(column?.label || key, index);

        const marker = document.createElement('div');
        marker.className = 'project-pdf-cell-highlight';
        marker.dataset.pdfCellKey = key;

        marker.style.left = `${canvas.offsetLeft + (x1 * scale) - 2}px`;
        marker.style.top = `${canvas.offsetTop + (y1 * scale) - 2}px`;
        marker.style.width = `${Math.max(6, (x2 - x1) * scale) + 4}px`;
        marker.style.height = `${Math.max(8, (y2 - y1) * scale) + 4}px`;

        marker.style.borderColor = color.border;
        marker.style.background = color.background;
        marker.style.boxShadow = `0 0 0 1px ${color.border}`;

        viewer.appendChild(marker);
    });
}

function getInvoiceFieldId(section, label, value, index) {
    return `invoice-${safeText(section)}-${getInvoiceCanonicalLabel(label)}-${safeText(value).slice(0, 24)}`
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-');
}

function getInvoiceCanonicalLabel(label) {
    const key = safeText(label)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    if (/^numero$|^(numero|num|invoice).*factura|invoice.*(no|number)/.test(key)) return 'invoice-number';
    if (/vencimiento|due/.test(key)) return 'due-date';
    if (/fecha|data|date/.test(key)) return 'date';
    if (/nif|cif|vat|dni|tax|iva/.test(key) && !/impuesto|subtotal|total/.test(key)) return 'tax-id';
    if (/email|mail|e-mail/.test(key)) return 'email';
    if (/telefono|telefon|phone|tel/.test(key)) return 'phone';
    if (/iban/.test(key)) return 'iban';
    if (/subtotal|base/.test(key)) return 'subtotal';
    if (/impuesto|iva|vat|tax/.test(key)) return 'tax';
    if (/total/.test(key)) return 'total';
    if (/moneda|currency/.test(key)) return 'currency';
    if (/tipo|type/.test(key)) return 'type';
    if (/nombre|name/.test(key)) return 'name';
    if (/direccion|address/.test(key)) return 'address';
    return key.replace(/[^a-z0-9]+/g, '-');
}

function toggleInvoicePdfHighlight(workspace, fieldId, active) {
    if (!fieldId) return;
    workspace
        .querySelectorAll(`.project-invoice-pdf-highlight[data-invoice-field-id="${CSS.escape(fieldId)}"]`)
        .forEach((marker) => marker.classList.toggle('is-active', active));
}

function renderInvoicePdfHighlights(workspace, invoice, canvas, scale, pageNumber = 1) {
    const viewer = workspace.querySelector('[data-project-pdf-viewer]');
    if (!viewer || !canvas || !invoice) return;

    const fields = Array.isArray(invoice.fields) ? invoice.fields : [];
    fields.forEach((field, index) => {
        const box = field?.sourceBox || null;
        if (!box || Number(box.page || 1) !== Number(pageNumber || 1)) return;

        const x1 = Number(box.x1 || 0);
        const x2 = Number(box.x2 || 0);
        const y1 = Number(box.y1 || 0);
        const y2 = Number(box.y2 || 0);
        if (!(x2 > x1) || !(y2 > y1)) return;

        const marker = document.createElement('div');
        marker.className = 'project-pdf-cell-highlight project-invoice-pdf-highlight';
        marker.dataset.invoiceFieldId = getInvoiceFieldId(field.section, field.label, field.value, index);
        marker.style.left = `${canvas.offsetLeft + (x1 * scale) - 3}px`;
        marker.style.top = `${canvas.offsetTop + (y1 * scale) - 3}px`;
        marker.style.width = `${Math.max(8, (x2 - x1) * scale) + 6}px`;
        marker.style.height = `${Math.max(10, (y2 - y1) * scale) + 6}px`;
        viewer.appendChild(marker);
    });

    (invoice.lineItems || []).forEach((item, index) => {
        const box = item?.sourceBox || null;
        if (!box || Number(box.page || 1) !== Number(pageNumber || 1)) return;
        const x1 = Number(box.x1 || 0);
        const x2 = Number(box.x2 || 0);
        const y1 = Number(box.y1 || 0);
        const y2 = Number(box.y2 || 0);
        if (!(x2 > x1) || !(y2 > y1)) return;
        const marker = document.createElement('div');
        marker.className = 'project-pdf-cell-highlight project-invoice-pdf-highlight';
        marker.dataset.invoiceFieldId = getInvoiceFieldId('Lineas', 'Descripcion', item.description, index);
        marker.style.left = `${canvas.offsetLeft + (x1 * scale) - 3}px`;
        marker.style.top = `${canvas.offsetTop + (y1 * scale) - 3}px`;
        marker.style.width = `${Math.max(8, (x2 - x1) * scale) + 6}px`;
        marker.style.height = `${Math.max(10, (y2 - y1) * scale) + 6}px`;
        viewer.appendChild(marker);
    });
}

function clearDocumentPreview(workspace) {
    workspace.querySelector('[data-project-document-preview]')?.remove();
}

function renderInvoiceDocumentPreview(workspace, workspaceState) {
    const canvas = workspace.querySelector('[data-project-pdf-canvas]');
    const highlight = workspace.querySelector('[data-project-pdf-highlight]');
    const pageLabel = workspace.querySelector('[data-project-pdf-page-label]');
    const activeLabel = workspace.querySelector('[data-project-active-row-label]');
    const viewer = workspace.querySelector('[data-project-pdf-viewer]');
    if (!viewer) return;
    const navigation = workspace.querySelector('[data-project-pdf-page-navigation]');
    if (navigation) navigation.hidden = true;

    const fileName = safeText(workspaceState?.fileName || workspaceState?.invoice?.fileName);
    clearPdfCellHighlights(workspace);
    workspace.querySelector('[data-project-invoice-thumbnail-gallery]')?.remove();
    clearDocumentPreview(workspace);
    if (highlight) highlight.hidden = true;
    if (canvas) {
        const context = canvas.getContext?.('2d');
        if (context) context.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
        canvas.hidden = true;
    }
    if (pageLabel) pageLabel.textContent = 'PDF';
    if (activeLabel) activeLabel.textContent = fileName || 'PDF convertido';

    const preview = document.createElement('div');
    preview.className = 'project-document-preview project-invoice-source-preview';
    preview.dataset.projectDocumentPreview = '';

    const title = document.createElement('div');
    title.className = 'project-document-preview-title';
    const badge = document.createElement('span');
    badge.textContent = 'PDF';
    const name = document.createElement('strong');
    name.textContent = fileName || 'Documento PDF';
    title.append(badge, name);

    const message = document.createElement('p');
    message.className = 'project-document-preview-empty';
    message.textContent = 'No se pudo cargar el PDF convertido en el visor. Vuelve a subir el documento o abre un guardado que contenga el PDF.';

    preview.append(title, message);
    viewer.appendChild(preview);
    viewer.scrollTop = 0;
}

async function renderPdfRow(workspace, row, workspaceState = null) {
    const canvas = workspace.querySelector('[data-project-pdf-canvas]');
    const highlight = workspace.querySelector('[data-project-pdf-highlight]');
    const pageLabel = workspace.querySelector('[data-project-pdf-page-label]');
    const activeLabel = workspace.querySelector('[data-project-active-row-label]');
    const viewer = workspace.querySelector('[data-project-pdf-viewer]');
    const geometry = getRowGeometry(row);

    if (activeLabel) {
        activeLabel.textContent = row ? getRowDisplayName(row) : 'Sin fila seleccionada';
    }

    if (!activePdfDocument || !canvas || !geometry) {
        clearPdfCellHighlights(workspace);
        clearDocumentPreview(workspace);
        if (highlight) highlight.hidden = true;
        if (canvas) canvas.hidden = false;
        if (pageLabel) pageLabel.textContent = activePdfDocument ? 'PDF' : 'PDF no cargado en esta sesion';
        return;
    }

    const renderNonce = activePdfRenderNonce + 1;
    activePdfRenderNonce = renderNonce;
    clearDocumentPreview(workspace);
    if (canvas) canvas.hidden = false;
    const page = await activePdfDocument.getPage(geometry.page);
    if (renderNonce !== activePdfRenderNonce) return;
    const parentWidth = Math.max(320, Number(viewer?.clientWidth || 640) - 28);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = parentWidth / Math.max(1, baseViewport.width);
    const viewport = page.getViewport({ scale });
    const context = canvas.getContext('2d');

    if (activePdfRenderTask) {
        try {
            activePdfRenderTask.cancel();
        } catch (_) {
            // PDF.js puede lanzar si la tarea ya termino.
        }
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    activePdfRenderTask = page.render({ canvasContext: context, viewport });
    try {
        await activePdfRenderTask.promise;
    } catch (error) {
        if (String(error?.name || '') !== 'RenderingCancelledException') throw error;
    }
    if (renderNonce !== activePdfRenderNonce) return;

    if (pageLabel) pageLabel.textContent = `Pagina ${geometry.page}`;
    if (highlight) {
        const top = Math.max(0, geometry.y1 * scale);
        const height = Math.max(10, (geometry.y2 - geometry.y1) * scale);
        highlight.style.left = `${canvas.offsetLeft}px`;
        highlight.style.width = `${canvas.clientWidth}px`;
        highlight.style.right = 'auto';
        highlight.style.top = `${canvas.offsetTop + top}px`;
        highlight.style.height = `${height}px`;
        highlight.hidden = false;

        if (viewer) {
            viewer.scrollTop = Math.max(0, canvas.offsetTop + top - (viewer.clientHeight * 0.35));
        }
    }

    clearPdfCellHighlights(workspace);
    renderPdfCellHighlights(workspace, row, canvas, scale);
}

async function renderPdfFirstPage(workspace, invoice = null, requestedPage = 1) {
    const canvas = workspace.querySelector('[data-project-pdf-canvas]');
    const highlight = workspace.querySelector('[data-project-pdf-highlight]');
    const pageLabel = workspace.querySelector('[data-project-pdf-page-label]');
    const activeLabel = workspace.querySelector('[data-project-active-row-label]');
    const viewer = workspace.querySelector('[data-project-pdf-viewer]');
    const renderNonce = activePdfRenderNonce + 1;
    activePdfRenderNonce = renderNonce;

    clearPdfCellHighlights(workspace);
    workspace.querySelector('[data-project-invoice-thumbnail-gallery]')?.remove();
    clearDocumentPreview(workspace);
    if (highlight) highlight.hidden = true;
    if (activeLabel) activeLabel.textContent = 'Documento completo';
    if (canvas) canvas.hidden = false;

    if (!activePdfDocument || !canvas) {
        syncPdfPageNavigation(workspace, 1);
        if (pageLabel) pageLabel.textContent = activePdfDocument ? 'PDF' : 'PDF no cargado en esta sesion';
        return;
    }

    const pageNumber = Math.max(1, Math.min(activePdfDocument.numPages, Number(requestedPage || 1)));
    activePdfPageNumber = pageNumber;
    syncPdfPageNavigation(workspace, pageNumber);
    const page = await activePdfDocument.getPage(pageNumber);
    if (renderNonce !== activePdfRenderNonce) return;
    const parentWidth = Math.max(320, Number(viewer?.clientWidth || 640) - 28);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = parentWidth / Math.max(1, baseViewport.width);
    const viewport = page.getViewport({ scale });
    const context = canvas.getContext('2d');

    if (activePdfRenderTask) {
        try {
            activePdfRenderTask.cancel();
        } catch (_) {
            // PDF.js puede lanzar si la tarea ya termino.
        }
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    activePdfRenderTask = page.render({ canvasContext: context, viewport });
    try {
        await activePdfRenderTask.promise;
    } catch (error) {
        if (String(error?.name || '') !== 'RenderingCancelledException') throw error;
    }
    if (renderNonce !== activePdfRenderNonce) return;

    if (pageLabel) pageLabel.textContent = `Pagina ${pageNumber}`;
    if (viewer) viewer.scrollTop = 0;
    renderInvoicePdfHighlights(workspace, invoice, canvas, scale, pageNumber);
}

function getRowDisplayName(row) {
    if (row?.pos || row?.partNo || row?.designation) {
        return `POS ${row.pos || '-'} - ${row.partNo || row.designation || 'fila activa'}`;
    }

    const cells = row?.cells && typeof row.cells === 'object' ? row.cells : {};
    const item = safeText(cells.item || cells.pos || cells.position);
    const partNo = safeText(cells.partNo || cells.part_no || cells.pn);
    const description = safeText(cells.description || cells.designation || cells.desc);

    if (item || partNo || description) {
        return `POS ${item || '-'} - ${partNo || description || 'fila activa'}`;
    }

    const firstCells = Object.values(cells).filter(Boolean).slice(0, 2).join(' - ');
    return firstCells || 'fila activa';
}

function setActiveTableRow(workspace, rowIndex, workspaceState) {
    const rows = workspaceState.rows || [];
    const index = Math.max(0, Math.min(rows.length - 1, Number(rowIndex || 0)));
    workspace.querySelectorAll('[data-project-row-index]').forEach((tr) => {
        tr.classList.toggle('is-active', Number(tr.dataset.projectRowIndex) === index);
    });
    renderPdfRow(workspace, rows[index], workspaceState);
}

function hasWorkspaceDocument(workspaceState) {
    return Boolean(
        (Array.isArray(workspaceState?.rows) && workspaceState.rows.length)
        || (workspaceState?.documentType === 'invoices' && workspaceState?.invoice)
        || (workspaceState?.documentType === 'invoices' && Array.isArray(workspaceState?.invoices) && workspaceState.invoices.length)
    );
}

function formatInvoiceAmount(value, currency = 'EUR') {
    if (value == null || value === '') return '-';
    const amount = Number(value);
    if (!Number.isFinite(amount)) return String(value);

    return `${amount.toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })} ${currency || 'EUR'}`;
}

function parseInvoiceEditableValue(path, value) {
    const text = safeText(value);
    if (!Array.isArray(path) || !path.length) return text;
    if (path[0] !== 'amounts') return text;

    const normalized = text
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

function setInvoicePathValue(invoice, path, value) {
    if (!invoice || !Array.isArray(path) || !path.length) return;

    let target = invoice;
    for (let index = 0; index < path.length - 1; index += 1) {
        const key = path[index];
        if (target[key] == null) target[key] = typeof path[index + 1] === 'number' ? [] : {};
        target = target[key];
    }

    target[path[path.length - 1]] = parseInvoiceEditableValue(path, value);
}

function syncActiveInvoiceRecord(workspaceState) {
    if (workspaceState?.documentType !== 'invoices' || !workspaceState.activeInvoiceId) return;
    const records = Array.isArray(workspaceState.invoices) ? workspaceState.invoices : [];
    const record = records.find((item) => item.id === workspaceState.activeInvoiceId);
    if (!record) return;

    record.invoice = workspaceState.invoice || record.invoice || {};
    record.rows = buildInvoiceRows(record.invoice);
    record.columns = workspaceState.columns || record.columns || INVOICE_TABLE_COLUMNS;
    record.headerLabels = workspaceState.headerLabels || record.headerLabels || INVOICE_HEADER_LABELS;
    workspaceState.rows = record.rows;
}

function saveInvoiceFieldEdit(workspaceState) {
    syncActiveInvoiceRecord(workspaceState);
    if (!activeWorkspaceProject) return;
    saveWorkspace(activeWorkspaceProject, workspaceState).catch((error) => {
        console.warn('No se pudo guardar la edicion de factura:', error);
    });
}

function appendInvoiceField(container, label, value, fieldId, editPath, workspaceState) {
    if (!safeText(value)) return;
    const field = document.createElement('span');
    field.className = 'project-invoice-field';
    if (fieldId) {
        field.dataset.invoiceFieldId = fieldId;
        field.addEventListener('mouseenter', () => toggleInvoicePdfHighlight(document, fieldId, true));
        field.addEventListener('mouseleave', () => toggleInvoicePdfHighlight(document, fieldId, false));
    }

    const small = document.createElement('small');
    small.textContent = label;
    const strong = document.createElement('strong');
    if (editPath) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = safeText(value) || '-';
        input.setAttribute('aria-label', label);
        input.addEventListener('click', (event) => event.stopPropagation());
        input.addEventListener('change', () => {
            setInvoicePathValue(workspaceState.invoice, editPath, input.value);
            saveInvoiceFieldEdit(workspaceState);
        });
        strong.appendChild(input);
    } else {
        strong.textContent = safeText(value) || '-';
    }

    field.append(small, strong);
    container.appendChild(field);
}

function appendInvoiceSection(container, title, fields, workspaceState) {
    const visibleFields = fields.filter((field) => safeText(field.value));
    if (!visibleFields.length) return;

    const section = document.createElement('section');
    section.className = 'project-invoice-section';

    const header = document.createElement('header');
    header.textContent = title;
    const body = document.createElement('div');
    body.className = 'project-invoice-fields';

    visibleFields.forEach((field) => {
        appendInvoiceField(body, field.label, field.value, field.fieldId, field.editPath, workspaceState);
    });
    section.append(header, body);
    container.appendChild(section);
}

function buildInvoiceDynamicSections(invoice) {
    const sections = new Map();
    let fieldCounter = 0;
    const add = (section, label, value, sourceBox = null, editPath = null) => {
        if (!safeText(value)) return;
        const sectionName = safeText(section) || 'Factura';
        if (!sections.has(sectionName)) sections.set(sectionName, []);
        const fields = sections.get(sectionName);
        const exists = fields.some((field) => (
            getInvoiceCanonicalLabel(field.label) === getInvoiceCanonicalLabel(label)
            && safeText(field.value).toLowerCase() === safeText(value).toLowerCase()
        ));
        if (!exists) {
            const fieldId = sourceBox ? getInvoiceFieldId(sectionName, label, value, fieldCounter) : '';
            fieldCounter += 1;
            fields.push({ label, value, sourceBox, fieldId, editPath });
        }
    };

    const isStructuredDuplicate = (field) => {
        const section = safeText(field?.section).toLowerCase();
        const label = safeText(field?.label)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        if (!label || /^col$/.test(label) || /gross\s*wgt|net\s*wgt|expiry|amounts/.test(label)) return true;
        if (/^\d[\d.,/\s-]*.*(?:gross|qty|kg|mt|price|amount)/.test(label)) return true;
        if (section === 'factura' && /^(tipo|numero|numero de factura|fecha|vencimiento|moneda|idioma detectado)$/.test(label)) return true;
        if (section === 'emisor' && /^(nombre|direccion|nif \/ vat|email|telefono|proveedor \/ razon social)$/.test(label)) return true;
        if (section === 'cliente' && /^(nombre|direccion|nif \/ vat|email|telefono)$/.test(label)) return true;
        if (section === 'importes' && /subtotal|iva|impuesto|tax|total|pagado|pendiente/.test(label)) return true;
        if (section === 'pago' && /iban|metodo|forma de pago/.test(label)) return true;
        return false;
    };

    const sourceFor = (section, label) => {
        const sectionKey = safeText(section).toLowerCase();
        const canonical = getInvoiceCanonicalLabel(label);
        return (invoice.fields || []).find((field) => (
            safeText(field?.section).toLowerCase() === sectionKey
            && getInvoiceCanonicalLabel(field?.label) === canonical
            && field?.sourceBox
        ))?.sourceBox || null;
    };

    (invoice.fields || []).forEach((field, index) => {
        if (isStructuredDuplicate(field)) return;
        add(field.section, field.label, field.value, field.sourceBox || null, ['fields', index, 'value']);
    });

    add('Factura', 'Tipo', invoice.type, sourceFor('Factura', 'Tipo'), ['type']);
    add('Factura', 'Numero', invoice.invoiceNumber, sourceFor('Factura', 'Numero de factura'), ['invoiceNumber']);
    add('Factura', 'Fecha', invoice.date, sourceFor('Factura', 'Fecha'), ['date']);
    add('Factura', 'Vencimiento', invoice.dueDate, sourceFor('Factura', 'Vencimiento'), ['dueDate']);
    add('Factura', 'Moneda', invoice.currency, sourceFor('Factura', 'Moneda'), ['currency']);
    add('Factura', 'Idioma detectado', getInvoiceLanguageLabel(invoice.language));
    add('Pago', 'Metodo de pago', invoice.payment?.method, sourceFor('Pago', 'Forma de pago'), ['payment', 'method']);
    add('Pago', 'IBAN', invoice.payment?.iban, sourceFor('Pago', 'IBAN'), ['payment', 'iban']);
    add('Importes', 'Subtotal', invoice.amounts?.subtotal == null ? '' : formatInvoiceAmount(invoice.amounts.subtotal, invoice.currency || 'EUR'), sourceFor('Importes', 'Subtotal'), ['amounts', 'subtotal']);
    add('Importes', 'Impuestos', invoice.amounts?.tax == null ? '' : formatInvoiceAmount(invoice.amounts.tax, invoice.currency || 'EUR'), sourceFor('Importes', 'IVA / impuestos'), ['amounts', 'tax']);
    add('Importes', 'Total', invoice.amounts?.total == null ? '' : formatInvoiceAmount(invoice.amounts.total, invoice.currency || 'EUR'), sourceFor('Importes', 'Total'), ['amounts', 'total']);
    add('Importes', 'Pagado', invoice.amounts?.paid == null ? '' : formatInvoiceAmount(invoice.amounts.paid, invoice.currency || 'EUR'), null, ['amounts', 'paid']);
    add('Importes', 'Pendiente', invoice.amounts?.due == null ? '' : formatInvoiceAmount(invoice.amounts.due, invoice.currency || 'EUR'), null, ['amounts', 'due']);

    Object.entries(invoice.supplier || {}).forEach(([key, value]) => {
        const labels = { name: 'Nombre', address: 'Direccion', taxId: 'NIF / VAT', email: 'Email', phone: 'Telefono' };
        add('Emisor', labels[key] || key, value, sourceFor('Emisor', labels[key] || key), ['supplier', key]);
    });
    Object.entries(invoice.customer || {}).forEach(([key, value]) => {
        const labels = { name: 'Nombre', address: 'Direccion', taxId: 'NIF / VAT', email: 'Email', phone: 'Telefono' };
        add('Cliente', labels[key] || key, value, sourceFor('Cliente', labels[key] || key), ['customer', key]);
    });

    return [...sections.entries()];
}

function renderInvoiceView(workspace, workspaceState) {
    const invoiceView = workspace.querySelector('[data-project-invoice-view]');
    if (!invoiceView) return;

    const invoice = workspaceState.invoice || {};
    const currency = invoice.currency || 'EUR';
    invoiceView.replaceChildren();

    const hero = document.createElement('section');
    hero.className = 'project-invoice-hero';
    const kicker = document.createElement('small');
    kicker.textContent = invoice.type || 'Factura detectada';
    const title = document.createElement('strong');
    title.textContent = invoice.invoiceNumber ? `Factura ${invoice.invoiceNumber}` : 'Factura sin numero detectado';
    const subtitle = document.createElement('span');
    const languageLabel = getInvoiceLanguageLabel(invoice.language);
    const languageText = languageLabel === '-' ? '' : ` - Idioma: ${languageLabel}`;
    subtitle.textContent = `${workspaceState.fileName || 'PDF'} - ${Number(workspaceState.pageCount || 0)} paginas - ${Number(invoice.detectedFields || 0)} campos detectados${languageText}`;
    hero.append(kicker, title, subtitle);
    if (Array.isArray(workspaceState.invoices) && workspaceState.invoices.length > 1) {
        const backButton = document.createElement('button');
        backButton.type = 'button';
        backButton.className = 'project-invoice-back project-invoice-header-back';
        backButton.textContent = 'Volver al listado';
        backButton.addEventListener('click', () => {
            if (activeWorkspaceProject) showInvoiceBatchList(activeWorkspaceProject, workspace, workspaceState);
        });
        workspace.querySelector('.project-workspace-brand')?.appendChild(backButton);
    }

    const metrics = document.createElement('div');
    metrics.className = 'project-invoice-metrics';
    [
        ['Total', invoice.amounts?.total == null ? '' : formatInvoiceAmount(invoice.amounts.total, currency)],
        ['IVA / impuestos', invoice.amounts?.tax == null ? '' : formatInvoiceAmount(invoice.amounts.tax, currency)],
        ['Vencimiento', invoice.dueDate || '']
    ].filter(([, value]) => safeText(value)).forEach(([label, value]) => {
        const item = document.createElement('span');
        const small = document.createElement('small');
        small.textContent = label;
        const strong = document.createElement('strong');
        strong.textContent = value;
        item.append(small, strong);
        metrics.appendChild(item);
    });

    const grid = document.createElement('div');
    grid.className = 'project-invoice-grid';
    buildInvoiceDynamicSections(invoice).forEach(([section, fields]) => {
        appendInvoiceSection(grid, section, fields, workspaceState);
    });

    const lines = document.createElement('section');
    lines.className = 'project-invoice-section project-invoice-lines';
    const linesHeader = document.createElement('header');
    linesHeader.textContent = 'Lineas de factura';
    lines.appendChild(linesHeader);
    const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
    if (lineItems.length) {
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>Codigo</th><th>Descripcion</th><th>Cantidad</th><th>Unidad</th><th>Precio ud.</th><th>Descuento</th><th>IVA %</th><th>Total</th></tr>';
        const tbody = document.createElement('tbody');
        lineItems.forEach((item, index) => {
            const tr = document.createElement('tr');
            const lineFieldId = item.sourceBox
                ? getInvoiceFieldId('Lineas', 'Descripcion', item.description, index)
                : '';
            if (lineFieldId) {
                tr.addEventListener('mouseenter', () => toggleInvoicePdfHighlight(document, lineFieldId, true));
                tr.addEventListener('mouseleave', () => toggleInvoicePdfHighlight(document, lineFieldId, false));
            }
            [
                ['code', item.code || '-'],
                ['description', item.description || '-'],
                ['quantity', item.quantity ?? '-'],
                ['unit', item.unit || '-'],
                ['unitPrice', formatInvoiceAmount(item.unitPrice, currency)],
                ['discount', item.discount == null ? '-' : `${item.discount}%`],
                ['taxRate', item.taxRate == null ? '-' : `${item.taxRate}%`],
                ['total', formatInvoiceAmount(item.total, currency)]
            ].forEach(([key, value]) => {
                const td = document.createElement('td');
                const input = document.createElement('input');
                input.type = 'text';
                input.value = String(value);
                input.addEventListener('click', (event) => event.stopPropagation());
                input.addEventListener('change', () => {
                    setInvoicePathValue(workspaceState.invoice, ['lineItems', index, key], input.value);
                    saveInvoiceFieldEdit(workspaceState);
                });
                td.appendChild(input);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.append(thead, tbody);
        lines.appendChild(table);
    } else {
        const empty = document.createElement('div');
        empty.className = 'project-invoice-empty-lines';
        empty.textContent = 'No se detectaron lineas de factura claras. Revisa el PDF de la derecha.';
        lines.appendChild(empty);
    }
    grid.appendChild(lines);

    invoiceView.append(hero, metrics, grid);
}

async function openInvoiceRecord(project, workspace, workspaceState, recordId) {
    const record = (workspaceState.invoices || []).find((item) => item.id === recordId);
    if (!record) return;

    workspaceState.activeInvoiceId = record.id;
    workspaceState.fileName = record.convertedPdfFileName || record.fileName || record.invoice?.fileName || 'Factura.pdf';
    workspaceState.pageCount = Number(record.pageCount || 0);
    workspaceState.headerLabels = record.headerLabels || INVOICE_HEADER_LABELS;
    workspaceState.columns = record.columns || INVOICE_TABLE_COLUMNS;
    workspaceState.documentKind = 'pdf';
    record.invoice = enhanceImportedInvoice(record.invoice || null);
    const rebuiltRows = buildInvoiceRows(record.invoice);
    workspaceState.rows = rebuiltRows.length ? rebuiltRows : (Array.isArray(record.rows) ? record.rows : []);
    record.rows = workspaceState.rows;
    workspaceState.preview = null;
    workspaceState.invoice = record.invoice || null;
    workspaceState.extractionReport = record.extractionReport || workspaceState.extractionReport || null;
    activePdfDocument = await ensureInvoiceRecordPdfDocument(project, workspaceState, record);
    activePdfPageNumber = 1;

    renderWorkspace(workspace, project, workspaceState);
}

function showInvoiceBatchList(project, workspace, workspaceState) {
    const records = Array.isArray(workspaceState.invoices) ? workspaceState.invoices : [];
    workspaceState.activeInvoiceId = '';
    workspaceState.invoice = null;
    workspaceState.rows = [];
    workspaceState.preview = null;
    workspaceState.columns = [];
    workspaceState.headerLabels = {};
    workspaceState.documentKind = 'pdf';
    workspaceState.preview = null;
    workspaceState.fileName = records.length ? `${records.length} facturas importadas` : '';
    workspaceState.pageCount = records.reduce((sum, record) => sum + Number(record.pageCount || 0), 0);
    activePdfDocument = null;
    renderWorkspace(workspace, project, workspaceState);
}

function refreshInvoiceBatchState(workspaceState) {
    const records = Array.isArray(workspaceState.invoices) ? workspaceState.invoices : [];
    const totalLines = records.reduce((sum, record) => sum + Number(record.rows?.length || record.invoice?.lineItems?.length || 0), 0);
    const reports = records.map((record) => record?.extractionReport).filter(Boolean);
    const precision = reports.length
        ? reports.reduce((sum, report) => sum + Number(report?.precision || 0), 0) / reports.length
        : 0;

    workspaceState.fileName = records.length ? `${records.length} facturas importadas` : '';
    workspaceState.pageCount = records.reduce((sum, record) => sum + Number(record.pageCount || 0), 0);
    workspaceState.extractionReport = {
        ...(workspaceState.extractionReport || {}),
        selectedEngine: 'invoice-batch',
        tablesDetected: records.length,
        rowsExtracted: totalLines,
        precision,
        problems: reports.flatMap((report) => Array.isArray(report?.problems) ? report.problems : []),
        engines: reports.flatMap((report) => Array.isArray(report?.engines) ? report.engines : [])
    };
}

function deleteInvoiceRecord(project, workspace, workspaceState, recordId) {
    const records = Array.isArray(workspaceState.invoices) ? workspaceState.invoices : [];
    const record = records.find((item) => item.id === recordId);
    if (!record) return;

    const name = getInvoiceRecordSummary(record).invoiceNumber || record.fileName || 'esta factura';
    if (!window.confirm(`Eliminar ${name}?`)) return;

    workspaceState.invoices = records.filter((item) => item.id !== recordId);
    activeInvoicePdfDocuments.delete(recordId);
    activeInvoicePdfFiles.delete(recordId);
    activeInvoiceExpandedIds.delete(recordId);

    if (workspaceState.activeInvoiceId === recordId) {
        workspaceState.activeInvoiceId = '';
        workspaceState.invoice = null;
        workspaceState.rows = [];
        workspaceState.preview = null;
        workspaceState.columns = [];
        workspaceState.headerLabels = {};
        activePdfDocument = null;
    }

    refreshInvoiceBatchState(workspaceState);
    saveWorkspace(project, workspaceState).catch((error) => {
        console.warn('No se pudo guardar la eliminacion de factura:', error);
    });
    renderWorkspace(workspace, project, workspaceState);
}

function createInvoiceSpecList(specs) {
    const list = document.createElement('div');
    list.className = 'project-invoice-spec-list';

    specs.filter((spec) => safeText(spec?.value)).forEach((spec) => {
        const item = document.createElement('span');
        item.className = 'project-invoice-spec-chip';
        const label = document.createElement('small');
        label.textContent = spec.label;
        const value = document.createElement('strong');
        value.textContent = spec.value;
        item.append(label, value);
        list.appendChild(item);
    });

    if (!list.childElementCount) {
        const empty = document.createElement('span');
        empty.className = 'project-invoice-spec-empty';
        empty.textContent = '-';
        list.appendChild(empty);
    }

    return list;
}

function createInvoiceLinesPanel(record) {
    const wrapper = document.createElement('div');
    wrapper.className = 'project-invoice-lines-panel';
    const lines = Array.isArray(record?.invoice?.lineItems) ? record.invoice.lineItems : [];

    if (!lines.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Esta factura no tiene lineas detectadas.';
        wrapper.appendChild(empty);
        return wrapper;
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Descripcion</th><th>Cantidad</th><th>Precio ud.</th><th>Total</th></tr>';
    const tbody = document.createElement('tbody');

    lines.forEach((line) => {
        const tr = document.createElement('tr');
        [
            line.description || '-',
            line.quantity || '-',
            line.unitPrice || '-',
            line.total || '-'
        ].forEach((value) => {
            const td = document.createElement('td');
            td.textContent = safeText(value) || '-';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    table.append(thead, tbody);
    wrapper.appendChild(table);
    return wrapper;
}

async function toggleInvoiceLineDetails(project, workspace, workspaceState, row, record, button) {
    if (!row || !record) return;

    const existing = row.nextElementSibling?.classList?.contains('project-invoice-lines-detail-row')
        ? row.nextElementSibling
        : null;

    if (existing) {
        existing.remove();
        activeInvoiceExpandedIds = new Set();
        if (activeInvoiceBatchReviewId === record.id) activeInvoiceBatchReviewId = '';
        row.classList.remove('is-active');
        if (button) {
            button.textContent = '>';
            button.setAttribute('aria-expanded', 'false');
        }
        activePdfDocument = null;
        activePdfPageNumber = 1;
        const records = Array.isArray(workspaceState.invoices) ? workspaceState.invoices : [];
        await renderInvoiceBatchPdfGallery(workspace, project, workspaceState, records, {
            forceThumbnails: true
        });
        return;
    }

    row.closest('tbody')?.querySelectorAll('.project-invoice-lines-detail-row').forEach((detailRow) => {
        detailRow.remove();
    });
    row.closest('tbody')?.querySelectorAll('.project-invoice-lines-toggle').forEach((toggle) => {
        toggle.textContent = '>';
        toggle.setAttribute('aria-expanded', 'false');
    });

    activeInvoiceExpandedIds = new Set([record.id]);
    activeInvoiceBatchReviewId = record.id;
    if (button) {
        button.textContent = 'v';
        button.setAttribute('aria-expanded', 'true');
    }

    const detailRow = document.createElement('tr');
    detailRow.className = 'project-invoice-lines-detail-row';
    const detailCell = document.createElement('td');
    detailCell.colSpan = 13;
    detailCell.appendChild(createInvoiceLinesPanel(record));
    detailRow.appendChild(detailCell);
    row.after(detailRow);

    const viewer = workspace.querySelector('[data-project-pdf-viewer]');
    const canvas = workspace.querySelector('[data-project-pdf-canvas]');
    const pageLabel = workspace.querySelector('[data-project-pdf-page-label]');
    const activeLabel = workspace.querySelector('[data-project-active-row-label]');
    viewer?.querySelector('[data-project-invoice-thumbnail-gallery]')?.remove();
    const selectedPdfDocument = await ensureInvoiceRecordPdfDocument(project, workspaceState, record);
    if (activeInvoiceBatchReviewId !== record.id) return;
    activePdfDocument = selectedPdfDocument;
    activePdfPageNumber = 1;

    if (activePdfDocument) {
        if (canvas) canvas.hidden = false;
        if (pageLabel) pageLabel.textContent = 'Pagina 1';
        if (activeLabel) {
            activeLabel.textContent = record.fileName || record.invoice?.fileName || 'Factura seleccionada';
        }
        await renderPdfFirstPage(workspace, record.invoice || null, 1);
    } else {
        renderInvoiceDocumentPreview(workspace, {
            fileName: record.fileName || record.invoice?.fileName || 'factura.pdf',
            invoice: record.invoice || null
        });
    }

    row.classList.add('is-active');
    row.closest('tbody')?.querySelectorAll('.project-invoice-summary-row').forEach((summaryRow) => {
        if (summaryRow !== row) summaryRow.classList.remove('is-active');
    });

    if (window.matchMedia('(max-width: 1750px)').matches) {
        workspace.querySelector('[data-project-pdf-panel]')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

function drawInvoiceDocumentThumbnail(canvas, record, index) {
    const context = canvas?.getContext?.('2d');
    if (!context) return;

    const summary = getInvoiceRecordSummary(record);

    canvas.width = 520;
    canvas.height = 700;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#f8fbff');
    gradient.addColorStop(1, '#eefbff');
    context.fillStyle = gradient;
    context.fillRect(22, 22, canvas.width - 44, canvas.height - 44);

    context.strokeStyle = '#dbeafe';
    context.lineWidth = 6;
    context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

    context.fillStyle = '#2563eb';
    context.beginPath();
    context.roundRect(42, 42, 96, 44, 20);
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = '700 24px Inter, Segoe UI, sans-serif';
    context.fillText('PDF', 62, 72);

    context.fillStyle = '#0f172a';
    context.font = '800 28px Inter, Segoe UI, sans-serif';
    context.fillText('PDF no disponible', 42, 168);

    context.fillStyle = '#64748b';
    context.font = '700 16px Inter, Segoe UI, sans-serif';
    context.fillText((safeText(summary.fileName) || `Factura ${index + 1}`).slice(0, 46), 42, 205);

    context.fillStyle = '#334155';
    context.font = '700 18px Inter, Segoe UI, sans-serif';
    context.fillText('Abre un guardado con PDF convertido', 42, 282);
    context.fillText('o vuelve a importar este archivo.', 42, 312);

    context.strokeStyle = '#bfdbfe';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(42, 372);
    context.lineTo(canvas.width - 42, 372);
    context.stroke();

    context.fillStyle = '#0f766e';
    context.font = '800 22px Inter, Segoe UI, sans-serif';
    context.fillText(summary.total && summary.total !== '-' ? summary.total : `${summary.lines} lineas`, 42, 430);
}

async function renderInvoiceBatchPdfGallery(workspace, project, workspaceState, records, options = {}) {
    const viewer = workspace.querySelector('[data-project-pdf-viewer]');
    const canvas = workspace.querySelector('[data-project-pdf-canvas]');
    const highlight = workspace.querySelector('[data-project-pdf-highlight]');
    const pageLabel = workspace.querySelector('[data-project-pdf-page-label]');
    const activeLabel = workspace.querySelector('[data-project-active-row-label]');
    if (!viewer) return;
    const navigation = workspace.querySelector('[data-project-pdf-page-navigation]');
    if (navigation) navigation.hidden = true;

    const renderNonce = activePdfRenderNonce + 1;
    activePdfRenderNonce = renderNonce;
    if (activePdfRenderTask) {
        try {
            activePdfRenderTask.cancel();
        } catch (_) {
            // PDF.js puede lanzar si la tarea ya termino.
        }
        activePdfRenderTask = null;
    }
    clearPdfCellHighlights(workspace);
    viewer.querySelector('[data-project-invoice-thumbnail-gallery]')?.remove();
    if (canvas) {
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width || 0, canvas.height || 0);
        canvas.removeAttribute('width');
        canvas.removeAttribute('height');
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.hidden = true;
    }
    if (highlight) highlight.hidden = true;
    if (pageLabel) pageLabel.textContent = 'Facturas';
    if (activeLabel) activeLabel.textContent = `${records.length} facturas importadas`;
    viewer.scrollTop = 0;
    viewer.scrollLeft = 0;

    if (records.length === 1 && !options.forceThumbnails) {
        const singleRecord = records[0];
        const pdfDocument = await ensureInvoiceRecordPdfDocument(project, workspaceState, singleRecord);
        if (renderNonce !== activePdfRenderNonce) return;

        if (pdfDocument) {
            activePdfDocument = pdfDocument;
            if (canvas) canvas.hidden = false;
            if (pageLabel) pageLabel.textContent = 'PDF';
            if (activeLabel) activeLabel.textContent = singleRecord.fileName || singleRecord.invoice?.fileName || 'Factura';
            await renderPdfFirstPage(workspace, singleRecord.invoice || null);
            return;
        }

        renderInvoiceDocumentPreview(workspace, {
            fileName: singleRecord.fileName || singleRecord.invoice?.fileName || 'factura.pdf',
            invoice: singleRecord.invoice || null
        });
        return;
    }

    const gallery = document.createElement('div');
    gallery.className = 'project-invoice-thumbnail-gallery';
    gallery.dataset.projectInvoiceThumbnailGallery = '';
    const minSize = records.length <= 2 ? 280 : records.length <= 8 ? 190 : records.length <= 20 ? 140 : 104;
    gallery.style.setProperty('--invoice-thumb-min', `${minSize}px`);

    records.forEach((record, index) => {
        const summary = getInvoiceRecordSummary(record);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'project-invoice-thumb-card';
        card.addEventListener('click', () => {
            openInvoiceRecord(project, workspace, workspaceState, record.id).catch((error) => {
                console.warn('No se pudo abrir la factura:', error);
            });
        });

        const canvasThumb = document.createElement('canvas');
        canvasThumb.dataset.invoiceThumbnailCanvas = record.id;
        const label = document.createElement('span');
        label.textContent = summary.invoiceNumber && summary.invoiceNumber !== '-'
            ? summary.invoiceNumber
            : `Factura ${index + 1}`;
        const meta = document.createElement('small');
        meta.textContent = summary.total && summary.total !== '-' ? summary.total : summary.fileName;

        card.append(canvasThumb, label, meta);
        gallery.appendChild(card);
    });

    viewer.appendChild(gallery);

    for (const record of records) {
        if (renderNonce !== activePdfRenderNonce) return;
        if (!gallery.isConnected) return;
        const pdfDocument = await ensureInvoiceRecordPdfDocument(project, workspaceState, record);
        const canvasThumb = gallery.querySelector(`[data-invoice-thumbnail-canvas="${CSS.escape(record.id)}"]`);
        if (!canvasThumb) continue;
        if (!pdfDocument) {
            drawInvoiceDocumentThumbnail(canvasThumb, record, records.indexOf(record));
            continue;
        }

        try {
            const page = await pdfDocument.getPage(1);
            if (renderNonce !== activePdfRenderNonce) return;
            const baseViewport = page.getViewport({ scale: 1 });
            const cssWidth = Math.max(160, canvasThumb.getBoundingClientRect().width || minSize - 20);
            const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
            const viewport = page.getViewport({ scale: (cssWidth * pixelRatio) / Math.max(1, baseViewport.width) });
            const context = canvasThumb.getContext('2d', { alpha: false });
            canvasThumb.width = Math.ceil(viewport.width);
            canvasThumb.height = Math.ceil(viewport.height);
            canvasThumb.style.width = '100%';
            canvasThumb.style.height = 'auto';
            if (context) {
                context.imageSmoothingEnabled = true;
                context.imageSmoothingQuality = 'high';
            }
            await page.render({ canvasContext: context, viewport }).promise;
            if (renderNonce !== activePdfRenderNonce) return;
        } catch (_) {
            const context = canvasThumb.getContext('2d');
            canvasThumb.width = 220;
            canvasThumb.height = 280;
            context.fillStyle = '#eff6ff';
            context.fillRect(0, 0, 220, 280);
            context.fillStyle = '#2563eb';
            context.font = '700 22px sans-serif';
            context.fillText('PDF', 88, 148);
        }
    }
}

function renderInvoiceBatchList(workspace, project, workspaceState) {
    const invoiceView = workspace.querySelector('[data-project-invoice-view]');
    if (!invoiceView) return;

    const records = Array.isArray(workspaceState.invoices) ? workspaceState.invoices : [];
    invoiceView.replaceChildren();

    const shell = document.createElement('section');
    shell.className = 'project-invoice-batch';

    const hero = document.createElement('div');
    hero.className = 'project-invoice-batch-hero';
    const heroText = document.createElement('div');
    const kicker = document.createElement('small');
    kicker.textContent = 'Lote de facturas';
    const title = document.createElement('strong');
    title.textContent = `${records.length} facturas analizadas`;
    const subtitle = document.createElement('span');
    const totalLines = records.reduce((sum, record) => sum + Number(record.rows?.length || record.invoice?.lineItems?.length || 0), 0);
    subtitle.textContent = `${totalLines} lineas detectadas. Abre una factura para revisar sus campos y el PDF.`;
    heroText.append(kicker, title, subtitle);

    const actions = document.createElement('div');
    actions.className = 'project-invoice-batch-actions';
    const upload = document.createElement('button');
    upload.type = 'button';
    upload.textContent = 'Anadir factura';
    upload.addEventListener('click', () => {
        const input = workspace.querySelector('[data-project-pdf-input]');
        openInvoiceUploadChoice(workspace, workspaceState, input, { append: true });
    });
    actions.appendChild(upload);
    hero.append(heroText, actions);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'project-invoice-batch-table-wrap';
    const table = document.createElement('table');
    table.className = 'project-invoice-batch-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Factura</th><th>Idioma</th><th>Fecha</th><th>Vencimiento</th><th>Cliente</th><th>Emisor</th><th>Subtotal</th><th>IVA</th><th>Total</th><th>IBAN</th><th>Lineas de factura</th><th></th><th></th></tr>';
    const tbody = document.createElement('tbody');

    records.forEach((record) => {
        const summary = getInvoiceRecordSummary(record);
        const tr = document.createElement('tr');
        tr.className = 'project-invoice-summary-row';
        tr.tabIndex = 0;
        tr.dataset.invoiceRecordId = record.id;
        tr.addEventListener('click', () => {
            openInvoiceRecord(project, workspace, workspaceState, record.id).catch((error) => {
                console.warn('No se pudo abrir la factura:', error);
            });
        });
        tr.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openInvoiceRecord(project, workspace, workspaceState, record.id).catch((error) => {
                    console.warn('No se pudo abrir la factura:', error);
                });
            }
        });

    const titleCell = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = summary.invoiceNumber;
    titleCell.appendChild(strong);
    tr.appendChild(titleCell);

        const languageCell = document.createElement('td');
        languageCell.textContent = summary.language || '-';
        tr.appendChild(languageCell);

        const dateCell = document.createElement('td');
        dateCell.textContent = summary.date || '-';
        tr.appendChild(dateCell);

        const dueDateCell = document.createElement('td');
        dueDateCell.textContent = summary.dueDate || '-';
        tr.appendChild(dueDateCell);

        const customerCell = document.createElement('td');
        customerCell.textContent = summary.customer;
        tr.appendChild(customerCell);

        const supplierCell = document.createElement('td');
        supplierCell.textContent = summary.supplier;
        tr.appendChild(supplierCell);

        const subtotalCell = document.createElement('td');
        subtotalCell.className = 'project-invoice-money-cell';
        subtotalCell.textContent = summary.subtotal || '-';
        tr.appendChild(subtotalCell);

        const taxesCell = document.createElement('td');
        taxesCell.className = 'project-invoice-money-cell';
        taxesCell.textContent = summary.taxes || '-';
        tr.appendChild(taxesCell);

        const totalCell = document.createElement('td');
        totalCell.className = 'project-invoice-money-cell project-invoice-money-total';
        totalCell.textContent = summary.total || '-';
        tr.appendChild(totalCell);

        const ibanCell = document.createElement('td');
        ibanCell.className = 'project-invoice-iban-cell';
        ibanCell.textContent = summary.iban || '';
        tr.appendChild(ibanCell);

        const linesCell = document.createElement('td');
        linesCell.className = 'project-invoice-lines-cell';
        const lineToggle = document.createElement('button');
        lineToggle.type = 'button';
        lineToggle.className = 'project-invoice-lines-toggle';
        lineToggle.textContent = activeInvoiceExpandedIds.has(record.id) ? 'v' : '>';
        lineToggle.title = 'Ver lineas de factura';
        lineToggle.setAttribute('aria-expanded', activeInvoiceExpandedIds.has(record.id) ? 'true' : 'false');
        lineToggle.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleInvoiceLineDetails(project, workspace, workspaceState, tr, record, lineToggle).catch((error) => {
                console.warn('No se pudo abrir la revision de la factura:', error);
            });
        });
        const lineCount = document.createElement('strong');
        lineCount.textContent = String(summary.lines);
        linesCell.append(lineToggle, lineCount);
        tr.appendChild(linesCell);

        const actionCell = document.createElement('td');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Abrir';
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            openInvoiceRecord(project, workspace, workspaceState, record.id).catch((error) => {
                console.warn('No se pudo abrir la factura:', error);
            });
        });
        actionCell.appendChild(button);
        tr.appendChild(actionCell);

        const deleteCell = document.createElement('td');
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'project-invoice-delete';
        deleteButton.textContent = 'Eliminar';
        deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            deleteInvoiceRecord(project, workspace, workspaceState, record.id);
        });
        deleteCell.appendChild(deleteButton);
        tr.appendChild(deleteCell);
        const responsiveLabels = [
            'Factura', 'Idioma', 'Fecha', 'Vencimiento', 'Cliente', 'Emisor',
            'Subtotal', 'IVA', 'Total', 'IBAN', 'Lineas', 'Accion', 'Eliminar'
        ];
        [...tr.children].forEach((cell, index) => {
            cell.dataset.label = responsiveLabels[index] || '';
        });
        tbody.appendChild(tr);

        if (activeInvoiceExpandedIds.has(record.id)) {
            const detailRow = document.createElement('tr');
            detailRow.className = 'project-invoice-lines-detail-row';
            const detailCell = document.createElement('td');
            detailCell.colSpan = 13;
            detailCell.appendChild(createInvoiceLinesPanel(record));
            detailRow.appendChild(detailCell);
            tbody.appendChild(detailRow);
        }
    });

    table.append(thead, tbody);
    tableWrap.appendChild(table);
    shell.append(hero, tableWrap);
    invoiceView.appendChild(shell);
    renderInvoiceBatchPdfGallery(workspace, project, workspaceState, records).catch((error) => {
        console.warn('No se pudo renderizar la galeria de facturas:', error);
    });
}

function splitPartNumberFromDesignation(row) {
    const designation = safeText(row.designation);
    if (!designation) return false;

    const match = designation.match(/^([A-Z]?\d[\dA-Z./-]{4,})\s+(.+)$/i);
    if (!match) return false;

    if (!safeText(row.partNo)) row.partNo = match[1];
    row.designation = match[2];
    row.edited = true;
    return true;
}

function splitDynamicMergedCell(row, workspaceState) {
    const columns = Array.isArray(workspaceState.columns) ? workspaceState.columns : [];
    if (!columns.length || !row?.cells) return false;

    for (let index = 0; index < columns.length - 1; index += 1) {
        const column = columns[index];
        const nextColumn = columns[index + 1];
        const value = safeText(row.cells[column.key]);
        if (!value || safeText(row.cells[nextColumn.key])) continue;

        const match = value.match(/^([A-Z]?\d[\dA-Z./-]{4,})\s+(.+)$/i);
        if (!match) continue;

        row.cells[column.key] = match[1];
        row.cells[nextColumn.key] = match[2];
        row.edited = true;
        return true;
    }

    return false;
}

function splitRowMergedValues(row, workspaceState) {
    return splitDynamicMergedCell(row, workspaceState) || splitPartNumberFromDesignation(row);
}

function renderWorkspace(workspace, project, workspaceState) {
    workspace.querySelector('.project-invoice-header-back')?.remove();
    const body = workspace.querySelector('[data-project-import-body]');
    const typeScreen = workspace.querySelector('[data-project-type-screen]');
    const startScreen = workspace.querySelector('[data-project-start-screen]');
    const summary = workspace.querySelector('.project-workspace-grid');
    const importPanel = workspace.querySelector('.project-import-panel');
    const tableWrap = workspace.querySelector('[data-project-import-table-wrap]');
    const invoiceView = workspace.querySelector('[data-project-invoice-view]');
    const empty = workspace.querySelector('[data-project-import-empty]');
    const fileName = workspace.querySelector('[data-project-pdf-name]');
    const totalRows = workspace.querySelector('[data-project-total-rows]');
    const pnRows = workspace.querySelector('[data-project-pn-rows]');
    const pages = workspace.querySelector('[data-project-pages]');
    const editedRows = workspace.querySelector('[data-project-edited-rows]');
    const exportJson = document.querySelector('[data-project-export-json]');
    const exportCsv = document.querySelector('[data-project-export-csv]');
    const wordpressButton = document.querySelector('[data-project-wordpress-button]');
    const changeTypeButton = document.querySelector('[data-project-change-type-button]');
    const customerButton = getCustomerNodes(workspace).button;
    const analysisButton = getAnalysisNodes(workspace).button;
    const rows = workspaceState.rows || [];
    const documentType = workspaceState.documentType || '';
    const isInvoice = documentType === 'invoices';
    const isProduct = documentType === 'products';
    const invoiceRecords = Array.isArray(workspaceState.invoices) ? workspaceState.invoices : [];
    const isInvoiceBatchList = isInvoice && invoiceRecords.length && !workspaceState.invoice;
    const hasDocument = hasWorkspaceDocument(workspaceState);
    const hasType = Boolean(documentType);

    if (fileName) fileName.textContent = workspaceState.fileName || 'Sin documento cargado';
    if (totalRows) totalRows.textContent = String(isInvoiceBatchList ? invoiceRecords.length : rows.length);
    if (pnRows) pnRows.textContent = String(rows.filter((row) => hasPartNumberValue(row, workspaceState)).length);
    if (pages) pages.textContent = String(workspaceState.pageCount || new Set(rows.map((row) => row.page)).size || 0);
    if (editedRows) editedRows.textContent = String(rows.filter((row) => row.edited).length);
    if (wordpressButton) wordpressButton.hidden = !isProduct;
    if (changeTypeButton) changeTypeButton.hidden = !hasType;
    if (customerButton && !isProduct) customerButton.hidden = true;
    if (analysisButton && !isProduct) analysisButton.hidden = true;
    if (exportJson) {
        exportJson.hidden = !isProduct;
        exportJson.disabled = !hasDocument || !isProduct;
    }
    if (exportCsv) {
        exportCsv.disabled = !hasDocument;
        exportCsv.textContent = isInvoice ? 'Exportar Excel' : 'Exportar CSV';
    }
    syncSaveFileButton(workspaceState);
    syncTopbarUploadAction(workspace);
    const uploadButton = document.querySelector('[data-project-pdf-button]');
    const customersOpen = !getCustomerNodes(workspace).page?.hidden;
    const analysisOpen = !getAnalysisNodes(workspace).page?.hidden;
    if (uploadButton && !customersOpen && !analysisOpen) {
        uploadButton.textContent = isInvoice ? 'Subir facturas' : 'Subir archivo';
    }

    workspace.classList.toggle('is-workspace-active', hasDocument);
    if (typeScreen) typeScreen.hidden = hasType;
    if (startScreen) startScreen.hidden = !hasType || hasDocument;
    if (summary) summary.hidden = !hasDocument || isInvoice;
    if (importPanel) importPanel.hidden = !hasDocument;
    if (!hasType) {
        stopSplashScene();
    } else if (!hasDocument) {
        startSplashScene(workspace);
    } else {
        stopSplashScene();
    }
    if (empty) empty.hidden = true;
    if (tableWrap) tableWrap.hidden = !hasDocument || isInvoice;
    if (invoiceView) invoiceView.hidden = !hasDocument || !isInvoice;

    if (!hasType || !hasDocument) return;

    if (isInvoice) {
        if (isInvoiceBatchList) {
            renderInvoiceBatchList(workspace, project, workspaceState);
            return;
        }
        renderInvoiceView(workspace, workspaceState);
        if (activePdfDocument) renderPdfFirstPage(workspace, workspaceState.invoice);
        else renderInvoiceDocumentPreview(workspace, workspaceState);
        return;
    }

    if (isProduct) {
        clearInvoiceViewerState(workspace);
    }

    if (!body) return;

    renderTableHead(workspace, workspaceState);
    body.replaceChildren();

    const activeColumns = getActiveColumns(workspaceState);
    rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        tr.dataset.projectRowIndex = String(rowIndex);
        tr.addEventListener('click', () => setActiveTableRow(workspace, rowIndex, workspaceState));
        activeColumns.forEach((column) => {
            const td = document.createElement('td');
            if (column.key === 'actions') {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'project-row-tool';
                button.textContent = 'Separar';
                button.title = 'Separar part number y descripcion si vienen unidos';
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    if (!splitRowMergedValues(row, workspaceState)) return;
                    saveWorkspace(project, workspaceState);
                    renderWorkspace(workspace, project, workspaceState);
                    setActiveTableRow(workspace, rowIndex, workspaceState);
                });
                td.appendChild(button);
            } else if (column.wordpress) {
                td.dataset.projectWordpressRowIndex = String(rowIndex);
                td.appendChild(renderWordPressMatch(row));
            } else if (column.readonly) {
                td.textContent = getRowValue(row, column);
            } else {
                const input = document.createElement(column.key === 'status' ? 'select' : 'input');
                input.dataset.rowIndex = String(rowIndex);
                input.dataset.columnKey = column.key;

                if (column.key === 'status') {
                    ['Pendiente', 'Revisado', 'Error'].forEach((optionValue) => {
                        const option = document.createElement('option');
                        option.value = optionValue;
                        option.textContent = optionValue;
                        input.appendChild(option);
                    });
                }

                input.value = getRowValue(row, column);
                input.addEventListener('change', () => {
                    const targetRow = workspaceState.rows[Number(input.dataset.rowIndex)];
                    if (!targetRow) return;
                    const previousPartNumber = getRowPartNumber(targetRow, workspaceState);
                    setRowValue(targetRow, column, input.value);
                    const nextPartNumber = getRowPartNumber(targetRow, workspaceState);
                    if (isPartNumberColumn(column, workspaceState) && previousPartNumber !== nextPartNumber) {
                        targetRow.wordpressMatch = null;
                    }
                    targetRow.edited = true;
                    saveWorkspace(project, workspaceState);
                    renderWorkspace(workspace, project, workspaceState);
                    if (isPartNumberColumn(column, workspaceState)) {
                        scheduleWordPressAutoCheck(project, workspace, workspaceState);
                    }
                });
                td.appendChild(input);
            }

            tr.appendChild(td);
        });
        body.appendChild(tr);
    });

    if (rows.length) setActiveTableRow(workspace, 0, workspaceState);
}

function getWordPressNodes(workspace) {
    return {
        button: document.querySelector('[data-project-wordpress-button]'),
        modal: workspace.querySelector('[data-project-wordpress-modal]'),
        form: workspace.querySelector('[data-project-wordpress-form]'),
        close: workspace.querySelector('[data-project-wordpress-close]'),
        status: workspace.querySelector('[data-project-wordpress-status]'),
        site: workspace.querySelector('[data-project-wordpress-site]'),
        username: workspace.querySelector('[data-project-wordpress-user]'),
        password: workspace.querySelector('[data-project-wordpress-password]'),
        login: workspace.querySelector('[data-project-wordpress-login]'),
        connect: workspace.querySelector('[data-project-wordpress-connect]'),
        check: workspace.querySelector('[data-project-wordpress-check]'),
        sites: workspace.querySelector('[data-project-wordpress-sites]')
    };
}

function getSavedWorkspaceNodes(workspace) {
    return {
        saveButton: document.querySelector('[data-project-save-file-button]'),
        listButton: document.querySelector('[data-project-saved-files-button]'),
        saveModal: workspace.querySelector('[data-project-save-modal]'),
        saveClose: workspace.querySelector('[data-project-save-close]'),
        modal: workspace.querySelector('[data-project-saved-modal]'),
        close: workspace.querySelector('[data-project-saved-close]'),
        form: workspace.querySelector('[data-project-saved-form]'),
        name: workspace.querySelector('[data-project-saved-name]'),
        submit: workspace.querySelector('[data-project-saved-submit]'),
        saveStatus: workspace.querySelector('[data-project-save-status]'),
        status: workspace.querySelector('[data-project-saved-status]'),
        list: workspace.querySelector('[data-project-saved-list]')
    };
}

function setSavedWorkspaceStatus(workspace, message, isError = false) {
    const { status } = getSavedWorkspaceNodes(workspace);
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(isError));
}

function closeSavedWorkspaceModal(workspace) {
    const { modal } = getSavedWorkspaceNodes(workspace);
    if (modal) modal.hidden = true;
}

function setSaveWorkspaceStatus(workspace, message, isError = false) {
    const { saveStatus } = getSavedWorkspaceNodes(workspace);
    if (!saveStatus) return;
    saveStatus.textContent = message;
    saveStatus.classList.toggle('is-error', Boolean(isError));
}

function openSaveWorkspaceModal(workspace) {
    const nodes = getSavedWorkspaceNodes(workspace);
    if (!nodes.saveModal) return;
    nodes.saveModal.hidden = false;
    setSaveWorkspaceStatus(workspace, 'Elige un nombre para guardar este documento.');
    requestAnimationFrame(() => nodes.name?.focus());
}

function closeSaveWorkspaceModal(workspace) {
    const { saveModal } = getSavedWorkspaceNodes(workspace);
    if (saveModal) saveModal.hidden = true;
}

function renderSavedWorkspaceList(workspace, project, workspaceState, files) {
    const { list } = getSavedWorkspaceNodes(workspace);
    if (!list) return;

    const documentType = workspaceState?.documentType || '';
    const typeLabel = documentType === 'invoices' ? 'facturas' : 'productos';

    list.replaceChildren();
    if (!files.length) {
        const empty = document.createElement('div');
        empty.className = 'project-saved-empty';
        empty.textContent = `Todavia no hay guardados de ${typeLabel} en este proyecto.`;
        list.appendChild(empty);
        return;
    }

    files.forEach((file) => {
        const card = document.createElement('article');
        card.className = 'project-saved-card';

        const icon = document.createElement('span');
        icon.className = 'project-saved-card-icon';
        icon.textContent = file.documentType === 'invoices' ? 'FAC' : 'PDF';

        const body = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = file.name || 'Guardado sin nombre';
        const meta = document.createElement('small');
        const date = file.updatedAt || file.createdAt ? new Date(file.updatedAt || file.createdAt).toLocaleString('es-ES') : 'Sin fecha';
        if (file.documentType === 'invoices') {
            const invoiceCount = Number(file.invoiceCount || 0);
            const invoiceLabel = invoiceCount === 1 ? '1 factura guardada' : `${invoiceCount} facturas guardadas`;
            meta.textContent = `${invoiceLabel} - ${date}`;
        } else {
            meta.textContent = `${file.fileName || 'Documento'} - ${Number(file.rows || 0)} filas - ${date}`;
        }
        body.append(name, meta);

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Abrir';
        button.addEventListener('click', async () => {
            try {
                button.disabled = true;
                setSavedWorkspaceStatus(workspace, `Abriendo ${file.name || 'guardado'}...`);
                const restored = await restoreSavedWorkspace(project, file.id);
                replaceWorkspaceState(workspaceState, restored);
                activePdfDocument = null;
                clearPdfViewer(workspace, 'Cargando guardado...');
                if (workspaceState.documentType === 'invoices' && Array.isArray(workspaceState.invoices) && workspaceState.invoices.length) {
                    workspaceState.invoice = null;
                    workspaceState.rows = [];
                    workspaceState.columns = [];
                    workspaceState.headerLabels = {};
                    workspaceState.activeInvoiceId = '';
                    workspaceState.fileName = `${workspaceState.invoices.length} facturas importadas`;
                    workspaceState.pageCount = workspaceState.invoices.reduce((sum, record) => sum + Number(record.pageCount || 0), 0);
                    await loadSavedInvoiceBatchPdfs(project, file.id, workspaceState);
                } else {
                    activeInvoicePdfDocuments = new Map();
                    activeInvoicePdfFiles = new Map();
                    clearDocumentPreview(workspace);
                    workspace.querySelector('[data-project-invoice-thumbnail-gallery]')?.remove();
                    clearInvoiceViewerState(workspace);
                    workspaceState.invoice = null;
                    workspaceState.invoices = [];
                    workspaceState.activeInvoiceId = '';
                    await loadSavedProjectPdf(project, workspace, workspaceState);
                }
                renderWorkspace(workspace, project, workspaceState);
                syncWordPressUi(workspace, workspaceState);
                scheduleWordPressAutoCheck(project, workspace, workspaceState);
                closeSavedWorkspaceModal(workspace);
            } catch (error) {
                setSavedWorkspaceStatus(workspace, `No se pudo abrir: ${String(error?.message || error)}`, true);
            } finally {
                button.disabled = false;
            }
        });

        card.append(icon, body, button);
        list.appendChild(card);
    });
}

async function refreshSavedWorkspaceList(project, workspace, workspaceState) {
    const documentType = workspaceState?.documentType || '';
    const typeLabel = documentType === 'invoices' ? 'facturas' : 'productos';
    setSavedWorkspaceStatus(workspace, `Cargando guardados de ${typeLabel}...`);
    const files = await listSavedWorkspaces(project, documentType);
    renderSavedWorkspaceList(workspace, project, workspaceState, files);
    setSavedWorkspaceStatus(workspace, files.length ? `${files.length} guardados de ${typeLabel} disponibles.` : `No hay guardados de ${typeLabel} todavia.`);
}

async function openSavedWorkspaceModal(project, workspace, workspaceState) {
    const nodes = getSavedWorkspaceNodes(workspace);
    if (!nodes.modal) return;
    nodes.modal.hidden = false;

    if (!workspaceState?.documentType) {
        renderSavedWorkspaceList(workspace, project, workspaceState, []);
        setSavedWorkspaceStatus(workspace, 'Elige primero si quieres trabajar con productos o facturas.', true);
        return;
    }

    try {
        await refreshSavedWorkspaceList(project, workspace, workspaceState);
    } catch (error) {
        setSavedWorkspaceStatus(workspace, `No se pudo cargar la lista: ${String(error?.message || error)}`, true);
    }
}

async function saveWorkspaceSnapshotFromModal(project, workspace, workspaceState) {
    const nodes = getSavedWorkspaceNodes(workspace);
    const name = safeText(nodes.name?.value);
    if (!name) {
        setSaveWorkspaceStatus(workspace, 'Pon un nombre para guardar este archivo.', true);
        nodes.name?.focus();
        return;
    }
    if (!hasWorkspaceDocument(workspaceState)) {
        setSaveWorkspaceStatus(workspace, 'Primero sube un documento y extrae su contenido.', true);
        return;
    }

    try {
        if (nodes.submit) nodes.submit.disabled = true;
        setSaveWorkspaceStatus(workspace, 'Guardando archivo...');
        await saveSavedWorkspace(project, workspaceState, name);
        if (nodes.name) nodes.name.value = '';
        closeSaveWorkspaceModal(workspace);
        if (nodes.modal && !nodes.modal.hidden) {
            await refreshSavedWorkspaceList(project, workspace, workspaceState);
        }
    } catch (error) {
        setSaveWorkspaceStatus(workspace, `No se pudo guardar: ${String(error?.message || error)}`, true);
    } finally {
        if (nodes.submit) nodes.submit.disabled = false;
    }
}

function getCustomerNodes(workspace) {
    return {
        button: document.querySelector('[data-project-customers-button]'),
        page: workspace.querySelector('[data-project-customers-modal]'),
        close: workspace.querySelector('[data-project-customers-close]'),
        title: workspace.querySelector('[data-project-customers-title]'),
        status: workspace.querySelector('[data-project-customers-status]'),
        search: workspace.querySelector('[data-project-customers-search]'),
        exportButton: workspace.querySelector('[data-project-customers-export]'),
        body: workspace.querySelector('[data-project-customers-body]')
    };
}

function getAnalysisNodes(workspace) {
    return {
        button: document.querySelector('[data-project-analysis-button]'),
        page: workspace.querySelector('[data-project-analysis-page]'),
        close: workspace.querySelector('[data-project-analysis-close]'),
        title: workspace.querySelector('[data-project-analysis-title]'),
        status: workspace.querySelector('[data-project-analysis-status]'),
        summaryStatus: workspace.querySelector('[data-project-analysis-summary-status]'),
        summaryForm: workspace.querySelector('[data-project-analysis-summary-form]'),
        calendarToggle: workspace.querySelector('[data-project-analysis-calendar-toggle]'),
        rangeLabel: workspace.querySelector('[data-project-analysis-range-label]'),
        rangeMenu: workspace.querySelector('[data-project-analysis-range-menu]'),
        customRange: workspace.querySelector('[data-project-analysis-custom-range]'),
        presetButtons: [...workspace.querySelectorAll('[data-project-analysis-preset]')],
        start: workspace.querySelector('[data-project-analysis-start]'),
        end: workspace.querySelector('[data-project-analysis-end]'),
        errorModal: workspace.querySelector('[data-project-analysis-error-modal]'),
        errorMessage: workspace.querySelector('[data-project-analysis-error-message]'),
        errorClose: workspace.querySelector('[data-project-analysis-error-close]'),
        sales: workspace.querySelector('[data-project-analysis-sales]'),
        orders: workspace.querySelector('[data-project-analysis-orders]'),
        productsSold: workspace.querySelector('[data-project-analysis-products-sold]'),
        salesChart: workspace.querySelector('[data-project-analysis-sales-chart]'),
        ordersChart: workspace.querySelector('[data-project-analysis-orders-chart]'),
        visitsChart: workspace.querySelector('[data-project-analysis-visits-chart]'),
        productsBody: workspace.querySelector('[data-project-analysis-products-body]'),
        productsStatus: workspace.querySelector('[data-project-analysis-products-status]'),
        productsForm: workspace.querySelector('[data-project-analysis-products-form]'),
        productsCalendarToggle: workspace.querySelector('[data-project-analysis-products-calendar-toggle]'),
        productsRangeLabel: workspace.querySelector('[data-project-analysis-products-range-label]'),
        productsRangeMenu: workspace.querySelector('[data-project-analysis-products-range-menu]'),
        productsCustomRange: workspace.querySelector('[data-project-analysis-products-custom-range]'),
        productsPresetButtons: [...workspace.querySelectorAll('[data-project-analysis-products-preset]')],
        productsStart: workspace.querySelector('[data-project-analysis-products-start]'),
        productsEnd: workspace.querySelector('[data-project-analysis-products-end]'),
        productsChart: workspace.querySelector('[data-project-analysis-products-chart]'),
        productsTableBody: workspace.querySelector('[data-project-analysis-products-table-body]'),
        productsTotal: workspace.querySelector('[data-project-analysis-products-total]'),
        productsLeader: workspace.querySelector('[data-project-analysis-products-leader]'),
        productsShare: workspace.querySelector('[data-project-analysis-products-share]'),
        revenueStatus: workspace.querySelector('[data-project-analysis-revenue-status]'),
        revenueForm: workspace.querySelector('[data-project-analysis-revenue-form]'),
        revenueCalendarToggle: workspace.querySelector('[data-project-analysis-revenue-calendar-toggle]'),
        revenueRangeLabel: workspace.querySelector('[data-project-analysis-revenue-range-label]'),
        revenueRangeMenu: workspace.querySelector('[data-project-analysis-revenue-range-menu]'),
        revenueCustomRange: workspace.querySelector('[data-project-analysis-revenue-custom-range]'),
        revenuePresetButtons: [...workspace.querySelectorAll('[data-project-analysis-revenue-preset]')],
        revenueStart: workspace.querySelector('[data-project-analysis-revenue-start]'),
        revenueEnd: workspace.querySelector('[data-project-analysis-revenue-end]'),
        revenueNet: workspace.querySelector('[data-project-analysis-revenue-net]'),
        revenueOrders: workspace.querySelector('[data-project-analysis-revenue-orders]'),
        revenueAverage: workspace.querySelector('[data-project-analysis-revenue-average]'),
        revenueTaxes: workspace.querySelector('[data-project-analysis-revenue-taxes]'),
        revenueShipping: workspace.querySelector('[data-project-analysis-revenue-shipping]'),
        revenueCoupons: workspace.querySelector('[data-project-analysis-revenue-coupons]'),
        revenueChart: workspace.querySelector('[data-project-analysis-revenue-chart]'),
        revenueBestDay: workspace.querySelector('[data-project-analysis-revenue-best-day]'),
        revenueActiveDays: workspace.querySelector('[data-project-analysis-revenue-active-days]'),
        revenueIntensity: workspace.querySelector('[data-project-analysis-revenue-intensity]'),
        revenueTableBody: workspace.querySelector('[data-project-analysis-revenue-table-body]'),
        ordersStatus: workspace.querySelector('[data-project-analysis-orders-status]'),
        ordersForm: workspace.querySelector('[data-project-analysis-orders-form]'),
        ordersCalendarToggle: workspace.querySelector('[data-project-analysis-orders-calendar-toggle]'),
        ordersRangeLabel: workspace.querySelector('[data-project-analysis-orders-range-label]'),
        ordersRangeMenu: workspace.querySelector('[data-project-analysis-orders-range-menu]'),
        ordersCustomRange: workspace.querySelector('[data-project-analysis-orders-custom-range]'),
        ordersPresetButtons: [...workspace.querySelectorAll('[data-project-analysis-orders-preset]')],
        ordersStart: workspace.querySelector('[data-project-analysis-orders-start]'),
        ordersEnd: workspace.querySelector('[data-project-analysis-orders-end]'),
        ordersTotal: workspace.querySelector('[data-project-analysis-orders-total]'),
        ordersNet: workspace.querySelector('[data-project-analysis-orders-net]'),
        ordersAverage: workspace.querySelector('[data-project-analysis-orders-average]'),
        ordersItemsAverage: workspace.querySelector('[data-project-analysis-orders-items-average]'),
        ordersPageChart: workspace.querySelector('[data-project-analysis-orders-page-chart]'),
        ordersTableBody: workspace.querySelector('[data-project-analysis-orders-table-body]'),
        visitsStatus: workspace.querySelector('[data-project-analysis-visits-status]'),
        visitsForm: workspace.querySelector('[data-project-analysis-visits-form]'),
        visitsCalendarToggle: workspace.querySelector('[data-project-analysis-visits-calendar-toggle]'),
        visitsRangeLabel: workspace.querySelector('[data-project-analysis-visits-range-label]'),
        visitsRangeMenu: workspace.querySelector('[data-project-analysis-visits-range-menu]'),
        visitsCustomRange: workspace.querySelector('[data-project-analysis-visits-custom-range]'),
        visitsPresetButtons: [...workspace.querySelectorAll('[data-project-analysis-visits-preset]')],
        visitsStart: workspace.querySelector('[data-project-analysis-visits-start]'),
        visitsEnd: workspace.querySelector('[data-project-analysis-visits-end]'),
        visitsTotal: workspace.querySelector('[data-project-analysis-visits-total]'),
        visitsAverage: workspace.querySelector('[data-project-analysis-visits-average]'),
        visitsFps: workspace.querySelector('[data-project-analysis-visits-fps]'),
        visitsLoad: workspace.querySelector('[data-project-analysis-visits-load]'),
        visitsPageChart: workspace.querySelector('[data-project-analysis-visits-page-chart]'),
        visitsPerformance: workspace.querySelector('[data-project-analysis-visits-performance]'),
        visitsHealth: workspace.querySelector('[data-project-analysis-visits-health]'),
        visitsMap: workspace.querySelector('[data-project-analysis-visits-map]'),
        visitsMapSvg: workspace.querySelector('[data-project-analysis-visits-map-svg]'),
        visitsMapLegend: workspace.querySelector('[data-project-analysis-visits-map-legend]'),
        visitsCountryBody: workspace.querySelector('[data-project-analysis-visits-country-body]'),
        seoStatus: workspace.querySelector('[data-project-analysis-seo-status]'),
        seoRefresh: workspace.querySelector('[data-project-analysis-seo-refresh]'),
        seoScore: workspace.querySelector('[data-project-analysis-seo-score]'),
        seoGood: workspace.querySelector('[data-project-analysis-seo-good]'),
        seoWarning: workspace.querySelector('[data-project-analysis-seo-warning]'),
        seoCritical: workspace.querySelector('[data-project-analysis-seo-critical]'),
        seoTotal: workspace.querySelector('[data-project-analysis-seo-total]'),
        seoPriorities: workspace.querySelector('[data-project-analysis-seo-priorities]'),
        seoHealth: workspace.querySelector('[data-project-analysis-seo-health]'),
        seoSearch: workspace.querySelector('[data-project-analysis-seo-search]'),
        seoTableBody: workspace.querySelector('[data-project-analysis-seo-table-body]'),
        seoModal: workspace.querySelector('[data-project-analysis-seo-modal]'),
        seoForm: workspace.querySelector('[data-project-analysis-seo-form]'),
        seoModalClose: workspace.querySelector('[data-project-analysis-seo-modal-close]'),
        seoModalStatus: workspace.querySelector('[data-project-analysis-seo-modal-status]'),
        seoModalTitle: workspace.querySelector('[data-project-analysis-seo-modal-title]'),
        seoBeforeScore: workspace.querySelector('[data-project-analysis-seo-before-score]'),
        seoAfterScore: workspace.querySelector('[data-project-analysis-seo-after-score]'),
        seoDeltaScore: workspace.querySelector('[data-project-analysis-seo-delta-score]'),
        seoFields: [...workspace.querySelectorAll('[data-project-analysis-seo-field]')],
        seoCounts: [...workspace.querySelectorAll('[data-project-analysis-seo-count]')],
        seoEditorIssues: workspace.querySelector('[data-project-analysis-seo-editor-issues]'),
        seoEditorLink: workspace.querySelector('[data-project-analysis-seo-editor-link]'),
        seoSave: workspace.querySelector('[data-project-analysis-seo-save]'),
        orderModal: workspace.querySelector('[data-project-analysis-order-modal]'),
        orderModalClose: workspace.querySelector('[data-project-analysis-order-modal-close]'),
        orderModalStatus: workspace.querySelector('[data-project-analysis-order-modal-status]'),
        orderModalTitle: workspace.querySelector('[data-project-analysis-order-modal-title]'),
        orderModalSummary: workspace.querySelector('[data-project-analysis-order-modal-summary]'),
        orderModalItems: workspace.querySelector('[data-project-analysis-order-modal-items]'),
        tabs: [...workspace.querySelectorAll('[data-project-analysis-tab]')],
        panels: [...workspace.querySelectorAll('[data-project-analysis-panel]')]
    };
}

function setWordPressStatus(workspace, message, isError = false) {
    const { status } = getWordPressNodes(workspace);
    if (!status) return;

    status.textContent = message;
    status.classList.toggle('is-error', Boolean(isError));
}

function syncWordPressUi(workspace, workspaceState) {
    const nodes = getWordPressNodes(workspace);
    const connection = activeWordPressConnection;
    const rowCount = (workspaceState.rows || []).filter((row) => hasPartNumberValue(row, workspaceState)).length;
    const isProduct = workspaceState.documentType === 'products';

    if (!isProduct) {
        if (nodes.button) nodes.button.hidden = true;
        const customerButton = getCustomerNodes(workspace).button;
        const analysisButton = getAnalysisNodes(workspace).button;
        if (customerButton) customerButton.hidden = true;
        if (analysisButton) analysisButton.hidden = true;
        return;
    }

    if (nodes.button) {
        nodes.button.hidden = false;
        nodes.button.textContent = connection ? 'WordPress conectado' : 'Conectar WordPress';
    }

    const customerButton = getCustomerNodes(workspace).button;
    if (customerButton) {
        customerButton.hidden = !connection;
    }

    const analysisButton = getAnalysisNodes(workspace).button;
    if (analysisButton) {
        analysisButton.hidden = !connection;
    }

    if (nodes.site && connection?.siteUrl) nodes.site.value = connection.siteUrl;
    if (nodes.username && connection?.username) nodes.username.value = connection.username;
    if (nodes.check) nodes.check.disabled = !connection || rowCount === 0;
    renderWordPressSites(workspace, workspaceState);

    if (connection) {
        const checkedText = connection.lastCheckedAt ? ' Ultima comprobacion guardada.' : '';
        setWordPressStatus(workspace, `Conectado a ${connection.siteName || connection.siteUrl}.${checkedText}`);
    } else if (availableWordPressSites.length) {
        setWordPressStatus(workspace, 'Elige el sitio de WordPress que quieres conectar.');
    } else {
        setWordPressStatus(workspace, 'Entra con WordPress.com para ver tus sitios y conectar uno.');
    }
}

function customerMatchesSearch(customer, query) {
    if (!query) return true;
    const haystack = [
        customer.name,
        customer.username,
        customer.email,
        customer.country,
        customer.city,
        customer.region,
        customer.postcode
    ].map((value) => safeText(value).toLowerCase()).join(' ');

    return haystack.includes(query.toLowerCase());
}

function renderCustomersTable(workspace) {
    const nodes = getCustomerNodes(workspace);
    if (!nodes.body) return;

    const query = safeText(nodes.search?.value);
    const customers = activeWordPressCustomers.filter((customer) => customerMatchesSearch(customer, query));
    nodes.body.replaceChildren();

    customers.forEach((customer) => {
        const tr = document.createElement('tr');
        const values = [
            customer.name,
            customer.username,
            customer.orderCount,
            formatCustomerDate(customer.lastActivity),
            formatCustomerDate(customer.registeredAt),
            customer.email,
            formatCurrency(customer.totalSpent),
            formatCurrency(customer.averageOrderValue),
            customer.country,
            customer.city,
            customer.region,
            customer.postcode
        ];

        values.forEach((value, index) => {
            const td = document.createElement('td');
            if (index === 0) {
                const strong = document.createElement('strong');
                strong.textContent = value || '-';
                td.appendChild(strong);
            } else {
                td.textContent = value || '-';
            }
            tr.appendChild(td);
        });

        nodes.body.appendChild(tr);
    });

    if (nodes.status) {
        nodes.status.textContent = `${customers.length} clientes visibles de ${activeWordPressCustomers.length}.`;
    }
}

function syncTopbarUploadAction(workspace) {
    const button = document.querySelector('[data-project-pdf-button]');
    if (!button) return;

    const customersOpen = !getCustomerNodes(workspace).page?.hidden;
    const analysisOpen = !getAnalysisNodes(workspace).page?.hidden;
    button.textContent = customersOpen || analysisOpen ? 'Inicio' : 'Subir archivo';
}

function closeInvoiceUploadChoice(workspace) {
    workspace?.querySelector('[data-project-invoice-upload-choice]')?.remove();
}

function openInvoiceUploadChoice(workspace, workspaceState, input, options = {}) {
    if (!input) return;

    closeInvoiceUploadChoice(workspace);
    const uploadMode = options.append ? 'append' : 'replace';

    const overlay = document.createElement('section');
    overlay.className = 'project-invoice-upload-choice';
    overlay.dataset.projectInvoiceUploadChoice = '';

    const dialog = document.createElement('div');
    dialog.className = 'project-invoice-upload-choice-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const kicker = document.createElement('small');
    kicker.textContent = 'Importar facturas';
    const title = document.createElement('strong');
    title.textContent = options.append ? 'Anade facturas al lote actual' : 'Elige como quieres subirlas';
    const copy = document.createElement('p');
    copy.textContent = options.append
        ? 'Las nuevas facturas se sumaran a las que ya tienes en pantalla.'
        : 'Puedes seleccionar una factura, varios archivos a la vez o una carpeta completa.';

    const actions = document.createElement('div');
    actions.className = 'project-invoice-upload-choice-actions';

    const filesButton = document.createElement('button');
    filesButton.type = 'button';
    filesButton.textContent = 'Seleccionar archivo(s)';
    filesButton.addEventListener('click', () => {
        closeInvoiceUploadChoice(workspace);
        preparePdfInputForDocumentType(input, workspaceState, 'files', uploadMode);
        input.click();
    });

    const folderButton = document.createElement('button');
    folderButton.type = 'button';
    folderButton.textContent = 'Seleccionar carpeta';
    folderButton.addEventListener('click', () => {
        closeInvoiceUploadChoice(workspace);
        preparePdfInputForDocumentType(input, workspaceState, 'folder', uploadMode);
        input.click();
    });

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancelar';
    cancelButton.addEventListener('click', () => closeInvoiceUploadChoice(workspace));

    actions.append(filesButton, folderButton, cancelButton);
    dialog.append(kicker, title, copy, actions);
    overlay.appendChild(dialog);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeInvoiceUploadChoice(workspace);
    });
    workspace.appendChild(overlay);
}

function preparePdfInputForDocumentType(input, workspaceState, mode = 'files', uploadMode = 'replace') {
    if (!input) return;

    input.accept = 'application/pdf,.pdf,.xlsx,.xls,.csv,.docx,.doc';
    if (workspaceState?.documentType === 'invoices') {
        input.multiple = true;
        input.dataset.invoiceUploadMode = uploadMode === 'append' ? 'append' : 'replace';
        if (mode === 'folder') {
            input.setAttribute('webkitdirectory', '');
            input.setAttribute('directory', '');
            input.title = 'Selecciona una carpeta con facturas';
        } else {
            input.removeAttribute('webkitdirectory');
            input.removeAttribute('directory');
            input.title = 'Selecciona una o varias facturas';
        }
        return;
    }

    input.multiple = false;
    delete input.dataset.invoiceUploadMode;
    input.removeAttribute('webkitdirectory');
    input.removeAttribute('directory');
    input.title = 'Selecciona PDF, Excel, CSV o Word. Word y Excel se convertiran a PDF antes de analizarse.';
}

function showProjectHome(project, workspace, workspaceState) {
    const customerPage = getCustomerNodes(workspace).page;
    const analysisPage = getAnalysisNodes(workspace).page;

    if (customerPage) customerPage.hidden = true;
    if (analysisPage) analysisPage.hidden = true;
    const hero = workspace.querySelector('.project-workspace-hero');
    if (hero) hero.hidden = false;
    renderWorkspace(workspace, project, workspaceState);
    syncTopbarUploadAction(workspace);
}

function selectProjectDocumentType(project, workspace, workspaceState, documentType) {
    const nextType = documentType === 'invoices' ? 'invoices' : 'products';
    workspaceState.documentType = nextType;
    workspaceState.documentKind = '';
    workspaceState.fileName = '';
    workspaceState.pageCount = 0;
    workspaceState.headerLabels = {};
    workspaceState.columns = [];
    workspaceState.rows = [];
    workspaceState.invoice = null;
    workspaceState.invoices = [];
    workspaceState.activeInvoiceId = '';
    workspaceState.extractionReport = null;
    activePdfDocument = null;
    activeInvoicePdfDocuments = new Map();
    activeInvoicePdfFiles = new Map();
    renderWorkspace(workspace, project, workspaceState);
    syncWordPressUi(workspace, workspaceState);
}

function clearProjectDocumentType(project, workspace, workspaceState) {
    workspaceState.documentType = '';
    workspaceState.documentKind = '';
    workspaceState.fileName = '';
    workspaceState.pageCount = 0;
    workspaceState.headerLabels = {};
    workspaceState.columns = [];
    workspaceState.rows = [];
    workspaceState.invoice = null;
    workspaceState.invoices = [];
    workspaceState.activeInvoiceId = '';
    workspaceState.extractionReport = null;
    activePdfDocument = null;
    activeInvoicePdfDocuments = new Map();
    activeInvoicePdfFiles = new Map();
    renderWorkspace(workspace, project, workspaceState);
    syncWordPressUi(workspace, workspaceState);
}

function returnToDocumentTypeChooser(project, workspace, workspaceState) {
    const customerPage = getCustomerNodes(workspace).page;
    const analysisPage = getAnalysisNodes(workspace).page;
    if (customerPage) customerPage.hidden = true;
    if (analysisPage) analysisPage.hidden = true;
    closeInvoiceUploadChoice(workspace);
    clearProjectDocumentType(project, workspace, workspaceState);
}

async function openCustomersView(project, workspace) {
    const nodes = getCustomerNodes(workspace);
    if (!nodes.page) return;

    workspace.querySelectorAll('[data-project-main-section]').forEach((section) => {
        section.hidden = true;
    });
    getAnalysisNodes(workspace).page.hidden = true;
    nodes.page.hidden = false;
    stopSplashScene();
    syncTopbarUploadAction(workspace);
    if (nodes.title) nodes.title.textContent = `Clientes ${activeWordPressConnection?.siteName || ''}`.trim();
    if (nodes.status) nodes.status.textContent = 'Cargando clientes de WordPress...';
    if (nodes.body) nodes.body.replaceChildren();

    try {
        const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/wordpress/customers`);
        activeWordPressCustomers = Array.isArray(data.customers) ? data.customers : [];
        renderCustomersTable(workspace);
    } catch (error) {
        activeWordPressCustomers = [];
        if (nodes.status) nodes.status.textContent = `No se pudieron cargar clientes: ${String(error?.message || error)}`;
    }
}

function closeCustomersView(project, workspace, workspaceState) {
    showProjectHome(project, workspace, workspaceState);
}

function setAnalysisSection(workspace, section) {
    const nodes = getAnalysisNodes(workspace);
    nodes.tabs.forEach((button) => {
        button.classList.toggle('is-active', button.dataset.projectAnalysisTab === section);
    });
    nodes.panels.forEach((panel) => {
        panel.hidden = panel.dataset.projectAnalysisPanel !== section;
    });
}

function toDateInputValue(date) {
    return date.toISOString().slice(0, 10);
}

function analysisPresetRange(preset) {
    const end = new Date();
    const start = new Date();

    if (preset === 'last-day') {
        // start y end quedan en hoy.
    } else if (preset === 'last-7-days') {
        start.setDate(end.getDate() - 6);
    } else if (preset === 'last-year') {
        start.setFullYear(end.getFullYear() - 1);
        start.setDate(start.getDate() + 1);
    } else {
        start.setDate(end.getDate() - 29);
    }

    return {
        start: toDateInputValue(start),
        end: toDateInputValue(end)
    };
}

function analysisPresetLabel(preset) {
    return {
        'last-day': 'Ultimo dia',
        'last-7-days': 'Ultimos 7 dias',
        'last-month': 'Ultimo mes',
        'last-year': 'Ultimo año',
        custom: 'Rango personalizado'
    }[preset] || 'Ultimo año';
}

function setDefaultAnalysisDates(workspace) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.start || !nodes.end) return;
    if (nodes.start.value && nodes.end.value) return;

    const range = analysisPresetRange('last-year');
    const today = toDateInputValue(new Date());
    nodes.start.value = range.start;
    nodes.end.value = range.end;
    nodes.start.max = range.end;
    nodes.end.min = range.start;
    nodes.end.max = today;
    if (nodes.rangeLabel) nodes.rangeLabel.textContent = analysisPresetLabel('last-year');
}

function setDefaultProductsAnalysisDates(workspace) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.productsStart || !nodes.productsEnd) return;
    if (nodes.productsStart.value && nodes.productsEnd.value) return;

    const range = analysisPresetRange('last-year');
    const today = toDateInputValue(new Date());
    nodes.productsStart.value = range.start;
    nodes.productsEnd.value = range.end;
    nodes.productsStart.max = range.end;
    nodes.productsEnd.min = range.start;
    nodes.productsEnd.max = today;
    if (nodes.productsRangeLabel) nodes.productsRangeLabel.textContent = analysisPresetLabel('last-year');
}

function setDefaultRevenueAnalysisDates(workspace) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.revenueStart || !nodes.revenueEnd) return;
    if (nodes.revenueStart.value && nodes.revenueEnd.value) return;

    const range = analysisPresetRange('last-year');
    const today = toDateInputValue(new Date());
    nodes.revenueStart.value = range.start;
    nodes.revenueEnd.value = range.end;
    nodes.revenueStart.max = range.end;
    nodes.revenueEnd.min = range.start;
    nodes.revenueEnd.max = today;
    if (nodes.revenueRangeLabel) nodes.revenueRangeLabel.textContent = analysisPresetLabel('last-year');
}

function setDefaultOrdersAnalysisDates(workspace) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.ordersStart || !nodes.ordersEnd) return;
    if (nodes.ordersStart.value && nodes.ordersEnd.value) return;

    const range = analysisPresetRange('last-year');
    const today = toDateInputValue(new Date());
    nodes.ordersStart.value = range.start;
    nodes.ordersEnd.value = range.end;
    nodes.ordersStart.max = range.end;
    nodes.ordersEnd.min = range.start;
    nodes.ordersEnd.max = today;
    if (nodes.ordersRangeLabel) nodes.ordersRangeLabel.textContent = analysisPresetLabel('last-year');
}

function setDefaultVisitsAnalysisDates(workspace) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.visitsStart || !nodes.visitsEnd) return;
    if (nodes.visitsStart.value && nodes.visitsEnd.value) return;

    const range = analysisPresetRange('last-year');
    const today = toDateInputValue(new Date());
    nodes.visitsStart.value = range.start;
    nodes.visitsEnd.value = range.end;
    nodes.visitsStart.max = range.end;
    nodes.visitsEnd.min = range.start;
    nodes.visitsEnd.max = today;
    if (nodes.visitsRangeLabel) nodes.visitsRangeLabel.textContent = analysisPresetLabel('last-year');
}

function validateAnalysisDates(workspace) {
    const nodes = getAnalysisNodes(workspace);
    const today = toDateInputValue(new Date());
    const start = nodes.start?.value || '';
    const end = nodes.end?.value || '';

    if (nodes.start) nodes.start.max = end || today;
    if (nodes.end) {
        nodes.end.min = start || '';
        nodes.end.max = today;
    }

    if (!start || !end) return 'Selecciona fecha de inicio y fecha final.';
    if (start > end) return 'La fecha de inicio no puede ser posterior a la fecha final.';
    if (start > today) return 'La fecha de inicio no puede estar en el futuro.';
    if (end > today) return 'La fecha final no puede estar en el futuro.';

    return '';
}

function validateProductsAnalysisDates(workspace) {
    const nodes = getAnalysisNodes(workspace);
    const today = toDateInputValue(new Date());
    const start = nodes.productsStart?.value || '';
    const end = nodes.productsEnd?.value || '';

    if (nodes.productsStart) nodes.productsStart.max = end || today;
    if (nodes.productsEnd) {
        nodes.productsEnd.min = start || '';
        nodes.productsEnd.max = today;
    }

    if (!start || !end) return 'Selecciona fecha de inicio y fecha final.';
    if (start > end) return 'La fecha de inicio no puede ser posterior a la fecha final.';
    if (start > today) return 'La fecha de inicio no puede estar en el futuro.';
    if (end > today) return 'La fecha final no puede estar en el futuro.';

    return '';
}

function validateRevenueAnalysisDates(workspace) {
    const nodes = getAnalysisNodes(workspace);
    const today = toDateInputValue(new Date());
    const start = nodes.revenueStart?.value || '';
    const end = nodes.revenueEnd?.value || '';

    if (nodes.revenueStart) nodes.revenueStart.max = end || today;
    if (nodes.revenueEnd) {
        nodes.revenueEnd.min = start || '';
        nodes.revenueEnd.max = today;
    }

    if (!start || !end) return 'Selecciona fecha de inicio y fecha final.';
    if (start > end) return 'La fecha de inicio no puede ser posterior a la fecha final.';
    if (start > today) return 'La fecha de inicio no puede estar en el futuro.';
    if (end > today) return 'La fecha final no puede estar en el futuro.';

    return '';
}

function validateOrdersAnalysisDates(workspace) {
    const nodes = getAnalysisNodes(workspace);
    const today = toDateInputValue(new Date());
    const start = nodes.ordersStart?.value || '';
    const end = nodes.ordersEnd?.value || '';

    if (nodes.ordersStart) nodes.ordersStart.max = end || today;
    if (nodes.ordersEnd) {
        nodes.ordersEnd.min = start || '';
        nodes.ordersEnd.max = today;
    }

    if (!start || !end) return 'Selecciona fecha de inicio y fecha final.';
    if (start > end) return 'La fecha de inicio no puede ser posterior a la fecha final.';
    if (start > today) return 'La fecha de inicio no puede estar en el futuro.';
    if (end > today) return 'La fecha final no puede estar en el futuro.';

    return '';
}

function validateVisitsAnalysisDates(workspace) {
    const nodes = getAnalysisNodes(workspace);
    const today = toDateInputValue(new Date());
    const start = nodes.visitsStart?.value || '';
    const end = nodes.visitsEnd?.value || '';

    if (nodes.visitsStart) nodes.visitsStart.max = end || today;
    if (nodes.visitsEnd) {
        nodes.visitsEnd.min = start || '';
        nodes.visitsEnd.max = today;
    }

    if (!start || !end) return 'Selecciona fecha de inicio y fecha final.';
    if (start > end) return 'La fecha de inicio no puede ser posterior a la fecha final.';
    if (start > today) return 'La fecha de inicio no puede estar en el futuro.';
    if (end > today) return 'La fecha final no puede estar en el futuro.';

    return '';
}

function showAnalysisDateError(workspace, message) {
    const nodes = getAnalysisNodes(workspace);
    if (nodes.errorMessage) nodes.errorMessage.textContent = message;
    if (nodes.errorModal) nodes.errorModal.hidden = false;
}

function hideAnalysisDateError(workspace) {
    const nodes = getAnalysisNodes(workspace);
    if (nodes.errorModal) nodes.errorModal.hidden = true;
}

function cleanRemoteErrorMessage(value) {
    const holder = document.createElement('div');
    holder.innerHTML = String(value || '');
    const text = (holder.textContent || holder.innerText || String(value || '')).replace(/\s+/g, ' ').trim();
    if (/critical error/i.test(text)) return 'WordPress ha devuelto un error critico en el endpoint de analisis. Revisa el snippet.';
    return text || 'No se pudo cargar el resumen.';
}

function toggleAnalysisRangeMenu(workspace, force) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.rangeMenu) return;
    nodes.rangeMenu.hidden = typeof force === 'boolean' ? !force : !nodes.rangeMenu.hidden;
}

function toggleProductsAnalysisRangeMenu(workspace, force) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.productsRangeMenu) return;
    nodes.productsRangeMenu.hidden = typeof force === 'boolean' ? !force : !nodes.productsRangeMenu.hidden;
}

function toggleRevenueAnalysisRangeMenu(workspace, force) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.revenueRangeMenu) return;
    nodes.revenueRangeMenu.hidden = typeof force === 'boolean' ? !force : !nodes.revenueRangeMenu.hidden;
}

function toggleOrdersAnalysisRangeMenu(workspace, force) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.ordersRangeMenu) return;
    nodes.ordersRangeMenu.hidden = typeof force === 'boolean' ? !force : !nodes.ordersRangeMenu.hidden;
}

function toggleVisitsAnalysisRangeMenu(workspace, force) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.visitsRangeMenu) return;
    nodes.visitsRangeMenu.hidden = typeof force === 'boolean' ? !force : !nodes.visitsRangeMenu.hidden;
}

function applyAnalysisPreset(workspace, preset) {
    const nodes = getAnalysisNodes(workspace);
    if (preset === 'custom') {
        if (nodes.customRange) nodes.customRange.hidden = false;
        if (nodes.rangeLabel) nodes.rangeLabel.textContent = analysisPresetLabel('custom');
        return false;
    }

    const range = analysisPresetRange(preset);
    if (nodes.start) nodes.start.value = range.start;
    if (nodes.end) nodes.end.value = range.end;
    if (nodes.customRange) nodes.customRange.hidden = true;
    if (nodes.rangeLabel) nodes.rangeLabel.textContent = analysisPresetLabel(preset);
    validateAnalysisDates(workspace);
    toggleAnalysisRangeMenu(workspace, false);
    return true;
}

function applyProductsAnalysisPreset(workspace, preset) {
    const nodes = getAnalysisNodes(workspace);
    if (preset === 'custom') {
        if (nodes.productsCustomRange) nodes.productsCustomRange.hidden = false;
        if (nodes.productsRangeLabel) nodes.productsRangeLabel.textContent = analysisPresetLabel('custom');
        return false;
    }

    const range = analysisPresetRange(preset);
    if (nodes.productsStart) nodes.productsStart.value = range.start;
    if (nodes.productsEnd) nodes.productsEnd.value = range.end;
    if (nodes.productsCustomRange) nodes.productsCustomRange.hidden = true;
    if (nodes.productsRangeLabel) nodes.productsRangeLabel.textContent = analysisPresetLabel(preset);
    validateProductsAnalysisDates(workspace);
    toggleProductsAnalysisRangeMenu(workspace, false);
    return true;
}

function applyRevenueAnalysisPreset(workspace, preset) {
    const nodes = getAnalysisNodes(workspace);
    if (preset === 'custom') {
        if (nodes.revenueCustomRange) nodes.revenueCustomRange.hidden = false;
        if (nodes.revenueRangeLabel) nodes.revenueRangeLabel.textContent = analysisPresetLabel('custom');
        return false;
    }

    const range = analysisPresetRange(preset);
    if (nodes.revenueStart) nodes.revenueStart.value = range.start;
    if (nodes.revenueEnd) nodes.revenueEnd.value = range.end;
    if (nodes.revenueCustomRange) nodes.revenueCustomRange.hidden = true;
    if (nodes.revenueRangeLabel) nodes.revenueRangeLabel.textContent = analysisPresetLabel(preset);
    validateRevenueAnalysisDates(workspace);
    toggleRevenueAnalysisRangeMenu(workspace, false);
    return true;
}

function applyOrdersAnalysisPreset(workspace, preset) {
    const nodes = getAnalysisNodes(workspace);
    if (preset === 'custom') {
        if (nodes.ordersCustomRange) nodes.ordersCustomRange.hidden = false;
        if (nodes.ordersRangeLabel) nodes.ordersRangeLabel.textContent = analysisPresetLabel('custom');
        return false;
    }

    const range = analysisPresetRange(preset);
    if (nodes.ordersStart) nodes.ordersStart.value = range.start;
    if (nodes.ordersEnd) nodes.ordersEnd.value = range.end;
    if (nodes.ordersCustomRange) nodes.ordersCustomRange.hidden = true;
    if (nodes.ordersRangeLabel) nodes.ordersRangeLabel.textContent = analysisPresetLabel(preset);
    validateOrdersAnalysisDates(workspace);
    toggleOrdersAnalysisRangeMenu(workspace, false);
    return true;
}

function applyVisitsAnalysisPreset(workspace, preset) {
    const nodes = getAnalysisNodes(workspace);
    if (preset === 'custom') {
        if (nodes.visitsCustomRange) nodes.visitsCustomRange.hidden = false;
        if (nodes.visitsRangeLabel) nodes.visitsRangeLabel.textContent = analysisPresetLabel('custom');
        return false;
    }

    const range = analysisPresetRange(preset);
    if (nodes.visitsStart) nodes.visitsStart.value = range.start;
    if (nodes.visitsEnd) nodes.visitsEnd.value = range.end;
    if (nodes.visitsCustomRange) nodes.visitsCustomRange.hidden = true;
    if (nodes.visitsRangeLabel) nodes.visitsRangeLabel.textContent = analysisPresetLabel(preset);
    validateVisitsAnalysisDates(workspace);
    toggleVisitsAnalysisRangeMenu(workspace, false);
    return true;
}

function destroyAnalysisChart(key) {
    if (activeAnalysisCharts[key]) {
        activeAnalysisCharts[key].destroy();
        delete activeAnalysisCharts[key];
    }
}

function renderChartEmpty(canvas, message) {
    if (!canvas) return;
    const holder = canvas.parentElement;
    destroyAnalysisChart(canvas.dataset.analysisChartKey || '');
    if (!holder) return;

    holder.querySelector('.project-analysis-empty-chart')?.remove();
    const empty = document.createElement('span');
    empty.className = 'project-analysis-empty-chart';
    empty.textContent = message;
    holder.appendChild(empty);
}

function formatChartDate(value) {
    const raw = String(value || '');
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return raw || '-';

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Intl.DateTimeFormat('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(date).replace(/\./g, '');
}

async function renderLineChart(canvas, key, points, label, color, formatter = (value) => value) {
    if (!canvas) return;
    const chartPoints = Array.isArray(points) ? points : [];
    const values = chartPoints.map((point) => Number(point.value || 0));
    const holder = canvas.parentElement;
    canvas.dataset.analysisChartKey = key;
    holder?.querySelector('.project-analysis-empty-chart')?.remove();
    destroyAnalysisChart(key);

    if (!values.length || Math.max(...values) <= 0) {
        renderChartEmpty(canvas, 'No hay datos en este rango.');
        return;
    }

    const Chart = await ensureChartJs();
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 260);
    gradient.addColorStop(0, `${color}3d`);
    gradient.addColorStop(0.55, `${color}14`);
    gradient.addColorStop(1, `${color}00`);

    activeAnalysisCharts[key] = new Chart(canvas, {
        type: 'line',
        data: {
            labels: chartPoints.map((point) => formatChartDate(point.date || '-')),
            datasets: [{
                label,
                data: values,
                borderColor: color,
                backgroundColor: gradient,
                fill: true,
                tension: 0.44,
                pointRadius: values.length > 24 ? 0 : 3,
                pointHoverRadius: 7,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: color,
                pointBorderWidth: 2,
                borderWidth: 3.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 6,
                    right: 10,
                    bottom: 24,
                    left: 4
                }
            },
            animation: {
                duration: 950,
                easing: 'easeOutQuart'
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    displayColors: false,
                    padding: 12,
                    cornerRadius: 12,
                    titleColor: '#e0f2fe',
                    bodyColor: '#ffffff',
                    backgroundColor: 'rgba(15, 23, 42, 0.92)',
                    callbacks: {
                        title: (items) => `Fecha: ${items[0]?.label || '-'}`,
                        label: (item) => `${label}: ${formatter(item.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    offset: true,
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: '#64748b',
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8,
                        padding: 10,
                        font: { weight: 700 }
                    }
                },
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: 'rgba(148, 163, 184, 0.16)' },
                    ticks: {
                        color: '#64748b',
                        font: { weight: 700 },
                        callback: (value) => formatter(value)
                    }
                }
            }
        }
    });
}

async function renderProductsBarChart(canvas, products) {
    if (!canvas) return;
    const items = (Array.isArray(products) ? products : []).slice(0, 10);
    const holder = canvas.parentElement;
    canvas.dataset.analysisChartKey = 'products';
    holder?.querySelector('.project-analysis-empty-chart')?.remove();
    destroyAnalysisChart('products');

    if (!items.length) {
        renderChartEmpty(canvas, 'No hay productos vendidos en este rango.');
        return;
    }

    const Chart = await ensureChartJs();
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, canvas.offsetWidth || 900, 0);
    gradient.addColorStop(0, '#2563eb');
    gradient.addColorStop(0.55, '#06b6d4');
    gradient.addColorStop(1, '#14b8a6');

    activeAnalysisCharts.products = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: items.map((product) => product.name || 'Producto'),
            datasets: [{
                label: 'Unidades',
                data: items.map((product) => Number(product.quantity || 0)),
                backgroundColor: gradient,
                borderRadius: 12,
                borderSkipped: false,
                barThickness: 26,
                maxBarThickness: 34
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 900,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    displayColors: false,
                    padding: 12,
                    cornerRadius: 12,
                    titleColor: '#e0f2fe',
                    bodyColor: '#ffffff',
                    backgroundColor: 'rgba(15, 23, 42, 0.92)',
                    callbacks: {
                        title: (items) => items[0]?.label || 'Producto',
                        label: (item) => `${Number(item.raw || 0).toLocaleString('es-ES')} unidades`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: 'rgba(148, 163, 184, 0.16)' },
                    ticks: { color: '#64748b', font: { weight: 750 } }
                },
                y: {
                    border: { display: false },
                    grid: { display: false },
                    ticks: {
                        color: '#334155',
                        font: { weight: 850 },
                        callback(value) {
                            const label = this.getLabelForValue(value);
                            return label.length > 28 ? `${label.slice(0, 28)}...` : label;
                        }
                    }
                }
            }
        }
    });
}

async function renderAnalysisSummary(workspace) {
    const nodes = getAnalysisNodes(workspace);
    const summary = activeAnalysisSummary || {};
    const metrics = summary.metrics || {};

    if (nodes.sales) nodes.sales.textContent = formatCurrency(metrics.totalSales);
    if (nodes.orders) nodes.orders.textContent = String(metrics.orderCount || 0);
    if (nodes.productsSold) nodes.productsSold.textContent = String(metrics.productsSold || 0);

    await Promise.all([
        renderLineChart(nodes.salesChart, 'sales', summary.series?.sales, 'Ventas', '#2563eb', formatCurrency),
        renderLineChart(nodes.ordersChart, 'orders', summary.series?.orders, 'Pedidos', '#0f766e', (value) => `${Number(value || 0).toLocaleString('es-ES')}`)
    ]);

    if (nodes.productsBody) {
        nodes.productsBody.replaceChildren();
        const products = (Array.isArray(summary.products) ? summary.products : []).slice(0, 3);
        products.forEach((product, index) => {
            const card = document.createElement('article');
            card.className = 'project-analysis-product-card';

            const image = document.createElement('span');
            image.className = 'project-analysis-product-image';
            if (product.image) {
                image.style.backgroundImage = `url("${String(product.image).replace(/"/g, '%22')}")`;
            } else {
                image.textContent = product.name.slice(0, 1).toUpperCase();
            }

            const rank = document.createElement('b');
            rank.className = 'project-analysis-product-rank';
            rank.textContent = `#${index + 1}`;

            const name = document.createElement('strong');
            name.textContent = product.name || 'Producto';

            const meta = document.createElement('small');
            meta.textContent = `${Number(product.quantity || 0).toLocaleString('es-ES')} unidades`;

            card.append(rank, image, name, meta);
            nodes.productsBody.appendChild(card);
        });

        if (!products.length) {
            const empty = document.createElement('p');
            empty.className = 'project-analysis-empty-products';
            empty.textContent = 'No hay productos vendidos en este rango.';
            nodes.productsBody.appendChild(empty);
        }
    }
}

async function renderProductsAnalysis(workspace) {
    const nodes = getAnalysisNodes(workspace);
    const summary = activeAnalysisSummary || {};
    const products = (Array.isArray(summary.products) ? summary.products : [])
        .slice()
        .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0) || Number(b.total || 0) - Number(a.total || 0));
    const totalUnits = products.reduce((sum, product) => sum + Number(product.quantity || 0), 0);
    const leader = products[0] || null;
    const leaderShare = leader && totalUnits ? Math.round((Number(leader.quantity || 0) / totalUnits) * 100) : 0;

    if (nodes.productsTotal) nodes.productsTotal.textContent = Number(totalUnits || 0).toLocaleString('es-ES');
    if (nodes.productsLeader) nodes.productsLeader.textContent = leader?.name || '-';
    if (nodes.productsShare) nodes.productsShare.textContent = leader ? `${leaderShare}%` : '-';

    await renderProductsBarChart(nodes.productsChart, products);

    if (!nodes.productsTableBody) return;
    nodes.productsTableBody.replaceChildren();

    products.forEach((product, index) => {
        const row = document.createElement('tr');

        const productCell = document.createElement('td');
        const productWrap = document.createElement('span');
        productWrap.className = 'project-analysis-product-row-main';

        const image = document.createElement('i');
        image.className = 'project-analysis-product-row-image';
        if (product.image) {
            image.style.backgroundImage = `url("${String(product.image).replace(/"/g, '%22')}")`;
        } else {
            image.textContent = String(product.name || 'P').slice(0, 1).toUpperCase();
        }

        const nameWrap = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = product.name || 'Producto';
        const rank = document.createElement('small');
        rank.textContent = `#${index + 1}`;
        nameWrap.append(name, rank);
        productWrap.append(image, nameWrap);
        productCell.appendChild(productWrap);

        const quantityCell = document.createElement('td');
        quantityCell.textContent = Number(product.quantity || 0).toLocaleString('es-ES');

        const salesCell = document.createElement('td');
        salesCell.textContent = formatCurrency(product.total || 0);

        const shareCell = document.createElement('td');
        const share = totalUnits ? Math.round((Number(product.quantity || 0) / totalUnits) * 100) : 0;
        shareCell.innerHTML = `<span class="project-analysis-products-share-bar"><b style="width:${share}%"></b><em>${share}%</em></span>`;

        row.append(productCell, quantityCell, salesCell, shareCell);
        nodes.productsTableBody.appendChild(row);
    });

    if (!products.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 4;
        cell.textContent = 'No hay productos vendidos en este rango.';
        row.appendChild(cell);
        nodes.productsTableBody.appendChild(row);
    }
}

function revenueDailyRows(summary) {
    const sales = Array.isArray(summary?.series?.sales) ? summary.series.sales : [];
    const orders = Array.isArray(summary?.series?.orders) ? summary.series.orders : [];
    const rowMap = new Map();

    sales.forEach((point) => {
        const date = point.date || '';
        if (!date) return;
        rowMap.set(date, {
            date,
            sales: Number(point.value || 0),
            orders: 0
        });
    });

    orders.forEach((point) => {
        const date = point.date || '';
        if (!date) return;
        const row = rowMap.get(date) || { date, sales: 0, orders: 0 };
        row.orders = Number(point.value || 0);
        rowMap.set(date, row);
    });

    return [...rowMap.values()]
        .filter((row) => row.date)
        .sort((a, b) => b.date.localeCompare(a.date));
}

function orderCustomerType(order) {
    const explicit = String(order?.customer?.type || '').trim();
    if (explicit) return explicit;

    const count = Number(order?.customer?.orderCount || 0);
    if (count >= 8) return 'VIP';
    if (count >= 3) return 'Habitual';
    return 'Normal';
}

function orderStatusLabel(status) {
    return {
        completed: 'Completado',
        processing: 'Procesando',
        'on-hold': 'En espera',
        pending: 'Pendiente',
        cancelled: 'Cancelado',
        refunded: 'Reembolsado',
        failed: 'Fallido'
    }[String(status || '').replace(/^wc-/, '')] || String(status || 'Sin estado');
}

function closeOrderModal(workspace) {
    const nodes = getAnalysisNodes(workspace);
    if (nodes.orderModal) nodes.orderModal.hidden = true;
}

function openOrderModal(workspace, order) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.orderModal) return;

    if (nodes.orderModalStatus) nodes.orderModalStatus.textContent = orderStatusLabel(order.status);
    if (nodes.orderModalTitle) nodes.orderModalTitle.textContent = `Pedido #${order.number || order.id || '-'}`;

    if (nodes.orderModalSummary) {
        nodes.orderModalSummary.replaceChildren();
        [
            ['Cliente', order.customer?.name || 'Cliente'],
            ['Tipo', orderCustomerType(order)],
            ['Fecha', order.date || '-'],
            ['Total', formatCurrency(order.total || 0)]
        ].forEach(([label, value]) => {
            const item = document.createElement('span');
            const small = document.createElement('small');
            const strong = document.createElement('strong');
            small.textContent = label;
            strong.textContent = value;
            item.append(small, strong);
            nodes.orderModalSummary.appendChild(item);
        });
    }

    if (nodes.orderModalItems) {
        nodes.orderModalItems.replaceChildren();
        const items = Array.isArray(order.items) ? order.items : [];
        items.forEach((product) => {
            const row = document.createElement('article');
            row.className = 'project-analysis-order-item';

            const image = document.createElement('i');
            image.className = 'project-analysis-product-row-image';
            if (product.image) {
                image.style.backgroundImage = `url("${String(product.image).replace(/"/g, '%22')}")`;
            } else {
                image.textContent = String(product.name || 'P').slice(0, 1).toUpperCase();
            }

            const body = document.createElement('span');
            const name = document.createElement('strong');
            const meta = document.createElement('small');
            name.textContent = product.name || 'Producto';
            meta.textContent = [
                product.sku ? `SKU ${product.sku}` : '',
                `${Number(product.quantity || 0).toLocaleString('es-ES')} uds.`,
                formatCurrency(product.total || 0)
            ].filter(Boolean).join(' · ');
            body.append(name, meta);

            const specs = Array.isArray(product.specs) ? product.specs : [];
            if (specs.length) {
                const specList = document.createElement('span');
                specList.className = 'project-analysis-order-specs';
                specs.slice(0, 8).forEach((spec) => {
                    const specItem = document.createElement('em');
                    const specName = String(spec.name || '').trim();
                    const specValue = String(spec.value || '').trim();
                    specItem.textContent = specName && specValue ? `${specName}: ${specValue}` : specValue || specName;
                    specList.appendChild(specItem);
                });
                body.appendChild(specList);
            }

            row.append(image, body);
            nodes.orderModalItems.appendChild(row);
        });

        if (!items.length) {
            const empty = document.createElement('p');
            empty.textContent = 'Este pedido no trae articulos en la respuesta.';
            nodes.orderModalItems.appendChild(empty);
        }
    }

    nodes.orderModal.hidden = false;
}

async function renderRevenueAnalysis(workspace) {
    const nodes = getAnalysisNodes(workspace);
    const summary = activeAnalysisSummary || {};
    const metrics = summary.metrics || {};
    const totalSales = Number(metrics.totalSales || 0);
    const orderCount = Number(metrics.orderCount || 0);
    const averageOrder = orderCount ? totalSales / orderCount : 0;
    const rows = revenueDailyRows(summary);
    const activeRows = rows.filter((row) => row.sales > 0 || row.orders > 0);
    const bestRow = rows.reduce((best, row) => !best || row.sales > best.sales ? row : best, null);
    const maxSales = rows.reduce((max, row) => Math.max(max, row.sales), 0);
    const activeAverage = activeRows.length ? totalSales / activeRows.length : 0;

    if (nodes.revenueNet) nodes.revenueNet.textContent = formatCurrency(totalSales);
    if (nodes.revenueOrders) nodes.revenueOrders.textContent = orderCount.toLocaleString('es-ES');
    if (nodes.revenueAverage) nodes.revenueAverage.textContent = formatCurrency(averageOrder);
    if (nodes.revenueTaxes) nodes.revenueTaxes.textContent = formatCurrency(metrics.taxes || 0);
    if (nodes.revenueShipping) nodes.revenueShipping.textContent = formatCurrency(metrics.shipping || 0);
    if (nodes.revenueCoupons) nodes.revenueCoupons.textContent = formatCurrency(metrics.coupons || 0);
    if (nodes.revenueBestDay) nodes.revenueBestDay.textContent = bestRow && bestRow.sales > 0 ? `${bestRow.date} · ${formatCurrency(bestRow.sales)}` : '-';
    if (nodes.revenueActiveDays) nodes.revenueActiveDays.textContent = activeRows.length.toLocaleString('es-ES');
    if (nodes.revenueIntensity) nodes.revenueIntensity.textContent = formatCurrency(activeAverage);

    await renderLineChart(nodes.revenueChart, 'revenue', summary.series?.sales, 'Ingresos', '#2563eb', formatCurrency);

    if (!nodes.revenueTableBody) return;
    nodes.revenueTableBody.replaceChildren();

    rows.forEach((row) => {
        const tr = document.createElement('tr');

        const dateCell = document.createElement('td');
        dateCell.textContent = row.date;

        const ordersCell = document.createElement('td');
        ordersCell.textContent = row.orders.toLocaleString('es-ES');

        const salesCell = document.createElement('td');
        salesCell.textContent = formatCurrency(row.sales);

        const averageCell = document.createElement('td');
        averageCell.textContent = formatCurrency(row.orders ? row.sales / row.orders : 0);

        const performanceCell = document.createElement('td');
        const share = maxSales ? Math.round((row.sales / maxSales) * 100) : 0;
        performanceCell.innerHTML = `<span class="project-analysis-products-share-bar"><b style="width:${share}%"></b><em>${share}%</em></span>`;

        tr.append(dateCell, ordersCell, salesCell, averageCell, performanceCell);
        nodes.revenueTableBody.appendChild(tr);
    });

    if (!rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = 'No hay ingresos en este rango.';
        tr.appendChild(td);
        nodes.revenueTableBody.appendChild(tr);
    }
}

async function renderOrdersAnalysis(workspace) {
    const nodes = getAnalysisNodes(workspace);
    const summary = activeAnalysisSummary || {};
    const orders = Array.isArray(summary.orders) ? summary.orders : [];
    const totalOrders = orders.length || Number(summary.metrics?.orderCount || 0);
    const netSales = orders.reduce((sum, order) => sum + Number(order.total || 0), 0) || Number(summary.metrics?.totalSales || 0);
    const itemCount = orders.reduce((sum, order) => sum + Number(order.itemCount || 0), 0);
    const averageOrder = totalOrders ? netSales / totalOrders : 0;
    const averageItems = totalOrders ? itemCount / totalOrders : 0;

    if (nodes.ordersTotal) nodes.ordersTotal.textContent = totalOrders.toLocaleString('es-ES');
    if (nodes.ordersNet) nodes.ordersNet.textContent = formatCurrency(netSales);
    if (nodes.ordersAverage) nodes.ordersAverage.textContent = formatCurrency(averageOrder);
    if (nodes.ordersItemsAverage) nodes.ordersItemsAverage.textContent = averageItems.toLocaleString('es-ES', { maximumFractionDigits: 1 });

    await renderLineChart(nodes.ordersPageChart, 'orders-page', summary.series?.orders, 'Pedidos', '#0f766e', (value) => `${Number(value || 0).toLocaleString('es-ES')}`);

    if (!nodes.ordersTableBody) return;
    nodes.ordersTableBody.replaceChildren();

    orders.forEach((order) => {
        const tr = document.createElement('tr');

        const dateCell = document.createElement('td');
        dateCell.textContent = order.date || '-';

        const numberCell = document.createElement('td');
        numberCell.textContent = `#${order.number || order.id || '-'}`;

        const statusCell = document.createElement('td');
        const status = document.createElement('span');
        status.className = `project-analysis-order-status is-${String(order.status || '').replace(/^wc-/, '')}`;
        status.textContent = orderStatusLabel(order.status);
        statusCell.appendChild(status);

        const customerCell = document.createElement('td');
        customerCell.textContent = order.customer?.name || 'Cliente';

        const typeCell = document.createElement('td');
        const type = document.createElement('span');
        type.className = 'project-analysis-order-type';
        type.textContent = orderCustomerType(order);
        typeCell.appendChild(type);

        const productsCell = document.createElement('td');
        const productNames = (order.items || []).map((item) => item.name).filter(Boolean);
        productsCell.textContent = productNames.slice(0, 2).join(', ') + (productNames.length > 2 ? ` +${productNames.length - 2}` : '');

        const itemsCell = document.createElement('td');
        itemsCell.textContent = Number(order.itemCount || 0).toLocaleString('es-ES');

        const totalCell = document.createElement('td');
        totalCell.textContent = formatCurrency(order.total || 0);

        const actionCell = document.createElement('td');
        const button = document.createElement('button');
        button.className = 'project-analysis-order-view';
        button.type = 'button';
        button.textContent = 'Ver pedido';
        button.addEventListener('click', () => openOrderModal(workspace, order));
        actionCell.appendChild(button);

        tr.append(dateCell, numberCell, statusCell, customerCell, typeCell, productsCell, itemsCell, totalCell, actionCell);
        nodes.ordersTableBody.appendChild(tr);
    });

    if (!orders.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 9;
        td.textContent = 'No hay pedidos para mostrar en este rango.';
        tr.appendChild(td);
        nodes.ordersTableBody.appendChild(tr);
    }
}

function getClientPerformanceMetrics() {
    const navigation = performance.getEntriesByType?.('navigation')?.[0];
    const loadMs = navigation
        ? Math.max(0, Math.round(navigation.loadEventEnd || navigation.domComplete || navigation.duration || 0))
        : 0;
    const domMs = navigation ? Math.max(0, Math.round(navigation.domContentLoadedEventEnd || 0)) : 0;
    const resources = performance.getEntriesByType?.('resource') || [];
    const slowResources = resources.filter((entry) => Number(entry.duration || 0) > 800).length;
    const memory = performance.memory?.usedJSHeapSize
        ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
        : 0;

    return { loadMs, domMs, resources: resources.length, slowResources, memory };
}

function measureFps(callback) {
    let frames = 0;
    let start = 0;

    function tick(time) {
        if (!start) start = time;
        frames += 1;
        if (time - start >= 700) {
            callback(Math.round((frames * 1000) / (time - start)));
            return;
        }
        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}

function renderPerformanceList(container, items) {
    if (!container) return;
    container.replaceChildren();
    items.forEach((item) => {
        const row = document.createElement('span');
        const label = document.createElement('small');
        const value = document.createElement('strong');
        const hint = document.createElement('em');
        label.textContent = item.label;
        value.textContent = item.value;
        hint.textContent = item.hint;
        row.append(label, value, hint);
        container.appendChild(row);
    });
}

const WORLD_GEOJSON_URL = 'https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json';
let worldGeoJsonPromise = null;

const ISO2_TO_ISO3 = {
    AD: 'AND', AE: 'ARE', AF: 'AFG', AG: 'ATG', AI: 'AIA', AL: 'ALB', AM: 'ARM', AO: 'AGO', AR: 'ARG', AS: 'ASM',
    AT: 'AUT', AU: 'AUS', AW: 'ABW', AX: 'ALA', AZ: 'AZE', BA: 'BIH', BB: 'BRB', BD: 'BGD', BE: 'BEL', BF: 'BFA',
    BG: 'BGR', BH: 'BHR', BI: 'BDI', BJ: 'BEN', BL: 'BLM', BM: 'BMU', BN: 'BRN', BO: 'BOL', BQ: 'BES', BR: 'BRA',
    BS: 'BHS', BT: 'BTN', BW: 'BWA', BY: 'BLR', BZ: 'BLZ', CA: 'CAN', CD: 'COD', CF: 'CAF', CG: 'COG', CH: 'CHE',
    CI: 'CIV', CK: 'COK', CL: 'CHL', CM: 'CMR', CN: 'CHN', CO: 'COL', CR: 'CRI', CU: 'CUB', CV: 'CPV', CW: 'CUW',
    CY: 'CYP', CZ: 'CZE', DE: 'DEU', DJ: 'DJI', DK: 'DNK', DM: 'DMA', DO: 'DOM', DZ: 'DZA', EC: 'ECU', EE: 'EST',
    EG: 'EGY', EH: 'ESH', ER: 'ERI', ES: 'ESP', ET: 'ETH', FI: 'FIN', FJ: 'FJI', FK: 'FLK', FM: 'FSM', FO: 'FRO',
    FR: 'FRA', GA: 'GAB', GB: 'GBR', GD: 'GRD', GE: 'GEO', GF: 'GUF', GG: 'GGY', GH: 'GHA', GI: 'GIB', GL: 'GRL',
    GM: 'GMB', GN: 'GIN', GP: 'GLP', GQ: 'GNQ', GR: 'GRC', GT: 'GTM', GU: 'GUM', GW: 'GNB', GY: 'GUY', HK: 'HKG',
    HN: 'HND', HR: 'HRV', HT: 'HTI', HU: 'HUN', ID: 'IDN', IE: 'IRL', IL: 'ISR', IM: 'IMN', IN: 'IND', IQ: 'IRQ',
    IR: 'IRN', IS: 'ISL', IT: 'ITA', JE: 'JEY', JM: 'JAM', JO: 'JOR', JP: 'JPN', KE: 'KEN', KG: 'KGZ', KH: 'KHM',
    KI: 'KIR', KM: 'COM', KN: 'KNA', KP: 'PRK', KR: 'KOR', KW: 'KWT', KY: 'CYM', KZ: 'KAZ', LA: 'LAO', LB: 'LBN',
    LC: 'LCA', LI: 'LIE', LK: 'LKA', LR: 'LBR', LS: 'LSO', LT: 'LTU', LU: 'LUX', LV: 'LVA', LY: 'LBY', MA: 'MAR',
    MC: 'MCO', MD: 'MDA', ME: 'MNE', MF: 'MAF', MG: 'MDG', MH: 'MHL', MK: 'MKD', ML: 'MLI', MM: 'MMR', MN: 'MNG',
    MO: 'MAC', MP: 'MNP', MQ: 'MTQ', MR: 'MRT', MS: 'MSR', MT: 'MLT', MU: 'MUS', MV: 'MDV', MW: 'MWI', MX: 'MEX',
    MY: 'MYS', MZ: 'MOZ', NA: 'NAM', NC: 'NCL', NE: 'NER', NG: 'NGA', NI: 'NIC', NL: 'NLD', NO: 'NOR', NP: 'NPL',
    NR: 'NRU', NU: 'NIU', NZ: 'NZL', OM: 'OMN', PA: 'PAN', PE: 'PER', PF: 'PYF', PG: 'PNG', PH: 'PHL', PK: 'PAK',
    PL: 'POL', PM: 'SPM', PR: 'PRI', PS: 'PSE', PT: 'PRT', PW: 'PLW', PY: 'PRY', QA: 'QAT', RE: 'REU', RO: 'ROU',
    RS: 'SRB', RU: 'RUS', RW: 'RWA', SA: 'SAU', SB: 'SLB', SC: 'SYC', SD: 'SDN', SE: 'SWE', SG: 'SGP', SI: 'SVN',
    SK: 'SVK', SL: 'SLE', SM: 'SMR', SN: 'SEN', SO: 'SOM', SR: 'SUR', SS: 'SSD', ST: 'STP', SV: 'SLV', SX: 'SXM',
    SY: 'SYR', SZ: 'SWZ', TC: 'TCA', TD: 'TCD', TG: 'TGO', TH: 'THA', TJ: 'TJK', TL: 'TLS', TM: 'TKM', TN: 'TUN',
    TO: 'TON', TR: 'TUR', TT: 'TTO', TV: 'TUV', TW: 'TWN', TZ: 'TZA', UA: 'UKR', UG: 'UGA', US: 'USA', UY: 'URY',
    UZ: 'UZB', VA: 'VAT', VC: 'VCT', VE: 'VEN', VG: 'VGB', VI: 'VIR', VN: 'VNM', VU: 'VUT', WS: 'WSM', YE: 'YEM',
    YT: 'MYT', ZA: 'ZAF', ZM: 'ZMB', ZW: 'ZWE'
};

function normalizeMapCountryCode(code) {
    const value = String(code || '').trim().toUpperCase();
    if (value.length === 3) return value;
    return ISO2_TO_ISO3[value] || value;
}

async function loadWorldGeoJson() {
    if (!worldGeoJsonPromise) {
        worldGeoJsonPromise = fetch(WORLD_GEOJSON_URL)
            .then((response) => {
                if (!response.ok) throw new Error(`No se pudo cargar el mapa (${response.status})`);
                return response.json();
            });
    }

    return worldGeoJsonPromise;
}

function projectMapPoint(coordinates) {
    const [lon, lat] = coordinates;
    return [
        ((Number(lon) + 180) / 360) * 1000,
        ((90 - Number(lat)) / 180) * 520
    ];
}

function polygonToSvgPath(polygon) {
    return polygon.map((ring) => ring.map((coordinates, index) => {
        const [x, y] = projectMapPoint(coordinates);
        return `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ') + ' Z').join(' ');
}

function geometryToSvgPath(geometry) {
    if (!geometry) return '';
    if (geometry.type === 'Polygon') return polygonToSvgPath(geometry.coordinates || []);
    if (geometry.type === 'MultiPolygon') return (geometry.coordinates || []).map(polygonToSvgPath).join(' ');
    return '';
}

function visitIntensityClass(visits, maxVisits) {
    if (!maxVisits || visits <= 0) return 'is-empty';
    const ratio = visits / maxVisits;
    if (ratio >= 0.75) return 'is-very-high';
    if (ratio >= 0.45) return 'is-high';
    if (ratio >= 0.2) return 'is-medium';
    return 'is-low';
}

async function renderVisitMap(workspace, countries) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.visitsMap || !nodes.visitsMapSvg) return;

    const rows = (Array.isArray(countries) ? countries : [])
        .filter((country) => Number(country.visits || 0) > 0)
        .sort((a, b) => Number(b.visits || 0) - Number(a.visits || 0));
    const maxVisits = rows.reduce((max, country) => Math.max(max, Number(country.visits || 0)), 0);
    const visitsByCode = new Map(rows.map((country) => [normalizeMapCountryCode(country.code), country]));

    nodes.visitsMap.querySelectorAll('.project-analysis-map-empty').forEach((node) => node.remove());
    nodes.visitsMapSvg.replaceChildren();

    if (!rows.length) {
        const empty = document.createElement('p');
        empty.className = 'project-analysis-map-empty';
        empty.textContent = 'Todavia no hay visitas con pais detectado.';
        nodes.visitsMap.appendChild(empty);
    } else {
        const loading = document.createElement('p');
        loading.className = 'project-analysis-map-empty';
        loading.textContent = 'Cargando mapa mundial...';
        nodes.visitsMap.appendChild(loading);

        try {
            const geoJson = await loadWorldGeoJson();
            loading.remove();

            (geoJson.features || []).forEach((feature) => {
                const code = String(feature.id || '').toUpperCase();
                const country = visitsByCode.get(code);
                const visits = Number(country?.visits || 0);
                const pathValue = geometryToSvgPath(feature.geometry);

                if (!pathValue) return;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', pathValue);
                path.setAttribute('class', `project-analysis-map-country ${visits ? visitIntensityClass(visits, maxVisits) : ''}`.trim());
                path.setAttribute('tabindex', visits ? '0' : '-1');

                const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                title.textContent = visits
                    ? `${country.name || feature.properties?.name || code}: ${visits.toLocaleString('es-ES')} visitas`
                    : `${feature.properties?.name || code}: sin visitas`;
                path.appendChild(title);

                nodes.visitsMapSvg.appendChild(path);
            });
        } catch (error) {
            loading.textContent = 'No se pudo cargar el mapa mundial. Revisa la conexion.';
        }
    }

    if (nodes.visitsMapLegend) {
        nodes.visitsMapLegend.replaceChildren();
        [
            ['is-low', 'Bajo'],
            ['is-medium', 'Medio'],
            ['is-high', 'Alto'],
            ['is-very-high', 'Maximo']
        ].forEach(([className, label]) => {
            const item = document.createElement('span');
            item.className = `project-analysis-map-legend-item ${className}`;
            item.innerHTML = `<i></i>${label}`;
            nodes.visitsMapLegend.appendChild(item);
        });
    }
}

function renderVisitCountries(workspace, countries, totalVisits) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.visitsCountryBody) return;

    nodes.visitsCountryBody.replaceChildren();
    const rows = (Array.isArray(countries) ? countries : [])
        .filter((country) => Number(country.visits || 0) > 0)
        .sort((a, b) => Number(b.visits || 0) - Number(a.visits || 0));

    rows.forEach((country) => {
        const visits = Number(country.visits || 0);
        const share = totalVisits ? Math.round((visits / totalVisits) * 100) : 0;
        const tr = document.createElement('tr');

        const countryCell = document.createElement('td');
        const flag = document.createElement('span');
        flag.className = 'project-analysis-country-flag';
        flag.textContent = String(country.code || '??').slice(0, 2).toUpperCase();
        const name = document.createElement('strong');
        name.textContent = country.name || 'Desconocido';
        countryCell.append(flag, name);

        const codeCell = document.createElement('td');
        codeCell.textContent = country.code || '-';

        const visitsCell = document.createElement('td');
        visitsCell.textContent = visits.toLocaleString('es-ES');

        const shareCell = document.createElement('td');
        shareCell.innerHTML = `<span class="project-analysis-products-share-bar"><b style="width:${share}%"></b><em>${share}%</em></span>`;

        tr.append(countryCell, codeCell, visitsCell, shareCell);
        nodes.visitsCountryBody.appendChild(tr);
    });

    if (!rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 4;
        td.textContent = 'Todavia no hay paises registrados en este rango.';
        tr.appendChild(td);
        nodes.visitsCountryBody.appendChild(tr);
    }
}

async function renderVisitsAnalysis(workspace) {
    const nodes = getAnalysisNodes(workspace);
    const summary = activeAnalysisSummary || {};
    const visitsSeries = Array.isArray(summary.series?.visits) ? summary.series.visits : [];
    const seriesTotal = visitsSeries.reduce((sum, point) => sum + Number(point.value || 0), 0);
    const totalVisits = Number(summary.metrics?.visits ?? summary.visits ?? seriesTotal);
    const averageVisits = visitsSeries.length ? totalVisits / visitsSeries.length : 0;
    const perf = getClientPerformanceMetrics();

    if (nodes.visitsTotal) nodes.visitsTotal.textContent = totalVisits.toLocaleString('es-ES');
    if (nodes.visitsAverage) nodes.visitsAverage.textContent = averageVisits.toLocaleString('es-ES', { maximumFractionDigits: 1 });
    if (nodes.visitsLoad) nodes.visitsLoad.textContent = perf.loadMs ? `${perf.loadMs} ms` : '-';
    if (nodes.visitsFps) nodes.visitsFps.textContent = 'Midiendo...';

    measureFps((fps) => {
        const currentNodes = getAnalysisNodes(workspace);
        if (currentNodes.visitsFps) currentNodes.visitsFps.textContent = `${fps} FPS`;
    });

    await renderLineChart(nodes.visitsPageChart, 'visits-page', visitsSeries, 'Visitas', '#0891b2', (value) => `${Number(value || 0).toLocaleString('es-ES')}`);

    renderPerformanceList(nodes.visitsPerformance, [
        { label: 'Carga inicial', value: perf.loadMs ? `${perf.loadMs} ms` : '-', hint: perf.loadMs && perf.loadMs < 2500 ? 'Buena respuesta inicial' : 'Revisar peso o servidor' },
        { label: 'DOM listo', value: perf.domMs ? `${perf.domMs} ms` : '-', hint: 'Tiempo hasta interfaz preparada' },
        { label: 'Recursos', value: perf.resources.toLocaleString('es-ES'), hint: `${perf.slowResources.toLocaleString('es-ES')} recursos lentos` },
        { label: 'Memoria JS', value: perf.memory ? `${perf.memory} MB` : '-', hint: perf.memory ? 'Uso aproximado del navegador' : 'No disponible en este navegador' }
    ]);

    renderPerformanceList(nodes.visitsHealth, [
        { label: 'Trafico detectado', value: totalVisits > 0 ? 'Activo' : 'Sin datos', hint: totalVisits > 0 ? 'WordPress esta enviando visitas' : 'El snippet aun no envia visitas reales' },
        { label: 'Densidad', value: averageVisits ? `${averageVisits.toLocaleString('es-ES', { maximumFractionDigits: 1 })}/dia` : '-', hint: 'Media del periodo cargado' },
        { label: 'Fluidez objetivo', value: '60 FPS', hint: 'Referencia visual recomendada' },
        { label: 'Estado', value: perf.slowResources > 3 ? 'A vigilar' : 'Correcto', hint: 'Basado en recursos lentos locales' }
    ]);

    renderVisitCountries(workspace, summary.countries, totalVisits);
    await renderVisitMap(workspace, summary.countries);
}

function seoScoreClass(score) {
    const value = Number(score || 0);
    if (value >= 80) return 'is-good';
    if (value >= 55) return 'is-warning';
    return 'is-critical';
}

function seoLevelLabel(level) {
    return {
        critical: 'Critico',
        warning: 'Mejora',
        info: 'Info'
    }[String(level || '').toLowerCase()] || 'Mejora';
}

function seoIssueSummary(items) {
    const issueMap = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
        (Array.isArray(item.issues) ? item.issues : []).forEach((issue) => {
            const message = String(issue.message || '').trim();
            if (!message) return;
            const current = issueMap.get(message) || { count: 0, level: issue.level || 'warning' };
            current.count += 1;
            issueMap.set(message, current);
        });
    });

    return [...issueMap.entries()]
        .map(([message, value]) => ({ message, ...value }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4);
}

function getSeoEditableValue(item, key) {
    const editable = item?.editable || {};
    return editable[key] ?? '';
}

function getSeoEditorPayload(nodes) {
    const payload = {};
    (nodes.seoFields || []).forEach((field) => {
        const key = field.dataset.projectAnalysisSeoField;
        if (!key) return;
        payload[key] = field.value.trim();
    });

    if (!payload.metaDescription && payload.shortDescription) {
        payload.metaDescription = payload.shortDescription;
    }

    return payload;
}

function getSeoCountHint(key, value) {
    const length = String(value || '').trim().length;
    const suffix = `${length.toLocaleString('es-ES')} caracteres`;

    if (key === 'title' || key === 'metaTitle') {
        return `${suffix} - ideal 35-65`;
    }
    if (key === 'shortDescription' || key === 'metaDescription') {
        return `${suffix} - ideal 90-160`;
    }
    if (key === 'description') {
        return `${suffix} - mejor a partir de 300`;
    }
    if (key === 'slug') {
        return `${suffix} - URL limpia`;
    }
    if (key === 'focusKeyword') {
        return value ? 'Keyword definida' : 'Opcional, pero recomendable';
    }

    return suffix;
}

function calculateLocalSeoPreview(input, originalItem = {}) {
    const title = String(input.title || '').trim();
    const metaTitle = String(input.metaTitle || '').trim();
    const description = String(input.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const shortDescription = String(input.metaDescription || input.shortDescription || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const slug = String(input.slug || '').trim();
    const focusKeyword = String(input.focusKeyword || '').trim().toLowerCase();
    const searchable = `${title} ${metaTitle} ${shortDescription} ${description}`.toLowerCase();
    const issues = [];

    if (title.length < 18) {
        issues.push({ level: 'warning', message: 'Titulo demasiado corto.' });
    } else if (title.length > 70) {
        issues.push({ level: 'warning', message: 'Titulo demasiado largo.' });
    }

    if (metaTitle && metaTitle.length > 70) {
        issues.push({ level: 'warning', message: 'Meta titulo demasiado largo.' });
    }

    if (shortDescription.length < 70) {
        issues.push({ level: 'warning', message: 'Meta descripcion o extracto corto.' });
    } else if (shortDescription.length > 170) {
        issues.push({ level: 'warning', message: 'Meta descripcion demasiado larga.' });
    }

    if (description.length < 180) {
        issues.push({ level: 'critical', message: 'Contenido muy corto para posicionar.' });
    }

    if (!slug || slug.length < 4) {
        issues.push({ level: 'info', message: 'Slug poco descriptivo.' });
    }

    if (!originalItem.image) {
        issues.push({ level: 'warning', message: 'Producto sin imagen destacada.' });
    }

    if (focusKeyword && !searchable.includes(focusKeyword)) {
        issues.push({ level: 'warning', message: 'La palabra clave no aparece en el contenido.' });
    }

    const penalty = issues.reduce((total, issue) => {
        if (issue.level === 'critical') return total + 25;
        if (issue.level === 'warning') return total + 12;
        return total + 6;
    }, 0);

    return {
        score: Math.max(20, Math.min(100, 100 - penalty)),
        issues
    };
}

function renderSeoEditorPreview(workspace) {
    const nodes = getAnalysisNodes(workspace);
    if (!activeSeoEditorItem) return;

    const payload = getSeoEditorPayload(nodes);
    const preview = calculateLocalSeoPreview(payload, activeSeoEditorItem);
    const before = Number(activeSeoEditorItem.score || 0);
    const delta = preview.score - before;

    if (nodes.seoAfterScore) nodes.seoAfterScore.textContent = `${preview.score}/100`;
    if (nodes.seoDeltaScore) {
        nodes.seoDeltaScore.textContent = delta === 0 ? '0' : `${delta > 0 ? '+' : ''}${delta}`;
        nodes.seoDeltaScore.style.color = delta >= 0 ? '#059669' : '#dc2626';
    }

    (nodes.seoCounts || []).forEach((count) => {
        const key = count.dataset.projectAnalysisSeoCount;
        count.textContent = getSeoCountHint(key, payload[key] || '');
    });

    if (nodes.seoEditorIssues) {
        nodes.seoEditorIssues.replaceChildren();
        const issues = preview.issues.length ? preview.issues : [{ level: 'info', message: 'La vista previa no detecta bloqueos importantes.' }];
        issues.slice(0, 8).forEach((issue) => {
            const tag = document.createElement('em');
            tag.className = String(issue.level || 'info').toLowerCase();
            tag.textContent = issue.message;
            nodes.seoEditorIssues.appendChild(tag);
        });
    }
}

function openSeoEditor(workspace, item) {
    const nodes = getAnalysisNodes(workspace);
    activeSeoEditorItem = item;

    if (nodes.seoModalTitle) nodes.seoModalTitle.textContent = item.title || 'Producto';
    if (nodes.seoModalStatus) nodes.seoModalStatus.textContent = `Score actual ${Number(item.score || 0)}/100`;
    if (nodes.seoBeforeScore) nodes.seoBeforeScore.textContent = `${Number(item.score || 0)}/100`;
    if (nodes.seoEditorLink) {
        nodes.seoEditorLink.hidden = !item.url;
        nodes.seoEditorLink.href = item.url || '#';
    }

    const values = {
        title: getSeoEditableValue(item, 'title') || item.title || '',
        slug: getSeoEditableValue(item, 'slug'),
        metaTitle: getSeoEditableValue(item, 'metaTitle'),
        focusKeyword: getSeoEditableValue(item, 'focusKeyword'),
        shortDescription: getSeoEditableValue(item, 'shortDescription') || getSeoEditableValue(item, 'metaDescription'),
        description: getSeoEditableValue(item, 'description')
    };

    (nodes.seoFields || []).forEach((field) => {
        const key = field.dataset.projectAnalysisSeoField;
        field.value = values[key] || '';
    });

    renderSeoEditorPreview(workspace);
    if (nodes.seoModal) nodes.seoModal.hidden = false;
}

function closeSeoEditor(workspace) {
    const nodes = getAnalysisNodes(workspace);
    activeSeoEditorItem = null;
    if (nodes.seoModal) nodes.seoModal.hidden = true;
}

function rebuildSeoMetrics(items) {
    const total = items.length;
    const averageScore = total
        ? Math.round(items.reduce((sum, item) => sum + Number(item.score || 0), 0) / total)
        : 0;

    return {
        total,
        averageScore,
        good: items.filter((item) => Number(item.score || 0) >= 80).length,
        warning: items.filter((item) => Number(item.score || 0) >= 55 && Number(item.score || 0) < 80).length,
        critical: items.filter((item) => Number(item.score || 0) < 55).length
    };
}

function getSeoSearchText(item) {
    const issues = (Array.isArray(item?.issues) ? item.issues : [])
        .map((issue) => `${issue.level || ''} ${issue.message || ''}`)
        .join(' ');

    return [
        item?.title,
        item?.sku,
        item?.status,
        item?.type,
        item?.score,
        issues
    ].filter(Boolean).join(' ').toLowerCase();
}

function getVisibleSeoItems(workspace, items) {
    const nodes = getAnalysisNodes(workspace);
    const query = String(nodes.seoSearch?.value || '').trim().toLowerCase();
    const filteredItems = query
        ? items.filter((item) => getSeoSearchText(item).includes(query))
        : items;

    return [...filteredItems].sort((a, b) => {
        const aUpdated = activeSeoUpdatedIds.has(String(a.id)) ? 1 : 0;
        const bUpdated = activeSeoUpdatedIds.has(String(b.id)) ? 1 : 0;

        if (aUpdated !== bUpdated) return bUpdated - aUpdated;
        return Number(a.score || 0) - Number(b.score || 0);
    });
}

function replaceSeoAuditItem(updatedItem) {
    if (!activeSeoAudit || !updatedItem) return;

    const items = Array.isArray(activeSeoAudit.items) ? activeSeoAudit.items : [];
    const updatedId = String(updatedItem.id);
    let foundItem = false;
    const nextItems = items.map((item) => {
        if (String(item.id) !== updatedId) return item;
        foundItem = true;
        return { ...item, ...updatedItem };
    });

    if (!foundItem) {
        nextItems.push(updatedItem);
    }

    activeSeoUpdatedIds.add(updatedId);

    activeSeoAudit = {
        ...activeSeoAudit,
        items: nextItems,
        metrics: {
            ...(activeSeoAudit.metrics || {}),
            ...rebuildSeoMetrics(nextItems)
        }
    };
}

async function saveSeoEditor(project, workspace) {
    const nodes = getAnalysisNodes(workspace);
    if (!activeSeoEditorItem) return;

    const item = activeSeoEditorItem;
    const beforeScore = Number(item.score || 0);
    const payload = getSeoEditorPayload(nodes);

    if (nodes.seoSave) nodes.seoSave.disabled = true;
    if (nodes.seoModalStatus) nodes.seoModalStatus.textContent = 'Guardando cambios en WordPress...';

    try {
        const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/wordpress/seo-audit/${encodeURIComponent(item.id)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
        const updatedItem = data.item || null;
        const afterScore = Number(updatedItem?.score || beforeScore);
        const delta = afterScore - beforeScore;

        replaceSeoAuditItem(updatedItem);
        activeSeoEditorItem = updatedItem || { ...item, ...payload, score: afterScore };
        renderSeoAudit(workspace);

        if (nodes.seoBeforeScore) nodes.seoBeforeScore.textContent = `${beforeScore}/100`;
        if (nodes.seoAfterScore) nodes.seoAfterScore.textContent = `${afterScore}/100`;
        if (nodes.seoDeltaScore) {
            nodes.seoDeltaScore.textContent = delta === 0 ? '0' : `${delta > 0 ? '+' : ''}${delta}`;
            nodes.seoDeltaScore.style.color = delta >= 0 ? '#059669' : '#dc2626';
        }
        if (nodes.seoModalStatus) {
            nodes.seoModalStatus.textContent = delta > 0
                ? `Guardado. Mejora de ${delta} puntos.`
                : 'Guardado. El score se mantiene estable.';
        }
    } catch (error) {
        if (nodes.seoModalStatus) nodes.seoModalStatus.textContent = cleanRemoteErrorMessage(error?.message || error);
    } finally {
        if (nodes.seoSave) nodes.seoSave.disabled = false;
    }
}

function renderSeoAudit(workspace) {
    const nodes = getAnalysisNodes(workspace);
    const audit = activeSeoAudit || {};
    const metrics = audit.metrics || {};
    const items = Array.isArray(audit.items) ? audit.items : [];
    const visibleItems = getVisibleSeoItems(workspace, items);
    const averageScore = Number(metrics.averageScore || 0);

    if (nodes.seoScore) {
        nodes.seoScore.textContent = items.length ? `${averageScore}` : '--';
        nodes.seoScore.className = seoScoreClass(averageScore);
    }
    if (nodes.seoGood) nodes.seoGood.textContent = Number(metrics.good || 0).toLocaleString('es-ES');
    if (nodes.seoWarning) nodes.seoWarning.textContent = Number(metrics.warning || 0).toLocaleString('es-ES');
    if (nodes.seoCritical) nodes.seoCritical.textContent = Number(metrics.critical || 0).toLocaleString('es-ES');
    if (nodes.seoTotal) nodes.seoTotal.textContent = Number(metrics.total || items.length || 0).toLocaleString('es-ES');

    const priorities = seoIssueSummary(items);
    renderPerformanceList(nodes.seoPriorities, priorities.length
        ? priorities.map((issue) => ({
            label: seoLevelLabel(issue.level),
            value: issue.message,
            hint: `${issue.count.toLocaleString('es-ES')} contenidos afectados`
        }))
        : [{ label: 'Sin bloqueos', value: 'SEO limpio', hint: 'No hay problemas detectados en la auditoria actual' }]
    );

    renderPerformanceList(nodes.seoHealth, [
        { label: 'Cobertura', value: `${Number(metrics.total || items.length || 0).toLocaleString('es-ES')} URLs`, hint: 'Productos o paginas revisadas' },
        { label: 'Promedio', value: items.length ? `${averageScore}/100` : '-', hint: averageScore >= 80 ? 'Buen estado general' : 'Hay margen claro de mejora' },
        { label: 'Riesgo', value: Number(metrics.critical || 0) ? 'Alto' : Number(metrics.warning || 0) ? 'Medio' : 'Bajo', hint: 'Basado en titulos, descripciones, imagenes y contenido' },
        { label: 'Fuente', value: audit.source || '-', hint: 'Origen de la lectura SEO' }
    ]);

    if (!nodes.seoTableBody) return;
    nodes.seoTableBody.replaceChildren();

    visibleItems.forEach((item) => {
        const isUpdated = activeSeoUpdatedIds.has(String(item.id));
        const tr = document.createElement('tr');
        if (isUpdated) tr.classList.add('is-seo-updated');

        const titleCell = document.createElement('td');
        const main = document.createElement('span');
        main.className = 'project-analysis-product-row-main';
        const image = document.createElement('i');
        image.className = 'project-analysis-product-row-image';
        if (item.image) {
            image.style.backgroundImage = `url("${String(item.image).replace(/"/g, '%22')}")`;
        } else {
            image.textContent = String(item.title || 'S').slice(0, 1).toUpperCase();
        }
        const body = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = item.title || 'Sin titulo';
        const meta = document.createElement('small');
        meta.textContent = [item.sku ? `SKU ${item.sku}` : '', item.status || '', isUpdated ? 'Actualizado' : ''].filter(Boolean).join(' - ') || 'Contenido';
        body.append(title, meta);
        main.append(image, body);
        titleCell.appendChild(main);

        const typeCell = document.createElement('td');
        typeCell.textContent = String(item.status || '').toLowerCase() === 'publish' ? 'Publicado' : (item.status || item.type || '-');

        const scoreCell = document.createElement('td');
        const score = document.createElement('span');
        score.className = `project-analysis-seo-score-pill ${seoScoreClass(item.score)}`;
        score.textContent = `${Number(item.score || 0)}/100`;
        scoreCell.appendChild(score);

        const issuesCell = document.createElement('td');
        const issues = Array.isArray(item.issues) ? item.issues : [];
        if (issues.length) {
            const list = document.createElement('span');
            list.className = 'project-analysis-seo-issues';
            issues.slice(0, 4).forEach((issue) => {
                const tag = document.createElement('em');
                tag.className = String(issue.level || 'warning').toLowerCase();
                tag.textContent = issue.message || 'Revisar';
                list.appendChild(tag);
            });
            issuesCell.appendChild(list);
        } else {
            issuesCell.textContent = 'Sin problemas relevantes.';
        }

        const actionCell = document.createElement('td');
        const button = document.createElement('button');
        button.className = 'project-analysis-seo-open';
        button.type = 'button';
        button.textContent = 'Mejorar';
        button.addEventListener('click', () => openSeoEditor(workspace, item));
        actionCell.appendChild(button);

        tr.append(titleCell, typeCell, scoreCell, issuesCell, actionCell);
        nodes.seoTableBody.appendChild(tr);
    });

    if (!visibleItems.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = items.length
            ? 'No hay productos que coincidan con la busqueda.'
            : 'Todavia no hay contenido SEO para mostrar.';
        tr.appendChild(td);
        nodes.seoTableBody.appendChild(tr);
    }
}

async function loadSeoAudit(project, workspace) {
    const nodes = getAnalysisNodes(workspace);
    if (nodes.seoStatus) nodes.seoStatus.textContent = 'Auditando SEO de WordPress...';
    if (nodes.seoRefresh) nodes.seoRefresh.disabled = true;

    try {
        const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/wordpress/seo-audit`);
        activeSeoAudit = data.audit || null;
        renderSeoAudit(workspace);
        if (nodes.seoStatus) {
            const total = Number(activeSeoAudit?.metrics?.total || activeSeoAudit?.items?.length || 0);
            nodes.seoStatus.textContent = `${total.toLocaleString('es-ES')} contenidos auditados.`;
        }
    } catch (error) {
        activeSeoAudit = null;
        renderSeoAudit(workspace);
        if (nodes.seoStatus) nodes.seoStatus.textContent = cleanRemoteErrorMessage(error?.message || error);
    } finally {
        if (nodes.seoRefresh) nodes.seoRefresh.disabled = false;
    }
}

async function loadAnalysisSummary(project, workspace) {
    const nodes = getAnalysisNodes(workspace);
    const start = nodes.start?.value || '';
    const end = nodes.end?.value || '';
    const dateError = validateAnalysisDates(workspace);

    if (dateError) {
        showAnalysisDateError(workspace, dateError);
        return;
    }

    hideAnalysisDateError(workspace);
    if (nodes.summaryStatus) nodes.summaryStatus.textContent = 'Cargando resumen desde WordPress...';

    try {
        const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/wordpress/analysis/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
        activeAnalysisSummary = data.summary || null;
        await renderAnalysisSummary(workspace);
        await renderProductsAnalysis(workspace);
        await renderRevenueAnalysis(workspace);
        await renderOrdersAnalysis(workspace);
        await renderVisitsAnalysis(workspace);
        if (nodes.summaryStatus) nodes.summaryStatus.textContent = `Datos cargados de ${start || '-'} a ${end || '-'}.`;
    } catch (error) {
        activeAnalysisSummary = null;
        await renderAnalysisSummary(workspace);
        if (nodes.summaryStatus) {
            nodes.summaryStatus.textContent = cleanRemoteErrorMessage(error?.message || error);
        }
    }
}

async function loadVisitsAnalysis(project, workspace) {
    const nodes = getAnalysisNodes(workspace);
    const start = nodes.visitsStart?.value || '';
    const end = nodes.visitsEnd?.value || '';
    const dateError = validateVisitsAnalysisDates(workspace);

    if (dateError) {
        showAnalysisDateError(workspace, dateError);
        return;
    }

    hideAnalysisDateError(workspace);
    if (nodes.visitsStatus) nodes.visitsStatus.textContent = 'Cargando visitas desde WordPress...';

    try {
        const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/wordpress/analysis/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
        activeAnalysisSummary = data.summary || null;
        await renderVisitsAnalysis(workspace);
        if (nodes.visitsStatus) nodes.visitsStatus.textContent = `Visitas cargadas de ${start || '-'} a ${end || '-'}.`;
    } catch (error) {
        activeAnalysisSummary = null;
        await renderVisitsAnalysis(workspace);
        if (nodes.visitsStatus) nodes.visitsStatus.textContent = cleanRemoteErrorMessage(error?.message || error);
    }
}

async function loadOrdersAnalysis(project, workspace) {
    const nodes = getAnalysisNodes(workspace);
    const start = nodes.ordersStart?.value || '';
    const end = nodes.ordersEnd?.value || '';
    const dateError = validateOrdersAnalysisDates(workspace);

    if (dateError) {
        showAnalysisDateError(workspace, dateError);
        return;
    }

    hideAnalysisDateError(workspace);
    if (nodes.ordersStatus) nodes.ordersStatus.textContent = 'Cargando pedidos desde WordPress...';

    try {
        const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/wordpress/analysis/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
        activeAnalysisSummary = data.summary || null;
        await renderOrdersAnalysis(workspace);
        await renderAnalysisSummary(workspace);
        await renderProductsAnalysis(workspace);
        await renderRevenueAnalysis(workspace);
        if (nodes.ordersStatus) nodes.ordersStatus.textContent = `Pedidos cargados de ${start || '-'} a ${end || '-'}.`;
    } catch (error) {
        activeAnalysisSummary = null;
        await renderOrdersAnalysis(workspace);
        if (nodes.ordersStatus) nodes.ordersStatus.textContent = cleanRemoteErrorMessage(error?.message || error);
    }
}

async function loadRevenueAnalysis(project, workspace) {
    const nodes = getAnalysisNodes(workspace);
    const start = nodes.revenueStart?.value || '';
    const end = nodes.revenueEnd?.value || '';
    const dateError = validateRevenueAnalysisDates(workspace);

    if (dateError) {
        showAnalysisDateError(workspace, dateError);
        return;
    }

    hideAnalysisDateError(workspace);
    if (nodes.revenueStatus) nodes.revenueStatus.textContent = 'Cargando ingresos desde WordPress...';

    try {
        const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/wordpress/analysis/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
        activeAnalysisSummary = data.summary || null;
        await renderRevenueAnalysis(workspace);
        await renderAnalysisSummary(workspace);
        await renderProductsAnalysis(workspace);
        if (nodes.revenueStatus) nodes.revenueStatus.textContent = `Ingresos cargados de ${start || '-'} a ${end || '-'}.`;
    } catch (error) {
        activeAnalysisSummary = null;
        await renderRevenueAnalysis(workspace);
        if (nodes.revenueStatus) nodes.revenueStatus.textContent = cleanRemoteErrorMessage(error?.message || error);
    }
}

async function loadProductsAnalysis(project, workspace) {
    const nodes = getAnalysisNodes(workspace);
    const start = nodes.productsStart?.value || '';
    const end = nodes.productsEnd?.value || '';
    const dateError = validateProductsAnalysisDates(workspace);

    if (dateError) {
        showAnalysisDateError(workspace, dateError);
        return;
    }

    hideAnalysisDateError(workspace);
    if (nodes.productsStatus) nodes.productsStatus.textContent = 'Cargando productos desde WordPress...';

    try {
        const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/wordpress/analysis/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
        activeAnalysisSummary = data.summary || null;
        await renderProductsAnalysis(workspace);
        await renderAnalysisSummary(workspace);
        if (nodes.productsStatus) nodes.productsStatus.textContent = `Productos cargados de ${start || '-'} a ${end || '-'}.`;
    } catch (error) {
        activeAnalysisSummary = null;
        await renderProductsAnalysis(workspace);
        if (nodes.productsStatus) nodes.productsStatus.textContent = cleanRemoteErrorMessage(error?.message || error);
    }
}

function openAnalysisView(project, workspace) {
    const nodes = getAnalysisNodes(workspace);
    if (!nodes.page) return;

    workspace.querySelectorAll('[data-project-main-section]').forEach((section) => {
        section.hidden = true;
    });
    getCustomerNodes(workspace).page.hidden = true;
    nodes.page.hidden = false;
    stopSplashScene();
    syncTopbarUploadAction(workspace);

    if (nodes.title) nodes.title.textContent = `Analisis ${activeWordPressConnection?.siteName || ''}`.trim();
    if (nodes.status) nodes.status.textContent = 'Analisis de rendimiento de la web conectada.';
    setDefaultAnalysisDates(workspace);
    setDefaultProductsAnalysisDates(workspace);
    setDefaultRevenueAnalysisDates(workspace);
    setDefaultOrdersAnalysisDates(workspace);
    setDefaultVisitsAnalysisDates(workspace);
    setAnalysisSection(workspace, 'summary');
    loadAnalysisSummary(project, workspace);
}

function closeAnalysisView(project, workspace, workspaceState) {
    showProjectHome(project, workspace, workspaceState);
}

function exportCustomersCsv(project) {
    const headers = ['Nombre', 'Usuario', 'N. pedidos', 'Ultima actividad', 'Registro', 'Email', 'Gasto total', 'VMP', 'Pais', 'Ciudad', 'Region', 'Cod. Postal'];
    const lines = [
        headers.join(';'),
        ...activeWordPressCustomers.map((customer) => [
            customer.name,
            customer.username,
            customer.orderCount,
            formatCustomerDate(customer.lastActivity),
            formatCustomerDate(customer.registeredAt),
            customer.email,
            formatCurrency(customer.totalSpent),
            formatCurrency(customer.averageOrderValue),
            customer.country,
            customer.city,
            customer.region,
            customer.postcode
        ].map(toCsvCell).join(';'))
    ];

    downloadFile(`${projectFileBaseName(project)}-clientes-wordpress.csv`, `\uFEFF${lines.join('\n')}\n`, 'text/csv;charset=utf-8');
}

function renderWordPressSites(workspace, workspaceState) {
    const { sites } = getWordPressNodes(workspace);
    if (!sites) return;

    sites.replaceChildren();
    sites.hidden = availableWordPressSites.length === 0;

    availableWordPressSites.forEach((site) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'project-wordpress-site';
        button.dataset.wordpressSiteId = site.id;

        const name = document.createElement('strong');
        name.textContent = site.name || site.url;

        const url = document.createElement('span');
        url.textContent = site.url || '';

        button.append(name, url);
        button.addEventListener('click', () => selectWordPressSite(workspace, workspaceState, site.id));
        sites.appendChild(button);
    });
}

function updateWordPressRowCell(workspace, rowIndex, row) {
    const cell = workspace.querySelector(`[data-project-wordpress-row-index="${rowIndex}"]`);
    if (!cell) return;

    cell.replaceChildren(renderWordPressMatch(row));
}

function getRowsPendingWordPressCheck(workspaceState) {
    if (!activeWordPressConnection) return [];

    return (workspaceState.rows || [])
        .map((row, rowIndex) => ({
            row,
            rowIndex,
            partNumber: getRowPartNumber(row, workspaceState)
        }))
        .filter((entry) => entry.partNumber && !entry.row?.wordpressMatch?.checked);
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function clearWordPressMatches(workspaceState) {
    (workspaceState.rows || []).forEach((row) => {
        row.wordpressMatch = null;
    });
}

function scheduleWordPressAutoCheck(project, workspace, workspaceState) {
    if (!activeWordPressConnection) return;
    if (!getRowsPendingWordPressCheck(workspaceState).length) return;
    if (activeWordPressAutoRun) return;

    activeWordPressAutoRun = window.setTimeout(() => {
        activeWordPressAutoRun = null;
        autoCheckWordPressRows(project, workspace, workspaceState);
    }, 350);
}

async function autoCheckWordPressRows(project, workspace, workspaceState) {
    const pending = getRowsPendingWordPressCheck(workspaceState);
    if (!pending.length) return;

    const runId = `${project.id}:${Date.now()}`;
    workspace.dataset.wordpressAutoRunId = runId;

    const chunkSize = 30;
    let checkedCount = 0;

    for (let index = 0; index < pending.length; index += chunkSize) {
        if (workspace.dataset.wordpressAutoRunId !== runId) return;

        const chunk = pending.slice(index, index + chunkSize);
        const partNumbers = [...new Set(chunk.map((entry) => entry.partNumber))];
        setWordPressStatus(workspace, `Comparando WordPress: ${Math.min(index + chunk.length, pending.length)} de ${pending.length} PN...`);

        try {
            const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/wordpress/check`, {
                method: 'POST',
                body: JSON.stringify({ partNumbers })
            });
            const checkedAt = new Date().toISOString();
            const results = data.results || {};

            chunk.forEach((entry) => {
                const result = results[entry.partNumber] || { exists: false, matches: [] };
                entry.row.wordpressMatch = {
                    checked: true,
                    exists: Boolean(result.exists),
                    partNumber: entry.partNumber,
                    source: result.source || '',
                    matches: Array.isArray(result.matches) ? result.matches : [],
                    checkedAt
                };
                updateWordPressRowCell(workspace, entry.rowIndex, entry.row);
                checkedCount += 1;
            });

            activeWordPressConnection = data.connection || activeWordPressConnection;
            await saveWorkspace(project, workspaceState);
        } catch (error) {

            return;
        }

        await delay(60);
    }

    const found = (workspaceState.rows || []).filter((row) => row.wordpressMatch?.exists).length;
    setWordPressStatus(workspace, `Comparacion WordPress terminada: ${found} OK de ${checkedCount} comprobados.`);
    syncWordPressUi(workspace, workspaceState);
}

function openWordPressModal(workspace, workspaceState) {
    const { modal } = getWordPressNodes(workspace);
    if (!modal) return;

    syncWordPressUi(workspace, workspaceState);
    modal.hidden = false;
}

function closeWordPressModal(workspace) {
    const { modal } = getWordPressNodes(workspace);
    if (modal) modal.hidden = true;
}

async function loadWordPressConnection(project) {
    const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/wordpress`);
    activeWordPressConnection = data.connection || null;
    availableWordPressSites = Array.isArray(data.sites) ? data.sites : [];
    return activeWordPressConnection;
}

async function startWordPressOAuth(project, workspace) {
    const { login } = getWordPressNodes(workspace);
    if (login) login.disabled = true;
    setWordPressStatus(workspace, 'Abriendo WordPress.com...');

    try {
        const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/wordpress/oauth/start`, {
            method: 'POST',
            body: JSON.stringify({ returnUrl: window.location.href })
        });
        window.location.href = data.authUrl;
    } catch (error) {
        setWordPressStatus(workspace, `No se pudo abrir WordPress.com: ${String(error?.message || error)}`, true);
        if (login) login.disabled = false;
    }
}

async function selectWordPressSite(workspace, workspaceState, siteId) {
    const project = activeWorkspaceProject || { id: workspaceState.projectId || new URL(window.location.href).searchParams.get('project') || '' };
    const projectId = project.id;
    setWordPressStatus(workspace, 'Conectando el sitio seleccionado...');

    try {
        const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(projectId)}/wordpress/select-site`, {
            method: 'POST',
            body: JSON.stringify({ siteId })
        });
        clearWordPressMatches(workspaceState);
        activeWordPressConnection = data.connection || null;
        availableWordPressSites = Array.isArray(data.sites) ? data.sites : availableWordPressSites;
        renderWorkspace(workspace, project, workspaceState);
        syncWordPressUi(workspace, workspaceState);
        scheduleWordPressAutoCheck(project, workspace, workspaceState);
    } catch (error) {
        setWordPressStatus(workspace, `No se pudo conectar ese sitio: ${String(error?.message || error)}`, true);
    }
}

async function connectWordPressFromForm(project, workspace, workspaceState) {
    const nodes = getWordPressNodes(workspace);
    const siteUrl = nodes.site?.value || '';
    const username = nodes.username?.value || '';
    const applicationPassword = nodes.password?.value || '';

    if (!siteUrl || !username || !applicationPassword) {
        setWordPressStatus(workspace, 'Rellena URL, usuario y application password para la conexion manual.', true);
        return;
    }

    if (nodes.connect) nodes.connect.disabled = true;
    setWordPressStatus(workspace, 'Conectando con WordPress...');

    try {
        const data = await fetchProjectJson(`/api/projects/${encodeURIComponent(project.id)}/wordpress/connect`, {
            method: 'POST',
            body: JSON.stringify({ siteUrl, username, applicationPassword })
        });
        clearWordPressMatches(workspaceState);
        activeWordPressConnection = data.connection || null;
        if (nodes.password) nodes.password.value = '';
        renderWorkspace(workspace, project, workspaceState);
        syncWordPressUi(workspace, workspaceState);
        scheduleWordPressAutoCheck(project, workspace, workspaceState);
    } catch (error) {
        setWordPressStatus(workspace, `No se pudo conectar: ${String(error?.message || error)}`, true);
    } finally {
        if (nodes.connect) nodes.connect.disabled = false;
    }
}

async function checkWordPressRows(project, workspace, workspaceState) {
    const rowsWithPartNumbers = (workspaceState.rows || []).filter((row) => getRowPartNumber(row, workspaceState));

    if (!rowsWithPartNumbers.length) {
        setWordPressStatus(workspace, 'No hay part numbers para comprobar.', true);
        return;
    }

    const { check } = getWordPressNodes(workspace);
    if (check) check.disabled = true;

    try {
        clearWordPressMatches(workspaceState);
        await saveWorkspace(project, workspaceState);
        renderWorkspace(workspace, project, workspaceState);
        syncWordPressUi(workspace, workspaceState);
        await autoCheckWordPressRows(project, workspace, workspaceState);
    } catch (error) {
        setWordPressStatus(workspace, `No se pudo comprobar WordPress: ${String(error?.message || error)}`, true);
    } finally {
        syncWordPressUi(workspace, workspaceState);
    }
}

function bindWorkspaceActions(workspace, project, workspaceState) {
    const pdfButton = document.querySelector('[data-project-pdf-button]');
    const changeTypeButton = document.querySelector('[data-project-change-type-button]');
    const typeButtons = [...workspace.querySelectorAll('[data-project-type-choice]')];
    const typeBackButton = workspace.querySelector('[data-project-type-back]');
    const startUploadButton = workspace.querySelector('[data-project-start-upload]');
    const startSavedButton = workspace.querySelector('[data-project-start-saved]');
    const pdfInput = workspace.querySelector('[data-project-pdf-input]');
    const pdfStatus = workspace.querySelector('[data-project-pdf-status]');
    const tableWrap = workspace.querySelector('[data-project-import-table-wrap]');
    const exportJson = document.querySelector('[data-project-export-json]');
    const exportCsv = document.querySelector('[data-project-export-csv]');
    const wordpressNodes = getWordPressNodes(workspace);
    const savedNodes = getSavedWorkspaceNodes(workspace);
    const customerNodes = getCustomerNodes(workspace);
    const analysisNodes = getAnalysisNodes(workspace);

    pdfButton?.addEventListener('click', () => {
        const customersOpen = !customerNodes.page?.hidden;
        const analysisOpen = !analysisNodes.page?.hidden;
        if (customersOpen || analysisOpen) {
            showProjectHome(project, workspace, workspaceState);
            return;
        }
        if (!workspaceState.documentType) {
            renderWorkspace(workspace, project, workspaceState);
            return;
        }
        if (workspaceState.documentType === 'invoices') {
            openInvoiceUploadChoice(workspace, workspaceState, pdfInput, { append: false });
            return;
        }
        preparePdfInputForDocumentType(pdfInput, workspaceState);
        pdfInput?.click();
    });
    changeTypeButton?.addEventListener('click', () => {
        returnToDocumentTypeChooser(project, workspace, workspaceState);
    });
    typeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            selectProjectDocumentType(project, workspace, workspaceState, button.dataset.projectTypeChoice);
        });
    });
    typeBackButton?.addEventListener('click', () => clearProjectDocumentType(project, workspace, workspaceState));
    startUploadButton?.addEventListener('click', () => {
        if (workspaceState.documentType === 'invoices') {
            openInvoiceUploadChoice(workspace, workspaceState, pdfInput, { append: false });
            return;
        }
        preparePdfInputForDocumentType(pdfInput, workspaceState);
        pdfInput?.click();
    });
    startSavedButton?.addEventListener('click', () => openSavedWorkspaceModal(project, workspace, workspaceState));
    savedNodes.saveButton?.addEventListener('click', () => openSaveWorkspaceModal(workspace));
    savedNodes.listButton?.addEventListener('click', () => openSavedWorkspaceModal(project, workspace, workspaceState));
    savedNodes.saveClose?.addEventListener('click', () => closeSaveWorkspaceModal(workspace));
    savedNodes.saveModal?.addEventListener('click', (event) => {
        if (event.target === savedNodes.saveModal) closeSaveWorkspaceModal(workspace);
    });
    savedNodes.close?.addEventListener('click', () => closeSavedWorkspaceModal(workspace));
    savedNodes.modal?.addEventListener('click', (event) => {
        if (event.target === savedNodes.modal) closeSavedWorkspaceModal(workspace);
    });
    savedNodes.form?.addEventListener('submit', (event) => {
        event.preventDefault();
        saveWorkspaceSnapshotFromModal(project, workspace, workspaceState);
    });
    wordpressNodes.button?.addEventListener('click', () => openWordPressModal(workspace, workspaceState));
    wordpressNodes.login?.addEventListener('click', () => startWordPressOAuth(project, workspace));
    wordpressNodes.close?.addEventListener('click', () => closeWordPressModal(workspace));
    wordpressNodes.modal?.addEventListener('click', (event) => {
        if (event.target === wordpressNodes.modal) closeWordPressModal(workspace);
    });
    wordpressNodes.form?.addEventListener('submit', (event) => {
        event.preventDefault();
        connectWordPressFromForm(project, workspace, workspaceState);
    });
    wordpressNodes.check?.addEventListener('click', () => {
        checkWordPressRows(project, workspace, workspaceState);
    });
    customerNodes.button?.addEventListener('click', () => openCustomersView(project, workspace));
    customerNodes.close?.addEventListener('click', () => closeCustomersView(project, workspace, workspaceState));
    customerNodes.search?.addEventListener('input', () => renderCustomersTable(workspace));
    customerNodes.exportButton?.addEventListener('click', () => exportCustomersCsv(project));
    analysisNodes.button?.addEventListener('click', () => openAnalysisView(project, workspace));
    analysisNodes.close?.addEventListener('click', () => closeAnalysisView(project, workspace, workspaceState));
    analysisNodes.summaryForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        loadAnalysisSummary(project, workspace);
    });
    analysisNodes.productsForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        loadProductsAnalysis(project, workspace);
    });
    analysisNodes.revenueForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        loadRevenueAnalysis(project, workspace);
    });
    analysisNodes.ordersForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        loadOrdersAnalysis(project, workspace);
    });
    analysisNodes.visitsForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        loadVisitsAnalysis(project, workspace);
    });
    analysisNodes.seoRefresh?.addEventListener('click', () => {
        loadSeoAudit(project, workspace);
    });
    analysisNodes.seoSearch?.addEventListener('input', () => {
        renderSeoAudit(workspace);
    });
    analysisNodes.seoModalClose?.addEventListener('click', () => closeSeoEditor(workspace));
    analysisNodes.seoModal?.addEventListener('click', (event) => {
        if (event.target === analysisNodes.seoModal) closeSeoEditor(workspace);
    });
    analysisNodes.seoForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        saveSeoEditor(project, workspace);
    });
    analysisNodes.seoFields.forEach((field) => {
        field.addEventListener('input', () => renderSeoEditorPreview(workspace));
    });
    analysisNodes.calendarToggle?.addEventListener('click', () => toggleAnalysisRangeMenu(workspace));
    analysisNodes.presetButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const shouldLoad = applyAnalysisPreset(workspace, button.dataset.projectAnalysisPreset);
            if (shouldLoad) loadAnalysisSummary(project, workspace);
        });
    });
    analysisNodes.productsCalendarToggle?.addEventListener('click', () => toggleProductsAnalysisRangeMenu(workspace));
    analysisNodes.productsPresetButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const shouldLoad = applyProductsAnalysisPreset(workspace, button.dataset.projectAnalysisProductsPreset);
            if (shouldLoad) loadProductsAnalysis(project, workspace);
        });
    });
    analysisNodes.revenueCalendarToggle?.addEventListener('click', () => toggleRevenueAnalysisRangeMenu(workspace));
    analysisNodes.revenuePresetButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const shouldLoad = applyRevenueAnalysisPreset(workspace, button.dataset.projectAnalysisRevenuePreset);
            if (shouldLoad) loadRevenueAnalysis(project, workspace);
        });
    });
    analysisNodes.ordersCalendarToggle?.addEventListener('click', () => toggleOrdersAnalysisRangeMenu(workspace));
    analysisNodes.ordersPresetButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const shouldLoad = applyOrdersAnalysisPreset(workspace, button.dataset.projectAnalysisOrdersPreset);
            if (shouldLoad) loadOrdersAnalysis(project, workspace);
        });
    });
    analysisNodes.visitsCalendarToggle?.addEventListener('click', () => toggleVisitsAnalysisRangeMenu(workspace));
    analysisNodes.visitsPresetButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const shouldLoad = applyVisitsAnalysisPreset(workspace, button.dataset.projectAnalysisVisitsPreset);
            if (shouldLoad) loadVisitsAnalysis(project, workspace);
        });
    });
    analysisNodes.errorClose?.addEventListener('click', () => hideAnalysisDateError(workspace));
    analysisNodes.errorModal?.addEventListener('click', (event) => {
        if (event.target === analysisNodes.errorModal) hideAnalysisDateError(workspace);
    });
    analysisNodes.orderModalClose?.addEventListener('click', () => closeOrderModal(workspace));
    analysisNodes.orderModal?.addEventListener('click', (event) => {
        if (event.target === analysisNodes.orderModal) closeOrderModal(workspace);
    });
    [analysisNodes.start, analysisNodes.end].forEach((input) => {
        input?.addEventListener('change', () => {
            hideAnalysisDateError(workspace);
            validateAnalysisDates(workspace);
        });
    });
    [analysisNodes.productsStart, analysisNodes.productsEnd].forEach((input) => {
        input?.addEventListener('change', () => {
            hideAnalysisDateError(workspace);
            validateProductsAnalysisDates(workspace);
        });
    });
    [analysisNodes.revenueStart, analysisNodes.revenueEnd].forEach((input) => {
        input?.addEventListener('change', () => {
            hideAnalysisDateError(workspace);
            validateRevenueAnalysisDates(workspace);
        });
    });
    [analysisNodes.ordersStart, analysisNodes.ordersEnd].forEach((input) => {
        input?.addEventListener('change', () => {
            hideAnalysisDateError(workspace);
            validateOrdersAnalysisDates(workspace);
        });
    });
    [analysisNodes.visitsStart, analysisNodes.visitsEnd].forEach((input) => {
        input?.addEventListener('change', () => {
            hideAnalysisDateError(workspace);
            validateVisitsAnalysisDates(workspace);
        });
    });
    analysisNodes.tabs.forEach((button) => {
        button.addEventListener('click', () => {
            const section = button.dataset.projectAnalysisTab;
            setAnalysisSection(workspace, section);
            if (section === 'products') {
                setDefaultProductsAnalysisDates(workspace);
                loadProductsAnalysis(project, workspace);
            } else if (section === 'revenue') {
                setDefaultRevenueAnalysisDates(workspace);
                loadRevenueAnalysis(project, workspace);
            } else if (section === 'orders') {
                setDefaultOrdersAnalysisDates(workspace);
                loadOrdersAnalysis(project, workspace);
            } else if (section === 'visits') {
                setDefaultVisitsAnalysisDates(workspace);
                loadVisitsAnalysis(project, workspace);
            } else if (section === 'seo') {
                loadSeoAudit(project, workspace);
            }
        });
    });

    tableWrap?.addEventListener('scroll', () => {
        const tableRows = [...workspace.querySelectorAll('[data-project-row-index]')];
        if (!tableRows.length) return;

        const wrapTop = tableWrap.getBoundingClientRect().top + 42;
        const nearest = tableRows.reduce((best, rowNode) => {
            const distance = Math.abs(rowNode.getBoundingClientRect().top - wrapTop);
            return !best || distance < best.distance ? { rowNode, distance } : best;
        }, null);

        if (nearest?.rowNode) {
            setActiveTableRow(workspace, Number(nearest.rowNode.dataset.projectRowIndex), workspaceState);
        }
    }, { passive: true });

    pdfInput?.addEventListener('change', async () => {
        const file = pdfInput.files?.[0];
        if (!file) return;

        try {
            if (!workspaceState.documentType) {
                if (pdfStatus) pdfStatus.textContent = 'Primero elige si quieres leer productos o facturas.';
                renderWorkspace(workspace, project, workspaceState);
                return;
            }

            if (workspaceState.documentType === 'invoices') {
                const appendInvoices = pdfInput.dataset.invoiceUploadMode === 'append';
                await importInvoiceFiles(project, workspace, workspaceState, pdfInput.files || [], (message) => {
                    if (pdfStatus) pdfStatus.textContent = message;
                }, { append: appendInvoices });
                return;
            }

            const documentKind = getUploadDocumentKind(file);
            if (documentKind === 'unknown') {
                throw new Error('Formato no soportado. Usa PDF, Excel, CSV o Word.');
            }

            const isPdf = documentKind === 'pdf';
            if (pdfStatus) pdfStatus.textContent = 'Guardando documento en el proyecto...';
            await saveProjectPdf(project, file);

            let result = null;
            if (pdfStatus) pdfStatus.textContent = isPdf ? 'Analizando PDF...' : 'Convirtiendo a PDF y analizando con el extractor...';

            try {
                const backendResult = await extractProjectPdfWithBackend(project);
                const convertedDocument = backendResult.convertedDocument || null;
                const resolvedDocumentKind = 'pdf';
                const resolvedFileName = toPdfFileName(
                    convertedDocument?.fileName || backendResult.convertedPdfFileName || backendResult.fileName || file.name,
                    'documento.pdf'
                );
                let resultPdfDocument = null;

                try {
                    const loadedPdf = await loadProjectActivePdfDocument(project);
                    resultPdfDocument = loadedPdf.pdfDocument || null;
                } catch (loadError) {
                    if (!isPdf) {
                        console.warn('No se pudo cargar el PDF convertido del documento:', loadError);
                    } else {
                        console.warn('No se pudo cargar el PDF activo del proyecto. Usando el PDF subido:', loadError);
                        resultPdfDocument = await loadPdfDocumentFromFile(file);
                    }
                }

                if (!resultPdfDocument) {
                    throw new Error(`No se pudo cargar el PDF ${isPdf ? 'subido' : 'convertido'} de "${file.name}".`);
                }

                if (backendResult.rows.length) {
                    result = {
                        ...backendResult,
                        documentKind: resolvedDocumentKind,
                        fileName: resolvedFileName,
                        pdfDocument: resultPdfDocument,
                        tablePages: backendResult.extractionReport?.tablesDetected || 0,
                        skippedPages: Math.max(0, Number(backendResult.pageCount || 0) - Number(backendResult.extractionReport?.tablesDetected || 0)),
                        source: 'backend'
                    };
                } else if (pdfStatus && isPdf) {
                    const report = backendResult.extractionReport;
                    const engines = Array.isArray(report?.engines)
                        ? report.engines.map((engine) => `${engine.name}:${engine.status}`).join(', ')
                        : 'sin motores utiles';
                    pdfStatus.textContent = `Extractor avanzado sin filas (${engines}). Usando extractor local...`;
                } else {
                    result = {
                        ...backendResult,
                        documentKind: resolvedDocumentKind,
                        fileName: resolvedFileName,
                        pdfDocument: resultPdfDocument,
                        tablePages: backendResult.extractionReport?.tablesDetected || 0,
                        skippedPages: 0,
                        source: 'backend'
                    };
                }
            } catch (error) {
                if (pdfStatus && isPdf) {
                    pdfStatus.textContent = `Extractor avanzado no disponible (${String(error?.message || error)}). Usando extractor local...`;
                } else {
                    throw error;
                }
            }

            if (!result) {
                if (!isPdf) {
                    throw new Error('No se detectaron filas utiles en el documento.');
                }
                result = await parsePdfRows(file, (message) => {
                    if (pdfStatus) pdfStatus.textContent = message;
                });
                result.documentKind = 'pdf';
                result.extractionReport = {
                    selectedEngine: 'browser-pdfjs',
                    tablesDetected: Number(result.tablePages || 0),
                    rowsExtracted: Number(result.rows?.length || 0),
                    precision: result.rows?.length ? 0.72 : 0,
                    processMs: null,
                    problems: result.skippedPages ? [`${result.skippedPages} paginas omitidas por no parecer tabla.`] : [],
                    engines: [{
                        name: 'browser-pdfjs',
                        status: result.rows?.length ? 'ok' : 'empty',
                        tablesDetected: Number(result.tablePages || 0),
                        rowsExtracted: Number(result.rows?.length || 0),
                        precision: result.rows?.length ? 0.72 : 0,
                        processMs: null,
                        problems: []
                    }]
                };
            }

            activePdfDocument = result.pdfDocument;
            workspaceState.documentType = 'products';
            workspaceState.documentKind = 'pdf';
            workspaceState.fileName = toPdfFileName(result.fileName || file.name, 'documento.pdf');
            workspaceState.pageCount = result.pageCount;
            workspaceState.headerLabels = result.headerLabels || {};
            workspaceState.columns = result.columns || [];
            workspaceState.rows = result.rows || [];
            workspaceState.preview = null;
            workspaceState.invoice = null;
            workspaceState.invoices = [];
            workspaceState.activeInvoiceId = '';
            workspaceState.extractionReport = result.extractionReport || null;

            await saveWorkspace(project, workspaceState);
            renderWorkspace(workspace, project, workspaceState);
            syncWordPressUi(workspace, workspaceState);
            scheduleWordPressAutoCheck(project, workspace, workspaceState);

            if (pdfStatus) {
                const engineLabel = workspaceState.extractionReport?.selectedEngine
                    ? ` con ${workspaceState.extractionReport.selectedEngine}`
                    : '';
                const precisionLabel = Number.isFinite(Number(workspaceState.extractionReport?.precision))
                    ? ` Precision aprox. ${Math.round(Number(workspaceState.extractionReport.precision) * 100)}%.`
                    : '';
                pdfStatus.textContent = result.rows.length
                    ? `${isPdf ? 'PDF' : 'Documento'} importado${engineLabel}: ${result.rows.length} filas detectadas.${isPdf ? ` ${result.tablePages} paginas de tabla (${result.skippedPages} omitidas).` : ''}${precisionLabel}`
                    : `${isPdf ? 'PDF leido' : 'Documento leido'}, pero no se detectaron tablas utiles.`;
            }
        } catch (error) {
            if (pdfStatus) pdfStatus.textContent = `Error importando documento: ${String(error?.message || error)}`;
        } finally {
            pdfInput.value = '';
            delete pdfInput.dataset.invoiceUploadMode;
        }
    });

    workspace.querySelector('[data-project-pdf-previous-page]')?.addEventListener('click', () => {
        if (!activePdfDocument || activePdfPageNumber <= 1) return;
        renderPdfFirstPage(workspace, workspaceState.invoice || getActiveInvoiceRecord(workspaceState)?.invoice || null, activePdfPageNumber - 1)
            .catch((error) => console.warn('No se pudo mostrar la pagina anterior:', error));
    });

    workspace.querySelector('[data-project-pdf-next-page]')?.addEventListener('click', () => {
        if (!activePdfDocument || activePdfPageNumber >= activePdfDocument.numPages) return;
        renderPdfFirstPage(workspace, workspaceState.invoice || getActiveInvoiceRecord(workspaceState)?.invoice || null, activePdfPageNumber + 1)
            .catch((error) => console.warn('No se pudo mostrar la pagina siguiente:', error));
    });

    exportJson?.addEventListener('click', () => {
        const payload = {
            project,
            documentType: workspaceState.documentType || '',
            fileName: workspaceState.fileName,
            pageCount: workspaceState.pageCount,
            columns: workspaceState.columns || [],
            invoice: workspaceState.invoice || null,
            invoices: workspaceState.invoices || [],
            activeInvoiceId: workspaceState.activeInvoiceId || '',
            extractionReport: workspaceState.extractionReport || null,
            exportedAt: new Date().toISOString(),
            rows: workspaceState.rows || []
        };
        downloadFile(`${projectFileBaseName(project)}-import.json`, `${JSON.stringify(payload, null, 2)}\n`, 'application/json;charset=utf-8');
    });

    exportCsv?.addEventListener('click', async () => {
        if (workspaceState.documentType === 'invoices') {
            const invoiceBatch = Array.isArray(workspaceState.invoices) ? workspaceState.invoices : [];
            const hasSingleInvoice = workspaceState.invoice && typeof workspaceState.invoice === 'object';
            const hasInvoiceBatch = !hasSingleInvoice && invoiceBatch.length > 0;
            if (!hasSingleInvoice && !hasInvoiceBatch) {
                const pdfStatus = workspace.querySelector('[data-project-pdf-status]');
                if (pdfStatus) pdfStatus.textContent = 'Sube o abre facturas antes de exportarlas a Excel.';
                return;
            }
            try {
                exportCsv.disabled = true;
                exportCsv.textContent = 'Generando Excel...';
                const { blob, filename } = await fetchProjectBlob(`/api/projects/${encodeURIComponent(project.id)}/invoice/export-xlsx`, {
                    method: 'POST',
                    body: JSON.stringify({
                        fileName: workspaceState.fileName || '',
                        invoice: hasSingleInvoice ? workspaceState.invoice : null,
                        invoices: hasInvoiceBatch ? invoiceBatch : [],
                        extractionReport: workspaceState.extractionReport || null
                    })
                });
                downloadBlob(filename || `${projectFileBaseName(project)}-${hasInvoiceBatch ? 'facturas' : 'factura'}.xlsx`, blob);
            } catch (error) {
                const pdfStatus = workspace.querySelector('[data-project-pdf-status]');
                if (pdfStatus) pdfStatus.textContent = `No se pudo exportar Excel: ${String(error?.message || error)}`;
            } finally {
                exportCsv.disabled = !hasWorkspaceDocument(workspaceState);
                exportCsv.textContent = 'Exportar Excel';
            }
            return;
        }

        const exportColumns = getActiveColumns(workspaceState).filter((column) => column.key !== 'actions');
        const lines = [
            exportColumns.map((column) => getColumnLabel(column, workspaceState)).join(';'),
            ...(workspaceState.rows || []).map((row) => exportColumns
                .map((column) => toCsvCell(getRowValue(row, column)))
                .join(';'))
        ];
        downloadFile(`${projectFileBaseName(project)}-import.csv`, `\uFEFF${lines.join('\n')}\n`, 'text/csv;charset=utf-8');
    });
}

export async function mountProjectWorkspace(project, user) {
    if (!project || project.template === 'milu') {
        showMiluApplication();
        return;
    }

    ensureWorkspaceStylesheet();
    hideMiluApplication();
    activeWorkspaceProject = project;
    activePdfDocument = null;
    stopSplashScene();
    localStorage.removeItem(getProjectStorageKey(project));
    if (activeWordPressAutoRun) {
        window.clearTimeout(activeWordPressAutoRun);
        activeWordPressAutoRun = null;
    }

    document.querySelectorAll('[data-project-workspace], [data-project-workspace-topbar]').forEach((node) => {
        node.remove();
    });

    const holder = await loadWorkspaceTemplate();
    const template = holder.querySelector('#miluProjectWorkspaceTemplate');
    if (!template) {
        throw new Error('No se encontro la plantilla base de proyecto.');
    }

    const fragment = template.content.cloneNode(true);
    const workspace = fragment.querySelector('[data-project-workspace]');
    const topbarName = fragment.querySelector('[data-project-topbar-name]');
    const userName = fragment.querySelector('[data-project-user-name]');
    const logoutButton = fragment.querySelector('[data-project-logout]');
    const icon = workspace.querySelector('[data-project-icon]');
    const name = workspace.querySelector('[data-project-name]');
    const pdfStatus = workspace.querySelector('[data-project-pdf-status]');

    if (topbarName) topbarName.textContent = project.name;
    if (userName) userName.textContent = user?.displayName || user?.username || 'Usuario';
    logoutButton?.addEventListener('click', logoutProjectSession);

    if (icon) icon.textContent = project.icon || project.name.slice(0, 1).toUpperCase();
    if (name) name.textContent = project.name;
    if (pdfStatus) pdfStatus.textContent = project.description || 'Preparado para importar tablas.';

    document.body.appendChild(fragment);
    bindResponsiveHeaderMenu();

    const mountedWorkspace = document.querySelector('[data-project-workspace]');
    const workspaceState = await readSavedWorkspace(project);
    activeWordPressConnection = null;
    try {
        await loadWordPressConnection(project);
    } catch (_) {
        activeWordPressConnection = null;
    }

    renderWorkspace(mountedWorkspace, project, workspaceState);
    bindWorkspaceActions(mountedWorkspace, project, workspaceState);
    syncWordPressUi(mountedWorkspace, workspaceState);
    await loadSavedProjectPdf(project, mountedWorkspace, workspaceState);
    scheduleWordPressAutoCheck(project, mountedWorkspace, workspaceState);
}
