# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# MILU Smoke Test Matrix

Estado de cobertura actual de endpoints y capas smoke.

| Endpoint / Ruta | Cubierto | Tipo de test | Destructivo | Capa | Notas |
|---|---|---|---|---|---|
| GET /health | Si | smoke-http | No | runtime | Healthcheck base |
| GET /version | Si | smoke-http | No | runtime | Versionado runtime |
| GET /engines | Si | smoke-http | No | runtime | Verifica 9 engines |
| GET /qa_revision_sync.php | Si | smoke-http | No | runtime | JSON, no PHP/HTML |
| GET /pn-review/list | Si | smoke-http | No | runtime | Listado PN review |
| GET /export/status | Si | smoke-http | No | runtime | Estado export |
| GET /export/files | Si | smoke-http | No | runtime | Listado de ficheros export |
| GET /pn/list | Si | smoke-http | No | runtime | Legacy: debe responder 410 |
| POST /export/run-synthetic | Si | smoke-http | No | runtime | Legacy: debe responder 410 |
| POST /export/run-ai-conflicts | Si | smoke-http | No | runtime | Legacy: debe responder 410 |
| POST /export/run-all | Si | smoke-http | No | runtime | Legacy: debe responder 410 |
| POST /save-json | No | n/a | Si | runtime | Excluido a proposito en smoke |
| POST /apply-revision-to-engines | No | n/a | Si | runtime | Excluido a proposito en smoke |
| GET /db/status | Si | smoke-db-read | No | db-read | Source sqlite_mirror |
| GET /db/summary | Si | smoke-db-read | No | db-read | Totales base |
| GET /db/engines | Si | smoke-db-read | No | db-read | Count engines |
| GET /db/qa-summary | Si | smoke-db-read | No | db-read | QA distributions |
| GET /db/images-summary | Si | smoke-db-read | No | db-read | Metricas imagenes |
| GET /db/export-candidates-summary | Si | smoke-db-read | No | db-read | Candidatos export |
| GET /db/search | Si | smoke-db-read | No | db-read | Caso valido + error q corta |
| GET /db/pn/:sku | Si | smoke-db-read | No | db-read | Detalle PN |
| POST /db/status | Si | smoke-db-read | No | db-read | Read-only: 405 |
| GET /db/analytics/overview | Si | smoke-db-analytics | No | analytics | KPIs + cache TTL |
| GET /db/analytics/engines | Si | smoke-db-analytics | No | analytics | Ranking motores |
| GET /db/analytics/images | Si | smoke-db-analytics | No | analytics | KPIs imagen |
| GET /db/analytics/qa | Si | smoke-db-analytics | No | analytics | Distribuciones QA |
| GET /db/analytics/pn-conflicts | Si | smoke-db-analytics | No | analytics | Resumen conflictos PN |
| GET /db/analytics/export | Si | smoke-db-analytics | No | analytics | Indicadores export |
| GET /db/analytics/cache | Si | smoke-db-analytics | No | analytics | Estado cache |
| GET /db/analytics/engine/:engine | Si | smoke-db-analytics | No | analytics | Drilldown engine |
| GET /db/analytics/pn/:sku | Si | smoke-db-analytics | No | analytics | Drilldown PN |
| GET /db/analytics/qa/pending | Si | smoke-db-analytics | No | analytics | Drilldown pendientes |
| GET /db/analytics/images/missing | Si | smoke-db-analytics | No | analytics | Drilldown sin imagen |
| GET /db/analytics/images/placeholders | Si | smoke-db-analytics | No | analytics | Drilldown placeholders |
| GET /db/analytics/export/pending | Si | smoke-db-analytics | No | analytics | Drilldown export pending |
| GET /db/analytics/search | Si | smoke-db-analytics | No | analytics | Search valida + q corta |
| GET /db/analytics/export-csv/pending-qa | Si | smoke-db-analytics | No | analytics | CSV content-type |
| GET /db/analytics/export-csv/nope | Si | smoke-db-analytics | No | analytics | Error 404 esperado |
| POST /db/analytics/overview | Si | smoke-db-analytics | No | analytics | Read-only: 405 |
| GET /db/analytics/nope | Si | smoke-db-analytics | No | analytics | Method not allowed |

## Notas

- Cobertura total actual: 41 tests (11 runtime + 10 db-read + 20 analytics).
- Criterio smoke: no ejecutar operaciones de escritura sobre datos vivos.
- Las rutas no cubiertas se mantienen fuera de smoke por seguridad (se validaran en functional/integration controlado).

