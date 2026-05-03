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

## Pendiente (próximos commits)

Ver [10_plan_remediacion.md](10_plan_remediacion.md), tareas marcadas como "Pendiente". Prioridades inmediatas:

- QW-5 — smoke tests HTTP con `node --test`.
- BK-1 — validación de payloads en endpoints de escritura.
- DT-1 — path configurable en `depuracion_json.py`.
- UX-1 — vista compacta por defecto en la tabla.

Cuando se cierre cada una, añadir aquí un bloque "Commit `<sha>` — `<resumen>`" siguiendo el formato del primero.
