# MILU_V103_DECISIONS — Decisiones consolidadas V1.03

> **FASE 4.5 / Objetivo 3** del Plan Maestro V1.03. Lista plana de **todas las decisiones** propuestas tras el análisis de duplicidades, lista para ejecutar en FASES 5–9.
>
> Entradas: [MILU_DUPLICATED_DOMAINS.md](MILU_DUPLICATED_DOMAINS.md), [MILU_SIMPLIFICATION_PLAN.md](MILU_SIMPLIFICATION_PLAN.md), [MILU_OFFICIAL_COMPONENTS.md](MILU_OFFICIAL_COMPONENTS.md).
>
> Cada decisión incluye dominio, acción concreta, justificación, riesgo de aplicación y fase asignada.
>
> **Estado de las decisiones**: `PROPUESTA` (este documento). Antes de FASE 5 deben ratificarse por el responsable funcional.

## Convenciones

- **Riesgo de aplicación**: BAJO (cambio inerte, ej. eliminar 410), MEDIO (mover script huérfano, refactor de cliente para apuntar a otro endpoint), ALTO (cambio que toca lógica viva).
- **Fase**: número del plan maestro V1.03.
- **Tipo**:
  - `KEEP` — declarar oficial sin cambios.
  - `DEPRECATE` — marcar como `LEGACY_V102`; eliminar tras FASE indicada.
  - `REMOVE` — eliminar físicamente del código fuente.
  - `QUARANTINE` — mover a `legacy_quarantine/` (FASE 5).
  - `GATE` — proteger detrás de `SERVER_ENABLE_DANGEROUS_WRITE` (FASE 6).
  - `MERGE` — fundir dos implementaciones en una.
  - `RENAME` — renombrar para claridad (no funcional).
  - `REFACTOR` — modificación interna sin cambio observable.

---

## D-01 — DOMINIO 1 (PDF) · REBUILD JS oficial

| Campo | Valor |
|---|---|
| Dominio | PDF |
| Tipo | KEEP |
| Decisión | Mantener `POST /api/recompute-simple/rebuild-json` + `node:scripts/rebuild_engine_from_book_preview.js` como camino oficial para construir `data/02-engine_rebuild/` |
| Justificación | Es el único camino que NO toca `engine_*.json` directamente (server marca `engineFilesModified:false`). Permite trabajar en staging seguro. |
| Riesgo | BAJO |
| Fase | 7 (ratificación) |

## D-02 — DOMINIO 1 (PDF) · APPLY single oficial

| Campo | Valor |
|---|---|
| Dominio | PDF |
| Tipo | KEEP + REFACTOR |
| Decisión | Mantener `POST /api/pdf-preview/apply-to-engine` (modo single, `engine=…`) → `python:apply_book_preview_to_engine.py` como oficial para "promocionar 1 libro a engine". Refactor: añadir `--dry-run` y backup automático antes del `--write --overwrite`. |
| Justificación | Es el único camino para escribir el preview a `engine_*.json` con feedback de conflictos (`conflictDecisions`). Falta red de seguridad. |
| Riesgo | MEDIO (refactor del script Python) |
| Fase | 7 |

## D-03 — DOMINIO 1 (PDF) · APPLY ALL detrás de gating

| Campo | Valor |
|---|---|
| Dominio | PDF |
| Tipo | GATE |
| Decisión | `POST /api/pdf-preview/apply-to-engine` sin `engine` (modo `applyAll`) → `apply_all_book_previews.py` queda detrás de `SERVER_ENABLE_DANGEROUS_WRITE=1`. |
| Justificación | Modifica los 9 `engine_*.json` con `--write --overwrite` sin red de seguridad. |
| Riesgo | BAJO (servidor responde 403 si flag desactivado) |
| Fase | 6 |

## D-04 — DOMINIO 1 (PDF) · COPY INLINE single-row a LEGACY

| Campo | Valor |
|---|---|
| Dominio | PDF |
| Tipo | DEPRECATE → REMOVE |
| Decisión | Marcar `POST /copy-pdf-to-pdf` como `LEGACY_V102`. Migrar `analista_02` para usar `/recompute-pdf-auto-visual` con `id=…` (caso single-row). Eliminar `/copy-pdf-to-pdf` y `applyCanonicalPdfCopyToRow` tras la migración. |
| Justificación | Duplica funcionalidad de `/recompute-pdf-auto-visual` para una sola fila, sin backup ni dryRun. |
| Riesgo | MEDIO (frontend) |
| Fase | 7 |

