# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: js/pdf-viewer.js

## Purpose
Render PDFs and highlight selected row tokens (PN/POS/designation) inside the PDF viewer.

## Inputs
- PDF source/book and page values.
- Current selected row info (`setPdfSelection`).

## Outputs
- Rendered PDF canvas.
- Overlay highlights and selection badge.

## Dependencies
- `state`
- browser PDF.js global (`window.pdfjsLib`)

## Core Logic
- Load PDF document lazily and cache in state.
- Render requested page to canvas.
- Extract text layer content and search for normalized token matches.
- Draw highlight rectangles (bounded count) and auto-scroll to best match.

## Special Cases / Risks
- Cancels in-flight render tasks when a new page request arrives.
- Highlights are page-sensitive and cleared when selected row page does not match.

