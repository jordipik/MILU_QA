# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# MILU â€” Limpieza y consolidaciÃ³n documental

> Fecha de auditorÃ­a: 2026-05-12
> Alcance: todos los `.md` del repo (excluyendo `node_modules/`, `dist/`).
> Reglas seguidas: no se modifica cÃ³digo, no se borra nada, no se mueve ningÃºn fichero. Este documento es la propuesta auditada previa a cualquier limpieza.

---

## 1. Inventario completo de documentaciÃ³n

Estados:
- **Ãºtil** = refleja el estado actual del cÃ³digo.
- **duplicado** = explica lo mismo que otro doc mÃ¡s reciente.
- **antiguo** = superseded por otra versiÃ³n mÃ¡s nueva todavÃ­a presente.
- **contradictorio** = entra en conflicto con otra doc sobre el mismo tema.
- **pendiente de fusionar** = aporta valor parcial pero deberÃ­a integrarse en un consolidado.

Destinos consolidados objetivo:
- `README.md` (raÃ­z, fuera del alcance de creaciÃ³n â€” solo se propone contenido)
- [docs/ARQUITECTURA_MILU.md](ARQUITECTURA_MILU.md)
- [docs/FLUJO_DATOS_MILU.md](FLUJO_DATOS_MILU.md)
- [docs/IMAGENES_ESQUEMAS_MILU.md](IMAGENES_ESQUEMAS_MILU.md)
- [docs/WORDPRESS_EXPORT_MILU.md](WORDPRESS_EXPORT_MILU.md)
- [docs/QA_MILU.md](QA_MILU.md)
- [docs/PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md)