## D-05 — DOMINIO 1 (PDF) · qa_pdf_compare v1/v2

| Campo | Valor |
|---|---|
| Dominio | PDF |
| Tipo | DECIDIR (MERGE o DEPRECATE) |
| Decisión | FASE 7 debe determinar si `scripts/qa_pdf_compare_v2.js` reemplaza a `qa_pdf_compare.js`. Si reemplaza: renombrar v2 a v1 y mover v1 a quarantine. Si no reemplaza: mover v2 a quarantine. |
| Justificación | v2 no está expuesto en `package.json`. v1 sí. Coexistencia sin documentar. |
| Riesgo | BAJO |
| Fase | 7 |

## D-06 — DOMINIO 1 (PDF) · COPY batch detrás de gating

| Campo | Valor |
|---|---|
| Dominio | PDF |
| Tipo | GATE |
| Decisión | `POST /copy-pdf-to-pdf-all-books` (multi-archivo) detrás de `SERVER_ENABLE_DANGEROUS_WRITE`. |
| Justificación | Aunque tiene backup y dryRun, el modo "todos los archivos" merece gating. |
| Riesgo | BAJO |
| Fase | 6 |

---

## D-07 — DOMINIO 2 (FINAL) · `/copy-pdf-to-final-all-books` oficial

| Campo | Valor |
|---|---|
| Dominio | FINAL |
| Tipo | KEEP |
| Decisión | Mantener `POST /copy-pdf-to-final-all-books` con la matriz `FINAL_FIELDS_V1_MAPPINGS_BACKEND` inline como oficial online. Ya está marcado `// OFFICIAL` en código. |
| Justificación | Implementación moderna, con backup, ratificada en `MILU_OFFICIAL_COMPONENTS.md`. |
| Riesgo | BAJO |
| Fase | 4 (ya está, ratificación formal) |

## D-08 — DOMINIO 2 (FINAL) · `depuracion_json.py` oficial offline

| Campo | Valor |
|---|---|
| Dominio | FINAL |
| Tipo | KEEP + REFACTOR |
| Decisión | Mantener `python:depuracion_json.py` como oficial offline (proceso de paso a JSON definitivos). Refactor en FASE 7: garantizar que la matriz de prioridades coincide bit a bit con `FINAL_FIELDS_V1_MAPPINGS_BACKEND` (extraer matriz a `python_lib/` y compartirla, o regenerar desde un manifest común). |
| Justificación | Coexistencia online/offline es deseable pero la divergencia entre matrices es deuda. |
| Riesgo | MEDIO (refactor, requiere pruebas funcionales) |
| Fase | 7 |

## D-09 — DOMINIO 2 (FINAL) · `/calculate-final-fields` REMOVE

| Campo | Valor |
|---|---|
| Dominio | FINAL |
| Tipo | REMOVE |
| Decisión | Eliminar `POST /calculate-final-fields` y el script `copy_gesa_fields_to_final.py`. Eliminar el botón `Calculate final` de `analista_02.html`. |
| Justificación | Marcado `LEGACY` en código. Cubre solo subconjunto GESA→_final mientras D-07 lo cubre completo. |
| Riesgo | MEDIO (frontend + retirada de endpoint vivo) |
| Fase | 7 |

## D-10 — DOMINIO 2 (FINAL) · `copy_pdf_fields_to_final.py` QUARANTINE

| Campo | Valor |
|---|---|
| Dominio | FINAL |
| Tipo | QUARANTINE |
| Decisión | Mover `copy_pdf_fields_to_final.py` a `legacy_quarantine/python/`. |
| Justificación | Sin invocador conocido. |
| Riesgo | BAJO |
| Fase | 5 |

---

## D-11 — DOMINIO 3 (HERMANOS) · `recompute-hermanos` oficial

| Campo | Valor |
|---|---|
| Dominio | HERMANOS |
| Tipo | KEEP |
| Decisión | Mantener `POST /api/recompute-simple/recompute-hermanos` como único endpoint público de hermanos. |
| Justificación | Soporta `dryRun` y `backup` configurables. Reporta `per_engine`. Pertenece al pipeline numerado paso 8. |
| Riesgo | BAJO |
| Fase | 4 (ya está; gating en FASE 6) |

