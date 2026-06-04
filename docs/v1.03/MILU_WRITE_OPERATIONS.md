# MILU_WRITE_OPERATIONS — Inventario de escrituras

> **FASE 2** del Plan Maestro V1.03. Catálogo exhaustivo de toda operación que puede modificar datos persistentes en disco.
>
> Cubre dos vectores:
> 1. **Endpoints HTTP** que escriben (52 de 99 endpoints).
> 2. **Scripts CLI** (Python y Node) que escriben fuera del flujo HTTP.

## Leyenda

- **Backup**: ✓ crea `*.bak.*` antes de escribir / ✗ no crea / ◐ parcial (depende de flag).
- **DryRun**: ✓ admite `dryRun:true` o `--dry-run` / ✗ no admite.
- **Riesgo**: BAJO (1 campo / 1 registro), MEDIO (1 archivo), ALTO (multi-archivo o multi-registro).

---

## A. ENGINE — `engine_*.json`

### A.1 Por endpoint HTTP

| Endpoint | Origen UI | Script | Backup | DryRun | Riesgo |
|---|---|---|---|---|---|
| `POST /save-json` (alias `/save-json.php`) | qa_milu, analista_02, qa_analista_registro | inline `setWriteField` (whitelist `server/validation/allowed-fields.js`) | ✗ | ✗ | BAJO |
| `POST /delete-json` (alias `/delete-json.php`) | analista_02 (Eliminar) | inline (splice) | ✗ | ✗ | MEDIO |
| `POST /api/record-editor/update-record` | analista_02 (modal Editar) | inline (loop `setWriteField`) | ✓ | ✗ | MEDIO |
| `POST /clear-engine-fields` | (sin botón vivo) | inline (borra por sufijo) | ✗ | ✓ | **ALTO** |
| `POST /apply-revision-to-engines` | qa_milu, analista_02, qa_analista_registro | revision-apply service | ◐ | ✗ | **ALTO** |
| `POST /recalculate-revision-status` | analista_02 (PDF Recompute revision) | inline `recomputeEngineErrors` | ✓ | ✗ | **ALTO** |
| `POST /recompute-qa-errors` | analista_02 / recompute_simple | inline `recomputeEngineErrors` | ✓ | ✓ | **ALTO** |
| `POST /api/recompute-simple/update-states` | recompute_simple (Recalcular estados) | `node:scripts/update_revision_states.js` | ✓ | ✗ | MEDIO |
| `POST /api/recompute-simple/update-gesa` | recompute_simple (Actualizar GESA) | `node:scripts/update_gesa_fields_from_excel.js` | ✓ | ✓ | MEDIO |
| `POST /api/recompute-simple/update-sust` | recompute_simple (Actualizar GESA + SUST) | `node:scripts/update_sust_fields.js` | ✓ | ✓ | MEDIO |
| `POST /api/recompute-simple/update-fg-fgs` | (sin botón directo) | `node:scripts/update_fg_fgs_fields.js` | ✓ | ✗ | MEDIO |
| `POST /api/recompute-simple/enrich-assets` (sync y `/start` async) | recompute_simple (ASSETS) | `python:rebuild_assets_for_record.py` | ✗ | ✓ | MEDIO |
| `POST /api/recompute-simple/recompute-hermanos` | recompute_simple (Recalcular hermanos) | inline `applySiblingBulkUpdates` | ✓ | ✓ | **ALTO** |
| `POST /api/recompute-simple/generate-missing-esquema-pos` | recompute_simple (POS missing batch) | `python:rebuild_schemes_circles_from_esquemas.py` | ✗ | ✓ | MEDIO |
| `POST /pn-review/apply-siblings-bulk` | analista_02 (Propagar hermanos) | inline `applySiblingBulkUpdates` | ✗ | ✗ | **ALTO** |
| `POST /pn-review/:sku/apply-decision` | (consumo indirecto) | inline | ✗ | ✗ | MEDIO |
| `POST /pn-review/:sku/apply-values` | (consumo indirecto) | inline | ✗ | ✗ | MEDIO |
| `POST /pn-review/by-id/:id/apply-decision` | (consumo indirecto) | inline | ✗ | ✗ | MEDIO |
| `POST /api/pdf-preview/apply-to-engine` | analista_02 (Apply PDF Preview) | `python:apply_book_preview_to_engine.py` o `apply_all_book_previews.py` | ✗ | ✗ | **ALTO** |
| `POST /recompute-pdf-auto-visual` | (sin botón vivo) | `node:scripts/qa_pdf_visual_copy.js` (`runVisualCopyComparison`) | ✓ | ✓ | MEDIO |
| `POST /copy-pdf-to-pdf-all-books` | analista_02 (backend) | `node:scripts/qa_pdf_visual_copy.js` (`runPdfVisualCopyBatch`) | ✓ | ✓ (`writePdf`) | MEDIO |
| `POST /copy-pdf-to-pdf` | analista_02 (frontend) | inline `applyCanonicalPdfCopyToRow` | ✗ | ✗ | BAJO |
| `POST /copy-pdf-to-final-all-books` | analista_02 | inline `resolvePdfToFinalUpdatesForRow` | ✓ | ✗ | MEDIO |
| `POST /calculate-final-fields` ⚠️ legacy | analista_02 (Calculate final) | `python:copy_gesa_fields_to_final.py` | ✗ | ✗ | MEDIO |

