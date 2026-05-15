# Field Registry Refactor (Prueba Controlada)

Fecha: 2026-05-15

Actualizado (cierre de fase): 2026-05-16

## Objetivo de esta fase

Crear una primera capa segura para migrar nombres de campos de `engine_*.json` sin romper la web actual, exportaciones ni flujo QA.

## Alcance implementado

1. `data/field_registry.json`
- Generado desde `Excel refactorizacion Milu.xlsx`.
- Incluye dos bloques:
  - `fields`: reglas de copia/alta para normalización.
  - `deletes`: campos legacy marcados para no pasar al normalizado y mover opcionalmente a `_legacy`.
- Estructura por campo:
  - `id`, `current_name`, `new_name`, `group`, `action`, `legacy_names`, `type`, `description`.

2. `scripts/refactor_json_fields.py`
- Lee `field_registry.json`.
- Normaliza uno o varios `engine_*.json`.
- Escribe salida en `data/normalized/*.normalized.json` por defecto.
- Nunca sobrescribe originales.
- Mantiene conteo de registros.
- Soporta `_legacy` opcional cuando se usa `--include-legacy`.

3. `js/fieldAdapter.js`
- Adaptador de lectura/escritura compatible nuevo/legacy.
- API:
  - `getField(record, fieldName)`
  - `setField(record, fieldName, value)`
  - `hasField(record, fieldName)`
  - `getFieldAliases(fieldName)`
  - `configureFieldRegistry(registryPayload)`

4. Tests mínimos
- `tests/refactor-json-fields.test.js`
- `tests/field-adapter.test.js`

5. Scripts npm
- `refactor:json:dry`
- `refactor:json`
- `test:field-registry`
- `compare:normalized`

## Estado de cierre de fase (2026-05-16)

1. Registry generado
- Se mantiene `data/field_registry.json` como fuente de mapeo y alias nuevo/legacy.
- El adaptador de lectura usa este registry y aliases de compatibilidad para no romper la UI existente.

2. Normalizacion de engines
- Proceso de normalizacion ejecutado y comparado sobre los 9 engines.
- Resultado consolidado del comparador funcional: `9 OK / 0 CHECK`.

3. Comparador funcional
- Script: `scripts/compare_normalized_engines.py`.
- Salidas de control:
  - `data/normalized/compare_normalized_summary.json`
  - `docs/field_registry_functional_compare.md`
- Estado actual: sin divergencias funcionales bloqueantes en campos criticos.

4. Integracion real limitada de `fieldAdapter`
- Alcance aplicado solo a lectura en tabla compacta de `qa_milu`.
- Archivo principal: `js/qa-table.js`.
- No se ampliaron escrituras, guardado, exportadores, analytics ni logica QA.

5. Integracion real limitada de `fieldAdapter` en PN Review (solo lectura)
- Alcance aplicado solo a lectura en:
  - `js/pn-review-embedded.js`
  - `js/pn-review.js`
- Se incorpora helper local de lectura segura: `getPnReviewFieldValue(record, fieldName, defaultValue)`.
- Se mantiene fallback seguro cuando `window.fieldAdapter` no esta cargado.
- Se anade traza opcional por flag `window.PN_REVIEW_FIELD_DEBUG` para diagnostico de alias usados y campos faltantes.

6. Integracion real limitada de `fieldAdapter` en vista Analisis / qa_articulos (solo lectura)
- Alcance aplicado a lectura/render en:
  - `js/qa-analista-registro.js`
- Se incorpora helper dedicado: `js/qa-articulos-fields.js` con `getQaArticulosFieldValue(record, fieldName, defaultValue)`.
- Se mantiene fallback seguro cuando `window.fieldAdapter` no esta cargado.
- Se anade traza opcional por flag `window.QA_ARTICULOS_FIELD_DEBUG` para diagnostico de alias usados y campos faltantes.

7. Tests ejecutados en cierre de fase
- `npm run test:field-registry` -> OK
- `npm run compare:normalized` -> OK (`9 OK / 0 CHECK`)
- `npm test` -> OK (smoke suites en verde)

8. Restricciones respetadas
- No se toco escritura (`/save-json`, `/apply-revision-to-engines`, etc.).
- No se tocaron exportadores.
- No se tocaron analytics.
- No se toco SQLite mirror.
- No se amplio `fieldAdapter` a otras pantallas.
- No se modificaron JSON originales ni normalizados manualmente.

9. Campos adaptados en PN Review (lectura)
- `pn_final`, `pn_excel`, `pn_pdf`
- `designation_final`, `designation_pdf`
- `pos_final`, `qty_final`, `qty_units_final`
- `measure_final`, `norma_final`, `weight_final`, `model_type_final`
- `qa_revision_estado`, `qa_revision_accion`
- `is_subst_final`, `hierarchie_final`, `new_pn_final`, `subst_pnlist_final`
- `source_page`, `engine_model`, `libro_pag`
- `ruta_foto`, `ruta_esquemas_pos`

