# Progreso de Remediación — `feat/milu-auditoria-remediacion`

Bitácora de cambios efectivos en la rama de remediación. Cada entrada referencia commit, archivos y verificación.

> Auditoría base: [09_auditoria_2026.md](09_auditoria_2026.md)
> Plan completo: [10_plan_remediacion.md](10_plan_remediacion.md)

---

## Commit `742ca003` — Bootstrap backend

**Mensaje:** `fix: bootstrap backend remediation endpoints in audit branch`

### Cambios en [server.js](../server.js)
1. Eliminadas dos de las tres definiciones duplicadas de `app.post('/recompute-pdf-auto', ...)`. Queda una única ruta activa.
2. Añadidos helpers de sincronización de revisiones:
   - `normalizeRevisionRecord`
   - `normalizeRevisionSyncPayload`
   - `ensureRevisionSyncFile`
   - `readRevisionSyncPayload`
   - `writeRevisionSyncPayload`
3. Implementados endpoints en Express (antes los servía el static middleware o devolvían 404):
   - `GET /qa_revision_sync.php` → devuelve el JSON normalizado.
   - `POST /qa_revision_sync.php` → mergea payload entrante en [qa_revision_server_data.json](../qa_revision_server_data.json).
   - `POST /apply-revision-to-engines` → aplica revisiones masivas usando `applyRevisionPayload` de [apply_revision_to_engines.js](../apply_revision_to_engines.js).
4. El archivo PHP físico ya no se expone como estático: la ruta explícita gana.

### Cambios en [README.md](../README.md)
- "8 archivos `engine_*.json`" → "9 archivos `engine_*.json`".
- Añadidos `qa_revision_sync.php` y `apply-revision-to-engines` a la sección "Endpoints clave".

### Verificación realizada
- `node --check server.js` → OK.
- `GET /health` → 200.
- `GET /qa_revision_sync.php` → JSON válido.
- `POST /apply-revision-to-engines` con payload vacío → `{ ok: true, result: { appliedByFile: { ...9 motores: 0 cambios } } }`.
- `POST /save-json.php` (ruta antigua errónea) → 404 (esperado).

---

## Sincronización de documentación (este PR)

### Archivos creados
- [docs/09_auditoria_2026.md](09_auditoria_2026.md): auditoría completa por áreas.
- [docs/10_plan_remediacion.md](10_plan_remediacion.md): plan accionable por bloques.
- [docs/11_progreso_remediacion.md](11_progreso_remediacion.md): este documento.

### Archivos actualizados (correcciones de incoherencias)
- [docs/00_overview.md](00_overview.md): 8 → 9 motores; añadidos `/qa_revision_sync.php` y `/apply-revision-to-engines` a la lista de endpoints.
- [docs/02_data_flow.md](02_data_flow.md): "8 engine_*.json" → "9 engine_*.json".
- [docs/03_data_models.md](03_data_models.md): `measurement_final` → `measure_final`; nota explícita de que el campo antiguo ya no se persiste.
- [docs/AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md): 8 → 9 motores; endpoints actualizados.
- [docs/README.md](README.md): añadidas entradas a los nuevos documentos.

---

## Commit `020eee85` — AR-1 infraestructura de carga incremental

**Resumen:** primera fase de la mejora AR-1 del plan, sin cambios en flujos por defecto.

### Backend
- [server.js](../server.js): nuevo `GET /engines` con cache invalidado por `mtimeMs + size`.

### Frontend
- [js/data-loader.js](../js/data-loader.js): `fetchEngineCatalog()` y `loadEnginesByFileNames(files, { append })`.
- [js/state.js](../js/state.js): `engineCatalog`, `loadedEngineFiles`, `incrementalLoadingEnabled`.
- [js/qa-milu.js](../js/qa-milu.js): `loadInitialEngineData()` con feature flag (`?lazy=1` o `localStorage.miluLazyEngines='1'`).

