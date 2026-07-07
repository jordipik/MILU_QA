# MILU_OFFICIAL_COMPONENTS — Única verdad V1.03

> **FASE 4** del Plan Maestro V1.03. Este documento es la **referencia principal** del sistema antes de mover nada a `legacy_quarantine/`.
>
> Define qué componentes forman el núcleo oficial de MILU V1.03 y cuáles quedan fuera.
>
> Entradas obligatorias:
> - [MILU_BASELINE_2026.md](MILU_BASELINE_2026.md)
> - [MILU_RUNTIME_MAP.md](MILU_RUNTIME_MAP.md)
> - [MILU_WRITE_OPERATIONS.md](MILU_WRITE_OPERATIONS.md)
> - [MILU_ORPHAN_COMPONENTS.md](MILU_ORPHAN_COMPONENTS.md)
>
> Estado de la congelación V1.03: **ACTIVA**. Este documento NO modifica código.

## Estados V1.03 (vocabulario controlado)

| Estado | Significado |
|---|---|
| `OFFICIAL_V103` | Núcleo oficial. Forma parte del pipeline o de las pantallas principales. No se elimina ni modifica sin un cambio mayor de versión. |
| `SUPPORTED_V103` | Útil pero no núcleo. Diagnóstico, analytics, audit, mirror, herramientas internas. Se mantiene; puede evolucionar. |
| `LEGACY_V102` | Funcional pero declarado obsoleto. No usar en nuevos flujos. Candidato a eliminación post V1.03. |
| `DANGEROUS_WRITE` | Operación destructiva sin las salvaguardas mínimas (backup, dryRun, gating). Debe ponerse detrás de `SERVER_ENABLE_DANGEROUS_WRITE` (FASE 6). Puede solaparse con otros estados. |
| `ORPHAN` | No invocado por ningún flujo conocido. Candidato a cuarentena (FASE 5). |
| `QUARANTINE_CANDIDATE` | Identificado para mover a `legacy_quarantine/` en FASE 5 (no borrar). |
| `REMOVE_CANDIDATE` | Endpoint `410` o ruta inerte. Eliminar físicamente del código en FASE 5. |

---

## 1. Pipeline oficial V1.03

Único pipeline reconocido. Cualquier flujo equivalente que NO encaje aquí es legacy o duplicado.

| # | Paso | Botón oficial | HTML oficial | Endpoint oficial | Script oficial | Archivos modificados | Riesgo | Backup | DryRun | Estado |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | REBUILD | `IMPORTAR PDF` | [recompute_simple.html](../../recompute_simple.html) | `POST /api/recompute-simple/rebuild-json` | `node:scripts/rebuild_engine_from_book_preview.js` | `data/02-engine_rebuild/engine_rebuild_*.json` | BAJO | ✗ | ✓ | OFFICIAL_V103 |
| 2 | GESA | `Actualizar GESA` | [recompute_simple.html](../../recompute_simple.html) | `POST /api/recompute-simple/update-gesa` | `node:scripts/update_gesa_fields_from_excel.js` | `engine_*.json` | MEDIO | ✓ | ✓ | OFFICIAL_V103 |
| 3 | SUST | `Actualizar GESA + SUST` | [recompute_simple.html](../../recompute_simple.html) | `POST /api/recompute-simple/update-sust` | `node:scripts/update_sust_fields.js` | `engine_*.json` | MEDIO | ✓ | ✓ | OFFICIAL_V103 |
| 4 | ASSETS | `ASSETS` (+ polling jobs, + Cancelar) | [recompute_simple.html](../../recompute_simple.html) | `POST /api/recompute-simple/enrich-assets` y `/enrich-assets/start` | `python:rebuild_assets_for_record.py` | `engine_*.json`, `fotos_articulos/`, `esquemas/`, `esquemas_pos_circulos/` | MEDIO | ✗ | ✓ | OFFICIAL_V103 |
| 5 | FINAL (depuración) | (CLI) | n/a (proceso offline) | n/a | `python:depuracion_json.py` (+ `add_final_fields.py`) | `engine_*.json` (recálculo `measurement_final`, normalización) | MEDIO | ✗ | ✗ | OFFICIAL_V103 |
| 6 | ERRORES | `Errores` / `PDF Recompute errors` | [recompute_simple.html](../../recompute_simple.html), [analista_02.html](../../analista_02.html) | `POST /recompute-qa-errors` | `inline:recomputeEngineErrors` | `engine_*.json` (campos `total_error`, `has_error`) | ALTO | ✓ | ✓ | OFFICIAL_V103 + DANGEROUS_WRITE |
| 7 | ESTADOS | `Recalcular estados` | [recompute_simple.html](../../recompute_simple.html) | `POST /api/recompute-simple/update-states` | `node:scripts/update_revision_states.js` | `engine_*.json` (`qa_revision_estado`, `qa_revision_accion`) | MEDIO | ✓ | ✗ | OFFICIAL_V103 |
| 8 | HERMANOS | `Recalcular hermanos` | [recompute_simple.html](../../recompute_simple.html) | `POST /api/recompute-simple/recompute-hermanos` | `inline:applySiblingBulkUpdates` | `engine_*.json` | ALTO | ✓ | ✓ | OFFICIAL_V103 + DANGEROUS_WRITE |
| 9 | ESQUEMAS | `Esquemas (BOM) — Write` | [recompute_simple.html](../../recompute_simple.html) | `POST /api/recompute-simple/rebuild-schemes-by-bom` | `python:rebuild_schemes_by_bom.py` | `esquemas/*.png`, `data/02-engine_rebuild/engine_rebuild_*.json` | MEDIO | ◐ | ✓ | OFFICIAL_V103 |
| 10 | ESQUEMAS_POS | `Esquemas (POS) — Write` | [recompute_simple.html](../../recompute_simple.html) | `POST /api/recompute-simple/rebuild-schemes-circles-from-esquemas` | `python:rebuild_schemes_circles_from_esquemas.py` | `esquemas_pos_circulos/*.webp`, `rebuild_schemes_circles_manual_overrides.json` | MEDIO | ◐ | ✓ | OFFICIAL_V103 |
| 11 | MANUAL_OVERRIDE | `Override picker (manual)` | [recompute_simple.html](../../recompute_simple.html) | `POST /api/recompute-simple/manual-override-picker` (+ `POST /api/apply-batch` para upsert) | `inline` | `rebuild_schemes_circles_manual_overrides.json` | BAJO | ✗ | n/a | OFFICIAL_V103 |
| 12 | EXPORT WORDPRESS | `Ejecutar export WordPress` | [export_wordpress.html](../../export_wordpress.html) | `POST /export/run-wordpress` | `node:scripts/export_wordpress_milu.js` | `data/05-wordpress/milu_wp_import.json`, `milu_wp_superseded.json` | MEDIO | ✗ | ✓ (CLI) | OFFICIAL_V103 |

### Notas del pipeline

