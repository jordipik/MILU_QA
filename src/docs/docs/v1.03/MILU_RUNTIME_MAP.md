# MILU_RUNTIME_MAP — Trazabilidad BOTÓN → ENDPOINT → SCRIPT → ARCHIVO

> **FASE 1** del Plan Maestro V1.03. Este documento traza, para los flujos vivos del sistema, la cadena completa desde la UI hasta el archivo modificado en disco.
>
> Solo se documenta lo que se ha verificado leyendo código. Endpoints `410 Gone` o sin frontend conocido se listan al final como **flujos sin botón vivo**.

## Convenciones

- `BOTÓN` cita el HTML donde aparece y el rótulo visible (o handler si no tiene rótulo).
- `ENDPOINT` con método y ruta exactos.
- `SCRIPT` puede ser:
  - `inline` → lógica dentro de `server.js`.
  - `node:scripts/x.js` → módulo Node `require`d desde `server.js`.
  - `python:x.py` → script Python lanzado por `child_process.spawn`.
- `ARCHIVOS` lista patrones de salida en disco. `READ-ONLY` cuando no escribe.
- `RIESGO` heredado de `MILU_WRITE_OPERATIONS.md`.

---

## 1. Pipeline RECOMPUTE-SIMPLE — `recompute_simple.html`

Página dedicada al pipeline numerado del plan oficial.

| BOTÓN | ENDPOINT | SCRIPT | ARCHIVOS | Riesgo |
|---|---|---|---|---|
| `IMPORTAR PDF` | `POST /api/recompute-simple/rebuild-json` | `node:scripts/rebuild_engine_from_book_preview.js` | `data/02-engine_rebuild/engine_rebuild_*.json` | BAJO |
| `Actualizar GESA` | `POST /api/recompute-simple/update-gesa` | `node:scripts/update_gesa_fields_from_excel.js` | `engine_*.json` (con backup) | MEDIO |
| `Actualizar GESA + SUST` | `POST /api/recompute-simple/update-sust` | `node:scripts/update_sust_fields.js` | `engine_*.json` (con backup) | MEDIO |
| `ASSETS` | `POST /api/recompute-simple/enrich-assets` (sync) o `/enrich-assets/start` (async) | `python:rebuild_assets_for_record.py` | `engine_*.json`, `fotos_articulos/`, `esquemas/`, `esquemas_pos_circulos/` | MEDIO |
| `Cancelar ASSETS` | `POST /api/recompute-simple/enrich-assets/jobs/{id}/cancel` | inline (signal) | READ-ONLY | BAJO |
| `Recalcular hermanos` | `POST /api/recompute-simple/recompute-hermanos` | `inline` (`applySiblingBulkUpdates`) | `engine_*.json` | ALTO |
| `Esquemas (BOM) — Dry Run` | `POST /api/recompute-simple/rebuild-schemes-by-bom` (`dryRun=true`) | `python:rebuild_schemes_by_bom.py` | reporte JSON, sin escribir | BAJO |
| `Esquemas (BOM) — Write` | `POST /api/recompute-simple/rebuild-schemes-by-bom` | `python:rebuild_schemes_by_bom.py` | `esquemas/*.png`, `engine_rebuild_*.json` | MEDIO |
| `Esquemas (POS) — Dry Run` | `POST /api/recompute-simple/rebuild-schemes-circles-from-esquemas` (`dryRun=true`) | `python:rebuild_schemes_circles_from_esquemas.py` | reporte JSON, sin escribir | BAJO |
| `Esquemas (POS) — Write` | `POST /api/recompute-simple/rebuild-schemes-circles-from-esquemas` | `python:rebuild_schemes_circles_from_esquemas.py` | `esquemas_pos_circulos/*.webp`, `rebuild_schemes_circles_manual_overrides.json` | MEDIO |
| `Override picker (manual)` | `POST /api/recompute-simple/manual-override-picker` | `inline` (URL builder) | READ-ONLY | BAJO |
| `Recalcular estados` | `POST /api/recompute-simple/update-states` | `node:scripts/update_revision_states.js` | `engine_*.json` (con backup) | MEDIO |
| `Recalcular errores` (visible bajo `recompute-qa-errors`) | `POST /recompute-qa-errors` | `inline` (`recomputeEngineErrors`) | `engine_*.json` (parcial, con backup) | ALTO |
| `Generate missing POS (batch)` | `POST /api/recompute-simple/generate-missing-esquema-pos` | `python:rebuild_schemes_circles_from_esquemas.py` | `esquemas_pos_circulos/*.webp`, `engine_*.json` | MEDIO |

