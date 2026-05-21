# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: js/cell-editor.js

## Purpose
Inline edit behavior for table cells and persistence to engine JSON files.

## Inputs
- Double-click target cell.
- Current row revision key and column key.
- User typed value.

## Outputs
- Updated table cell display.
- Persisted field value via `/save-json`.

## Dependencies
- `state`
- helpers (`escapeHtml`, `getEngineJsonForRow`)
- `saveCellToServer`

## Core Logic
- Detect editable targets.
- Create temporary input editor in cell.
- Commit on Enter/blur, cancel on Escape.
- Persist value to backend then mutate row field in memory.

## Special Cases / Risks
- Current `EDITABLE_COLUMNS` is empty in code snapshot; editing is effectively disabled unless populated.
- On save failure it restores original visual value and alerts user.

