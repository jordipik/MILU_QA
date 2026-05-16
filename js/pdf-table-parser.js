/**
 * Industrial tabular parser for BOM-like PDF pages.
 *
 * Flow:
 *  1) textItems -> rect geometry
 *  2) detect table area (ignore page metadata header)
 *  3) detect multiline header anchors
 *  4) detect 10/11 columns with hybrid signals
 *  5) assign rects by left-edge startX against column x1 boundaries
 *  6) build rows + grid
 *  7) build debug overlay
 */

const COLUMN_ORDER = [
    'arrow',
    'pos',
    'part_no',
    'designation',
    'model_type',
    'qty',
    'units',
    'weight',
    'fn',
    'measurement',
    'standard'
];

const REQUIRED_KEYS = ['pos', 'part_no', 'designation', 'qty', 'measurement', 'standard'];

const COLUMN_SCHEMA = {
    arrow: { key: 'arrow', label: 'ARROW', color: '#0f766e', optional: true },
    pos: { key: 'pos', label: 'POS', color: '#2563eb' },
    part_no: { key: 'part_no', label: 'PART NO.', color: '#dc2626' },
    designation: { key: 'designation', label: 'DESIGNATION', color: '#0891b2' },
    model_type: { key: 'model_type', label: 'MODEL/TYPE', color: '#d97706' },
    qty: { key: 'qty', label: 'QTY', color: '#7c3aed' },
    units: { key: 'units', label: 'UNITS', color: '#16a34a' },
    weight: { key: 'weight', label: 'WEIGHT', color: '#db2777' },
    fn: { key: 'fn', label: 'FN', color: '#0ea5e9' },
    measurement: { key: 'measurement', label: 'MEASUREMENT', color: '#ea580c' },
    standard: { key: 'standard', label: 'STANDARD', color: '#4338ca' }
};

const COLUMN_WIDTH_LIMITS = {
    arrow: { min: 10, max: 35, optional: true },
    pos: { min: 22, max: 45 },
    part_no: { min: 55, max: 110 },
    designation: { min: 90, max: 180 },
    model_type: { min: 60, max: 130 },
    qty: { min: 18, max: 35 },
    units: { min: 18, max: 35 },
    weight: { min: 35, max: 70 },
    fn: { min: 14, max: 30 },
    measurement: { min: 80, max: 170 },
    standard: { min: 45, max: 110 }
};

const TEMPLATE_RATIOS = [
    { key: 'arrow', start: 0.000, end: 0.045, optional: true },
    { key: 'pos', start: 0.045, end: 0.090 },
    { key: 'part_no', start: 0.090, end: 0.220 },
    { key: 'designation', start: 0.220, end: 0.410 },
    { key: 'model_type', start: 0.410, end: 0.560 },
    { key: 'qty', start: 0.560, end: 0.610 },
    { key: 'units', start: 0.610, end: 0.665 },
    { key: 'weight', start: 0.665, end: 0.750 },
    { key: 'fn', start: 0.750, end: 0.790 },
    { key: 'measurement', start: 0.790, end: 0.930 },
    { key: 'standard', start: 0.930, end: 1.000 }
];

const HEADER_TOKEN_TO_KEY = new Map([
    ['POS', 'pos'],
    ['POSITION', 'pos'],
    ['PART NO', 'part_no'],
    ['PARTNO', 'part_no'],
    ['PART NUMBER', 'part_no'],
    ['PARTNUMBER', 'part_no'],
    ['DESIGNATION', 'designation'],
    ['DESCRIPTION', 'designation'],
    ['MODEL/TYPE', 'model_type'],
    ['MODEL TYPE', 'model_type'],
    ['MODELTYPE', 'model_type'],
    ['QTY', 'qty'],
    ['QUANTITY', 'qty'],
    ['UNITS', 'units'],
    ['UNIT', 'units'],
    ['WEIGHT', 'weight'],
    ['WT', 'weight'],
    ['WGT', 'weight'],
    ['FN', 'fn'],
    ['FOOTNOTE', 'fn'],
    ['MEASUREMENT', 'measurement'],
    ['MEASUREMENTS', 'measurement'],
    ['STANDARD', 'standard'],
    ['STANDARDS', 'standard']
]);

const TABLE_HEADER_HINTS = [
    'POS', 'PART', 'PART NO', 'DESIGNATION', 'MODEL', 'TYPE',
    'QTY', 'UNITS', 'WEIGHT', 'FN', 'MEASUREMENT', 'STANDARD'
];

const PAGE_METADATA_HINTS = [
    'EQUI TYPE', 'PRODUCT TYPE', 'SERIAL NUMBER', 'ENGINE CABLING', 'FG/FGS', 'BOM-NO', 'BOM NO'
];

const COL_ASSIGN_COLORS = {
    arrow: 'rgba(15,118,110,0.45)',
    pos: 'rgba(37,99,235,0.45)',
    part_no: 'rgba(220,38,38,0.45)',
    designation: 'rgba(8,145,178,0.45)',
    model_type: 'rgba(217,119,6,0.45)',
    qty: 'rgba(124,58,237,0.45)',
    units: 'rgba(22,163,74,0.45)',
    weight: 'rgba(219,39,119,0.45)',
    fn: 'rgba(14,165,233,0.45)',
    measurement: 'rgba(234,88,12,0.45)',
    standard: 'rgba(67,56,202,0.45)',
    unknown: 'rgba(239,68,68,0.65)'
};

function normalizeHeaderToken(text) {
    const raw = String(text || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.]/g, ' ')
        .replace(/[\-_]/g, ' ')
        .replace(/[^A-Z0-9/\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!raw) return '';
    if (raw === 'MODEL TYPE') return 'MODEL/TYPE';
    if (raw === 'MODELTYPE') return 'MODEL/TYPE';
    if (raw === 'PARTNO') return 'PART NO';
    if (raw === 'PART NUMBER') return 'PART NO';
    if (raw === 'PARTNUMBER') return 'PART NO';
    if (raw === 'QTY') return 'QTY';
    if (raw === 'MEASUREMENTS') return 'MEASUREMENT';
    if (raw === 'STANDARDS') return 'STANDARD';
    if (raw === 'FOOTNOTE') return 'FN';
    return raw;
}

function toRight(rect) {
    return Number(rect.left || 0) + Math.max(0, Number(rect.width || 0));
}

function toBottom(rect) {
    return Number(rect.top || 0);
}

function safeMin(list, fallback = 0) {
    return list.length ? Math.min(...list) : fallback;
}

function safeMax(list, fallback = 0) {
    return list.length ? Math.max(...list) : fallback;
}

function geomPx(value, scale = 1) {
    return Number(value || 0) * Math.max(0.5, Number(scale || 1));
}

function getColumnWidthLimit(key, scale = 1) {
    const limits = COLUMN_WIDTH_LIMITS[key] || { min: 6, max: 999 };
    return {
        ...limits,
        min: geomPx(limits.min, scale),
        max: geomPx(limits.max, scale)
    };
}

function median(values) {
    if (!Array.isArray(values) || !values.length) return NaN;
    const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return NaN;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : ((sorted[mid - 1] + sorted[mid]) / 2);
}

function isShortIntegerToken(text) {
    const t = String(text || '').trim();
    return /^\d{1,3}$/.test(t);
}

function isPartNoLikeToken(text) {
    const t = normalizeHeaderToken(text);
    if (!t) return false;
    if (t.length < 6) return false;
    const hasDigit = /\d/.test(t);
    const hasLetter = /[A-Z]/.test(t);
    return hasDigit && (hasLetter || t.length >= 8);
}

function isUnitToken(text) {
    const t = normalizeHeaderToken(text);
    return ['PC', 'PCS', 'SET', 'KG', 'G'].includes(t);
}

function isWeightLikeToken(text) {
    const t = normalizeHeaderToken(text);
    if (!t) return false;
    if (/\d[\d.,]*\s*(KG|G)$/.test(t)) return true;
    if (/^\d[\d.,]*$/.test(t) && /[.,]/.test(t)) return true;
    if (/^\d{2,}$/.test(t)) return true;
    return false;
}

export function extractTextRects(textItems, viewport) {
    const rects = [];
    for (const item of (textItems || [])) {
        const str = String(item?.str || '').trim();
        if (!str) continue;

        const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
        const left = Number(tx[4] || 0);
        const top = Number(tx[5] || 0);
        const width = Math.max(1, Number(item.width || 0) * Number(viewport.scale || 1));
        const height = Math.max(8, Number(item.height || 0) * Number(viewport.scale || 1) || 12);

        rects.push({
            text: str,
            normalizedText: normalizeHeaderToken(str),
            left,
            top,
            width,
            height,
            centerX: left + (width / 2),
            centerY: top - (height / 2),
            visualTop: top - height
        });
    }
    return rects;
}

