import { runTableParser } from '../milu-demo/js/pdf-table-parser.js';

const WORKSPACE_TEMPLATE_URL = new URL('./project-workspace.html', import.meta.url).href;
const TOKEN_KEY = 'milu:auth:token:v1';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const CHARTJS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';

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
let activePdfDocument = null;
let activePdfRenderTask = null;
let activeWordPressConnection = null;
let availableWordPressSites = [];
let activeWorkspaceProject = null;
let activeWordPressAutoRun = null;
let activeWordPressCustomers = [];
let activeAnalysisSummary = null;
let activeAnalysisCharts = {};

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

function safeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
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

function readLocalWorkspace(project) {
    try {
        const raw = localStorage.getItem(getProjectStorageKey(project));
        if (!raw) return { rows: [], fileName: '', pageCount: 0, headerLabels: {}, columns: [] };
        const parsed = JSON.parse(raw);
        return {
            rows: Array.isArray(parsed.rows) ? parsed.rows : [],
            fileName: String(parsed.fileName || ''),
            pageCount: Number(parsed.pageCount || 0),
            headerLabels: parsed.headerLabels && typeof parsed.headerLabels === 'object' ? parsed.headerLabels : {},
            columns: Array.isArray(parsed.columns) ? parsed.columns : []
        };
    } catch (_) {
        return { rows: [], fileName: '', pageCount: 0, headerLabels: {}, columns: [] };
    }
}

async function readSavedWorkspace(project) {
    try {
        const workspace = await fetchWorkspaceApi(project);
        if (workspace && Array.isArray(workspace.rows)) {
            localStorage.setItem(getProjectStorageKey(project), JSON.stringify(workspace));
            return workspace;
        }
    } catch (_) {
        // Si el backend no responde, usamos la ultima copia local.
    }

    return readLocalWorkspace(project);
}

async function saveWorkspace(project, workspaceState) {
    const payload = {
        fileName: workspaceState.fileName || '',
        pageCount: Number(workspaceState.pageCount || 0),
        headerLabels: workspaceState.headerLabels || {},
        columns: workspaceState.columns || [],
        rows: workspaceState.rows || [],
        updatedAt: new Date().toISOString()
    };

    localStorage.setItem(getProjectStorageKey(project), JSON.stringify({
        ...payload,
        updatedAt: payload.updatedAt
    }));

    try {
        await fetchWorkspaceApi(project, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.warn('[project-workspace] No se pudo guardar en backend; queda copia local.', error);
    }
}

async function saveProjectPdf(project, file) {
    const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/pdf`), {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/pdf',
            'X-File-Name': encodeURIComponent(file.name || 'documento.pdf'),
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

async function loadSavedProjectPdf(project, workspace, workspaceState) {
    if (!workspaceState.fileName && !(workspaceState.rows || []).length) return;

    const pdfStatus = workspace.querySelector('[data-project-pdf-status]');
    const pageLabel = workspace.querySelector('[data-project-pdf-page-label]');

    try {
        if (pdfStatus && workspaceState.fileName) {
            pdfStatus.textContent = `Cargando PDF guardado: ${workspaceState.fileName}...`;
        }

        const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(project.id)}/pdf`), {
            headers: authHeaders()
        });
        if (response.status === 404) {
            if (pageLabel) pageLabel.textContent = 'PDF no cargado en esta sesion';
            return;
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.arrayBuffer();
        const pdfjsLib = await ensurePdfJs();
        activePdfDocument = await pdfjsLib.getDocument({ data }).promise;

        if (pageLabel) pageLabel.textContent = 'PDF';
        if (pdfStatus) {
            pdfStatus.textContent = workspaceState.rows?.length
                ? `PDF guardado cargado. ${workspaceState.rows.length} filas disponibles.`
                : 'PDF guardado cargado.';
        }

        if ((workspaceState.rows || []).length) {
            setActiveTableRow(workspace, 0, workspaceState);
        }
    } catch (error) {
        if (pdfStatus) {
            pdfStatus.textContent = `No se pudo cargar el PDF guardado: ${String(error?.message || error)}`;
        }
    }
}

