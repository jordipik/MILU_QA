# Import PDF Flow

## Objetivo
Documentar el flujo de extraccion de tablas PDF y su aplicacion sobre `engine_*.json`.

## Contrato de paridad Overlay vs Extraccion
- El overlay pertenece al diagnostico y visualizacion PDF; no es la fuente oficial de datos.
- `js/import-pdf.js` genera el artefacto oficial `book_preview_<MODEL>.json`.
- El apply oficial solo consume `book_preview_<MODEL>.json` y copia campos `*_pdf` al engine mediante `POST /api/pdf-preview/apply-to-engine`.
- Por tanto, la fuente real para datos es `book_preview_<MODEL>.json`, no el overlay.
- Aun asi, el overlay debe aplicar reglas equivalentes para que la revision humana sea fiable.
- Overlay y extraccion NO son el mismo calculo.
- Hay que reparar ambos sitios por separado:
	- A) overlay visual, para que el usuario vea las columnas bien posicionadas.
	- B) extraccion/book_preview, para que los campos `*_pdf` salgan correctamente.
- Si solo se corrige overlay, la UI puede verse bien pero el JSON seguira mal.
- Si solo se corrige extraccion, el JSON puede estar bien pero el overlay seguira confundiendo al usuario.
- Ambos calculos deben mantenerse alineados con las mismas reglas de split, en este orden:
	1. `POS + PN + DESIGNATION`
	2. `PN + DESIGNATION`
	3. `DESIGNATION` que empieza por `PN`
	4. `DESIGNATION` que empieza por `POS + PN`

## Inputs
- PDF del motor seleccionado en `import_pdf.html`.
- Rango de paginas (`pdfRangeFromInput`, `pdfRangeToInput`).

## Outputs
- `book_preview_<MODEL>.json` descargado por navegador.
- Actualizacion de `_pdf` en `engine_*.json` al aplicar preview.

## Limites de este flujo
- IMPORTAR PDF no determina `esquemas` ni `esquemas_circulos`.
- El calculo de `esquemas` pertenece al flujo BOM (`rebuild_schemes_by_bom.py`).
- `esquemas_circulos*` y `ruta_esquemas_pos` son derivados posteriores desde `esquemas + POS`.

## Scripts implicados
- Frontend oficial de extraccion: `js/import-pdf.js` (`extractWholeBook`, `extractAllBooks`).
- Frontend de overlay/diagnostico visual: `js/pdf-viewer.js`.
- Flujo analista en paridad: `js/analista-02.js`.
- Backend apply: `apply_book_preview_to_engine.py`, `apply_all_book_previews.py`.

## Endpoints implicados
- OFFICIAL: `POST /api/pdf-preview/apply-to-engine`.
- No oficial para este flujo: `POST /copy-pdf-to-pdf-all-books`.
- Legacy desactivado: `POST /recompute-pdf-auto` (HTTP 410).
- Alternativo visual no oficial: `POST /recompute-pdf-auto-visual`.

## Botones UI relacionados
- `extractBookBtn` (extraer libro actual).
- `extractAllBooksBtn` (barrido de todos los libros).
- En `recompute_simple.html`: `btnImportPdf`.
- En modal analista: `recomputeCopyBookBtn`.

## Campos afectados
- Campos `_pdf`: `pos_pdf`, `pn_pdf`, `designation_pdf`, `model_type_pdf`, `qty_pdf`, `units_pdf`, `weight_pdf`, `fn_pdf`, `measure_pdf`, `norma_pdf`, `bom_pdf`, `fg_fgs_pdf`.

## Flujo paso a paso
1. `import_pdf.html` carga PDF y ejecuta dos calculos relacionados pero separados:
	- overlay visual en `js/pdf-viewer.js` para diagnostico humano;
	- extraccion estructurada en `js/import-pdf.js` para construir filas `*_pdf`.
2. `extractWholeBook` recorre paginas y compone payload con:
	- raiz: `book`, `generated_at`, `pages_total`, `range_from`, `range_to`, `pages_processed`, `pages_with_rows`, `rows_total`, `warnings_total`, `cancelled`, `pages`.
	- cada pagina: `source_page`, `rows_count`, `rows_with_pn`, `warnings_count`, `rows`.
3. El frontend descarga `book_preview_<MODEL>.json` con `downloadJsonPreview(...)`.
4. IMPORTAR PDF en recompute (`btnImportPdf` o `recomputeCopyBookBtn`) llama `POST /api/pdf-preview/apply-to-engine`.
5. Backend ejecuta:
	- por libro: `apply_book_preview_to_engine.py --write --overwrite --report ...`
	- todos: `apply_all_book_previews.py --write --overwrite --report ...`
