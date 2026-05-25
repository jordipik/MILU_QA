# MILU V1 - Documentacion Consolidada del Proceso REBUILD

## Alcance y criterio documental

Este documento consolida el proceso REBUILD real de MILU V1 usando codigo, scripts, endpoints y comportamiento observado en el runtime local.

Reglas de este documento:

- Prioriza flujo real actual sobre flujo historico.
- Marca siempre OFFICIAL, LEGACY o ALTERNATIVE cuando coexistien varias rutas.
- Distingue runtime sobre `engine_*.json` del rebuild offline sobre `data/output/rebuild/engine_rebuild_<MODEL>.json`.
- No propone arquitectura futura salvo en la seccion `TODO explicito`.

## Fuentes consolidadas

Fuentes documentales base:

- `docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md`
- `docs_v2/00_overview/SCRIPT_MAP.md`
- `docs_v2/01_pipeline/pipeline_global.md`
- `docs_v2/01_pipeline/recompute_simple_flow.md`
- `docs_v2/02_pdf_import/import_pdf_flow.md`
- `docs_v2/02_pdf_import/apply_book_preview_to_engine.md`
- `docs_v2/02_pdf_import/book_preview_structure.md`
- `docs_v2/04_final_calculation/final_fields_v1.md`
- `docs_v2/06_error_system/recompute_errors.md`
- `docs_v2/07_revision_system/qa_revision_flow.md`
- `docs_v2/08_export/wordpress_export.md`
- `docs_v2/13_legacy/official_vs_legacy.md`
- `PROCESO_IMPORT_PDF_Y_APLICACION.txt`
- `README.md`

Fuentes de implementacion auditadas:

- `server.js`
- `js/import-pdf.js`
- `js/recompute-simple.js`
- `js/analista-02.js`
- `apply_book_preview_to_engine.py`
- `apply_all_book_previews.py`
- `recompute_engine_errors.js`
- `scripts/update_revision_states.js`
- `scripts/update_gesa_fields_from_excel.js`
- `scripts/update_sust_fields.js`
- `scripts/rebuild_engine_from_book_preview.js`
- `scripts/enrich_rebuild_with_gesa_sust.js`
- `scripts/enrich_rebuild_with_assets.js`
- `scripts/export_wordpress_milu.js`
- `depuracion_json.py`

## Validacion ejecutada en runtime local

Validaciones observadas en `http://localhost:3000` durante esta auditoria:

- `GET /health` -> `{ ok: true, service: "milu-save-backend" }`.
- `POST /api/recompute-simple/update-states` con `engine=12V4000M40A` -> `enginesProcessed=1`, `recordsProcessed=2769`, `importar=2666`, `eliminar=44`, `revisar=59`, `updated=0`.
- `POST /api/recompute-simple/update-gesa` en dry-run con `engine=12V4000M40A` -> `matchesGesa=2193`, `noEncontrados=576`, `registrosEscaneados=2769`, `registrosModificados=0`.
- `GET /qa_revision_sync.php` -> payload JSON con claves `meta` y `revisions`; `meta.rows=56091`.
- `GET /export/status` -> ultimo `run-wordpress` correcto, con `engines_processed=9`, `occurrences_processed=69958`, `pn_unique=5782`, `new=5041`, `superseded=727`, `pending=9`, `discard=5`.

---

## 1. Contexto general del REBUILD

En MILU hay dos acepciones operativas de "rebuild":

### 1.1 Runtime rebuild sobre `engine_*.json`

Es el pipeline operativo que reconstruye y consolida campos de trabajo dentro de los 9 `engine_*.json` que alimentan QA y export.

Artefactos y capas que intervienen:

- Entrada de extraccion PDF: `json_originales/book_preview_<MODEL>.json`.
- Persistencia principal: `engine_<MODEL>.json`.
- Campos reconstruidos desde PDF: `*_pdf`.
- Campos consolidados para QA/export: `*_final`.
- Campos de chequeo: `*_error`, `total_error`, `has_error`.
- Campos de revision QA: `qa_revision_estado`, `qa_revision_accion`.
- Campos de catalogo: GESA y SUST.
- Campos visuales: `filename_foto`, `ruta_foto`, `esquemas`, `esquemas_circulos`, `esquemas_circulos_all`, `ruta_esquemas_pos`, `exp_imagenes`.

Este flujo alimenta directamente:

- QA en `qa_milu.html`.
- revision remota via `qa_revision_sync.php`.
- export WordPress via `POST /export/run-wordpress`.

### 1.2 Offline rebuild sobre `data/output/rebuild/engine_rebuild_<MODEL>.json`

Es un pipeline separado, usado para reconstruccion controlada desde `book_preview`, enriquecimiento catalogal y enriquecimiento visual sin tocar `engine_*.json`.

Artefactos:

