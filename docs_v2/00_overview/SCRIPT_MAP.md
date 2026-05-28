# SCRIPT MAP

## Objetivo
Inventario de scripts y endpoints, con estado oficial/legacy validado en el codigo actual.

## Mapa principal

| Componente | Tipo | Punto de entrada | Resultado | Estado |
| --- | --- | --- | --- | --- |
| `js/pdf-viewer.js` | Frontend visual | `import_pdf.html` y vistas PDF | Overlay diagnostico de columnas y splits visuales | OFFICIAL SUPPORT |
| `js/import-pdf.js` | Frontend | `import_pdf.html` (`extractBookBtn`, `extractAllBooksBtn`) | Genera `book_preview_<MODEL>.json` | OFFICIAL |
| `js/analista-02.js` | Frontend | Modal analista | Reutiliza reglas de extraccion y reparacion `_pdf` | OFFICIAL SUPPORT |
| `apply_book_preview_to_engine.py` | Python | `POST /api/pdf-preview/apply-to-engine` (por libro) | Copia campos `_pdf` al engine | OFFICIAL |
| `apply_all_book_previews.py` | Python | `POST /api/pdf-preview/apply-to-engine` (todos) | Ejecuta apply en lote | OFFICIAL |
| `POST /api/pdf-preview/apply-to-engine` | Backend | UI recompute (`btnImportPdf`, `recomputeCopyBookBtn`) | Ejecuta scripts apply con `--write --overwrite` | OFFICIAL |
| `POST /copy-pdf-to-final-all-books` | Backend | UI recompute (`btnFinal`, `recomputeCalculateFinalBtn`) | Calcula `*_final` con `FINAL_FIELDS_V1_MAPPINGS_BACKEND` | OFFICIAL |
| `scripts/enrich_rebuild_with_assets.js` (`--mode engine`) | Node runtime | `POST /api/recompute-simple/enrich-assets` | Enriquecimiento multimedia sobre `engine_<MODEL>.json` (fotos/esquemas/esquemas_pos) | OFFICIAL |
| `rebuild_assets_for_record.py` | Python incremental | CLI por `--id`, `--all-book`, `--all` | Rebuild incremental de `esquemas` y `esquemas_pos`, inferencia automatica de pagina por FG/BOM y sincronizacion JSON idempotente | OFFICIAL / ACTIVE |
| `POST /api/recompute-simple/enrich-assets` | Backend | UI recompute (`btnAssets`) | Ejecuta assets en modo engine con backup en write | OFFICIAL |
| `scripts/update_gesa_fields_from_excel.js` | Node offline | Ejecucion manual (`node scripts/update_gesa_fields_from_excel.js [--only <MODEL>] [--write]`) | Actualiza solo campos GESA por match exacto `PART NUMBER == pn_final`, con backup por engine | OFFICIAL OFFLINE |
| `POST /calculate-final-fields` + `copy_gesa_fields_to_final.py` | Backend + Python | Llamada legacy | Ruta heredada de final fields | LEGACY |
| `recompute_engine_errors.js` | Node | `POST /recompute-qa-errors` | Recalcula `*_error`, `total_error`, `has_error` y opcion QA | OFFICIAL |
| `scripts/update_revision_states.js` | Node | `POST /api/recompute-simple/update-states` | Recalcula `qa_revision_estado/accion` | OFFICIAL |
| `POST /recalculate-revision-status` | Backend | `recomputeRevisionStatusBtn` (analista modal) | Recalculo global alternativo | OFFICIAL (coexistente) |
| `GET/POST /qa_revision_sync.php` | Backend | QA UI + sync remoto | Lee/escribe `qa_revision_server_data.json` | OFFICIAL |
| `POST /apply-revision-to-engines` | Backend | Flujos revision | Aplica decisiones a engines | OFFICIAL |
| `POST /recompute-pdf-auto` | Backend | Endpoints antiguos | Devuelve 410 | LEGACY DESACTIVADO |
| `POST /recompute-pdf-auto-visual` | Backend | Flujo alternativo visual | Copia `_pdf` por comparacion visual | ALTERNATIVO |
| `POST /copy-pdf-to-pdf-all-books` | Backend | Flujo historico | Copia `_pdf` batch visual | LEGACY/ALTERNATIVO |
| `depuracion_json.py` | Python offline | Ejecucion manual | Normaliza y consolida engines | OFFICIAL OFFLINE |

