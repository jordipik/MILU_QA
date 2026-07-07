# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Debug Visualization - Overlay System & Panels

## Overview

Sistema interactivo para visualizar en tiempo real todos los pasos del parser:
- GeometrÃ­a de tokens y lÃ­neas
- Ãrea tabular detectada
- Headers identificados
- Boundaries de columnas
- AsignaciÃ³n de tokens a columnas
- Warnings y metricsas

## Overlay Architecture

### Layer Structure

```
PDF Canvas (rendered page)
    â†“
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ SVG Overlay Layer            â”‚  â† geomÃ©trico (rects, lines, text labels)
â”‚ (above canvas)               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
    â†“
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Selection Layer (divs)       â”‚  â† interactive highlights
â”‚ .pdf-selection-layer         â”‚  â† token highlighting on hover
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### HTML Structure

```html
<div class="pdfviewer-inner">
    <!-- Canvas del PDF -->
    <canvas class="pdfCanvas"></canvas>
    
    <!-- Overlay SVG para geometrÃ­a -->
    <svg class="pdf-overlay-svg" style="position: absolute; top: 0; left: 0;">
        <!-- Rectangles, lines, labels aquÃ­ -->
    </svg>
    
    <!-- Selection layer para interactividad -->
    <div class="pdf-selection-layer">
        <!-- Divs para cada token highlight -->
    </div>
</div>
```

## Color Coding System

### Column Colors

Cada columna tiene color Ãºnico para identificaciÃ³n rÃ¡pida:

```javascript
const COLUMN_COLORS = {
    arrow: '#0f766e',           // Teal
    pos: '#2563eb',             // Blue
    part_no: '#dc2626',         // Red
    designation: '#0891b2',     // Cyan
    model_type: '#d97706',      // Amber
    qty: '#7c3aed',             // Violet
    units: '#16a34a',           // Green
    weight: '#db2777',          // Pink
    fn: '#0ea5e9',              // Sky blue
    measurement: '#ea580c',     // Orange
    standard: '#4338ca',        // Indigo
    unknown: '#ef4444'          // Red (error)
};
```

### Semi-transparent Overlay

```javascript
const COL_ASSIGN_COLORS = {
    arrow: 'rgba(15,118,110,0.45)',     // 45% opacity
    pos: 'rgba(37,99,235,0.45)',
    // ... etc
};

// En debug panel:
function drawTokenHighlight(rect, columnKey) {
    const color = COL_ASSIGN_COLORS[columnKey] || 'rgba(239,68,68,0.65)';
    drawRect(canvas, {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        color: color,
        borderColor: COLUMN_COLORS[columnKey],
        borderWidth: 2,
        opacity: 0.45
    });
}
```

**Rationale**: 45% opacity permite ver contenido debajo mientras destaca assignment.

## Debug Visualization Elements

### 1. Token Bounding Boxes

```javascript
// Para cada rect en body
drawRect(svg, {
    x: rect.left,
    y: rect.visualTop,
    width: rect.width,
    height: rect.height,
    fill: 'none',
    stroke: '#999',
    strokeWidth: 1,
    opacity: 0.3
});

