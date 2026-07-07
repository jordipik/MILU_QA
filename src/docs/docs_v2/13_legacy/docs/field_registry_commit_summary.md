# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Field Registry Commit Summary

Fecha: 2026-05-16

## Resumen ejecutivo

Esta propuesta separa solo los cambios de la fase READ-COMPATIBILITY de field_registry/fieldAdapter para un commit selectivo y seguro.

Se excluyen explicitamente cambios no relacionados ya presentes en el repositorio y no se revierte nada.

## Archivos de codigo modificados (incluidos)

- package.json
- js/qa-table.js
- js/pn-review.js
- js/pn-review-embedded.js
- js/qa-analista-registro.js
- js/export-wordpress.js

## Scripts anadidos (incluidos)

- scripts/refactor_json_fields.py
- scripts/compare_normalized_engines.py
- scripts/audit_field_adapter_usage.py

## Helpers de lectura anadidos (incluidos)

- js/fieldAdapter.js
- js/qa-articulos-fields.js
- js/export-preview-fields.js

## Tests anadidos (incluidos)

- tests/refactor-json-fields.test.js
- tests/field-adapter.test.js
- tests/field-adapter-compact-read.test.js
- tests/field-adapter-pn-review.test.js
- tests/field-adapter-qa-articulos.test.js
- tests/field-adapter-export-preview.test.js

## Docs anadidas/actualizadas (incluidas)

- docs/field_registry_refactor.md
- docs/testing/README.md
- docs/field_registry_functional_compare.md
- docs/field_registry_normalization_report.md
- docs/field_adapter_usage_audit.md
- docs/field_registry_commit_summary.md

## Artefactos generados

Incluibles en commit (versionables en estado actual):
- docs/field_registry_functional_compare.md
- docs/field_registry_normalization_report.md
- docs/field_adapter_usage_audit.md

Generados pero no stageables por .gitignore global de JSON (*.json):
- data/field_registry.json
- data/normalized/compare_normalized_summary.json
- data/field_adapter_usage_audit.json

Nota: data/normalized/*.normalized.json no aparecen como versionados en este repo (tracked: none).

## Comandos ejecutados y resultado

- git status --short
  - OK. Se identificaron cambios relacionados y no relacionados.
- npm run test:field-registry
  - OK. 22 pass, 0 fail (warning ESM conocido, no bloqueante).
- npm run compare:normalized
  - OK. Engines compared: 9 | OK: 9 | CHECK: 0.
- npm run audit:field-adapter
  - OK. Matches: 489.
- npm test
  - OK. Smoke/db/python suites en verde.

## Restricciones respetadas

- No se modifico logica funcional mas alla del alcance de la fase.
- No se tocaron flujos de escritura productiva para esta entrega de cierre.
- No se revirtio ningun cambio ajeno preexistente.
- No se hizo commit automatico.

## Archivos no relacionados detectados y NO incluidos en propuesta de commit

- tests/smoke/engine-schema.test.js
- tests/smoke/http-smoke.test.js
- tests/smoke/python-lib.test.js
- Excel refactorizacion Milu.xlsx
- ~$Excel refactorizacion Milu.xlsx
- scripts/__pycache__/ (artefacto local, no relacionado con el commit funcional)

## Propuesta de git add seguro (por bloques)

Bloque 1 - scripts y package:
- git add package.json scripts/refactor_json_fields.py scripts/compare_normalized_engines.py scripts/audit_field_adapter_usage.py

Bloque 2 - adapter y helpers:
- git add js/fieldAdapter.js js/qa-articulos-fields.js js/export-preview-fields.js

Bloque 3 - integracion read-only en vistas:
- git add js/qa-table.js js/pn-review.js js/pn-review-embedded.js js/qa-analista-registro.js js/export-wordpress.js

Bloque 4 - tests dedicados:
- git add tests/refactor-json-fields.test.js tests/field-adapter.test.js tests/field-adapter-compact-read.test.js tests/field-adapter-pn-review.test.js tests/field-adapter-qa-articulos.test.js tests/field-adapter-export-preview.test.js

Bloque 5 - documentacion:
- git add docs/field_registry_refactor.md docs/testing/README.md docs/field_registry_functional_compare.md docs/field_registry_normalization_report.md docs/field_adapter_usage_audit.md docs/field_registry_commit_summary.md

## Mensaje de commit propuesto

feat(field-registry): add read-compatible field adapter migration layer

