# MILU_DUPLICATED_DOMAINS — Dominios funcionales con múltiples implementaciones

> **FASE 4.5 / Objetivo 1** del Plan Maestro V1.03. Este documento identifica **todos los dominios funcionales con más de una implementación viva** y propone para cada uno qué se queda como `OFFICIAL_V103`, qué pasa a `LEGACY_V102` y qué pasa a `QUARANTINE_CANDIDATE`.
>
> **No** modifica código. **No** mueve archivos. Es la entrada para FASE 5–9.
>
> Hallazgos contrastados leyendo `server.js` y los scripts implicados.

## Convenciones

- Riesgo: BAJO / MEDIO / ALTO (según `MILU_WRITE_OPERATIONS.md`).
- Prioridad: **P1** (crítica, alto riesgo o alto impacto en bugs); **P2** (importante, deuda evidente); **P3** (limpieza).
- Se distingue entre **decisión cerrada** (puede ejecutarse en FASE 5) y **decisión diferida** (requiere FASE 7/8/9 con validación funcional).

---

## DOMINIO 1 — PDF (importación / aplicación / copia visual)

**Objetivo funcional**

Llevar la información presente en los manuales PDF (Book Preview, lectura visual de páginas) hacia los `engine_*.json`, creando primero un staging (`data/02-engine_rebuild/`) y/o aplicando directamente sobre los engines.

### Implementaciones detectadas

| ID | Implementación | Frontend | Endpoint | Script | Archivos modificados | Riesgo | Backup | DryRun |
|---|---|---|---|---|---|---|---|---|
| **A** | **REBUILD JS** (preview→rebuild) | recompute_simple (`IMPORTAR PDF`) | `POST /api/recompute-simple/rebuild-json` | `node:scripts/rebuild_engine_from_book_preview.js` (vía `runRebuildFromPreview`) | `data/02-engine_rebuild/engine_rebuild_*.json` (NO toca engine) | BAJO | ✗ (server marca `backupIgnored:true`, `engineFilesModified:false`) | ✓ |
| **B** | **APPLY PYTHON SINGLE** | analista_02 (`Apply PDF Preview`, modo single) | `POST /api/pdf-preview/apply-to-engine` con `engine=…` | `python:apply_book_preview_to_engine.py --book-preview … --engine … --write --overwrite` | `engine_*.json` (1 libro) | ALTO | ✗ | ✗ |
| **C** | **APPLY PYTHON ALL** | analista_02 (`Apply PDF Preview`, modo applyAll) | `POST /api/pdf-preview/apply-to-engine` sin `engine` | `python:apply_all_book_previews.py --write --overwrite` | `engine_*.json` (los 9) | ALTO | ✗ | ✗ |
| **D** | **VISUAL COPY single-id / single-file** | analista_02 (`Copy PDF read → PDF (backend)`) | `POST /recompute-pdf-auto-visual` | `node:scripts/qa_pdf_visual_copy.js` (`runVisualCopyComparison`) | `engine_*.json` (1 archivo, opcional 1 id) | MEDIO | ✓ | ✓ |
| **E** | **VISUAL COPY batch** | analista_02 (`Copy book` / `Copy PDF read → PDF (backend) batch`) | `POST /copy-pdf-to-pdf-all-books` | `node:scripts/qa_pdf_visual_copy.js` (`runPdfVisualCopyBatch`) | `engine_*.json` (subset o todos) | MEDIO | ✓ | ✓ (`writePdf=false`) |
| **F** | **COPY INLINE single-row** | analista_02 (`Copy current` frontend) | `POST /copy-pdf-to-pdf` | inline `applyCanonicalPdfCopyToRow` | `engine_*.json` (1 row) | BAJO | ✗ | ✗ |
| **G** | **PDF COMPARE v1** | (CLI) | n/a | `node:scripts/qa_pdf_compare.js` (npm `qa:pdf-compare[:write]`) | reportes + `engine_*.json` (con `--write-pdf`) | MEDIO | ✓ | ✓ |
| **H** | **PDF COMPARE v2** | (CLI manual, sin npm) | n/a | `node:scripts/qa_pdf_compare_v2.js` | desconocido (CLI manual) | ? | ? | ? |

### Problemas detectados

