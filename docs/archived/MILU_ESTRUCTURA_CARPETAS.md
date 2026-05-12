> **ARCHIVADO** — superseded.
>
> Superseded por [../01_structure.md](../01_structure.md) y el canónico [../ARQUITECTURA_MILU.md](../ARQUITECTURA_MILU.md).
>
> Movido a `docs/archived/` el 2026-05-12. Se conserva por trazabilidad. **No usar como fuente de verdad.**

---

# MILU ESTRUCTURA CARPETAS

## 1. Estructura actual (resumen)

### Core runtime
- /server.js
- /qa_milu.html
- /analista_02.html
- /js/
- /styles/
- /pdf/
- /engine_*.json
- /engine_files.js

### Datos y salidas
- /data/output/ (wordpress, export_review, ai_review, v2)
- /qa_revision_server_data.json
- /qa_audit_log.json

### Utilidades y pipeline
- /scripts/
- /extraccion_de_pdf_a_excel/
- /depuracion_json.py
- /importar_json.py
- /add_final_fields.py

### Legacy/historico/copias
- /legacy/
- /zz_old/
- /zz_copias/
- /json_originales/

### Salidas pesadas o no fuente
- /dist/
- /esquemas/
- /esquemas_pos_circulos/
- /fotos_articulos/
- /fotos_motores/

## 2. Hallazgos de organizacion
- Hay mezcla de runtime, utilidades y historico en raiz.
- Existen scripts duplicados o legacy en paralelo al flujo oficial.
- Hay docs antiguas y docs nuevas coexistiendo sin indice unico.
- Dist/publicacion comparte arbol con codigo fuente (normal, pero sin guardrails fuertes).

## 3. Carpetas confusas o potencialmente duplicadas
- legacy/export_complex_ai/ vs scripts/export_wordpress_milu.js (pipeline actual).
- js/pn_review.js vs js/pn-review.js (naming y flujo antiguo/nuevo).
- add_final_fields.py vs depuracion_json.py (solapamiento funcional historico).
- multiples html antiguas en zz_old/ con riesgo de confusion para nuevos integrantes.

## 4. Propuesta de estructura profesional recomendada

Propuesta objetivo:
- /apps/web/
: html + js + styles activos.
- /apps/server/
: server.js dividido por dominios.
- /data/runtime/
: engine_*.json y archivos de persistencia vivos.
- /data/output/
: export y artefactos generados.
- /tools/pipeline/
: scripts de transformacion (python/node).
- /tools/extraction/
: extraccion_de_pdf_a_excel.
- /tools/dev/
: utilidades de auditoria y soporte.
- /legacy/
: codigo historico congelado.
- /docs/
: documentacion actual viva (con indice maestro).

## 5. Migracion sugerida (sin romper)
Fase 1 (segura, sin cambios funcionales):
- Documentar y etiquetar claramente carpetas activas vs historicas.
- Definir README por carpeta critica.
- Anadir convencion naming para scripts y html.

Fase 2:
- Mover legacy no usado a /legacy con referencias.
- Crear /tools/pipeline y mover scripts root no runtime.

Fase 3:
- Separar /apps/web y /apps/server manteniendo rutas compatibles con wrappers.

## 6. Que no mover todavia
- engine_*.json (base runtime actual).
- qa_revision_server_data.json.
- qa_audit_log.json.
- rutas esperadas por server.js y html activos.
- carpetas de imagenes/esquemas consumidas por UI actual.

## 7. Mapa rapido activo vs historico
Activo:
- js/, styles/, qa_milu.html, analista_02.html, server.js, scripts/export_wordpress_milu.js.

Historico o revisar:
- legacy/export_complex_ai/*
- zz_old/*
- zz_copias/*
- js/pn_review.js
- app.js y analysis.js (utilidades no runtime principal)
