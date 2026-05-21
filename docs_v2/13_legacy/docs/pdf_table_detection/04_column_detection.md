# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Column Detection - Hybrid Geometric + Semantic Strategy

## Overview

Detectar automÃ¡ticamente dÃ³nde estÃ¡ el **lÃ­mite vertical de cada columna** usando:
1. **Template-based initialization**: Ratios fijos de GESA standard (11 columnas)
2. **Header anchor merging**: Anclar columnas a headers detectados
3. **Vertical separator detection**: Encontrar gaps reales en data
4. **Iterative refinement**: 2 passes de optimizaciÃ³n con validaciones

**Output**: `columns[]` con `[x1, x2]` boundaries para cada columna.

## Critical Issues to Avoid

### Issue 1: PART NO + DESIGNATION Merged

**Manifestation**: 
- PART NO y DESIGNATION se detectan como 1 columna ancha
- Todos los part numbers se asignan incorrectamente

**Root cause**: 
- OCR a veces fusiona text adyacente sin gap claro
- Column boundary snapping no puede separar si no hay vertical separator

**Current solution** (`refinePosPartBoundary()`):

```javascript
function refinePosPartBoundary(columns, bodyRects, separators, ...) {
    // 1. Buscar tokens que parecen "POS" (short integers: 1-3 dÃ­gitos)
    // 2. Buscar tokens que parecen "PART NO" (alphanumeric, length >= 6)
    // 3. Calcular median posiciÃ³n final de POSs
    // 4. Calcular median posiciÃ³n inicio de PARTNOs
    // 5. Si hay gap real (partMed > posMed + 2px), mover boundary a la mitad
    // 6. Validar que ambas columnas cumplen min-width
}
```

**Warning raised**: `POS_PARTNO_MERGED` si PARTNO column < 85% del ancho de DESIGNATION.

### Issue 2: FN Trapped in WEIGHT

**Manifestation**:
- FN column estÃ¡ casi vacÃ­o
- WEIGHT column es anormalmente ancho
- FN tokens (2-3 dÃ­gitos) estÃ¡n clasificados como WEIGHT

**Root cause**:
- Ambos son numÃ©ricos
- FN es muy estrecho (14-30 px) vs WEIGHT (35-70 px)
- Boundary snapping puede mover boundary a posiciÃ³n subÃ³ptima

**Current solution** (`refineUnitsWeightBoundary()`):

```javascript
function refineUnitsWeightBoundary(columns, bodyRects, separators, ...) {
    // 1. Buscar tokens que parecen "UNITS" (PC, SET, KG, G)
    // 2. Buscar tokens que parecen "WEIGHT" (digits + optional unit/comma)
    // 3. Calcular median de centros de UNITS
    // 4. Calcular median de inicios de WEIGHT
    // 5. Si gap real, mover boundary
    // 6. Validar width constraints
}
```

**Warning**: `UNITS_WEIGHT_MERGED` si width UNITS >= width WEIGHT.

### Issue 3: QTY Compressed by MODEL

**Manifestation**:
- QTY column < 24 px (too narrow)
- MODEL/TYPE column > 130 px (too wide)
- QTY tokens (integers) se pierden

**Solution** (`refineModelQtyBoundary()`):

```javascript
// Similar a refinePosPartBoundary pero con percentile-based detection
// 78th percentile de model ends vs 22nd percentile de qty starts
// Aplicar guard: si QTY < min, move boundary agresivamente
```

## Column Width Constraints

```javascript
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
```

**Enforcement**:

1. **Initial generation** from template
2. **Snapping** to separators (respeta limits)
3. **Iterative refinement** - mueve boundaries para cumplir constraints
4. **Final validation** - warnings si constraints violados

## Strategy 1: Template-Based Initialization

```javascript
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

function buildTemplateColumns(leftX, rightX, includeArrow) {
    const width = Math.max(1, rightX - leftX);
    return source.map((item) => ({
        key: item.key,
        x1: leftX + (width * item.start),
        x2: leftX + (width * item.end),
        source: 'template',
        confidence: 'low'  // Ratios son aproximados
    }));
}
```

**Ratios explanation**:
- PART NO: 9% â†’ 22% = ~13% ancho (standard GESA)
- DESIGNATION: 22% â†’ 41% = ~19% ancho (longest field typically)
- QTY/UNITS/FN: narrow columns ~5% cada uno
- MEASUREMENT: 14% (reserved para datos grandes)

## Strategy 2: Header Anchor Merging

Headers detectados (ej: "PART NO" en x=125) se usan para centrar columnas:

```javascript
function mergeAnchorsIntoTemplate(templateCols, anchors) {
    const byKey = new Map(anchors.map(a => [a.key, a]));
    
    return templateCols.map((col) => {
        const anchor = byKey.get(col.key);
        if (!anchor) return col;  // Keep template

        // Usa anchor X position, pero mantiene width del template
        const center = Number(anchor.centerX);
        const width = Math.max(6, col.x2 - col.x1);
        
        return {
            ...col,
            x1: center - (width / 2),
            x2: center + (width / 2),
            source: 'header',
            confidence: anchor.confidence  // 'high' or 'medium'
        };
    });
}
```