function groupIntoLines(rects, tolerance = 6) {
    const sorted = [...(rects || [])].sort((a, b) => {
        const dy = Number(a.centerY || 0) - Number(b.centerY || 0);
        if (Math.abs(dy) > 1.5) return dy;
        return Number(a.left || 0) - Number(b.left || 0);
    });

    const lines = [];
    for (const rect of sorted) {
        const dynamicTol = Math.max(tolerance, Number(rect.height || 10) * 0.55);
        const line = lines.find((item) => Math.abs(Number(item.cy || 0) - Number(rect.centerY || 0)) <= dynamicTol);
        if (line) {
            line.rects.push(rect);
            line.cy = line.rects.reduce((sum, r) => sum + Number(r.centerY || 0), 0) / line.rects.length;
        } else {
            lines.push({ cy: Number(rect.centerY || 0), rects: [rect] });
        }
    }

    return lines
        .map((line) => {
            const rectsSorted = [...line.rects].sort((a, b) => Number(a.left || 0) - Number(b.left || 0));
            const x1 = safeMin(rectsSorted.map((r) => Number(r.left || 0)), 0);
            const x2 = safeMax(rectsSorted.map((r) => toRight(r)), 0);
            const y1 = safeMin(rectsSorted.map((r) => Number(r.visualTop || 0)), Number(line.cy || 0));
            const y2 = safeMax(rectsSorted.map((r) => toBottom(r)), Number(line.cy || 0));
            return {
                cy: Number(line.cy || 0),
                x1,
                x2,
                y1,
                y2,
                width: Math.max(0, x2 - x1),
                rects: rectsSorted,
                text: rectsSorted.map((r) => String(r.text || '').trim()).filter(Boolean).join(' '),
                normalizedText: normalizeHeaderToken(rectsSorted.map((r) => String(r.text || '')).join(' '))
            };
        })
        .sort((a, b) => Number(a.cy || 0) - Number(b.cy || 0));
}

function buildClusters(rects, maxGap = 28) {
    if (!Array.isArray(rects) || !rects.length) return [];
    const sorted = [...rects].sort((a, b) => Number(a.left || 0) - Number(b.left || 0));
    const clusters = [];
    let current = null;

    sorted.forEach((rect) => {
        if (!current) {
            current = {
                rects: [rect],
                left: Number(rect.left || 0),
                right: toRight(rect),
                top: Number(rect.visualTop || 0),
                bottom: toBottom(rect),
                parts: [String(rect.text || '').trim()]
            };
            return;
        }

        const gap = Number(rect.left || 0) - Number(current.right || 0);
        if (gap <= maxGap) {
            current.rects.push(rect);
            current.right = Math.max(Number(current.right || 0), toRight(rect));
            current.top = Math.min(Number(current.top || 0), Number(rect.visualTop || 0));
            current.bottom = Math.max(Number(current.bottom || 0), toBottom(rect));
            current.parts.push(String(rect.text || '').trim());
            return;
        }

        clusters.push(current);
        current = {
            rects: [rect],
            left: Number(rect.left || 0),
            right: toRight(rect),
            top: Number(rect.visualTop || 0),
            bottom: toBottom(rect),
            parts: [String(rect.text || '').trim()]
        };
    });

    if (current) clusters.push(current);

    return clusters.map((cluster) => ({
        ...cluster,
        width: Math.max(1, Number(cluster.right || 0) - Number(cluster.left || 0)),
        centerX: (Number(cluster.left || 0) + Number(cluster.right || 0)) / 2,
        text: cluster.parts.join(' ').replace(/\s+/g, ' ').trim(),
        normalizedText: normalizeHeaderToken(cluster.parts.join(' '))
    }));
}

function detectHeaderKeyFromPhrase(phrase) {
    const normalized = normalizeHeaderToken(phrase);
    if (!normalized) return null;

    if (HEADER_TOKEN_TO_KEY.has(normalized)) return HEADER_TOKEN_TO_KEY.get(normalized);

    if (normalized.includes('PART') && normalized.includes('NO')) return 'part_no';
    if (normalized.includes('MODEL') && normalized.includes('TYPE')) return 'model_type';
    if (normalized.includes('MEASUREMENT')) return 'measurement';
    if (normalized.includes('STANDARD')) return 'standard';
    if (normalized === 'QTY' || normalized.includes('QUANTITY')) return 'qty';
    if (normalized.includes('UNITS') || normalized === 'UNIT') return 'units';
    if (normalized.includes('WEIGHT') || normalized === 'WT' || normalized === 'WGT') return 'weight';
    if (normalized === 'FN' || normalized.includes('FOOTNOTE')) return 'fn';
    if (normalized.includes('DESIGNATION') || normalized.includes('DESCRIPTION')) return 'designation';
    if (normalized === 'POS' || normalized === 'POSITION') return 'pos';
    return null;
}

function lineTokenHits(lineText, dictionary) {
    const normalized = normalizeHeaderToken(lineText);
    if (!normalized) return [];
    return dictionary.filter((token) => normalized.includes(token));
}

export function detectTableArea(rects, lines, pageInfo = {}) {
    const viewportHeight = Math.max(1, Number(pageInfo.viewportHeight || 0));
    const viewportWidth = Math.max(1, Number(pageInfo.viewportWidth || 0));
    const geomScale = Math.max(0.5, Number(pageInfo.geomScale || 1));
    if (!Array.isArray(lines) || !lines.length) {
        return {
            tableTopY: 0,
            tableBottomY: viewportHeight,
            reason: 'no-lines',
            confidence: 'low',
            headerLine: null,
            ignoredHeaderRects: []
        };
    }

    let bestCandidate = null;
    for (const line of lines) {
        const tableHits = lineTokenHits(line.normalizedText, TABLE_HEADER_HINTS);
        const metadataHits = lineTokenHits(line.normalizedText, PAGE_METADATA_HINTS);
        const spread = Number(line.width || 0) / viewportWidth;
        const score = (new Set(tableHits)).size * 2 + spread - ((new Set(metadataHits)).size * 2.5);

        if ((new Set(tableHits)).size >= 3 && spread >= 0.35 && (new Set(metadataHits)).size <= 1) {
            if (!bestCandidate || score > bestCandidate.score || line.cy < bestCandidate.line.cy) {
                bestCandidate = { line, score, tableHits, metadataHits };
            }
        }
    }

    if (!bestCandidate) {
        const fallbackTop = Math.max(0, viewportHeight * 0.20);
        return {
            tableTopY: fallbackTop,
            tableBottomY: viewportHeight,
            reason: 'fallback-top-20pct',
            confidence: 'low',
            headerLine: null,
            ignoredHeaderRects: rects.filter((r) => Number(r.centerY || 0) < fallbackTop)
        };
    }

    const headerLine = bestCandidate.line;
    const tableTopY = Math.max(0, Number(headerLine.y1 || 0) - geomPx(8, geomScale));

    const linesFromHeader = lines.filter((line) => Number(line.cy || 0) >= Number(headerLine.cy || 0));
    let tableBottomY = viewportHeight;
    let lastDense = null;

    linesFromHeader.forEach((line) => {
        const span = Number(line.width || 0) / viewportWidth;
        const itemCount = Array.isArray(line.rects) ? line.rects.length : 0;
        const metadataHits = lineTokenHits(line.normalizedText, PAGE_METADATA_HINTS);
        const dense = itemCount >= 4 && span >= 0.35 && metadataHits.length === 0;
        if (dense) lastDense = line;
    });

    if (lastDense) {
        tableBottomY = Math.min(viewportHeight, Number(lastDense.y2 || viewportHeight) + geomPx(22, geomScale));
    }

    const ignoredHeaderRects = rects.filter((rect) => Number(rect.centerY || 0) < tableTopY);

    return {
        tableTopY,
        tableBottomY,
        reason: `header-line:${bestCandidate.tableHits.join('|')}`,
        confidence: bestCandidate.score >= 7 ? 'high' : 'medium',
        headerLine,
        ignoredHeaderRects
    };
}

