# MILU — Limpieza y consolidación documental

> Fecha de auditoría: 2026-05-12
> Alcance: todos los `.md` del repo (excluyendo `node_modules/`, `dist/`).
> Reglas seguidas: no se modifica código, no se borra nada, no se mueve ningún fichero. Este documento es la propuesta auditada previa a cualquier limpieza.

---

## 1. Inventario completo de documentación

Estados:
- **útil** = refleja el estado actual del código.
- **duplicado** = explica lo mismo que otro doc más reciente.
- **antiguo** = superseded por otra versión más nueva todavía presente.
- **contradictorio** = entra en conflicto con otra doc sobre el mismo tema.
- **pendiente de fusionar** = aporta valor parcial pero debería integrarse en un consolidado.

Destinos consolidados objetivo:
- `README.md` (raíz, fuera del alcance de creación — solo se propone contenido)
- [docs/ARQUITECTURA_MILU.md](ARQUITECTURA_MILU.md)
- [docs/FLUJO_DATOS_MILU.md](FLUJO_DATOS_MILU.md)
- [docs/IMAGENES_ESQUEMAS_MILU.md](IMAGENES_ESQUEMAS_MILU.md)
- [docs/WORDPRESS_EXPORT_MILU.md](WORDPRESS_EXPORT_MILU.md)
- [docs/QA_MILU.md](QA_MILU.md)
- [docs/PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md)

