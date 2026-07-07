# MILU_ORPHAN_COMPONENTS — Detección de código muerto / huérfano

> **FASE 3** del Plan Maestro V1.03. Lista clasificada de componentes (HTMLs, endpoints, scripts) sin uso vivo identificado o con duplicidad clara.

## Clasificación

- **MANTENER** — código activo, no tocar.
- **REVISAR** — uso ambiguo; antes de mover, verificar con grep manual o test funcional.
- **CUARENTENA** — sin uso identificado o duplicado claro; mover a `legacy_quarantine/` (FASE 5) sin borrar.
- **ELIMINAR** — basura clara (artefactos `tmp_*`, reportes generados, archivo vacío).

> Esta auditoría se basa en: análisis estático de `server.js`, módulos en `js/`, HTMLs en raíz, `package.json`, archivos `.bat`. **No** se ha hecho prueba dinámica.

---

## 1. HTMLs

| Archivo | Estado | Motivo / acción |
|---|---|---|
| [index.html](../../index.html) | MANTENER | Punto de entrada principal |
| [milu_shell.html](../../milu_shell.html) | MANTENER | Shell que embebe vistas |
| [qa_milu.html](../../qa_milu.html) | MANTENER | Pantalla QA principal |
| [analista_02.html](../../analista_02.html) | MANTENER | Editor de registro |
| [recompute_simple.html](../../recompute_simple.html) | MANTENER | Pipeline oficial |
| [export_wordpress.html](../../export_wordpress.html) | MANTENER | Export oficial |
| [qa_imagenes.html](../../qa_imagenes.html) | MANTENER | QA de imágenes |
| [qa_auditoria.html](../../qa_auditoria.html) | MANTENER | Audit log |
| [qa_analista_registro.html](../../qa_analista_registro.html) | MANTENER | Editor por registro (acceso directo) |
| [qa_lista_agrupada.html](../../qa_lista_agrupada.html) | MANTENER | Vista agrupada (embed) |
| [import_pdf.html](../../import_pdf.html) | MANTENER | Embed en analista_02 |
| [analytics_*.html](../../analytics_dashboard.html) (8 vistas) | MANTENER | Dashboards SQLite |
| [auto_depuracion.html](../../auto_depuracion.html) | **CUARENTENA** | Archivo vacío (huérfano según subagente) |
| [exportacion.html](../../exportacion.html) | **REVISAR** | Vista antigua de exports; comprobar si algún link de `milu_shell.html` aún la abre antes de cuarentenar |

---

## 2. Endpoints HTTP

### 2.1 MANTENER — pipeline oficial

Definidos en `MILU_RUNTIME_MAP.md` secciones 1–6 y mapeados a un botón vivo. **No tocar** durante FASE 3.

### 2.2 ELIMINAR — endpoints `410 Gone` ya inertes

| Endpoint | Línea aprox | Acción |
|---|---|---|
| `POST /recompute-pdf-auto` | 2348 | Eliminar la ruta. Buscar y borrar referencias en HTMLs/JS. |
| `POST /export/run-synthetic` | 2881 | Eliminar. |
| `POST /export/run-ai-conflicts` | 2904 | Eliminar. |
| `POST /export/run-all` | 4210 | Eliminar. |
| `POST /apply-qa-checks-filter` | 5369 | Eliminar. |
| `GET /pn/list` | 3832 | Eliminar. |
| `GET /pn/:sku` | 3834 | Eliminar. |
| `GET /pn/:sku/sources` | 3836 | Eliminar. |

> Estos ya devuelven 410 inline pero ocupan espacio en `server.js` y aparecen en logs. Borrar es seguro: ningún cliente puede estar usándolos en producción ya.

### 2.3 CUARENTENA / DEPRECAR — endpoints duplicados

| Endpoint | Duplica a | Decisión sugerida (FASE 8) |
|---|---|---|
| `POST /pn-review/apply-siblings-bulk` | `POST /api/recompute-simple/recompute-hermanos` (mismo `applySiblingBulkUpdates` inline) | Mantener UNO. Recomendado: `recompute-hermanos` (consistente con pipeline numerado). Migrar `analista_02` para usar el oficial y deprecar `pn-review/apply-siblings-bulk`. |
| `POST /api/esquemas-pos/generate-one` | `POST /api/recompute-simple/generate-missing-esquema-pos` | Mantener UNO genérico parametrizable. |
| `POST /calculate-final-fields` | `POST /api/recompute-simple/update-gesa` (camino moderno) | Deprecar `/calculate-final-fields` (legacy). |
| `POST /copy-pdf-to-pdf` (frontend inline) | `POST /copy-pdf-to-pdf-all-books` (backend) | Decidir si single-row tiene sentido vivo o si todos usan el batch. |

