# MILU Project Overview

## Purpose
MILU is a local web application for QA review of MTU engine parts catalogs. The UI lets users browse, filter, validate, and revise article records coming from 8 engine JSON datasets.

Main goals:
- review article quality and normalization
- compare fields against MILU export references
- classify revision status and action
- persist edits directly to JSON files (no relational database)

## System Scope
Runtime system:
- frontend: `qa_milu.html` + ES modules in `js/`
- backend: `server.js` (Express, local HTTP API)
- persistence: `engine_*.json` + `qa_revision_server_data.json`

Offline support system:
- Python/Node scripts in repo root for conversion, normalization, synthetic export generation, and reporting

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
- `GET/POST /qa_revision_sync.php`
- `POST /save-json`
- `POST /apply-revision-to-engines`

Important routing rule:
- `/qa_revision_sync.php` must be declared before static middleware so Express returns JSON and not the source PHP file.

### Persistence Model
- no SQL database
- `engine_*.json` are the source of truth for row-level runtime data
- `qa_revision_server_data.json` stores centralized revision payload snapshots
- `/save-json` updates one field by row ID in one engine file
- `/apply-revision-to-engines` applies revision payloads across all engine files

## Technologies
- Node.js + Express (CommonJS backend)
- Browser ES modules (frontend)
- PDF.js (viewer), pako (gzip JSON support)
- Python scripts (pandas + json + glob) for offline utilities

## Main Data Domains
- engine row records: part identity, designation, dimensions, substitution flags, image refs, QA fields
- revision payloads: status/action keyed by stable index and legacy aliases
- export references: `MILU_New_v506.json`, `MILU_Superseded_v506.json`, product export JSON

## High-Level Data Flows
1. Load flow:
- frontend loads 8 `engine_*.json` files in parallel
- merges rows into `state.allData`
- assigns stable revision keys

2. Review/edit flow:
- user filters/sorts/selects rows
- user updates revision status/action
- frontend persists to backend (`/save-json`) and updates in-memory state

3. Batch revision flow:
- import revision JSON
- frontend sends payload to `/apply-revision-to-engines`
- backend updates all engine files where matches exist

4. Export/support flow:
- synthetic export scripts produce `qa_synthetic_new.json` and `qa_synthetic_superseded.json`
- statistics/report scripts generate diagnostics for consistency checks

## Runtime Entry Points
- local URL: `http://localhost:3000/qa_milu.html`
- backend launch: `node server.js`
- shortcut launch: `Ejecutar localhost.bat`

## Assumptions
- app runs primarily in local trusted network context
- large JSON datasets are edited directly in git workspace
- no external auth/identity layer is implemented in backend endpoints
