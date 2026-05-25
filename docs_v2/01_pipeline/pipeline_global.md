# Pipeline Global MILU V1

## Objetivo
Resumir el pipeline operativo real de MILU V1 por motor, sin asumir flujos historicos.

## Contrato de paridad Overlay vs Extraccion
- El overlay pertenece al plano de diagnostico visual del PDF.
- `js/import-pdf.js` pertenece al plano de datos y genera `book_preview_<MODEL>.json`.
- El apply oficial solo consume `book_preview_<MODEL>.json` y aplica los campos `*_pdf` al engine via `POST /api/pdf-preview/apply-to-engine`.
- Por tanto, la fuente real de datos PDF en runtime es `book_preview_<MODEL>.json`, no el overlay.
- Sin embargo, el overlay debe usar reglas equivalentes para que la revision humana sea fiable y no contradiga al JSON oficial.
- Las reglas de split que deben permanecer alineadas son:
  1. `POS + PN + DESIGNATION`
  2. `PN + DESIGNATION`
  3. `DESIGNATION` que empieza por `PN`
  4. `DESIGNATION` que empieza por `POS + PN`

## Inputs
- PDF por motor.
- `book_preview_*.json`.
- `engine_*.json`.
- `data/02-engine_rebuild/engine_rebuild_<MODEL>.json` (pipeline rebuild offline).
- `EXCEL_GESA2026.json` (cuando se ejecuta actualizacion OFFLINE de campos GESA).

## Outputs
- `engine_*.json` consolidados para QA y export.
- Export WordPress en `data/05-wordpress/`.
- Rebuild enriquecido por assets en `data/02-engine_rebuild/engine_rebuild_<MODEL>.json`.
- Reporte de assets por rebuild en `data/02-engine_rebuild/assets_report_<MODEL>.json`.

## UIs activas de recompute
- `recompute_simple.html` (flujo operativo principal por pasos).
- `analista_02.html` (modal recompute integrado, coexistente).

## Endpoints oficiales del pipeline
- `POST /api/pdf-preview/apply-to-engine`
- `POST /copy-pdf-to-final-all-books`
- `POST /recompute-qa-errors`
- `POST /api/recompute-simple/update-states`
- `GET/POST /qa_revision_sync.php`
- `POST /apply-revision-to-engines`
- `POST /export/run-wordpress`

## Endpoints legacy o alternativos
- `POST /calculate-final-fields` (legacy)
- `POST /recompute-pdf-auto` (legacy desactivado, responde 410)
- `POST /recompute-pdf-auto-visual` (alternativo)
- `POST /copy-pdf-to-pdf-all-books` (alternativo legacy)

## Botones UI relacionados
- Import PDF: `extractBookBtn`, `extractAllBooksBtn` (`import_pdf.html`).
- Recompute simple: `btnImportPdf`, `btnFinal`, `btnErrors`, `btnStatuses`, `btnClearPdfFinal`.
- Analista modal: `recomputeCopyBookBtn`, `recomputeCalculateFinalBtn`, `recomputeRunBtn`, `recomputeRevisionStatusBtn`.

## Campos afectados
- `_pdf`, `_final`, `_error`, QA, y campos de export visual.

## Pipeline rebuild (offline, separado)
Objetivo: enriquecer visualmente `engine_rebuild_<MODEL>.json` sin tocar `engine_<MODEL>.json` ni export WordPress.

Pasos oficiales:
1. Construccion de rebuild por modelo: `scripts/rebuild_engine_from_book_preview.js`.
2. Enriquecimiento GESA/SUST sobre rebuild: `scripts/enrich_rebuild_with_gesa_sust.js`.
3. Enriquecimiento visual de assets sobre rebuild: `scripts/enrich_rebuild_with_assets.js`.

Comandos oficiales de assets:
- `node scripts/enrich_rebuild_with_assets.js --engine <MODEL> --dry-run`
- `node scripts/enrich_rebuild_with_assets.js --engine <MODEL> --write`
- `node scripts/enrich_rebuild_with_assets.js --all --dry-run`
- `node scripts/enrich_rebuild_with_assets.js --all --write`

Reglas operativas de este paso:
- `--dry-run` no escribe.
- `--write` crea backup `engine_rebuild_<MODEL>.json.bak.<timestamp>`.
- Escribe solo en `data/02-engine_rebuild/`.
- No modifica `engine_<MODEL>.json`.
- No ejecuta ni modifica export WordPress.

