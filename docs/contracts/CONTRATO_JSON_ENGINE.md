# Contrato JSON `engine_*.json`

> **CONTRATO MILU — v1** · Fase: CONTRATOS + ESTABILIDAD · No modifica código ni datos.
>
> Define el modelo oficial de cada fila de los 9 archivos `engine_*.json` (source of truth del proyecto). Fuente única de verdad para cualquier refactor, validador o test futuro.

## 1. Estado de la verdad

- Hay **9 archivos `engine_*.json`** en la raíz del repo. Cada uno es un array de objetos (filas).
- Cada fila representa una posición de despiece de un motor (PN + datos asociados).
- Convivencias históricas: campos duplicados o legacy aún presentes en disco — ver §8.

## 2. Campos de identidad (estables, no recalcular)

| Campo | Tipo | Origen | Notas |
|---|---|---|---|
| `ID` | string | generado | Único dentro del engine. No reasignar. |
| `engine_model` | string | nombre del archivo | Coincide con `engine_<MODELO>.json`. |
| `libro` / `libro_pag` | string | PDF / GESA | Referencia bibliográfica. |
| `source_page` / `Source Page` / `page4` / `pages` | string/number | PDF | Página(s) de origen. |
| `source_file` | string | PDF/Excel | Archivo de extracción. |
| `source_sheet` | string | Excel | Hoja origen si aplica. |
| `book_set` | string | interno | Agrupación lógica. |
| `POS` / `pos` | string/number | PDF | Posición en el despiece. |
| `PART NO.` | string | PDF crudo | PN original tal como aparece. |
| `pn_raw` | string | PDF | Versión normalizada en bruto. |
| `pn_final` | string | depuración | **PN canónico**; usar este para join/agrupar/export. |

## 3. Campos RAW / PDF (datos crudos)

| Campo | Notas |
|---|---|
| `DESIGNATION` | Designación tal como aparece en PDF. |
| `MEASUREMENT / STANDARD` | Medida cruda; **se colapsa a un solo espacio** en depuración. |
| `WEIGHT` | Peso crudo. |
| `FN`, `MODEL/TYPE`, `QTY`, `UNITS` | Datos auxiliares. |
| `BOM-No.` | Bill of Materials. |
| Comparación PDF: `pos_pdf`, `pn_pdf`, `designation_pdf`, `measure_pdf`, `weight_pdf`, `bom_pdf`, `norma_pdf`, `gesa_pdf`, `normalizado_pdf`, `sust_new_part_number_pdf` | Resultado de `/recompute-pdf-auto` ([scripts/qa_pdf_compare.js](../../scripts/qa_pdf_compare.js)). Persistidos. |

## 4. Campos GESA (catálogo oficial)

| Campo | Notas |
|---|---|
| `gesa` | `SI` / `NO` — presencia en catálogo GESA. |
| `existeix_gesa` | Flag de existencia. |
| `designation_gesa` | Designación oficial GESA. |
| `dimensions_gesa` | Medidas oficiales; **prioridad sobre `MEASUREMENT / STANDARD`** en cálculo de `measure_final`. |
| `weight_gesa` | Peso GESA. |
| `norma` | Norma técnica. |
| `nsn` | NATO Stock Number. |
| `units` | Unidad GESA. |
| `status` | `OK_GESA`, `OK_SUST_OLD`, `REVISAR`, etc. |
| `pn_recomendado`, `pn_new` | PN recomendado/sustituto. |

## 5. Campos SUST (sustituciones)