**Polling de jobs ASSETS**: el frontend hace `GET /api/recompute-simple/enrich-assets/jobs/:jobId` cada N segundos (READ-ONLY).

---

## 2. Pipeline QA — `qa_milu.html`

Pantalla principal de revisión QA. Módulo: [js/qa-milu.js](../../js/qa-milu.js).

| BOTÓN | ENDPOINT | SCRIPT | ARCHIVOS | Riesgo |
|---|---|---|---|---|
| `OK` (bulk visible/all) | `POST /apply-revision-to-engines` con `applyBulkQuickMode='revok'` | `inline` (revision-apply service) | `engine_*.json` | ALTO |
| `Vaciar` | `POST /apply-revision-to-engines` (`revempty`) | idem | `engine_*.json` | ALTO |
| `Validar` | `POST /apply-revision-to-engines` (`validate`) | idem | `engine_*.json` | ALTO |
| `Revisar` | `POST /apply-revision-to-engines` (`review`) | idem | `engine_*.json` | ALTO |
| `Descartar` | `POST /apply-revision-to-engines` (`discard`) | idem | `engine_*.json` | ALTO |
| `Aplicar QA checks (visibles)` | `POST /apply-revision-to-engines` (filtro de checks) | idem | `engine_*.json` | ALTO |
| `Aplicar QA checks (todos)` | `POST /apply-revision-to-engines` (sin filtro) | idem | `engine_*.json` | ALTO |
| `Deshacer último cambio` | `POST /qa_revision_sync.php` (acción undo) | `inline` | `qa_revision_server_data.json` | BAJO |
| `Guardar` (modal registro / panel lateral) | `POST /save-json` | `inline` (`setWriteField` con whitelist) | `engine_*.json` | BAJO |
| `Doble click en celda` (editor inline) | `POST /save-json` al confirmar | idem | `engine_*.json` | BAJO |
| `Recalcular export WordPress` | `POST /export/run-wordpress` | `node:scripts/export_wordpress_milu.js` (vía `runNodeScript`) | `data/05-wordpress/*.json` | MEDIO |
| `Descargar CSV` (export panel) | `GET /export/download` | `inline` | READ-ONLY | BAJO |
| `Cargar motor` / `Cargar todos` | `GET /engines` | `inline` | READ-ONLY | BAJO |
| `Click en esquema` | `GET /api/esquemas-pos-index` (+ `POST /api/esquemas/generate-one` si genera) | `python:generate_esquema_pos.py` | `esquemas/` | BAJO |

---

## 3. Analista 02 — `analista_02.html`

Editor de registro detallado. Módulo: [js/analista-02.js](../../js/analista-02.js).

| BOTÓN | ENDPOINT | SCRIPT | ARCHIVOS | Riesgo |
|---|---|---|---|---|
| `EDITAR` (modal) → Guardar | `POST /api/record-editor/update-record` | `inline` (loop de `setWriteField`) | `engine_*.json` (con backup) | MEDIO |
| `ELIMINAR` | `POST /delete-json` (alias `/delete-json.php`) | `inline` (splice + write) | `engine_*.json` | MEDIO |
| `Estado: OK` / `Estado: Pendiente` | `POST /apply-revision-to-engines` | `inline` | `engine_*.json` | ALTO |
| `Acción: Eliminar/Importar/Copia/Revisar` | `POST /apply-revision-to-engines` | `inline` | `engine_*.json` | ALTO |
| `Propagar hermanos` / `Propagar hermanos (libro)` | `POST /pn-review/apply-siblings-bulk` | `inline` (`applySiblingBulkUpdates`) | `engine_*.json` | ALTO |
| `Apply PDF Preview` | `POST /api/pdf-preview/apply-to-engine` | `python:apply_book_preview_to_engine.py` o `apply_all_book_previews.py` | `engine_*.json` | ALTO |
| `Copy PDF read → PDF` (frontend) | `POST /copy-pdf-to-pdf` | `inline` (`applyCanonicalPdfCopyToRow`) | `engine_*.json` | BAJO |
| `Copy PDF read → PDF (backend)` | `POST /copy-pdf-to-pdf-all-books` (con `writePdf`) | `node:scripts/qa_pdf_visual_copy.js` (`runPdfVisualCopyBatch`) | `engine_*.json` (con backup) | MEDIO |
| `Copy PDF read → Final` | `POST /copy-pdf-to-final-all-books` | `inline` (`resolvePdfToFinalUpdatesForRow`) | `engine_*.json` (con backup) | MEDIO |
| `PDF Recompute errors` | `POST /recompute-qa-errors` | `inline` | `engine_*.json` | ALTO |
| `PDF Recompute revision` | `POST /recalculate-revision-status` | `inline` (`recomputeEngineErrors` loop) | `engine_*.json` | ALTO |
| `Calculate final` | `POST /calculate-final-fields` | `python:copy_gesa_fields_to_final.py` | `engine_*.json` | MEDIO ⚠️ legacy |

