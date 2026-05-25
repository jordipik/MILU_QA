# DOCUMENTO CANÃ“NICO MILU â€” FLUJO DE DATOS

> **Estado**: CANÃ“NICO Â· Fuente Ãºnica de verdad para los flujos de datos.
> **Ãšltima actualizaciÃ³n**: 2026-05-12.
> **Fuentes consolidadas**: [02_data_flow.md](02_data_flow.md), [03_data_models.md](03_data_models.md), [archived/MILU_MODELO_DATOS_JSON.md](archived/MILU_MODELO_DATOS_JSON.md), [archived/MILU_PIPELINE_COMPLETO.md](archived/MILU_PIPELINE_COMPLETO.md), [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md).

---

## 1. Carga inicial (runtime)

1. Navegador abre `qa_milu.html`.
2. [js/qa-milu.js](../js/qa-milu.js) inicializa la app.
3. [js/data-loader.js](../js/data-loader.js) `loadPartitionedEngineData()` solicita en paralelo los **9 `engine_*.json`**.
4. Cada fila se normaliza con `engine_model` inferido del nombre de fichero.
5. Las filas combinadas se vuelcan en `state.allData` ([js/state.js](../js/state.js)).
6. [js/revision.js](../js/revision.js) `assignRevisionKeys()` aÃ±ade claves estables y legacy de revisiÃ³n por fila.
7. Se cargan datos auxiliares: `MILU_New_v506.json`, `MILU_Superseded_v506.json` y el product export JSON para comparaciones.

Resultado: estado hidratado y compartido por toda la UI.

> Variante: carga incremental AR-1 (`?lazy=1`) â€” solo se cargan los motores seleccionados desde `GET /engines`. Ver [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md).

---

## 2. Flujo interactivo de QA

1. El usuario actualiza filtros / bÃºsqueda / orden.
2. [js/qa-table.js](../js/qa-table.js) `applyFilters()` filtra por flags, texto, valores de revisiÃ³n y rangos book/page.
3. `sortData()` aplica orden personalizado (`book_page_pos` como referencia principal).
4. `renderTable()` pinta filas visibles segÃºn el `column-view` activo.
5. La selecciÃ³n sincroniza el panel derecho (PDF / esquemas / detalle).

---

## 3. Guardado de revisiÃ³n por fila

1. Usuario cambia `qa_revision_estado` o `qa_revision_accion` en una fila.
2. `js/revision.js::setRowRevision()` actualiza la fila en memoria.
3. Persiste ambos campos con `saveCellToServer()`.
4. `js/data-loader.js::saveCellToServer()` hace `POST /save-json` con candidatos de URL backend.
5. `server.js` localiza el `engine_*.json` y la fila por `ID`, escribe el campo y persiste a disco.

Salida: `engine_*.json` actualizado con la revisiÃ³n de esa fila.

---

## 4. DecisiÃ³n global por PN (PN Review)

1. Usuario abre `pn_review.html` o la pestaÃ±a **PN Review** de `analista_02.html`.
2. Se cargan en paralelo `GET /pn-review/:sku` (detalle + `qa_summary`) y `GET /pn-review/:sku/sources` (todas las apariciones).
3. `detectPnSourceConflicts(sourceRows)` analiza conflictos por familia (`pn`, `designation`, `measure`, `weight`, `sust`) y devuelve `{familiesToShow, cellStatus, summary}`.
4. Usuario pulsa **Validar** / **Revisar** / **Descartar** â†’ confirm con `<dialog>` nativo.
5. `POST /pn-review/:sku/apply-decision {action}` recorre los 9 `engine_*.json` y actualiza `qa_revision_estado`, `qa_revision_accion`, `qa_revision_updated_at` en todas las filas que matchean por `pn_final` / `PART NO.` / `pn`.
6. Backend responde `{ok, sku, decision_applied, rows_updated, files_touched, errors}`.
7. Toast inmediato + recarga del PN.
8. En `analista_02.html`, callback `onDecisionApplied` â†’ `revalidateCurrentRow()` + `renderReviewStats()`.

Resultado: **todos los registros del PN en todos los motores** quedan con el mismo estado de decisiÃ³n.

> âš ï¸ Inconsistencia conocida: `analista_02.js` usa `descartar` mientras la UI principal usa `eliminar`. Tarea **DT-5** del plan ([PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md)). **PENDIENTE DE VALIDAR**.

---

## 5. ExportaciÃ³n sintÃ©tica (offline)

