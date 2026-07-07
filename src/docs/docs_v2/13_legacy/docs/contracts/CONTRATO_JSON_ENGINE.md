# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Contrato JSON `engine_*.json`

> **CONTRATO MILU â€” v1** Â· Fase: CONTRATOS + ESTABILIDAD Â· No modifica cÃ³digo ni datos.
>
> Define el modelo oficial de cada fila de los 9 archivos `engine_*.json` (source of truth del proyecto). Fuente Ãºnica de verdad para cualquier refactor, validador o test futuro.

## 1. Estado de la verdad

- Hay **9 archivos `engine_*.json`** en la raÃ­z del repo. Cada uno es un array de objetos (filas).
- Cada fila representa una posiciÃ³n de despiece de un motor (PN + datos asociados).
- Convivencias histÃ³ricas: campos duplicados o legacy aÃºn presentes en disco â€” ver Â§8.

## 2. Campos de identidad (estables, no recalcular)

| Campo | Tipo | Origen | Notas |
|---|---|---|---|
| `ID` | string | generado | Ãšnico dentro del engine. No reasignar. |
| `engine_model` | string | nombre del archivo | Coincide con `engine_<MODELO>.json`. |
| `libro` / `libro_pag` | string | PDF / GESA | Referencia bibliogrÃ¡fica. |
| `source_page` / `Source Page` / `page4` / `pages` | string/number | PDF | PÃ¡gina(s) de origen. |
| `source_file` | string | PDF/Excel | Archivo de extracciÃ³n. |
| `source_sheet` | string | Excel | Hoja origen si aplica. |
| `book_set` | string | interno | AgrupaciÃ³n lÃ³gica. |
| `POS` / `pos` | string/number | PDF | PosiciÃ³n en el despiece. |
| `PART NO.` | string | PDF crudo | PN original tal como aparece. |
| `pn_raw` | string | PDF | VersiÃ³n normalizada en bruto. |
| `pn_final` | string | depuraciÃ³n | **PN canÃ³nico**; usar este para join/agrupar/export. |

## 3. Campos RAW / PDF (datos crudos)

| Campo | Notas |
|---|---|
| `DESIGNATION` | DesignaciÃ³n tal como aparece en PDF. |
| `MEASUREMENT / STANDARD` | Medida cruda; **se colapsa a un solo espacio** en depuraciÃ³n. |
| `WEIGHT` | Peso crudo. |
| `FN`, `MODEL/TYPE`, `QTY`, `UNITS` | Datos auxiliares. |
| `BOM-No.` | Bill of Materials. |
| ComparaciÃ³n PDF: `pos_pdf`, `pn_pdf`, `designation_pdf`, `measure_pdf`, `weight_pdf`, `bom_pdf`, `norma_pdf`, `gesa_pdf`, `normalizado_pdf`, `sust_new_part_number_pdf` | Resultado de `/recompute-pdf-auto` ([scripts/qa_pdf_compare.js](../../scripts/qa_pdf_compare.js)). Persistidos. |

## 4. Campos GESA (catÃ¡logo oficial)

| Campo | Notas |
|---|---|
| `gesa` | `SI` / `NO` â€” presencia en catÃ¡logo GESA. |
| `existeix_gesa` | Flag de existencia. |
| `designation_gesa` | DesignaciÃ³n oficial GESA. |
| `dimensions_gesa` | Medidas oficiales; **prioridad sobre `MEASUREMENT / STANDARD`** en cÃ¡lculo de `measure_final`. |
| `weight_gesa` | Peso GESA. |
| `norma` | Norma tÃ©cnica. |
| `nsn` | NATO Stock Number. |
| `units` | Unidad GESA. |
| `status` | `OK_GESA`, `OK_SUST_OLD`, `REVISAR`, etc. |
| `pn_recomendado`, `pn_new` | PN recomendado/sustituto. |

## 5. Campos SUST (sustituciones)