### A.2 Por script CLI (sin pasar por HTTP)

Scripts capaces de modificar `engine_*.json` si se ejecutan directamente. **Riesgo de operativa accidental** alto si quedan en raíz sin gating.

| Script | Modo | Backup | DryRun | Estado |
|---|---|---|---|---|
| [depuracion_json.py](../../depuracion_json.py) | CLI manual | ✗ | ✗ | OFICIAL (proceso final) |
| [recompute_engine_errors.js](../../recompute_engine_errors.js) | npm `qa:recompute-errors` | ✓ | ✓ | OFICIAL |
| [rebuild_engine_from_book_preview.js](../../rebuild_engine_from_book_preview.js) | npm `rebuild:engine:*` | ✓ | ✓ | OFICIAL |
| [scripts/refactor_json_fields.py](../../scripts/refactor_json_fields.py) | npm `refactor:json[:dry]` | ✗ | ✓ | OFICIAL |
| [scripts/enrich_rebuild_with_gesa_sust.js](../../scripts/enrich_rebuild_with_gesa_sust.js) | npm `rebuild:enrich:*` | ✗ | ✓ | OFICIAL |
| [apply_book_preview_to_engine.py](../../apply_book_preview_to_engine.py) | invocado por `apply_all_book_previews.py` o por endpoint | ✗ | ✗ | OFICIAL (vía endpoint) |
| [apply_all_book_previews.py](../../apply_all_book_previews.py) | CLI manual y endpoint | ✗ | ✗ | OFICIAL (vía endpoint) |
| [add_final_fields.py](../../add_final_fields.py) | función auxiliar | n/a | n/a | AUXILIAR (importada) |
| [scripts/fill_engine_esquemas_from_pdf.py](../../scripts/fill_engine_esquemas_from_pdf.py) | CLI manual | ◐ | ✓ | AUXILIAR |
| [clear_engine_fields.py](../../clear_engine_fields.py) | CLI manual | ✗ | ✓ | **PELIGROSO** — borra por sufijo |
| [clear_pdf_fields.py](../../clear_pdf_fields.py) | CLI manual | ✗ | ✓ | **PELIGROSO** |
| [copy_gesa_fields_to_final.py](../../copy_gesa_fields_to_final.py) | endpoint `/calculate-final-fields` y CLI | ✗ | ✗ | LEGACY |
| [copy_pdf_fields_to_final.py](../../copy_pdf_fields_to_final.py) | CLI manual | ? | ✗ | LEGACY |
| [marcar_articulos_en_web.py](../../marcar_articulos_en_web.py) | CLI manual | ✗ | ✗ | LEGACY (fuera de alcance AR-3) |
| [importar_json.py](../../importar_json.py) | CLI manual | ? | ? | LEGACY |
| [pretty_print_all_json.py](../../pretty_print_all_json.py) | CLI manual | ✗ | ✗ | LEGACY (formateo) |
| [refactor_measurement_error.py](../../refactor_measurement_error.py) | CLI manual | ✗ | ✗ | LEGACY (refactor histórico) |
| [scripts/rebuild_engine_from_book_preview.js](../../scripts/rebuild_engine_from_book_preview.js) | invocado por endpoint y CLI | ✗ | ✓ | OFICIAL (escribe `data/02-engine_rebuild/`, no engine directo) |

> ⚠️ **Acción FASE 6**: gating con `SERVER_ENABLE_DANGEROUS_WRITE` y/o cuarentena para todos los marcados PELIGROSO/LEGACY.