10. Alias adicionales detectados en PN Review
- `hierarchie_final` <= `sust_hierarchie` / `hierarchie_excel`
- `is_subst_final` <= `sust_status`
- `new_pn_final` <= `sust_new_part_number` / `new_part_number` / `pn_new`
- `subst_pnlist_final` <= `sust_superseded_list`
- `source_page` <= `Source Page` / `page4`
- `pn_final` <= `PART NO.` / `pn`
- `designation_final` <= `DESIGNATION` / `designation_gesa` / `designation_pdf`

11. Incidencias encontradas
- En `test:field-registry` sigue apareciendo warning `MODULE_TYPELESS_PACKAGE_JSON` para modulos ESM (`qa-table.js` y `pn-review-embedded.js`) importados desde tests Node.
- No hay impacto funcional; todos los tests pasan.

12. Deuda tecnica menor
- Evaluar en una fase aparte una estrategia de test ESM sin cambiar el comportamiento global de modulos del proyecto (evitando introducir riesgo transversal en runtime y scripts existentes).

13. Validacion de cierre (fases PN Review + Analisis read-only)
- `npm run test:field-registry` -> OK
- `npm run compare:normalized` -> OK (`9 OK / 0 CHECK`)
- `npm test` -> OK

14. Campos priorizados en Analisis / qa_articulos (lectura)
- `source_page`, `engine_model`, `pn_final`, `designation_final`, `pos_final`
- `qty_final`, `qty_units_final`, `weight_final`, `measure_final`, `norma_final`, `fg_fgs_final`
- `pn_excel`, `designation_excel`, `measure_excel`, `measure_pdf`
- `qa_revision_estado`, `qa_revision_accion`
- `hierarchie_final`, `new_pn_final`, `is_subst_final`, `subst_pnlist_final`
- `ruta_foto`, `ruta_esquemas_pos`, `esquemas`, `esquemas_circulos`, `esquemas_circulos_all`
- `measure_error` (alias de `measurement_error`)

15. Integracion real limitada de `fieldAdapter` en Export Preview / WordPress listados (solo lectura)
- Alcance aplicado a lectura/render en:
  - `js/export-wordpress.js`
- Se incorpora helper dedicado: `js/export-preview-fields.js` con `getExportPreviewFieldValue(record, fieldName, defaultValue)`.
- Se anade helper de clasificacion: `getExportPreviewType(record)` para decidir New/Superseded por jerarquia.
- Se mantiene fallback seguro cuando `window.fieldAdapter` no esta cargado.
- Se anade traza opcional por flag `window.EXPORT_PREVIEW_FIELD_DEBUG` para diagnostico de alias usados y campos faltantes.

16. Regla New / Superseded reafirmada (preview)
- New: `qa_revision_estado=ok` + `qa_revision_accion=importar` y jerarquia distinta de `Superseded`.
- Superseded: `qa_revision_estado=ok` + `qa_revision_accion=importar` y `hierarchie_final/sust_hierarchie = Superseded`.
- Fuente semantica de jerarquia: `hierarchie_final` (fallback `sust_hierarchie`).
- `status` legacy y `sust_status` no deciden clasificacion New/Superseded.

17. Campos priorizados en Export Preview (lectura)
- `pn_final`, `designation_final`, `model_type_final`, `qty_final`, `qty_units_final`, `weight_final`, `measure_final`, `norma_final`, `pos_final`
- `source_page`, `engine_model`, `engine_serie`, `engine_model_short`, `libro_pag`, `categoria`, `fg_fgs_final`, `fg_fgs_excel`
- `ruta_foto`, `ruta_esquemas_pos`, `esquemas`, `esquemas_circulos`, `esquemas_circulos_all`
- `qa_revision_estado`, `qa_revision_accion`
- `is_subst_final`, `hierarchie_final`, `new_pn_final`, `subst_pnlist_final`
- `is_gesa_final`, `designation_gesa`, `nsn_gesa`, `norma_gesa`, `measure_number_gesa`, `weight_number_gesa`, `weight_units_gesa`

18. Alias adicionales detectados en Export Preview
- `pn_final` <= `PART NO.` / `pn` / `sku`
- `source_page` <= `Source Page` / `page4` / `PAG`
- `hierarchie_final` <= `sust_hierarchie` / `SUST_TIPO`
- `new_pn_final` <= `sust_new_part_number` / `new_part_number` / `pn_new` / `new_pn_relacionado`
- `subst_pnlist_final` <= `sust_superseded_list` / `old_pn_relacionados`
- `ruta_foto` <= `filename_foto`
- `ruta_esquemas_pos` <= `exp_imagenes`

