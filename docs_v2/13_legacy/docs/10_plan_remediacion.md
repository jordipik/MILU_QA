# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Plan de RemediaciÃ³n MILU â€” Mayo 2026

Plan derivado de [09_auditoria_2026.md](09_auditoria_2026.md). Se organiza por bloques accionables, no por meses.
Cada tarea incluye: descripciÃ³n, impacto, dificultad, prioridad y dependencias.

> Estado en rama `feat/milu-auditoria-remediacion` documentado en [11_progreso_remediacion.md](11_progreso_remediacion.md).

Leyenda:
- Prioridad: ðŸ”´ alta Â· ðŸŸ¡ media Â· ðŸŸ¢ baja
- Dificultad: S (â‰¤ 1 jornada) Â· M (2-5 jornadas) Â· L (mÃ¡s de una semana)

---

## Bloque 1 â€” Quick Wins (rama actual o siguiente PR pequeÃ±a)

### QW-1. Eliminar handlers duplicados en `server.js` âœ… HECHO
- Estado: aplicado en commit `742ca003`.
- Detalle: solo queda un `app.post('/recompute-pdf-auto', ...)`.

### QW-2. Implementar `/qa_revision_sync.php` y `/apply-revision-to-engines` en Express âœ… HECHO
- Estado: aplicado en commit `742ca003`.
- Detalle: el archivo PHP fÃ­sico ya no se sirve; Express responde JSON.

### QW-3. Sincronizar documentaciÃ³n con cÃ³digo real âœ… HECHO
- Estado: este PR (8â†’9 motores, `measurement_final`â†’`measure_final`).
- Archivos: [00_overview.md](00_overview.md), [02_data_flow.md](02_data_flow.md), [03_data_models.md](03_data_models.md), [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md).

### QW-4. Configurar lint mÃ­nimo âœ… HECHO
- AcciÃ³n: `npm run lint` ligero basado en `node --check` para `server.js`, frontend crÃ­tico de `qa_milu.html` y `tests/**/*.js`.
- Impacto: detecciÃ³n temprana de errores de sintaxis sin introducir fricciÃ³n ni reglas estÃ©ticas agresivas.
- Dificultad: S Â· Prioridad: ðŸŸ¡ Â· Depende de: nada.

### QW-5. Consolidar `npm test` + smoke tests oficiales âœ… HECHO
- Estado: consolidado con `npm test` apuntando a `test:all-smoke`.
- AcciÃ³n: `node --test` (nativo, sin deps) para suites HTTP runtime, `/db` read y `/db/analytics`.
- Cobertura y guÃ­a: `docs/testing/README.md`, `docs/testing/SMOKE_TEST_MATRIX.md`, `docs/testing/QW5_CIERRE.md`.
- Impacto: lÃ­nea base estable para refactor seguro y futura CI.
- Dificultad: S Â· Prioridad: ðŸ”´ Â· Depende de: nada.

### QW-6. Suprimir `alert()` en flujos no crÃ­ticos
- AcciÃ³n: sustituir por toasts o por `console.warn` cuando sea informativo.
- Impacto: QA mÃ¡s fluido.
- Dificultad: M (152 ocurrencias) Â· Prioridad: ðŸŸ¡ Â· Depende de: pequeÃ±o componente toast.

---

## Bloque 2 â€” Endurecimiento del backend

### BK-1. ValidaciÃ³n de payloads en `/save-json` y `/apply-revision-to-engines` âœ… HECHO
- AcciÃ³n: validar `engine_file âˆˆ ENGINE_JSON_FILES`, `field` en allowlist por contexto, tipos de `value`.
- Impacto: evita escritura accidental fuera de campos esperados.
- Dificultad: S Â· Prioridad: ðŸ”´ Â· Depende de: definiciÃ³n de allowlist.

### BK-2. Eliminar archivos `.php` fÃ­sicos del repo o moverlos a `legacy/`
- AcciÃ³n: ya no se ejecutan; mover a `legacy/php/` para que el static middleware nunca los exponga.
- Dificultad: S Â· Prioridad: ðŸŸ¡ Â· Depende de: BK-1 confirmado en uso.
- **Estado: âœ… COMPLETADO** (2026-05-13)
  - Movidos: `qa_revision_sync.php` y `save-json.php` desde raÃ­z a `legacy/php/`.
  - Compatibilidad mantenida: Express sigue atendiendo `GET|POST /qa_revision_sync.php` y `GET|POST /save-json.php`.
  - PublicaciÃ³n legacy mantenida: `scripts/prepare-pages-dist.js` usa fallback de origen en `legacy/php/` y conserva ambos `.php` en la raÃ­z de `dist/milu_publish/`.
  - ValidaciÃ³n: `npm test` y `npm run test:all-smoke` en verde.
  - Rollback correcto:
    - `git mv legacy/php/qa_revision_sync.php qa_revision_sync.php`
    - `git mv legacy/php/save-json.php save-json.php`