- `data/output/rebuild/engine_rebuild_<MODEL>.json`
- `data/output/rebuild/phase4_report_gesa_sust_<MODEL>.json`
- `data/output/rebuild/assets_report_<MODEL>.json`

Separacion garantizada por codigo:

- No modifica `engine_*.json`.
- No ejecuta export WordPress.
- Escribe solo en `data/output/rebuild/`.

### 1.3 Como encaja con QA y export

- QA runtime trabaja sobre `engine_*.json`.
- Export WordPress tambien trabaja sobre `engine_*.json`.
- El rebuild offline es una linea paralela de reconstruccion y enriquecimiento, util para rehacer desde cero y auditar equivalencias, pero no sustituye automaticamente al runtime actual.

---

## 2. Pipeline global real

Pipeline operativo real de runtime:

`PDF -> import_pdf.html -> book_preview_<MODEL>.json -> POST /api/pdf-preview/apply-to-engine -> *_pdf -> POST /copy-pdf-to-final-all-books -> *_final -> POST /recompute-qa-errors -> *_error -> POST /api/recompute-simple/update-states -> QA -> POST /export/run-wordpress`

### 2.1 Inputs reales

- PDF por motor cargado en `import_pdf.html`.
- `json_originales/book_preview_<MODEL>.json`.
- `engine_*.json`.
- `EXCEL_GESA2026.json`.
- `EXCEL_SUSTITUCION.json`.
- assets locales: `fotos_articulos/`, `esquemas/`, `esquemas_pos_circulos/`.
- snapshot de revision: `qa_revision_server_data.json`.

### 2.2 Outputs reales

- `engine_*.json` actualizados.
- `qa_revision_server_data.json`.
- artefactos WordPress en `data/output/wordpress/`.
- rebuild offline en `data/output/rebuild/`.

### 2.3 UIs y botones reales

`import_pdf.html`

- `extractBookBtn`
- `extractAllBooksBtn`

`recompute_simple.html`

- `btnImportPdf`
- `btnSust`
- `btnFinal`
- `btnErrors`
- `btnStatuses`
- `btnClearPdfFinal`

`analista_02.html` modal recompute

- `recomputeCopyBookBtn`
- `recomputeCalculateFinalBtn`
- `recomputeRunBtn`
- `recomputeRevisionStatusBtn`

### 2.4 Endpoints runtime oficiales

- `POST /api/pdf-preview/apply-to-engine`
- `POST /copy-pdf-to-final-all-books`
- `POST /recompute-qa-errors`
- `POST /api/recompute-simple/update-states`
- `GET /qa_revision_sync.php`
- `POST /qa_revision_sync.php`
- `POST /apply-revision-to-engines`
- `POST /export/run-wordpress`

### 2.5 Persistencia y backups por etapa

| Etapa | Persistencia | Backup real |
| --- | --- | --- |
| Apply preview PDF | `engine_*.json` | `engine_<MODEL>.json.bak.<ts>` cuando `--write` y hay cambios |
| GESA runtime | `engine_*.json` | `engine_<MODEL>.json.backup-gesa-<ts>` si escribe |
| SUST runtime | `engine_*.json` | `engine_<MODEL>.json.backup-sust-<ts>` si escribe |
| Final fields | `engine_*.json` | `engine_<MODEL>.json.backup.<Date.now()>` si `backup=true` |
| Recompute errors | `engine_*.json` | `engine_<MODEL>.json.backup` si cambia y `backup=true` |
| Update states | `engine_*.json` | `engine_<MODEL>.json.backup.<Date.now()>` si cambia y `backup=true` |
| Rebuild assets | `engine_rebuild_<MODEL>.json` | `engine_rebuild_<MODEL>.json.bak.<ts>` en `--write` |
| Rebuild GESA+SUST | `engine_rebuild_<MODEL>.json` | no crea backup explicito en el script auditado |

### 2.6 Validaciones reales en UI

- `recompute_simple.html` ignora ID puntual para Import PDF, GESA/SUST y Final.
- `recompute_simple.html` usa `scope=all|book|current` para errores.
- `recompute_simple.html` usa `engine + id + backup` para estados.
- Para `ALL` en estados, la UI desactiva backup para evitar `ENOSPC` por copias masivas.

---

## 3. Import PDF

### 3.1 Flujo real de extraccion

`import_pdf.html` usa `js/import-pdf.js`.

Funcion principal:

- `extractWholeBook(bookOverride = null)`.

Comportamiento real:

1. Carga el PDF del motor y determina `pages_total`.
2. Lee opcionalmente rango `bookPageFromInput` y `bookPageToInput`.
3. Recorre cada pagina con `loadPdfWithPage(book, p)`.
4. Ejecuta deteccion visual y extraccion por pagina.
5. Compone `pages[]` con filas normalizadas.
6. Descarga `book_preview_<MODEL>.json` en el navegador.

