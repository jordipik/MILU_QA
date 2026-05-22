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
- OFFICIAL: `POST /copy-pdf-to-final-all-books`
- `POST /recompute-qa-errors`
- `POST /recalculate-revision-status`

## Botones UI relacionados
- `recomputeCopyBookBtn`, `recomputeCalculateFinalBtn`, `recomputeRunBtn`, `recomputeRevisionStatusBtn`.

## MILU V1 - Filtros superiores de RecomputeModal

### Orden visual oficial (modal)
1. Libro (`recomputeEngineSelect`)
2. ID puntual (`recomputeIdInput`)
3. Alcance (`recomputeErrorScopeSelect`)

Nota:
- El selector Libro es un select real con opcion Todos los libros + una opcion por engine.
- El valor inicial intenta heredar el libro activo en la pantalla principal (`engineFilterSelect`).

### Fuente unica de filtros
La UI usa una funcion unica para leer filtros del modal:
- `getRecomputeModalFilters()` en `js/analista-02.js`

Estructura normalizada del objeto:
- `book`
- `scope` (`current|book|all`)
- `page` (reservado, actualmente vacio)
- `id`
- `dryRun` (actualmente `false`)
- `backup` (actualmente `true`)
- `updateRevision`
- `forceRevision`

### Logging minimo por accion
Antes de ejecutar cada accion del modal se registran:
- `console.info('[RecomputeModal] action', actionName)`
- `console.info('[RecomputeModal] filters', filters)`

### Cobertura de filtros por boton (V1)

1) IMPORTAR PDF (`recomputeCopyBookBtn` -> `POST /api/pdf-preview/apply-to-engine`)
- Soporta libro concreto y todos los libros.
- Si alcance es `current`, la UI bloquea la accion con mensaje claro (endpoint no soporta registro puntual).

2) CALCULO FINAL (`recomputeCalculateFinalBtn` -> `POST /copy-pdf-to-final-all-books`)
- Soporta todos los libros o libro concreto.
- Para libro concreto, frontend envia `file` al endpoint oficial.
- Si alcance es `current`, la UI bloquea la accion con mensaje claro.

3) ERRORES (`recomputeRunBtn` -> `POST /recompute-qa-errors`)
- Soporta `current`, `book` y `all`.
- Esta accion queda explicitamente gobernada por los filtros del modal.

4) ESTADOS (`recomputeRevisionStatusBtn` -> `POST /recalculate-revision-status`)
- Actualmente solo soporta todos los libros.
- Si se intenta libro concreto o `current`, la UI muestra aviso y no ejecuta.

## Limitaciones actuales (sin refactor grande)
- No se cambian reglas de calculo.
- No se cambian endpoints oficiales.
- `page` queda reservado para futuro (sin uso operativo en V1).

## Campos afectados
- Todos los de pipeline segun paso (`_pdf`, `_final`, `_error`, `qa_revision_*`).

## Flujo paso a paso
1. Usuario abre modal recompute en `analista_02.html`.
2. UI valida si endpoint es local-only (`isBackendEndpointAllowed`).
3. Ejecuta fetch a endpoint candidato (`postJsonToBackendCandidates`).
4. Para FINAL usa FINAL_FIELDS_V1 oficial en backend, con prioridad simple por campo.
5. Actualiza estado y, si procede, recarga libro activo.

## Riesgos / problemas conocidos
- En remoto varios botones quedan bloqueados por restriccion local-only.
- Errores de red en candidatos backend pueden devolver mensajes heterogeneos.

## TODO pendiente
- Exponer en UI un mapa de endpoint efectivo utilizado por cada accion.

## Ejemplo real
- `runBackendCalculateFinal()` en `js/analista-02.js` usa `POST /copy-pdf-to-final-all-books` con `backup: true` y ya no documenta la regla legacy basada en `gesa=SI`.
