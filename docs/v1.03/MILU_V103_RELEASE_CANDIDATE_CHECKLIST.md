# MILU_V103_RELEASE_CANDIDATE_CHECKLIST

## Objetivo
Cerrar V1.03 con una foto final clara, reproducible y usable antes de seguir desarrollando, sin reabrir caos legacy ni ejecutar escrituras reales durante el cierre.

## Estado consolidado por fases

### FASE 4.8 - auditoria funcional real
- Auditoria funcional realizada contra comportamiento real del sistema.
- Documentos base:
  - `MILU_PDF_FUNCTIONAL_AUDIT.md`
  - `MILU_HERMANOS_EQUIVALENCE.md`
  - `MILU_ESTADOS_EQUIVALENCE.md`
  - `MILU_ESQUEMAS_AUDIT.md`
  - `MILU_V103_FUNCTIONAL_TRUTH.md`
- Resultado util para release:
  - existe una verdad funcional documentada para PDF, estados, hermanos y esquemas.

### FASE 5 - cuarentena segura legacy
- Se movio codigo legacy y wrappers redundantes a `legacy_quarantine/` sin borrar fisicamente.
- Se eliminaron endpoints legacy retirados del runtime oficial.
- Se eliminaron scripts npm legacy de mayor riesgo, manteniendo solo el legacy sintetico aun necesario.
- Se inventario `tmp/bak/backup/log/rar` sin limpieza destructiva.

### FASE 6 - guard de escrituras peligrosas
- Se incorporo `SERVER_ENABLE_DANGEROUS_WRITE` como control operativo de endpoints de escritura de alto impacto.
- Se corrigio el favicon residual de `export_wordpress.html`.
- Se alineo el smoke con la eliminacion fisica de endpoints legacy.

### FASE 7 - smoke estable y desacople revision apply
- Se corrigio el timeout de `GET /pn-review/list` usando paginacion real ya soportada por backend.
- `server/services/revision-apply.js` dejo de depender en runtime de un script root legacy.
- Se creo `server/services/revision-apply-core.js`.
- `apply_revision_to_engines.js` queda preservado como wrapper CLI compatible.
- Se anadio test de import/carga para prevenir `MODULE_NOT_FOUND`.

## Componentes oficiales vivos

### Endpoints oficiales vivos
Conjunto minimo confirmado como vivo y relevante para V1.03:

- `GET /health`
- `GET /version`
- `GET /engines`
- `GET /qa_revision_sync.php`
- `POST /qa_revision_sync.php`
- `GET /pn-review/list`
- `GET /pn-review/:sku`
- `GET /pn-review/:sku/sources`
- `GET /export/status`
- `GET /export/files`
- `POST /apply-revision-to-engines`
- `POST /api/recompute-simple/enrich-assets`
- `POST /api/recompute-simple/recompute-hermanos`
- `POST /api/recompute-simple/rebuild-schemes-by-bom`
- `POST /api/recompute-simple/rebuild-schemes-circles-from-esquemas`
- `POST /api/pdf-preview/apply-to-engine`
- `POST /recompute-pdf-auto-visual`
- `POST /copy-pdf-to-pdf-all-books`
- `POST /copy-pdf-to-final-all-books`
- `POST /clear-engine-fields`
- `POST /api/apply-generate-batch`

Nota:
- Los endpoints de escritura anteriores siguen vivos, pero protegidos por guard operativo.
- El release gate de lectura valida al menos `/health`, `/version`, `/engines`, `/qa_revision_sync.php`, `/pn-review/list`, `/pn-review/:sku/sources`, `/export/status` y `/export/files`.

### Scripts oficiales vivos
Scripts y comandos que siguen formando parte del flujo soportado V1.03:

- `node server.js`
- `Ejecutar localhost.bat`
- `npm install`
- `node --test tests/smoke/http-smoke.test.js`
- `node --test tests/smoke/revision-apply-import.test.js`

Scripts soportados pero fuera del gate minimo de release:

- `npm run export:wordpress`
- `npm run export:wordpress:validate`
- `npm run test:smoke`
- `npm run test:all-smoke`

### Paginas HTML oficiales
Paginas oficiales validadas en el gate de release:

- `recompute_simple.html`
- `qa_milu.html`
- `analista_02.html`
- `export_wordpress.html`

Paginas presentes en el repo pero fuera del gate minimo de release candidate:

- `qa_auditoria.html`
- `qa_imagenes.html`
- `qa_lista_agrupada.html`
- `qa_analista_registro.html`
- `analytics_dashboard.html`
- `analytics_engine_detail.html`
- `analytics_export.html`
- `analytics_images.html`
- `analytics_pn.html`
- `analytics_pn_detail.html`
- `analytics_qa.html`
- `analytics_search.html`
- `import_pdf.html`
- `exportacion.html`
- `index.html`
- `milu_shell.html`

### Tests smoke actuales
Smoke tests activos en `tests/smoke/`:

- `tests/smoke/http-smoke.test.js`
- `tests/smoke/revision-apply-import.test.js`
- `tests/smoke/db-read-smoke.test.js`
- `tests/smoke/db-analytics-smoke.test.js`
- `tests/smoke/engine-schema.test.js`
- `tests/smoke/python-lib.test.js`
- `tests/smoke/python-exporters-smoke.test.js`

Gate minimo de release candidate V1.03:

- `tests/smoke/http-smoke.test.js`
- `tests/smoke/revision-apply-import.test.js`

### Guards activos
Bloqueados cuando `SERVER_ENABLE_DANGEROUS_WRITE` no esta habilitado:

- `POST /api/recompute-simple/enrich-assets` cuando `dryRun !== true`
- `POST /api/recompute-simple/recompute-hermanos` cuando `dryRun !== true`
- `POST /api/recompute-simple/rebuild-schemes-by-bom` cuando `dryRun !== true`
- `POST /api/recompute-simple/rebuild-schemes-circles-from-esquemas` cuando `dryRun !== true`
- `POST /api/pdf-preview/apply-to-engine`
- `POST /recompute-pdf-auto-visual` cuando `dryRun !== true`
- `POST /copy-pdf-to-pdf-all-books` cuando `writePdf === true`
- `POST /copy-pdf-to-final-all-books`
- `POST /clear-engine-fields` cuando `dryRun !== true`
- `POST /apply-revision-to-engines`
- `POST /api/apply-generate-batch`

Mensaje estandar:

- `Dangerous write disabled. Set SERVER_ENABLE_DANGEROUS_WRITE=true to enable.`

## Legacy ya aislado

### Endpoints eliminados
Retirados del runtime oficial y esperados como `404` o, en general, `no 200`:

- `POST /recompute-pdf-auto`
- `POST /export/run-synthetic`
- `POST /export/run-ai-conflicts`
- `POST /export/run-all`
- `POST /apply-qa-checks-filter`
- `GET /pn/list`
- `GET /pn/:sku`
- `GET /pn/:sku/sources`

### Wrappers movidos
Movidos a `legacy_quarantine/wrappers/`:

- `analyze_missing_rebuild_rows.js`
- `analyze_rebuild_field_coverage.js`
- `compare_rebuild_vs_engine.js`
- `analyze_rebuild_equivalence_causes.js`
- `debug_rebuild_record_equivalence.js`

Movido a `legacy_quarantine/js/`:

- `apply-bulk-revision-to-engine.js`

### npm scripts eliminados

- `legacy:ai:conflicts`
- `legacy:export:review`

Preservado:

- `legacy:generate:synthetic`

### Carpetas preservadas por seguridad

- `legacy_quarantine/`
- `legacy_quarantine/js/`
- `legacy_quarantine/python/`
- `legacy_quarantine/legacy/`
- `legacy_quarantine/wrappers/`
- `legacy_quarantine/docs/`
- `legacy/`

Nota:
- `legacy/export_complex_ai` sigue preservado; no entra en el gate de release, pero tampoco se toca en esta fase.

## Deuda pendiente aceptada

- `tmp/bak/backup/log/rar/capturas` solo inventariado; no limpiado masivamente.
- `legacy/export_complex_ai` preservado por seguridad e historial.
- `apply_revision_to_engines.js` conservado en raiz como wrapper CLI compatible, aunque el servicio oficial ya no depende de el en runtime.
- `SERVER_ENABLE_DANGEROUS_WRITE` reduce riesgo, pero sigue requiriendo disciplina operativa humana.
- Existen paginas HTML fuera del gate minimo cuyo estado no se usa como criterio de release candidate.

