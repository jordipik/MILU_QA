# Runtime Flow - Module Integration & Execution Pipeline

## Entry Points

### 1. From `analista-02.html` (QA Interface)

```
User selects row with PDF reference
    ↓
qa-milu.js: onRowClick()
    ↓
loadPdfWithPageAndAutoRender(book, pageNumber)
    ↓
pdf-viewer.js: loadPdfWithPage()
    ↓
Parse PDF, extract tokens, detect table
    ↓
[Auto-render headers + body if flags enabled]
    ↓
renderHeaderDetectionPanel() / renderBodyColumnHighlightPanel() [optional]
    ↓
Display comparison table (PDF vs QA data)
```

### 2. From `analista_02.html` (Legacy Analysis)

```
User uploads PDF
    ↓
analista-02.js: initPdfViewer()
    ↓
pdf-viewer.js: loadPdfWithPage()
    ↓
[Same parsing + rendering pipeline]
```

## Module Call Hierarchy

```
qa_milu.html
    ↓
js/qa-milu.js
    ├─ loadPdfWithPageAndAutoRender()
    ├─ renderHeaderDetectionPanel()
    └─ renderBodyColumnHighlightPanel()
    
    ↓
js/pdf-viewer.js
    ├─ loadPdfWithPage()
    ├─ renderPdfPage()
    ├─ runPdfHeaderOnlyDetection()  [optional]
    ├─ buildHeaderColumnBodyHighlights()  [optional]
    └─ [Caching + zoom controls]
    
    ↓
js/pdf-table-parser.js (Core)
    ├─ parseTable()
    │   ├─ extractTextRects()
    │   ├─ groupIntoLines()
    │   ├─ detectTableArea()
    │   ├─ detectHeaderAnchors()
    │   ├─ detectVerticalSeparators()
    │   ├─ refineVerticalBoundaries()
    │   ├─ groupIntoRows()
    │   ├─ assignRectsToColumns()
    │   └─ buildDebugOverlay()
    │
    ├─ runPdfHeaderOnlyDetection()
    │   ├─ extractPdfTextRects()
    │   ├─ buildLineGroups()
    │   ├─ detectHeaderLineGroups()
    │   └─ refineCombinedHeaderBounds()
    │
    └─ buildHeaderColumnBodyHighlights()
        └─ [Paint column highlights using detected headers]

js/state.js (Global State)
    ├─ currentPdfTableData
    ├─ currentPdfHeaderOnlyDebug
    ├─ currentPdfHeaderColumnBodyDebug
    ├─ currentPdfLastTextItems [cache]
    ├─ currentPdfLastViewport [cache]
    └─ currentPdfZoom

js/data-loader.js
    ├─ loadEngineDataByFileName()
    ├─ saveCellToServer()
    └─ [Persistence layer]
```

## Detailed Runtime: Parse PDF → Output Table

### Stage 1: PDF Loading

```javascript
// pdf-viewer.js: loadPdfWithPage()

// 1. Fetch PDF via PDF.js
const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
const page = await pdf.getPage(pageNumber);

// 2. Get text content + viewport
const textContent = await page.getTextContent();
const viewport = page.getViewport({ scale: state.currentPdfZoom || 1.5 });

// 3. Cache para reutilización
state.currentPdfLastTextItems = textContent.items;
state.currentPdfLastViewport = viewport;
state.currentPdfLastTextPageNumber = pageNumber;

// 4. Renderizar canvas (PDF.js renderContext)
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const renderContext = {
    canvasContext: ctx,
    viewport: viewport
};
await page.render(renderContext).promise;
```

### Stage 2: Text Extraction

```javascript
// pdf-table-parser.js: extractTextRects()

const rects = [];
for (const item of textItems) {
    const str = String(item.str || '').trim();
    if (!str) continue;
    
    // Transform: item PDF coords → viewport pixel coords
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const left = tx[4];
    const top = tx[5];
    const width = item.width * viewport.scale;
    const height = Math.max(8, (item.height || 12) * viewport.scale);
    
    rects.push({
        text: str,
        normalizedText: normalizeHeaderToken(str),
        left, top, width, height,
        centerX: left + (width/2),
        centerY: top - (height/2),
        visualTop: top - height
    });
}

// Resultado: rects[] de todos los tokens con geometría
```

### Stage 3: Line Grouping