### Verificación
- `GET /engines` (frío): 9 motores, totals `{ rowCount: 67_882, fileSize: 225_841_891 }`.
- `GET /engines` (caliente): **19 ms**.
- `POST /save-json` archivo no permitido: 400 (sin regresión).
- Sin la flag, `loadData()` usa `loadPartitionedEngineData` exactamente como antes.

Documento detallado: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md).

---

## Commit `bc1fcf45` — AR-1 UI mínima para carga incremental

**Resumen:** se completa la interfaz mínima de usuario para aprovechar AR-1 en `?lazy=1` sin afectar el modo clásico.

### Frontend UI
- [qa_milu.html](../qa_milu.html): nuevo bloque `lazyEnginePanel` con:
   - badge `lazyEngineBadge` (`n / 9`),
   - selector `lazyEngineSelect`,
   - botones `lazyLoadEngineBtn` y `lazyLoadAllEnginesBtn`.
- [styles/qa_milu.css](../styles/qa_milu.css): estilos específicos del panel lazy.

### Frontend lógica
- [js/qa-milu.js](../js/qa-milu.js):
   - muestra/oculta panel lazy según `state.incrementalLoadingEnabled`,
   - carga incremental por botón con `loadEnginesByFileNames(..., { append: true })`,
   - refresca badge/selector,
   - recompone catálogo libro/página tras añadir motores,
   - re-renderiza tabla/paginación y mantiene compatibilidad con revisión/guardado.

### Verificación
- Modo clásico: panel oculto y carga completa como antes.
- Modo lazy:
   - inicio en `1 / 9`,
   - tras cargar un motor: `2 / 9`,
   - tras "Cargar todos": `9 / 9`.
- Selector de libros actualizado según motores ya cargados.
- Persistencia: `/save-json` escribe y restaura correctamente `qa_revision_accion` en `engine_12V4000M40A.json`.

---

## Pendiente (próximos commits)

Ver [10_plan_remediacion.md](10_plan_remediacion.md), tareas marcadas como "Pendiente". Prioridades inmediatas:

- QW-5 — smoke tests HTTP con `node --test`.
- BK-1 — validación de payloads en endpoints de escritura.
- DT-1 — path configurable en `depuracion_json.py`.
- UX-1 — vista compacta por defecto en la tabla.

Cuando se cierre cada una, añadir aquí un bloque "Commit `<sha>` — `<resumen>`" siguiendo el formato del primero.

---

## Trabajo local (sin commit) — Pipeline WordPress + IA

**Resumen:** se implementó una primera fase operativa para exportación WordPress/WooCommerce y clasificación offline de conflictos con trazabilidad.

### Scripts añadidos
- [scripts/export_wordpress_milu.js](../scripts/export_wordpress_milu.js)
- [legacy/export_complex_ai/scripts/ai_conflict_rules.js](../legacy/export_complex_ai/scripts/ai_conflict_rules.js)

### Comandos npm añadidos
- `export:wordpress`
- `legacy:ai:conflicts` (antes `ai:conflicts`)

### Documentación añadida
- [archived/13_wordpress_export_ai_pipeline.md](archived/13_wordpress_export_ai_pipeline.md)

### Outputs generados
- WordPress: `data/output/wordpress/` (CSV/JSON/reportes para NEW, SUPERSEDED, PENDING, DISCARDED)
- IA: `data/output/ai_review/` (conflictos completos, resumen, pendientes humanos y reporte de decisión)

### Resultado de ejecución inicial
- `new_exportable`: 1020
- `superseded_exportable`: 657
- `pending_review`: 4016
- `discarded`: 1445
- `duplicated_pn_keys`: 5130

### Verificación
- No se modificaron los 9 `engine_*.json` activos.
- CSV en UTF-8 con BOM y delimitador `;`.
- Pendientes y descartados con motivo trazable (`import_reason`).

---

## Cambio actual - Simplificacion WordPress QA-only