| Archivo | Ubicación | Tema | Fecha/versión | Estado | Destino | Duplica con | Recomendación |
|---|---|---|---|---|---|---|---|
| ÍNDICE_AUDITORÍA.md | raíz | Índice de auditoría 2026-05 | 2026-05-11 | útil | README.md | — | Mantener como referencia histórica; mover a `docs/auditoria/` al limpiar |
| MATRIZ_VISUAL_AUDITORIA.md | raíz | Matriz de riesgos por commit | 2026-05-11 | útil | README.md | — | Mover a `docs/auditoria/` al limpiar |
| docs/README.md | docs | Portal de documentación | 2026-04-20 | útil | README.md | docs/README_MILU_GLOBAL.md | Conservar como índice de `docs/` |
| docs/README_MILU_GLOBAL.md | docs | Overview global | s/d | duplicado | README.md | docs/00_overview.md | Fusionar contenido en README.md raíz / archivar |
| docs/00_overview.md | docs | Project overview técnico | 2026-04-20 | útil | ARQUITECTURA_MILU | — | **Base canónica de arquitectura** |
| docs/01_structure.md | docs | Estructura carpetas y módulos | 2026-04-20 | útil | ARQUITECTURA_MILU | docs/MILU_ESTRUCTURA_CARPETAS.md | Base canónica |
| docs/02_data_flow.md | docs | Flujos de datos runtime | 2026-04-20 | útil | FLUJO_DATOS_MILU | docs/MILU_PIPELINE_COMPLETO.md | **Base canónica de flujo** |
| docs/03_data_models.md | docs | Modelos JSON y state | 2026-04-20 | útil | FLUJO_DATOS_MILU | docs/MILU_MODELO_DATOS_JSON.md | Base canónica |
| docs/04_ai_context.md | docs | Contexto crítico para IA | 2026-04-20 | útil | README.md | AI_QUICK_CONTEXT*.md | Mantener |
| docs/05_qa_errors_checks.md | docs | Checks QA en cliente | 2026-04-20 | útil | QA_MILU | — | **Base canónica de QA** |
| docs/06_future_versions_review_flow_figma.md | docs | Propuesta UX Figma | 2026-04-19 | pendiente de fusionar | PLAN_TRABAJO_MILU | — | Marcar `PENDIENTE DE VALIDAR` / archivar |
| docs/07_analista_02_column_mapping.md | docs | Mapping columnas analista_02 | 2026-04-20 | útil | QA_MILU | — | Mantener como anexo técnico |
| docs/08_pdf_visual_pipeline_prompt.md | docs | Propuesta pipeline visual PDF | 2026-04-22 | pendiente de fusionar | PLAN_TRABAJO_MILU | — | Marcar `PENDIENTE DE VALIDAR` |
| docs/09_auditoria_2026.md | docs | Auditoría técnica consolidada | 2026-05-xx | útil | ARQUITECTURA_MILU | AUDITORIA_TECNICA_MILU_WEB.md, AUDIT_2026_05_04.md, MILU_AUDITORIA_TECNICA.md | **Auditoría canónica** |
| docs/10_plan_remediacion.md | docs | Plan accionable de remediación | 2026-05-xx | útil | PLAN_TRABAJO_MILU | MILU_PLAN_MEJORA.md | **Plan canónico** |
| docs/11_progreso_remediacion.md | docs | Bitácora de progreso | 2026-05-xx | útil | PLAN_TRABAJO_MILU | — | Mantener como log vivo |
| docs/12_ar1_carga_incremental.md | docs | Feature AR-1 carga incremental | 2026-05-xx | útil | ARQUITECTURA_MILU | — | Mantener como spec de feature |
| docs/13_wordpress_export_ai_pipeline.md | docs | Pipeline export con IA (antiguo) | s/d | contradictorio | WORDPRESS_EXPORT_MILU | docs/14_wordpress_export_simplified.md | **OBSOLETO**: archivar |
| docs/14_wordpress_export_simplified.md | docs | Export WordPress QA-only oficial | s/d | útil | WORDPRESS_EXPORT_MILU | docs/13_wordpress_export_ai_pipeline.md | **Base canónica de export** |
| docs/15_qa_imagenes.md | docs | Herramienta QA Imágenes | s/d | útil | IMAGENES_ESQUEMAS_MILU | docs/images/milu_qa_images.md | Mantener (visión general) |
| docs/AI_PROMPT_BASE.md | docs | Prompt base para IA | s/d | útil | README.md | — | Mantener |
| docs/AI_QUICK_CONTEXT.md | docs | Contexto IA detallado | s/d | útil | README.md | AI_QUICK_CONTEXT_COMPACT.md | Mantener (versión larga) |
| docs/AI_QUICK_CONTEXT_COMPACT.md | docs | Contexto IA compacto | s/d | útil | README.md | AI_QUICK_CONTEXT.md | Mantener (versión corta) |
| docs/AUDITORIA_IMAGENES_ESQUEMAS_MILU.md | docs | Auditoría multimedia | 2026-05-10 | útil | IMAGENES_ESQUEMAS_MILU | docs/images/audit_technical.md | **Base canónica imágenes** |
| docs/AUDITORIA_TECNICA_MILU_WEB.md | docs | Auditoría técnica web | 2026-05-06 | duplicado | archivar | docs/09_auditoria_2026.md | Archivar |
| docs/AUDIT_2026_05_04.md | docs | Auditoría 2026-05-04 | 2026-05-04 | antiguo | archivar | docs/09_auditoria_2026.md | Archivar |
| docs/BACKEND.md | docs | Documentación backend | s/d | útil | ARQUITECTURA_MILU | docs/MILU_FRONTEND_BACKEND.md | Mantener como anexo |
| docs/FRONTEND.md | docs | Documentación frontend | s/d | útil | ARQUITECTURA_MILU | docs/MILU_FRONTEND_BACKEND.md | Mantener como anexo |
| docs/MILU_AUDITORIA_TECNICA.md | docs | Auditoría técnica (variante) | 2026-05-xx | duplicado | archivar | docs/09_auditoria_2026.md | Archivar |
| docs/MILU_ESTRUCTURA_CARPETAS.md | docs | Estructura y reorganización | s/d | pendiente de fusionar | ARQUITECTURA_MILU | docs/01_structure.md | Fusionar en 01_structure o archivar |
| docs/MILU_FRONTEND_BACKEND.md | docs | Mapa frontend+backend | s/d | útil | ARQUITECTURA_MILU | BACKEND.md, FRONTEND.md | Mantener como resumen integrador |
| docs/MILU_INVENTARIO_SCRIPTS.md | docs | Inventario de scripts | 2026-05-xx | útil | PLAN_TRABAJO_MILU | — | Mantener como referencia |
| docs/MILU_JSON_FIELD_AUDIT_REPORT.md | docs | Auditoría de campos JSON | 2026-05-05 | útil | archivar | MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md | Archivar tras decisión de schema |
| docs/MILU_JSON_FIELD_AUDIT_REPORT.csv | docs | CSV de auditoría de campos | 2026-05-05 | útil | — | — | Mantener como dato de soporte |
| docs/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md | docs | Propuesta refactor schema | 2026-05-05 | pendiente de fusionar | PLAN_TRABAJO_MILU | — | Marcar `PENDIENTE DE VALIDAR` |
| docs/MILU_LOGICA_ESTADOS_ACCIONES.md | docs | Estados/acciones de revisión | s/d | útil | QA_MILU | — | Mantener como contrato formal |
| docs/MILU_LOGICA_PART_NUMBERS.md | docs | Lógica PN y normalización | s/d | útil | QA_MILU | — | Mantener |
| docs/MILU_MODELO_DATOS_JSON.md | docs | Modelo datos JSON runtime | s/d | duplicado | FLUJO_DATOS_MILU | docs/03_data_models.md | Fusionar / archivar |
| docs/MILU_PIPELINE_COMPLETO.md | docs | Pipeline end-to-end | s/d | duplicado | FLUJO_DATOS_MILU | docs/02_data_flow.md | Fusionar / archivar |
| docs/MILU_PLAN_MEJORA.md | docs | Plan mejora técnica (antiguo) | s/d | antiguo | archivar | docs/10_plan_remediacion.md | Archivar |
| docs/MILU_V2_EQUIVALENCE_REPORT.md | docs | Equivalencia v2 | 2026-05-xx | antiguo | archivar | — | Archivar |
| docs/PLAN_ACCION_QUICK_START.md | docs | Plan rápido (P0) | 2026-05-xx | útil | PLAN_TRABAJO_MILU | docs/10_plan_remediacion.md | Mantener como vista resumida |
| docs/PLAN_ACCION_EJECUCION_DETALLADA.md | docs | Plan detallado | 2026-05-xx | útil | PLAN_TRABAJO_MILU | docs/10_plan_remediacion.md | Mantener como vista detallada |
| docs/images/00-INDEX-COMPLETE.md | docs/images | Índice imágenes | 2026-05-11 | útil | IMAGENES_ESQUEMAS_MILU | — | Mantener |
| docs/images/README.md | docs/images | Portal imágenes | s/d | útil | IMAGENES_ESQUEMAS_MILU | — | Mantener |
| docs/images/audit_technical.md | docs/images | Auditoría técnica imágenes | 2026-05-11 | útil | IMAGENES_ESQUEMAS_MILU | AUDITORIA_IMAGENES_ESQUEMAS_MILU.md | Mantener |
| docs/images/diagrams.md | docs/images | Diagramas | 2026-05-11 | útil | IMAGENES_ESQUEMAS_MILU | — | Mantener |
| docs/images/esquemas_pos.md | docs/images | Esquemas de posición | 2026-05-11 | útil | IMAGENES_ESQUEMAS_MILU | — | Mantener |
| docs/images/future_architecture.md | docs/images | Arquitectura futura imágenes | 2026-05-11 | pendiente de fusionar | PLAN_TRABAJO_MILU | — | Marcar `PENDIENTE DE VALIDAR` |
| docs/images/image_pipeline.md | docs/images | Pipeline generación imágenes | 2026-05-11 | útil | IMAGENES_ESQUEMAS_MILU | — | Mantener |
| docs/images/image_validation.md | docs/images | Validación imágenes | 2026-05-11 | útil | IMAGENES_ESQUEMAS_MILU | — | Mantener |
| docs/images/milu_qa_images.md | docs/images | QA renderizado imágenes | 2026-05-11 | útil | IMAGENES_ESQUEMAS_MILU | docs/15_qa_imagenes.md | Mantener |
| docs/images/performance.md | docs/images | Performance imágenes | 2026-05-11 | útil | IMAGENES_ESQUEMAS_MILU | — | Mantener |
| docs/images/pending_improvements.md | docs/images | Mejoras pendientes imágenes | 2026-05-11 | útil | PLAN_TRABAJO_MILU | — | Mantener |
| docs/images/wordpress_image_export.md | docs/images | Export imágenes WP | 2026-05-11 | útil | WORDPRESS_EXPORT_MILU | — | Mantener |
| docs/modules/*.md (≈22) | docs/modules | Documentación módulo a módulo | s/d | útil | — | — | Mantener como referencia de módulos |
| docs/modules/server.md | docs/modules | Backend (referencia módulo) | s/d | útil | ARQUITECTURA_MILU | BACKEND.md | Mantener |
| extraccion_de_pdf_a_excel/README_MILU_v6_2.md | tool | Herramienta offline PDF→Excel | s/d | útil | — | — | Mantener (utilidad offline) |
| legacy/export_complex_ai/README.md | legacy | Export complejo IA archivado | s/d | obsoleto | archivar | docs/13_wordpress_export_ai_pipeline.md | Ya está en `legacy/`; conservar |
| data/output/wordpress/milu_wp_export_summary.md | data | Resumen export WP | generado | generado | — | — | Artefacto generado; no editar |
| dist/milu_publish/data/output/wordpress/milu_wp_export_summary.md | dist | Resumen export WP empaquetado | generado | generado | — | — | Artefacto en `dist/`; no editar |
| .github/copilot-instructions.md | .github | Instrucciones Copilot | s/d | útil | — | — | Mantener actualizado |

---

## 2. Grupos de duplicados detectados

### Grupo A — Auditoría técnica web (4 docs)
- ✅ **Conservar como base**: [docs/09_auditoria_2026.md](09_auditoria_2026.md)
- 🗄️ Archivar: [docs/AUDITORIA_TECNICA_MILU_WEB.md](AUDITORIA_TECNICA_MILU_WEB.md), [docs/AUDIT_2026_05_04.md](AUDIT_2026_05_04.md), [docs/MILU_AUDITORIA_TECNICA.md](MILU_AUDITORIA_TECNICA.md)

### Grupo B — Overview global / portal
- ✅ Canónico técnico: [docs/00_overview.md](00_overview.md)
- ✅ Canónico portal: [docs/README.md](README.md)
- 🔄 Fusionar / archivar: [docs/README_MILU_GLOBAL.md](README_MILU_GLOBAL.md)

### Grupo C — Modelo de datos
- ✅ Conservar como base: [docs/03_data_models.md](03_data_models.md)
- 🔄 Fusionar / archivar: [docs/MILU_MODELO_DATOS_JSON.md](MILU_MODELO_DATOS_JSON.md)

### Grupo D — Pipeline / flujo de datos
- ✅ Conservar como base: [docs/02_data_flow.md](02_data_flow.md)
- 🔄 Fusionar / archivar: [docs/MILU_PIPELINE_COMPLETO.md](MILU_PIPELINE_COMPLETO.md)

### Grupo E — Estructura de carpetas
- ✅ Conservar como base: [docs/01_structure.md](01_structure.md)
- 🔄 Fusionar / archivar: [docs/MILU_ESTRUCTURA_CARPETAS.md](MILU_ESTRUCTURA_CARPETAS.md)

### Grupo F — Export WordPress
- ✅ Conservar como base: [docs/14_wordpress_export_simplified.md](14_wordpress_export_simplified.md)
- 🗄️ Archivar (decisión QA-only ya tomada): [docs/13_wordpress_export_ai_pipeline.md](13_wordpress_export_ai_pipeline.md)

### Grupo G — Plan de mejora
- ✅ Conservar como base: [docs/10_plan_remediacion.md](10_plan_remediacion.md)
- 🗄️ Archivar: [docs/MILU_PLAN_MEJORA.md](MILU_PLAN_MEJORA.md)
- 🔁 Vistas complementarias (mantener): [PLAN_ACCION_QUICK_START.md](PLAN_ACCION_QUICK_START.md), [PLAN_ACCION_EJECUCION_DETALLADA.md](PLAN_ACCION_EJECUCION_DETALLADA.md), [11_progreso_remediacion.md](11_progreso_remediacion.md)

### Grupo H — Auditoría de imágenes
- ✅ Conservar como base (síntesis): [docs/AUDITORIA_IMAGENES_ESQUEMAS_MILU.md](AUDITORIA_IMAGENES_ESQUEMAS_MILU.md)
- 🔁 Detalle por aspecto (mantener): `docs/images/*.md`

### Grupo I — Contexto IA
- ✅ Mantener los tres (sirven a propósitos distintos):
  - [docs/AI_QUICK_CONTEXT.md](AI_QUICK_CONTEXT.md) (detallado)
  - [docs/AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md) (compacto)
  - [docs/AI_PROMPT_BASE.md](AI_PROMPT_BASE.md) (plantilla de prompt)

---

## 3. Propuesta de estructura documental final

```
README.md (raíz)                            ← punto de entrada único
docs/
├── ARQUITECTURA_MILU.md                    ← consolidado (este PR)
├── FLUJO_DATOS_MILU.md                     ← consolidado (este PR)
├── QA_MILU.md                              ← consolidado (este PR)
├── WORDPRESS_EXPORT_MILU.md                ← consolidado (este PR)
├── IMAGENES_ESQUEMAS_MILU.md               ← consolidado (este PR)
├── PLAN_TRABAJO_MILU.md                    ← consolidado (este PR)
├── MILU_LIMPIEZA_DOCUMENTACION.md          ← este documento
│
├── 00_overview.md                          (canónico, referenciado)
├── 01_structure.md                         (canónico)
├── 02_data_flow.md                         (canónico)
├── 03_data_models.md                       (canónico)
├── 04_ai_context.md                        (canónico)
├── 05_qa_errors_checks.md                  (canónico)
├── 07_analista_02_column_mapping.md        (anexo QA)
├── 09_auditoria_2026.md                    (canónico — auditoría)
├── 10_plan_remediacion.md                  (canónico — plan)
├── 11_progreso_remediacion.md              (bitácora viva)
├── 12_ar1_carga_incremental.md             (spec feature)
├── 14_wordpress_export_simplified.md       (canónico — export)
├── 15_qa_imagenes.md                       (canónico — QA imágenes)
├── AI_PROMPT_BASE.md
├── AI_QUICK_CONTEXT.md
├── AI_QUICK_CONTEXT_COMPACT.md
├── AUDITORIA_IMAGENES_ESQUEMAS_MILU.md     (canónico — auditoría imágenes)
├── BACKEND.md / FRONTEND.md / MILU_FRONTEND_BACKEND.md
├── MILU_LOGICA_ESTADOS_ACCIONES.md
├── MILU_LOGICA_PART_NUMBERS.md
├── MILU_INVENTARIO_SCRIPTS.md
├── PLAN_ACCION_QUICK_START.md / PLAN_ACCION_EJECUCION_DETALLADA.md
├── images/                                 (anexos multimedia detallados)
├── modules/                                (referencia módulo a módulo)
│
└── archived/                               ← (futuro) destinos de archivo
    ├── 06_future_versions_review_flow_figma.md         [PENDIENTE]
    ├── 08_pdf_visual_pipeline_prompt.md                [PENDIENTE]
    ├── 13_wordpress_export_ai_pipeline.md              [OBSOLETO]
    ├── AUDITORIA_TECNICA_MILU_WEB.md                   [DUPLICADO]
    ├── AUDIT_2026_05_04.md                             [ANTIGUO]
    ├── MILU_AUDITORIA_TECNICA.md                       [DUPLICADO]
    ├── MILU_ESTRUCTURA_CARPETAS.md                     [DUPLICADO]
    ├── MILU_MODELO_DATOS_JSON.md                       [DUPLICADO]
    ├── MILU_PIPELINE_COMPLETO.md                       [DUPLICADO]
    ├── MILU_PLAN_MEJORA.md                             [ANTIGUO]
    ├── MILU_V2_EQUIVALENCE_REPORT.md                   [ANTIGUO]
    ├── MILU_JSON_FIELD_AUDIT_REPORT.md (+ .csv)        [REPORTE PUNTUAL]
    ├── MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md           [PENDIENTE]
    └── README_MILU_GLOBAL.md                           [DUPLICADO]
```

`ÍNDICE_AUDITORÍA.md` y `MATRIZ_VISUAL_AUDITORIA.md` se sugieren mover a `docs/auditoria/` (no se hace en esta fase).

---

## 4. Qué hacer con cada documento

### 4.1 Conservar tal cual (canónicos)
- 00_overview, 01_structure, 02_data_flow, 03_data_models, 04_ai_context, 05_qa_errors_checks, 07_analista_02_column_mapping, 09_auditoria_2026, 10_plan_remediacion, 11_progreso_remediacion, 12_ar1_carga_incremental, 14_wordpress_export_simplified, 15_qa_imagenes
- AI_PROMPT_BASE, AI_QUICK_CONTEXT, AI_QUICK_CONTEXT_COMPACT
- AUDITORIA_IMAGENES_ESQUEMAS_MILU
- BACKEND, FRONTEND, MILU_FRONTEND_BACKEND
- MILU_LOGICA_ESTADOS_ACCIONES, MILU_LOGICA_PART_NUMBERS
- MILU_INVENTARIO_SCRIPTS
- PLAN_ACCION_QUICK_START, PLAN_ACCION_EJECUCION_DETALLADA
- docs/images/*, docs/modules/*

### 4.2 Fusionar (cuando se autorice limpieza)
- `README_MILU_GLOBAL.md` → README.md raíz (mantener narrativa funcional).
- `MILU_ESTRUCTURA_CARPETAS.md` → notas de reorganización a un anexo de `01_structure.md`.
- `MILU_MODELO_DATOS_JSON.md` → ejemplos JSON a `03_data_models.md`.
- `MILU_PIPELINE_COMPLETO.md` → diagrama end-to-end a `02_data_flow.md`.

### 4.3 Archivar (proponer mover a `docs/archived/`)
- `13_wordpress_export_ai_pipeline.md` (superseded por 14).
- `AUDITORIA_TECNICA_MILU_WEB.md`, `AUDIT_2026_05_04.md`, `MILU_AUDITORIA_TECNICA.md` (superseded por 09).
- `MILU_PLAN_MEJORA.md` (superseded por 10).
- `MILU_V2_EQUIVALENCE_REPORT.md` (reporte de migración cerrada).
- `MILU_JSON_FIELD_AUDIT_REPORT.md` (+ .csv) tras consumir hallazgos en proposal o auditoría.

### 4.4 Documentos que parecen obsoletos
- `13_wordpress_export_ai_pipeline.md` — la decisión oficial es QA-only.
- `MILU_PLAN_MEJORA.md` — superseded por `10_plan_remediacion.md`.
- `MILU_V2_EQUIVALENCE_REPORT.md` — reporte histórico de la migración v2.
- `06_future_versions_review_flow_figma.md`, `08_pdf_visual_pipeline_prompt.md`, `docs/images/future_architecture.md`, `MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md` — propuestas no implementadas. Marcadas como **PENDIENTE DE VALIDAR**.

---

## 5. Versión consolidada (entregada en este PR)

Los siguientes documentos quedan creados en `docs/` y contienen una primera versión consolidada apoyada en los canónicos detectados:

- [ARQUITECTURA_MILU.md](ARQUITECTURA_MILU.md) — basado en `00_overview`, `01_structure`, `BACKEND`, `FRONTEND`, `12_ar1_carga_incremental`.
- [FLUJO_DATOS_MILU.md](FLUJO_DATOS_MILU.md) — basado en `02_data_flow`, `03_data_models`.
- [QA_MILU.md](QA_MILU.md) — basado en `05_qa_errors_checks`, `07_analista_02_column_mapping`, `MILU_LOGICA_ESTADOS_ACCIONES`, `MILU_LOGICA_PART_NUMBERS`.
- [WORDPRESS_EXPORT_MILU.md](WORDPRESS_EXPORT_MILU.md) — basado en `14_wordpress_export_simplified` y `docs/images/wordpress_image_export.md`.
- [IMAGENES_ESQUEMAS_MILU.md](IMAGENES_ESQUEMAS_MILU.md) — basado en `15_qa_imagenes`, `AUDITORIA_IMAGENES_ESQUEMAS_MILU`, `docs/images/*`.
- [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md) — basado en `10_plan_remediacion`, `11_progreso_remediacion`, `PLAN_ACCION_*`.

Cada consolidado **enlaza al doc canónico** como fuente de verdad y resume sus puntos principales. Donde se han detectado contradicciones, el consolidado refleja la versión vigente y marca la otra como `PENDIENTE DE VALIDAR` con referencia explícita.

---

## 6. Contradicciones detectadas

| # | Tema | Resolución vigente | Doc obsoleto | Estado |
|---|------|-------------------|--------------|--------|
| 1 | Nº de motores (8 vs 9) | **9 motores** (ver `js/data-loader.js` + `engine_files.js`) | Versiones antiguas que decían "8" | ✅ Ya corregido en 00/02/03 |
| 2 | `measurement_final` vs `measure_final` | **`measure_final`** (ver `depuracion_json.py`) | Docs antiguos con `measurement_final` | ✅ Ya corregido |
| 3 | Pipeline export con IA vs QA-only | **QA-only**, sin scoring automático (doc 14) | `13_wordpress_export_ai_pipeline.md` | ⚠️ Doc 13 sigue presente |
| 4 | `descartar` vs `eliminar` (acción) | UI principal usa `eliminar`; `analista_02.js` aún usa `descartar` | — | ⚠️ Inconsistencia de código pendiente (DT-5 del plan) |
| 5 | Separación New/Superseded | **`sust_hierarchie === "Superseded"`** (regla canónica) | Docs antiguos que mezclaban `sust_status` con la decisión | ✅ Aclarado en doc 14 |

---

## 7. Riesgos y dudas antes de borrar nada

1. **Enlaces externos no auditados.** Algunos documentos pueden estar enlazados desde commits, issues o desde el repo de WordPress externo. Antes de borrar/mover, revisar referencias con `grep` sobre `*.md`, `*.html`, `*.js`, `*.py`.
2. **Auditorías como evidencia histórica.** `AUDIT_2026_05_04.md`, `MILU_AUDITORIA_TECNICA.md`, `AUDITORIA_TECNICA_MILU_WEB.md` pueden ser referencia legal/contractual de hallazgos en una fecha concreta. Recomendado **archivar (mover), no eliminar**.
3. **Documentos generados.** `data/output/wordpress/milu_wp_export_summary.md` y `dist/.../milu_wp_export_summary.md` se regeneran automáticamente. No editarlos a mano ni incluirlos en limpieza.
4. **Propuestas no implementadas.** `MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md`, `06_future_versions_review_flow_figma.md`, `08_pdf_visual_pipeline_prompt.md`, `docs/images/future_architecture.md` contienen diseños valiosos sin código asociado. Conservar y marcar `PENDIENTE DE VALIDAR`.
5. **Inconsistencias de código vs doc (DT-5).** `descartar` vs `eliminar` no se resuelve con documentación: requiere decisión y refactor en `analista_02.js`. La documentación reflejará lo que decida el código.
6. **`docs/modules/`**. Es documentación módulo a módulo. Útil como referencia, pero conviene revisar si se mantiene al día con el código. Pendiente: una sub-auditoría de `docs/modules/`.
7. **Raíz del repo.** `ÍNDICE_AUDITORÍA.md` y `MATRIZ_VISUAL_AUDITORIA.md` deberían vivir en `docs/auditoria/` para limpiar la raíz, pero la regla actual prohíbe mover ficheros en esta fase.
8. **README.md raíz**. No existe README.md en la raíz actualmente (sólo `docs/README.md`). La propuesta incluye crearlo, pero esta fase está limitada a `docs/`; se documenta aquí como acción pendiente.

---

## 8. Próximos pasos sugeridos (fuera de esta fase)

1. Revisar y aprobar este documento.
2. Crear `docs/archived/` y mover allí los documentos marcados (con commit dedicado).
3. Crear `README.md` raíz consolidando `docs/README.md` + `docs/README_MILU_GLOBAL.md`.
4. Añadir banner de cabecera `⚠️ ARCHIVADO — superseded por X` a los documentos archivados.
5. Resolver inconsistencia `descartar`/`eliminar` (DT-5 del plan) y actualizar QA_MILU.
6. Auditar `docs/modules/` cuando se aborde la modularización del backend (AR-2 del plan).
