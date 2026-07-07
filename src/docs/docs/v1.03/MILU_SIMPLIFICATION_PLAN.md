# MILU_SIMPLIFICATION_PLAN — Plan de simplificación V1.03

> **FASE 4.5 / Objetivo 2** del Plan Maestro V1.03. Métricas de complejidad **actual** vs **objetivo** por dominio funcional, beneficio esperado y prioridad.
>
> Entrada: [MILU_DUPLICATED_DOMAINS.md](MILU_DUPLICATED_DOMAINS.md).
>
> Salida: hoja de ruta cuantificada para FASES 5–9.

## Convenciones

- **Frontends**: HTMLs distintos que disparan el dominio.
- **Endpoints**: rutas HTTP distintas vivas en `server.js` para el dominio.
- **Scripts**: scripts ejecutables (Node + Python) que pertenecen al dominio.
- **Archivos modificados**: tipos de archivo en disco que escribe el dominio.
- **Beneficio**: cualitativo (Bajo / Medio / Alto / Muy alto). Combina reducción de superficie, reducción de riesgo y reducción de bugs esperados.
- **Prioridad**: P1 / P2 / P3 (definidas en `MILU_DUPLICATED_DOMAINS.md`).

---

## DOMINIO 1 — PDF

### Complejidad actual

| Métrica | Valor |
|---|---|
| Frontends | 2 (`recompute_simple.html`, `analista_02.html`) |
| Endpoints | 6 (`/api/recompute-simple/rebuild-json`, `/api/pdf-preview/apply-to-engine`, `/recompute-pdf-auto-visual`, `/copy-pdf-to-pdf-all-books`, `/copy-pdf-to-pdf`, `/copy-pdf-to-final-all-books`) |
| Scripts | 6 (`rebuild_engine_from_book_preview.js`, `apply_book_preview_to_engine.py`, `apply_all_book_previews.py`, `qa_pdf_visual_copy.js`, `qa_pdf_compare.js`, `qa_pdf_compare_v2.js`) |
| Tipos de archivo modificados | `engine_*.json`, `data/02-engine_rebuild/engine_rebuild_*.json` |

### Complejidad objetivo (post FASE 7)

| Métrica | Valor |
|---|---|
| Frontends | 2 (sin cambio; vocabulario unificado de botones) |
| Endpoints | 4 (`rebuild-json`, `pdf-preview/apply-to-engine`, `recompute-pdf-auto-visual`, `copy-pdf-to-final-all-books`) |
| Scripts | 4 (rebuild JS, apply python single, apply python all, qa_pdf_visual_copy.js + 1 compare) |
| Tipos de archivo modificados | igual |

### Beneficio

- Reducción endpoints: 6 → 4 (33%).
- Reducción scripts: 6 → 4 (33%).
- **Eliminación de la duplicidad single-row inline (`/copy-pdf-to-pdf` + `applyCanonicalPdfCopyToRow`)**.
- **Decisión de unificar `qa_pdf_compare` v1/v2**.
- Adición de `--dry-run` y backup automático a `apply_book_preview_to_engine.py` y `apply_all_book_previews.py` (FASE 7).
- Beneficio: **Muy alto** (zona donde la memoria del repo señala ~80% de bugs).

**Prioridad: P1**.

---

## DOMINIO 2 — FINAL

### Complejidad actual

| Métrica | Valor |
|---|---|
| Frontends | 1 (`analista_02.html`) |
| Endpoints | 2 (`/copy-pdf-to-final-all-books` oficial, `/calculate-final-fields` legacy) |
| Scripts | 3 (inline server.js, `depuracion_json.py` + `add_final_fields.py`, `copy_gesa_fields_to_final.py`, `copy_pdf_fields_to_final.py`) |
| Tipos de archivo modificados | `engine_*.json` |

### Complejidad objetivo (post FASE 5/7)

