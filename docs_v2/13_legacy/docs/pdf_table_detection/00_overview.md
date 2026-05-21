# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# PDF Table Detection System - Overview

## Objetivo del Sistema

MILU utiliza un parser hÃ­brido geomÃ©trico + semÃ¡ntico para extraer e interpretar tablas de PDFs tÃ©cnicos navales tipo **BOM (Bill Of Materials)**. El objetivo final es transformar contenido PDF no estructurado en registros de datos compatibles con:

- Sistema QA interno (validaciÃ³n de campos)
- Export WordPress
- Base de datos JSON persistente (`engine_*.json`)

## Problema que Resuelve

Los PDFs de proveedores (tÃ­picamente en formato catalogrÃ¡fico GESA, FG, FGS) contienen tablas complejas con:

- **Layouts heterogÃ©neos**: mÃ¡rgenes variables, encabezados multiline, espacios irregulares
- **OCR imperfecto**: fusiÃ³n de palabras adyacentes, artefactos visuales, caracteres corruptos
- **SemÃ¡ntica implÃ­cita**: diferenciaciÃ³n entre "PART NO", "DESIGNATION", "FN" requiere reglas de negocio
- **Variabilidad en estructura**: nÃºmero de columnas, presencia de campos opcionales como ARROW, MODEL/TYPE

El parser debe:

1. Detectar automÃ¡ticamente el Ã¡rea tabular (excluyendo metadata, tÃ­tulos, footers)
2. Identificar columnas mediante seÃ±ales geomÃ©tricas + semÃ¡nticas
3. Asignar tokens al header correcto
4. Agrupar en filas coherentes
5. Generar registros BOM listos para persistencia

## Tipos de PDFs Soportados

### Compatibilidad primaria

- **GESA 2026**: CatÃ¡logos tÃ©cnicos navales, tablas regulares de 10-11 columnas
- **FG/FGS**: Formato similar con variantes menores
- **Layouts regulares**: Headers claros, alineaciÃ³n consistente

### Edge cases conocidos

- Headers fusionados por OCR (`PART NO` + `DESIGNATION` en un bloque)
- Columnas comprimidas (`QTY` atrapado en `WEIGHT`)
- Medidas en mÃºltiples formatos (`A 55 X 5`, `55x5`, etc.)
- Text azul (especial, detectado pero con cuidado)
- Business Portal Online Print (excluido automÃ¡ticamente)

## Arquitectura Global

### Stack de TecnologÃ­as

| Componente | TecnologÃ­a | Rol |
| --- | --- | --- |
| **PDF.js** | v3.11.174 (CDN) | ExtracciÃ³n de tokens, geometrÃ­a, viewport |
| **Parser backend** | JavaScript ES6 | LÃ³gica de clustering, detecciÃ³n, asignaciÃ³n |
| **UI/Overlay** | Canvas + SVG | VisualizaciÃ³n debug, overlays geomÃ©tricos |
| **Frontend** | HTML5 + CSS3 | Interfaz, paneles de control, almacenamiento estado |

### Componentes Principales

```
js/pdf-table-parser.js (1800+ lÃ­neas)
â”‚
â”œâ”€ extractTextRects()          â†’ Token geometry extraction
â”œâ”€ groupIntoLines()             â†’ Vertical baseline clustering  
â”œâ”€ detectTableArea()            â†’ Spatial area detection (excludes header/footer)
â”œâ”€ detectHeaderAnchors()        â†’ Semantic header matching
â”œâ”€ detectVerticalSeparators()   â†’ Column boundary detection (gaps + gridlines)
â”œâ”€ buildTemplateColumns()       â†’ Ratio-based column templates
â”œâ”€ refineVerticalBoundaries()   â†’ Iterative boundary optimization
â”œâ”€ assignRectsToColumns()       â†’ Token-to-column mapping
â”œâ”€ groupIntoRows()              â†’ Row construction + multiline handling
â”œâ”€ buildDebugOverlay()          â†’ Visual debug rendering
â””â”€ parseTable()                 â†’ Main export function
   
js/pdf-viewer.js (1000+ lÃ­neas)
â”‚
â”œâ”€ loadPdfWithPage()            â†’ PDF loading & rendering
â”œâ”€ runPdfHeaderOnlyDetection()  â†’ Semantic header detection (experimental)
â”œâ”€ buildHeaderColumnBodyHighlights() â†’ Paint columns by header
â”œâ”€ renderPdfPage()              â†’ Canvas rendering with overlays
â””â”€ [Zoom, selection, caching utilities]

js/analista-02.js (8500+ lÃ­neas)
â”‚
â”œâ”€ Feature flags & control      â†’ Parser tuning toggles
â”œâ”€ Event handlers               â†’ User interactions
â”œâ”€ Panel rendering              â†’ Debug info visualization
â””â”€ Revision sync integration
```