19. Restricciones respetadas (Export Preview)
- No se tocaron exportadores WordPress reales ni generadores finales CSV/JSON.
- No se tocaron synthetic scripts ni endpoints backend.
- No se toco escritura ni persistencia QA.
- No se tocaron JSON originales/normalizados, SQLite mirror ni analytics.

20. Deuda tecnica menor
- Persiste warning `MODULE_TYPELESS_PACKAGE_JSON` en tests Node que importan modulos ESM de UI.
- Se mantiene sin cambios globales de tipo de modulo para evitar riesgo transversal.

## Warning MODULE_TYPELESS_PACKAGE_JSON

- Observado en `npm run test:field-registry` al importar `js/qa-table.js` desde test Node.
- Causa: `qa-table.js` usa sintaxis ESM, y Node lo reinterpreta como modulo ES al no existir `type: module` global.
- Decision en esta fase: no cambiar `package.json` ni estructura global de modulos para evitar riesgo transversal.
- Estado: deuda tecnica menor documentada (sin impacto funcional, solo warning de rendimiento en test).

## Decisiones de compatibilidad aplicadas

1. Normalizaciones clave
- `Source Page` -> `source_page`
- `measurement_error` -> `measure_error`
- `isgesa_*` -> `is_gesa_*`

2. Alias de compatibilidad prioritaria
- `pn_final`: acepta `pn_final`, `PART NO.`, `pn_excel`, `pn_raw`.
- `source_page`: acepta `source_page`, `Source Page`, `page4`.
- `is_gesa_excel`: acepta `is_gesa_excel`, `isgesa_excel`, `gesa`.
- `ruta_esquemas_pos`: acepta `ruta_esquemas_pos`, `exp_imagenes`.

3. Derivados legacy
- `page4`, `pages`, `book_set` se tratan como legacy/derivados si existen.

## Seguridad y no regresión

- No se tocaron `qa_milu.html`, exportadores WordPress ni analytics.
- No se eliminaron campos en los JSON originales.
- No se cambió la lógica QA ni estados/acciones.

## Siguiente zona recomendada (sin ampliar alcance funcional)

- Preparar la siguiente integracion limitada en otra zona de lectura acotada (recomendado: vista de detalle/lista QA relacionada con fuentes), repitiendo el mismo patron:
  - adapter-first con fallback legacy,
  - cero cambios de escritura,
  - validacion con test dedicado y smoke final.

## Uso rápido

- Dry run completo:
  - `python scripts/refactor_json_fields.py --all-engines --dry-run --include-legacy`

- Normalización completa:
  - `python scripts/refactor_json_fields.py --all-engines --include-legacy`

- Tests de esta fase:
  - `node --test tests/refactor-json-fields.test.js tests/field-adapter.test.js`

## Cierre formal READ-COMPATIBILITY (2026-05-16)

1. Zonas integradas en modo solo lectura
- MILU QA tabla compacta (`js/qa-table.js`).
- PN Review (`js/pn-review.js`, `js/pn-review-embedded.js`).
- qa_articulos / vista analisis (`js/qa-analista-registro.js`, `js/qa-articulos-fields.js`).
- Export Preview / listados New-Superseded (`js/export-wordpress.js`, `js/export-preview-fields.js`).

2. Validacion ejecutada en cierre formal
- `npm run audit:field-adapter` -> OK.
- `npm run test:field-registry` -> OK.
- `npm run compare:normalized` -> OK (`9 OK / 0 CHECK`).
- `npm test` -> OK (smoke + db + python suites en verde).

3. Estado de warning ESM
- Se mantiene warning `MODULE_TYPELESS_PACKAGE_JSON` en tests Node que importan modulos ESM de UI.
- Estado: deuda tecnica menor conocida, sin impacto funcional en runtime ni en resultados de test.
- Decision: no cambiar `type` global en `package.json` en esta fase para evitar riesgo transversal.

4. Auditoria de lecturas legacy
- Script incorporado: `scripts/audit_field_adapter_usage.py`.
- Salidas:
  - `data/field_adapter_usage_audit.json`
  - `docs/field_adapter_usage_audit.md`
- Resultado consolidado de la corrida actual:
  - Archivos escaneados: 121.
  - Archivos con accesos legacy directos: 55.
  - Matches legacy totales: 489.
  - Riesgo LOW: 172, MEDIUM: 82, HIGH: 113, IGNORE: 122.

5. Recomendacion antes de escritura
- No iniciar fase de escritura compatible mientras existan accesos HIGH en backend/QA-state/synthetic/export.
- Priorizar reduccion de MEDIUM en filtros/conteos/preview para evitar divergencias semanticas por alias legacy.
- Abrir escritura compatible solo cuando HIGH este controlado (o explicitamente acotado) y con tests de no regresion dedicados.