function detectHeaderAnchors(tableLines, tableTopY, windowPx = 90, geomScale = 1) {
    const candidateLines = tableLines.filter((line) => Number(line.cy || 0) <= (tableTopY + windowPx));
    const anchorsByKey = new Map();
    const headerLines = [];

    candidateLines.forEach((line) => {
        const clusters = buildClusters(line.rects, geomPx(26, geomScale));
        if (!clusters.length) return;

        const localHits = [];
        for (let i = 0; i < clusters.length; i++) {
            const c1 = clusters[i];
            const candidates = [
                { phrase: c1.text, left: c1.left, right: c1.right, score: 1 },
                i + 1 < clusters.length
                    ? {
                        phrase: `${c1.text} ${clusters[i + 1].text}`,
                        left: c1.left,
                        right: clusters[i + 1].right,
                        score: 1.15
                    }
                    : null,
                i + 2 < clusters.length
                    ? {
                        phrase: `${c1.text} ${clusters[i + 1].text} ${clusters[i + 2].text}`,
                        left: c1.left,
                        right: clusters[i + 2].right,
                        score: 1.3
                    }
                    : null
            ].filter(Boolean);

            candidates.forEach((item) => {
                let key = detectHeaderKeyFromPhrase(item.phrase);
                const normalizedPhrase = normalizeHeaderToken(item.phrase);

                // Arrow headers are often rendered as a symbol, not text.
                // If the leftmost tiny cluster has no alphanumeric text, treat it as ARROW.
                if (!key && i === 0 && !normalizedPhrase && String(item.phrase || '').trim() && Number(item.right || 0) - Number(item.left || 0) <= geomPx(28, geomScale)) {
                    key = 'arrow';
                }

                if (!key) return;

                const confidence = item.score >= 1.2 ? 'high' : 'medium';
                const anchor = {
                    key,
                    centerX: (Number(item.left || 0) + Number(item.right || 0)) / 2,
                    x1: Number(item.left || 0),
                    x2: Number(item.right || 0),
                    confidence,
                    source: 'header',
                    lineCy: Number(line.cy || 0),
                    text: item.phrase,
                    score: item.score
                };

                const previous = anchorsByKey.get(key);
                if (!previous || Number(anchor.score || 0) > Number(previous.score || 0)) {
                    anchorsByKey.set(key, anchor);
                }
                localHits.push(anchor);
            });
        }

        if (localHits.length >= 2) headerLines.push(line);
    });

    return {
        anchors: Array.from(anchorsByKey.values()).sort((a, b) => Number(a.x1 || a.centerX || 0) - Number(b.x1 || b.centerX || 0)),
        headerLines,
        detectedHeaderKeys: Array.from(anchorsByKey.keys())
    };
}

function detectHistogramGaps(bodyRects, leftX, rightX, geomScale = 1) {
    if (!bodyRects.length || rightX <= leftX) return [];

    const bin = Math.max(1, geomPx(3, geomScale));
    const size = Math.max(1, Math.ceil((rightX - leftX) / bin));
    const buckets = new Array(size).fill(0);

    bodyRects.forEach((rect) => {
        const center = Number(rect.centerX || 0);
        if (center < leftX || center > rightX) return;
        const idx = Math.max(0, Math.min(size - 1, Math.floor((center - leftX) / bin)));
        buckets[idx] += 1;
    });

    const smooth = buckets.map((_, idx) => {
        const a = buckets[idx - 1] || 0;
        const b = buckets[idx] || 0;
        const c = buckets[idx + 1] || 0;
        return (a * 0.4) + b + (c * 0.4);
    });

    const avg = smooth.reduce((sum, value) => sum + value, 0) / Math.max(1, smooth.length);
    const threshold = avg * 0.34;
    const gaps = [];

    for (let i = 2; i < smooth.length - 2; i++) {
        const current = smooth[i];
        const left = smooth[i - 1];
        const right = smooth[i + 1];
        if (current <= threshold && left > threshold && right > threshold) {
            gaps.push(leftX + (i * bin));
        }
    }

    return gaps;
}

function buildTemplateColumns(leftX, rightX, includeArrow) {
    const width = Math.max(1, rightX - leftX);
    const source = includeArrow ? TEMPLATE_RATIOS : TEMPLATE_RATIOS.filter((item) => item.key !== 'arrow');

    return source.map((item) => {
        const x1 = leftX + (width * item.start);
        const x2 = leftX + (width * item.end);
        const schema = COLUMN_SCHEMA[item.key] || { label: item.key.toUpperCase(), color: '#22c55e' };
        return {
            key: item.key,
            label: schema.label,
            x1,
            x2,
            source: 'template',
            confidence: 'low',
            color: schema.color
        };
    });
}

function canonicalIndex(key) {
    const idx = COLUMN_ORDER.indexOf(String(key || ''));
    return idx >= 0 ? idx : 999;
}

function sortByCanonical(columns) {
    return [...columns].sort((a, b) => canonicalIndex(a.key) - canonicalIndex(b.key));
}

function enforceMonotonicBounds(columns, leftX, rightX, geomScale = 1) {
    const ordered = sortByCanonical(columns).map((col) => ({ ...col }));
    if (!ordered.length) return ordered;

    let cursor = leftX;
    for (let i = 0; i < ordered.length; i++) {
        const col = ordered[i];
        const minWidth = geomPx(6, geomScale);
        const x1 = Math.max(cursor, Number(col.x1 || cursor));
        const x2 = Math.max(x1 + minWidth, Number(col.x2 || x1 + minWidth));
        col.x1 = x1;
        col.x2 = Math.min(rightX, x2);
        cursor = col.x2;
    }

    if (ordered.length) {
        ordered[ordered.length - 1].x2 = Math.max(ordered[ordered.length - 1].x1 + geomPx(6, geomScale), rightX);
    }

    return ordered;
}

function getBoundaryArray(columns, leftX, rightX) {
    const ordered = sortByCanonical(columns);
    if (!ordered.length) return [leftX, rightX];
    const boundaries = [leftX];
    for (let i = 0; i < ordered.length - 1; i++) {
        const mid = (Number(ordered[i].x2 || 0) + Number(ordered[i + 1].x1 || 0)) / 2;
        boundaries.push(mid);
    }
    boundaries.push(rightX);
    return boundaries;
}

function buildColumnsFromBoundaries(columns, boundaries) {
    const ordered = sortByCanonical(columns);
    return ordered.map((col, idx) => ({
        ...col,
        x1: Number(boundaries[idx] || col.x1 || 0),
        x2: Number(boundaries[idx + 1] || col.x2 || 0)
    }));
}

function aggregateCloseSeparators(candidates, tolerance = 3) {
    if (!Array.isArray(candidates) || !candidates.length) return [];
    const sorted = [...candidates]
        .filter((item) => Number.isFinite(Number(item?.x)))
        .sort((a, b) => Number(a.x || 0) - Number(b.x || 0));

    const groups = [];
    sorted.forEach((item) => {
        const last = groups[groups.length - 1];
        if (!last || Math.abs(Number(last.x || 0) - Number(item.x || 0)) > tolerance) {
            groups.push({
                x: Number(item.x || 0),
                scores: [Number(item.score || 0)],
                sources: [String(item.source || 'text-gap')]
            });
            return;
        }

        const scores = [...last.scores, Number(item.score || 0)];
        const avgX = ((Number(last.x || 0) * last.scores.length) + Number(item.x || 0)) / scores.length;
        last.x = avgX;
        last.scores = scores;
        last.sources.push(String(item.source || 'text-gap'));
    });

    return groups.map((group) => ({
        x: Number(group.x || 0),
        confidence: Math.max(0.05, Math.min(0.99, median(group.scores))),
        source: group.sources.includes('gridline')
            ? 'gridline'
            : group.sources.includes('text-gap')
                ? 'text-gap'
                : 'template-adjusted'
    }));
}

function detectVerticalSeparators(pageGraphics, rects, tableArea, bodyRows, leftX, rightX, geomScale = 1) {
    const rows = Array.isArray(bodyRows) ? bodyRows : [];
    const candidates = [];

    rows.forEach((row) => {
        const rowRects = [...(row?.rects || [])].sort((a, b) => Number(a.left || 0) - Number(b.left || 0));
        if (rowRects.length < 2) return;

        for (let i = 0; i < rowRects.length - 1; i++) {
            const r1 = rowRects[i];
            const r2 = rowRects[i + 1];
            const gap = Number(r2.left || 0) - Number(toRight(r1));
            if (gap < geomPx(4, geomScale)) continue;
            const x = Number(toRight(r1)) + (gap / 2);
            if (x <= leftX || x >= rightX) continue;
            candidates.push({
                x,
                score: Math.min(0.95, 0.25 + (gap / 22)),
                source: 'text-gap'
            });
        }
    });

    // Repeated left/right edges reinforce separator evidence.
    const edgeBins = new Map();
    (rects || []).forEach((rect) => {
        const edges = [Number(rect.left || 0), Number(toRight(rect))];
        edges.forEach((edgeX) => {
            if (edgeX <= leftX || edgeX >= rightX) return;
            const edgeBin = Math.max(1, geomPx(2, geomScale));
            const bin = Math.round(edgeX / edgeBin) * edgeBin;
            edgeBins.set(bin, (edgeBins.get(bin) || 0) + 1);
        });
    });

    edgeBins.forEach((count, binX) => {
        if (count < Math.max(6, rows.length * 0.30)) return;
        candidates.push({
            x: Number(binX),
            score: Math.min(0.92, 0.20 + (count / Math.max(10, rows.length * 2))),
            source: 'gridline'
        });
    });

    return aggregateCloseSeparators(candidates, geomPx(3, geomScale))
        .filter((item) => Number(item.x || 0) > leftX + geomPx(2, geomScale) && Number(item.x || 0) < rightX - geomPx(2, geomScale))
        .sort((a, b) => Number(a.x || 0) - Number(b.x || 0));
}

