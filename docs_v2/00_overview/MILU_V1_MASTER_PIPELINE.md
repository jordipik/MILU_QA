# MILU V1 Master Pipeline

## Objetivo
Consolidar el pipeline oficial de MILU V1 segun codigo real actual (frontend, backend y scripts), separando rutas oficiales y legacy.

## Referencia principal
- Documento consolidado detallado: `MILU_V1_REBUILD_DOC_V2.md`

## Pipeline oficial (runtime)
1. IMPORTAR PDF
   - UI principal: `recompute_simple.html` (`btnImportPdf`) y modal de `analista_02.html` (`recomputeCopyBookBtn`).
   - Endpoint oficial: `POST /api/pdf-preview/apply-to-engine`.
   - Scripts: `apply_book_preview_to_engine.py` (libro) o `apply_all_book_previews.py` (todos).
2. CALCULO FINAL
   - UI principal: `recompute_simple.html` (`btnFinal`) y modal de `analista_02.html` (`recomputeCalculateFinalBtn`).
   - Endpoint oficial: `POST /copy-pdf-to-final-all-books`.
   - Motor de reglas: `FINAL_FIELDS_V1_MAPPINGS_BACKEND` en `server.js`.
3. ERRORES
   - UI principal: `recompute_simple.html` (`btnErrors`) y modal de `analista_02.html` (`recomputeRunBtn`).
   - Endpoint oficial: `POST /recompute-qa-errors`.
   - Script Node: `recompute_engine_errors.js`.
4. ESTADOS
   - UI principal: `recompute_simple.html` (`btnStatuses`) y modal de `analista_02.html` (`recomputeRevisionStatusBtn`).
   - Endpoint recomendado: `POST /api/recompute-simple/update-states` (script `scripts/update_revision_states.js`).
   - Endpoint coexistente: `POST /recalculate-revision-status`.
5. REVISION REMOTA Y APLICACION
   - `GET/POST /qa_revision_sync.php` (persistencia en `qa_revision_server_data.json`).
   - `POST /apply-revision-to-engines`.
6. EXPORT
   - Endpoint oficial: `POST /export/run-wordpress`.

## Pipeline oficial de rebuild (offline, separado del runtime)
Este pipeline trabaja sobre `data/output/rebuild/engine_rebuild_<MODEL>.json` y no modifica `engine_<MODEL>.json`.

1. REBUILD BASE
   - Script: `scripts/rebuild_engine_from_book_preview.js`.
   - Salida: `data/output/rebuild/engine_rebuild_<MODEL>.json`.
2. ENRICH GESA/SUST SOBRE REBUILD
   - Script: `scripts/enrich_rebuild_with_gesa_sust.js`.
3. ENRICH ASSETS VISUALES SOBRE REBUILD
   - Script: `scripts/enrich_rebuild_with_assets.js`.
   - Assets fuente: `fotos_articulos/`, `esquemas/`, `esquemas_pos_circulos/`.
   - Salidas:
     - `data/output/rebuild/engine_rebuild_<MODEL>.json` enriquecido.
     - `data/output/rebuild/assets_report_<MODEL>.json`.

Comandos oficiales de Fase Assets:
- `node scripts/enrich_rebuild_with_assets.js --engine <MODEL> --dry-run`
- `node scripts/enrich_rebuild_with_assets.js --engine <MODEL> --write`
- `node scripts/enrich_rebuild_with_assets.js --all --dry-run`
- `node scripts/enrich_rebuild_with_assets.js --all --write`

Garantias de separacion:
- No toca `engine_<MODEL>.json`.
- No ejecuta ni altera export WordPress (`POST /export/run-wordpress`).
- Escribe solo en `data/output/rebuild/` y genera backup en modo `--write`.

## Endpoints oficiales vs legacy relevantes
- Oficiales actuales:
  - `POST /api/pdf-preview/apply-to-engine`
  - `POST /copy-pdf-to-final-all-books`
  - `POST /recompute-qa-errors`
  - `POST /api/recompute-simple/update-states`
  - `GET/POST /qa_revision_sync.php`
  - `POST /apply-revision-to-engines`
- Legacy o alternativos:
  - `POST /calculate-final-fields` (legacy, sigue activo)
  - `POST /recompute-pdf-auto` (legacy desactivado, HTTP 410)
  - `POST /copy-pdf-to-pdf-all-books` (alternativo legacy para copia `_pdf`)
  - `POST /recompute-pdf-auto-visual` (alternativo visual)

## Artefactos de datos
- Entrada PDF intermedia oficial: `json_originales/book_preview_<MODEL>.json`.
- Persistencia runtime: `engine_*.json`.
- Persistencia de revision remota: `qa_revision_server_data.json`.

## Notas operativas
- MILU runtime usa archivos JSON en disco, no BD relacional.
- El proceso offline oficial para consistencia global de los 9 engines sigue siendo `depuracion_json.py`.
- En diagnostico de persistencia: validar `GET /health` y endpoints HTTP antes de asumir fallo de UI.
