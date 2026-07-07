# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# MILU â€” Capa analytics + diagnÃ³stico sobre BD espejo (Fase G)

> **Estado**: Fase G (v1).
> **Naturaleza**: Capa **analÃ­tica y de diagnÃ³stico** sobre el espejo SQLite de
> Fase E + la capa de lectura HTTP de Fase F. **NO** sustituye nada del runtime
> operativo (`qa_milu.html`, `pn_review.html`, exports WordPress).
> **La fuente de verdad sigue siendo los 9 [`engine_*.json`](../../).**

---

## QuÃ© hace

- Expone **6 endpoints GET** bajo `/db/analytics/*` que devuelven agregados,
  rankings y resÃºmenes calculados sobre la BD espejo SQLite.
- Sirve **5 pÃ¡ginas HTML independientes** (`analytics_dashboard.html`,
  `analytics_images.html`, `analytics_qa.html`, `analytics_pn.html`,
  `analytics_export.html`) que consumen sÃ³lo esos endpoints.
- Todo es **read-only**. El servicio abre la BD con `{readonly: true}` y
  `PRAGMA query_only = ON`.

## QuÃ© NO hace

- No escribe en SQLite.
- No escribe en ningÃºn `engine_*.json`.
- No modifica `qa_milu.html` ni `pn_review.html`.
- No ejecuta el export WordPress.
- No expone endpoints POST/PUT/DELETE.
- No carga los 67 k rows enteros en el frontend; las listas grandes estÃ¡n
  acotadas en servidor (â‰¤ 100 elementos por categorÃ­a).
- No reutiliza mÃ³dulos del runtime operativo (`js/qa-milu.js`, `js/state.js`,
  etc.). La capa vive en `js/analytics/` con su propio `styles/analytics.css`.

## Artefactos

| Archivo | PropÃ³sito |
|---|---|
| [server/services/sqlite-mirror-analytics.js](../../server/services/sqlite-mirror-analytics.js) | Servicio: queries SQL agregadas, `query_only=ON`, withDb. |
| [server/routers/db-analytics-router.js](../../server/routers/db-analytics-router.js) | Router Express en `/db/analytics`. |
| [analytics_dashboard.html](../../analytics_dashboard.html) | KPIs globales + tabla por motor. |
| [analytics_images.html](../../analytics_images.html) | Cobertura de imÃ¡genes/esquemas. |
| [analytics_qa.html](../../analytics_qa.html) | Distribuciones y conflictos QA. |
| [analytics_pn.html](../../analytics_pn.html) | PN con variantes de campos crÃ­ticos. |
| [analytics_export.html](../../analytics_export.html) | DiagnÃ³stico exportable. |
| [js/analytics/](../../js/analytics/) | Cliente (1 fachada + 5 controladores). |
| [styles/analytics.css](../../styles/analytics.css) | Estilos aislados de la UI operativa. |
| [tests/smoke/db-analytics-smoke.test.js](../../tests/smoke/db-analytics-smoke.test.js) | Smoke HTTP de los 6 endpoints. |
| [data/output/validation/db_analytics_performance.md](../../data/output/validation/db_analytics_performance.md) | MediciÃ³n orientativa. |

## Endpoints

Todos GET, todos responden `{ok: true|false, source: 'sqlite_mirror', ...}`.

| Ruta | Devuelve |
|---|---|
| `GET /db/analytics/overview` | 13 KPIs globales + `generated_at`. |
| `GET /db/analytics/engines` | Por engine: `row_count`, `unique_pn`, `placeholders`, `without_images`, `without_schema`, `qa_pending`, `qa_ok`. |
| `GET /db/analytics/images` | Totales de `image_refs` + top motores sin imagen / con placeholders (â‰¤ 10). |
| `GET /db/analytics/qa` | `by_estado`, `by_accion`, `combinations` (â‰¤ 50), top PN conflictivos (â‰¤ 50), top engines pendientes (â‰¤ 10), ambiguos. |
| `GET /db/analytics/pn-conflicts` | PN con varios motores / sust / designaciÃ³n / medida / peso (â‰¤ 100 por categorÃ­a) + summary. |
| `GET /db/analytics/export` | Importables, descartables, pendientes, top reasons (â‰¤ 20), top engines (â‰¤ 10). |
| (otro mÃ©todo/ruta bajo `/db/analytics`) | 405 `METHOD_NOT_ALLOWED`. |

### Diferencias respecto a `qa_milu.html`

| `qa_milu.html` | `analytics_*.html` |
|---|---|
| Edita filas (`/save-json`, revisiones, etc.). | **Solo lectura**, sin escritura ninguna. |
| Carga los 9 `engine_*.json` enteros en memoria del cliente. | Llama a agregados acotados; no descarga el dataset. |
| Es la herramienta operativa de QA. | Es una herramienta de observabilidad/diagnÃ³stico. |
| Usa `js/state.js`, `js/qa-milu.js`, etc. | Usa `js/analytics/*` (mÃ³dulos ES aislados). |
| Depende del runtime JSON. | Depende del espejo SQLite (regenerable con `npm run db:import`). |