| Métrica | Valor |
|---|---|
| Frontends | 1 |
| Endpoints | 1 (`/copy-pdf-to-final-all-books`) |
| Scripts | 2 (inline online + `depuracion_json.py` offline; matriz canónica única) |
| Tipos de archivo modificados | `engine_*.json` |

### Beneficio

- Reducción endpoints: 2 → 1 (50%).
- Reducción scripts: 4 → 2 (50%).
- **Eliminación de `/calculate-final-fields` + `copy_gesa_fields_to_final.py` + `copy_pdf_fields_to_final.py`**.
- Riesgo de divergencia entre el FINAL_FIELDS_V1 inline y `depuracion_json.py` documentado y resuelto.
- Beneficio: **Alto**.

**Prioridad: P2**.

---

## DOMINIO 3 — HERMANOS

### Complejidad actual

| Métrica | Valor |
|---|---|
| Frontends | 2 (`recompute_simple.html`, `analista_02.html`) |
| Endpoints | 2 (`/api/recompute-simple/recompute-hermanos`, `/pn-review/apply-siblings-bulk`) |
| Scripts | 1 motor (`applySiblingBulkUpdates` inline en server.js, importado por ambos endpoints) |
| Tipos de archivo modificados | `engine_*.json` |

### Complejidad objetivo (post FASE 8)

| Métrica | Valor |
|---|---|
| Frontends | 2 (mismos botones, redirigidos al endpoint único) |
| Endpoints | 1 (`/api/recompute-simple/recompute-hermanos`) |
| Scripts | 1 motor |
| Tipos de archivo modificados | `engine_*.json` |

### Beneficio

- Reducción endpoints: 2 → 1 (50%).
- **Eliminación del único endpoint que hardcodea `dryRun:false, backup:false`**.
- Beneficio: **Muy alto** (riesgo concreto: una pulsación de "Propagar hermanos" sin red de seguridad puede modificar registros en los 9 engines sin posibilidad de rollback).

**Prioridad: P1**.

---

## DOMINIO 4 — ESTADOS

### Sub-dominio A: CALCULAR

#### Complejidad actual

| Métrica | Valor |
|---|---|
| Endpoints | 3 (`/api/recompute-simple/update-states`, `/recompute-qa-errors`, `/recalculate-revision-status`) |
| Scripts | 2 (`scripts/update_revision_states.js`, `recompute_engine_errors.js`) |
| Modos de operación | 4+ (combinaciones de `updateRevision`, `forceRevision`, `scope=current/book/all`) |

#### Complejidad objetivo (post FASE 8)

| Métrica | Valor |
|---|---|
| Endpoints | 2 (`/api/recompute-simple/update-states` oficial; `/recompute-qa-errors` solo cálculo de errores, sin tocar estado) |
| Scripts | 2 |
| Modos de operación | 2 (un endpoint = una responsabilidad) |

### Sub-dominio B: APLICAR

#### Complejidad actual

| Métrica | Valor |
|---|---|
| Endpoints | 5 (`/apply-revision-to-engines` bulk, `/pn-review/:sku/apply-decision`, `/pn-review/by-id/:id/apply-decision`, `/pn-review/:sku/apply-values`, `/save-json` puntual) |
| Scripts | inline + service `revision-apply` |

#### Complejidad objetivo

| Métrica | Valor |
|---|---|
| Endpoints | 4 (`/apply-revision-to-engines`, `/pn-review/:sku/apply-decision`, `/pn-review/:sku/apply-values`, `/save-json`; el endpoint `by-id` queda como `SUPPORTED_V103`) |

### Beneficio total DOMINIO 4

- Reducción endpoints: 8 → 6 (25%).
- **Eliminación de `/recalculate-revision-status`** (mata el peor caso de "todos los engines en bucle").
- Separación conceptual clara CALCULAR / APLICAR / PROPAGAR (este último cubierto por DOMINIO 3).
- Beneficio: **Medio**.

**Prioridad: P2**.

---

## DOMINIO 5 — ESQUEMAS

### Complejidad actual

