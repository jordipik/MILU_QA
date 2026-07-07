# Error Rules

## Objetivo
Documentar las reglas de error por campo que aplica el motor backend persistente en recompute QA.

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

## Fuente de verdad tecnica
- `FIELD_TO_ERROR_KEY`: define los 12 campos que computan error persistente.
- `QA_FIELD_CHECKS`: define checks por campo.
- `computeErrorPayload(row)`: cuenta checks fallidos y calcula `total_error`.
- `applyToRow(row, options)`: aplica payload y fija `has_error = total_error > 0`.

## Flujo paso a paso
1. Se arma `entryMap` por campo (final/pdf/gesa).
2. Cada campo ejecuta checks definidos en `QA_FIELD_CHECKS`.
3. Cada check fallido suma 1 en su `*_error`.
4. `total_error` suma todos los campos; `has_error = total_error > 0`.

## Reglas base de comparacion
- `isCompareMatch(a, b)` solo aprueba si ambos valores son no vacios y exactamente iguales.
- No hay normalizacion semantica de texto (case-folding, trim avanzado o colapso de espacios) en el motor persistente.
- En varios checks, si el valor PDF esta vacio, el check de match se considera aprobado.

## Reglas por campo

### POS -> pos_error
- Check 1: `pos_final` obligatorio (`!= ''`).
- Check 2: match con `pos_pdf` (fallback `POS`):
	- PDF vacio -> aprueba
	- PDF no vacio -> exige igualdad exacta
- Formula: `pos_error = fail(check1) + fail(check2)`

### PART NO. -> pn_error
- Check 1: `pn_final` obligatorio (`!= ''`).
- Check 2: match con `pn_pdf` (fallback `PART NO.`):
	- PDF vacio -> aprueba
	- PDF no vacio -> exige igualdad exacta
- Formula: `pn_error = fail(check1) + fail(check2)`

### DESIGNATION -> designation_error
- Check 1: `designation_final` obligatorio (`!= ''`).
- Check 2: match con `designation_pdf` o `designation_gesa`:
	- si PDF y GESA vacios -> aprueba
	- si hay alguna fuente -> exige igualdad exacta con al menos una
- Formula: `designation_error = fail(check1) + fail(check2)`

### MODEL/TYPE -> model_type_error
- Check unico:
	- final y PDF vacios -> aprueba
	- PDF no vacio -> exige igualdad exacta
	- PDF vacio y final no vacio -> aprueba
- Formula: `model_type_error = fail(check_unico)`

### QTY -> qty_error
- Check unico:
	- si `qty_final` y `qty_pdf/QTY` estan ambos vacios -> aprueba
	- si `qty_pdf/QTY` tiene valor y `qty_final != qty_pdf/QTY` -> error
	- si `qty_pdf/QTY` tiene valor y `qty_final == qty_pdf/QTY` -> aprueba
	- si `qty_pdf/QTY` esta vacio y `qty_final` no vacio -> aprueba
- Formula: `qty_error = fail(check_unico)`

### UNITS -> units_error
- Mismo patron que MODEL/TYPE.
- Formula: `units_error = fail(check_unico)`

### WEIGHT -> weight_error
- Check unico multi-fuente:
	- si `weight_final`, `weight_pdf`, `weight_gesa` y `weight_gesa_raw` estan vacios -> aprueba
	- en otro caso exige igualdad exacta de `weight_final` con alguna fuente:
		- `weight_pdf`
		- `weight_gesa` (con units)
		- `weight_gesa_raw`
- Formula: `weight_error = fail(check_unico)`

### FN -> fn_error
- Mismo patron que MODEL/TYPE.
- Formula: `fn_error = fail(check_unico)`

### MEASUREMENT / STANDARD -> measure_error
- Check unico:
	- final, PDF y GESA vacios -> aprueba
	- en otro caso exige igualdad exacta con PDF o GESA
- Formula: `measure_error = fail(check_unico)`

### NORMA -> norma_error
- Check unico:
	- final, PDF y GESA vacios -> aprueba
	- en otro caso exige igualdad exacta con PDF o GESA
- Formula: `norma_error = fail(check_unico)`

### BOM-No. -> bom_error
- Check unico:
	- final y PDF vacios -> aprueba
	- PDF no vacio -> exige igualdad exacta
	- PDF vacio y final no vacio -> aprueba
- Formula: `bom_error = fail(check_unico)`

### FG/FGS -> fg_fgs_error
- Check unico:
	- final y PDF vacios -> aprueba
	- PDF no vacio -> exige igualdad exacta
	- PDF vacio y final no vacio -> aprueba
- Formula: `fg_fgs_error = fail(check_unico)`

## Agregacion
- `total_error`:
	- suma de `pos_error + pn_error + designation_error + model_type_error + qty_error + units_error + weight_error + fn_error + measure_error + fg_fgs_error + bom_error + norma_error`
- `has_error`:
	- `true` si `total_error > 0`
	- `false` si `total_error == 0`

## Riesgos / problemas conocidos
- Reglas son estrictas por igualdad textual en varios checks.
- Campos legacy (`qa_errors`, `qa_errors_active`) se limpian explicitamente y no deben reutilizarse.
- Si llega un payload externo con `scope=current` y sin `id`, el backend puede terminar recalculando libro completo (la UI lo evita, API publica no lo fuerza).

## TODO pendiente
- Externalizar reglas a un contrato declarativo versionado.

## Ejemplo real
- En `WEIGHT`, el check acepta match contra `weight_pdf`, `weight_gesa` o `weight_gesa` raw.
