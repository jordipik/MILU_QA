# MILU WordPress Export Summary

Generated at: 2026-05-03T12:50:10.505Z

## Totals
- Rows read: 67882
- Unique PN: 6113
- New exportable: 1020
- Superseded exportable: 657
- Pending review: 4016
- Discarded: 1445
- Duplicate PN keys: 5130
- Missing designation_final: 420
- Without valid image: 0
- Already in WordPress: 3894

## Reference Differences
- MILU_New not in synthetic: 0
- Synthetic new not in MILU_New: 1248
- MILU_Superseded not in synthetic: 2307
- Synthetic superseded not in MILU_Superseded: 0

## Recommendations
- Revisar primero los pendientes por conflictos de designation/weight para PN duplicado.
- Confirmar politica de imagen obligatoria antes de mover pendientes a importables.
- Para PN ya existentes en WordPress, decidir entre update_existing o keep_existing antes de exportar.
- Usar qa_revision_accion=eliminar para exclusiones definitivas y qa_revision_accion=revisar para circuito humano.