1. `node generate_synthetic_exports.js` carga todas las filas.
2. Agrupa por PN y selecciona filas representativas.
3. Calcula filas normalizadas para los contextos New y Superseded.
4. Escribe:
   - [qa_synthetic_new.json](../qa_synthetic_new.json)
   - [qa_synthetic_superseded.json](../qa_synthetic_superseded.json)

---

## 6. NormalizaciÃ³n de campos finales (offline)

`python depuracion_json.py` itera los 9 engine JSON y, por registro:

- Normaliza espacios en `dimensions_gesa` y `MEASUREMENT / STANDARD` (colapsa mÃºltiples espacios a uno).
- Calcula `designation_final`.
- Calcula **`measure_final`** con prioridad: `dimensions_gesa` si existe; si no, `MEASUREMENT / STANDARD`. (El legado `measurement_final` queda eliminado.)
- Corrige el typo `wheight_final` â†’ `weight_final`.
- Recalcula `exp_imagenes` con prioridad `ruta_foto â†’ ruta_esquemas_pos â†’ placeholder`.
- Reescribe los ficheros con pretty JSON.

Resultado: campos finales canonicalizados, usados por runtime y exports.

---

## 7. ExportaciÃ³n WordPress (oficial)

Ver [WORDPRESS_EXPORT_MILU.md](WORDPRESS_EXPORT_MILU.md). Resumen:

1. `npm run export:wordpress` â†’ [scripts/export_wordpress_milu.js](../scripts/export_wordpress_milu.js).
2. Lee los 9 `engine_*.json`.
3. Agrupa por PN (SKU global).
4. DecisiÃ³n QA-only:
   - `decision = import` si âˆƒ fila con `qa_revision_estado=ok` y `qa_revision_accion=importar`.
   - `decision = discard` si **todas** las filas del PN tienen `qa_revision_estado=ok` y `qa_revision_accion=eliminar`.
   - `decision = pending_review` en cualquier otro caso.
5. ClasificaciÃ³n New / Superseded **solo** por `sust_hierarchie === "Superseded"`.
6. Escribe en `data/05-wordpress/`: `milu_wp_import.{json,csv}`, `milu_wp_discarded.csv`, `milu_wp_pending_review.csv`, `milu_wp_export_summary.md`, opcional `milu_wp_trace.json`.

---

## 8. DiagnÃ³stico de persistencia (orden recomendado)

Cuando algo no se guarda, validar en este orden (regla operativa del proyecto):

1. `GET /health` â€” Â¿estÃ¡ vivo el servidor?
2. `GET/POST /qa_revision_sync.php` â€” Â¿responde JSON desde Express?
3. `POST /save-json` o `POST /apply-revision-to-engines` segÃºn el flujo afectado.
4. Verificar la escritura efectiva en disco (`engine_*.json` o `qa_revision_server_data.json`).
5. Solo entonces revisar la UI.

---

## 9. Modelo de datos (resumen)

Cada fila de `engine_*.json` incluye al menos:

- **Identidad**: `ID`, `PART NO.` (`pn_raw`), `pn_final`, `engine_model`, `libro`, `source_page`, `pos`.
- **DesignaciÃ³n**: `DESIGNATION`, `designation_final`, `designation_gesa`.
- **MÃ©tricas**: `MEASUREMENT / STANDARD`, `dimensions_gesa`, **`measure_final`**, `WEIGHT`, `weight_final`, `norma`.
- **SustituciÃ³n**: `sust_status`, `sust_hierarchie` (`"New"` | `"Superseded"`).
- **Multimedia**: `ruta_foto`, `ruta_esquemas_pos`, `exp_imagenes` (campo derivado final).
- **QA**: `qa_revision_estado` âˆˆ `{pendiente, ok}`, `qa_revision_accion` âˆˆ `{importar, copia, revisar, eliminar}`, `qa_revision_updated_at`.

Detalle: [03_data_models.md](03_data_models.md).

> Nota: `qa_errors` y `qa_errors_active` **ya no se persisten**. Se calculan en cliente (ver [QA_MILU.md](QA_MILU.md)).

---

## Referencias

- CanÃ³nico: [02_data_flow.md](02_data_flow.md), [03_data_models.md](03_data_models.md)
- Pipeline end-to-end (archivado): [archived/MILU_PIPELINE_COMPLETO.md](archived/MILU_PIPELINE_COMPLETO.md)
- Modelo JSON detallado (archivado): [archived/MILU_MODELO_DATOS_JSON.md](archived/MILU_MODELO_DATOS_JSON.md)
- AR-1 carga incremental: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md)
- Pipeline `depuracion_json.py`: [docs/modules/depuracion_json_py.md](modules/depuracion_json_py.md)

