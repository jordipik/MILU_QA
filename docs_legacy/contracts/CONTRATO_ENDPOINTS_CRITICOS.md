# Contrato de endpoints críticos

> **CONTRATO MILU — v1** · Fase: CONTRATOS + ESTABILIDAD · No modifica código ni datos.
>
> Tabla de referencia oficial de los endpoints HTTP del backend Express ([server.js](../../server.js)). Incluye entrada, salida, efectos en disco, archivos afectados, nivel de riesgo y validación recomendada.

## Leyenda

- **Disco**: ¿el endpoint escribe en disco? `R` = solo lectura · `RW` = lectura+escritura · `–` = sin acceso a disco.
- **Riesgo**: `bajo` (idempotente, sin efectos), `medio` (modifica disco con scope acotado), `alto` (modifica engine_*.json o lanza procesos).
- Todos los endpoints responden JSON salvo indicación contraria.

## 1. Sistema y catálogo

| Endpoint | Método | Entrada | Salida | Disco | Archivos | Riesgo | Validación recomendada |
|---|---|---|---|---|---|---|---|
| `/health` | GET | — | `{ok, service}` | – | — | bajo | smoke test |
| `/version` | GET | — | `{version}` | R | [package.json](../../package.json) | bajo | comparar con package.json |
| `/engines` | GET | — | `{ok, engines[], totals{rowCount,fileSize}}` | R | 9× `engine_*.json` (stat) | bajo | comprobar 9 entries |
| `/api/esquemas-pos-index` | GET | — | `{ok, files[]}` | R | [esquemas_pos_circulos/](../../esquemas_pos_circulos/) (cacheado) | bajo | comprobar lista no vacía |

## 2. Revisión QA

| Endpoint | Método | Entrada | Salida | Disco | Archivos | Riesgo | Validación recomendada |
|---|---|---|---|---|---|---|---|
| `/qa_revision_sync.php` | GET | — | `{meta, revisions{v,r[],k{}}}` | R | [qa_revision_server_data.json](../../qa_revision_server_data.json) | bajo | JSON válido + meta.updated_at |
| `/qa_revision_sync.php` | POST | `{revisions{v,r[],k{}}}` | `{ok, saved_rows}` | RW | [qa_revision_server_data.json](../../qa_revision_server_data.json) | medio | round-trip GET→POST→GET |
| `/save-json` | POST | `{file, id, field, value}` | `{ok}` | RW | un `engine_*.json` | alto | verificar fila después + valores `qa_revision_*` ∈ contrato |
| `/save-json.php` | POST | (alias) | igual | RW | igual | alto | igual |
| `/apply-revision-to-engines` | POST | `{rows[], k{}}` | `{ok, result}` | RW | múltiples `engine_*.json` | alto | dry-run previo + diff de filas |
| `/recompute-qa-errors` | POST | `{file, id?}` | `{ok, result}` | RW | un `engine_*.json` (strip qa_errors_active) | medio | verificar idempotencia |
| `/recompute-pdf-auto` | POST | `{file, mode?}` | `{ok, result{file,mode,scanned,changedRows,...}}` | RW | un `engine_*.json` | alto | run con mode=dry primero |

## 3. PN Review

| Endpoint | Método | Entrada | Salida | Disco | Archivos | Riesgo | Validación recomendada |
|---|---|---|---|---|---|---|---|
| `/pn-review/list` | GET | query `?decision=&limit=` | `{ok, rows[], total, loaded_at}` | R (cache) | 9× `engine_*.json` (cargados en memoria) | bajo | comprobar total > 0 |
| `/pn-review/:sku` | GET | path `:sku` | `{ok, sku, export_row, qa_summary, validation, merged_fields, source_rows_preview[], images_all[], sust_summary, conflict_summary}` | R | cache | bajo | sku conocido devuelve `ok:true` |
| `/pn-review/:sku/sources` | GET | path `:sku` | `{ok, sku, count, rows[]}` | R | cache | bajo | count == nº filas reales |
| `/pn-review/:sku/apply-decision` | POST | `{action: validar\|revisar\|descartar}` | `{ok, sku, target_estado, target_accion, decision_applied, rows_updated}` | RW | engines que contienen al SKU | alto | post-condición: `estado/accion` canónicos ([CONTRATO_REVISION_QA.md](CONTRATO_REVISION_QA.md)) |
| `/pn-review/:sku/apply-values` | POST | `{fields{}}` | `{ok, sku, applied_fields, rows_updated}` | RW | engines del SKU | alto | revisar campos modificables permitidos |
| `/pn-review/apply-siblings-bulk` | POST | `{}` | `{ok, result{scanned_items, pns_with_changes, planned_updates,...}}` | RW | múltiples `engine_*.json` | alto | dry-run + log de cambios |
| `/pn-review/by-id/:id/apply-decision` | POST | `{action}` | `{ok, id, target, decision_applied, rows_updated}` | RW | un `engine_*.json` | alto | igual a `:sku/apply-decision` |