Payload real generado:

- raiz: `book`, `generated_at`, `pages_total`, `range_from`, `range_to`, `pages_processed`, `pages_with_rows`, `rows_total`, `warnings_total`, `cancelled`, `pages`
- por pagina: `source_page`, `rows_count`, `rows_with_pn`, `warnings_count`, `rows`
- por fila: `source_page`, `row_index`, `pos_pdf`, `pn_pdf`, `designation_pdf`, `model_type_pdf`, `qty_pdf`, `units_pdf`, `weight_pdf`, `fn_pdf`, `measure_pdf`, `norma_pdf`, `bom_pdf`, `fg_fgs_pdf`, `confidence`, `warnings`

### 3.2 Artefacto oficial puente

OFFICIAL:

- `json_originales/book_preview_<MODEL>.json`

Es el artefacto puente oficial entre OCR/lectura PDF y enrich del engine runtime o rebuild offline.

### 3.3 Apply preview oficial al engine

OFFICIAL runtime:

- `POST /api/pdf-preview/apply-to-engine`

Por libro:

- backend ejecuta `apply_book_preview_to_engine.py --book-preview <preview> --engine <engine> --write --overwrite --report <tmp>`

En lote:

- backend ejecuta `apply_all_book_previews.py --write --overwrite --report <tmp>`

Respuesta real del endpoint:

- `ok`
- `exitCode`
- `script`
- `engine`
- `preview`
- `stats`
- `not_found_rows`
- `action_required_conflicts`
- `applied_manual_decisions`
- `warnings`
- `stdout`
- `stderr`

### 3.4 Matching real

Orden real de matching en `apply_book_preview_to_engine.py`:

1. Principal: `(Source Page, POS)`.
2. Si hay varios candidatos con misma pagina y POS: desempate por PN usando `pn_pdf`, `PART NO.`, `pn_final`, `pn_excel` del engine.
3. Si el preview no trae POS: fallback `(Source Page, PN)` solo si hay candidato unico.
4. Si falla `(page,pos)` pero existe PN: fallback de compatibilidad `(Source Page, PN)` como `page-pn-pos-mismatch` si es unico.

Estados de match reales que reporta el script:

- `unique`
- `tiebreak-pn`
- `page-pn`
- `page-pn-pos-mismatch`
- `ambiguous`
- `not-found`
- `ambiguous-all-equal`
- `ambiguous-manual-id`

### 3.5 Ambiguedades y decisiones manuales

El script distingue duplicados equivalentes y duplicados no equivalentes.

Casos:

- Si todos los candidatos ambiguos son equivalentes segun `DUPLICATE_EQUIVALENCE_FIELDS`, aplica a todos (`matched_ambiguous_all_equal`).
- Si no son equivalentes, genera `action_required_conflicts`.
- La UI puede reenviar `conflictDecisions` con accion `apply-id` sobre un `target_id` concreto.
- El backend persiste esas decisiones en un JSON temporal y reejecuta el apply.

### 3.6 `not_found` y diagnostico

`not_found` no significa fallo de escritura.

Significa que una fila de preview no encontro match confiable en el engine.

Motivos observables en el script:

- `other`
- `missing-pos`
- `missing-pos-no-pn-match`
- `no-engine-match`
- `no-pos-match-page-pn-no-match`

### 3.7 OFFICIAL vs LEGACY vs ALTERNATIVE en Import PDF

| Flujo | Ruta / script | Estado |
| --- | --- | --- |
| Apply preview runtime | `POST /api/pdf-preview/apply-to-engine` + `apply_book_preview_to_engine.py` / `apply_all_book_previews.py` | OFFICIAL |
| Copia batch historica `_pdf` | `POST /copy-pdf-to-pdf-all-books` | LEGACY / ALTERNATIVE |
| Recompute PDF auto | `POST /recompute-pdf-auto` | LEGACY DESACTIVADO (410) |
| Recompute PDF visual | `POST /recompute-pdf-auto-visual` | ALTERNATIVE |

---

## 4. Generacion de campos `_final`

### 4.1 Endpoint oficial

OFFICIAL:

- `POST /copy-pdf-to-final-all-books`

LEGACY coexistente:

- `POST /calculate-final-fields`

### 4.2 Contrato real del endpoint oficial

Payload soportado:

- `{ file?, files?, backup? }`

No soporta ID puntual.

Si no se indica `file/files`, procesa los 9 engines.

Respuesta real:

- `ok`
- `official: true`
- `result.files`
- `result.backup`
- `result.totals.filesProcessed`
- `result.totals.filesWritten`
- `result.totals.scannedRows`
- `result.totals.changedRows`
- `result.totals.updatedFields`
- `result.perFile[]`

