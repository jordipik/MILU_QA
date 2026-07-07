# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Geometry Model - PDF Token Extraction & Coordinate System

## Overview

El modelo geomÃ©trico define cÃ³mo se extraen elementos del PDF, se normalizan coordenadas, se aplican transformaciones de escala y se calculan relaciones espaciales. La precisiÃ³n de este modelo es crÃ­tica para todas las etapas downstream (header detection, column detection, row grouping).

## PDF.js Text Item Structure

PDF.js extrae contenido mediante `page.getTextContent()`. Cada item tiene propiedades no normalizadas:

```javascript
{
  str: "PART NO.",           // Raw text from PDF
  dir: "ltr",                // Text direction
  width: 28.336,            // Width in PDF units (1/72")
  height: 12,               // Height in PDF units
  transform: [12, 0, 0, 12, 100, 200],  // [scaleX, 0, 0, scaleY, translateX, translateY]
  fontName: "F2",           // Font identifier
  hasEOL: false             // End of line marker
}
```

### Transform Array

La transform matrix define posicionamiento 2D:

```
[scaleX, 0, 0, scaleY, translateX, translateY]
```

CÃ¡lculo de coordenadas finales:
```
x = translateX + (scaleX * originalX)
y = translateY + (scaleY * originalY)
```

## Token Rect Structure (Normalized)

DespuÃ©s de `extractTextRects()`, cada token se representa como:

```javascript
{
  // Original text
  text: "PART NO.",
  normalizedText: "PART NO",  // uppercase, trimmed, special chars removed
  
  // Geometry (in viewport pixels)
  left: 125,                   // Left edge X coordinate
  top: 456,                    // Top edge Y coordinate (NOTA: PDF uses bottom-up, viewer uses top-down)
  width: 54,                   // Width in pixels
  height: 14,                  // Height in pixels
  
  // Derived calculations
  centerX: 152,               // left + (width / 2)
  centerY: 449,               // top - (height / 2) â†’ normalized to top-down
  visualTop: 442              // top - height â†’ for line grouping
}
```

### Coordinate System

**MILU usa un sistema top-down normalizado** (como la mayorÃ­a de navegadores web):

- **Y=0** en la parte superior de la pÃ¡gina
- **Y crece hacia abajo**
- ConversiÃ³n desde PDF (bottom-up):
  ```javascript
  visualTop = top - height
  centerY = top - (height / 2)
  ```

## Viewport & Scaling

Cada pÃ¡gina PDF tiene un viewport que define escala y transformaciÃ³n:

```javascript
const viewport = page.getViewport({ scale: 1.5 });

// Propiedades viewport
{
  width: 612,                 // Viewport width en CSS pixels
  height: 792,                // Viewport height
  scale: 1.5,                 // Scale factor (1.0 = 72 DPI)
  transform: [1.5, 0, 0, 1.5, 0, 0]
}
```

### Geometry Scale Factor (`geomScale`)

Muchas tolerancias en MILU se multiplican por `geomScale = scale / 1.5`:

```javascript
function geomPx(value, scale = 1) {
    return Number(value || 0) * Math.max(0.5, Number(scale || 1));
}

// Ejemplo:
const tolerance = 6;  // px base
const adjusted = geomPx(tolerance, geomScale);  // escala adaptativa
```

**Rationale**: A zoom 100%, tolerancias estÃ¡n calibradas. A zoom 200%, los tolerancias deben crecer proporcionalmente.

## Clustering & Grouping

### Line Grouping (Vertical Baseline Clustering)

Agrupa rects que estÃ¡n horizontalmente alineados (mismo baseline Y):

```javascript
function groupIntoLines(rects, tolerance = 6) {
    // 1. Sort by Y coordinate (centerY)
    // 2. DinÃ¡mico tolerance = max(6px, height * 0.55)
    //    â†’ Tokens mÃ¡s grandes permiten desalineaciÃ³n mayor
    // 3. Asign cada rect a line mÃ¡s cercana (â‰¤ dynamicTol)
    // 4. Calcula cy promedio de la lÃ­nea
    // 5. Ordena rects dentro de lÃ­nea por X (left edge)
    
    // Output: lines[] con {cy, x1, x2, y1, y2, width, rects[], text}
}
```

**Ejemplo de entrada/salida:**

