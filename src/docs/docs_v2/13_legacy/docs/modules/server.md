# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

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
- Provide bulk revision endpoint `/apply-revision-to-engines`.
- Provide PN Review API (`/pn-review/*`):
  - `GET /pn-review/list`: lista de PNs con conteo, motores, y estado de decisiÃ³n consolidado.
  - `GET /pn-review/:sku`: detalle de un PN (export_row, qa_summary, engine_models_all).
  - `GET /pn-review/:sku/sources`: todas las filas que coinciden con el PN en todos los engine JSON.
  - `POST /pn-review/:sku/apply-decision { action }`: aplica `validar`â†’ok/importar, `revisar`â†’pendiente/revisar, `descartar`â†’ok/eliminar en TODAS las filas del PN en todos los engine JSON. Devuelve `{ok, sku, decision_applied, rows_updated, files_touched, errors}`.

## Special Cases / Risks
- `/save-json` depends on row ID and exact file mapping.
- `/pn-review/:sku/apply-decision` es una operaciÃ³n destructiva multi-archivo; valida whitelist de acciones (400 si invÃ¡lida).
- Writes are file-based; no transaction rollback across multiple files.