## D-12 — DOMINIO 3 (HERMANOS) · `pn-review/apply-siblings-bulk` REMOVE

| Campo | Valor |
|---|---|
| Dominio | HERMANOS |
| Tipo | DEPRECATE → REMOVE |
| Decisión | Marcar `POST /pn-review/apply-siblings-bulk` como `LEGACY_V102` + `DANGEROUS_WRITE`. Migrar `analista_02.html` (botones `Propagar hermanos`, `Propagar hermanos (libro)`) para usar `/api/recompute-simple/recompute-hermanos`. Eliminar el endpoint legacy tras la migración. |
| Justificación | Mismo motor interno (`applySiblingBulkUpdates`). Hardcodea `dryRun:false, backup:false`. |
| Riesgo | ALTO (refactor de cliente analista_02; el motor es el mismo, riesgo funcional bajo) |
| Fase | 8 |

## D-13 — DOMINIO 3 (HERMANOS) · `recompute-hermanos` con engine=ALL detrás de gating

| Campo | Valor |
|---|---|
| Dominio | HERMANOS |
| Tipo | GATE |
| Decisión | Cuando `engine=ALL` y `dryRun=false`, requerir `SERVER_ENABLE_DANGEROUS_WRITE=1`. |
| Justificación | Caso bulk multi-engine. |
| Riesgo | BAJO |
| Fase | 6 |

---

## D-14 — DOMINIO 4 (CALCULAR ESTADOS) · `update-states` oficial

| Campo | Valor |
|---|---|
| Dominio | ESTADOS-CALCULAR |
| Tipo | KEEP |
| Decisión | Mantener `POST /api/recompute-simple/update-states` como oficial paso 7. |
| Justificación | Único endpoint dedicado a calcular `qa_revision_estado`/`qa_revision_accion` desde reglas. |
| Riesgo | BAJO |
| Fase | 4 |

## D-15 — DOMINIO 4 (CALCULAR) · `recompute-qa-errors` oficial paso 6

| Campo | Valor |
|---|---|
| Dominio | ESTADOS-CALCULAR |
| Tipo | KEEP + REFACTOR |
| Decisión | Mantener `POST /recompute-qa-errors` como oficial paso 6 ERRORES. Refactor en FASE 8: separar el cálculo de errores del refresco de estados. La UI no debe usarlo con `updateRevision:true`; eso pertenece a `update-states`. |
| Justificación | El endpoint mezcla dos responsabilidades. Para reducir bugs hay que separarlas. |
| Riesgo | MEDIO |
| Fase | 8 |

## D-16 — DOMINIO 4 (CALCULAR) · `recalculate-revision-status` REMOVE

| Campo | Valor |
|---|---|
| Dominio | ESTADOS-CALCULAR |
| Tipo | DEPRECATE → REMOVE |
| Decisión | Marcar `POST /recalculate-revision-status` como `LEGACY_V102` + `DANGEROUS_WRITE`. Migrar el botón `PDF Recompute revision` de `analista_02.html` a `update-states` con `engine=ALL`. Eliminar tras migración. |
| Justificación | Es básicamente un loop sobre los 9 engines llamando a `recomputeEngineErrors({ updateRevision: true, forceRevision: false })`. Cubierto por `update-states`. |
| Riesgo | ALTO (cambio de cliente; comprobar equivalencia funcional) |
| Fase | 8 |

## D-17 — DOMINIO 4 (APLICAR) · `apply-revision-to-engines` oficial bulk

| Campo | Valor |
|---|---|
| Dominio | ESTADOS-APLICAR |
| Tipo | KEEP + GATE |
| Decisión | Mantener `POST /apply-revision-to-engines` como oficial bulk. Cuando `mode=all`, requerir `SERVER_ENABLE_DANGEROUS_WRITE=1`. |
| Justificación | Único punto bulk soportado. |
| Riesgo | BAJO |
| Fase | 6 |

## D-18 — DOMINIO 4 (APLICAR) · `pn-review/by-id/:id/apply-decision` SUPPORTED

| Campo | Valor |
|---|---|
| Dominio | ESTADOS-APLICAR |
| Tipo | KEEP |
| Decisión | Mantener `POST /pn-review/by-id/:id/apply-decision` como `SUPPORTED_V103` (caso especial cuando solo hay ID conocido). |
| Justificación | No es duplicado puro de `apply-decision` por SKU: opera sobre 1 fila concreta. |
| Riesgo | BAJO |
| Fase | n/a |

