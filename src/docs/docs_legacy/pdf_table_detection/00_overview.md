# PDF Table Detection System - Overview

## Objetivo del Sistema

MILU utiliza un parser híbrido geométrico + semántico para extraer e interpretar tablas de PDFs técnicos navales tipo **BOM (Bill Of Materials)**. El objetivo final es transformar contenido PDF no estructurado en registros de datos compatibles con:

- Sistema QA interno (validación de campos)
- Export WordPress
- Base de datos JSON persistente (`engine_*.json`)

## Problema que Resuelve

Los PDFs de proveedores (típicamente en formato catalográfico GESA, FG, FGS) contienen tablas complejas con:

- **Layouts heterogéneos**: márgenes variables, encabezados multiline, espacios irregulares
- **OCR imperfecto**: fusión de palabras adyacentes, artefactos visuales, caracteres corruptos
- **Semántica implícita**: diferenciación entre "PART NO", "DESIGNATION", "FN" requiere reglas de negocio
- **Variabilidad en estructura**: número de columnas, presencia de campos opcionales como ARROW, MODEL/TYPE

El parser debe:

1. Detectar automáticamente el área tabular (excluyendo metadata, títulos, footers)
2. Identificar columnas mediante señales geométricas + semánticas
3. Asignar tokens al header correcto
4. Agrupar en filas coherentes
5. Generar registros BOM listos para persistencia

## Tipos de PDFs Soportados

### Compatibilidad primaria

- **GESA 2026**: Catálogos técnicos navales, tablas regulares de 10-11 columnas
- **FG/FGS**: Formato similar con variantes menores
- **Layouts regulares**: Headers claros, alineación consistente

### Edge cases conocidos

- Headers fusionados por OCR (`PART NO` + `DESIGNATION` en un bloque)
- Columnas comprimidas (`QTY` atrapado en `WEIGHT`)
- Medidas en múltiples formatos (`A 55 X 5`, `55x5`, etc.)
- Text azul (especial, detectado pero con cuidado)
- Business Portal Online Print (excluido automáticamente)

## Arquitectura Global

### Stack de Tecnologías

| Componente | Tecnología | Rol |
| --- | --- | --- |
| **PDF.js** | v3.11.174 (CDN) | Extracción de tokens, geometría, viewport |
| **Parser backend** | JavaScript ES6 | Lógica de clustering, detección, asignación |
| **UI/Overlay** | Canvas + SVG | Visualización debug, overlays geométricos |
| **Frontend** | HTML5 + CSS3 | Interfaz, paneles de control, almacenamiento estado |

### Componentes Principales

```
js/pdf-table-parser.js (1800+ líneas)
│
├─ extractTextRects()          → Token geometry extraction
├─ groupIntoLines()             → Vertical baseline clustering  
├─ detectTableArea()            → Spatial area detection (excludes header/footer)
├─ detectHeaderAnchors()        → Semantic header matching
├─ detectVerticalSeparators()   → Column boundary detection (gaps + gridlines)
├─ buildTemplateColumns()       → Ratio-based column templates
├─ refineVerticalBoundaries()   → Iterative boundary optimization
├─ assignRectsToColumns()       → Token-to-column mapping
├─ groupIntoRows()              → Row construction + multiline handling
├─ buildDebugOverlay()          → Visual debug rendering
└─ parseTable()                 → Main export function
   
js/pdf-viewer.js (1000+ líneas)
│
├─ loadPdfWithPage()            → PDF loading & rendering
├─ runPdfHeaderOnlyDetection()  → Semantic header detection (experimental)
├─ buildHeaderColumnBodyHighlights() → Paint columns by header
├─ renderPdfPage()              → Canvas rendering with overlays
└─ [Zoom, selection, caching utilities]

js/analista-02.js (8500+ líneas)
│
├─ Feature flags & control      → Parser tuning toggles
├─ Event handlers               → User interactions
├─ Panel rendering              → Debug info visualization
└─ Revision sync integration
```