### Objetivo aplicado
- El flujo oficial de exportacion WordPress queda reducido a decision QA humana por PN global.
- La logica compleja de IA/scoring se archiva como legacy.

### Cambios principales
- Backend:
  - `POST /export/run-wordpress` ejecuta solo el export oficial simplificado.
  - `POST /export/run-synthetic`, `POST /export/run-ai-conflicts`, `POST /export/run-all` devuelven `410 legacy`.
  - `/pn/*` se marca legacy (`410`).
  - `/export/files` solo lista carpeta oficial `wordpress`.
- Frontend:
  - `exportacion.html` y `js/exportacion.js` simplificados (boton principal run-wordpress + refresco + tabla/preview/resumen).
  - Eliminados controles visibles de IA/Synthetic/scoring.
- Scripts:
  - `scripts/export_wordpress_milu.js` reescrito para leer 9 `engine_*.json` y decidir por reglas QA oficiales.
  - Scripts complejos movidos a `legacy/export_complex_ai/scripts/`.
- npm:
  - Se mantiene `export:wordpress`.
  - `ai:conflicts` y `export:review` pasan a `legacy:*`.

### Documentacion
- Nuevo: `docs/14_wordpress_export_simplified.md`.
- Actualizados: `docs/13_wordpress_export_ai_pipeline.md`, `docs/README.md`.
- Nuevo archivo de archivo: `legacy/export_complex_ai/README.md`.

---

## Cambio actual - PN Review QA-only por PN global

### Objetivo aplicado
- Se crea la pantalla operativa PN Review para revisar productos por PN unico global.
- La decision oficial se mantiene QA-only (sin scoring, sin IA de decision).

### Backend
- Nuevos endpoints oficiales:
   - `GET /pn-review/list`
   - `GET /pn-review/:sku`
   - `GET /pn-review/:sku/sources`
   - `POST /pn-review/:sku/apply-decision`
- Agrupacion global por PN usando los mismos criterios base del export oficial (`buildQaSummary` + `decideByQa`).
- Accion masiva por PN con validacion fuerte de payload (`estado=ok` y `accion` en `importar|eliminar|revisar`).
- Escritura atomica por archivo y refresco de cache de PN Review tras cambios.

### Frontend
- Nueva UX completa en `pn_review.html` + `js/pn-review.js` + `styles/pn-review.css`.
- Tabla de PN unicos, panel de detalle, validaciones auxiliares, badges de issues y modal de apariciones.
- Acciones masivas desde el panel de detalle con confirmacion explicita.

### Navegacion
- Enlace a PN Review añadido desde:
   - `qa_milu.html`
   - `exportacion.html`

---

## Cambio actual - Cierre formal QW-5 (smoke tests oficiales)

### Objetivo aplicado
- Consolidar un entrypoint oficial de tests smoke con documentacion de cobertura y criterios de uso.

### Cambios principales
- `package.json`
   - Se añade `npm test` apuntando a `npm run test:all-smoke`.
- Estructura de tests
   - Se mantiene `tests/smoke/` con suites:
      - `http-smoke.test.js`
      - `db-read-smoke.test.js`
      - `db-analytics-smoke.test.js`
   - Se crea `tests/helpers/` para reducir duplicacion minima:
      - `smoke-config.js`
      - `fetch-json.js`
      - `assert-json-response.js`
- Documentacion oficial
   - `docs/testing/README.md`
   - `docs/testing/SMOKE_TEST_MATRIX.md`
   - `docs/testing/QW5_CIERRE.md`
   - Actualizacion de `docs/10_plan_remediacion.md` y `docs/README.md`.

### Verificacion
- `npm test` -> OK
- `npm run test:all-smoke` -> OK
- Resultado: 41/41 tests en verde (11 runtime + 10 db-read + 20 analytics).

### Alcance y restricciones cumplidas
- Sin cambios de runtime.
- Sin cambios en `engine_*.json`.
- Sin cambios en logica QA.
- Sin cambios en export WordPress.
- Sin endpoints nuevos.