- El paso **5 FINAL** no tiene endpoint HTTP en V1.03: es un proceso offline ejecutado tras los pasos 1–4. El endpoint legacy `/calculate-final-fields` (que invoca `copy_gesa_fields_to_final.py`) queda fuera del pipeline oficial — ver §6.
- Los pasos **6 ERRORES** y **8 HERMANOS** están marcados como `DANGEROUS_WRITE` además de `OFFICIAL_V103`: deben pasar por `SERVER_ENABLE_DANGEROUS_WRITE` cuando el `scope=ALL`.
- El paso **11 MANUAL_OVERRIDE** combina dos endpoints (`manual-override-picker` para preview de coordenadas, `apply-batch` para persistir) — ambos son oficiales.
- El paso **9** y el **10** son los únicos con dos endpoints alternativos cada uno (variantes "generate-one" vs "rebuild-from-esquemas"); la decisión final se difiere a FASE 9 (ver §8).

---

## 2. Frontends oficiales

Clasificación de los 22 HTMLs detectados. La distinción entre `OFFICIAL_V103` y `SUPPORTED_V103` es: el primero forma parte del pipeline operativo diario; el segundo es herramienta de soporte (consulta, analytics, diagnóstico).

| HTML | Estado | Rol | Notas |
|---|---|---|---|
| [recompute_simple.html](../../recompute_simple.html) | **OFFICIAL_V103** | Pipeline numerado 1–11 | Punto de entrada del pipeline oficial |
| [qa_milu.html](../../qa_milu.html) | **OFFICIAL_V103** | QA principal (revisión, edición campo a campo) | |
| [analista_02.html](../../analista_02.html) | **OFFICIAL_V103** | Editor de registro + import PDF embebido | Contiene botones que duplican el pipeline; ver §8 |
| [export_wordpress.html](../../export_wordpress.html) | **OFFICIAL_V103** | Step 12 del pipeline | |
| [milu_shell.html](../../milu_shell.html) | **OFFICIAL_V103** | Shell que embebe vistas | |
| [index.html](../../index.html) | **OFFICIAL_V103** | Punto de entrada / landing | |
| [import_pdf.html](../../import_pdf.html) | **SUPPORTED_V103** | Embebida en `analista_02.html` | Sin endpoints propios |
| [qa_analista_registro.html](../../qa_analista_registro.html) | **SUPPORTED_V103** | Editor por registro (acceso directo) | Redundante con `analista_02` pero útil |
| [qa_auditoria.html](../../qa_auditoria.html) | **SUPPORTED_V103** | Audit log viewer | |
| [qa_imagenes.html](../../qa_imagenes.html) | **SUPPORTED_V103** | QA de imágenes (read-only) | |
| [qa_lista_agrupada.html](../../qa_lista_agrupada.html) | **SUPPORTED_V103** | Vista agrupada (embed) | |
| [analytics_dashboard.html](../../analytics_dashboard.html) | **SUPPORTED_V103** | Dashboard SQLite | |
| [analytics_engine_detail.html](../../analytics_engine_detail.html) | **SUPPORTED_V103** | Detalle por motor | |
| [analytics_pn.html](../../analytics_pn.html) | **SUPPORTED_V103** | Conflictos PN | |
| [analytics_pn_detail.html](../../analytics_pn_detail.html) | **SUPPORTED_V103** | Detalle por PN | |
| [analytics_qa.html](../../analytics_qa.html) | **SUPPORTED_V103** | Pendientes QA | |
| [analytics_images.html](../../analytics_images.html) | **SUPPORTED_V103** | Imágenes faltantes/placeholder | |
| [analytics_export.html](../../analytics_export.html) | **SUPPORTED_V103** | Estado de export | |
| [analytics_search.html](../../analytics_search.html) | **SUPPORTED_V103** | Buscador SQLite | |
| [exportacion.html](../../exportacion.html) | **LEGACY_V102** | Vista antigua de exports | Reemplazada por `export_wordpress.html`. Verificar embed en `milu_shell` antes de cuarentenar |
| [auto_depuracion.html](../../auto_depuracion.html) | **QUARANTINE_CANDIDATE** | Archivo vacío / huérfano | Mover en FASE 5 |
| [analista_02.html](../../analista_02.html) (sub-modo "Recompute panel") | OFFICIAL_V103 | (mismo HTML, no duplicado) | Comparte endpoints con `recompute_simple.html` |

### Resumen frontends

- **OFFICIAL_V103**: 6
- **SUPPORTED_V103**: 13
- **LEGACY_V102**: 1
- **QUARANTINE_CANDIDATE**: 1

---

## 3. Endpoints oficiales

Clasificación de los 99 endpoints. Domains: `recompute-simple`, `qa-revision`, `pn-review`, `engine-write`, `pdf-import`, `images`, `export`, `analytics`, `audit`, `health/util`.

### 3.1 Tabla principal

