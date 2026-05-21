# Book Preview Structure

## Objetivo
Definir la estructura real de `book_preview_<MODEL>.json` consumida por los scripts de apply.

## Inputs
- Salida de `extractWholeBook` en `js/import-pdf.js`.

## Outputs
- JSON con metadata de ejecucion y array de paginas/filas.

## Scripts implicados
- `js/import-pdf.js`.
- `apply_book_preview_to_engine.py`.

## Endpoints implicados
- No requiere endpoint para generarse (se descarga localmente).

## Botones UI relacionados
- `extractWholeBookBtn`.
- `extractAllBooksBtn`.

## Campos afectados
- Nivel raiz: `book`, `generated_at`, `pages_total`, `range_from`, `range_to`, `pages_processed`, `pages_with_rows`, `rows_total`, `warnings_total`, `cancelled`, `pages`.
- Nivel pagina: `source_page`, `rows_count`, `rows_with_pn`, `warnings_count`, `rows[]`.
- Nivel fila: campos `_pdf`, `confidence`, `warnings[]`.

## Flujo paso a paso
1. Cada pagina agrega un bloque a `pages[]`.
2. Cada fila detectada guarda valores normalizados por columna PDF.
3. `downloadJsonPreview` emite archivo `book_preview_<MODEL>.json`.
4. Scripts Python iteran `preview.pages[].rows[]` para match con engine.

## Riesgos / problemas conocidos
- Si `pos_pdf` falta, la fila no puede hacer match fiable con engine.
- `confidence` bajo no bloquea exportacion del preview; requiere QA posterior.

## TODO pendiente
- Versionar schema JSON explicito de `book_preview`.

## Ejemplo real
- El script Python espera estructura `pages -> rows` y consume `source_page`, `pos_pdf`, `pn_pdf` para el matching.
