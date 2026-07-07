# Auditoria de columnas: WordPress vs New_v506

Fecha: 2026-06-04

## Alcance

- Referencia New_v506 localizada en `MILU_New_v506.json`.
- Export WordPress auditado en `data/05-wordpress/milu_wp_new_import.csv`.
- Generador auditado y corregido en `scripts/export_wordpress_milu.js`.
- Flujo backend verificado en `server.js` (endpoint `/export/run-wordpress`).
- Vista frontend revisada en `js/export-wordpress.js` (constante `QA_EXPORT_FIELDS`).

## Auditoria inicial (antes de correccion)

Comparacion realizada solo con cabeceras (orden exacto):

- Columnas New_v506: 30
- Columnas export actual: 39
- Columnas coincidentes en misma posicion: 0
- Columnas faltantes en export actual: 22
- Columnas extra en export actual: 31
- Columnas con nombre equivalente distinto: 1
- Diferencias de orden detectadas: 7

### Columnas coincidentes (por nombre, no por posicion)

- engine
- model_type
- fg_code
- fg_description
- fg_code_description
- exp_categorias
- exp_imagenes

### Columnas faltantes en export actual (auditoria inicial)

- Id
- fecha_version
- POS
- type
- pn
- nsn
- GESA_NORM
- GESA_NORMALIZADO
- weight
- weight_txt
- measurement
- TIPOARTICULO
- PAG
- BOM_no
- esquema_general
- exp_motor
- atributo
- SUST_TIPO
- new_pn_relacionado
- old_pn_relacionados
- EN_EXCEL_SUSTITUCION
- ruta_foto

### Columnas extra en export actual (auditoria inicial)

- sku
- pn_final
- PART NO.
- designation_final
- sust_hierarchie
- hierarchie_final
- sust_new_part_number
- new_pn_final
- sust_superseded_list
- subst_pnlist_final
- measurement_final
- weight_final
- synthetic_source
- data_quality
- synthetic_parent_id
- synthetic_parent_pn
- synthetic_parent_engine
- synthetic_child_id
- synthetic_child_pn
- synthetic_child_engine
- dedupe_trace
- decision
- reason
- qa_validated
- occurrences
- engines
- source_ids
- source_pages
- qa_summary_json
- import_decision
- import_reason

### Columnas con posible nombre equivalente pero distinto (auditoria inicial)

- designation -> DESIGNATION

### Diferencias de orden (auditoria inicial)

- engine: orden New_v506 5, orden export 4
- model_type: orden New_v506 6, orden export 5
- fg_code: orden New_v506 12, orden export 6
- fg_description: orden New_v506 13, orden export 7
- fg_code_description: orden New_v506 14, orden export 8
- exp_categorias: orden New_v506 23, orden export 9
- exp_imagenes: orden New_v506 30, orden export 10

## Correccion aplicada

Se aplico un cambio minimo en el exportador para alinear solo el esquema de salida CSV con New_v506, sin cambiar reglas de negocio QA, dedupe ni sintesis:

1. Se definio un esquema canonico `NEW_V506_HEADERS` en `scripts/export_wordpress_milu.js`.
2. El CSV ahora se escribe exclusivamente con esas 30 columnas y en ese orden exacto.
3. Se completo el mapeo de datos para columnas New_v506 faltantes, con fallback a `""` cuando no hay fuente.
4. Se mantuvieron campos internos del pipeline en los objetos de trabajo para no romper logica existente (dedupe, trazas, reportes), pero ya no salen en cabecera CSV.

## Auditoria final (despues de correccion)

Validacion obligatoria ejecutada tras regenerar export:

- Columnas New_v506: 30
- Columnas export actual: 30
- Columnas faltantes: 0
- Columnas extra: 0
- Orden diferente: 0
- Nombre distinto equivalente: 0

Resultado: la cabecera de `milu_wp_new_import.csv` es identica a New_v506.

## Matriz de columnas (estado final)