1. **Dos pipelines de "PDF → engine" que viven en paralelo**: el path JS (A) **no** modifica engines; el path Python (B/C) **sí** y siempre con `--write --overwrite` sin backup ni dryRun. El operador puede creer que está usando el path "moderno" y disparar el destructivo por error.
2. **Tres caminos de "copy PDF→PDF"**: D (single-id), E (batch), F (single-row). Aceptable como resoluciones distintas pero **F es inline en server.js** mientras D/E delegan a script — heterogeneidad.
3. **`qa_pdf_compare_v2.js` sin npm script**: invocación solo manual; no hay constancia de cuál sustituye a cuál.
4. **B y C carecen de `dryRun` y de backup**: imposible probar en seco antes de tocar los 9 engines.
5. La UI de `analista_02.html` tiene ~6 botones distintos relacionados con PDF (`Apply PDF Preview`, `Copy current`, `Copy book`, `Copy PDF read → PDF`, `Copy PDF read → PDF (backend)`, `Copy PDF read → Final`) — densidad alta, vocabulario inconsistente.

### Recomendación

| Implementación | Decisión |
|---|---|
| A — REBUILD JS | **OFFICIAL_V103** para "construir staging del rebuild". |
| B — APPLY PYTHON SINGLE | **OFFICIAL_V103** para "promocionar 1 libro a engine" (con FASE 7: añadir `--dry-run` y backup automático). |
| C — APPLY PYTHON ALL | **SUPPORTED_V103** + `DANGEROUS_WRITE` con flag (modo bulk a 9 engines). |
| D — VISUAL COPY single | **OFFICIAL_V103** para "copy PDF→PDF un libro / una fila". |
| E — VISUAL COPY batch | **SUPPORTED_V103** + `DANGEROUS_WRITE` con flag. Es D pero multi-archivo. |
| F — COPY INLINE single-row | **LEGACY_V102** — duplica D para una sola fila; eliminar tras FASE 7. |
| G — PDF COMPARE v1 | **SUPPORTED_V103**. |
| H — PDF COMPARE v2 | **LEGACY_V102 + QUARANTINE_CANDIDATE** salvo que FASE 7 confirme que sustituye a G; si lo hace, mover G a LEGACY y promover H. |

**Prioridad: P1** — alto impacto en bugs (memoria del repo confirma "coexistencia PDF" como sospechosa de ~80% de bugs).

**Estado: DOMINIO PENDIENTE** — la decisión final entre A+B y D requiere FASE 7.

---

## DOMINIO 2 — FINAL (cálculo de campos `*_final`)

**Objetivo funcional**

Resolver, para cada registro, el valor "final" de los campos clave (`pn_final`, `designation_final`, `measure_final`, etc.) aplicando reglas de prioridad GESA / PDF / SUST / BASE.

### Implementaciones detectadas

| ID | Implementación | Frontend | Endpoint | Script | Archivos modificados | Riesgo | Backup | DryRun |
|---|---|---|---|---|---|---|---|---|
| **A** | **FINAL_FIELDS_V1 inline (oficial moderno)** | analista_02 (`Copy PDF read → Final`) | `POST /copy-pdf-to-final-all-books` | inline `resolvePdfToFinalUpdatesForRow` con `FINAL_FIELDS_V1_MAPPINGS_BACKEND` | `engine_*.json` (subset o todos) | MEDIO | ✓ | ✗ |
| **B** | **DEPURACION offline (oficial CLI)** | (CLI) | n/a | `python:depuracion_json.py` (+ `add_final_fields.py`) | `engine_*.json` (todos), recálculo + normalización | MEDIO | ✗ | ✗ |
| **C** | **CALCULATE-FINAL-FIELDS legacy** | analista_02 (`Calculate final`) | `POST /calculate-final-fields` | `python:copy_gesa_fields_to_final.py` | `engine_*.json` | MEDIO | ✗ | ✗ |
| **D** | **COPY PDF→FINAL legacy** | (CLI manual) | n/a | `python:copy_pdf_fields_to_final.py` | `engine_*.json` | MEDIO | ? | ✗ |

### Problemas detectados

1. El endpoint **A** está marcado en código como `OFFICIAL` (literal: `"// OFFICIAL: aplica FINAL_FIELDS_V1 con prioridad simple A/B por campo."`) y vive **inline en server.js** con la matriz de mapeos.
2. **B** es el camino oficial **offline** (proceso de paso a JSON definitivos), reglas potencialmente más completas (collapse de espacios, normalización dimensiones).
3. **C** es legacy declarado y **invoca a `copy_gesa_fields_to_final.py`** que sólo cubre la copia GESA→_final (subconjunto de A).
4. **D** es huérfano: no aparece referenciado en ningún `.bat` ni en npm.
5. La matriz `FINAL_FIELDS_V1_MAPPINGS_BACKEND` está duplicada conceptualmente entre A (inline server) y B (Python). Deriva natural a divergencia.

