# Export NEW

## Objetivo
Documentar generacion de salida NEW para WordPress.

## Inputs
- Registros por PN en `engine_*.json` con QA y SUST.

## Outputs
- Dataset NEW dentro de artefactos `milu_wp_*` en `data/05-wordpress/`.

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

### Regla oficial de exp_imagenes
En salida NEW, `exp_imagenes` sigue esta prioridad:
1. `filename_foto`
2. `esquemas_circulos`
3. `esquemas` (solo fallback si no hay imagen previa)
4. `sin_imagen.jpeg` (solo fallback final)

La construccion se realiza de forma dinamica en `scripts/export_wordpress_milu.js` y no depende de `ruta_esquemas_pos` ni de `esquemas_circulos_all`.

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

