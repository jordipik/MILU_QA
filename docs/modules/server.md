# Module: server.js

## Purpose
Express backend for local persistence and revision synchronization.

## Inputs
- HTTP requests from frontend.
- JSON payloads for revision sync and batch apply.
- Existing JSON files on disk.

## Outputs
- JSON HTTP responses.
- Updated `qa_revision_server_data.json`.
- Updated `engine_*.json` files (through `/save-json` and `/apply-revision-to-engines`).

## Dependencies
- `express`, `body-parser`, `cors`
- Node `fs`, `path`
- `applyRevisionPayload` from `apply_revision_to_engines.js`

## Core Logic
- Configure middleware (`cors`, JSON body parser).
- Expose health endpoint.
- Implement explicit `GET/POST /qa_revision_sync.php` before static middleware.
- Sanitize incoming revisions payload (`v`, `r`, `k`) and write atomically.
- Provide single-field save endpoint `/save-json` restricted to known engine files.
- Provide batch apply endpoint `/apply-revision-to-engines`.

## Special Cases / Risks
- Route order is critical: if static middleware handles `/qa_revision_sync.php`, sync breaks.
- `/save-json` depends on row ID and exact file mapping.
- Writes are file-based; no transaction rollback across multiple files.