## Pipeline Completo (Runtime)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. PDF LOADING                                                  │
│    analista_02.html → loadPdfWithPage(book, page)              │
│    • Descarga PDF via PDF.js                                    │
│    • Extrae page.getTextContent()                               │
│    • Normaliza viewport y escala geométrica                     │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. TOKEN EXTRACTION & GEOMETRY                                  │
│    extractTextRects(textItems, viewport)                       │
│    • Convierte items PDF → rect objects                         │
│    • Calcula: left, top, width, height, centerX, centerY       │
│    • Aplica escala de viewport                                  │
│    Output: rects[] con geometría normalizada                    │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. NORMALIZATION & CLUSTERING                                   │
│    groupIntoLines(rects, tolerance=6px)                        │
│    • Agrupa rects por baseline vertical (centerY ±tolerance)    │
│    • Ordena por Y (top), luego X (left) dentro de línea         │
│    Output: lines[] de rects horizontalmente alineados           │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. TABLE AREA DETECTION                                         │
│    detectTableArea(rects, lines, pageInfo)                     │
│    • Histograma densidad por línea                              │
│    • Busca primer línea densa/ancha (spread >= 0.33)            │
│    • Excluye header/metadata (top 20%)                          │
│    Output: {tableTopY, tableBottomY, confidence}                │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. HEADER DETECTION                                             │
│    detectHeaderAnchors(tableLines, tableTopY)                  │
│    • Busca tokens en header window (≈90px desde tableTopY)      │
│    • Agrupa clusters por gap horizontal                         │
│    • Normaliza + detects key (POS, PART NO, DESIGNATION...)    │
│    Output: anchors[] con {key, x1, x2, confidence}             │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. COLUMN BOUNDARY DETECTION (Hybrid Strategy)                  │
│    a) Template-based initialization                            │
│       buildTemplateColumns(leftX, rightX, includeArrow)        │
│       • Ratios fijos 11 columnas (POS 4.5%, PART NO 13%...)    │
│                                                                 │
│    b) Merge header anchors into template                       │
│       mergeAnchorsIntoTemplate(templateCols, anchors)          │
│       • Centra columnas según header detectados                │
│                                                                 │
│    c) Detect vertical separators (3 estrategias):             │
│       - Gridlines: bordes repetidos en body rects              │
│       - Text gaps: espacios entre tokens en rows               │
│       - Natural gaps: histograma de densidad X                 │
│       Output: separators[] con {x, confidence, source}         │
│                                                                 │
│    d) Snap boundaries to separators                            │
│       snapBoundariesToSeparators(columns, separators)         │
│       • Busca separator cercano a cada boundary                │
│       • Respeta minimum widths por columna                     │
│       Output: snapped columns[]                                │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. COLUMN REFINEMENT (Iterative Optimization)                   │
│    refineVerticalBoundaries(columns, bodyRows, separators)    │
│    • Pase 1: Body evidence + natural gaps + overlap minimize   │
│    • Pase 2: Refinamiento de límites específicos               │
│       - refinePosPartBoundary(): separa POS de PART NO        │
│       - refineModelQtyBoundary(): QTY no atrapado             │
│       - refineUnitsWeightBoundary(): UNITS ≠ WEIGHT           │
│    • Validaciones de width min/max por columna                 │
│    Output: refined columns[] con boundaries optimizadas       │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. ROW DETECTION & GROUPING                                     │
│    groupIntoRows(bodyRects, columns, tolerance)               │
│    • Agrupa rects por baseline Y (tolerance ±12px)             │
│    • Asigna cada rect a columna por left-edge                  │
│    • Maneja multiline rows (múltiples baselines)               │
│    Output: rows[] con {rects[], grid columns mapping}          │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. SEMANTIC CLASSIFICATION                                      │
│    Validaciones y overrides semánticos:                         │
│    • FN whitelist: AB, EM siempre válidos aunque en otra col    │
│    • Part number rules: isPartNoLikeToken()                     │
│    • Normalización header text                                  │
│    Output: rows[] con clasificación semántica aplicada         │
└──────────────────────┬──────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. OUTPUT & VISUALIZATION                                      │
│    • Construcción de estructura BOM final                       │
│    • Rendering de overlays debug (rectángulos, líneas)         │
│    • Exportación a state.currentPdfTableData                    │
│    • Integración con UI comparativo (HTML table)                │
└─────────────────────────────────────────────────────────────────┘
```

## Key Features

### Performance Optimizations

- **Token caching**: `state.currentPdfLastTextItems` evita re-parsing de text content
- **Minimal green highlights mode**: Solo POS/PART NO sin cálculos pesados (default ON)
- **Lazy detection**: Header detection solo en demand (flag `PDF_FEATURE_HEADERS_ENABLED`)
- **Viewport scaling**: Tolerancias y widths ajustadas por `geomScale`

### Debug & Visualization

- **Overlay system**: Canvas + SVG para rectángulos, líneas, etiquetas
- **Color coding**: Cada columna con color único para identificación rápida
- **Panel statistics**: Muestra headers detectados, column assignments, warnings
- **Debug logging**: Sistema de logs en memoria (JSON serializable)

### Quality Assurance

- **Confidence scoring**: Cada detection tiene score 0-1 (low/medium/high)
- **Warning system**: Registra anomalías (merged columns, compressed widths, overlaps)
- **Boundary crossing metrics**: Detecta cuando tokens cruzan límites de columnas
- **Validation rules**: Enforced minimum/maximum widths per column type

## Archivos Principales

| Archivo | Líneas | Rol |
| --- | --- | --- |
| `js/pdf-table-parser.js` | ~1800 | Core parser logic, column detection, row grouping |
| `js/pdf-viewer.js` | ~1000 | PDF.js integration, rendering, caching |
| `js/analista-02.js` | ~8500 | UI handlers, panels, feature flags |
| `js/state.js` | Variable | Global state, caching, persistence |
| `styles/pdf_shared.css` | Variable | Debug overlay styling |

## Next Steps

- **[01_geometry_model.md](01_geometry_model.md)**: Modelo geométrico PDF y estructura de tokens
- **[02_table_region_detection.md](02_table_region_detection.md)**: Detección del área tabular
- **[03_header_detection.md](03_header_detection.md)**: Headers canónicos y normalización
- **[04_column_detection.md](04_column_detection.md)**: Estrategias híbridas de detección de columnas
- **[05_row_detection.md](05_row_detection.md)**: Agrupación vertical y construcción de filas
- **[06_semantic_classification.md](06_semantic_classification.md)**: Validaciones semánticas y overrides
- **[07_debug_visualization.md](07_debug_visualization.md)**: Sistema de overlays y paneles debug
- **[08_runtime_flow.md](08_runtime_flow.md)**: Flujo runtime completo, módulos y integraciones
- **[09_known_issues.md](09_known_issues.md)**: Problemas conocidos y workarounds actuales
- **[10_validation_dataset.md](10_validation_dataset.md)**: Estrategia de validación y test cases
- **[11_future_work.md](11_future_work.md)**: Mejoras futuras y roadmap

---

**Última actualización**: Mayo 17, 2026  
**Estado**: Producción (feature flags controlados)  
**Responsable**: MILU Parser Engineering
