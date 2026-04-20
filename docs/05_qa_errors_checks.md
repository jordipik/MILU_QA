# QA Errors: Comprobaciones, Flujo y Estado Actual

Fecha de actualizacion: 2026-04-20
Origen de datos actual de la columna ERR: contadores persistidos en engine_*.json (`*_error`, `total_error`, `has_error`)

## Objetivo actual
Mantener dos planos diferenciados:

- Persistencia operativa de errores por campo en los JSON de motor para pintar ERR de forma estable.
- Evaluacion de checks QA en cliente para diagnostico/analisis y modal de comprobaciones.

El pipeline legacy basado en `qa_errors` y `qa_errors_active` permanece desactivado.

## Modelo de datos por registro

### Campos legacy desactivados
- `qa_errors`
- `qa_errors_active`

Estos campos se eliminan en backend si aparecen durante guardados (`stripLegacyQaFields`).

### Campos QA persistidos activos
- `pos_error`
- `pn_error`
- `designation_error`
- `weight_error`
- `measurement_error`
- `norma_error`
- `bom_error`
- `total_error`
- `has_error`

## Checks actuales
Los checks vigentes se definen en `js/qa-checks.js` (`QA_CHECK_DEFINITIONS`) y se usan para evaluacion runtime:

1. `pos_required`
2. `pos_final_pdf_match`
3. `pn_required`
4. `pn_final_pdf_match`
5. `designation_required`
6. `designation_final_pdf_or_gesa_match`
7. `weight_final_pdf_or_gesa_match`
8. `measurement_final_pdf_or_gesa_match`
9. `norma_final_pdf_or_gesa_match`
10. `bom_final_pdf_match`

Reglas destacadas:
- `WEIGHT`, `MEASUREMENT / STANDARD` y `NORMA`: si final/pdf/gesa estan los tres vacios, el check pasa (no error).

## Flujo actual de uso

### A. Guardado de celdas editables
`POST /save-json` persiste solo el campo editado en el `engine_*.json` correspondiente.

Resultado:
- No recalcula automaticamente `*_error`, `total_error` ni `has_error`.
- Limpia campos legacy `qa_errors` y `qa_errors_active` si existieran.

### B. Recalculo persistente de QA
`POST /recompute-qa-errors` esta activo en backend y ejecuta `recompute_engine_errors.js`.

Resultado:
- Recalcula y guarda `*_error` y `total_error`.
- Sincroniza `has_error` a partir de `total_error > 0`.
- Puede ejecutarse por libro completo o por ID.

### C. Visualizacion en Analista 02
`js/analista-02.js` usa errores persistidos para la columna ERR:

- `FIELD_TO_ERROR_KEY`
- `getStoredFieldErrorCount(...)`
- `getStoredErrorSummary(...)`

La tabla no recalcula ERR desde checks en vivo para pintar cada celda; muestra los contadores ya guardados en JSON.

## Modal y diagnostico runtime
El modal de comprobaciones y otras vistas de diagnostico siguen usando evaluacion runtime desde `js/qa-checks.js`:

- `evaluateRowQaChecks(...)`
- `evaluateQaChecksForField(...)`

Esto sirve para inspeccion funcional, pero no sustituye el recalc persistente cuando se necesita actualizar `*_error`/`total_error` en disco.

## Endpoints y puntos de integracion

Backend:
- `server.js`: `POST /save-json` (activo)
- `server.js`: `POST /recompute-qa-errors` (activo)
- `server.js`: `POST /apply-qa-checks-filter` (legacy desactivado, responde 410)

Frontend:
- `js/qa-checks.js`: definicion y evaluacion runtime de checks
- `js/analista-02.js`: render de ERR desde contadores persistidos y vistas de diagnostico

## Nota operativa
- Si se modifica `server.js`, reiniciar `node server.js`.
- Si tras ediciones de datos finales la ERR no refleja el estado esperado, ejecutar recalc (`/recompute-qa-errors` o script CLI) para resincronizar contadores persistidos.

## Automatizacion por scripts (sin runtime de comparacion)
Script nuevo:
- `node scripts/qa_pdf_compare.js --file=engine_XXXX.json`

Opciones principales:
- `--id=<ID>`: procesa un solo registro.
- `--write-pdf`: persiste campos `*_pdf` detectados desde el PDF.
- `--recompute-errors`: tras persistir PDF, recalcula `*_error`, `total_error` y `has_error`.
- `--no-backup`: evita crear backup `.backup` del engine.

Flujo recomendado para pipeline batch:
1. Ejecutar `qa:pdf-compare:write` por cada `engine_*.json`.
2. Revisar `qa_pdf_compare_*.json` generado (auditoria RAW/GESA/FINAL/PDF por campo).
3. Abrir Analista 02 solo para revision visual, no para calcular ni guardar errores.