## CÃ³mo se alimenta desde SQLite

1. `npm run db:import` regenera [data/db/milu_mirror.sqlite](../../data/db/milu_mirror.sqlite)
   a partir de los 9 `engine_*.json`.
2. `npm run db:validate` confirma paridad JSON â†” BD.
3. El servicio [sqlite-mirror-analytics.js](../../server/services/sqlite-mirror-analytics.js)
   abre la BD una sola vez por proceso, en modo read-only, y ejecuta SQL preparado.
4. El router las expone como JSON.
5. Las pÃ¡ginas las consumen vÃ­a `fetch`.

## CÃ³mo ejecutar tests

Con el servidor levantado (`node server.js`):

```powershell
npm run test:db-analytics    # 8 smoke tests especÃ­ficos
npm run test:all-smoke       # http-smoke (11) + db-read (10) + db-analytics (8) = 29 tests
```

## Riesgos y mitigaciones

| Riesgo | MitigaciÃ³n |
|---|---|
| BD desincronizada con los JSON. | `/db/status` reporta `last_import`; `npm run db:validate` antes de fiarse. |
| Driver nativo no disponible. | Respuestas 503 estructuradas (`DRIVER_NOT_AVAILABLE`); el resto del servidor sigue. |
| ConfusiÃ³n con QA operativo. | PÃ¡ginas marcadas explÃ­citamente con badge `read-only Â· sqlite_mirror`; nav separado. |
| Consultas pesadas (`/qa` ~2,5 s). | Respuestas acotadas (â‰¤ 100 entradas); mediciÃ³n en [db_analytics_performance.md](../../data/output/validation/db_analytics_performance.md). |
| SQL injection. | No hay input usuario en estos endpoints (todos son GET sin parÃ¡metros). Las consultas usan literales y constantes. |

## Futuro posible

- Materializar agregados en tablas auxiliares durante `db:import` para acelerar `/qa`.
- CachÃ© en memoria por endpoint con TTL (30 s) si la pÃ¡gina dashboard se carga con frecuencia.
- Endpoints comparativos (cross-engine, evoluciÃ³n por import).
- SustituciÃ³n progresiva del recorrido en memoria de `engine_*.json` cuando se haya
  validado paridad continua. Esa migraciÃ³n NO forma parte de Fase G.


## Fase H ï¿½ Performance + Drilldown (mayo 2026)

Capa ampliada manteniendo todo el contrato existente. Detalle completo:
[../../data/output/validation/db_analytics_phase_h_report.md](../../data/output/validation/db_analytics_phase_h_report.md).

### ï¿½ndices SQLite

7 ï¿½ndices auxiliares creados con 
pm run db:index
(script: scripts/db/create_sqlite_indexes.js). Aceleran GROUP BY pn_final
con COUNT(DISTINCT), joins motorï¿½PN y la bï¿½squeda por PART NO.. Se propagan
tambiï¿½n a scripts/db/import_engines_to_sqlite.js.

### Cache TTL en memoria

Mï¿½dulo server/services/analytics-cache.js. Cachea los 6 agregados
durante MILU_ANALYTICS_CACHE_TTL_MS (default 30 s). Las respuestas incluyen
cached, generated_at, cache_age_ms, cache_ttl_ms. Ningï¿½n drilldown ni
search se cachea.

Diagnï¿½stico: GET /db/analytics/cache.

### Drilldown endpoints

- GET /db/analytics/engine/:engine?limit=&offset=
- GET /db/analytics/pn/:sku
- GET /db/analytics/qa/pending?limit=&offset=
- GET /db/analytics/images/missing?limit=&offset=
- GET /db/analytics/images/placeholders?limit=&offset=
- GET /db/analytics/export/pending?limit=&offset=

Paginaciï¿½n: default limit=100, mï¿½ximo limit=500.

### Bï¿½squeda global

GET /db/analytics/search?q=&limit=&offset= (mï¿½nimo 2 caracteres, 400 en
caso contrario). Busca pn_final, part_no_raw (PART NO.) y
designation_final. Resultados agrupados por PN.

### Export CSV

GET /db/analytics/export-csv/:view con iew ? {pending-qa, missing-images, placeholders, pn-conflicts}.
Generado dinï¿½micamente, sin persistencia, BOM UTF-8 para Excel.

### UI nueva

3 pï¿½ginas autocontenidas en la raï¿½z (no tocan qa_milu.html):

- nalytics_search.html ï¿½ buscador global.
- nalytics_pn_detail.html?sku=... ï¿½ detalle de un PN.
- nalytics_engine_detail.html?engine=... ï¿½ detalle paginado de un motor.

Las pï¿½ginas existentes enlazan PN ? motor en las tablas. El menï¿½ aï¿½ade
"Buscar".

### Tests


pm run test:db-analytics ahora ejecuta **20 tests** (cache, drilldowns,
search, CSV). Total smoke proyecto: 41/41.

