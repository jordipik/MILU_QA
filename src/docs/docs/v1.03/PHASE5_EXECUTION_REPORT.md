# PHASE5_EXECUTION_REPORT

FASE 5 — SAFE QUARANTINE EXECUTION

Fecha: 2026-06-04

Base de decisiones aplicada:

- MILU_OFFICIAL_COMPONENTS.md
- MILU_DUPLICATED_DOMAINS.md
- MILU_SIMPLIFICATION_PLAN.md
- MILU_V103_DECISIONS.md
- MILU_V103_FUNCTIONAL_TRUTH.md

## Archivos movidos

### Nueva estructura de cuarentena

- legacy_quarantine/
- legacy_quarantine/js/
- legacy_quarantine/python/
- legacy_quarantine/legacy/
- legacy_quarantine/wrappers/
- legacy_quarantine/docs/
- legacy_quarantine/README.md

### Movidos a legacy_quarantine/js

- apply-bulk-revision-to-engine.js

### Movidos a legacy_quarantine/wrappers

- analyze_missing_rebuild_rows.js
- analyze_rebuild_field_coverage.js
- compare_rebuild_vs_engine.js
- analyze_rebuild_equivalence_causes.js
- debug_rebuild_record_equivalence.js

## Endpoints eliminados

Retirados de server.js:

- POST /recompute-pdf-auto
- POST /export/run-synthetic
- POST /export/run-ai-conflicts
- POST /export/run-all
- POST /apply-qa-checks-filter
- GET /pn/list
- GET /pn/:sku
- GET /pn/:sku/sources

Verificacion previa:

- Sin llamadas en HTML.
- Sin fetch en frontend js/.
- Sin imports activos asociados.

## NPM scripts eliminados

- legacy:ai:conflicts
- legacy:export:review

Preservado:

- legacy:generate:synthetic

## Archivos conservados por duda

- apply_revision_to_engines.js

Motivo:

- Dependencia runtime real de server/services/revision-apply.js.
- Al moverlo, el servidor no arranca (MODULE_NOT_FOUND).
- Se restauró para mantener comportamiento oficial sin cambios.

## Riesgos encontrados

1. Dependencia legacy no documentada:
- Servicio oficial de revision apply requiere apply_revision_to_engines.js desde raiz.

2. Pruebas smoke desactualizadas respecto a D-26:
- tests/smoke/http-smoke.test.js aun referencia endpoints 410 retirados.

3. 404 residual no asociado a FASE 5:
- /milu/favicon.svg en export_wordpress.html.

## Validación runtime

Arranque:

- node server.js -> OK

Carga de HTML oficiales (HTTP 200):

- /recompute_simple.html
- /qa_milu.html
- /analista_02.html
- /export_wordpress.html

Chequeo de assets locales:

- Sin fallos nuevos de imports detectados por los cambios de FASE 5.
- 1 fallo residual observado: /milu/favicon.svg (404).

## D-37 (__pycache__)

- .gitignore ya contenia __pycache__/
- Directorios eliminados: 335 -> 0

## D-36 (no ejecutar limpieza masiva)

- No se borro tmp/bak/backup/logs/rar/capturas.
- Inventario generado en docs/v1.03/PHASE5_TMP_INVENTORY.md.

## Recomendación para FASE 6

1. Implementar SERVER_ENABLE_DANGEROUS_WRITE para rutas bulk de alto impacto.
2. Antes de seguir cuarentena D-30, desacoplar server/services/revision-apply.js para no depender de apply_revision_to_engines.js en raiz.
3. Actualizar tests smoke para reflejar la retirada física de endpoints legacy.

## Criterio de éxito de FASE 5

- No se modificó lógica funcional oficial.
- No se modificaron endpoints oficiales V1.03.
- Se aisló código legacy/wrappers de raiz.
- Servidor arranca y páginas oficiales cargan.
- Se redujo superficie de código muerto con riesgo controlado.