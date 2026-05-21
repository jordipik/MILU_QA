# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Module: pretty_print_all_json.py

## Purpose
Format root-level JSON files with consistent indentation.

## Inputs
- all `*.json` files in root (except product-export and `.vscode/settings.json`)

## Outputs
- Same files rewritten with pretty JSON (indent 2)

## Dependencies
- Python standard library (`json`, `glob`)

## Core Logic
- Enumerate candidate JSON files by pattern.
- Parse each file and write back with `ensure_ascii=False` and `indent=2`.
- Skip files that fail parse and print an error.

## Special Cases / Risks
- Large batch rewrite can create noisy git diffs.
- Exclusion logic is filename-based and narrow.