### Recomendación

| Implementación | Decisión |
|---|---|
| A — `/copy-pdf-to-final-all-books` | **OFFICIAL_V103** (online). |
| B — `depuracion_json.py` | **OFFICIAL_V103** (offline / proceso de paso a JSON definitivos). Obligatorio mantener equivalencia funcional con A. FASE 7 debe definir la matriz canónica única. |
| C — `/calculate-final-fields` + `copy_gesa_fields_to_final.py` | **LEGACY_V102** → eliminar endpoint y script en FASE 5 (botón "Calculate final" de analista_02 también). |
| D — `copy_pdf_fields_to_final.py` | **QUARANTINE_CANDIDATE**. |

**Prioridad: P2**.

**Estado: DOMINIO RESUELTO** (decisión cerrada para C/D; A y B coexisten por diseño — online vs offline).

---

## DOMINIO 3 — HERMANOS (propagación entre apariciones del mismo PN)

**Objetivo funcional**

Cuando un PN aparece en varios libros, propagar el `qa_revision_estado`, `qa_revision_accion` y campos asociados a todas sus apariciones para mantener consistencia.

### Implementaciones detectadas

| ID | Implementación | Frontend | Endpoint | Script | Backup | DryRun | Tamaño handler |
|---|---|---|---|---|---|---|---|
| **A** | **RECOMPUTE-HERMANOS oficial** | recompute_simple (`Recalcular hermanos`) | `POST /api/recompute-simple/recompute-hermanos` | inline `applySiblingBulkUpdates(items, { dryRun, backup })` | ✓ (default `true`) | ✓ (default `false`) | ~120 líneas (escanea engines, agrupa por PN, llama al motor) |
| **B** | **PN-REVIEW SIBLINGS-BULK** | analista_02 (`Propagar hermanos`, `Propagar hermanos (libro)`) | `POST /pn-review/apply-siblings-bulk` | inline `applySiblingBulkUpdates(items, { dryRun: false, backup: false })` | ✗ (hardcoded `false`) | ✗ (hardcoded `false`) | ~15 líneas (delega directamente al motor) |

### Diferencias reales

- **Mismo motor interno**: ambos llaman a `applySiblingBulkUpdates`, sin variantes en la lógica de propagación.
- **A** **escanea** los engines para construir la lista `items` (1 entrada por PN único, con `current_id` y `current_engine_file`). Reporta `per_engine`.
- **B** **recibe** la lista `items` ya construida desde el cliente (validada por `validateSiblingBulkPayload`).
- **A** acepta `dryRun` y `backup`; **B** los fuerza a `false` cada llamada → mismo nivel de riesgo, peor postura.
- **A** devuelve 207 cuando hay errores parciales; **B** devuelve `ok: errors.length === 0` plano.

### Recomendación

| Implementación | Decisión |
|---|---|
| A — `/api/recompute-simple/recompute-hermanos` | **OFFICIAL_V103**. Único endpoint público de hermanos. |
| B — `/pn-review/apply-siblings-bulk` | **LEGACY_V102** + `DANGEROUS_WRITE` mientras se migra. Eliminar en FASE 8. Refactorizar `analista_02` para construir `items` y llamar a A (o si prefiere mantener la API "recibe items", hacer que A acepte un payload alternativo con items pre-armados). |

**Justificación**: mismo motor interno, A es más seguro (backup + dryRun configurables), A produce reporte completo `per_engine`, B nunca debería crearse así (forzando flags a false).

**Prioridad: P1** — `pn-review/apply-siblings-bulk` se invoca desde botones cotidianos sin red de seguridad.

**Estado: DOMINIO RESUELTO** (decisión clara, ejecución diferida a FASE 8).

---

## DOMINIO 4 — ESTADOS (`qa_revision_estado`, `qa_revision_accion`)

**Objetivo funcional**

Mantener correctamente sincronizados los campos `qa_revision_estado` (ok/pendiente) y `qa_revision_accion` (importar/eliminar/revisar/copia) en función de los errores QA del registro y de las decisiones del operador.

Aquí hay que distinguir tres responsabilidades distintas que el código mezcla:

- **A) CALCULAR ESTADOS** — derivar `estado` y `accion` desde `total_error`/heurísticas.
- **B) APLICAR ESTADOS** — escribir un `estado/accion` decidido por el operador (botones OK / Pendiente / Importar / Eliminar / Revisar / Copia).
- **C) PROPAGAR ESTADOS** — replicar la decisión a hermanos (cubierto en DOMINIO 3).

