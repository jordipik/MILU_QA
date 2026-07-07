# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Field Adapter Usage Audit

Fecha: 2026-05-16

## Resumen global

- Archivos escaneados: 125
- Archivos con accesos legacy directos: 56
- Total de accesos legacy detectados: 491
- LOW: 170
- MEDIUM: 91
- HIGH: 104
- IGNORE: 126

## Archivos con mas accesos legacy

- server.js: 84
- js/analista-02.js: 37
- js/qa-milu.js: 25
- server/services/pn-review-qa-cache.js: 20
- scripts/db/import_engines_to_sqlite.js: 15
- generate_synthetic_exports.js: 14
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

- status: 112
- sust_hierarchie: 47
- exp_imagenes: 38
- gesa: 34
- sust_new_part_number: 28
- PART NO.: 18
- sust_superseded_list: 18
- sust_status: 18
- normalizado: 15
- dimensions_gesa: 14
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

- generate_synthetic_exports.js:31 -> gesa (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:48 -> dimensions_gesa (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:61 -> units (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:142 -> units (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:147 -> dimensions_gesa (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:204 -> sust_superseded_list (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:205 -> sust_new_part_number (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:216 -> normalizado (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:224 -> pages (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:231 -> sust_new_part_number (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:247 -> sust_new_part_number (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:267 -> normalizado (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:275 -> pages (backend/write/export/qa-state/synthetic area)
- generate_synthetic_exports.js:312 -> sust_new_part_number (backend/write/export/qa-state/synthetic area)
- server.js:181 -> dimensions_gesa (backend/write/export/qa-state/synthetic area)
- server.js:212 -> sust_status (backend/write/export/qa-state/synthetic area)
- server.js:213 -> sust_hierarchie (backend/write/export/qa-state/synthetic area)
- server.js:214 -> sust_new_part_number (backend/write/export/qa-state/synthetic area)
- server.js:215 -> sust_superseded_list (backend/write/export/qa-state/synthetic area)
- server.js:248 -> sust_new_part_number (backend/write/export/qa-state/synthetic area)

## Recomendaciones

- Mantener la regla adapter-first para toda nueva lectura en UI.
- Tratar como bloqueo de fase cualquier acceso HIGH fuera de categorias IGNORE.
- Anadir tests focalizados por zona antes de tocar escritura.
- No migrar exportadores reales ni endpoints de escritura hasta estabilizar lectura MEDIUM/HIGH.

## Propuesta de siguiente fase

1. Cerrar todos los HIGH en lectura y clasificacion QA antes de habilitar escritura compatible.
2. Reducir MEDIUM en preview/filtros para evitar divergencias de conteo por aliases legacy.
3. Cuando HIGH llegue a cero (salvo IGNORE), iniciar fase de escritura compatible en un endpoint acotado con tests de no regresion.

