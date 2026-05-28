# Official vs Legacy

## Objetivo
Separar rutas oficiales vigentes de rutas legacy/alternativas que aun existen en codigo.

## OFFICIAL
- `POST /api/pdf-preview/apply-to-engine`
- `POST /copy-pdf-to-final-all-books`
- `POST /recompute-qa-errors`
- `POST /api/recompute-simple/update-states`
- `GET/POST /qa_revision_sync.php`
- `POST /apply-revision-to-engines`
- `POST /export/run-wordpress`
- `POST /api/recompute-simple/enrich-assets` (assets runtime)

## OFFICIAL (modelo de assets)
- Separar `esquemas` (base) de `esquemas_pos` (POS marcado).
- Ejecutar assets en dos fases: A esquemas generales, B esquemas_pos.
- Regla de idempotencia: si archivo existe y JSON coincide, no hacer nada.
- Reparacion permitida: sincronizar JSON sin regenerar imagenes.
- Inference oficial de pagina de esquema por metadatos `FG/FGS` + `BOM-No.` (sin offset manual).
- Regla OCR oficial para POS concatenados: admitir submatch numerico valido (ejemplo `170155` contiene `155`).

## OFFICIAL / ACTIVE
- `rebuild_assets_for_record.py`
  - CLI incremental por registro/libro/todos.
  - Estado actual: OFFICIAL / ACTIVE.
  - Responsabilidad: rebuild incremental de esquemas y esquemas_pos, inferencia automatica de pagina de esquema y sincronizacion JSON.
  - Logging de trazabilidad operativo:
    - `[AUTO] pagina esquema inferida por metadatos FG/BOM: <page>`
    - `[OK] esquema existente`
    - `[GEN] esquema_pos generado`
    - `[SYNC] json actualizado`
    - `[MISS] pos no encontrado`

## LEGACY (coexistente)
- `POST /calculate-final-fields`
  - Sigue activo para compatibilidad.
  - Ejecuta `copy_gesa_fields_to_final.py`.

## LEGACY DESACTIVADO
- `POST /recompute-pdf-auto`
  - Responde HTTP 410.
  - Mensaje: usar `/recompute-pdf-auto-visual`.

## ALTERNATIVO (no flujo oficial principal)
- `POST /recompute-pdf-auto-visual`
- `POST /copy-pdf-to-pdf-all-books`

## Regla documental DOC V2
Cuando exista ruta oficial y ruta legacy para la misma etapa, la referencia principal debe ser la oficial y la legacy debe quedar marcada solo como compatibilidad.
