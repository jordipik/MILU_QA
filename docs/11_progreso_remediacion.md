# Progreso de Remediación — `feat/milu-auditoria-remediacion`

Bitácora de cambios efectivos en la rama de remediación. Cada entrada referencia commit, archivos y verificación.

> Auditoría base: [09_auditoria_2026.md](09_auditoria_2026.md)
> Plan completo: [10_plan_remediacion.md](10_plan_remediacion.md)

---

## Cambio actual - Cierre AR-3 (capa común Python incremental)

### Objetivo aplicado
- Cerrar formalmente AR-3 sin refactor masivo: dar por consolidado el conjunto crítico ya migrado y validado, dejando fuera de alcance el legacy auditado no bloqueante.

### Módulos creados (`python_lib/`)
- `python_lib/repo_paths.py`: wrapper común para resolución portable de raíz del repo (`resolve_repo_dir`, `should_log_repo_resolution`).
- `python_lib/json_io.py`: carga/escritura JSON estandarizada (`utf-8-sig` lectura, `ensure_ascii=False`, `indent=2` escritura).
- `python_lib/engine_helpers.py`: normalización, comparación QA, split medida/norma, cálculo de flags de error por registro.
- `python_lib/engine_constants.py`: constantes canónicas compartidas (`ENGINE_FILES`, patrones, tokens, etc.).
- `python_lib/logging_utils.py`: helper ligero de logging con prefijo de script.
- `python_lib/schema_validation.py`: wrapper Python para validar esquema formal vía `scripts/validate-engine-schema.js`.
- `python_lib/snapshot_utils.py`: helper de lectura de snapshots (`latest_snapshot_name`, ruta estándar `data/snapshots`).

### Scripts migrados (sin cambio funcional)
- `depuracion_json.py`: usa `python_lib.repo_paths`, `python_lib.json_io` y `python_lib.engine_helpers`.
- `add_final_fields.py`: usa `python_lib.repo_paths`, `python_lib.json_io` y `python_lib.engine_helpers`.
- `importar_json.py`: usa `python_lib.repo_paths`, `python_lib.json_io` y `python_lib.engine_constants`.
- `estadisticas_articulos.py`: usa `python_lib.repo_paths`, `python_lib.json_io` y constantes compartidas.
- `informe_estadisticas.py`: usa `python_lib.repo_paths`, `python_lib.json_io` y constantes compartidas.
- `convert_engine_to_excel.py`: usa `python_lib.repo_paths` y `python_lib.json_io` para cargar `engine_*.json` sin rutas frágiles.
- `convert_engines.py`: usa `python_lib.repo_paths`, `python_lib.json_io` y la lista canónica `ENGINE_FILES`.
- `convert_excel_to_json.py`: usa `python_lib.repo_paths` y `python_lib.json_io` para persistencia JSON uniforme.

### Auditoría de exportadores/auxiliares restantes
- `extraccion_de_pdf_a_excel/milu_export_paginas_v1.py`: exportador de páginas PDF a PNG; no comparte IO JSON ni lista de engines.
- `extraccion_de_pdf_a_excel/milu_export_esquemas_v6_2.py`: exportador/cropper de esquemas PDF; especializado en CSV/imagen, fuera de la capa común actual.
- `extraccion_de_pdf_a_excel/milu_export_datos_v6_2.py`: extractor batch PDF→Excel/CSV; depende de librerías y reglas propias, no candidato a refactor incremental de bajo riesgo en esta fase.
- `compare_measurements.py`: utilidad de diagnóstico; sigue con IO legacy y además presenta codificación/normalización pendiente.
- `validate_engine_jsons.py`: validador legacy redundante frente a `scripts/validate-engine-schema.js` y `python_lib.schema_validation`.
- `pretty_print_all_json.py`: utilidad de formateo masivo no crítica para export.
- `marcar_articulos_en_web.py`: utilidad puntual de escritura masiva sobre engines, no incluida en el flujo crítico AR-3.

### Pendientes no bloqueantes
- Mantener fuera del cierre AR-3 los exportadores PDF legacy de `extraccion_de_pdf_a_excel/` salvo que pasen a formar parte del flujo oficial.
- Decidir si `compare_measurements.py`, `validate_engine_jsons.py` y `pretty_print_all_json.py` se migran, se archivan o se reemplazan por wrappers de `python_lib` en una fase posterior.
- Definir en fase posterior si conviene entrypoint único (`pipelines/run_full.py`) sin romper flujos actuales.

