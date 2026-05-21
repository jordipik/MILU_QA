# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: js/data-loader.js

## Purpose
Load runtime datasets and communicate with save backend endpoints.

## Inputs
- Resource names (`engine_*.json` and auxiliary JSON).
- Save requests (`file`, `id`, `col`, `value`).

## Outputs
- Parsed JSON data arrays.
- Save/health-check response objects.

## Dependencies
- `state`
- helpers: `inferEngineModelFromFileName`, `normalizeEngineModel`
- browser `fetch`
- browser `window.pako` for `.gz` support

## Core Logic
- `loadPartitionedEngineData()` fetches 9 engine files in parallel and merges rows.
- `fetchJsonSafe()` wraps fetch with better errors and optional gzip decode.
- `saveCellToServer()` posts to candidate backend URLs with fallback strategy.
- `checkSaveBackendConnection()` checks `/health` on candidate hosts.

## Special Cases / Risks
- Network fallbacks may hide environment misconfiguration if one URL works unexpectedly.
- If all engine files fail, loader throws hard error.