---

## D-19 — DOMINIO 5 (ESQUEMAS GENERALES) · A1+A2 oficiales

| Campo | Valor |
|---|---|
| Dominio | ESQUEMAS-GENERAL |
| Tipo | KEEP |
| Decisión | Mantener `POST /api/esquemas/generate-one` (single) y `POST /api/recompute-simple/rebuild-schemes-by-bom` (bulk pipeline paso 9). |
| Justificación | Single + bulk son resoluciones distintas legítimas. |
| Riesgo | BAJO |
| Fase | 4 |

## D-20 — DOMINIO 5 · ASSETS no es "esquemas"

| Campo | Valor |
|---|---|
| Dominio | ESQUEMAS-GENERAL / ASSETS |
| Tipo | DOCUMENTAR |
| Decisión | Documentar que `POST /api/recompute-simple/enrich-assets` (paso 4) NO debe utilizarse como atajo para regenerar esquemas. Si el usuario quiere regenerar esquemas, debe usar A1/A2/B1. |
| Justificación | Solapamiento operativo silencioso. |
| Riesgo | BAJO |
| Fase | 4 (ya en `MILU_OFFICIAL_COMPONENTS.md`); opcional aviso en UI |

## D-21 — DOMINIO 5 · `generate_esquema_pos.py` RENAME

| Campo | Valor |
|---|---|
| Dominio | ESQUEMAS-GENERAL |
| Tipo | RENAME (opcional) |
| Decisión | Renombrar `generate_esquema_pos.py` → `generate_esquema_general.py`. El script genera `esquemas/` (esquemas generales BOM), no POS. |
| Justificación | Nombre engaña. Bajo coste de refactor: solo `server.js` lo invoca. |
| Riesgo | MEDIO (impacto en `server.js` + tests) |
| Fase | 9 (opcional) |

## D-22 — DOMINIO 5 (POS) · B1 oficial unificado

| Campo | Valor |
|---|---|
| Dominio | ESQUEMAS-POS |
| Tipo | KEEP + MERGE |
| Decisión | Mantener `POST /api/recompute-simple/rebuild-schemes-circles-from-esquemas` como oficial paso 10. Fundir B2 (`generate-missing-esquema-pos`) y B3 (`/api/esquemas-pos/generate-one`) añadiendo flags `onlyMissing` y `id`. |
| Justificación | Las 3 variantes son combinaciones distintas de los mismos flags Python. |
| Riesgo | MEDIO (cambio en clientes que llaman a B2/B3) |
| Fase | 9 |

## D-23 — DOMINIO 5 (POS) · B4 batch con gating

| Campo | Valor |
|---|---|
| Dominio | ESQUEMAS-POS |
| Tipo | GATE |
| Decisión | `POST /api/apply-generate-batch` detrás de `SERVER_ENABLE_DANGEROUS_WRITE`. |
| Justificación | Loop sobre el script Python + escritura de overrides. Sin dryRun. |
| Riesgo | BAJO |
| Fase | 6 |

## D-24 — DOMINIO 5 (OVERRIDES) · C-todos oficiales/supported

| Campo | Valor |
|---|---|
| Dominio | ESQUEMAS-OVERRIDES |
| Tipo | KEEP |
| Decisión | Mantener `/api/apply-batch`, `/api/recompute-simple/manual-override-picker`, `scripts/normalize_manual_override_px.py`, `tools/manual_override_picker_server.py`. |
| Justificación | Funcionalmente complementarios. |
| Riesgo | BAJO |
| Fase | 4 |

---

## D-25 — DOMINIO 6 (EXPORT) · oficial

| Campo | Valor |
|---|---|
| Dominio | EXPORT |
| Tipo | KEEP |
| Decisión | Mantener `POST /export/run-wordpress`, `npm run export:wordpress`, GET `/export/*`. |
| Justificación | Pipeline oficial paso 12. |
| Riesgo | BAJO |
| Fase | 4 |

## D-26 — DOMINIO 6 (EXPORT) · 410 endpoints REMOVE

