# Apply Book Preview To Engine

## Objetivo
Describir la logica real de aplicacion de `book_preview` sobre `engine`.

## Inputs
- `--book-preview book_preview_<MODEL>.json`
- `--engine engine_<MODEL>.json`
- flags: `--write`, `--overwrite`.

## Outputs
- Actualizacion de campos `_pdf` en el engine.
- Backup `engine_*.json.bak.<timestamp>` cuando hay escritura.

## Scripts implicados
- `apply_book_preview_to_engine.py`.
- `apply_all_book_previews.py`.

## Endpoints implicados
- `POST /api/pdf-preview/apply-to-engine` (wrapper backend para ejecutar scripts Python).
- `POST /copy-pdf-to-pdf-all-books` (legacy para este flujo, no oficial actual de IMPORTAR PDF).
- `POST /recompute-pdf-auto` (legacy/desactivado para este flujo).

## Botones UI relacionados
- `recomputeCopyBookBtn` (IMPORTAR PDF).

## Campos afectados
- `pos_pdf`, `pn_pdf`, `designation_pdf`, `model_type_pdf`, `qty_pdf`, `units_pdf`, `weight_pdf`, `fn_pdf`, `measure_pdf`, `norma_pdf`, `bom_pdf`, `fg_fgs_pdf`.

## Flujo paso a paso
1. Script indexa engine por `(Source Page, POS)`.
2. Busca candidatos para cada fila de preview.
3. Si la fila preview no trae `POS`, aplica fallback por `(Source Page, PN)` en la misma pagina.
4. El fallback solo se acepta si el `PN` identifica una unica fila de engine en esa pagina (`pn_pdf` contra `pn_pdf`/`PART NO.`/`pn_final`/`pn_excel`).
5. Si hay multiples candidatos con la misma clave, el caso queda como ambiguo y no se aplica.
6. Si `--overwrite` no esta activo, no reemplaza celdas no vacias.
7. Si `--write` y hubo cambios, persiste engine y crea backup.

## Flujo oficial desde modal IMPORTAR PDF
- `recomputeCopyBookBtn` ejecuta `runApplyBookPreviewToEngines()` en `js/analista-02.js`.
- El endpoint oficial del flujo es `POST /api/pdf-preview/apply-to-engine`.
- Backend ejecuta apply con `--write --overwrite`.
- Este flujo no usa `/copy-pdf-to-pdf-all-books` ni `/recompute-pdf-auto`.

## Logs y diagnostico
- `analista-02.js`: boton, engine, endpoint, `rows_changed`, `fields_changed`, `ambiguous`, `not_found`.
- `server.js`: comando Python ejecutado y resumen de stats.
- `apply_book_preview_to_engine.py`: reporte de `not_found`/`ambiguous` y muestras.

## not_found (interpretacion oficial)
- `not_found` no implica fallo de escritura.
- `not_found` significa que la fila preview no encontro match de engine por clave de matching.
- Matching principal: `Source Page` + `POS`.
- Fallback cuando falta `POS`: `Source Page` + `PN`, solo dentro de la misma pagina y solo si el match es unico.
- Desempate secundario del matching por `POS`: `PN`.

## Sistema de diagnostico en modal
- El panel de no-match del modal muestra:
	- metricas de no encontrados;
	- tabla de filas no match;
	- filtro por motivo;
	- busqueda libre;
	- export CSV.

## Riesgos / problemas conocidos
- Filas ambiguas se omiten (`ambiguous`), no se fuerzan.
- Si no hay match por `(Source Page, POS)` ni por fallback `(Source Page, PN)` cuando falta `POS`, se contabiliza `not_found`.

## Estado operativo actual
- Flujo apply oficial estabilizado.
- Endpoint oficial unificado en backend Express.
- Diagnostico activo y visible en modal + logs.
- Casos `not_found` aceptados temporalmente.
- Ambiguedades pendientes de revision futura.

## TODO pendiente
- Incluir reporte de ambiguedades en UI con enlace directo a ID de engine.

## Ejemplo real
- En backend, `POST /api/pdf-preview/apply-to-engine` parsea stdout del script para devolver `rows_changed`, `fields_changed`, `ambiguous`, `not_found` y el contador `matched_page_pn_no_pos` para filas resueltas por fallback de misma pagina + PN.
