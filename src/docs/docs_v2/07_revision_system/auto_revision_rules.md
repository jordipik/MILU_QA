# Auto Revision Rules

## Objetivo
Documentar reglas automaticas usadas al recalcular QA revision.

## Inputs
- `has_error`, `total_error`, estado/accion actuales, banderas `updateRevision` y `forceRevision`.

## Outputs
- Estado/accion recalculados por registro cuando aplica.

## Scripts implicados
- `recompute_engine_errors.js` (`applyToRow`).

## Endpoints implicados
- `POST /recompute-qa-errors`
- `POST /recalculate-revision-status`

## Botones UI relacionados
- `recomputeRunBtn` (con opciones de revision).
- `recomputeRevisionStatusBtn`.

## Campos afectados
- `qa_revision_estado`, `qa_revision_accion`.

## Flujo paso a paso
1. Si registro ruido/footer (`C_NOISE_FOOTER` o `status=NOISE`) -> `ok/eliminar`.
2. Si `has_error=true`:
   - por defecto `pendiente/revisar`.
   - si ya estaba manualmente `ok/revisado`, se respeta salvo `forceRevision=true`.
3. Si `has_error=false` -> `ok/importar`.

## Riesgos / problemas conocidos
- Clasificacion de ruido depende de campos semanticos (`criterio_pn`, `status`) que pueden no estar homogeneos.

## TODO pendiente
- Normalizar estados historicos (`revisado`, variantes de mayusculas/acentos).

## Ejemplo real
- `applyToRow` en `recompute_engine_errors.js` contiene estas tres ramas de asignacion QA.