| Campo | Notas |
|---|---|
| `sust_status` | `SI` / vacío — indica existencia en tabla SUST. **Bandera informativa; NO decide New/Superseded.** |
| `sust_hierarchie` | `New` / `Superseded` / vacío. **Único criterio oficial** para clasificar en export ([scripts/export_wordpress_milu.js#L244-L250](../../scripts/export_wordpress_milu.js)). |
| `sust_new_part_number` | PN que reemplaza al actual. |
| `sust_superseded_list` | Lista de PN antiguos sustituidos. |
| `existeix_sust_new`, `existeix_sust_old` | Flags de existencia. |
| Campos crudos SUST | `Date`, `New Part Number`, `Superseded Part Number`, `Seq no`, `Hierarchie`, `Denomination (New Part Number)`, `Valid From Date`, `Cause`, `Replacement Type`, `Denomination(Cause)`, `Product Hierarchy`, `MTU`, `DD/DTNA`, `MTART`, `MSTAE`. |

## 6. Campos finales / canónicos (merge entre raw, GESA y SUST)

| Campo | Regla de cálculo | Notas |
|---|---|---|
| `pn_final` | normalización de `PART NO.` / `pn_raw` | Canónico. |
| `designation_final` | priorización GESA → PDF | Texto final mostrado. |
| `measure_final` | `dimensions_gesa` ‖ `MEASUREMENT / STANDARD` (colapsando espacios) | **CANÓNICO**. |
| `measurement_final` | duplicado de `measure_final` | **OBSOLETO** — ver §8. |
| `weight_final` | `weight_gesa` ‖ `WEIGHT` | Incluye unidad (ej. `"0.002 KGM"`). |
| `norma_final` | normalización de `norma` | |
| `pos_final`, `model_final`, `qty_final`, `qty_units_final` | merge | |
| `criterio_pn`, `detalle_cambio`, `depuracion_ts` | trazabilidad | Última ejecución de [depuracion_json.py](../../depuracion_json.py). |

## 7. Campos QA persistidos

Persistidos directamente en el JSON. Modificados por `/save-json`, `/apply-revision-to-engines`, `/pn-review/*/apply-decision`.

| Campo | Valores válidos | Notas |
|---|---|---|
| `qa_revision_estado` | `ok`, `pendiente` | Ver [CONTRATO_REVISION_QA.md](CONTRATO_REVISION_QA.md). |
| `qa_revision_accion` | `importar`, `revisar`, `eliminar`, `copia` | `descartar` NUNCA se persiste; mapea a `eliminar`. |
| `qa_revision_updated_at` | ISO 8601 | |
| `qa_revision_motivo` | string libre | |
| `qa_revision_confianza` | string/number | |
| `qa_revision_origen` | string | manual / auto / regla. |
| `qa_revision_fecha` | string | |
| `qa_revision_regla_aplicada` | string | regla automática aplicada si la hubo. |

## 8. Campos derivados — NO deben persistirse

Calculados en runtime y **eliminados al guardar** por `stripLegacyQaFields()` ([server.js L605-L620](../../server.js)):

| Campo | Por qué se calcula | Notas |
|---|---|---|
| `qa_errors` | Resultado de validaciones | **Se borra al guardar**; nunca leer de disco. |
| `qa_errors_active` | Subconjunto activo de errores | Idem. |
| `pos_error`, `pn_error`, `designation_error`, `weight_error`, `measurement_error`, `norma_error`, `bom_error`, `total_error`, `has_error` | Contadores de errores (0-based) | Se mantienen en disco actualmente, pero conceptualmente son derivados. **No tratar como source of truth.** |
| Estados visuales / KPIs / decisiones de export | UI / export | Calcular siempre desde los campos canónicos. |

## 9. Campos de imágenes y esquemas

Ver detalle en [CONTRATO_IMAGENES_ESQUEMAS.md](CONTRATO_IMAGENES_ESQUEMAS.md).

| Campo | Notas |
|---|---|
| `exp_imagenes` | Lista (CSV/multilínea) de URLs/nombres. **Primaria.** |
| `ruta_foto` | URL única. **Fallback.** |
| `filename_foto` | Basename. |
| `esquemas` | PNG del esquema. |
| `esquemas_circulos`, `esquemas_circulos_all` | Esquemas con círculos POS. |
| `ruta_esquemas_pos` | Path al esquema asociado al `pos`. |

## 10. Otros campos auxiliares (mantener intactos en esta fase)

`categoria`, `tags`, `precio`, `atributo2`, `FG/FGS`, `fg_fgs_raw`, `fg_code`, `fgs_description`, `fgs_code_description`, `engine`, `model`.

## 11. Inconsistencias conocidas (pendientes de unificar — NO corregir aún)

| # | Inconsistencia | Estado | Acción propuesta (futura) |
|---|---|---|---|
| I1 | `measure_final` y `measurement_final` coexisten con valor idéntico | Confirmado en [scripts/export_wordpress_milu.js L325-L326](../../scripts/export_wordpress_milu.js) y en filas reales. | Mantener `measure_final` como canónico; deprecar `measurement_final`. |
| I2 | `wheight_final` mencionado en docs antiguos | **No existe en disco** (verificado). | Eliminar referencias de docs históricos. |
| I3 | "descartar" aparece en UI y entradas históricas | Mapea siempre a `eliminar` en `qa_revision_accion`; nunca persiste. | Renombrar etiqueta UI a "eliminar" cuando se haga refactor UI. |
| I4 | `qa_errors` / `qa_errors_active` se eliminan al guardar | Por diseño. | Documentar y nunca leerlos de disco. |
| I5 | Campos `*_error` y `has_error` persisten en disco | Mezcla de "persistido" y "derivado". | Decidir: o son derivados (no persistir) o son persistidos (recalcular al modificar). |

## 12. Reglas de oro

1. **Nunca editar `engine_*.json` a mano** sin pasar por un endpoint o por [depuracion_json.py](../../depuracion_json.py).
2. **`pn_final` es el PN canónico** para join, agrupación y export.
3. **`measure_final`** es el canónico de medidas; `measurement_final` queda solo por compatibilidad.
4. **`qa_errors` no existe en disco** tras un guardado: calcular siempre.
5. **`sust_hierarchie` decide** New/Superseded; `sust_status` solo informa presencia.
6. **Espacios múltiples colapsan a uno** en `dimensions_gesa` y `MEASUREMENT / STANDARD` tras depuración.
