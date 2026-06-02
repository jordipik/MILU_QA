# MILU V1 Master Pipeline

## Objetivo
Consolidar el pipeline oficial de MILU V1 segun codigo real actual (frontend, backend y scripts), separando rutas oficiales y legacy.

## Referencia principal
- Documento consolidado detallado: `MILU_V1_REBUILD_DOC_V2.md`

## Contrato de paridad Overlay vs Extraccion
- El overlay PDF es una capa de diagnostico y visualizacion para revision humana.
- `js/import-pdf.js` genera el artefacto oficial `book_preview_<MODEL>.json`.
- El apply oficial solo consume `book_preview_<MODEL>.json` mediante `POST /api/pdf-preview/apply-to-engine`.
- Por tanto, la fuente real de datos `_pdf` es `book_preview_<MODEL>.json`, no el overlay.
- Overlay y extraccion NO son el mismo calculo y deben repararse por separado cuando aparece una fusion de columnas.
- Si solo se corrige overlay, la UI puede verse bien pero el JSON seguira mal.
- Si solo se corrige extraccion, el JSON puede estar bien pero el overlay seguira confundiendo al usuario.
- Ambos calculos deben permanecer alineados con las mismas reglas de split:
   1. `POS + PN + DESIGNATION`
   2. `PN + DESIGNATION`
   3. `DESIGNATION` que empieza por `PN`
   4. `DESIGNATION` que empieza por `POS + PN`

## Pipeline oficial (runtime)
1. IMPORTAR PDF
   - UI principal: `recompute_simple.html` (`btnImportPdf`) y modal de `analista_02.html` (`recomputeCopyBookBtn`).
   - Endpoint oficial: `POST /api/pdf-preview/apply-to-engine`.
   - Artefacto oficial previo: `book_preview_<MODEL>.json` generado por `js/import-pdf.js`.
   - Scripts: `apply_book_preview_to_engine.py` (libro) o `apply_all_book_previews.py` (todos).
2. GESA SUST
   - UI principal: `recompute_simple.html` (`btnSust`).
   - Endpoints oficiales: `POST /api/recompute-simple/update-gesa` y `POST /api/recompute-simple/update-sust`.
   - Aplica enriquecimiento GESA y SUST sobre `engine_<MODEL>.json`.
3. ASSETS
   - UI principal: `recompute_simple.html` (`btnAssets`).
   - Endpoint oficial UI: `POST /api/recompute-simple/enrich-assets/start`.
   - Seguimiento/cancelacion: `GET /api/recompute-simple/enrich-assets/jobs/:jobId` y `POST /api/recompute-simple/enrich-assets/jobs/:jobId/cancel`.
   - Endpoint sincronico de compatibilidad: `POST /api/recompute-simple/enrich-assets`.
   - Ejecuta `scripts/enrich_rebuild_with_assets.js` en modo `engine` para actualizar:
     - `filename_foto`, `ruta_foto`, `esquemas`, `esquemas_circulos`, `esquemas_circulos_all`, `ruta_esquemas_pos`, `exp_imagenes`.
    - Modelo operativo DOC_V2 (OFFICIAL): pipeline de assets separado en dos fases.
       - FASE A - ESQUEMAS: calculo por BOM y bloque BOM continuo.
       - FASE B - CIRCULOS: derivacion de `esquemas_circulos*` y `ruta_esquemas_pos` desde `esquemas + POS`.
    - Regla de idempotencia (OFFICIAL):
       - Si archivo existe y JSON ya coincide, no hacer nada.
       - Distinguir siempre estado de archivo fisico vs estado de campos JSON.
    - Nombres oficiales de archivo:
       - esquema general: `BOOK-PAGE-XX.png` (ej: `12V4000M40A-0012-01.png`)
       - esquema_pos: `BOOK-PAGE-XX-POS.webp` (ej: `12V4000M40A-0012-01-80.webp`)
    - Script incremental recomendado para este modelo: `rebuild_assets_for_record.py` (OFFICIAL / ACTIVE).
    - Capacidades validadas en codigo real:
       - `esquemas` como fuente maestra y campos de circulos como derivados.
       - sincronizacion incremental JSON sin regeneracion innecesaria.
       - ASSETS consume resultados previos y no redefine la pertenencia de `esquemas`.
