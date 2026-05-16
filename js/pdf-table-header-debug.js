/**
 * Pure header detection and visualization for BOM PDF tables.
 *
 * Objetivo:
 * - Detectar SOLO los headers de la tabla BOM
 * - Ignorar encabezados de página (EQUI TYPE, SERIAL NUMBER, etc.)
 * - Devolver geometría limpia sin columnas, rows ni boundaries
 */

const HEADER_KEYS_TO_DETECT = [
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

const PAGE_METADATA_HEADERS = [
    'equi', 'type', 'product', 'serial', 'number', 'cabling', 'engine', 'cable',
    'fg', 'fgs', 'bom', 'no', 'bom-no', 'bom no'
];

const HEADER_LABEL_MAP = {
    pos: 'POS',
    part_no: 'PART NO.',
    designation: 'DESIGNATION',
    model_type: 'MODEL/TYPE',
    qty: 'QTY',
    units: 'UNITS',
    weight: 'WEIGHT',
    fn: 'FN',
    measurement: 'MEASUREMENT',
    standard: 'STANDARD'
};

/**
 * Normaliza un token de texto para matching de headers.
 * Uppercase, quita puntos, compacta espacios, unifica variantes.
 */
function normalizeToken(text) {
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
    if (raw === 'PART NO') return 'PART NO';
    if (raw === 'PARTNO') return 'PART NO';

    return raw;
}

/**
 * Detecta qué header key corresponde a una frase.
 * Soporta variantes fragmentadas (PART + NO, MODEL + TYPE).
 */
function detectHeaderKey(phrase) {
    const norm = normalizeToken(phrase);
    if (!norm) return null;

    if (norm === 'POS' || norm === 'POSITION') return 'pos';
    if (norm.includes('PART') && norm.includes('NO')) return 'part_no';
    if (norm.includes('DESIGNATION') || norm.includes('DESCRIPTION')) return 'designation';
    if (norm.includes('MODEL') && norm.includes('TYPE')) return 'model_type';
    if (norm === 'QTY' || norm.includes('QUANTITY')) return 'qty';
    if (norm.includes('UNIT') || norm === 'UNL' || norm.includes('UNITS')) return 'units';
    if (norm.includes('WEIGHT') || norm === 'WT' || norm === 'WGT') return 'weight';
    if (norm === 'FN' || norm.includes('FOOTNOTE') || norm === 'F/N') return 'fn';
    if (norm.includes('MEASUREMENT') || norm === 'MEASURE') return 'measurement';
    if (norm.includes('STANDARD') || norm === 'STD') return 'standard';

    return null;
}

/**
 * Verifica si una frase es un encabezado de página (que debe ignorarse).
 */
function isPageMetadataHeader(phrase) {
    const norm = normalizeToken(phrase).toLowerCase();
    return PAGE_METADATA_HEADERS.some(hint => norm.includes(hint));
}

/**
 * Agrupa rects por línea Y (agrupar por centerY con tolerancia).
 */
function groupByLineY(rects, lineTolerance = 4) {
    if (!Array.isArray(rects) || !rects.length) return [];

    const sorted = [...rects].sort((a, b) => Number(a.centerY || 0) - Number(b.centerY || 0));
    const lines = [];
    let currentLine = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const rect = sorted[i];
        const lastRect = currentLine[currentLine.length - 1];
        const yDiff = Math.abs(Number(rect.centerY || 0) - Number(lastRect.centerY || 0));

        if (yDiff <= lineTolerance) {
            currentLine.push(rect);
        } else {
            if (currentLine.length > 0) lines.push(currentLine);
            currentLine = [rect];
        }
    }

    if (currentLine.length > 0) lines.push(currentLine);

    return lines;
}

/**
 * Agrupa rects de una línea en clusters horizontales (agrupados por proximidad X).
 */