### 4.3 Reglas reales `FINAL_FIELDS_V1_MAPPINGS_BACKEND`

Prioridad auditada por campo:

| Campo final | Prioridad real |
| --- | --- |
| `pos_final` | `pos_pdf` -> `POS` |
| `pn_final` | `pn_pdf` -> `PART NO.` |
| `designation_final` | `designation_gesa` -> `designation_pdf` |
| `model_type_final` | `model_type_pdf` -> `MODEL/TYPE` |
| `qty_final` | `qty_pdf` -> `QTY` |
| `units_final` | `units_pdf` -> `UNITS` |
| `weight_final` | `weight_gesa + units` -> `weight_pdf` |
| `fn_final` | `fn_pdf` |
| `measure_final` | `dimensions_gesa` -> `measure_pdf` |
| `norma_final` | `norma` -> `norma_pdf` |
| `fg_fgs_final` | `fg_fgs_pdf` -> `FG/FGS` |
| `bom_final` | `bom_pdf` -> `BOM-No.` |
| `nsn_final` | `nsn` |
| `normalizado_final` | `normalizado` |
| `gesa_final` | `gesa` |
| `sust_status_final` | `sust_status` |
| `hierarchie_final` | `sust_hierarchie` |
| `new_pn_final` | `sust_new_part_number` |
| `subst_pnlist_final` | `sust_superseded_list` |

### 4.4 Reglas especiales reales

`designation_final`

- En `depuracion_json.py`, si `designation_gesa` y `designation_pdf` son equivalentes tras normalizacion, conserva el formato PDF.
- Si no son equivalentes, prioriza GESA.

`weight_final`

- Prioriza siempre `weight_gesa + units`.
- Si no existe, usa `weight_pdf` o `WEIGHT` segun el flujo.

`measure_final`

- El proceso offline `depuracion_json.py` limpia espacios multiples.
- Regla oficial del repo: priorizar `dimensions_gesa`; si no existe, usar `MEASUREMENT / STANDARD`.
- `measurement_final` deja de persistirse en `depuracion_json.py`; el campo estable es `measure_final`.

### 4.5 Cuado escribe y como

- Solo escribe si el valor final efectivo cambia.
- Si `backup=true`, crea backup timestamp antes de escribir.
- Hace `stripLegacyQaFields` antes de persistir.

### 4.6 Legacy de final fields

`POST /calculate-final-fields`:

- ejecuta `copy_gesa_fields_to_final.py`
- responde con `legacy: true`
- se mantiene solo como compatibilidad historica

No es la referencia DOC V2 del flujo runtime.

---

## 5. Recompute errors

### 5.1 Endpoint oficial

- `POST /recompute-qa-errors`

Motor real:

- `recompute_engine_errors.js`

### 5.2 Scopes reales

Payload validado en `server.js`:

- `scope=current|book|all`
- `file` requerido salvo `scope=all`
- `id` permitido solo en `scope=current`
- `dryRun`
- `updateRevision`
- `forceRevision`
- `backup`

Restricciones reales:

- `scope=all` no admite `id`.
- `scope=book` fuerza `id=''`.

### 5.3 Que recalcula

Por fila recalcula:

- `pos_error`
- `pn_error`
- `designation_error`
- `model_type_error`
- `qty_error`
- `units_error`
- `weight_error`
- `fn_error`
- `measure_error`
- `fg_fgs_error`
- `bom_error`
- `norma_error`
- `total_error`
- `has_error`

### 5.4 Reglas de comparacion reales

Resumen real de `QA_FIELD_CHECKS`:

- `POS`, `PART NO.`, `FG/FGS`, `BOM-No.` comparan `final` contra `pdf` si el `pdf` existe.
- `DESIGNATION`, `WEIGHT`, `MEASUREMENT / STANDARD`, `NORMA` aceptan coincidencia con PDF o con GESA segun el campo.
- `FN` usa comparacion por tokens (`isFnCompareMatch`), no solo igualdad literal.
- `MODEL/TYPE`, `QTY`, `UNITS` toleran vacios en ambos lados.

### 5.5 Resultado real

Respuesta por libro o global:

- `scanned`
- `changedRows`
- `okRows`
- `koRows`
- `wroteFile` / `wroteFiles`
- `errorsFound`
- `errorTypeCounts`
- `ruleSummary`

### 5.6 Relacion con QA

`POST /recompute-qa-errors` modifica QA solo cuando `updateRevision=true`.

Regla real en `recompute_simple.html`:

- el paso ERRORES se lanza con `updateRevision=false`
- por tanto recalcula `*_error`, `total_error`, `has_error`
- pero no cambia `qa_revision_estado/accion`

### 5.7 Cuando si cambia QA

Si `updateRevision=true`:

