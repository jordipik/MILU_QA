# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# AI Quick Context (MILU)

## What This System Does
MILU is a local QA web app for reviewing and correcting MTU engine parts datasets.

- frontend entry: `qa_milu.html`
- backend entry: `server.js`
- runtime data: 9 files `engine_*.json`
- no relational DB; persistence is direct JSON file writes

## Runtime Stack
- frontend: browser ES modules in `js/`
- backend: Express (CommonJS)
- assets: PDF + schema images + article photos
- helpers: PDF.js and pako in browser

## Core Files You Must Read First
1. `server.js`
2. `js/state.js`
3. `js/data-loader.js`
4. `js/revision.js`
5. `js/qa-table.js`
6. `js/qa-milu.js`
7. `js/helpers.js`

## Key Endpoints
- `GET /health`
- `POST /save-json`
- `GET /pn-review/list` â€” lista de PNs con conteo, motores y estado de decisiÃ³n
- `GET /pn-review/:sku` â€” detalle de un PN: export_row, qa_summary, engine_models_all
- `GET /pn-review/:sku/sources` â€” todas las apariciones del PN en todos los engine JSON
- `POST /pn-review/:sku/apply-decision` â€” aplica `{action}` globalmente a todas las filas del PN en todos los motores; action: `validar`â†’ok/importar, `revisar`â†’pendiente/revisar, `descartar`â†’ok/eliminar

## Main Data Structures
### Engine row (in `engine_*.json`)
Important fields:
- identity: `ID`, `PART NO.`, `POS`, `Source Page`, `engine_model`, `source_file`
- QA: `qa_revision_estado`, `qa_revision_accion`, `qa_revision_updated_at`
- normalization: `designation_final`, `measure_final`, `weight_final`
- substitution: `sust_hierarchie`, `sust_new_part_number`, `sust_superseded_list`
- publication/image: `EN_WEB`, `ruta_foto`, `esquemas*`, `exp_imagenes`

### Shared app state (`js/state.js`)
- `allData`, `filteredData`
- `filters`, `sortKey`, `sortAsc`, `currentPage`, `pageSize`
- `selectedRevisionRowKey`, `columnView`, `groupedVisible`
- `miluNewData`, `miluSupersededData`, PN sets/maps
- PDF runtime state and selection overlays

## Core Runtime Flows
### Load flow
1. `qa-milu.js` boots
2. `data-loader.js` fetches all 9 engine JSON files in parallel
3. rows merged into `state.allData`
4. `revision.js` assigns stable and legacy revision keys
5. table renders via `qa-table.js`

### Edit/revision flow
1. user updates revision status/action
2. `revision.js::setRowRevision()` updates row in memory
3. persistence uses `saveCellToServer()` -> `POST /save-json`
4. backend updates target engine JSON row by ID

### PN Review global decision flow
1. user opens `pn_review.html` o la pestaÃ±a PN Review dentro de `analista_02.html`
2. selecciona/carga un PN â†’ `GET /pn-review/:sku` + `GET /pn-review/:sku/sources`
3. pulsa Validar/Revisar/Descartar â†’ confirm `<dialog>` nativo
4. `POST /pn-review/:sku/apply-decision {action}` actualiza `qa_revision_estado`, `qa_revision_accion`, `qa_revision_updated_at` en TODOS los engine JSON para todas las filas con ese PN
5. toast inmediato + recarga de datos; `analista_02.html` llama a `revalidateCurrentRow()`

## Offline Scripts (not runtime)
- `depuracion_json.py`: recompute final fields and normalize measurements
- `marcar_articulos_en_web.py`: set `EN_WEB` from product export
- `estadisticas_articulos.py`, `informe_estadisticas.py`: stats/report
- `convert_excel_to_json.py`, `pretty_print_all_json.py`: utility transforms
- *(legacy) `generate_synthetic_exports.js`*: archived in `legacy/export_complex_ai/scripts/`

## WordPress Export (official)
- Command: `npm run export:wordpress`
- Script: `scripts/export_wordpress_milu.js`
- Output: `data/output/wordpress/`
- Decision: QA-only (`qa_revision_estado=ok` + `qa_revision_accion=importar` â†’ import)

## High-Value Rules
- No database: always verify disk writes in JSON files.
- For persistence issues debug in order:
  1) `/health` 2) `/save-json` 3) frontend payload 4) verificar escritura en `engine_*.json` 5) UI rendering.
- Prefer targeted UI updates over full table re-render when changing selection only.

## PN Review Embedded (Analista 02)
- `analista_02.html` tiene un panel derecho con dos pestaÃ±as: **PDF** (default) y **PN Review**
- La pestaÃ±a PN Review monta el mÃ³dulo `js/pn-review-embedded.js` en `#pnReviewEmbeddedRoot`
- El mÃ³dulo exporta `init(container, {onDecisionApplied})`, `onRecordChange(row)`, `refresh()`, `detectPnSourceConflicts(sourceRows)`
- Al cambiar de registro en Analista, si el tab PN Review estÃ¡ activo, se llama automÃ¡ticamente a `onRecordChange(row)`
- Estilos: `styles/pn-review-embedded.css` (prefijo `pre-`)
- Conflict detection: familias `pn`, `designation`, `measure`, `weight`, `sust`; celdas con color sin texto (`pre-cell--conflict` rojo, `pre-cell--warning` amarillo)

## UX Dialogs y Notificaciones (pn_review.html)
- Confirmaciones usan `<dialog>` nativo (`#confirmDialog`), no `window.confirm`
- Notificaciones usan toasts CSS animados (`#toastContainer`)
- Toast se muestra ANTES del `await loadList()` para feedback inmediato

## Usually Ignore In Normal Tasks
- `dist/`, `json_originales/`, `zz_old/`, `zz_copias/`
- heavy asset folders (`esquemas*`, `fotos_*`, `pdf/`) unless task is asset-path related

## Assumptions
- Local server at `http://localhost:3000`
- Node dependencies installed (`express`, `cors`, `body-parser`)
- runtime edits happen in git-tracked JSON files

## Fast Start Commands
- `npm install`
- `node server.js`
- open `http://localhost:3000/qa_milu.html`