// Label con texto
drawText(svg, {
    x: rect.left + 2,
    y: rect.visualTop + 10,
    text: rect.text.substring(0, 5) + '...',
    fontSize: 8,
    fill: '#666'
});
```

### 2. Column Boundaries

```javascript
// LÃ­nea vertical para cada boundary
columns.forEach((col) => {
    // Left edge
    drawLine(svg, {
        x1: col.x1,
        y1: tableTopY,
        x2: col.x1,
        y2: tableBottomY,
        stroke: COLUMN_COLORS[col.key],
        strokeWidth: 2,
        strokeDasharray: '5,5',  // Dashed
        opacity: 0.7,
        label: col.key
    });
    
    // Right edge (lighter)
    drawLine(svg, {
        x1: col.x2,
        y1: tableTopY,
        x2: col.x2,
        y2: tableBottomY,
        stroke: COLUMN_COLORS[col.key],
        strokeWidth: 1,
        strokeDasharray: '5,5',
        opacity: 0.4
    });
    
    // Label
    drawText(svg, {
        x: (col.x1 + col.x2) / 2,
        y: tableTopY - 5,
        text: col.label,
        fontSize: 10,
        fill: COLUMN_COLORS[col.key],
        textAnchor: 'middle'
    });
});
```

### 3. Header Anchors

```javascript
// Small markers para detected headers
anchors.forEach((anchor) => {
    drawCircle(svg, {
        cx: anchor.centerX,
        cy: tableTopY - 15,
        r: 4,
        fill: COLUMN_COLORS[anchor.key],
        opacity: anchor.confidence === 'high' ? 1 : 0.5,
        label: anchor.key
    });
});
```

### 4. Vertical Separators

```javascript
// LÃ­neas mostrando detected separators
separators.forEach((sep) => {
    const color = sep.source === 'gridline' ? '#00ff00' : 
                  sep.source === 'text-gap' ? '#ffff00' :
                  '#0088ff';
    
    drawLine(svg, {
        x1: sep.x,
        y1: tableTopY,
        x2: sep.x,
        y2: tableBottomY,
        stroke: color,
        strokeWidth: 1,
        opacity: sep.confidence * 0.6,  // Opacity proporcional a confidence
        strokeDasharray: '2,2'
    });
});
```

### 5. Token Assignments (Color Overlay)

```javascript
// DespuÃ©s de column assignment, pintar cada token con color de columna
rows.forEach((row) => {
    for (const [columnKey, rects] of Object.entries(row.grid)) {
        const rectList = Array.isArray(rects) ? rects : [rects];
        rectList.forEach((rect) => {
            drawRect(svg, {
                x: rect.left,
                y: rect.visualTop,
                width: rect.width,
                height: rect.height,
                fill: COL_ASSIGN_COLORS[columnKey],
                stroke: COLUMN_COLORS[columnKey],
                strokeWidth: 1.5
            });
        });
    }
});
```

## Debug Panels

### Header Detection Panel

Mostra en sidebar HTML:

```html
<div id="headerDetectionPanel" class="header-detection-panel">
    <h3>Header Detection Results</h3>
    <table>
        <tr>
            <th>Key</th>
            <th>Text</th>
            <th>X1</th>
            <th>Confidence</th>
        </tr>
        <!-- Rows dinÃ¡mico desde state.currentPdfHeaderOnlyDebug -->
    </table>
</div>
```

Renderizado desde `renderHeaderDetectionPanel()` en qa-milu.js:

```javascript
function renderHeaderDetectionPanel() {
    const debug = state.currentPdfHeaderOnlyDebug || {};
    const anchors = debug.anchors || [];
    
    let html = '<table>';
    anchors.forEach(anchor => {
        const color = COLUMN_COLORS[anchor.key] || '#999';
        html += `<tr>
            <td style="color: ${color}"><strong>${anchor.key}</strong></td>
            <td>${anchor.text}</td>
            <td>${Math.round(anchor.x1)}</td>
            <td><badge>${anchor.confidence}</badge></td>
        </tr>`;
    });
    html += '</table>';
    
    $('#headerDetectionPanel').html(html);
}
```

### Column & Body Assignment Panel

```html
<div id="bodyColumnHighlightPanel" class="header-detection-panel">
    <h3>Column Assignments</h3>
    <div class="assignments">
        <!-- Muestra grid assignment por fila -->
    </div>
    <div class="warnings">
        <h4>Warnings</h4>
        <ul id="warningsList"></ul>
    </div>
</div>
```

Renderizado desde `renderBodyColumnHighlightPanel()`:

```javascript
function renderBodyColumnHighlightPanel() {
    const debug = state.currentPdfHeaderColumnBodyDebug || {};
    const rows = debug.rows || [];
    
    let html = '<div class="rows-list">';
    rows.slice(0, 5).forEach((row, idx) => {  // Mostrar solo primeras 5 rows
        html += `<div class="row-assignment">
            <strong>Row ${row.rowId}:</strong>
            ${Object.entries(row.grid).map(([key, rect]) => 
                `<span style="color: ${COLUMN_COLORS[key]}">${key}="${rect?.text || '?'}"</span>`
            ).join(' ')}
        </div>`;
    });
    html += '</div>';
    
    $('#bodyColumnHighlightPanel').html(html);
}
```

## Toggle & Control Buttons

### Feature Flags

En `analista-02.js`:

```javascript
const PDF_FEATURE_HEADERS_ENABLED = true;
const PDF_MINIMAL_GREEN_HIGHLIGHTS_MODE = true;  // Perf: solo POS/PART NO
const PDF_FEATURE_PN_ROW_DEBUG_ENABLED = false;   // Extra debug (disabled)
```

### UI Buttons

```html
<button id="detectHeadersBtn" title="Detectar Headers (Ctrl+H)">
    Detectar Headers
