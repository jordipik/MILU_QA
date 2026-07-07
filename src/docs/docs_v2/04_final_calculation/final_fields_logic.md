# Final Fields Logic

## Objetivo
Congelar FINAL_FIELDS_V1 para campos `_final` en MILU v1 y distinguir la ruta oficial de las rutas legacy.

## Inputs
- Campos base (`POS`, `PART NO.`, `DESIGNATION`, etc.).
- Campos `_pdf`.
- Campos GESA y SUST disponibles en engine.

## Outputs
- Campos finales consistentes para QA y export.

## Scripts implicados
- OFFICIAL: `POST /copy-pdf-to-final-all-books`.
- LEGACY: `copy_gesa_fields_to_final.py`.
- OFFLINE OFFICIAL: `depuracion_json.py`.

## Endpoints implicados
- OFFICIAL: `POST /copy-pdf-to-final-all-books`.
- LEGACY: `POST /calculate-final-fields`.

## Botones UI relacionados
- `recomputeCalculateFinalBtn`.

## Campos afectados
- `pos_final`, `pn_final`, `designation_final`, `model_type_final`, `qty_final`, `units_final`, `weight_final`, `fn_final`, `measure_final`, `fg_fgs_final`, `bom_final`, `gesa_final`, `nsn_final`, `normalizado_final`, `norma_final`, `sust_status_final`, `hierarchie_final`, `new_pn_final`, `subst_pnlist_final`.

## Estado de rutas
- OFFICIAL: `POST /copy-pdf-to-final-all-books` aplica FINAL_FIELDS_V1 con prioridad simple `A / B` por campo.
- LEGACY: `POST /calculate-final-fields` ejecuta `copy_gesa_fields_to_final.py` y no define el contrato oficial vigente.

## Tabla resumen

| final_field | source_1 | source_2 | status |
| --- | --- | --- | --- |
| `pos_final` | `pos_pdf` | `POS` | OK |
| `pn_final` | `pn_pdf` | `PART NO.` | OK |
| `designation_final` | `designation_gesa`* (Comprobacion espacios) | `designation_pdf` | OK |
| `model_type_final` | `model_type_pdf` | `MODEL/TYPE` | OK |
| `qty_final` | `qty_pdf` | `QTY` | OK |
| `units_final` | `units_pdf` | `UNITS` | OK |
| `weight_final` | `weight_gesa + units` | `weight_pdf` | OK |
| `fn_final` | `fn_pdf` |  | OK |
| `measure_final` | `dimensions_gesa` | `measure_pdf` | OK |
| `fg_fgs_final` | `fg_fgs_pdf` | `FG/FGS` | OK |
| `bom_final` | `bom_pdf` | `BOM-No.` | OK |
| `gesa_final` | `gesa` |  | OK |
| `nsn_final` | `nsn` |  | OK |
| `normalizado_final` | `normalizado` |  | OK |
| `norma_final` | `norma` | `norma_pdf` | OK |
| `sust_status_final` | `sust_status` |  | OK |
| `hierarchie_final` | `sust_hierarchie` |  | OK |
| `new_pn_final` | `sust_new_part_number` |  | OK |
| `subst_pnlist_final` | `sust_superseded_list` |  | OK |

\* Comprobacion espacios: si `designation_gesa` y `designation_pdf` son equivalentes al normalizar espacios (incluyendo espacios insertados dentro de palabra), se prioriza `designation_pdf`.
Ejemplo real: `PN=5240110159` (`ID=1102073`, `Engine=12V4000M40A`), `designation_gesa="RING CYL LINER CARBO N REMOVAL"` vs `designation_pdf="RING CYL LINER CARBON REMOVAL"`.

## Auditoria de diferencias corregidas
- El endpoint oficial ya no depende de `gesa=SI` para decidir prioridades.
- `weight_final` usa `weight_gesa + " " + units` cuando `weight_gesa` existe; si no, usa `weight_pdf`.

- `gesa_final`, `sust_status_final`, `hierarchie_final`, `new_pn_final` y `subst_pnlist_final` salen ahora de `gesa`/`sust_*`, no de `_pdf`.
- Los fallbacks a campos base (`POS`, `PART NO.`, `MODEL/TYPE`, `QTY`, `UNITS`, `FG/FGS`, `BOM-No.`) quedan fijados en la ruta oficial.

## Flujo paso a paso
1. Backend recorre filas de los engines solicitados.
2. Para cada `final_field`, evalua `source_1` y `source_2` en orden.
3. Usa el primer valor no vacio sin inventar valores ni cambiar casing.
4. Escribe solo cuando cambia el valor final efectivo.
5. Registra logs minimos por archivo: fuente ganadora, IDs modificados y campos modificados.
6. Si `backup=true`, conserva copia de seguridad.
7. En proceso offline, `depuracion_json.py` sigue siendo el paso de consistencia global, pero no redefine FINAL_FIELDS_V1 runtime.

## Riesgos / problemas conocidos
- Coexisten ruta oficial, ruta legacy y proceso offline; no deben mezclarse sin criterio.
- Campo legacy `measurement_final` aun aparece en algunos registros historicos.

## TODO pendiente
- Retirar o bloquear la ruta legacy cuando deje de ser necesaria.

## Ejemplo real
- En `engine_12V4000M40A.json`, `Source Page = 13`, la auditoria muestra 18/18 filas con diferencias respecto a la logica anterior.
- Ejemplos reales corregidos por FINAL_FIELDS_V1:
   - `ID=1100400`: `weight_final` debe ser `0.125 KGM` desde `weight_gesa + units`.
   - `ID=1100400`: `hierarchie_final`, `new_pn_final` y `subst_pnlist_final` deben salir de `sust_*`.
   - `ID=1100001`: `fg_fgs_final`, `bom_final`, `gesa_final` y `normalizado_final` deben poblarse desde `fg_fgs_pdf`, `bom_pdf`, `gesa` y `normalizado`.
