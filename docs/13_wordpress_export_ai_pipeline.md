# MILU WordPress Export (Estado actual)

Este documento queda como referencia de transicion.

## Flujo oficial vigente
Ver `docs/14_wordpress_export_simplified.md`.

## Cambios relevantes
- `npm run export:wordpress` es el unico comando oficial para exportacion WordPress.
- La decision final depende solo de QA humana (`qa_revision_estado` + `qa_revision_accion`) agrupada por PN global en los 9 motores.
- Endpoints `run-synthetic`, `run-ai-conflicts`, `run-all` y rutas `/pn/*` quedan en estado legacy (desactivadas para operacion principal).

## Legacy archivado
La logica compleja anterior (IA/scoring/export review avanzado) se movio a:
- `legacy/export_complex_ai/`

Scripts legacy ejecutables:
- `npm run legacy:ai:conflicts`
- `npm run legacy:export:review`
- `npm run legacy:generate:synthetic`
