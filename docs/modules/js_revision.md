# Module: js/revision.js

## Purpose
Manage revision fields, key aliasing, import/export, and backend apply calls.

## Inputs
- Row objects in `state.allData`.
- Imported revision files.
- User revision selections from UI.

## Outputs
- Updated row revision fields in memory.
- Persisted row revision fields through `/save-json`.
- Exported revision payload files.
- Batch apply API call to `/apply-revision-to-engines`.

## Dependencies
- `state`
- `saveCellToServer` from `js/data-loader.js`

## Core Logic
- Build and assign stable/legacy/occurrence revision keys.
- Normalize incoming revision records and payload structures.
- Apply normalized revision data to rows.
- Persist row-level revision changes asynchronously.
- Generate export payload and import matching by key aliases.
- Trigger backend mass apply for imported payloads.

## Special Cases / Risks
- Alias mapping is essential for backward compatibility.
- Async save can fail after in-memory update; UI and disk may diverge until user retries.