> ⚠️ Varios botones de `analista_02.html` (`Recompute Run`, `Clear PDF final`, `Copy current`, `Errors current`, `PDF Run`, `Copy book`, `Revision status`) llaman al pipeline `/api/recompute-simple/*` reusando endpoints de la sección 1.

---

## 4. Otras pantallas de QA

### 4.1 `qa_analista_registro.html` — [js/qa-analista-registro.js](../../js/qa-analista-registro.js)

| BOTÓN | ENDPOINT | SCRIPT | ARCHIVOS |
|---|---|---|---|
| `Save Fields` | `POST /save-json` | `inline` | `engine_*.json` |
| `Mark OK` | `POST /apply-revision-to-engines` | `inline` | `engine_*.json` |
| `Mark KO` | `POST /apply-revision-to-engines` | `inline` | `engine_*.json` |

### 4.2 `qa_auditoria.html` — [js/qa-auditoria.js](../../js/qa-auditoria.js)

| BOTÓN | ENDPOINT | SCRIPT | ARCHIVOS |
|---|---|---|---|
| `Refresh` | `GET /audit-log?limit=…` | `inline` | READ-ONLY |
| `Clear` | `DELETE /audit-log` | `inline` | `qa_audit_log.json` (truncate) |

### 4.3 `qa_imagenes.html` — [js/qa_imagenes.js](../../js/qa_imagenes.js)

Solo lectura. Carga datos de los `engine_*.json` vía endpoints de `/db/*` y filtra cliente. Sin botones destructivos.

### 4.4 `qa_lista_agrupada.html`

Embebida en `milu_shell.html`, navegación cliente, sin escrituras.

---

## 5. Export — `export_wordpress.html` y `exportacion.html`

| BOTÓN | ENDPOINT | SCRIPT | ARCHIVOS |
|---|---|---|---|
| `Ejecutar export WordPress` | `POST /export/run-wordpress` | `node:scripts/export_wordpress_milu.js` | `data/05-wordpress/milu_wp_import.json`, `milu_wp_superseded.json` |
| `Refresh` | `GET /export/status`, `GET /export/files`, `GET /export/file?name=…` | `inline` | READ-ONLY |
| `Download CSV` | `GET /export/download?name=…` | `inline` | READ-ONLY |

> Nota: `POST /export/run-synthetic`, `POST /export/run-ai-conflicts`, `POST /export/run-all` devuelven **410** inline. Cualquier botón que aún los llame es residual.

---

## 6. Analytics — `analytics_*.html`

Todos los HTMLs `analytics_*` son consumidores de `/db/*` y `/db/analytics/*` (READ-ONLY contra el espejo SQLite). Módulo común: [js/analytics/analytics-api.js](../../js/analytics/analytics-api.js).

| HTML | Endpoints clave |
|---|---|
| `analytics_dashboard.html` | `GET /db/analytics/overview`, `/db/summary` |
| `analytics_engine_detail.html` | `GET /db/analytics/engine/:engine` |
| `analytics_pn.html`, `analytics_pn_detail.html` | `GET /db/analytics/pn-conflicts`, `/db/analytics/pn/:sku` |
| `analytics_qa.html` | `GET /db/analytics/qa`, `/db/analytics/qa/pending` |
| `analytics_images.html` | `GET /db/analytics/images`, `/db/analytics/images/missing`, `/db/analytics/images/placeholders` |
| `analytics_export.html` | `GET /db/analytics/export`, `/db/analytics/export/pending` |
| `analytics_search.html` | `GET /db/analytics/search` |

Sin escrituras. El espejo SQLite se reconstruye con `npm run db:import` (offline).

---