- filas con ruido/footer (`criterio_pn=C_NOISE_FOOTER` o `status=NOISE`) -> `ok/eliminar`
- filas con errores -> `pendiente/revisar`, salvo registros ya marcados manualmente como `ok` o `revisado`, excepto si `forceRevision=true`
- filas sin errores -> `ok/importar`

### 5.8 Dry-run y backup

- `dryRun=true` no escribe.
- `backup=true` crea `engine_<MODEL>.json.backup` si hay cambios.

---

## 6. Recompute states

### 6.1 Endpoint oficial recomendado

- `POST /api/recompute-simple/update-states`

Script real:

- `scripts/update_revision_states.js`

Endpoint coexistente:

- `POST /recalculate-revision-status`

### 6.2 Reglas reales de estado/accion

En `scripts/update_revision_states.js`:

- Si `fn_final == KE` -> `qa_revision_estado=ok`, `qa_revision_accion=eliminar`
- Si `total_error > 0` o `has_error=true` -> `qa_revision_estado=pendiente`, `qa_revision_accion=revisar`
- Si no hay errores -> `qa_revision_estado=ok`, `qa_revision_accion=importar`

### 6.3 Contrato real

Payload:

- `engine=<MODEL|ALL>`
- `id=''|<ID>`
- `backup=true|false`

Restricciones:

- `engine=ALL` no admite `id`

Respuesta real:

- `ok`
- `enginesProcessed`
- `recordsProcessed`
- `updated`
- `importar`
- `eliminar`
- `revisar`
- `unchanged`
- `errors[]`

### 6.4 Comportamiento observado

Validacion ejecutada:

- `POST /api/recompute-simple/update-states` para `12V4000M40A` devolvio `recordsProcessed=2769`, `importar=2666`, `eliminar=44`, `revisar=59`, `updated=0`.

### 6.5 Relacion con recompute errors

- `recompute_simple.html` los separa en dos pasos.
- Primero se recalculan errores.
- Luego se recalculan estados.
- Esto evita mezclar chequeo tecnico con snapshot QA.

### 6.6 Persistencia y riesgos

- Si hay cambios y `backup=true`, crea `engine_<MODEL>.json.backup.<Date.now()>`.
- Para alcance `ALL`, la UI ejecuta con `backup=false` por riesgo real de `ENOSPC`.
- Si un motor falla, el endpoint puede devolver `207` con `errors[]`.

### 6.7 Endpoint coexistente

`POST /recalculate-revision-status`:

- recorre todos los engines
- llama internamente `recomputeEngineErrors(... updateRevision=true, backup=true)`
- no ofrece control fino por engine/ID

DOC V2 toma como referencia principal `POST /api/recompute-simple/update-states`.

---

## 7. Enrichment GESA + SUST

### 7.1 GESA runtime

Script base:

- `scripts/update_gesa_fields_from_excel.js`

Fuente:

- `EXCEL_GESA2026.json`

Campos realmente escritos:

- `gesa`
- `designation_gesa`
- `nsn`
- `norma`
- `normalizado`
- `dimensions_gesa`
- `weight_gesa`
- `units`

Regla real de matching:

- match exacto `PART NUMBER == pn_final`

Si no hay match:

- `gesa='NO'`
- se vacian `designation_gesa`, `nsn`, `norma`, `dimensions_gesa`, `weight_gesa`
- `normalizado='NO'`

### 7.2 Endpoint runtime GESA

Observado operativo en runtime:

- `POST /api/recompute-simple/update-gesa`

Comportamiento observado por validacion dry-run:

- `engine=12V4000M40A`
- `registrosEscaneados=2769`
- `matchesGesa=2193`
- `noEncontrados=576`

Nota de trazabilidad:

- la UI `recompute_simple.html` y el backend en ejecucion usan este endpoint
- pero la ruta no quedo localizada en el `server.js` auditado mediante busqueda textual directa
- por tanto el endpoint debe considerarse operativo, pero con gap de trazabilidad documental en el codigo fuente auditado

### 7.3 SUST runtime

Script base:

- `scripts/update_sust_fields.js`

Fuente:

- `EXCEL_SUSTITUCION.json`

Campos realmente escritos:

- `sust_status`
- `sust_hierarchie`
- `sust_new_part_number`
- `sust_superseded_list`

### 7.4 Reglas reales SUST

Matching por PN:

- primero intenta `pn_final` como `New Part Number`
- si hay varias filas, prioriza `Hierarchie == New`; si no, toma la primera por `Seq no` o por orden de origen
- si no matchea como `New`, intenta `pn_final` como `Superseded Part Number`

Salidas:

- match como `New` -> `sust_status='SI'`, `sust_hierarchie=<hierarchie>`, `sust_new_part_number=<pn nuevo>`, `sust_superseded_list=<lista de superseded para ese new>`
- match como `Superseded` -> `sust_status='SI'`, `sust_hierarchie='Superseded'`, `sust_new_part_number=<new part>`, `sust_superseded_list=<lista del new>`
- sin match -> `sust_status='NO'`, resto `null`

