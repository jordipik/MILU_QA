# DOCUMENTO CANÓNICO MILU — PLAN DE TRABAJO

> **Estado**: CANÓNICO · Fuente única de verdad para el plan de remediación.
> **Última actualización**: 2026-05-12.
> **Fuentes consolidadas**: [10_plan_remediacion.md](10_plan_remediacion.md), [11_progreso_remediacion.md](11_progreso_remediacion.md), [PLAN_ACCION_QUICK_START.md](PLAN_ACCION_QUICK_START.md), [PLAN_ACCION_EJECUCION_DETALLADA.md](PLAN_ACCION_EJECUCION_DETALLADA.md).
> **Origen del diagnóstico**: [09_auditoria_2026.md](09_auditoria_2026.md).

Leyenda:
- Prioridad: 🔴 alta · 🟡 media · 🟢 baja
- Dificultad: **S** (≤ 1 jornada) · **M** (2-5 jornadas) · **L** (más de una semana)

---

## Bloque 1 — Quick wins

| ID | Tarea | Prioridad | Dificultad | Estado |
|----|-------|-----------|-----------|--------|
| QW-1 | Eliminar handlers duplicados en `server.js` | 🔴 | S | ✅ commit `742ca003` |
| QW-2 | Implementar `/qa_revision_sync.php` y `/apply-revision-to-engines` en Express | 🔴 | S | ✅ commit `742ca003` |
| QW-3 | Sincronizar docs con código real (8→9 motores, `measurement_final`→`measure_final`) | 🔴 | S | ✅ |
| QW-4 | ESLint mínimo (`recommended` + `prettier`) | 🟡 | S | Pendiente |
| QW-5 | `npm test` con smoke test HTTP (`node --test`) | 🔴 | S | Pendiente |
| QW-6 | Suprimir 152 ocurrencias de `alert()` en flujos no críticos | 🟡 | M | Pendiente |

---

## Bloque 2 — Endurecimiento del backend

| ID | Tarea | Prioridad | Dificultad | Estado |
|----|-------|-----------|-----------|--------|
| BK-1 | Validación de payloads en `/save-json` y `/apply-revision-to-engines` (allowlist de campos y motores) | 🔴 | S | Pendiente |
| BK-2 | Mover `.php` físicos a `legacy/php/` (Express ya sirve sus rutas) | 🟡 | S | Pendiente |
| BK-3 | `compression` middleware + `Cache-Control` apropiado para `engine_*.json` | 🟡 | S | Pendiente |
| BK-4 | `/health?deep=1` enriquecido (filas por motor, último `updated_at`, tamaño revision data) | 🟢 | S | Pendiente |
| BK-5 | Logging estructurado (`pino` o equivalente) | 🟢 | S | Pendiente |

---

## Bloque 3 — Datos y pipeline

| ID | Tarea | Prioridad | Dificultad | Estado |
|----|-------|-----------|-----------|--------|
| DT-1 | Ruta base portable en `depuracion_json.py` (`Path(__file__).resolve().parent` / `MILU_REPO_DIR`) | 🔴 | S | Pendiente |
| DT-2 | Esquema JSON formal para `engine_*.json` + validador (`ajv` / `jsonschema`) | 🟡 | M | Pendiente. Proposal: [proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md](proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md) (**PENDIENTE DE VALIDAR**) |
| DT-3 | Snapshots versionados de los `engine_*.json` por fecha | 🟡 | M | Pendiente |
| DT-4 | Mover backups y JSON crudos a `zz_old/backups/<fecha>/` | 🟡 | S | Pendiente |
| DT-5 | Unificar `descartar` (analista_02.js) vs `eliminar` (UI principal) | 🟡 | S | Pendiente — **inconsistencia activa** |
| DT-6 | Mejorar completitud de `measure_final` (actualmente ~64.6 %) | 🟡 | M | Pendiente |
| DT-7 | Mantener pipeline export WordPress QA-only oficial | 🔴 | M | ✅ doc [14_wordpress_export_simplified.md](14_wordpress_export_simplified.md) |

---

## Bloque 4 — UX / Frontend

