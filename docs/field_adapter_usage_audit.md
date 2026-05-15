# Field Adapter Usage Audit

Fecha: 2026-05-16

## Resumen global

- Archivos escaneados: 121
- Archivos con accesos legacy directos: 55
- Total de accesos legacy detectados: 489
- LOW: 172
- MEDIUM: 82
- HIGH: 113
- IGNORE: 122

## Archivos con mas accesos legacy

- server.js: 84
- js/analista-02.js: 28
- js/qa-milu.js: 25
- generate_synthetic_exports.js: 21
- server/services/pn-review-qa-cache.js: 20
- scripts/db/import_engines_to_sqlite.js: 15
- js/qa-table.js: 14
- js/export-wordpress.js: 12
- server/services/sqlite-mirror-analytics.js: 12
- recompute_engine_errors.js: 11
- milu_shell.html: 10
- js/qa-checks.js: 10
- scripts/db/validate_sqlite_mirror.js: 10
- scripts/audit_image_schema_system.js: 9
- scripts/validate_engine_contracts.js: 9

## Campos legacy mas usados

- status: 114
- sust_hierarchie: 51
- exp_imagenes: 40
- gesa: 34
- sust_new_part_number: 26
- PART NO.: 19
- sust_superseded_list: 16
- sust_status: 16
- dimensions_gesa: 14
- normalizado: 14
- units: 11
- Source Page: 5
- pages: 2
- pn_new: 2
- filename_foto: 2

## Zonas ya adaptadas

- MILU QA tabla compacta: js/qa-table.js
- PN Review: js/pn-review.js, js/pn-review-embedded.js
- qa_articulos / vista analisis: js/qa-analista-registro.js, js/qa-articulos-fields.js
- Export Preview / listados New-Superseded: js/export-wordpress.js, js/export-preview-fields.js

## Zonas pendientes

- generate_synthetic_exports.js (HIGH)
- scripts/export_wordpress_milu.js (HIGH)
- server.js (HIGH)
- server/services/sqlite-mirror-analytics.js (HIGH)
- analysis.js (MEDIUM)
- js/analista-02.js (MEDIUM)
- js/qa_imagenes_preview.js (MEDIUM)
- qa_lista_agrupada.html (MEDIUM)
- sanity.js (MEDIUM)
- scripts/validate_engine_contracts.js (MEDIUM)
- server/services/pn-review-qa-cache.js (MEDIUM)

## Riesgos HIGH (muestra)

- generate_synthetic_exports.js:31 -> sust_hierarchie (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:39 -> gesa (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:56 -> dimensions_gesa (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:69 -> units (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:150 -> units (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:155 -> dimensions_gesa (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:209 -> exp_imagenes (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:211 -> sust_hierarchie (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:212 -> sust_superseded_list (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:213 -> sust_new_part_number (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:224 -> normalizado (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:232 -> pages (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:239 -> sust_new_part_number (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:254 -> sust_hierarchie (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:255 -> sust_new_part_number (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:261 -> exp_imagenes (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:275 -> normalizado (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:283 -> pages (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:313 -> sust_hierarchie (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:319 -> sust_hierarchie (backend/write/export/qa-state/synthetic area)

## Recomendaciones

- Mantener la regla adapter-first para toda nueva lectura en UI.
- Tratar como bloqueo de fase cualquier acceso HIGH fuera de categorias IGNORE.
- Anadir tests focalizados por zona antes de tocar escritura.
- No migrar exportadores reales ni endpoints de escritura hasta estabilizar lectura MEDIUM/HIGH.

## Propuesta de siguiente fase

1. Cerrar todos los HIGH en lectura y clasificacion QA antes de habilitar escritura compatible.
2. Reducir MEDIUM en preview/filtros para evitar divergencias de conteo por aliases legacy.
3. Cuando HIGH llegue a cero (salvo IGNORE), iniciar fase de escritura compatible en un endpoint acotado con tests de no regresion.
