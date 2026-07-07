# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: js/pos-preload.js

## Purpose
Asynchronously preload position-circle images for visible rows to improve perceived UI responsiveness.

## Inputs
- Visible row subset from table rendering.

## Outputs
- Warm image cache via queued background image loading.

## Dependencies
- `getPosSchemasForRow` from `js/schemas.js`

## Core Logic
- Collect candidate image URLs from visible rows.
- Queue unique URLs, skip already cached/queued.
- Pump queue with fixed concurrency.
- Schedule work with `requestIdleCallback` fallback to `setTimeout`.

## Special Cases / Risks
- Aggressive preload can consume bandwidth/memory on very large visibility changes.
- Cache avoids repeated network requests for same image URL.