```javascript
// groupIntoLines(rects, tolerance=6)

const lines = [];
const sorted = rects.sort((a,b) => a.centerY - b.centerY);

sorted.forEach((rect) => {
    const dynamicTol = Math.max(6, rect.height * 0.55);
    const line = lines.find(l => 
        Math.abs(l.cy - rect.centerY) <= dynamicTol
    );
    
    if (line) {
        line.rects.push(rect);
        line.cy = average(line.rects.map(r => r.centerY));
    } else {
        lines.push({ cy: rect.centerY, rects: [rect] });
    }
});

// Resultado: lines[] agrupadas por baseline Y
```

### Stage 4: Table Area Detection

```javascript
// detectTableArea(rects, lines, pageInfo)

const candidates = lines
    .filter(l => (l.width/vpWidth >= 0.33) && l.rects.length >= 4)
    .map(l => ({ line: l, score: scoring(l) }))
    .sort((a,b) => b.score - a.score);

const best = candidates[0];
const tableTopY = best.line.y1 - 8;
const lastDense = lines.filter(l => isDense(l)).reverse()[0];
const tableBottomY = lastDense ? lastDense.y2 + 22 : vpHeight;

// Resultado: { tableTopY, tableBottomY, confidence }
```

### Stage 5: Header Detection

```javascript
// detectHeaderAnchors(tableLines, tableTopY)

const candidateLines = tableLines.filter(l => l.cy <= tableTopY + 90);

const anchors = [];
candidateLines.forEach(line => {
    const clusters = buildClusters(line.rects, 26);
    
    clusters.forEach((c, i) => {
        for (let j = i; j <= Math.min(i+2, clusters.length-1); j++) {
            const phrase = clusters[i...j].map(x => x.text).join(' ');
            const key = detectHeaderKeyFromPhrase(phrase);
            
            if (key) {
                anchors.push({
                    key,
                    x1: clusters[i].left,
                    x2: clusters[j].right,
                    confidence: (j > i) ? 'high' : 'medium'
                });
            }
        }
    });
});

// Resultado: anchors[] con headers detectados
```

### Stage 6: Column Detection (Hybrid)

```javascript
// refineVerticalBoundaries(columns, bodyRows, separators)

// 6a. Template initialization
let columns = buildTemplateColumns(leftX, rightX, includeArrow);

// 6b. Merge with header anchors
columns = mergeAnchorsIntoTemplate(columns, anchors);

// 6c. Detect separators (3 strategies)
const gridlines = detectGridlineEdges(bodyRects);
const textGaps = detectTextGaps(bodyRows);
const naturalGaps = detectNaturalGapsFromBodyRows(bodyRows, leftX, rightX);
const allSeparators = [...gridlines, ...textGaps, ...naturalGaps];

// 6d. Snap boundaries
columns = snapBoundariesToSeparators(columns, allSeparators);

// 6e. Iterative refinement (2 passes)
for (let pass = 0; pass < 2; pass++) {
    columns = refineColumnsWithBodyEvidence(columns, bodyRows);
    columns = refinePosPartBoundary(columns, bodyRects, allSeparators);
    columns = refineModelQtyBoundary(columns, bodyRects, allSeparators);
    columns = refineUnitsWeightBoundary(columns, bodyRects, allSeparators);
    columns = minimizeTokenOverlaps(columns, bodyRows);
    columns = applyFlexibleWidthConstraints(columns);
}

// Resultado: columns[] con boundaries optimizadas
```

### Stage 7: Row Grouping & Assignment

```javascript
// groupIntoRows(bodyRects, columns)

const rows = [];
const sorted = bodyRects.sort((a,b) => a.centerY - b.centerY);

sorted.forEach((rect) => {
    const dynamicTol = Math.max(12, rect.height * 0.6);
    const row = rows.find(r => Math.abs(r.baselineY - rect.centerY) <= dynamicTol);
    
    if (row) {
        row.rects.push(rect);
        row.baselineY = average(row.rects.map(r => r.centerY));
    } else {
        rows.push({ rects: [rect], baselineY: rect.centerY });
    }
});

// Assign rects to columns
rows = rows.map((row, idx) => {
    const grid = {};
    row.rects.forEach(rect => {
        const col = columns.find(c => rect.centerX >= c.x1 && rect.centerX < c.x2);
        const key = col?.key || 'unknown';
        
        if (!grid[key]) grid[key] = [];
        grid[key].push(rect);
    });
    
    return { rowId: idx, baselineY: row.baselineY, rects: row.rects, grid };
});

// Resultado: rows[] con column assignment
```

### Stage 8: Semantic Classification

```javascript
// [En pdf-table-parser.js o downstream]

rows.forEach(row => {
    // FN override
    semanticOverrideForFn(row);
    
    // Multiline reconstruction
    for (const [key, rects] of Object.entries(row.grid)) {
        if (Array.isArray(rects) && rects.length > 1) {
            row.grid[key] = reconstructMultilineField(rects);
        }
    }
    
    // Validation
    row.warnings = validateRequiredFields(row);
    row.confidence = calculateRowConfidence(row, row.warnings);
});

// Resultado: rows[] con clasificación semántica
```

