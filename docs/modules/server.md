# Module: server.js

## Purpose
Express backend for local persistence and QA checks.

## Inputs
- HTTP requests from frontend.
- Existing JSON files on disk.

## Outputs
- JSON HTTP responses.
- Updated `engine_*.json` files (through `/save-json` and QA checks endpoints).

## Dependencies
- `express`, `body-parser`, `cors`
- Node `fs`, `path`

## Core Logic
- Configure middleware (`cors`, JSON body parser).
- Expose health endpoint.
- Provide single-field save endpoint `/save-json` restricted to known engine files.

## Special Cases / Risks
- `/save-json` depends on row ID and exact file mapping.
- Writes are file-based; no transaction rollback across multiple files.