| Método | Endpoint | Dominio | Usado por | Escribe datos | Riesgo | Estado V1.03 |
|---|---|---|---|---|---|---|
| POST | `/api/recompute-simple/rebuild-json` | recompute-simple | recompute_simple | `data/02-engine_rebuild/*` | BAJO | OFFICIAL_V103 |
| POST | `/api/recompute-simple/update-gesa` | recompute-simple | recompute_simple | engine_*.json | MEDIO | OFFICIAL_V103 |
| POST | `/api/recompute-simple/update-sust` | recompute-simple | recompute_simple | engine_*.json | MEDIO | OFFICIAL_V103 |
| POST | `/api/recompute-simple/update-states` | recompute-simple | recompute_simple | engine_*.json | MEDIO | OFFICIAL_V103 |
| POST | `/api/recompute-simple/enrich-assets` | recompute-simple | recompute_simple | engine_*.json + fotos/esquemas | MEDIO | OFFICIAL_V103 |
| POST | `/api/recompute-simple/enrich-assets/start` | recompute-simple | recompute_simple | engine_*.json + fotos/esquemas | MEDIO | OFFICIAL_V103 |
| GET | `/api/recompute-simple/enrich-assets/jobs/:jobId` | recompute-simple | recompute_simple | READ-ONLY | BAJO | OFFICIAL_V103 |
| POST | `/api/recompute-simple/enrich-assets/jobs/:jobId/cancel` | recompute-simple | recompute_simple | READ-ONLY | BAJO | OFFICIAL_V103 |
| POST | `/api/recompute-simple/recompute-hermanos` | recompute-simple | recompute_simple | engine_*.json | ALTO | OFFICIAL_V103 + DANGEROUS_WRITE |
| POST | `/api/recompute-simple/rebuild-schemes-by-bom` | recompute-simple | recompute_simple | esquemas/, engine_rebuild_*.json | MEDIO | OFFICIAL_V103 |
| POST | `/api/recompute-simple/rebuild-schemes-circles-from-esquemas` | recompute-simple | recompute_simple | esquemas_pos_circulos/, manual_overrides | MEDIO | OFFICIAL_V103 |
| POST | `/api/recompute-simple/manual-override-picker` | recompute-simple | recompute_simple | READ-ONLY (URL builder) | BAJO | OFFICIAL_V103 |
| POST | `/api/recompute-simple/update-fg-fgs` | recompute-simple | (sin botón directo) | engine_*.json | MEDIO | SUPPORTED_V103 |
| POST | `/api/recompute-simple/generate-missing-esquema-pos` | recompute-simple | recompute_simple | esquemas_pos_circulos/, engine_*.json | MEDIO | SUPPORTED_V103 (decisión FASE 9) |
| POST | `/recompute-qa-errors` | recompute-simple | recompute_simple, analista_02 | engine_*.json | ALTO | OFFICIAL_V103 + DANGEROUS_WRITE |
| POST | `/recalculate-revision-status` | qa-revision | analista_02 | engine_*.json | ALTO | SUPPORTED_V103 + DANGEROUS_WRITE |
| GET | `/qa_revision_sync.php` | qa-revision | qa_milu | READ-ONLY | BAJO | OFFICIAL_V103 |
| POST | `/qa_revision_sync.php` | qa-revision | qa_milu | qa_revision_server_data.json | BAJO | OFFICIAL_V103 |
| POST | `/apply-revision-to-engines` | qa-revision | qa_milu, analista_02, qa_analista_registro | engine_*.json | ALTO | OFFICIAL_V103 + DANGEROUS_WRITE |
| GET | `/pn-review/list` | pn-review | (consumo desde qa_milu/analista_02) | READ-ONLY | BAJO | OFFICIAL_V103 |
| GET | `/pn-review/:sku` | pn-review | (consumo) | READ-ONLY | BAJO | OFFICIAL_V103 |
| GET | `/pn-review/:sku/sources` | pn-review | (consumo) | READ-ONLY | BAJO | OFFICIAL_V103 |
| POST | `/pn-review/:sku/apply-decision` | pn-review | (consumo) | engine_*.json | MEDIO | OFFICIAL_V103 |
| POST | `/pn-review/:sku/apply-values` | pn-review | (consumo) | engine_*.json | MEDIO | OFFICIAL_V103 |
| POST | `/pn-review/by-id/:id/apply-decision` | pn-review | (consumo) | engine_*.json | MEDIO | OFFICIAL_V103 |
| POST | `/pn-review/apply-siblings-bulk` | pn-review | analista_02 | engine_*.json | ALTO | LEGACY_V102 + DANGEROUS_WRITE (decisión FASE 8) |
| POST | `/save-json` (+ `.php` alias) | engine-write | qa_milu, analista_02, qa_analista_registro | engine_*.json (1 campo) | BAJO | OFFICIAL_V103 |
| POST | `/delete-json` (+ `.php` alias) | engine-write | analista_02 | engine_*.json (borra registro) | MEDIO | OFFICIAL_V103 |
| POST | `/api/record-editor/update-record` | engine-write | analista_02, milu_shell | engine_*.json (multi-field) | MEDIO | OFFICIAL_V103 |
| POST | `/clear-engine-fields` | engine-write | (sin botón vivo) | engine_*.json | ALTO | DANGEROUS_WRITE + ORPHAN |
| POST | `/api/pdf-preview/apply-to-engine` | pdf-import | analista_02 | engine_*.json | ALTO | OFFICIAL_V103 + DANGEROUS_WRITE (decisión FASE 7) |
| POST | `/copy-pdf-to-pdf` | pdf-import | analista_02 (frontend) | engine_*.json | BAJO | SUPPORTED_V103 (decisión FASE 7) |
| POST | `/copy-pdf-to-pdf-all-books` | pdf-import | analista_02 (backend) | engine_*.json | MEDIO | SUPPORTED_V103 (decisión FASE 7) |
| POST | `/copy-pdf-to-final-all-books` | pdf-import | analista_02 | engine_*.json | MEDIO | SUPPORTED_V103 (decisión FASE 7) |
| POST | `/recompute-pdf-auto-visual` | pdf-import | (sin botón vivo) | engine_*.json | MEDIO | SUPPORTED_V103 / ORPHAN-UI |
| GET | `/api/esquemas-pos-index` | images | qa_milu, recompute_simple | READ-ONLY | BAJO | OFFICIAL_V103 |
| POST | `/api/esquemas/generate-one` | images | qa_milu, recompute_simple | esquemas/ | BAJO | OFFICIAL_V103 |
| POST | `/api/esquemas-pos/generate-one` | images | recompute_simple | esquemas_pos_circulos/ | BAJO | SUPPORTED_V103 (decisión FASE 9) |
| POST | `/api/apply-batch` | images | recompute_simple | manual_overrides.json | BAJO | OFFICIAL_V103 |
| POST | `/api/apply-generate-batch` | images | recompute_simple (override picker) | esquemas_pos_circulos/, manual_overrides | MEDIO | SUPPORTED_V103 + DANGEROUS_WRITE (decisión FASE 9) |
| POST | `/export/run-wordpress` | export | qa_milu, export_wordpress, exportacion | data/05-wordpress/ | MEDIO | OFFICIAL_V103 |
| GET | `/export/preview` | export | export_wordpress | READ-ONLY | BAJO | OFFICIAL_V103 |
| GET | `/export/wordpress-decisions` | export | export_wordpress | READ-ONLY | BAJO | OFFICIAL_V103 |
| GET | `/export/trace/:sku` | export | export_wordpress | READ-ONLY | BAJO | OFFICIAL_V103 |
| GET | `/export/files` | export | export_wordpress, exportacion | READ-ONLY | BAJO | OFFICIAL_V103 |
| GET | `/export/status` | export | export_wordpress | READ-ONLY | BAJO | OFFICIAL_V103 |
| GET | `/export/file` | export | export_wordpress | READ-ONLY | BAJO | OFFICIAL_V103 |
| GET | `/export/download` | export | qa_milu, export_wordpress | READ-ONLY | BAJO | OFFICIAL_V103 |
| POST | `/calculate-final-fields` | engine-write | analista_02 (Calculate final) | engine_*.json | MEDIO | LEGACY_V102 |
| GET | `/audit-log` | audit | qa_auditoria | READ-ONLY | BAJO | SUPPORTED_V103 |
| POST | `/audit-log` | audit | varios (registro de eventos) | qa_audit_log.json | BAJO | SUPPORTED_V103 |
| DELETE | `/audit-log` | audit | qa_auditoria (Clear) | qa_audit_log.json | BAJO | SUPPORTED_V103 |
| GET | `/` | health/util | navegador raíz | READ-ONLY | BAJO | OFFICIAL_V103 |
| GET | `/health` | health/util | diagnóstico | READ-ONLY | BAJO | OFFICIAL_V103 |
| GET | `/engines` | health/util | qa_milu, varios | READ-ONLY | BAJO | OFFICIAL_V103 |
| GET | `/version` | health/util | index | READ-ONLY | BAJO | OFFICIAL_V103 |
| GET | `/save-json.php`, `/delete-json.php` | health/util | compat | READ-ONLY (handshake) | BAJO | SUPPORTED_V103 |
| GET | `/db/*` (8 rutas) | analytics | analytics_*.html | READ-ONLY (mirror SQLite) | BAJO | SUPPORTED_V103 |
| GET | `/db/analytics/*` (15 rutas) | analytics | analytics_*.html | READ-ONLY | BAJO | SUPPORTED_V103 |

