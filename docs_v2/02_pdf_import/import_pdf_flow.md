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
4. En analista, `recomputeCopyBookBtn` llama `POST /api/pdf-preview/apply-to-engine`.
5. Backend ejecuta script Python oficial con `--write --overwrite`.

## Riesgos / problemas conocidos
- Extraccion depende de deteccion visual; puede generar `warnings` y filas ambiguas/no encontradas.
- Apply oficial con `--overwrite` puede reemplazar valores no vacios en `_pdf`.

## TODO pendiente
- Definir test de regresion por muestra de paginas para validar estabilidad de extraccion.

## Ejemplo real
- `js/import-pdf.js` genera `book_preview_12V4000M40A.json` al terminar `extractWholeBook`.
