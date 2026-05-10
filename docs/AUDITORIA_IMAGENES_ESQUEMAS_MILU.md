# AUDITORIA IMAGENES Y ESQUEMAS MILU

Generado: 2026-05-10T09:57:19.022Z

## Resumen ejecutivo
- Registros engine auditados: 67883
- Articulos exportables WordPress analizados: 5486
- Registros sin imagen real: 1
- Registros solo con placeholder: 18868
- Registros sin esquema: 8334
- Referencias rotas detectadas: 14249
- Imagenes fisicas no utilizadas: 3654

## Campos y datasets actuales
- engine_*.json: dataset principal consumido por qa_milu.html.
- data/output/wordpress/milu_wp_import.json y milu_wp_superseded.json: export actual a WordPress.
- data/output/wordpress/milu_wp_trace.json: traza por PN hacia source_records.
- qa_index.json / qa_index_light.json: flujo legacy referenciado en app.js, no presente en el repo actual.

## Flujo actual de generacion de rutas
- add_final_fields.py: genera exp_imagenes priorizando ruta_foto y luego ruta_esquemas_pos; si faltan ambas usa sin_imagen.
- generate_synthetic_exports.js: hereda exp_imagenes desde engine_*.json; no recalcula rutas locales.
- js/schemas.js: reconstruye rutas locales de esquemas y esquemas_pos por convencion de nombres y carpetas.
- scripts/export_wordpress_milu.js: genera JSON/CSV de export, pero hoy no persiste campos de imagen en los JSON finales.

## Metricas WordPress
- Sin ninguna imagen: 1
- Solo placeholder: 687
- Con imagen real: 4798
- Con ruta_foto real: 67
- Con ruta_esquemas_pos: 4793
- Con varias imagenes: 4279
- Rotas, vacias o inconsistentes: 0

## Metricas QA / engine rows
- Registros con esquemas vacios: 8334
- Registros con esquemas_circulos vacio: 21236
- Registros con schema_urls vacio: 67883
- Registros con img_urls vacio: 67883
- Registros sin esquema vinculado: 8334
- Registros con esquema pero sin ruta final WordPress: 12902
- Registros con esquema por libro/pagina pero sin imagen exportada: 47882

## Inventario fisico
- Imagenes inventariadas: 55620
- Fotos: 136
- Esquemas: 5511
- Esquemas POS: 49972
- Placeholders: 0

## Problemas detectados
- El export actual de WordPress no conserva campos de imagen en los JSON finales; la auditoria los recompone desde engine_*.json y milu_wp_trace.json.
- qa_index no existe en el repo actual, por lo que cualquier cruce con ese dataset queda marcado como legacy ausente.
- La UI QA resuelve esquemas locales por convencion de nombre, no por inventario persistido, lo que facilita rutas rotas silenciosas.
- Hay placeholders y rutas finales WordPress que no siempre tienen equivalente local verificable.

## Listados principales
- Referencias faltantes: 4656
- Referencias rotas: 4656
- Imagenes huerfanas: 3654
- qa_index: qa_index ausente; app.js lo referencia como flujo legacy local.

## Plan de correccion
- Fase 1: mantener solo diagnostico; congelar logica productiva y versionar copia de seguridad de outputs e inventario.
- Fase 2: unificar deteccion de placeholders y normalizar tokens sin_imagen, placeholder y variantes.
- Fase 3: recalcular rutas de esquemas desde inventario real y persistir un indice verificable de correspondencias.
- Fase 4: corregir scripts de export_WordPress para incluir y validar campos de imagen antes de generar JSON/CSV finales.
- Fase 5: construir pantalla visual QA de imagenes/esquemas usando image_schema_audit.json.

## Recomendaciones
- No cambiar logica productiva hasta revisar estos artefactos: image_inventory.json, image_schema_audit.json, image_inventory.csv y este informe.
- Antes de cualquier correccion, regenerar copia de seguridad de data/output/wordpress y de los engine_*.json afectados.
- Introducir una comprobacion automatica que falle si una ruta WordPress no encuentra fichero local equivalente o si solo se resuelve a placeholder.

