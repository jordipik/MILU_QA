# Recompute Simple Flow

## Objetivo
Documentar el flujo real de la pagina `recompute_simple.html` como orquestador operativo de recompute.

## UI y acciones
- `btnImportPdf` -> `POST /api/recompute-simple/rebuild-json`
- `btnSust` -> `POST /api/recompute-simple/update-gesa` + `POST /api/recompute-simple/update-sust`
- `btnAssets` -> `POST /api/recompute-simple/enrich-assets`
- `btnHermanos` -> `POST /api/recompute-simple/recompute-hermanos`
- `btnFinal` -> `POST /copy-pdf-to-final-all-books`
- `btnErrors` -> `POST /recompute-qa-errors`
- `btnStatuses` -> `POST /api/recompute-simple/update-states`
- `btnClearPdfFinal` -> `POST /clear-engine-fields`

## Filtros
- `bookSelect`: libro concreto o todos.
- `idInput`: ID puntual.

Comportamiento real:
- IMPORTAR PDF y CALCULO FINAL ignoran ID puntual.
- GESA SUST y ASSETS ignoran ID puntual.
- HERMANOS COPIAS ignora ID puntual y reutiliza la logica oficial de Analisis (`/pn-review/apply-siblings-bulk`) via wrapper recompute.
- ERRORES usa `scope` (`all`, `book`, `current`) segun libro/ID.
- ESTADOS usa payload `{ engine, id, backup }` hacia `/api/recompute-simple/update-states`.

## Flujo recomendado
1. IMPORTAR PDF
2. GESA SUST
3. ASSETS
4. HERMANOS COPIAS
5. CALCULO FINAL
6. ERRORES
7. ESTADOS

## Endpoint ASSETS runtime
- `POST /api/recompute-simple/enrich-assets`
- Ejecuta `scripts/enrich_rebuild_with_assets.js` en `--mode engine`.
- Actualiza en `engine_<MODEL>.json`: `filename_foto`, `ruta_foto`, `esquemas`, `esquemas_circulos`, `esquemas_circulos_all`, `ruta_esquemas_pos`, `exp_imagenes`.
- Origen de assets: `fotos_articulos/`, `esquemas/`, `esquemas_pos_circulos/`.
- En modo escritura crea backup `engine_<MODEL>.json.bak.<timestamp>`.

## Salidas clave de UI
- Resumen visual por accion (KPIs + tablas).
- Tabla interactiva de `not_found_rows` para IMPORTAR PDF.
- Tabla de conflictos ambiguos cuando aplica (`action_required_conflicts`).

## Observaciones
- Esta pagina convive con el modal de `analista_02.html`, pero usa endpoint de estados distinto (`/api/recompute-simple/update-states`).
- Es la referencia operativa para ejecucion por pasos de todo el pipeline runtime.