| Orden New_v506 | Columna New_v506 | Existe en export actual | Columna actual equivalente | Estado | Observaciones |
|---:|---|---|---|---|---|
| 1 | Id | Si | Id | OK | Se toma por frecuencia de `ID`/`rebuild_legacy_engine_id` agregados por PN. |
| 2 | fecha_version | Si | fecha_version | OK | Se toma por frecuencia desde filas fuente; vacio si no existe. |
| 3 | POS | Si | POS | OK | Se toma por frecuencia de `POS`/`pos_final`; vacio si no existe. |
| 4 | designation | Si | designation | OK | Deriva de `designation_final`/`designation_gesa`/`DESIGNATION` por frecuencia. |
| 5 | engine | Si | engine | OK | Deriva del agregado por PN (`engine_model`/`model`/`engine`/archivo). |
| 6 | model_type | Si | model_type | OK | Deriva via normalizacion de motor (`deriveModelTypeToken`). |
| 7 | type | Si | type | OK | Toma `type` por frecuencia; vacio si no existe. |
| 8 | pn | Si | pn | OK | PN final del grupo (sku consolidado). |
| 9 | nsn | Si | nsn | OK | Toma `nsn` por frecuencia; vacio si no existe. |
| 10 | GESA_NORM | Si | GESA_NORM | OK | Toma `GESA_NORM` por frecuencia; vacio si no existe. |
| 11 | GESA_NORMALIZADO | Si | GESA_NORMALIZADO | OK | Toma `GESA_NORMALIZADO` por frecuencia; vacio si no existe. |
| 12 | fg_code | Si | fg_code | OK | Normaliza `fg_code`/`fg_fgs_final`/`FG/FGS`. |
| 13 | fg_description | Si | fg_description | OK | Lookup en `EXCEL_FG-FGS.json`; fallback vacio. |
| 14 | fg_code_description | Si | fg_code_description | OK | Concatena `fg_code + fg_description`; fallback vacio. |
| 15 | weight | Si | weight | OK | Deriva por frecuencia desde `weight_final`/`weight_gesa`/`WEIGHT`. |
| 16 | weight_txt | Si | weight_txt | OK | Usa `weight_txt` por frecuencia; fallback `weight`. |
| 17 | measurement | Si | measurement | OK | Deriva por frecuencia desde `measure_final`/`measurement_final`/`dimensions_gesa`/`MEASUREMENT / STANDARD`. |
| 18 | TIPOARTICULO | Si | TIPOARTICULO | OK | Toma `TIPOARTICULO` por frecuencia; vacio si no existe. |
| 19 | PAG | Si | PAG | OK | Toma `PAG` por frecuencia; fallback `Source Page`/`rebuild_source_page`. |
| 20 | BOM_no | Si | BOM_no | OK | Toma `BOM_no` por frecuencia; fallback `BOM-No.`. |
| 21 | esquema_general | Si | esquema_general | OK | Toma `esquema_general` por frecuencia; vacio si no existe. |
| 22 | exp_motor | Si | exp_motor | OK | Toma `exp_motor` por frecuencia; fallback `engine`. |
| 23 | exp_categorias | Si | exp_categorias | OK | Derivado por modelo corto y FG (`modelo-FG`), join unico. |
| 24 | atributo | Si | atributo | OK | Toma `atributo` por frecuencia; vacio si no existe. |
| 25 | SUST_TIPO | Si | SUST_TIPO | OK | Se rellena con jerarquia consolidada (`New`/`Superseded`). |
| 26 | new_pn_relacionado | Si | new_pn_relacionado | OK | Deriva de `new_pn_final`/`sust_new_part_number`/`New Part Number`. |
| 27 | old_pn_relacionados | Si | old_pn_relacionados | OK | Deriva de `subst_pnlist_final`/`sust_superseded_list`. |
| 28 | EN_EXCEL_SUSTITUCION | Si | EN_EXCEL_SUSTITUCION | OK | Toma `EN_EXCEL_SUSTITUCION` por frecuencia; vacio si no existe. |
| 29 | ruta_foto | Si | ruta_foto | OK | Toma `ruta_foto` por frecuencia; fallback `filename_foto`. |
| 30 | exp_imagenes | Si | exp_imagenes | OK | Deriva por join unico de `filename_foto` y `ruta_esquemas_pos`; synthetic usa fallback sin_imagen. |

## Mapa de generacion de columnas

