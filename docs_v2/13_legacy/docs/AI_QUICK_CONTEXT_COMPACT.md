# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# MILU AI Context Compact

## System In 10 Lines
- Local QA web app for MTU engine parts data.
- Frontend: `qa_milu.html` + ES modules in `js/`.
- Backend: `server.js` (Express).
- Persistence is file-based JSON, no relational database.
- Main runtime source of truth: 9 `engine_*.json` files.
- Key backend writes: `/save-json` (single field), `/apply-revision-to-engines` (bulk), `POST /qa_revision_sync.php` (revision sync).
- Health endpoint: `/health`.
- Main frontend orchestration: `js/qa-milu.js`.
- Shared mutable state: `js/state.js`.

## Read Order (Minimum)
1. `server.js`
2. `js/state.js`
3. `js/data-loader.js`
4. `js/revision.js`
5. `js/qa-table.js`

## Critical Endpoints
- `GET /health`
- `POST /save-json`
- `GET|POST /qa_revision_sync.php`
- `POST /apply-revision-to-engines`
- `POST /recompute-pdf-auto`
- `GET /pn-review/list`
- `GET /pn-review/:sku`
- `GET /pn-review/:sku/sources`
- `POST /pn-review/:sku/apply-decision` â€” action: `validar`|`revisar`|`descartar`; aplica en todos los engine JSON

## Core Runtime Flows
### Load
- `qa-milu.js` -> `loadPartitionedEngineData()` -> merge 9 engine files -> assign revision keys -> render table.

### Row Revision Save
- UI change -> `setRowRevision()` -> `saveCellToServer()` -> `POST /save-json` -> engine JSON write by `ID`.

### PN Review Global Decision
- `pn_review.html` o tab PN Review en `analista_02.html` -> `GET /pn-review/:sku` + sources -> botÃ³n Validar/Revisar/Descartar -> confirm `<dialog>` -> `POST /pn-review/:sku/apply-decision` -> escribe en TODOS los engine JSON -> toast inmediato.

## Data Keys That Matter Most
- Identity: `ID`, `PART NO.`, `POS`, `Source Page`, `engine_model`, `source_file`
- Revision: `qa_revision_estado`, `qa_revision_accion`, `qa_revision_updated_at`
- Normalized/final: `designation_final`, `measure_final`, `weight_final`
- Substitution: `sust_hierarchie`, `sust_new_part_number`, `sust_superseded_list`

## Debug Order For Persistence Problems
1. `GET /health`
2. `POST /save-json`
4. verify disk write in JSON files
5. only then inspect UI rendering

## PN Review Embedded (Analista 02)
- Panel derecho de `analista_02.html` tiene tabs **PDF** | **PN Review**
- MÃ³dulo: `js/pn-review-embedded.js` (exports: `init`, `onRecordChange`, `refresh`, `detectPnSourceConflicts`)
- Estilos: `styles/pn-review-embedded.css` (prefijo `pre-`)
- Conflict detection por familias: `pn`, `designation`, `measure`, `weight`, `sust`
- Celdas conflicto: color Ãºnicamente (`pre-cell--conflict` rojo, `pre-cell--warning` amarillo)

## Usually Ignore First Pass
- `dist/`, `zz_old/`, `zz_copias/`, `json_originales/`
- heavy asset folders unless issue is asset-path related

## Offline Utilities (Not Runtime)
- `depuracion_json.py`: recompute canonical final fields
- `marcar_articulos_en_web.py`: set `EN_WEB` from product export
- *(legacy) `generate_synthetic_exports.js`*: archived in `legacy/export_complex_ai/scripts/`

## WordPress Export (official)
- `npm run export:wordpress` â†’ `scripts/export_wordpress_milu.js`
- Output: `data/output/wordpress/`
- Decision QA-only: `ok/importar` â†’ import, todos `ok/eliminar` â†’ discard, resto â†’ pending_review

## Fast Start
- `npm install`
- `node server.js`
- open `http://localhost:3000/qa_milu.html`

