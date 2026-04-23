# Module: depuracion_json.py

## Purpose
Offline normalization pass over all engine JSON files to recompute canonical final fields.

## Inputs
- 8 `engine_*.json` files in repo root.

## Outputs
- Overwritten engine files with normalized/computed fields.

## Dependencies
- Python standard library (`json`, `pathlib`)

## Core Logic
- Normalize whitespace in `dimensions_gesa` and `MEASUREMENT / STANDARD`.
- Compute `designation_final` (`designation_gesa` priority).
- Compute `measurement_final` (`dimensions_gesa` priority).
- Resolve/fix `weight_final` including legacy typo `wheight_final`.
- Recompute `exp_imagenes` from `ruta_foto` and `ruta_esquemas_pos`, with fallback placeholder URL.

## Special Cases / Risks
- Script uses absolute base path configured in code.
- Mutates production data files directly.
