# Plan de Remediación MILU — Mayo 2026

Plan derivado de [09_auditoria_2026.md](09_auditoria_2026.md). Se organiza por bloques accionables, no por meses.
Cada tarea incluye: descripción, impacto, dificultad, prioridad y dependencias.

> Estado en rama `feat/milu-auditoria-remediacion` documentado en [11_progreso_remediacion.md](11_progreso_remediacion.md).

Leyenda:
- Prioridad: 🔴 alta · 🟡 media · 🟢 baja
- Dificultad: S (≤ 1 jornada) · M (2-5 jornadas) · L (más de una semana)

---

## Bloque 1 — Quick Wins (rama actual o siguiente PR pequeña)

### QW-1. Eliminar handlers duplicados en `server.js` ✅ HECHO
- Estado: aplicado en commit `742ca003`.
- Detalle: solo queda un `app.post('/recompute-pdf-auto', ...)`.

### QW-2. Implementar `/qa_revision_sync.php` y `/apply-revision-to-engines` en Express ✅ HECHO
- Estado: aplicado en commit `742ca003`.
- Detalle: el archivo PHP físico ya no se sirve; Express responde JSON.

### QW-3. Sincronizar documentación con código real ✅ HECHO
- Estado: este PR (8→9 motores, `measurement_final`→`measure_final`).
- Archivos: [00_overview.md](00_overview.md), [02_data_flow.md](02_data_flow.md), [03_data_models.md](03_data_models.md), [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md).

### QW-4. Configurar lint mínimo ✅ HECHO
- Acción: `npm run lint` ligero basado en `node --check` para `server.js`, frontend crítico de `qa_milu.html` y `tests/**/*.js`.
- Impacto: detección temprana de errores de sintaxis sin introducir fricción ni reglas estéticas agresivas.
- Dificultad: S · Prioridad: 🟡 · Depende de: nada.

### QW-5. Consolidar `npm test` + smoke tests oficiales ✅ HECHO
- Estado: consolidado con `npm test` apuntando a `test:all-smoke`.
- Acción: `node --test` (nativo, sin deps) para suites HTTP runtime, `/db` read y `/db/analytics`.
- Cobertura y guía: `docs/testing/README.md`, `docs/testing/SMOKE_TEST_MATRIX.md`, `docs/testing/QW5_CIERRE.md`.
- Impacto: línea base estable para refactor seguro y futura CI.
- Dificultad: S · Prioridad: 🔴 · Depende de: nada.

### QW-6. Suprimir `alert()` en flujos no críticos
- Acción: sustituir por toasts o por `console.warn` cuando sea informativo.
- Impacto: QA más fluido.
- Dificultad: M (152 ocurrencias) · Prioridad: 🟡 · Depende de: pequeño componente toast.

---

## Bloque 2 — Endurecimiento del backend

### BK-1. Validación de payloads en `/save-json` y `/apply-revision-to-engines` ✅ HECHO
- Acción: validar `engine_file ∈ ENGINE_JSON_FILES`, `field` en allowlist por contexto, tipos de `value`.
- Impacto: evita escritura accidental fuera de campos esperados.
- Dificultad: S · Prioridad: 🔴 · Depende de: definición de allowlist.

### BK-2. Eliminar archivos `.php` físicos del repo o moverlos a `legacy/`
- Acción: ya no se ejecutan; mover a `legacy/php/` para que el static middleware nunca los exponga.
- Dificultad: S · Prioridad: 🟡 · Depende de: BK-1 confirmado en uso.

### BK-3. Activar `compression` y caching de respuestas estáticas grandes
- Acción: middleware `compression` + `Cache-Control: no-cache` en `engine_*.json` para que el navegador valide con `If-Modified-Since`.
- Impacto: cargas iniciales más rápidas en localhost (y vital si se publica).
- Dificultad: S · Prioridad: 🟡.

### BK-4. Healthcheck enriquecido
- Acción: `/health` actual sólo confirma vida. Ampliar a `/health?deep=1` con: nº filas por motor, último `qa_revision_updated_at`, tamaño de `qa_revision_server_data.json`.
- Dificultad: S · Prioridad: 🟢.

