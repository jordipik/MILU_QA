# Auditoria Global MILU - Inventario de Proyecto

Fecha: 2026-05-16
Scope: estado actual runtime + tooling + legacy, sin cambios funcionales.

## 1) Arquitectura general actual

MILU funciona como una aplicacion local file-centric:

- Fuente de verdad: 9 archivos engine_*.json en raiz (67,884 filas, ~213.7 MB).
- Backend: Express en server.js (CommonJS), puerto 3000, con endpoints write/read y compatibilidad .php.
- Frontend: paginas HTML en raiz + modulos ES en js/.
- Capa analitica: mirror SQLite (data/db/milu_mirror.sqlite) con rutas /db y /db/analytics read-only.
- Export WordPress: pipeline JS oficial scripts/export_wordpress_milu.js + UI export_wordpress.html.
- QA revision sync: qa_revision_server_data.json via /qa_revision_sync.php.
- Publicacion: scripts/prepare-pages-dist.js + scripts/build-release-folder.js.

## 2) Flujos funcionales reales

### BOM -> QA -> Export -> WordPress

1. Carga de 9 engine_*.json desde js/data-loader.js.
2. RevisiÃ³n QA en qa_milu.html / analista_02.html (estado+accion).
3. Persistencia puntual por /save-json o masiva por /apply-revision-to-engines y PN-review endpoints.
4. Export oficial con /export/run-wordpress (internamente scripts/export_wordpress_milu.js).
5. Salidas en data/05-wordpress/*.json + *.csv.

### Flujo Python

- Flujo oficial de depuracion: depuracion_json.py (normalizacion + campos finales).
- Libreria reutilizable: python_lib/.
- Scripts utility adicionales en raiz y scripts/*.py (analisis, comparadores, conversiones).
- Smoke Python activo en npm test (python-lib y exportadores).

### Flujo R

- No hay archivos .R/.r en el repositorio actual.
- Estado: sin pipeline R operativo en runtime ni tooling de build.

### Flujo frontend/backend

- Frontend QA, imagenes, export y analytics consume backend HTTP.
- Backend sirve static + API JSON.
- Compatibilidad local de rutas .php preservada por Express.

### Flujo SQLite mirror

1. scripts/db/import_engines_to_sqlite.js regenera mirror.
2. /db y /db/analytics exponen lectura y agregados.
3. scripts/db/validate_sqlite_mirror.js valida consistencia JSON vs DB.

### Analytics

- UI: analytics_*.html.
- API: /db/analytics/*.
- Cache TTL en memoria para vistas agregadas.

### Synthetic generation

- Generacion legacy disponible por comando legacy:generate:synthetic.
- Legacy complejo archivado en legacy/export_complex_ai/.

### Publicacion

- pages:prepare construye dist/milu_publish.
- release:folder genera carpeta versionada para entrega, excluyendo multimedia pesada/json.

## 3) Mapa de modulos y estado

### Paginas HTML (raiz)

- ACTIVO: qa_milu.html, analista_02.html, qa_imagenes.html, export_wordpress.html, analytics_dashboard.html, analytics_images.html, analytics_qa.html, analytics_pn.html, analytics_export.html, analytics_search.html, analytics_pn_detail.html, analytics_engine_detail.html, milu_shell.html.
- ESTABLE: qa_auditoria.html, qa_analista_registro.html.
- EN TRANSICION: qa_lista_agrupada.html, exportacion.html.
- LEGACY: index.html, auto_depuracion.html.
- OBSOLETO (referencias solo docs/historico): pn_review.html, qa_web.html, qa_articulos.html, milu_qa.html.

### Frontend JS

- ACTIVO: qa-milu.js, qa-table.js, data-loader.js, revision.js, revision-sync.js, export-wordpress.js, qa_imagenes*.js, analytics/*.js, topbar.js.
- ESTABLE: toast.js, confirm-typed-action.js, write-field-helper.js, export-field-helper.js.
- EN TRANSICION: fieldAdapter.js + qa-articulos-fields.js (coexistencia aliases legacy).
- LEGACY (activo pero con deuda): analista-02.js (3,877 lineas), qa-analista-registro.js.
- EXPERIMENTAL/NO runtime principal: pn-review.js (sin html dedicada actual), pn-review-embedded.js (uso parcial).

### Backend Express

- ACTIVO: server.js, server/routers/db-read-router.js, server/routers/db-analytics-router.js, server/validation/*, server/services/*.
- ESTABLE: endpoints /health, /engines, /version, /db/*, /db/analytics/*.
- EN TRANSICION: /export/* (mezcla de oficial + compatibilidad).
- LEGACY congelado: /pn/* (410), /export/run-synthetic (410), /export/run-ai-conflicts (410), /export/run-all (410), /apply-qa-checks-filter (410).

### Python

- ACTIVO: depuracion_json.py, python_lib/*, convert_engine_to_excel.py, convert_excel_to_json.py.
- ESTABLE: scripts/compare_normalized_engines.py, scripts/compare_export_outputs.py.
- LEGACY/UTILITY: add_final_fields.py, compare_measurements.py, importar_json.py, pretty_print_all_json.py, marcar_articulos_en_web.py, validate_engine_jsons.py.

### Scripts R

- OBSOLETO/NO APLICA: no existen scripts R en el repo.

### SQLite / DB

- ACTIVO: scripts/db/import_engines_to_sqlite.js, validate_sqlite_mirror.js, create_sqlite_indexes.js, sqlite_sample_queries.js.
- ESTABLE: rutas /db y /db/analytics read-only.
- EN TRANSICION: paridad JSON-DB (validacion actual reporta delta -1 fila y -1 PN).

### Testing y validacion

- ACTIVO: tests/smoke/*.test.js, tests/security/write-validation.test.js, tests field-adapter/*.test.js.
- ESTABLE: npm test (all-smoke) pasa 100%.
- GAP: sin E2E UI browser, sin test automatizado destructivo controlado para todos los writes.

### Documentacion

- ACTIVO: docs/ARQUITECTURA_MILU.md, docs/FLUJO_DATOS_MILU.md, docs/QA_MILU.md, docs/WORDPRESS_EXPORT_MILU.md, docs/testing/*, docs/security/*.
- EN TRANSICION: docs con referencias a pantallas retiradas (pn_review.html, milu_qa).
- LEGACY/ARCHIVED: docs/archived/*, docs/auditoria/* historicas.

### Legacy

- ACTIVO-CONGELADO: legacy/php/qa_revision_sync.php, legacy/php/save-json.php (compatibilidad de publicacion).
- LEGACY: legacy/export_complex_ai/scripts/*.

## 4) Hallazgos de inventario

- Superficie amplia pero operativa: 19 HTML, 45 modulos JS, 32 scripts Python, 19 archivos de test, 116 docs.
- Runtime real no usa R.
- Existen referencias documentales a artefactos ya eliminados del runtime (pn_review.html, milu_qa, qa_web, qa_articulos).
- El centro operativo actual es qa_milu + analista_02 + export_wordpress + analytics + db mirror.