### Deuda técnica restante
- No existe aún un entrypoint Python único para orquestar el pipeline oficial.
- Quedan utilidades legacy dispersas en raíz con responsabilidades mixtas (diagnóstico, formateo, extracción PDF).
- La carpeta `extraccion_de_pdf_a_excel/` mantiene dependencias y contratos propios fuera de `python_lib`.

### Tests y validación
- Nuevo test: `tests/smoke/python-lib.test.js` (16 pruebas, 16/16 OK).
- Nuevo test: `tests/smoke/python-exporters-smoke.test.js` (2 pruebas, 2/2 OK) para `convert_engine_to_excel.py` y `convert_excel_to_json.py` sobre ficheros temporales.
- `python -m py_compile` OK para módulos `python_lib/` y scripts migrados, incluyendo exportadores críticos.
- `npm run validate:schema` OK (9 engines, 67.883 registros, 0 errores).
- `npm run data:snapshot:compare` OK (9/9 UNCHANGED, Δ registros = 0).
- `npm run check` OK tras integrar test AR-3 en `test:all-smoke`.
- No hubo cambios en backend, UI ni estructura JSON durante este cierre; el alcance quedó limitado a scripts Python críticos, smoke tests y documentación.

### Criterio formal de cierre AR-3
- Scripts críticos migrados a `python_lib` para IO/path/helpers comunes: `depuracion_json.py`, `add_final_fields.py`, `importar_json.py`, `estadisticas_articulos.py`, `informe_estadisticas.py`, `convert_engine_to_excel.py`, `convert_engines.py`, `convert_excel_to_json.py`.
- `python -m py_compile` OK sobre `python_lib/` y scripts críticos migrados.
- `npm run validate:schema` OK (0 errores).
- `npm run data:snapshot:compare` OK (sin cambios).
- `npm run check` OK.

### Estado AR-3
✅ CERRADO — 2026-05-13

### Conclusión operativa
- AR-3 se cierra sobre el conjunto crítico migrado y validado.
- `extraccion_de_pdf_a_excel/*` y utilidades legacy auditadas quedan explícitamente fuera de alcance en esta fase y pasan a deuda técnica futura no bloqueante.
- La deuda de orquestación/entrypoint único sigue documentada, pero no impide el cierre formal del objetivo incremental definido para AR-3.

---

## Cambio actual - Cierre DT-3 (snapshots versionados engine_*.json)

### Objetivo aplicado
- Proteger los datos críticos engine_*.json con un sistema ligero de snapshots locales, reproducible y auditable, sin dependencias externas ni base de datos.

### Cambios principales
- **`scripts/create-data-snapshot.js`** (nuevo): copia los 9 engines + genera `manifest.json` con SHA-256, nº registros, size_bytes, schema_version, label, host, node_version. Valida esquema antes de crear snapshot (salvo `--no-validate`). Modos: `--dry-run`, `--label=<texto>`.
- **`scripts/compare-data-snapshot.js`** (nuevo): compara snapshot vs estado actual. Detecta UNCHANGED / MODIFIED / ADDED / DELETED. Muestra Δregistros y Δsha256. Modos: `--list`, `--json`, por nombre de snapshot o último (`latest.json`). Exit 0 = sin cambios, Exit 2 = diferencias.
- **`.gitignore`**: añadido `data/snapshots/*/` para excluir contenido de snapshots del repo.
- **`data/snapshots/README.md`** (nuevo): instrucciones de uso.
- **`data/snapshots/.gitkeep`** (nuevo): mantiene el directorio en el repo.
- **`package.json`**: añadidos `"data:snapshot"` y `"data:snapshot:compare"`.

### Verificación
- `npm run data:snapshot --label="DT-3-initial"`: snapshot creado, 9 engines, 67.883 registros, schema 1.0, esquema validado OK.
- `npm run data:snapshot:compare`: 9/9 UNCHANGED, Δ registros = 0.
- `npm run data:snapshot:compare -- --list`: lista 1 snapshot correctamente.
- `npm run data:snapshot -- --dry-run`: muestra manifest sin escribir.

### Estado DT-3
✅ CERRADO — 2026-05-13

---

