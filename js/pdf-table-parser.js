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
    qty: { min: 24, max: 35 },
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

function percentile(values, p = 0.5) {
    if (!Array.isArray(values) || !values.length) return NaN;
    const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return NaN;
    const clamped = Math.max(0, Math.min(1, Number(p || 0)));
    const idx = (sorted.length - 1) * clamped;
    const low = Math.floor(idx);
    const high = Math.ceil(idx);
    if (low === high) return sorted[low];
    const t = idx - low;
    return (sorted[low] * (1 - t)) + (sorted[high] * t);
}

function pushWarningOnce(warnings, payload) {
    const code = String(payload?.code || '');
    if (!code) return;
    const key = String(payload?.key || '');
    const between = String(payload?.between || '');
    const exists = (warnings || []).some((item) => String(item?.code || '') === code
        && String(item?.key || '') === key
        && String(item?.between || '') === between);
    if (!exists) warnings.push(payload);
}

function clamp01(value) {
    if (!Number.isFinite(Number(value))) return 0;
    return Math.max(0, Math.min(1, Number(value)));
}

function confidenceLabel(score) {
    const v = clamp01(score);
    if (v >= 0.78) return 'high';
    if (v >= 0.48) return 'medium';
    return 'low';
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

function isModelTypeLikeToken(text) {
    const raw = String(text || '').trim();
    const t = normalizeHeaderToken(raw);
    if (!t) return false;
    if (isShortIntegerToken(raw)) return false;
    if (isUnitToken(raw)) return false;
    if (isWeightLikeToken(raw)) return false;
    if (isPartNoLikeToken(raw)) return false;

    // Typical model/type cells are short alpha-numeric descriptors.
    const hasLetter = /[A-Z]/.test(t);
    const hasDigit = /\d/.test(t);
    if (!hasLetter && !hasDigit) return false;
    return t.length >= 2 && t.length <= 22;
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

    if (normalized === 'POS' || normalized === 'POSITION') return 'pos';
    if (normalized.includes('PART') && normalized.includes('NO')) return 'part_no';
    if (normalized.includes('DESIGNATION') || normalized.includes('DESCRIPTION')) return 'designation';
    if (normalized.includes('MODEL') && normalized.includes('TYPE')) return 'model_type';
    if (normalized === 'QTY' || normalized.includes('QUANTITY')) return 'qty';
    if (normalized.includes('UNITS') || normalized === 'UNIT' || normalized === 'UNL') return 'units';
    if (normalized.includes('WEIGHT') || normalized === 'WT' || normalized === 'WGT') return 'weight';
    if (normalized === 'FN' || normalized.includes('FOOTNOTE') || normalized === 'F/N') return 'fn';
    if (normalized.includes('MEASUREMENT')) return 'measurement';
    if (normalized.includes('STANDARD') || normalized === 'STD') return 'standard';

    return null;
}

function detectHeaderAnchors(tableLines, tableTopY, windowPx = 90, geomScale = 1) {
    const candidateLines = (tableLines || []).filter(
        (line) => Number(line?.cy || 0) <= (Number(tableTopY || 0) + Number(windowPx || 0))
    );

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

                if (
                    !key
                    && i === 0
                    && !normalizedPhrase
                    && String(item.phrase || '').trim()
                    && Number(item.right || 0) - Number(item.left || 0) <= geomPx(28, geomScale)
                ) {
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
        anchors: Array.from(anchorsByKey.values())
            .sort((a, b) => Number(a.x1 || a.centerX || 0) - Number(b.x1 || b.centerX || 0)),
        headerLines,
        detectedHeaderKeys: Array.from(anchorsByKey.keys())
    };
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

    // Pure geometry: choose first dense/wide line as table top anchor.
    const candidates = lines
        .map((line) => {
            const spread = Number(line.width || 0) / viewportWidth;
            const itemCount = Array.isArray(line.rects) ? line.rects.length : 0;
            const score = (spread * 2.3) + Math.min(2.2, itemCount * 0.2);
            return { line, spread, itemCount, score };
        })
        .filter((item) => item.spread >= 0.33 && item.itemCount >= 4)
        .sort((a, b) => {
            if (Math.abs(Number(a.line.cy || 0) - Number(b.line.cy || 0)) > geomPx(18, geomScale)) {
                return Number(a.line.cy || 0) - Number(b.line.cy || 0);
            }
            return Number(b.score || 0) - Number(a.score || 0);
        });

    const bestCandidate = candidates[0] || null;

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

    const anchorLine = bestCandidate.line;
    const tableTopY = Math.max(0, Number(anchorLine.y1 || 0) - geomPx(8, geomScale));

    const linesFromTop = lines.filter((line) => Number(line.cy || 0) >= Number(anchorLine.cy || 0));
    let tableBottomY = viewportHeight;
    let lastDense = null;

    linesFromTop.forEach((line) => {
        const span = Number(line.width || 0) / viewportWidth;
        const itemCount = Array.isArray(line.rects) ? line.rects.length : 0;
        const dense = itemCount >= 4 && span >= 0.33;
        if (dense) lastDense = line;
    });

    if (lastDense) {
        tableBottomY = Math.min(viewportHeight, Number(lastDense.y2 || viewportHeight) + geomPx(22, geomScale));
    }

    const ignoredHeaderRects = rects.filter((rect) => Number(rect.centerY || 0) < tableTopY);

    return {
        tableTopY,
        tableBottomY,
        reason: 'density-anchor',
        confidence: bestCandidate.score >= 2.5 ? 'high' : 'medium',
        headerLine: null,
        ignoredHeaderRects
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

function detectNaturalGapsFromBodyRows(bodyRows, leftX, rightX, geomScale = 1) {
    const rows = Array.isArray(bodyRows) ? bodyRows : [];
    if (!rows.length) return [];

    const bins = new Map();
    const binSize = Math.max(1, geomPx(2, geomScale));

    rows.forEach((row) => {
        const rects = [...(row?.rects || [])].sort((a, b) => Number(a.left || 0) - Number(b.left || 0));
        const seenInRow = new Set();
        for (let i = 0; i < rects.length - 1; i++) {
            const r1 = rects[i];
            const r2 = rects[i + 1];
            const gap = Number(r2.left || 0) - Number(toRight(r1));
            if (gap < geomPx(5, geomScale)) continue;
            const x = Number(toRight(r1)) + (gap / 2);
            if (x <= leftX || x >= rightX) continue;

            const bin = Math.round(x / binSize) * binSize;
            const bucket = bins.get(bin) || { xs: [], gaps: [], rowHits: 0 };
            bucket.xs.push(x);
            bucket.gaps.push(gap);
            if (!seenInRow.has(bin)) {
                bucket.rowHits += 1;
                seenInRow.add(bin);
            }
            bins.set(bin, bucket);
        }
    });

    const minHits = Math.max(4, Math.round(rows.length * 0.22));
    const candidates = [];
    bins.forEach((bucket, bin) => {
        if (bucket.rowHits < minHits) return;
        const x = median(bucket.xs);
        const gapMed = median(bucket.gaps);
        const persistence = bucket.rowHits / Math.max(1, rows.length);
        candidates.push({
            x: Number.isFinite(x) ? x : Number(bin),
            confidence: clamp01((persistence * 0.65) + Math.min(0.35, (gapMed / geomPx(22, geomScale)) * 0.35)),
            persistence,
            medianGap: Number.isFinite(gapMed) ? gapMed : 0,
            source: 'natural-gap'
        });
    });

    return aggregateCloseSeparators(candidates.map((item) => ({
        x: item.x,
        score: item.confidence,
        source: 'natural-gap'
    })), geomPx(3, geomScale)).map((item) => {
        const nearest = candidates.sort((a, b) => Math.abs(a.x - item.x) - Math.abs(b.x - item.x))[0];
        return {
            x: Number(item.x || 0),
            confidence: Number(item.confidence || nearest?.confidence || 0),
            persistence: Number(nearest?.persistence || 0),
            medianGap: Number(nearest?.medianGap || 0),
            source: 'natural-gap'
        };
    }).sort((a, b) => Number(a.x || 0) - Number(b.x || 0));
}

function detectBoundaryOverlapMetrics(columns, bodyRows, geomScale = 1) {
    const ordered = sortByCanonical(columns || []);
    const markers = [];
    if (ordered.length < 2 || !Array.isArray(bodyRows) || !bodyRows.length) {
        return { totalCrossings: 0, markers, byBoundary: [] };
    }

    let totalCrossings = 0;
    const byBoundary = [];
    for (let i = 0; i < ordered.length - 1; i++) {
        const leftCol = ordered[i];
        const rightCol = ordered[i + 1];
        const boundaryX = Number(leftCol.x2 || 0);
        let crossings = 0;

        bodyRows.forEach((row) => {
            (row?.rects || []).forEach((rect) => {
                const l = Number(rect.left || 0);
                const r = Number(toRight(rect));
                if (l < boundaryX - geomPx(0.6, geomScale) && r > boundaryX + geomPx(0.6, geomScale)) {
                    crossings += 1;
                    if (markers.length < 140) {
                        markers.push({
                            boundaryX,
                            between: `${leftCol.key}|${rightCol.key}`,
                            left: l,
                            top: Number(rect.visualTop || 0),
                            width: Math.max(3, r - l),
                            height: Math.max(8, Number(rect.height || 0)),
                            text: String(rect.text || '').trim()
                        });
                    }
                }
            });
        });

        totalCrossings += crossings;
        byBoundary.push({ between: `${leftCol.key}|${rightCol.key}`, x: boundaryX, crossings });
    }

    return { totalCrossings, markers, byBoundary };
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

function refineModelQtyBoundary(columns, bodyRects, separators, boundaryMoves, warnings, geomScale = 1) {
    let ordered = sortByCanonical(columns);
    const model = ordered.find((col) => col.key === 'model_type');
    const qty = ordered.find((col) => col.key === 'qty');
    if (!model || !qty) return ordered;

    const x1 = Number(model.x1 || 0);
    const x2 = Number(qty.x2 || 0);
    const zoneRects = (bodyRects || []).filter((rect) => {
        const cx = Number(rect.centerX || 0);
        return cx >= x1 && cx <= x2;
    });

    const modelEnds = zoneRects
        .filter((rect) => isModelTypeLikeToken(rect.text))
        .map((rect) => Number(toRight(rect)));
    const qtyStarts = zoneRects
        .filter((rect) => isShortIntegerToken(rect.text))
        .map((rect) => Number(rect.left || 0));

    if (modelEnds.length >= 4 && qtyStarts.length >= 4) {
        const modelMed = percentile(modelEnds, 0.72);
        const qtyMed = percentile(qtyStarts, 0.28);
        if (Number.isFinite(modelMed) && Number.isFinite(qtyMed) && qtyMed > modelMed + geomPx(2, geomScale)) {
            let newBoundary = (modelMed + qtyMed) / 2;
            newBoundary = nearestSeparatorX(separators, newBoundary, geomPx(12, geomScale));
            ordered = moveBoundaryBetween(ordered, 'model_type', 'qty', newBoundary, 'manual-rule-model-qty', boundaryMoves, geomScale);
        }
    }

    const modelWidth = Number((ordered.find((c) => c.key === 'model_type')?.x2 || 0) - (ordered.find((c) => c.key === 'model_type')?.x1 || 0));
    const qtyWidth = Number((ordered.find((c) => c.key === 'qty')?.x2 || 0) - (ordered.find((c) => c.key === 'qty')?.x1 || 0));
    const qtyMin = Number(getColumnWidthLimit('qty', geomScale).min || geomPx(24, geomScale));
    const modelMax = Number(getColumnWidthLimit('model_type', geomScale).max || geomPx(130, geomScale));

    if (qtyWidth < qtyMin || modelWidth > modelMax * 1.08) {
        const targetShift = Math.max(qtyMin - qtyWidth, modelWidth - modelMax, geomPx(4, geomScale));
        const oldBoundary = Number(ordered.find((c) => c.key === 'model_type')?.x2 || 0);
        const forcedBoundary = oldBoundary - targetShift;
        ordered = moveBoundaryBetween(ordered, 'model_type', 'qty', forcedBoundary, 'manual-rule-model-qty-guard', boundaryMoves, geomScale);
        pushWarningOnce(warnings, {
            code: 'MODEL_QTY_COMPRESSED',
            between: 'model_type|qty',
            modelWidth,
            qtyWidth,
            qtyMin,
            modelMax
        });
    }

    return ordered;
}

function refineColumnsWithBodyEvidence(columns, bodyRows, boundaryMoves, warnings, geomScale = 1) {
    let ordered = sortByCanonical(columns);
    if (!Array.isArray(bodyRows) || !bodyRows.length) return ordered;
    let weakBoundaries = 0;

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
        if (touchingRatio < 0.4 || rowGapCenters.length < Math.max(3, Math.round(bodyRows.length * 0.2))) {
            weakBoundaries += 1;
            continue;
        }

        const newBoundary = median(rowGapCenters);
        if (!Number.isFinite(newBoundary)) continue;
        ordered = moveBoundaryBetween(ordered, leftCol.key, rightCol.key, newBoundary, 'body-gap-refine', boundaryMoves, geomScale);
    }

    if (weakBoundaries >= Math.max(2, Math.round((ordered.length - 1) * 0.45))) {
        warnings.push({ code: 'BODY_ALIGNMENT_WEAK', weakBoundaries, totalBoundaries: Math.max(0, ordered.length - 1) });
    }

    return ordered;
}

function buildBoundaryList(columns, rightX) {
    const ordered = sortByCanonical(columns || []);
    if (!ordered.length) return [];
    const boundaries = ordered.map((col, idx) => ({
        index: idx,
        key: col.key,
        x: Number(col.x1 || 0),
        source: String(col.source || 'auto')
    }));
    boundaries.push({
        index: ordered.length,
        key: 'right-edge',
        x: Number(ordered[ordered.length - 1].x2 || rightX || 0),
        source: 'right-edge'
    });
    return boundaries;
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

function refineBoundariesToNaturalGaps(columns, naturalGaps, boundaryMoves, geomScale = 1) {
    let ordered = sortByCanonical(columns);
    if (!Array.isArray(naturalGaps) || !naturalGaps.length) return ordered;

    for (let i = 0; i < ordered.length - 1; i++) {
        const left = ordered[i];
        const right = ordered[i + 1];
        const oldX = Number(left.x2 || 0);
        const window = Math.max(geomPx(12, geomScale), (Number(right.x2 || 0) - Number(left.x1 || 0)) * 0.18);
        const candidate = [...naturalGaps]
            .filter((gap) => Math.abs(Number(gap.x || 0) - oldX) <= window)
            .sort((a, b) => {
                const da = Math.abs(Number(a.x || 0) - oldX);
                const db = Math.abs(Number(b.x || 0) - oldX);
                const sa = (Number(a.persistence || 0) * 2) + Number(a.confidence || 0) - (da / window);
                const sb = (Number(b.persistence || 0) * 2) + Number(b.confidence || 0) - (db / window);
                return sb - sa;
            })[0];
        if (!candidate) continue;
        ordered = moveBoundaryBetween(ordered, left.key, right.key, Number(candidate.x || oldX), 'natural-gap-refine', boundaryMoves, geomScale);
    }

    return ordered;
}

function minimizeTokenOverlaps(columns, bodyRows, boundaryMoves, warnings, geomScale = 1) {
    let ordered = sortByCanonical(columns);
    if (!Array.isArray(bodyRows) || !bodyRows.length) return { columns: ordered, overlap: detectBoundaryOverlapMetrics(ordered, bodyRows, geomScale) };

    for (let i = 0; i < ordered.length - 1; i++) {
        const left = ordered[i];
        const right = ordered[i + 1];
        const boundaryX = Number(left.x2 || 0);
        const leftEnds = [];
        const rightStarts = [];

        bodyRows.forEach((row) => {
            const rowRects = [...(row?.rects || [])].sort((a, b) => Number(a.left || 0) - Number(b.left || 0));
            if (!rowRects.length) return;
            const leftNear = rowRects.filter((rect) => Number(toRight(rect)) <= boundaryX + geomPx(14, geomScale) && Number(rect.centerX || 0) >= Number(left.x1 || 0));
            const rightNear = rowRects.filter((rect) => Number(rect.left || 0) >= boundaryX - geomPx(14, geomScale) && Number(rect.centerX || 0) <= Number(right.x2 || 0));
            if (!leftNear.length || !rightNear.length) return;
            leftEnds.push(safeMax(leftNear.map((rect) => Number(toRight(rect))), boundaryX));
            rightStarts.push(safeMin(rightNear.map((rect) => Number(rect.left || 0)), boundaryX));
        });

        if (leftEnds.length < 4 || rightStarts.length < 4) continue;
        const leftQ = percentile(leftEnds, 0.78);
        const rightQ = percentile(rightStarts, 0.22);
        if (!Number.isFinite(leftQ) || !Number.isFinite(rightQ)) continue;
        if (rightQ <= leftQ + geomPx(2, geomScale)) continue;
        const proposed = (leftQ + rightQ) / 2;
        ordered = moveBoundaryBetween(ordered, left.key, right.key, proposed, 'overlap-minimize', boundaryMoves, geomScale);
    }

    const overlap = detectBoundaryOverlapMetrics(ordered, bodyRows, geomScale);
    const rowCount = Math.max(1, bodyRows.length);
    if (overlap.totalCrossings > rowCount * 0.85) {
        pushWarningOnce(warnings, { code: 'TOKEN_OVERLAP', crossings: overlap.totalCrossings, rows: rowCount });
    }

    return { columns: ordered, overlap };
}

function refineVerticalBoundaries(columns, bodyRows, separators, naturalGaps, boundaryMoves, warnings, geomScale = 1) {
    let refined = sortByCanonical(columns);
    const bodyRects = (bodyRows || []).flatMap((row) => row?.rects || []);
    let overlap = { totalCrossings: 0, markers: [], byBoundary: [] };

    // Iterative optimizer: body gaps -> natural gaps -> overlap minimization.
    for (let pass = 0; pass < 2; pass++) {
        refined = refineColumnsWithBodyEvidence(refined, bodyRows, boundaryMoves, warnings, geomScale);
        refined = refineBoundariesToNaturalGaps(refined, naturalGaps, boundaryMoves, geomScale);
        refined = refinePosPartBoundary(refined, bodyRects, separators, boundaryMoves, warnings, geomScale);
        refined = refineModelQtyBoundary(refined, bodyRects, separators, boundaryMoves, warnings, geomScale);
        refined = refineUnitsWeightBoundary(refined, bodyRects, separators, boundaryMoves, warnings, geomScale);
        const overlapResult = minimizeTokenOverlaps(refined, bodyRows, boundaryMoves, warnings, geomScale);
        refined = overlapResult.columns;
        overlap = overlapResult.overlap;
        refined = applyFlexibleWidthConstraints(refined, boundaryMoves, warnings, geomScale);
    }

    const part = refined.find((col) => col.key === 'part_no');
    const designation = refined.find((col) => col.key === 'designation');
    const qty = refined.find((col) => col.key === 'qty');
    const model = refined.find((col) => col.key === 'model_type');

    if (part && designation) {
        const partW = Number(part.x2 || 0) - Number(part.x1 || 0);
        const desW = Number(designation.x2 || 0) - Number(designation.x1 || 0);
        if (partW < geomPx(50, geomScale) || partW < desW * 0.36) {
            pushWarningOnce(warnings, { code: 'PARTNO_COMPRESSED', partWidth: partW, designationWidth: desW });
        }
    }

    if (qty) {
        const qtyW = Number(qty.x2 || 0) - Number(qty.x1 || 0);
        if (qtyW < geomPx(24, geomScale)) {
            pushWarningOnce(warnings, { code: 'QTY_TOO_NARROW', width: qtyW, minExpected: geomPx(24, geomScale) });
        }
    }

    if (model) {
        const modelW = Number(model.x2 || 0) - Number(model.x1 || 0);
        const limit = Number(getColumnWidthLimit('model_type', geomScale).max || geomPx(130, geomScale));
        if (modelW > limit * 1.12) {
            pushWarningOnce(warnings, { code: 'MODELTYPE_TOO_WIDE', width: modelW, maxExpected: limit });
        }
    }

    return { columns: refined, overlap };
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

// ════════════════════════════════════════════════════════════════════════════════════════
// ESTRATEGIA EXPERIMENTAL: Header Left Lines (líneas verticales en margen izquierdo)
// ════════════════════════════════════════════════════════════════════════════════════════

/**
 * Detecta líneas verticales en el margen izquierdo (x1) de cada header detectado.
 * Retorna un array de líneas ordenadas por X, listas para ser ajustadas.
 */
function detectHeaderLeftLines(headerAnchors, includeArrow = false) {
    if (!Array.isArray(headerAnchors) || !headerAnchors.length) {
        return [];
    }

    const order = includeArrow ? COLUMN_ORDER : COLUMN_ORDER.filter(k => k !== 'arrow');

    const lines = headerAnchors
        .filter(anchor => String(anchor?.key || '').trim())
        .map(anchor => ({
            key: anchor.key,
            x: Number(anchor.x1 || 0),
            x1Initial: Number(anchor.x1 || 0),
            x1Adjusted: Number(anchor.x1 || 0),
            confidence: anchor.confidence || 'medium',
            text: anchor.text || '',
            headerAnchor: anchor,
            adjustmentSource: null,
            adjustmentDelta: 0
        }))
        .sort((a, b) => a.x - b.x);

    return lines;
}

/**
 * Ajusta líneas verticales de headers usando gaps en body rows.
 * Mantiene la línea cerca de su posición original pero busca gaps reales.
 * Tolerancia: ±8 px para movimiento, sin permitir que se crucen.
 */
function adjustHeaderLeftLinesToGaps(headerLines, bodyRows, leftX, rightX, tolerance = 8, geomScale = 1) {
    if (!Array.isArray(headerLines) || !headerLines.length) {
        return headerLines;
    }

    const tolerancePx = Math.max(4, tolerance * geomScale);
    const adjusted = headerLines.map(line => ({ ...line }));

    // Para cada línea, buscar gaps en body rows cercanos a su posición
    adjusted.forEach((line, idx) => {
        const initialX = Number(line.x1Initial || 0);
        const searchLeft = Math.max(leftX, initialX - tolerancePx);
        const searchRight = Math.min(rightX, initialX + tolerancePx);

        const gaps = detectGapsInBodyRects(bodyRows, searchLeft, searchRight, geomScale);

        if (gaps.length > 0) {
            // Elige el gap más cercano al x1 inicial
            const bestGap = gaps.sort((a, b) => Math.abs(a - initialX) - Math.abs(b - initialX))[0];
            if (Number.isFinite(bestGap)) {
                line.x1Adjusted = bestGap;
                line.adjustmentSource = 'body-gap';
                line.adjustmentDelta = bestGap - initialX;
            }
        }
    });

    // Verifica que las líneas no se crucen
    for (let i = 1; i < adjusted.length; i++) {
        const prev = adjusted[i - 1];
        const current = adjusted[i];
        if (Number(current.x1Adjusted || 0) <= Number(prev.x1Adjusted || 0)) {
            // Restaura a valor inicial si se cruzan
            current.x1Adjusted = Number(current.x1Initial || 0);
            current.adjustmentSource = null;
            current.adjustmentDelta = 0;
        }
    }

    return adjusted;
}

/**
 * Detecta gaps (espacios vacíos) en body rects dentro de un rango X.
 */
function detectGapsInBodyRects(bodyRows, leftX, rightX, geomScale = 1) {
    if (!Array.isArray(bodyRows) || !bodyRows.length) {
        return [];
    }

    const rects = bodyRows.flatMap(row => row?.rects || []);
    if (!rects.length) return [];

    // Histogram approach: divide el rango en buckets
    const bucketSize = Math.max(1, geomPx(2, geomScale));
    const numBuckets = Math.ceil((rightX - leftX) / bucketSize);
    const buckets = new Array(numBuckets).fill(0);

    rects.forEach(rect => {
        const x = Number(rect.centerX || 0);
        if (x >= leftX && x < rightX) {
            const idx = Math.floor((x - leftX) / bucketSize);
            if (idx >= 0 && idx < numBuckets) {
                buckets[idx] += 1;
            }
        }
    });

    // Encuentra gaps: buckets con densidad baja rodeados de densidad alta
    const avg = buckets.reduce((sum, v) => sum + v, 0) / Math.max(1, numBuckets);
    const threshold = avg * 0.3;
    const gaps = [];

    for (let i = 1; i < numBuckets - 1; i++) {
        const prev = buckets[i - 1] || 0;
        const curr = buckets[i] || 0;
        const next = buckets[i + 1] || 0;

        if (curr <= threshold && prev > threshold && next > threshold) {
            const gapX = leftX + (i * bucketSize) + (bucketSize / 2);
            gaps.push(gapX);
        }
    }

    return gaps;
}

/**
 * Construye columnas a partir de líneas verticales de headers.
 * Define cada columna como el espacio entre dos líneas consecutivas.
 */
function buildColumnsFromHeaderLeftLines(headerLeftLines, bodyRects, leftX, rightX, geomScale = 1) {
    if (!Array.isArray(headerLeftLines) || headerLeftLines.length < 2) {
        return null;
    }

    const includeArrow = headerLeftLines.some((line) => line.key === 'arrow');
    const template = buildTemplateColumns(leftX, rightX, includeArrow);
    const detectedByKey = new Map(headerLeftLines.map((line) => [String(line.key || ''), line]));
    const missingHeaders = [];

    const starts = template.map((col) => {
        const line = detectedByKey.get(col.key);
        if (!line) {
            missingHeaders.push(col.key);
        }

        return {
            key: col.key,
            x1: line ? Number(line.x1Adjusted || col.x1) : Number(col.x1 || leftX),
            source: line ? 'header-left-lines' : 'header-left-lines-fallback',
            confidence: line ? (line.confidence || 'medium') : 'low',
            headerLineSource: line || null
        };
    });

    // Keep starts monotonic to avoid boundary crossings.
    let cursor = leftX;
    const monotonicStarts = starts.map((entry, idx) => {
        const minWidth = Number(getColumnWidthLimit(entry.key, geomScale).min || geomPx(6, geomScale));
        const remaining = starts.length - idx - 1;
        const maxStart = rightX - (remaining + 1) * Math.max(geomPx(4, geomScale), minWidth * 0.35);
        const clamped = Math.min(Math.max(entry.x1, cursor), maxStart);
        cursor = clamped + Math.max(geomPx(2, geomScale), minWidth * 0.25);
        return { ...entry, x1: clamped };
    });

    const columns = [];
    for (let i = 0; i < monotonicStarts.length; i++) {
        const current = monotonicStarts[i];
        const next = monotonicStarts[i + 1];
        const x1 = Math.max(leftX, Number(current.x1 || 0));
        const x2 = next
            ? Math.max(x1 + geomPx(4, geomScale), Number(next.x1 || 0))
            : rightX;
        const schema = COLUMN_SCHEMA[current.key] || { label: current.key.toUpperCase(), color: '#22c55e' };

        columns.push({
            key: current.key,
            label: schema.label,
            x1,
            x2,
            source: current.source,
            confidence: current.confidence,
            color: schema.color,
            headerLineSource: current.headerLineSource
        });
    }

    return {
        columns,
        missingHeaders
    };
}

/**
 * Estrategia envolvente: intenta usar líneas de headers para detección de columnas.
 * Si falla, retorna null para que se use estrategia fallback.
 */
function buildColumnsHeaderLeftLinesMode(tableRects, headerAnchors, bodyRects, bodyRows, leftX, rightX, geomScale = 1) {
    if (!Array.isArray(headerAnchors) || headerAnchors.length < 2) {
        return null;
    }

    const includeArrow = headerAnchors.some(a => a.key === 'arrow');

    // Detecta líneas verticales en margen izquierdo de headers
    const headerLines = detectHeaderLeftLines(headerAnchors, includeArrow);
    if (!headerLines.length) {
        return null;
    }

    // Ajusta las líneas usando body gaps
    const adjustedLines = adjustHeaderLeftLinesToGaps(headerLines, bodyRows, leftX, rightX, 8, geomScale);

    // Construye columnas
    const fromHeaderLeft = buildColumnsFromHeaderLeftLines(adjustedLines, bodyRects, leftX, rightX, geomScale);
    if (!fromHeaderLeft || !Array.isArray(fromHeaderLeft.columns) || !fromHeaderLeft.columns.length) {
        return null;
    }

    const columns = fromHeaderLeft.columns;
    const missingHeaders = Array.isArray(fromHeaderLeft.missingHeaders) ? fromHeaderLeft.missingHeaders : [];
    const warnings = [];

    missingHeaders.forEach((key) => {
        warnings.push({ code: 'HEADER_NOT_FOUND', key });
        warnings.push({ code: 'MISSING_BOUNDARY_FALLBACK_USED', key });
    });

    adjustedLines.forEach((line) => {
        const delta = Number(line.adjustmentDelta || 0);
        if (Math.abs(delta) >= geomPx(1.5, geomScale)) {
            warnings.push({ code: 'HEADER_LEFT_LINE_ADJUSTED', key: line.key, delta });
        }
        if (String(line.confidence || 'medium') === 'low') {
            warnings.push({ code: 'HEADER_LEFT_LINE_LOW_CONFIDENCE', key: line.key });
        }
    });

    columns.forEach((col) => {
        const w = Number(col.x2 || 0) - Number(col.x1 || 0);
        const limits = getColumnWidthLimit(col.key, geomScale);
        if (Number.isFinite(limits.min) && w < limits.min * 0.75) {
            warnings.push({ code: 'COLUMN_TOO_NARROW', key: col.key, width: w, minExpected: limits.min });
        }
        if (Number.isFinite(limits.max) && w > limits.max * 1.35) {
            warnings.push({ code: 'COLUMN_TOO_WIDE', key: col.key, width: w, maxExpected: limits.max });
        }
    });

    // Retorna resultado con información de debug
    return {
        columns: sortByCanonical(columns),
        method: 'header-left-lines',
        fallbackApplied: false,
        headerLeftLines: headerLines,
        adjustedHeaderLines: adjustedLines,
        missingHeaders,
        warnings,
        columnsFromHeaderLeft: columns
    };
}

// ════════════════════════════════════════════════════════════════════════════════════════

function buildColumns(tableRects, bodyRects, bodyRows, leftX, rightX, geomScale = 1) {
    const gapBoundaries = detectHistogramGaps(bodyRects, leftX, rightX, geomScale);
    let method = 'body-geometry';
    let fallbackApplied = false;

    let columns = buildTemplateColumns(leftX, rightX, false);
    columns = adjustBoundariesToGaps(columns, gapBoundaries, leftX, rightX, geomScale);
    columns = enforceNarrowColumns(columns, geomScale);
    columns = ensureMeasurementStandardSplit(columns, geomScale);
    columns = removeArrowIfEmpty(columns, bodyRects);

    const keysDetected = new Set(columns.map((col) => col.key));
    const missingCritical = REQUIRED_KEYS.filter((key) => !keysDetected.has(key));
    if (columns.length < 8 || missingCritical.length) {
        fallbackApplied = true;
        method = 'body-geometry-fallback';
        columns = buildTemplateColumns(leftX, rightX, false);
        columns = adjustBoundariesToGaps(columns, gapBoundaries, leftX, rightX, geomScale);
        columns = enforceNarrowColumns(columns, geomScale);
        columns = ensureMeasurementStandardSplit(columns, geomScale);
        columns = removeArrowIfEmpty(columns, bodyRects);
    }

    columns = enforceMonotonicBounds(columns, leftX, rightX, geomScale);
    const columnsBeforeSnap = columns.map((col) => ({ ...col }));
    const initialBoundaries = buildBoundaryList(columnsBeforeSnap, rightX);

    const verticalSeparatorsDetected = detectVerticalSeparators(
        null,
        bodyRects,
        null,
        bodyRows,
        leftX,
        rightX,
        geomScale
    );
    const naturalGapsDetected = detectNaturalGapsFromBodyRows(bodyRows, leftX, rightX, geomScale);

    const snapResult = snapBoundariesToSeparators(columns, verticalSeparatorsDetected, leftX, rightX, geomScale);
    const boundaryMoves = [...(snapResult.boundaryMoves || [])];
    const warnings = [...(snapResult.warnings || [])];

    columns = snapResult.columns;

    const refinedResult = refineVerticalBoundaries(
        columns,
        bodyRows,
        verticalSeparatorsDetected,
        naturalGapsDetected,
        boundaryMoves,
        warnings,
        geomScale
    );
    columns = refinedResult.columns;
    const overlapMarkers = refinedResult.overlap?.markers || [];

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

    const refinedBoundaries = buildBoundaryList(finalColumns, rightX);
    const expectedBoundaryCount = Math.max(1, finalColumns.length - 1);
    if ((verticalSeparatorsDetected || []).length < Math.max(2, Math.round(expectedBoundaryCount * 0.45))) {
        warnings.push({ code: 'BOUNDARY_LOW_CONFIDENCE', separators: (verticalSeparatorsDetected || []).length, expected: expectedBoundaryCount });
    }

    const boundaryAdjustments = (boundaryMoves || []).map((move) => {
        const between = String(move.between || '');
        const [leftKey, rightKey] = between.includes('|') ? between.split('|') : [between, ''];
        return {
            between: between || 'unknown',
            leftKey: leftKey || 'unknown',
            rightKey: rightKey || 'unknown',
            fromX: Number(move.oldX || 0),
            toX: Number(move.newX || 0),
            delta: Number(move.delta || 0),
            source: String(move.reason || 'adjustment')
        };
    });

    return {
        columns: finalColumns,
        method,
        fallbackApplied,
        gapBoundaries,
        columnsBeforeSnap,
        columnsAfterSnap,
        verticalSeparatorsDetected,
        boundaryMoves,
        warnings,
        initialBoundaries,
        refinedBoundaries,
        boundaryAdjustments,
        naturalGapsDetected,
        overlapMarkers
    };
}

function assignToColumn(rect, columns) {
    if (!Array.isArray(columns) || !columns.length) return 'unknown';
    const centerX = Number(rect.centerX || rect.left || 0);
    const sorted = [...columns].sort((a, b) => Number(a.x1 || 0) - Number(b.x1 || 0));
    for (let i = 0; i < sorted.length; i++) {
        const currentX = Number(sorted[i].x1 || 0);
        const nextX = i < sorted.length - 1
            ? Number(sorted[i + 1].x1 || sorted[i].x2 || currentX)
            : Number(sorted[i].x2 || currentX);
        if (centerX >= currentX && centerX < nextX) return sorted[i].key;
    }
    return 'unknown';
}

function detectDataRows(tableRects, tableTopY, lineTolerance = 6, geomScale = 1) {
    const lines = groupIntoLines(tableRects, lineTolerance);
    const rows = [];

    lines.forEach((line) => {
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
        rows,
        tableArea,
        viewportWidth,
        viewportHeight,
        method,
        missingColumns,
        confidence,
        unknownCount,
        initialBoundaries,
        refinedBoundaries,
        verticalSeparatorsDetected,
        naturalGapsDetected,
        overlapMarkers,
        boundaryAdjustments,
        warnings,
        overlayStyle,
        headerAnchors,
        headerLeftLines,
        adjustedHeaderLines,
        experimentalMode
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

    // 🔬 EXPERIMENTAL: Dibuja líneas verticales de headers detectados (header-left-lines mode)
    if (Array.isArray(headerLeftLines) && headerLeftLines.length > 0) {
        headerLeftLines.forEach((line) => {
            const x1Initial = Number(line.x1Initial || 0);
            const tableTopY = Number(tableArea.tableTopY || 0);
            const tableBottomY = Number(tableArea.tableBottomY || H);

            // Línea inicial (discontinua) en gris claro
            overlays.push({
                kind: 'header-left-line-initial',
                left: x1Initial,
                top: Math.max(0, tableTopY),
                width: 1,
                height: Math.max(2, tableBottomY - tableTopY),
                text: `${line.key || 'HEADER'} (INITIAL)`,
                dashStyle: 'dashed',
                color: '#99999955'
            });
        });

        // Líneas ajustadas (sólidas) en color vivo
        if (Array.isArray(adjustedHeaderLines) && adjustedHeaderLines.length > 0) {
            adjustedHeaderLines.forEach((line) => {
                const x1Adjusted = Number(line.x1Adjusted || 0);
                const tableTopY = Number(tableArea.tableTopY || 0);
                const tableBottomY = Number(tableArea.tableBottomY || H);
                const schema = COLUMN_SCHEMA[line.key] || { label: line.key.toUpperCase(), color: '#22c55e' };

                // Línea ajustada (sólida) con color de columna
                overlays.push({
                    kind: 'header-left-line-adjusted',
                    left: x1Adjusted,
                    top: Math.max(0, tableTopY),
                    width: 2,
                    height: Math.max(2, tableBottomY - tableTopY),
                    text: `${line.key || 'HEADER'} (ADJUSTED)`,
                    color: schema.color,
                    dashStyle: 'solid'
                });

                // Etiqueta encima de la línea
                overlays.push({
                    kind: 'header-left-line-label',
                    left: x1Adjusted - 12,
                    top: Math.max(0, tableTopY - 24),
                    width: 28,
                    height: 12,
                    text: line.key ? COLUMN_SCHEMA[line.key]?.label || line.key.toUpperCase() : 'H',
                    color: schema.color,
                    fontSize: 10
                });
            });
        }
    }

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
        const beforeBoundaries = Array.isArray(initialBoundaries) ? initialBoundaries : [];
        for (let i = 0; i < beforeBoundaries.length; i++) {
            const item = beforeBoundaries[i];
            if (String(item.key || '') === 'right-edge') continue;
            const boundaryX = Number(item.x || 0);
            overlays.push({
                kind: 'table-debug-boundary-initial',
                left: boundaryX,
                top: Math.max(0, Number(tableArea.tableTopY || 0)),
                width: 1,
                height: Math.max(2, Number(tableArea.tableBottomY || H) - Number(tableArea.tableTopY || 0)),
                text: `INIT ${String(item.key || '')}`
            });
        }

        const afterBoundaries = Array.isArray(refinedBoundaries) ? refinedBoundaries : [];
        for (let i = 0; i < afterBoundaries.length; i++) {
            const item = afterBoundaries[i];
            if (String(item.key || '') === 'right-edge') continue;
            const boundaryX = Number(item.x || 0);
            overlays.push({
                kind: 'table-debug-boundary-refined',
                left: boundaryX,
                top: Math.max(0, Number(tableArea.tableTopY || 0)),
                width: 2,
                height: Math.max(2, Number(tableArea.tableBottomY || H) - Number(tableArea.tableTopY || 0)),
                text: `REF ${String(item.key || '')}`
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

        (naturalGapsDetected || []).forEach((gap) => {
            overlays.push({
                kind: 'table-debug-natural-gap',
                left: Number(gap.x || 0),
                top: Math.max(0, Number(tableArea.tableTopY || 0)),
                width: 1,
                height: Math.max(2, Number(tableArea.tableBottomY || H) - Number(tableArea.tableTopY || 0)),
                text: `gap ${Math.round(Number(gap.confidence || 0) * 100)}%`
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

        (boundaryAdjustments || []).forEach((move, idx) => {
            overlays.push({
                kind: 'table-debug-boundary-adjustment',
                left: Number(move.toX || 0) + 2,
                top: Math.max(0, Number(tableArea.tableTopY || 0) + 6 + (idx % 8) * 12),
                width: 170,
                height: 11,
                text: `${move.leftKey}|${move.rightKey} Δ${Math.round(Number(move.delta || 0) * 10) / 10} (${move.source})`
            });
        });

        (overlapMarkers || []).forEach((mark) => {
            overlays.push({
                kind: 'table-debug-overlap',
                left: Number(mark.left || 0),
                top: Number(mark.top || 0),
                width: Math.max(4, Number(mark.width || 0)),
                height: Math.max(8, Number(mark.height || 0)),
                text: String(mark.between || 'overlap')
            });
        });

        (warnings || []).forEach((warning, idx) => {
            overlays.push({
                kind: 'table-debug-warning',
                left: Math.max(4, W - 220),
                top: Math.max(6, Number(tableArea.tableTopY || 0) + 8 + (idx * 12)),
                width: 210,
                height: 11,
                text: String(warning.code || 'WARNING')
            });
        });

    }

    overlays.push({
        kind: 'table-debug-stats',
        left: 4,
        top: 4,
        width: Math.min(420, Math.max(260, W * 0.60)),
        height: 54,
        text: `cols:${columns.length} missingCols:${missingColumns.join(',') || '-'} method:${method} unknown:${unknownCount} conf:${confidence} seps:${(verticalSeparatorsDetected || []).length} moves:${(boundaryAdjustments || []).length} warn:${(warnings || []).map((w) => w.code).join('|') || '-'}`
    });

    return overlays;
}

export function runTableParser(textItems, viewport, options = {}) {
    const vw = Math.max(1, Number(viewport?.width || 0));
    const vh = Math.max(1, Number(viewport?.height || 0));
    const geomScale = Math.max(0.5, Number(viewport?.scale || 1));
    const lineTolerance = Number(options.lineTolerance || 6) * geomScale;
    const debugOverlayStyle = String(options.debugOverlayStyle || 'clean');
    const columnDetectionMode = String(options.columnDetectionMode || 'header-left-lines-mark-only');

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

    const headerBottom = Number(tableArea.tableTopY || 0) + geomPx(6, geomScale);

    const bodyRects = tableRects.filter((rect) => Number(rect.centerY || 0) > (headerBottom + geomPx(2, geomScale)));
    const provisionalRows = detectDataRows(tableRects, Number(tableArea.tableTopY || 0), lineTolerance, geomScale);
    const denseSource = bodyRects.length ? bodyRects : tableRects;
    const leftX = Math.max(0, safeMin(denseSource.map((rect) => Number(rect.left || 0)), 0) - geomPx(2, geomScale));
    const rightX = Math.min(vw, safeMax(denseSource.map((rect) => toRight(rect)), vw) + geomPx(2, geomScale));

    // 🔬 EXPERIMENTAL: Intenta detectar headers y usar modo header-left-lines
    const tableLines = groupIntoLines(tableRects, lineTolerance);
    const headerAnchorsResult = detectHeaderAnchors(tableLines, Number(tableArea.tableTopY || 0), geomPx(90, geomScale), geomScale);
    const headerAnchors = headerAnchorsResult?.anchors || [];
    const headerLines = headerAnchorsResult?.headerLines || [];
    const detectedHeaderKeys = headerAnchorsResult?.detectedHeaderKeys || [];

    let columnDetection = null;
    let experimentalHeaderLeftLinesMode = null;
    let headerLeftLinesForDebug = [];
    let adjustedHeaderLinesForDebug = [];

    // Intenta modo experimental header-left-lines
    if (headerAnchors.length >= 2) {
        experimentalHeaderLeftLinesMode = buildColumnsHeaderLeftLinesMode(
            tableRects,
            headerAnchors,
            bodyRects,
            provisionalRows,
            leftX,
            rightX,
            geomScale
        );

        if (experimentalHeaderLeftLinesMode) {
            headerLeftLinesForDebug = experimentalHeaderLeftLinesMode.headerLeftLines || [];
            adjustedHeaderLinesForDebug = experimentalHeaderLeftLinesMode.adjustedHeaderLines || [];
        }
    }

    // Modo visual puro: solo dibuja líneas, no altera columnas ni usa fallback de estrategia experimental.
    if (columnDetectionMode === 'header-left-lines-mark-only') {
        columnDetection = buildColumns(tableRects, bodyRects, provisionalRows, leftX, rightX, geomScale);
    } else if (experimentalHeaderLeftLinesMode && experimentalHeaderLeftLinesMode.columns && experimentalHeaderLeftLinesMode.columns.length >= 8) {
        // Usa experimental si fue exitoso, si no, fallback a estrategia actual.
        columnDetection = experimentalHeaderLeftLinesMode;
    } else {
        columnDetection = buildColumns(tableRects, bodyRects, provisionalRows, leftX, rightX, geomScale);
    }

    const columns = columnDetection.columns;

    const rows = provisionalRows;
    const grid = buildGrid(rows, columns);

    const unknownCount = tableRects.filter((rect) => assignToColumn(rect, columns) === 'unknown').length;
    const unknownRatio = unknownCount / Math.max(1, tableRects.length);

    const detectedKeySet = new Set(columns.map((col) => col.key));
    const missingColumns = REQUIRED_KEYS.filter((key) => !detectedKeySet.has(key));
    const mergedWarnings = [...(columnDetection.warnings || [])];
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
            rows,
            tableArea,
            viewportWidth: vw,
            viewportHeight: vh,
            method: columnDetection.method,
            missingColumns,
            confidence,
            unknownCount,
            initialBoundaries: columnDetection.initialBoundaries || [],
            refinedBoundaries: columnDetection.refinedBoundaries || [],
            verticalSeparatorsDetected: columnDetection.verticalSeparatorsDetected || [],
            naturalGapsDetected: columnDetection.naturalGapsDetected || [],
            overlapMarkers: columnDetection.overlapMarkers || [],
            boundaryAdjustments: columnDetection.boundaryAdjustments || [],
            warnings: mergedWarnings,
            overlayStyle: debugOverlayStyle,
            headerAnchors,
            headerLeftLines: headerLeftLinesForDebug,
            adjustedHeaderLines: adjustedHeaderLinesForDebug,
            experimentalMode: columnDetection.method === 'header-left-lines'
        });

    const geometryDebug = {
        headersDetected: [],
        missingHeaders: [],
        verticalBoundaries: columnDetection.initialBoundaries || [],
        refinedBoundaries: columnDetection.refinedBoundaries || [],
        naturalGapsDetected: columnDetection.naturalGapsDetected || [],
        boundaryAdjustments: columnDetection.boundaryAdjustments || [],
        confidence,
        warnings: mergedWarnings
    };

    return {
        rects,
        lines,
        tableArea,
        tableRects,
        ignoredHeaderRects: tableArea.ignoredHeaderRects || [],
        headerLines: headerLines || [],
        headerAnchors: headerAnchors || [],
        detectedHeaderKeys: detectedHeaderKeys || [],
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
        warnings: mergedWarnings,
        missingHeaders: columnDetection.missingHeaders || [],
        verticalBoundaries: columnDetection.initialBoundaries || [],
        refinedBoundaries: columnDetection.refinedBoundaries || [],
        naturalGapsDetected: columnDetection.naturalGapsDetected || [],
        overlapMarkers: columnDetection.overlapMarkers || [],
        boundaryAdjustments: columnDetection.boundaryAdjustments || [],
        headerLeftLines: headerLeftLinesForDebug,
        adjustedHeaderLines: adjustedHeaderLinesForDebug,
        experimentalMode: columnDetection.method === 'header-left-lines',
        geometryDebug,
        debugOverlay
    };
}