---

## B. REBUILD — `data/02-engine_rebuild/engine_rebuild_*.json`

| Operación | Script / Endpoint | Backup | DryRun |
|---|---|---|---|
| Reconstrucción desde book preview | `POST /api/recompute-simple/rebuild-json` → `node:scripts/rebuild_engine_from_book_preview.js` | ✗ | ✓ |
| Enriquecimiento con assets | `node:scripts/enrich_rebuild_with_assets.js` (npm) | ✗ | ✓ |
| Enriquecimiento con GESA/SUST | `node:scripts/enrich_rebuild_with_gesa_sust.js` (npm `rebuild:enrich:*`) | ✗ | ✓ |
| Esquemas BOM (parcial) | `python:rebuild_schemes_by_bom.py` | ◐ | ✓ |

> Estos archivos son la _staging_ del rebuild; no son consumidos directamente por la UI hasta que se promocionan a `engine_*.json` por el operador.

---

## C. QA REVISION — `qa_revision_server_data.json`

| Operación | Script / Endpoint | Backup | DryRun |
|---|---|---|---|
| Sync incremental (botones de revisión) | `POST /qa_revision_sync.php` | ✗ | ✗ |
| Undo de último cambio | `POST /qa_revision_sync.php` (acción undo) | ✗ | ✗ |

Todas las operaciones de bulk-revision (`/apply-revision-to-engines`) **leen** este archivo y **escriben** en los `engine_*.json` correspondientes. La fuente de verdad de revisiones es `qa_revision_server_data.json`.

---

## D. AUDIT LOG — `qa_audit_log.json`

| Operación | Endpoint | Backup | DryRun |
|---|---|---|---|
| Append entrada | `POST /audit-log` | ✗ | ✗ |
| Truncar | `DELETE /audit-log` | ✗ | ✗ |

---

## E. IMÁGENES Y ESQUEMAS

### E.1 `esquemas/` (PNG por BOM)

| Operación | Endpoint / Script | Backup | DryRun |
|---|---|---|---|
| Generación individual | `POST /api/esquemas/generate-one` → `python:generate_esquema_pos.py` | ✗ | ✓ |
| Reconstrucción por BOM | `POST /api/recompute-simple/rebuild-schemes-by-bom` → `python:rebuild_schemes_by_bom.py` | ◐ | ✓ |

### E.2 `esquemas_pos_circulos/` (WEBP con círculos POS)

| Operación | Endpoint / Script | Backup | DryRun |
|---|---|---|---|
| Generación individual | `POST /api/esquemas-pos/generate-one` → `python:rebuild_schemes_circles_from_esquemas.py` | ✗ | ✓ |
| Generación batch | `POST /api/apply-generate-batch` → idem | ✗ | ✗ |
| Generación faltantes | `POST /api/recompute-simple/generate-missing-esquema-pos` → idem | ✗ | ✓ |
| Reconstrucción completa | `POST /api/recompute-simple/rebuild-schemes-circles-from-esquemas` → idem | ◐ | ✓ |
| npm CLI | `npm run qa:esquemas-pos:missing[:dry]` → idem | ✗ | ✓ |
| Limpieza masiva | `python:clear_esquemas_pos_fields.py` | ✗ | ✓ | **PELIGROSO** |
| Generación batch faltantes | `python:scripts/generate_missing_esquema_pos_batch.py` | ✗ | ✓ |

### E.3 `rebuild_schemes_circles_manual_overrides.json`

| Operación | Endpoint / Script |
|---|---|
| Upsert de override | `POST /api/apply-batch` (inline) |
| Upsert dentro de batch | `POST /api/apply-generate-batch` |
| Normalización PX | `python:scripts/normalize_manual_override_px.py` |

### E.4 `fotos_articulos/`, `fotos_motores/`

Solo escritos como efecto secundario de `python:rebuild_assets_for_record.py` (vía `/api/recompute-simple/enrich-assets`). No hay endpoint dedicado.

---

## F. EXPORT

### F.1 WordPress — `data/05-wordpress/*.json`

| Operación | Endpoint / Script | Backup | DryRun |
|---|---|---|---|
| Generación import | `POST /export/run-wordpress` → `node:scripts/export_wordpress_milu.js` | ✗ | (`--dry-run` en CLI) |
| CLI directa | `npm run export:wordpress` | ✗ | ✓ |
| Validación superseded | `npm run export:wordpress:validate` (read-only de salida) | n/a | n/a |

