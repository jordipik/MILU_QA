# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: estadisticas_articulos.py

## Purpose
Quick console statistics comparing unique part numbers in engine datasets vs product-export datasets.

## Inputs
- `engine_*.json`
- `product-export-*.json`

## Outputs
- Console summary with unique counts and set intersections/differences.

## Dependencies
- Python standard library (`json`, `glob`)

## Core Logic
- Load unique values by key:
  - engine key: `PART NO.`
  - product key: `post_name`
- Compute totals and overlap:
  - in both
  - in web only
  - in books only

## Special Cases / Risks
- Handles JSON as list or dict containing first list.
- No normalization beyond raw key extraction.