## 4. Export WordPress

| Endpoint | Método | Entrada | Salida | Disco | Archivos | Riesgo | Validación recomendada |
|---|---|---|---|---|---|---|---|
| `/export/run-wordpress` | POST | — | `{ok, result{wordpress,summary{import,pending,discard}}, run_state}` | RW | [data/output/wordpress/](../../data/output/wordpress/) | alto | post: contar archivos generados |
| `/export/status` | GET | — | `{ok, run_state, timestamp, counts, files, report}` | R | `data/output/wordpress/*` | bajo | smoke |
| `/export/preview` | GET | — | `{ok, summary, markdownSummary, rows[]}` | R | igual | bajo | smoke |
| `/export/wordpress-decisions` | GET | — | `{ok, rows[], summary{total,import,pending,discard,qa_validated}}` | R | igual | bajo | totales coherentes con `/export/status` |
| `/export/trace/:sku` | GET | path `:sku` | `{ok, sku, trace}` | R | [data/output/wordpress/milu_wp_trace.json](../../data/output/wordpress/milu_wp_trace.json) | bajo | sku conocido devuelve trace |
| `/export/files` | GET | — | `{ok, files[], summary{totalFiles,totalSize,lastModified,byFolder}}` | R | [data/output/](../../data/output/) | bajo | smoke |
| `/export/file` | GET | query `?folder=&name=` | `{ok, folder, name, size, mtime, type, truncated, preview_bytes, parsed?}` | R | `data/output/wordpress/<file>` | bajo | no exceder 512 KB en preview |
| `/export/download` | GET | query `?folder=&name=` | binario + `Content-Disposition` | R | igual | bajo | hash o tamaño coherente |

## 5. Audit log

| Endpoint | Método | Entrada | Salida | Disco | Archivos | Riesgo | Validación recomendada |
|---|---|---|---|---|---|---|---|
| `/audit-log` | GET | query `?limit=` | `{ok, rows[], total}` | R | [qa_audit_log.json](../../qa_audit_log.json) | bajo | total >= 0 |
| `/audit-log` | POST | `{action, ...}` | `{ok}` | RW | igual | medio | máximo 10000 entradas (rotación) |
| `/audit-log` | DELETE | — | `{ok}` | RW | igual | alto | confirmar antes de purgar |

## 6. Endpoints legacy desactivados (responden 410 Gone)

No reactivar sin actualizar este contrato.

- `GET /pn/list`, `GET /pn/:sku`, `GET /pn/:sku/sources` (sustituidos por `/pn-review/*`).
- `POST /export/run-synthetic`
- `POST /export/run-ai-conflicts`
- `POST /export/run-all`
- `POST /apply-qa-checks-filter`

Respuesta estándar: `{ok: false, legacy: true, error: "...desactivado..."}`.

## 7. Reglas de oro

1. **El servidor debe atender `/qa_revision_sync.php` ANTES del static middleware** (si se sirve PHP estático por error, devuelve el archivo fuente en vez de JSON).
2. **`/save-json` y `/apply-revision-to-engines`** modifican `engine_*.json`. **Cualquier cambio en su contrato** rompe la UI y los exports.
3. **Endpoints de alto riesgo** deben tener:
   - validación de payload de entrada,
   - log en `/audit-log` o equivalente,
   - posibilidad de dry-run cuando aplique.
4. **No introducir nuevos endpoints** sin actualizar este contrato.

## 8. Orden de diagnóstico oficial

Ante un fallo:

1. `GET /health` → servidor vivo.
2. `GET /version` → versión correcta.
3. `GET /qa_revision_sync.php` → JSON, NO el archivo PHP fuente.
4. `POST /save-json` o `POST /apply-revision-to-engines` → según el flujo afectado.
5. UI ([qa_milu.html](../../qa_milu.html)) en último lugar.

Para persistencia: servidor levantado → respuesta HTTP → payload del frontend → escritura efectiva en disco.

## 9. Riesgos / pendientes

