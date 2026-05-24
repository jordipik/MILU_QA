# SCRIPT MAP

## Objetivo
Inventario de scripts y endpoints, con estado oficial/legacy validado en el codigo actual.

## Mapa principal

| Componente | Tipo | Punto de entrada | Resultado | Estado |
| --- | --- | --- | --- | --- |
| `js/import-pdf.js` | Frontend | `import_pdf.html` (`extractBookBtn`, `extractAllBooksBtn`) | Genera `book_preview_<MODEL>.json` | OFFICIAL |
| `apply_book_preview_to_engine.py` | Python | `POST /api/pdf-preview/apply-to-engine` (por libro) | Copia campos `_pdf` al engine | OFFICIAL |
| `apply_all_book_previews.py` | Python | `POST /api/pdf-preview/apply-to-engine` (todos) | Ejecuta apply en lote | OFFICIAL |
| `POST /api/pdf-preview/apply-to-engine` | Backend | UI recompute (`btnImportPdf`, `recomputeCopyBookBtn`) | Ejecuta scripts apply con `--write --overwrite` | OFFICIAL |
| `POST /copy-pdf-to-final-all-books` | Backend | UI recompute (`btnFinal`, `recomputeCalculateFinalBtn`) | Calcula `*_final` con `FINAL_FIELDS_V1_MAPPINGS_BACKEND` | OFFICIAL |
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

## Botones UI auditados
- `recompute_simple.html`
	- `btnImportPdf` -> `POST /api/pdf-preview/apply-to-engine`
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
