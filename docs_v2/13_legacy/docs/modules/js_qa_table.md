# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: js/qa-table.js

## Purpose
Render and control the main QA table: filtering, sorting, pagination, selection, grouped summaries.

## Inputs
- `state.allData`, `state.filters`, sorting and pagination settings.
- Row selection and keyboard navigation events.

## Outputs
- Table body HTML, pagination UI, grouped summary table.
- Selection events and selected-row visual updates.

## Dependencies
- `state`
- helpers and revision class utilities
- `column-view`, `schemas`, `pos-preload`

## Core Logic
- `applyFilters()` handles multi-field filter semantics.
- `sortData()` supports custom sorting (`book_page_pos`, numeric page handling).
- `renderTable()` renders current page and applies column ordering/visibility.
- `renderPagination()` and navigation helpers manage page transitions.
- Selection helpers update visual state without full rerenders.

## Special Cases / Risks
- Full rerenders can break interaction timing (double-click and selection).
- Auto page-size logic depends on live DOM dimensions.

