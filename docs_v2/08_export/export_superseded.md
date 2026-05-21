# Export Superseded

## Objetivo
Documentar generacion de salida para piezas superseded.

## Inputs
- Registros por PN validados QA.
- Campo de jerarquia `sust_hierarchie`.

## Outputs
- Filas clasificadas como superseded dentro de salida WordPress.

## Scripts implicados
- `js/export-wordpress.js` (regla `getExportType`).
- `scripts/export_wordpress_milu.js`.

## Endpoints implicados
- `POST /export/run-wordpress`

## Botones UI relacionados
- `expBtnRunWordpress`.

## Campos afectados
- `SUST_TIPO`, `new_pn_relacionado`, `old_pn_relacionados`, `EN_EXCEL_SUSTITUCION`.

## Flujo paso a paso
1. Se evalua tipo export por PN.
2. Si `sust_hierarchie === 'Superseded'`, clasifica como superseded.
3. Se completan relaciones new/old PN y se exporta.

## Riesgos / problemas conocidos
- `sust_status` no debe usarse para clasificacion superseded/new.

## TODO pendiente
- Añadir validaciones de consistencia cruzada entre `sust_hierarchie` y listas de sustitucion.

## Ejemplo real
- `getExportType(row)` delega en `getExportPreviewType` y usa `sust_hierarchie` como criterio decisivo.