function snapBoundariesToSeparators(columns, verticalSeparators, leftX, rightX, geomScale = 1) {
    const ordered = sortByCanonical(columns);
    if (ordered.length < 2) {
        return {
            columns: enforceMonotonicBounds(ordered, leftX, rightX, geomScale),
            boundaryMoves: [],
            warnings: []
        };
    }

    const separators = Array.isArray(verticalSeparators) ? verticalSeparators : [];
    const boundaries = getBoundaryArray(ordered, leftX, rightX);
    const before = [...boundaries];
    const boundaryMoves = [];
    const warnings = [];

    for (let i = 1; i < boundaries.length - 1; i++) {
        const leftCol = ordered[i - 1];
        const rightCol = ordered[i];
        const keyPair = `${leftCol.key}|${rightCol.key}`;
        const oldX = Number(boundaries[i] || 0);
        const leftLimits = getColumnWidthLimit(leftCol.key, geomScale);
        const rightLimits = getColumnWidthLimit(rightCol.key, geomScale);

        const narrow = Math.max(
            Number(leftLimits.max || 999),
            Number(rightLimits.max || 999)
        ) <= geomPx(45, geomScale);
        const snapWindow = narrow ? geomPx(8, geomScale) : geomPx(20, geomScale);

        const candidate = [...separators]
            .filter((s) => Math.abs(Number(s.x || 0) - oldX) <= snapWindow)
            .sort((a, b) => Math.abs(Number(a.x || 0) - oldX) - Math.abs(Number(b.x || 0) - oldX))[0];

        if (!candidate) {
            warnings.push({ code: 'SNAP_NOT_FOUND', between: keyPair, atX: oldX });
            continue;
        }

        const proposed = Number(candidate.x || oldX);
        const leftMin = Number(leftLimits.min || geomPx(6, geomScale));
        const rightMin = Number(rightLimits.min || geomPx(6, geomScale));
        const leftX1 = Number(boundaries[i - 1] || leftX);
        const rightX2 = Number(boundaries[i + 1] || rightX);

        if ((proposed - leftX1) < leftMin || (rightX2 - proposed) < rightMin) {
            warnings.push({ code: 'SNAP_NOT_FOUND', between: keyPair, atX: oldX, reason: 'min-width-guard' });
            continue;
        }

        if (Math.abs(proposed - oldX) > geomPx(0.5, geomScale)) {
            boundaries[i] = proposed;
            boundaryMoves.push({
                between: keyPair,
                oldX,
                newX: proposed,
                delta: proposed - oldX,
                reason: candidate.source === 'gridline' ? 'snapped-gridline' : 'snapped-text-gap'
            });
        }
    }

    const snapped = buildColumnsFromBoundaries(ordered, boundaries);
    return {
        columns: enforceMonotonicBounds(snapped, leftX, rightX, geomScale),
        boundaryMoves,
        warnings,
        boundariesBefore: before,
        boundariesAfter: boundaries
    };
}

function moveBoundaryBetween(columns, leftKey, rightKey, newBoundaryX, reason, boundaryMoves, geomScale = 1) {
    const ordered = sortByCanonical(columns);
    const leftIdx = ordered.findIndex((col) => col.key === leftKey);
    const rightIdx = ordered.findIndex((col) => col.key === rightKey);
    if (leftIdx < 0 || rightIdx < 0 || rightIdx !== leftIdx + 1) return ordered;

    const oldX = Number(ordered[leftIdx].x2 || 0);
    const leftMin = Number(getColumnWidthLimit(leftKey, geomScale).min || geomPx(6, geomScale));
    const rightMin = Number(getColumnWidthLimit(rightKey, geomScale).min || geomPx(6, geomScale));
    const leftX1 = Number(ordered[leftIdx].x1 || 0);
    const rightX2 = Number(ordered[rightIdx].x2 || 0);

    const clamped = Math.max(leftX1 + leftMin, Math.min(rightX2 - rightMin, Number(newBoundaryX || oldX)));
    ordered[leftIdx].x2 = clamped;
    ordered[rightIdx].x1 = clamped;

    if (Math.abs(clamped - oldX) > geomPx(0.5, geomScale)) {
        boundaryMoves.push({
            between: `${leftKey}|${rightKey}`,
            oldX,
            newX: clamped,
            delta: clamped - oldX,
            reason
        });
    }

    return ordered;
}

function nearestSeparatorX(separators, targetX, windowPx = 14) {
    const candidate = [...(separators || [])]
        .filter((s) => Math.abs(Number(s.x || 0) - Number(targetX || 0)) <= windowPx)
        .sort((a, b) => Math.abs(Number(a.x || 0) - Number(targetX || 0)) - Math.abs(Number(b.x || 0) - Number(targetX || 0)))[0];
    return candidate ? Number(candidate.x || targetX) : Number(targetX || 0);
}

function refinePosPartBoundary(columns, bodyRects, separators, boundaryMoves, warnings, geomScale = 1) {
    let ordered = sortByCanonical(columns);
    const pos = ordered.find((col) => col.key === 'pos');
    const part = ordered.find((col) => col.key === 'part_no');
    if (!pos || !part) return ordered;

    const x1 = Number(pos.x1 || 0);
    const x2 = Number(part.x2 || 0);
    const zoneRects = (bodyRects || []).filter((rect) => {
        const cx = Number(rect.centerX || 0);
        return cx >= x1 && cx <= x2;
    });

    const posEnds = zoneRects
        .filter((rect) => isShortIntegerToken(rect.text))
        .map((rect) => Number(toRight(rect)));
    const partStarts = zoneRects
        .filter((rect) => isPartNoLikeToken(rect.text))
        .map((rect) => Number(rect.left || 0));

    if (posEnds.length >= 4 && partStarts.length >= 4) {
        const posMed = median(posEnds);
        const partMed = median(partStarts);
        if (Number.isFinite(posMed) && Number.isFinite(partMed) && partMed > posMed + geomPx(2, geomScale)) {
            let newBoundary = (posMed + partMed) / 2;
            newBoundary = nearestSeparatorX(separators, newBoundary, geomPx(12, geomScale));
            ordered = moveBoundaryBetween(ordered, 'pos', 'part_no', newBoundary, 'manual-rule-pos-partno', boundaryMoves, geomScale);
        }
    }

    const posWidth = Number((ordered.find((c) => c.key === 'pos')?.x2 || 0) - (ordered.find((c) => c.key === 'pos')?.x1 || 0));
    const partWidth = Number((ordered.find((c) => c.key === 'part_no')?.x2 || 0) - (ordered.find((c) => c.key === 'part_no')?.x1 || 0));
    if (posWidth >= partWidth * 0.85) warnings.push({ code: 'POS_PARTNO_MERGED' });

    return ordered;
}

function refineUnitsWeightBoundary(columns, bodyRects, separators, boundaryMoves, warnings, geomScale = 1) {
    let ordered = sortByCanonical(columns);
    const units = ordered.find((col) => col.key === 'units');
    const weight = ordered.find((col) => col.key === 'weight');
    if (!units || !weight) return ordered;

    const x1 = Number(units.x1 || 0);
    const x2 = Number(weight.x2 || 0);
    const zoneRects = (bodyRects || []).filter((rect) => {
        const cx = Number(rect.centerX || 0);
        return cx >= x1 && cx <= x2;
    });

    const unitCenters = zoneRects
        .filter((rect) => isUnitToken(rect.text))
        .map((rect) => Number(rect.centerX || 0));
    const weightStarts = zoneRects
        .filter((rect) => isWeightLikeToken(rect.text))
        .map((rect) => Number(rect.left || 0));

    if (unitCenters.length >= 4 && weightStarts.length >= 4) {
        const unitMed = median(unitCenters);
        const weightMed = median(weightStarts);
        if (Number.isFinite(unitMed) && Number.isFinite(weightMed) && weightMed > unitMed + geomPx(2, geomScale)) {
            let newBoundary = (unitMed + weightMed) / 2;
            newBoundary = nearestSeparatorX(separators, newBoundary, geomPx(10, geomScale));
            ordered = moveBoundaryBetween(ordered, 'units', 'weight', newBoundary, 'manual-rule-units-weight', boundaryMoves, geomScale);
        }
    }

    const unitsWidth = Number((ordered.find((c) => c.key === 'units')?.x2 || 0) - (ordered.find((c) => c.key === 'units')?.x1 || 0));
    const weightWidth = Number((ordered.find((c) => c.key === 'weight')?.x2 || 0) - (ordered.find((c) => c.key === 'weight')?.x1 || 0));
    if (unitsWidth >= weightWidth) warnings.push({ code: 'UNITS_WEIGHT_MERGED' });

    return ordered;
}