### 2.4 REVISAR — endpoints sin botón vivo identificado

| Endpoint | Acción |
|---|---|
| `POST /clear-engine-fields` | Verificar si lo usa algún `.bat`. Si no, mover a CUARENTENA detrás de `SERVER_ENABLE_DANGEROUS_WRITE`. |
| `POST /recompute-pdf-auto-visual` | Confirmar uso desde `npm run qa:pdf-copy:*`. Si solo es CLI, no exponer en HTTP. |
| `POST /pn-review/:sku/apply-decision`, `apply-values`, `by-id/:id/apply-decision` | Buscar fetch en `js/` con grep manual antes de cuarentenar. Posiblemente vivos por debajo de PN review. |
| `POST /api/pdf-preview/apply-to-engine` con `applyAll=true` | Verificar si `analista_02` lanza la modalidad `single` o también `applyAll`. |

---

## 3. Scripts en raíz

### 3.1 MANTENER — invocados por server.js o npm

- [server.js](../../server.js), [app.js](../../app.js), [analysis.js](../../analysis.js), [engine_files.js](../../engine_files.js), [debug.js](../../debug.js), [sanity.js](../../sanity.js)
- [recompute_engine_errors.js](../../recompute_engine_errors.js) — `npm qa:recompute-errors`
- [rebuild_engine_from_book_preview.js](../../rebuild_engine_from_book_preview.js) — `npm rebuild:engine:*`
- [generate_synthetic_exports.js](../../generate_synthetic_exports.js) — `npm legacy:generate:synthetic` (legacy pero declarado)
- [rebuild_assets_for_record.py](../../rebuild_assets_for_record.py) — endpoint enrich-assets
- [rebuild_schemes_by_bom.py](../../rebuild_schemes_by_bom.py) — endpoint rebuild-schemes-by-bom
- [rebuild_schemes_circles_from_esquemas.py](../../rebuild_schemes_circles_from_esquemas.py) — múltiples endpoints + npm
- [generate_esquema_pos.py](../../generate_esquema_pos.py) — endpoint esquemas/generate-one
- [apply_book_preview_to_engine.py](../../apply_book_preview_to_engine.py) — endpoint pdf-preview/apply-to-engine
- [apply_all_book_previews.py](../../apply_all_book_previews.py) — endpoint pdf-preview/apply-to-engine (modalidad applyAll)
- [depuracion_json.py](../../depuracion_json.py) — proceso oficial de paso a JSON definitivos
- [add_final_fields.py](../../add_final_fields.py) — auxiliar importado por `depuracion_json.py`
- [copy_gesa_fields_to_final.py](../../copy_gesa_fields_to_final.py) — endpoint legacy `/calculate-final-fields` (DEPRECAR junto con el endpoint, FASE 7)

### 3.2 REVISAR — escriben pero sin invocador conocido

| Script | Acción sugerida |
|---|---|
| [apply_revision_to_engines.js](../../apply_revision_to_engines.js) | Verificar si es duplicado del service `revision-apply` que usa el endpoint. Probable HUÉRFANO. |
| [apply-bulk-revision-to-engine.js](../../apply-bulk-revision-to-engine.js) | Variante histórica. Probable HUÉRFANO. |
| [build_generate_all_schemes.js](../../build_generate_all_schemes.js) | Wrapper que ejecuta `generate_esquema_pos.py` en batch. ¿Sigue siendo necesario si existe `/api/apply-generate-batch`? CUARENTENA candidato. |

### 3.3 CUARENTENA — huérfanos / utilidades históricas

#### 3.3.1 Python en raíz

