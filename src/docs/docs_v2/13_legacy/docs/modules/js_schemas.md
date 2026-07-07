# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: js/schemas.js

## Purpose
Resolve and render schema/position images for book/page and selected row contexts.

## Inputs
- Book/page values.
- Row fields (`esquemas`, `esquemas_circulos`, `ruta_esquemas_pos`).

## Outputs
- Candidate image path lists.
- Rendered schema and position image strips in UI.

## Dependencies
- `state`
- helper `val`

## Core Logic
- Parse schema tokens from comma/semicolon/line-separated strings.
- Build candidate file paths with multiple extensions and naming variants.
- Resolve top strip for selected row position image.
- Provide inline schema list for current book+page.

## Special Cases / Risks
- Missing images fallback by trying next candidate.
- Uses encoded paths; filename/path normalization is important.