### Implementaciones detectadas

#### Sub-dominio A: CALCULAR

| ID | Implementación | Frontend | Endpoint | Script | Riesgo |
|---|---|---|---|---|---|
| A1 | **UPDATE-STATES oficial** | recompute_simple (`Recalcular estados`) | `POST /api/recompute-simple/update-states` | `node:scripts/update_revision_states.js` | MEDIO |
| A2 | **RECOMPUTE-QA-ERRORS** (efecto lateral) | recompute_simple, analista_02 | `POST /recompute-qa-errors` | inline `recomputeEngineErrors({ updateRevision: ?, forceRevision: ? })` | ALTO |
| A3 | **RECALCULATE-REVISION-STATUS** | analista_02 (`PDF Recompute revision`) | `POST /recalculate-revision-status` | inline loop sobre los 9 engines llamando `recomputeEngineErrors({ updateRevision: true, forceRevision: false, backup: true })` | ALTO |

#### Sub-dominio B: APLICAR

| ID | Implementación | Frontend | Endpoint | Riesgo |
|---|---|---|---|---|
| B1 | **APPLY-REVISION-TO-ENGINES** (bulk modo `revok`/`revempty`/`validate`/`review`/`discard`) | qa_milu, analista_02, qa_analista_registro | `POST /apply-revision-to-engines` | ALTO |
| B2 | **PN-REVIEW APPLY-DECISION (by sku)** | (consumo desde qa_milu/analista_02) | `POST /pn-review/:sku/apply-decision` | MEDIO |
| B3 | **PN-REVIEW APPLY-DECISION (by id)** | (consumo) | `POST /pn-review/by-id/:id/apply-decision` | MEDIO |
| B4 | **PN-REVIEW APPLY-VALUES** | (consumo) | `POST /pn-review/:sku/apply-values` | MEDIO |
| B5 | **SAVE-JSON puntual** | qa_milu, analista_02 (edición campo a campo) | `POST /save-json` | BAJO |

### Problemas detectados

**Calcular**:

- **A1** y **A3** se solapan parcialmente: A3 es básicamente "para los 9 engines, ejecuta `recomputeEngineErrors` con `updateRevision:true`"; A1 ejecuta `updateRevisionStates` en un script Node dedicado. La diferencia funcional **no es evidente** desde el nombre del endpoint.
- **A2** puede actualizar el estado como **efecto secundario** (si `updateRevision=true` en el payload). Triple punto de entrada para "calcular estados".

**Aplicar**:

- **B1** acepta múltiples modos en un mismo endpoint (`applyBulkQuickMode`) y aplica en bulk filtrado.
- **B2** y **B3** son endpoints especializados para 1 PN (por SKU o por ID) que escriben los mismos campos.
- **B4** sobreescribe valores de campos arbitrarios para todas las apariciones del PN.
- Tres formas de "aplicar a un PN una decisión": B1 con filtro PN, B2 por SKU, B3 por ID. Cliente elige sin criterio claro.

### Recomendación

#### CALCULAR

| Implementación | Decisión |
|---|---|
| **A1** `/api/recompute-simple/update-states` | **OFFICIAL_V103** (mantener; pertenece al pipeline numerado paso 7). |
| **A2** `/recompute-qa-errors` | **OFFICIAL_V103** (paso 6 ERRORES). Documentar formalmente que **no debe** usarse con `updateRevision:true` desde la UI; eso pertenece a A1. Posible refactor: separar el cálculo de errores del refresco de estados. |
| **A3** `/recalculate-revision-status` | **LEGACY_V102** + `DANGEROUS_WRITE`. Es un superset de A1 sin justificación clara. Eliminar en FASE 8 una vez confirmado que A1 cubre el caso "todos los engines". |

#### APLICAR

| Implementación | Decisión |
|---|---|
| **B1** `/apply-revision-to-engines` | **OFFICIAL_V103** + `DANGEROUS_WRITE`. Único punto bulk. |
| **B2** `/pn-review/:sku/apply-decision` | **OFFICIAL_V103**. Punto único "por PN". |
| **B3** `/pn-review/by-id/:id/apply-decision` | **SUPPORTED_V103**. Caso especial cuando solo hay un ID conocido (y no un SKU). Mantener pero documentar bien. |
| **B4** `/pn-review/:sku/apply-values` | **OFFICIAL_V103**. Función diferente (propaga valores de campos, no solo estado). Mantener separado. |
| **B5** `/save-json` | **OFFICIAL_V103**. Edición puntual de 1 campo, gobernada por whitelist. |

