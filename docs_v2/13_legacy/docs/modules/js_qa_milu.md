# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: js/qa-milu.js

## Purpose
Frontend orchestrator: app init, wiring events, loading data, modal behavior, bulk actions, panel sync.

## Inputs
- DOM controls and user interactions.
- Loaded data from data-loader and revision modules.

## Outputs
- Fully initialized UI state.
- Triggered render cycles and side panel updates.
- Bulk revision actions and export/import interactions.

## Dependencies
- Nearly all frontend modules (`state`, `data-loader`, `revision`, `qa-table`, `pdf-viewer`, `schemas`, `column-view`, `cell-editor`, helpers)

## Core Logic
- Bootstrap: load data, assign revision keys, apply initial renders.
- Bind toolbar, filters, sorting, keyboard and modal events.
- Keep backend status badge updated via periodic health checks.
- Build synthetic comparison views in record modal.

## Special Cases / Risks
- This module is large and cross-cutting; changes can affect multiple flows.
- Should avoid unnecessary full rerenders to preserve UX stability.