### Objetivo aplicado
- Crear la fuente formal de verdad del dato para engine_*.json, con esquema versionado, validador sin dependencias externas, tests formales y documentación.

### Cambios principales
- **`schemas/engine-record.schema.json`** (nuevo): JSON Schema draft-07 con 67 campos mapeados, enums para `qa_revision_estado` / `qa_revision_accion` / `criterio_pn` / `engine_model` / etc., compatibilidad legacy documentada.
- **`scripts/validate-engine-schema.js`** (nuevo): validador Node.js puro sin dependencias. Modos `--summary` / por fichero. Exit 0/1 para CI.
- **`tests/smoke/engine-schema.test.js`** (nuevo): 8 tests con `node:test`. Integrado en `npm test` vía `test:all-smoke`.
- **`package.json`**: añadido `"validate:schema"` y el test integrado en `test:all-smoke`.
- **`docs/modules/engine_schema.md`** (nuevo): documentación completa — campos required, opcionales, legacy, aliases, editables, notas de compatibilidad.

### Verificación
- `npm run validate:schema`: 67.883 registros, 0 errores schema en los 9 engines.
- `node --test tests/smoke/engine-schema.test.js`: 8/8 OK.

### Estado DT-2
✅ CERRADO — 2026-05-13

---

## Cambio actual - Cierre UX-2 (virtualización de tabla)

### Objetivo aplicado
- Reducir coste de render en tablas grandes sin incorporar frameworks adicionales y sin cambiar contratos backend.

### Cambios principales
- Frontend:
   - `js/qa-table.js`
      - Se añade windowing/virtualización con overscan para `main` y `errors`.
      - Activación automática cuando la paginación está desactivada y el número de filas supera umbral.
      - Scroll listeners pasivos + `requestAnimationFrame` para re-render de ventana visible.
      - Compatibilidad con selección por teclado y `focusRevisionRowInMainTable` asegurando visibilidad de fila seleccionada.
      - Métrica opcional de depuración en barra de stats con `?virtualDebug=1` o `localStorage.miluVirtualDebug='1'`.
   - `styles/qa_milu.css`
      - Se añaden estilos mínimos para filas espaciadoras virtuales (`tr.virtual-spacer`).

### Verificación
- `npm run check` ✅
- `npm run test:security` ✅
- Validación de sintaxis/diagnóstico en archivos modificados: sin errores (`js/qa-table.js`, `styles/qa_milu.css`).

### Alcance
- El comportamiento clásico con paginación activa se mantiene sin cambios funcionales.
- La virtualización entra en juego en escenarios de alto volumen (sin paginación), que es donde aporta mayor mejora de UX.

---

## Cambio actual - Validacion funcional UX-2 (virtualizacion)

### Objetivo aplicado
- Validar en UI real que la virtualizacion de tabla (windowing + overscan) funciona con dataset visible y conserva interacciones clave.

### Evidencia manual (UI + DOM)
- Entorno: `qa_milu.html?virtualDebug=1`, `Paginacion: OFF`, `Vista errores`.
- Dataset visible confirmado: total filtrado **3746** filas.
- DOM virtualizado confirmado:
  - filas renderizadas: **21**
  - espaciadores virtuales: **1-2** segun posicion de scroll
  - ejemplo de alturas de espaciador: `1890px` / `109860px`.
- Cambio de ventana al scroll confirmado:
  - `first` antes: `id=1100001`
  - `first` tras scroll medio: `id=1201440`
  - `first` tras scroll mas profundo: `id=1206099`.
- Navegacion por teclado confirmada (`ArrowDown`/`ArrowUp`):
  - la seleccion pasa de `null` a una fila valida (`id=1206237`) y se mantiene visible
  - el `scrollTop` acompana el movimiento (ejemplo: `49 -> 6750`).

### Compatibilidad funcional verificada
- Filtros y ordenacion en vista errores: operativos sin romper render incremental.
- Cambio de vistas (`pdf`/`qa`/`errors`): operativo (sin crash ni bloqueo de render).
- Controles de revision por fila en vista errores: presentes (selects por fila).
- `lazy=1`: panel incremental visible y operativo (`Motores cargados: 1/9 -> 9/9`).

### Smoke frontend
- Se documenta smoke manual reproducible en: `docs/testing/UX2_VIRTUALIZACION_MANUAL_SMOKE.md`.
- No se anade Playwright en esta fase para evitar friccion de dependencias/runtime en la cadena minima actual.

