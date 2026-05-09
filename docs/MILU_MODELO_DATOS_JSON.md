# MILU MODELO DATOS JSON

## 1. Fuentes JSON principales

### Runtime principal
- engine_12V4000M40A.json
- engine_12V4000M53.json
- engine_12V4000M70.json
- engine_16V4000M61.json
- engine_16V4000M73.json
- engine_16V4000M73L.json
- engine_16V4000M90.json
- engine_20V4000M93.json
- engine_20V4000M93L.json

Totales auditados:
- Filas: 67,883
- Campos distintos detectados: 120

### Persistencia de control
- qa_revision_server_data.json (sync revisiones)
- qa_audit_log.json (auditoria)

### Salidas pipeline
- data/output/wordpress/*.json
- data/output/export_review/*.json
- data/output/ai_review/*.json
- data/output/v2/*.json

## 2. Estructura funcional por bloques

### 2.1 Identidad y trazabilidad
- ID
- engine_model
- source_file
- source_sheet
- Source Page
- POS

### 2.2 Part Number y descripcion
- PART NO. (raw PDF/base)
- pn_raw (normalizado base)
- pn_final (final QA)
- criterio_pn (metadato de criterio)
- DESIGNATION
- designation_gesa
- designation_final

### 2.3 Medida/peso/norma
- WEIGHT / weight_gesa / weight_final
- MEASUREMENT / STANDARD
- dimensions_gesa
- measure_final
- norma / norma_final / norma_raw

### 2.4 Sustitucion y jerarquia
- sust_status
- sust_hierarchie
- sust_new_part_number
- sust_superseded_list

### 2.5 Revision QA
- qa_revision_estado
- qa_revision_accion
- qa_revision_updated_at

### 2.6 Error model QA
- pos_error, pn_error, designation_error, weight_error, measurement_error, norma_error, bom_error
- total_error
- has_error

### 2.7 Multimedia y esquemas
- ruta_foto
- filename_foto
- ruta_esquemas_pos
- esquemas
- esquemas_circulos
- esquemas_circulos_all
- exp_imagenes

### 2.8 Campos *_pdf (comparacion contra PDF)
- pos_pdf, pn_pdf, designation_pdf, model_type_pdf, qty_pdf, units_pdf, weight_pdf, fn_pdf, measure_pdf
- bom_pdf, norma_pdf, normalizado_pdf, sust_*_pdf, etc.

## 3. Cobertura de campos clave solicitados
(Conteos sobre 67,883 filas)

- PART NO.: presente 67,883 / no vacio 66,630
- pn_raw: presente 67,883 / no vacio 66,630
- qa_revision_estado: presente 67,883 / no vacio 67,883
- qa_revision_accion: presente 67,883 / no vacio 67,883
- Source Page: presente 67,883 / no vacio 67,883
- engine_model: presente 67,883 / no vacio 67,883
- apariciones: presente 0 / no vacio 0
- hermanos: presente 0 / no vacio 0
- gesa: presente 67,883 / no vacio 67,882
- sust_status: presente 67,883 / no vacio 31,778
- sust_hierarchie: presente 67,883 / no vacio 31,778
- sust_new_part_number: presente 67,883 / no vacio 31,778
- sust_superseded_list: presente 67,883 / no vacio 26,216
- ruta_foto: presente 67,883 / no vacio 1,132
- ruta_esquemas_pos: presente 67,883 / no vacio 46,647
- esquemas: presente 67,883 / no vacio 59,549
- esquemas_circulos: presente 67,883 / no vacio 46,647
- esquemas_circulos_all: presente 67,883 / no vacio 59,333
- exp_imagenes: presente 67,883 / no vacio 67,882
- pn_final: presente 67,883 / no vacio 65,907
- designation_final: presente 67,883 / no vacio 66,627
- measure_final: presente 67,883 / no vacio 42,810
- weight_final: presente 67,883 / no vacio 61,361

## 4. Lectura tecnica de los datos

Campos esenciales (alta completitud, alto valor funcional):
- ID, engine_model, Source Page, POS, PART NO., pn_final, designation_final
- qa_revision_estado, qa_revision_accion
- total_error, has_error

Campos derivados utiles:
- measure_final, weight_final, norma_final
- exp_imagenes
- *_pdf para comparativas y trazabilidad

Campos sparse o de menor confiabilidad (revisar):
- MODEL/TYPE_final (~13%)
- FN / fn_final (muy bajo)
- ruta_foto (bajo, 1.7%)
- sust_*_pdf (muy bajo en varios)

Campos ausentes para requerimientos futuros:
- apariciones (no persistido)
- hermanos (no persistido)

## 5. Estados/acciones actuales (conteo real)

qa_revision_estado:
- ok: 64,837
- pendiente: 3,046

qa_revision_accion:
- copia: 56,432
- importar: 8,145
- revisar: 3,093
- eliminar: 213

Observacion: la accion copia domina ampliamente, lo que impacta filtros, export y semantica de negocio.

## 6. Modelo recomendado (estable y limpio)

### Entidad Row canonica
- identity: id, engine_model, source_file, source_page, pos
- pn: part_no_raw, pn_raw, pn_final, criterio_pn
- text: designation_pdf, designation_gesa, designation_final
- measure: measure_pdf, measure_gesa, measure_final, norma_final
- weight: weight_pdf, weight_gesa, weight_final
- sust: status, hierarchy, new_part_number, superseded_list
- media: main_image, schema_paths, exp_images
- qa: revision_estado, revision_accion, revision_updated_at, errors{...}
- trace: pdf_fields{}, depuracion_ts

### Reglas
- Mantener measure_final como campo final unico de medida.
- Evitar duplicidad semantica measure_final vs measurement_final.
- Mantener enum cerrada para revision_estado y revision_accion.
- Reservar *_pdf para evidencia comparativa (no para negocio final).

## 7. Campos para WordPress
Minimo recomendado para export robusto:
- sku/pn
- designation_final
- measure_final
- weight_final
- exp_imagenes
- categoria/atributo
- sust_hierarchie + sust_new_part_number + sust_superseded_list
- qa_revision_estado + qa_revision_accion

## 8. Riesgos de modelo actual
- Mezcla de naming legacy y canonico en algunos campos.
- Densidad de campos alta (120) para un runtime de UI sin schema formal.
- Falta de campos persistidos de agregacion por PN (apariciones/hermanos) obliga recalculo constante.

## 9. Recomendacion de gobierno de schema
- Definir JSON schema versionado (v1 runtime actual, v2 objetivo).
- Mantener capa de compatibilidad de lectura durante transicion.
- Agregar validacion schema en pre-export y pre-commit de datos.
