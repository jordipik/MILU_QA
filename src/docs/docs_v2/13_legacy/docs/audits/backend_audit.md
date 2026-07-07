# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Auditoria Backend Express

Fecha: 2026-05-16
Archivo principal: server.js (1,995 lineas, 38 rutas app-level, 6 middlewares globales)

## Estado general

- Backend funcional y estable para operaciÃ³n local.
- Validaciones de payload existen y mejoraron respecto a estados previos.
- Aun hay concentracion alta de logica en server.js y coexistencia de compatibilidad legacy.

## Inventario de rutas criticas

### Runtime core

- GET /health
- GET /version
- GET /engines
- POST /save-json
- POST /save-json.php
- GET/POST /qa_revision_sync.php
- POST /apply-revision-to-engines

### PN review

- GET /pn-review/list
- GET /pn-review/:sku
- GET /pn-review/:sku/sources
- POST /pn-review/apply-siblings-bulk
- POST /pn-review/:sku/apply-decision
- POST /pn-review/:sku/apply-values
- POST /pn-review/by-id/:id/apply-decision

### Export

- POST /export/run-wordpress
- GET /export/status
- GET /export/files
- GET /export/file
- GET /export/download
- GET /export/preview
- GET /export/wordpress-decisions
- GET /export/trace/:sku

### Legacy desactivado

- POST /export/run-synthetic -> 410
- POST /export/run-ai-conflicts -> 410
- POST /export/run-all -> 410
- GET /pn/list -> 410
- GET /pn/:sku -> 410
- GET /pn/:sku/sources -> 410
- POST /apply-qa-checks-filter -> 410

### SQLite mirror

- /db/* (read-only)
- /db/analytics/* (read-only)

## Validacion de payload y write safety

Fortalezas:

- server/validation/qa-validation.js y allowed-fields.js aplican whitelist de campos editables.
- Alias legacy controlados (measurement_final -> measure_final, descartar -> eliminar).
- Escritura atomica para qa_revision_sync y save-json.
- Lock por fichero en /save-json para evitar carreras de write concurrente.

Debilidades:

- validateRevisionApplyPayload acepta objeto y tamano, pero no esquema profundo de revisiones.
- /apply-revision-to-engines mantiene compatibilidad amplia (riesgo de payload historico ambiguo).
- Sin autenticacion ni autorizacion (asumido entorno local).

## Compatibilidad legacy y dependencias historicas

- Compatibilidad .php explicita: /qa_revision_sync.php y /save-json.php.
- legacy/php sigue presente para publicacion legacy.
- Endpoints 410 preservan contratos antiguos sin ejecutar logica deprecada.

## Riesgos detectados

| Riesgo | Severidad | Detalle |
|---|---|---|
| Alta concentracion en server.js | Alta | Cambios en una zona pueden impactar rutas no relacionadas |
| Validacion no esquematica en apply-revision-to-engines | Alta | Riesgo de escrituras masivas con payload inesperado |
| CORS abierto + sin auth | Media | Adecuado local, riesgoso si se expone fuera de LAN/local |
| Divergencia JSON vs SQLite mirror | Media | db:validate reporta delta -1 fila/-1 PN |
| Dependencia de filesystem como persistence layer | Media | Riesgo de bloqueos/errores de IO en operaciones largas |

## Endpoints no usados/duplicidades

- /pn/* activos solo como wrappers legacy 410.
- /save-json y /save-json.php son alias funcionales (intencional).
- Rutas analytics/db bien segregadas por routers dedicados.

## Seguridad basica

Positivo:

- body size limit 10mb
- bloqueo de rutas .php no permitidas
- endpoints read-only con 405 en /db y /db/analytics

Pendiente:

- hardening minimo de headers HTTP (helmet u equivalente)
- rate limiting para rutas write (si se amplÃ­a uso multiusuario)
- validacion semantica de payloads masivos

## Conclusion

Backend usable y robusto para entorno local controlado, con deuda principal en:

1. Modularizacion de server.js.
2. Esquema fuerte para payload masivo de revisiones.
3. Plan de seguridad para eventual exposiciÃ³n no-local.

