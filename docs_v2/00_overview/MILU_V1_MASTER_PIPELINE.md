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
- PDF a engine (flujo oficial IMPORTAR PDF):
  - UI: `recomputeCopyBookBtn` -> `runApplyBookPreviewToEngines()` en `js/analista-02.js`.
  - backend: `POST /api/pdf-preview/apply-to-engine` en `server.js`.
  - script principal ejecutado por backend: `apply_book_preview_to_engine.py --write --overwrite` (cuando hay engine seleccionado).
  - script batch alternativo (cuando no se selecciona engine): `apply_all_book_previews.py --write --overwrite`.
- Final fields:
  - OFFICIAL: `POST /copy-pdf-to-final-all-books` (backend en `server.js`, FINAL_FIELDS_V1).
  - LEGACY: `POST /calculate-final-fields` ejecuta `copy_gesa_fields_to_final.py`.
  - proceso oficial de consistencia global: `depuracion_json.py`.
- Error system: `recompute_engine_errors.js`.
- Export: `scripts/export_wordpress_milu.js`.

## Endpoints implicados
- Salud y persistencia: `GET /health`, `POST /save-json`, `POST /save-json.php`.
- PDF import: `POST /api/pdf-preview/apply-to-engine`.
- PDF import (legacy/alternativo, no usado por IMPORTAR PDF actual):
  - `POST /copy-pdf-to-pdf-all-books` (legacy para import masivo previo).
  - `POST /recompute-pdf-auto` (legacy/desactivado para este flujo).
- Final: OFFICIAL `POST /copy-pdf-to-final-all-books`, LEGACY `POST /calculate-final-fields`.
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
3. En modal de recalculo, `recomputeCopyBookBtn` ejecuta `runApplyBookPreviewToEngines()`.
4. `runApplyBookPreviewToEngines()` llama al endpoint oficial `POST /api/pdf-preview/apply-to-engine`.
5. Backend ejecuta apply oficial con `--write --overwrite` (`apply_book_preview_to_engine.py` por engine, o `apply_all_book_previews.py` en modo batch).
6. Enriquecimiento de catalogos (GESA/SUST/FG-FGS) no se ejecuta hoy con un endpoint unico dedicado en runtime; los campos se consumen desde datos ya presentes en `engine_*.json` y se usan en calculo final/export.
7. Calculo final masivo con `POST /copy-pdf-to-final-all-books`:
  - aplica FINAL_FIELDS_V1 con prioridad simple `A / B` por campo;
  - consume segun mapping campos PDF, GESA, SUST o base ya presentes en `engine_*.json`.
8. Vinculacion assets visuales:
   - esquemas generales por carpeta `esquemas/<BOOK>_esquemas/`;
   - esquemas POS por `esquemas_pos_circulos/<BOOK>-POS/`;
   - imagenes por `ruta_foto` y consolidacion en `exp_imagenes`.
9. Calculo errores con `POST /recompute-qa-errors` (reglas en `recompute_engine_errors.js`).
10. Recalculo QA estado/accion con `POST /recalculate-revision-status`.
11. Sincronizacion/volcado revision con `/qa_revision_sync.php` y aplicacion masiva con `/apply-revision-to-engines`.
12. Export WordPress con `POST /export/run-wordpress` y artefactos en `data/output/wordpress/`.

## Logs y diagnostico (IMPORTAR PDF)
- Logs UI en `js/analista-02.js`:
  - boton pulsado;
  - engine seleccionado;
  - endpoint llamado;
  - respuesta: `rows_changed`, `fields_changed`, `ambiguous`, `not_found`.
- Logs backend en `server.js`:
  - comando Python exacto lanzado;
  - resumen final (`rows_changed`, `fields_changed`, `ambiguous`, `not_found`).
- Evidencia de matching/reporting en `apply_book_preview_to_engine.py`:
  - salida de `not_found`, `ambiguous` y muestras de filas sin match.

## not_found y matching
- `not_found` NO significa error de escritura ni fallo de persistencia.
- `not_found` significa que una fila del preview no encontro match en engine.
- Matching real actual:
  - clave principal: `Source Page` + `POS`;
  - desempate secundario: `PN`.

## Panel de no-match en modal
- El modal de recalculo muestra diagnostico de no-match para IMPORTAR PDF:
  - metricas de resumen;
  - tabla de filas no encontradas;
  - filtro por motivo;
  - busqueda libre;
  - export CSV de la vista filtrada.

## Selector TODOS LOS LIBROS (modal errores)
- El selector `Libro` permite:
  - libro individual;
  - `Todos los libros`.
