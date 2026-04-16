# Module: apply_revision_to_engines.js

## Purpose
Apply imported revision payloads to all 8 engine JSON files.

## Inputs
- Parsed revision payload (v2 or compatible normalized object).
- Optional repo root and source name.

## Outputs
- Mutated `engine_*.json` files (only changed files rewritten).
- Summary object with totals and per-file counts.

## Dependencies
- Node `fs`, `path`

## Core Logic
- Normalize revision payload to a flat map.
- Traverse rows in stable global order to build `idx=N` keys.
- For each row, attempt match by:
  1) stable index key
  2) legacy key (`ID||PN||Page||POS||source`)
  3) occurrence key (`legacy||occ=n`)
- Update `qa_revision_estado` and `qa_revision_accion` only when changed.

## Special Cases / Risks
- Global index ordering must stay consistent with frontend load order.
- Duplicate legacy keys are disambiguated with occurrence counters.
- Missing or malformed engine arrays raise hard errors.