### 7.5 Relacion con FINAL_FIELDS_V1

`POST /copy-pdf-to-final-all-books` expone estos campos finales:

- `gesa_final`
- `sust_status_final`
- `hierarchie_final`
- `new_pn_final`
- `subst_pnlist_final`

Y usa valores GESA para:

- `designation_final`
- `measure_final`
- `weight_final`
- `norma_final`
- `nsn_final`
- `normalizado_final`

### 7.6 Relacion con QA y export

- GESA no decide QA por si solo.
- SUST tampoco decide QA por si solo.
- Export si utiliza SUST para separar `new` y `superseded` dentro de los PNs exportables.

### 7.7 Version rebuild offline

Sobre `engine_rebuild_<MODEL>.json` el script oficial es:

- `scripts/enrich_rebuild_with_gesa_sust.js`

Caracteristicas reales:

- usa las mismas fuentes `EXCEL_GESA2026.json` y `EXCEL_SUSTITUCION.json`
- escribe tambien flags `existeix_gesa`, `existeix_sust_new`, `existeix_sust_old`
- no toca `engine_*.json`
- en el script auditado no crea backup explicito antes de escribir

---

## 8. Assets / imagenes / esquemas

### 8.1 Fuentes reales

- `fotos_articulos/`
- `esquemas/`
- `esquemas_pos_circulos/`

El documento base de rebuild offline usa:

- `scripts/enrich_rebuild_with_assets.js`

### 8.2 Campos reales generados

- `filename_foto`
- `ruta_foto`
- `esquemas`
- `esquemas_circulos`
- `esquemas_circulos_all`
- `ruta_esquemas_pos`
- `exp_imagenes`
- auxiliares: `page4`, `pages`, `book_set`, `libro_pag`

### 8.3 Naming real

Fotos:

- indexadas por PN usando el basename del archivo en `fotos_articulos/`
- prioridad de extension: `.jpeg`, `.jpg`, `.png`, `.webp`

Esquemas base:

- patron `BOOK-PAGE4-<n>.png`
- se agrupan por pagina de 4 digitos (`page4`)

Esquemas con circulos por posicion:

- patron `BOOK-PAGE4-<n>-<POS>.webp`
- indice por `page4|pos`

### 8.4 Derivacion real de rutas WordPress

En `scripts/enrich_rebuild_with_assets.js`:

- `ruta_foto = <wp_fotos_base>/filename_foto`
- `ruta_esquemas_pos = <wp_esquemas_base>/esquemas_circulos`

Bases por defecto del script:

- fotos -> `.../uploads/2026/01`
- esquemas pos -> `.../uploads/2026/02`

Esto materializa la separacion operativa `/01` y `/02`.

### 8.5 Seleccion real

- `filename_foto` se toma por PN.
- `esquemas` guarda todas las coincidencias de pagina, separadas por ` , ` si hay varias.
- `esquemas_circulos` toma la primera coincidencia por `page4|pos`.
- `esquemas_circulos_all` guarda todas las coincidencias por `page4|pos`.

### 8.6 `exp_imagenes`

En runtime final, `depuracion_json.py` aplica esta regla:

- prioridad 1: `ruta_foto`
- prioridad 2: `ruta_esquemas_pos`
- si existen ambas, concatena `foto, esquema`
- si no existe ninguna, usa `DEFAULT_EXP_IMAGENES`

En rebuild assets el script genera:

- `exp_imagenes = [ruta_foto, ruta_esquemas_pos].join(', ')` filtrando vacios

### 8.7 Fallback sin imagen

- si no hay foto, `filename_foto` y `ruta_foto` quedan `null`
- si no hay esquema pos, `ruta_esquemas_pos` queda `null`
- `exp_imagenes` puede quedar vacio en rebuild o resolverse a default en `depuracion_json.py`

### 8.8 Relacion con export visual

`scripts/export_wordpress_milu.js` consume:

- `ruta_foto`
- `ruta_esquemas_pos` via alias `exp_imagenes`

La UI de QA y export tambien visualiza estos campos.

---

## 9. QA y export

### 9.1 Persistencia QA

Revision remota/local:

- `GET /qa_revision_sync.php`
- `POST /qa_revision_sync.php`

Persistencia en disco:

- `qa_revision_server_data.json`

Comportamiento observado:

- el endpoint responde JSON real con estructura `meta + revisions`
- validacion ejecutada: `meta.rows=56091`

### 9.2 Aplicacion a engines

- `POST /apply-revision-to-engines`

Se usa para llevar decisiones de revision desde el snapshot a `engine_*.json`.

### 9.3 Regla real de export

Endpoint oficial:

- `POST /export/run-wordpress`

Script real:

- `scripts/export_wordpress_milu.js`

Decision principal por PN:

1. Si el PN tiene alguna fila `ok/importar` -> se exporta.
2. Si el PN exportable tiene marca de superseded -> cae a `superseded`; si no -> `new`.
3. Si no tiene import pero tiene `pendiente/revisar` -> `pending`.
4. Si no tiene import ni pending y si tiene `ok/eliminar` -> `discarded`.

### 9.4 QA manda sobre export

El script agrupa por PN y decide segun QA humana, no segun score tecnico.

Campos usados directamente:

- `qa_revision_estado`
- `qa_revision_accion`

Soporte SUST:

- si un PN es exportable y `getExportType(row) === 'superseded'`, se va al lote `superseded`

### 9.5 Outputs reales

`data/output/wordpress/`:

- `milu_wp_import.csv`
- `milu_wp_superseded.csv`
- `milu_wp_pending.csv`
- `milu_wp_discarded.csv`
- `milu_wp_import.json`
- `milu_wp_superseded.json`
- `milu_wp_pending.json`
- `milu_wp_discarded.json`
- `milu_wp_trace.json`
- `milu_wp_export_summary.md`
- `milu_wp_export_report.json`

### 9.6 Endpoints de lectura export

- `GET /export/status`
- `GET /export/preview`
- `GET /export/wordpress-decisions`
- `GET /export/files`
- `GET /export/file`
- `GET /export/download`

### 9.7 Estado observado del export

`GET /export/status` mostro ultimo `run-wordpress` correcto con:

- `engines_processed=9`
- `occurrences_processed=69958`
- `pn_unique=5782`
- `new=5041`
- `superseded=727`
- `pending=9`
- `discard=5`

---

## 10. OFFICIAL vs LEGACY

| Flujo | OFFICIAL | LEGACY / ALTERNATIVE | Estado operativo |
| --- | --- | --- | --- |
| Import PDF apply | `POST /api/pdf-preview/apply-to-engine` | `/copy-pdf-to-pdf-all-books`, `/recompute-pdf-auto-visual` | Oficial estable |
| PDF auto historico | no | `POST /recompute-pdf-auto` | Desactivado, 410 |
| Final fields | `POST /copy-pdf-to-final-all-books` | `POST /calculate-final-fields` | Coexistencia, oficial claro |
| Recompute errors | `POST /recompute-qa-errors` | n/a | Oficial estable |
| Recompute states | `POST /api/recompute-simple/update-states` | `POST /recalculate-revision-status` | Coexistencia; recomendado el primero |
| GESA runtime | `POST /api/recompute-simple/update-gesa` observado + `scripts/update_gesa_fields_from_excel.js` | no ruta legacy equivalente relevante | Operativo con gap de trazabilidad |
| SUST runtime | `POST /api/recompute-simple/update-sust` | n/a | Oficial operativo |
| Revision sync | `GET/POST /qa_revision_sync.php` | PHP legacy servido por Express local | Oficial operativo |
| Aplicacion revision | `POST /apply-revision-to-engines` | n/a | Oficial operativo |
| Export WordPress | `POST /export/run-wordpress` | `run-synthetic`, `run-ai-conflicts` | Oficial estable; legacy 410 |
| Rebuild base offline | `scripts/rebuild_engine_from_book_preview.js` | n/a | Oficial offline |
| Rebuild enrich GESA/SUST | `scripts/enrich_rebuild_with_gesa_sust.js` | n/a | Oficial offline |
| Rebuild assets | `scripts/enrich_rebuild_with_assets.js` | n/a | Oficial offline |

---

## 11. Problemas conocidos

### 11.1 Matching y `not_found`

- `not_found` es normal cuando no existe match fiable entre preview y engine.
- filas sin `POS` dependen del fallback `page+PN`.
- si el mismo `page+POS` tiene duplicados no equivalentes, se requiere decision manual.

### 11.2 `page-pos mismatch`

- existe el estado `page-pn-pos-mismatch`.
- significa que el match principal por `(page,pos)` fallo, pero el fallback `(page,pn)` fue unico.
- es util, pero implica menor confianza que el match principal.

### 11.3 Overwrite de `_pdf`

- el apply oficial se ejecuta con `--overwrite` desde backend.
- puede reemplazar `_pdf` no vacios.
- esto es intencional en el flujo oficial, pero debe asumirse como destructivo sobre `_pdf` previos.

### 11.4 Persistencia JSON en disco

- no hay base de datos transaccional.
- el sistema depende de escrituras sobre JSON en disco.
- backups existen, pero no todos los flujos usan la misma estrategia.

### 11.5 Coexistencia legacy

- siguen coexistiendo endpoints y flujos heredados.
- esto introduce riesgo de usar botones o rutas que no son la referencia documental.

