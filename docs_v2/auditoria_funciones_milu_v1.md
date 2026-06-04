# Auditoria tecnica MILU V1

Fecha: 2026-06-04
Alcance: inventario tecnico sin cambios de comportamiento
Estado del analisis: lectura de backend, frontend y scripts; sin modificar codigo

## 1) Resumen ejecutivo

El flujo oficial V1 esta bien definido y hoy es operable por la ruta Recompute Simple:
1. Importar PDF
2. GESA/SUST
3. ASSETS
4. Calculo FINAL
5. Errores
6. Estados
7. Limpieza de campos _pdf/_final/_error cuando aplique

Hallazgos principales:
- El backend concentra demasiados endpoints mixtos (oficiales, legacy, herramientas internas) en server.js, lo que genera ruido operativo.
- Hay rutas legacy correctamente desactivadas con 410, pero siguen visibles como deuda tecnica.
- Hay dos superficies de escritura directa potentes: save-json/delete-json y operaciones bulk (clear-engine-fields, apply-batch, apply-generate-batch).
- Existen duplicados de artefactos frontend (deploy_ftp/ vs raiz) y scripts temporales tmp_*.py en raiz que elevan ruido.
- Import PDF experimental no escribe por si solo en engine_*.json; el flujo oficial de escritura de import es rebuild-json y/o apply-to-engine en otros modulos.
Observacion final
- No se eliminaron ni renombraron componentes; solo auditoria documental.
- Este informe prioriza la proteccion del flujo V1 vigente y reduce riesgo por ruido legacy.
- Control actual: backup opcional true por defecto.
- Recomendacion: doble confirmacion cuando files=ALL.

6. POST /recompute-qa-errors
- Riesgo: altera campos *_error y estado de filas en masa.
- Recomendacion: mantener, reforzar runbook de backup/disco.

## 8) Tabla final de decision

