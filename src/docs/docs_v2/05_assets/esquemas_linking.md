# Esquemas Linking

## Objetivo
Describir el enlace de esquemas generales ya persistidos en `esquemas`.

## Inputs
- `esquemas` en registros.
- libro (`engine_model`) para resolver prefijos/rutas.

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
1. UI obtiene tokens ya persistidos en `esquemas`.
2. Genera candidatos con extensiones (`png`, `webp`, `jpg`, `jpeg`).
3. Intenta cargar y descarta rutas fallidas en memoria (`missingSchemaImagePaths`).

## Regla funcional
- El linking no recalcula reglas de descubrimiento de esquema.
- La pertenencia de `esquemas` viene del flujo BOM (`bom_final`, `BOM-No.`, `bom_pdf`) y bloque BOM continuo.

## Riesgos / problemas conocidos
- Diferencias de nomenclatura de archivo requieren fallback por prefijo del libro.

## TODO pendiente
- Persistir indice de esquemas para evitar fallback repetitivo en cliente.

## Ejemplo real
- `buildSchemaImageCandidates(book, token)` agrega variante `<BOOK>-<token>` cuando el token no trae prefijo.
