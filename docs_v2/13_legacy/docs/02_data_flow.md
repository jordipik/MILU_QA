# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Data Flow Documentation

## 1. Runtime Load Flow

1. Browser opens `qa_milu.html`.
2. `js/qa-milu.js` initializes application.
3. `js/data-loader.js::loadPartitionedEngineData()` fetches the 9 `engine_*.json` files in parallel.
4. Each row is normalized with fallback `engine_model` inferred from file name.
5. Combined rows are assigned into `state.allData`.
6. `js/revision.js::assignRevisionKeys()` adds stable and legacy revision keys per row.
7. Aux data loads (`MILU_New_v506.json`, `MILU_Superseded_v506.json`, product-export JSON) to enrich comparisons and flags.

Output:
- fully hydrated in-memory state used by all UI components.

## 2. Interactive QA Flow

1. User updates filters/search/sort controls.
2. `js/qa-table.js::applyFilters()` filters rows by flags, text, revision values, and book/page constraints.
3. `js/qa-table.js::sortData()` applies custom sorting (notably `book_page_pos`).
4. `js/qa-table.js::renderTable()` renders visible rows and applies current column-view mode.
5. Selection changes trigger schema/PDF side updates.

Output:
- synchronized table + right panel context.

## 3. Revision Update Flow (Row-Level)

1. User selects revision estado/accion in a row.
2. `js/revision.js::setRowRevision()` updates row values in memory.
3. It persists both fields with `saveCellToServer()` calls.
4. `js/data-loader.js::saveCellToServer()` posts to `/save-json` using candidate backend URLs.
5. Backend (`server.js`) updates target row by `ID` in specific `engine_*.json` file and writes to disk.

Output:
- row revision fields persisted in engine JSON files.

## 4. Synthetic Export Flow (Offline)

1. `node generate_synthetic_exports.js` loads all engine rows.
2. Groups by PN and selects representative rows.
3. Computes normalized export rows for New and Superseded contexts.
4. Writes:
- `qa_synthetic_new.json`
- `qa_synthetic_superseded.json`

Output:
- derived export JSONs comparable with MILU reference outputs.

## 5. Final Fields Normalization Flow (Offline)

1. `python depuracion_json.py` iterates all 9 engine JSON files.
2. For each record:
- normalize spaces in `dimensions_gesa` and `MEASUREMENT / STANDARD`
- compute `designation_final`
- compute `measure_final` with `dimensions_gesa` priority (legacy `measurement_final` is removed)
- fix legacy typo `wheight_final` -> `weight_final`
- recompute `exp_imagenes`
3. Writes files back with pretty JSON formatting.

Output:
- canonicalized final fields used by runtime and exports.

## 6. Health/Debug Flow for Persistence Issues

Recommended sequence:
1. `GET /health`
2. `POST /save-json` depending on user path
3. verify write on disk in target `engine_*.json`
4. only then inspect UI behavior

## 7. PN Review Global Decision Flow

1. Usuario abre `pn_review.html` o activa la pestaÃ±a **PN Review** en `analista_02.html`.
2. Se cargan en paralelo `GET /pn-review/:sku` (detalle + qa_summary) y `GET /pn-review/:sku/sources` (todas las apariciones).
3. `detectPnSourceConflicts(sourceRows)` analiza conflictos por familias (`pn`, `designation`, `measure`, `weight`, `sust`) y devuelve `{familiesToShow, cellStatus, summary}`.
4. Usuario pulsa Validar/Revisar/Descartar â†’ confirm `<dialog>` nativo (sin `window.confirm`).
5. `POST /pn-review/:sku/apply-decision {action: "validar"|"revisar"|"descartar"}` recorre los 9 engine JSON, actualiza `qa_revision_estado`, `qa_revision_accion`, `qa_revision_updated_at` en todas las filas coincidentes por `pn_final` / `PART NO.` / `pn`.
6. Backend responde `{ok, sku, decision_applied, rows_updated, files_touched, errors}`.
7. Toast CSS animado aparece inmediatamente; luego recarga datos del PN.
8. En `analista_02.html` el callback `onDecisionApplied` llama a `revalidateCurrentRow()` y `renderReviewStats()`.

Output:
- todos los registros del PN en todos los motores quedan con el mismo estado de decisiÃ³n.

Recommended sequence:
1. `GET /health`
2. `POST /save-json` depending on user path
3. verify write on disk in target `engine_*.json`
4. only then inspect UI behavior