| Archivo | UbicaciÃ³n | Tema | Fecha/versiÃ³n | Estado | Destino | Duplica con | RecomendaciÃ³n |
|---|---|---|---|---|---|---|---|
| ÃNDICE_AUDITORÃA.md | raÃ­z | Ãndice de auditorÃ­a 2026-05 | 2026-05-11 | Ãºtil | README.md | â€” | Mantener como referencia histÃ³rica; mover a `docs/auditoria/` al limpiar |
| MATRIZ_VISUAL_AUDITORIA.md | raÃ­z | Matriz de riesgos por commit | 2026-05-11 | Ãºtil | README.md | â€” | Mover a `docs/auditoria/` al limpiar |
| docs/README.md | docs | Portal de documentaciÃ³n | 2026-04-20 | Ãºtil | README.md | docs/README_MILU_GLOBAL.md | Conservar como Ã­ndice de `docs/` |
| docs/README_MILU_GLOBAL.md | docs | Overview global | s/d | duplicado | README.md | docs/00_overview.md | Fusionar contenido en README.md raÃ­z / archivar |
| docs/00_overview.md | docs | Project overview tÃ©cnico | 2026-04-20 | Ãºtil | ARQUITECTURA_MILU | â€” | **Base canÃ³nica de arquitectura** |
| docs/01_structure.md | docs | Estructura carpetas y mÃ³dulos | 2026-04-20 | Ãºtil | ARQUITECTURA_MILU | docs/MILU_ESTRUCTURA_CARPETAS.md | Base canÃ³nica |
| docs/02_data_flow.md | docs | Flujos de datos runtime | 2026-04-20 | Ãºtil | FLUJO_DATOS_MILU | docs/MILU_PIPELINE_COMPLETO.md | **Base canÃ³nica de flujo** |
| docs/03_data_models.md | docs | Modelos JSON y state | 2026-04-20 | Ãºtil | FLUJO_DATOS_MILU | docs/MILU_MODELO_DATOS_JSON.md | Base canÃ³nica |
| docs/04_ai_context.md | docs | Contexto crÃ­tico para IA | 2026-04-20 | Ãºtil | README.md | AI_QUICK_CONTEXT*.md | Mantener |
| docs/05_qa_errors_checks.md | docs | Checks QA en cliente | 2026-04-20 | Ãºtil | QA_MILU | â€” | **Base canÃ³nica de QA** |
| docs/06_future_versions_review_flow_figma.md | docs | Propuesta UX Figma | 2026-04-19 | pendiente de fusionar | PLAN_TRABAJO_MILU | â€” | Marcar `PENDIENTE DE VALIDAR` / archivar |
| docs/07_analista_02_column_mapping.md | docs | Mapping columnas analista_02 | 2026-04-20 | Ãºtil | QA_MILU | â€” | Mantener como anexo tÃ©cnico |
| docs/08_pdf_visual_pipeline_prompt.md | docs | Propuesta pipeline visual PDF | 2026-04-22 | pendiente de fusionar | PLAN_TRABAJO_MILU | â€” | Marcar `PENDIENTE DE VALIDAR` |
| docs/09_auditoria_2026.md | docs | AuditorÃ­a tÃ©cnica consolidada | 2026-05-xx | Ãºtil | ARQUITECTURA_MILU | AUDITORIA_TECNICA_MILU_WEB.md, AUDIT_2026_05_04.md, MILU_AUDITORIA_TECNICA.md | **AuditorÃ­a canÃ³nica** |
| docs/10_plan_remediacion.md | docs | Plan accionable de remediaciÃ³n | 2026-05-xx | Ãºtil | PLAN_TRABAJO_MILU | MILU_PLAN_MEJORA.md | **Plan canÃ³nico** |
| docs/11_progreso_remediacion.md | docs | BitÃ¡cora de progreso | 2026-05-xx | Ãºtil | PLAN_TRABAJO_MILU | â€” | Mantener como log vivo |
| docs/12_ar1_carga_incremental.md | docs | Feature AR-1 carga incremental | 2026-05-xx | Ãºtil | ARQUITECTURA_MILU | â€” | Mantener como spec de feature |
| docs/13_wordpress_export_ai_pipeline.md | docs | Pipeline export con IA (antiguo) | s/d | contradictorio | WORDPRESS_EXPORT_MILU | docs/14_wordpress_export_simplified.md | **OBSOLETO**: archivar |
| docs/14_wordpress_export_simplified.md | docs | Export WordPress QA-only oficial | s/d | Ãºtil | WORDPRESS_EXPORT_MILU | docs/13_wordpress_export_ai_pipeline.md | **Base canÃ³nica de export** |
| docs/15_qa_imagenes.md | docs | Herramienta QA ImÃ¡genes | s/d | Ãºtil | IMAGENES_ESQUEMAS_MILU | docs/images/milu_qa_images.md | Mantener (visiÃ³n general) |
| docs/AI_PROMPT_BASE.md | docs | Prompt base para IA | s/d | Ãºtil | README.md | â€” | Mantener |
| docs/AI_QUICK_CONTEXT.md | docs | Contexto IA detallado | s/d | Ãºtil | README.md | AI_QUICK_CONTEXT_COMPACT.md | Mantener (versiÃ³n larga) |
| docs/AI_QUICK_CONTEXT_COMPACT.md | docs | Contexto IA compacto | s/d | Ãºtil | README.md | AI_QUICK_CONTEXT.md | Mantener (versiÃ³n corta) |
| docs/AUDITORIA_IMAGENES_ESQUEMAS_MILU.md | docs | AuditorÃ­a multimedia | 2026-05-10 | Ãºtil | IMAGENES_ESQUEMAS_MILU | docs/images/audit_technical.md | **Base canÃ³nica imÃ¡genes** |
| docs/AUDITORIA_TECNICA_MILU_WEB.md | docs | AuditorÃ­a tÃ©cnica web | 2026-05-06 | duplicado | archivar | docs/09_auditoria_2026.md | Archivar |
| docs/AUDIT_2026_05_04.md | docs | AuditorÃ­a 2026-05-04 | 2026-05-04 | antiguo | archivar | docs/09_auditoria_2026.md | Archivar |
| docs/BACKEND.md | docs | DocumentaciÃ³n backend | s/d | Ãºtil | ARQUITECTURA_MILU | docs/MILU_FRONTEND_BACKEND.md | Mantener como anexo |
| docs/FRONTEND.md | docs | DocumentaciÃ³n frontend | s/d | Ãºtil | ARQUITECTURA_MILU | docs/MILU_FRONTEND_BACKEND.md | Mantener como anexo |
| docs/MILU_AUDITORIA_TECNICA.md | docs | AuditorÃ­a tÃ©cnica (variante) | 2026-05-xx | duplicado | archivar | docs/09_auditoria_2026.md | Archivar |
| docs/MILU_ESTRUCTURA_CARPETAS.md | docs | Estructura y reorganizaciÃ³n | s/d | pendiente de fusionar | ARQUITECTURA_MILU | docs/01_structure.md | Fusionar en 01_structure o archivar |
| docs/MILU_FRONTEND_BACKEND.md | docs | Mapa frontend+backend | s/d | Ãºtil | ARQUITECTURA_MILU | BACKEND.md, FRONTEND.md | Mantener como resumen integrador |
| docs/MILU_INVENTARIO_SCRIPTS.md | docs | Inventario de scripts | 2026-05-xx | Ãºtil | PLAN_TRABAJO_MILU | â€” | Mantener como referencia |
| docs/MILU_JSON_FIELD_AUDIT_REPORT.md | docs | AuditorÃ­a de campos JSON | 2026-05-05 | Ãºtil | archivar | MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md | Archivar tras decisiÃ³n de schema |
| docs/MILU_JSON_FIELD_AUDIT_REPORT.csv | docs | CSV de auditorÃ­a de campos | 2026-05-05 | Ãºtil | â€” | â€” | Mantener como dato de soporte |
| docs/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md | docs | Propuesta refactor schema | 2026-05-05 | pendiente de fusionar | PLAN_TRABAJO_MILU | â€” | Marcar `PENDIENTE DE VALIDAR` |
| docs/MILU_LOGICA_ESTADOS_ACCIONES.md | docs | Estados/acciones de revisiÃ³n | s/d | Ãºtil | QA_MILU | â€” | Mantener como contrato formal |
| docs/MILU_LOGICA_PART_NUMBERS.md | docs | LÃ³gica PN y normalizaciÃ³n | s/d | Ãºtil | QA_MILU | â€” | Mantener |
| docs/MILU_MODELO_DATOS_JSON.md | docs | Modelo datos JSON runtime | s/d | duplicado | FLUJO_DATOS_MILU | docs/03_data_models.md | Fusionar / archivar |
| docs/MILU_PIPELINE_COMPLETO.md | docs | Pipeline end-to-end | s/d | duplicado | FLUJO_DATOS_MILU | docs/02_data_flow.md | Fusionar / archivar |
| docs/MILU_PLAN_MEJORA.md | docs | Plan mejora tÃ©cnica (antiguo) | s/d | antiguo | archivar | docs/10_plan_remediacion.md | Archivar |
| docs/MILU_V2_EQUIVALENCE_REPORT.md | docs | Equivalencia v2 | 2026-05-xx | antiguo | archivar | â€” | Archivar |
| docs/PLAN_ACCION_QUICK_START.md | docs | Plan rÃ¡pido (P0) | 2026-05-xx | Ãºtil | PLAN_TRABAJO_MILU | docs/10_plan_remediacion.md | Mantener como vista resumida |
| docs/PLAN_ACCION_EJECUCION_DETALLADA.md | docs | Plan detallado | 2026-05-xx | Ãºtil | PLAN_TRABAJO_MILU | docs/10_plan_remediacion.md | Mantener como vista detallada |
| docs/images/00-INDEX-COMPLETE.md | docs/images | Ãndice imÃ¡genes | 2026-05-11 | Ãºtil | IMAGENES_ESQUEMAS_MILU | â€” | Mantener |
| docs/images/README.md | docs/images | Portal imÃ¡genes | s/d | Ãºtil | IMAGENES_ESQUEMAS_MILU | â€” | Mantener |
| docs/images/audit_technical.md | docs/images | AuditorÃ­a tÃ©cnica imÃ¡genes | 2026-05-11 | Ãºtil | IMAGENES_ESQUEMAS_MILU | AUDITORIA_IMAGENES_ESQUEMAS_MILU.md | Mantener |
| docs/images/diagrams.md | docs/images | Diagramas | 2026-05-11 | Ãºtil | IMAGENES_ESQUEMAS_MILU | â€” | Mantener |
| docs/images/esquemas_pos.md | docs/images | Esquemas de posiciÃ³n | 2026-05-11 | Ãºtil | IMAGENES_ESQUEMAS_MILU | â€” | Mantener |
| docs/images/future_architecture.md | docs/images | Arquitectura futura imÃ¡genes | 2026-05-11 | pendiente de fusionar | PLAN_TRABAJO_MILU | â€” | Marcar `PENDIENTE DE VALIDAR` |
| docs/images/image_pipeline.md | docs/images | Pipeline generaciÃ³n imÃ¡genes | 2026-05-11 | Ãºtil | IMAGENES_ESQUEMAS_MILU | â€” | Mantener |
| docs/images/image_validation.md | docs/images | ValidaciÃ³n imÃ¡genes | 2026-05-11 | Ãºtil | IMAGENES_ESQUEMAS_MILU | â€” | Mantener |
| docs/images/milu_qa_images.md | docs/images | QA renderizado imÃ¡genes | 2026-05-11 | Ãºtil | IMAGENES_ESQUEMAS_MILU | docs/15_qa_imagenes.md | Mantener |
| docs/images/performance.md | docs/images | Performance imÃ¡genes | 2026-05-11 | Ãºtil | IMAGENES_ESQUEMAS_MILU | â€” | Mantener |
| docs/images/pending_improvements.md | docs/images | Mejoras pendientes imÃ¡genes | 2026-05-11 | Ãºtil | PLAN_TRABAJO_MILU | â€” | Mantener |
| docs/images/wordpress_image_export.md | docs/images | Export imÃ¡genes WP | 2026-05-11 | Ãºtil | WORDPRESS_EXPORT_MILU | â€” | Mantener |
| docs/modules/*.md (â‰ˆ22) | docs/modules | DocumentaciÃ³n mÃ³dulo a mÃ³dulo | s/d | Ãºtil | â€” | â€” | Mantener como referencia de mÃ³dulos |
| docs/modules/server.md | docs/modules | Backend (referencia mÃ³dulo) | s/d | Ãºtil | ARQUITECTURA_MILU | BACKEND.md | Mantener |
| extraccion_de_pdf_a_excel/README_MILU_v6_2.md | tool | Herramienta offline PDFâ†’Excel | s/d | Ãºtil | â€” | â€” | Mantener (utilidad offline) |
| legacy/export_complex_ai/README.md | legacy | Export complejo IA archivado | s/d | obsoleto | archivar | docs/13_wordpress_export_ai_pipeline.md | Ya estÃ¡ en `legacy/`; conservar |
| data/output/wordpress/milu_wp_export_summary.md | data | Resumen export WP | generado | generado | â€” | â€” | Artefacto generado; no editar |
| dist/milu_publish/data/output/wordpress/milu_wp_export_summary.md | dist | Resumen export WP empaquetado | generado | generado | â€” | â€” | Artefacto en `dist/`; no editar |
| .github/copilot-instructions.md | .github | Instrucciones Copilot | s/d | Ãºtil | â€” | â€” | Mantener actualizado |

---

## 2. Grupos de duplicados detectados

### Grupo A â€” AuditorÃ­a tÃ©cnica web (4 docs)
- âœ… **Conservar como base**: [docs/09_auditoria_2026.md](09_auditoria_2026.md)
- ðŸ—„ï¸ Archivar: [docs/AUDITORIA_TECNICA_MILU_WEB.md](AUDITORIA_TECNICA_MILU_WEB.md), [docs/AUDIT_2026_05_04.md](AUDIT_2026_05_04.md), [docs/MILU_AUDITORIA_TECNICA.md](MILU_AUDITORIA_TECNICA.md)

### Grupo B â€” Overview global / portal
- âœ… CanÃ³nico tÃ©cnico: [docs/00_overview.md](00_overview.md)
- âœ… CanÃ³nico portal: [docs/README.md](README.md)
- ðŸ”„ Fusionar / archivar: [docs/README_MILU_GLOBAL.md](README_MILU_GLOBAL.md)

### Grupo C â€” Modelo de datos
- âœ… Conservar como base: [docs/03_data_models.md](03_data_models.md)
- ðŸ”„ Fusionar / archivar: [docs/MILU_MODELO_DATOS_JSON.md](MILU_MODELO_DATOS_JSON.md)

### Grupo D â€” Pipeline / flujo de datos
- âœ… Conservar como base: [docs/02_data_flow.md](02_data_flow.md)
- ðŸ”„ Fusionar / archivar: [docs/MILU_PIPELINE_COMPLETO.md](MILU_PIPELINE_COMPLETO.md)

### Grupo E â€” Estructura de carpetas
- âœ… Conservar como base: [docs/01_structure.md](01_structure.md)
- ðŸ”„ Fusionar / archivar: [docs/MILU_ESTRUCTURA_CARPETAS.md](MILU_ESTRUCTURA_CARPETAS.md)

### Grupo F â€” Export WordPress
- âœ… Conservar como base: [docs/14_wordpress_export_simplified.md](14_wordpress_export_simplified.md)
- ðŸ—„ï¸ Archivar (decisiÃ³n QA-only ya tomada): [docs/13_wordpress_export_ai_pipeline.md](13_wordpress_export_ai_pipeline.md)

### Grupo G â€” Plan de mejora
- âœ… Conservar como base: [docs/10_plan_remediacion.md](10_plan_remediacion.md)
- ðŸ—„ï¸ Archivar: [docs/MILU_PLAN_MEJORA.md](MILU_PLAN_MEJORA.md)
- ðŸ” Vistas complementarias (mantener): [PLAN_ACCION_QUICK_START.md](PLAN_ACCION_QUICK_START.md), [PLAN_ACCION_EJECUCION_DETALLADA.md](PLAN_ACCION_EJECUCION_DETALLADA.md), [11_progreso_remediacion.md](11_progreso_remediacion.md)

### Grupo H â€” AuditorÃ­a de imÃ¡genes
- âœ… Conservar como base (sÃ­ntesis): [docs/AUDITORIA_IMAGENES_ESQUEMAS_MILU.md](AUDITORIA_IMAGENES_ESQUEMAS_MILU.md)
- ðŸ” Detalle por aspecto (mantener): `docs/images/*.md`

### Grupo I â€” Contexto IA
- âœ… Mantener los tres (sirven a propÃ³sitos distintos):
  - [docs/AI_QUICK_CONTEXT.md](AI_QUICK_CONTEXT.md) (detallado)
  - [docs/AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md) (compacto)
  - [docs/AI_PROMPT_BASE.md](AI_PROMPT_BASE.md) (plantilla de prompt)

---

## 3. Propuesta de estructura documental final

```
README.md (raÃ­z)                            â† punto de entrada Ãºnico
docs/
â”œâ”€â”€ ARQUITECTURA_MILU.md                    â† consolidado (este PR)
â”œâ”€â”€ FLUJO_DATOS_MILU.md                     â† consolidado (este PR)
â”œâ”€â”€ QA_MILU.md                              â† consolidado (este PR)
â”œâ”€â”€ WORDPRESS_EXPORT_MILU.md                â† consolidado (este PR)
â”œâ”€â”€ IMAGENES_ESQUEMAS_MILU.md               â† consolidado (este PR)
â”œâ”€â”€ PLAN_TRABAJO_MILU.md                    â† consolidado (este PR)
â”œâ”€â”€ MILU_LIMPIEZA_DOCUMENTACION.md          â† este documento
â”‚
â”œâ”€â”€ 00_overview.md                          (canÃ³nico, referenciado)
â”œâ”€â”€ 01_structure.md                         (canÃ³nico)
â”œâ”€â”€ 02_data_flow.md                         (canÃ³nico)
â”œâ”€â”€ 03_data_models.md                       (canÃ³nico)
â”œâ”€â”€ 04_ai_context.md                        (canÃ³nico)
â”œâ”€â”€ 05_qa_errors_checks.md                  (canÃ³nico)
â”œâ”€â”€ 07_analista_02_column_mapping.md        (anexo QA)
â”œâ”€â”€ 09_auditoria_2026.md                    (canÃ³nico â€” auditorÃ­a)
â”œâ”€â”€ 10_plan_remediacion.md                  (canÃ³nico â€” plan)
â”œâ”€â”€ 11_progreso_remediacion.md              (bitÃ¡cora viva)
â”œâ”€â”€ 12_ar1_carga_incremental.md             (spec feature)
â”œâ”€â”€ 14_wordpress_export_simplified.md       (canÃ³nico â€” export)
â”œâ”€â”€ 15_qa_imagenes.md                       (canÃ³nico â€” QA imÃ¡genes)
â”œâ”€â”€ AI_PROMPT_BASE.md
â”œâ”€â”€ AI_QUICK_CONTEXT.md
â”œâ”€â”€ AI_QUICK_CONTEXT_COMPACT.md
â”œâ”€â”€ AUDITORIA_IMAGENES_ESQUEMAS_MILU.md     (canÃ³nico â€” auditorÃ­a imÃ¡genes)
â”œâ”€â”€ BACKEND.md / FRONTEND.md / MILU_FRONTEND_BACKEND.md
â”œâ”€â”€ MILU_LOGICA_ESTADOS_ACCIONES.md
â”œâ”€â”€ MILU_LOGICA_PART_NUMBERS.md
â”œâ”€â”€ MILU_INVENTARIO_SCRIPTS.md
â”œâ”€â”€ PLAN_ACCION_QUICK_START.md / PLAN_ACCION_EJECUCION_DETALLADA.md
â”œâ”€â”€ images/                                 (anexos multimedia detallados)
â”œâ”€â”€ modules/                                (referencia mÃ³dulo a mÃ³dulo)
â”‚
â””â”€â”€ archived/                               â† (futuro) destinos de archivo
    â”œâ”€â”€ 06_future_versions_review_flow_figma.md         [PENDIENTE]
    â”œâ”€â”€ 08_pdf_visual_pipeline_prompt.md                [PENDIENTE]
    â”œâ”€â”€ 13_wordpress_export_ai_pipeline.md              [OBSOLETO]
    â”œâ”€â”€ AUDITORIA_TECNICA_MILU_WEB.md                   [DUPLICADO]
    â”œâ”€â”€ AUDIT_2026_05_04.md                             [ANTIGUO]
    â”œâ”€â”€ MILU_AUDITORIA_TECNICA.md                       [DUPLICADO]
    â”œâ”€â”€ MILU_ESTRUCTURA_CARPETAS.md                     [DUPLICADO]
    â”œâ”€â”€ MILU_MODELO_DATOS_JSON.md                       [DUPLICADO]
    â”œâ”€â”€ MILU_PIPELINE_COMPLETO.md                       [DUPLICADO]
    â”œâ”€â”€ MILU_PLAN_MEJORA.md                             [ANTIGUO]
    â”œâ”€â”€ MILU_V2_EQUIVALENCE_REPORT.md                   [ANTIGUO]
    â”œâ”€â”€ MILU_JSON_FIELD_AUDIT_REPORT.md (+ .csv)        [REPORTE PUNTUAL]
    â”œâ”€â”€ MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md           [PENDIENTE]
    â””â”€â”€ README_MILU_GLOBAL.md                           [DUPLICADO]
```

`ÃNDICE_AUDITORÃA.md` y `MATRIZ_VISUAL_AUDITORIA.md` se sugieren mover a `docs/auditoria/` (no se hace en esta fase).

---

## 4. QuÃ© hacer con cada documento

### 4.1 Conservar tal cual (canÃ³nicos)
- 00_overview, 01_structure, 02_data_flow, 03_data_models, 04_ai_context, 05_qa_errors_checks, 07_analista_02_column_mapping, 09_auditoria_2026, 10_plan_remediacion, 11_progreso_remediacion, 12_ar1_carga_incremental, 14_wordpress_export_simplified, 15_qa_imagenes
- AI_PROMPT_BASE, AI_QUICK_CONTEXT, AI_QUICK_CONTEXT_COMPACT
- AUDITORIA_IMAGENES_ESQUEMAS_MILU
- BACKEND, FRONTEND, MILU_FRONTEND_BACKEND
- MILU_LOGICA_ESTADOS_ACCIONES, MILU_LOGICA_PART_NUMBERS
- MILU_INVENTARIO_SCRIPTS
- PLAN_ACCION_QUICK_START, PLAN_ACCION_EJECUCION_DETALLADA
- docs/images/*, docs/modules/*

### 4.2 Fusionar (cuando se autorice limpieza)
- `README_MILU_GLOBAL.md` â†’ README.md raÃ­z (mantener narrativa funcional).
- `MILU_ESTRUCTURA_CARPETAS.md` â†’ notas de reorganizaciÃ³n a un anexo de `01_structure.md`.
- `MILU_MODELO_DATOS_JSON.md` â†’ ejemplos JSON a `03_data_models.md`.
- `MILU_PIPELINE_COMPLETO.md` â†’ diagrama end-to-end a `02_data_flow.md`.

### 4.3 Archivar (proponer mover a `docs/archived/`)
- `13_wordpress_export_ai_pipeline.md` (superseded por 14).
- `AUDITORIA_TECNICA_MILU_WEB.md`, `AUDIT_2026_05_04.md`, `MILU_AUDITORIA_TECNICA.md` (superseded por 09).
- `MILU_PLAN_MEJORA.md` (superseded por 10).
- `MILU_V2_EQUIVALENCE_REPORT.md` (reporte de migraciÃ³n cerrada).
- `MILU_JSON_FIELD_AUDIT_REPORT.md` (+ .csv) tras consumir hallazgos en proposal o auditorÃ­a.

### 4.4 Documentos que parecen obsoletos
- `13_wordpress_export_ai_pipeline.md` â€” la decisiÃ³n oficial es QA-only.
- `MILU_PLAN_MEJORA.md` â€” superseded por `10_plan_remediacion.md`.
- `MILU_V2_EQUIVALENCE_REPORT.md` â€” reporte histÃ³rico de la migraciÃ³n v2.
- `06_future_versions_review_flow_figma.md`, `08_pdf_visual_pipeline_prompt.md`, `docs/images/future_architecture.md`, `MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md` â€” propuestas no implementadas. Marcadas como **PENDIENTE DE VALIDAR**.

---

## 5. VersiÃ³n consolidada (entregada en este PR)

Los siguientes documentos quedan creados en `docs/` y contienen una primera versiÃ³n consolidada apoyada en los canÃ³nicos detectados:

- [ARQUITECTURA_MILU.md](ARQUITECTURA_MILU.md) â€” basado en `00_overview`, `01_structure`, `BACKEND`, `FRONTEND`, `12_ar1_carga_incremental`.
- [FLUJO_DATOS_MILU.md](FLUJO_DATOS_MILU.md) â€” basado en `02_data_flow`, `03_data_models`.
- [QA_MILU.md](QA_MILU.md) â€” basado en `05_qa_errors_checks`, `07_analista_02_column_mapping`, `MILU_LOGICA_ESTADOS_ACCIONES`, `MILU_LOGICA_PART_NUMBERS`.
- [WORDPRESS_EXPORT_MILU.md](WORDPRESS_EXPORT_MILU.md) â€” basado en `14_wordpress_export_simplified` y `docs/images/wordpress_image_export.md`.
- [IMAGENES_ESQUEMAS_MILU.md](IMAGENES_ESQUEMAS_MILU.md) â€” basado en `15_qa_imagenes`, `AUDITORIA_IMAGENES_ESQUEMAS_MILU`, `docs/images/*`.
- [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md) â€” basado en `10_plan_remediacion`, `11_progreso_remediacion`, `PLAN_ACCION_*`.

Cada consolidado **enlaza al doc canÃ³nico** como fuente de verdad y resume sus puntos principales. Donde se han detectado contradicciones, el consolidado refleja la versiÃ³n vigente y marca la otra como `PENDIENTE DE VALIDAR` con referencia explÃ­cita.

---

## 6. Contradicciones detectadas

| # | Tema | ResoluciÃ³n vigente | Doc obsoleto | Estado |
|---|------|-------------------|--------------|--------|
| 1 | NÂº de motores (8 vs 9) | **9 motores** (ver `js/data-loader.js` + `engine_files.js`) | Versiones antiguas que decÃ­an "8" | âœ… Ya corregido en 00/02/03 |
| 2 | `measurement_final` vs `measure_final` | **`measure_final`** (ver `depuracion_json.py`) | Docs antiguos con `measurement_final` | âœ… Ya corregido |
| 3 | Pipeline export con IA vs QA-only | **QA-only**, sin scoring automÃ¡tico (doc 14) | `13_wordpress_export_ai_pipeline.md` | âš ï¸ Doc 13 sigue presente |
| 4 | `descartar` vs `eliminar` (acciÃ³n) | UI principal usa `eliminar`; `analista_02.js` aÃºn usa `descartar` | â€” | âš ï¸ Inconsistencia de cÃ³digo pendiente (DT-5 del plan) |
| 5 | SeparaciÃ³n New/Superseded | **`sust_hierarchie === "Superseded"`** (regla canÃ³nica) | Docs antiguos que mezclaban `sust_status` con la decisiÃ³n | âœ… Aclarado en doc 14 |

---

## 7. Riesgos y dudas antes de borrar nada

1. **Enlaces externos no auditados.** Algunos documentos pueden estar enlazados desde commits, issues o desde el repo de WordPress externo. Antes de borrar/mover, revisar referencias con `grep` sobre `*.md`, `*.html`, `*.js`, `*.py`.
2. **AuditorÃ­as como evidencia histÃ³rica.** `AUDIT_2026_05_04.md`, `MILU_AUDITORIA_TECNICA.md`, `AUDITORIA_TECNICA_MILU_WEB.md` pueden ser referencia legal/contractual de hallazgos en una fecha concreta. Recomendado **archivar (mover), no eliminar**.
3. **Documentos generados.** `data/output/wordpress/milu_wp_export_summary.md` y `dist/.../milu_wp_export_summary.md` se regeneran automÃ¡ticamente. No editarlos a mano ni incluirlos en limpieza.
4. **Propuestas no implementadas.** `MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md`, `06_future_versions_review_flow_figma.md`, `08_pdf_visual_pipeline_prompt.md`, `docs/images/future_architecture.md` contienen diseÃ±os valiosos sin cÃ³digo asociado. Conservar y marcar `PENDIENTE DE VALIDAR`.
5. **Inconsistencias de cÃ³digo vs doc (DT-5).** `descartar` vs `eliminar` no se resuelve con documentaciÃ³n: requiere decisiÃ³n y refactor en `analista_02.js`. La documentaciÃ³n reflejarÃ¡ lo que decida el cÃ³digo.
6. **`docs/modules/`**. Es documentaciÃ³n mÃ³dulo a mÃ³dulo. Ãštil como referencia, pero conviene revisar si se mantiene al dÃ­a con el cÃ³digo. Pendiente: una sub-auditorÃ­a de `docs/modules/`.
7. **RaÃ­z del repo.** `ÃNDICE_AUDITORÃA.md` y `MATRIZ_VISUAL_AUDITORIA.md` deberÃ­an vivir en `docs/auditoria/` para limpiar la raÃ­z, pero la regla actual prohÃ­be mover ficheros en esta fase.
8. **README.md raÃ­z**. No existe README.md en la raÃ­z actualmente (sÃ³lo `docs/README.md`). La propuesta incluye crearlo, pero esta fase estÃ¡ limitada a `docs/`; se documenta aquÃ­ como acciÃ³n pendiente.

---

## 8. PrÃ³ximos pasos sugeridos (fuera de esta fase)

1. Revisar y aprobar este documento.
2. Crear `docs/archived/` y mover allÃ­ los documentos marcados (con commit dedicado).
3. Crear `README.md` raÃ­z consolidando `docs/README.md` + `docs/README_MILU_GLOBAL.md`.
4. AÃ±adir banner de cabecera `âš ï¸ ARCHIVADO â€” superseded por X` a los documentos archivados.
5. Resolver inconsistencia `descartar`/`eliminar` (DT-5 del plan) y actualizar QA_MILU.
6. Auditar `docs/modules/` cuando se aborde la modularizaciÃ³n del backend (AR-2 del plan).

