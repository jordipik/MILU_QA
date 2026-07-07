# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# AnÃ¡lisis: EXTRAER PÃGINA (BOM y FG/FGS)

## Resultado corto

Se identificaron dos causas principales por las que BOM y FG/FGS podÃ­an perderse en el flujo de extracciÃ³n:

1. En el flujo de [import_pdf.html](import_pdf.html#L458) no existÃ­a detecciÃ³n superior de BOM/FG; el preview los llenaba explÃ­citamente en blanco.
2. En el flujo de [analista_02.html](analista_02.html#L255), sÃ­ existÃ­a detecciÃ³n superior, pero con regex incompletas para variantes como B.O.M. y FG-FGS.

AdemÃ¡s, la whitelist de guardado ya permitÃ­a `bom_pdf` y `fg_fgs_pdf`, por lo que la pÃ©rdida no estaba en persistencia.

## 1) QuÃ© funciÃ³n lanza EXTRAER PÃGINA

### analista_02

- BotÃ³n: [analista_02.html](analista_02.html#L255)
- Script: [analista_02.html](analista_02.html#L577)
- Binding click: [js/analista-02.js](js/analista-02.js#L11430)
- Runner: [js/analista-02.js](js/analista-02.js#L926)
- ExtracciÃ³n: [js/analista-02.js](js/analista-02.js#L823)

### import_pdf

- BotÃ³n: [import_pdf.html](import_pdf.html#L458)
- Script: [import_pdf.html](import_pdf.html#L616)
- Binding click: [js/import-pdf.js](js/import-pdf.js#L1020)
- Runner: [js/import-pdf.js](js/import-pdf.js#L664)
- ExtracciÃ³n: [js/import-pdf.js](js/import-pdf.js#L578)

## 2) QuÃ© endpoint o script llama

Para EXTRAER PÃGINA no hay endpoint backend: es extracciÃ³n en frontend y descarga JSON local.

- En analista_02: `runExtractPdfPageRowsPreview()` construye payload y llama `downloadJsonPreview(...)`.
- En import_pdf: igual patrÃ³n.

Los endpoints se usan en otros pasos (ej. copia/aplicaciÃ³n), no en EXTRAER PÃGINA.

## 3) Parser/extractor y headers detectables

### Parser de tabla (columnas cuerpo)

- Patrones de cabecera: [js/pdf-viewer.js](js/pdf-viewer.js#L1069)
- DetecciÃ³n header-only (CABECERAS): [js/pdf-viewer.js](js/pdf-viewer.js#L3050)
- Pintado cuerpo por columnas (TABLA): [js/pdf-viewer.js](js/pdf-viewer.js#L3876)

### DetecciÃ³n superior especÃ­fica BOM/FG (fuera de tabla)

- Analista: [js/analista-02.js](js/analista-02.js#L2068)
- BOM parser: [js/analista-02.js](js/analista-02.js#L1936)

## 4) Mapeo de columnas a campos bom_pdf / fg_fgs_pdf

- En analista EXTRAER PÃGINA sÃ­ se mapeaba a `bom_pdf` y `fg_fgs_pdf` desde detecciÃ³n superior.
- En import_pdf EXTRAER PÃGINA no se mapeaba realmente: los valores iban en blanco.

## 5) Preview generado

El preview incluye columnas para ambos campos en las dos UIs:

- import_pdf tabla preview: [import_pdf.html](import_pdf.html#L558)
- analista payload de extracciÃ³n: [js/analista-02.js](js/analista-02.js#L823)

## 6) DÃ³nde se perdÃ­an

### PÃ©rdida clara A (import_pdf)

- Punto de pÃ©rdida: en [js/import-pdf.js](js/import-pdf.js#L578), antes del parche se pasaba:
  - `bomPdf: ''`
  - `fgFgsPdf: ''`

### PÃ©rdida clara B (analista)

- Punto de pÃ©rdida: regex de detecciÃ³n superior no contemplaban todas las variantes.
- No cubrÃ­a bien casos como `B.O.M.` y `FG-FGS`.

## 7) RevisiÃ³n de endpoint y whitelist (persistencia)

- Whitelist de campos editables incluye ambos:
  - [server/validation/allowed-fields.js](server/validation/allowed-fields.js#L40)
  - [server/validation/allowed-fields.js](server/validation/allowed-fields.js#L49)
- En `copy-pdf-to-pdf`, los campos pasan por `isAllowedSaveJsonField`.

ConclusiÃ³n: no se pierden por whitelist.

## 8) Cambios diagnÃ³sticos aplicados

Se aÃ±adieron logs temporales claros de diagnÃ³stico en ambos flujos de EXTRAER PÃGINA:

- Analista: [js/analista-02.js](js/analista-02.js#L875)
- Import PDF: [js/import-pdf.js](js/import-pdf.js#L627)

Estos logs muestran:

- headers detectados
- columnas detectadas
- primera fila parseada
- valores BOM/FG detectados
- objeto final de preview

## 9) Parche mÃ­nimo aplicado

### 9.1 Variantes de detecciÃ³n BOM/FG

- Analista:
  - BOM regex ampliada para `B.O.M.`: [js/analista-02.js](js/analista-02.js#L1936)
  - FG regex ampliada para `FG`, `FGS`, `FG/FGS`, `FG / FGS`, `FG-FGS`: [js/analista-02.js](js/analista-02.js#L2164)

### 9.2 import_pdf ahora extrae BOM/FG

- Nueva detecciÃ³n superior en import_pdf: [js/import-pdf.js](js/import-pdf.js#L192)
- IntegraciÃ³n en extracciÃ³n de pÃ¡gina: [js/import-pdf.js](js/import-pdf.js#L578)

### 9.3 Headers detectables extendidos

- Se aÃ±adieron variantes detectables en parser de cabecera:
  - [js/pdf-viewer.js](js/pdf-viewer.js#L1081)
  - [js/pdf-viewer.js](js/pdf-viewer.js#L1082)
- Se aÃ±adiÃ³ soporte de buckets para `fg_fgs` y `bom`:
  - [js/pdf-viewer.js](js/pdf-viewer.js#L1380)
  - [js/pdf-viewer.js](js/pdf-viewer.js#L1381)

## 10) Propuesta exacta de correcciÃ³n (estado)

Estado: aplicado con parche mÃ­nimo y orientado a diagnÃ³stico.

Checklist pedido:

- AÃ±adir BOM y FG/FGS a headers detectables: aplicado.
- Mapearlos a bom_pdf y fg_fgs_pdf: aplicado en import_pdf (analista ya lo tenÃ­a).
- Incluirlos en preview: ya estaban, ahora se rellenan tambiÃ©n en import_pdf.
- Incluirlos en PDF_FIELDS/whitelist si falta: ya estaban permitidos; no fue necesario cambio.

## 11) Riesgo y validaciÃ³n sugerida

Riesgo bajo-moderado (regex de detecciÃ³n superior y cabeceras detectables ampliadas).

ValidaciÃ³n manual recomendada:

1. Probar EXTRAER PÃGINA en [analista_02.html](analista_02.html#L255) con PDFs que tengan `B.O.M.` y `FG-FGS`.
2. Probar EXTRAER PÃGINA en [import_pdf.html](import_pdf.html#L458) y revisar `bom_pdf`/`fg_fgs_pdf` en tabla y JSON descargado.
3. Verificar en consola logs `[pdf-preview][diagnostico]` y `[import-pdf][diagnostico]`.

## CorrecciÃ³n export CSV import_pdf

- Causa raÃ­z: [js/import-pdf.js](js/import-pdf.js#L489) solo descargaba JSON del preview y no existÃ­a un export CSV real en `import_pdf`; por eso el flujo no serializaba `bom_pdf` ni `fg_fgs_pdf` a ningÃºn CSV descargable desde esa pÃ¡gina.
- Archivo modificado: [js/import-pdf.js](js/import-pdf.js) y [import_pdf.html](import_pdf.html).
- FunciÃ³n modificada: [js/import-pdf.js](js/import-pdf.js#L489) mantiene `downloadJsonPreview(...)` y aÃ±ade `downloadCsvPreview(...)` con columnas fijas basadas en `PREVIEW_COLUMNS`.
- Columnas aÃ±adidas: `bom_pdf` y `fg_fgs_pdf` quedan exportadas en el CSV en el bloque `fn_pdf`, `measure_pdf`, `norma_pdf`, `bom_pdf`, `fg_fgs_pdf`.
- ValidaciÃ³n realizada: revisiÃ³n del flujo de filas en [js/import-pdf.js](js/import-pdf.js#L399), comprobaciÃ³n de que `bom_pdf` y `fg_fgs_pdf` ya existen en cada fila antes de exportar, validaciÃ³n sintÃ¡ctica posterior de los archivos tocados y aÃ±adido de logs temporales previos a la generaciÃ³n del CSV para inspeccionar filas, columnas y primera fila exportada.

