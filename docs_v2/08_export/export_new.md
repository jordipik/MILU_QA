# Export NEW

## Objetivo
Documentar generacion de salida NEW para WordPress.

## Inputs
- Registros por PN en `engine_*.json` con QA y SUST.

## Outputs
- Dataset NEW dentro de artefactos `milu_wp_*` en `data/output/wordpress/`.

## Scripts implicados
- `scripts/export_wordpress_milu.js`.
- `js/export-wordpress.js` (helpers de preview/export frontend).

## Endpoints implicados
- `POST /export/run-wordpress`
- `GET /export/wordpress-decisions`

## Botones UI relacionados
- `expBtnRunWordpress`.

## Campos afectados
- Campos WordPress de salida (`pn`, `designation`, `measurement`, `weight`, `exp_motor`, `exp_categorias`, `ruta_foto`, `exp_imagenes`, etc.).

## Flujo paso a paso
1. Agrupacion por PN (`pn_final`).
2. Seleccion de filas QA importables (`ok/importar`).
3. Compactacion de campos por PN y construccion de fila export.
4. Escritura de archivos JSON/CSV en carpeta de salida.

## Riesgos / problemas conocidos
- Si no hay ningun `ok/importar`, el PN pasa a pending/discard segun estado.

## TODO pendiente
- Publicar contrato CSV NEW versionado para integracion externa.

## Ejemplo real
- `scripts/export_wordpress_milu.js` crea resumen `import/pending/discard` tras cada corrida.
