# PHASE7_RUNTIME_DEBT_AND_SMOKE_REPORT

## Objetivo
Cerrar deuda operativa detectada en FASE 5/6 sin cambiar logica funcional oficial.

## 1) Investigacion timeout en GET /pn-review/list

### Evidencia medida en runtime
Pruebas reales contra `http://localhost:3000`:

- `GET /pn-review/list`
  - status: 200
  - tiempo: 12184 ms
  - tamano respuesta: 3170444 chars
  - filas: 5860
- `GET /pn-review/list?limit=1`
  - status: 200
  - tiempo: 35 ms
  - tamano respuesta: 574 chars
- `GET /pn-review/list?limit=25`
  - status: 200
  - tiempo: 53 ms
  - tamano respuesta: 13864 chars
- `GET /pn-review/list?limit=100`
  - status: 200
  - tiempo: 56 ms
  - tamano respuesta: 55488 chars

### Causa raiz
El endpoint no estaba roto ni bloqueado por legacy; el test estaba pidiendo por defecto la lista completa (`data.list.length`) y serializando miles de filas.

Diagnostico por categorias pedidas:
- endpoint lento: parcialmente, pero por volumen de salida
- dataset demasiado grande: si
- test mal planteado: si (consulta completa para smoke)
- falta de paginacion/limite: no en backend (ya existe `limit/offset`), si en test
- dependencia de archivos legacy: no evidenciada
- bloqueo por lectura masiva: no bloqueo duro, pero costo de lectura+serializacion+transferencia que supera timeout del smoke

## 2) Correccion segura de smoke test
Archivo: `tests/smoke/http-smoke.test.js`

Cambio aplicado:
- Antes: `GET /pn-review/list` (completo)
- Ahora: `GET /pn-review/list?limit=25`

Validacion minima preservada:
- status 200
- `ok === true`
- `rows` es array
- `rows.length <= 25`
- `total` numerico y `total >= rows.length`

Resultado:
- smoke HTTP vuelve a pasar 17/17 sin aumentar timeout global.

## 3) Refactor seguro revision apply

### Objetivo
Eliminar dependencia runtime del servicio oficial respecto a script raiz legacy.

### Cambios
1. Nuevo core local:
   - `server/services/revision-apply-core.js`
   - Contiene la logica reusable:
     - `applyRevisionPayload`
     - `applyRevisionFile`
2. Servicio oficial:
   - `server/services/revision-apply.js`
   - Ahora importa `./revision-apply-core` (local) en lugar de `../../apply_revision_to_engines`.
3. Script raiz conservado como wrapper CLI:
   - `apply_revision_to_engines.js`
   - Mantiene contrato exportado y CLI, delegando al core local.

### Contrato endpoint
No se cambió contrato de `POST /apply-revision-to-engines`.

## 4) Test de arranque/import anti MODULE_NOT_FOUND
Nuevo test:
- `tests/smoke/revision-apply-import.test.js`

Cobertura:
- Carga de `server/services/revision-apply` y presencia de `createRevisionApplyService`.
- Carga de wrapper raiz `apply_revision_to_engines` y presencia de `applyRevisionPayload` y `applyRevisionFile`.

Resultado:
- 2/2 OK.

## 5) Validacion obligatoria

### A) Arranque servidor
- `node server.js` arranca correctamente en ambos modos de entorno.

### B) Disponibilidad UI/read-only
- `GET /recompute_simple.html` -> 200
- `GET /qa_milu.html` -> 200
- `GET /analista_02.html` -> 200
- `GET /export_wordpress.html` -> 200
- `GET /favicon.svg` -> 200

### C) Smoke test
- `node --test tests/smoke/http-smoke.test.js`
- Resultado: **17/17 OK**.

### D) Guard de endpoints peligrosos (env desactivado)
Con `SERVER_ENABLE_DANGEROUS_WRITE` desactivado:
- `POST /api/pdf-preview/apply-to-engine` -> 403
- `POST /apply-revision-to-engines` -> 403
- `POST /api/recompute-simple/recompute-hermanos` -> 403
- `POST /clear-engine-fields` -> 403
- `POST /copy-pdf-to-final-all-books` -> 403
- `POST /api/apply-generate-batch` -> 403

Todos con mensaje de guard:
`Dangerous write disabled. Set SERVER_ENABLE_DANGEROUS_WRITE=true to enable.`

### E) Guard habilitado (env true)
Con `SERVER_ENABLE_DANGEROUS_WRITE=true`:
- mismos endpoints ya no bloqueados por guard (sin 403 por guard)
- respuestas observadas:
  - 200 en endpoints con payload de prueba seguro
  - 400 por validacion de payload en endpoints que lo requieren

### F) apply revision sigue funcionando como antes
Con guard habilitado y payload vacio:
- `POST /apply-revision-to-engines` -> 400
- body:
  - `error: VALIDATION_ERROR`
  - `code: EMPTY_PAYLOAD`
  - `message: payload no puede estar vacio.`

Comportamiento de validacion consistente con el contrato previo.

## 6) Control de no afectacion de datos productivos
Durante validaciones en modo enabled, una llamada genero cambios en `engine_12V4000M53.json`.

Accion correctiva inmediata en la misma sesion:
1. restaurado desde backup creado por la propia prueba
2. backup temporal eliminado

Estado final:
- `engine_12V4000M53.json` sin cambios pendientes.

## 7) Alcance y restricciones respetadas
- No se movio mas legacy en esta fase.
- No se modifico logica funcional oficial.
- Se corrigio deuda de smoke y deuda de acoplamiento runtime/import de revision apply.