| Componente | Tipo | Estado actual | Riesgo | Mantener | Aislar | Eliminar | Pendiente validar | Comentario |
|---|---|---|---|---|---|---|---|---|
| recompute_simple.html + js/recompute-simple.js | frontend | ACTIVO_OFICIAL | Medio | Si | No | No | No | Hub principal V1 |
| import_pdf.html + js/import-pdf.js | frontend | ACTIVO_OFICIAL | Bajo | Si | No | No | No | Extraccion/lectura |
| qa_milu.html + js/qa-milu.js | frontend | ACTIVO_OFICIAL | Medio | Si | No | No | No | QA central + escrituras puntuales |
| milu_shell.html | frontend shell | ACTIVO_DUDOSO | Medio | Si | Si | No | No | Contenedor + editor compartido |
| /api/recompute-simple/* core | endpoint | ACTIVO_OFICIAL | Medio | Si | No | No | No | Flujo V1 |
| /save-json y /delete-json | endpoint | ACTIVO_OFICIAL | Alto | Si | No | No | No | Escritura critica |
| /copy-pdf-to-final-all-books | endpoint | ACTIVO_OFICIAL | Alto | Si | No | No | No | Paso FINAL oficial |
| /recompute-qa-errors | endpoint | ACTIVO_OFICIAL | Alto | Si | No | No | No | Paso ERRORES |
| /api/recompute-simple/update-states | endpoint | ACTIVO_OFICIAL | Medio | Si | No | No | No | Paso ESTADOS |
| /calculate-final-fields | endpoint | LEGACY | Medio | No | Si | Si | Si | Duplicado de FINAL |
| /recompute-pdf-auto | endpoint | LEGACY | Bajo | No | No | Si | No | Ya desactivado 410 |
| /export/run-synthetic, /run-ai-conflicts, /run-all | endpoint | LEGACY | Bajo | No | No | Si | No | Ya 410 |
| /pn/* legacy | endpoint | LEGACY | Bajo | No | No | Si | No | Ya 410 |
| /api/apply-generate-batch | endpoint | PELIGROSO | Alto | No | Si | No | Si | Bloquear por flag |
| /pn-review/apply-siblings-bulk | endpoint | ACTIVO_DUDOSO | Alto | Si | Si | No | Si | Exigir backup/dry-run |
| scripts/rebuild_engine_from_book_preview.js | script | ACTIVO_OFICIAL | Medio | Si | No | No | No | Paso 1 V1 |
| apply_book_preview_to_engine.py | script | ACTIVO_DUDOSO | Medio | Si | No | No | No | Ruta alternativa import |
| scripts/update_gesa_fields_from_excel.js | script | ACTIVO_OFICIAL | Medio | Si | No | No | No | Paso 2 |
| scripts/update_sust_fields.js | script | ACTIVO_OFICIAL | Medio | Si | No | No | No | Paso 2 |
| rebuild_assets_for_record.py | script | ACTIVO_OFICIAL | Medio/Alto | Si | No | No | No | Paso 3 |
| recompute_engine_errors.js | script | ACTIVO_OFICIAL | Alto | Si | No | No | No | Paso 5 |
| scripts/update_revision_states.js | script | ACTIVO_OFICIAL | Medio | Si | No | No | No | Paso 6 |
| scripts/export_wordpress_milu.js | script | ACTIVO_DUDOSO | Medio | Si | No | No | No | Flujo export |
| legacy/export_complex_ai | carpeta | LEGACY | Bajo | No | Si | Si | Si | Quarantine recomendado |
| tmp_*.py raiz | scripts temporales | LEGACY | Medio (uso accidental) | No | Si | Si | Si | Mover a quarantine |
| deploy_ftp/ duplicado | carpeta | DUPLICADO | Medio | Si | Si | No | Si | Mantener pero separar rol |

## 9) Propuesta de limpieza por fases

Fase 1: documentar y etiquetar
- Añadir etiqueta visible en docs y comentarios de arquitectura: OFICIAL, DUDOSO, LEGACY, PELIGROSO.
- Publicar runbook de flujo V1 y matriz endpoint-script-boton.

Fase 2: ocultar botones legacy de UI
- Ocultar acciones no V1 en topbar/modales (sin borrar codigo), via feature flags.
- Mantener accesibles solo en modo admin.

Fase 3: mover scripts legacy a legacy_quarantine/
- Mover scripts tmp_*.py y scripts historicos de esquemas/export legacy.
- Mantener wrappers o readme de migracion para trazabilidad.

Fase 4: bloquear endpoints peligrosos tras flag explicito
- Requerir env flag para /api/apply-generate-batch, clear-engine-fields en ALL, y pn-review bulk sin backup.
- Respuesta 403 si flag ausente.

Fase 5: eliminar cuando exista equivalencia confirmada
- Retirar calculate-final-fields tras validar equivalencia completa con copy-pdf-to-final-all-books.
- Retirar rutas legacy 410 y utilidades duplicadas cuando no haya callers.

## 10) Listas finales solicitadas

### 10.1 Funciones claramente buenas
- /api/recompute-simple/rebuild-json
- /api/recompute-simple/update-gesa
- /api/recompute-simple/update-sust
- /api/recompute-simple/enrich-assets/start + jobs
- /copy-pdf-to-final-all-books
- /recompute-qa-errors
- /api/recompute-simple/update-states
- /save-json (con whitelist) y /delete-json
- scripts/rebuild_engine_from_book_preview.js
- scripts/update_gesa_fields_from_excel.js
- scripts/update_sust_fields.js
- rebuild_assets_for_record.py
- recompute_engine_errors.js
- scripts/update_revision_states.js

### 10.2 Legacy candidatas a aislar
- /calculate-final-fields
- /recompute-pdf-auto
- /export/run-synthetic
- /export/run-ai-conflicts
- /export/run-all
- /pn/list, /pn/:sku, /pn/:sku/sources
- legacy/export_complex_ai/*
- tmp_*.py en raiz
- scripts/scripts esquemas/* historicos

### 10.3 Puntos peligrosos
- /api/apply-generate-batch (write lote)
- /clear-engine-fields (borrado masivo)
- /pn-review/apply-siblings-bulk (bulk sin backup en ruta actual)
- /copy-pdf-to-final-all-books (masivo final)
- /recompute-qa-errors (masivo errores)
- /save-json y /delete-json (criticos de escritura directa)

### 10.4 Siguientes cambios minimos propuestos (sin aplicar ahora)
1. Introducir flags de entorno para rutas peligrosas (deny by default fuera de local admin).
2. Crear una pagina de inventario interno que liste endpoints activos/legacy con estado runtime.
3. Añadir etiqueta visual LEGACY en UI para botones no V1 y ocultarlos por defecto.
4. Mover scripts tmp_*.py y legacy de export/esquemas a legacy_quarantine/ con README de procedencia.
5. Añadir validacion obligatoria backup=true o dryRun=true para operaciones bulk en ALL.

---

Observacion final
- No se eliminaron ni renombraron componentes; solo auditoria documental.
 - Este informe prioriza la proteccion del flujo V1 vigente y reduce riesgo por ruido legacy.
| POST | /delete-json.php | 5104 | alias compat | Si | engine_*.json | frontends remotos/legacy | DUPLICADO | Mantener temporalmente |
| GET | /save-json.php | 4264 | health compat | No | - | chequeo backend | ACTIVO_OFICIAL | Mantener |
| GET | /delete-json.php | 4268 | health compat | No | - | chequeo backend | ACTIVO_OFICIAL | Mantener |
| GET/POST | /qa_revision_sync.php | 2831/2840 | revisionSyncService | Si (POST) | qa_revision_server_data.json | flujo revision sync legado | ACTIVO_DUDOSO | Mantener documentado, no ampliar |
| POST | /apply-revision-to-engines | 2857 | revisionApplyService | Si masivo | engine_*.json | pipeline de revisiones | ACTIVO_DUDOSO | Aislar tras flag explicito |
| POST | /api/pdf-preview/apply-to-engine | 2151 | apply_book_preview_to_engine.py / apply_all_book_previews.py | Si | engine_*.json (+bak +report tmp) | analista-02 modal recalculo | ACTIVO_DUDOSO | Documentar como ruta alternativa |
| POST | /api/recompute-simple/recompute-hermanos | 1322 | applySiblingBulkUpdates | Si | engine_*.json | recompute_simple btnHermanos | ACTIVO_OFICIAL | Mantener |
| POST | /api/recompute-simple/rebuild-schemes-by-bom | 1677 | rebuild_schemes_by_bom.py | Si (write) | engine_*.json + esquemas | recompute_simple tarjeta 8 | ACTIVO_OFICIAL | Mantener |
| POST | /api/recompute-simple/rebuild-schemes-circles-from-esquemas | 1769 | rebuild_schemes_circles_from_esquemas.py | Si (write) | engine_*.json + esquemas_pos_circulos | recompute_simple tarjeta 9 | ACTIVO_OFICIAL | Mantener |
| POST | /api/recompute-simple/manual-override-picker | 1874 | prepara picker URL/contexto | No directo | usa overrides json por flujo | recompute_simple tarjeta 10 | ACTIVO_OFICIAL | Mantener |
| POST | /api/esquemas/generate-one | 4300 | generate_esquema_pos.py --without-circle | Si (imagen) | esquemas + opcional persistencia via save-json cliente | qa-milu boton generar esquema | ACTIVO_DUDOSO | Mantener, acotar permisos |
| POST | /api/esquemas-pos/generate-one | 4466 | rebuild_schemes_circles_from_esquemas.py single | Si | esquemas_pos_circulos | qa-milu boton generar esquema POS | ACTIVO_DUDOSO | Mantener |
| GET | /api/esquemas-pos-index | 4272 | index de archivos imagen | No | esquemas_pos_circulos | qa-milu | ACTIVO_OFICIAL | Mantener |
| POST | /api/apply-batch | 4620 | escribe rebuild_schemes_circles_manual_overrides.json | Si | overrides json | tools/simple_scheme_circle_marker | ACTIVO_DUDOSO | Aislar (tooling) |
| POST | /api/apply-generate-batch | 4723 | overrides + ejecucion python write | Si | overrides + imagenes + posible json | tools/simple_scheme_circle_marker | PELIGROSO | Encapsular bajo flag |

### 2.3 Export y PN review

| Metodo | Ruta | Linea aprox | Ejecuta | Escribe datos | Archivos/dirs afectados | Llamado desde UI | Estado | Recomendacion |
|---|---:|---:|---|---|---|---|---|---|
| POST | /export/run-wordpress | 2883 | scripts/export_wordpress_milu.js | Si | data/05-wordpress/* | qa-milu modal export | ACTIVO_OFICIAL | Mantener |
| GET | /export/preview | 2906 | preview export | No | lee data/05-wordpress | qa-milu modal export | ACTIVO_OFICIAL | Mantener |
| GET | /export/wordpress-decisions | 2945 | resumen decisiones | No | lee data/05-wordpress | soporte export | ACTIVO_DUDOSO | Documentar |
| GET | /export/trace/:sku | 2974 | traza por SKU | No | lee data/05-wordpress/milu_wp_trace.json | qa-milu modal export | ACTIVO_OFICIAL | Mantener |
| GET | /export/files | 4043 | lista export files | No | data/05-wordpress | export UI | ACTIVO_OFICIAL | Mantener |
| GET | /export/status | 4074 | estado export | No | data/05-wordpress | export UI | ACTIVO_OFICIAL | Mantener |
| GET | /export/file | 4090 | preview archivo | No | data/05-wordpress | export UI | ACTIVO_OFICIAL | Mantener |
| GET | /export/download | 4169 | descarga archivo | No | data/05-wordpress | export UI | ACTIVO_OFICIAL | Mantener |
| POST | /pn-review/apply-siblings-bulk | 3461 | applySiblingBulkUpdates | Si | engine_*.json | analista-02 | ACTIVO_DUDOSO | Revisar coexistencia con recompute-hermanos |
| POST | /pn-review/:sku/apply-decision | 3483 | aplica decision por SKU | Si | engine_*.json | analista-02 | ACTIVO_DUDOSO | Mantener si sigue uso |
| POST | /pn-review/:sku/apply-values | 3602 | propaga campos por SKU | Si | engine_*.json | analista-02 | ACTIVO_DUDOSO | Revisar alcance |
| POST | /pn-review/by-id/:id/apply-decision | 3687 | decision por ID | Si | engine_*.json | analista-02 | ACTIVO_DUDOSO | Revisar |
| GET | /pn-review/list /:sku /:sku/sources | 3368/3402/3437 | lecturas PN review | No | cache/engine read | analista-02 | ACTIVO_DUDOSO | Mantener documentado |

### 2.4 Endpoints explicitamente legacy/obsoletos

| Metodo | Ruta | Linea aprox | Estado runtime | Estado auditoria | Recomendacion |
|---|---:|---|---|---|---|
| POST | /recompute-pdf-auto | 2348 | 410 | LEGACY | Mantener 410, ocultar referencias UI |
| POST | /export/run-synthetic | 2881 | 410 | LEGACY | Mantener 410 y mover docs a legacy |
| POST | /export/run-ai-conflicts | 2904 | 410 | LEGACY | Igual |
| POST | /export/run-all | 4210 | 410 | LEGACY | Igual |
| GET | /pn/list, /pn/:sku, /pn/:sku/sources | 3832-3836 | 410 | LEGACY | Mantener 410 |
| POST | /apply-qa-checks-filter | 5369 | 410 via legacyQaPipelineDisabled | LEGACY | Mantener 410 |

### 2.5 Endpoints DB read-only (router)

Montaje en server.js:
- app.use('/db/analytics', db-analytics-router) linea ~488
- app.use('/db', db-read-router) linea ~496

Estado: ACTIVO_OFICIAL (capa lectura) / Riesgo bajo (sin escritura).
Recomendacion: mantener fuera del alcance de limpieza V1 de escritura.

---

## 3) Mapa de botones UI (archivos priorizados)

## 3.1 recompute_simple.html + js/recompute-simple.js

| Boton texto | id | Frontend | Handler | Endpoint | Script/backend | Flujo V1 | Estado | Recomendacion |
|---|---|---|---|---|---|---|---|---|
| ENGINE REBUILD | btnImportPdf | recompute_simple.html | runImportPdf | /api/recompute-simple/rebuild-json | runRebuildFromPreview | Si (1) | ACTIVO_OFICIAL | Mantener |
| ACTUALIZAR GESA + SUST | btnSust | recompute_simple.html | runUpdateSust | /api/recompute-simple/update-gesa + /update-sust | runUpdateGesa/runUpdateSust | Si (2) | ACTIVO_OFICIAL | Mantener |
| ASSETS | btnAssets | recompute_simple.html | runAssets | /api/recompute-simple/enrich-assets/start (+jobs) | rebuild_assets_for_record.py | Si (3) | ACTIVO_OFICIAL | Mantener |
| CÁLCULO FINAL | btnFinal | recompute_simple.html | runFinalCalculation | /copy-pdf-to-final-all-books | logica FINAL_FIELDS_V1 backend | Si (4) | ACTIVO_OFICIAL | Mantener |
| ERRORES | btnErrors | recompute_simple.html | runErrors | /recompute-qa-errors | recompute_engine_errors.js | Si (5) | ACTIVO_OFICIAL | Mantener |
| ESTADOS | btnStatuses | recompute_simple.html | runStatuses | /api/recompute-simple/update-states | update_revision_states.js | Si (6) | ACTIVO_OFICIAL | Mantener |
| RECALCULAR HERMANOS | btnHermanos | recompute_simple.html | runHermanos | /api/recompute-simple/recompute-hermanos | applySiblingBulkUpdates | Complementario | ACTIVO_OFICIAL | Mantener |
| 8 DRY RUN / 8 WRITE | btnSchemesByBomDryRun / btnSchemesByBomWrite | recompute_simple.html | runRebuildSchemesByBom | /api/recompute-simple/rebuild-schemes-by-bom | rebuild_schemes_by_bom.py | Complementario | ACTIVO_OFICIAL | Mantener |
| 9 DRY RUN / 9 WRITE | btnSchemesPosDryRun / btnSchemesPosWrite | recompute_simple.html | runRebuildSchemesCircles | /api/recompute-simple/rebuild-schemes-circles-from-esquemas | rebuild_schemes_circles_from_esquemas.py | Complementario | ACTIVO_OFICIAL | Mantener |
| ABRIR PICKER MANUAL | btnManualOverridePicker | recompute_simple.html | runManualOverridePicker | /api/recompute-simple/manual-override-picker | prepara tools/manual_override_picker.html | Complementario | ACTIVO_OFICIAL | Mantener |
| VACIAR + MARCAR REVISION | btnClearPdfFinal | recompute_simple.html | runClearPdfFinal | /clear-engine-fields | clear engine fields backend | Paso 7 | ACTIVO_OFICIAL | Mantener con doble confirmacion |

## 3.2 import_pdf.html + js/import-pdf.js

| Boton texto | id | Handler | Endpoint llamado | Estado |
|---|---|---|---|---|
| IR A PÁGINA | goToPageBtn | goToSelectedPage | No backend write (visor PDF local) | ACTIVO_OFICIAL |
| CABECERAS | detectHeadersBtn | runHeadersOnly | No endpoint | ACTIVO_OFICIAL |
| TABLA | paintBodyByHeadersBtn | runTableDetection | No endpoint | ACTIVO_OFICIAL |
| EXTRAER PÁGINA | extractPageRowsBtn | extractAllPdfRowsFromCurrentPage | No endpoint | ACTIVO_OFICIAL |
| CSV / JSON | downloadCsvBtn/downloadJsonBtn | export local | No endpoint | ACTIVO_OFICIAL |
| EXTRAER LIBRO / EXTRAER TODOS | extractBookBtn/extractAllBooksBtn | extraccion cliente | No endpoint de escritura | ACTIVO_OFICIAL |

Comentario: Import PDF experimental es principalmente cliente (lectura/extraccion), no un punto de escritura directa en engine_*.json.

## 3.3 qa_milu.html + js/qa-milu.js

| Boton/accion | id | Handler | Endpoint | Escribe | Estado | Recomendacion |
|---|---|---|---|---|---|---|
| Ediciones de campos QA/ficha | multiples (tabla, modal, panel lateral) | saveCellToServer | /save-json(/.php) | Si | ACTIVO_OFICIAL | Mantener |
| Export WordPress (run) | qaExportRunWordpressBtn | runExportPipeline | /export/run-wordpress | Si (output export) | ACTIVO_OFICIAL | Mantener |
| Recargar preview export | qaExportReloadPreviewBtn | loadExportPreview | /export/preview | No | ACTIVO_OFICIAL | Mantener |
| Trazas export por SKU | click fila preview | loadExportTraceForSku | /export/trace/:sku | No | ACTIVO_OFICIAL | Mantener |
| Generar esquema | generateMissingEsquemaBtn | handler generate-one | /api/esquemas/generate-one + /save-json | Si | ACTIVO_DUDOSO | Mantener con control |
| Generar esquema POS | generateMissingEsquemaPosBtn | handler generate-one POS | /api/esquemas-pos/generate-one + /save-json | Si | ACTIVO_DUDOSO | Mantener con control |
| Carga indice esquemas POS | startup | fetch pos index | /api/esquemas-pos-index | No | ACTIVO_OFICIAL | Mantener |
| Auditoria cambios | qaUndoLastChangeBtn + change-control | /audit-log (best effort) | Si (audit log) | ACTIVO_DUDOSO | Mantener documentado |

## 3.4 milu_shell.html

| Elemento | id | Funcion | Endpoint | Escribe | Estado |
|---|---|---|---|---|---|
| Navegacion tabs shell | nav data-page | monta iframes importpdf/pdf/analisis/imagenes/exportwp | N/A | No | ACTIVO_OFICIAL |
| Editor compartido guardar | shellSharedSaveBtn | saveCellToServer por campo | /save-json(/.php) | Si | ACTIVO_DUDOSO |

Nota: ENABLE_EXPORT_VIEW=false deja deshabilitada vista export legacy en shell (señal positiva de contencion).

---

## 4) Mapa de scripts relevantes (.js/.py)

## 4.1 Scripts principales del flujo actual

| Script | Proposito | Entradas | Salidas | Dry-run | Backup | Escribe engine/rebuild/export/img | Quien lo llama | Estado |
|---|---|---|---|---|---|---|---|---|
| scripts/rebuild_engine_from_book_preview.js | crear engine_rebuild + copia engine en data/02-engine_rebuild | book_preview, engine | engine_rebuild_*.json, copia engine, report | Si (--dry-run) | N/A (es salida nueva) | rebuild | endpoint /api/recompute-simple/rebuild-json | ACTIVO_OFICIAL |
| scripts/update_gesa_fields_from_excel.js | merge GESA en engine | EXCEL_GESA2026.json + engine_*.json | engine_*.json | Si (default) | Si (backup-gesa) | engine | /api/recompute-simple/update-gesa | ACTIVO_OFICIAL |
| scripts/update_sust_fields.js | merge SUST en engine | EXCEL_SUSTITUCION + engine | engine_*.json | Si (--dry-run/default) | Si (desactivable --no-backup) | engine | /api/recompute-simple/update-sust | ACTIVO_OFICIAL |
| rebuild_assets_for_record.py | enriquecer assets por record/book/all | engine, id/scope, flags | engine actualizado + assets | Si | Control por flag write | engine + imagenes | /api/recompute-simple/enrich-assets* | ACTIVO_OFICIAL |
| rebuild_schemes_by_bom.py | recalculo campo esquemas por BOM | engine/id/all | engine + esquemas | Si | Impl. con write/dry-run | engine + imagenes | /api/recompute-simple/rebuild-schemes-by-bom | ACTIVO_OFICIAL |
| rebuild_schemes_circles_from_esquemas.py | recalculo POS circles desde esquemas | engine/id/all + overrides | engine + esquemas_pos | Si | Impl. con write/dry-run | engine + imagenes | /api/recompute-simple/rebuild-schemes-circles-from-esquemas | ACTIVO_OFICIAL |
| generate_esquema_pos.py | generar 1 esquema base por registro | engine,id,pdf,pos hints | imagen esquema + report | Si | N/A | imagenes | /api/esquemas/generate-one | ACTIVO_DUDOSO |
| scripts/update_revision_states.js | recalculo revision estado/accion | engine/id/all | engine_*.json | No dry-run explicito | Si (desactivable) | engine | /api/recompute-simple/update-states | ACTIVO_OFICIAL |
| recompute_engine_errors.js | recalculo de errores por reglas | file/id/scope | engine_*.json | Si | Si (no-backup posible) | engine | /recompute-qa-errors | ACTIVO_OFICIAL |
| scripts/export_wordpress_milu.js | generar paquetes export wordpress | engine data + reglas export | data/05-wordpress/*.json/*.csv/*.md | Si (--dry-run) | N/A | export | /export/run-wordpress | ACTIVO_OFICIAL |
| scripts/build_ftp_deploy.js | construir reporte y paquete deploy ftp | repo assets | salida deploy_ftp/report | N/A | N/A | build/report | npm run build:ftp | ACTIVO_OFICIAL |

## 4.2 Scripts alternativos/legacy o de soporte

| Script | Observacion | Riesgo | Estado | Sustituto recomendado |
|---|---|---|---|---|
| apply_book_preview_to_engine.py | ruta Python oficial de import puntual | medio (write engine) | ACTIVO_DUDOSO | mantener solo como alternativo al endpoint V1 |
| apply_all_book_previews.py | import masivo por previews | alto en ALL write | ACTIVO_DUDOSO | preferir recompute-simple paso 1 |
| apply_revision_to_engines.js | aplica revisiones masivas | alto | ACTIVO_DUDOSO | usar solo para migraciones controladas |
| apply-bulk-revision-to-engine.js | variante de bulk revision | medio-alto | DUPLICADO | converger en una sola via |
| scripts/enrich_rebuild_with_assets.js | enriquecer rebuild/engine por CLI | medio | ACTIVO_DUDOSO | priorizar rebuild_assets_for_record.py via endpoint |
| scripts/enrich_rebuild_with_gesa_sust.js | enriquecer rebuild con catalogos | medio | ACTIVO_DUDOSO | priorizar update-gesa/sust oficiales |
| scripts/qa_pdf_compare.js y qa_pdf_compare_v2.js | comparadores PDF historicos | medio | LEGACY | mantener para forense, fuera de UI |
| scripts/qa_pdf_visual_copy.js y run_visual_pdf_copy_batch.js | pipeline copy _pdf | alto write | ACTIVO_DUDOSO | usar solo con validacion previa |
| clear_pdf_fields.py / clear_engine_fields.py (root) | limpieza offline directa | alto | LEGACY | preferir endpoint /clear-engine-fields con guardas |
| copy_gesa_fields_to_final.py / copy_pdf_fields_to_final.py | calculo final historico | medio | LEGACY | usar /copy-pdf-to-final-all-books |
| generate_synthetic_exports.js | pipeline synthetic legacy | bajo-medio | LEGACY | no usar en V1 |
| legacy/export_complex_ai/* | pipeline IA conflicts antiguo | variable | LEGACY | cuarentena |

## 4.3 Ruido tecnico no productivo (candidatos claros a aislamiento)

- tmp_*.py en raiz
- test_conv.py suelto en raiz
- debug*.js sueltos en raiz
- scripts/scripts esquemas/* historicos sin integracion directa en V1
- carpeta legacy/export_complex_ai/ completa (excepto consulta forense)

---

## 5) Duplicidades detectadas por dominio

| Dominio | Componentes solapados | Hallazgo |
|---|---|---|
| Extraccion PDF | import_pdf experimental, qa_pdf_compare, qa_pdf_visual_copy, analista-02 recompute PDF | varias vias para lectura/copiado PDF con semanticas distintas |
| Rebuild JSON | scripts/rebuild_engine_from_book_preview.js, apply_book_preview_to_engine.py, apply_all_book_previews.py | triple via import/rebuild; una JS V1 y dos Python legacy/alternativas |
| GESA/SUST | update_gesa_fields_from_excel.js / update_sust_fields.js vs enrich_rebuild_with_gesa_sust.js | superposicion de enriquecimiento en engine vs rebuild |
| Calculo FINAL | /copy-pdf-to-final-all-books vs /calculate-final-fields (legacy python) | endpoint legacy coexistente |
| Estados QA | update_revision_states.js, pn-review apply-decision(s), apply_revision_to_engines.js | multiples rutas de estado/accion |
| Assets/esquemas | rebuild_assets_for_record.py, rebuild_schemes_by_bom.py, rebuild_schemes_circles_from_esquemas.py, generate_esquema_pos.py, /api/esquemas* | stack potente pero con caminos paralelos y tooling aparte |
| Export WordPress | /export/run-wordpress actual vs legacy synthetic/ai/run-all | legacy desactivado pero presente |
| Frontend duplicado | raiz/* y deploy_ftp/* | duplicacion de html/js que incrementa divergencia |

---

## 6) Funciones potencialmente peligrosas

Criterios pedidos: escritura directa engine_*.json, write masivo sin dry-run, sin backup, scope ambiguo, mezcla rebuild/engine, sobreescritura final/QA.

## 6.1 Riesgo alto

1. /clear-engine-fields (POST): borra masivamente sufijos y puede resetear revision.
2. /apply-revision-to-engines (POST): aplica cambios masivos cross-engine.
3. /api/apply-generate-batch (POST): escribe overrides y dispara generacion en lote.
4. /save-json + /delete-json: escritura directa por registro (potente, siempre activo).
5. scripts apply_all_book_previews.py --write --overwrite (si se usa fuera de control).

## 6.2 Riesgo medio

1. /copy-pdf-to-final-all-books: toca campos finales en masa (aunque con mapeo oficial).
2. /recompute-qa-errors y /api/recompute-simple/update-states en ALL.
3. rebuild_assets_for_record.py en modo --all --write.
4. qa_pdf_visual_copy y batch write sobre _pdf.

## 6.3 Observaciones de control existentes (positivas)

- Validacion de payloads y allowed fields en /save-json.
- Locks por archivo para writes concurrentes.
- Varios scripts con dry-run por defecto y backup.
- Endpoints legacy sensibles devuelven 410 en varios casos.

---

## 7) Tabla final de decision

| Componente | Tipo | Estado actual | Riesgo | Mantener | Aislar | Eliminar | Pendiente validar | Comentario |
|---|---|---|---|---|---|---|---|---|
| Flujo recompute_simple (pasos 1-7) | frontend+endpoint | ACTIVO_OFICIAL | Medio | Si | No | No | No | Es el nucleo V1 a proteger |
| /save-json + whitelist | endpoint | ACTIVO_OFICIAL | Medio | Si | No | No | No | pieza central de edicion |
| /delete-json | endpoint | ACTIVO_DUDOSO | Alto | Si | Si | No | Si | revisar uso real |
| /copy-pdf-to-final-all-books | endpoint | ACTIVO_OFICIAL | Medio-Alto | Si | No | No | No | critico de negocio |
| /recompute-qa-errors | endpoint | ACTIVO_OFICIAL | Medio-Alto | Si | No | No | No | proteger backup/scope |
| /api/recompute-simple/enrich-assets* | endpoint | ACTIVO_OFICIAL | Alto | Si | Si | No | No | job en ALL requiere gobernanza |
| /api/recompute-simple/rebuild-schemes-* | endpoint | ACTIVO_OFICIAL | Alto | Si | Si | No | No | write sobre json + imagenes |
| /api/esquemas/generate-one | endpoint | ACTIVO_DUDOSO | Medio | Si | Si | No | Si | uso puntual QA |
| /api/esquemas-pos/generate-one | endpoint | ACTIVO_DUDOSO | Medio | Si | Si | No | Si | idem |
| /api/apply-batch | endpoint/tooling | ACTIVO_DUDOSO | Medio-Alto | Si | Si | No | Si | separar de operacion diaria |
| /api/apply-generate-batch | endpoint/tooling | PELIGROSO | Alto | No | Si | No | Si | exigir flag explicito |
| /export/run-wordpress + /export/* lectura | endpoint | ACTIVO_OFICIAL | Medio | Si | No | No | No | salida final oficial |
| /export/run-synthetic, /run-ai-conflicts, /run-all | endpoint | LEGACY (410) | Bajo | No | Si | Si (fase 5) | No | ya desactivados |
| /pn/* legacy (410) | endpoint | LEGACY | Bajo | No | Si | Si (fase 5) | No | mantener 410 mientras |
| pn-review apply* | endpoint | ACTIVO_DUDOSO | Medio-Alto | Si | Si | No | Si | validar uso real frente recompute-hermanos |
| deploy_ftp duplicados | carpeta | DUPLICADO | Medio | Si | Si | No | Si | riesgo de drift |
| legacy/export_complex_ai | carpeta | LEGACY | Bajo-Medio | No | Si | No | Si | cuarentena |
| tmp_*.py / debug*.js raiz | scripts | LEGACY | Bajo | No | Si | No | Si | limpiar ruido |
| record-editor endpoint + js/record-editor.js | endpoint+frontend | ACTIVO_DUDOSO | Medio | Si | Si | No | Si | no parece en flujo principal QA actual |
| db routers /db y /db/analytics | endpoint router | ACTIVO_OFICIAL | Bajo | Si | No | No | No | solo lectura |

---

## 8) Propuesta de limpieza por fases (sin romper V1)

Fase 1: documentar y etiquetar (sin ocultar ni mover)
1. Etiquetar endpoints/scripts con estado (ACTIVO_OFICIAL, LEGACY, PELIGROSO) en docs_v2.
2. Añadir matriz de ownership por dominio (PDF, GESA/SUST, ASSETS, FINAL, QA, EXPORT).
3. Publicar runbook de ejecucion segura para operaciones ALL.

Fase 2: ocultar botones legacy en UI
1. Ocultar/feature-flag botones que disparen rutas no V1 o dudosas en vistas principales.
2. Mantener acceso tecnico solo en modo avanzado.

Fase 3: mover legacy a legacy_quarantine/
1. Mover scripts tmp/debug/legacy no usados a legacy_quarantine/ manteniendo historial git.
2. No tocar scripts oficiales V1.

Fase 4: bloquear endpoints peligrosos tras flag explicito
1. Requerir env flag para /api/apply-generate-batch, /apply-revision-to-engines y operaciones masivas sensibles.
2. Registrar auditoria extendida para writes masivos.

Fase 5: eliminar tras equivalencia confirmada
1. Eliminar endpoints/scripts legacy solo tras 2 ciclos de validacion funcional y equivalencia demostrada.

---

## 9) Lista de funciones claramente buenas (candidatas a proteger)

1. /api/recompute-simple/rebuild-json
2. /api/recompute-simple/update-gesa
3. /api/recompute-simple/update-sust
4. /api/recompute-simple/enrich-assets/start + jobs
5. /copy-pdf-to-final-all-books
6. /recompute-qa-errors
7. /api/recompute-simple/update-states
8. /clear-engine-fields (con confirmacion fuerte)
9. /export/run-wordpress + /export/preview + /export/trace
10. /save-json con validacion de campos
11. scripts: rebuild_engine_from_book_preview.js, update_gesa_fields_from_excel.js, update_sust_fields.js, rebuild_assets_for_record.py, rebuild_schemes_by_bom.py, rebuild_schemes_circles_from_esquemas.py, update_revision_states.js, export_wordpress_milu.js

---

## 10) Legacy candidatas a aislar

1. Endpoints 410 legacy: /export/run-synthetic, /export/run-ai-conflicts, /export/run-all, /pn/*
2. /calculate-final-fields (legacy Python)
3. legacy/export_complex_ai/*
4. tmp_*.py y debug*.js en raiz
5. scripts/qa_pdf_compare*.js como tooling forense, fuera de UI diaria
6. apply-bulk-revision-to-engine.js (si no hay uso confirmado)

---

## 11) Puntos peligrosos priorizados

1. Escritura directa en engine por /save-json y /delete-json (siempre activos).
2. Escrituras masivas en ALL (estados, errores, assets, revisiones).
3. Endpoints tooling batch que mezclan override+generacion (/api/apply-generate-batch).
4. Convivencia de vias paralelas de import/rebuild (JS V1 + Python alternativos).
5. Duplicados deploy_ftp/ que pueden divergir de raiz.

---

## 12) Propuesta concreta de siguientes cambios minimos (sin aplicar aun)

1. Añadir una bandera de seguridad SERVER_ENABLE_DANGEROUS_WRITE para:
   - /api/apply-generate-batch
   - /apply-revision-to-engines
   - operaciones ALL destructivas opcionales
2. Mostrar en UI etiqueta visible "OFICIAL V1" solo en botones del pipeline 1-7.
3. Ocultar en UI principal acciones no V1 bajo un interruptor "modo tecnico".
4. Crear carpeta legacy_quarantine/ y plan de traslado en PR separado (sin borrar).
5. Añadir reporte automatico de auditoria (read-only) que liste:
   - endpoints write disponibles
   - scripts write sin dry-run
   - scripts write sin backup

---

## 13) Anexos de evidencia (archivos auditados)

Backend:
- server.js
- server/routers/db-read-router.js
- server/routers/db-analytics-router.js

Frontend principal:
- recompute_simple.html
- js/recompute-simple.js
- import_pdf.html
- js/import-pdf.js
- qa_milu.html
- js/qa-milu.js
- milu_shell.html
- js/data-loader.js
- js/record-editor.js

Scripts revisados (subset de alto impacto):
- rebuild_assets_for_record.py
- rebuild_schemes_by_bom.py
- rebuild_schemes_circles_from_esquemas.py
- generate_esquema_pos.py
- apply_book_preview_to_engine.py
- apply_all_book_previews.py
- scripts/rebuild_engine_from_book_preview.js
- scripts/update_gesa_fields_from_excel.js
- scripts/update_sust_fields.js
- scripts/enrich_rebuild_with_assets.js
- scripts/update_revision_states.js
- scripts/export_wordpress_milu.js
- scripts/build_ftp_deploy.js
- recompute_engine_errors.js
- scripts/qa_pdf_visual_copy.js
