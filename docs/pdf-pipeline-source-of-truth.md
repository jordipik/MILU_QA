# Fuente Unica De Verdad Del Pipeline PDF

Este documento define la unica logica canonica para copiar lectura PDF a campos `*_pdf`.

## Regla Canonica

La funcion canonica de escritura es:

- `applyCanonicalPdfCopyToRow(...)` en `scripts/qa_pdf_visual_copy.js`.

Regla de comportamiento:

1. Reemplazo total de estado `*_pdf`:
- Primero limpia todos los campos `*_pdf` existentes (si `clearPdfBeforeCopy=true`).
- Luego escribe solo los valores nuevos detectados.
- No hace merges parciales sobre residuos historicos.

2. Normalizacion especial:
- Si cambia `norma_pdf`, fuerza `normalizado_pdf = "SI"`.

## Flujos Que Deben Pasar Por Esta Regla

- Boton visual COPIAR (registro actual): usa `copyPdfReadValuesForRow(...)` y aplica reemplazo total con limpieza previa.
- IMPORTAR PDF (lote backend): `POST /copy-pdf-to-pdf-all-books`.
- Recalculo backend visual-compatible: `POST /recompute-pdf-auto-visual`.
- Endpoint legacy de copia puntual: `POST /copy-pdf-to-pdf`.
- Script CLI lote: `scripts/run_visual_pdf_copy_batch.js`.

Los flujos backend/CLI usan `runVisualCopyComparison(...)`, que delega en `applyCanonicalPdfCopyToRow(...)` para la escritura final sobre JSON.

## Logs Minimos

Se registran eventos `pdf-copy` con:

- funcion que ejecuta copia
- endpoint/caller
- cantidad de campos cambiados
- libro/archivo
- ID

Formato base:

`[pdf-copy] fn=... caller=... endpoint=... file=... book=... id=... changedFields=N`

## Nota Sobre Endpoints

`/recompute-pdf-auto` permanece como endpoint legacy desactivado (410) para no romper compatibilidad de contrato existente.