function refineColumnsWithBodyEvidence(columns, bodyRows, boundaryMoves, warnings, geomScale = 1) {
    let ordered = sortByCanonical(columns);
    if (!Array.isArray(bodyRows) || !bodyRows.length) return ordered;

    for (let i = 0; i < ordered.length - 1; i++) {
        const leftCol = ordered[i];
        const rightCol = ordered[i + 1];
        const boundaryX = Number(leftCol.x2 || 0);

        const rowGapCenters = [];
        let touching = 0;
        let considered = 0;

        bodyRows.forEach((row) => {
            const rowRects = [...(row?.rects || [])].sort((a, b) => Number(a.left || 0) - Number(b.left || 0));
            if (!rowRects.length) return;

            const leftRects = rowRects.filter((rect) => Number(toRight(rect)) <= boundaryX + geomPx(10, geomScale) && Number(rect.centerX || 0) >= Number(leftCol.x1 || 0));
            const rightRects = rowRects.filter((rect) => Number(rect.left || 0) >= boundaryX - geomPx(10, geomScale) && Number(rect.centerX || 0) <= Number(rightCol.x2 || 0));
            if (!leftRects.length || !rightRects.length) return;

            considered += 1;
            const leftEnd = safeMax(leftRects.map((rect) => Number(toRight(rect))), boundaryX);
            const rightStart = safeMin(rightRects.map((rect) => Number(rect.left || 0)), boundaryX);

            if (Math.abs(leftEnd - boundaryX) <= geomPx(2, geomScale) || Math.abs(rightStart - boundaryX) <= geomPx(2, geomScale)) touching += 1;
            if (rightStart > leftEnd + geomPx(3, geomScale)) {
                rowGapCenters.push((leftEnd + rightStart) / 2);
            }
        });

        const touchingRatio = considered > 0 ? touching / considered : 0;
        if (touchingRatio < 0.4 || rowGapCenters.length < Math.max(3, Math.round(bodyRows.length * 0.2))) continue;

        const newBoundary = median(rowGapCenters);
        if (!Number.isFinite(newBoundary)) continue;
        ordered = moveBoundaryBetween(ordered, leftCol.key, rightCol.key, newBoundary, 'body-gap-refine', boundaryMoves, geomScale);
    }

    return ordered;
}

function applyFlexibleWidthConstraints(columns, boundaryMoves, warnings, geomScale = 1) {
    let ordered = sortByCanonical(columns);
    const move = (leftKey, rightKey, delta, reason) => {
        const left = ordered.find((c) => c.key === leftKey);
        const right = ordered.find((c) => c.key === rightKey);
        if (!left || !right) return;
        const newBoundary = Number(left.x2 || 0) + delta;
        ordered = moveBoundaryBetween(ordered, leftKey, rightKey, newBoundary, reason, boundaryMoves, geomScale);
    };

    for (let i = 0; i < ordered.length; i++) {
        const col = ordered[i];
        const limits = getColumnWidthLimit(col.key, geomScale);
        if (!limits) continue;
        const width = Number(col.x2 || 0) - Number(col.x1 || 0);

        if (width < limits.min) {
            warnings.push({ code: 'COLUMN_TOO_NARROW', key: col.key, width, min: limits.min });
            const need = limits.min - width;
            if (i < ordered.length - 1) move(col.key, ordered[i + 1].key, need, 'width-min-expand-right');
            else if (i > 0) move(ordered[i - 1].key, col.key, -need, 'width-min-expand-left');
        }

        if (width > limits.max) {
            warnings.push({ code: 'COLUMN_TOO_WIDE', key: col.key, width, max: limits.max });
            const excess = width - limits.max;
            if (i < ordered.length - 1) move(col.key, ordered[i + 1].key, -excess, 'width-max-shrink-right');
            else if (i > 0) move(ordered[i - 1].key, col.key, excess, 'width-max-shrink-left');
        }
    }

    return ordered;
}

function adjustBoundariesToGaps(columns, gaps, leftX, rightX, geomScale = 1) {
    if (!columns.length) return columns;
    const sorted = sortByCanonical(columns);

    const boundaries = [leftX];
    for (let i = 0; i < sorted.length - 1; i++) {
        const mid = (Number(sorted[i].x2 || 0) + Number(sorted[i + 1].x1 || 0)) / 2;
        const nearestGap = [...gaps].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
        const chosen = Number.isFinite(nearestGap) && Math.abs(nearestGap - mid) <= geomPx(16, geomScale) ? nearestGap : mid;
        boundaries.push(chosen);
    }
    boundaries.push(rightX);

    return sorted.map((col, idx) => ({
        ...col,
        x1: Math.max(leftX, Number(boundaries[idx] || leftX)),
        x2: Math.min(rightX, Number(boundaries[idx + 1] || rightX)),
        source: col.source === 'template' ? 'adjusted-template' : col.source
    })).filter((col) => Number(col.x2 || 0) > Number(col.x1 || 0) + geomPx(4, geomScale));
}

function mergeAnchorsIntoTemplate(templateCols, anchors) {
    const byKey = new Map((anchors || []).map((anchor) => [anchor.key, anchor]));
    return templateCols.map((col) => {
        const anchor = byKey.get(col.key);
        if (!anchor) return col;

        const center = Number(anchor.centerX || ((col.x1 + col.x2) / 2));
        const width = Math.max(6, Number(col.x2 || 0) - Number(col.x1 || 0));
        return {
            ...col,
            x1: center - (width / 2),
            x2: center + (width / 2),
            source: 'header',
            confidence: anchor.confidence || 'medium'
        };
    });
}

function enforceNarrowColumns(columns, geomScale = 1) {
    const idxModel = columns.findIndex((c) => c.key === 'model_type');
    const idxMeasurement = columns.findIndex((c) => c.key === 'measurement');
    if (idxModel < 0 || idxMeasurement < 0 || idxMeasurement <= idxModel + 1) return columns;

    const section = columns.slice(idxModel + 1, idxMeasurement);
    const narrowKeys = ['qty', 'units', 'weight', 'fn'];
    const hasAllNarrow = narrowKeys.every((key) => section.some((col) => col.key === key));
    if (hasAllNarrow) return columns;

    const model = columns[idxModel];
    const measurement = columns[idxMeasurement];
    const left = Number(model.x2 || 0);
    const right = Number(measurement.x1 || left);
    if (right - left < geomPx(24, geomScale)) return columns;

    const synthetic = [
        { key: 'qty', start: 0.00, end: 0.30 },
        { key: 'units', start: 0.30, end: 0.56 },
        { key: 'weight', start: 0.56, end: 0.84 },
        { key: 'fn', start: 0.84, end: 1.00 }
    ].map((item) => ({
        key: item.key,
        label: COLUMN_SCHEMA[item.key].label,
        x1: left + ((right - left) * item.start),
        x2: left + ((right - left) * item.end),
        source: 'template',
        confidence: 'low',
        color: COLUMN_SCHEMA[item.key].color
    }));

    const keep = columns.filter((col) => !narrowKeys.includes(col.key));
    return sortByCanonical([...keep, ...synthetic]);
}

function ensureMeasurementStandardSplit(columns, geomScale = 1) {
    const sorted = sortByCanonical(columns);
    const hasMeasurement = sorted.some((col) => col.key === 'measurement');
    const hasStandard = sorted.some((col) => col.key === 'standard');
    if (hasMeasurement && hasStandard) return sorted;

    const rightMost = sorted[sorted.length - 1];
    if (!rightMost) return sorted;

    const left = Number(rightMost.x1 || 0);
    const right = Number(rightMost.x2 || left + geomPx(20, geomScale));
    const width = Math.max(geomPx(20, geomScale), right - left);
    const split = left + (width * 0.70);

    const rebuilt = sorted.filter((col) => col !== rightMost);
    rebuilt.push({
        key: 'measurement',
        label: COLUMN_SCHEMA.measurement.label,
        x1: left,
        x2: split,
        source: 'template',
        confidence: 'low',
        color: COLUMN_SCHEMA.measurement.color
    });
    rebuilt.push({
        key: 'standard',
        label: COLUMN_SCHEMA.standard.label,
        x1: split,
        x2: right,
        source: 'template',
        confidence: 'low',
        color: COLUMN_SCHEMA.standard.color
    });
    return sortByCanonical(rebuilt);
}

