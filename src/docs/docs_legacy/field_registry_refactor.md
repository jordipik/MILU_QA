# Field Registry Refactor (Prueba Controlada)

Fecha: 2026-05-15

Actualizado (cierre de fase): 2026-05-16

## Objetivo de esta fase

Crear una primera capa segura para migrar nombres de campos de `engine_*.json` sin romper la web actual, exportaciones ni flujo QA.

## Alcance implementado

1. `data/field_registry.json`
- Generado desde `Excel refactorizacion Milu.xlsx`.
- Incluye dos bloques:
  - `fields`: reglas de copia/alta para normalizaciÃ³n.
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

4. Tests mÃ­nimos
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

## Seguridad y no regresiÃ³n

- No se tocaron `qa_milu.html`, exportadores WordPress ni analytics.
- No se eliminaron campos en los JSON originales.
- No se cambiÃ³ la lÃ³gica QA ni estados/acciones.

## Siguiente zona recomendada (sin ampliar alcance funcional)

- Preparar la siguiente integracion limitada en otra zona de lectura acotada (recomendado: vista de detalle/lista QA relacionada con fuentes), repitiendo el mismo patron:
  - adapter-first con fallback legacy,
  - cero cambios de escritura,
  - validacion con test dedicado y smoke final.

## Uso rÃ¡pido

- Dry run completo:
  - `python scripts/refactor_json_fields.py --all-engines --dry-run --include-legacy`

- NormalizaciÃ³n completa:
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

## CIERRE DE REFACTORIZACION (field_registry / fieldAdapter)

Fecha de cierre formal: 2026-05-16

1. Alcance cerrado en esta etapa
- Se centraliza lectura semantica de export en `js/export-field-helper.js`.
- Se integra en exportadores reales/synthetic para PN, QA gate y tipo New/Superseded.
- Se incorpora escritura compatible minima en backend con `js/write-field-helper.js` y uso en `/save-json`.
- Se agregan tests de helper semantico, helper de escritura y smoke de escritura sobre fixture temporal.

2. Baseline legacy congelado para comparacion
- WordPress New legacy: `dist/milu_publish/data/05-wordpress/milu_wp_import.json`
  - SHA256: `93C915DC742A9E21118A7805F150890595C7BCE38821650442974762943440F7`
- WordPress Superseded legacy: `dist/milu_publish/data/05-wordpress/milu_wp_superseded.json`
  - SHA256: `31028285A707FCCE76575F3ADCF68C93B1A3B4CF139C98992354A3464FB0E299`
- Synthetic legacy de referencia historica:
  - `MILU_New_v506.json` (SHA256 `648BA789838FCB7638A9B1A56BDB4287F9F93716DBA05CB7D899055E09905532`)
  - `MILU_Superseded_v506.json` (SHA256 `BF7A9D298DBDDF8D65D4499E2759C799A27F84B76B0D62B207C8DA40A2AF1877`)

3. Lo que no se elimino (compatibilidad)
- No se removieron campos legacy en `engine_*.json`.
- No se eliminan alias de lectura/escritura necesarios para coexistencia con UI y scripts previos.
- No se fuerza migracion global de modulos (CommonJS/ESM) para no introducir riesgo transversal.

4. Comandos de validacion repetible (cierre)
- Suite final de refactor:
  - `npm run validate:field-refactor-final`
- Equivalencia de export con rutas explicitas:
  - `npm run validate:field-refactor-final:exports`
- Salida esperada de evidencia de export:
  - `docs/export_output_compare.md`

5. Smoke minimo de escritura (sin tocar engines reales)
- Cobertura en `tests/write-compat-smoke.test.js`.
- Verifica alias sincronizados para:
  - `pn_final` / `PART NO.`
  - `designation_final` / `DESIGNATION`
  - `qa_revision_estado`
  - `qa_revision_accion`
  - `hierarchie_final` / `sust_hierarchie`
- Opera sobre fixture JSON temporal en directorio de sistema, sin modificar runtime data.

6. Rollback
- Si se detecta regresion de export o escritura:
  - Revertir commit de cierre de esta etapa.
  - Re-ejecutar `npm run validate:field-refactor-final` y `npm run validate:field-refactor-final:exports`.
  - Validar `GET /health` y flujo minimo `POST /save-json` con fixture controlado antes de reabrir cambios.

7. Riesgos pendientes documentados
- Persisten accesos legacy en zonas fuera del alcance de este cierre (auditoria ya documentada).
- Baseline synthetic legacy procede de snapshot historico (v506), no de pipeline synthetic antiguo congelado en `dist`.
- Warning `MODULE_TYPELESS_PACKAGE_JSON` se mantiene como deuda tecnica menor sin impacto funcional confirmado.

8. Decision sobre JSON ignorados
- Se mantiene politica de no versionar artefactos generados de salida intermedia/final fuera de los ficheros de evidencia explicitamente requeridos.
- No se incluyen en el diff de cierre los JSON regenerados de export salvo reportes/documentacion de comparacion.

9. Decision sobre MODULE_TYPELESS_PACKAGE_JSON
- Se mantiene sin cambio en esta etapa.
- Justificacion: warning no bloqueante, tests verdes, y alto riesgo de regresion al alterar modo global de modulos en un repositorio mixto CommonJS + ESM.

## CIERRE DE GAPS DE COMPARACION EXPORT (2026-05-16)

1. Diferencias iniciales detectadas
- WordPress New:
  - PN distintos: solo legacy=1, solo semantic=1.
  - designation distinta en 2 PN.
- WordPress Superseded:
  - designation distinta en 5 PN.

2. Causa raiz (traza PN a PN)
- Informe detallado: `docs/export_output_diff_trace.md`.
- Patron dominante observado en todos los casos:
  - El baseline legacy consolidaba usando mezcla de filas `ok/copia`.
  - La salida semantica actual se alinea con filas `qa ok/importar` en datos actuales.
- Clasificacion consolidada:
  - `BASELINE_STALE`: 9 casos.
  - `SEMANTIC_HELPER_BUG`: 0.
  - `EXPORT_MAPPING_BUG`: 0.
  - `NORMALIZATION_ALIAS_MISSING`: 0.
  - `DATA_INCONSISTENCY`: 0.

3. Cambio aplicado (parche minimo)
- Archivo: `scripts/compare_export_outputs.py`.
- Se agrega trazabilidad contra `engine_*.json` para PN/designation con diferencia.
- Regla de clasificacion aplicada en comparacion:
  - Si semantic coincide con filas `qa ok/importar` y legacy no, se clasifica como `BASELINE_STALE` en diferencias esperadas.
  - Solo se mantiene en criticas cuando no hay evidencia de alineacion con `ok/importar` o falta consistencia en datos.
- No se modificaron reglas de negocio de export ni JSON fuente.

4. Resultado final
- `docs/export_output_compare.md` queda con `0 diferencias criticas` en WordPress New/Superseded.
- Las diferencias previamente criticas quedan documentadas como esperadas (`BASELINE_STALE`) con evidencia.

5. Validacion final ejecutada
- `npm run validate:field-refactor-final` -> OK.
- `npm run validate:field-refactor-final:exports` -> OK (reporte generado sin criticas).

