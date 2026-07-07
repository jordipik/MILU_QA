# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# DOCUMENTO CANÃ“NICO MILU â€” PLAN DE TRABAJO

> **Estado**: CANÃ“NICO Â· Fuente Ãºnica de verdad para el plan de remediaciÃ³n.
> **Ãšltima actualizaciÃ³n**: 2026-05-12.
> **Fuentes consolidadas**: [10_plan_remediacion.md](10_plan_remediacion.md), [11_progreso_remediacion.md](11_progreso_remediacion.md), [PLAN_ACCION_QUICK_START.md](PLAN_ACCION_QUICK_START.md), [PLAN_ACCION_EJECUCION_DETALLADA.md](PLAN_ACCION_EJECUCION_DETALLADA.md).
> **Origen del diagnÃ³stico**: [09_auditoria_2026.md](09_auditoria_2026.md).

Leyenda:
- Prioridad: ðŸ”´ alta Â· ðŸŸ¡ media Â· ðŸŸ¢ baja
- Dificultad: **S** (â‰¤ 1 jornada) Â· **M** (2-5 jornadas) Â· **L** (mÃ¡s de una semana)

---

## Bloque 1 â€” Quick wins

| ID | Tarea | Prioridad | Dificultad | Estado |
|----|-------|-----------|-----------|--------|
| QW-1 | Eliminar handlers duplicados en `server.js` | ðŸ”´ | S | âœ… commit `742ca003` |
| QW-2 | Implementar `/qa_revision_sync.php` y `/apply-revision-to-engines` en Express | ðŸ”´ | S | âœ… commit `742ca003` |
| QW-3 | Sincronizar docs con cÃ³digo real (8â†’9 motores, `measurement_final`â†’`measure_final`) | ðŸ”´ | S | âœ… |
| QW-4 | ESLint mÃ­nimo (`recommended` + `prettier`) | ðŸŸ¡ | S | Pendiente |
| QW-5 | `npm test` con smoke test HTTP (`node --test`) | ðŸ”´ | S | Pendiente |
| QW-6 | Suprimir 152 ocurrencias de `alert()` en flujos no crÃ­ticos | ðŸŸ¡ | M | Pendiente |

---

## Bloque 2 â€” Endurecimiento del backend

| ID | Tarea | Prioridad | Dificultad | Estado |
|----|-------|-----------|-----------|--------|
| BK-1 | ValidaciÃ³n de payloads en `/save-json` y `/apply-revision-to-engines` (allowlist de campos y motores) | ðŸ”´ | S | Pendiente |
| BK-2 | Mover `.php` fÃ­sicos a `legacy/php/` (Express ya sirve sus rutas) | ðŸŸ¡ | S | Pendiente |
| BK-3 | `compression` middleware + `Cache-Control` apropiado para `engine_*.json` | ðŸŸ¡ | S | Pendiente |
| BK-4 | `/health?deep=1` enriquecido (filas por motor, Ãºltimo `updated_at`, tamaÃ±o revision data) | ðŸŸ¢ | S | Pendiente |
| BK-5 | Logging estructurado (`pino` o equivalente) | ðŸŸ¢ | S | Pendiente |

---

## Bloque 3 â€” Datos y pipeline

| ID | Tarea | Prioridad | Dificultad | Estado |
|----|-------|-----------|-----------|--------|
| DT-1 | Ruta base portable en `depuracion_json.py` (`Path(__file__).resolve().parent` / `MILU_REPO_DIR`) | ðŸ”´ | S | Pendiente |
| DT-2 | Esquema JSON formal para `engine_*.json` + validador (`ajv` / `jsonschema`) | ðŸŸ¡ | M | Pendiente. Proposal: [proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md](proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md) (**PENDIENTE DE VALIDAR**) |
| DT-3 | Snapshots versionados de los `engine_*.json` por fecha | ðŸŸ¡ | M | Pendiente |
| DT-4 | Mover backups y JSON crudos a `zz_old/backups/<fecha>/` | ðŸŸ¡ | S | Pendiente |
| DT-5 | Unificar `descartar` (analista_02.js) vs `eliminar` (UI principal) | ðŸŸ¡ | S | Pendiente â€” **inconsistencia activa** |
| DT-6 | Mejorar completitud de `measure_final` (actualmente ~64.6 %) | ðŸŸ¡ | M | Pendiente |
| DT-7 | Mantener pipeline export WordPress QA-only oficial | ðŸ”´ | M | âœ… doc [14_wordpress_export_simplified.md](14_wordpress_export_simplified.md) |

---

## Bloque 4 â€” UX / Frontend

