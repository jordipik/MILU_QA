# MILU V1 Master Pipeline

## Objetivo
Documentar el flujo oficial de MILU v1 por motor, desde PDF origen hasta export WordPress, usando solo comportamiento real detectado en codigo y endpoints.

## Inputs
- PDF de origen por motor, por ejemplo `12V4000M40A.pdf`.
- `book_preview_<MODEL>.json` generado desde `import_pdf.html` y `js/import-pdf.js`.
- `engine_<MODEL>.json` (9 motores definidos en `js/data-loader.js`).
- Datos de catalogos ya presentes en `engine_*.json`: GESA (`designation_gesa`, `dimensions_gesa`, `weight_gesa`, `nsn`, `norma`, `normalizado`), SUST (`sust_*`) y FG/FGS (`fg_*`, `fgs_*`, `categoria`).
- Reglas QA por registro (`*_error`, `qa_revision_estado`, `qa_revision_accion`).

## Outputs
- `engine_*.json` enriquecidos en campos `_pdf`, `_final`, `_error`, QA y recursos visuales.
- Persistencia de revision remota en `qa_revision_server_data.json` via `/qa_revision_sync.php`.
- Export WordPress en `data/output/wordpress/` via `scripts/export_wordpress_milu.js`.

## Scripts implicados
- PDF a engine: `apply_book_preview_to_engine.py`, `apply_all_book_previews.py`.
- Final fields:
  - endpoint principal actual del modal: `POST /copy-pdf-to-final-all-books` (backend en `server.js`).
  - endpoint legacy aun disponible: `POST /calculate-final-fields` ejecuta `copy_gesa_fields_to_final.py`.
  - proceso oficial de consistencia global: `depuracion_json.py`.
- Error system: `recompute_engine_errors.js`.
- Export: `scripts/export_wordpress_milu.js`.

## Endpoints implicados
- Salud y persistencia: `GET /health`, `POST /save-json`, `POST /save-json.php`.
- PDF import: `POST /api/pdf-preview/apply-to-engine`.
- Final: `POST /copy-pdf-to-final-all-books`, `POST /calculate-final-fields`.
- Errores: `POST /recompute-qa-errors`.
- Revision: `POST /recalculate-revision-status`, `GET/POST /qa_revision_sync.php`, `POST /apply-revision-to-engines`.
- Export: `POST /export/run-wordpress`, `GET /export/wordpress-decisions`, `GET /export/files`, `GET /export/file`, `GET /export/download`, `GET /export/status`.

## Botones UI relacionados
- Import PDF (`import_pdf.html`): `extraerPaginaBtn`, `extractWholeBookBtn`, `extractAllBooksBtn`.
- Recompute modal (`analista_02.html` + `js/analista-02.js`):
  - `recomputeCopyBookBtn` -> IMPORTAR PDF.
  - `recomputeCalculateFinalBtn` -> CALCULO FINAL.
  - `recomputeRunBtn` -> ERRORES.
  - `recomputeRevisionStatusBtn` -> ESTADOS.
- Export (`exportacion.html` + `js/exportacion.js`):
  - `expBtnRunWordpress` -> recalculo de export WordPress.

## Campos afectados
- Paso PDF: `pos_pdf`, `pn_pdf`, `designation_pdf`, `model_type_pdf`, `qty_pdf`, `units_pdf`, `weight_pdf`, `fn_pdf`, `measure_pdf`, `norma_pdf`, `bom_pdf`, `fg_fgs_pdf`.
- Paso final: `*_final` principales (`pn_final`, `designation_final`, `qty_final`, `units_final`, `weight_final`, `fn_final`, `measure_final`, `norma_final`, `bom_final`, `fg_fgs_final`, `nsn_final`, `normalizado_final`, `sust_status_final`).
- Paso errores: `*_error`, `total_error`, `has_error`.
- Paso revision: `qa_revision_estado`, `qa_revision_accion`, `qa_revision_updated_at`.
- Paso assets/export: `ruta_foto`, `ruta_esquemas_pos`, `exp_imagenes`, `esquemas`, `esquemas_circulos`, `esquemas_circulos_all`.

## Flujo paso a paso
1. PDF original por motor.
2. Extraccion PDF -> `book_preview_<MODEL>.json` desde `import_pdf.html` (`downloadJsonPreview`).
3. Enriquecimiento `_pdf` en `engine_<MODEL>.json` con `POST /api/pdf-preview/apply-to-engine` (usa scripts Python oficiales de apply).
4. Enriquecimiento de catalogos (GESA/SUST/FG-FGS) no se ejecuta hoy con un endpoint unico dedicado en runtime; los campos se consumen desde datos ya presentes en `engine_*.json` y se usan en calculo final/export.
5. Calculo final masivo con `POST /copy-pdf-to-final-all-books`:
   - si `gesa=SI` y el campo mapea a GESA, toma valor GESA;
   - en otro caso, toma valor `_pdf`.
6. Vinculacion assets visuales:
   - esquemas generales por carpeta `esquemas/<BOOK>_esquemas/`;
   - esquemas POS por `esquemas_pos_circulos/<BOOK>-POS/`;
   - imagenes por `ruta_foto` y consolidacion en `exp_imagenes`.
7. Calculo errores con `POST /recompute-qa-errors` (reglas en `recompute_engine_errors.js`).
8. Recalculo QA estado/accion con `POST /recalculate-revision-status`.
9. Sincronizacion/volcado revision con `/qa_revision_sync.php` y aplicacion masiva con `/apply-revision-to-engines`.
10. Export WordPress con `POST /export/run-wordpress` y artefactos en `data/output/wordpress/`.

## Riesgos / problemas conocidos
- Entorno local requerido para varios endpoints de recompute (`js/analista-02.js` marca endpoints local-only).
- `POST /recompute-pdf-auto` esta desactivado (410); usar `/recompute-pdf-auto-visual`.
- `POST /calculate-final-fields` y `POST /copy-pdf-to-final-all-books` coexisten; no son equivalentes exactos.
- Catalogos EXCEL origen (ficheros `EXCEL_*`) no estan versionados en este repo; se opera con datos ya integrados en `engine_*.json`.
- Flujo depende de JSON en disco (sin DB transaccional), con riesgo de concurrencia mitigado por lock en `handleSaveJson`.

## TODO pendiente
- Unificar oficialmente un solo mecanismo de calculo final y retirar endpoint legacy si ya no aplica.
- Publicar contrato formal de entrada para catalogos GESA/SUST/FG-FGS en runtime v1.
- Añadir smoke tests automatizados por etapa (PDF->FINAL->ERROR->EXPORT).

## Ejemplo real
- En `engine_12V4000M40A.json`, un registro real (`ID=1102759`) contiene simultaneamente:
  - campos base (`POS`, `PART NO.`, `DESIGNATION`),
  - campos `_pdf` (por ejemplo `pn_pdf`, `bom_pdf`, `fg_fgs_pdf`),
  - campos `_final` (por ejemplo `pn_final`, `designation_final`, `measure_final`),
  - campos de error (`total_error`, `has_error`) y QA (`qa_revision_estado=ok`, `qa_revision_accion=importar`).
