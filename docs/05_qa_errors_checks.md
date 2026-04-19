# QA Errors: Comprobaciones, Flujo y Estado Actual

Fecha de actualizacion: 2026-04-17
Origen de datos base: campo qa_errors persistido en los 8 archivos engine_*.json
Origen de datos activo para UI: campo derivado qa_errors_active persistido tras aplicar checks desde el modal

## Objetivo actual
El sistema de errores QA ya no depende de recalculo intensivo durante el filtrado de tabla.

Ahora hay dos capas diferenciadas:
- qa_errors: conjunto completo de errores calculados para cada registro
- qa_errors_active: subconjunto derivado segun las comprobaciones activas seleccionadas por el usuario

Esto permite:
- recalcular el conjunto completo una sola vez en backend
- aplicar un filtro de checks desde la UI sin recomputar por fila en cada render
- mostrar estadisticas y ficha del registro usando el mismo subconjunto activo
- acelerar el filtro Con error / Sin error de la tabla

## Modelo de datos por registro

### 1. Campo persistido base: qa_errors
Se guarda en cada registro y representa el conjunto completo de errores conocidos.

Estructura conceptual:
- version
- severity
- codes
- fields
- issues
- updated_at

### 2. Campo persistido derivado: qa_errors_active
Se guarda en cada registro cuando el usuario aplica checks desde el modal Comprobaciones QA.

Representa solo los errores activos para la seleccion actual de checks.

Estructura conceptual:
- version
- severity
- codes
- fields
- issues
- signature
- updated_at

El campo signature identifica exactamente el conjunto de checks activos usado para generar qa_errors_active.

## Reglas persistidas en backend
Estas reglas se calculan en qa_errors y se guardan en cada registro.

1. missing_part_no
2. missing_pos
3. missing_pn_final
4. pn_final_not_in_pdf
5. missing_designation_final
6. designation_final_not_in_pdf

Implementacion principal:
- qa_errors.js: validateRow
- qa_errors.js: applyQaErrorsToRows
- qa_errors.js: applyActiveQaErrorsToRows
- qa_errors.js: recomputeQaErrorsInFile
- qa_errors.js: getQaErrorsStats

La comprobacion pn_final_not_in_pdf busca el valor de pn_final en el PDF asignado (pagina indicada en Source Page). Usa tokenMatches con allowContains: true si el PN tiene 6+ caracteres, de modo que un pn_final sin prefijo (ej. 912760297039) se considera presente si el PDF contiene la forma con prefijo (ej. 0023912760297039).

La comprobacion designation_final_not_in_pdf usa el PDF asignado al registro segun source_file o engine_model y comprueba la pagina indicada en Source Page.

Nota:
- si existe qa_errors_active y su signature coincide con los checks activos, la UI prioriza ese campo derivado
- si no coincide, helpers hace fallback a qa_errors + filtrado por codigos activos

## Flujo actual de uso

### A. Recalculo base completo
Se produce en estos casos:
- POST /save-json al guardar una celda editable
- POST /recompute-qa-errors para recálculo masivo completo
- npm run errors:rebuild para rebuild offline de todos los engine_*.json

Resultado:
- se actualiza qa_errors en disco

### B. Aplicacion de checks activos desde la UI
El usuario abre el modal Comprobaciones QA desde el menu superior.

Al pulsar Aplicar filtro:
- el frontend envia activeCodes al endpoint POST /apply-qa-checks-filter
- el backend recalcula qa_errors completo por archivo
- el backend genera qa_errors_active para cada registro con la firma de checks activa
- el backend guarda los JSON en disco
- el backend devuelve estadisticas agregadas del subconjunto activo
- el frontend actualiza su estado en memoria y rerenderiza la tabla

Resultado:
- la tabla, la ficha y las estadisticas trabajan sobre el mismo subconjunto activo

## Estadisticas del modal
El modal Comprobaciones QA muestra:
- total de registros
- registros con errores activos
- registros sin errores activos
- registros con severidad critical activa
- desglose por comprobacion activa (codeCount)

Importante:
- estas estadisticas no son una foto historica fija del sistema
- dependen de los checks activos aplicados en ese momento
- por tanto cambian cuando cambia activeCodes

## Ficha del registro
La ficha lateral y el modal de edicion del registro muestran:
- resumen de severidad o estado sin errores activos
- listado detallado de incidencias activas del registro
- campos implicados cuando existen en issues.fields

La ficha prioriza qa_errors_active si su signature coincide con la seleccion activa.

## Tabla y rendimiento
La columna Error y el filtro Con error / Sin error ya no deberian forzar recalculo completo de errores por fila.

Estado actual:
- la tabla prioriza qa_errors_active
- si falta ese campo derivado, hace fallback a helpers
- ademas hay cache de metadatos de error por fila en js/qa-table.js

Objetivo de esta arquitectura:
- mover el coste al momento explicito de aplicar checks
- evitar recalculo costoso durante cada filtrado o render de tabla

## Endpoints y puntos de integracion

Backend:
- server.js: POST /save-json
- server.js: POST /recompute-qa-errors
- server.js: POST /apply-qa-checks-filter

Frontend:
- js/qa-milu.js: modal Comprobaciones QA, aplicacion de checks, estadisticas y sincronizacion de qa_errors_active en memoria
- js/qa-table.js: filtro has_error y render de iconos/celdas con prioridad a qa_errors_active
- js/helpers.js: resolucion de errores y fallback entre qa_errors_active y qa_errors

## Nota operativa
Si se modifica server.js o qa_errors.js:
- reiniciar node server.js

Para refrescar el conjunto completo de errores fuera de la UI:
- npm run errors:rebuild

Para actualizar el subconjunto activo usado por la tabla y la ficha:
- abrir el modal Comprobaciones QA
- seleccionar checks
- pulsar Aplicar filtro
