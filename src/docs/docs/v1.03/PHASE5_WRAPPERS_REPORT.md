# PHASE5_WRAPPERS_REPORT

Decision aplicada: D-31

Fecha: 2026-06-04

## Wrappers movidos a cuarentena

Movidos a legacy_quarantine/wrappers/:

- analyze_missing_rebuild_rows.js
- analyze_rebuild_field_coverage.js
- compare_rebuild_vs_engine.js

## Wrappers condicionados por uso

Evaluados:

- analyze_rebuild_equivalence_causes.js
- debug_rebuild_record_equivalence.js

Validacion de uso activo (html/js/json/bat/ps1):

- No se detectaron referencias activas externas.

Accion aplicada:

- Tambien movidos a legacy_quarantine/wrappers/.

## Cobertura oficial mantenida

Las versiones operativas en scripts/ permanecen intactas:

- scripts/analyze_missing_rebuild_rows.js
- scripts/analyze_rebuild_field_coverage.js
- scripts/compare_rebuild_vs_engine.js

## Resultado

- Se reduce ruido en raiz.
- No se altera pipeline oficial ni endpoints oficiales.