function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
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
    if (!pageHeight || !Number.isFinite(y1) || !Number.isFinite(y2)) return null;

    return {
        page: Number(geometry.page || row.page || 1),
        y1,
        y2,
        pageHeight
    };
}

function clearPdfCellHighlights(workspace) {
    workspace.querySelectorAll('.project-pdf-cell-highlight').forEach((node) => node.remove());
}

function getPdfCellHighlightColor(key, index = 0) {
    const normalized = normalizePdfText(key)
        .replace('/', ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const colors = {
        POS: {
            border: '#2563eb',
            background: 'rgba(37, 99, 235, 0.14)'
        },
        'PART NO': {
            border: '#16a34a',
            background: 'rgba(22, 163, 74, 0.14)'
        },
        PARTNO: {
            border: '#16a34a',
            background: 'rgba(22, 163, 74, 0.14)'
        },
        'PART NUMBER': {
            border: '#16a34a',
            background: 'rgba(22, 163, 74, 0.14)'
        },
        DESIGNATION: {
            border: '#dc2626',
            background: 'rgba(220, 38, 38, 0.12)'
        },
        DESCRIPTION: {
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

async function renderPdfRow(workspace, row) {
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
        if (highlight) highlight.hidden = true;
        if (pageLabel) pageLabel.textContent = activePdfDocument ? 'PDF' : 'PDF no cargado en esta sesion';
        return;
    }

    const page = await activePdfDocument.getPage(geometry.page);
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

function getRowDisplayName(row) {
    if (row?.pos || row?.partNo || row?.designation) {
        return `POS ${row.pos || '-'} - ${row.partNo || row.designation || 'fila activa'}`;
    }

    const firstCells = Object.values(row?.cells || {}).filter(Boolean).slice(0, 2).join(' - ');
    return firstCells || 'fila activa';
}

function setActiveTableRow(workspace, rowIndex, workspaceState) {
    const rows = workspaceState.rows || [];
    const index = Math.max(0, Math.min(rows.length - 1, Number(rowIndex || 0)));
    workspace.querySelectorAll('[data-project-row-index]').forEach((tr) => {
        tr.classList.toggle('is-active', Number(tr.dataset.projectRowIndex) === index);
    });
    renderPdfRow(workspace, rows[index]);
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
    const body = workspace.querySelector('[data-project-import-body]');
    const tableWrap = workspace.querySelector('[data-project-import-table-wrap]');
    const empty = workspace.querySelector('[data-project-import-empty]');
    const fileName = workspace.querySelector('[data-project-pdf-name]');
    const totalRows = workspace.querySelector('[data-project-total-rows]');
    const pnRows = workspace.querySelector('[data-project-pn-rows]');
    const pages = workspace.querySelector('[data-project-pages]');
    const editedRows = workspace.querySelector('[data-project-edited-rows]');
    const exportJson = document.querySelector('[data-project-export-json]');
    const exportCsv = document.querySelector('[data-project-export-csv]');
    const rows = workspaceState.rows || [];

    if (fileName) fileName.textContent = workspaceState.fileName || 'Sin PDF cargado';
    if (totalRows) totalRows.textContent = String(rows.length);
    if (pnRows) pnRows.textContent = String(rows.filter((row) => hasPartNumberValue(row, workspaceState)).length);
    if (pages) pages.textContent = String(workspaceState.pageCount || new Set(rows.map((row) => row.page)).size || 0);
    if (editedRows) editedRows.textContent = String(rows.filter((row) => row.edited).length);
    if (exportJson) exportJson.disabled = rows.length === 0;
    if (exportCsv) exportCsv.disabled = rows.length === 0;

    if (empty) empty.hidden = rows.length > 0;
    if (tableWrap) tableWrap.hidden = rows.length === 0;
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

    if (nodes.button) {
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

async function openCustomersView(project, workspace) {
    const nodes = getCustomerNodes(workspace);
    if (!nodes.page) return;

    workspace.querySelectorAll('[data-project-main-section]').forEach((section) => {
        section.hidden = true;
    });
    getAnalysisNodes(workspace).page.hidden = true;
    nodes.page.hidden = false;
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

function closeCustomersView(workspace) {
    const { page } = getCustomerNodes(workspace);
    if (page) page.hidden = true;
    workspace.querySelectorAll('[data-project-main-section]').forEach((section) => {
        section.hidden = false;
    });
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

function closeAnalysisView(workspace) {
    const { page } = getAnalysisNodes(workspace);
    if (page) page.hidden = true;
    workspace.querySelectorAll('[data-project-main-section]').forEach((section) => {
        section.hidden = false;
    });
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
            setWordPressStatus(workspace, `Se paro la comparacion WordPress: ${String(error?.message || error)}`, true);
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
    const pdfInput = workspace.querySelector('[data-project-pdf-input]');
    const pdfStatus = workspace.querySelector('[data-project-pdf-status]');
    const tableWrap = workspace.querySelector('[data-project-import-table-wrap]');
    const exportJson = document.querySelector('[data-project-export-json]');
    const exportCsv = document.querySelector('[data-project-export-csv]');
    const wordpressNodes = getWordPressNodes(workspace);
    const customerNodes = getCustomerNodes(workspace);
    const analysisNodes = getAnalysisNodes(workspace);

    pdfButton?.addEventListener('click', () => pdfInput?.click());
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
    customerNodes.close?.addEventListener('click', () => closeCustomersView(workspace));
    customerNodes.search?.addEventListener('input', () => renderCustomersTable(workspace));
    customerNodes.exportButton?.addEventListener('click', () => exportCustomersCsv(project));
    analysisNodes.button?.addEventListener('click', () => openAnalysisView(project, workspace));
    analysisNodes.close?.addEventListener('click', () => closeAnalysisView(workspace));
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
            if (pdfStatus) pdfStatus.textContent = 'Preparando lectura del PDF...';
            const result = await parsePdfRows(file, (message) => {
                if (pdfStatus) pdfStatus.textContent = message;
            });

            activePdfDocument = result.pdfDocument;
            workspaceState.fileName = result.fileName;
            workspaceState.pageCount = result.pageCount;
            workspaceState.headerLabels = result.headerLabels || {};
            workspaceState.columns = result.columns || [];
            workspaceState.rows = result.rows;

            if (pdfStatus) pdfStatus.textContent = 'Guardando PDF en el proyecto...';
            await saveProjectPdf(project, file);

            saveWorkspace(project, workspaceState);
            renderWorkspace(workspace, project, workspaceState);
            syncWordPressUi(workspace, workspaceState);
            scheduleWordPressAutoCheck(project, workspace, workspaceState);

            if (pdfStatus) {
                pdfStatus.textContent = result.rows.length
                    ? `PDF importado: ${result.rows.length} filas en ${result.tablePages} paginas de tabla (${result.skippedPages} omitidas).`
                    : `PDF leido, pero no se detectaron tablas utiles (${result.skippedPages} paginas omitidas).`;
            }
        } catch (error) {
            if (pdfStatus) pdfStatus.textContent = `Error importando PDF: ${String(error?.message || error)}`;
        } finally {
            pdfInput.value = '';
        }
    });

    exportJson?.addEventListener('click', () => {
        const payload = {
            project,
            fileName: workspaceState.fileName,
            pageCount: workspaceState.pageCount,
            columns: workspaceState.columns || [],
            exportedAt: new Date().toISOString(),
            rows: workspaceState.rows || []
        };
        downloadFile(`${projectFileBaseName(project)}-import.json`, `${JSON.stringify(payload, null, 2)}\n`, 'application/json;charset=utf-8');
    });

    exportCsv?.addEventListener('click', () => {
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
    loadSavedProjectPdf(project, mountedWorkspace, workspaceState);
    scheduleWordPressAutoCheck(project, mountedWorkspace, workspaceState);
}
