# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# ANALISIS RECOMPUTE MODAL ERRORES

## 1. Flujo actual de la opcion 3 del recomputeModal

### Antes del cambio
- UI: `analista_02.html` tarjeta 3 (`#recomputeRunBtn`) mostraba "Calcular errores" y el texto indicaba libro seleccionado.
- Handler: `js/analista-02.js` enlazaba `bindClick('recomputeRunBtn', () => runBackendRecompute())`.
- Funcion ejecutada: `runBackendRecompute()` hacia `POST /recompute-qa-errors`.
- Alcance real:
  - con `id` -> un registro individual (`mode: single-id`)
  - sin `id` -> un libro (`mode: full-book`)
  - no existia modo todos los libros porque backend exigia `file`
- Motor real de persistencia: `recompute_engine_errors.js::computeErrorPayload()` + `applyToRow()`.
- Escritura: si habia cambios, escribia sobre el `engine_*.json` y hacia backup `.backup` del archivo.
- Revision manual: la opcion 3 no activaba `updateRevision`; por tanto no tocaba `qa_revision_estado` ni `qa_revision_accion` salvo si otro flujo llamaba el mismo endpoint con `updateRevision=true`.

### Despues del cambio
- UI: la opcion 3 tiene selector de alcance explicito `current | book | all`.
- Handler: sigue siendo `runBackendRecompute()`, pero ahora envia `scope` al backend.
- Backend: `POST /recompute-qa-errors` acepta:
  - `scope=current` -> requiere `file` + `id`
  - `scope=book` -> requiere `file`
  - `scope=all` -> recorre los 9 `engine_*.json` permitidos
- Guard de seguridad UI: `if (recomputeErrorsInFlight) return null;`
- Respuesta backend: devuelve resumen agregado por libros, registros, errores, tipos de error y top de reglas.
- Logs UI: `console.groupCollapsed('[MILU][recomputeModal][errors]')` con scope, libros, registros, errores, warnings y tiempo.
- Resumen visual: el modal muestra libros procesados, registros procesados, registros con errores, errores por tipo y top 10 reglas.

## 2. Funciones relacionadas con calculo de errores

### Motor persistido de la accion 3
- `js/analista-02.js::runBackendRecompute()`
  - Orquesta la llamada HTTP al backend.
  - Ahora soporta `scope=current|book|all`.
- `server.js::POST /recompute-qa-errors`
  - Valida payload y despacha a recÃ¡lculo por libro o global.
- `recompute_engine_errors.js::recomputeEngineErrors()`
  - Recalcula y persiste un `engine_*.json` o un ID puntual.
- `recompute_engine_errors.js::recomputeAllEngineErrors()`
  - Nuevo agregador global sobre los 9 libros permitidos.
- `recompute_engine_errors.js::applyToRow()`
  - Aplica `computeErrorPayload()` y opcionalmente actualiza `qa_revision_*`.
- `recompute_engine_errors.js::computeErrorPayload()`
  - Calcula los contadores `*_error`, `total_error` y base de `has_error`.

### Reglas visuales QA, no usadas por la opcion 3 para persistir
- `js/qa-checks.js::evaluateRowQaChecks()`
  - Evalua checks QA para UI y visualizacion.
  - No escribe en disco.
- `js/qa-checks.js::evaluateQaChecksForField()`
  - Version por campo para resaltar checks en UI.
- `js/helpers.js`
  - Consume `evaluateRowQaChecks()` para estados visuales.
- `js/qa-milu.js`
  - Consume `evaluateRowQaChecks()` para resumen y modal QA.
- `js/pdf-viewer.js`
  - Consume `evaluateRowQaChecks()` para overlays/celdas QA.

### RecÃ¡lculo local en memoria, no usado por la opcion 3 para persistir
- `js/error-recalc.js::ERROR_RULES`
  - 12 reglas de diagnostico mixtas (`error` y `warning`).
- `js/error-recalc.js::detectRecordErrors()`
  - Evalua reglas locales.
- `js/error-recalc.js::runInMemoryRecalculation()`
  - Produce un resumen local; no escribe JSON.
- `js/analista-02.js::runLocalRecalculation()`
  - Usa `runInMemoryRecalculation()` y renderiza `localRecalcSummary`.

## 3. Leyes del motor persistido real de la opcion 3

Estas son las reglas que realmente alimentan `*_error`, `total_error` y `has_error` en los `engine_*.json`.