function buildClustersInLine(lineRects, clusterGapMax = 24) {
    if (!Array.isArray(lineRects) || !lineRects.length) return [];

    const sorted = [...lineRects].sort((a, b) => Number(a.left || 0) - Number(b.left || 0));
    const clusters = [];
    let current = { rects: [sorted[0]], parts: [String(sorted[0].text || '').trim()] };

    for (let i = 1; i < sorted.length; i++) {
        const rect = sorted[i];
        const lastRect = current.rects[current.rects.length - 1];
        const gap = Number(rect.left || 0) - Number(lastRect.right || 0);

        if (gap <= clusterGapMax) {
            current.rects.push(rect);
            current.parts.push(String(rect.text || '').trim());
        } else {
            clusters.push(current);
            current = { rects: [rect], parts: [String(rect.text || '').trim()] };
        }
    }

    if (current.rects.length > 0) clusters.push(current);

    // Construir información de cada cluster
    return clusters.map(cluster => {
        const left = Math.min(...cluster.rects.map(r => Number(r.left || 0)));
        const right = Math.max(...cluster.rects.map(r => Number(r.right || 0)));
        const top = Math.min(...cluster.rects.map(r => Number(r.visualTop || r.top || 0)));
        const bottom = Math.max(...cluster.rects.map(r => Number(r.visualTop || r.top || 0) + Number(r.height || 12)));
        const text = cluster.parts.join(' ').replace(/\s+/g, ' ').trim();

        return {
            rects: cluster.rects,
            text,
            normalizedText: normalizeToken(text),
            left,
            right,
            top,
            bottom,
            centerX: (left + right) / 2,
            centerY: (top + bottom) / 2,
            width: right - left,
            height: bottom - top
        };
    });
}

/**
 * Detecta headers en una línea de candidatos.
 * Busca matches individuales y fragmentados (PART + NO, MODEL + TYPE).
 */
function detectHeadersInLine(lineRects, clusterGapMax = 24) {
    const clusters = buildClustersInLine(lineRects, clusterGapMax);
    if (!clusters.length) return { headers: [], confidence: 'low' };

    const headers = [];
    const processedIndexes = new Set();

    // Intenta detectar con 1, 2 o 3 clusters consecutivos
    for (let i = 0; i < clusters.length; i++) {
        if (processedIndexes.has(i)) continue;

        const c1 = clusters[i];
        const candidates = [
            { phrase: c1.text, clusterIdx: [i], score: 1.0 },
            i + 1 < clusters.length
                ? {
                    phrase: `${c1.text} ${clusters[i + 1].text}`,
                    clusterIdx: [i, i + 1],
                    score: 1.15
                }
                : null,
            i + 2 < clusters.length
                ? {
                    phrase: `${c1.text} ${clusters[i + 1].text} ${clusters[i + 2].text}`,
                    clusterIdx: [i, i + 1, i + 2],
                    score: 1.3
                }
                : null
        ].filter(Boolean);

        for (const candidate of candidates) {
            const key = detectHeaderKey(candidate.phrase);
            if (!key) continue;

            // Ignorar encabezados de página
            if (isPageMetadataHeader(candidate.phrase)) continue;

            const targetClusters = candidate.clusterIdx.map(idx => clusters[idx]);
            const x1 = Math.min(...targetClusters.map(c => c.left));
            const x2 = Math.max(...targetClusters.map(c => c.right));
            const y1 = Math.min(...targetClusters.map(c => c.top));
            const y2 = Math.max(...targetClusters.map(c => c.bottom));

            headers.push({
                key,
                label: HEADER_LABEL_MAP[key] || key.toUpperCase(),
                text: candidate.phrase,
                x1,
                x2,
                y1,
                y2,
                centerX: (x1 + x2) / 2,
                centerY: (y1 + y2) / 2,
                width: x2 - x1,
                height: y2 - y1,
                confidence: candidate.score >= 1.2 ? 'high' : 'medium',
                score: candidate.score,
                fragmentCount: candidate.clusterIdx.length
            });

            // Marca como procesado el primer cluster de este match
            processedIndexes.add(candidate.clusterIdx[0]);
        }
    }

    const confidence = headers.length >= 4 ? 'high' : headers.length >= 2 ? 'medium' : 'low';
    return { headers, confidence };
}

/**
 * Función principal: detecta headers de tabla BOM.
 * Entrada: rects (array de geometría de texto del PDF)
 * Salida: { headerRowY, confidence, headers: [{key, label, text, x1, y1, x2, y2, centerX}, ...] }
 */