### 3.2 Endpoints REMOVE_CANDIDATE (410 inertes)

| Método | Endpoint | Estado V1.03 | Acción FASE 5 |
|---|---|---|---|
| POST | `/recompute-pdf-auto` | REMOVE_CANDIDATE | Eliminar ruta |
| POST | `/export/run-synthetic` | REMOVE_CANDIDATE | Eliminar ruta |
| POST | `/export/run-ai-conflicts` | REMOVE_CANDIDATE | Eliminar ruta |
| POST | `/export/run-all` | REMOVE_CANDIDATE | Eliminar ruta |
| POST | `/apply-qa-checks-filter` | REMOVE_CANDIDATE | Eliminar ruta |
| GET | `/pn/list` | REMOVE_CANDIDATE | Eliminar ruta |
| GET | `/pn/:sku` | REMOVE_CANDIDATE | Eliminar ruta |
| GET | `/pn/:sku/sources` | REMOVE_CANDIDATE | Eliminar ruta |

### 3.3 Resumen endpoints

- **OFFICIAL_V103**: 38 (incluye 7 con flag DANGEROUS_WRITE)
- **SUPPORTED_V103**: 33 (incluye los `/db/*`, audit, export reads, pdf copy)
- **LEGACY_V102**: 2 (`/calculate-final-fields`, `/pn-review/apply-siblings-bulk` pendiente FASE 8)
- **DANGEROUS_WRITE** (overlay): 8
- **ORPHAN** (sin UI): 1 (`/clear-engine-fields`) + 4 con uso indirecto
- **REMOVE_CANDIDATE**: 8

---

## 4. Scripts oficiales

### 4.1 Tabla principal

