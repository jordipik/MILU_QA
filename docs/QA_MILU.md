# DOCUMENTO CANÓNICO MILU — QA (reglas, estados y comprobaciones)

> **Estado**: CANÓNICO · Fuente única de verdad para QA.
> **Última actualización**: 2026-05-12.
> **Fuentes consolidadas**: [05_qa_errors_checks.md](05_qa_errors_checks.md), [07_analista_02_column_mapping.md](07_analista_02_column_mapping.md), [MILU_LOGICA_ESTADOS_ACCIONES.md](MILU_LOGICA_ESTADOS_ACCIONES.md), [MILU_LOGICA_PART_NUMBERS.md](MILU_LOGICA_PART_NUMBERS.md).

---

## 1. Modelo de revisión

Cada fila de un `engine_*.json` lleva los siguientes campos de revisión:

| Campo | Valores | Sentido |
|---|---|---|
| `qa_revision_estado` | `pendiente`, `ok` | Si la fila ha sido validada por QA. |
| `qa_revision_accion` | `importar`, `copia`, `revisar`, `eliminar` | Qué hacer con la fila en exportación. |
| `qa_revision_updated_at` | ISO timestamp | Última modificación. |

Detalle formal: [MILU_LOGICA_ESTADOS_ACCIONES.md](MILU_LOGICA_ESTADOS_ACCIONES.md).

> ⚠️ Inconsistencia conocida: `analista_02.js` usa la etiqueta `descartar` mientras la UI principal usa `eliminar`. Tarea **DT-5** del plan. **PENDIENTE DE VALIDAR**.

---

## 2. Decisión de exportación (regla canónica)

La decisión de export se calcula **por PN global** (no por fila):

- `decision = import` si **alguna** fila del PN cumple `qa_revision_estado = ok` y `qa_revision_accion = importar`.
- `decision = discard` si **todas** las filas del PN cumplen `qa_revision_estado = ok` y `qa_revision_accion = eliminar`.
- `decision = pending_review` en cualquier otro caso.

Ver [WORDPRESS_EXPORT_MILU.md](WORDPRESS_EXPORT_MILU.md).

---

## 3. Comprobaciones QA (ERR)

> Los checks **no se persisten** en los `engine_*.json`. Se calculan **bajo demanda en cliente** desde los campos del registro y el contexto PDF cuando aplica.

Ya no existen `qa_errors` ni `qa_errors_active` en disco. Eliminados para evitar que `/save-json` reescriba metadatos derivados.

Implementación: [js/qa-checks.js](../js/qa-checks.js) (`QA_CHECK_DEFINITIONS`, `evaluateRowQaChecks`, `evaluateQaChecksForField`). Consumo visual: [js/analista-02.js](../js/analista-02.js).

### 3.1 Checks activos

1. `pos_required`
2. `pos_final_pdf_match`
3. `pn_required`
4. `pn_final_pdf_match`
5. `designation_required`
6. `designation_final_pdf_or_gesa_match`
7. `weight_final_pdf_or_gesa_match`
8. `measure_final_pdf_or_gesa_match`
9. `norma_final_pdf_or_gesa_match`
10. `bom_final_pdf_match`

### 3.2 Estadísticas del modal "Comprobaciones QA"

- Total de registros.
- Registros con errores activos.
- Registros sin errores activos.
- Registros con severidad `critical` activa.
- Desglose por comprobación (`codeCount`).

Estas estadísticas no son una foto histórica fija: dependen de los checks activos (`activeCodes`) en ese momento.

### 3.3 Ficha del registro

La ficha lateral y el modal muestran:

- Resumen de severidad / "sin errores activos".
- Listado detallado de incidencias activas (`issues`).
- Campos implicados cuando existen en `issues.fields`.

### 3.4 Endpoints relacionados

- `POST /save-json` — solo persiste el valor editado, **no recalcula QA**.
- `POST /recompute-qa-errors` — desactivado (legacy).
- `POST /apply-qa-checks-filter` — desactivado (legacy).

---

## 4. Lógica de Part Numbers (PN)

Resumen (detalle en [MILU_LOGICA_PART_NUMBERS.md](MILU_LOGICA_PART_NUMBERS.md)):

- **PN canónico**: `pn_final` (calculado), con fallback a `PART NO.` (`pn_raw`).
- Normalización: trims, mayúsculas, eliminación de espacios internos según reglas del pipeline.
- Comparación PDF↔GESA↔RAW: los checks usan el primer valor disponible en la cascada `final → gesa → raw → pdf`.
- **Decisión global por PN**: ver `POST /pn-review/:sku/apply-decision` en [FLUJO_DATOS_MILU.md](FLUJO_DATOS_MILU.md).

---

## 5. Analista 02 — Mapeo de columnas

Vista `analista_02.html` con tabla comparativa **RAW / GESA / SUST / FINAL / PDF / ERR**.

- Mapeo implementado en [js/analista-02.js](../js/analista-02.js) (`buildComparisonRows()`).
- Cascada de fallback por columna: `FINAL → GESA → RAW`.
- **ERR**: pinta contadores de error de persistencia (`*_error`, `total_error`) con tooltip; no es lo mismo que los checks de la sección 3.

Detalle completo: [07_analista_02_column_mapping.md](07_analista_02_column_mapping.md).

### 5.1 Pestaña PN Review embebida

`analista_02.html` integra `js/pn-review-embedded.js`, que reusa la lógica de `pn_review.html`:

- Carga `GET /pn-review/:sku` + `GET /pn-review/:sku/sources`.
- Conflictos por familia detectados con `detectPnSourceConflicts`.
- Aplica decisión con `POST /pn-review/:sku/apply-decision`.
- Callback `onDecisionApplied` revalida la fila actual y recalcula `renderReviewStats()`.

---

## 6. Tabla y rendimiento

- La columna **Error** y el filtro **Con error / Sin error** trabajan con cálculo local, **sin persistencia auxiliar en disco**.
- Cualquier soporte residual a `qa_errors` o `qa_errors_active` se considera legacy.
- Objetivo arquitectural: mantener los JSON limpios de estado derivado.

Plan de rendimiento (UX-1, UX-2 del plan): vista compacta por defecto y virtualización de la tabla. Ver [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md).

---

## 7. Notas operativas

- Si se modifica `server.js`, reiniciar `node server.js`.
- Si alguna UI invoca `/recompute-qa-errors` o `/apply-qa-checks-filter`, el backend responde como funcionalidad legacy desactivada.
- Diagnóstico de persistencia: ver sección 8 de [FLUJO_DATOS_MILU.md](FLUJO_DATOS_MILU.md).

---

## Referencias

- Canónico checks: [05_qa_errors_checks.md](05_qa_errors_checks.md)
- Canónico estados/acciones: [MILU_LOGICA_ESTADOS_ACCIONES.md](MILU_LOGICA_ESTADOS_ACCIONES.md)
- Canónico PN: [MILU_LOGICA_PART_NUMBERS.md](MILU_LOGICA_PART_NUMBERS.md)
- Mapeo Analista 02: [07_analista_02_column_mapping.md](07_analista_02_column_mapping.md)
- Imágenes/QA: [QA_MILU.md → QA Imágenes](IMAGENES_ESQUEMAS_MILU.md)
