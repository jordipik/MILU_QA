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

## Regla oficial de exp_imagenes
El campo `exp_imagenes` en Superseded usa la misma regla oficial del export WordPress:
1. `filename_foto`
2. `esquemas_circulos`
3. `esquemas` (solo si aun no hay imagen)
4. `sin_imagen.jpeg` (si sigue vacio)

No se usa `ruta_esquemas_pos` ni `esquemas_circulos_all` para construir `exp_imagenes`.

## Flujo paso a paso
1. Se evalua tipo export por PN.
2. Si `sust_hierarchie === 'Superseded'`, clasifica como superseded.
3. Se completan relaciones new/old PN y se exporta.

## Riesgos / problemas conocidos
- `sust_status` no debe usarse para clasificacion superseded/new.

## Generación de New sintético desde Superseded real (orphan)

Cuando un Superseded real tiene `new_pn_final` pero ese PN no existe en los engines, se genera automáticamente un New sintético (`orphan_superseded_new`). Ver detalles completos en [export_new.md](export_new.md) y [wordpress_export.md](wordpress_export.md).

Puntos clave desde la perspectiva Superseded:
- La herencia de datos es unidireccional: del Superseded al New sintético.
- La lista `sust_superseded_list` / `subst_pnlist_final` del Superseded se propaga íntegra al sintético como `old_pn_relacionados`.
- Si el `new_pn_final` del Superseded coincide (exacto) con un PN ya existente en los engines, **no** se genera sintético (el New real prevalece).
- Falsos orphans por sufijo de variante (ej. `X00E50200664/76` vs `X00E50200664/76 MPU23-04`) deben revisarse manualmente o ajustando la normalización de PN en `allRealPnKeys`.

## TODO pendiente
- Añadir validaciones de consistencia cruzada entre `sust_hierarchie` y listas de sustitucion.

## Ejemplo real
- `getExportType(row)` delega en `getExportPreviewType` y usa `sust_hierarchie` como criterio decisivo.