4. CALCULO FINAL
   - UI principal: `recompute_simple.html` (`btnFinal`) y modal de `analista_02.html` (`recomputeCalculateFinalBtn`).
   - Endpoint oficial: `POST /copy-pdf-to-final-all-books`.
   - Motor de reglas: `FINAL_FIELDS_V1_MAPPINGS_BACKEND` en `server.js`.
5. ERRORES
   - UI principal: `recompute_simple.html` (`btnErrors`) y modal de `analista_02.html` (`recomputeRunBtn`).
   - Endpoint oficial: `POST /recompute-qa-errors`.
   - Script Node: `recompute_engine_errors.js`.
6. ESTADOS
   - UI principal: `recompute_simple.html` (`btnStatuses`) y modal de `analista_02.html` (`recomputeRevisionStatusBtn`).
   - Endpoint recomendado: `POST /api/recompute-simple/update-states` (script `scripts/update_revision_states.js`).
   - Endpoint coexistente: `POST /recalculate-revision-status`.

Orden oficial de recompute (runtime):
1. IMPORTAR PDF
2. GESA / SUST
3. ASSETS
4. CALCULO FINAL
5. ERRORES
6. ESTADOS

Etapas posteriores al recompute:
- REVISION REMOTA Y APLICACION:
   - `GET/POST /qa_revision_sync.php` (persistencia en `qa_revision_server_data.json`).
   - `POST /apply-revision-to-engines`.
- EXPORT:
   - endpoint oficial: `POST /export/run-wordpress`.

## Pipeline oficial de rebuild (offline, separado del runtime)
Este pipeline trabaja sobre `data/02-engine_rebuild/engine_rebuild_<MODEL>.json` y no modifica `engine_<MODEL>.json`.

1. REBUILD BASE
   - Script: `scripts/rebuild_engine_from_book_preview.js`.
   - Salida: `data/02-engine_rebuild/engine_rebuild_<MODEL>.json`.
2. ENRICH GESA/SUST SOBRE REBUILD
   - Script: `scripts/enrich_rebuild_with_gesa_sust.js`.
3. ENRICH ASSETS VISUALES SOBRE REBUILD
   - Script: `scripts/enrich_rebuild_with_assets.js`.
   - Assets fuente: `fotos_articulos/`, `esquemas/`, `esquemas_pos_circulos/`.
   - Salidas:
     - `data/02-engine_rebuild/engine_rebuild_<MODEL>.json` enriquecido.
     - `data/02-engine_rebuild/assets_report_<MODEL>.json`.

Comandos oficiales de Fase Assets:
- rebuild:
   - `node scripts/enrich_rebuild_with_assets.js --mode rebuild --engine <MODEL> --dry-run`
   - `node scripts/enrich_rebuild_with_assets.js --mode rebuild --engine <MODEL> --write`
   - `node scripts/enrich_rebuild_with_assets.js --mode rebuild --all --dry-run`
   - `node scripts/enrich_rebuild_with_assets.js --mode rebuild --all --write`
- engine (runtime):
   - `node scripts/enrich_rebuild_with_assets.js --mode engine --engine <MODEL> --dry-run`
   - `node scripts/enrich_rebuild_with_assets.js --mode engine --engine <MODEL> --write`
   - `node scripts/enrich_rebuild_with_assets.js --mode engine --all --dry-run`
   - `node scripts/enrich_rebuild_with_assets.js --mode engine --all --write`

Comandos del orquestador incremental de assets (OFFICIAL / ACTIVE):
- registro:
   - `python rebuild_assets_for_record.py --engine 12V4000M40A --id 1100400 --write`
- libro:
   - `python rebuild_assets_for_record.py --engine 12V4000M40A --all-book --write`
- todos:
   - `python rebuild_assets_for_record.py --all --write`
- flags principales:
   - `--dry-run`
   - `--write`
   - `--force-regenerate`
   - `--only-sync-json`

## Validacion real end-to-end (OFFICIAL)
- Caso validado: `engine=12V4000M40A`, registro `RB-12V4000M40A-000245`.
- Resultado validado:
   - esquema localizado correctamente sin offset manual
   - POS `155` detectado correctamente
   - salida generada: `12V4000M40A-0045-01-155.webp`
   - persistencia JSON correcta en `engine_12V4000M40A.json`

Comandos de validacion:
- dry-run:
   - `python rebuild_assets_for_record.py --engine 12V4000M40A --id RB-12V4000M40A-000245 --dry-run`