**Prioridad: P2** (B1 cubre el caso bulk; A3 es la duplicidad más clara).

**Estado: DOMINIO RESUELTO** para A3 (eliminar). Recomendación adicional: en FASE 8 considerar si A2 debe perder la capacidad de actualizar estado.

---

## DOMINIO 5 — ESQUEMAS (BOM, POS, overrides)

**Objetivo funcional**

Generar y mantener tres familias de imágenes y datos derivados:

- **A) ESQUEMAS GENERALES** — diagrama BOM por página/sub-grupo (`esquemas/*.png`).
- **B) ESQUEMAS POS** — círculos numerados sobre el esquema general (`esquemas_pos_circulos/*.webp`).
- **C) OVERRIDES** — coordenadas manuales para corregir matching POS (`rebuild_schemes_circles_manual_overrides.json`).

### Implementaciones detectadas

#### A) ESQUEMAS GENERALES

| ID | Implementación | Frontend | Endpoint | Script | Salida |
|---|---|---|---|---|---|
| A1 | **GENERATE-ONE BOM** | qa_milu (click esquema), recompute_simple | `POST /api/esquemas/generate-one` | `python:generate_esquema_pos.py` (¡nombre engaña!) | `esquemas/*.png` |
| A2 | **REBUILD-SCHEMES-BY-BOM** | recompute_simple (`Esquemas (BOM)`) | `POST /api/recompute-simple/rebuild-schemes-by-bom` | `python:rebuild_schemes_by_bom.py` | `esquemas/*.png`, `data/02-engine_rebuild/engine_rebuild_*.json` |
| A3 | **ASSETS** (efecto secundario) | recompute_simple (`ASSETS`) | `POST /api/recompute-simple/enrich-assets` | `python:rebuild_assets_for_record.py` | `esquemas/`, `esquemas_pos_circulos/`, `fotos_articulos/`, `engine_*.json` |

#### B) ESQUEMAS POS

| ID | Implementación | Frontend | Endpoint | Script | Salida |
|---|---|---|---|---|---|
| B1 | **REBUILD-SCHEMES-CIRCLES (oficial pipeline)** | recompute_simple (`Esquemas (POS) - Write`) | `POST /api/recompute-simple/rebuild-schemes-circles-from-esquemas` | `python:rebuild_schemes_circles_from_esquemas.py` (varios modos) | `esquemas_pos_circulos/*.webp`, `engine_*.json`, `manual_overrides.json` |
| B2 | **GENERATE-MISSING-POS** | recompute_simple (`Generate missing POS`) | `POST /api/recompute-simple/generate-missing-esquema-pos` | `python:rebuild_schemes_circles_from_esquemas.py` (modo `--all` / por engine + filtro) | idem |
| B3 | **GENERATE-ONE POS** | recompute_simple | `POST /api/esquemas-pos/generate-one` | `python:rebuild_schemes_circles_from_esquemas.py` | idem |
| B4 | **APPLY-GENERATE-BATCH** | recompute_simple (override picker workflow) | `POST /api/apply-generate-batch` | `python:rebuild_schemes_circles_from_esquemas.py` (loop) + upsert overrides | idem + `manual_overrides.json` |
| B5 | **NPM CLI** | (CLI) | n/a | `npm run qa:esquemas-pos:missing[:dry]` → mismo script Python | idem |

#### C) OVERRIDES

| ID | Implementación | Frontend | Endpoint | Script | Salida |
|---|---|---|---|---|---|
| C1 | **APPLY-BATCH overrides** | recompute_simple (override picker) | `POST /api/apply-batch` | inline (upsert) | `manual_overrides.json` |
| C2 | **MANUAL-OVERRIDE-PICKER** | recompute_simple (`Override picker manual`) | `POST /api/recompute-simple/manual-override-picker` | inline (URL builder) | READ-ONLY (devuelve URL+coords) |
| C3 | **NORMALIZE PX** | (CLI) | n/a | `python:scripts/normalize_manual_override_px.py` | `manual_overrides.json` |
| C4 | **MANUAL OVERRIDE PICKER SERVER** | (standalone tool) | n/a (puerto propio) | `python:tools/manual_override_picker_server.py` | n/a (servidor de UI auxiliar) |

### Problemas detectados