function removeArrowIfEmpty(columns, bodyRects) {
    const arrow = columns.find((col) => col.key === 'arrow');
    const pos = columns.find((col) => col.key === 'pos');
    if (!arrow || !pos) return columns;

    const arrowCount = bodyRects.filter((rect) => {
        const center = Number(rect.centerX || 0);
        return center >= Number(arrow.x1 || 0) && center <= Number(arrow.x2 || 0);
    }).length;

    if (arrowCount >= 5) return columns;

    const filtered = columns.filter((col) => col.key !== 'arrow');
    const posCol = filtered.find((col) => col.key === 'pos');
    if (posCol) {
        posCol.x1 = Math.min(Number(posCol.x1 || 0), Number(arrow.x1 || 0));
        posCol.source = posCol.source === 'header' ? 'header' : 'adjusted-template';
    }
    return sortByCanonical(filtered);
}

/**
 * Build columns using the x1 of each header anchor token as the left boundary
 * of its column. This makes columns zoom-invariant and geometrically exact.
 *
 * Strategy:
 *  - Sort anchors by x1 left-to-right.
 *  - Each anchor.x1 is the START of that column.
 *  - The END of column[i] = the x1 of column[i+1].
 *  - First column starts at leftX, last column ends at rightX.
 *  - Fill any COLUMN_ORDER gaps with proportional template slices.
 */
function buildColumnsFromHeaderX1(anchors, leftX, rightX, geomScale = 1) {
    if (!Array.isArray(anchors) || anchors.length < 3) return null;

    const includeArrow = anchors.some((anchor) => anchor.key === 'arrow');
    const keys = COLUMN_ORDER.filter((key) => includeArrow || key !== 'arrow');

    const anchorByKey = new Map();
    for (const anchor of anchors) {
        const key = String(anchor?.key || '').trim();
        if (!key || !keys.includes(key)) continue;
        anchorByKey.set(key, anchor);
    }

    const base = buildTemplateColumns(leftX, rightX, includeArrow)
        .filter((col) => keys.includes(col.key));

    if (!base.length) return null;

    const starts = [];
    keys.forEach((key) => {
        const templateCol = base.find((col) => col.key === key);
        const anchor = anchorByKey.get(key);
        const x1 = anchor ? Number(anchor.x1 || templateCol?.x1 || leftX) : Number(templateCol?.x1 || leftX);
        starts.push({ key, x1: Math.max(leftX, x1), anchor, templateCol });
    });

    // Keep starts monotonic to avoid inverted spans when one header is noisy.
    let cursor = leftX;
    const monotonicStarts = starts.map((entry, idx) => {
        const minWidth = getColumnWidthLimit(entry.key, geomScale).min;
        const remaining = starts.length - idx - 1;
        const maxStart = rightX - (remaining + 1) * Math.max(geomPx(4, geomScale), minWidth * 0.35);
        const start = Math.min(Math.max(entry.x1, cursor), maxStart);
        cursor = start + Math.max(geomPx(2, geomScale), minWidth * 0.25);
        return { ...entry, x1: start };
    });

    const result = [];
    for (let i = 0; i < monotonicStarts.length; i++) {
        const current = monotonicStarts[i];
        const next = monotonicStarts[i + 1];
        const x1 = current.x1;
        const x2 = next ? Math.max(x1 + geomPx(4, geomScale), next.x1) : rightX;
        result.push({
            key: current.key,
            label: COLUMN_SCHEMA[current.key]?.label || current.key.toUpperCase(),
            x1,
            x2,
            source: current.anchor ? 'header-x1' : 'header-x1-template',
            confidence: current.anchor ? (current.anchor.confidence || 'medium') : 'low',
            color: COLUMN_SCHEMA[current.key]?.color || '#22c55e'
        });
    }

    const keysResult = new Set(result.map((c) => c.key));
    if (REQUIRED_KEYS.some((k) => !keysResult.has(k))) return null;
    return result;
}

function lockBoundariesToHeaderX1(columns, headerAnchors, leftX, rightX, boundaryMoves, geomScale = 1) {
    let ordered = sortByCanonical(columns);
    if (!Array.isArray(ordered) || ordered.length < 2) return ordered;

    const anchorByKey = new Map((headerAnchors || [])
        .map((a) => [String(a?.key || ''), Number(a?.x1 || NaN)])
        .filter(([, x]) => Number.isFinite(x)));

    // Keep boundary close to header x1 while respecting minimum widths.
    for (let i = 1; i < ordered.length; i++) {
        const current = ordered[i];
        const prev = ordered[i - 1];
        const anchorX1 = anchorByKey.get(current.key);
        if (!Number.isFinite(anchorX1)) continue;

        const leftMin = Number(getColumnWidthLimit(prev.key, geomScale).min || geomPx(6, geomScale));
        const rightMin = Number(getColumnWidthLimit(current.key, geomScale).min || geomPx(6, geomScale));
        const lower = Number(prev.x1 || leftX) + leftMin;
        const upper = Number(current.x2 || rightX) - rightMin;
        if (upper <= lower) continue;

        const target = Math.max(lower, Math.min(upper, anchorX1));
        ordered = moveBoundaryBetween(ordered, prev.key, current.key, target, 'header-x1-lock', boundaryMoves, geomScale);
    }

    return enforceMonotonicBounds(ordered, leftX, rightX, geomScale);
}

function enforceColumnStartsFromHeaders(columns, headerAnchors, leftX, rightX, boundaryMoves, geomScale = 1) {
    let ordered = sortByCanonical(columns);
    if (!Array.isArray(ordered) || !ordered.length) return ordered;

    const anchorByKey = new Map((headerAnchors || [])
        .map((a) => [String(a?.key || ''), Number(a?.x1 || NaN)])
        .filter(([, x]) => Number.isFinite(x)));

    // First visible column (often POS when arrow is absent): lock its own x1 too.
    const first = ordered[0];
    if (first) {
        const firstAnchor = anchorByKey.get(first.key);
        if (Number.isFinite(firstAnchor)) {
            const firstMin = Number(getColumnWidthLimit(first.key, geomScale).min || geomPx(6, geomScale));
            const maxX1 = Number(first.x2 || rightX) - firstMin;
            const clamped = Math.max(leftX, Math.min(maxX1, firstAnchor));
            const oldX1 = Number(first.x1 || 0);
            first.x1 = clamped;
            if (Math.abs(clamped - oldX1) > geomPx(0.5, geomScale)) {
                boundaryMoves.push({
                    between: `LEFT|${first.key}`,
                    oldX: oldX1,
                    newX: clamped,
                    delta: clamped - oldX1,
                    reason: 'header-x1-start-lock'
                });
            }
        }
    }

    // Internal boundaries: boundary before each column follows that column's header x1.
    for (let i = 1; i < ordered.length; i++) {
        const current = ordered[i];
        const prev = ordered[i - 1];
        const anchorX1 = anchorByKey.get(current.key);
        if (!Number.isFinite(anchorX1)) continue;
        ordered = moveBoundaryBetween(ordered, prev.key, current.key, anchorX1, 'header-x1-start-lock', boundaryMoves, geomScale);
    }

    return enforceMonotonicBounds(ordered, leftX, rightX, geomScale);
}

