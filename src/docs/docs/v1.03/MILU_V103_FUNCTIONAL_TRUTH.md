# MILU_V103_FUNCTIONAL_TRUTH

FASE 4.8 — Verdad funcional consolidada para habilitar FASE 5 (Quarantine) con evidencia real.

Documentos fuente:

- `MILU_PDF_FUNCTIONAL_AUDIT.md`
- `MILU_HERMANOS_EQUIVALENCE.md`
- `MILU_ESTADOS_EQUIVALENCE.md`
- `MILU_ESQUEMAS_AUDIT.md`

Fecha de auditoria: 2026-06-04.

## 1) Componentes oficialmente correctos (funcionan en prueba real)

## PDF

- `/api/recompute-simple/rebuild-json` — OK, `dryRun` funcional, no toca `engine_*.json`.
- `/api/pdf-preview/apply-to-engine` — OK en engine real, aplica cambios.
- `/recompute-pdf-auto-visual` — OK en `dryRun` por `id`.
- `/copy-pdf-to-final-all-books` — OK en engine real, con backup generado y cambios observables.

## Hermanos

- `/api/recompute-simple/recompute-hermanos` — OK, `dryRun` funcional, devuelve `item_results` y `per_engine`.

## Estados

- `/api/recompute-simple/update-states` — OK en `single-id`.
- `/recompute-qa-errors` — OK en `single-id` con `dryRun=true` y `updateRevision=true`.

## Esquemas

- `/api/recompute-simple/rebuild-schemes-by-bom` — OK en `dryRun`.
- `/api/recompute-simple/enrich-assets` — OK en `dryRun`.
- `/api/esquemas/generate-one` — OK en `dryRun`.
- `/api/recompute-simple/rebuild-schemes-circles-from-esquemas` — OK en `dryRun`.

## 2) Componentes equivalentes (demostrados)

1. Hermanos:
- Equivalencia algoritmo demostrada entre:
  - `/api/recompute-simple/recompute-hermanos`
  - `/pn-review/apply-siblings-bulk`
- Evidencia: muestra real de 5 PN con igualdad exacta en `item_results` por PN (`found_sources`, `target_siblings`, `planned_updates`, `winner_engine_file`, `winner_was_existing_ok_importar`, `skipped`).

2. Estados (equivalencia parcial):
- `/recalculate-revision-status` equivale funcionalmente a ejecutar `recompute_engine_errors` en all-engines con `updateRevision=true`, `forceRevision=false`, `dryRun=false`, `backup=true`.
- No es equivalente a `update-states` por responsabilidad y alcance.

## 3) Componentes redundantes demostrados

1. Hermanos legacy:
- `/pn-review/apply-siblings-bulk` es redundante respecto al endpoint oficial porque usa el mismo motor backend (`applySiblingBulkUpdates`).

2. Estados legacy:
- `/recalculate-revision-status` es redundante como orquestador global de estado; su logica queda cubierta por pipeline paso 6+7 (`recompute-qa-errors` + `update-states`).

3. Esquemas (redundancia de superficie, no total):
- `generate-one` y `rebuild-schemes-by-bom` comparten capacidad de generar esquema base; se justifican por granularidad (single vs bulk).

## 4) Componentes inseguros (funcionan, pero con riesgo)

1. `/api/pdf-preview/apply-to-engine`
- No expone `dryRun`.
- No aplica backup desde endpoint.
- En prueba real modifico `engine_12V4000M53.json` (`rows_changed=2`, `fields_changed=2`).

2. `/pn-review/apply-siblings-bulk`
- Hardcodeado a `dryRun:false` y `backup:false`.
- Aunque en muestra no escribio (`rows_updated=0`), su diseno es inseguro.

3. `/recalculate-revision-status`
- Bulk all-engines sin control de alcance ni `dryRun`.

## 5) Componentes listos para cuarentena (con evidencia funcional)

1. `POST /pn-review/apply-siblings-bulk`
- Motivo: redundante + inseguro.
- Sustituto: `POST /api/recompute-simple/recompute-hermanos`.

2. `POST /recalculate-revision-status`
- Motivo: redundante de pipeline estados + riesgo por scope global.
- Sustituto: `POST /recompute-qa-errors` (paso 6) + `POST /api/recompute-simple/update-states` (paso 7).

3. Endpoints legacy ya 410 (previos en FASE 3/4.5)
- Siguen listos para retirada fisica en FASE 5 al no tener consumidores funcionales.

## 6) Matriz de decision para FASE 5

| Componente | Estado funcional | Equivalente oficial | Riesgo | Decision FASE 5 |
|---|---|---|---|---|
| `/pn-review/apply-siblings-bulk` | Funciona | Si | Alto | Quarantine candidato |
| `/recalculate-revision-status` | Funciona | Si (pipeline oficial) | Alto | Quarantine candidato |
| `/api/pdf-preview/apply-to-engine` | Funciona | No (es oficial) | Medio/Alto | Mantener + gate/mejora en FASE 6/7 |
| `/api/recompute-simple/rebuild-json` | Funciona | n/a | Bajo | Mantener |
| `/recompute-pdf-auto-visual` | Funciona | n/a | Bajo/Medio | Mantener |
| `/copy-pdf-to-final-all-books` | Funciona | n/a | Medio | Mantener |

## 7) Respuesta al objetivo de FASE 4.8

Objetivo: llegar a FASE 5 con evidencia funcional real y no solo documental.

Resultado:

- Cumplido.
- Se ejecutaron pruebas reales en endpoints oficiales criticos y comparativas de equivalencia.
- Se demostro que los candidatos principales de cuarentena (Hermanos legacy y Estados legacy global) son funcionalmente reemplazables por rutas oficiales.
- Se identificaron componentes oficiales correctos pero con deuda de seguridad (gating/dryRun/backup) para FASE 6/7.

## 8) Nota de trazabilidad de la auditoria

Durante esta auditoria se detectaron escrituras reales en datos por endpoints sin `dryRun`:

- `engine_12V4000M53.json` modificado por:
  - `/api/pdf-preview/apply-to-engine` (2 rows / 2 fields)
  - `/copy-pdf-to-final-all-books` (2 rows / 2 fields)
- Backup confirmado para el segundo endpoint (`engine_12V4000M53.json.backup.<timestamp>`).

No hubo cambios de codigo, no hubo movimiento de archivos y no se ejecuto cuarentena.