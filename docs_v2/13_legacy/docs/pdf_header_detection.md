# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# DetecciÃ³n de Headers PDF (BOM Table)

Commit de cierre: `e25a31ae` â€” "Deteccion de headers OK"  
Fecha: Mayo 16, 2026  
Archivos principales: `js/pdf-viewer.js`, `js/analista-02.js`, `js/state.js`

---

## Objetivo

Detectar y marcar visualmente los headers de la tabla BOM en un PDF cargado en `analista_02.html`, sin afectar el backend, la persistencia ni el parser principal de columnas.

---

## Feature flags (`js/analista-02.js`)

```js
const PDF_FEATURE_HEADERS_ENABLED = true;               // botÃ³n "Detectar Headers" activo
const PDF_FEATURE_BLUE_TEXT_PANEL_ENABLED = false;       // panel azul desactivado (lento)
const PDF_FEATURE_PN_ROW_DEBUG_ENABLED = false;          // debug fila PN desactivado
const PDF_FEATURE_BACKGROUND_TOKEN_SCAN_ENABLED = false; // scan async desactivado
```

- `applyPdfFeatureFlagsToUi()`: desactiva visualmente los botones cuya feature estÃ¡ `false`.
- `syncPdfWithCurrentRow()`: si el PDF ya estÃ¡ cargado en la misma pÃ¡gina, llama `refreshPdfSelectionOverlayFromCache()` en lugar de recargar el PDF completo.

---

## Optimizaciones de rendimiento (`js/pdf-viewer.js`)

- `PDF_MINIMAL_GREEN_HIGHLIGHTS_MODE = true` â€” solo highlights PN/POS; omite cÃ¡lculos pesados (designaciÃ³n, qty, weight, etc.).
- `refreshPdfSelectionOverlayFromCache()` (exportada): reconstruye el overlay desde cachÃ© sin volver a llamar `page.getTextContent()`.

### CachÃ© de texto por pÃ¡gina (`js/state.js`)

```js
currentPdfLastTextItems: [],
currentPdfLastViewport: null,
currentPdfLastTextSource: '',
currentPdfLastTextPageNumber: 0,
```

---

## Flujo de detecciÃ³n: `runPdfHeaderOnlyDetection()`

```
extractPdfTextRects â†’ buildLineGroups â†’ detectHeaderLineGroups
       â†“
bestByKey (mejor score por key)
       â†“
refineCombinedHeaderBounds(match, key)
       â†“
highlights + entries â†’ state.currentPdfHeaderOnlyOverlay
```

### `refineCombinedHeaderBounds(match, key)`

Obtiene el bounding box definitivo para cada header. Aplica dos mecanismos:

#### 1. Split de pares fusionados por OCR (`HEADER_SPLIT_PAIRS`)

El OCR a veces combina dos headers adyacentes en un Ãºnico bloque de texto (p.ej. `"POS PART NO."`). Los pares configurados:

| Key izquierdo | Key derecho   |
|---------------|---------------|
| `pos`         | `part_no`     |
| `designation` | `model_type`  |
| `fn`          | `measurement` |
| `units`       | `weight`      |

**LÃ³gica:** se localizan los tokens de ambos en el texto normalizado. El borde derecho del header izquierdo se fija en el **final exacto del token izquierdo**; el borde izquierdo del header derecho en el **inicio exacto del token derecho**. AsÃ­ ninguna caja incluye el espacio entre ambos tokens.

#### 2. `trimHeaderBoundsWhitespace(bounds)`

Ajusta `left/width` proporcionalmente eliminando espacios en blanco al inicio/fin del texto del bounds. Se aplica siempre como Ãºltimo paso de `refineCombinedHeaderBounds`.

---

## Headers detectados

| Key           | Label          |
|---------------|----------------|
| `pos`         | POS            |
| `part_no`     | PART NO.       |
| `designation` | DESIGNATION    |
| `model_type`  | MODEL/TYPE     |
| `qty`         | QTY            |
| `units`       | UNITS          |
| `weight`      | WEIGHT         |
| `fn`          | FN             |
| `measurement` | MEASUREMENT    |
| `standard`    | STANDARD       |

---

## No modificado

- Backend (Express)
- Persistencia (`save-json`, `apply-revision`)
- `engine_*.json`
- Exportadores
- Parser principal de columnas (`pdf-table-parser.js`)

---

## ActualizaciÃ³n 2026-05-20: robustez UNITS/WEIGHT/FN

### Incidencia observada

En algunas paginas (ej. source_page 387) el OCR devuelve headers combinados como `UNITS WEIGHT FN` dentro del mismo bloque.

Efecto colateral en debug:
- headers distintos quedaban con el mismo `x0`
- al construir columnas con `x1 = nextHeader.x0` aparecian columnas de ancho cero (`x0 == x1`)
- la asignacion del cuerpo se desplazaba, especialmente entre `weight` y `fn`

### Causa raiz

1. La deteccion por `contains` permitia matches multiples sobre una misma caja OCR.
2. El refinado de bounds separaba algunos pares, pero no contemplaba explicitamente el par `weight/fn`.
3. La construccion de columnas asumia monotonia estricta de `x0` y no defendia empates.

### Fix aplicado

Archivo: `js/pdf-viewer.js`

1. Se agrego el split de par fusionado `weight` -> `fn` en `HEADER_SPLIT_PAIRS`.
2. En `buildHeaderColumnBodyHighlights()`, la construccion de `rawColumns` se rehizo para:
       - ordenar headers por `x0` y orden canonico de key
       - agrupar headers con `x0` igual (o casi igual)
       - repartir esos grupos en ranuras con ancho minimo
       - garantizar `x1 > x0` en todas las columnas

### Resultado esperado

- No se generan columnas con ancho cero en paneles de debug.
- Mejora la separacion visual y semantica entre `UNITS`, `WEIGHT` y `FN`.
- Se reduce el arrastre de tokens `FN` hacia columnas vecinas.

### VerificaciÃ³n manual recomendada

1. Abrir `analista_02.html` o `qa_milu.html` con un registro de la pagina afectada.
2. Pulsar `Recalcular Tabla`.
3. Abrir `EstadÃ­sticas`.
4. Confirmar en `Headers detectados` y `Cuerpo por Columnas` que:
       - `UNITS`, `WEIGHT` y `FN` tienen rangos `x0/x1` distintos
       - no aparece ninguna columna con `x0 == x1`

### Riesgo y alcance

- Cambio acotado a deteccion/pintado experimental en frontend PDF.
- Sin impacto en backend, persistencia JSON ni endpoints.

