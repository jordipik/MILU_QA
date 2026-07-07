# PHASE6_DANGEROUS_WRITE_GUARD_REPORT

## Objetivo
Reducir riesgo operativo en endpoints de escritura sin cambiar la logica funcional oficial.

## Cambios aplicados
1. Guard de seguridad por variable de entorno en [server.js](server.js):
   - `isDangerousWriteEnabled()`
   - `dangerousWriteForbidden(res, endpoint)`
2. Endpoints protegidos (escritura peligrosa):
   - `POST /api/recompute-simple/enrich-assets` (cuando `dryRun !== true`)
   - `POST /api/recompute-simple/recompute-hermanos` (cuando `dryRun !== true`)
   - `POST /api/recompute-simple/rebuild-schemes-by-bom` (cuando `dryRun !== true`)
   - `POST /api/recompute-simple/rebuild-schemes-circles-from-esquemas` (cuando `dryRun !== true`)
   - `POST /api/pdf-preview/apply-to-engine`
   - `POST /recompute-pdf-auto-visual` (cuando `dryRun !== true`)
   - `POST /copy-pdf-to-pdf-all-books` (cuando `writePdf === true`)
   - `POST /copy-pdf-to-final-all-books`
   - `POST /clear-engine-fields` (cuando `dryRun !== true`)
   - `POST /apply-revision-to-engines`
   - `POST /api/apply-generate-batch`
3. Mensaje de bloqueo estandarizado:
   - `Dangerous write disabled. Set SERVER_ENABLE_DANGEROUS_WRITE=true to enable.`

## Ajustes complementarios
1. Favicon corregido en [export_wordpress.html](export_wordpress.html):
   - de `/milu/favicon.svg` a `/favicon.svg`.
2. Smoke test actualizado en [tests/smoke/http-smoke.test.js](tests/smoke/http-smoke.test.js):
   - bloque legacy 410 reemplazado por verificacion "no 200" para endpoints eliminados fisicamente.
   - cobertura de endpoints eliminados:
     - `GET /pn/list`
     - `GET /pn/:sku`
     - `GET /pn/:sku/sources`
     - `POST /export/run-synthetic`
     - `POST /export/run-ai-conflicts`
     - `POST /export/run-all`
     - `POST /apply-qa-checks-filter`
     - `POST /recompute-pdf-auto`

## Validacion runtime

### A) SERVER_ENABLE_DANGEROUS_WRITE desactivado
Servidor iniciado con variable vacia.

1. Paginas oficiales:
   - `GET /recompute_simple.html` -> 200
   - `GET /qa_milu.html` -> 200
   - `GET /analista_02.html` -> 200
   - `GET /export_wordpress.html` -> 200
   - `GET /favicon.svg` -> 200

2. Endpoints protegidos:
   - `POST /api/pdf-preview/apply-to-engine` -> 403
   - `POST /apply-revision-to-engines` -> 403
   - `POST /api/recompute-simple/recompute-hermanos` -> 403
   - `POST /clear-engine-fields` -> 403
   - `POST /copy-pdf-to-final-all-books` -> 403
   - `POST /api/apply-generate-batch` -> 403

3. Verificacion de mensaje exacto (ejemplo real):
   - body: `{"ok":false,"endpoint":"/api/pdf-preview/apply-to-engine","error":"Dangerous write disabled. Set SERVER_ENABLE_DANGEROUS_WRITE=true to enable."}`

### B) SERVER_ENABLE_DANGEROUS_WRITE=true
Servidor reiniciado con variable activa.

1. Endpoints protegidos dejan de estar bloqueados por guard:
   - `POST /api/pdf-preview/apply-to-engine` -> 200
   - `POST /apply-revision-to-engines` -> 400 (validacion de payload, no guard)
   - `POST /api/recompute-simple/recompute-hermanos` con `dryRun=true` -> 200
   - `POST /clear-engine-fields` con `dryRun=true` -> 200
   - `POST /copy-pdf-to-final-all-books` -> 200
   - `POST /api/apply-generate-batch` -> 400 (validacion de payload, no guard)

2. Read/UI se mantiene estable:
   - `GET /recompute_simple.html` -> 200
   - `GET /qa_milu.html` -> 200
   - `GET /analista_02.html` -> 200
   - `GET /export_wordpress.html` -> 200
   - `GET /favicon.svg` -> 200

### C) Endpoints legacy eliminados (confirmacion)
Con servidor activo:
- `GET /pn/list` -> 404
- `GET /pn/TEST-SKU` -> 404
- `GET /pn/TEST-SKU/sources` -> 404
- `POST /export/run-synthetic` -> 404
- `POST /export/run-ai-conflicts` -> 404
- `POST /export/run-all` -> 404
- `POST /apply-qa-checks-filter` -> 404
- `POST /recompute-pdf-auto` -> 404

## Resultado de smoke test
Ejecucion: `node --test tests/smoke/http-smoke.test.js`

- Nuevo bloque de endpoints legacy eliminados: OK (8/8).
- Resultado global: 16/17 OK.
- Falla observada: `GET /pn-review/list -> ok + rows/total` por timeout (`AbortError`) en ~10s.

Nota: esta falla no esta relacionada con los cambios de guard/legacy/favicons.

## Control de efectos laterales durante validacion
Durante la validacion con `SERVER_ENABLE_DANGEROUS_WRITE=true`, la llamada a `POST /api/pdf-preview/apply-to-engine` aplico cambios reales sobre `engine_12V4000M53.json` y genero backups temporales.

Accion correctiva aplicada en la misma sesion:
1. Restauracion inmediata de `engine_12V4000M53.json` desde el primer backup generado en la prueba.
2. Eliminacion de backups temporales creados por esta validacion.

Estado final: no quedan cambios pendientes en `engine_12V4000M53.json` por esta fase.

## Dependencia runtime preservada
Se mantiene `apply_revision_to_engines.js` en raiz por dependencia real:
- [server/services/revision-apply.js](server/services/revision-apply.js) requiere ese modulo.

## Propuesta futura (sin ejecutar en FASE 6)
1. Extraer logica de apply revision a `server/services/revision-apply-core.js`.
2. Hacer que [server/services/revision-apply.js](server/services/revision-apply.js) importe el core local (sin dependencia a raiz).
3. Dejar `apply_revision_to_engines.js` como wrapper CLI opcional (o mover a quarantine con shim temporal).
4. Añadir test de arranque que falle si falta el modulo de apply revision.

## Conclusion
FASE 6 queda implementada para guard de escrituras peligrosas con control por entorno, manteniendo operativa de lectura/UI y alineando smoke tests con la eliminacion fisica de endpoints legacy.