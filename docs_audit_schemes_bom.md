# Auditoria documental de esquemas por BOM

Fecha: 2026-06-02
Alcance: Auditoria de documentacion sobre calculo de esquemas y esquemas con circulos, tomando como fuente de verdad el codigo actual.
Regla aplicada: propuesta documental solamente, sin cambios de codigo.

## 1) Fuente de verdad tecnica usada

### Codigo auditado (fuente de verdad)
- rebuild_schemes_by_bom.py
- rebuild_schemes_circles_from_esquemas.py
- server.js
- js/recompute-simple.js
- recompute_simple.html

### Hechos verificados en codigo
- El script rebuild_schemes_by_bom.py recalcula solo el campo esquemas por BOM y no recalcula campos de circulos.
- En rebuild_schemes_by_bom.py, el BOM de fila se prioriza en este orden: bom_final, BOM-No., bom_pdf.
- En rebuild_schemes_by_bom.py, los bloques por BOM se agrupan por paginas consecutivas y ademas se separan cuando cambia la firma completa de BOM de pagina.
- En rebuild_schemes_circles_from_esquemas.py, los circulos se derivan desde esquemas + POS, no desde heuristicas de FG o Source Page para descubrir el esquema base.
- En rebuild_schemes_circles_from_esquemas.py, la prioridad de POS es: POS, pos_final, pos_pdf, pos.
- En rebuild_schemes_circles_from_esquemas.py, los campos afectados son derivados de circulos: esquemas_circulos_all, esquemas_circulos, ruta_esquemas_pos, y opcionalmente exp_imagenes.
- En runtime actual, ASSETS se ejecuta con job asincrono desde POST /api/recompute-simple/enrich-assets/start y polling en GET /api/recompute-simple/enrich-assets/jobs/:jobId, con cancelacion en POST /api/recompute-simple/enrich-assets/jobs/:jobId/cancel.
- El endpoint POST /api/recompute-simple/enrich-assets sigue existiendo, pero la UI principal actual usa el flujo start/jobs.

## 2) Documentos revisados

### Docs v2 principales
- docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md
- docs_v2/00_overview/MILU_V1_REBUILD_DOC_V2.md
- docs_v2/00_overview/SCRIPT_MAP.md
- docs_v2/01_pipeline/pipeline_global.md
- docs_v2/01_pipeline/recompute_simple_flow.md
- docs_v2/02_pdf_import/import_pdf_flow.md
- docs_v2/05_assets/imagenes_esquemas_pipeline.md
- docs_v2/05_assets/esquemas_linking.md
- docs_v2/05_assets/pos_circulos_linking.md
- docs_v2/13_legacy/official_vs_legacy.md

### Area legacy consultada para impacto
- docs_v2/13_legacy/docs/ (muestreo por busqueda de terminos: esquemas_pos, ruta_esquemas_pos, FG/BOM, OCR, Source Page)

## 3) Informacion correcta que debe mantenerse

- La separacion conceptual entre esquemas base y esquemas con circulos es correcta.
- El uso de campos esquemas, esquemas_circulos_all, esquemas_circulos y ruta_esquemas_pos sigue vigente.
- El modelo incremental e idempotente de generacion/reuso de assets es correcto como principio.
- La documentacion de import PDF (overlay vs extraccion) es coherente con el pipeline de preview y apply.

## 4) Informacion obsoleta o inconsistente

### C1 - Regla de descubrimiento de esquema base desalineada
Ubicaciones:
- docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md
- docs_v2/00_overview/SCRIPT_MAP.md
- docs_v2/01_pipeline/pipeline_global.md
- docs_v2/05_assets/imagenes_esquemas_pipeline.md
- docs_v2/13_legacy/official_vs_legacy.md

Afirmacion obsoleta detectada:
- Se presenta como oficial la inferencia de pagina de esquema por FG/FGS + BOM-No. y trazas AUTO FG/BOM.

Por que es inconsistente:
- La fuente de verdad actual para recalculo de esquemas es rebuild_schemes_by_bom.py, que fija el esquema por agrupacion BOM (bloques BOM), no por heuristica historica FG/BOM para inferir pagina.

Riesgo:
- Diagnosticos operativos equivocados y ejecuciones en scripts incorrectos cuando se busca corregir esquemas.

### C2 - Terminologia oficial esquemas_pos perpetua ambiguedad
Ubicaciones:
- docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md
- docs_v2/00_overview/SCRIPT_MAP.md
- docs_v2/01_pipeline/pipeline_global.md
- docs_v2/05_assets/imagenes_esquemas_pipeline.md
- docs_v2/13_legacy/official_vs_legacy.md

