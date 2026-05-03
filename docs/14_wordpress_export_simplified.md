# WordPress Export Simplified (QA-only)

## Objetivo
Definir el flujo oficial de exportacion WordPress en MILU, sin scoring ni decision automatica por IA.

## Regla fundamental
La decision final de exportacion depende solo de QA humana.

- IA/reglas auxiliares pueden ayudar a explicar pendientes.
- IA no decide automaticamente import/discard.

## Entradas
- 9 archivos `engine_*.json` del repo.

## Agrupacion oficial
- Global por PN (SKU) en todos los motores/libros.
- Una fila exportable por PN.

## Reglas de decision oficiales
1. Si un PN tiene al menos una fila con:
   - `qa_revision_estado = ok`
   - `qa_revision_accion = importar`
   entonces `decision = import`.
2. Si todas las filas del PN tienen:
   - `qa_revision_estado = ok`
   - `qa_revision_accion = eliminar`
   entonces `decision = discard`.
3. Cualquier otro caso:
   - `decision = pending_review`.

## Script oficial
- `npm run export:wordpress`

## Endpoints operativos
- `GET /export/files`
- `GET /export/file`
- `GET /export/download`
- `GET /export/status`
- `POST /export/run-wordpress`

## Endpoints legacy (desactivados)
- `POST /export/run-synthetic`
- `POST /export/run-ai-conflicts`
- `POST /export/run-all`
- `GET /pn/list`
- `GET /pn/:sku`
- `GET /pn/:sku/sources`

## Outputs oficiales
Carpeta: `data/output/wordpress/`

- `milu_wp_import.csv`
- `milu_wp_discarded.csv`
- `milu_wp_pending_review.csv`
- `milu_wp_import.json`
- `milu_wp_export_summary.md`

Opcional:
- `milu_wp_trace.json`

## Legacy archivado
La logica compleja anterior se mantiene solo como referencia en:
- `legacy/export_complex_ai/`

Comandos legacy:
- `npm run legacy:ai:conflicts`
- `npm run legacy:export:review`
- `npm run legacy:generate:synthetic`
