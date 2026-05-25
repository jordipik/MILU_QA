# MILU Project Overview

## Purpose
MILU is a local web application for QA review of MTU engine parts catalogs. The UI lets users browse, filter, validate, and revise article records coming from 9 engine JSON datasets.

Main goals:
- review article quality and normalization
- compare fields against MILU export references
- classify revision status and action
- persist edits directly to JSON files (no relational database)

## System Scope
Runtime system:
- frontend: `qa_milu.html` + ES modules in `js/`
- backend: `server.js` (Express, local HTTP API)
- persistence: `engine_*.json`

Offline support system:
- Python/Node scripts in repo root for conversion, normalization, and reporting

## Architecture
### Frontend
- Single page app with modular ES imports
- Shared mutable state in `js/state.js`
- Main orchestrator in `js/qa-milu.js`
- Table rendering and filters in `js/qa-table.js`
- Revision logic in `js/revision.js`
- Data loading/backend checks in `js/data-loader.js`
- PDF and schema image support in dedicated modules

### Backend
`server.js` exposes:
- `GET /health`
- `POST /save-json`
- `GET|POST /qa_revision_sync.php` (Express-served, returns JSON)
- `POST /apply-revision-to-engines`
- `POST /recompute-pdf-auto`
- `GET /pn-review/list`
- `GET /pn-review/:sku` (detalle de PN con qa_summary y engine_models_all)
- `GET /pn-review/:sku/sources` (todas las apariciones en todos los engine JSON)
- `POST /pn-review/:sku/apply-decision` (acciÃ³n global: `validar`|`revisar`|`descartar`)

### Persistence Model
- no SQL database
- `engine_*.json` are the source of truth for row-level runtime data
- `/save-json` updates one field by row ID in one engine file

## Technologies
- Node.js + Express (CommonJS backend)
- Browser ES modules (frontend)
- PDF.js (viewer), pako (gzip JSON support)
- Python scripts (pandas + json + glob) for offline utilities

## Main Data Domains
- engine row records: part identity, designation, dimensions, substitution flags, image refs, QA fields
- export references (legacy): `MILU_New_v506.json`, `MILU_Superseded_v506.json`, product export JSON

## Main Views
- `qa_milu.html`: QA principal (tabla + detalle + PDF)
- `analista_02.html`: Analista avanzado con panel derecho de dos pestaÃ±as: **PDF** y **PN Review** (tab PN Review muestra `js/pn-review-embedded.js`)
- `pn_review.html`: vista autÃ³noma de PN Review con bÃºtones Validar/Revisar/Descartar, confirm `<dialog>` nativo y toasts CSS

## High-Level Data Flows
1. Load flow:
- frontend loads 9 `engine_*.json` files in parallel
- merges rows into `state.allData`
- assigns stable revision keys

2. Review/edit flow:
- user filters/sorts/selects rows
- user updates revision status/action
- frontend persists to backend (`/save-json`) and updates in-memory state

3. Export/support flow:
- WordPress export: `npm run export:wordpress` reads all 9 `engine_*.json`, applies QA-only decision rules, outputs to `data/05-wordpress/`
- statistics/report scripts generate diagnostics for consistency checks

## Runtime Entry Points
- local URL: `http://localhost:3000/qa_milu.html`
- backend launch: `node server.js`
- shortcut launch: `Ejecutar localhost.bat`

## Assumptions
- app runs primarily in local trusted network context
- large JSON datasets are edited directly in git workspace
- no external auth/identity layer is implemented in backend endpoints

