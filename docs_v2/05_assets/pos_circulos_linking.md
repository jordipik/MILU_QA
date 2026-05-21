# POS Circulos Linking

## Objetivo
Documentar el enlace de esquemas por posicion (circulos) y su validacion.

## Inputs
- `ruta_esquemas_pos`, `esquemas_circulos`, `exp_imagenes`, `engine_model`.

## Outputs
- Candidatos de imagen en `esquemas_pos_circulos/<BOOK>-POS/`.
- Estado de cobertura visual para QA.

## Scripts implicados
- `js/schemas.js` (`buildSchemaPosImageCandidates`, `getPosSchemasForRow`).
- backend `GET /api/esquemas-pos-index` para indice de archivos.

## Endpoints implicados
- `GET /api/esquemas-pos-index`.

## Botones UI relacionados
- Panel esquemas POS en QA.

## Campos afectados
- `ruta_esquemas_pos`, `esquemas_circulos`, `esquemas_circulos_all`, `exp_imagenes`.

## Flujo paso a paso
1. UI extrae tokens de ruta y nombres de esquema POS.
2. Genera candidatos de ruta con prefijo de libro y extensiones.
3. Cruza con indice local para marcar cobertura (`ok`, `missing`, `empty`).

## Riesgos / problemas conocidos
- `exp_imagenes` puede mezclar rutas publicadas y rutas locales, complicando validacion.

## TODO pendiente
- Homogeneizar formato de `ruta_esquemas_pos` en todos los engines.

## Ejemplo real
- `getPosSchemasForRow(row)` fusiona tokens de `ruta_esquemas_pos`, `exp_imagenes` y `esquemas_circulos`.
