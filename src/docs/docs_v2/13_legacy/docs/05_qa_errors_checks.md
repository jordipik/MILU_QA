# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# QA Errors: Comprobaciones, Flujo y Estado Actual

Fecha de actualizacion: 2026-04-20
Origen de datos actual: checks calculados en cliente segun los valores finales, PDF y GESA cuando aplica

## Objetivo actual
El sistema actual ya no persiste qa_errors ni qa_errors_active dentro de los engine_*.json.

Los checks activos se calculan bajo demanda en la UI a partir de los campos del registro y del contexto PDF cargado cuando corresponde.

Esto permite:
- eliminar metadatos legacy incrustados en los JSON de motor
- evitar que /save-json reescriba campos QA derivados en disco

## Modelo de datos por registro

Ya no existen los campos persistidos qa_errors ni qa_errors_active en engine_*.json.

Los registros solo guardan datos fuente y finales. El estado ERR se deriva en runtime.

## Checks actuales
Los checks vigentes para ERR se definen en js/qa-checks.js y se evalÃºan en cliente.

1. pos_required
2. pos_final_pdf_match
3. pn_required
4. pn_final_pdf_match
5. designation_required
6. designation_final_pdf_or_gesa_match
7. weight_final_pdf_or_gesa_match
8. measure_final_pdf_or_gesa_match
9. norma_final_pdf_or_gesa_match
10. bom_final_pdf_match

Implementacion principal:
- js/qa-checks.js: QA_CHECK_DEFINITIONS
- js/qa-checks.js: evaluateRowQaChecks
- js/qa-checks.js: evaluateQaChecksForField
- js/analista-02.js: consume la evaluacion central para la columna ERR

## Flujo actual de uso

### A. Guardado de campos editables
POST /save-json solo persiste el valor editado en el engine_*.json correspondiente.

Resultado:
- no se recalculan ni se guardan campos QA derivados

### B. Evaluacion de checks
Los checks se resuelven en cliente cuando la UI necesita pintar el estado ERR o validar una fila abierta.

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

## Tabla y rendimiento
La columna Error y el filtro Con error / Sin error deben trabajar con calculo local, sin persistencia auxiliar en disco.

Estado actual:
- no existe persistencia de qa_errors en engine_*.json
- cualquier soporte restante a qa_errors o qa_errors_active debe considerarse legacy

Objetivo de esta arquitectura:
- mantener los JSON limpios de estado derivado

## Endpoints y puntos de integracion

Backend:
- server.js: POST /save-json
- server.js: POST /recompute-qa-errors desactivado
- server.js: POST /apply-qa-checks-filter desactivado

Frontend:
- js/qa-checks.js: definicion central de checks ERR
- js/analista-02.js: consumo visual de checks ERR

## Nota operativa
Si se modifica server.js:
- reiniciar node server.js

Si alguna UI intenta llamar a /recompute-qa-errors o /apply-qa-checks-filter, el backend respondera como funcionalidad legacy desactivada.