| Script | Dominio | Invocado por | Escribe engine | Escribe imágenes | Escribe export | Backup | DryRun | Estado V1.03 |
|---|---|---|---|---|---|---|---|---|
| [server.js](../../server.js) | core | node | indirecto | indirecto | indirecto | n/a | n/a | OFFICIAL_V103 |
| [recompute_engine_errors.js](../../recompute_engine_errors.js) | recompute | npm `qa:recompute-errors`, server `/recompute-qa-errors` | ✓ | ✗ | ✗ | ✓ | ✓ | OFFICIAL_V103 + DANGEROUS_WRITE |
| [rebuild_engine_from_book_preview.js](../../rebuild_engine_from_book_preview.js) | rebuild | npm `rebuild:engine:*`, server `/api/recompute-simple/rebuild-json` | ✗ (escribe rebuild, no engine) | ✗ | ✗ | ✗ | ✓ | OFFICIAL_V103 |
| [scripts/rebuild_engine_from_book_preview.js](../../scripts/rebuild_engine_from_book_preview.js) | rebuild | server | ✗ | ✗ | ✗ | ✗ | ✓ | OFFICIAL_V103 |
| [rebuild_assets_for_record.py](../../rebuild_assets_for_record.py) | assets | server `/enrich-assets` | ✓ | ✓ | ✗ | ✗ | ✓ | OFFICIAL_V103 |
| [rebuild_schemes_by_bom.py](../../rebuild_schemes_by_bom.py) | schemes | server `/rebuild-schemes-by-bom` | ✗ (rebuild) | ✓ | ✗ | ◐ | ✓ | OFFICIAL_V103 |
| [rebuild_schemes_circles_from_esquemas.py](../../rebuild_schemes_circles_from_esquemas.py) | schemes-pos | server (4 endpoints), npm `qa:esquemas-pos:*` | ✓ (campos POS) | ✓ | ✗ | ◐ | ✓ | OFFICIAL_V103 |
| [generate_esquema_pos.py](../../generate_esquema_pos.py) | schemes | server `/api/esquemas/generate-one` | ✗ | ✓ | ✗ | ✗ | ✓ | OFFICIAL_V103 |
| [apply_book_preview_to_engine.py](../../apply_book_preview_to_engine.py) | pdf-import | server `/api/pdf-preview/apply-to-engine` (single) | ✓ | ✗ | ✗ | ✗ | ✗ | OFFICIAL_V103 + DANGEROUS_WRITE (decisión FASE 7) |
| [apply_all_book_previews.py](../../apply_all_book_previews.py) | pdf-import | server `/api/pdf-preview/apply-to-engine` (applyAll), CLI | ✓ | ✗ | ✗ | ✗ | ✗ | OFFICIAL_V103 + DANGEROUS_WRITE (decisión FASE 7) |
| [scripts/update_revision_states.js](../../scripts/update_revision_states.js) | states | server `/update-states` | ✓ | ✗ | ✗ | ✓ | ✗ | OFFICIAL_V103 |
| [scripts/update_gesa_fields_from_excel.js](../../scripts/update_gesa_fields_from_excel.js) | gesa | server `/update-gesa` | ✓ | ✗ | ✗ | ✓ | ✓ | OFFICIAL_V103 |
| [scripts/update_sust_fields.js](../../scripts/update_sust_fields.js) | sust | server `/update-sust` | ✓ | ✗ | ✗ | ✓ | ✓ | OFFICIAL_V103 |
| [scripts/update_fg_fgs_fields.js](../../scripts/update_fg_fgs_fields.js) | gesa | server `/update-fg-fgs` | ✓ | ✗ | ✗ | ✓ | ✗ | SUPPORTED_V103 |
| [scripts/enrich_rebuild_with_assets.js](../../scripts/enrich_rebuild_with_assets.js) | rebuild | server, indirecto | ✗ (rebuild) | ✗ | ✗ | ✗ | ✓ | OFFICIAL_V103 |
| [scripts/enrich_rebuild_with_gesa_sust.js](../../scripts/enrich_rebuild_with_gesa_sust.js) | rebuild | npm `rebuild:enrich:*` | ✗ (rebuild) | ✗ | ✗ | ✗ | ✓ | OFFICIAL_V103 |
| [scripts/qa_pdf_visual_copy.js](../../scripts/qa_pdf_visual_copy.js) | pdf-copy | server `/recompute-pdf-auto-visual`, `/copy-pdf-to-pdf-all-books` | ✓ | ✗ | ✗ | ✓ | ✓ | OFFICIAL_V103 |
| [scripts/run_visual_pdf_copy_batch.js](../../scripts/run_visual_pdf_copy_batch.js) | pdf-copy | npm `qa:pdf-copy:batch[:write]` | ✓ | ✗ | ✗ | ✓ | ✓ | SUPPORTED_V103 |
| [scripts/validate_pdf_copy_bulk.js](../../scripts/validate_pdf_copy_bulk.js) | pdf-copy | npm `qa:pdf-copy:validate` | ✗ | ✗ | ✗ | n/a | ✓ | SUPPORTED_V103 |
| [scripts/qa_pdf_compare.js](../../scripts/qa_pdf_compare.js) | pdf-compare | npm `qa:pdf-compare[:write]` | ✓ (con `--write-pdf`) | ✗ | ✗ | ✓ | ✓ | SUPPORTED_V103 |
| [scripts/qa_pdf_compare_v2.js](../../scripts/qa_pdf_compare_v2.js) | pdf-compare | (CLI manual) | ✓ | ✗ | ✗ | ? | ? | LEGACY_V102 (decisión FASE 7) |
| [scripts/export_wordpress_milu.js](../../scripts/export_wordpress_milu.js) | export | server `/export/run-wordpress`, npm `export:wordpress` | ✗ | ✗ | ✓ | ✗ | ✓ | OFFICIAL_V103 |
| [scripts/validate_wordpress_superseded_export.js](../../scripts/validate_wordpress_superseded_export.js) | export | npm `export:wordpress:validate` | ✗ | ✗ | ✗ (lee) | n/a | n/a | SUPPORTED_V103 |
| [scripts/build_ftp_deploy.js](../../scripts/build_ftp_deploy.js) | deploy | npm `build:ftp` | ✗ | ✗ | ✓ (`deploy_ftp/`) | ✗ | ✗ | SUPPORTED_V103 + DANGEROUS_WRITE (push remoto) |
| [scripts/prepare-pages-dist.js](../../scripts/prepare-pages-dist.js) | deploy | npm `pages:prepare*` | ✗ | ✗ | ✓ (`dist/`) | ✗ | ✓ | SUPPORTED_V103 |
| [scripts/build-release-folder.js](../../scripts/build-release-folder.js) | deploy | npm `release:folder*` | ✗ | ✗ | ✓ | ✗ | ✓ | SUPPORTED_V103 |
| [scripts/publish-pages.ps1](../../scripts/publish-pages.ps1) | deploy | npm `pages:publish*` | ✗ | ✗ | git push | n/a | ◐ | SUPPORTED_V103 + DANGEROUS_WRITE |
| [scripts/publish-safe.ps1](../../scripts/publish-safe.ps1) | deploy | npm `pages:publish:safe` | ✗ | ✗ | git | n/a | ✓ | SUPPORTED_V103 |
| [scripts/git-backup.ps1](../../scripts/git-backup.ps1) | backup | npm `git:backup` | ✗ | ✗ | git | n/a | n/a | SUPPORTED_V103 |
| [scripts/lint-critical.js](../../scripts/lint-critical.js) | quality | npm `lint`, `check` | ✗ | ✗ | ✗ | n/a | n/a | SUPPORTED_V103 |
| [scripts/validate-engine-schema.js](../../scripts/validate-engine-schema.js) | quality | npm `validate:schema` | ✗ | ✗ | ✗ | n/a | n/a | SUPPORTED_V103 |
| [scripts/validate_engine_contracts.js](../../scripts/validate_engine_contracts.js) | quality | npm `validate:engines` | ✗ | ✗ | ✗ | n/a | n/a | SUPPORTED_V103 |
| [scripts/audit_image_schema_system.js](../../scripts/audit_image_schema_system.js) | audit | npm `audit:images` | ✗ | ✗ | ✗ | n/a | n/a | SUPPORTED_V103 |
| [scripts/create-data-snapshot.js](../../scripts/create-data-snapshot.js) | snapshot | npm `data:snapshot` | ✗ | ✗ | ✓ | ✗ | n/a | SUPPORTED_V103 |
| [scripts/compare-data-snapshot.js](../../scripts/compare-data-snapshot.js) | snapshot | npm `data:snapshot:compare` | ✗ | ✗ | ✗ (lee) | n/a | n/a | SUPPORTED_V103 |
| [scripts/db/import_engines_to_sqlite.js](../../scripts/db/import_engines_to_sqlite.js) | db-mirror | npm `db:import` | ✗ | ✗ | ✓ (`*.db`) | ✗ | n/a | SUPPORTED_V103 |
| [scripts/db/create_sqlite_indexes.js](../../scripts/db/create_sqlite_indexes.js) | db-mirror | npm `db:index` | ✗ | ✗ | ✓ (`*.db`) | ✗ | n/a | SUPPORTED_V103 |
| [scripts/db/validate_sqlite_mirror.js](../../scripts/db/validate_sqlite_mirror.js) | db-mirror | npm `db:validate` | ✗ | ✗ | ✗ | n/a | n/a | SUPPORTED_V103 |
| [scripts/db/sqlite_sample_queries.js](../../scripts/db/sqlite_sample_queries.js) | db-mirror | npm `db:queries` | ✗ | ✗ | ✗ | n/a | n/a | SUPPORTED_V103 |
| [scripts/refactor_json_fields.py](../../scripts/refactor_json_fields.py) | refactor | npm `refactor:json[:dry]` | ✓ | ✗ | ✗ | ✗ | ✓ | SUPPORTED_V103 + DANGEROUS_WRITE |
| [scripts/audit_field_adapter_usage.py](../../scripts/audit_field_adapter_usage.py) | audit | npm `audit:field-adapter` | ✗ | ✗ | ✓ (reports) | n/a | n/a | SUPPORTED_V103 |
| [scripts/compare_normalized_engines.py](../../scripts/compare_normalized_engines.py) | quality | npm `compare:normalized` | ✗ | ✗ | ✗ | n/a | n/a | SUPPORTED_V103 |
| [scripts/compare_export_outputs.py](../../scripts/compare_export_outputs.py) | quality | npm `validate:field-refactor-final:exports` | ✗ | ✗ | ✗ | n/a | n/a | SUPPORTED_V103 |
| [scripts/fill_engine_esquemas_from_pdf.py](../../scripts/fill_engine_esquemas_from_pdf.py) | schemes | CLI manual | ✓ | ✓ | ✗ | ◐ | ✓ | SUPPORTED_V103 |
| [scripts/generate_missing_esquema_pos_batch.py](../../scripts/generate_missing_esquema_pos_batch.py) | schemes-pos | CLI manual | ✗ | ✓ | ✗ | ✗ | ✓ | SUPPORTED_V103 |
| [scripts/normalize_manual_override_px.py](../../scripts/normalize_manual_override_px.py) | schemes-pos | CLI manual | ✗ | ✓ (overrides JSON) | ✗ | ✗ | ✓ | SUPPORTED_V103 |
| [scripts/refactor_engine_schema_v2.js](../../scripts/refactor_engine_schema_v2.js) | refactor | CLI manual | ✓ | ✗ | ✗ | ? | ? | LEGACY_V102 |
| [scripts/simulate_export_semantics.py](../../scripts/simulate_export_semantics.py) | export-debug | CLI manual | ✗ | ✗ | ✗ | n/a | n/a | SUPPORTED_V103 |
| [scripts/validate_pdf_copy_controlled_write.js](../../scripts/validate_pdf_copy_controlled_write.js) | quality | CLI manual | ✓ (controlado) | ✗ | ✗ | ✓ | ✓ | SUPPORTED_V103 |
| [scripts/analyze_*.js, compare_rebuild_vs_engine.js](../../scripts/) | analysis | CLI manual | ✗ | ✗ | ✗ | n/a | n/a | SUPPORTED_V103 |
| [scripts/dev/audit_json_fields.py](../../scripts/dev/audit_json_fields.py) | audit | CLI manual | ✗ | ✗ | ✗ | n/a | n/a | SUPPORTED_V103 |
| [tools/manual_override_picker_server.py](../../tools/manual_override_picker_server.py) | tools | CLI manual | ✗ | ✗ | ✗ | n/a | n/a | SUPPORTED_V103 |
| [depuracion_json.py](../../depuracion_json.py) | final | CLI manual (proceso oficial paso 5) | ✓ | ✗ | ✗ | ✗ | ✗ | OFFICIAL_V103 |
| [add_final_fields.py](../../add_final_fields.py) | final | importado por `depuracion_json.py` | (auxiliar) | ✗ | ✗ | n/a | n/a | OFFICIAL_V103 |
| [convert_engines.py](../../convert_engines.py), [convert_engine_to_excel.py](../../convert_engine_to_excel.py), [convert_excel_to_json.py](../../convert_excel_to_json.py) | convert | CLI + tests smoke | ✗ / ✓ | ✗ | ✓ (`*.xlsx`) | ✗ | ✗ | SUPPORTED_V103 |
| [generate_synthetic_exports.js](../../generate_synthetic_exports.js) | export-legacy | npm `legacy:generate:synthetic` | ✗ | ✗ | ✓ (synthetic JSON) | ✗ | ✗ | LEGACY_V102 |
| [copy_gesa_fields_to_final.py](../../copy_gesa_fields_to_final.py) | final-legacy | server `/calculate-final-fields`, CLI | ✓ | ✗ | ✗ | ✗ | ✗ | LEGACY_V102 + DANGEROUS_WRITE |
| [copy_pdf_fields_to_final.py](../../copy_pdf_fields_to_final.py) | final-legacy | CLI manual | ✓ | ✗ | ✗ | ? | ✗ | LEGACY_V102 |
| [clear_engine_fields.py](../../clear_engine_fields.py) | maintenance | CLI manual | ✓ (borra por sufijo) | ✗ | ✗ | ✗ | ✓ | DANGEROUS_WRITE + QUARANTINE_CANDIDATE |
| [clear_pdf_fields.py](../../clear_pdf_fields.py) | maintenance | CLI manual | ✓ | ✗ | ✗ | ✗ | ✓ | DANGEROUS_WRITE + QUARANTINE_CANDIDATE |
| [clear_esquemas_pos_fields.py](../../clear_esquemas_pos_fields.py) | maintenance | CLI manual | ✗ | ✓ (borra) | ✗ | ✗ | ✓ | DANGEROUS_WRITE + QUARANTINE_CANDIDATE |
| [apply_revision_to_engines.js](../../apply_revision_to_engines.js) | qa-revision-legacy | (sin invocador) | ✓ | ✗ | ✗ | ? | ? | ORPHAN + QUARANTINE_CANDIDATE |
| [apply-bulk-revision-to-engine.js](../../apply-bulk-revision-to-engine.js) | qa-revision-legacy | (sin invocador) | ✓ | ✗ | ✗ | ? | ? | ORPHAN + QUARANTINE_CANDIDATE |
| [apply_revision_to_engines.js](../../apply_revision_to_engines.js) (root) ↔ `server/services/revision-apply` | (la lógica viva está en el service del backend, no en estos scripts root) |
| [build_generate_all_schemes.js](../../build_generate_all_schemes.js) | schemes-batch | CLI manual | ✗ | ✓ | ✗ | ✗ | ? | LEGACY_V102 (redundante con `/api/apply-generate-batch`) |
| [validate_engine_jsons.py](../../validate_engine_jsons.py) | quality-legacy | CLI manual | ✗ | ✗ | ✗ | n/a | n/a | LEGACY_V102 (redundante con `validate-engine-schema.js`) |
| [refactor_measurement_error.py](../../refactor_measurement_error.py) | refactor-legacy | CLI manual | ✓ | ✗ | ✗ | ✗ | ✗ | LEGACY_V102 (refactor histórico ya aplicado) |
| [importar_json.py](../../importar_json.py) | import-legacy | CLI manual | ✓ | ✗ | ✗ | ? | ✗ | LEGACY_V102 + QUARANTINE_CANDIDATE |
| [marcar_articulos_en_web.py](../../marcar_articulos_en_web.py) | maintenance-legacy | CLI manual | ✓ | ✗ | ✗ | ✗ | ✗ | LEGACY_V102 + QUARANTINE_CANDIDATE |
| [pretty_print_all_json.py](../../pretty_print_all_json.py) | maintenance-legacy | CLI manual | ✓ | ✗ | ✗ | ✗ | ✗ | LEGACY_V102 + QUARANTINE_CANDIDATE |
| [compare_measurements.py](../../compare_measurements.py) | analysis-legacy | CLI manual | ✗ | ✗ | ✗ | n/a | n/a | LEGACY_V102 + QUARANTINE_CANDIDATE |
| [verify_encoding.py](../../verify_encoding.py) | analysis-legacy | (sin invocador) | ✗ | ✗ | ✗ | n/a | n/a | ORPHAN + QUARANTINE_CANDIDATE |
| [test_conv.py](../../test_conv.py) | test-legacy | (sin invocador) | ? | ✗ | ✗ | ? | ? | ORPHAN + QUARANTINE_CANDIDATE |
| [python_repo_paths.py](../../python_repo_paths.py) | utility-legacy | (migrado a `python_lib/`) | ✗ | ✗ | ✗ | n/a | n/a | ORPHAN + QUARANTINE_CANDIDATE |
| [audit_commits.py](../../audit_commits.py), [audit_esquemas_pos_coverage.py](../../audit_esquemas_pos_coverage.py), [estadisticas_articulos.py](../../estadisticas_articulos.py), [informe_estadisticas.py](../../informe_estadisticas.py), [extract_book_preview_issues.py](../../extract_book_preview_issues.py) | audit/diagnostic | CLI manual | ✗ | ✗ | reports | n/a | n/a | SUPPORTED_V103 |
| [analyze_*.js, compare_rebuild_vs_engine.js, debug_rebuild_record_equivalence.js](../../) (raíz) | analysis-wrappers | CLI manual (wrappers de `scripts/`) | ✗ | ✗ | ✗ | n/a | n/a | LEGACY_V102 (wrapper redundante) |
| `tmp_*.py`, `tmp_*.js` (~10) | debug | CLI manual | mixto | mixto | mixto | ✗ | ✗ | ORPHAN + QUARANTINE_CANDIDATE |

