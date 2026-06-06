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

## Regla oficial de exp_imagenes
Prioridad obligatoria en `scripts/export_wordpress_milu.js`:
1. `filename_foto`
2. `esquemas_circulos`
3. `esquemas` (solo si aun no hay ninguna imagen)
4. `sin_imagen.jpeg` (solo si sigue vacio)

Notas operativas:
- `exp_imagenes` se construye dinamicamente en export.
- Para esta construccion solo se usan `filename_foto`, `esquemas_circulos` y `esquemas`.
- No se reutiliza el valor previo de `exp_imagenes` del engine.
- No se usan `ruta_esquemas_pos` ni `esquemas_circulos_all`.

## Flujo paso a paso
1. UI verifica backend (`GET /health`).
2. Usuario lanza `POST /export/run-wordpress`.
3. Backend ejecuta `scripts/export_wordpress_milu.js` bajo lock.
4. UI carga decisiones QA por PN y lista de archivos generados.
5. Usuario inspecciona preview/descarga de artefactos.

## Riesgos / problemas conocidos
- Endpoints legacy de export estan desactivados con 410 en flujo oficial.
- Si faltan estados QA coherentes, PN termina en pending/discard.

## Regla oficial orphan_superseded_new

Cuando un registro real es `Superseded` y su `new_pn_final` no existe como PN propio en ningún `engine_*.json`, el algoritmo crea un registro sintético NEW mínimo a partir del Superseded.

### Criterio de detección orphan
- Se construye `allRealPnKeys`: conjunto de todos los `pn_final` exactos de todos los engines.
- Para cada fila Superseded real (`hierarchie_final = Superseded`) con `new_pn_final` relleno:
  - Si `key(new_pn_final)` **no está** en `allRealPnKeys` → se genera sintético (`orphan_superseded_new`).
  - Si **sí está** → no se genera (el New real ya existe).
- La comprobación es por coincidencia exacta normalizada (`toLowerCase().trim()`).

### Caso conocido: falso orphan por sufijo de variante
Si el PN real tiene un sufijo adicional (espacio, `/`, `-` + variante), el match exacto falla y se genera un sintético innecesario. Ejemplo detectado:
- `X00E50200664/76` (orphan) vs `X00E50200664/76 MPU23-04` (real en engine) — resuelto manualmente.
- `X59418100009` (orphan) vs `X59418100009/87` (real en engine) — identificado como falso orphan.
Ver script de auditoría: `node -e "..."` en el historial de sesión.

### Marcado visual de orphans
Desde 2026-06-06, todos los registros `synthetic_source = orphan_superseded_new` llevan `*` al final de la `designation` (ej. `STRAP 75 X20 *`). Esto permite identificar en la UI y en el export que la información de ese New ha sido copiada/inferida del registro Superseded padre y **no** procede de un registro propio en el manual.

## TODO pendiente
- Publicar validacion automatica de contenido export antes de descarga.

## Ejemplo real
- `exportacion.html` muestra banner: la decision de export se toma solo con `qa_revision_estado + qa_revision_accion` a nivel PN.

