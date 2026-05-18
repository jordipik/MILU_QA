# Boton COPIAR en analista_02

## Alcance
Este documento describe el boton visual **COPIAR** del panel PDF en analista_02:
- id HTML: `copyPdfReadToPdfBtn`
- etiqueta visible: `COPIAR`
- objetivo: copiar la lectura detectada del PDF a los campos `*_pdf` del registro actual.

Referencia UI:
- analista_02.html (bloque de botones PDF): `copyPdfReadToPdfBtn`

## Donde se engancha el click
El click se enlaza en JS con `bindClick('copyPdfReadToPdfBtn', ...)`.
Si la feature `PDF_FEATURE_AUTO_PDF_ENABLED` esta desactivada, no ejecuta la accion.

## Flujo funcional (resumen)
1. El boton llama a `copyPdfReadValuesToPdfFields()`.
2. Esta funcion valida que exista `currentRow` (registro cargado).
3. Llama a `copyPdfReadValuesForRow(currentRow, { silent: false, reloadAfterSave: true, clearPdfBeforeCopy: true })`.
4. Si la copia es correcta, persiste cambios en JSON via `saveCellToServer(...)`.
5. Si hubo cambios, recarga el registro editado (`reloadEditedRecord`) y refresca estadisticas (`renderReviewStats`).

## Validaciones previas
La copia puede fallar con estos motivos controlados:
- `missing-engine-or-id`: no se pudo resolver archivo engine o ID.
- `missing-pdf-page`: no hay pagina PDF cargada/parseada.
- `missing-marked-row`: no se encontro la fila marcada del PDF (requiere flujo de deteccion/pintado).
- `feature-disabled`: Auto-PDF desactivado.
- `missing-row`: no hay fila actual.

La UI muestra `alert(...)` especifico para los casos principales.

## Que campos copia
La lectura base de la fila marcada del PDF se mapea a:
- `pos_pdf`
- `pn_pdf`
- `designation_pdf`
- `model_type_pdf`
- `qty_pdf`
- `units_pdf`
- `weight_pdf`
- `fn_pdf`
- `measure_pdf`
- `norma_pdf`

Ademas intenta detectar en cabecera superior:
- `fg_fgs_pdf`
- `bom_pdf`

Regla adicional:
- Si cambia `norma_pdf` y `normalizado_pdf` no es `SI`, guarda `normalizado_pdf = SI`.

## Importante: limpieza previa
Como se invoca con `clearPdfBeforeCopy: true`, antes de copiar:
- limpia (pone `""`) todos los campos existentes que terminen en `_pdf` del registro actual.
- luego escribe los nuevos valores detectados.

Esto evita mezclar residuos de lecturas anteriores, pero implica que el boton reemplaza por completo el estado `_pdf` del registro.

## Persistencia
La escritura usa `saveCellToServer(file, id, col, value)` (cliente) que hace POST a backend de guardado (`/save-json` o ruta candidata equivalente segun entorno).

Payload por campo:
```json
{ "file": "engine_xxx.json", "id": "...", "col": "campo", "value": "..." }
```

## Efectos visibles tras copiar
- Mensaje con resumen de lectura PDF.
- Si hubo cambios: mensaje "Copiados N campos _pdf...".
- Si no hubo cambios: mensaje indicando que ya estaban sincronizados.
- Refresco de estadisticas de revision/copia en la vista.

## Referencias de codigo
- `analista_02.html`: definicion del boton `copyPdfReadToPdfBtn`.
- `js/analista-02.js`: binding del click de `copyPdfReadToPdfBtn`.
- `js/analista-02.js`: `copyPdfReadValuesToPdfFields()`.
- `js/analista-02.js`: `copyPdfReadValuesForRow(...)`.
- `js/analista-02.js`: `buildMarkedRowValuesFromGroup(...)`.
- `js/data-loader.js`: `saveCellToServer(...)`.

## Modal de recálculo (Paso 1)
En el modal **Recálculo QA por Libro**, el boton **IMPORTAR PDF** ahora ejecuta:
- Funcion frontend: `runBulkCopyPdfToBook()`
- Endpoint backend: `POST /copy-pdf-to-pdf-all-books`
- Servicio backend reutilizable: `runPdfVisualCopyBatch(options)`

Descripcion funcional del Paso 1:
- Aplica copia masiva de lectura PDF a campos `*_pdf` de todo el libro seleccionado.
- Guarda en JSON en backend (con backup habilitado en este flujo).
- Devuelve estadisticas globales y por libro (`totals` y `perFile`) que se muestran en el panel de detalle del modal.

---

## Ejecucion masiva (todos los libros)

Se dejo preparada una ruta backend y un script CLI para ejecutar la copia visual-compatible en lote reutilizando la misma logica.

### Funcion reutilizable backend
- Archivo: `server/services/pdf-copy-batch.js`
- Funcion: `runPdfVisualCopyBatch(options)`
- Opciones:
	- `writePdf` (bool): escribe cambios en `engine_*.json`.
	- `backup` (bool): genera `.backup` antes de escribir.
	- `file` o `files`: limitar a uno o varios libros.
- Devuelve:
	- `totals`: `scanned`, `changedRows`, `unchangedRows`, `missingPages`, `pnAnchorMissing`, `filesWritten`.
	- `perFile`: detalle por libro.
	- `missingPageStatusBreakdown`: conteo de estados de pagina faltante.

### Endpoint HTTP listo para boton futuro
- Ruta: `POST /copy-pdf-to-pdf-all-books`
- Payload opcional:
```json
{
	"writePdf": true,
	"backup": true,
	"file": "engine_12V4000M53.json",
	"files": ["engine_12V4000M53.json", "engine_12V4000M70.json"]
}
```
- Notas:
	- Si no se envian `file/files`, procesa los 9 libros.
	- Responde `{ ok: true, result: ... }` con estadisticas agregadas y por libro.

### Script CLI
- Archivo: `scripts/run_visual_pdf_copy_batch.js`
- NPM scripts:
	- `npm run qa:pdf-copy:batch` (dry-run)
	- `npm run qa:pdf-copy:batch:write` (escritura con backup)
	- `npm run qa:pdf-copy:batch:write:no-backup` (escritura sin backup)
- Flags directas:
	- `--write-pdf`
	- `--dry-run`
	- `--no-backup`
	- `--files engine_12V4000M53.json,engine_12V4000M70.json`

### Recomendacion para UI futura
Para agregar un boton de "Copiar PDF en lote":
- usar `fetch('/copy-pdf-to-pdf-all-books', { method: 'POST', ... })`;
- mostrar progreso/estado en `setRecomputeStatus(...)`;
- al finalizar, renderizar resumen con `result.totals` y un detalle por libro de `result.perFile`.