function buildColumns(tableRects, headerAnchors, bodyRects, bodyRows, leftX, rightX, geomScale = 1) {
    const gapBoundaries = detectHistogramGaps(bodyRects, leftX, rightX, geomScale);
    const includeArrow = headerAnchors.some((anchor) => anchor.key === 'arrow')
        || bodyRects.filter((rect) => Number(rect.centerX || 0) <= (leftX + ((rightX - leftX) * 0.05))).length >= 7;

    // ── Strategy 1: header x1 boundaries (zoom-invariant, most precise) ──
    let columns = buildColumnsFromHeaderX1(headerAnchors, leftX, rightX, geomScale);
    let method = 'header-x1';
    let fallbackApplied = false;

    if (!columns) {
        // ── Strategy 2: template + anchor centers + histogram gaps ─────────
        method = 'hybrid';
        columns = buildTemplateColumns(leftX, rightX, includeArrow);
        columns = mergeAnchorsIntoTemplate(columns, headerAnchors);
        columns = adjustBoundariesToGaps(columns, gapBoundaries, leftX, rightX, geomScale);
        columns = enforceNarrowColumns(columns, geomScale);
        columns = ensureMeasurementStandardSplit(columns, geomScale);
        columns = removeArrowIfEmpty(columns, bodyRects);

        const keysDetected = new Set(columns.map((col) => col.key));
        const missingCritical = REQUIRED_KEYS.filter((key) => !keysDetected.has(key));

        if (columns.length < 8 || missingCritical.length || headerAnchors.length < 5) {
            // ── Strategy 3: pure template fallback ─────────────────────────
            fallbackApplied = true;
            method = 'template-fallback';
            columns = buildTemplateColumns(leftX, rightX, includeArrow);
            columns = mergeAnchorsIntoTemplate(columns, headerAnchors);
            columns = adjustBoundariesToGaps(columns, gapBoundaries, leftX, rightX, geomScale);
            columns = enforceNarrowColumns(columns, geomScale);
            columns = ensureMeasurementStandardSplit(columns, geomScale);
            columns = removeArrowIfEmpty(columns, bodyRects);
        }
    }

    columns = enforceMonotonicBounds(columns, leftX, rightX, geomScale);
    const columnsBeforeSnap = columns.map((col) => ({ ...col }));

    const verticalSeparatorsDetected = detectVerticalSeparators(
        null,
        bodyRects,
        null,
        bodyRows,
        leftX,
        rightX,
        geomScale
    );

    const snapResult = snapBoundariesToSeparators(columns, verticalSeparatorsDetected, leftX, rightX, geomScale);
    const boundaryMoves = [...(snapResult.boundaryMoves || [])];
    const warnings = [...(snapResult.warnings || [])];

    columns = snapResult.columns;
    columns = refinePosPartBoundary(columns, bodyRects, verticalSeparatorsDetected, boundaryMoves, warnings, geomScale);
    columns = refineUnitsWeightBoundary(columns, bodyRects, verticalSeparatorsDetected, boundaryMoves, warnings, geomScale);
    columns = refineColumnsWithBodyEvidence(columns, bodyRows, boundaryMoves, warnings, geomScale);
    columns = applyFlexibleWidthConstraints(columns, boundaryMoves, warnings, geomScale);

    if (method === 'header-x1') {
        columns = lockBoundariesToHeaderX1(columns, headerAnchors, leftX, rightX, boundaryMoves, geomScale);
        columns = enforceColumnStartsFromHeaders(columns, headerAnchors, leftX, rightX, boundaryMoves, geomScale);
    }

    columns = enforceMonotonicBounds(columns, leftX, rightX, geomScale);

    const lowEvidenceBoundaries = (bodyRows || []).length < 8;
    if (lowEvidenceBoundaries) warnings.push({ code: 'LOW_BODY_EVIDENCE' });

    const columnsAfterSnap = columns.map((col) => ({ ...col }));

    const finalColumns = enforceMonotonicBounds(
        columns
            .map((col) => ({
                ...col,
                x1: Math.max(leftX, Number(col.x1 || 0)),
                x2: Math.min(rightX, Number(col.x2 || 0)),
                source: col.source || (fallbackApplied ? 'template' : 'histogram')
            }))
            .filter((col) => Number(col.x2 || 0) > Number(col.x1 || 0) + 3)
            .sort((a, b) => canonicalIndex(a.key) - canonicalIndex(b.key)),
        leftX,
        rightX,
        geomScale
    );

    return {
        columns: finalColumns,
        method,
        fallbackApplied,
        gapBoundaries,
        columnsBeforeSnap,
        columnsAfterSnap,
        verticalSeparatorsDetected,
        boundaryMoves,
        warnings
    };
}

function assignToColumn(rect, columns) {
    if (!Array.isArray(columns) || !columns.length) return 'unknown';
    const startX = Number(rect.left || rect.centerX || 0);
    const sorted = [...columns].sort((a, b) => Number(a.x1 || 0) - Number(b.x1 || 0));
    const firstX = Number(sorted[0].x1 || 0);

    // If token starts before the first column boundary, keep it unknown.
    if (startX < firstX) return 'unknown';

    // Column ownership is defined by the latest x1 boundary at or before startX.
    for (let i = sorted.length - 1; i >= 0; i--) {
        if (startX >= Number(sorted[i].x1 || 0)) {
            return sorted[i].key;
        }
    }

    return 'unknown';
}

function detectDataRows(tableRects, headerLines, tableTopY, lineTolerance = 6, geomScale = 1) {
    const lines = groupIntoLines(tableRects, lineTolerance);
    const headerCenters = headerLines.map((line) => Number(line.cy || 0));
    const rows = [];

    lines.forEach((line) => {
        const isHeader = headerCenters.some((cy) => Math.abs(cy - Number(line.cy || 0)) <= Math.max(geomPx(8, geomScale), lineTolerance * 2));
        if (isHeader) return;
        if (Number(line.cy || 0) < tableTopY) return;

        const top = safeMin(line.rects.map((rect) => Number(rect.visualTop || 0)), Number(line.cy || 0));
        const bottom = safeMax(line.rects.map((rect) => toBottom(rect)), Number(line.cy || 0));
        rows.push({
            cy: Number(line.cy || 0),
            y1: Math.max(0, top - geomPx(2, geomScale)),
            y2: bottom + geomPx(2, geomScale),
            rects: line.rects
        });
    });

    return rows;
}

function buildGrid(rows, columns) {
    const grid = rows.map((row) => {
        const cells = {};
        columns.forEach((col) => { cells[col.key] = []; });
        cells.unknown = [];

        row.rects.forEach((rect) => {
            const key = assignToColumn(rect, columns);
            if (!cells[key]) cells[key] = [];
            cells[key].push(String(rect.text || '').trim());
        });

        const merged = {};
        Object.keys(cells).forEach((key) => {
            merged[key] = cells[key].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        });

        return {
            cy: row.cy,
            y1: row.y1,
            y2: row.y2,
            cells: merged
        };
    });

    return grid;
}

function buildConfidence(payload) {
    const {
        tableArea,
        columns,
        unknownRatio
    } = payload;

    const keys = new Set(columns.map((col) => col.key));
    const hasRequired = REQUIRED_KEYS.every((key) => keys.has(key));

    if (
        tableArea.confidence !== 'low'
        && columns.length >= 9
        && hasRequired
        && unknownRatio < 0.20
    ) {
        return 'high';
    }

    if (
        tableArea.confidence !== 'low'
        && columns.length >= 8
        && REQUIRED_KEYS.filter((key) => !keys.has(key)).length <= 1
    ) {
        return 'medium';
    }

    return 'low';
}

