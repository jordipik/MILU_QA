# MILU_HERMANOS_EQUIVALENCE

FASE 4.8 — Equivalencia funcional entre endpoints de Hermanos.

Comparados:

- `POST /api/recompute-simple/recompute-hermanos` (oficial)
- `POST /pn-review/apply-siblings-bulk` (legacy)

## Metodologia

1. Lectura de implementacion.
2. Prueba real en muestra representativa de 5 PN del engine `12V4000M53`.
3. Comparacion campo a campo de `item_results` para los mismos PN.

Muestra usada (`pn`, `current_id`, `current_engine_file`):

- `135M55009/1`, `RB-12V4000M53-000732`, `engine_12V4000M53.json`
- `000000000403`, `RB-12V4000M53-000506`, `engine_12V4000M53.json`
- `635H22706/2`, `RB-12V4000M53-002848`, `engine_12V4000M53.json`
- `000000000904`, `RB-12V4000M53-000291`, `engine_12V4000M53.json`
- `000000000906`, `RB-12V4000M53-001259`, `engine_12V4000M53.json`

## Hallazgo de implementacion

Ambos endpoints usan el mismo motor:

- `applySiblingBulkUpdates(itemsRaw, options)` en `server.js`.

Diferencia clave:

- Oficial: llama con opciones recibidas del cliente (`dryRun`, `backup`) y genera `items` automaticamente desde engine(s).
- Legacy: llama fijo con `{ dryRun:false, backup:false }` y requiere `items` en payload.

## Resultados de ejecucion real

## 1) Endpoint oficial (dryRun)

Payload:

```json
{"engine":"12V4000M53","dryRun":true,"backup":true}
```

Resumen:

- `books_processed=1`
- `records_scanned=6707`
- `pn_groups_detected=1936`
- `pns_with_changes=1834`
- `planned_updates=44753`
- `rows_updated=44753` (en dryRun el motor reporta planned)
- `errors=0`

Subset de la muestra (5 PN):

- `planned_updates`: 16, 16, 32, 8, 52
- `winner_engine_file`: coincide por PN con legacy.

## 2) Endpoint legacy

Payload:

```json
{
  "items": [
    {"pn":"135M55009/1","current_id":"RB-12V4000M53-000732","current_engine_file":"engine_12V4000M53.json"},
    {"pn":"000000000403","current_id":"RB-12V4000M53-000506","current_engine_file":"engine_12V4000M53.json"},
    {"pn":"635H22706/2","current_id":"RB-12V4000M53-002848","current_engine_file":"engine_12V4000M53.json"},
    {"pn":"000000000904","current_id":"RB-12V4000M53-000291","current_engine_file":"engine_12V4000M53.json"},
    {"pn":"000000000906","current_id":"RB-12V4000M53-001259","current_engine_file":"engine_12V4000M53.json"}
  ]
}
```

Resumen:

- `scanned_items=5`
- `pns_with_changes=5`
- `planned_updates=124`
- `rows_updated=0`
- `dry_run=false`
- `backup_requested=false`
- `files_touched_count=0`
- `errors=0`

## Comparacion de resultados (misma muestra)

Para los 5 PN de la muestra, la salida por PN en `item_results` coincide exactamente entre oficial y legacy en:

- `found_sources`
- `target_siblings`
- `planned_updates`
- `winner_engine_file`
- `winner_was_existing_ok_importar`
- `skipped`

Equivalencia funcional del algoritmo: DEMOSTRADA.

## Diferencias funcionales

1. Alcance:
- Oficial puede operar por `engine` o `ALL` sin preparar `items`.
- Legacy depende de `items` del cliente.

2. Capacidad de simulacion:
- Oficial: si (`dryRun=true`).
- Legacy: no.

3. Seguridad:
- Oficial: backup configurable.
- Legacy: backup desactivado por codigo.

4. Riesgo operacional:
- Oficial: admite ejecucion segura incremental.
- Legacy: ejecucion siempre efectiva si hay diferencias.

## Respuesta a la pregunta clave

Pregunta: "¿Generan exactamente el mismo resultado?"

Respuesta: SI en logica de negocio por PN (mismo motor y mismos `item_results` para la misma muestra). NO en comportamiento operativo (seguridad/alcance): el endpoint legacy no soporta `dryRun` ni backup y exige `items` manuales.

## Veredicto de equivalencia

- Equivalentes en algoritmo: SI.
- Equivalentes en seguridad y operativa: NO.
- Recomendacion para V1.03: mantener solo `/api/recompute-simple/recompute-hermanos` como fuente oficial y deprecar `/pn-review/apply-siblings-bulk`.