# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Cierre QW-5 - Consolidacion Oficial de Smoke Tests

Fecha: 2026-05-12

## Estado final

QW-5 queda completado a nivel operativo y documental.

Se consolido un entrypoint oficial de pruebas (`npm test`) y se formalizo la estructura smoke por capas sin cambios de runtime.

## Suites existentes

- `npm test` -> `npm run test:all-smoke`
- `npm run test:all-smoke`
- `npm run test:smoke`
- `npm run test:db-read`
- `npm run test:db-analytics`

## Resultado actual verificado

Ejecuciones realizadas:

1. `npm test` -> OK
2. `npm run test:all-smoke` -> OK

Conteo total actual:

- 41/41 tests en verde
- 0 fallos

Distribucion por suite:

- Runtime HTTP: 11 tests
- DB read: 10 tests
- DB analytics: 20 tests

## Tiempos aproximados

Medidos en esta validacion:

- `test:smoke`: ~0.3-0.4 s
- `test:db-read`: ~0.9-1.6 s
- `test:db-analytics`: ~1.8-8.2 s
- `test:all-smoke` completo: ~3-11 s segun cache/carga

## Garantias que deja QW-5

- Existe comando estandar unico (`npm test`) para smoke.
- Se valida disponibilidad de endpoints criticos por capas.
- Se verifican envelopes JSON, status codes y contratos basicos.
- Se comprueba comportamiento read-only y bloqueo de rutas legacy.
- Se mantiene enfoque no destructivo (sin tocar datos vivos en smoke).

## Limitaciones actuales

- No cubre UX/browser flows end-to-end.
- No valida reglas funcionales finas de negocio QA en toda su profundidad.
- No ejecuta escrituras reales (`/save-json`, `/apply-revision-to-engines`) por seguridad en smoke.
- No hay pipeline CI activado aun (solo base lista para integrarlo).

## Criterios de aceptacion QW-5

1. `npm test` funciona. -> Cumplido
2. `npm run test:all-smoke` funciona. -> Cumplido
3. Todas las suites siguen pasando. -> Cumplido
4. No hay cambios runtime. -> Cumplido
5. No se modifican `engine_*.json`. -> Cumplido
6. Documentacion consolidada. -> Cumplido
7. QW-5 marcable como completado. -> Cumplido

## Siguientes pasos sugeridos

1. BK-1: validacion fuerte de payloads en endpoints de escritura.
2. AR-4: enganchar `npm test` en CI para gate minimo por PR.
3. Crear primera capa functional para writes en entorno aislado/snapshot.