| Campo | Notas |
|---|---|
| `sust_status` | `SI` / vacÃ­o â€” indica existencia en tabla SUST. **Bandera informativa; NO decide New/Superseded.** |
| `sust_hierarchie` | `New` / `Superseded` / vacÃ­o. **Ãšnico criterio oficial** para clasificar en export ([scripts/export_wordpress_milu.js#L244-L250](../../scripts/export_wordpress_milu.js)). |
| `sust_new_part_number` | PN que reemplaza al actual. |
| `sust_superseded_list` | Lista de PN antiguos sustituidos. |
| `existeix_sust_new`, `existeix_sust_old` | Flags de existencia. |
| Campos crudos SUST | `Date`, `New Part Number`, `Superseded Part Number`, `Seq no`, `Hierarchie`, `Denomination (New Part Number)`, `Valid From Date`, `Cause`, `Replacement Type`, `Denomination(Cause)`, `Product Hierarchy`, `MTU`, `DD/DTNA`, `MTART`, `MSTAE`. |

## 6. Campos finales / canÃ³nicos (merge entre raw, GESA y SUST)

| Campo | Regla de cÃ¡lculo | Notas |
|---|---|---|
| `pn_final` | normalizaciÃ³n de `PART NO.` / `pn_raw` | CanÃ³nico. |
| `designation_final` | priorizaciÃ³n GESA â†’ PDF | Texto final mostrado. |
| `measure_final` | `dimensions_gesa` â€– `MEASUREMENT / STANDARD` (colapsando espacios) | **CANÃ“NICO**. |
| `measurement_final` | duplicado de `measure_final` | **OBSOLETO** â€” ver Â§8. |
| `weight_final` | `weight_gesa` â€– `WEIGHT` | Incluye unidad (ej. `"0.002 KGM"`). |
| `norma_final` | normalizaciÃ³n de `norma` | |
| `pos_final`, `model_final`, `qty_final`, `qty_units_final` | merge | |
| `criterio_pn`, `detalle_cambio`, `depuracion_ts` | trazabilidad | Ãšltima ejecuciÃ³n de [depuracion_json.py](../../depuracion_json.py). |

## 7. Campos QA persistidos

Persistidos directamente en el JSON. Modificados por `/save-json`, `/apply-revision-to-engines`, `/pn-review/*/apply-decision`.

| Campo | Valores vÃ¡lidos | Notas |
|---|---|---|
| `qa_revision_estado` | `ok`, `pendiente` | Ver [CONTRATO_REVISION_QA.md](CONTRATO_REVISION_QA.md). |
| `qa_revision_accion` | `importar`, `revisar`, `eliminar`, `copia` | `descartar` NUNCA se persiste; mapea a `eliminar`. |
| `qa_revision_updated_at` | ISO 8601 | |
| `qa_revision_motivo` | string libre | |
| `qa_revision_confianza` | string/number | |
| `qa_revision_origen` | string | manual / auto / regla. |
| `qa_revision_fecha` | string | |
| `qa_revision_regla_aplicada` | string | regla automÃ¡tica aplicada si la hubo. |

## 8. Campos derivados â€” NO deben persistirse

Calculados en runtime y **eliminados al guardar** por `stripLegacyQaFields()` ([server.js L605-L620](../../server.js)):

| Campo | Por quÃ© se calcula | Notas |
|---|---|---|
| `qa_errors` | Resultado de validaciones | **Se borra al guardar**; nunca leer de disco. |
| `qa_errors_active` | Subconjunto activo de errores | Idem. |
| `pos_error`, `pn_error`, `designation_error`, `weight_error`, `measurement_error`, `norma_error`, `bom_error`, `total_error`, `has_error` | Contadores de errores (0-based) | Se mantienen en disco actualmente, pero conceptualmente son derivados. **No tratar como source of truth.** |
| Estados visuales / KPIs / decisiones de export | UI / export | Calcular siempre desde los campos canÃ³nicos. |

## 9. Campos de imÃ¡genes y esquemas

Ver detalle en [CONTRATO_IMAGENES_ESQUEMAS.md](CONTRATO_IMAGENES_ESQUEMAS.md).

| Campo | Notas |
|---|---|
| `exp_imagenes` | Lista (CSV/multilÃ­nea) de URLs/nombres. **Primaria.** |
| `ruta_foto` | URL Ãºnica. **Fallback.** |
| `filename_foto` | Basename. |
| `esquemas` | PNG del esquema. |
| `esquemas_circulos`, `esquemas_circulos_all` | Esquemas con cÃ­rculos POS. |
| `ruta_esquemas_pos` | Path al esquema asociado al `pos`. |

## 10. Otros campos auxiliares (mantener intactos en esta fase)

`categoria`, `tags`, `precio`, `atributo2`, `FG/FGS`, `fg_fgs_raw`, `fg_code`, `fgs_description`, `fgs_code_description`, `engine`, `model`.

## 11. Inconsistencias conocidas (pendientes de unificar â€” NO corregir aÃºn)

| # | Inconsistencia | Estado | AcciÃ³n propuesta (futura) |
|---|---|---|---|
| I1 | `measure_final` y `measurement_final` coexisten con valor idÃ©ntico | Confirmado en [scripts/export_wordpress_milu.js L325-L326](../../scripts/export_wordpress_milu.js) y en filas reales. | Mantener `measure_final` como canÃ³nico; deprecar `measurement_final`. |
| I2 | `wheight_final` mencionado en docs antiguos | **No existe en disco** (verificado). | Eliminar referencias de docs histÃ³ricos. |
| I3 | "descartar" aparece en UI y entradas histÃ³ricas | Mapea siempre a `eliminar` en `qa_revision_accion`; nunca persiste. | Renombrar etiqueta UI a "eliminar" cuando se haga refactor UI. |
| I4 | `qa_errors` / `qa_errors_active` se eliminan al guardar | Por diseÃ±o. | Documentar y nunca leerlos de disco. |
| I5 | Campos `*_error` y `has_error` persisten en disco | Mezcla de "persistido" y "derivado". | Decidir: o son derivados (no persistir) o son persistidos (recalcular al modificar). |

## 12. Reglas de oro

1. **Nunca editar `engine_*.json` a mano** sin pasar por un endpoint o por [depuracion_json.py](../../depuracion_json.py).
2. **`pn_final` es el PN canÃ³nico** para join, agrupaciÃ³n y export.
3. **`measure_final`** es el canÃ³nico de medidas; `measurement_final` queda solo por compatibilidad.
4. **`qa_errors` no existe en disco** tras un guardado: calcular siempre.
5. **`sust_hierarchie` decide** New/Superseded; `sust_status` solo informa presencia.
6. **Espacios mÃºltiples colapsan a uno** en `dimensions_gesa` y `MEASUREMENT / STANDARD` tras depuraciÃ³n.

