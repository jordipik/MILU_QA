# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# DOCUMENTO CANÃ“NICO MILU â€” QA (reglas, estados y comprobaciones)

> **Estado**: CANÃ“NICO Â· Fuente Ãºnica de verdad para QA.
> **Ãšltima actualizaciÃ³n**: 2026-05-12.
> **Fuentes consolidadas**: [05_qa_errors_checks.md](05_qa_errors_checks.md), [07_analista_02_column_mapping.md](07_analista_02_column_mapping.md), [MILU_LOGICA_ESTADOS_ACCIONES.md](MILU_LOGICA_ESTADOS_ACCIONES.md), [MILU_LOGICA_PART_NUMBERS.md](MILU_LOGICA_PART_NUMBERS.md).

---

## 1. Modelo de revisiÃ³n

Cada fila de un `engine_*.json` lleva los siguientes campos de revisiÃ³n:

| Campo | Valores | Sentido |
|---|---|---|
| `qa_revision_estado` | `pendiente`, `ok` | Si la fila ha sido validada por QA. |
| `qa_revision_accion` | `importar`, `copia`, `revisar`, `eliminar` | QuÃ© hacer con la fila en exportaciÃ³n. |
| `qa_revision_updated_at` | ISO timestamp | Ãšltima modificaciÃ³n. |

Detalle formal: [MILU_LOGICA_ESTADOS_ACCIONES.md](MILU_LOGICA_ESTADOS_ACCIONES.md).

> âš ï¸ Inconsistencia conocida: `analista_02.js` usa la etiqueta `descartar` mientras la UI principal usa `eliminar`. Tarea **DT-5** del plan. **PENDIENTE DE VALIDAR**.

---

## 2. DecisiÃ³n de exportaciÃ³n (regla canÃ³nica)

La decisiÃ³n de export se calcula **por PN global** (no por fila):

- `decision = import` si **alguna** fila del PN cumple `qa_revision_estado = ok` y `qa_revision_accion = importar`.
- `decision = discard` si **todas** las filas del PN cumplen `qa_revision_estado = ok` y `qa_revision_accion = eliminar`.
- `decision = pending_review` en cualquier otro caso.

Ver [WORDPRESS_EXPORT_MILU.md](WORDPRESS_EXPORT_MILU.md).

---

## 3. Comprobaciones QA (ERR)

> Los checks **no se persisten** en los `engine_*.json`. Se calculan **bajo demanda en cliente** desde los campos del registro y el contexto PDF cuando aplica.

Ya no existen `qa_errors` ni `qa_errors_active` en disco. Eliminados para evitar que `/save-json` reescriba metadatos derivados.

ImplementaciÃ³n: [js/qa-checks.js](../js/qa-checks.js) (`QA_CHECK_DEFINITIONS`, `evaluateRowQaChecks`, `evaluateQaChecksForField`). Consumo visual: [js/analista-02.js](../js/analista-02.js).

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

### 3.2 EstadÃ­sticas del modal "Comprobaciones QA"

- Total de registros.
- Registros con errores activos.
- Registros sin errores activos.
- Registros con severidad `critical` activa.
- Desglose por comprobaciÃ³n (`codeCount`).

Estas estadÃ­sticas no son una foto histÃ³rica fija: dependen de los checks activos (`activeCodes`) en ese momento.

### 3.3 Ficha del registro

La ficha lateral y el modal muestran:

- Resumen de severidad / "sin errores activos".
- Listado detallado de incidencias activas (`issues`).
- Campos implicados cuando existen en `issues.fields`.

### 3.4 Endpoints relacionados

- `POST /save-json` â€” solo persiste el valor editado, **no recalcula QA**.
- `POST /recompute-qa-errors` â€” desactivado (legacy).
- `POST /apply-qa-checks-filter` â€” desactivado (legacy).

---

## 4. LÃ³gica de Part Numbers (PN)

Resumen (detalle en [MILU_LOGICA_PART_NUMBERS.md](MILU_LOGICA_PART_NUMBERS.md)):

- **PN canÃ³nico**: `pn_final` (calculado), con fallback a `PART NO.` (`pn_raw`).
- NormalizaciÃ³n: trims, mayÃºsculas, eliminaciÃ³n de espacios internos segÃºn reglas del pipeline.
- ComparaciÃ³n PDFâ†”GESAâ†”RAW: los checks usan el primer valor disponible en la cascada `final â†’ gesa â†’ raw â†’ pdf`.
- **DecisiÃ³n global por PN**: ver `POST /pn-review/:sku/apply-decision` en [FLUJO_DATOS_MILU.md](FLUJO_DATOS_MILU.md).

---

## 5. Analista 02 â€” Mapeo de columnas

Vista `analista_02.html` con tabla comparativa **RAW / GESA / SUST / FINAL / PDF / ERR**.

- Mapeo implementado en [js/analista-02.js](../js/analista-02.js) (`buildComparisonRows()`).
- Cascada de fallback por columna: `FINAL â†’ GESA â†’ RAW`.
- **ERR**: pinta contadores de error de persistencia (`*_error`, `total_error`) con tooltip; no es lo mismo que los checks de la secciÃ³n 3.

Detalle completo: [07_analista_02_column_mapping.md](07_analista_02_column_mapping.md).

### 5.1 PestaÃ±a PN Review embebida

`analista_02.html` integra `js/pn-review-embedded.js`, que reusa la lÃ³gica de `pn_review.html`:

- Carga `GET /pn-review/:sku` + `GET /pn-review/:sku/sources`.
- Conflictos por familia detectados con `detectPnSourceConflicts`.
- Aplica decisiÃ³n con `POST /pn-review/:sku/apply-decision`.
- Callback `onDecisionApplied` revalida la fila actual y recalcula `renderReviewStats()`.

---

## 6. Tabla y rendimiento

- La columna **Error** y el filtro **Con error / Sin error** trabajan con cÃ¡lculo local, **sin persistencia auxiliar en disco**.
- Cualquier soporte residual a `qa_errors` o `qa_errors_active` se considera legacy.
- Objetivo arquitectural: mantener los JSON limpios de estado derivado.

Plan de rendimiento (UX-1, UX-2 del plan): vista compacta por defecto y virtualizaciÃ³n de la tabla. Ver [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md).

---

## 7. Notas operativas

- Si se modifica `server.js`, reiniciar `node server.js`.
- Si alguna UI invoca `/recompute-qa-errors` o `/apply-qa-checks-filter`, el backend responde como funcionalidad legacy desactivada.
- DiagnÃ³stico de persistencia: ver secciÃ³n 8 de [FLUJO_DATOS_MILU.md](FLUJO_DATOS_MILU.md).

---

## Referencias

- CanÃ³nico checks: [05_qa_errors_checks.md](05_qa_errors_checks.md)
- CanÃ³nico estados/acciones: [MILU_LOGICA_ESTADOS_ACCIONES.md](MILU_LOGICA_ESTADOS_ACCIONES.md)
- CanÃ³nico PN: [MILU_LOGICA_PART_NUMBERS.md](MILU_LOGICA_PART_NUMBERS.md)
- Mapeo Analista 02: [07_analista_02_column_mapping.md](07_analista_02_column_mapping.md)
- ImÃ¡genes/QA: [QA_MILU.md â†’ QA ImÃ¡genes](IMAGENES_ESQUEMAS_MILU.md)