### Stage 9: Debug Overlay

```javascript
// buildDebugOverlay(rows, columns, anchors, separators, canvas)

const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
svg.classList.add('pdf-overlay-svg');

// Draw tokens
rows.forEach(row => {
    row.rects.forEach(rect => {
        const col = columns.find(c => rect.centerX >= c.x1 && rect.centerX < c.x2);
        const color = COL_ASSIGN_COLORS[col?.key || 'unknown'];
        drawRect(svg, { x: rect.left, y: rect.visualTop, width: rect.width, height: rect.height, fill: color });
    });
});

// Draw column lines
columns.forEach(col => {
    drawLine(svg, { x1: col.x1, y1: tableTopY, x2: col.x1, y2: tableBottomY, stroke: COLUMN_COLORS[col.key], strokeWidth: 2 });
});

// Append to DOM
document.querySelector('.pdfviewer-inner').appendChild(svg);

// Resultado: overlays visuales mostrados encima del PDF
```

### Stage 10: State Update & UI Rendering

```javascript
// Back in pdf-viewer.js

state.currentPdfTableData = {
    pageNumber,
    rows,
    columns,
    tableArea: { tableTopY, tableBottomY },
    anchors,
    separators: allSeparators,
    timestamp: Date.now()
};

state.currentPdfHeaderOnlyDebug = {
    anchors,
    headerLines: [...],
    confidence: tableArea.confidence
};

state.currentPdfHeaderColumnBodyDebug = {
    rows: rows.map(r => ({ rowId: r.rowId, grid: r.grid, warnings: r.warnings })),
    columns,
    totalCrossings: overlapMetrics.totalCrossings
};

// En qa-milu.js: Auto-render panels si flag habilitado
if (AUTO_RENDER_PANELS) {
    renderHeaderDetectionPanel();
    renderBodyColumnHighlightPanel();
}

// Comparación table con datos QA
buildComparisonTable(state.currentPdfTableData, qaData);
```

## Feature Flags & Control Flow

```javascript
// In analista-02.js / qa-milu.js

const PDF_FEATURE_HEADERS_ENABLED = true;          // Detectar headers
const PDF_MINIMAL_GREEN_HIGHLIGHTS_MODE = true;    // Solo POS/PART NO
const PDF_FEATURE_BLUE_TEXT_PANEL_ENABLED = false; // Blue text (perf)
const PDF_EXPERIMENTAL_COLUMN_FEATURES_ENABLED = false;

function applyPdfFeatureFlagsToUi() {
    if (!PDF_FEATURE_HEADERS_ENABLED) {
        $('#detectHeadersBtn').disabled = true;
        $('#detectHeadersBtn').style.opacity = 0.5;
    }
    // ... etc
}

// On user click
$('#detectHeadersBtn').click(() => {
    if (PDF_FEATURE_HEADERS_ENABLED) {
        runPdfHeaderOnlyDetection();
    } else {
        alert("Feature disabled");
    }
});
```

## Caching Strategy

```javascript
// pdf-viewer.js: refreshPdfSelectionOverlayFromCache()

// After loading PDF once, rects are cached
if (state.currentPdfLastTextPageNumber === pageNumber) {
    // Re-use cached rects instead of calling page.getTextContent() again
    const rects = extractTextRects(
        state.currentPdfLastTextItems,
        state.currentPdfLastViewport
    );
    
    // Rebuild overlay from cache
    // No re-parse of PDF text content
}

// Benefit: Instantaneous re-render when switching between rows of same page
```

## Error Handling

```javascript
// pdf-viewer.js: renderPdfPage()

try {
    await page.render(renderContext).promise;
} catch (error) {
    if (error.name === 'RenderingCancelledException') {
        console.log("Render cancelled (user zoomed/scrolled)");
        return;
    }
    console.error("PDF render error:", error);
    showToast("Error rendering PDF", "error");
}

// parseTable() 
try {
    const result = parseTable(rects, lines, pageInfo);
} catch (error) {
    console.error("Parser error:", error);
    state.currentPdfTableData = null;
    showWarning("Tabla no pudo ser parseada");
}
```

---

**Véase también:**
- [00_overview.md](00_overview.md) - Pipeline overview diagram
- [07_debug_visualization.md](07_debug_visualization.md) - Panel rendering
- [09_known_issues.md](09_known_issues.md) - Runtime issues

**Última actualización**: Mayo 17, 2026
