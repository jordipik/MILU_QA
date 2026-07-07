# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: marcar_articulos_en_web.py

## Purpose
Mark each engine row with `EN_WEB` based on presence in product export dataset.

## Inputs
- `product-export-2026-03-29-11-07.json`
- all `engine_*.json` files

## Outputs
- Overwritten `engine_*.json` with updated boolean `EN_WEB` field

## Dependencies
- Python standard library (`json`, `glob`)

## Core Logic
- Build set of product `post_name` values.
- For each engine row, compare trimmed `PART NO.` against set.
- Set `EN_WEB = True/False`.
- Rewrite each engine file.

## Special Cases / Risks
- Exact-string matching only; no fuzzy normalization.
- Mutates runtime data files directly.

