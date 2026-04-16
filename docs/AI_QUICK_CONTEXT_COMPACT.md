# MILU AI Context Compact

## System In 10 Lines
- Local QA web app for MTU engine parts data.
- Frontend: `qa_milu.html` + ES modules in `js/`.
- Backend: `server.js` (Express).
- Persistence is file-based JSON, no relational database.
- Main runtime source of truth: 8 `engine_*.json` files.
- Revision sync store: `qa_revision_server_data.json`.
- Key backend writes: `/save-json` (single field), `/apply-revision-to-engines` (batch).
- Health endpoint: `/health`.
- Main frontend orchestration: `js/qa-milu.js`.
- Shared mutable state: `js/state.js`.

## Read Order (Minimum)
1. `server.js`
2. `js/state.js`
3. `js/data-loader.js`
4. `js/revision.js`
5. `apply_revision_to_engines.js`
6. `js/qa-table.js`

## Critical Endpoints
- `GET /health`
- `GET /qa_revision_sync.php`
- `POST /qa_revision_sync.php`
- `POST /save-json`
- `POST /apply-revision-to-engines`

Important: keep `/qa_revision_sync.php` route declared before static middleware.

## Core Runtime Flows
### Load
- `qa-milu.js` -> `loadPartitionedEngineData()` -> merge 8 engine files -> assign revision keys -> render table.

### Row Revision Save
- UI change -> `setRowRevision()` -> `saveCellToServer()` -> `POST /save-json` -> engine JSON write by `ID`.

### Batch Revision Apply
- Import payload -> `POST /apply-revision-to-engines` -> iterate all engine files -> apply by key alias match.

## Data Keys That Matter Most
- Identity: `ID`, `PART NO.`, `POS`, `Source Page`, `engine_model`, `source_file`
- Revision: `qa_revision_estado`, `qa_revision_accion`, `qa_revision_updated_at`
- Normalized/final: `designation_final`, `measurement_final`, `weight_final`
- Substitution: `sust_hierarchie`, `sust_new_part_number`, `sust_superseded_list`

## Revision Key Alias Model
- stable: `idx=N`
- legacy: `ID||PN||Page||POS||source`
- disambiguation: `legacy||occ=n`

## Debug Order For Persistence Problems
1. `GET /health`
2. `GET/POST /qa_revision_sync.php`
3. `/save-json` or `/apply-revision-to-engines`
4. verify disk write in JSON files
5. only then inspect UI rendering

## Usually Ignore First Pass
- `dist/`, `zz_old/`, `zz_copias/`, `json_originales/`
- heavy asset folders unless issue is asset-path related

## Offline Utilities (Not Runtime)
- `add_final_fields.py`: recompute canonical final fields
- `generate_synthetic_exports.js`: build synthetic New/Superseded datasets
- `marcar_articulos_en_web.py`: set `EN_WEB` from product export

## Fast Start
- `npm install`
- `node server.js`
- open `http://localhost:3000/qa_milu.html`
