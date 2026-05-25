# WordPress Export

## Objetivo
Documentar extremo a extremo la ejecucion de export oficial QA-only.

## Inputs
- Todos los `engine_*.json`.
- Reglas QA (`qa_revision_estado`, `qa_revision_accion`).

## Outputs
- Archivos de export y trazas en `data/05-wordpress/`.

## Scripts implicados
- `scripts/export_wordpress_milu.js`.
- `js/exportacion.js`.

## Endpoints implicados
- `POST /export/run-wordpress`
- `GET /export/files`
- `GET /export/file`
- `GET /export/download`
- `GET /export/status`
- `GET /export/wordpress-decisions`

## Botones UI relacionados
- `expBtnRunWordpress`.
- `expBtnRefresh`.

## Campos afectados
- Campos de salida WordPress normalizados desde `_final`, QA, SUST y assets.

## Flujo paso a paso
1. UI verifica backend (`GET /health`).
2. Usuario lanza `POST /export/run-wordpress`.
3. Backend ejecuta `scripts/export_wordpress_milu.js` bajo lock.
4. UI carga decisiones QA por PN y lista de archivos generados.
5. Usuario inspecciona preview/descarga de artefactos.

## Riesgos / problemas conocidos
- Endpoints legacy de export estan desactivados con 410 en flujo oficial.
- Si faltan estados QA coherentes, PN termina en pending/discard.

## TODO pendiente
- Publicar validacion automatica de contenido export antes de descarga.

## Ejemplo real
- `exportacion.html` muestra banner: la decision de export se toma solo con `qa_revision_estado + qa_revision_accion` a nivel PN.