```
Input rects:
  [Rect1: y=100, text="POS"]
  [Rect2: y=103, text="PART"]
  [Rect3: y=104, text="NO."]
  [Rect4: y=200, text="1"]
  [Rect5: y=203, text="ABC123"]

Output lines (tolerance=6):
  Line1 (cy=102): [Rect1, Rect2, Rect3] â†’ "POS PART NO."
  Line2 (cy=201): [Rect4, Rect5] â†’ "1 ABC123"
```

### Cluster Building (Horizontal Gap Clustering)

Agrupa rects que estÃ¡n horizontalmente cercanos (gap < threshold):

```javascript
function buildClusters(rects, maxGap = 28) {
    // 1. Sort by X (left)
    // 2. Agrupa rects si gap â‰¤ maxGap
    //    gap = rect[i].left - rect[i-1].right
    // 3. Calcula bounds de cluster: left, right, top, bottom, centerX
    // 4. Normaliza texto: une parts con espacio
    
    // Output: clusters[] con {left, right, width, centerX, text}
}
```

**Uso**: Fusionar palabras que el OCR pudo haber separado:

```
Input:  ["PART", "NO", "."]  (gaps < 28px)
Output: Cluster{text: "PART NO .", left: 100, right: 145}
```

## Geometric Primitives

### Rectangle Bounds

DefiniciÃ³n estÃ¡ndar:

```javascript
{
  x1: Number,     // Left edge
  x2: Number,     // Right edge (exclusive)
  y1: Number,     // Top edge
  y2: Number,     // Bottom edge (exclusive)
  left: Number,   // Alias for x1
  top: Number,    // Alias for y1
  width: Number,  // x2 - x1
  height: Number  // y2 - y1
}

// Helpers
function toRight(rect) {
    return Number(rect.left || 0) + Math.max(0, Number(rect.width || 0));
}

function toBottom(rect) {
    return Number(rect.top || 0);  // Already top-down normalized
}
```

### Center & Edges

```javascript
// Center point
centerX = x1 + (width / 2)
centerY = y1 + (height / 2)

// Edges (relative to centerX)
leftDistance = centerX - x1
rightDistance = x2 - centerX

// For columns
column.x1 = left edge of column
column.x2 = right edge of column
columnWidth = x2 - x1
```

## Statistical Functions

### Median

```javascript
function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 
        ? sorted[mid] 
        : (sorted[mid - 1] + sorted[mid]) / 2;
}
```

**Uso**: Encontrar posiciÃ³n "tÃ­pica" robustamente contra outliers.

### Percentile

```javascript
function percentile(values, p = 0.5) {
    // p âˆˆ [0, 1]
    // Linear interpolation between sorted values
    // percentile(values, 0.25) â†’ Q1
    // percentile(values, 0.50) â†’ Median
    // percentile(values, 0.75) â†’ Q3
}
```

**Uso**: 
- `percentile(..., 0.78)` para left-edge detection (78% de rects terminan aquÃ­)
- `percentile(..., 0.22)` para right-edge detection (22% de rects comienzan aquÃ­)

## Boundary & Gap Detection

### Histogram-based Gap Finding

```javascript
function detectHistogramGaps(bodyRects, leftX, rightX, geomScale = 1) {
    // 1. Divide rango [leftX, rightX] en buckets (bin = 3px)
    // 2. Count centerX de cada rect en cada bucket
    // 3. Smooth with moving average [0.4, 1.0, 0.4]
    // 4. Find valleys: current â‰¤ threshold && left > threshold && right > threshold
    // 5. Return valley positions (aproximadas del center del bucket)
    
    // Output: gapX[] positions where density drops
}
```

**Ejemplo**:

```
Rects distribuidos:
[=========]  gap [====] gap [======================]
        50          100       150

Histograma (suavizado):
bucket 50:  5 items
bucket 75:  0 items (gap)
bucket 100: 3 items
bucket 125: 0 items (gap)
bucket 150: 10 items

Output gaps: [75, 125]
```

## Tolerance Calibration

Tolerancias tÃ­picas en MILU (en viewport pixels):

