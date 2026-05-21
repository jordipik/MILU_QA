# Pipeline Global MILU V1

## Objetivo
Resumir en una sola pieza navegable el pipeline operativo de MILU por motor.

## Inputs
- PDF por motor.
- `book_preview_*.json`.
- `engine_*.json`.

## Outputs
- `engine_*.json` consolidados para QA y export.
- Export WordPress en `data/output/wordpress/`.

## Scripts implicados
- `apply_book_preview_to_engine.py` / `apply_all_book_previews.py`.
- `recompute_engine_errors.js`.
- `scripts/export_wordpress_milu.js`.
- `depuracion_json.py` (offline oficial).

## Endpoints implicados
- `/api/pdf-preview/apply-to-engine`
- `/copy-pdf-to-final-all-books`
- `/recompute-qa-errors`
- `/recalculate-revision-status`
- `/export/run-wordpress`

## Botones UI relacionados
- Import PDF: `extractWholeBookBtn`, `extractAllBooksBtn`.
- Analista modal: `recomputeCopyBookBtn`, `recomputeCalculateFinalBtn`, `recomputeRunBtn`, `recomputeRevisionStatusBtn`.
- Export: `expBtnRunWordpress`.

## Campos afectados
- `_pdf`, `_final`, `_error`, QA, y campos de export visual.

## Flujo paso a paso
1. Se extrae PDF a `book_preview_*.json`.
2. Se copia preview a `_pdf` del engine.
3. Se calcula `_final` por reglas de mapeo PDF/GESA.
4. Se recalculan errores `_error` y `has_error`.
5. Se recalcula estado/accion QA.
6. Se exporta WordPress por decisiones QA.

## Riesgos / problemas conocidos
- Dependencia de entorno local para endpoints de recompute.
- Persistencia basada en archivos JSON sin BD transaccional.

## TODO pendiente
- Congelar un contrato versionado unico para final fields.

## Ejemplo real
- Flujo completo ejecutable desde `analista_02.html` (modal recompute) y `exportacion.html`.