- write:
   - `python rebuild_assets_for_record.py --engine 12V4000M40A --id RB-12V4000M40A-000245 --write`

Comportamiento esperado:
- si el asset existe y JSON coincide, no se regenera
- si el asset existe y JSON esta desincronizado, se repara JSON
- si POS no se detecta pero hay assets validos en JSON/disco, se reutilizan

Garantias de separacion:
- En `mode rebuild` no toca `engine_<MODEL>.json`.
- En `mode engine` toca solo `engine_<MODEL>.json` (raiz) y crea backup `engine_<MODEL>.json.bak.<timestamp>`.
- No ejecuta ni altera export WordPress (`POST /export/run-wordpress`).
- En `mode rebuild` escribe solo en `data/02-engine_rebuild/` y genera backup en modo `--write`.

## Endpoints oficiales vs legacy relevantes
- Oficiales actuales:
  - `POST /api/pdf-preview/apply-to-engine`
   - `POST /api/recompute-simple/update-gesa`
   - `POST /api/recompute-simple/update-sust`
   - `POST /api/recompute-simple/enrich-assets/start`
   - `GET /api/recompute-simple/enrich-assets/jobs/:jobId`
   - `POST /api/recompute-simple/enrich-assets/jobs/:jobId/cancel`
   - `POST /api/recompute-simple/enrich-assets` (compatibilidad sincronica)
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

Nota documental: `/copy-pdf-to-pdf-all-books` y `/recompute-pdf-auto` no deben presentarse como flujo oficial de PDF.

## Artefactos de datos
- Entrada PDF intermedia oficial: `data/01-engine_preview/book_preview_<MODEL>.json`.
- Persistencia runtime: `engine_*.json`.
- Persistencia de revision remota: `qa_revision_server_data.json`.

## Casos de reparacion PDF documentados
- `12V4000M53`, pagina `803`: fusion `PN + DESIGNATION`.
- `12V4000M53`, pagina `669`: fusion `POS + PN + DESIGNATION`.

Puntos de implementacion:
- overlay / visor PDF:
   - `js/pdf-viewer.js:4166`
   - `js/pdf-viewer.js:4668`
- extraccion / `book_preview`:
   - `js/import-pdf.js:302`
   - `js/import-pdf.js:343`
- flujo analista:
   - `js/analista-02.js:634`
   - `js/analista-02.js:696`

Ejemplo validado en pagina `669`:
- `7250 -> X59450700011 -> BRACKET WIRING HARNESS`
- `8400 -> X59650700018 -> RETAINER F. WIRING HARNESS`
- `8570 -> X54750700009 -> CABLE CLAMP`
- `8800 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9350 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9450 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9660 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9700 -> X59450700011 -> BRACKET WIRING HARNESS`

Validacion registrada:
- ya no quedan filas de ese patron con `pos_pdf` vacio
- `unresolvedCount = 0`
- overlay body pasa de `381` a `397` rectangulos en pagina `669`

## Notas operativas
- MILU runtime usa archivos JSON en disco, no BD relacional.
- El proceso offline oficial para consistencia global de los 9 engines sigue siendo `depuracion_json.py`.
- En diagnostico de persistencia: validar `GET /health` y endpoints HTTP antes de asumir fallo de UI.

## Regla oficial de esquemas y circulos
```text
PDF
 └─ BOM
   └─ bloque BOM continuo
      └─ esquemas
         └─ POS
            └─ esquemas_circulos
```

- prioridad BOM por fila: `bom_final`, `BOM-No.`, `bom_pdf`.
- si BOM esta vacio o no existe en mapa PDF: `esquemas = ""`.
- si un BOM aparece en paginas consecutivas, se mantiene en un unico bloque continuo.
- `esquemas_circulos`, `esquemas_circulos_all`, `ruta_esquemas_pos` se derivan de `esquemas + POS`.

## Riesgos historicos (legacy assets)
- Mezcla de deteccion de esquemas base, POS y sincronizacion JSON en un mismo flujo.
- Regeneracion innecesaria sin comprobar reutilizacion de archivos existentes.
- Casos de imagen correcta con JSON vacio/desincronizado.
- Mezcla conceptual entre `esquemas` (base) y campos derivados de circulos.

## Vision objetivo
Sistema incremental, reparable y desacoplado de logica legacy, preparado para recompute parcial, QA visual, rebuild, sincronizacion incremental y export WordPress.

