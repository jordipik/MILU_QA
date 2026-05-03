# MILU Docs Index

## Start Here
- Project overview: [00_overview.md](00_overview.md)
- Folder/file map: [01_structure.md](01_structure.md)
- Data flow: [02_data_flow.md](02_data_flow.md)
- Data models: [03_data_models.md](03_data_models.md)
- AI critical context: [04_ai_context.md](04_ai_context.md)
- QA errors checks and stats: [05_qa_errors_checks.md](05_qa_errors_checks.md)
- Analista 02 column mapping: [07_analista_02_column_mapping.md](07_analista_02_column_mapping.md)
- Auditoría 2026: [09_auditoria_2026.md](09_auditoria_2026.md)
- Plan de remediación: [10_plan_remediacion.md](10_plan_remediacion.md)
- Progreso de remediación: [11_progreso_remediacion.md](11_progreso_remediacion.md)
- AR-1 carga incremental: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md)
- Pipeline WordPress + IA: [13_wordpress_export_ai_pipeline.md](13_wordpress_export_ai_pipeline.md)
- Quick AI context: [AI_QUICK_CONTEXT.md](AI_QUICK_CONTEXT.md)
- Ultra-compact AI context: [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md)

## Suggested Reading Paths

### A) Backend persistence bug
1. [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md)
2. [04_ai_context.md](04_ai_context.md)
3. [modules/server.md](modules/server.md)
4. [02_data_flow.md](02_data_flow.md)

### B) Frontend table/filter/revision bug
1. [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md)
2. [04_ai_context.md](04_ai_context.md)
3. [modules/js_state.md](modules/js_state.md)
4. [modules/js_data_loader.md](modules/js_data_loader.md)
5. [modules/js_revision.md](modules/js_revision.md)
6. [modules/js_qa_table.md](modules/js_qa_table.md)
7. [modules/js_qa_milu.md](modules/js_qa_milu.md)

### C) PDF or schema image issue
1. [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md)
2. [modules/js_pdf_viewer.md](modules/js_pdf_viewer.md)
3. [modules/js_schemas.md](modules/js_schemas.md)
4. [modules/js_pos_preload.md](modules/js_pos_preload.md)

### D) Data normalization/export flow
1. [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md)
2. [modules/depuracion_json_py.md](modules/depuracion_json_py.md)
3. [modules/generate_synthetic_exports.md](modules/generate_synthetic_exports.md)
4. [modules/marcar_articulos_en_web_py.md](modules/marcar_articulos_en_web_py.md)
5. [03_data_models.md](03_data_models.md)

## Module Catalog

### Backend and Node
- [modules/server.md](modules/server.md)
- [modules/generate_synthetic_exports.md](modules/generate_synthetic_exports.md)

### Frontend Core
- [modules/js_state.md](modules/js_state.md)
- [modules/js_data_loader.md](modules/js_data_loader.md)
- [modules/js_helpers.md](modules/js_helpers.md)
- [modules/js_revision.md](modules/js_revision.md)
- [modules/js_qa_table.md](modules/js_qa_table.md)
- [modules/js_qa_milu.md](modules/js_qa_milu.md)

### Frontend UI Extensions
- [modules/js_cell_editor.md](modules/js_cell_editor.md)
- [modules/js_column_view.md](modules/js_column_view.md)
- [modules/js_pdf_viewer.md](modules/js_pdf_viewer.md)
- [modules/js_schemas.md](modules/js_schemas.md)
- [modules/js_pos_preload.md](modules/js_pos_preload.md)

### Offline Python Utilities
- [modules/depuracion_json_py.md](modules/depuracion_json_py.md)
- [modules/convert_excel_to_json_py.md](modules/convert_excel_to_json_py.md)
- [modules/estadisticas_articulos_py.md](modules/estadisticas_articulos_py.md)
- [modules/informe_estadisticas_py.md](modules/informe_estadisticas_py.md)
- [modules/marcar_articulos_en_web_py.md](modules/marcar_articulos_en_web_py.md)
- [modules/pretty_print_all_json_py.md](modules/pretty_print_all_json_py.md)

### Legacy
- [modules/app_js.md](modules/app_js.md)

## Which AI Context File To Use
- Use [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md) for first-pass prompts and low-token contexts.
- Use [AI_QUICK_CONTEXT.md](AI_QUICK_CONTEXT.md) when you need more operational detail.
- Use [04_ai_context.md](04_ai_context.md) for troubleshooting playbooks and read-order guidance.