### 11.6 Gaps de trazabilidad

- `POST /api/recompute-simple/update-gesa` esta operativo y referenciado por UI, pero su handler no quedo localizado textualmente en la lectura auditada de `server.js`.
- esto no cuestiona su operatividad observada, pero si deja una deuda de trazabilidad fuente -> runtime.

### 11.7 Dependencia visual del OCR/PDF

- la calidad de `book_preview` depende de deteccion visual por pagina.
- puede generar warnings, headers mal detectados, filas `other`, o baja confianza.

### 11.8 Inconsistencias historicas

- coexisten `measure_final` y referencias antiguas a `measurement_final`.
- coexisten rutas runtime, scripts offline y procesos legacy de depuracion.
- rebuild offline y runtime actual no son aun una sola linea unica de verdad.

### 11.9 Espacio en disco para backups

- en estados sobre `ALL`, ya se detecto riesgo real de `ENOSPC`.
- la UI lo mitiga lanzando sin backup en ese alcance.

---

## 12. Estado operativo actual

### 12.1 Flujo oficial hoy

Flujo runtime oficial hoy:

1. generar `book_preview_<MODEL>.json` desde `import_pdf.html`
2. aplicar preview con `POST /api/pdf-preview/apply-to-engine`
3. actualizar GESA y SUST desde catalogos
4. calcular `*_final` con `POST /copy-pdf-to-final-all-books`
5. recalcular errores con `POST /recompute-qa-errors`
6. recalcular estados con `POST /api/recompute-simple/update-states`
7. sincronizar y aplicar revision QA
8. exportar con `POST /export/run-wordpress`

### 12.2 Paginas UI operativas

- `qa_milu.html`
- `import_pdf.html`
- `recompute_simple.html`
- `analista_02.html`
- `exportacion.html`

`recompute_simple.html` es el orquestador operativo mas claro del pipeline actual.

### 12.3 Endpoints estabilizados

Estables y documentables como referencia:

- `GET /health`
- `POST /api/pdf-preview/apply-to-engine`
- `POST /copy-pdf-to-final-all-books`
- `POST /recompute-qa-errors`
- `POST /api/recompute-simple/update-states`
- `GET/POST /qa_revision_sync.php`
- `POST /apply-revision-to-engines`
- `POST /export/run-wordpress`
- `GET /export/status`

Operativo observado pero con trazabilidad pendiente:

- `POST /api/recompute-simple/update-gesa`

### 12.4 Scripts de referencia

Referencia runtime:

- `apply_book_preview_to_engine.py`
- `apply_all_book_previews.py`
- `recompute_engine_errors.js`
- `scripts/update_revision_states.js`
- `scripts/update_gesa_fields_from_excel.js`
- `scripts/update_sust_fields.js`
- `scripts/export_wordpress_milu.js`

Referencia offline rebuild:

- `scripts/rebuild_engine_from_book_preview.js`
- `scripts/enrich_rebuild_with_gesa_sust.js`
- `scripts/enrich_rebuild_with_assets.js`
- `depuracion_json.py`

### 12.5 Procesos offline

Offline confirmados:

- rebuild base desde `book_preview`
- enrich GESA/SUST de rebuild
- enrich assets de rebuild
- `depuracion_json.py` para consolidacion global de los 9 engines

### 12.6 Riesgos abiertos

- coexistencia oficial/legacy
- gap de trazabilidad en `update-gesa`
- dependencia de matching visual PDF
- riesgo de `ENOSPC` por backups masivos
- dualidad entre runtime `engine_*.json` y rebuild offline `engine_rebuild_*.json`

### 12.7 TODO explicito

- cerrar la trazabilidad fuente -> runtime de `POST /api/recompute-simple/update-gesa`
- congelar contrato unico documentado entre runtime y rebuild offline para `measure_final` / `measurement_final`
- decidir si el rebuild offline pasara a ser o no el origen oficial futuro del runtime

---

## Resumen ejecutivo real

MILU V1 hoy opera sobre JSON en disco y no sobre base de datos. El flujo runtime oficial ya esta claramente dividido en Import PDF, enrich catalogal, Final Fields, Errors, States, QA sync y Export WordPress. El rebuild offline existe, funciona y esta mas cerca de una reconstruccion desde cero, pero todavia no sustituye al runtime principal sobre `engine_*.json`.

La referencia oficial actual para operar y auditar el sistema es `recompute_simple.html` mas los endpoints `POST /api/pdf-preview/apply-to-engine`, `POST /copy-pdf-to-final-all-books`, `POST /recompute-qa-errors`, `POST /api/recompute-simple/update-states`, `GET/POST /qa_revision_sync.php` y `POST /export/run-wordpress`. Todo lo demas debe leerse como legacy, alternativo o pipeline offline separado.