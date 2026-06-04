# MILU_PDF_FUNCTIONAL_AUDIT

FASE 4.8 — Auditoria funcional real de endpoints PDF oficiales V1.03.

Fecha: 2026-06-04
Modo: sin cambios de codigo, con pruebas HTTP reales sobre localhost.

## Metodologia

1. Lectura de implementacion en server.js y scripts invocados.
2. Ejecucion controlada por endpoint sobre muestra real (`engine_12V4000M53.json`, `id=RB-12V4000M53-000732`).
3. Preferencia por `dryRun=true` cuando existe.
4. Cuando no existe `dryRun`, ejecucion acotada a un engine para verificar comportamiento real.

## Endpoint A — POST /api/recompute-simple/rebuild-json

Estado: OFFICIAL_V103
Runner: `scripts/rebuild_engine_from_book_preview.js`

### Inputs

- `engine`: modelo o `ALL`.
- `dryRun`: bool (default false).
- `backup`: bool (aceptado pero ignorado por diseno de endpoint).

### Output observado (prueba real)

Payload probado:

```json
{"engine":"12V4000M53","dryRun":true,"backup":true}
```

Resultado (resumen):

- `ok=true`
- `result.mode=DRY_RUN`
- `result.totals.usedRows=6707`
- `result.totals.rowsGenerated=6707`
- `result.totals.ambiguous=2`
- `result.totals.notFound=0`
- `notes.writesOnlyTo=data/02-engine_rebuild`
- `notes.engineFilesModified=false`
- `notes.backupIgnored=true`

### Archivos modificados

- En `dryRun=true`: ninguno.
- En `dryRun=false`: solo `data/02-engine_rebuild/*`.
- No escribe `engine_*.json`.

### Backup

- No aplica en runtime de este endpoint (`backup` se ignora en respuesta).

### DryRun

- Soportado y funcional.

### Casos de uso reales

- Paso 1 del pipeline: reconstruir staging de rebuild antes de aplicar en engines.
- Diagnostico de cobertura/match preview->engine sin tocar engines finales.

## Endpoint B — POST /api/pdf-preview/apply-to-engine

Estado: OFFICIAL_V103
Runner: `apply_book_preview_to_engine.py` (si `engine`) o `apply_all_book_previews.py` (si no `engine`).

### Inputs

- `engine` opcional: si se informa, aplica solo al engine indicado.
- `conflictDecisions` opcional para resolver ambiguedades.

### Output observado (prueba real)

Payload probado:

```json
{"engine":"12V4000M53"}
```

Resultado (resumen):

- `ok=true`, `exitCode=0`
- `script=apply_book_preview_to_engine.py`
- `engine=engine_12V4000M53.json`
- `stats.preview_rows=6707`
- `stats.matched_unique=6700`
- `stats.matched_page_pn_no_pos=10`
- `stats.rows_changed=2`
- `stats.fields_changed=2`
- `stats.not_found=0`, `stats.ambiguous=0`

### Archivos modificados

- Modifica `engine_*.json` directamente (caso probado: `engine_12V4000M53.json` quedo modificado).

### Backup

- No hay backup en el endpoint ni en los argumentos con los que se invoca el script desde `server.js`.

### DryRun

- No expuesto en endpoint (siempre invoca script con `--write --overwrite`).

### Casos de uso reales

- Paso 2 del pipeline para promocionar preview a engine real.
- Uso puntual por engine y uso masivo (si `engine` vacio).

### Hallazgo de seguridad

- Es funcional, pero sin `dryRun` y sin backup en ruta HTTP oficial.

## Endpoint C — POST /recompute-pdf-auto-visual

Estado: OFFICIAL_V103 (reemplazo del legado `/recompute-pdf-auto`).
Runner: `scripts/qa_pdf_visual_copy.js` via `runVisualCopyComparison()`.

### Inputs

- `file` obligatorio (`engine_*.json`).
- `id` opcional (single-row) o libro completo si vacio.
- `dryRun` bool.
- `backup` bool.

### Output observado (prueba real)

Payload probado:

```json
{"file":"engine_12V4000M53.json","id":"RB-12V4000M53-000732","dryRun":true,"backup":true}
```

Resultado:

- `ok=true`
- `result.mode=single-id`
- `result.algorithm=visual-compatible-backend`
- `result.scanned=1`
- `result.changedRows=0`
- `result.wroteFile=false`

### Archivos modificados

- En `dryRun=true`: ninguno.
- En `dryRun=false`: `engine_*.json` objetivo.

### Backup

- Soportado (`backup=true` por defecto).

### DryRun

- Soportado y funcional.

### Casos de uso reales

- Recalculo visual de campos PDF en una fila o libro completo.
- Sustitucion del endpoint legacy 410.

## Endpoint D — POST /copy-pdf-to-final-all-books

Estado: OFFICIAL_V103
Runner: logica inline `FINAL_FIELDS_V1_MAPPINGS_BACKEND` en `server.js`.

### Inputs

- `file` opcional, `files` opcional (si no se informa, procesa todos).
- `backup` bool (default true).

### Output observado (prueba real)

Payload probado:

```json
{"file":"engine_12V4000M53.json","backup":true}
```

Resultado:

- `ok=true`, `official=true`
- `totals.filesProcessed=1`
- `totals.filesWritten=1`
- `totals.scannedRows=6707`
- `totals.changedRows=2`
- `totals.updatedFields=2`
- `perFile[0].fieldCounts.qty_final=2`
- `perFile[0].changedRecordIdsPreview=[RB-12V4000M53-002772, RB-12V4000M53-005907]`

### Archivos modificados

- `engine_*.json` objetivo.
- Backup `.backup.<timestamp>` en el mismo directorio del engine.

Evidencia de backup observado:

- `engine_12V4000M53.json.backup.1780598839867`

### Backup

- Soportado y aplicado cuando hay cambios.

### DryRun

- No expuesto en endpoint.

### Casos de uso reales

- Paso 5 del pipeline: consolidacion de campos `*_final` con prioridad PDF/GESA/SUST/BASE.

## Comparativa resumida

| Endpoint | Escribe engine_*.json | Backup | DryRun | Resultado funcional |
|---|---:|---:|---:|---|
| `/api/recompute-simple/rebuild-json` | No | No (ignorado) | Si | Correcto |
| `/api/pdf-preview/apply-to-engine` | Si | No | No | Correcto |
| `/recompute-pdf-auto-visual` | Si | Si | Si | Correcto |
| `/copy-pdf-to-final-all-books` | Si | Si | No | Correcto |

## Conclusiones PDF

1. Los 4 endpoints oficiales funcionan en ejecucion real.
2. El dominio PDF tiene una asimetria de seguridad: dos endpoints no exponen `dryRun` y uno de ellos tampoco backup (`/api/pdf-preview/apply-to-engine`).
3. El flujo rebuild (`/api/recompute-simple/rebuild-json`) es seguro por diseno: no toca engines.
4. Para FASE 5 (quarantine) no hay bloqueo funcional; si hay deuda de seguridad para FASE 6/7 (gating + dryRun/backup en apply).