### BK-5. Capa de logging estructurado
- Acción: `pino` o equivalente; reemplazar `console.log` ad-hoc.
- Dificultad: S · Prioridad: 🟢.

---

## Bloque 3 — Datos y pipeline

### DT-1. Configurar ruta base en `depuracion_json.py` ✅ HECHO
- Acción: usar `Path(__file__).resolve().parent` o variable de entorno `MILU_REPO_DIR`.
- Archivos: [depuracion_json.py](../depuracion_json.py#L12), [add_final_fields.py](../add_final_fields.py).
- Impacto: portabilidad, ejecutable en CI.
- Dificultad: S · Prioridad: 🔴.

### DT-2. Esquema JSON para `engine_*.json`
- Acción: definir `schemas/engine_row.schema.json` y validador (`ajv` en Node, `jsonschema` en Python).
- Impacto: detecta campos huérfanos / typos antes de persistir.
- Dificultad: M · Prioridad: 🟡 · Depende de: inventario actual de campos.
- **Estado: ✅ IMPLEMENTADO** (2026-05-13)
  - `schemas/engine-record.schema.json` (JSON Schema draft-07, 67 campos, 112 propiedades documentadas)
  - `scripts/validate-engine-schema.js` (validador Node sin dependencias externas)
  - `tests/smoke/engine-schema.test.js` (8 tests, integrado en `npm test`)
  - `npm run validate:schema` — 67.883 registros, 0 errores
  - `docs/modules/engine_schema.md` — documentación completa

### DT-3. Snapshots versionados de los `engine_*.json`
- Acción: en cada `pretty_print_all_json.py` o tras `apply-revision-to-engines`, generar snapshot en `snapshots/YYYY-MM-DD/` (sólo diff o tar.gz).
- Impacto: reversibilidad, auditoría de QA.
- Dificultad: M · Prioridad: 🟡.
- **Estado: ✅ IMPLEMENTADO** (2026-05-13)
  - `scripts/create-data-snapshot.js` — copia engines + manifest con SHA-256, nº registros, schema_version, label
  - `scripts/compare-data-snapshot.js` — compara snapshot vs estado actual (checksum, registros, añadidos/eliminados)
  - `data/snapshots/` con `.gitkeep` (contenido excluido del repo)
  - `npm run data:snapshot` / `npm run data:snapshot:compare`
  - Snapshot inicial `DT-3-initial` creado: 9 engines, 67.883 registros, schema 1.0

### DT-4. Mover backups y JSON crudos fuera de la raíz
- Acción: `engine_*.json.backup`, `*.pre_id_fix_backup` → `zz_old/backups/<fecha>/`.
- Impacto: raíz legible, menos confusión sobre cuál es la fuente viva.
- Dificultad: S · Prioridad: 🟡.

### DT-5. Unificar `descartar` vs `eliminar`
- Acción: alinear `analista_02.js` con la UI principal (`eliminar`). Documentar en [milu-revision-estado-accion.md](file:///memories/repo/milu-revision-estado-accion.md).
- Dificultad: S · Prioridad: 🟡.

### DT-6. Mejorar completitud de `measure_final`
- Estado actual: 64,56 %.
- Acción: revisar reglas de fallback en [depuracion_json.py](../depuracion_json.py#L347); registrar en QA los motores con peor completitud.
- Dificultad: M · Prioridad: 🟡.

### DT-7. Pipeline export WordPress QA-only ✅ ACTUALIZADO
- Estado: simplificado a decision QA humana por PN global.
- Acción: mantener `npm run export:wordpress` como unico flujo oficial.
- Entregables base: `data/output/wordpress/*`.
- Legacy archivado: `legacy/export_complex_ai/*`.
- Scripts: `npm run export:wordpress`, `npm run legacy:ai:conflicts`.
- Dificultad: M · Prioridad: 🔴.

---

## Bloque 4 — UX / Frontend

### UX-1. Vista compacta por defecto (≤ 12 columnas) ✅ HECHO
- Acción: forzar `column-view = 'compact'` en primera carga; menú "Avanzado" para abrir las 54 columnas.
- Dificultad: S · Prioridad: 🔴 · Depende de: ya existe `column-view.js`.

### UX-2. Virtualización de tabla ✅ IMPLEMENTADO (validado manual)
- Acción: virtualización nativa por ventana + overscan (sin dependencia pesada), activa al desactivar paginación y superar umbral de filas.
- Impacto: render fluido con miles de filas al evitar inyectar todo el DOM de una sola vez.
- Nota: incluye compatibilidad con selección por teclado y enfoque de fila seleccionada; modo debug opcional con `?virtualDebug=1` o `localStorage.miluVirtualDebug='1'`.
- Validación: smoke manual reproducible en `docs/testing/UX2_VIRTUALIZACION_MANUAL_SMOKE.md`.
- Dificultad: M · Prioridad: 🟡 · Depende de: UX-1 (menos columnas = menos cost por fila).

### UX-3. Sustituir `alert()` por sistema de toasts
- Acción: componente único `notify(level, msg)`. Reemplazar las 152 ocurrencias.
- Dificultad: M · Prioridad: 🟡.

### UX-4. Confirmación tipada para acciones irreversibles
- Acción: para "borrar revisión" o "recalcular todos los PDFs", pedir teclear el motor o palabra clave.
- Dificultad: S · Prioridad: 🟡.

### UX-5. Unificar idioma de etiquetas
- Acción: glosario único (preferencia: español en UI, inglés en claves de datos).
- Dificultad: M · Prioridad: 🟢.

### UX-6. Atajos documentados in situ
- Acción: tooltip o panel de ayuda con los botones rápidos (`V/?/X/OK/Clear`).
- Dificultad: S · Prioridad: 🟢.

---

## Bloque 5 — Arquitectura y escalabilidad

### AR-1. Carga incremental de motores
- Estado: **infraestructura + UI mínima ✅**.
- Detalle: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md). Endpoint `GET /engines`, helpers `fetchEngineCatalog` y `loadEnginesByFileNames`, feature flag `?lazy=1`, panel UI con badge + selector + botones de carga.
- Acción siguiente: métricas TTFR comparativas y conmutador visual sin URL param.
- Dificultad: L · Prioridad: 🔴 · Depende de: UX-1, UX-2.

### AR-2. Separar capas
- Acción: introducir `domain/`, `services/`, `infra/` en backend; mover lógica de revisión y de aplicación masiva fuera de `server.js`.
- Dificultad: M · Prioridad: 🟡.
- **Estado: 🟡 INICIADO** (2026-05-13)
  - Fase 1 aplicada: extraída la lógica de normalización/persistencia de `qa_revision_sync.php` a `server/services/revision-sync.js`.
  - Fase 2 aplicada: extraída la orquestación de aplicación de revisiones a `server/services/revision-apply.js`.
  - Fase 3 aplicada: encapsulado el estado/cache de PN review QA a `server/services/pn-review-qa-cache.js` (contiene toda la lógica de construcción de índice con helper functions internas).
  - `server.js` mantiene rutas y contratos HTTP; Express queda más fino en todos los flujos.
  - Alcance deliberadamente limitado en las 3 fases: no se toca backend no relacionado, ni la UI, ni la persistencia de `engine_*.json`.
  - Validación focalizada: `npm run test:smoke` 12/12 OK y `node --test tests/security/write-validation.test.js` 16/16 OK.
  - Commits: 92ab4071 (fases 1-2) + 48468220 (fase 3).
  - Siguiente corte recomendado: extraer audit-log helpers o analytics-cache (ambas son pequeñas); decidir si hacer una fase 4 menor o cerrar AR-2 después.

### AR-3. Aislar pipelines Python
- Acción: mover scripts a `pipelines/` y publicar un único entrypoint `pipelines/run_full.py` que orqueste el flujo oficial.
- Dificultad: M · Prioridad: 🟡.
- **Estado: ✅ CERRADO** (2026-05-13)
  - `python_lib/` creado como capa común incremental (sin refactor masivo de pipelines)
  - Módulos nuevos: `repo_paths.py`, `json_io.py`, `engine_helpers.py`, `logging_utils.py`, `schema_validation.py`, `snapshot_utils.py`, `engine_constants.py`
  - Scripts criticos migrados de forma segura: `depuracion_json.py`, `add_final_fields.py`, `importar_json.py`, `estadisticas_articulos.py`, `informe_estadisticas.py`, `convert_engine_to_excel.py`, `convert_engines.py`, `convert_excel_to_json.py`
  - Tests nuevos: `tests/smoke/python-lib.test.js` (helpers Python reutilizables) y `tests/smoke/python-exporters-smoke.test.js` (smoke de exportadores concretos)
  - El cierre aplica al conjunto crítico migrado de scripts Python que comparten IO/path/helpers comunes.
  - Quedan fuera del alcance de cierre AR-3: `extraccion_de_pdf_a_excel/*` y utilidades legacy auditadas (`compare_measurements.py`, `validate_engine_jsons.py`, `pretty_print_all_json.py`, `marcar_articulos_en_web.py`). Se documentan como deuda técnica futura, no como bloqueo.
  - Deuda restante: entrypoint/orquestación única (`pipelines/run_full.py`) y eventual migración de utilidades legacy fuera del flujo crítico
  - Criterio formal de cierre AR-3:
    - scripts críticos migrados a `python_lib` para IO/path/helpers comunes
    - `python -m py_compile` OK sobre `python_lib/` y exportadores críticos migrados
    - `npm run validate:schema` OK (0 errores)
    - `npm run data:snapshot:compare` OK (sin cambios)
    - `npm run check` OK

### AR-4. CI mínimo (GitHub Actions o local) ✅ IMPLEMENTADO
- Acción: workflow en `.github/workflows/ci.yml` que ejecuta `npm run check` en `push` a `main` y en `pull_request`.
- Nota: pendiente primera validación remota en GitHub tras push/PR.
- Dificultad: S · Prioridad: 🟡 · Depende de: QW-4, QW-5.

### AR-5. Revisar dependencia con WordPress / publicación externa
- Acción: documentar pipeline `dist/milu_publish/` y aclarar si forma parte del runtime.
- Dificultad: S · Prioridad: 🟢.

---

## Resumen ordenado por prioridad

| Prioridad | Tarea | Estado |
|-----------|-------|--------|
| 🔴 | QW-1 Eliminar duplicados `/recompute-pdf-auto` | ✅ |
| 🔴 | QW-2 Endpoints revisión en Express | ✅ |
| 🔴 | QW-3 Sincronizar docs | ✅ |
| 🔴 | QW-5 Smoke tests oficiales | ✅ |
| 🔴 | BK-1 Validación de payloads | ✅ |
| 🔴 | DT-1 Path configurable en pipeline | ✅ |
| 🔴 | UX-1 Vista compacta por defecto | ✅ |
| 🔴 | AR-1 Carga incremental | ✅ |
| 🟡 | QW-6 Toasts, BK-2/3, DT-4/5/6, UX-3/4, AR-2 | Pendiente |
| 🟡 | AR-3 Unificación progresiva pipelines Python | ✅ CERRADO |
| 🟡 | DT-3 Snapshots versionados engine_*.json | ✅ IMPLEMENTADO |
| 🟡 | DT-2 Esquema JSON formal engine_*.json | ✅ IMPLEMENTADO |

| 🟢 | BK-4/5, UX-5/6, AR-5 | Pendiente |

## Estado fase I - Payload Validation + Write Safety

- Estado: en curso (I.1-I.10 implementado en rama local, pendiente validacion funcional manual UI completa).
- Entregables base:
	- `server/validation/*`
	- `tests/security/write-validation.test.js`
	- `docs/security/PAYLOAD_VALIDATION.md`
	- `docs/security/WRITE_ENDPOINTS_AUDIT.md`
	- `data/output/validation/payload_validation_report.md`

---

## Criterios de aceptación globales

1. `npm test` pasa sin errores tras cada bloque.
2. La UI sigue funcional contra `http://localhost:3000/qa_milu.html` después de cada cambio.
3. Los `engine_*.json` no se modifican sin que pase por `/save-json` o el pipeline oficial.
4. Cada tarea cerrada actualiza [11_progreso_remediacion.md](11_progreso_remediacion.md).
