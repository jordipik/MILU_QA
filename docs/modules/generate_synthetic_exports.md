# Module: generate_synthetic_exports.js

## Purpose
Generate synthetic New and Superseded export datasets from engine source rows.

## Inputs
- 8 `engine_*.json` files.
- Optional output paths via CLI args.

## Outputs
- `qa_synthetic_new.json`
- `qa_synthetic_superseded.json`

## Dependencies
- Node `fs`, `path`

## Core Logic
- Load and merge all engine rows.
- Group rows by normalized PN.
- Select representative row per PN for New and Superseded contexts.
- Compute normalized export fields: model/page labels, measurement/weight text, substitution fields, image merge.
- Write JSON outputs.

## Special Cases / Risks
- Superseded logic depends on `sust_hierarchie` and related new-part fields.
- Numeric parsing of weight handles mixed separators and units.