### BK-3. Activar `compression` y caching de respuestas estÃ¡ticas grandes
- AcciÃ³n: middleware `compression` + `Cache-Control: no-cache` en `engine_*.json` para que el navegador valide con `If-Modified-Since`.
- Impacto: cargas iniciales mÃ¡s rÃ¡pidas en localhost (y vital si se publica).
- Dificultad: S Â· Prioridad: ðŸŸ¡.

### BK-4. Healthcheck enriquecido
- AcciÃ³n: `/health` actual sÃ³lo confirma vida. Ampliar a `/health?deep=1` con: nÂº filas por motor, Ãºltimo `qa_revision_updated_at`, tamaÃ±o de `qa_revision_server_data.json`.
- Dificultad: S Â· Prioridad: ðŸŸ¢.

### BK-5. Capa de logging estructurado
- AcciÃ³n: `pino` o equivalente; reemplazar `console.log` ad-hoc.
- Dificultad: S Â· Prioridad: ðŸŸ¢.

---

## Bloque 3 â€” Datos y pipeline

### DT-1. Configurar ruta base en `depuracion_json.py` âœ… HECHO
- AcciÃ³n: usar `Path(__file__).resolve().parent` o variable de entorno `MILU_REPO_DIR`.
- Archivos: [depuracion_json.py](../depuracion_json.py#L12), [add_final_fields.py](../add_final_fields.py).
- Impacto: portabilidad, ejecutable en CI.
- Dificultad: S Â· Prioridad: ðŸ”´.

### DT-2. Esquema JSON para `engine_*.json`
- AcciÃ³n: definir `schemas/engine_row.schema.json` y validador (`ajv` en Node, `jsonschema` en Python).
- Impacto: detecta campos huÃ©rfanos / typos antes de persistir.
- Dificultad: M Â· Prioridad: ðŸŸ¡ Â· Depende de: inventario actual de campos.
- **Estado: âœ… IMPLEMENTADO** (2026-05-13)
  - `schemas/engine-record.schema.json` (JSON Schema draft-07, 67 campos, 112 propiedades documentadas)
  - `scripts/validate-engine-schema.js` (validador Node sin dependencias externas)
  - `tests/smoke/engine-schema.test.js` (8 tests, integrado en `npm test`)
  - `npm run validate:schema` â€” 67.883 registros, 0 errores
  - `docs/modules/engine_schema.md` â€” documentaciÃ³n completa

### DT-3. Snapshots versionados de los `engine_*.json`
- AcciÃ³n: en cada `pretty_print_all_json.py` o tras `apply-revision-to-engines`, generar snapshot en `snapshots/YYYY-MM-DD/` (sÃ³lo diff o tar.gz).
- Impacto: reversibilidad, auditorÃ­a de QA.
- Dificultad: M Â· Prioridad: ðŸŸ¡.
- **Estado: âœ… IMPLEMENTADO** (2026-05-13)
  - `scripts/create-data-snapshot.js` â€” copia engines + manifest con SHA-256, nÂº registros, schema_version, label
  - `scripts/compare-data-snapshot.js` â€” compara snapshot vs estado actual (checksum, registros, aÃ±adidos/eliminados)
  - `data/snapshots/` con `.gitkeep` (contenido excluido del repo)
  - `npm run data:snapshot` / `npm run data:snapshot:compare`
  - Snapshot inicial `DT-3-initial` creado: 9 engines, 67.883 registros, schema 1.0

### DT-4. Mover backups y JSON crudos fuera de la raÃ­z
- AcciÃ³n: `engine_*.json.backup`, `*.pre_id_fix_backup` â†’ `zz_old/backups/<fecha>/`.
- Impacto: raÃ­z legible, menos confusiÃ³n sobre cuÃ¡l es la fuente viva.
- Dificultad: S Â· Prioridad: ðŸŸ¡.

### DT-5. Unificar `descartar` vs `eliminar`
- AcciÃ³n: alinear `analista_02.js` con la UI principal (`eliminar`). Documentar en [milu-revision-estado-accion.md](file:///memories/repo/milu-revision-estado-accion.md).
- Dificultad: S Â· Prioridad: ðŸŸ¡.

### DT-6. Mejorar completitud de `measure_final`
- Estado actual: 64,56 %.
- AcciÃ³n: revisar reglas de fallback en [depuracion_json.py](../depuracion_json.py#L347); registrar en QA los motores con peor completitud.
- Dificultad: M Â· Prioridad: ðŸŸ¡.

### DT-7. Pipeline export WordPress QA-only âœ… ACTUALIZADO
- Estado: simplificado a decision QA humana por PN global.
- AcciÃ³n: mantener `npm run export:wordpress` como unico flujo oficial.
- Entregables base: `data/output/wordpress/*`.
- Legacy archivado: `legacy/export_complex_ai/*`.
- Scripts: `npm run export:wordpress`, `npm run legacy:ai:conflicts`.
- Dificultad: M Â· Prioridad: ðŸ”´.

---

## Bloque 4 â€” UX / Frontend

### UX-1. Vista compacta por defecto (â‰¤ 12 columnas) âœ… HECHO
- AcciÃ³n: forzar `column-view = 'compact'` en primera carga; menÃº "Avanzado" para abrir las 54 columnas.
- Dificultad: S Â· Prioridad: ðŸ”´ Â· Depende de: ya existe `column-view.js`.

### UX-2. VirtualizaciÃ³n de tabla âœ… IMPLEMENTADO (validado manual)
- AcciÃ³n: virtualizaciÃ³n nativa por ventana + overscan (sin dependencia pesada), activa al desactivar paginaciÃ³n y superar umbral de filas.
- Impacto: render fluido con miles de filas al evitar inyectar todo el DOM de una sola vez.
- Nota: incluye compatibilidad con selecciÃ³n por teclado y enfoque de fila seleccionada; modo debug opcional con `?virtualDebug=1` o `localStorage.miluVirtualDebug='1'`.
- ValidaciÃ³n: smoke manual reproducible en `docs/testing/UX2_VIRTUALIZACION_MANUAL_SMOKE.md`.
- Dificultad: M Â· Prioridad: ðŸŸ¡ Â· Depende de: UX-1 (menos columnas = menos cost por fila).

### UX-3. Sustituir `alert()` por sistema de toasts
- AcciÃ³n: componente Ãºnico `notify(level, msg)`. Reemplazar las 152 ocurrencias.
- Dificultad: M Â· Prioridad: ðŸŸ¡.
- **Estado: âœ… COMPLETADO (fase 1 + fase 2)** (2026-05-13)
  - Helper central: `js/toast.js` con `showToast(message, type, options)`.
  - Fase 1: adaptador local de alertas no destructivas en:
    - `js/qa-milu.js`
    - `js/analista-02.js`
    - `js/qa-analista-registro.js`
  - Fase 2: migradas las 8 alertas directas restantes en:
    - `js/bulk-revision-helper.js` (4)
    - `js/cell-editor.js` (3)
    - `js/revision.js` (1)
  - Resultado runtime: `alert(` aproximado de 109 -> 101, quedando solo llamadas canalizadas por adaptadores locales documentados (sin alertas directas fuera de adaptadores/fallback).
  - Confirmaciones crÃ­ticas/prompt funcionales no tocados (UX-4 intacto).
  - ValidaciÃ³n ejecutada: `npm test`, `npm run test:all-smoke`, `npm run test:security`.

### UX-4. ConfirmaciÃ³n tipada para acciones irreversibles
- AcciÃ³n: para "borrar revisiÃ³n" o "recalcular todos los PDFs", pedir teclear el motor o palabra clave.
- Dificultad: S Â· Prioridad: ðŸŸ¡.
- **Estado: âœ… IMPLEMENTADO (fase UX-4 inicial)** (2026-05-13)
  - Helper central: `js/confirm-typed-action.js`.
  - Integrado en acciones crÃ­ticas:
    - cambios masivos en `qa_milu` (`applyBulkQuickMode`)
    - recÃ¡lculo de libro completo en `analista-02`
    - propagaciÃ³n masiva por PN del libro en `analista-02`
    - borrado total de auditorÃ­a en `qa-auditoria`
    - decisiones PN review (`pn-review.js` y `pn-review-embedded.js`)
  - Cobertura de palabras tipadas: `BORRAR`, `DESCARTAR`, `RESET`, `APLICAR`.
  - ValidaciÃ³n ejecutada: `npm test`, `npm run test:all-smoke`, `npm run test:security`.

### UX-5. Unificar idioma de etiquetas
- AcciÃ³n: glosario Ãºnico (preferencia: espaÃ±ol en UI, inglÃ©s en claves de datos).
- Dificultad: M Â· Prioridad: ðŸŸ¢.

### UX-6. Atajos documentados in situ
- AcciÃ³n: tooltip o panel de ayuda con los botones rÃ¡pidos (`V/?/X/OK/Clear`).
- Dificultad: S Â· Prioridad: ðŸŸ¢.

---

## Bloque 5 â€” Arquitectura y escalabilidad

### AR-1. Carga incremental de motores
- Estado: **infraestructura + UI mÃ­nima âœ…**.
- Detalle: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md). Endpoint `GET /engines`, helpers `fetchEngineCatalog` y `loadEnginesByFileNames`, feature flag `?lazy=1`, panel UI con badge + selector + botones de carga.
- AcciÃ³n siguiente: mÃ©tricas TTFR comparativas y conmutador visual sin URL param.
- Dificultad: L Â· Prioridad: ðŸ”´ Â· Depende de: UX-1, UX-2.

### AR-2. Separar capas
- AcciÃ³n: introducir `domain/`, `services/`, `infra/` en backend; mover lÃ³gica de revisiÃ³n y de aplicaciÃ³n masiva fuera de `server.js`.
- Dificultad: M Â· Prioridad: ðŸŸ¡.
- **Estado: âœ… CERRADO** (2026-05-13)
  - Fase 1: `server/services/revision-sync.js` â€” normalizaciÃ³n y persistencia de revisiones QA.
  - Fase 2: `server/services/revision-apply.js` â€” orquestaciÃ³n de aplicaciÃ³n masiva de revisiones.
  - Fase 3: `server/services/pn-review-qa-cache.js` â€” factory de cache/Ã­ndice de PN review con helpers internos.
  - Fase 4 (cierre): correcciÃ³n de bug crÃ­tico (`ensurePnReviewQaDataLoaded` â†’ `pnReviewQaCacheService.load()` en `GET /pn-review/:sku/sources`). No detectado por smoke tests previos porque el endpoint no estaba cubierto.
  - D7 resuelto: `tests/smoke/http-smoke.test.js` ahora cubre `GET /pn-review/:sku/sources` derivando un SKU real desde `GET /pn-review/list`.
  - D3 resuelto: `handleSaveJson` usa `writeJsonAtomic(filePath, json)` y conserva formato/contrato de `/save-json`.
  - D4 resuelto: `/pn-review/:sku/apply-decision` y `/pn-review/by-id/:id/apply-decision` ejecutan su secciÃ³n crÃ­tica bajo `withSaveJsonFileLock(file, ...)`.
  - `server.js` conserva solo wiring HTTP y helpers de utilidad ligeros.
  - Alcance deliberado: sin cambios en UI, contratos HTTP ni estructura JSON.
  - ValidaciÃ³n final: `npm test` 69/69 OK (13 smoke + 10 db-read + 20 db-analytics + 8 schema + 16 python-lib + 2 python-exporters).
  - Deuda residual documentada (no bloqueante): `decisionMap`/`explicitMap` duplicados Ã— 2 endpoints; helpers de normalizaciÃ³n duplicados entre `server.js` y `pn-review-qa-cache.js`; `_esquemasPosIndexCache` sin invalidaciÃ³n explÃ­cita; `exportRunState` mutable sin reset ante crash.
  - Criterio de cierre: separaciÃ³n de capas conseguida para los 3 dominios principales; `server.js` ~2.100 lÃ­neas (reducido desde ~2.400); 0 tests rotos; contratos HTTP intactos.

### AR-3. Aislar pipelines Python
- AcciÃ³n: mover scripts a `pipelines/` y publicar un Ãºnico entrypoint `pipelines/run_full.py` que orqueste el flujo oficial.
- Dificultad: M Â· Prioridad: ðŸŸ¡.
- **Estado: âœ… CERRADO** (2026-05-13)
  - `python_lib/` creado como capa comÃºn incremental (sin refactor masivo de pipelines)
  - MÃ³dulos nuevos: `repo_paths.py`, `json_io.py`, `engine_helpers.py`, `logging_utils.py`, `schema_validation.py`, `snapshot_utils.py`, `engine_constants.py`
  - Scripts criticos migrados de forma segura: `depuracion_json.py`, `add_final_fields.py`, `importar_json.py`, `estadisticas_articulos.py`, `informe_estadisticas.py`, `convert_engine_to_excel.py`, `convert_engines.py`, `convert_excel_to_json.py`
  - Tests nuevos: `tests/smoke/python-lib.test.js` (helpers Python reutilizables) y `tests/smoke/python-exporters-smoke.test.js` (smoke de exportadores concretos)
  - El cierre aplica al conjunto crÃ­tico migrado de scripts Python que comparten IO/path/helpers comunes.
  - Quedan fuera del alcance de cierre AR-3: `extraccion_de_pdf_a_excel/*` y utilidades legacy auditadas (`compare_measurements.py`, `validate_engine_jsons.py`, `pretty_print_all_json.py`, `marcar_articulos_en_web.py`). Se documentan como deuda tÃ©cnica futura, no como bloqueo.
  - Deuda restante: entrypoint/orquestaciÃ³n Ãºnica (`pipelines/run_full.py`) y eventual migraciÃ³n de utilidades legacy fuera del flujo crÃ­tico
  - Criterio formal de cierre AR-3:
    - scripts crÃ­ticos migrados a `python_lib` para IO/path/helpers comunes
    - `python -m py_compile` OK sobre `python_lib/` y exportadores crÃ­ticos migrados
    - `npm run validate:schema` OK (0 errores)
    - `npm run data:snapshot:compare` OK (sin cambios)
    - `npm run check` OK

### AR-4. CI mÃ­nimo (GitHub Actions o local) âœ… IMPLEMENTADO
- AcciÃ³n: workflow en `.github/workflows/ci.yml` que ejecuta `npm run check` en `push` a `main` y en `pull_request`.
- Nota: pendiente primera validaciÃ³n remota en GitHub tras push/PR.
- Dificultad: S Â· Prioridad: ðŸŸ¡ Â· Depende de: QW-4, QW-5.

### AR-5. Revisar dependencia con WordPress / publicaciÃ³n externa
- AcciÃ³n: documentar pipeline `dist/milu_publish/` y aclarar si forma parte del runtime.
- Dificultad: S Â· Prioridad: ðŸŸ¢.

---

## Resumen ordenado por prioridad

| Prioridad | Tarea | Estado |
|-----------|-------|--------|
| ðŸ”´ | QW-1 Eliminar duplicados `/recompute-pdf-auto` | âœ… |
| ðŸ”´ | QW-2 Endpoints revisiÃ³n en Express | âœ… |
| ðŸ”´ | QW-3 Sincronizar docs | âœ… |
| ðŸ”´ | QW-5 Smoke tests oficiales | âœ… |
| ðŸ”´ | BK-1 ValidaciÃ³n de payloads | âœ… |
| ðŸ”´ | DT-1 Path configurable en pipeline | âœ… |
| ðŸ”´ | UX-1 Vista compacta por defecto | âœ… |
| ðŸ”´ | AR-1 Carga incremental | âœ… |
| ðŸŸ¡ | QW-6 Toasts, BK-2/3, DT-4/5/6, UX-3/4 | Pendiente |
| ðŸŸ¡ | AR-2 Separar capas backend | âœ… CERRADO |
| ðŸŸ¡ | AR-3 UnificaciÃ³n progresiva pipelines Python | âœ… CERRADO |
| ðŸŸ¡ | DT-3 Snapshots versionados engine_*.json | âœ… IMPLEMENTADO |
| ðŸŸ¡ | DT-2 Esquema JSON formal engine_*.json | âœ… IMPLEMENTADO |

| ðŸŸ¢ | BK-4/5, UX-5/6, AR-5 | Pendiente |

## Estado fase I - Payload Validation + Write Safety

- Estado: en curso (I.1-I.10 implementado en rama local, pendiente validacion funcional manual UI completa).
- Entregables base:
	- `server/validation/*`
	- `tests/security/write-validation.test.js`
	- `docs/security/PAYLOAD_VALIDATION.md`
	- `docs/security/WRITE_ENDPOINTS_AUDIT.md`
	- `data/output/validation/payload_validation_report.md`

---

## Criterios de aceptaciÃ³n globales

1. `npm test` pasa sin errores tras cada bloque.
2. La UI sigue funcional contra `http://localhost:3000/qa_milu.html` despuÃ©s de cada cambio.
3. Los `engine_*.json` no se modifican sin que pase por `/save-json` o el pipeline oficial.
4. Cada tarea cerrada actualiza [11_progreso_remediacion.md](11_progreso_remediacion.md).