| Script | Motivo |
|---|---|
| [importar_json.py](../../importar_json.py) | Importador histórico, lógica migrada a `python_lib/`. |
| [marcar_articulos_en_web.py](../../marcar_articulos_en_web.py) | Manual, fuera de alcance AR-3. |
| [pretty_print_all_json.py](../../pretty_print_all_json.py) | Formateo redundante con prettier / `depuracion_json.py`. |
| [validate_engine_jsons.py](../../validate_engine_jsons.py) | Redundante con `scripts/validate-engine-schema.js`. |
| [refactor_measurement_error.py](../../refactor_measurement_error.py) | Refactor puntual histórico ya aplicado. |
| [compare_measurements.py](../../compare_measurements.py) | Encoding roto, redundante. |
| [verify_encoding.py](../../verify_encoding.py) | Sin referencias. |
| [test_conv.py](../../test_conv.py) | Test sin contexto. |
| [python_repo_paths.py](../../python_repo_paths.py) | Migrado a `python_lib/repo_paths.py`. |
| [convert_engines.py](../../convert_engines.py), [convert_engine_to_excel.py](../../convert_engine_to_excel.py), [convert_excel_to_json.py](../../convert_excel_to_json.py) | MANTENER (cubiertos por `tests/smoke/python-exporters-smoke.test.js`). |
| [estadisticas_articulos.py](../../estadisticas_articulos.py) | REVISAR (utilidad de análisis). |
| [informe_estadisticas.py](../../informe_estadisticas.py) | REVISAR (genera `informe_estadisticas.txt`). |
| [extract_book_preview_issues.py](../../extract_book_preview_issues.py) | REVISAR (diagnóstico ad-hoc). |
| [audit_commits.py](../../audit_commits.py) | REVISAR (auditoría histórica). |
| [audit_esquemas_pos_coverage.py](../../audit_esquemas_pos_coverage.py) | MANTENER (genera `reports/`, útil). |
| [clear_engine_fields.py](../../clear_engine_fields.py) | **PELIGROSO**, sin invocador. CUARENTENA + flag. |
| [clear_pdf_fields.py](../../clear_pdf_fields.py) | **PELIGROSO**. CUARENTENA + flag. |
| [clear_esquemas_pos_fields.py](../../clear_esquemas_pos_fields.py) | **PELIGROSO**. CUARENTENA + flag. |
| [copy_pdf_fields_to_final.py](../../copy_pdf_fields_to_final.py) | LEGACY. CUARENTENA. |

#### 3.3.2 Python `tmp_*` y diagnóstico

Todos a CUARENTENA:

- [tmp_blue_count.py](../../tmp_blue_count.py)
- [tmp_check_red.py](../../tmp_check_red.py)
- [tmp_check_red_some.py](../../tmp_check_red_some.py)
- [tmp_diag_175.py](../../tmp_diag_175.py)
- [tmp_diag_70.py](../../tmp_diag_70.py)
- [tmp_diag_70pads.py](../../tmp_diag_70pads.py)
- [tmp_diag_pos.py](../../tmp_diag_pos.py)
- [tmp_pages_without_esquemas_all_engines.py](../../tmp_pages_without_esquemas_all_engines.py)
- [tmp_probe_page18_pos.py](../../tmp_probe_page18_pos.py)

#### 3.3.3 JS en raíz — análisis y wrappers

| Script | Acción |
|---|---|
| [analyze_missing_rebuild_rows.js](../../analyze_missing_rebuild_rows.js), [analyze_rebuild_field_coverage.js](../../analyze_rebuild_field_coverage.js), [analyze_rebuild_equivalence_causes.js](../../analyze_rebuild_equivalence_causes.js), [compare_rebuild_vs_engine.js](../../compare_rebuild_vs_engine.js), [debug_rebuild_record_equivalence.js](../../debug_rebuild_record_equivalence.js) | REVISAR — wrappers de scripts en `scripts/`. Considerar borrar wrappers raíz y dejar solo los de `scripts/`. |
| [apply_revision_to_engines.js](../../apply_revision_to_engines.js), [apply-bulk-revision-to-engine.js](../../apply-bulk-revision-to-engine.js) | CUARENTENA (la lógica viva está en `revisionApplyService` referenciado desde `server.js`). |
| [build_generate_all_schemes.js](../../build_generate_all_schemes.js) | CUARENTENA (probable). |

### 3.4 ELIMINAR — basura clara

