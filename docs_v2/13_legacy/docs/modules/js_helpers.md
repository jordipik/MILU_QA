# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: js/helpers.js

## Purpose
Pure helper and validation utilities for row value access, normalization, and QA error detection.

## Inputs
- Row objects and field names.
- Shared state for cross-dataset consistency checks.

## Outputs
- Display-safe strings and normalized values.
- Derived final values (`designation_final`, `measurement_final`, `weight_final`).
- Error flags/types for rows.

## Dependencies
- `state` (for mismatch checks with New/Superseded datasets)

## Core Logic
- Escape HTML and normalize text.
- Resolve effective values with fallback rules.
- Infer engine JSON file names from row source.
- Detect critical/warning QA issues (missing PN, export mismatch, inconsistencies).

## Special Cases / Risks
- Error checks depend on auxiliary datasets being loaded.
- Measurement and list comparisons normalize whitespace and comma-separated sets.