</button>

<button id="paintBodyByHeadersBtn" title="Pintar cuerpo por columnas detectadas">
    Pintar Cuerpo
</button>

<button id="recalculateTableBtn" title="Recalcular detecciÃ³n completa">
    Recalcular Tabla
</button>

<button id="showTableStatsBtn" title="Mostrar estadÃ­sticas de detecciÃ³n">
    EstadÃ­sticas
</button>

<button id="clearDebugOverlayBtn" title="Limpiar overlays">
    âœ•
</button>
```

### Event Handlers

```javascript
$('#detectHeadersBtn').click(() => {
    runPdfHeaderOnlyDetection();
    renderHeaderDetectionPanel();
});

$('#paintBodyByHeadersBtn').click(() => {
    buildHeaderColumnBodyHighlights();
    renderBodyColumnHighlightPanel();
});

$('#showTableStatsBtn').click(() => {
    renderHeaderDetectionPanel();
    renderBodyColumnHighlightPanel();
    $('#headerDetectionPanel').style.display = 'block';
    $('#bodyColumnHighlightPanel').style.display = 'block';
});

$('#clearDebugOverlayBtn').click(() => {
    clearPdfHeaderOnlyOverlay();
    clearPdfHeaderColumnBodyHighlights();
    $('#headerDetectionPanel').style.display = 'none';
    $('#bodyColumnHighlightPanel').style.display = 'none';
});
```

## Performance Considerations

### Rendering Optimization

```javascript
// Only render first N tokens (performance)
const MAX_OVERLAY_TOKENS = 200;

rows.forEach((row) => {
    row.grid.forEach((rect) => {
        if (tokenCount++ >= MAX_OVERLAY_TOKENS) {
            console.warn(`Omitting ${totalTokens - tokenCount} tokens from overlay (perf)`);
            return;
        }
        // draw rect
    });
});
```

### Canvas vs SVG

- **Canvas**: Mejor para muchos rects pequeÃ±os (bitmap, rÃ¡pido)
- **SVG**: Mejor para lÃ­neas, labels, interactivity (vectorial)

**Current approach**: SVG overlay encima de canvas para manejo hÃ­brido.

## Debugging Commands

Disponibles en console cuando `PDF_HEADER_DEBUG_ENABLED = true`:

```javascript
// Get debug logs
window.getHeaderDetectionDebug()

// Clear debug logs
window.clearHeaderDetectionDebug()

// Inspect state
console.log(state.currentPdfHeaderOnlyDebug)
console.log(state.currentPdfHeaderColumnBodyDebug)
```

## CSS Styling

En `styles/pdf_shared.css`:

```css
.pdf-overlay-svg {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;  /* Allow canvas clicks to pass through */
    z-index: 10;
}

.pdf-selection-layer {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: auto;  /* Interactive */
    z-index: 20;
}

.header-detection-panel {
    position: fixed;
    right: 10px;
    top: 100px;
    width: 400px;
    max-height: 500px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 12px;
    overflow-y: auto;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    z-index: 100;
}

.header-detection-panel table {
    width: 100%;
    font-size: 11px;
    border-collapse: collapse;
}

.header-detection-panel table td {
    padding: 4px;
    border: 1px solid #eee;
}

.header-detection-panel .close-btn {
    float: right;
    cursor: pointer;
    font-weight: bold;
}
```

---

**VÃ©ase tambiÃ©n:**
- [08_runtime_flow.md](08_runtime_flow.md) - CÃ³mo se invocan las visualizaciones
- [09_known_issues.md](09_known_issues.md) - Visualization issues

**Ãšltima actualizaciÃ³n**: Mayo 17, 2026

