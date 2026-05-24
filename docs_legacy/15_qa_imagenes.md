# QA Imagenes y Esquemas

Nueva herramienta visual en modo solo lectura para auditoria multimedia.

## Ubicacion

- Pagina: `qa_imagenes.html`
- CSS: `css/qa_imagenes.css`
- JS principal: `js/qa_imagenes.js`
- Modulos:
  - `js/qa_imagenes_filters.js`
  - `js/qa_imagenes_table.js`
  - `js/qa_imagenes_preview.js`
  - `js/qa_imagenes_stats.js`

## JSON de entrada

La pagina intenta cargar (tolerante a errores):

- `data/output/image_schema_audit.json`
- `data/output/image_inventory.json`
- `data/output/qa_index.json`
- `qa_index.json`
- `version.json`
- Export WordPress detectados por lista de rutas conocidas:
  - `data/output/wordpress/milu_wp_import.json`
  - `data/output/wordpress/milu_wp_pending.json`
  - `data/output/wordpress/milu_wp_superseded.json`
  - `data/output/wordpress/milu_wp_discarded.json`
  - `data/output/wordpress/milu_wp_trace.json`
  - `data/output/wordpress/milu_wp_export_report.json`
  - `MILU_New_v506.json`
  - `MILU_Superseded_v506.json`
  - `product-export-2026-03-29-11-07.json`

## Estructura esperada principal

### image_schema_audit.json

Claves detectadas en runtime:

- `generated_at`
- `summary`
- `wordpress_summary`
- `qa_metrics`
- `qa_index_info`
- `records` (array)
- `unused_images` (array)
- `missing_images` (array)
- `broken_references` (array)

`records[]` esperado:

- `record_key`
- `part_number`
- `engine_model`
- `libro`
- `source_page`
- `export_type`
- `ruta_foto`
- `ruta_esquemas_pos`
- `image_status`
- `schema_status`
- `issues[]`
- `reference_counts`

### image_inventory.json

Array con metadatos de imagen local:

- `filename`
- `relative_path`
- `extension`
- `size_kb`
- `modified_at`
- `possible_type`
- `engine_model`
- `libro`
- `pagina`
- `is_used`

## Reglas de estado (UI)

- `state_status=ERROR` si hay `issues` con tokens `missing|broken|no_|empty`
- `state_status=WARNING` si hay `issues` pero no criticas
- `state_status=OK` sin issues

Reglas visibles:

- `image_status=NO_IMAGE` => badge rojo
- `image_status=ONLY_PLACEHOLDER` => badge naranja
- `schema_status=NO_SCHEMA` => badge rojo
- ruta con `sin_imagen|placeholder` => flag placeholder
- issue con `broken` => ruta rota

## Filtros

- Global search: PN, rutas, estado e issues
- Rapidos por grupos: imagenes, esquemas, exportacion, estado
- Tecnicos: `engine_model`, `libro`, `source_page`, `part_number`
- Guardar y restaurar filtros en `localStorage` (`qa_imagenes_filters_v1`)

## KPIs

KPIs clicables que aplican filtros:

- Total exportables
- Con imagen real
- Solo placeholder
- Sin imagen
- Con esquema
- Sin esquema
- Rutas rotas
- Imagenes huerfanas
- Imagenes no usadas
- Exportables con error
- Con foto + esquema
- Solo esquema
- Solo foto

## Tabla

- Tabla virtualizada por viewport
- Ordenacion por columna
- Seleccion multiple
- Export CSV de la vista
- Render incremental por overscan

## Tabs secundarias

- Articulos
- Inventario imagenes
- Rutas rotas
- Placeholders
- Sin esquema
- Imagenes huerfanas
- Estadisticas

## Diagnostico y preview

Panel lateral por registro:

- Producto (imagen + estado)
- Esquema (preview + estado)
- WordPress (ruta + validacion)
- Local (deteccion de existencia por inventory)
- Inventario (filename, size, ext, modified)
- Diagnostico (issues + recomendacion)

## Seguridad

- Modo solo lectura
- Sin endpoints de escritura
- Botones de utilidades en modo preview (disabled)

## Futuras mejoras

- Persistencia de presets de filtros en backend
- Column resize real por drag
- Validacion activa de URLs WordPress
- Acciones bulk con confirmacion y auditoria
- Integracion directa con pagina de revision QA y PDF