## Flujo paso a paso
1. `import_pdf.html` ejecuta overlay visual y extraccion estructurada como calculos separados pero alineados por contrato.
2. Extraccion PDF genera `book_preview_<MODEL>.json` en `import_pdf.html`.
3. IMPORTAR PDF llama `POST /api/pdf-preview/apply-to-engine`.
4. Backend ejecuta `apply_book_preview_to_engine.py` o `apply_all_book_previews.py` con `--write --overwrite`.
5. OFFLINE opcional/recomendado antes de FINAL: actualizar campos GESA desde catalogo con `node scripts/update_gesa_fields_from_excel.js` (dry-run) o `node scripts/update_gesa_fields_from_excel.js --write`.
6. CALCULO FINAL llama `POST /copy-pdf-to-final-all-books`.
7. Backend aplica `FINAL_FIELDS_V1_MAPPINGS_BACKEND` y persiste `*_final`.
8. ERRORES llama `POST /recompute-qa-errors` y recalcula `*_error`.
9. ESTADOS llama `POST /api/recompute-simple/update-states` (o endpoint coexistente `/recalculate-revision-status`).
10. Revision remota usa `/qa_revision_sync.php` y `/apply-revision-to-engines`.
11. Export publica con `POST /export/run-wordpress`.

## Diagnostico activo
- IMPORTAR PDF devuelve `stats`, `not_found_rows`, `action_required_conflicts`, `applied_manual_decisions`.
- Matching real en apply:
  - principal `(Source Page, POS)`
  - desempate por PN (`pn_pdf`, `PART NO.`, `pn_final`, `pn_excel`)
  - fallback `(Source Page, PN)` cuando aplica
- `not_found` significa sin match, no fallo de persistencia.

## Alcance y filtros
- IMPORTAR PDF y CALCULO FINAL ignoran `ID puntual` (trabajan por libro/todos).
- ERRORES admite `scope` con libro e ID.
- ESTADOS en `recompute_simple` usa endpoint por engine/ID; en modal analista permanece el endpoint global coexistente.
- Actualizacion GESA desde `EXCEL_GESA2026.json` es OFFLINE (sin endpoint runtime), con match exacto `PART NUMBER == pn_final`, `--only` por motor y backup por engine en modo `--write`.

## Estado operativo actual
- Flujo principal estable sobre `recompute_simple.html`.
- Modal de `analista_02.html` sigue operativo y alineado con endpoints oficiales para IMPORTAR PDF/CALCULO FINAL/ERRORES.
- Coexisten endpoints legacy y alternativos; no son la referencia documental oficial.

## Casos de reparacion PDF ya incorporados
- `12V4000M53`, pagina `803`: correccion de fusion `PN + DESIGNATION`.
- `12V4000M53`, pagina `669`: correccion de fusion `POS + PN + DESIGNATION`.

Implementacion asociada:
- overlay / visor: `js/pdf-viewer.js:4166`, `js/pdf-viewer.js:4668`
- extraccion / `book_preview`: `js/import-pdf.js:302`, `js/import-pdf.js:343`
- flujo analista en paridad: `js/analista-02.js:634`, `js/analista-02.js:696`

Validacion documentada para pagina `669`:
- `7250 -> X59450700011 -> BRACKET WIRING HARNESS`
- `8400 -> X59650700018 -> RETAINER F. WIRING HARNESS`
- `8570 -> X54750700009 -> CABLE CLAMP`
- `8800 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9350 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9450 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9660 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9700 -> X59450700011 -> BRACKET WIRING HARNESS`
- ya no quedan filas de ese patron con `pos_pdf` vacio
- `unresolvedCount = 0`
- overlay body pasa de `381` a `397` rectangulos

## Riesgos / problemas conocidos
- Coexistencia de rutas oficiales y legacy puede causar confusion operativa.
- Persistencia en JSON de disco (sin transacciones DB).
- `POST /recompute-pdf-auto` permanece referenciado en zonas legacy del frontend, pero backend lo mantiene desactivado (410).
- Si overlay y extraccion dejan de compartir reglas equivalentes de split, la revision humana puede validar una tabla distinta de la que realmente llegara al engine.

## TODO pendiente
- Congelar un contrato versionado unico para final fields.

## Ejemplo real
- Flujo completo ejecutable desde `analista_02.html` (modal recompute) y `exportacion.html`.

