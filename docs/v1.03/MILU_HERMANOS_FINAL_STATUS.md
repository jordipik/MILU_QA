# MILU_HERMANOS_FINAL_STATUS

Fecha: 2026-06-05

## Referencias cruzadas

- [MILU_SECURITY_FINAL_REPORT.md](MILU_SECURITY_FINAL_REPORT.md)
- [MILU_SYSTEM_AUDIT.md](MILU_SYSTEM_AUDIT.md)
- [MILU_V103_CLOSURE_REPORT.md](MILU_V103_CLOSURE_REPORT.md)

## Endpoint oficial

- POST /api/recompute-simple/recompute-hermanos
- Ubicacion: server.js
- Estado: OFICIAL
- Seguridad: requiere guard global cuando dryRun=false.

## Endpoint legacy

- POST /pn-review/apply-siblings-bulk
- Ubicacion: server.js
- Estado: DEPRECATED (mantenido por compatibilidad)
- Cambios aplicados:
  - Comentario DEPRECATED en ruta.
  - Warning en logs via console.warn en cada invocacion.
  - Guard global obligatorio (SERVER_ENABLE_DANGEROUS_WRITE).
  - backup forzado a true.
  - Se mantiene dryRun=false para no alterar contrato operativo legacy.

## Llamadas frontend encontradas

### Activas (oficial)

- js/recompute-simple.js -> POST /api/recompute-simple/recompute-hermanos
- js/analista-02.js -> POST /api/recompute-simple/recompute-hermanos
- deploy_ftp/js/recompute-simple.js -> POST /api/recompute-simple/recompute-hermanos
- deploy_ftp/js/analista-02.js -> POST /api/recompute-simple/recompute-hermanos

### Legacy en frontend

- No se encontraron llamadas activas a /pn-review/apply-siblings-bulk en frontend JS.

## Cambios realizados

1. Migracion de frontend de Hermanos (analista) a endpoint oficial.
2. Mantenimiento de endpoint legacy sin eliminarlo.
3. Endurecimiento de endpoint legacy con guard y backup.
4. Marcado explicito de deprecacion en codigo y respuesta.

## Validacion final

- get_errors sin errores en:
  - js/analista-02.js
  - deploy_ftp/js/analista-02.js
  - server.js
- Busqueda global de /pn-review/apply-siblings-bulk:
  - solo en server.js (definicion endpoint, guard, warning)
  - 0 callers frontend.

## Resultado

Fase 8 cerrada con cambios minimos, sin cambiar algoritmo de Hermanos y sin eliminar el endpoint legacy.