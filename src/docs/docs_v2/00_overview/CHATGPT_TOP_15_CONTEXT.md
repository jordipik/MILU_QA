# ChatGPT Top 15 Context (MILU V1)

Objetivo: paquete minimo y suficiente para dar a ChatGPT una vision total y actual del proyecto MILU V1.

## Orden recomendado de lectura
1. [README.md](../../README.md)
   - Vista general del repo y entrada rapida.

2. [.github/copilot-instructions.md](../../.github/copilot-instructions.md)
   - Reglas operativas oficiales del proyecto (runtime, endpoints, persistencia).

3. [PROCESO_IMPORT_PDF_Y_APLICACION.txt](../../PROCESO_IMPORT_PDF_Y_APLICACION.txt)
   - Contexto historico-operativo del flujo PDF/aplicacion.

4. [docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md](../00_overview/MILU_V1_MASTER_PIPELINE.md)
   - Pipeline maestro oficial actualizado.

5. [docs_v2/00_overview/SCRIPT_MAP.md](../00_overview/SCRIPT_MAP.md)
   - Mapa de scripts/endpoints oficial vs legacy.

6. [docs_v2/01_pipeline/pipeline_global.md](../01_pipeline/pipeline_global.md)
   - Secuencia global de etapas runtime.

7. [docs_v2/01_pipeline/recompute_simple_flow.md](../01_pipeline/recompute_simple_flow.md)
   - Flujo real de la UI de recompute por pasos.

8. [docs_v2/02_pdf_import/import_pdf_flow.md](../02_pdf_import/import_pdf_flow.md)
   - Flujo oficial de IMPORTAR PDF y exclusiones legacy.

9. [docs_v2/02_pdf_import/apply_book_preview_to_engine.md](../02_pdf_import/apply_book_preview_to_engine.md)
   - Matching real, ambiguous/not_found, overwrite y backups.

10. [docs_v2/02_pdf_import/book_preview_structure.md](../02_pdf_import/book_preview_structure.md)
    - Estructura real de book_preview_<MODEL>.json.

11. [docs_v2/04_final_calculation/final_fields_v1.md](../04_final_calculation/final_fields_v1.md)
    - Reglas oficiales actuales de campos finales.

12. [docs_v2/06_error_system/recompute_errors.md](../06_error_system/recompute_errors.md)
    - Contrato de recálculo de errores y alcance.

13. [docs_v2/07_revision_system/qa_revision_flow.md](../07_revision_system/qa_revision_flow.md)
    - Flujo de estados/acciones QA y persistencia de revisión.

14. [docs_v2/08_export/wordpress_export.md](../08_export/wordpress_export.md)
    - Salida final y reglas del export WordPress.

15. [docs_v2/13_legacy/official_vs_legacy.md](../13_legacy/official_vs_legacy.md)
    - Matriz final de oficial vs legacy para evitar confusión.

## Nota
Si solo puedes pasar 8 documentos, usa del 4 al 11.
