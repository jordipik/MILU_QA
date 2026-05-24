# Estado final de la documentación MILU

> Snapshot post-consolidación. Complementa a [MILU_LIMPIEZA_DOCUMENTACION.md](MILU_LIMPIEZA_DOCUMENTACION.md) (auditoría/propuesta original) describiendo el resultado realmente aplicado.

## 1. Estructura final

```
README.md                         ← entrada del repo (nueva)
docs/
├── README.md                     ← índice de docs (reescrito)
├── MILU_LIMPIEZA_DOCUMENTACION.md  ← auditoría + propuesta de limpieza
├── ESTADO_FINAL_DOCUMENTACION.md   ← este documento
│
│  ── Canónicos consolidados (fuente única por tema) ──
├── ARQUITECTURA_MILU.md
├── FLUJO_DATOS_MILU.md
├── QA_MILU.md
├── WORDPRESS_EXPORT_MILU.md
├── IMAGENES_ESQUEMAS_MILU.md
├── PLAN_TRABAJO_MILU.md
│
│  ── Referencia técnica histórica (mantener) ──
├── 00_overview.md  01_structure.md  02_data_flow.md  03_data_models.md
├── 04_ai_context.md  05_qa_errors_checks.md  07_analista_02_column_mapping.md
├── 09_auditoria_2026.md  10_plan_remediacion.md  11_progreso_remediacion.md
├── 12_ar1_carga_incremental.md  14_wordpress_export_simplified.md
├── 15_qa_imagenes.md  AUDITORIA_IMAGENES_ESQUEMAS_MILU.md
├── BACKEND.md  FRONTEND.md  MILU_FRONTEND_BACKEND.md
├── MILU_LOGICA_ESTADOS_ACCIONES.md  MILU_LOGICA_PART_NUMBERS.md
├── MILU_INVENTARIO_SCRIPTS.md
├── PLAN_ACCION_QUICK_START.md  PLAN_ACCION_EJECUCION_DETALLADA.md
├── AI_PROMPT_BASE.md  AI_QUICK_CONTEXT.md  AI_QUICK_CONTEXT_COMPACT.md
│
├── archived/    ← superseded / duplicados (banner ARCHIVADO)
├── auditoria/   ← auditorías históricas (banner HISTÓRICO)
├── proposals/   ← propuestas no implementadas (banner PENDIENTE DE VALIDAR)
├── images/      ← documentación de multimedia
├── modules/     ← referencia módulo a módulo
├── legacy/      ← reservada
└── canonical/   ← reservada
```

## 2. Documentos canónicos

