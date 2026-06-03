# Auditoria de contenido: WordPress vs New_v506

## Resumen ejecutivo

Se audito contenido (no estructura) entre:

- Referencia: [MILU_New_v506.json](MILU_New_v506.json)
- Export actual New: [data/05-wordpress/milu_wp_new_import.csv](data/05-wordpress/milu_wp_new_import.csv)
- Metadatos de soporte: [data/05-wordpress/milu_wp_new_import.json](data/05-wordpress/milu_wp_new_import.json)
- Complemento Superseded: [data/05-wordpress/milu_wp_superseded.csv](data/05-wordpress/milu_wp_superseded.csv)

Datos base de auditoria generados en:

- [reports/wordpress_content_audit_data_v2.json](reports/wordpress_content_audit_data_v2.json)

Resultado general:

- Equivalencia funcional parcial.
- No se detectaron errores estructurales nuevos.
- Se detectaron diferencias reales en categorias, imagenes y campos GESA.
- Varias diferencias son esperables por cambio de logica de negocio (agregacion QA-only y normalizacion).

## Muestra analizada

Cobertura real obtenida:

- New export: 5501 filas.
- New con match por PN en referencia: 3861 filas.
- Superseded export: 3130 filas.
- Muestra analizada (contenido New): 23 filas.
- Muestra synthetic: incluida (8 casos).
- Muestra superseded: incluida desde archivo superseded (20 casos).
- Muestra con imagenes: incluida.
- Muestra sin imagenes: incluida.
- Muestra con esquemas (hint por texto): no encontrada en New export (0 casos con marcador de esquema en `exp_imagenes`/`ruta_foto`).
- Muestra GESA normalizado en New export: no encontrada (0 casos).
- GESA normalizado en referencia: 1121 casos.

PN usados en muestra New (23):

- 135M27020/1
- 136M52010/1
- 136M55056/1
- 137M13001/1
- 000000000359
- 000000000360
- 400X230X111
- 000000000403
- 000000002970/85
- 000000003326/85
- 000000004744/85
- 50667/1
- 0001400182/87
- 0001880846/N20
- 0002035683/N20
- 524SK0789
- 535D01022/1
- 535D01023/1
- 535D01508/1
- 635A16700/2
- 635D16007/1
- 000000000611
- 000000000668

## Coincidencias detectadas

Coincidencia fuerte en muestra (14 filas con match en referencia):

- pn: 14/14
- type: 14/14
- nsn: 14/14
- ruta_foto: 14/14
- measurement: 11/14 (las diferencias son principalmente normalizacion de espacios)

Synthetic (logica aprobada):

- Campos engine, fg_code, fg_description, fg_code_description, exp_categorias y exp_imagenes se generan con consistencia interna en la muestra synthetic.
- Se verifica uso de placeholder de imagen en synthetic cuando no hay fuente (`sin_imagen.jpeg`).

Superseded (logica aprobada):

- En muestra de 20 superseded, todos traen `SUST_TIPO=Superseded` y vinculo `new_pn_relacionado` presente.
- En muestra de 20 superseded, `old_pn_relacionados` tambien esta presente.
- No se detectaron superseded huerfanos en la muestra inspeccionada.

## Diferencias detectadas

### Alta prioridad

| Columna | New_v506 (muestra) | Export actual (muestra) | Estado | Diferencia detectada | Posible causa |
|---|---|---|---|---|---|
| sku | N/A explicito | N/A explicito | REVISAR | No existe como columna final; se mapea a `pn`. | Cambio de contrato a esquema New_v506. |
| name | designation | designation | OK | Equivalencia funcional por mapeo. | Mapeo semantico. |
| type | type | type | OK | Sin diferencias en muestra comparable. | - |
| categories | exp_categorias | exp_categorias | REVISAR | 12/14 no coinciden exacto. | Export actual usa categoria principal por consolidacion, no lista historica completa. |
| images | exp_imagenes | exp_imagenes | REVISAR | 8/14 no coinciden exacto. | Faltan imagenes en varias filas New frente a referencia historica; synthetic usa placeholder cuando no hay fuente. |
| description | designation | designation | REVISAR | 4/14 diferencias textuales menores. | Normalizacion y/o fuente diferente por QA merge. |
| short_description | N/A | N/A | REVISAR | No aplica en esquema actual. | Campo no definido en New_v506. |
| engine | engine | engine | REVISAR | 14/14 difiere literal. | Referencia usa valor agregado tipo `4000`; export usa engine especifico (`12V4000M40A`, etc.). |
| model_type | model_type | model_type | REVISAR | 8/14 difiere literal. | Referencia historica conserva multivalor; export actual usa valor representativo consolidado. |
| fg_code | fg_code | fg_code | REVISAR | 6/14 diferencias (incluye vacios). | Cobertura incompleta en fuentes y/o lookup. |
| fg_description | fg_description | fg_description | REVISAR | 7/14 diferencias (incluye vacios). | Lookup FG dependiente de catalogo y modelo. |
| fg_code_description | fg_code_description | fg_code_description | REVISAR | 7/14 diferencias. | Deriva de fg_code + fg_description; hereda vacios. |
| exp_imagenes | exp_imagenes | exp_imagenes | REVISAR | Ver fila `images`. | Misma causa. |
| exp_categorias | exp_categorias | exp_categorias | REVISAR | Ver fila `categories`. | Misma causa. |

### Prioridad media

