# Detección de Headers PDF (BOM Table)

Commit de cierre: `e25a31ae` — "Deteccion de headers OK"  
Fecha: Mayo 16, 2026  
Archivos principales: `js/pdf-viewer.js`, `js/analista-02.js`, `js/state.js`

---

## Objetivo

Detectar y marcar visualmente los headers de la tabla BOM en un PDF cargado en `analista_02.html`, sin afectar el backend, la persistencia ni el parser principal de columnas.

---

## Feature flags (`js/analista-02.js`)

```js
const PDF_FEATURE_HEADERS_ENABLED = true;               // botón "Detectar Headers" activo
const PDF_FEATURE_BLUE_TEXT_PANEL_ENABLED = false;       // panel azul desactivado (lento)
const PDF_FEATURE_PN_ROW_DEBUG_ENABLED = false;          // debug fila PN desactivado
const PDF_FEATURE_BACKGROUND_TOKEN_SCAN_ENABLED = false; // scan async desactivado
```

- `applyPdfFeatureFlagsToUi()`: desactiva visualmente los botones cuya feature está `false`.
- `syncPdfWithCurrentRow()`: si el PDF ya está cargado en la misma página, llama `refreshPdfSelectionOverlayFromCache()` en lugar de recargar el PDF completo.

---

## Optimizaciones de rendimiento (`js/pdf-viewer.js`)

- `PDF_MINIMAL_GREEN_HIGHLIGHTS_MODE = true` — solo highlights PN/POS; omite cálculos pesados (designación, qty, weight, etc.).
- `refreshPdfSelectionOverlayFromCache()` (exportada): reconstruye el overlay desde caché sin volver a llamar `page.getTextContent()`.

### Caché de texto por página (`js/state.js`)

```js
currentPdfLastTextItems: [],
currentPdfLastViewport: null,
currentPdfLastTextSource: '',
currentPdfLastTextPageNumber: 0,
```

---

## Flujo de detección: `runPdfHeaderOnlyDetection()`

```
extractPdfTextRects → buildLineGroups → detectHeaderLineGroups
       ↓
bestByKey (mejor score por key)
       ↓
refineCombinedHeaderBounds(match, key)
       ↓
highlights + entries → state.currentPdfHeaderOnlyOverlay
```

### `refineCombinedHeaderBounds(match, key)`

Obtiene el bounding box definitivo para cada header. Aplica dos mecanismos:

#### 1. Split de pares fusionados por OCR (`HEADER_SPLIT_PAIRS`)

El OCR a veces combina dos headers adyacentes en un único bloque de texto (p.ej. `"POS PART NO."`). Los pares configurados:

| Key izquierdo | Key derecho   |
|---------------|---------------|
| `pos`         | `part_no`     |
| `designation` | `model_type`  |
| `fn`          | `measurement` |
| `units`       | `weight`      |

**Lógica:** se localizan los tokens de ambos en el texto normalizado. El borde derecho del header izquierdo se fija en el **final exacto del token izquierdo**; el borde izquierdo del header derecho en el **inicio exacto del token derecho**. Así ninguna caja incluye el espacio entre ambos tokens.

#### 2. `trimHeaderBoundsWhitespace(bounds)`

Ajusta `left/width` proporcionalmente eliminando espacios en blanco al inicio/fin del texto del bounds. Se aplica siempre como último paso de `refineCombinedHeaderBounds`.

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
