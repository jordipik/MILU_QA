# Error Rules

## Objetivo
Documentar reglas de error por campo usadas en recompute QA.

## Inputs
- Campos final/pdf/gesa de cada registro en `engine_*.json`.

## Outputs
- `*_error`, `total_error`, `has_error`.

## Scripts implicados
- `recompute_engine_errors.js`.

## Endpoints implicados
- `POST /recompute-qa-errors`.

## Botones UI relacionados
- `recomputeRunBtn` (ERRORES).

## Campos afectados
- `pos_error`, `pn_error`, `designation_error`, `model_type_error`, `qty_error`, `units_error`, `weight_error`, `fn_error`, `measure_error`, `fg_fgs_error`, `bom_error`, `norma_error`, `total_error`, `has_error`.

## Flujo paso a paso
1. Se arma `entryMap` por campo (final/pdf/gesa).
2. Cada campo ejecuta checks definidos en `QA_FIELD_CHECKS`.
3. Cada check fallido suma 1 en su `*_error`.
4. `total_error` suma todos los campos; `has_error = total_error > 0`.

## Riesgos / problemas conocidos
- Reglas son estrictas por igualdad textual en varios checks.
- Campos legacy (`qa_errors`, `qa_errors_active`) se limpian explicitamente y no deben reutilizarse.

## TODO pendiente
- Externalizar reglas a un contrato declarativo versionado.

## Ejemplo real
- En `WEIGHT`, el check acepta match contra `weight_pdf`, `weight_gesa` o `weight_gesa` raw.