| Métrica | Valor |
|---|---|
| Frontends | 2 (`qa_milu.html`, `recompute_simple.html`) |
| Endpoints | 8 (A1, A2, A3 indirecto, B1, B2, B3, B4, C1, C2) |
| Scripts | 4 (`generate_esquema_pos.py`, `rebuild_schemes_by_bom.py`, `rebuild_schemes_circles_from_esquemas.py`, `rebuild_assets_for_record.py`, + auxiliares C3, C4) |
| Tipos de archivo modificados | `esquemas/`, `esquemas_pos_circulos/`, `manual_overrides.json`, `engine_*.json` |

### Complejidad objetivo (post FASE 9)

| Métrica | Valor |
|---|---|
| Frontends | 2 |
| Endpoints | 5 (A1 single, A2 bulk, B1 unificado [`onlyMissing` + `engine` + `id` + `--all`], B4 batch con overrides, C1 upsert) |
| Scripts | 4 (mismos, sin cambios estructurales) |
| Tipos de archivo modificados | igual |

### Beneficio

- Reducción endpoints: 8 → 5 (37%).
- **Fusión de B1 + B2 + B3 en un único endpoint parametrizable**.
- Renombrado opcional: `generate_esquema_pos.py` → `generate_esquema_general.py` (claridad técnica).
- Beneficio: **Medio**.

**Prioridad: P2**.

---

## DOMINIO 6 — EXPORT

### Complejidad actual

| Métrica | Valor |
|---|---|
| Frontends | 3 (`qa_milu.html`, `export_wordpress.html`, `exportacion.html`) |
| Endpoints | 14 (1 POST oficial, 7 GET, 3 410 a borrar, 3 legacy CLI declarados como npm legacy) |
| Scripts | 5 (oficial `export_wordpress_milu.js`, validate, synthetic legacy, ai conflicts legacy, export review legacy, + simulate/compare auxiliares) |
| Tipos de archivo modificados | `data/05-wordpress/*.json`, `dist/`, `MILU_*_v506.json` legacy |

### Complejidad objetivo (post FASE 5/7)

| Métrica | Valor |
|---|---|
| Frontends | 2 (`qa_milu.html`, `export_wordpress.html`; `exportacion.html` a `LEGACY` o cuarentena) |
| Endpoints | 8 (1 POST oficial, 7 GET; 3 endpoints 410 eliminados; 3 legacy npm scripts eliminados) |
| Scripts | 4 (oficial + validate + simulate + compare; synthetic legacy y AI legacy fuera) |
| Tipos de archivo modificados | `data/05-wordpress/*.json` |

### Beneficio

- Reducción endpoints: 14 → 8 (43%).
- **Eliminación de 3 endpoints 410** + **3 npm scripts `legacy:*`**.
- Beneficio: **Bajo** (limpieza, no afecta estabilidad).

**Prioridad: P3**.

---

## DOMINIO 7 — REVISION-APPLY (scripts root duplicados)

### Complejidad actual

| Métrica | Valor |
|---|---|
| Endpoints | 1 (`/apply-revision-to-engines` con service oficial) |
| Scripts root sospechosos | 2 (`apply_revision_to_engines.js`, `apply-bulk-revision-to-engine.js`) |

### Complejidad objetivo

| Métrica | Valor |
|---|---|
| Endpoints | 1 (sin cambio) |
| Scripts root sospechosos | 0 (movidos a `legacy_quarantine/`) |

### Beneficio

- Reducción scripts root: 2 → 0.
- **Eliminación de scripts capaces de modificar `engine_*.json` sin pasar por la whitelist del service**.
- Beneficio: **Medio** (saneamiento de superficie peligrosa).

**Prioridad: P3**.

---

## DOMINIO 8 — ANÁLISIS DE REBUILD (wrappers raíz)

### Complejidad actual

| Métrica | Valor |
|---|---|
| Wrappers en raíz | 5 |
| Scripts oficiales en `scripts/` | 3 (los otros 2 son wrapper-only) |

### Complejidad objetivo