## Pipeline Completo (Runtime)

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 1. PDF LOADING                                                  â”‚
â”‚    analista_02.html â†’ loadPdfWithPage(book, page)              â”‚
â”‚    â€¢ Descarga PDF via PDF.js                                    â”‚
â”‚    â€¢ Extrae page.getTextContent()                               â”‚
â”‚    â€¢ Normaliza viewport y escala geomÃ©trica                     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                       â†“
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 2. TOKEN EXTRACTION & GEOMETRY                                  â”‚
â”‚    extractTextRects(textItems, viewport)                       â”‚
â”‚    â€¢ Convierte items PDF â†’ rect objects                         â”‚
â”‚    â€¢ Calcula: left, top, width, height, centerX, centerY       â”‚
â”‚    â€¢ Aplica escala de viewport                                  â”‚
â”‚    Output: rects[] con geometrÃ­a normalizada                    â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                       â†“
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 3. NORMALIZATION & CLUSTERING                                   â”‚
â”‚    groupIntoLines(rects, tolerance=6px)                        â”‚
â”‚    â€¢ Agrupa rects por baseline vertical (centerY Â±tolerance)    â”‚
â”‚    â€¢ Ordena por Y (top), luego X (left) dentro de lÃ­nea         â”‚
â”‚    Output: lines[] de rects horizontalmente alineados           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                       â†“
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 4. TABLE AREA DETECTION                                         â”‚
â”‚    detectTableArea(rects, lines, pageInfo)                     â”‚
â”‚    â€¢ Histograma densidad por lÃ­nea                              â”‚
â”‚    â€¢ Busca primer lÃ­nea densa/ancha (spread >= 0.33)            â”‚
â”‚    â€¢ Excluye header/metadata (top 20%)                          â”‚
â”‚    Output: {tableTopY, tableBottomY, confidence}                â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                       â†“
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 5. HEADER DETECTION                                             â”‚
â”‚    detectHeaderAnchors(tableLines, tableTopY)                  â”‚
â”‚    â€¢ Busca tokens en header window (â‰ˆ90px desde tableTopY)      â”‚
â”‚    â€¢ Agrupa clusters por gap horizontal                         â”‚
â”‚    â€¢ Normaliza + detects key (POS, PART NO, DESIGNATION...)    â”‚
â”‚    Output: anchors[] con {key, x1, x2, confidence}             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                       â†“
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 6. COLUMN BOUNDARY DETECTION (Hybrid Strategy)                  â”‚
â”‚    a) Template-based initialization                            â”‚
â”‚       buildTemplateColumns(leftX, rightX, includeArrow)        â”‚
â”‚       â€¢ Ratios fijos 11 columnas (POS 4.5%, PART NO 13%...)    â”‚
â”‚                                                                 â”‚
â”‚    b) Merge header anchors into template                       â”‚
â”‚       mergeAnchorsIntoTemplate(templateCols, anchors)          â”‚
â”‚       â€¢ Centra columnas segÃºn header detectados                â”‚
â”‚                                                                 â”‚
â”‚    c) Detect vertical separators (3 estrategias):             â”‚
â”‚       - Gridlines: bordes repetidos en body rects              â”‚
â”‚       - Text gaps: espacios entre tokens en rows               â”‚
â”‚       - Natural gaps: histograma de densidad X                 â”‚
â”‚       Output: separators[] con {x, confidence, source}         â”‚
â”‚                                                                 â”‚
â”‚    d) Snap boundaries to separators                            â”‚
â”‚       snapBoundariesToSeparators(columns, separators)         â”‚
â”‚       â€¢ Busca separator cercano a cada boundary                â”‚
â”‚       â€¢ Respeta minimum widths por columna                     â”‚
â”‚       Output: snapped columns[]                                â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                       â†“
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 7. COLUMN REFINEMENT (Iterative Optimization)                   â”‚
â”‚    refineVerticalBoundaries(columns, bodyRows, separators)    â”‚
â”‚    â€¢ Pase 1: Body evidence + natural gaps + overlap minimize   â”‚
â”‚    â€¢ Pase 2: Refinamiento de lÃ­mites especÃ­ficos               â”‚
â”‚       - refinePosPartBoundary(): separa POS de PART NO        â”‚
â”‚       - refineModelQtyBoundary(): QTY no atrapado             â”‚
â”‚       - refineUnitsWeightBoundary(): UNITS â‰  WEIGHT           â”‚
â”‚    â€¢ Validaciones de width min/max por columna                 â”‚
â”‚    Output: refined columns[] con boundaries optimizadas       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                       â†“
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 8. ROW DETECTION & GROUPING                                     â”‚
â”‚    groupIntoRows(bodyRects, columns, tolerance)               â”‚
â”‚    â€¢ Agrupa rects por baseline Y (tolerance Â±12px)             â”‚
â”‚    â€¢ Asigna cada rect a columna por left-edge                  â”‚
â”‚    â€¢ Maneja multiline rows (mÃºltiples baselines)               â”‚
â”‚    Output: rows[] con {rects[], grid columns mapping}          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                       â†“
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 9. SEMANTIC CLASSIFICATION                                      â”‚
â”‚    Validaciones y overrides semÃ¡nticos:                         â”‚
â”‚    â€¢ FN whitelist: AB, EM siempre vÃ¡lidos aunque en otra col    â”‚
â”‚    â€¢ Part number rules: isPartNoLikeToken()                     â”‚
â”‚    â€¢ NormalizaciÃ³n header text                                  â”‚
â”‚    Output: rows[] con clasificaciÃ³n semÃ¡ntica aplicada         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                       â†“
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ 10. OUTPUT & VISUALIZATION                                      â”‚
â”‚    â€¢ ConstrucciÃ³n de estructura BOM final                       â”‚
â”‚    â€¢ Rendering de overlays debug (rectÃ¡ngulos, lÃ­neas)         â”‚
â”‚    â€¢ ExportaciÃ³n a state.currentPdfTableData                    â”‚
â”‚    â€¢ IntegraciÃ³n con UI comparativo (HTML table)                â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## Key Features