| ID | Tarea | Prioridad | Dificultad | Estado |
|----|-------|-----------|-----------|--------|
| UX-1 | Vista compacta por defecto (≤ 12 columnas) | 🔴 | S | Pendiente |
| UX-2 | Virtualización de tabla (`tanstack/virtual` o equivalente) | 🟡 | M | Pendiente |
| UX-3 | Sistema de toasts `notify(level, msg)` para sustituir 152 `alert()` | 🟡 | M | Pendiente |
| UX-4 | Confirmación tipada para acciones irreversibles | 🟡 | S | Pendiente |
| UX-5 | Unificar idioma (ES en UI, EN en claves de datos) | 🟢 | M | Pendiente |
| UX-6 | Atajos documentados in-situ (`V/?/X/OK/Clear`) | 🟢 | S | Pendiente |

---

## Bloque 5 — Arquitectura y escalabilidad

| ID | Tarea | Prioridad | Dificultad | Estado |
|----|-------|-----------|-----------|--------|
| AR-1 | Carga incremental de motores | 🔴 | L | ✅ infra + UI mínima (ver [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md)) · pendiente: métricas TTFR + conmutador sin URL param |
| AR-2 | Separar capas en backend (`domain/`, `services/`, `infra/`) | 🟡 | M | Pendiente |
| AR-3 | Mover scripts Python a `pipelines/` con entrypoint único `pipelines/run_full.py` | 🟡 | M | Pendiente |
| AR-4 | CI mínimo (lint + smoke tests) | 🟡 | S | Pendiente |
| AR-5 | Documentar `dist/milu_publish/` y su rol en runtime | 🟢 | S | Pendiente |

---

## Resumen ordenado por prioridad

| Prioridad | Tarea | Estado |
|-----------|-------|--------|
| 🔴 | QW-1, QW-2, QW-3 | ✅ |
| 🔴 | AR-1 (base) | ✅ |
| 🔴 | QW-5 Smoke tests, BK-1 Validación payloads, DT-1 Path configurable, UX-1 Vista compacta | Pendiente |
| 🟡 | QW-4, QW-6, BK-2/3, DT-2/3/4/5/6, UX-2/3/4, AR-2/3/4 | Pendiente |
| 🟢 | BK-4/5, UX-5/6, AR-5 | Pendiente |

---

## Propuestas marcadas como **PENDIENTE DE VALIDAR**

Estas propuestas existen como diseño, sin código asociado todavía. No se eliminan; quedan referenciadas:

- [proposals/06_future_versions_review_flow_figma.md](proposals/06_future_versions_review_flow_figma.md) — flujo de revisión basado en mockups Figma.
- [proposals/08_pdf_visual_pipeline_prompt.md](proposals/08_pdf_visual_pipeline_prompt.md) — pipeline visual de PDF.
- [proposals/images_future_architecture.md](proposals/images_future_architecture.md) — arquitectura futura de imágenes.
- [proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md](proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md) — refactor de schema JSON (DT-2).
- [proposals/images_pending_improvements.md](proposals/images_pending_improvements.md) — mejoras pendientes multimedia.

---

## Criterios de aceptación globales

1. `npm test` pasa sin errores tras cada bloque (cuando QW-5 esté en marcha).
2. La UI sigue funcional contra `http://localhost:3000/qa_milu.html` después de cada cambio.
3. Los `engine_*.json` **no** se modifican fuera de `/save-json`, `/apply-revision-to-engines` o el pipeline oficial (`depuracion_json.py`).
4. Cada tarea cerrada actualiza [11_progreso_remediacion.md](11_progreso_remediacion.md).

---

## Limpieza documental

Pendiente independiente del plan técnico: ver [MILU_LIMPIEZA_DOCUMENTACION.md](MILU_LIMPIEZA_DOCUMENTACION.md).

---

## Referencias

- Plan canónico: [10_plan_remediacion.md](10_plan_remediacion.md)
- Bitácora: [11_progreso_remediacion.md](11_progreso_remediacion.md)
- Vista rápida (P0): [PLAN_ACCION_QUICK_START.md](PLAN_ACCION_QUICK_START.md)
- Vista detallada: [PLAN_ACCION_EJECUCION_DETALLADA.md](PLAN_ACCION_EJECUCION_DETALLADA.md)
- Auditoría base: [09_auditoria_2026.md](09_auditoria_2026.md)
- Inventario de scripts: [MILU_INVENTARIO_SCRIPTS.md](MILU_INVENTARIO_SCRIPTS.md)
- AR-1: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md)
