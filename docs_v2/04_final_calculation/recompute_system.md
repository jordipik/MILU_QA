# Recompute System

## Objetivo
Describir la orquestacion de recalculate/recompute desde el modal de analista.

## Inputs
- Libro seleccionado (`recomputeBookSelect`) o todos los libros (`all`).
- ID puntual opcional (`recomputeIdInput`).

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
1. Libro (`recomputeBookSelect`)
2. ID puntual (`recomputeIdInput`)

Nota:
- El selector Libro es un select real con opcion Todos los libros + una opcion por engine.
- El valor inicial intenta heredar el libro activo en la pantalla principal (`engineFilterSelect`).

### Fuente unica de filtros
La UI usa una funcion unica para leer filtros del modal:
- `getRecomputeModalFilters()` en `js/analista-02.js`

Estructura normalizada del objeto:
- `book`
- `id`

### Logging minimo por accion
Antes de ejecutar cada accion del modal se registran:
- `console.info('[RecomputeModal] action', actionName)`
- `console.info('[RecomputeModal] filters', filters)`

### Cobertura de filtros por boton (V1)

1) IMPORTAR PDF (`recomputeCopyBookBtn` -> `POST /api/pdf-preview/apply-to-engine`)
- Soporta libro concreto y todos los libros.
- `id` no participa en este endpoint.

2) CALCULO FINAL (`recomputeCalculateFinalBtn` -> `POST /copy-pdf-to-final-all-books`)
- Soporta todos los libros o libro concreto.
- Para libro concreto, frontend envia `file` al endpoint oficial.
- `id` no participa en este endpoint.

3) ERRORES (`recomputeRunBtn` -> `POST /recompute-qa-errors`)
- Deriva alcance desde los dos filtros del modal:
	- `book=all` + `id=''` -> `scope=all`
	- `book=<MODEL>` + `id=''` -> `scope=book`
	- `book=<MODEL>` + `id=<VALOR>` -> `scope=current`
- La combinacion `book=all` + `id=<VALOR>` se bloquea en UI para evitar payload ambiguo.

4) ESTADOS (`recomputeRevisionStatusBtn` -> `POST /recalculate-revision-status`)
- Actualmente solo soporta todos los libros.
- Si se intenta libro concreto o `id` puntual, la UI muestra aviso y no ejecuta.

## Limitaciones actuales (sin refactor grande)
- No se cambian reglas de calculo.
- No se cambian endpoints oficiales.
- El modal superior no expone controles de alcance/pagina/rango.

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