| Regla / ley | Funcion | Campos revisados | Regla aplicada | Ejemplo de error generado | Bloqueante o aviso | Afecta `qa_revision_*` | Afecta exportacion o visualizacion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pos_required` | `computeErrorPayload()` | `pos_final` | `pos_final` no puede estar vacio | `pos_error += 1` | Bloqueante | Solo si luego se llama con `updateRevision=true` o paso 4 | Visualizacion directa; exportacion solo indirecta via QA humana |
| `pos_final_pdf_match` | `computeErrorPayload()` | `pos_final`, `pos_pdf`/`POS` | si hay PDF, debe coincidir exactamente con final | `pos_error += 1` | Bloqueante | Igual que arriba | Igual que arriba |
| `pn_required` | `computeErrorPayload()` | `pn_final` | `pn_final` no puede estar vacio | `pn_error += 1` | Bloqueante | Igual | Igual |
| `pn_final_pdf_match` | `computeErrorPayload()` | `pn_final`, `pn_pdf`/`PART NO.` | final debe coincidir con PDF cuando existe | `pn_error += 1` | Bloqueante | Igual | Igual |
| `designation_required` | `computeErrorPayload()` | `designation_final` | `designation_final` no puede estar vacio | `designation_error += 1` | Bloqueante | Igual | Igual |
| `designation_final_pdf_or_gesa_match` | `computeErrorPayload()` | `designation_final`, `designation_pdf`/`DESIGNATION`, `designation_gesa` | final debe coincidir con PDF o con GESA | `designation_error += 1` | Bloqueante | Igual | Igual |
| `model_type_final_pdf_match` | `computeErrorPayload()` | `model_type_final`, `model_type_pdf`/`MODEL/TYPE` | si hay PDF, debe coincidir con final | `model_type_error += 1` | Bloqueante | Igual | Igual |
| `qty_final_pdf_match` | `computeErrorPayload()` | `qty_final`, `qty_pdf`/`QTY` | si hay PDF, debe coincidir con final | `qty_error += 1` | Bloqueante | Igual | Igual |
| `units_final_pdf_match` | `computeErrorPayload()` | `units_final`, `units_pdf`/`UNITS` | si hay PDF, debe coincidir con final | `units_error += 1` | Bloqueante | Igual | Igual |
| `weight_final_pdf_or_gesa_match` | `computeErrorPayload()` | `weight_final`, `weight_pdf`/`WEIGHT`, `weight_gesa`, `units` | final debe coincidir con PDF o GESA | `weight_error += 1` | Bloqueante | Igual | Igual |
| `fn_final_pdf_match` | `computeErrorPayload()` | `fn_final`, `fn_pdf`/`FN` | si hay PDF, debe coincidir con final | `fn_error += 1` | Bloqueante | Igual | Igual |
| `measure_final_pdf_or_gesa_match` | `computeErrorPayload()` | `measure_final`/`measurement_final`, `measure_pdf`/`MEASUREMENT / STANDARD`, `dimensions_gesa`/`measure_gesa` | final debe coincidir con PDF o GESA | `measure_error += 1` | Bloqueante | Igual | Igual |
| `fg_fgs_final_pdf_match` | `computeErrorPayload()` | `fg_fgs_final`, `fg_fgs_pdf`/`FG/FGS` | si hay PDF, debe coincidir con final | `fg_fgs_error += 1` | Bloqueante | Igual | Igual |
| `bom_final_pdf_match` | `computeErrorPayload()` | `bom_final`/`BOM-No.`, `bom_pdf` | si hay PDF, debe coincidir con final | `bom_error += 1` | Bloqueante | Igual | Igual |
| `norma_final_pdf_or_gesa_match` | `computeErrorPayload()` | `norma_final`, `norma_pdf`/`norma_raw`/`norma`, `norma_gesa` | final debe coincidir con PDF o GESA; si todo vacio, pasa | `norma_error += 1` | Bloqueante | Igual | Igual |
| `total_error` | `computeErrorPayload()` | todos los `*_error` anteriores | suma de fallos por campo | `total_error > 0` | Bloqueante | Base para paso 4 y para `has_error` | Visualizacion directa |
| `has_error` | `applyToRow()` | `total_error` | `has_error = total_error > 0` | `has_error=true` | Bloqueante de facto | Base para paso 4, no cambia QA por si solo | Visualizacion directa y filtros |

### Observacion importante
- El motor persistido real **no** usa `qa-checks.js` ni `error-recalc.js`.
- El motor persistido real **no** genera warnings separados; todo lo que cuenta aqui entra como error acumulado.
- El motor persistido real hoy cubre `POS`, `PART NO.`, `DESIGNATION`, `MODEL/TYPE`, `QTY`, `UNITS`, `WEIGHT`, `FN`, `MEASUREMENT / STANDARD`, `FG/FGS`, `BOM-No.` y `NORMA`.
- No genera `gesa_error`, `nsn_error` ni `normalizado_error` desde `recompute_engine_errors.js`, aunque existan referencias UI a otras columnas `_error`.

## 4. Leyes visuales QA en `qa-checks.js`

Estas reglas se usan para checks QA de UI y resumenes, pero no son el motor persistido de la opcion 3.

| Codigo | Campo | Regla | Severidad real en UI | Escribe JSON | Afecta `qa_revision_*` | Exportacion |
| --- | --- | --- | --- | --- | --- | --- |
| `pos_required` | `POS` | `pos_final` lleno | critical | No | No | No directo |
| `pos_final_pdf_match` | `POS` | final coincide con PDF | critical | No | No | No directo |
| `pn_required` | `PART NO.` | `pn_final` lleno | critical | No | No | No directo |
| `pn_final_pdf_match` | `PART NO.` | final coincide con PART NO. | critical | No | No | No directo |
| `designation_required` | `DESIGNATION` | `designation_final` lleno | critical | No | No | No directo |
| `designation_final_pdf_or_gesa_match` | `DESIGNATION` | final coincide con PDF o GESA | critical | No | No | No directo |
| `weight_final_pdf_or_gesa_match` | `WEIGHT` | final coincide con PDF o GESA | critical | No | No | No directo |
| `measure_final_pdf_or_gesa_match` | `MEASUREMENT / STANDARD` | final coincide con PDF o GESA | critical | No | No | No directo |
| `norma_final_pdf_or_gesa_match` | `NORMA` | final coincide con PDF o GESA o todo vacio | critical | No | No | No directo |
| `bom_final_pdf_match` | `BOM-No.` | BOM coincide con PDF | critical | No | No | No directo |

## 5. Leyes del recÃ¡lculo local en memoria `error-recalc.js`

Estas reglas son de diagnostico local y no escriben `engine_*.json`.

| Codigo | Campo | Regla | Severidad | Bloqueante o aviso | Afecta `qa_revision_*` | Exportacion o visualizacion |
| --- | --- | --- | --- | --- | --- | --- |
| `missing_pn` | `pn_final` | falta PN final y legacy | error | Bloqueante de diagnostico | No | Solo visualizacion local |
| `missing_designation` | `designation_final` | falta designation final con PN presente | error | Bloqueante de diagnostico | No | Solo visualizacion local |
| `missing_qty` | `qty_final` | falta qty final con articulo | warning | Aviso | No | Solo visualizacion local |
| `missing_measurement` | `measurement_final` | falta measurement final con PDF/GESA | warning | Aviso | No | Solo visualizacion local |
| `suspicious_pn_format` | `pn_final` | formato sospechoso | warning | Aviso | No | Solo visualizacion local |
| `pn_designation_merged` | `pn_final` | PN y designation posiblemente fusionados | warning | Aviso | No | Solo visualizacion local |
| `unknown_fn` | `FN` | FN no reconocida | warning | Aviso | No | Solo visualizacion local |
| `fn_merged_measurement` | `FN` | FN posiblemente fusionada con measurement | warning | Aviso | No | Solo visualizacion local |
| `no_real_image` | `exp_imagenes` | sin imagen real o placeholder | warning | Aviso | No | Solo visualizacion local |
| `estado_accion_incoherence` | `qa_revision_estado` | `ok + revisar` | warning | Aviso | No | Solo visualizacion local |
| `import_with_errors` | `qa_revision_accion` | importar con `total_error > 0` | error | Bloqueante de diagnostico | No | Solo visualizacion local |
| `eliminar_in_export_candidates` | `qa_revision_accion` | eliminar pero candidato a export | warning | Aviso | No | Solo visualizacion local |

## 6. Relacion con `qa_revision_estado` y `qa_revision_accion`

- Accion 3 del modal, en su uso normal, recalcula errores y persiste `*_error`, `total_error` y `has_error`.
- Accion 3 **no** toca `qa_revision_estado` ni `qa_revision_accion` por defecto porque `recomputeUpdateRevisionInput` va a `false`.
- `recompute_engine_errors.js::applyToRow()` solo modifica `qa_revision_*` si se invoca con `updateRevision=true`.
- El paso 4 del modal (`ESTADOS`) es el flujo explicito para recalcular `qa_revision_estado` y `qa_revision_accion` desde el resultado de errores.
- Seguridad aplicada en esta tarea: no se altero el comportamiento por defecto para revisiones manuales; no se pisan estados manuales sin pedirlo via `updateRevision`/`forceRevision`.

## 7. Relacion con exportacion

- El calculo de errores del paso 3 afecta directamente a:
  - `*_error`
  - `total_error`
  - `has_error`
  - filtros y visualizacion QA
- No afecta directamente a la exportacion WordPress.
- El impacto en exportacion es indirecto, via decision humana o via paso 4 si alguien recalcula `qa_revision_estado`/`qa_revision_accion` y despues exporta usando esos campos QA.

## 8. Confirmacion de alcance

### Antes de esta tarea
- Opcion 3 podia calcular sobre:
  - 1 registro si habia `id`
  - 1 libro si no habia `id`
  - NO podia calcular sobre todos los libros

### Ahora
- Opcion 3 puede calcular sobre:
  - `Registro actual`
  - `Libro actual`
  - `Todos los libros`

## 9. Seguridad de escritura

- Si el recÃ¡lculo persiste cambios en `engine_*.json`, el backend hace backup por archivo usando sufijo `.backup`.
- El recÃ¡lculo local en memoria (`error-recalc.js`) no escribe nada en disco.
- En esta tarea no se cambiaron reglas para forzar revisiones manuales; eso sigue requiriendo confirmacion implicita del flujo que activa `updateRevision=true`.