- El modal superior usa solo dos filtros: `Libro` + `ID puntual`.
- En ERRORES, el scope se deriva internamente:
  - `book=all` + `id=''` -> `all`
  - `book=<MODEL>` + `id=''` -> `book`
  - `book=<MODEL>` + `id=<VALOR>` -> `current`

## Contrato oficial de filtros del RecomputeModal

Estado: OFFICIAL (comportamiento validado en `analista_02.html` + `js/analista-02.js`).

Filtros oficiales del modal:
- selector `Libro`: `Todos los libros` o motor concreto.
- `ID puntual` opcional.

Tabla de contrato por boton:

| Boton | Endpoint | Soporta libro | Soporta ID | Comportamiento |
|---|---|---|---|---|
| IMPORTAR PDF (`recomputeCopyBookBtn`) | `POST /api/pdf-preview/apply-to-engine` | Si (libro o todos) | No | Ignora ID puntual y muestra aviso; aplica por libro o todos. |
| CALCULO FINAL (`recomputeCalculateFinalBtn`) | `POST /copy-pdf-to-final-all-books` | Si (libro o todos) | No | Ignora ID puntual y muestra aviso; aplica por libro o todos. |
| ERRORES (`recomputeRunBtn`) | `POST /recompute-qa-errors` | Si | Si | Respeta libro+ID; bloquea `Todos + ID` con mensaje claro. |
| ESTADOS (`recomputeRevisionStatusBtn`) | `POST /recalculate-revision-status` | No (solo global) | No | Solo recalcula todos los libros; bloquea libro concreto o ID. |

Detalles operativos de ERRORES:
- `updateRevision: false`
- `forceRevision: false`
- ESTADOS queda como paso separado para actualizar `qa_revision_estado`/`qa_revision_accion`.

Nota UX (cerrado):
- Modal simplificado a dos filtros visibles (`Libro` + `ID puntual`).
- Eliminada dependencia de checkboxes ocultos para activar revision desde ERRORES.

## Estado operativo actual
- Flujo IMPORTAR PDF estabilizado.
- Endpoint oficial unificado (`/api/pdf-preview/apply-to-engine`).
- Logs y diagnostico activos (UI + backend + script).
- Persistencia validada en backend Express y escritura en JSON.
- Validado en navegador y backend real.
- Matching ambiguo pendiente de revision futura.
- Casos `not_found` aceptados temporalmente como parte del diagnostico actual.

## Riesgos / problemas conocidos
- Entorno local requerido para varios endpoints de recompute (`js/analista-02.js` marca endpoints local-only).
- `POST /recompute-pdf-auto` esta desactivado (410); usar `/recompute-pdf-auto-visual`.
- `POST /copy-pdf-to-pdf-all-books` y `POST /recompute-pdf-auto` no forman parte del flujo oficial actual de IMPORTAR PDF en modal.
- `POST /calculate-final-fields` y `POST /copy-pdf-to-final-all-books` coexisten; la primera queda marcada como LEGACY y la segunda como OFFICIAL.
- Catalogos EXCEL origen (ficheros `EXCEL_*`) no estan versionados en este repo; se opera con datos ya integrados en `engine_*.json`.
- Flujo depende de JSON en disco (sin DB transaccional), con riesgo de concurrencia mitigado por lock en `handleSaveJson`.

## TODO pendiente
- Unificar oficialmente un solo mecanismo de calculo final y retirar endpoint legacy si ya no aplica.
- Publicar contrato formal de entrada para catalogos GESA/SUST/FG-FGS en runtime v1.
- Añadir smoke tests automatizados por etapa (PDF->FINAL->ERROR->EXPORT).

## Referencias relacionadas (doc v2)
- Recompute modal V1 (filtros superiores, objeto unificado de filtros y cobertura por boton): `docs_v2/04_final_calculation/recompute_system.md`.
- Contrato operativo de ERRORES (`/recompute-qa-errors`): `docs_v2/06_error_system/recompute_errors.md`.

## Ejemplo real
- En `engine_12V4000M40A.json`, un registro real (`ID=1102759`) contiene simultaneamente:
  - campos base (`POS`, `PART NO.`, `DESIGNATION`),
  - campos `_pdf` (por ejemplo `pn_pdf`, `bom_pdf`, `fg_fgs_pdf`),
  - campos `_final` (por ejemplo `pn_final`, `designation_final`, `measure_final`),
  - campos de error (`total_error`, `has_error`) y QA (`qa_revision_estado=ok`, `qa_revision_accion=importar`).