| Campo | Valor |
|---|---|
| Dominio | EXPORT |
| Tipo | REMOVE |
| Decisión | Eliminar las rutas: `POST /recompute-pdf-auto`, `POST /export/run-synthetic`, `POST /export/run-ai-conflicts`, `POST /export/run-all`, `POST /apply-qa-checks-filter`, `GET /pn/list`, `GET /pn/:sku`, `GET /pn/:sku/sources`. |
| Justificación | Devuelven 410 inline; no hay cliente que pueda usarlas. |
| Riesgo | BAJO |
| Fase | 5 |

## D-27 — DOMINIO 6 · synthetic legacy

| Campo | Valor |
|---|---|
| Dominio | EXPORT |
| Tipo | DEPRECATE |
| Decisión | Mantener `npm run legacy:generate:synthetic` + `generate_synthetic_exports.js` mientras `validate:field-refactor-final:exports` lo necesite. Tras FASE 7 evaluar eliminación. |
| Justificación | Útil para diff con pipeline semántico nuevo, pero su salida (`MILU_*_v506.json`) ya no se consume. |
| Riesgo | BAJO |
| Fase | 7 (decisión final) |

## D-28 — DOMINIO 6 · ai-conflicts y export-review legacy

| Campo | Valor |
|---|---|
| Dominio | EXPORT |
| Tipo | QUARANTINE |
| Decisión | Mover `legacy/export_complex_ai/scripts/*` a `legacy_quarantine/legacy_export_complex_ai/` (o mantener `legacy/` como ya está y simplemente eliminar los `npm run legacy:ai:conflicts` / `legacy:export:review` del `package.json`). |
| Justificación | Carpeta `legacy/` ya existe. Los npm scripts son la única vía de invocación. Eliminarlos del `package.json` cumple el objetivo sin mover archivos. |
| Riesgo | BAJO |
| Fase | 5 |

## D-29 — DOMINIO 6 · `exportacion.html` LEGACY

| Campo | Valor |
|---|---|
| Dominio | EXPORT |
| Tipo | DEPRECATE |
| Decisión | Marcar `exportacion.html` como `LEGACY_V102`. Verificar embed en `milu_shell.html` y migrar al `export_wordpress.html`. |
| Justificación | Reemplazada. |
| Riesgo | MEDIO |
| Fase | 7 |

---

## D-30 — DOMINIO 7 · scripts root revision-apply QUARANTINE

| Campo | Valor |
|---|---|
| Dominio | REVISION-APPLY |
| Tipo | QUARANTINE |
| Decisión | Mover `apply_revision_to_engines.js` (raíz) y `apply-bulk-revision-to-engine.js` (raíz) a `legacy_quarantine/js/`. |
| Justificación | Sin invocador conocido. La lógica viva está en `server/services/revision-apply.js`. |
| Riesgo | BAJO |
| Fase | 5 |

---

## D-31 — DOMINIO 8 · wrappers raíz QUARANTINE

| Campo | Valor |
|---|---|
| Dominio | ANALYZE-REBUILD |
| Tipo | QUARANTINE |
| Decisión | Mover los wrappers raíz a `legacy_quarantine/js/`: `analyze_missing_rebuild_rows.js`, `analyze_rebuild_field_coverage.js`, `compare_rebuild_vs_engine.js`. Los wrapper-only `analyze_rebuild_equivalence_causes.js` y `debug_rebuild_record_equivalence.js` requieren revisión: si tienen valor → mover a `scripts/`; si no → cuarentena. |
| Justificación | Duplicados con sus equivalentes en `scripts/`. |
| Riesgo | BAJO |
| Fase | 5 |

---

## Decisiones transversales (no asociadas a un único dominio)

## D-32 — `SERVER_ENABLE_DANGEROUS_WRITE` flag

| Campo | Valor |
|---|---|
| Dominio | seguridad |
| Tipo | GATE |
| Decisión | Implementar middleware que devuelva 403 cuando el flag no esté activo, para los endpoints listados con `DANGEROUS_WRITE` en `MILU_OFFICIAL_COMPONENTS.md` §7.1. |
| Justificación | Reduce el riesgo de bulk multi-engine accidental. |
| Riesgo | MEDIO (puede romper scripts CI/CLI si no exportan el flag) |
| Fase | 6 |

## D-33 — Política de backup centralizada

