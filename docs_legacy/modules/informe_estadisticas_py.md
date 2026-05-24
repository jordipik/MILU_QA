# Module: informe_estadisticas.py

## Purpose
Generate a persistent text report of dataset statistics and overlap results.

## Inputs
- `engine_*.json`
- `product-export-*.json`

## Outputs
- `informe_estadisticas.txt`

## Dependencies
- Python standard library (`json`, `glob`)

## Core Logic
- Compute per-file totals and unique counts.
- Compute global intersections and differences between engine and web keys.
- Write formatted report with detail sections and summary totals.

## Special Cases / Risks
- Uses fixed key mapping (`PART NO.` vs `post_name`).
- Report formatting assumes UTF-8 compatible environment.