Afirmacion obsoleta detectada:
- Se usa esquemas_pos como nombre operativo principal del paso/campo.

Por que es inconsistente:
- En datos y scripts actuales, los campos oficiales son esquemas_circulos_all, esquemas_circulos y ruta_esquemas_pos, derivados desde esquemas + POS.

Riesgo:
- Mezcla semantica entre concepto visual y contrato de campos reales en engine JSON.

### C3 - OCR concatenado como regla oficial general
Ubicaciones:
- docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md
- docs_v2/00_overview/SCRIPT_MAP.md
- docs_v2/01_pipeline/pipeline_global.md
- docs_v2/05_assets/imagenes_esquemas_pipeline.md
- docs_v2/13_legacy/official_vs_legacy.md

Afirmacion obsoleta detectada:
- Se documenta como regla oficial que un token OCR concatenado (ejemplo 170155) debe aceptar submatch para POS 155.

Por que es inconsistente:
- El flujo nuevo solicitado para esquemas/circulos elimina dependencia de heuristicas antiguas. Mantener esta regla como oficial puede contradecir la direccion funcional vigente.

Riesgo:
- Falsos positivos en deteccion POS y trazabilidad confusa sobre el origen de matches.

### C4 - Flujo ASSETS de recompute_simple desactualizado
Ubicaciones:
- docs_v2/01_pipeline/recompute_simple_flow.md
- docs_v2/00_overview/SCRIPT_MAP.md
- docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md
- docs_v2/01_pipeline/pipeline_global.md

Afirmacion obsoleta detectada:
- Se fija como endpoint principal de UI POST /api/recompute-simple/enrich-assets.

Por que es inconsistente:
- La UI principal actual en js/recompute-simple.js llama POST /api/recompute-simple/enrich-assets/start y luego consulta jobs.

Riesgo:
- Expectativas erroneas de respuesta sincronica y de telemetria/progreso.

### C5 - Enlace de esquemas base por Source Page en docs de linking
Ubicacion:
- docs_v2/05_assets/esquemas_linking.md

Afirmacion obsoleta detectada:
- Inputs incluyen engine_model y Source Page como base del enlace de esquemas.

Por que es inconsistente:
- Con la logica nueva de calculo, el esquema base se determina por BOM y bloque BOM; Source Page deja de ser regla primaria de determinacion.

Riesgo:
- QA/UI interpretando como autoridad una clave (Source Page) que ya no gobierna el calculo oficial.

## 5) Cambios recomendados (texto viejo -> texto nuevo)

### R1 - Reemplazar regla de inferencia FG/BOM por regla de bloque BOM
Documentos objetivo:
- docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md
- docs_v2/00_overview/SCRIPT_MAP.md
- docs_v2/01_pipeline/pipeline_global.md
- docs_v2/05_assets/imagenes_esquemas_pipeline.md
- docs_v2/13_legacy/official_vs_legacy.md

Texto viejo (patron):
- inferencia automatica de pagina de esquema por metadatos FG/FGS + BOM-No.

Texto nuevo propuesto:
- calculo de esquemas base por BOM de fila, con agrupacion en bloques BOM de paginas consecutivas y firma BOM estable.
- prioridad BOM de fila: bom_final, BOM-No., bom_pdf.
- el recalculo de esquemas se realiza en rebuild_schemes_by_bom.py y solo actualiza el campo esquemas.

### R2 - Sustituir fase esquemas_pos por nomenclatura de campos reales
Documentos objetivo:
- docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md
- docs_v2/00_overview/SCRIPT_MAP.md
- docs_v2/01_pipeline/pipeline_global.md
- docs_v2/05_assets/imagenes_esquemas_pipeline.md

Texto viejo (patron):
- FASE B - ESQUEMAS_POS

Texto nuevo propuesto:
- FASE B - DERIVACION DE CIRCULOS DESDE ESQUEMAS + POS
- salidas: esquemas_circulos_all, esquemas_circulos, ruta_esquemas_pos.
- script de referencia: rebuild_schemes_circles_from_esquemas.py.

### R3 - Degradar OCR concatenado a nota de compatibilidad, no regla oficial
Documentos objetivo:
- docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md
- docs_v2/00_overview/SCRIPT_MAP.md
- docs_v2/01_pipeline/pipeline_global.md
- docs_v2/05_assets/imagenes_esquemas_pipeline.md
- docs_v2/13_legacy/official_vs_legacy.md

Texto viejo (patron):
- deteccion OCR robusta para POS concatenados (ejemplo 170155 contiene 155)