### Estado UX-2
- **Cerrado parcial**:
  - Implementacion + validacion funcional manual: **cerradas**.
  - Smoke automatizado en repo: **pendiente** (incidencia controlada por decision de no anadir dependencia pesada en esta fase).

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

---

## Cambio actual - Fase I payload validation + write safety

### Objetivo aplicado
- Endurecer validaciones de payload en endpoints de escritura manteniendo compatibilidad legacy y sin cambiar flujo operativo.

### Cambios principales
- Nueva capa reusable: `server/validation/`
   - `validators.js`
   - `qa-validation.js`
   - `payload-errors.js`
   - `allowed-fields.js`
- Endpoints con validacion explicita:
   - `/save-json` y `/save-json.php`
   - `/apply-revision-to-engines`
   - `/pn-review/:sku/apply-decision`
   - `/pn-review/:sku/apply-values`
   - `/pn-review/apply-siblings-bulk`
   - `/pn-review/by-id/:id/apply-decision`
   - `/recompute-qa-errors`
   - `/recompute-pdf-auto`
   - `/qa_revision_sync.php`
   - `/audit-log`
- Error shape de validacion estandarizado:
   - `{ ok:false, error:'VALIDATION_ERROR', code, field, message }`
- Compatibilidad legacy conservada:
   - `descartar -> eliminar`
   - `measurement_final -> measure_final`

### Verificacion
- `npm run test:security` -> 9/9 OK
- `npm test` -> 41/41 smoke OK

### Entregables documentales
- `docs/security/WRITE_ENDPOINTS_AUDIT.md`
- `docs/security/PAYLOAD_VALIDATION.md`
- `data/output/validation/payload_validation_report.md`

---

## Cambio actual - Cierre BK-1 (validacion funcional Fase I)

### Objetivo aplicado
- Validar end-to-end que la Fase I de payload validation + write safety queda funcionalmente cerrada en los endpoints criticos `/save-json` y `/apply-revision-to-engines`.
- No refactor, no cambios de contrato, no tocar UX-1 ni DT-1.

### Cobertura ampliada en `tests/security/write-validation.test.js`
Se añaden 7 tests nuevos sobre el server real:

- `/save-json roundtrip HTTP`: escribe `designation_final` en `engine_12V4000M40A.json` y restaura el valor original (verifica write efectivo en disco + lock + JSON response).
- `/save-json field=col alias`: confirma que el frontend actual (`{file,id,col,value}`) sigue siendo aceptado (no rompe `qa_milu.html`).
- `/save-json siempre responde JSON`: confirma `content-type: application/json` incluso en errores (no se filtra HTML/PHP).
- `/apply-revision-to-engines payload vacio -> 400 EMPTY_PAYLOAD`.
- `/apply-revision-to-engines payload no-objeto (array) -> 400 VALIDATION_ERROR`.
- `/apply-revision-to-engines revisions:{} -> 200 ok`, `changed=0` por archivo (no-op no destructivo).
- `/apply-revision-to-engines payload demasiado grande -> 400 PAYLOAD_TOO_LARGE`.

### Resultado de pruebas
- `npm run test:security` -> 16/16 OK (antes 9, ahora 16).
- `npm test` (smoke completo) -> 41/41 OK (11 runtime + 10 db-read + 20 analytics).
- Roundtrip real en `engine_12V4000M40A.json` confirmado: write -> read -> restore sin residuos.

### Verificacion funcional contra la UI real
- `qa_milu.html` envia `{file,id,col,value}` via `js/data-loader.js::saveCellToServer`; el backend acepta `col` como alias de `field` (`payload.field ?? payload.col`) y normaliza `qa_revision_estado` / `qa_revision_accion` (incluye legacy `descartar -> eliminar`).
- Endpoints de escritura siempre devuelven JSON: validacion (`{ok:false,error:'VALIDATION_ERROR',code,field,message}`), error logico (`{error:'...'}`) o `{ok:true}`. No se devuelve nunca HTML ni el PHP legacy.
- Flujos comprobados sin regresion:
  - guardado de cambios desde `qa_milu.html` -> `/save-json` (alias `col`, alias `/save-json.php`).
  - aplicar revision masiva -> `/apply-revision-to-engines` (rechaza vacio, acepta `{revisions:{}}` como no-op).
  - actualizar `qa_revision_estado` / `qa_revision_accion` -> whitelist + normalizacion canonica.