1. **Nombre engañoso**: `generate_esquema_pos.py` se usa para el dominio A (esquemas generales), no para B (POS). Riesgo de confusión y de futuras invocaciones erróneas.
2. **5 endpoints** invocan al mismo `rebuild_schemes_circles_from_esquemas.py` con variantes mínimas de argumentos (`--all`, `--engine`, `--id`, `--all-book`, `--write`, `--dry-run`, `--force-regenerate`, `--limit`, `--report`). Toda la diferencia entre B1, B2, B3 es la combinación de flags pre-armada.
3. **Solapamiento A3 / A1+A2+B1**: el botón `ASSETS` ejecuta `rebuild_assets_for_record.py` que internamente puede regenerar esquemas, fotos y POS — pero también existen los caminos individuales. No hay garantía de que los flujos converjan a la misma salida.
4. **Overrides**: C1 (upsert puntual desde UI) y C3 (normalización offline) coexisten con C4 (UI standalone). Aceptable pero **debe documentarse que C es derivado de B y no debe editarse manualmente fuera del flujo**.

### Recomendación

#### A) ESQUEMAS GENERALES

| Implementación | Decisión |
|---|---|
| A1 `/api/esquemas/generate-one` | **OFFICIAL_V103** (caso single). |
| A2 `/api/recompute-simple/rebuild-schemes-by-bom` | **OFFICIAL_V103** (caso bulk del pipeline paso 9). |
| A3 (vía `enrich-assets`) | **OFFICIAL_V103** del paso 4 ASSETS, **no** "esquemas". Documentar como tal. |

Renombrar `generate_esquema_pos.py` a `generate_esquema_general.py` (FASE 9, opcional, marca técnica).

#### B) ESQUEMAS POS

| Implementación | Decisión |
|---|---|
| B1 `/api/recompute-simple/rebuild-schemes-circles-from-esquemas` | **OFFICIAL_V103** del pipeline paso 10. Modo `--all` o por engine. |
| B2 `/api/recompute-simple/generate-missing-esquema-pos` | **LEGACY_V102** — en FASE 9, fundir con B1 añadiendo flag `onlyMissing:true`. Mientras tanto, mantener `SUPPORTED_V103`. |
| B3 `/api/esquemas-pos/generate-one` | **LEGACY_V102** — equivalente a B1 con `--engine X --id Y`. Eliminar en FASE 9. |
| B4 `/api/apply-generate-batch` | **OFFICIAL_V103** + `DANGEROUS_WRITE`. Caso especial: combina escritura de override con regeneración. Mantener pero gating. |
| B5 `npm qa:esquemas-pos:*` | **SUPPORTED_V103**. CLI directa, útil. |

#### C) OVERRIDES

| Implementación | Decisión |
|---|---|
| C1 `/api/apply-batch` | **OFFICIAL_V103**. |
| C2 `/api/recompute-simple/manual-override-picker` | **OFFICIAL_V103**. |
| C3 `scripts/normalize_manual_override_px.py` | **SUPPORTED_V103**. |
| C4 `tools/manual_override_picker_server.py` | **SUPPORTED_V103**. Tooling auxiliar, OK aislado. |

**Prioridad: P2** — duplicidad evidente pero el script Python es el mismo, no hay divergencia funcional silenciosa.

**Estado: DOMINIO RESUELTO** para A. **DOMINIO PENDIENTE** para B (FASE 9 debe materializar la fusión B1+B2+B3).

---

## DOMINIO 6 — EXPORT

**Objetivo funcional**

Generar el dataset que alimenta WordPress (importación + supersedidos) y, en menor medida, dejar los archivos preparados para FTP / GitHub Pages.

### Implementaciones detectadas