| Item | Motivo |
|---|---|
| `engine_*.json.backup-schemes-*` | Backups creados por scripts antiguos sin TTL. |
| `engine_*.json.bak.1780449*` y `engine_*.json.bak.20260602-*` | Backups sin política. |
| `tmp_*.json` (~40 archivos en raíz) | Reportes y dumps de pruebas; mover a `reports/` o borrar. |
| `tmp_*.csv`, `tmp_*.log`, `tmp_*.webp` | Idem. |
| `tmp_pos_diag_000245/` | Dir de diagnóstico. |
| [diff_ad1737f0_server.txt](../../diff_ad1737f0_server.txt) | Diff snapshot de un commit concreto. |
| [scan_results.txt](../../scan_results.txt) | Resultado de un scan ad-hoc. |
| `h` (archivo sin extensión en raíz) | Probable error de redirección de shell. |
| [pdf_page_rows_preview_p13.json](../../pdf_page_rows_preview_p13.json) | Dump de prueba. |
| `df_104_MILU26_IMPORT_raw.json` | Snapshot de import. |
| [import_result.log](../../import_result.log) | Log de import puntual. |
| [Pantalla Analisis-Recalcular-Modal.png](../../Pantalla%20Analisis-Recalcular-Modal.png), [figma_node_1_463.png](../../figma_node_1_463.png) | Capturas de diseño en raíz; mover a `docs/` o eliminar. |
| `engine_*.xlsx` (9 archivos) | Salidas de `convert_engine_to_excel.py`. ¿Persistirlas en repo? |
| `engine_20260525.rar`, `engine_202605260914.rar`, `engine_rebuild_old.rar` | Backups comprimidos en repo (peso). Mover fuera del repo. |

> Borrar **es decisión del usuario** y se ejecutará en FASE 5 con confirmación explícita.

---

## 4. Scripts en `scripts/`

### 4.1 MANTENER

Todos los listados como OFICIAL en el inventario del subagente: scripts importados por `server.js` (`enrich_rebuild_with_assets.js`, `qa_pdf_visual_copy.js`, `update_*_fields.js`, `update_revision_states.js`, `export_wordpress_milu.js`) y los referenciados por `package.json` (db, validation, pages, release, snapshots, lint, qa-pdf-compare, audit-images).

### 4.2 REVISAR

| Script | Motivo |
|---|---|
| [scripts/qa_pdf_compare_v2.js](../../scripts/qa_pdf_compare_v2.js) | ¿Reemplaza al `v1`? Si sí, deprecar `qa_pdf_compare.js`. Si no, documentar diferencia. |
| [scripts/refactor_engine_schema_v2.js](../../scripts/refactor_engine_schema_v2.js) | Refactor histórico; ¿está aplicado? Si sí, CUARENTENA. |
| [scripts/validate_pdf_copy_controlled_write.js](../../scripts/validate_pdf_copy_controlled_write.js) | Verificar si `npm` lo expone; si no, CUARENTENA. |
| `scripts/scripts esquemas/` | Subcarpeta con espacio en nombre. Listar contenido y mover/renombrar. |

### 4.3 CUARENTENA

Ninguno claro tras la auditoría — `scripts/` está mejor mantenido que la raíz.

---

## 5. Carpetas

| Carpeta | Estado |
|---|---|
| [legacy/](../../legacy/) | Ya marcada como legacy. Mantener; documentar contenido. |
| [docs_legacy/](../../docs_legacy/) | Documentación obsoleta. Mantener referencia en `README`. |
| [zz_old/](../../zz_old/) | Código histórico. Mantener intocable. |
| [zz_copias/](../../zz_copias/) | Copias de seguridad. Mantener intocable. |
| [json_originales/](../../json_originales/), [json_copias_seguridad/](../../json_copias_seguridad/) | Datos originales / copias. Mantener. |
| [esquemas/](../../esquemas/), [esquemas_pos_circulos/](../../esquemas_pos_circulos/), [fotos_articulos/](../../fotos_articulos/), [fotos_motores/](../../fotos_motores/) | Datos de salida vivos. Mantener. |
| [pdf/](../../pdf/) | Fuente de PDFs. Mantener. |
| `__pycache__/` (raíz) | Borrar de control de versiones (ya debería estar en `.gitignore`). |

---

## 6. Resumen FASE 3

| Categoría | Count |
|---|---|
| MANTENER (HTMLs) | 18 |
| MANTENER (endpoints oficiales) | ~40 |
| MANTENER (scripts oficiales) | 28 |
| REVISAR | ~15 |
| CUARENTENA | ~25 |
| ELIMINAR (basura) | docenas de `tmp_*` y backups sin TTL |
| Endpoints `410` a borrar | 8 |
| Endpoints duplicados a unificar | 4 grupos |

## 7. Próximos pasos

1. **Validar manualmente** los marcados REVISAR (`grep -r` por nombre antes de mover).
2. Crear `legacy_quarantine/` con README explicando procedencia (FASE 5).
3. Mover en bloque los marcados CUARENTENA, conservando subdirectorios `legacy_quarantine/python/`, `legacy_quarantine/js/`, `legacy_quarantine/tmp/`.
4. Solo cuando V1.03 cierre, considerar eliminación física (post `MILU_SYSTEM_AUDIT.md`).
