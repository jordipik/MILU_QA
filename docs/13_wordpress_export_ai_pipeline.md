# MILU WordPress Export + AI Conflict Pipeline

## Objetivo
Generar salidas listas para importacion en WordPress/WooCommerce y un paquete de apoyo IA para priorizar revision humana.

## Scripts
- `npm run export:wordpress`
- `npm run ai:conflicts`

## Entradas
- 9 archivos `engine_*.json` (fuente de verdad runtime)
- `MILU_New_v506.json`
- `MILU_Superseded_v506.json`
- `qa_synthetic_new.json`
- `qa_synthetic_superseded.json`
- `product-export-*.json` (se usa el mas reciente por fecha de modificacion)

## Salidas
### Export WordPress
Carpeta: `data/output/wordpress/`

- `milu_wp_new_import.csv`
- `milu_wp_superseded_import.csv`
- `milu_wp_pending_review.csv`
- `milu_wp_discarded.csv`
- `milu_wp_new_import.json`
- `milu_wp_superseded_import.json`
- `milu_wp_export_report.json`
- `milu_wp_export_summary.md`

### Revision IA
Carpeta: `data/output/ai_review/`

- `ai_conflicts_full.json`
- `ai_conflicts_summary.csv`
- `ai_pending_human_review.csv`
- `ai_decision_report.md`

## Reglas generales aplicadas
1. Nunca se modifican `engine_*.json`.
2. Si falta PN o `designation_final`, el articulo se descarta.
3. Si hay conflicto relevante o contradiccion de fuentes, pasa a `pending_review`.
4. Si el SKU ya existe en `product-export`, no se importa automaticamente.
5. Si hay relacion superseded clara (old->new), se clasifica para export superseded.
6. Si hay ambiguedad en sustitucion, se marca pendiente.

## Modelo canonico de salida (campos principales)
- `sku`
- `post_title`
- `post_name`
- `post_status`
- `post_content`
- `post_excerpt`
- `regular_price`
- `categories`
- `tags`
- `product_type`
- `images`
- `meta:engine_model`
- `meta:source_page`
- `meta:pos`
- `meta:bom`
- `meta:designation_final`
- `meta:measure_final`
- `meta:weight_final`
- `meta:sust_status`
- `meta:sust_new_part_number`
- `meta:sust_superseded_list`
- `meta:qa_revision_estado`
- `meta:qa_revision_accion`
- `meta:import_decision`
- `meta:import_reason`

## Validaciones incorporadas
- CSV con BOM UTF-8 y delimitador `;`.
- Motivo obligatorio para `pending_review` y `discarded`.
- SKU y slug unicos para filas importables.
- Reglas trazables en reportes JSON/Markdown.

## Integracion recomendada con QA UI
No persistir por defecto campos IA en `engine_*.json`.
Usar `ai_conflicts_full.json` como capa de recomendacion y aplicar cambios en UI solo via `/save-json` con confirmacion humana.

## Export Review Global (UI + API)
Objetivo: exponer en la pestana Exportacion una vista auditable global por PN/SKU, independiente del estado de carga de la tabla UI.

### Script
- `npm run export:review`

Genera en `data/output/export_review/`:
- `synthetic_new_compacted.json`
- `synthetic_superseded_compacted.json`
- `wordpress_export_preview.json`
- `wordpress_export_trace.json`
- `wordpress_export_preview.csv`
- `wordpress_export_conflicts.csv`
- `wordpress_export_summary.md`

### Endpoints backend
- `POST /export/run-synthetic`: ejecuta compactacion global synthetic.
- `POST /export/run-wordpress`: ejecuta export WordPress.
- `POST /export/run-ai-conflicts`: ejecuta analisis IA de conflictos.
- `GET /export/preview`: devuelve preview resumido para la tabla de Exportacion.
- `GET /export/trace/:sku`: devuelve traza completa auditable para un SKU.

### Regla de conflictos (export_review)
`wordpress_export_conflicts.csv` solo incluye filas con:
- `import_decision = pending_review`
- `import_decision = discard`

No se incluyen filas solo por coincidencias de texto en `import_reason`.
