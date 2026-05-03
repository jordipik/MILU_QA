# AI Decision Report

Generated at: 2026-05-03T12:50:14.855Z
Source rows: 67882
Unique records analyzed: 7138
Product export baseline: product-export-2026-03-29-11-07.json

## Decisions
- update_existing: 3723
- discard: 1445
- pending_review: 1007
- import_superseded: 628
- keep_existing: 170
- import_new: 165

## Top Conflicts
- pn_duplicate: 5130
- weight_conflict: 4208
- measure_missing_or_weak: 4027
- already_exists_web: 3894
- designation_mismatch_sources: 2024
- sust_status_ambiguous: 1993
- manual_review_marked: 1824
- pn_in_pdf_not_gesa: 1804
- diff_milu_new_vs_synthetic: 1111
- pn_missing: 1025
- diff_milu_superseded_vs_synthetic: 3

## Low Confidence Items
- Total low confidence: 5586

## Automatically Importable
- import_new: 165
- import_superseded: 628

## Requires Human Review
- pending human review: 6048

## Decision Matrix
| decision | conditions | required_fields | risks | example |
|---|---|---|---|---|
| import_new | PN valido, designation_final presente, sin conflicto critico y sin señal superseded dominante. | PART NO., designation_final | datos secundarios incompletos (medida/peso) pueden requerir mejora posterior. | 5240982037 |
| import_superseded | sust_status/sust_hierarchie activo y relacion old->new clara. | PART NO., sust_new_part_number o sust_superseded_list | relaciones incorrectas pueden crear enlaces erróneos en la web. | 000125010524 |
| keep_existing | SKU ya presente en WordPress y sin conflicto severo. | sku | pueden quedar datos desactualizados. | 700383018008 |
| update_existing | SKU ya presente en WordPress pero con conflictos menores. | sku y campos a corregir | actualizacion parcial puede romper consistencia entre fuentes. | 0049976736 |
| discard | falta de PN/designation o accion QA de eliminar. | motivo trazable | descartar de más sin validación humana previa. | SIN_PN |
| pending_review | conflictos criticos o contradicciones entre fuentes. | lista de conflictos y campos implicados | cuello de botella de revisión manual. | 000912018008 |

## UI Integration Proposal (qa_milu.html)
- Añadir filtro "IA decision" (todos + 6 decisiones).
- Añadir filtro "IA confidence" (high/medium/low).
- Añadir columna compacta IA: decision + confidence + conflicto principal.
- En panel lateral, mostrar razon completa, codigos de conflicto y accion sugerida.
- Incluir boton "Aplicar sugerencia IA" que solo rellena qa_revision_accion y persiste via /save-json tras confirmacion.
- No persistir campos IA en engine_*.json por defecto; usar exportes en data/output/ai_review como capa de trazabilidad.
