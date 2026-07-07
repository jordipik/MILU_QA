# Auditoria Tests y Validaciones

Fecha: 2026-05-16

## Estado de ejecucion

Ejecucion real: npm test

- test:smoke HTTP -> PASS (13/13)
- test:db-read -> PASS (10/10)
- test:db-analytics -> PASS (20/20)
- engine-schema smoke -> PASS (8/8)
- python-lib smoke -> PASS (16/16)
- python-exporters smoke -> PASS (2/2)

Resultado agregado: PASS completo.

## Cobertura actual (fortalezas)

- Runtime health/version/engines/revision sync/export status.
- Verificacion de endpoints legacy 410.
- Capa DB read-only y analytics read-only con contratos JSON.
- Validacion de schema engine.
- Seguridad write (tests/security/write-validation.test.js).
- Smoke de libreria Python y exportadores Python.

## Cobertura faltante (gaps)

| Gap | Impacto | Prioridad |
|---|---|---|
| E2E UI real (DOM, filtros, navegación completa) | Regresiones UX no detectadas | Alta |
| Functional tests de reglas de negocio por PN/fila | Riesgo de cambios silenciosos en QA/Export | Alta |
| Pruebas controladas de endpoints write masivos en entorno aislado | Riesgo en operaciones bulk | Alta |
| Snapshot formal de outputs WordPress como gate | Riesgo de drift en export | Media |
| Performance regression tests (umbral de latencia) | Degradaciones no monitorizadas | Media |

## Tests obsoletos/redundantes

- No se detectan tests claramente obsoletos en suite activa.
- Hay solapamiento parcial entre smoke runtime y comprobaciones manuales documentadas.

## Validaciones inexistentes importantes

1. Validacion semantica completa del payload /apply-revision-to-engines.
2. Validacion de coherencia media (rutas imagen/esquema) como gate de export.
3. Prueba automatizada de paridad estricta JSON vs SQLite mirror (hoy existe validate, pero no pasa en este corte).

## Recomendaciones

1. Añadir capa "functional-core" no destructiva para reglas QA+export.
2. Introducir entorno temporal para pruebas write masivas restaurables.
3. Integrar db:validate como criterio de fallo en CI cuando se toque DB/analytics.
4. Implementar baseline de performance para endpoints analytics pesados.
