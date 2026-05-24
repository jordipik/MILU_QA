# Recompute Simple Flow

## Objetivo
Documentar el flujo real de la pagina `recompute_simple.html` como orquestador operativo de recompute.

## UI y acciones
- `btnImportPdf` -> `POST /api/pdf-preview/apply-to-engine`
- `btnFinal` -> `POST /copy-pdf-to-final-all-books`
- `btnErrors` -> `POST /recompute-qa-errors`
- `btnStatuses` -> `POST /api/recompute-simple/update-states`
- `btnClearPdfFinal` -> `POST /clear-engine-fields`

## Filtros
- `bookSelect`: libro concreto o todos.
- `idInput`: ID puntual.

Comportamiento real:
- IMPORTAR PDF y CALCULO FINAL ignoran ID puntual.
- ERRORES usa `scope` (`all`, `book`, `current`) segun libro/ID.
- ESTADOS usa payload `{ engine, id, backup }` hacia `/api/recompute-simple/update-states`.

## Flujo recomendado
1. IMPORTAR PDF
2. CALCULO FINAL
3. ERRORES
4. ESTADOS

## Salidas clave de UI
- Resumen visual por accion (KPIs + tablas).
- Tabla interactiva de `not_found_rows` para IMPORTAR PDF.
- Tabla de conflictos ambiguos cuando aplica (`action_required_conflicts`).

## Observaciones
- Esta pagina convive con el modal de `analista_02.html`, pero usa endpoint de estados distinto (`/api/recompute-simple/update-states`).
- Es la referencia operativa para ejecucion por pasos de todo el pipeline runtime.