export function detectBomTableHeaders(rects, options = {}) {
    if (!Array.isArray(rects) || !rects.length) {
        return {
            headerRowY: null,
            confidence: 'low',
            headers: [],
            reason: 'no-rects'
        };
    }

    const lineTolerance = Number(options.lineTolerance || 4);
    const clusterGapMax = Number(options.clusterGapMax || 24);

    // Agrupar en líneas
    const lines = groupByLineY(rects, lineTolerance);
    if (!lines.length) {
        return {
            headerRowY: null,
            confidence: 'low',
            headers: [],
            reason: 'no-lines'
        };
    }

    // Buscar la línea con más headers detectados (y que no sea encabezado de página)
    let bestLineIdx = -1;
    let bestHeadersCount = 0;
    let bestHeaders = [];
    let bestConfidence = 'low';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const result = detectHeadersInLine(line, clusterGapMax);
        const { headers } = result;

        // Ignorar líneas que parecen encabezados de página
        const lineText = line.map(r => String(r.text || '').trim()).join(' ');
        if (isPageMetadataHeader(lineText)) {
            continue;
        }

        // Preferir líneas con muchos headers BOM
        if (headers.length > bestHeadersCount) {
            bestLineIdx = i;
            bestHeadersCount = headers.length;
            bestHeaders = headers;
            bestConfidence = result.confidence;
        }
    }

    if (bestLineIdx === -1 || bestHeaders.length === 0) {
        return {
            headerRowY: null,
            confidence: 'low',
            headers: [],
            reason: 'no-headers-found'
        };
    }

    // Ordenar headers por X
    bestHeaders.sort((a, b) => a.x1 - b.x1);

    const bestLine = lines[bestLineIdx];
    const headerRowY = (bestLine[0].centerY || bestLine[0].visualTop || 0);

    return {
        headerRowY,
        confidence: bestConfidence,
        headers: bestHeaders,
        detectedKeys: bestHeaders.map(h => h.key),
        lineIndex: bestLineIdx,
        totalLinesProcessed: lines.length,
        reason: 'headers-detected'
    };
}

/**
 * Construye overlay visual SOLO de headers para debug.
 * Devuelve array de overlay items con kind='header-debug-*'.
 */
export function buildHeaderDebugOverlay(headerDetection, viewportWidth = 0, viewportHeight = 0) {
    const overlays = [];

    if (!headerDetection || !Array.isArray(headerDetection.headers)) {
        return overlays;
    }

    const { headers, headerRowY } = headerDetection;

    // Línea horizontal de fondo (opcional)
    if (Number.isFinite(headerRowY) && viewportWidth > 0) {
        overlays.push({
            kind: 'header-debug-row-bg',
            left: 0,
            top: Math.max(0, Number(headerRowY) - 12),
            width: viewportWidth,
            height: 28,
            text: ''
        });
    }

    // Rectángulo y etiqueta para cada header
    headers.forEach((header, idx) => {
        overlays.push({
            kind: 'header-debug-rect',
            left: Number(header.x1 || 0),
            top: Number(header.y1 || 0),
            width: Math.max(2, Number(header.width || 10)),
            height: Math.max(2, Number(header.height || 10)),
            text: header.key.toUpperCase(),
            key: header.key,
            confidence: header.confidence
        });

        // Etiqueta encima del rectángulo
        overlays.push({
            kind: 'header-debug-label',
            left: Number(header.x1 || 0),
            top: Math.max(0, Number(header.y1 || 0) - 16),
            width: Math.max(Number(header.width || 10), 40),
            height: 14,
            text: header.key.toUpperCase(),
            key: header.key
        });

        // Línea vertical opcional (x1)
        overlays.push({
            kind: 'header-debug-vline',
            left: Number(header.x1 || 0),
            top: Math.max(0, Number(header.y1 || 0) - 16),
            width: 1,
            height: Math.max(10, Number(header.height || 10) + 16),
            text: ''
        });
    });

    // Estadísticas globales
    if (headers.length > 0) {
        overlays.push({
            kind: 'header-debug-stats',
            left: 4,
            top: 4,
            width: 280,
            height: 40,
            text: `Headers: ${headers.length} | Confidence: ${headerDetection.confidence}`,
            detectedKeys: headerDetection.detectedKeys || []
        });
    }

    return overlays;
}