| ID | Implementación | Frontend | Endpoint | Script | Salida | Estado actual |
|---|---|---|---|---|---|---|
| **A** | **EXPORT-WORDPRESS oficial** | qa_milu (`Recalcular export WordPress`), export_wordpress (`Ejecutar export WP`), exportacion (`WordPress Job`) | `POST /export/run-wordpress` | `node:scripts/export_wordpress_milu.js` | `data/05-wordpress/milu_wp_import.json`, `milu_wp_superseded.json` | OFFICIAL |
| **B** | **EXPORT-WORDPRESS CLI** | (CLI) | n/a | `npm run export:wordpress` (mismo script) | idem | OFFICIAL |
| **C** | **EXPORT-WORDPRESS validate** | (CLI) | n/a | `npm run export:wordpress:validate` → `scripts/validate_wordpress_superseded_export.js` | reportes | SUPPORTED |
| **D** | **EXPORT preview/files/status/download** | export_wordpress | `GET /export/preview`, `/files`, `/file`, `/status`, `/download`, `/wordpress-decisions`, `/trace/:sku` | inline | READ-ONLY | OFFICIAL |
| **E** | **SYNTHETIC LEGACY** | (CLI) | n/a | `npm run legacy:generate:synthetic` → `generate_synthetic_exports.js` | `MILU_New_v506.json`, `MILU_Superseded_v506.json` | LEGACY |
| **F** | **AI CONFLICTS LEGACY** | (CLI) | n/a | `npm run legacy:ai:conflicts` → `legacy/export_complex_ai/scripts/ai_conflict_rules.js` | en `legacy/` | LEGACY |
| **G** | **EXPORT REVIEW LEGACY** | (CLI) | n/a | `npm run legacy:export:review` → `legacy/export_complex_ai/scripts/export_review_pipeline.js` | en `legacy/` | LEGACY |
| **H** | **EXPORT 410 endpoints** | (sin frontend) | `POST /export/run-synthetic`, `/export/run-ai-conflicts`, `/export/run-all` | inline 410 | n/a | REMOVE |
| **I** | **COMPARE EXPORT OUTPUTS** | (CLI) | n/a | `npm run validate:field-refactor-final:exports` → `python:scripts/compare_export_outputs.py` | reportes | SUPPORTED |
| **J** | **SIMULATE EXPORT SEMANTICS** | (CLI) | n/a | `python:scripts/simulate_export_semantics.py` | reportes | SUPPORTED |

### Problemas detectados

1. **Tres `npm run legacy:*`** declarados en `package.json` siguen ejecutables sin gating. `legacy:ai:conflicts` y `legacy:export:review` apuntan a `legacy/export_complex_ai/scripts/*` y son "exports antiguos" que ya no se generan en runtime.
2. Tres endpoints `410` (`run-synthetic`, `run-ai-conflicts`, `run-all`) ocupan rutas en `server.js` — `REMOVE_CANDIDATE`.
3. **`generate_synthetic_exports.js`**: legacy declarado pero con uso documentado para diff con el pipeline semántico nuevo (validación de regresión). Mantener mientras el `validate:field-refactor-final:exports` lo necesite. Eliminar tras FASE 7 si la validación se da por superada.
4. **`exportacion.html`** sigue presente. Reemplazado por `export_wordpress.html`. Verificar y mover a `LEGACY_V102` (ya hecho en `MILU_OFFICIAL_COMPONENTS.md`).

### Recomendación

| Implementación | Decisión |
|---|---|
| A — `/export/run-wordpress` | **OFFICIAL_V103** (paso 12). |
| B — `npm export:wordpress` | **OFFICIAL_V103** (CLI directa). |
| C — `validate_wordpress_superseded_export.js` | **SUPPORTED_V103**. |
| D — endpoints GET `/export/*` | **OFFICIAL_V103**. |
| E — synthetic legacy | **LEGACY_V102**. Mantener mientras `validate:field-refactor-final:exports` lo invoque; eliminar tras FASE 7. |
| F — AI conflicts | **LEGACY_V102**. Eliminar npm script y carpeta `legacy/export_complex_ai/scripts/` en FASE 5 si confirma que no se usa. |
| G — export review legacy | **LEGACY_V102**. Idem F. |
| H — endpoints 410 | **REMOVE_CANDIDATE**. Eliminar en FASE 5. |
| I — compare_export_outputs | **SUPPORTED_V103**. |
| J — simulate_export_semantics | **SUPPORTED_V103**. |

**Prioridad: P3** — sin impacto crítico, solo limpieza.

**Estado: DOMINIO RESUELTO**.

---

## DOMINIO 7 — REVISION-APPLY (servicios y scripts root duplicados)

**Objetivo funcional**

Aplicar cambios de revisión QA almacenados en `qa_revision_server_data.json` a los `engine_*.json` correspondientes.

### Implementaciones detectadas

| ID | Implementación | Frontend | Endpoint | Script | Estado |
|---|---|---|---|---|---|
| A | **revision-apply service** | qa_milu (botones bulk) | `POST /apply-revision-to-engines` | `server/services/revision-apply.js` (importado por server.js) | OFFICIAL |
| B | **apply_revision_to_engines.js (raíz)** | (sin invocador) | n/a | script raíz | ORPHAN |
| C | **apply-bulk-revision-to-engine.js (raíz)** | (sin invocador) | n/a | script raíz | ORPHAN |

### Recomendación