## Contrato de paridad Overlay vs Extraccion
- `js/pdf-viewer.js` resuelve el overlay visual; `js/import-pdf.js` resuelve el artefacto oficial de datos.
- El pipeline oficial de PDF es: `js/import-pdf.js -> book_preview_<MODEL>.json -> POST /api/pdf-preview/apply-to-engine -> engine_<MODEL>.json`.
- `js/pdf-viewer.js` no sustituye `book_preview_<MODEL>.json`; solo debe mantenerse en paridad de reglas para revision humana fiable.
- `js/analista-02.js` debe replicar la misma reparacion downstream que `js/import-pdf.js`.
- Reglas a mantener alineadas:
	1. `POS + PN + DESIGNATION`
	2. `PN + DESIGNATION`
	3. `DESIGNATION` que empieza por `PN`
	4. `DESIGNATION` que empieza por `POS + PN`

## Reparaciones PDF documentadas
- `12V4000M53`, pagina `803`: fusion `PN + DESIGNATION`.
- `12V4000M53`, pagina `669`: fusion `POS + PN + DESIGNATION`.
- Puntos de implementacion:
	- `js/pdf-viewer.js:4166`
	- `js/pdf-viewer.js:4668`
	- `js/import-pdf.js:302`
	- `js/import-pdf.js:343`
	- `js/analista-02.js:634`
	- `js/analista-02.js:696`

Validacion sintetica de pagina `669`:
- `7250 -> X59450700011 -> BRACKET WIRING HARNESS`
- `8400 -> X59650700018 -> RETAINER F. WIRING HARNESS`
- `8570 -> X54750700009 -> CABLE CLAMP`
- `8800 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9350 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9450 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9660 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9700 -> X59450700011 -> BRACKET WIRING HARNESS`
- `unresolvedCount = 0`
- overlay body: `381 -> 397`

## Botones UI auditados
- `recompute_simple.html`
	- `btnImportPdf` -> `POST /api/pdf-preview/apply-to-engine`
	- `btnSust` -> `POST /api/recompute-simple/update-gesa` + `POST /api/recompute-simple/update-sust`
	- `btnAssets` -> `POST /api/recompute-simple/enrich-assets`
	- `btnFinal` -> `POST /copy-pdf-to-final-all-books`
	- `btnErrors` -> `POST /recompute-qa-errors`
	- `btnStatuses` -> `POST /api/recompute-simple/update-states`
	- `btnClearPdfFinal` -> `POST /clear-engine-fields`
- `analista_02.html` (modal recompute)
	- `recomputeCopyBookBtn` -> `runApplyBookPreviewToEngines()` -> `POST /api/pdf-preview/apply-to-engine`
	- `recomputeCalculateFinalBtn` -> `POST /copy-pdf-to-final-all-books`
	- `recomputeRunBtn` -> `POST /recompute-qa-errors`
	- `recomputeRevisionStatusBtn` -> `POST /recalculate-revision-status`

## Campos nucleares afectados
- PDF: `pos_pdf`, `pn_pdf`, `designation_pdf`, `model_type_pdf`, `qty_pdf`, `units_pdf`, `weight_pdf`, `fn_pdf`, `measure_pdf`, `norma_pdf`, `bom_pdf`, `fg_fgs_pdf`
- Final: `pos_final`, `pn_final`, `designation_final`, `model_type_final`, `qty_final`, `units_final`, `weight_final`, `fn_final`, `measure_final`, `norma_final`, `fg_fgs_final`, `bom_final`, `nsn_final`, `normalizado_final`
- Error/QA: `*_error`, `total_error`, `has_error`, `qa_revision_estado`, `qa_revision_accion`

## Assets pipeline (OFFICIAL MODEL)
- Separacion conceptual:
	- `esquemas`: imagen base sin circulo POS.
	- `esquemas_pos`: imagen con POS marcado (`esquemas_circulos_all`, `esquemas_circulos`, `ruta_esquemas_pos`).
- Regla de idempotencia:
	- Si archivo existe y JSON coincide, no hacer nada.
	- Archivo existente y JSON vacio/desincronizado: sincronizar JSON sin regenerar.
- Logging operativo esperado por registro:
	- `[AUTO] pagina esquema inferida por metadatos FG/BOM: <page>`
	- `[OK] esquema existente`
	- `[SYNC] json esquemas actualizado`
	- `[GEN] esquema generado`
	- `[OK] esquema_pos existente`
	- `[GEN] esquema_pos generado`
	- `[SYNC] json POS actualizado`
	- `[MISS] pos no encontrado`
- Flags clave del orquestador incremental:
	- `--dry-run`
	- `--write`
	- `--force-regenerate`
	- `--only-sync-json`

Regla OCR validada:
- el motor de deteccion POS admite submatch numerico robusto en tokens OCR concatenados.
- ejemplo validado: token OCR `170155` contiene POS objetivo `155`.
