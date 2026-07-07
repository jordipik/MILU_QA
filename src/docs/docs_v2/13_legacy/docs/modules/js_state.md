# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: js/state.js

## Purpose
Shared global mutable state object for the frontend app.

## Inputs
- Updated by all runtime modules.

## Outputs
- Central source of UI/runtime truth for table, filters, revision, and PDF panels.

## Dependencies
- None (pure state declaration).

## Core Logic
Defines baseline state fields:
- datasets: `allData`, `filteredData`
- sorting/pagination: `sortKey`, `sortAsc`, `currentPage`, `pageSize`
- filtering and grouped view flags
- selected row key and right-panel tab
- reference sets/maps for New/Superseded and product export
- PDF rendering and selection context

## Special Cases / Risks
- State is mutable and shared; updates must be coordinated to avoid stale UI.
- Several modules assume required fields exist (e.g., selected key, column view).

