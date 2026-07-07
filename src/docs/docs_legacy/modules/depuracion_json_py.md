# Module: depuracion_json.py

## Purpose
Offline normalization pass over all engine JSON files to recompute canonical final fields.

## Inputs
- 9 `engine_*.json` files in repo root.

## Outputs
- Overwritten engine files with normalized/computed fields.

## Dependencies
- Python standard library (`json`, `pathlib`)
- Repo path helper: `python_repo_paths.py`

## Core Logic
- Normalize whitespace in `dimensions_gesa` and `MEASUREMENT / STANDARD`.
- Compute `designation_final` (`designation_gesa` priority).
- Compute `measure_final` (`dimensions_gesa` priority). Legacy `measurement_final` is removed.
- Resolve/fix `weight_final` including legacy typo `wheight_final`.
- Recompute `exp_imagenes` from `ruta_foto` and `ruta_esquemas_pos`, with fallback placeholder URL.

## Special Cases / Risks
- Mutates production data files directly.

## Path Resolution (DT-1)
- Repo directory is resolved via `resolve_repo_dir(__file__)`.
- Precedence:
	1. `MILU_REPO_DIR` (if it points to a valid MILU repo)
	2. Ascendant search from script location using repo markers
	3. Safe fallback to script directory
- Optional debug trace: set `MILU_REPO_DEBUG=1`.

### Usage examples
- Windows PowerShell (default fallback):
	- `python depuracion_json.py`
- Windows PowerShell (explicit repo dir):
	- `$env:MILU_REPO_DIR='C:\repo\milu'; python depuracion_json.py`
- With debug:
	- `$env:MILU_REPO_DIR='C:\repo\milu'; $env:MILU_REPO_DEBUG='1'; python depuracion_json.py`