### Cambio de comportamiento conocido (intencional, documentado)
- `POST /apply-revision-to-engines` con `{}` ahora responde 400 `EMPTY_PAYLOAD`. Antes (commit `742ca003`) devolvia `{ok:true}` con 0 cambios. Esta semantica esta alineada con `docs/security/PAYLOAD_VALIDATION.md` ("Payloads vacios bloqueados") y no rompe ningun flujo de UI: el frontend nunca envia `{}`, siempre `revisions` o el formato v2. Para el caso de "aplicar sin cambios" se debe usar `{revisions:{}}`.

### Estado BK-1
- **Cerrado.**
- Fase I queda funcionalmente validada con cobertura HTTP real (no solo unit-level).
- No quedan incidencias pendientes en el alcance BK-1. Siguiente bloque segun plan: UX-1 / DT-1.

### Archivos tocados
- `tests/security/write-validation.test.js` (7 tests nuevos, sin cambios de contrato).
- `docs/11_progreso_remediacion.md` (este bloque).
- `docs/security/PAYLOAD_VALIDATION.md` (nota de cobertura).
- `docs/security/WRITE_ENDPOINTS_AUDIT.md` (nota de cobertura).

---

## Cambio actual - Cierre UX-1 (vista compacta por defecto en QA)

### Objetivo aplicado
- Reducir ruido visual inicial de `qa_milu.html` manteniendo operativa completa y compatibilidad con la UI actual (incluyendo `?lazy=1`).

### Cambios principales
- `js/column-view.js`
   - Se redefine la vista `pdf` como **vista compacta operativa** por defecto (~12 columnas visibles):
      - `engine_model` (Libro)
      - `Source Page` (Pagina)
      - `POS`
      - `PART NO.`
      - `designation_final`
      - `QTY`
      - `qa_revision_estado`
      - `qa_revision_accion`
      - `measure_final`
      - `sust_status`
      - `sust_hierarchie`
      - `has_img`
   - Fix de persistencia: `loadColumnViewPreference()` ahora respeta la preferencia guardada (`qa|focus|pdf`) en lugar de forzar siempre el default.
- `qa_milu.html`
   - Se mantiene `value="pdf"` por compatibilidad, pero la etiqueta visible pasa de "Vista PDF" a "Vista compacta".
- `tests/smoke/http-smoke.test.js`
   - Smoke minimo frontend: `GET /qa_milu.html` verifica presencia de `#columnViewSelect` y opcion compacta (`value="pdf"`, etiqueta "Vista compacta").

### Compatibilidad y no regresion
- No se eliminan columnas del dataset ni del JSON.
- La vista completa sigue disponible por selector (`Vista QA`).
- No se toca backend ni contratos de payload.
- Flujos preservados: filtros, ordenacion, edicion inline/modal, guardado, revision, `apply-revision-to-engines`.
- Compatible con modo lazy (`?lazy=1`), ya que solo cambia orden/visibilidad en render.

### Verificacion
- `npm test` en verde tras el ajuste.
- Comprobacion manual de carga de `qa_milu.html`:
   - abre en vista compacta por defecto,
   - permite cambiar a `Vista QA` (completa) desde el selector.

### Estado UX-1
- **Cerrado.**

---

## Cambio actual - Cierre DT-1 (ruta base configurable en pipeline Python)

### Objetivo aplicado
- Desacoplar scripts Python de rutas absolutas/locales para ejecucion portable y reproducible (preparacion AR-3/AR-4/DT-3).

### Implementacion
- Nuevo helper compartido: `python_repo_paths.py`
   - `resolve_repo_dir(current_file=None)` con prioridad:
      1. `MILU_REPO_DIR` (si apunta a repo valido)
      2. busqueda ascendente desde `Path(__file__).resolve()` por marcadores de repo (`package.json`, `server.js`, `qa_milu.html`)
      3. fallback seguro al directorio del script
   - `should_log_repo_resolution()` usando `MILU_REPO_DEBUG=1|true|yes|on|debug`

