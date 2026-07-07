# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: js/revision.js

## Purpose
Manage revision fields, key aliasing and row-level persistence.

## Inputs
- Row objects in `state.allData`.
- User revision selections from UI.

## Outputs
- Updated row revision fields in memory.
- Persisted row revision fields through `/save-json`.

## Dependencies
- `state`
- `saveCellToServer` from `js/data-loader.js`

## Core Logic
- Build and assign stable/legacy/occurrence revision keys.
- Apply normalized revision data to rows.
- Persist row-level revision changes asynchronously.

## Special Cases / Risks
- Alias mapping is essential for backward compatibility.
- Async save can fail after in-memory update; UI and disk may diverge until user retries.