- **R1**: No hay validación formal de esquemas para los payloads POST. Recomendado: añadir `ajv` o equivalente en una fase posterior.
- **R2**: `/save-json` permite editar cualquier campo de cualquier fila. Recomendado: lista blanca de campos editables.
- **R3**: Algunos endpoints PN-review dependen de un índice en memoria cacheado al arranque. Si los `engine_*.json` cambian fuera del servidor, el cache queda obsoleto.
- **R4**: `/audit-log` DELETE no requiere confirmación.

## 9.1. Fase I - Payload validation + write safety

- La fase I introduce validacion explicita de payloads de escritura sin cambiar el runtime ni migrar persistencia.
- `/save-json` queda restringido por whitelist de campos y normalizacion legacy controlada.
- Los endpoints PN Review siguen aceptando compatibilidad historica (`descartar`, `measurement_final`) mientras se bloquean campos peligrosos.
- Ver tambien: [../security/PAYLOAD_VALIDATION.md](../security/PAYLOAD_VALIDATION.md) y [../security/WRITE_ENDPOINTS_AUDIT.md](../security/WRITE_ENDPOINTS_AUDIT.md).

## 10. Capa de lectura /db/* (Fase F)

Read-only sobre el espejo SQLite. No toca engine_*.json. Detalle completo: [../database/DB_READ_LAYER.md](../database/DB_READ_LAYER.md).

- GET /db/status, /db/summary, /db/engines, /db/qa-summary, /db/images-summary, /db/export-candidates-summary, /db/search, /db/pn/:sku.
- Cualquier m�todo != GET o ruta no listada bajo /db ? 405 METHOD_NOT_ALLOWED.
- Errores: DB_NOT_FOUND / DRIVER_NOT_AVAILABLE ? 503; INVALID_SKU / QUERY_TOO_SHORT ? 400; resto ? 500.
- Smoke: 
pm run test:db-read.

## 11. Capa analytics /db/analytics/* (Fase G)

Read-only sobre el espejo SQLite, ALEM\u00c1S de la Fase F. No toca engine_*.json. Detalle: [../database/DB_ANALYTICS_LAYER.md](../database/DB_ANALYTICS_LAYER.md).

- GET /db/analytics/overview, /engines, /images, /qa, /pn-conflicts, /export.
- M\u00e9todos != GET o rutas no listadas \u2192 405 METHOD_NOT_ALLOWED.
- Respuestas acotadas: ning\u00fan endpoint devuelve > 100 filas por categor\u00eda.
- P\u00e1ginas independientes: analytics_dashboard.html / analytics_images.html / analytics_qa.html / analytics_pn.html / analytics_export.html. NO reutilizan qa_milu.html.
- Smoke: 
pm run test:db-analytics (
pm run test:all-smoke ejecuta los 29 tests del proyecto).



## 12. Fase H � Performance + Drilldown analytics

Extiende la Fase G manteniendo el contrato existente. Detalle:
[../database/DB_ANALYTICS_LAYER.md](../database/DB_ANALYTICS_LAYER.md) e informe
[../../data/output/validation/db_analytics_phase_h_report.md](../../data/output/validation/db_analytics_phase_h_report.md).

- Nuevos GET: `/db/analytics/engine/:engine`, `/pn/:sku`, `/qa/pending`, `/images/missing`, `/images/placeholders`, `/export/pending`, `/search`, `/cache`, `/export-csv/:view`.
- Cache TTL 30 s (configurable con `MILU_ANALYTICS_CACHE_TTL_MS`) sobre los 6 agregados de Fase G. Respuesta cacheada incluye `cached`, `generated_at`, `cache_age_ms`, `cache_ttl_ms`. Drilldowns y search no se cachean.
- Paginaci�n: `limit` default 100, m�ximo 500.
- Errores: `INVALID_PARAM` ? 400; `UNKNOWN_VIEW` ? 404; `DB_NOT_FOUND`/`DRIVER_NOT_AVAILABLE` ? 503; `METHOD_NOT_ALLOWED` ? 405.
- Smoke: `npm run test:db-analytics` ejecuta 20 tests; `npm run test:all-smoke` cubre los 41 del proyecto.
- Scripts nuevos: `npm run db:index` recrea los �ndices auxiliares en `data/db/milu_mirror.sqlite`.
- UI: p�ginas nuevas independientes (`analytics_search.html`, `analytics_pn_detail.html`, `analytics_engine_detail.html`). NO modifican `qa_milu.html`.