6. La respuesta devuelve `stats`, `not_found_rows`, `action_required_conflicts`, `applied_manual_decisions`.

## Casos de reparacion documentados
- `12V4000M53`, pagina `803`: fusion `PN + DESIGNATION`.
- `12V4000M53`, pagina `669`: fusion `POS + PN + DESIGNATION`.

Cambios tecnicos aplicados:
- Overlay / visor PDF:
	- `js/pdf-viewer.js:4166`
	- `js/pdf-viewer.js:4668`
	- Se anadio split visual para bloques como `7250 X59450700011 BRACKET WIRING HARNESS`.
	- El overlay debe separar visualmente `POS`, `PN` y `DESIGNATION`.
- Extraccion / `book_preview`:
	- `js/import-pdf.js:302`
	- `js/import-pdf.js:343`
	- Se anadio reparacion downstream espejo para que `book_preview` tambien separe `POS`, `PN` y `DESIGNATION`.
- Flujo analista:
	- `js/analista-02.js:634`
	- `js/analista-02.js:696`
	- Se replica la misma correccion para mantener paridad con `import_pdf`.

## Logs y diagnostico
- En `js/analista-02.js` y `js/recompute-simple.js` se registran:
	- boton pulsado;
	- engine seleccionado;
	- endpoint llamado;
	- `rows_changed`, `fields_changed`, `ambiguous`, `not_found`.
- En `server.js` se registra:
	- comando Python ejecutado;
	- resumen final de stats.
- En `apply_book_preview_to_engine.py` se consolida el reporte de matching y no-match.

## not_found y matching
- `not_found` NO es error de persistencia.
- `not_found` indica fila preview sin match contra engine.
- Matching real actual:
	- principal: `Source Page` + `POS`.
	- desempate del matching principal por PN.
	- fallback si falta `POS`: `Source Page` + `PN` (candidato unico).
	- fallback adicional de compatibilidad: cuando falla `(page,pos)` y hay PN, puede resolver por `(page,pn)` como `page-pn-pos-mismatch`.

## Panel de no-match en modal
- El modal de recálculo muestra diagnostico de no-match:
	- metricas;
	- tabla;
	- filtro por motivo;
	- busqueda libre;
	- export CSV de filas visibles.

## Riesgos / problemas conocidos
- Extraccion depende de deteccion visual; puede generar `warnings` y filas ambiguas/no encontradas.
- Overlay correcto no garantiza JSON correcto si la reparacion downstream no existe.
- JSON correcto no garantiza overlay fiable si la reparacion visual no existe.
- Apply oficial con `--overwrite` puede reemplazar valores no vacios en `_pdf`.
- `not_found` puede mantenerse aunque la ejecucion sea correcta; se trata como diagnostico de matching.
- Existen rutas legacy/alternativas de copia `_pdf`, pero no son el flujo oficial de IMPORTAR PDF.

## Estado operativo actual
- Flujo IMPORTAR PDF estabilizado sobre endpoint oficial unico.
- Diagnostico activo en UI y backend.
- Persistencia validada en disco.
- `not_found` aceptado temporalmente como estado operativo esperado en parte del dataset.

## Aclaracion oficial vs legacy
- Oficial para IMPORTAR PDF: `POST /api/pdf-preview/apply-to-engine`.
- No oficial para este boton: `/copy-pdf-to-pdf-all-books`, `/recompute-pdf-auto`, `/recompute-pdf-auto-visual`.

## Ejemplo real validado
Caso `12V4000M53`, pagina `669`:
- `7250 -> X59450700011 -> BRACKET WIRING HARNESS`
- `8400 -> X59650700018 -> RETAINER F. WIRING HARNESS`
- `8570 -> X54750700009 -> CABLE CLAMP`
- `8800 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9350 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9450 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9660 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9700 -> X59450700011 -> BRACKET WIRING HARNESS`

Validacion observada:
- ya no quedan filas de ese patron con `pos_pdf` vacio
- `unresolvedCount = 0`
- el body del overlay pasa de `381` a `397` rectangulos en la pagina `669`

## TODO pendiente
- Definir test de regresion por muestra de paginas para validar estabilidad de extraccion.

## Ejemplo real
- `js/import-pdf.js` genera `book_preview_12V4000M40A.json` al terminar `extractWholeBook`.