| Tema | Documento canónico | Reemplaza a |
|---|---|---|
| Arquitectura | [ARQUITECTURA_MILU.md](ARQUITECTURA_MILU.md) | 00_overview, 01_structure, BACKEND, FRONTEND, 12_ar1 |
| Flujo de datos | [FLUJO_DATOS_MILU.md](FLUJO_DATOS_MILU.md) | 02_data_flow, 03_data_models, MILU_PIPELINE_COMPLETO, MILU_MODELO_DATOS_JSON |
| QA | [QA_MILU.md](QA_MILU.md) | 05_qa_errors_checks, 07_analista_02_column_mapping, MILU_LOGICA_ESTADOS_ACCIONES, MILU_LOGICA_PART_NUMBERS |
| Export WordPress | [WORDPRESS_EXPORT_MILU.md](WORDPRESS_EXPORT_MILU.md) | 14_wordpress_export_simplified; 13_wordpress_export_ai_pipeline (archivado) |
| Imágenes / esquemas | [IMAGENES_ESQUEMAS_MILU.md](IMAGENES_ESQUEMAS_MILU.md) | 15_qa_imagenes, AUDITORIA_IMAGENES_ESQUEMAS_MILU, docs/images/* |
| Plan de trabajo | [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md) | 10_plan_remediacion, PLAN_ACCION_QUICK_START, PLAN_ACCION_EJECUCION_DETALLADA, MILU_PLAN_MEJORA (archivado) |

Cabecera estándar en los 6: bloque `> **DOCUMENTO CANÓNICO MILU**`.

## 3. Documentos archivados

Movidos a [archived/](archived/) con banner `> **ARCHIVADO** — superseded.` y link al canónico:

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

Movidos con `git mv` para preservar historial. Ningún documento ha sido borrado.

## 4. Documentos en proposals/

Banner `> **PROPUESTA — PENDIENTE DE VALIDAR**`:

- 06_future_versions_review_flow_figma.md
- 08_pdf_visual_pipeline_prompt.md
- MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md
- images_future_architecture.md (antes `docs/images/future_architecture.md`)
- images_pending_improvements.md (antes `docs/images/pending_improvements.md`)

## 5. Documentos en auditoria/

Banner `> **HISTÓRICO — AUDITORÍA**`:

- INDICE_AUDITORIA.md (antes raíz `ÍNDICE_AUDITORÍA.md`; renombrado a ASCII)
- MATRIZ_VISUAL_AUDITORIA.md (antes en raíz)

## 6. README.md raíz

Nuevo: [../README.md](../README.md). Corto, ejecutivo:

- Descripción del proyecto.
- Arranque rápido (`npm install` + `node server.js`).
- Estructura del repo.
- Enlaces a los 6 documentos canónicos.
- Orden de diagnóstico recomendado.
- Convenciones mínimas.

Reemplaza al antiguo `docs/README_MILU_GLOBAL.md` (archivado).

## 7. Enlaces corregidos

Tras los `git mv` se han reapuntado las referencias en:

- [README.md (docs)](README.md) — reescrito, sin links rotos.
- [PLAN_ACCION_QUICK_START.md](PLAN_ACCION_QUICK_START.md) — apunta a canónicos / archived.
- [11_progreso_remediacion.md](11_progreso_remediacion.md) — link `13_*` ahora a `archived/`.
- [proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md](proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md) — refs a `MILU_JSON_FIELD_AUDIT_REPORT.*` ahora a `archived/`.
- Los 6 canónicos contienen los enlaces a `archived/` y `proposals/` desde su creación.

## 8. Posibles referencias rotas residuales (aceptadas)

Referencias **textuales** (no enlaces) que apuntan a nombres antiguos y se conservan como contexto:

- [MILU_LIMPIEZA_DOCUMENTACION.md](MILU_LIMPIEZA_DOCUMENTACION.md) — describe el estado *pre-limpieza*; sus referencias forman parte de la auditoría histórica y no se modifican.
- [PLAN_ACCION_EJECUCION_DETALLADA.md](PLAN_ACCION_EJECUCION_DETALLADA.md) L324 — texto narrativo ("basado en MILU_MODELO_DATOS_JSON.md"); no es link.
- [archived/README_MILU_GLOBAL.md](archived/README_MILU_GLOBAL.md) — lista interna histórica; archivado.
- [proposals/08_pdf_visual_pipeline_prompt.md](proposals/08_pdf_visual_pipeline_prompt.md) L130 — referencia decorativa a su path antiguo.

## 9. Dudas pendientes / decisiones diferidas

1. `canonical/` y `legacy/` están creadas vacías. Posible uso futuro:
   - `canonical/` como destino de los 6 consolidados (actualmente viven en `docs/`).
   - `legacy/` para mover `docs/archived/` o documentación de código legacy del repo (no decidido).
2. Documentos `PLAN_ACCION_*` y `10_plan_remediacion.md` se mantienen junto a [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md). Posible fusión futura en un solo plan canónico.
3. `docs/modules/` no se ha tocado; conviene auditarlo aparte (≈20 archivos) para confirmar vigencia frente al código actual.
4. `docs/images/README.md` se mantiene como índice local; no se ha promovido a canónico.

## 10. Riesgos detectados

- **Historial git de los archivos movidos**: preservado vía `git mv`, pero si alguien hace `git log <ruta antigua>` deberá usar `git log --follow`.
- **Enlaces externos** (issues, wikis, prompts guardados) que apunten a las rutas antiguas: no auditados. Se asume que el repo es la fuente; cualquier external link puede romperse.
- **`docs/archived/` y `auditoria/` no son inmutables**: si alguien los edita sin re-leer el banner, podría reintroducir información obsoleta como vigente. Mitigación: el banner es la primera línea de cada archivo.
- **`docs/MILU_LIMPIEZA_DOCUMENTACION.md`** mantiene referencias textuales pre-limpieza intencionadamente. Si se reorganiza la documentación de nuevo, este documento ya no reflejará el estado actual: se recomienda actualizar **este `ESTADO_FINAL_DOCUMENTACION.md`** en su lugar.
- **Carpetas vacías** (`canonical/`, `legacy/`): git no las versiona si no contienen archivos. Si la carpeta debe existir antes de poblarse, añadir un `.gitkeep`.

## 11. Recomendaciones siguientes

1. **Validar** las 5 propuestas en `proposals/` y decidir: implementar, archivar o eliminar. Si se implementan, sus contenidos pasan a los documentos canónicos correspondientes.
2. **Auditar `docs/modules/`** contra el código actual de `js/` y root scripts; archivar lo desactualizado.
3. **Eliminar carpetas vacías** (`canonical/`, `legacy/`) si tras 1-2 iteraciones no se han poblado, o añadir `.gitkeep` si se confirma su uso futuro.
4. **Convertir `PLAN_TRABAJO_MILU.md` en un único plan vivo** absorbiendo `10_plan_remediacion.md`, `11_progreso_remediacion.md`, `PLAN_ACCION_QUICK_START.md` y `PLAN_ACCION_EJECUCION_DETALLADA.md`.
5. **Añadir CI doc-lint** (markdown link check) para impedir que reaparezcan enlaces rotos.
6. **Mover el `README.md` raíz al control de cambios** (revisar en cada PR si la estructura cambia).
