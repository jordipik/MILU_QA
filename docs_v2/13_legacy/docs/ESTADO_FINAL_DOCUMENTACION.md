# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Estado final de la documentaciÃ³n MILU

> Snapshot post-consolidaciÃ³n. Complementa a [MILU_LIMPIEZA_DOCUMENTACION.md](MILU_LIMPIEZA_DOCUMENTACION.md) (auditorÃ­a/propuesta original) describiendo el resultado realmente aplicado.

## 1. Estructura final

```
README.md                         â† entrada del repo (nueva)
docs/
â”œâ”€â”€ README.md                     â† Ã­ndice de docs (reescrito)
â”œâ”€â”€ MILU_LIMPIEZA_DOCUMENTACION.md  â† auditorÃ­a + propuesta de limpieza
â”œâ”€â”€ ESTADO_FINAL_DOCUMENTACION.md   â† este documento
â”‚
â”‚  â”€â”€ CanÃ³nicos consolidados (fuente Ãºnica por tema) â”€â”€
â”œâ”€â”€ ARQUITECTURA_MILU.md
â”œâ”€â”€ FLUJO_DATOS_MILU.md
â”œâ”€â”€ QA_MILU.md
â”œâ”€â”€ WORDPRESS_EXPORT_MILU.md
â”œâ”€â”€ IMAGENES_ESQUEMAS_MILU.md
â”œâ”€â”€ PLAN_TRABAJO_MILU.md
â”‚
â”‚  â”€â”€ Referencia tÃ©cnica histÃ³rica (mantener) â”€â”€
â”œâ”€â”€ 00_overview.md  01_structure.md  02_data_flow.md  03_data_models.md
â”œâ”€â”€ 04_ai_context.md  05_qa_errors_checks.md  07_analista_02_column_mapping.md
â”œâ”€â”€ 09_auditoria_2026.md  10_plan_remediacion.md  11_progreso_remediacion.md
â”œâ”€â”€ 12_ar1_carga_incremental.md  14_wordpress_export_simplified.md
â”œâ”€â”€ 15_qa_imagenes.md  AUDITORIA_IMAGENES_ESQUEMAS_MILU.md
â”œâ”€â”€ BACKEND.md  FRONTEND.md  MILU_FRONTEND_BACKEND.md
â”œâ”€â”€ MILU_LOGICA_ESTADOS_ACCIONES.md  MILU_LOGICA_PART_NUMBERS.md
â”œâ”€â”€ MILU_INVENTARIO_SCRIPTS.md
â”œâ”€â”€ PLAN_ACCION_QUICK_START.md  PLAN_ACCION_EJECUCION_DETALLADA.md
â”œâ”€â”€ AI_PROMPT_BASE.md  AI_QUICK_CONTEXT.md  AI_QUICK_CONTEXT_COMPACT.md
â”‚
â”œâ”€â”€ archived/    â† superseded / duplicados (banner ARCHIVADO)
â”œâ”€â”€ auditoria/   â† auditorÃ­as histÃ³ricas (banner HISTÃ“RICO)
â”œâ”€â”€ proposals/   â† propuestas no implementadas (banner PENDIENTE DE VALIDAR)
â”œâ”€â”€ images/      â† documentaciÃ³n de multimedia
â”œâ”€â”€ modules/     â† referencia mÃ³dulo a mÃ³dulo
â”œâ”€â”€ legacy/      â† reservada
â””â”€â”€ canonical/   â† reservada
```

## 2. Documentos canÃ³nicos