## 7. Importación PDF — `import_pdf.html`

Funcionalidad embebida en `analista_02.html`. No expone endpoints propios.

---

## 8. Esquemas POS — endpoints transversales

| BOTÓN (origen) | ENDPOINT | SCRIPT | ARCHIVOS |
|---|---|---|---|
| Generación individual desde editor | `POST /api/esquemas-pos/generate-one` | `python:rebuild_schemes_circles_from_esquemas.py` | `esquemas_pos_circulos/*.webp` |
| Generación batch | `POST /api/apply-generate-batch` | `python:rebuild_schemes_circles_from_esquemas.py` (loop) | `esquemas_pos_circulos/*.webp`, `rebuild_schemes_circles_manual_overrides.json` |
| Aplicar overrides puntuales | `POST /api/apply-batch` | `inline` (upsert) | `rebuild_schemes_circles_manual_overrides.json` |
| Generar esquema BOM individual | `POST /api/esquemas/generate-one` | `python:generate_esquema_pos.py` | `esquemas/*.png` |

---

## 9. Endpoints sin botón vivo identificado (huérfanos de UI)

Endpoints que existen en `server.js` pero para los que la auditoría frontend no encontró un fetch concreto:

| Endpoint | Estado | Acción sugerida (FASE 4-5) |
|---|---|---|
| `POST /clear-engine-fields` | activo, ALTO riesgo | Gating con `SERVER_ENABLE_DANGEROUS_WRITE`, validar uso desde scripts. |
| `POST /recompute-pdf-auto-visual` | activo, MEDIO | Confirmar si lo usa algún `.bat` o utilidad CLI. |
| `POST /pn-review/:sku/apply-decision`, `apply-values`, `by-id/:id/apply-decision` | activos | Probable consumo desde `analista_02.html` indirecto. Confirmar. |
| `POST /api/pdf-preview/apply-to-engine` con `applyAll=true` | activo | Verificar que el botón `Apply PDF Preview` lo invoca o si solo la modalidad `single`. |
| `POST /recompute-pdf-auto`, `/export/run-synthetic`, `/export/run-ai-conflicts`, `/export/run-all`, `/apply-qa-checks-filter` | **410 inline** | Eliminar la ruta (FASE 5) y limpiar referencias en HTMLs. |
| `GET /pn/list`, `/pn/:sku`, `/pn/:sku/sources` | **410 inline** | Eliminar (FASE 5). |

---

## 10. Resumen visual del runtime oficial

```text
┌─────────────────────────┐
│  recompute_simple.html  │──► /api/recompute-simple/* ──► node|python ──► engine_*.json
└─────────────────────────┘                                                  esquemas_pos_circulos/
                                                                              data/02-engine_rebuild/

┌─────────────────────────┐
│       qa_milu.html      │──► /apply-revision-to-engines ──► inline ─────► engine_*.json
└─────────────────────────┘──► /save-json                ──► inline ─────► engine_*.json
                            └► /qa_revision_sync.php    ──► inline ─────► qa_revision_server_data.json

┌─────────────────────────┐
│     analista_02.html    │──► /api/record-editor/update-record ──► engine_*.json
└─────────────────────────┘──► /pn-review/apply-siblings-bulk    ──► engine_*.json
                            └► /api/pdf-preview/apply-to-engine  ──► python ──► engine_*.json

┌─────────────────────────┐
│  export_wordpress.html  │──► /export/run-wordpress ──► node:export_wordpress_milu.js ──► data/05-wordpress/*.json
└─────────────────────────┘

┌─────────────────────────┐
│    analytics_*.html     │──► /db/* (READ-ONLY)  ──► better-sqlite3 ──► (sin escrituras)
└─────────────────────────┘
```

---

## Notas para Fases siguientes

- **FASE 4** debe declarar como _oficiales_ los endpoints en negrita en `recompute_simple.html` y `qa_milu.html`, y marcar como _legacy_ los duplicados de hermanos y de aplicación de revisiones.
- **FASE 7 (Unificación PDF)** debe decidir entre `python:apply_book_preview_to_engine.py` (vía `/api/pdf-preview/apply-to-engine`) y el camino JS `node:scripts/rebuild_engine_from_book_preview.js` (vía `/api/recompute-simple/rebuild-json`).
- **FASE 8 (Unificación hermanos)** debe quedarse con UN endpoint para `applySiblingBulkUpdates` y eliminar el otro de la UI.