## Checklist antes de ejecutar operaciones peligrosas

Antes de cualquier operacion con escritura real:

- `git status` limpio o, como minimo, cambios entendidos y aislados.
- backup disponible del JSON o conjunto afectado.
- `SERVER_ENABLE_DANGEROUS_WRITE=true` solo durante la operacion concreta.
- ejecutar `dryRun` primero siempre que exista esa opcion.
- validar diff o resultado inmediatamente despues de la operacion.
- si el servidor quedo levantado con `env=true`, apagarlo al terminar.

Regla operativa:

- nunca usar endpoints o scripts de escritura como "smoke inocuo" si no se ha demostrado que no tienen side effects.

## Comandos de validacion release

### Arranque basico
```powershell
node server.js
```

### Smoke principal
```powershell
node --test tests/smoke/http-smoke.test.js
node --test tests/smoke/revision-apply-import.test.js
```

### HTML oficiales
```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/recompute_simple.html
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/qa_milu.html
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/analista_02.html
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/export_wordpress.html
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/favicon.svg
```

### Endpoints guard con env OFF
Servidor iniciado sin variable o con variable vacia.

```powershell
curl.exe -s -X POST http://localhost:3000/apply-revision-to-engines -H "Content-Type: application/json" -d "{}"
curl.exe -s -X POST http://localhost:3000/api/apply-generate-batch -H "Content-Type: application/json" -d "{\"updates\":[]}"
curl.exe -s -X POST http://localhost:3000/clear-engine-fields -H "Content-Type: application/json" -d "{\"files\":[\"engine_12V4000M53.json\"],\"dryRun\":false}"
```

Esperado:

- `403`
- mensaje `Dangerous write disabled. Set SERVER_ENABLE_DANGEROUS_WRITE=true to enable.`

### Endpoints guard con env ON
Servidor reiniciado con:

```powershell
$env:SERVER_ENABLE_DANGEROUS_WRITE='true'
node server.js
```

Validaciones sin escritura real:

```powershell
curl.exe -s -X POST http://localhost:3000/apply-revision-to-engines -H "Content-Type: application/json" -d "{}"
curl.exe -s -X POST http://localhost:3000/api/recompute-simple/recompute-hermanos -H "Content-Type: application/json" -d "{\"engine\":\"ALL\",\"dryRun\":true,\"backup\":false}"
curl.exe -s -X POST http://localhost:3000/clear-engine-fields -H "Content-Type: application/json" -d "{\"files\":[\"engine_12V4000M53.json\"],\"dryRun\":true}"
curl.exe -s -X POST http://localhost:3000/api/apply-generate-batch -H "Content-Type: application/json" -d "{\"updates\":[]}"
```

Esperado:

- no `403` por guard
- `200` o `400` de validacion segun payload

### Endpoints legacy retirados
```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/pn/list
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/pn/TEST-SKU
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/pn/TEST-SKU/sources
```

Esperado:

- `404` o, como minimo, `no 200`

## Criterios de release candidate OK

Se considera `release candidate OK` cuando se cumplen todos:

- `node server.js` arranca.
- HTML oficiales responden `200`.
- `favicon.svg` responde `200`.
- `node --test tests/smoke/http-smoke.test.js` da `17/17`.
- `node --test tests/smoke/revision-apply-import.test.js` da `2/2`.
- endpoints legacy retirados responden `404` o `no 200`.
- endpoints peligrosos devuelven `403` con `SERVER_ENABLE_DANGEROUS_WRITE` desactivado.
- endpoints peligrosos no quedan bloqueados por guard con `SERVER_ENABLE_DANGEROUS_WRITE=true`.
- `engine_MODEL.json` no queda con cambios pendientes tras validaciones.

## Cierre operativo V1.03

V1.03 queda cerrada como release candidate si se mantiene esta disciplina:

- no reactivar endpoints legacy retirados,
- no reintroducir wrappers root redundantes,
- no ejecutar escrituras reales fuera de ventana controlada,
- usar el gate minimo de release antes de tocar runtime oficial.