| Tema | Documento canÃ³nico | Reemplaza a |
|---|---|---|
| Arquitectura | [ARQUITECTURA_MILU.md](ARQUITECTURA_MILU.md) | 00_overview, 01_structure, BACKEND, FRONTEND, 12_ar1 |
| Flujo de datos | [FLUJO_DATOS_MILU.md](FLUJO_DATOS_MILU.md) | 02_data_flow, 03_data_models, MILU_PIPELINE_COMPLETO, MILU_MODELO_DATOS_JSON |
| QA | [QA_MILU.md](QA_MILU.md) | 05_qa_errors_checks, 07_analista_02_column_mapping, MILU_LOGICA_ESTADOS_ACCIONES, MILU_LOGICA_PART_NUMBERS |
| Export WordPress | [WORDPRESS_EXPORT_MILU.md](WORDPRESS_EXPORT_MILU.md) | 14_wordpress_export_simplified; 13_wordpress_export_ai_pipeline (archivado) |
| ImÃ¡genes / esquemas | [IMAGENES_ESQUEMAS_MILU.md](IMAGENES_ESQUEMAS_MILU.md) | 15_qa_imagenes, AUDITORIA_IMAGENES_ESQUEMAS_MILU, docs/images/* |
| Plan de trabajo | [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md) | 10_plan_remediacion, PLAN_ACCION_QUICK_START, PLAN_ACCION_EJECUCION_DETALLADA, MILU_PLAN_MEJORA (archivado) |

Cabecera estÃ¡ndar en los 6: bloque `> **DOCUMENTO CANÃ“NICO MILU**`.

## 3. Documentos archivados

Movidos a [archived/](archived/) con banner `> **ARCHIVADO** â€” superseded.` y link al canÃ³nico:

- 13_wordpress_export_ai_pipeline.md
- AUDITORIA_TECNICA_MILU_WEB.md
- AUDIT_2026_05_04.md
- MILU_AUDITORIA_TECNICA.md
- MILU_ESTRUCTURA_CARPETAS.md
- MILU_MODELO_DATOS_JSON.md
- MILU_PIPELINE_COMPLETO.md
- MILU_PLAN_MEJORA.md
- MILU_V2_EQUIVALENCE_REPORT.md
- MILU_JSON_FIELD_AUDIT_REPORT.md (+ .csv)
- README_MILU_GLOBAL.md

Movidos con `git mv` para preservar historial. NingÃºn documento ha sido borrado.

## 4. Documentos en proposals/

Banner `> **PROPUESTA â€” PENDIENTE DE VALIDAR**`:

- 06_future_versions_review_flow_figma.md
- 08_pdf_visual_pipeline_prompt.md
- MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md
- images_future_architecture.md (antes `docs/images/future_architecture.md`)
- images_pending_improvements.md (antes `docs/images/pending_improvements.md`)

## 5. Documentos en auditoria/

Banner `> **HISTÃ“RICO â€” AUDITORÃA**`:

- INDICE_AUDITORIA.md (antes raÃ­z `ÃNDICE_AUDITORÃA.md`; renombrado a ASCII)
- MATRIZ_VISUAL_AUDITORIA.md (antes en raÃ­z)

## 6. README.md raÃ­z

Nuevo: [../README.md](../README.md). Corto, ejecutivo:

- DescripciÃ³n del proyecto.
- Arranque rÃ¡pido (`npm install` + `node server.js`).
- Estructura del repo.
- Enlaces a los 6 documentos canÃ³nicos.
- Orden de diagnÃ³stico recomendado.
- Convenciones mÃ­nimas.

Reemplaza al antiguo `docs/README_MILU_GLOBAL.md` (archivado).

## 7. Enlaces corregidos

Tras los `git mv` se han reapuntado las referencias en:

- [README.md (docs)](README.md) â€” reescrito, sin links rotos.
- [PLAN_ACCION_QUICK_START.md](PLAN_ACCION_QUICK_START.md) â€” apunta a canÃ³nicos / archived.
- [11_progreso_remediacion.md](11_progreso_remediacion.md) â€” link `13_*` ahora a `archived/`.
- [proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md](proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md) â€” refs a `MILU_JSON_FIELD_AUDIT_REPORT.*` ahora a `archived/`.
- Los 6 canÃ³nicos contienen los enlaces a `archived/` y `proposals/` desde su creaciÃ³n.

## 8. Posibles referencias rotas residuales (aceptadas)

Referencias **textuales** (no enlaces) que apuntan a nombres antiguos y se conservan como contexto:

- [MILU_LIMPIEZA_DOCUMENTACION.md](MILU_LIMPIEZA_DOCUMENTACION.md) â€” describe el estado *pre-limpieza*; sus referencias forman parte de la auditorÃ­a histÃ³rica y no se modifican.
- [PLAN_ACCION_EJECUCION_DETALLADA.md](PLAN_ACCION_EJECUCION_DETALLADA.md) L324 â€” texto narrativo ("basado en MILU_MODELO_DATOS_JSON.md"); no es link.
- [archived/README_MILU_GLOBAL.md](archived/README_MILU_GLOBAL.md) â€” lista interna histÃ³rica; archivado.
- [proposals/08_pdf_visual_pipeline_prompt.md](proposals/08_pdf_visual_pipeline_prompt.md) L130 â€” referencia decorativa a su path antiguo.

## 9. Dudas pendientes / decisiones diferidas

1. `canonical/` y `legacy/` estÃ¡n creadas vacÃ­as. Posible uso futuro:
   - `canonical/` como destino de los 6 consolidados (actualmente viven en `docs/`).
   - `legacy/` para mover `docs/archived/` o documentaciÃ³n de cÃ³digo legacy del repo (no decidido).
2. Documentos `PLAN_ACCION_*` y `10_plan_remediacion.md` se mantienen junto a [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md). Posible fusiÃ³n futura en un solo plan canÃ³nico.
3. `docs/modules/` no se ha tocado; conviene auditarlo aparte (â‰ˆ20 archivos) para confirmar vigencia frente al cÃ³digo actual.
4. `docs/images/README.md` se mantiene como Ã­ndice local; no se ha promovido a canÃ³nico.

## 10. Riesgos detectados

- **Historial git de los archivos movidos**: preservado vÃ­a `git mv`, pero si alguien hace `git log <ruta antigua>` deberÃ¡ usar `git log --follow`.
- **Enlaces externos** (issues, wikis, prompts guardados) que apunten a las rutas antiguas: no auditados. Se asume que el repo es la fuente; cualquier external link puede romperse.
- **`docs/archived/` y `auditoria/` no son inmutables**: si alguien los edita sin re-leer el banner, podrÃ­a reintroducir informaciÃ³n obsoleta como vigente. MitigaciÃ³n: el banner es la primera lÃ­nea de cada archivo.
- **`docs/MILU_LIMPIEZA_DOCUMENTACION.md`** mantiene referencias textuales pre-limpieza intencionadamente. Si se reorganiza la documentaciÃ³n de nuevo, este documento ya no reflejarÃ¡ el estado actual: se recomienda actualizar **este `ESTADO_FINAL_DOCUMENTACION.md`** en su lugar.
- **Carpetas vacÃ­as** (`canonical/`, `legacy/`): git no las versiona si no contienen archivos. Si la carpeta debe existir antes de poblarse, aÃ±adir un `.gitkeep`.

## 11. Recomendaciones siguientes

1. **Validar** las 5 propuestas en `proposals/` y decidir: implementar, archivar o eliminar. Si se implementan, sus contenidos pasan a los documentos canÃ³nicos correspondientes.
2. **Auditar `docs/modules/`** contra el cÃ³digo actual de `js/` y root scripts; archivar lo desactualizado.
3. **Eliminar carpetas vacÃ­as** (`canonical/`, `legacy/`) si tras 1-2 iteraciones no se han poblado, o aÃ±adir `.gitkeep` si se confirma su uso futuro.
4. **Convertir `PLAN_TRABAJO_MILU.md` en un Ãºnico plan vivo** absorbiendo `10_plan_remediacion.md`, `11_progreso_remediacion.md`, `PLAN_ACCION_QUICK_START.md` y `PLAN_ACCION_EJECUCION_DETALLADA.md`.
5. **AÃ±adir CI doc-lint** (markdown link check) para impedir que reaparezcan enlaces rotos.
6. **Mover el `README.md` raÃ­z al control de cambios** (revisar en cada PR si la estructura cambia).