### F.2 FTP / Pages — `dist/`, `deploy_ftp/`

| Operación | Script | Backup | DryRun |
|---|---|---|---|
| Build deploy FTP | `npm run build:ftp` → `node:scripts/build_ftp_deploy.js` | ✗ | ✗ |
| Preparar Pages | `npm run pages:prepare[:dry][:incremental]` → `node:scripts/prepare-pages-dist.js` | ✗ | ✓ |
| Publicar Pages | `npm run pages:publish*` → `scripts/publish-pages.ps1` (Git push) | n/a | ◐ (`-NoPush`, `-NoCommit`) |
| Publicación segura | `npm run pages:publish:safe` → `scripts/publish-safe.ps1` | n/a | n/a |
| Build release folder | `npm run release:folder*` → `node:scripts/build-release-folder.js` | ✗ | ✓ |
| Backup Git manual | `npm run git:backup` → `scripts/git-backup.ps1` | ✓ | n/a |

> ⚠️ Estos scripts pueden hacer push a remotos. **NO** son operaciones reversibles localmente. Requieren atención especial en FASE 6.

### F.3 Synthetic / Legacy AI — DEPRECATED

| Item | Estado |
|---|---|
| `npm run legacy:generate:synthetic` → `generate_synthetic_exports.js` | LEGACY, no se ha eliminado del `package.json`. |
| `npm run legacy:ai:conflicts` → `legacy/export_complex_ai/scripts/ai_conflict_rules.js` | LEGACY (carpeta `legacy/`). |
| `npm run legacy:export:review` → `legacy/export_complex_ai/scripts/export_review_pipeline.js all` | LEGACY. |
| Endpoints `/export/run-synthetic`, `/export/run-ai-conflicts`, `/export/run-all` | 410 inline. |

---

## G. SQLITE MIRROR — `*.db`

| Operación | npm script | Modo |
|---|---|---|
| Importar engines a SQLite | `npm run db:import` | reescritura completa del `.db` |
| Crear índices | `npm run db:index` | escritura |
| Validar mirror | `npm run db:validate` | READ-ONLY |
| Queries de muestra | `npm run db:queries` | READ-ONLY |

El mirror es **derivado** de los `engine_*.json`. Sin endpoint que lo escriba en runtime: solo CLI.

---

## H. Reportes / temporales (low-stakes)

Escritos por scripts y endpoints diversos en raíz: `tmp_*.json`, `tmp_*.csv`, `tmp_*.log`, `*_report.json`, `*_report.md`, `clear_esquemas_pos_fields_report.json`. **No requieren backup ni gating**, pero contribuyen al ruido del repo y deberían moverse a `reports/` (FASE 5).

---

## I. Resumen de riesgo agregado

| Categoría | Endpoints ALTO | Endpoints MEDIO | Scripts CLI peligrosos |
|---|---|---|---|
| Engine writes | 7 | 12 | 6 |
| Esquemas/imágenes | 0 | 4 | 1 |
| Export / Pages | 0 | 2 | 4 (push remoto) |
| QA revision / audit | 0 | 0 | 0 |
| **Total** | **7** | **18** | **11** |

## J. Plan de mitigación (resumen para FASE 6)

1. Introducir variable de entorno `SERVER_ENABLE_DANGEROUS_WRITE`. Si `!= "1"`, bloquear con `403`:
   - `POST /clear-engine-fields`
   - `POST /api/recompute-simple/recompute-hermanos` con `engine=ALL`
   - `POST /pn-review/apply-siblings-bulk` cuando `scope=ALL`
   - `POST /apply-revision-to-engines` con `mode=all`
   - `POST /api/pdf-preview/apply-to-engine` con `applyAll=true`
   - `POST /api/apply-generate-batch`
2. Forzar `dryRun:true` por defecto en `/recompute-qa-errors` y `/recalculate-revision-status` cuando no se especifique.
3. Mover scripts CLI peligrosos (`clear_engine_fields.py`, `clear_pdf_fields.py`, `marcar_articulos_en_web.py`, `pretty_print_all_json.py`, `importar_json.py`, `refactor_measurement_error.py`) a `legacy_quarantine/` (FASE 5).
4. Centralizar política de backup: factor común `withBackup(filePath, fn)` + TTL de borrado de `.bak.*` antiguos.
5. Eliminar entradas `legacy:*` del `package.json` o renombrarlas a `legacy:gated:*` y exigir flag.
