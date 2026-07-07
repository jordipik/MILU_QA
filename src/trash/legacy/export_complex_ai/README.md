# Legacy Export Complex AI

Esta carpeta archiva la logica antigua de exportacion compleja (scoring, IA de conflictos, pipeline de synthetic/export review).

## Por que se archiva
- El flujo oficial MILU ya no decide exportacion por IA ni score.
- La decision final depende solo de QA humana (`qa_revision_estado` + `qa_revision_accion`) agrupada globalmente por PN.

## Que hacia esta logica
- Compactacion synthetic avanzada con reglas jerarquicas.
- Calculo de consistencia, conflictos y severidad.
- Recomendaciones de IA (`update_existing`, `keep_existing`, etc.).
- Dashboards de preview/trace para pipeline complejo.

## Por que no se usa ahora
- Introducia complejidad y conceptos no oficiales para la operativa actual.
- Podia confundir la decision final, que ahora es estrictamente QA-first.

## Como recuperarlo en el futuro
1. Ejecutar scripts legacy via npm prefijados con `legacy:`.
2. Revisar y adaptar dependencias con outputs actuales.
3. Rehabilitar endpoints solo si existe una decision explicita de volver al modelo complejo.

## Scripts archivados
- `legacy/export_complex_ai/scripts/ai_conflict_rules.js`
- `legacy/export_complex_ai/scripts/export_review_pipeline.js`
- `legacy/export_complex_ai/scripts/synthetic_merge_rules.js`
- `legacy/export_complex_ai/scripts/report_merge_quality.js`
- `legacy/export_complex_ai/scripts/analyze_synthetic_quality.js`