| Factor | Valor Base | Escalado | Uso |
| --- | --- | --- | --- |
| Line grouping | 6 px | dyn=max(6, h*0.55) | Vertical baseline clustering |
| Cluster gap | 28 px | geomScale | Horizontal word fusion |
| Header window | 90 px | geomScale | BÃºsqueda de headers desde table top |
| Snap window | 8-20 px | geomScale | Boundary snapping a separadores |
| Natural gap min | 5 px | geomScale | MÃ­nimo gap para considerar brecha |
| Boundary crossing | 0.6 px | geomScale | Umbral para detectar token que cruza lÃ­mite |

## Normalization Pipeline

### Text Normalization

```javascript
function normalizeHeaderToken(text) {
    return String(text || '')
        .toUpperCase()
        .normalize('NFD')                    // Unicode normalization
        .replace(/[\u0300-\u036f]/g, '')    // Remove diacritics
        .replace(/[.]/g, ' ')               // Period â†’ space
        .replace(/[\-_]/g, ' ')             // Dash/underscore â†’ space
        .replace(/[^A-Z0-9/\s]/g, ' ')      // Remove special chars
        .replace(/\s+/g, ' ')               // Collapse multiple spaces
        .trim();
}

// Examples:
normalizeHeaderToken("PART NO.") â†’ "PART NO"
normalizeHeaderToken("part-no")  â†’ "PART NO"
normalizeHeaderToken("PART\nNO") â†’ "PART NO"
```

### Semantic Token Classification

```javascript
function isPartNoLikeToken(text) {
    // Length >= 6, has digit AND (letter OR length >= 8)
    // Examples: "ABC123", "123456", "A1B2C3D4"
    // NOT: "12", "ABC", "A1"
}

function isUnitToken(text) {
    // PC, PCS, SET, KG, G (hardcoded whitelist)
}

function isWeightLikeToken(text) {
    // Matches: "50 KG", "50,5", "25", etc.
    // Pattern: digits + optional comma/period + optional unit
}

function isModelTypeLikeToken(text) {
    // 2-22 chars, has letter XOR digit
    // NOT short integers (1-3 digits) or units or weights
}
```

## Precision & Rounding

### Geometric Precision

PDF.js proporciona coordenadas con decimales. MILU redondea donde apropriado:

```javascript
// Comparaciones: usar tolerancia, NO igualdad exacta
if (Math.abs(x1 - x2) <= tolerance) { /* cercanos */ }

// Histogramas: redondear a bins
const bin = Math.max(1, geomPx(2, geomScale));
const binIndex = Math.floor((x - leftX) / bin);

// Medians/percentiles: mantener precisiÃ³n
const median = (val1 + val2) / 2;  // NOT rounded
```

## Practical Examples

### Example 1: Token to Rect

```javascript
// PDF.js raw item
const item = {
    str: "Qty",
    width: 15,
    height: 10,
    transform: [12, 0, 0, 12, 250, 400]
};

const viewport = { scale: 1.5, transform: [1.5, 0, 0, 1.5, 0, 0] };

// Transformation
const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
const left = tx[4];                    // 250 * 1.5 = 375
const top = tx[5];                     // 400 * 1.5 = 600

// Scaled dimensions
const width = item.width * viewport.scale;   // 15 * 1.5 = 22.5
const height = Math.max(8, item.height * viewport.scale);  // 12

// Result rect
const rect = {
    text: "Qty",
    left: 375,
    top: 600,
    width: 22.5,
    height: 12,
    centerX: 375 + 11.25 = 386.25,
    centerY: 600 - 6 = 594,
    visualTop: 600 - 12 = 588
};
```

### Example 2: Line Grouping

```javascript
const rects = [
    { text: "POS", centerY: 100, left: 50 },
    { text: "PART", centerY: 101, left: 100 },
    { text: "NO", centerY: 102, left: 130 },
    { text: "1", centerY: 200, left: 50 }
];

groupIntoLines(rects, 6)
// â†’ Line1: {cy: 101, rects: [POS, PART, NO], text: "POS PART NO"}
// â†’ Line2: {cy: 200, rects: [1], text: "1"}
```

---

**VÃ©ase tambiÃ©n:**
- [02_table_region_detection.md](02_table_region_detection.md) - Uso de geometry para detectar Ã¡rea tabular
- [04_column_detection.md](04_column_detection.md) - Boundary detection con histogramas

**Ãšltima actualizaciÃ³n**: Mayo 17, 2026

