# MILU_ESTADOS_EQUIVALENCE

FASE 4.8 — Auditoria de equivalencia del dominio ESTADOS.

Comparados:

- `POST /api/recompute-simple/update-states`
- `POST /recompute-qa-errors` con `updateRevision=true`
- `POST /recalculate-revision-status`

## Metodologia

1. Lectura de endpoint y scripts (`scripts/update_revision_states.js`, `recompute_engine_errors.js`).
2. Ejecucion real controlada sobre 1 registro:
   - `engine=12V4000M53`
   - `id=RB-12V4000M53-000732`
3. Evitada ejecucion de `/recalculate-revision-status` en runtime por ser bulk all-engines sin `dryRun`.

## A) `/api/recompute-simple/update-states`

Implementacion:

- Llama a `updateRevisionStates({engine,id,backup})`.
- Regla de estado:
  - `fn_final == KE` => `ok/eliminar`
  - `has_error || total_error>0` => `pendiente/revisar`
  - resto => `ok/importar`

Ejecucion real:

```json
{"engine":"12V4000M53","id":"RB-12V4000M53-000732","backup":false}
```

Resultado:

- `ok=true`
- `enginesProcessed=1`
- `recordsProcessed=1`
- `updated=0`
- `importar=1`
- `eliminar=0`
- `revisar=0`

## B) `/recompute-qa-errors` + `updateRevision=true`

Implementacion:

- Llama a `recomputeEngineErrors(...)` o `recomputeAllEngineErrors(...)`.
- Primero recalcula errores (`*_error`, `total_error`, `has_error`).
- Si `updateRevision=true`, tambien recalcula `qa_revision_estado/accion`.
- Respeta decision manual `ok/revisado` si `forceRevision=false`.

Ejecucion real:

```json
{
  "scope":"current",
  "file":"engine_12V4000M53.json",
  "id":"RB-12V4000M53-000732",
  "dryRun":true,
  "updateRevision":true,
  "forceRevision":false,
  "backup":false
}
```

Resultado:

- `ok=true`
- `result.mode=single-id`
- `result.dryRun=true`
- `result.scanned=1`
- `result.changedRows=0`
- `result.wroteFile=false`
- `errorsFound=0`

## C) `/recalculate-revision-status`

Implementacion observada en `server.js`:

- Recorre los 9 `engine_*.json`.
- Para cada engine ejecuta `recomputeEngineErrors({ dryRun:false, updateRevision:true, forceRevision:false, backup:true })`.
- Acumula `totalRecords` y `changedRecords`.

Caracteristicas:

- No acepta payload de alcance.
- No soporta `dryRun`.
- Siempre modo bulk all-engines.

## Equivalencia funcional

## `update-states` vs `recompute-qa-errors(updateRevision=true)`

- NO son equivalentes puros.
- `update-states` solo decide estado/accion usando `has_error`/`total_error` existentes.
- `recompute-qa-errors` recalcula errores y, opcionalmente, tambien estado/accion.
- Si `has_error` esta desactualizado, ambos pueden divergir.

## `recalculate-revision-status` vs `recompute-qa-errors(updateRevision=true)`

- SI son casi equivalentes en logica de estado cuando se usa `scope=all`, `dryRun=false`, `updateRevision=true`, `forceRevision=false`, `backup=true`.
- Diferencia: `/recalculate-revision-status` fija esos parametros y no permite control fino.

## `update-states` vs `recalculate-revision-status`

- NO equivalentes: uno es dedicado y parametrizable por engine/id; el otro es bulk global y mezcla responsabilidades al depender de recompute de errores.

## Fuente real de verdad

Pregunta: "¿Que endpoint es realmente la fuente de verdad?"

Respuesta:

- Fuente oficial de verdad para estado/accion en V1.03: `/api/recompute-simple/update-states`.
- Fuente de verdad para recalculo de errores QA: `/recompute-qa-errors`.
- `/recalculate-revision-status` es un atajo legacy de alcance global, no una fuente canónica.

## Riesgo y recomendacion

1. Riesgo de duplicidad: mantener dos formas de recalcular estado (update-states y recompute-qa-errors con updateRevision) causa resultados dependientes del orden de ejecucion.
2. Recomendacion funcional:
   - Paso 6: `/recompute-qa-errors` (sin actualizar revision, idealmente `updateRevision=false`).
   - Paso 7: `/api/recompute-simple/update-states`.
   - Deprecar `/recalculate-revision-status` como endpoint operativo.