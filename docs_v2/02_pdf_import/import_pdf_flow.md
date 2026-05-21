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
- `POST /api/pdf-preview/apply-to-engine`.
- `POST /copy-pdf-to-pdf-all-books` (legacy/alternativo, no usado por IMPORTAR PDF actual del modal).
- `POST /recompute-pdf-auto` (legacy/desactivado, no usado por IMPORTAR PDF actual del modal).

## Botones UI relacionados
- `extractWholeBookBtn` (extraer libro actual).
- `extractAllBooksBtn` (barrido de todos los libros).
- En modal analista: `recomputeCopyBookBtn` (IMPORTAR PDF).

## Campos afectados
- Campos `_pdf`: `pos_pdf`, `pn_pdf`, `designation_pdf`, `model_type_pdf`, `qty_pdf`, `units_pdf`, `weight_pdf`, `fn_pdf`, `measure_pdf`, `norma_pdf`, `bom_pdf`, `fg_fgs_pdf`.

## Flujo paso a paso
1. `import_pdf.html` carga PDF y ejecuta deteccion por pagina (`extractAllPdfRowsFromCurrentPage`).
2. `extractWholeBook` recorre paginas y compone payload `pages[]` con `rows_total` y `warnings_total`.
3. El frontend descarga `book_preview_<MODEL>.json` con `downloadJsonPreview(...)`.
4. En analista, `recomputeCopyBookBtn` ejecuta `runApplyBookPreviewToEngines()`.
5. `runApplyBookPreviewToEngines()` llama `POST /api/pdf-preview/apply-to-engine`.
6. Backend ejecuta apply oficial con `--write --overwrite`.

## Logs y diagnostico
- En `js/analista-02.js` se registran:
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
	- secundario (desempate): `PN`.

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

## Estado operativo actual
- Flujo IMPORTAR PDF estabilizado sobre endpoint oficial unico.
- Diagnostico activo en UI y backend.
- Persistencia validada en disco.
- `not_found` aceptado temporalmente como estado operativo esperado en parte del dataset.

## TODO pendiente
- Definir test de regresion por muestra de paginas para validar estabilidad de extraccion.

## Ejemplo real
- `js/import-pdf.js` genera `book_preview_12V4000M40A.json` al terminar `extractWholeBook`.
