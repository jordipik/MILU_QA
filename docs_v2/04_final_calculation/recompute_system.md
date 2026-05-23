# Recompute System

## Objetivo
Describir la orquestacion de recalculate/recompute desde `analista_02.html` y desde la pagina operativa `recompute_simple.html`, incluyendo el flujo destructivo de vaciado.

## Inputs
- Libro seleccionado (`recomputeBookSelect`) o todos los libros (`all`).
- ID puntual opcional (`recomputeIdInput`).

## Outputs
- JSON actualizados en disco.
- Estado visual de progreso/resumen en UI.

## Scripts implicados
- `js/analista-02.js`.
- `recompute_simple.html`.
- `js/recompute-simple.js`.
- Endpoints backend de recompute (`recompute-qa-errors`, `copy-pdf-to-final-all-books`, `recalculate-revision-status`, `api/pdf-preview/apply-to-engine`).

## Endpoints implicados
- `POST /api/pdf-preview/apply-to-engine`
- OFFICIAL: `POST /copy-pdf-to-final-all-books`
- `POST /recompute-qa-errors`
- `POST /recalculate-revision-status`
- `POST /clear-engine-fields`

## Botones UI relacionados
- `recomputeCopyBookBtn`, `recomputeCalculateFinalBtn`, `recomputeRunBtn`, `recomputeRevisionStatusBtn`.
- En `recompute_simple.html`: `btnImportPdf`, `btnFinal`, `btnErrors`, `btnStatuses`, `btnClearPdfFinal`.

## MILU V1 - Filtros superiores de RecomputeModal

### Orden visual oficial (modal)
1. Libro (`recomputeBookSelect`)
2. ID puntual (`recomputeIdInput`)

Nota:
- El selector Libro es un select real con opcion Todos los libros + una opcion por engine.
- El valor inicial intenta heredar el libro activo en la pantalla principal (`engineFilterSelect`).

### Contrato oficial de filtros del RecomputeModal

| Boton | Endpoint | Soporta libro | Soporta ID | Comportamiento |
|---|---|---|---|---|
| IMPORTAR PDF | `POST /api/pdf-preview/apply-to-engine` | Si | No | Ignora ID puntual, muestra aviso y trabaja por libro/todos. |
| CALCULO FINAL | `POST /copy-pdf-to-final-all-books` | Si | No | Ignora ID puntual, muestra aviso y trabaja por libro/todos. |
| ERRORES | `POST /recompute-qa-errors` | Si | Si | Respeta libro+ID y bloquea `Todos + ID`. |
| ESTADOS | `POST /recalculate-revision-status` | No (global) | No | Solo global; bloquea libro o ID. |
| VACIAR + MARCAR REVISION | `POST /clear-engine-fields` | Si | No | ID puntual no aplica; vacia `*_pdf`, `*_final`, `*_error` (excepto `pn_pdf`, `pn_final`) y opcionalmente marca revision pendiente. |

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
- Si el usuario informa `id`, la UI muestra aviso de que el ID se ignora en este paso.

2) CALCULO FINAL (`recomputeCalculateFinalBtn` -> `POST /copy-pdf-to-final-all-books`)
- Soporta todos los libros o libro concreto.
- Para libro concreto, frontend envia `file` al endpoint oficial.
- `id` no participa en este endpoint.
- Si el usuario informa `id`, la UI muestra aviso de que el ID se ignora en este paso.

3) ERRORES (`recomputeRunBtn` -> `POST /recompute-qa-errors`)
- Deriva alcance desde los dos filtros del modal:
	- `book=all` + `id=''` -> `scope=all`
	- `book=<MODEL>` + `id=''` -> `scope=book`
	- `book=<MODEL>` + `id=<VALOR>` -> `scope=current`
- La combinacion `book=all` + `id=<VALOR>` se bloquea en UI para evitar payload ambiguo.
- En este paso, `updateRevision` y `forceRevision` van fijos en `false`.
- ESTADOS queda como paso separado para recalculo de `qa_revision_estado` y `qa_revision_accion`.

4) ESTADOS (`recomputeRevisionStatusBtn` -> `POST /recalculate-revision-status`)
- Actualmente solo soporta todos los libros.
- Si se intenta libro concreto o `id` puntual, la UI muestra aviso y no ejecuta.

5) VACIAR + MARCAR REVISION (`btnClearPdfFinal` en `recompute_simple.html` -> `POST /clear-engine-fields`)
- Requiere confirmacion tipada: el usuario debe escribir `VACIAR`.
- Alcance:
	- Todos los libros: sin `files`.
	- Libro concreto: envia `files: [engine_*.json]`.
- Payload operativo actual:
	- `suffixes: ['_pdf', '_final', '_error']`
	- `exclude: ['pn_pdf', 'pn_final']`
	- `resetQaRevision: true`
- Cuando `resetQaRevision=true`, backend fuerza por registro:
	- `qa_revision_estado='pendiente'`
	- `qa_revision_accion='revisar'`
	- `qa_revision_updated_at=<timestamp ISO comun de ejecucion>`
- Al finalizar en UI, se informa que es obligatorio recargar y se ejecuta `window.location.reload()`.

## Recompute Simple (pagina dedicada)

`recompute_simple.html` centraliza las 5 acciones del recompute con resumen tabular y log tecnico, usando `js/recompute-simple.js`.

Comportamiento oficial por accion:
- IMPORTAR PDF: `POST /api/pdf-preview/apply-to-engine` con `{}` (todos) o `{ engine }` (libro).
- CALCULO FINAL: `POST /copy-pdf-to-final-all-books` con `{ backup: true }` (todos) o `{ file, backup: true }`.
- ERRORES: `POST /recompute-qa-errors` con `scope=all|book|current` y `dryRun=false`.
- ESTADOS: `POST /recalculate-revision-status` global (si hay filtro, avisa y continua global).
- VACIAR + MARCAR REVISION: `POST /clear-engine-fields` con sufijos/exclusiones oficiales.

Reglas de alcance comunes en la pagina:
- Selector de libro: `Todos los libros` o libro concreto.
- ID puntual: solo aplica a ERRORES; en el resto se muestra aviso de ID ignorado.

## Limitaciones actuales (sin refactor grande)
- No se cambian reglas de calculo.
- No se cambian endpoints oficiales.
- El modal superior no expone controles de alcance/pagina/rango.
- Se elimino la dependencia de checkboxes ocultos para activar revision desde ERRORES.

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
- ESTADOS sigue siendo global mientras `/recalculate-revision-status` no soporte filtro por libro.
- IMPORTAR PDF y CALCULO FINAL no soportan ID puntual (solo aviso de ID ignorado).
- VACIAR + MARCAR REVISION es destructivo sobre multiples campos y requiere control estricto de confirmacion operativa.

## TODO pendiente
- Exponer en UI un mapa de endpoint efectivo utilizado por cada accion.

## Ejemplo real
- `runBackendCalculateFinal()` en `js/analista-02.js` usa `POST /copy-pdf-to-final-all-books` con `backup: true` y ya no documenta la regla legacy basada en `gesa=SI`.
