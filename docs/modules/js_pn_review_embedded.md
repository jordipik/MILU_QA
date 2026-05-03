# Module: js/pn-review-embedded.js

## Purpose
Módulo ES embebido que monta una mini-vista de PN Review dentro del panel derecho de `analista_02.html` (tab "PN Review"). Consume los mismos endpoints que `pn_review.html` pero se renderiza inline en el DOM sin navegación de página.

## Inputs
- `container`: `HTMLElement` donde se renderiza el panel (habitualmente `#pnReviewEmbeddedRoot`).
- `row`: objeto de fila de `state.allData` (via `onRecordChange`).
- Datos de la API REST: `GET /pn-review/:sku` y `GET /pn-review/:sku/sources`.

## Outputs
- HTML renderizado en `container`.
- Llama al callback `onDecisionApplied(sku, response)` tras cada acción aplicada con éxito.

## Dependencies
- `fetch` (browser native)
- `styles/pn-review-embedded.css` (prefijo `pre-`)

## Exported API

| Export | Firma | Descripción |
|---|---|---|
| `init` | `(container, { onDecisionApplied })` | Monta el módulo en `container`. Llama una vez al init de la vista. |
| `onRecordChange` | `async (row)` | Notifica cambio de fila seleccionada. Extrae el PN de `pn_final` / `PART NO.` / `pn` y carga datos. |
| `refresh` | `async ()` | Fuerza recarga del PN actual. |
| `detectPnSourceConflicts` | `(sourceRows) → { familiesToShow, cellStatus, summary }` | Analiza conflictos entre apariciones de un PN. Ver sección Conflict Detection. |

## Conflict Detection
`detectPnSourceConflicts(sourceRows)` analiza las familias:

| Familia | Campos |
|---|---|
| `pn` | `pn_final`, `pn_pdf` |
| `designation` | `designation_final`, `designation_gesa`, `designation_pdf` |
| `measure` | `measure_final`, `dimensions_gesa`, `measure_pdf` |
| `weight` | `weight_final`, `weight_gesa`, `weight_pdf` |
| `sust` | `sust_status`, `sust_hierarchie`, `pn_new` |

- `familiesToShow`: lista de familias con conflicto o advertencia (solo se renderizan estas columnas en la tabla de apariciones).
- `cellStatus`: mapa `"rowId:field" → "conflict"|"warning"` para colorear celdas individuales.
- `summary`: mapa `familia → "conflict"|"warning"` para los badges de familia.
- Las celdas NO tienen texto: solo color CSS (`pre-cell--conflict` → rojo, `pre-cell--warning` → amarillo).

## Internal State
```
_container    HTMLElement | null
_currentSku   string | null
_detail       object | null    (respuesta de GET /pn-review/:sku)
_sources      array | null     (respuesta de GET /pn-review/:sku/sources)
_showSources  boolean          (toggle tabla de apariciones)
_onDecisionApplied  function | null
```

## Render States
- `pre-empty-state`: sin registro seleccionado o PN vacío.
- `pre-loading`: carga en curso.
- `pre-error`: error de red o API.
- `pre-panel`: panel principal con datos.

## Action Mapping (POST /pn-review/:sku/apply-decision)
| Acción | estado | accion |
|---|---|---|
| `validar` | `ok` | `importar` |
| `revisar` | `pendiente` | `revisar` |
| `descartar` | `ok` | `eliminar` |

## UX Patterns
- Confirmación: `<dialog>` nativo (`#preConfirmDialog`), no `window.confirm`.
- Notificaciones: toasts CSS (`#preToastContainer`), toast mostrado ANTES de la recarga de datos.
- Botones desactivados durante la petición (`setButtonsLoading(true/false)`).

## Integration in analista_02.html
```js
// En js/analista-02.js
import * as PnReviewEmbedded from './pn-review-embedded.js';

// En initialize():
PnReviewEmbedded.init(document.getElementById('pnReviewEmbeddedRoot'), {
    onDecisionApplied: (_sku, _response) => {
        revalidateCurrentRow().catch(() => {});
        renderReviewStats();
    }
});

// En renderRecord(row):
if (state.rightPanelTab === 'pn-review') {
    PnReviewEmbedded.onRecordChange(row).catch(() => {});
}
```

## CSS File
`styles/pn-review-embedded.css`
- Prefijo: `pre-`
- Incluye también los estilos del tab bar (`.a2-right-tabs`, `.a2-right-tab`) del panel derecho.
- Conflict cells: `.pre-cell--conflict` (fondo rojo suave), `.pre-cell--warning` (fondo amarillo suave).
- Toasts: `.pre-toast-container` (position fixed, bottom-right), animación opacity + translateY.
