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

### QW-4. Configurar lint mínimo
- Acción: añadir `eslint` con preset `recommended` + `prettier`. Solo en `js/` y `*.cjs/*.mjs` del raíz.
- Impacto: detección temprana de bugs (vars no usadas, shadowing).
- Dificultad: S · Prioridad: 🟡 · Depende de: nada.

### QW-5. Añadir `npm test` con un smoke test HTTP
- Acción: usar `node --test` (nativo, sin deps) para validar `/health`, `/save-json`, `/qa_revision_sync.php`, `/apply-revision-to-engines`.
- Impacto: línea base para refactor seguro.
- Dificultad: S · Prioridad: 🔴 · Depende de: nada.

### QW-6. Suprimir `alert()` en flujos no críticos
- Acción: sustituir por toasts o por `console.warn` cuando sea informativo.
- Impacto: QA más fluido.
- Dificultad: M (152 ocurrencias) · Prioridad: 🟡 · Depende de: pequeño componente toast.

---

## Bloque 2 — Endurecimiento del backend

### BK-1. Validación de payloads en `/save-json` y `/apply-revision-to-engines`
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

### DT-1. Configurar ruta base en `depuracion_json.py`
- Acción: usar `Path(__file__).resolve().parent` o variable de entorno `MILU_REPO_DIR`.
- Archivos: [depuracion_json.py](../depuracion_json.py#L12), [add_final_fields.py](../add_final_fields.py).
- Impacto: portabilidad, ejecutable en CI.
- Dificultad: S · Prioridad: 🔴.

### DT-2. Esquema JSON para `engine_*.json`
- Acción: definir `schemas/engine_row.schema.json` y validador (`ajv` en Node, `jsonschema` en Python).
- Impacto: detecta campos huérfanos / typos antes de persistir.
- Dificultad: M · Prioridad: 🟡 · Depende de: inventario actual de campos.

### DT-3. Snapshots versionados de los `engine_*.json`
- Acción: en cada `pretty_print_all_json.py` o tras `apply-revision-to-engines`, generar snapshot en `snapshots/YYYY-MM-DD/` (sólo diff o tar.gz).
- Impacto: reversibilidad, auditoría de QA.
- Dificultad: M · Prioridad: 🟡.

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

---

## Bloque 4 — UX / Frontend

### UX-1. Vista compacta por defecto (≤ 12 columnas)
- Acción: forzar `column-view = 'compact'` en primera carga; menú "Avanzado" para abrir las 54 columnas.
- Dificultad: S · Prioridad: 🔴 · Depende de: ya existe `column-view.js`.

### UX-2. Virtualización de tabla
- Acción: integrar `tanstack/virtual` o equivalente para renderizar sólo filas visibles.
- Impacto: render fluido con miles de filas.
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
- Acción: cargar metadatos primero (filas por motor) y bajar el motor concreto al seleccionarlo, no los 9 a la vez.
- Impacto: arranque < 2 s incluso con 215 MB en disco.
- Dificultad: L · Prioridad: 🔴 · Depende de: UX-1, UX-2.

### AR-2. Separar capas
- Acción: introducir `domain/`, `services/`, `infra/` en backend; mover lógica de revisión y de aplicación masiva fuera de `server.js`.
- Dificultad: M · Prioridad: 🟡.

### AR-3. Aislar pipelines Python
- Acción: mover scripts a `pipelines/` y publicar un único entrypoint `pipelines/run_full.py` que orqueste el flujo oficial.
- Dificultad: M · Prioridad: 🟡.

### AR-4. CI mínimo (GitHub Actions o local)
- Acción: workflow que ejecute lint + smoke tests en push.
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
| 🔴 | QW-5 Smoke tests HTTP | Pendiente |
| 🔴 | BK-1 Validación de payloads | Pendiente |
| 🔴 | DT-1 Path configurable en pipeline | Pendiente |
| 🔴 | UX-1 Vista compacta por defecto | Pendiente |
| 🔴 | AR-1 Carga incremental | Pendiente |
| 🟡 | QW-4 Lint, QW-6 Toasts, BK-2/3, DT-2/3/4/5/6, UX-2/3/4, AR-2/3/4 | Pendiente |
| 🟢 | BK-4/5, UX-5/6, AR-5 | Pendiente |

---

## Criterios de aceptación globales

1. `npm test` pasa sin errores tras cada bloque.
2. La UI sigue funcional contra `http://localhost:3000/qa_milu.html` después de cada cambio.
3. Los `engine_*.json` no se modifican sin que pase por `/save-json` o el pipeline oficial.
4. Cada tarea cerrada actualiza [11_progreso_remediacion.md](11_progreso_remediacion.md).
