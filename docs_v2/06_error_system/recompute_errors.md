# Recompute Errors

## Objetivo
Documentar la ejecucion operativa del recalc de errores a nivel registro/libro/global.

## Inputs
- Payload endpoint: `scope`, `file`, `id`, `dryRun`, `updateRevision`, `forceRevision`, `backup`.

## Outputs
- Resultado de recompute por alcance.
- JSON actualizado si no es dry-run.

## Scripts implicados
- `recompute_engine_errors.js` (funciones `recomputeEngineErrors`, `recomputeAllEngineErrors`).

## Endpoints implicados
- `POST /recompute-qa-errors`.

## Botones UI relacionados
- `recomputeRunBtn`.

## Campos afectados
- Todos los `*_error`, `total_error`, `has_error` y opcionalmente `qa_revision_*`.

## Flujo paso a paso
1. Backend valida scope y archivo permitido.
2. Ejecuta recompute por libro o todos los libros.
3. Si `updateRevision=true`, recalcula tambien `qa_revision_estado/accion`.
4. Devuelve resumen (`scanned`, `changedRows`, etc.) a UI.

## Riesgos / problemas conocidos
- `scope=all` no admite `id` puntual.
- Para registros manualmente validados en `ok`, reglas intentan respetar decision salvo `forceRevision`.

## TODO pendiente
- Incluir dry-run detallado por campo para depuracion en UI.

## Ejemplo real
- `POST /recompute-qa-errors` admite `scope=current|book|all`.
