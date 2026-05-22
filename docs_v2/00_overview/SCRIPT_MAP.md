# SCRIPT MAP

## Objetivo
Inventario operativo de scripts y endpoints usados por el flujo MILU v1.

## Inputs
- `engine_*.json`.
- `book_preview_*.json`.
- Peticiones UI desde `import_pdf.html`, `analista_02.html` y `exportacion.html`.

## Outputs
- JSON de motores actualizados.
- Artefactos de export en `data/output/wordpress/`.
- Persistencia de revisiones en `qa_revision_server_data.json`.

## Scripts implicados
- Ver tabla principal.

## Endpoints implicados
- Ver tabla principal para endpoints HTTP.

## Botones UI relacionados
- `extractWholeBookBtn`, `extractAllBooksBtn`, `recomputeCopyBookBtn`, `recomputeCalculateFinalBtn`, `recomputeRunBtn`, `recomputeRevisionStatusBtn`, `expBtnRunWordpress`.

## Campos afectados
- `_pdf`, `_final`, `_error`, QA, campos de export y de imagenes.

## Flujo paso a paso
1. UI dispara endpoint o script.
2. Backend valida payload y archivo.
3. Script actualiza JSON en disco o genera export.
4. UI recarga estado y resumen.

## Riesgos / problemas conocidos
- Scripts con superposicion funcional (`copy_gesa_fields_to_final.py` vs `copy-pdf-to-final-all-books` vs `depuracion_json.py`).
- Dependencia de archivos externos no versionados para algunos pasos historicos.

## TODO pendiente
- Retirar rutas legacy cuando ya no haya consumidores activos.

## Ejemplo real
- `POST /api/pdf-preview/apply-to-engine` ejecuta `apply_book_preview_to_engine.py` o `apply_all_book_previews.py` con `--write --overwrite`.

## Notas operativas vigentes
- IMPORTAR PDF en modal se dispara desde `recomputeCopyBookBtn` -> `runApplyBookPreviewToEngines()` (`js/analista-02.js`).
- Flujo oficial IMPORTAR PDF usa solo `POST /api/pdf-preview/apply-to-engine` para aplicar preview a engine.
- Para este flujo, `POST /copy-pdf-to-pdf-all-books` y `POST /recompute-pdf-auto` quedan marcados como legacy/alternativo y no oficiales.
- Diagnostico activo en `analista-02.js`, `server.js` y `apply_book_preview_to_engine.py` (boton, engine, endpoint, comando Python, `rows_changed`, `fields_changed`, `ambiguous`, `not_found`).
- En modal de errores, selector `Libro` admite libro individual o `Todos los libros`; al elegir `Todos los libros`, el scope pasa a `all` y el boton muestra `ERRORES TODOS`.

| Script | Tipo | Entrada | Salida | Modifica | Estado |
| ------ | ---- | ------- | ------ | -------- | ------ |
| `js/analista-02.js::runApplyBookPreviewToEngines` | UI handler | click `recomputeCopyBookBtn`, selector libro | `fetch` a endpoint oficial + logs de diagnostico | no escribe directo; orquesta apply backend | Activo oficial |
| `apply_book_preview_to_engine.py` | Python CLI | `book_preview_<MODEL>.json`, `engine_<MODEL>.json` | reporte en stdout y cambios en engine | `*_pdf` en `engine_*.json` | Activo oficial |
| `apply_all_book_previews.py` | Python CLI | carpeta `json_originales/book_preview_*.json` + `engine_*.json` | ejecucion por lote de apply unitario | `*_pdf` en multiples engines | Activo oficial |
| `POST /api/pdf-preview/apply-to-engine` | Endpoint Express | JSON opcional `{engine}` | JSON `stats` + `warnings` | dispara apply Python oficial | Activo oficial |
| `recompute_engine_errors.js` | Node CLI/modulo | `engine_*.json` (+ scope/id flags) | resumen por archivo/libro | `*_error`, `total_error`, `has_error`, QA opcional | Activo oficial |
| `POST /recompute-qa-errors` | Endpoint Express | `scope`, `file`, `id`, flags | resultado de recompute | `*_error` y QA segun flags | Activo oficial |
| `copy_gesa_fields_to_final.py` | Python CLI | `engine_*.json` | resumen de registros/campos | subset de `*_final` si `gesa=SI` | LEGACY |
| `POST /calculate-final-fields` | Endpoint Express | sin payload relevante | ejecuta script Python | usa `copy_gesa_fields_to_final.py` | LEGACY |
| `POST /copy-pdf-to-final-all-books` | Endpoint Express | files opcionales + backup | totales por lote | `*_final` con FINAL_FIELDS_V1 y prioridad simple por campo | OFFICIAL |
| `depuracion_json.py` | Python offline | `engine_*.json` | engines normalizados | recalcula finales, errores, `exp_imagenes` | Proceso oficial offline |
| `POST /recalculate-revision-status` | Endpoint Express | vacio | totales procesados | `qa_revision_estado`, `qa_revision_accion` | Activo oficial |
| `GET/POST /qa_revision_sync.php` | Endpoint Express | snapshot revision | payload normalizado | `qa_revision_server_data.json` | Activo oficial |
| `POST /apply-revision-to-engines` | Endpoint Express | payload revision | resumen de aplicacion | aplica revision masiva a engines | Activo oficial |
| `scripts/export_wordpress_milu.js` | Node script | todos los `engine_*.json` | JSON/CSV en `data/output/wordpress/` | genera salidas de export | Activo oficial |
| `POST /export/run-wordpress` | Endpoint Express | vacio | resultado + resumen import/pending/discard | ejecuta script export | Activo oficial |
| `POST /copy-pdf-to-pdf-all-books` | Endpoint Express | writePdf/backup/clear flags | resultado batch `_pdf` | copia `_pdf` por backend batch previo | Legacy (no usado por IMPORTAR PDF actual) |
| `POST /recompute-pdf-auto` | Endpoint Express | n/a | 410 legacy | no aplica | Legacy desactivado (no usado por IMPORTAR PDF actual) |
| `POST /recompute-pdf-auto-visual` | Endpoint Express | file/id/dryRun | resumen de copia visual | actualiza `_pdf` via comparacion visual | Activo alternativo |
| Scripts R | R | n/a | n/a | n/a | No detectados en repo |