| Campo | Valor |
|---|---|
| Dominio | seguridad |
| Tipo | REFACTOR |
| Decisión | Extraer un helper `withBackup(filePath, fn)` único en `server/services/`. Sustituir las 5+ implementaciones inline. Implementar TTL de borrado de `.bak.*` antiguos. |
| Justificación | Hoy hay heterogeneidad: algunos endpoints crean backup, otros no, otros con timestamp distinto. |
| Riesgo | MEDIO |
| Fase | 6 |

## D-34 — Versión sincronizada

| Campo | Valor |
|---|---|
| Dominio | meta |
| Tipo | KEEP |
| Decisión | Igualar `version.json` (`1.03.001`) y `package.json.appVersion` (hoy `1.01.003`) al cierre de V1.03 a `1.03.000+`. |
| Justificación | Hallazgo del baseline. |
| Riesgo | BAJO |
| Fase | 10 (cierre) |

## D-35 — `package.json` legacy npm scripts

| Campo | Valor |
|---|---|
| Dominio | meta |
| Tipo | REMOVE |
| Decisión | Eliminar `legacy:ai:conflicts` y `legacy:export:review`. Mantener `legacy:generate:synthetic` mientras se necesite (D-27). |
| Justificación | Apuntan a `legacy/export_complex_ai/scripts/*` y son legacy. |
| Riesgo | BAJO |
| Fase | 5 |

## D-36 — Limpieza de raíz (basura clara)

| Campo | Valor |
|---|---|
| Dominio | meta |
| Tipo | REMOVE / QUARANTINE |
| Decisión | Mover/eliminar (con confirmación explícita del responsable): `tmp_*.json`, `tmp_*.csv`, `tmp_*.log`, `tmp_*.webp`, `tmp_pos_diag_000245/`, `diff_ad1737f0_server.txt`, `scan_results.txt`, `h`, `pdf_page_rows_preview_p13.json`, `df_104_MILU26_IMPORT_raw.json`, `import_result.log`, capturas en raíz, `.rar` de backup, backups `.bak.*` antiguos. |
| Justificación | Ruido de repo, sin invocadores. |
| Riesgo | BAJO (con confirmación) |
| Fase | 5 (con checklist) |

## D-37 — `__pycache__/` y `.gitignore`

| Campo | Valor |
|---|---|
| Dominio | meta |
| Tipo | REMOVE |
| Decisión | Verificar que `__pycache__/` está en `.gitignore` y eliminar del control de versiones si está trackeado. |
| Justificación | Higiene básica. |
| Riesgo | BAJO |
| Fase | 5 |

---

## Tabla resumen de decisiones por fase

| Fase | Decisiones |
|---|---|
| **5 — Cuarentena + REMOVE inertes** | D-10, D-26, D-28, D-30, D-31, D-35, D-36, D-37 |
| **6 — Gating** | D-03, D-06, D-13, D-17, D-23, D-32, D-33 |
| **7 — Unificación PDF + FINAL** | D-02, D-04, D-05, D-08, D-09, D-27, D-29 |
| **8 — Unificación HERMANOS + ESTADOS** | D-12, D-15, D-16 |
| **9 — Unificación ESQUEMAS** | D-21, D-22 |
| **4 — Ya consolidadas (ratificación)** | D-01, D-07, D-11, D-14, D-18, D-19, D-20, D-24, D-25 |
| **10 — Cierre V1.03** | D-34 |

## Reglas de aplicación

1. **No ejecutar ninguna decisión `REMOVE` sin antes haber ejecutado la migración del cliente** (frontend o CLI) que la usa, comprobada con humo manual o test smoke.
2. **`QUARANTINE` siempre antes de `REMOVE`**: nada se borra físicamente hasta haber pasado por `legacy_quarantine/` durante al menos una iteración.
3. **`GATE` antes que `REMOVE`** cuando el endpoint sigue siendo necesario en algunos escenarios pero no en otros.
4. **Cualquier decisión que cambie un endpoint o la firma de un script se documenta en `MILU_BASELINE_2026.md` como excepción a la congelación**, con fecha y autor.

## Pendiente de ratificación humana

Este documento es una **PROPUESTA**. Antes de FASE 5, el responsable funcional debe:

1. Confirmar las decisiones marcadas como ALTO riesgo (D-12, D-16).
2. Validar las decisiones diferidas a FASE 7 que requieren prueba funcional (D-05, D-08).
3. Aprobar los movimientos de FASE 5 (cuarentena de scripts y eliminación de 410).
