# Recompute Errors

## Objetivo
Documentar la ejecucion operativa del recompute QA persistente a nivel registro/libro/global y su contrato backend.

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
- `pdfRecomputeErrorsBtn` (atajo registro actual; termina usando el mismo endpoint).
- `recomputeErrorsCurrentBtn` (segun configuracion, registro actual o libro completo).

## Campos afectados
- Todos los `*_error`, `total_error`, `has_error` y opcionalmente `qa_revision_*`.

## Contrato de alcance

### scope=current
- Requiere: `file` valido + `id` puntual.
- Backend ejecuta: `recomputeEngineErrors({ file, id, ... })`.
- Modo resultante: `single-id`.

### scope=book
- Requiere: `file` valido.
- Backend fuerza: `id = ''`.
- Backend ejecuta: `recomputeEngineErrors({ file, id: '', ... })`.
- Modo resultante: `full-book`.

### scope=all
- No usa `file`.
- No admite `id` (valida y rechaza si llega).
- Backend ejecuta: `recomputeAllEngineErrors(...)`.
- Modo resultante: `all-books`.

## Flujo paso a paso
1. Frontend lee filtros unificados del modal con `getRecomputeModalFilters()` y registra:
	- `console.info('[RecomputeModal] action', 'ERRORES')`
	- `console.info('[RecomputeModal] filters', filters)`
2. Frontend arma payload desde modal (`runBackendRecompute`).
3. `POST /recompute-qa-errors` valida:
	- `scope` permitido (`current|book|all`)
	- `file` permitido para `current|book`
	- `id` prohibido en `all`
4. Backend enruta a:
	- `recomputeEngineErrors` para `current|book`
	- `recomputeAllEngineErrors` para `all`
5. Motor por fila (`applyToRow`):
	- recalcula `*_error`, `total_error`, `has_error`
	- opcional: si `updateRevision=true`, ajusta `qa_revision_estado/qa_revision_accion`
6. Si `dryRun=false` y hubo cambios:
	- escribe `engine_*.json`
	- crea backup si `backup=true`
7. Devuelve resumen operativo a UI.

## Regla de revision (solo cuando updateRevision=true)
- Fila marcada como ruido/footer (`criterio_pn=C_NOISE_FOOTER` o `status=NOISE`):
  - objetivo: `ok + eliminar` (respeta existente salvo `forceRevision=true`).
- Fila con errores (`has_error=true`):
  - objetivo: `pendiente + revisar`.
  - si ya estaba validada manualmente como `ok/revisado`, intenta respetar salvo `forceRevision=true`.
- Fila sin errores (`has_error=false`):
  - objetivo: `ok + importar`.

## Respuesta esperada

### Por libro o ID
- `file`, `mode`, `id`, `dryRun`, `updateRevision`
- `scanned`, `changedRows`, `okRows`, `koRows`
- `wroteFile`, `errorsFound`, `warningsFound`
- `errorTypeCounts`, `warningTypeCounts`, `ruleSummary`

### Global (scope=all)
- `books[]` con resultados por archivo
- `booksProcessed`, `wroteFiles`
- agregados globales: `scanned`, `changedRows`, `okRows`, `koRows`, `errorsFound`

## Riesgos / problemas conocidos
- `scope=all` no admite `id` puntual.
- Para registros manualmente validados en `ok`, reglas intentan respetar decision salvo `forceRevision`.
- `scope=current` con `id` vacio no esta bloqueado estrictamente en backend; UI si lo controla.
- Comparacion de valores por igualdad textual estricta puede generar discrepancias por formato.

## TODO pendiente
- Incluir dry-run detallado por campo para depuracion en UI.

## Relacion con documentacion de reglas
- Reglas campo por campo: ver `docs_v2/06_error_system/error_rules.md`.

## Ejemplo real
- `POST /recompute-qa-errors` admite `scope=current|book|all`.
