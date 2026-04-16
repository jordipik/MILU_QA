# Data Flow Documentation

## 1. Runtime Load Flow

1. Browser opens `qa_milu.html`.
2. `js/qa-milu.js` initializes application.
3. `js/data-loader.js::loadPartitionedEngineData()` fetches the 8 `engine_*.json` files in parallel.
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

## 4. Batch Revision Import and Apply Flow

1. User imports revision JSON from UI.
2. `js/revision.js::handleImportRevisionFile()` parses and normalizes payload.
3. Matching uses key aliases: stable `idx=N`, legacy key, and occurrence key.
4. User triggers backend apply.
5. `js/revision.js::applyImportedRevisionToEngineJson()` posts payload to `/apply-revision-to-engines`.
6. `apply_revision_to_engines.js` iterates all 8 engine files and applies matching status/action updates.

Output:
- mass-applied revision updates with per-file counts.

## 5. Revision Sync Payload Flow

1. Frontend can call `/qa_revision_sync.php` for GET/POST sync payload operations.
2. `server.js` sanitizes incoming `revisions` object.
3. It writes `qa_revision_server_data.json` atomically (`.tmp` then rename).

Output:
- centralized revision payload snapshot for interchange/sync.

## 6. Synthetic Export Flow (Offline)

1. `node generate_synthetic_exports.js` loads all engine rows.
2. Groups by PN and selects representative rows.
3. Computes normalized export rows for New and Superseded contexts.
4. Writes:
- `qa_synthetic_new.json`
- `qa_synthetic_superseded.json`

Output:
- derived export JSONs comparable with MILU reference outputs.

## 7. Final Fields Normalization Flow (Offline)

1. `python add_final_fields.py` iterates all 8 engine JSON files.
2. For each record:
- normalize spaces in `dimensions_gesa` and `MEASUREMENT / STANDARD`
- compute `designation_final`
- compute `measurement_final` with `dimensions_gesa` priority
- fix legacy typo `wheight_final` -> `weight_final`
- recompute `exp_imagenes`
3. Writes files back with pretty JSON formatting.

Output:
- canonicalized final fields used by runtime and exports.

## 8. Health/Debug Flow for Persistence Issues

Recommended sequence:
1. `GET /health`
2. `GET/POST /qa_revision_sync.php`
3. `/save-json` or `/apply-revision-to-engines` depending on user path
4. verify write on disk (`qa_revision_server_data.json` or target `engine_*.json`)
5. only then inspect UI behavior
