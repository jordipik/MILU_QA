# MILU_V104_WORDPRESS_FIELD_MAPPING_AUDIT

Fecha: 2026-06-05

## Alcance

Auditoria del mapping de campos del export WordPress generado por [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js) contra [MILU_New_v506.json](MILU_New_v506.json).

## Veredicto corto

- El encabezado CSV publicado por WordPress coincide exactamente con MILU_New_v506.json: mismas 30 columnas, mismo orden y mismo nombre.
- El JSON de salida interna del script contiene campos extra de trazabilidad y no es un match estricto si se compara objeto a objeto.
- La semantica no es 100 por ciento identica en todos los campos: `engine`, `model_type`, `PAG`, `exp_motor`, `exp_categorias`, `atributo`, `ruta_foto` y `exp_imagenes` presentan divergencias frente al snapshot de referencia.

## Comparacion de encabezado

Resultado de la comparacion entre el encabezado CSV actual y MILU_New_v506.json:

- columnas faltantes: ninguna
- columnas extra: ninguna
- columnas en distinto orden: ninguna
- diferencias de mayusculas/minusculas: ninguna

Nota tecnica:

- La constante [NEW_V506_HEADERS](scripts/export_wordpress_milu.js#L12) define exactamente el mismo orden que el snapshot de referencia.
- La verificacion del CSV actual contra el JSON de referencia devuelve coincidencia exacta de encabezado.

## Donde se define el contrato

- Constante de cabecera: [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js#L12)
- Construccion de la fila publica: [buildMergedRow](scripts/export_wordpress_milu.js#L498)
- Resolucion de alias de entrada: [getExportField](js/export-field-helper.js#L1)

## Mapa campo por campo

Leyenda:

- Exacta: la salida publica usa el mismo significado que el fichero de referencia.
- Parcial: la idea es equivalente, pero el origen o la agregacion no es identica en todos los casos.
- Divergente: el campo existe, pero la semantica actual no coincide con el fichero de referencia.

| Columna | Funcion exacta / linea aprox | Origen en engine_*.json | Principal o hermanos | Canonico o acumulado | Fallback / regla | Puede quedar vacio/null | Coincide con v506 |
|---|---|---|---|---|---|---|---|
| Id | buildMergedRow -> id ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | ID o rebuild_legacy_engine_id via getSourceId | Grupo PN | Canonico | pickMostFrequent | Si, si falta ID | Si |
| fecha_version | buildMergedRow -> fechaVersion ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | fecha_version | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| POS | buildMergedRow -> pos ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y getPos ([scripts/export_wordpress_milu.js#L297](scripts/export_wordpress_milu.js#L297)) | POS o pos_final | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| designation | buildMergedRow -> designation ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y getDesignation ([scripts/export_wordpress_milu.js#L299](scripts/export_wordpress_milu.js#L299)) | designation_final, designation_gesa, DESIGNATION | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| engine | buildMergedRow -> engine ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y getEngineName ([scripts/export_wordpress_milu.js#L293](scripts/export_wordpress_milu.js#L293)) | engine_model, model, engine, __engine_file | Grupo PN | Canonico por moda | pickMostFrequent; normalizeEngineForSynthetic en sinteticos | Si | No |
| model_type | buildMergedRow -> modelType ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y deriveModelTypeToken ([scripts/export_wordpress_milu.js#L214](scripts/export_wordpress_milu.js#L214)) | engine_model, engine, __engine_file, model, model_type_final | Hermanos consolidados en grupo PN | Acumulado unico | joinUnique | Si | No |
| type | buildMergedRow -> type ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | type | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| pn | buildMergedRow -> sku ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y getPn ([scripts/export_wordpress_milu.js#L272](scripts/export_wordpress_milu.js#L272)) | pn_final, PART NO., pn_excel, pn, sku | Grupo PN | Canonico | getExportField + pickMostFrequent | Si | Si |
| nsn | buildMergedRow -> nsn ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | nsn | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| GESA_NORM | buildMergedRow -> gesaNorm ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | GESA_NORM | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| GESA_NORMALIZADO | buildMergedRow -> gesaNormalizado ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | GESA_NORMALIZADO | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| fg_code | buildMergedRow -> fgCode ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y normalizeFgCode ([scripts/export_wordpress_milu.js#L159](scripts/export_wordpress_milu.js#L159)) | fg_code, fg_fgs_final, FG/FGS | Grupo PN | Canonico | normalizacion numerica + pickMostFrequent | Si | Si |
| fg_description | buildMergedRow -> fgDescription ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y lookupFgDescriptionByCodeAndModel ([scripts/export_wordpress_milu.js#L202](scripts/export_wordpress_milu.js#L202)) | EXCEL_FG-FGS.json + fg_code + engine | Grupo PN | Canonico | lookup por engineModel::fgCode | Si | Si |
| fg_code_description | buildMergedRow -> fgCodeDescription ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | fg_code + fg_description | Grupo PN | Canonico derivado | concatenacion | Si | Si |
| weight | buildMergedRow -> weight ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y getWeight ([scripts/export_wordpress_milu.js#L301](scripts/export_wordpress_milu.js#L301)) | weight_final, weight_gesa, WEIGHT | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| weight_txt | buildMergedRow -> weightTxt ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | weight_txt o weight | Grupo PN | Canonico | pickMostFrequent + fallback a weight | Si | Si |
| measurement | buildMergedRow -> measurement ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y getMeasurement ([scripts/export_wordpress_milu.js#L299](scripts/export_wordpress_milu.js#L299)) | measure_final, measurement_final, dimensions_gesa, MEASUREMENT / STANDARD | Grupo PN | Canonico | prioridad por campo medido + pickMostFrequent | Si | Si |
| TIPOARTICULO | buildMergedRow -> tipoArticulo ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | TIPOARTICULO | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| PAG | buildMergedRow -> pag ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y getSourcePage ([scripts/export_wordpress_milu.js#L295](scripts/export_wordpress_milu.js#L295)) | PAG o Source Page / rebuild_source_page | Grupo PN | Canonico por moda | pickMostFrequent | Si | No |
| BOM_no | buildMergedRow -> bomNo ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | BOM_no o BOM-No. | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| esquema_general | buildMergedRow -> esquemaGeneral ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | esquema_general | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| exp_motor | buildMergedRow -> expMotor ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | exp_motor o engine | Grupo PN | Canonico por moda | pickMostFrequent; fallback a engine | Si | No |
| exp_categorias | deriveExpCategorias ([scripts/export_wordpress_milu.js#L237](scripts/export_wordpress_milu.js#L237)) + buildMergedRow ([scripts/export_wordpress_milu.js#L518](scripts/export_wordpress_milu.js#L518)) | model_type/engine/fg_code derivados del grupo PN | Hermanos consolidados en el grupo PN | Acumulado unico | joinUnique | Si | No |
| atributo | buildMergedRow -> atributo ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | atributo | Grupo PN | Canonico | pickMostFrequent | Si | Parcial / No |
| SUST_TIPO | buildMergedRow -> hierarchy ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y getHierarchy ([scripts/export_wordpress_milu.js#L291](scripts/export_wordpress_milu.js#L291)) | hierarchie_final, sust_hierarchie, SUST_TIPO | Grupo PN | Canonico | getExportField; default New | Si | Si |
| new_pn_relacionado | buildMergedRow -> newPn ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y getNewPartNumber ([scripts/export_wordpress_milu.js#L279](scripts/export_wordpress_milu.js#L279)) | new_pn_final, sust_new_part_number, New Part Number | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| old_pn_relacionados | buildMergedRow -> supersededList ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) y getSupersededListValue ([scripts/export_wordpress_milu.js#L284](scripts/export_wordpress_milu.js#L284)) | subst_pnlist_final, sust_superseded_list | Grupo PN | Canonico | pickMostFrequent; mergeCsvField en dedupeByPn | Si | Si |
| EN_EXCEL_SUSTITUCION | buildMergedRow -> enExcelSustitucion ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | EN_EXCEL_SUSTITUCION | Grupo PN | Canonico | pickMostFrequent | Si | Si |
| ruta_foto | buildMergedRow -> rutaFoto ([scripts/export_wordpress_milu.js#L498](scripts/export_wordpress_milu.js#L498)) | ruta_foto o filename_foto | Grupo PN | Canonico | pickMostFrequent | Si | No |
| exp_imagenes | deriveExpImagenes ([scripts/export_wordpress_milu.js#L248](scripts/export_wordpress_milu.js#L248)) + buildMergedRow ([scripts/export_wordpress_milu.js#L519](scripts/export_wordpress_milu.js#L519)) | filename_foto + ruta_esquemas_pos | Hermanos consolidados en el grupo PN | Acumulado unico | joinUnique; fallback sin_imagen solo para sinteticos | Si | No |

## Lectura por bloques funcionales

### Coincidencia fuerte

Id, fecha_version, POS, designation, type, pn, nsn, GESA_NORM, GESA_NORMALIZADO, fg_code, fg_description, fg_code_description, weight, weight_txt, measurement, TIPOARTICULO, BOM_no, esquema_general, SUST_TIPO, new_pn_relacionado, old_pn_relacionados y EN_EXCEL_SUSTITUCION siguen la misma familia semantica que el snapshot de referencia.

### Divergencia relevante

- engine: el script actual exporta el nombre del motor/modelo, mientras que el snapshot de referencia usa `4000`.
- model_type: el script actual produce un token corto o una lista derivada, mientras que la referencia concentra varios modelos por PN.
- PAG: el script actual usa pagina simple; la referencia usa identificadores compuestos tipo `12V4000M40A-0358`.
- exp_motor: el script actual exporta un unico motor predominante; la referencia puede acumular varios motores por PN.
- exp_categorias: el script actual genera `modelType-fgCode`; la referencia mezcla categorias y contextos visibles que no siempre siguen ese patron.
- atributo: en la referencia actua como categoria visible y en muchos casos coincide con `exp_categorias`; en el script actual depende de `atributo` de origen y puede quedar vacio.
- ruta_foto: el script actual prioriza `ruta_foto` o `filename_foto`; la referencia contiene mayormente URLs finales o null.
- exp_imagenes: el script actual concatena nombre de archivo y `ruta_esquemas_pos`; la referencia guarda la URL final de imagen o `sin_imagen`.

## Observacion importante sobre los JSON de salida

- El CSV publico del export respeta la hoja de 30 columnas.
- El JSON interno generado por el script contiene campos extra de trazabilidad y consolidacion, por ejemplo `sku`, `pn_final`, `designation_final`, `measure_final`, `weight_final`, `sust_hierarchie`, `hierarchie_final`, `qa_revision_estado`, `qa_revision_accion`, `qa_summary_json`, `synthetic_*` y `dedupe_trace`.
- Por tanto, si alguien compara el JSON interno contra MILU_New_v506.json de forma literal, no va a dar match estricto aunque el CSV si respete el contrato de 30 columnas.

## Conclusiones

- La estructura de columnas publica si coincide con MILU_New_v506.json.
- La semantica completa no coincide en varios campos sensibles del bloque visual y de contexto (`engine`, `model_type`, `PAG`, `exp_motor`, `exp_categorias`, `atributo`, `ruta_foto`, `exp_imagenes`).
- Si la meta es igualdad exacta con MILU_New_v506.json en semantica, el mapeo actual necesita revision posterior; en esta fase solo queda documentado.