| Métrica | Valor |
|---|---|
| Wrappers en raíz | 0 |
| Scripts oficiales en `scripts/` | 5 (los 2 wrapper-only se mueven a `scripts/` o se cuarentenan) |

### Beneficio

- Limpieza visual de raíz.
- Beneficio: **Bajo**.

**Prioridad: P3**.

---

## Tabla resumen

| Dominio | Frontends actual→obj | Endpoints actual→obj | Scripts actual→obj | Beneficio | Prioridad | Fase |
|---|---|---|---|---|---|---|
| 1. PDF | 2→2 | 6→4 | 6→4 | Muy alto | **P1** | 7 |
| 2. FINAL | 1→1 | 2→1 | 4→2 | Alto | P2 | 5+7 |
| 3. HERMANOS | 2→2 | 2→1 | 1→1 | Muy alto | **P1** | 8 |
| 4. ESTADOS | 3→3 | 8→6 | 2→2 | Medio | P2 | 8 |
| 5. ESQUEMAS | 2→2 | 8→5 | 4→4 | Medio | P2 | 9 |
| 6. EXPORT | 3→2 | 14→8 | 5→4 | Bajo | P3 | 5 |
| 7. REVISION-APPLY scripts root | 0→0 | 1→1 | 2→0 | Medio | P3 | 5 |
| 8. ANALYZE wrappers root | 0→0 | 0→0 | 5→3-5 | Bajo | P3 | 5 |
| **TOTAL** | **8→6** | **41→26** | **29→20** | — | — | — |

> **Reducción agregada**: ~37% endpoints, ~31% scripts, sin sacrificio funcional.

---

## Beneficios cualitativos cruzados

1. **Eliminación de las 3 puertas más peligrosas**:
   - `/pn-review/apply-siblings-bulk` (DOMINIO 3, hardcoded `dryRun:false, backup:false`).
   - `/recalculate-revision-status` (DOMINIO 4, recorre los 9 engines en bucle).
   - `/clear-engine-fields` (sin botón vivo, ALTO; aunque pertenece a DOMINIO 0 "maintenance").
2. **Reducción de la superficie de scripts con capacidad de escribir `engine_*.json`** desde 18 a ~10.
3. **Cobertura de `dryRun` y backup en el 100% de operaciones bulk** (post FASE 7+8).
4. **Documentación 1:1 BOTÓN → ENDPOINT → SCRIPT → ARCHIVO** consolidada en `MILU_RUNTIME_MAP.md` y `MILU_OFFICIAL_COMPONENTS.md`.

## Mapa de prioridades P1/P2/P3

### P1 (críticos, ejecutar antes de cualquier merge a producción)

- DOMINIO 1 (PDF) — FASE 7.
- DOMINIO 3 (HERMANOS) — FASE 8.

### P2 (importantes, ejecutar tras P1)

- DOMINIO 2 (FINAL) — FASE 5 (parcial: 2 scripts) + FASE 7 (matriz canónica).
- DOMINIO 4 (ESTADOS) — FASE 8.
- DOMINIO 5 (ESQUEMAS) — FASE 9.

### P3 (limpieza, ejecutar oportunistamente en FASE 5)

- DOMINIO 6 (EXPORT).
- DOMINIO 7 (REVISION-APPLY scripts root).
- DOMINIO 8 (ANALYZE wrappers).

---

## Estimación de fases con más impacto

| Fase | Impacto | Razón |
|---|---|---|
| **FASE 7 (PDF)** | **Muy alto** | Resuelve DOMINIO 1 (P1), parte de DOMINIO 2 |
| **FASE 8 (HERMANOS / ESTADOS)** | **Alto** | Resuelve DOMINIO 3 (P1) y DOMINIO 4 (P2) |
| FASE 9 (ESQUEMAS) | Medio | Resuelve DOMINIO 5 (P2) |
| FASE 5 (cuarentena) | Medio | Cierra los P3 y prepara terreno para 6 (gating) |
| FASE 6 (gating) | Medio | Reduce el riesgo de las operaciones que **no** se eliminan |