### 4.2 Resumen scripts

- **OFFICIAL_V103**: 14 (núcleo del pipeline + servidor)
- **SUPPORTED_V103**: ~38 (npm scripts, db, audit, deploy, validation)
- **LEGACY_V102**: ~13
- **QUARANTINE_CANDIDATE**: ~22 (incluye `tmp_*`)
- **ORPHAN**: 6
- **DANGEROUS_WRITE** (overlay): 9

---

## 5. SUPPORTED_V103 — herramientas no núcleo que se mantienen

Componentes útiles que **no** forman parte del pipeline diario pero **sí** son parte del sistema soportado en V1.03:

### 5.1 Analytics (read-only sobre SQLite mirror)

- HTMLs `analytics_*.html` (8) + `js/analytics/analytics-api.js`
- Endpoints `GET /db/*` y `GET /db/analytics/*` (23 rutas)
- Scripts `scripts/db/*` y npm `db:import`, `db:index`, `db:validate`, `db:queries`
- **Política**: el mirror es derivado, regenerable. No hay flujo crítico que dependa de él.

### 5.2 Audit log

- HTML `qa_auditoria.html` + `js/qa-auditoria.js`
- Endpoints `GET /audit-log`, `POST /audit-log`, `DELETE /audit-log`
- Archivo: `qa_audit_log.json`