**Result**: Columnas inicialmente "floating" al posicionar anclas detectadas.

## Strategy 3: Vertical Separator Detection

Detectar **dÃ³nde realmente terminan/comienzan columnas** en body rects.

### Sub-strategy 3a: Gridlines (Repeated Edges)

```javascript
// En detectVerticalSeparators()

const edgeBins = new Map();
rects.forEach((rect) => {
    const edges = [Number(rect.left), Number(toRight(rect))];
    edges.forEach((edgeX) => {
        if (edgeX <= leftX || edgeX >= rightX) return;
        const edgeBin = Math.round(edgeX / Math.max(1, geomPx(2, geomScale))) * geomPx(2);
        edgeBins.set(edgeBin, (edgeBins.get(edgeBin) || 0) + 1);
    });
});

// Si muchos rects comparten edge X, es probable que sea boundary
edgeBins.forEach((count, binX) => {
    if (count >= Math.max(6, rows.length * 0.30)) {
        candidates.push({
            x: binX,
            score: Math.min(0.92, 0.20 + (count / Math.max(10, rows.length * 2))),
            source: 'gridline'
        });
    }
});
```

**Intuition**: Si 30% de rows tienen tokens que terminan en X=145, hay prob una columna boundary.

### Sub-strategy 3b: Text Gaps (Token Spacing)

```javascript
// En detectVerticalSeparators()

rows.forEach((row) => {
    const rowRects = [...row.rects].sort((a, b) => a.left - b.left);
    
    for (let i = 0; i < rowRects.length - 1; i++) {
        const r1 = rowRects[i];
        const r2 = rowRects[i + 1];
        const gap = r2.left - toRight(r1);
        
        if (gap >= geomPx(4)) {  // Gap significativo
            const x = toRight(r1) + (gap / 2);  // Midpoint
            candidates.push({
                x,
                score: Math.min(0.95, 0.25 + (gap / 22)),
                source: 'text-gap'
            });
        }
    }
});
```

**Intuition**: Espacios entre tokens indican columna boundary.

### Sub-strategy 3c: Natural Gaps (Histogram-based)

```javascript
// En detectNaturalGapsFromBodyRows()

// Histogram: contar frecuencia de gaps en cada row
rows.forEach((row) => {
    const gaps = [];  // Gaps encontrados en esta row
    // ... calcular gaps ...
    
    for (let i = 0; i < rowRects.length - 1; i++) {
        const gap = rowRects[i+1].left - toRight(rowRects[i]);
        if (gap >= geomPx(5)) {
            const x = toRight(rowRects[i]) + (gap / 2);
            const bin = Math.round(x / binSize) * binSize;
            
            bucket = bins.get(bin) || { xs: [], gaps: [], rowHits: 0 };
            if (!seenInRow.has(bin)) {
                bucket.rowHits += 1;  // Count rows where this gap appears
            }
            bins.set(bin, bucket);
        }
    }
});

// Gaps que aparecen en â‰¥22% de rows son "persistent"
const minHits = Math.max(4, Math.round(rows.length * 0.22));
```

**Intuition**: Si el 22% de rows tienen un gap en posiciÃ³n X, ese es probablemente una columna boundary.

## Strategy 4: Boundary Snapping & Refinement

```javascript
function snapBoundariesToSeparators(columns, verticalSeparators, ...) {
    // Para cada columna boundary (i.e., entre col[i] y col[i+1]):
    // 1. Buscar separator dentro de window de 8-20px
    // 2. Snap a ese separator si cumple constraints (min-widths)
    // 3. Recordar el "move" para debugging
}
```

### Iterative Refinement (2 passes)

```javascript
function refineVerticalBoundaries(columns, bodyRows, separators, naturalGaps, ...) {
    let refined = columns;
    
    // Pass 1 & 2
    for (let pass = 0; pass < 2; pass++) {
        refined = refineColumnsWithBodyEvidence(refined, bodyRows, ...);
        refined = refineBoundariesToNaturalGaps(refined, naturalGaps, ...);
        refined = refinePosPartBoundary(refined, bodyRects, separators, ...);
        refined = refineModelQtyBoundary(refined, bodyRects, separators, ...);
        refined = refineUnitsWeightBoundary(refined, bodyRects, separators, ...);
        
        const overlapResult = minimizeTokenOverlaps(refined, bodyRows, ...);
        refined = overlapResult.columns;
        
        refined = applyFlexibleWidthConstraints(refined, ...);
    }
    
    return { columns: refined, overlap };
}
```

**Rationale**:
- Pass 1: Ajusta boundaries segÃºn evidencia del body
- Pass 2: Limpia edge cases, minimiza overlaps, aplica constraints finales

## Boundary Crossing Metrics

