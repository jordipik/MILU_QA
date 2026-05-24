# Pipeline Global MILU V1

## Objetivo
Resumir el pipeline operativo real de MILU V1 por motor, sin asumir flujos historicos.

## Inputs
- PDF por motor.
- `book_preview_*.json`.
- `engine_*.json`.
- `EXCEL_GESA2026.json` (cuando se ejecuta actualizacion OFFLINE de campos GESA).

## Outputs
- `engine_*.json` consolidados para QA y export.
- Export WordPress en `data/output/wordpress/`.

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

## Flujo paso a paso
1. Extraccion PDF genera `book_preview_<MODEL>.json` en `import_pdf.html`.
2. IMPORTAR PDF llama `POST /api/pdf-preview/apply-to-engine`.
3. Backend ejecuta `apply_book_preview_to_engine.py` o `apply_all_book_previews.py` con `--write --overwrite`.
4. OFFLINE opcional/recomendado antes de FINAL: actualizar campos GESA desde catalogo con `node scripts/update_gesa_fields_from_excel.js` (dry-run) o `node scripts/update_gesa_fields_from_excel.js --write`.
5. CALCULO FINAL llama `POST /copy-pdf-to-final-all-books`.
6. Backend aplica `FINAL_FIELDS_V1_MAPPINGS_BACKEND` y persiste `*_final`.
7. ERRORES llama `POST /recompute-qa-errors` y recalcula `*_error`.
8. ESTADOS llama `POST /api/recompute-simple/update-states` (o endpoint coexistente `/recalculate-revision-status`).
9. Revision remota usa `/qa_revision_sync.php` y `/apply-revision-to-engines`.
10. Export publica con `POST /export/run-wordpress`.

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

## Riesgos / problemas conocidos
- Coexistencia de rutas oficiales y legacy puede causar confusion operativa.
- Persistencia en JSON de disco (sin transacciones DB).
- `POST /recompute-pdf-auto` permanece referenciado en zonas legacy del frontend, pero backend lo mantiene desactivado (410).

## TODO pendiente
- Congelar un contrato versionado unico para final fields.

## Ejemplo real
- Flujo completo ejecutable desde `analista_02.html` (modal recompute) y `exportacion.html`.