### 5.3 Export preview / consulta

- Endpoints GET de `/export/*` (preview, status, files, file, download, trace, wordpress-decisions)
- Generadores secundarios: `validate_wordpress_superseded_export.js`, `simulate_export_semantics.py`

### 5.4 Diagnóstico activo

- `audit_esquemas_pos_coverage.py` (cobertura POS, genera `reports/`)
- `audit_field_adapter_usage.py` (auditoría de adaptador de campos)
- `compare_normalized_engines.py` (compara engines normalizados)
- `compare_export_outputs.py` (validación de exports)
- `compare_rebuild_vs_engine.js`, `analyze_rebuild_field_coverage.js` (diagnóstico de rebuild — wrappers raíz son LEGACY, los oficiales viven en `scripts/`)

### 5.5 Tooling de calidad y validación

- `lint-critical.js`, `validate-engine-schema.js`, `validate_engine_contracts.js`
- `tests/smoke/*.test.js`, `test:field-registry`

### 5.6 Snapshot y deploy

- `create-data-snapshot.js`, `compare-data-snapshot.js`
- `prepare-pages-dist.js`, `publish-pages.ps1`, `publish-safe.ps1`, `git-backup.ps1`, `build-release-folder.js`, `build_ftp_deploy.js` (estos últimos requieren atención de FASE 6 por interactuar con remotos).

### 5.7 Convertidores Excel

- `convert_engines.py`, `convert_engine_to_excel.py`, `convert_excel_to_json.py` (cubiertos por `python-exporters-smoke.test.js`).

### 5.8 Tools

- `tools/manual_override_picker_server.py` (utilidad standalone para picker de coordenadas).

---

## 6. LEGACY_V102 — declarado obsoleto

Funcional pero **no usar en flujos nuevos**. Candidato a eliminación post V1.03 (no en FASE 5).

### 6.1 Endpoints LEGACY

- `POST /calculate-final-fields` — sustituido por el pipeline `/api/recompute-simple/update-{gesa,sust}` + paso FINAL offline (`depuracion_json.py`).

### 6.2 Scripts LEGACY

- [copy_gesa_fields_to_final.py](../../copy_gesa_fields_to_final.py) — invocado solo por el endpoint legacy anterior.
- [copy_pdf_fields_to_final.py](../../copy_pdf_fields_to_final.py) — utilidad histórica de copia hacia `_final`.
- [generate_synthetic_exports.js](../../generate_synthetic_exports.js) — npm `legacy:generate:synthetic`. Mantiene MILU_New_v506.json / MILU_Superseded_v506.json. Mantenido solo para diff con el pipeline semántico nuevo.
- [refactor_measurement_error.py](../../refactor_measurement_error.py) — refactor puntual ya aplicado.
- [validate_engine_jsons.py](../../validate_engine_jsons.py) — redundante con `validate-engine-schema.js`.
- [build_generate_all_schemes.js](../../build_generate_all_schemes.js) — redundante con `/api/apply-generate-batch`.
- [scripts/qa_pdf_compare_v2.js](../../scripts/qa_pdf_compare_v2.js) — pendiente decisión vs `qa_pdf_compare.js` (FASE 7).
- [scripts/refactor_engine_schema_v2.js](../../scripts/refactor_engine_schema_v2.js) — refactor histórico.
- Wrappers raíz: `analyze_missing_rebuild_rows.js`, `analyze_rebuild_field_coverage.js`, `analyze_rebuild_equivalence_causes.js`, `compare_rebuild_vs_engine.js`, `debug_rebuild_record_equivalence.js`, `apply_revision_to_engines.js`, `apply-bulk-revision-to-engine.js`.

### 6.3 npm scripts LEGACY declarados

- `legacy:generate:synthetic` → `generate_synthetic_exports.js`
- `legacy:ai:conflicts` → `legacy/export_complex_ai/scripts/ai_conflict_rules.js`
- `legacy:export:review` → `legacy/export_complex_ai/scripts/export_review_pipeline.js`

### 6.4 Carpetas LEGACY

- [legacy/](../../legacy/), [docs_legacy/](../../docs_legacy/), [zz_old/](../../zz_old/), [zz_copias/](../../zz_copias/) — mantenidas intocables.

---

## 7. DANGEROUS_WRITE — operaciones peligrosas

Componentes que cumplen **al menos uno** de:

1. Escriben los 9 `engine_*.json` cuando `scope=ALL`.
2. No crean backup antes de escribir.
3. No admiten `dryRun` y aceptan modo bulk.
4. Pueden borrar campos masivamente.
5. Escriben imágenes en batch sobre un directorio compartido.

### 7.1 Endpoints

| Endpoint | ¿Por qué peligroso? | Gating recomendado | Quarantine FASE 5 |
|---|---|---|---|
| `POST /clear-engine-fields` | Borra campos por sufijo, sin botón vivo, ALTO | `SERVER_ENABLE_DANGEROUS_WRITE=1` | NO (gating es suficiente) |
| `POST /apply-revision-to-engines` | Bulk multi-engine, ALTO. Sin `dryRun`. | `SERVER_ENABLE_DANGEROUS_WRITE=1` cuando `mode=all`. | NO |
| `POST /recompute-qa-errors` | ALTO. Escribe en todos los engine si `scope=ALL`. Backup parcial. | Forzar `dryRun:true` por defecto si no se especifica `scope=current`. | NO |
| `POST /recalculate-revision-status` | ALTO. Recorre todos los libros. Sin `dryRun`. | `SERVER_ENABLE_DANGEROUS_WRITE=1`. | NO |
| `POST /api/recompute-simple/recompute-hermanos` | ALTO. `applySiblingBulkUpdates` puede tocar múltiples archivos. | `SERVER_ENABLE_DANGEROUS_WRITE=1` cuando `engine=ALL`. | NO |
| `POST /pn-review/apply-siblings-bulk` | ALTO. Sin backup, sin `dryRun`. **Duplicado** de `recompute-hermanos`. | `SERVER_ENABLE_DANGEROUS_WRITE=1` mientras se decide FASE 8. Tras decisión, **eliminar**. | DEPENDS (FASE 8) |
| `POST /api/pdf-preview/apply-to-engine` con `applyAll=true` | ALTO. Aplica preview a todos los registros del libro. Sin backup explícito. | `SERVER_ENABLE_DANGEROUS_WRITE=1` cuando `applyAll=true`. | NO |
| `POST /api/apply-generate-batch` | MEDIO. Loop sobre `rebuild_schemes_circles_from_esquemas.py`. Escribe imágenes en batch. | `SERVER_ENABLE_DANGEROUS_WRITE=1`. | NO |

