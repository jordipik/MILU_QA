# Module: app.js (legacy)

## Purpose
Legacy lightweight virtualized list viewer for QA index files.

## Inputs
- `qa_index_light.json` (primary)
- `qa_index.json` (declared constant, not primary load path in current code)

## Outputs
- Scroll-virtualized row list and detail panel in legacy page context.

## Dependencies
- Plain browser DOM APIs

## Core Logic
- Fetch rows from light index JSON.
- Apply text and flag filters.
- Render only visible window based on scroll offset.
- Update detail panel on selected row.

## Special Cases / Risks
- Not the primary MILU runtime UI (`qa_milu.html` is primary).
- Should be treated as maintenance/legacy component.