| Columna WordPress | Fuente | Transformacion | Fallback | Estado |
|---|---|---|---|---|
| Id | `ID`, `rebuild_legacy_engine_id` | `pickMostFrequent` sobre filas del PN | `""` | OK |
| fecha_version | `fecha_version` | `pickMostFrequent` | `""` | OK |
| POS | `POS`, `pos_final` | `pickMostFrequent` | `""` | OK |
| designation | `designation_final`, `designation_gesa`, `DESIGNATION` | `pickMostFrequent` | `""` | OK |
| engine | `engine_model`, `model`, `engine`, `__engine_file` | normalizacion para synthetic cuando aplica | `""` | OK |
| model_type | `engine_model`, `engine`, `__engine_file`, `model`, `model_type_final` | `deriveModelTypeToken` + normalizacion | `""` | OK |
| type | `type` | `pickMostFrequent` | `""` | OK |
| pn | `pn_final`/`pn` consolidado | PN de grupo (`sku`) | `""` | OK |
| nsn | `nsn` | `pickMostFrequent` | `""` | OK |
| GESA_NORM | `GESA_NORM` | `pickMostFrequent` | `""` | OK |
| GESA_NORMALIZADO | `GESA_NORMALIZADO` | `pickMostFrequent` | `""` | OK |
| fg_code | `fg_code`, `fg_fgs_final`, `FG/FGS` | `extractPrimaryFgCode` + `normalizeFgCode` | `""` | OK |
| fg_description | catalogo `EXCEL_FG-FGS.json` + modelo/codigo | lookup por clave `modelo::codigo` | `""` | OK |
| fg_code_description | `fg_code`, `fg_description` | concat `codigo + descripcion` | `""` | OK |
| weight | `weight_final`, `weight_gesa`, `WEIGHT` | `pickMostFrequent` | `""` | OK |
| weight_txt | `weight_txt` | `pickMostFrequent` | `weight` | OK |
| measurement | `measure_final`, `measurement_final`, `dimensions_gesa`, `MEASUREMENT / STANDARD` | `pickMostFrequent` | `""` | OK |
| TIPOARTICULO | `TIPOARTICULO` | `pickMostFrequent` | `""` | OK |
| PAG | `PAG`, `Source Page`, `rebuild_source_page` | `pickMostFrequent` | `""` | OK |
| BOM_no | `BOM_no`, `BOM-No.` | `pickMostFrequent` | `""` | OK |
| esquema_general | `esquema_general` | `pickMostFrequent` | `""` | OK |
| exp_motor | `exp_motor` | `pickMostFrequent` | `engine` | OK |
| exp_categorias | modelo + FG de filas consolidadas | `deriveExpCategorias` + join unico | `""` | OK |
| atributo | `atributo` | `pickMostFrequent` | `""` | OK |
| SUST_TIPO | `hierarchie_final`, `sust_hierarchie` | jerarquia consolidada (`New`/`Superseded`) | `New` | OK |
| new_pn_relacionado | `new_pn_final`, `sust_new_part_number`, `New Part Number` | `pickMostFrequent` | `""` | OK |
| old_pn_relacionados | `subst_pnlist_final`, `sust_superseded_list` | `pickMostFrequent` | `""` | OK |
| EN_EXCEL_SUSTITUCION | `EN_EXCEL_SUSTITUCION` | `pickMostFrequent` | `""` | OK |
| ruta_foto | `ruta_foto`, `filename_foto` | `pickMostFrequent` | `""` | OK |
| exp_imagenes | `filename_foto`, `ruta_esquemas_pos` | `deriveExpImagenes` + join unico | `""` (o URL `sin_imagen` para synthetic) | OK |

## Cobertura por tipo de registro

- Registros New reales: todas las columnas se rellenan con agregacion por PN y reglas QA.
- Registros Superseded reales: mismo esquema; `SUST_TIPO=Superseded`.
- Registros synthetic (desde lista superseded o huerfanos): se mantiene el mismo esquema de 30 columnas, con `""` cuando no hay dato fuente.
- Dedupe por PN: conserva un candidato ganador; campos de esquema New_v506 quedan en salida final de CSV sin columnas tecnicas adicionales.

## Validacion obligatoria completada

1. Exportacion WordPress ejecutada: OK.
2. Comparacion de cabeceras contra New_v506: OK.
3. Confirmaciones:
   - Columnas faltantes: 0
   - Columnas extra: 0
   - Orden diferente: 0

Conclusion: la exportacion WordPress actual cumple exactamente el esquema y orden de columnas de New_v506.
