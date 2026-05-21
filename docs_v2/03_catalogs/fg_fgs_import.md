# FG FGS Import

## Objetivo
Documentar el uso de informacion FG/FGS en MILU v1.

## Inputs
- Campos en `engine_*.json`: `fg_fgs_raw`, `fg_code`, `fgs_description`, `fgs_code_description`, `categoria`, `fg_fgs_pdf`, `fg_fgs_final`.

## Outputs
- Campos descriptivos para QA y export (`fg_code`, `fg_description`, `fg_code_description`, categorias).

## Scripts implicados
- `js/export-wordpress.js`.
- `scripts/export_wordpress_milu.js`.
- `generate_synthetic_exports.js`.

## Endpoints implicados
- `POST /export/run-wordpress`.

## Botones UI relacionados
- `expBtnRunWordpress`.

## Campos afectados
- `fg_code`, `fgs_description`, `fgs_code_description`, `categoria`, `fg_fgs_final`, `exp_categorias`, `atributo`.

## Flujo paso a paso
1. Se leen campos FG/FGS por fila desde engine.
2. En export por PN, se compactan categorias y metadatos FG/FGS.
3. Se publican en salida WordPress (JSON/CSV) como atributos de catalogo.

## Riesgos / problemas conocidos
- No se detecto importer runtime directo para `EXCEL_FG-FGS*.json` en este repo.
- Puede haber divergencia entre `fg_fgs_pdf`, `fg_fgs_final` y descripciones de catalogo si falta normalizacion.

## TODO pendiente
- Formalizar validacion cruzada FG/FGS en recompute de errores.

## Ejemplo real
- `js/export-wordpress.js` genera `fg_description` desde `fgs_description` y categorias agregadas para `exp_categorias`.
