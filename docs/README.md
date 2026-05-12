# MILU — Documentación

Índice de la carpeta `docs/`. Para entrada rápida al proyecto ver el [README.md raíz](../README.md).

## Documentos canónicos (consolidados)

Fuente única de verdad por tema:

- [ARQUITECTURA_MILU.md](ARQUITECTURA_MILU.md) — arquitectura del sistema.
- [FLUJO_DATOS_MILU.md](FLUJO_DATOS_MILU.md) — flujos de datos runtime.
- [QA_MILU.md](QA_MILU.md) — reglas QA, estados y comprobaciones.
- [WORDPRESS_EXPORT_MILU.md](WORDPRESS_EXPORT_MILU.md) — exportación WordPress QA-only.
- [IMAGENES_ESQUEMAS_MILU.md](IMAGENES_ESQUEMAS_MILU.md) — imágenes y esquemas POS.
- [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md) — plan de remediación.

## Subcarpetas

- `contracts/` — **contratos técnicos v1** (modelo JSON, revisión QA, export, imágenes, endpoints) + informe de validación contra código. Ver [contracts/README.md](contracts/README.md).
- `database/` — **base de datos espejo SQLite** (Fase E). Diseño, importador, validador, queries. Ver [database/README.md](database/README.md).
- `archived/` — documentos superseded o duplicados, conservados por trazabilidad.
- `auditoria/` — auditorías históricas, matrices, snapshots.
- `proposals/` — propuestas no implementadas («PENDIENTE DE VALIDAR»).
- `images/` — documentación detallada de multimedia.
- `modules/` — referencia módulo a módulo del código.
- `legacy/` — reservada para documentación de código legacy.
- `canonical/` — reservada para futuras agrupaciones canónicas.

## Documentos técnicos de referencia

- Project overview: [00_overview.md](00_overview.md)
- Folder/file map: [01_structure.md](01_structure.md)
- Data flow: [02_data_flow.md](02_data_flow.md)
- Data models: [03_data_models.md](03_data_models.md)
- AI critical context: [04_ai_context.md](04_ai_context.md)
- QA errors checks: [05_qa_errors_checks.md](05_qa_errors_checks.md)
- Analista 02 column mapping: [07_analista_02_column_mapping.md](07_analista_02_column_mapping.md)
- Auditoría 2026: [09_auditoria_2026.md](09_auditoria_2026.md)
- Plan de remediación: [10_plan_remediacion.md](10_plan_remediacion.md)
- Progreso de remediación: [11_progreso_remediacion.md](11_progreso_remediacion.md)
- AR-1 carga incremental: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md)
- WordPress export (oficial): [14_wordpress_export_simplified.md](14_wordpress_export_simplified.md)
- QA Imágenes: [15_qa_imagenes.md](15_qa_imagenes.md)
- Auditoría imágenes/esquemas: [AUDITORIA_IMAGENES_ESQUEMAS_MILU.md](AUDITORIA_IMAGENES_ESQUEMAS_MILU.md)
- Backend: [BACKEND.md](BACKEND.md) · Frontend: [FRONTEND.md](FRONTEND.md) · Resumen: [MILU_FRONTEND_BACKEND.md](MILU_FRONTEND_BACKEND.md)
- Lógica estados/acciones: [MILU_LOGICA_ESTADOS_ACCIONES.md](MILU_LOGICA_ESTADOS_ACCIONES.md)
- Lógica Part Numbers: [MILU_LOGICA_PART_NUMBERS.md](MILU_LOGICA_PART_NUMBERS.md)
- Inventario de scripts: [MILU_INVENTARIO_SCRIPTS.md](MILU_INVENTARIO_SCRIPTS.md)
- Plan acción (quick start / detalle): [PLAN_ACCION_QUICK_START.md](PLAN_ACCION_QUICK_START.md) · [PLAN_ACCION_EJECUCION_DETALLADA.md](PLAN_ACCION_EJECUCION_DETALLADA.md)

## Contexto IA

- Compacto (primer prompt): [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md)
- Detallado: [AI_QUICK_CONTEXT.md](AI_QUICK_CONTEXT.md)
- Plantilla de prompt: [AI_PROMPT_BASE.md](AI_PROMPT_BASE.md)
- Playbooks por escenario: [04_ai_context.md](04_ai_context.md)

## Limpieza documental

- Auditoría y propuesta de limpieza: [MILU_LIMPIEZA_DOCUMENTACION.md](MILU_LIMPIEZA_DOCUMENTACION.md)
- Estado final tras consolidación: [ESTADO_FINAL_DOCUMENTACION.md](ESTADO_FINAL_DOCUMENTACION.md)

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

### C) PDF o issue de esquemas
1. [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md)
2. [modules/js_pdf_viewer.md](modules/js_pdf_viewer.md)
3. [modules/js_schemas.md](modules/js_schemas.md)
4. [modules/js_pos_preload.md](modules/js_pos_preload.md)

### D) Flujo de normalización/export
1. [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md)
2. [modules/depuracion_json_py.md](modules/depuracion_json_py.md)
3. [14_wordpress_export_simplified.md](14_wordpress_export_simplified.md)
4. [modules/marcar_articulos_en_web_py.md](modules/marcar_articulos_en_web_py.md)
5. [03_data_models.md](03_data_models.md)

### E) Revisión global por PN (QA-only)
1. [14_wordpress_export_simplified.md](14_wordpress_export_simplified.md)
2. [11_progreso_remediacion.md](11_progreso_remediacion.md)
3. [modules/server.md](modules/server.md)

## Module Catalog

### Backend and Node
- [modules/server.md](modules/server.md)

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

### C) PDF o issue de esquemas
1. [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md)
2. [modules/js_pdf_viewer.md](modules/js_pdf_viewer.md)
3. [modules/js_schemas.md](modules/js_schemas.md)
4. [modules/js_pos_preload.md](modules/js_pos_preload.md)

### D) Flujo de normalización/export
1. [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md)
2. [modules/depuracion_json_py.md](modules/depuracion_json_py.md)
3. [14_wordpress_export_simplified.md](14_wordpress_export_simplified.md)
4. [modules/marcar_articulos_en_web_py.md](modules/marcar_articulos_en_web_py.md)
5. [03_data_models.md](03_data_models.md)

### E) Revisión global por PN (QA-only)
1. [14_wordpress_export_simplified.md](14_wordpress_export_simplified.md)
2. [11_progreso_remediacion.md](11_progreso_remediacion.md)
3. [modules/server.md](modules/server.md)

## Module Catalog

### Backend and Node
- [modules/server.md](modules/server.md)

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
