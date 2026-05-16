# Table Region Detection - Spatial Area Identification

## Objetivo

Identificar automáticamente dónde comienza la tabla de datos en el PDF, excluyendo:
- Título/cabecera (business header, page number, date)
- Metadata (invoice numbers, page markings)
- Footer (notas legales, disclaimers)
- "Business Portal Online Print" watermarks

El resultado es un bounding box `[tableTopY, tableBottomY]` que contiene solo la tabla de datos válida.

## Estrategia: Density Anchors

```javascript
export function detectTableArea(rects, lines, pageInfo = {}) {
    // 1. Calcula "spread" (cobertura horizontal) de cada línea
    // 2. Calcula "itemCount" (número de tokens en línea)
    // 3. Busca primer línea que cumple: spread ≥ 0.33 && itemCount ≥ 4
    // 4. Esta es la línea "anchor" (típicamente la línea de headers)
    // 5. tableTopY = anchor.y1 - 8px (pequeño margin)
    // 6. tableBottomY = última línea densa + 22px
}
```

### Scoring Logic

Para cada línea candidata:

```javascript
const spread = line.width / viewportWidth;
const itemCount = line.rects.length;
const score = (spread * 2.3) + Math.min(2.2, itemCount * 0.2);
```

**Interpretación**:
- `spread * 2.3` favorece líneas anchas (coverage horizontal)
- `itemCount * 0.2` favorece líneas con muchos tokens (densidad vertical)

**Umbrales**:
- `spread ≥ 0.33` → línea ocupa al menos 33% del ancho → probable header/tabla
- `itemCount ≥ 4` → al menos 4 palabras → no línea vacía o de footer

### Fallback Strategy

Si NO se encuentra línea con scoring suficiente:

```javascript
if (!bestCandidate) {
    return {
        tableTopY: viewportHeight * 0.20,  // Assume table starts at 20%
        tableBottomY: viewportHeight,
        reason: 'fallback-top-20pct',
        confidence: 'low'
    };
}
```

## Boundary Refinement

### Top Boundary

```javascript
const anchorLine = bestCandidate.line;
const tableTopY = Math.max(0, Number(anchorLine.y1) - geomPx(8, geomScale));
```

- Usa `anchorLine.y1` (top-most rect en línea) como referencia
- Resta 8 px (pequefío margen) para incluir cualquier línea de separación
- Escala adaptativa (`geomPx`) para diferentes zooms

### Bottom Boundary

```javascript
let tableBottomY = viewportHeight;  // Default: hasta el final

// Busca última línea "densa" (itemCount ≥ 4 && spread ≥ 0.33)
linesFromTop.forEach((line) => {
    const span = line.width / viewportWidth;
    const itemCount = line.rects.length;
    if (itemCount >= 4 && span >= 0.33) {
        lastDense = line;
    }
});

if (lastDense) {
    tableBottomY = Math.min(
        viewportHeight, 
        Number(lastDense.y2) + geomPx(22, geomScale)
    );
}
```

**Lógica**:
- Busca ÚLTIMA línea que parezca tabla (densa + ancha)
- Añade 22 px de margen inferior (spacing natural entre tabla y footer)
- Nunca supera height de página

## Edge Cases & Known Issues

### Business Portal Online Print Exclusion

**Problema**: Algunos PDFs GESA tienen watermark "Business Portal Online Print" que interfiere con header detection.

**Solución actual**: No implementada en `detectTableArea()` directamente. Se maneja en etapas posteriores (header anchor detection):

```javascript
// En detectHeaderAnchors(), filtramos líneas sospechosas
// TODO: Implementar detección explícita de Business Portal Online
```

**Workaround**: Usuarios pueden pre-procesar PDFs para remover watermarks antes de carga.

### Empty/Sparse Pages

**Problema**: PDF con muy pocos tokens (tabla corrupta, página en blanco).

```javascript
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
```

**Behavior**:
- Asume tabla ocupa toda página
- Confidence = 'low' (señal para UI: requiere validación manual)

### Multipage Tables

**Problema**: Tabla distribuida en múltiples páginas (no soportado actualmente).

**Current behavior**: MILU procesa cada página independientemente:
- Página 1: detecta table area, extrae headers, agrupa rows
- Página 2: igual (headers duplicados, rows separados)
- No hay fusión automática entre páginas

**Implicación**: Usuarios deben revisar/combinar manualmente múltiples páginas o exportar cada página como BOM separada.

