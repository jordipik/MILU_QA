# SUST Import

## Objetivo
Documentar el uso de datos de sustitucion en MILU v1.

## Inputs
- Campos de sustitucion presentes en `engine_*.json`: `sust_status`, `sust_hierarchie`, `sust_new_part_number`, `sust_superseded_list`.

## Outputs
- Clasificacion de export NEW/SUPERSEDED y campos derivados en export WordPress.

## Scripts implicados
- `js/export-wordpress.js` (clasificacion por `sust_hierarchie`).
- `scripts/export_wordpress_milu.js`.

## Endpoints implicados
- `POST /export/run-wordpress`.
- `GET /export/wordpress-decisions`.

## Botones UI relacionados
- `expBtnRunWordpress`.

## Campos afectados
- `sust_hierarchie`, `sust_new_part_number`, `sust_superseded_list`, `SUST_TIPO`, `new_pn_relacionado`, `old_pn_relacionados`.

## Flujo paso a paso
1. Los campos `sust_*` se leen por registro desde `engine_*.json`.
2. Export clasifica por regla explicita: `sust_hierarchie === 'Superseded'`.
3. Se construyen campos de relacion new/old para salida CSV/JSON.

## Riesgos / problemas conocidos
- No se detecto script runtime dedicado para importar `EXCEL_SUSTITUCION*.json` en este repo.
- Mezcla historica de campos (`hierarchie_final`, `sust_hierarchie`, aliases de export) puede causar confusiones.

## TODO pendiente
- Definir transformacion oficial desde fuente SUST externa a campos `sust_*` en engine.

## Ejemplo real
- En `js/export-wordpress.js`, comentario explicito: no usar `sust_status` para clasificacion NEW/SUPERSEDED; usar solo `sust_hierarchie`.
