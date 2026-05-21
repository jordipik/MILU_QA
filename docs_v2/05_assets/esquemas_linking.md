# Esquemas Linking

## Objetivo
Describir el enlace de esquemas generales por libro/pagina.

## Inputs
- `esquemas` en registros.
- libro (`engine_model`) y pagina (`Source Page`).

## Outputs
- Candidatos de URL de esquema en `esquemas/<BOOK>_esquemas/` para UI.

## Scripts implicados
- `js/schemas.js` (`buildSchemaImageCandidates`, `getSchemasForBookPage`, `updateSchemasInline`).

## Endpoints implicados
- No endpoint dedicado requerido para resolver paths locales de esquema general.

## Botones UI relacionados
- Panel esquemas en `qa_milu.html`.

## Campos afectados
- `esquemas`.

## Flujo paso a paso
1. UI obtiene `esquemas` por libro+pagina.
2. Genera candidatos con extensiones (`png`, `webp`, `jpg`, `jpeg`).
3. Intenta cargar y descarta rutas fallidas en memoria (`missingSchemaImagePaths`).

## Riesgos / problemas conocidos
- Diferencias de nomenclatura de archivo requieren fallback por prefijo del libro.

## TODO pendiente
- Persistir indice de esquemas para evitar fallback repetitivo en cliente.

## Ejemplo real
- `buildSchemaImageCandidates(book, token)` agrega variante `<BOOK>-<token>` cuando el token no trae prefijo.
