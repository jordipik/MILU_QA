# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: convert_excel_to_json.py

## Purpose
Simple one-off converter from product export XLSX to JSON records.

## Inputs
- `product-export-2026-03-29-11-07.xlsx`

## Outputs
- `product-export-2026-03-29-11-07.json`

## Dependencies
- `pandas`

## Core Logic
- Read Excel sheet to DataFrame.
- Serialize as JSON list (`orient='records'`, UTF-8 friendly).

## Special Cases / Risks
- Assumes exact file names in script constants.
- No schema validation or argument parsing.