Detecta cuando tokens violan boundaries (signo de mala alineaciÃ³n):

```javascript
function detectBoundaryOverlapMetrics(columns, bodyRows, geomScale) {
    // Para cada column boundary X:
    for (let i = 0; i < columns.length - 1; i++) {
        const boundaryX = columns[i].x2;
        
        // Contar rects que cruzan boundary
        bodyRows.forEach((row) => {
            row.rects.forEach((rect) => {
                if (rect.left < boundaryX - 0.6 && toRight(rect) > boundaryX + 0.6) {
                    crossings += 1;  // Token cruza esta boundary
                }
            });
        });
    }
    
    // Si many crossings (> 85% of rows), warning TOKEN_OVERLAP
}
```

## Practical Examples

### Example 1: Ideal Case

```
PDF table body:
Row 1:  1    ABC-123    Engine Block    NA    1    PC    12.5kg    --    A 55 X 5    ISO 1234
Row 2:  2    DEF-456    Gasket          NA    2    PC    2.1kg     --    Ã¸25         DIN 5678

detectVerticalSeparators():
- Gridlines: x=50 (1,2 start here), x=95 (ABC,DEF start), x=150 (Engine,Gasket), ...
- Text gaps: gaps found between tokens consistently
- Natural gaps: histogram shows persistent gaps at same X positions

snapBoundariesToSeparators():
Template columns + separators:
  POS:     template x1=50  â†’ snap to gridline 50  â†’ final x1=50
  PART NO: template x1=90  â†’ snap to gridline 95  â†’ final x1=95
  DESIGNATION: template x1=150 â†’ snap to gridline 150 â†’ final x1=150
  ...

Result: columns[] con boundaries exactamente alineados al data
```

### Example 2: Compressed QTY

```
PDF table body:
Row 1:  1    ABC-123    Engine    5    PC    12.5kg    ...
Row 2:  2    DEF-456    Gasket    20   PC    2.1kg     ...

Issue: QTY column demasiado estrecho porque MODEL/TYPE es muy ancho

refineModelQtyBoundary():
- zoneRects between MODEL..QTY = [Engine, 5, Gasket, 20, ...]
- modelEnds (78th percentile) = position donde Engine/Gasket terminan
- qtyStarts (22nd percentile) = posiciÃ³n donde 5/20 comienzan
- if qtyStarts > modelEnds: move boundary to mitad
- Aplicar guard: asegurar QTY â‰¥ 24px

Result: QTY column se expande a width correcto
```

## Special Cases

### Synthetic Column Generation

Si MODEL/TYPE o QTY/UNITS/FN/WEIGHT estÃ¡n missing en detecciÃ³n:

```javascript
function enforceNarrowColumns(columns, geomScale) {
    // Si falta alguna de [QTY, UNITS, WEIGHT, FN] entre MODEL y MEASUREMENT:
    // Generar "synthetic" columns usando template ratios para esa zona
    
    const synthetic = [
        { key: 'qty', start: 0.00, end: 0.30 },
        { key: 'units', start: 0.30, end: 0.56 },
        { key: 'weight', start: 0.56, end: 0.84 },
        { key: 'fn', start: 0.84, end: 1.00 }
    ].map((item) => ({
        key: item.key,
        x1: left + ((right - left) * item.start),
        x2: left + ((right - left) * item.end),
        source: 'template',
        confidence: 'low'
    }));
    
    return [...keep, ...synthetic];
}
```

### MEASUREMENT/STANDARD Split

Si solo 1 columna final en lugar de 2:

```javascript
function ensureMeasurementStandardSplit(columns, geomScale) {
    // Si rightMost column es muy ancho y es MEASUREMENT sin STANDARD:
    // Partir 70/30 entre MEASUREMENT y STANDARD
}
```

## Debugging: Color Coding

Cada columna tiene color para visualizaciÃ³n:

```javascript
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
```

Overlays mostrarÃ¡n rectÃ¡ngulos semitransparentes en estos colores para cada token asignado a columna.

## Integration Points

```
Main parseTable() function:

1. buildTemplateColumns() â†’ initial columns[]
2. mergeAnchorsIntoTemplate() â†’ anchor-aware columns
3. detectVerticalSeparators() â†’ separators[] from 3 strategies
4. snapBoundariesToSeparators() â†’ first snap
5. refineVerticalBoundaries() â†’ 2-pass iterative refinement
6. buildBoundaryList() â†’ final boundaries[] array
7. assignRectsToColumns() â†’ asigna body rects a columnas
```

---

**VÃ©ase tambiÃ©n:**
- [01_geometry_model.md](01_geometry_model.md) - Geometric primitives
- [03_header_detection.md](03_header_detection.md) - Header anchors
- [05_row_detection.md](05_row_detection.md) - Row grouping post-column detection
- [09_known_issues.md](09_known_issues.md) - Problemas documentados

**Ãšltima actualizaciÃ³n**: Mayo 17, 2026

