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