### Performance Optimizations

- **Token caching**: `state.currentPdfLastTextItems` evita re-parsing de text content
- **Minimal green highlights mode**: Solo POS/PART NO sin cÃ¡lculos pesados (default ON)
- **Lazy detection**: Header detection solo en demand (flag `PDF_FEATURE_HEADERS_ENABLED`)
- **Viewport scaling**: Tolerancias y widths ajustadas por `geomScale`

### Debug & Visualization

- **Overlay system**: Canvas + SVG para rectÃ¡ngulos, lÃ­neas, etiquetas
- **Color coding**: Cada columna con color Ãºnico para identificaciÃ³n rÃ¡pida
- **Panel statistics**: Muestra headers detectados, column assignments, warnings
- **Debug logging**: Sistema de logs en memoria (JSON serializable)

### Quality Assurance

- **Confidence scoring**: Cada detection tiene score 0-1 (low/medium/high)
- **Warning system**: Registra anomalÃ­as (merged columns, compressed widths, overlaps)
- **Boundary crossing metrics**: Detecta cuando tokens cruzan lÃ­mites de columnas
- **Validation rules**: Enforced minimum/maximum widths per column type

## Archivos Principales

| Archivo | LÃ­neas | Rol |
| --- | --- | --- |
| `js/pdf-table-parser.js` | ~1800 | Core parser logic, column detection, row grouping |
| `js/pdf-viewer.js` | ~1000 | PDF.js integration, rendering, caching |
| `js/analista-02.js` | ~8500 | UI handlers, panels, feature flags |
| `js/state.js` | Variable | Global state, caching, persistence |
| `styles/pdf_shared.css` | Variable | Debug overlay styling |

## Next Steps

- **[01_geometry_model.md](01_geometry_model.md)**: Modelo geomÃ©trico PDF y estructura de tokens
- **[02_table_region_detection.md](02_table_region_detection.md)**: DetecciÃ³n del Ã¡rea tabular
- **[03_header_detection.md](03_header_detection.md)**: Headers canÃ³nicos y normalizaciÃ³n
- **[04_column_detection.md](04_column_detection.md)**: Estrategias hÃ­bridas de detecciÃ³n de columnas
- **[05_row_detection.md](05_row_detection.md)**: AgrupaciÃ³n vertical y construcciÃ³n de filas
- **[06_semantic_classification.md](06_semantic_classification.md)**: Validaciones semÃ¡nticas y overrides
- **[07_debug_visualization.md](07_debug_visualization.md)**: Sistema de overlays y paneles debug
- **[08_runtime_flow.md](08_runtime_flow.md)**: Flujo runtime completo, mÃ³dulos y integraciones
- **[09_known_issues.md](09_known_issues.md)**: Problemas conocidos y workarounds actuales
- **[10_validation_dataset.md](10_validation_dataset.md)**: Estrategia de validaciÃ³n y test cases
- **[11_future_work.md](11_future_work.md)**: Mejoras futuras y roadmap

---

**Ãšltima actualizaciÃ³n**: Mayo 17, 2026  
**Estado**: ProducciÃ³n (feature flags controlados)  
**Responsable**: MILU Parser Engineering