| Columna | New_v506 (muestra) | Export actual (muestra) | Estado | Diferencia detectada | Posible causa |
|---|---|---|---|---|---|
| nsn | nsn | nsn | OK | Sin diferencias en comparable. | - |
| weight | numerico simple | numerico + unidad (`KGM`) | REVISAR | 14/14 difiere literal por formato. | Cambio de formato de presentacion. |
| measurement | texto con espaciado historico | texto normalizado | OK | 3/14 diferencias de espaciado. | Normalizacion intencional de espacios. |
| gesa_norm | GESA_NORM | GESA_NORM | REVISAR | 6/14 difiere (vacios en export). | Falta de fuente poblada en filas consolidadas. |
| gesa_normalizado | SI/NO en referencia | vacio en export | REVISAR | 14/14 difiere. | Campo no se esta rellenando en export New actual. |

### Prioridad baja

| Columna | Estado | Observacion |
|---|---|---|
| Campos auxiliares historicos (sku, synthetic_source, dedupe_trace, etc.) | OK | Se mantienen en JSON interno pero no en CSV final por contrato New_v506. |
| Campos vacios | REVISAR | Algunos vacios son esperables por ausencia de dato fuente, otros requieren confirmar regla (GESA). |
| Metadatos QA | OK | Siguen en JSON de salida para trazabilidad interna. |

## Problemas reales

1. `GESA_NORMALIZADO` en New export aparece vacio en toda la salida (0 con SI frente a 1121 SI en referencia).
2. `GESA_NORM` presenta perdida parcial de contenido en muestra comparable.
3. `exp_imagenes` muestra faltantes en filas donde New_v506 historico tenia URL.
4. `fg_description` y `fg_code_description` quedan vacios en parte de la muestra (impacta calidad semantica).

## Falsos positivos (o diferencias justificadas)

1. `engine`: diferencia literal esperable (referencia historica resumida vs export actual especifico por motor).
2. `model_type`: referencia conserva multivalor historico; export actual consolida un valor representativo.
3. `weight`: diferencia de formato por sufijo `KGM`.
4. `measurement`: diferencias menores de espaciado por normalizacion.
5. `exp_categorias` multivalor historico vs categoria principal actual en varios casos.

## Imagenes y esquemas

Observaciones de muestra:

- No se detectaron duplicados de tokens en `exp_imagenes`.
- Se detecta placeholder `sin_imagen.jpeg` en synthetic cuando no hay imagen fuente.
- `ruta_foto` aparece mayormente vacio en New export (coherente con pipeline actual, porque prioriza `exp_imagenes`).
- No aparece evidencia de `esquemas_circulos` en columnas finales del export New.

Base de logica auditada:

- Construccion de imagenes en [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js#L248)
- Construccion de categorias en [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js#L237)
- Consolidacion de fila exportada en [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js#L498)

## Recomendaciones

1. Definir regla explicita para `GESA_NORMALIZADO` en export New (SI/NO o vacio controlado) y documentarla.
2. Revisar si `GESA_NORM` debe heredarse siempre del mejor candidato en consolidacion por PN.
3. Revisar fallback de `exp_imagenes` para filas New sin imagen cuando referencia historica si la tenia.
4. Evaluar si `exp_categorias` debe preservar multivalor (como historico) o mantener categoria principal; hoy la diferencia es funcional, no estructural.
5. Añadir validacion automatica de contenido por muestra en CI/local para evitar regresiones silenciosas.

## Correcciones propuestas (sin aplicar aun)

Solo candidatas, porque cumplen condicion de diferencia real documentada:

1. Campo `GESA_NORMALIZADO`.
   - Impacto: MEDIO.
   - Archivo/funcion: [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js#L498) en `buildMergedRow`.
   - Motivo: salida vacia sistematica frente a referencia con SI/NO.
2. Campo `GESA_NORM`.
   - Impacto: MEDIO.
   - Archivo/funcion: [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js#L498) en consolidacion por PN.
   - Motivo: perdida parcial de dato en muestra.
3. Campo `exp_imagenes` (solo para New no synthetic).
   - Impacto: MEDIO.
   - Archivo/funcion: [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js#L248).
   - Motivo: faltantes frente a referencia historica en parte de la muestra.

## Tabla resumen solicitada

| Columna | Estado |
|---|---|
| pn/sku (mapeado) | OK |
| designation/name | REVISAR |
| type | OK |
| exp_categorias/categories | REVISAR |
| exp_imagenes/images | REVISAR |
| engine | REVISAR |
| model_type | REVISAR |
| fg_code | REVISAR |
| fg_description | REVISAR |
| fg_code_description | REVISAR |
| nsn | OK |
| weight | REVISAR |
| measurement | OK |
| GESA_NORM | REVISAR |
| GESA_NORMALIZADO | REVISAR |
| ruta_foto | OK |

## Resumen final

- Total columnas auditadas: 16
- Coinciden completamente: 5
- Coinciden parcialmente: 6
- Diferencias reales: 5

Impacto funcional estimado: MEDIO.

## Evidencia tecnica

- Datos de auditoria: [reports/wordpress_content_audit_data_v2.json](reports/wordpress_content_audit_data_v2.json)
- Endpoint de ejecucion export: [server.js](server.js#L2883)
- Vista frontend de export: [js/export-wordpress.js](js/export-wordpress.js#L54)
- Esquema backend New_v506: [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js#L12)