| Implementación | Decisión |
|---|---|
| A | **OFFICIAL_V103** + `DANGEROUS_WRITE`. |
| B | **QUARANTINE_CANDIDATE** (FASE 5). Verificar antes de cuarentenar que no esté invocado por `.bat` no detectado. |
| C | **QUARANTINE_CANDIDATE** (FASE 5). Idem. |

**Prioridad: P3**.

**Estado: DOMINIO RESUELTO**.

---

## DOMINIO 8 — ANÁLISIS DE REBUILD (wrappers raíz vs scripts oficiales)

**Objetivo funcional**

Diagnosticar diferencias entre `data/02-engine_rebuild/` y los `engine_*.json` activos.

### Implementaciones detectadas

| Wrapper raíz | Implementación oficial | Estado |
|---|---|---|
| [analyze_missing_rebuild_rows.js](../../analyze_missing_rebuild_rows.js) | [scripts/analyze_missing_rebuild_rows.js](../../scripts/analyze_missing_rebuild_rows.js) | duplicado |
| [analyze_rebuild_field_coverage.js](../../analyze_rebuild_field_coverage.js) | [scripts/analyze_rebuild_field_coverage.js](../../scripts/analyze_rebuild_field_coverage.js) | duplicado |
| [analyze_rebuild_equivalence_causes.js](../../analyze_rebuild_equivalence_causes.js) | (sin equivalente en `scripts/`) | wrapper-only |
| [compare_rebuild_vs_engine.js](../../compare_rebuild_vs_engine.js) | [scripts/compare_rebuild_vs_engine.js](../../scripts/compare_rebuild_vs_engine.js) | duplicado |
| [debug_rebuild_record_equivalence.js](../../debug_rebuild_record_equivalence.js) | (sin equivalente) | wrapper-only |

### Recomendación

| Implementación | Decisión |
|---|---|
| Wrappers raíz duplicados | **QUARANTINE_CANDIDATE** (FASE 5). Mantener `scripts/*`. |
| Wrapper-only (analyze_rebuild_equivalence_causes, debug_rebuild_record_equivalence) | **REVISAR**: o se mueven a `scripts/` o se cuarentenan según valor histórico. |

**Prioridad: P3**.

**Estado: DOMINIO RESUELTO** para los duplicados puros.

---

## Resumen ejecutivo de duplicidades

| Dominio | Implementaciones vivas | Reducción objetivo | Prioridad | Estado |
|---|---|---|---|---|
| 1. PDF | 8 | 5 (A, B, C-gated, D, E-gated; F a legacy, H a quarantine, G/H consolidar) | **P1** | PENDIENTE (FASE 7) |
| 2. FINAL | 4 | 2 (A online + B offline) | P2 | RESUELTO |
| 3. HERMANOS | 2 | 1 (A) | **P1** | RESUELTO (FASE 8) |
| 4. ESTADOS — calcular | 3 | 2 (A1 + A2) | P2 | RESUELTO (FASE 8) |
| 4. ESTADOS — aplicar | 5 | 4 (B1, B2, B4, B5; B3 supported) | P2 | RESUELTO |
| 5. ESQUEMAS | 11 | 7 (A1, A2, A3, B1, B4, B5, C-todos) | P2 | PARCIAL (FASE 9) |
| 6. EXPORT | 10 | 5 (A, B, C, D, I/J) | P3 | RESUELTO |
| 7. REVISION-APPLY scripts root | 3 | 1 (A) | P3 | RESUELTO |
| 8. ANALYZE wrappers root | 5 | 3 (en `scripts/`) | P3 | RESUELTO |

## Reglas finales

> **1 dominio funcional = 1 implementación oficial V1.03**.

Esta regla se cumple en todos los dominios EXCEPTO PDF (DOMINIO 1) — que tiene una división **legítima** entre "construir staging" (A) y "promocionar a engine" (B/C). FASE 7 debe ratificar o reformular esta división.

## Mapa de fases derivadas

- **FASE 5** (cuarentena): ejecuta las decisiones cerradas de DOMINIOS 2 (parcial), 4 (parcial), 6, 7, 8.
- **FASE 6** (gating): aplica `DANGEROUS_WRITE` a los flujos identificados en DOMINIOS 1, 3, 4, 5.
- **FASE 7** (PDF): cierra DOMINIO 1 + termina DOMINIO 2.
- **FASE 8** (HERMANOS): elimina B en DOMINIO 3 + A3 en DOMINIO 4.
- **FASE 9** (ESQUEMAS): consolida B1/B2/B3 en DOMINIO 5.