## Confidence Scoring

```javascript
const confidence = bestCandidate.score >= 2.5 ? 'high' : 'medium';
```

**Score interpretation**:
- `score ≥ 2.5` → primer candidate fue muy convincente (ancho + denso)
- `score < 2.5` → candidate marginal, requiere validación

**Uso downstream**:
```javascript
if (tableAreaResult.confidence === 'low') {
    showWarning("Detección de área tabular débil, revisar manualmente");
}
```

## Ignored Rects

Rects que caen fuera del área tabular se marcan para exclusión:

```javascript
const ignoredHeaderRects = rects.filter(
    (rect) => Number(rect.centerY || 0) < tableTopY
);
```

Estos se usan en etapas posteriores para:
- No contar como "header evidence" en `detectHeaderAnchors()`
- Evitar incluir metadata en búsqueda de columnas
- Debugging (mostrar rects ignorados en overlay)

## Practical Output

### Example 1: Regular Page

```javascript
Input: 2 páginas, página 1 con tabla clara

detectTableArea(rects, lines, {
    viewportHeight: 792,
    viewportWidth: 612
})

Output:
{
    tableTopY: 95,           // Line with "POS PART NO..." at y1=103, minus 8px
    tableBottomY: 720,       // Last dense line at y2=698, plus 22px
    reason: 'density-anchor',
    confidence: 'high',      // score was 3.2
    headerLine: null,        // Solo used en análisis posterior
    ignoredHeaderRects: [    // Rects above tableTopY
        { text: "MOTOR CATALOG PAGE 1", centerY: 40 },
        { text: "Rev 2.0", centerY: 60 }
    ]
}
```

### Example 2: Sparse Page

```javascript
Input: Página con poco contenido

Output:
{
    tableTopY: 0,
    tableBottomY: 792,
    reason: 'fallback-top-20pct',
    confidence: 'low',
    headerLine: null,
    ignoredHeaderRects: []
}
```

## Parameters & Tuning

Valores hardcoded en `detectTableArea()`:

| Parámetro | Valor | Descripción |
| --- | --- | --- |
| `spread threshold` | 0.33 | Mínimo cobertura horizontal (33%) |
| `itemCount threshold` | 4 | Mínimo tokens en línea |
| `spread weight` | 2.3 | Multiplicador para spread en scoring |
| `itemCount weight` | 0.2 | Multiplicador para itemCount |
| `topMargin` | 8 px | Margen superior desde anchor |
| `bottomMargin` | 22 px | Margen inferior desde última línea densa |
| `fallback top` | 20% | Si no hay anchor, asumir tabla comienza a 20% height |
| `score threshold` | 2.5 | Umbral confidence high/medium |

**Tuning**: Para cambiar sensibilidad, editar valores en `pdf-table-parser.js` línea ~450.

## Integration Points

```javascript
// 1. Call from main parser
const tableArea = detectTableArea(rects, lines, pageInfo);

// 2. Usado en detectHeaderAnchors()
const candidateLines = tableLines.filter(
    (line) => Number(line.cy || 0) <= (Number(tableArea.tableTopY) + 90)
);

// 3. Usado en body rect filtering
const bodyRects = rects.filter(
    (rect) => Number(rect.centerY) >= Number(tableArea.tableTopY)
              && Number(rect.centerY) <= Number(tableArea.tableBottomY)
);

// 4. Debug visualization
drawRect(canvas, {
    x: 0,
    y: tableArea.tableTopY,
    width: viewportWidth,
    height: tableArea.tableBottomY - tableArea.tableTopY,
    color: 'rgba(0, 255, 0, 0.1)',
    label: `Table Area (${tableArea.confidence})`
});
```

## Future Improvements

1. **Business Portal detection**: Regex pattern matching en text para detectar y excluir watermarks
2. **Multi-page fusion**: Detectar tabla continuada en página siguiente, fusionar automáticamente
3. **Relative positioning**: Usar ratios en lugar de pixels para mejor portabilidad entre scales
4. **Metadata extraction**: Extraer y guardar info de header (catalog date, page number) antes de marcar como ignorado

---

**Véase también:**
- [00_overview.md](00_overview.md) - Pipeline completo
- [01_geometry_model.md](01_geometry_model.md) - Geometría base
- [03_header_detection.md](03_header_detection.md) - Headers dentro de área tabular

**Última actualización**: Mayo 17, 2026
