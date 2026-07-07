# Auditoria SQLite Mirror

Fecha: 2026-05-16
Scope: data/db/milu_mirror.sqlite, scripts/db/*, rutas /db/* y /db/analytics/*.

## Estado actual

- Mirror existe y es consumido por APIs read-only.
- Rutas /db y /db/analytics responden correctamente en smoke.
- Servicio abre SQLite en modo readonly + pragma query_only en runtime API.

## Validacion oficial

Resultado npm run db:validate:

- ok=false
- engines: 9/9
- rows: 67884 JSON vs 67883 SQLite (delta -1)
- unique PN: 5894 JSON vs 5893 SQLite (delta -1)
- warning principal: diferencia concentrada en engine_12V4000M40A.

Conclusión: mirror operativo pero no perfectamente sincronizado con source en este corte.

## Performance y consultas

- npm run db:queries genera informe sin error.
- Endpoints analytics con tiempos razonables en smoke (incluyendo vistas pesadas de imagenes y conflictos).
- Índices auxiliares disponibles (scripts/db/create_sqlite_indexes.js) para drilldowns y agregados.

## Separacion read-only y side effects

Fortalezas:

- Routers /db y /db/analytics bloquean metodos no GET con 405.
- Mirror no reemplaza source-of-truth JSON.
- Import es regenerable con scripts/db/import_engines_to_sqlite.js.

Riesgos:

- Desfase de -1 fila/-1 PN sugiere edge case en import (p.ej. sentinel tecnico o filtro de fila).
- Si analytics se usa para decisiones operativas, ese delta debe resolverse antes de auditorias finales.

## Índices y consultas lentas

- El proyecto ya contempla index tuning (Fase H.1) y benchmark de queries.
- No se detecta cuello bloqueante en smoke actual.
- Persisten operaciones costosas en consultas de LIKE y agregados grandes; mitigadas parcialmente por cache TTL analytics.

## Recomendaciones

1. Corregir delta JSON vs DB como condición previa a uso de mirror para reportes oficiales.
2. Automatizar db:import + db:validate como gate en pipeline de publicación.
3. Añadir prueba específica del caso discrepante (engine_12V4000M40A).
4. Mantener principio actual: mirror solo lectura y regenerable.