function buildTableDebugOverlay(payload) {
    const {
        allRects,
        tableRects,
        ignoredHeaderRects,
        columns,
        headerLines,
        rows,
        tableArea,
        viewportWidth,
        viewportHeight,
        method,
        missingColumns,
        confidence,
        unknownCount,
        columnsBeforeSnap,
        columnsAfterSnap,
        verticalSeparatorsDetected,
        boundaryMoves,
        warnings,
        overlayStyle
    } = payload;

    const overlays = [];
    const W = Math.max(1, Number(viewportWidth || 0));
    const H = Math.max(1, Number(viewportHeight || 0));
    const showAdvanced = String(overlayStyle || 'clean') === 'advanced';

    overlays.push({
        kind: 'table-debug-table-area',
        left: 0,
        top: Math.max(0, Number(tableArea.tableTopY || 0)),
        width: W,
        height: Math.max(2, Number(tableArea.tableBottomY || H) - Number(tableArea.tableTopY || 0)),
        text: 'TABLE AREA'
    });

    if (showAdvanced) {
        overlays.push({
            kind: 'table-debug-table-top-line',
            left: 0,
            top: Math.max(0, Number(tableArea.tableTopY || 0) - 1),
            width: W,
            height: 2,
            text: `TABLE TOP y=${Math.round(Number(tableArea.tableTopY || 0))}`
        });

        ignoredHeaderRects.forEach((rect) => {
            overlays.push({
                kind: 'table-debug-ignored-header',
                left: Number(rect.left || 0) - 1,
                top: Number(rect.visualTop || 0) - 1,
                width: Math.max(6, Number(rect.width || 0) + 2),
                height: Math.max(8, Number(rect.height || 0) + 2),
                text: String(rect.text || '').trim()
            });
        });
    }

    columns.forEach((col) => {
        const width = Math.max(2, Number(col.x2 || 0) - Number(col.x1 || 0));
        overlays.push({
            kind: 'table-debug-col',
            left: Number(col.x1 || 0),
            top: Math.max(0, Number(tableArea.tableTopY || 0)),
            width,
            height: Math.max(2, Number(tableArea.tableBottomY || H) - Number(tableArea.tableTopY || 0)),
            text: col.label,
            color: col.color,
            key: col.key,
            source: col.source,
            confidence: col.confidence
        });
        overlays.push({
            kind: 'table-debug-col-label',
            left: Number(col.x1 || 0) + 2,
            top: Math.max(0, Number(tableArea.tableTopY || 0) - 18),
            width: Math.max(24, width - 4),
            height: 14,
            text: `${col.label} (${col.source || 'auto'})`,
            color: col.color,
            key: col.key
        });
    });

    tableRects.forEach((rect) => {
        const key = assignToColumn(rect, columns);
        const color = COL_ASSIGN_COLORS[key] || COL_ASSIGN_COLORS.unknown;
        overlays.push({
            kind: key === 'unknown' ? 'table-debug-text-unassigned' : 'table-debug-text-assigned',
            left: Number(rect.left || 0) - 1,
            top: Number(rect.visualTop || 0) - 1,
            width: Math.max(6, Number(rect.width || 0) + 2),
            height: Math.max(8, Number(rect.height || 0) + 2),
            text: String(rect.text || '').trim(),
            color,
            key
        });
    });

    if (showAdvanced) {
        const beforeOrdered = sortByCanonical(columnsBeforeSnap || []);
        for (let i = 0; i < beforeOrdered.length - 1; i++) {
            const boundaryX = Number(beforeOrdered[i].x2 || 0);
            overlays.push({
                kind: 'table-debug-boundary-before',
                left: boundaryX,
                top: Math.max(0, Number(tableArea.tableTopY || 0)),
                width: 1,
                height: Math.max(2, Number(tableArea.tableBottomY || H) - Number(tableArea.tableTopY || 0)),
                text: ''
            });
        }

        const afterOrdered = sortByCanonical(columnsAfterSnap || columns || []);
        for (let i = 0; i < afterOrdered.length - 1; i++) {
            const boundaryX = Number(afterOrdered[i].x2 || 0);
            overlays.push({
                kind: 'table-debug-boundary-after',
                left: boundaryX,
                top: Math.max(0, Number(tableArea.tableTopY || 0)),
                width: 2,
                height: Math.max(2, Number(tableArea.tableBottomY || H) - Number(tableArea.tableTopY || 0)),
                text: ''
            });
        }

        (verticalSeparatorsDetected || []).forEach((sep) => {
            overlays.push({
                kind: 'table-debug-separator',
                left: Number(sep.x || 0),
                top: Math.max(0, Number(tableArea.tableTopY || 0)),
                width: 1,
                height: Math.max(2, Number(tableArea.tableBottomY || H) - Number(tableArea.tableTopY || 0)),
                text: `${sep.source || 'sep'} ${Math.round(Number(sep.confidence || 0) * 100)}%`
            });
        });

        headerLines.forEach((line) => {
            overlays.push({
                kind: 'table-debug-header',
                left: 0,
                top: Math.max(0, Number(line.y1 || 0) - 2),
                width: W,
                height: Math.max(10, Number(line.y2 || 0) - Number(line.y1 || 0) + 4),
                text: 'HEADER'
            });
        });

        rows.forEach((row) => {
            overlays.push({
                kind: 'table-debug-row',
                left: 0,
                top: Number(row.y1 || 0),
                width: W,
                height: Math.max(4, Number(row.y2 || 0) - Number(row.y1 || 0)),
                text: ''
            });
        });

    }

    overlays.push({
        kind: 'table-debug-stats',
        left: 4,
        top: 4,
        width: Math.min(420, Math.max(260, W * 0.60)),
        height: 42,
        text: `cols:${columns.length} missing:${missingColumns.join(',') || '-'} method:${method} unknown:${unknownCount} conf:${confidence} seps:${(verticalSeparatorsDetected || []).length} moves:${(boundaryMoves || []).length} warn:${(warnings || []).length}`
    });

    return overlays;
}

export function runTableParser(textItems, viewport, options = {}) {
    const vw = Math.max(1, Number(viewport?.width || 0));
    const vh = Math.max(1, Number(viewport?.height || 0));
    const geomScale = Math.max(0.5, Number(viewport?.scale || 1));
    const lineTolerance = Number(options.lineTolerance || 6) * geomScale;
    const debugOverlayStyle = String(options.debugOverlayStyle || 'clean');

    const rects = extractTextRects(textItems, viewport);
    if (!rects.length) {
        return {
            rects: [],
            tableRects: [],
            columns: [],
            headerLines: [],
            rows: [],
            grid: [],
            tableArea: { tableTopY: 0, tableBottomY: vh, reason: 'empty-page', confidence: 'low' },
            missingColumns: REQUIRED_KEYS,
            unknownRects: 0,
            unknownRatio: 1,
            method: 'none',
            confidence: 'low',
            columnsBeforeSnap: [],
            columnsAfterSnap: [],
            verticalSeparatorsDetected: [],
            boundaryMoves: [],
            warnings: [],
            debugOverlay: []
        };
    }

    const lines = groupIntoLines(rects, lineTolerance);
    const tableArea = detectTableArea(rects, lines, { viewportWidth: vw, viewportHeight: vh, geomScale });

    const tableRects = rects.filter((rect) => {
        const cy = Number(rect.centerY || 0);
        return cy >= Number(tableArea.tableTopY || 0) && cy <= Number(tableArea.tableBottomY || vh);
    });

    const tableLines = groupIntoLines(tableRects, lineTolerance);
    const { anchors, headerLines } = detectHeaderAnchors(tableLines, Number(tableArea.tableTopY || 0), geomPx(90, geomScale), geomScale);

    const headerBottom = headerLines.length
        ? safeMax(headerLines.map((line) => Number(line.y2 || 0)), Number(tableArea.tableTopY || 0))
        : Number(tableArea.tableTopY || 0) + geomPx(24, geomScale);

    const bodyRects = tableRects.filter((rect) => Number(rect.centerY || 0) > (headerBottom + geomPx(2, geomScale)));
    const provisionalRows = detectDataRows(tableRects, headerLines, Number(tableArea.tableTopY || 0), lineTolerance, geomScale);
    const denseSource = bodyRects.length ? bodyRects : tableRects;
    const leftX = Math.max(0, safeMin(denseSource.map((rect) => Number(rect.left || 0)), 0) - geomPx(2, geomScale));
    const rightX = Math.min(vw, safeMax(denseSource.map((rect) => toRight(rect)), vw) + geomPx(2, geomScale));

    const columnDetection = buildColumns(tableRects, anchors, bodyRects, provisionalRows, leftX, rightX, geomScale);
    const columns = columnDetection.columns;

    const rows = provisionalRows;
    const grid = buildGrid(rows, columns);

    const unknownCount = tableRects.filter((rect) => assignToColumn(rect, columns) === 'unknown').length;
    const unknownRatio = unknownCount / Math.max(1, tableRects.length);

    const detectedKeySet = new Set(columns.map((col) => col.key));
    const missingColumns = REQUIRED_KEYS.filter((key) => !detectedKeySet.has(key));
    const confidence = buildConfidence({
        tableArea,
        columns,
        unknownRatio
    });

    const debugOverlay = options.buildDebug === false
        ? []
        : buildTableDebugOverlay({
            allRects: rects,
            tableRects,
            ignoredHeaderRects: tableArea.ignoredHeaderRects || [],
            columns,
            headerLines,
            rows,
            tableArea,
            viewportWidth: vw,
            viewportHeight: vh,
            method: columnDetection.method,
            missingColumns,
            confidence,
            unknownCount,
            columnsBeforeSnap: columnDetection.columnsBeforeSnap || [],
            columnsAfterSnap: columnDetection.columnsAfterSnap || columns,
            verticalSeparatorsDetected: columnDetection.verticalSeparatorsDetected || [],
            boundaryMoves: columnDetection.boundaryMoves || [],
            warnings: columnDetection.warnings || [],
            overlayStyle: debugOverlayStyle
        });

    return {
        rects,
        lines,
        tableArea,
        tableRects,
        ignoredHeaderRects: tableArea.ignoredHeaderRects || [],
        headerLines,
        headerAnchors: anchors,
        detectedHeaderKeys: Array.from(new Set(anchors.map((anchor) => String(anchor.key || '')))),
        detectedHeaderKeys: Array.from(new Set(anchors.map((anchor) => String(anchor.key || '')))),
        columns,
        rows,
        grid,
        unknownRects: unknownCount,
        unknownRatio,
        missingColumns,
        method: columnDetection.method,
        confidence,
        columnsBeforeSnap: columnDetection.columnsBeforeSnap || [],
        columnsAfterSnap: columnDetection.columnsAfterSnap || columns,
        verticalSeparatorsDetected: columnDetection.verticalSeparatorsDetected || [],
        boundaryMoves: columnDetection.boundaryMoves || [],
        warnings: columnDetection.warnings || [],
        debugOverlay
    };
}
