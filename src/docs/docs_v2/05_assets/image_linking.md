# Image Linking

## Objetivo
Documentar como se enlazan imagenes de articulo para QA/export.

## Inputs
- Campos `filename_foto`, `ruta_foto`.
- Inventarios de archivos en carpetas de imagenes del proyecto.

## Outputs
- Referencias visuales por registro y consolidacion para export.

## Scripts implicados
- `depuracion_json.py` (construye `exp_imagenes` con prioridad foto/esquema).
- `js/qa_imagenes*.js` (auditoria y resolucion visual).
- `js/export-wordpress.js` (propaga `ruta_foto`, `exp_imagenes`).

## Endpoints implicados
- `POST /save-json` para persistencia manual por celda.

## Botones UI relacionados
- Edicion de campos de imagen en tablas QA.
- Flujo export con `expBtnRunWordpress`.

## Campos afectados
- `filename_foto`, `ruta_foto`, `exp_imagenes`.

## Flujo paso a paso
1. Se establece `ruta_foto` por registro.
2. `depuracion_json.py` compone `exp_imagenes` (foto + esquema_pos si existe).
3. Export compacta por PN y lleva `ruta_foto`/`exp_imagenes` a salida.

## Riesgos / problemas conocidos
- Rutas no normalizadas pueden romper resolucion en navegador/export.

## TODO pendiente
- Validar existencia fisica de `ruta_foto` como check obligatorio previo a export.

## Ejemplo real
- `depuracion_json.py`: si hay `ruta_foto` y `ruta_esquemas_pos`, `exp_imagenes` queda como lista separada por coma.
