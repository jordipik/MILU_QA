# Análisis: EXTRAER PÁGINA (BOM y FG/FGS)

## Resultado corto

Se identificaron dos causas principales por las que BOM y FG/FGS podían perderse en el flujo de extracción:

1. En el flujo de [import_pdf.html](import_pdf.html#L458) no existía detección superior de BOM/FG; el preview los llenaba explícitamente en blanco.
2. En el flujo de [analista_02.html](analista_02.html#L255), sí existía detección superior, pero con regex incompletas para variantes como B.O.M. y FG-FGS.

Además, la whitelist de guardado ya permitía `bom_pdf` y `fg_fgs_pdf`, por lo que la pérdida no estaba en persistencia.

## 1) Qué función lanza EXTRAER PÁGINA

### analista_02

- Botón: [analista_02.html](analista_02.html#L255)
- Script: [analista_02.html](analista_02.html#L577)
- Binding click: [js/analista-02.js](js/analista-02.js#L11430)
- Runner: [js/analista-02.js](js/analista-02.js#L926)
- Extracción: [js/analista-02.js](js/analista-02.js#L823)

### import_pdf

- Botón: [import_pdf.html](import_pdf.html#L458)
- Script: [import_pdf.html](import_pdf.html#L616)
- Binding click: [js/import-pdf.js](js/import-pdf.js#L1020)
- Runner: [js/import-pdf.js](js/import-pdf.js#L664)
- Extracción: [js/import-pdf.js](js/import-pdf.js#L578)

## 2) Qué endpoint o script llama

Para EXTRAER PÁGINA no hay endpoint backend: es extracción en frontend y descarga JSON local.

- En analista_02: `runExtractPdfPageRowsPreview()` construye payload y llama `downloadJsonPreview(...)`.
- En import_pdf: igual patrón.

Los endpoints se usan en otros pasos (ej. copia/aplicación), no en EXTRAER PÁGINA.

## 3) Parser/extractor y headers detectables

### Parser de tabla (columnas cuerpo)

- Patrones de cabecera: [js/pdf-viewer.js](js/pdf-viewer.js#L1069)
- Detección header-only (CABECERAS): [js/pdf-viewer.js](js/pdf-viewer.js#L3050)
- Pintado cuerpo por columnas (TABLA): [js/pdf-viewer.js](js/pdf-viewer.js#L3876)

### Detección superior específica BOM/FG (fuera de tabla)

- Analista: [js/analista-02.js](js/analista-02.js#L2068)
- BOM parser: [js/analista-02.js](js/analista-02.js#L1936)

## 4) Mapeo de columnas a campos bom_pdf / fg_fgs_pdf

- En analista EXTRAER PÁGINA sí se mapeaba a `bom_pdf` y `fg_fgs_pdf` desde detección superior.
- En import_pdf EXTRAER PÁGINA no se mapeaba realmente: los valores iban en blanco.

## 5) Preview generado

El preview incluye columnas para ambos campos en las dos UIs:

- import_pdf tabla preview: [import_pdf.html](import_pdf.html#L558)
- analista payload de extracción: [js/analista-02.js](js/analista-02.js#L823)

## 6) Dónde se perdían

### Pérdida clara A (import_pdf)

- Punto de pérdida: en [js/import-pdf.js](js/import-pdf.js#L578), antes del parche se pasaba:
  - `bomPdf: ''`
  - `fgFgsPdf: ''`

### Pérdida clara B (analista)

- Punto de pérdida: regex de detección superior no contemplaban todas las variantes.
- No cubría bien casos como `B.O.M.` y `FG-FGS`.

## 7) Revisión de endpoint y whitelist (persistencia)

- Whitelist de campos editables incluye ambos:
  - [server/validation/allowed-fields.js](server/validation/allowed-fields.js#L40)
  - [server/validation/allowed-fields.js](server/validation/allowed-fields.js#L49)
- En `copy-pdf-to-pdf`, los campos pasan por `isAllowedSaveJsonField`.

Conclusión: no se pierden por whitelist.

## 8) Cambios diagnósticos aplicados

Se añadieron logs temporales claros de diagnóstico en ambos flujos de EXTRAER PÁGINA:

- Analista: [js/analista-02.js](js/analista-02.js#L875)
- Import PDF: [js/import-pdf.js](js/import-pdf.js#L627)

Estos logs muestran:

- headers detectados
- columnas detectadas
- primera fila parseada
- valores BOM/FG detectados
- objeto final de preview

## 9) Parche mínimo aplicado

### 9.1 Variantes de detección BOM/FG

- Analista:
  - BOM regex ampliada para `B.O.M.`: [js/analista-02.js](js/analista-02.js#L1936)
  - FG regex ampliada para `FG`, `FGS`, `FG/FGS`, `FG / FGS`, `FG-FGS`: [js/analista-02.js](js/analista-02.js#L2164)

### 9.2 import_pdf ahora extrae BOM/FG

- Nueva detección superior en import_pdf: [js/import-pdf.js](js/import-pdf.js#L192)
- Integración en extracción de página: [js/import-pdf.js](js/import-pdf.js#L578)

### 9.3 Headers detectables extendidos

- Se añadieron variantes detectables en parser de cabecera:
  - [js/pdf-viewer.js](js/pdf-viewer.js#L1081)
  - [js/pdf-viewer.js](js/pdf-viewer.js#L1082)
- Se añadió soporte de buckets para `fg_fgs` y `bom`:
  - [js/pdf-viewer.js](js/pdf-viewer.js#L1380)
  - [js/pdf-viewer.js](js/pdf-viewer.js#L1381)

## 10) Propuesta exacta de corrección (estado)

Estado: aplicado con parche mínimo y orientado a diagnóstico.

Checklist pedido:

- Añadir BOM y FG/FGS a headers detectables: aplicado.
- Mapearlos a bom_pdf y fg_fgs_pdf: aplicado en import_pdf (analista ya lo tenía).
- Incluirlos en preview: ya estaban, ahora se rellenan también en import_pdf.
- Incluirlos en PDF_FIELDS/whitelist si falta: ya estaban permitidos; no fue necesario cambio.

## 11) Riesgo y validación sugerida

Riesgo bajo-moderado (regex de detección superior y cabeceras detectables ampliadas).

Validación manual recomendada:

1. Probar EXTRAER PÁGINA en [analista_02.html](analista_02.html#L255) con PDFs que tengan `B.O.M.` y `FG-FGS`.
2. Probar EXTRAER PÁGINA en [import_pdf.html](import_pdf.html#L458) y revisar `bom_pdf`/`fg_fgs_pdf` en tabla y JSON descargado.
3. Verificar en consola logs `[pdf-preview][diagnostico]` y `[import-pdf][diagnostico]`.

## Corrección export CSV import_pdf

- Causa raíz: [js/import-pdf.js](js/import-pdf.js#L489) solo descargaba JSON del preview y no existía un export CSV real en `import_pdf`; por eso el flujo no serializaba `bom_pdf` ni `fg_fgs_pdf` a ningún CSV descargable desde esa página.
- Archivo modificado: [js/import-pdf.js](js/import-pdf.js) y [import_pdf.html](import_pdf.html).
- Función modificada: [js/import-pdf.js](js/import-pdf.js#L489) mantiene `downloadJsonPreview(...)` y añade `downloadCsvPreview(...)` con columnas fijas basadas en `PREVIEW_COLUMNS`.
- Columnas añadidas: `bom_pdf` y `fg_fgs_pdf` quedan exportadas en el CSV en el bloque `fn_pdf`, `measure_pdf`, `norma_pdf`, `bom_pdf`, `fg_fgs_pdf`.
- Validación realizada: revisión del flujo de filas en [js/import-pdf.js](js/import-pdf.js#L399), comprobación de que `bom_pdf` y `fg_fgs_pdf` ya existen en cada fila antes de exportar, validación sintáctica posterior de los archivos tocados y añadido de logs temporales previos a la generación del CSV para inspeccionar filas, columnas y primera fila exportada.