### Scripts actualizados
- `depuracion_json.py`
   - elimina ruta hardcodeada absoluta
   - usa `resolve_repo_dir(__file__)`
   - agrega logging opcional de repo dir
   - encapsula ejecucion en `main()` + guard `if __name__ == "__main__"`
- `add_final_fields.py`
   - elimina ruta hardcodeada absoluta
   - usa `resolve_repo_dir(__file__)`
   - agrega logging opcional de repo dir
   - encapsula ejecucion en `main()` + guard
- `importar_json.py`
   - usa `resolve_repo_dir(__file__)` en lugar de asumir `Path(__file__).parent`
   - agrega traza opcional cuando `MILU_REPO_DEBUG` esta activo
- `estadisticas_articulos.py`
   - deja de depender de `cwd`; busca `engine_*.json` y `product-export-*.json` desde repo resuelto
- `informe_estadisticas.py`
   - idem anterior y genera `informe_estadisticas.txt` en la raiz del repo resuelto

### Compatibilidad y alcance
- No se cambiaron nombres de salida ni contratos JSON.
- No se toco backend (`server.js`).
- Se mantiene estructura actual del repo y carga de `engine_*.json`.

### Verificacion ejecutada
- Resolucion sin env:
   - `python -c "from python_repo_paths import resolve_repo_dir; print(resolve_repo_dir())"` -> raiz de repo correcta.
- Resolucion con env:
   - `MILU_REPO_DIR=<repo>`, `MILU_REPO_DEBUG=1` -> repo correcto y debug activo.
- Portabilidad desde otro `cwd` (`C:\`):
   - `python ...\estadisticas_articulos.py` -> OK
   - `python ...\informe_estadisticas.py` -> OK, output en raiz del repo
- `depuracion_json.py` importable sin side effects y con repo resuelto correctamente.

### Nota de incidencia
- `qa_html/` no existe en el repo actual (validado por comprobacion de paths). DT-1 no crea ni mueve carpetas por restriccion; se deja como observacion para AR-3/DT-3 si ese directorio pasa a ser requerido.

### Estado DT-1
- **Cerrado.**

---

## Cambio actual - Cierre QW-4 (lint minimo + check agregado)

### Objetivo aplicado
- Añadir validacion de calidad basica con **cero friccion** y sin introducir un framework pesado.

### Cambios principales
- `scripts/lint-critical.js` (nuevo)
   - Ejecuta `node --check` para sintaxis JS en:
      - `server.js`
      - frontend principal de QA (`js/qa-milu.js`, `js/qa-table.js`, `js/data-loader.js`, `js/revision.js`, `js/column-view.js`, `js/cell-editor.js`, `js/helpers.js`, `js/state.js`, `js/schemas.js`, `js/pdf-viewer.js`)
      - `tests/**/*.js`
   - No aplica reglas de estilo ni formateo; solo errores de sintaxis (alcance QW-4).
- `package.json`
   - Nuevo script: `npm run lint` -> `node scripts/lint-critical.js`
   - Nuevo script: `npm run check` -> `npm run lint && npm test`

### Verificacion
- `npm run lint` -> OK
- `npm test` -> OK
- `npm run check` -> OK

### Alcance y restricciones
- Sin cambios de logica funcional.
- Sin cambios de contratos JSON.
- Sin dependencias nuevas ni framework de lint pesado.
- Sin refactor masivo ni reglas estéticas agresivas.

### Estado QW-4
- **Cerrado.**

---

## Cambio actual - AR-4 CI minimo (GitHub Actions)

### Objetivo aplicado
- Añadir una base de CI minima para protecciones futuras de rama, reutilizando `npm run check`.

### Cambios principales
- Nuevo workflow: `.github/workflows/ci.yml`
   - Triggers:
      - `push` a `main`
      - `pull_request`
   - Runtime:
      - `ubuntu-latest`
      - `actions/setup-node@v4` con Node.js `20`
   - Instalacion de dependencias:
      - `npm ci` si existe `package-lock.json`
      - `npm install` si no existe lockfile
   - Verificacion:
      - `npm run check`

### Alcance y restricciones
- Sin despliegue.
- Sin jobs complejos.
- Sin cambios de logica de aplicacion.
- Sin cambios de contratos JSON.

### Validacion local
- `npm run check` -> OK

### Estado AR-4
- **Implementado localmente.**
- **Pendiente validacion remota en GitHub** (primera ejecucion tras push/PR).

