> **ARCHIVADO** — superseded.
>
> Superseded por [../02_data_flow.md](../02_data_flow.md) y el canónico [../FLUJO_DATOS_MILU.md](../FLUJO_DATOS_MILU.md).
>
> Movido a `docs/archived/` el 2026-05-12. Se conserva por trazabilidad. **No usar como fuente de verdad.**

---

# MILU PIPELINE COMPLETO

## 1. Vision general
Pipeline objetivo:
PDF/BOM -> extraccion estructurada -> depuracion y normalizacion -> enriquecimiento GESA/SUST -> engine_*.json -> QA web -> export WordPress.

## 2. Etapas del pipeline

### Fase A. Extraccion PDF/BOM
Entradas:
- PDFs tecnicos por motor.

Herramientas:
- extraccion_de_pdf_a_excel/milu_export_datos_v6_2.py
- extraccion_de_pdf_a_excel/milu_export_esquemas_v6_2.py
- extraccion_de_pdf_a_excel/milu_export_paginas_v1.py

Salidas:
- Excels/CSVs intermedios por PDF.
- Imagenes/esquemas extraidos.

Riesgos:
- OCR y parseo de tablas heterogeneas.
- ruido de cabeceras/pies en filas extraidas.

### Fase B. Reimport y limpieza base
Entradas:
- qa_*.json en json_originales/.

Herramientas:
- importar_json.py (reimport + opcional reset PDF + regeneracion compare PDF)
- depuracion_json.py (proceso principal oficial de consistencia)

Reglas clave en depuracion_json.py:
- measurement_final ya no se persiste; se usa measure_final.
- measure_final prioriza dimensions_gesa; fallback a MEASUREMENT / STANDARD.
- normalizacion de espacios en medidas y texto.
- correccion pn_final truncado por sufijo.
- remocion de ruido en POS/DESIGNATION.
- calculo de flags QA: *_error, total_error, has_error.

Salidas:
- engine_*.json consistentes para runtime.

### Fase C. Enriquecimiento PDF y QA checks
Entradas:
- engine_*.json + pdf/<engine>.pdf.

Herramientas:
- scripts/qa_pdf_compare.js (rellena *_pdf y compara por fila)
- recompute_engine_errors.js (recalcula error flags y opcional revision)

Salidas:
- Campos *_pdf actualizados.
- Error flags recalculados por registro.

### Fase D. QA web operativa
Entradas:
- 9 engine_*.json.

Frontends:
- qa_milu.html (tabla QA principal, panel lateral, export preview).
- analista_02.html (flujo de analista por registro y herramientas PDF).
- qa_analista_registro.html, qa_auditoria.html, qa_lista_agrupada.html.

Backend:
- server.js (persistencia, revision sync, PN review, export, auditoria).

Persistencia:
- /save-json -> edicion puntual en engine_*.json.
- /apply-revision-to-engines -> aplicacion masiva.
- /qa_revision_sync.php -> qa_revision_server_data.json.

### Fase E. Export WordPress (oficial actual)
Herramienta principal:
- scripts/export_wordpress_milu.js

Regla de decision QA por PN (implementacion actual):
- si hay filas OK+Importar: decision import.
- si no hay import y hay pendiente/revisar: pending_review.
- si no hay import ni pending y hay OK+Eliminar: discard.

Salidas:
- data/05-wordpress/milu_wp_import.*
- data/05-wordpress/milu_wp_superseded.*
- data/05-wordpress/milu_wp_pending_review.*
- data/05-wordpress/milu_wp_discarded.*
- data/05-wordpress/milu_wp_trace.json

## 3. Pipeline runtime web
1. Frontend carga engines por js/data-loader.js.
2. Normaliza revision y asigna claves estables.
3. Filtra/ordena/renderiza tabla (js/qa-table.js).
4. Guarda cambios via /save-json.
5. Refresca paneles PDF/esquemas y stats.

## 4. Pipeline de publicacion de paginas
- scripts/prepare-pages-dist.js
- scripts/publish-pages.ps1
- scripts/publish-safe.ps1

Objetivo: construir dist/milu_publish sin tocar flujo de datos productivo.

## 5. Dependencias de entorno
Node:
- express, body-parser, cors, pdfjs-dist.

Python:
- pandas (utilidades xlsx/json), pdfplumber/PyMuPDF/tqdm en extraccion PDF.

## 6. Cuellos de botella detectados
- Carga masiva de 9 engines en cliente (memoria y render inicial).
- Busquedas repetidas por PN sin indice persistente global fuera de runtime.
- server.js mezcla rutas de lectura/escritura/export con mucha logica inline.

## 7. Recomendacion de orden de ejecucion operativo
1. Reimport/depuracion (importar_json.py + depuracion_json.py).
2. Regeneracion compare PDF (scripts/qa_pdf_compare.js con write cuando aplique).
3. QA en web (qa_milu/analista_02).
4. Export WordPress (scripts/export_wordpress_milu.js o endpoint /export/run-wordpress).

