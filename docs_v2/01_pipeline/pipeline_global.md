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
- `/copy-pdf-to-pdf-all-books` (legacy para import PDF del modal actual)
- `/recompute-pdf-auto` (legacy/desactivado para import PDF del modal actual)
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
2. En modal (`recomputeCopyBookBtn`), UI ejecuta `runApplyBookPreviewToEngines()`.
3. Se llama endpoint oficial `POST /api/pdf-preview/apply-to-engine`.
4. Backend ejecuta `apply_book_preview_to_engine.py --write --overwrite` (o `apply_all_book_previews.py --write --overwrite` en modo todos).
5. Se calcula `_final` por reglas de mapeo PDF/GESA.
6. Se recalculan errores `_error` y `has_error`.
7. Se recalcula estado/accion QA.
8. Se exporta WordPress por decisiones QA.

## Diagnostico activo
- Logs en `js/analista-02.js` y `server.js` para el flujo IMPORTAR PDF.
- Matching documentado en `apply_book_preview_to_engine.py`:
	- principal: `Source Page` + `POS`;
	- fallback si falta `POS`: `Source Page` + `PN` en la misma pagina, solo con match unico;
	- desempate del matching por `POS`: `PN`.
- `not_found` se interpreta como fila preview sin match, no como error de escritura.
- Modal incluye panel de no-match con metricas, tabla, filtro, busqueda y export CSV.

## Modal de errores: alcance y libro
- `Alcance errores` define scope (`current`, `book`, `all`).
- Selector `Libro` permite libro individual o `Todos los libros`.
- Seleccionar `Todos los libros` fuerza scope `all` y el boton pasa a `ERRORES TODOS`.

## Estado operativo actual
- Flujo IMPORTAR PDF estabilizado y endpoint oficial unificado.
- Diagnostico activo en UI/backend/script.
- Persistencia validada en entorno real.
- Casos `not_found` aceptados temporalmente.
- Ambiguedades de matching pendientes de revision futura.

## Riesgos / problemas conocidos
- Dependencia de entorno local para endpoints de recompute.
- Persistencia basada en archivos JSON sin BD transaccional.

## TODO pendiente
- Congelar un contrato versionado unico para final fields.

## Ejemplo real
- Flujo completo ejecutable desde `analista_02.html` (modal recompute) y `exportacion.html`.
