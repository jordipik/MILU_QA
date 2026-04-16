# Critical Context For AI Agents

## Goal
Minimize startup reading for an AI assistant while preserving enough context to safely modify or debug runtime behavior.

## Read-First Files (ordered)
1. `server.js`
2. `js/state.js`
3. `js/data-loader.js`
4. `js/revision.js`
5. `apply_revision_to_engines.js`
6. `js/qa-table.js`
7. `js/qa-milu.js`
8. `js/helpers.js`

Optional early reads when task is specialized:
- PDF issues: `js/pdf-viewer.js`
- schema/pos image issues: `js/schemas.js`, `js/pos-preload.js`
- column layout issues: `js/column-view.js`

## Minimum Runtime Mental Model
- Single-page frontend with shared mutable `state` object.
- Backend is local Express, no DB.
- Main source-of-truth data is the 8 `engine_*.json` files.
- Revision data can exist in both row fields and centralized sync payload file.

## Safe Debug Priority
1. backend health: `GET /health`
2. sync endpoint behavior: `GET/POST /qa_revision_sync.php`
3. persistence endpoint behavior: `/save-json` or `/apply-revision-to-engines`
4. payload from frontend
5. actual disk write in JSON files
6. only then UI rendering logic

## What To Ignore By Default
Ignore unless task explicitly asks for them:
- `dist/`
- `json_originales/`
- `zz_old/`
- `zz_copias/`
- `fotos_articulos/`
- `fotos_motores/`
- `esquemas/`
- `esquemas_pos_circulos/`

## Important Conventions
- frontend uses ES modules; backend uses CommonJS.
- avoid full table re-renders for selection-only changes.
- revision key aliases matter (`idx`, legacy key, occurrence key).
- route `/qa_revision_sync.php` must be explicitly handled before static middleware.

## Common Failure Patterns
- Backend not running but UI still loaded from static files.
- Save endpoint hit with wrong engine file name inferred from row.
- Imported revision payload mismatch due to key alias expectations.
- Row update visually stale due to not refreshing selected row state.

## Recommended Validation After Changes
- open `http://localhost:3000/qa_milu.html`
- verify backend badge transitions to connected
- perform one revision change and confirm write in target `engine_*.json`
- run import/apply scenario if revision logic changed