| ID | Tarea | Prioridad | Dificultad | Estado |
|----|-------|-----------|-----------|--------|
| UX-1 | Vista compacta por defecto (â‰¤ 12 columnas) | ðŸ”´ | S | Pendiente |
| UX-2 | VirtualizaciÃ³n de tabla (`tanstack/virtual` o equivalente) | ðŸŸ¡ | M | Pendiente |
| UX-3 | Sistema de toasts `notify(level, msg)` para sustituir 152 `alert()` | ðŸŸ¡ | M | Pendiente |
| UX-4 | ConfirmaciÃ³n tipada para acciones irreversibles | ðŸŸ¡ | S | Pendiente |
| UX-5 | Unificar idioma (ES en UI, EN en claves de datos) | ðŸŸ¢ | M | Pendiente |
| UX-6 | Atajos documentados in-situ (`V/?/X/OK/Clear`) | ðŸŸ¢ | S | Pendiente |

---

## Bloque 5 â€” Arquitectura y escalabilidad

| ID | Tarea | Prioridad | Dificultad | Estado |
|----|-------|-----------|-----------|--------|
| AR-1 | Carga incremental de motores | ðŸ”´ | L | âœ… infra + UI mÃ­nima (ver [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md)) Â· pendiente: mÃ©tricas TTFR + conmutador sin URL param |
| AR-2 | Separar capas en backend (`domain/`, `services/`, `infra/`) | ðŸŸ¡ | M | Pendiente |
| AR-3 | Mover scripts Python a `pipelines/` con entrypoint Ãºnico `pipelines/run_full.py` | ðŸŸ¡ | M | Pendiente |
| AR-4 | CI mÃ­nimo (lint + smoke tests) | ðŸŸ¡ | S | Pendiente |
| AR-5 | Documentar `dist/milu_publish/` y su rol en runtime | ðŸŸ¢ | S | Pendiente |

---

## Resumen ordenado por prioridad

| Prioridad | Tarea | Estado |
|-----------|-------|--------|
| ðŸ”´ | QW-1, QW-2, QW-3 | âœ… |
| ðŸ”´ | AR-1 (base) | âœ… |
| ðŸ”´ | QW-5 Smoke tests, BK-1 ValidaciÃ³n payloads, DT-1 Path configurable, UX-1 Vista compacta | Pendiente |
| ðŸŸ¡ | QW-4, QW-6, BK-2/3, DT-2/3/4/5/6, UX-2/3/4, AR-2/3/4 | Pendiente |
| ðŸŸ¢ | BK-4/5, UX-5/6, AR-5 | Pendiente |

---

## Propuestas marcadas como **PENDIENTE DE VALIDAR**

Estas propuestas existen como diseÃ±o, sin cÃ³digo asociado todavÃ­a. No se eliminan; quedan referenciadas:

- [proposals/06_future_versions_review_flow_figma.md](proposals/06_future_versions_review_flow_figma.md) â€” flujo de revisiÃ³n basado en mockups Figma.
- [proposals/08_pdf_visual_pipeline_prompt.md](proposals/08_pdf_visual_pipeline_prompt.md) â€” pipeline visual de PDF.
- [proposals/images_future_architecture.md](proposals/images_future_architecture.md) â€” arquitectura futura de imÃ¡genes.
- [proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md](proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md) â€” refactor de schema JSON (DT-2).
- [proposals/images_pending_improvements.md](proposals/images_pending_improvements.md) â€” mejoras pendientes multimedia.

---

## Criterios de aceptaciÃ³n globales

1. `npm test` pasa sin errores tras cada bloque (cuando QW-5 estÃ© en marcha).
2. La UI sigue funcional contra `http://localhost:3000/qa_milu.html` despuÃ©s de cada cambio.
3. Los `engine_*.json` **no** se modifican fuera de `/save-json`, `/apply-revision-to-engines` o el pipeline oficial (`depuracion_json.py`).
4. Cada tarea cerrada actualiza [11_progreso_remediacion.md](11_progreso_remediacion.md).

---

## Limpieza documental

Pendiente independiente del plan tÃ©cnico: ver [MILU_LIMPIEZA_DOCUMENTACION.md](MILU_LIMPIEZA_DOCUMENTACION.md).

---

## Referencias

- Plan canÃ³nico: [10_plan_remediacion.md](10_plan_remediacion.md)
- BitÃ¡cora: [11_progreso_remediacion.md](11_progreso_remediacion.md)
- Vista rÃ¡pida (P0): [PLAN_ACCION_QUICK_START.md](PLAN_ACCION_QUICK_START.md)
- Vista detallada: [PLAN_ACCION_EJECUCION_DETALLADA.md](PLAN_ACCION_EJECUCION_DETALLADA.md)
- AuditorÃ­a base: [09_auditoria_2026.md](09_auditoria_2026.md)
- Inventario de scripts: [MILU_INVENTARIO_SCRIPTS.md](MILU_INVENTARIO_SCRIPTS.md)
- AR-1: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md)