Texto nuevo propuesto:
- compatibilidad OCR: solo mecanismo de ultimo recurso cuando no hay match por texto, con controles anti-falsos-positivos y sin alterar la regla principal basada en esquemas + POS.
- no documentar submatch concatenado como regla oficial general.

### R4 - Actualizar contrato de endpoint ASSETS en recompute_simple
Documentos objetivo:
- docs_v2/01_pipeline/recompute_simple_flow.md
- docs_v2/00_overview/SCRIPT_MAP.md
- docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md
- docs_v2/01_pipeline/pipeline_global.md

Texto viejo (patron):
- btnAssets -> POST /api/recompute-simple/enrich-assets

Texto nuevo propuesto:
- btnAssets -> POST /api/recompute-simple/enrich-assets/start
- seguimiento de progreso: GET /api/recompute-simple/enrich-assets/jobs/:jobId
- cancelacion: POST /api/recompute-simple/enrich-assets/jobs/:jobId/cancel
- endpoint POST /api/recompute-simple/enrich-assets queda como via sincronica de compatibilidad.

### R5 - Corregir docs de linking para quitar Source Page como regla primaria
Documento objetivo:
- docs_v2/05_assets/esquemas_linking.md

Texto viejo (patron):
- Inputs: libro y Source Page

Texto nuevo propuesto:
- Inputs: tokenes existentes en el campo esquemas (ya calculados por BOM).
- El linking UI debe limitarse a resolver y validar rutas de tokens ya persistidos, no recalcular criterios de descubrimiento.

## 6) Propuesta de actualizacion de diagramas

### Diagrama antiguo a retirar
- PDF -> PAGE -> POS -> ESQUEMA

Motivo de retiro:
- Sugiere que el esquema nace de heuristicas de pagina/posicion, no del calculo por BOM y bloque BOM.

### Diagrama nuevo propuesto (nivel funcional)
- PDF/BOOK_PREVIEW + ENGINE ROW
- ENGINE ROW -> BOM normalizado (bom_final, BOM-No., bom_pdf)
- BOM normalizado -> bloque BOM (paginas consecutivas con firma estable)
- bloque BOM -> esquemas
- esquemas + POS (POS, pos_final, pos_pdf, pos) -> esquemas_circulos_all / esquemas_circulos / ruta_esquemas_pos

### Diagrama nuevo propuesto (runtime recompute)
- btnImportPdf -> apply_to_engine
- btnSust -> update-gesa + update-sust
- btnAssets -> enrich-assets/start -> jobs status/cancel -> resultado
- btnFinal -> copy-pdf-to-final-all-books
- btnErrors -> recompute-qa-errors
- btnStatuses -> update-states

## 7) Contradicciones explicitas doc vs implementacion actual

- Contradiccion A: se documenta inferencia oficial FG/BOM para hallar esquema, pero la fuente de verdad nueva para esquemas es rebuild_schemes_by_bom.py.
- Contradiccion B: se documenta endpoint ASSETS sincronico como flujo principal, pero la UI opera sobre start/jobs asincrono.
- Contradiccion C: se documenta Source Page como input de enlace de esquemas, pero el esquema oficial ya viene determinado por BOM/bloque BOM.
- Contradiccion D: se mantiene OCR concatenado como regla oficial amplia, aunque la direccion funcional actual exige abandonar heuristicas antiguas como base de calculo.

## 8) Lista priorizada de documentos afectados

Prioridad alta (actualizar primero):
- docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md
- docs_v2/00_overview/SCRIPT_MAP.md
- docs_v2/01_pipeline/pipeline_global.md
- docs_v2/01_pipeline/recompute_simple_flow.md
- docs_v2/05_assets/imagenes_esquemas_pipeline.md
- docs_v2/05_assets/esquemas_linking.md

Prioridad media:
- docs_v2/05_assets/pos_circulos_linking.md
- docs_v2/13_legacy/official_vs_legacy.md

Prioridad baja (alineacion de legado, sin urgencia funcional):
- docs_v2/13_legacy/docs/ con menciones de esquemas_pos, FG/BOM inferido y OCR concatenado como regla principal.

## 9) Recomendacion de gobernanza documental

- Definir una unica pagina canonicamente oficial para reglas de calculo de esquemas y circulos (sugerido: docs_v2/05_assets/imagenes_esquemas_pipeline.md), y que el resto solo la referencie.
- Etiquetar cada regla con estado: OFFICIAL, COMPAT, LEGACY.
- Marcar explicitamente que Source Page, FG y OCR no son fuente primaria para determinar esquemas en el flujo BOM.
- Versionar el contrato con fecha y script de referencia para evitar regresiones narrativas.