### 7.2 Scripts CLI peligrosos

| Script | ¿Por qué peligroso? | Acción FASE 5/6 |
|---|---|---|
| `clear_engine_fields.py` | Borra campos por sufijo en los 9 engines. Sin backup. | **QUARANTINE** + protección por flag de entorno si se desempolva. |
| `clear_pdf_fields.py` | Borra campos `_pdf`. Sin backup. | **QUARANTINE**. |
| `clear_esquemas_pos_fields.py` | Borra archivos de imagen. Sin backup. | **QUARANTINE**. |
| `apply_revision_to_engines.js` (raíz) | Probable lógica antigua duplicada del service oficial. ORPHAN. | **QUARANTINE**. |
| `apply-bulk-revision-to-engine.js` (raíz) | Idem. | **QUARANTINE**. |
| `marcar_articulos_en_web.py` | Modifica `EN_WEB` en engines. Sin gating. | **QUARANTINE**. |
| `pretty_print_all_json.py` | Reescribe todos los engines. Riesgo de cambiar diff. | **QUARANTINE**. |
| `importar_json.py` | Importador histórico. | **QUARANTINE**. |
| `refactor_measurement_error.py` | Refactor masivo ya aplicado. | **QUARANTINE**. |
| `apply_book_preview_to_engine.py` / `apply_all_book_previews.py` | Sin `--dry-run` ni backup en CLI; pero **son oficiales** vía endpoint. | NO QUARANTINE. **Refactor sugerido en FASE 7**: añadir `--dry-run` y backup automático. |
| `copy_gesa_fields_to_final.py` | LEGACY. Sin backup. | LEGACY (no QUARANTINE inmediata: aún ligado a `/calculate-final-fields`). Eliminar junto al endpoint. |
| `scripts/refactor_json_fields.py` | Reescribe campos en todos los engines. Tiene `--dry-run`. | Mantener pero documentar como `DANGEROUS_WRITE`. |
| `scripts/build_ftp_deploy.js`, `publish-pages.ps1` | Push remoto sin `dryRun`. | Mantener pero documentar. Validar uso solo desde checklist manual. |

---

## 8. Decisiones oficiales

### 8.1 PDF (paso 1 + flujos paralelos)

**Estado**: pendiente de FASE 7.

Los dos pipelines viven simultáneamente:

- **JS — preview centric**: `POST /api/recompute-simple/rebuild-json` → `node:scripts/rebuild_engine_from_book_preview.js` → `data/02-engine_rebuild/*` (no toca `engine_*.json` directamente; promoción manual posterior).
- **Python — apply directo**: `POST /api/pdf-preview/apply-to-engine` → `python:apply_book_preview_to_engine.py` o `apply_all_book_previews.py` → `engine_*.json` directo.

Y un tercer eje de "copia visual" PDF→PDF/PDF→Final (`/copy-pdf-to-pdf*`, `/copy-pdf-to-final-all-books`, `/recompute-pdf-auto-visual`) con scripts JS (`scripts/qa_pdf_visual_copy.js`).

**No se decide aquí**. FASE 7 debe responder:

1. ¿La fuente única para "aplicar PDF al engine" es el path JS (rebuild + promoción) o el path Python (apply directo)?
2. ¿`qa_pdf_compare.js` y `qa_pdf_compare_v2.js` deben unificarse?
3. ¿Quién es el dueño de `/copy-pdf-to-final-all-books`: el path Python o el path JS?

### 8.2 Hermanos (paso 8)

**Estado**: pendiente de FASE 8.

Dos endpoints vivos llamando al **mismo** `applySiblingBulkUpdates` inline:

- `POST /api/recompute-simple/recompute-hermanos` (con backup, con dryRun) — usado desde `recompute_simple.html`.
- `POST /pn-review/apply-siblings-bulk` (sin backup, sin dryRun) — usado desde `analista_02.html`.

**Recomendación preliminar para FASE 8**: mantener `/api/recompute-simple/recompute-hermanos` como oficial; migrar los botones de `analista_02` para invocarlo; deprecar y eliminar `/pn-review/apply-siblings-bulk`.

### 8.3 Esquemas POS (paso 10)

**Estado**: pendiente de FASE 9.

Cuatro endpoints invocan a `rebuild_schemes_circles_from_esquemas.py` con parámetros distintos:

- `POST /api/recompute-simple/rebuild-schemes-circles-from-esquemas` (oficial pipeline)
- `POST /api/recompute-simple/generate-missing-esquema-pos`
- `POST /api/esquemas-pos/generate-one`
- `POST /api/apply-generate-batch`

**Recomendación preliminar para FASE 9**: mantener UNO genérico parametrizable como oficial (probablemente el primero) y replantear los otros tres como _modos_ del mismo endpoint o como conveniences GUI sin lógica propia.

### 8.4 FINAL (paso 5)

**Estado**: decidido.

- Oficial: `python:depuracion_json.py` + `add_final_fields.py` (proceso offline).
- Legacy: `POST /calculate-final-fields` + `copy_gesa_fields_to_final.py` (eliminar tras FASE 5).

---

## 9. Resumen ejecutivo

| Capa | OFFICIAL_V103 | SUPPORTED_V103 | LEGACY_V102 | DANGEROUS_WRITE | ORPHAN/QUARANTINE | REMOVE |
|---|---|---|---|---|---|---|
| Frontends | 6 | 13 | 1 | 0 | 1 | 0 |
| Endpoints | 38 | 33 | 2 | 8 (overlay) | 5 | 8 |
| Scripts | 14 | 38 | 13 | 9 (overlay) | 22 (incl. tmp/debug) | 0 |
| Pipeline pasos | 12 | — | — | 4 con flag | — | — |

## 10. Lista de uso (prioridades posteriores)

### 10.1 FASE 4.5 — duplicidades (tu sugerencia)

Conflictos a resolver con el material ya consolidado:

1. Hermanos: 1 endpoint vs 2 → ver §8.2.
2. PDF apply: JS vs Python → ver §8.1.
3. Esquemas POS: 4 endpoints → ver §8.3.
4. PDF compare: `v1` vs `v2`.
5. PDF copy: `/copy-pdf-to-pdf` vs `/copy-pdf-to-pdf-all-books` (¿single/batch o duplicado?).
6. Wrappers raíz vs scripts oficiales (`analyze_*`, `compare_rebuild_vs_engine`).

### 10.2 FASE 5 — cuarentena

Bloque claro de movimientos a `legacy_quarantine/` (~25 archivos) listados en §4 y §7.2 (todo lo marcado `QUARANTINE_CANDIDATE`), más los 8 endpoints `REMOVE_CANDIDATE` que se borran del código.

### 10.3 FASE 6 — gating

Implementación del flag `SERVER_ENABLE_DANGEROUS_WRITE` para los 8 endpoints listados en §7.1.

---

> Este documento es la verdad operativa de MILU V1.03. Cualquier discrepancia con el código en runtime debe resolverse aquí antes de tocar código.
