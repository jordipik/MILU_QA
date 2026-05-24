# Import PDF Flow

## Objetivo
Documentar el flujo de extraccion de tablas PDF y su aplicacion sobre `engine_*.json`.

## Inputs
- PDF del motor seleccionado en `import_pdf.html`.
- Rango de paginas (`pdfRangeFromInput`, `pdfRangeToInput`).

## Outputs
- `book_preview_<MODEL>.json` descargado por navegador.
- Actualizacion de `_pdf` en `engine_*.json` al aplicar preview.

## Scripts implicados
- Frontend: `js/import-pdf.js` (`extractWholeBook`, `extractAllBooks`).
- Backend apply: `apply_book_preview_to_engine.py`, `apply_all_book_previews.py`.

## Endpoints implicados
- OFFICIAL: `POST /api/pdf-preview/apply-to-engine`.
- ALTERNATIVO/LEGACY: `POST /copy-pdf-to-pdf-all-books`.
- LEGACY DESACTIVADO: `POST /recompute-pdf-auto` (HTTP 410).
- ALTERNATIVO VISUAL: `POST /recompute-pdf-auto-visual`.

## Botones UI relacionados
- `extractBookBtn` (extraer libro actual).
- `extractAllBooksBtn` (barrido de todos los libros).
- En `recompute_simple.html`: `btnImportPdf`.
- En modal analista: `recomputeCopyBookBtn`.

## Campos afectados
- Campos `_pdf`: `pos_pdf`, `pn_pdf`, `designation_pdf`, `model_type_pdf`, `qty_pdf`, `units_pdf`, `weight_pdf`, `fn_pdf`, `measure_pdf`, `norma_pdf`, `bom_pdf`, `fg_fgs_pdf`.

## Flujo paso a paso
1. `import_pdf.html` carga PDF y ejecuta deteccion por pagina (`extractAllPdfRowsFromCurrentPage`).
2. `extractWholeBook` recorre paginas y compone payload con:
	- raiz: `book`, `generated_at`, `pages_total`, `range_from`, `range_to`, `pages_processed`, `pages_with_rows`, `rows_total`, `warnings_total`, `cancelled`, `pages`.
	- cada pagina: `source_page`, `rows_count`, `rows_with_pn`, `warnings_count`, `rows`.
3. El frontend descarga `book_preview_<MODEL>.json` con `downloadJsonPreview(...)`.
4. IMPORTAR PDF en recompute (`btnImportPdf` o `recomputeCopyBookBtn`) llama `POST /api/pdf-preview/apply-to-engine`.
5. Backend ejecuta:
	- por libro: `apply_book_preview_to_engine.py --write --overwrite --report ...`
	- todos: `apply_all_book_previews.py --write --overwrite --report ...`
6. La respuesta devuelve `stats`, `not_found_rows`, `action_required_conflicts`, `applied_manual_decisions`.

## Logs y diagnostico
- En `js/analista-02.js` y `js/recompute-simple.js` se registran:
	- boton pulsado;
	- engine seleccionado;
	- endpoint llamado;
	- `rows_changed`, `fields_changed`, `ambiguous`, `not_found`.
- En `server.js` se registra:
	- comando Python ejecutado;
	- resumen final de stats.
- En `apply_book_preview_to_engine.py` se consolida el reporte de matching y no-match.

## not_found y matching
- `not_found` NO es error de persistencia.
- `not_found` indica fila preview sin match contra engine.
- Matching real actual:
	- principal: `Source Page` + `POS`.
	- desempate del matching principal por PN.
	- fallback si falta `POS`: `Source Page` + `PN` (candidato unico).
	- fallback adicional de compatibilidad: cuando falla `(page,pos)` y hay PN, puede resolver por `(page,pn)` como `page-pn-pos-mismatch`.

## Panel de no-match en modal
- El modal de recálculo muestra diagnostico de no-match:
	- metricas;
	- tabla;
	- filtro por motivo;
	- busqueda libre;
	- export CSV de filas visibles.

## Riesgos / problemas conocidos
- Extraccion depende de deteccion visual; puede generar `warnings` y filas ambiguas/no encontradas.
- Apply oficial con `--overwrite` puede reemplazar valores no vacios en `_pdf`.
- `not_found` puede mantenerse aunque la ejecucion sea correcta; se trata como diagnostico de matching.
- Existen rutas legacy/alternativas de copia `_pdf`, pero no son el flujo oficial de IMPORTAR PDF.

## Estado operativo actual
- Flujo IMPORTAR PDF estabilizado sobre endpoint oficial unico.
- Diagnostico activo en UI y backend.
- Persistencia validada en disco.
- `not_found` aceptado temporalmente como estado operativo esperado en parte del dataset.

## Aclaracion oficial vs legacy
- Oficial para IMPORTAR PDF: `POST /api/pdf-preview/apply-to-engine`.
- No oficial para este boton: `/copy-pdf-to-pdf-all-books`, `/recompute-pdf-auto`, `/recompute-pdf-auto-visual`.

## TODO pendiente
- Definir test de regresion por muestra de paginas para validar estabilidad de extraccion.

## Ejemplo real
- `js/import-pdf.js` genera `book_preview_12V4000M40A.json` al terminar `extractWholeBook`.
