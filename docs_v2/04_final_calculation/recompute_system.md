# Recompute System

## Objetivo
Describir la orquestacion de recalculate/recompute desde el modal de analista.

## Inputs
- Engine seleccionado o alcance global.
- Flags de backup y alcance (`book`, `all`, `current`).

## Outputs
- JSON actualizados en disco.
- Estado visual de progreso/resumen en UI.

## Scripts implicados
- `js/analista-02.js`.
- Endpoints backend de recompute (`recompute-qa-errors`, `copy-pdf-to-final-all-books`, `recalculate-revision-status`, `api/pdf-preview/apply-to-engine`).

## Endpoints implicados
- `POST /api/pdf-preview/apply-to-engine`
- `POST /copy-pdf-to-final-all-books`
- `POST /recompute-qa-errors`
- `POST /recalculate-revision-status`

## Botones UI relacionados
- `recomputeCopyBookBtn`, `recomputeCalculateFinalBtn`, `recomputeRunBtn`, `recomputeRevisionStatusBtn`.

## Campos afectados
- Todos los de pipeline segun paso (`_pdf`, `_final`, `_error`, `qa_revision_*`).

## Flujo paso a paso
1. Usuario abre modal recompute en `analista_02.html`.
2. UI valida si endpoint es local-only (`isBackendEndpointAllowed`).
3. Ejecuta fetch a endpoint candidato (`postJsonToBackendCandidates`).
4. Actualiza estado y, si procede, recarga libro activo.

## Riesgos / problemas conocidos
- En remoto varios botones quedan bloqueados por restriccion local-only.
- Errores de red en candidatos backend pueden devolver mensajes heterogeneos.

## TODO pendiente
- Exponer en UI un mapa de endpoint efectivo utilizado por cada accion.

## Ejemplo real
- `runBackendCalculateFinal()` en `js/analista-02.js` usa `POST /copy-pdf-to-final-all-books` con `backup: true`.
