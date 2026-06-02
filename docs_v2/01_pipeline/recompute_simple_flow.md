# Recompute Simple Flow

## Objetivo
Documentar el flujo real de la pagina `recompute_simple.html` como orquestador operativo de recompute.

## UI y acciones
- `btnImportPdf` -> `POST /api/recompute-simple/rebuild-json`
- `btnSust` -> `POST /api/recompute-simple/update-gesa` + `POST /api/recompute-simple/update-sust`
- `btnAssets` -> `POST /api/recompute-simple/enrich-assets/start`
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
- GESA SUST ignoran ID puntual.
- ASSETS admite ID puntual cuando `engine != ALL`.
- HERMANOS COPIAS ignora ID puntual y reutiliza la logica oficial de Analisis (`/pn-review/apply-siblings-bulk`) via wrapper recompute.
- ERRORES usa `scope` (`all`, `book`, `current`) segun libro/ID.
- ESTADOS usa payload `{ engine, id, backup }` hacia `/api/recompute-simple/update-states`.

## Flujo recomendado
1. IMPORTAR PDF
2. GESA SUST
3. ASSETS
4. CALCULO FINAL
5. ERRORES
6. ESTADOS

Paso opcional no bloqueante:
- HERMANOS COPIAS

## Endpoint ASSETS runtime
- `POST /api/recompute-simple/enrich-assets/start`
- Seguimiento: `GET /api/recompute-simple/enrich-assets/jobs/:jobId`
- Cancelacion: `POST /api/recompute-simple/enrich-assets/jobs/:jobId/cancel`
- Ejecuta `rebuild_assets_for_record.py` en backend para proceso incremental.
- `POST /api/recompute-simple/enrich-assets` se mantiene como ruta sincronica de compatibilidad.
- Actualiza en `engine_<MODEL>.json`: `filename_foto`, `ruta_foto`, `esquemas`, `esquemas_circulos`, `esquemas_circulos_all`, `ruta_esquemas_pos`, `exp_imagenes`.
- Origen de assets: `fotos_articulos/`, `esquemas/`, `esquemas_pos_circulos/`.
- En modo escritura crea backup `engine_<MODEL>.json.bak.<timestamp>`.

Modelo conceptual oficial DOC_V2 para ASSETS:
- FASE A - ESQUEMAS GENERALES:
	1. calcular `esquemas` por BOM (`bom_final`, `BOM-No.`, `bom_pdf`)
	2. agrupar por bloque BOM continuo
	3. si BOM vacio/no encontrado: `esquemas` vacio
- FASE B - CIRCULOS DESDE ESQUEMAS + POS:
	1. partir de `esquemas` ya calculado
	2. derivar `esquemas_circulos_all`, `esquemas_circulos`, `ruta_esquemas_pos`
	3. actualizar `exp_imagenes` cuando corresponda

Regla clave:
- `esquemas` es la fuente maestra.
- `esquemas_circulos*` y `ruta_esquemas_pos` son derivados.
- ASSETS consume resultados previos y no redefine la pertenencia de `esquemas`.

Regla de idempotencia de assets:
- Si archivo existe y JSON ya coincide, no hacer nada.
- Distinguir siempre `existe archivo` de `existe campo JSON`.

Orquestador incremental (NEW/WIP):
- `rebuild_assets_for_record.py` (registro/libro/todos).
- Flags: `--dry-run`, `--write`, `--force-regenerate`, `--only-sync-json`.

## Salidas clave de UI
- Resumen visual por accion (KPIs + tablas).
- Tabla interactiva de `not_found_rows` para IMPORTAR PDF.
- Tabla de conflictos ambiguos cuando aplica (`action_required_conflicts`).

## Observaciones
- Esta pagina convive con el modal de `analista_02.html`, pero usa endpoint de estados distinto (`/api/recompute-simple/update-states`).
- Es la referencia operativa para ejecucion por pasos de todo el pipeline runtime.
