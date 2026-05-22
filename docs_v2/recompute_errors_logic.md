# MILU V1 - Logica actual de recalculo de errores

Fecha de auditoria: 2026-05-22
Alcance auditado:
- analista_02.html
- js/analista-02.js
- recompute_engine_errors.js
- server.js (POST /recompute-qa-errors)

## 1) Flujo funcional (boton ERRORES)

### Contrato oficial de filtros del RecomputeModal

Filtros oficiales del modal:
- selector libro: `Todos los libros` o motor concreto.
- `ID puntual` opcional.

| Boton | Endpoint | Soporta libro | Soporta ID | Comportamiento |
|---|---|---|---|---|
| IMPORTAR PDF | `POST /api/pdf-preview/apply-to-engine` | Si | No | Ignora ID puntual, muestra aviso y trabaja por libro o todos. |
| CALCULO FINAL | `POST /copy-pdf-to-final-all-books` | Si | No | Ignora ID puntual, muestra aviso y trabaja por libro o todos. |
| ERRORES | `POST /recompute-qa-errors` | Si | Si | Respeta libro+ID; bloquea `Todos + ID`. |
| ESTADOS | `POST /recalculate-revision-status` | No (global) | No | Solo global; bloquea libro concreto o ID. |

Nota de separacion QA:
- ERRORES ejecuta con `updateRevision:false` y `forceRevision:false`.
- ESTADOS queda como paso separado para recalcular `qa_revision_estado` y `qa_revision_accion`.

### Boton del modal que dispara el calculo
- En el modal de recalculo, el boton es `#recomputeRunBtn` con texto ERRORES.
- El click esta enlazado con `bindClick('recomputeRunBtn', ...)` y ejecuta `runBackendRecompute()`.

### Endpoint llamado por ese boton
- `runBackendRecompute()` hace `fetch` POST a `/recompute-qa-errors` (via `getBackendCandidateUrls('recompute-qa-errors')`).
- Payload enviado desde UI:
  - `scope`: `current` | `book` | `all`
  - `file`: solo cuando scope != `all`
  - `id`: solo cuando scope == `current`
  - `dryRun`: `false`
  - `updateRevision`: `false` (fijo en ERRORES)
  - `forceRevision`: `false` (fijo en ERRORES)
  - `backup`: `true`

### Modulo que calcula realmente los *_error
- El calculo de `*_error` se hace en backend en `recompute_engine_errors.js`:
  - `computeErrorPayload(row)`
  - reglas en `QA_FIELD_CHECKS`
  - mapeo campo -> error en `FIELD_TO_ERROR_KEY`
- `server.js` solo valida payload, enruta por scope y llama:
  - `recomputeEngineErrors(...)` para `current` y `book`
  - `recomputeAllEngineErrors(...)` para `all`

### Nota para evitar confusion
- Existe otro boton llamado ERRORES fuera del modal: `#pdfRecomputeErrorsBtn` (toolbar PDF).
- Ese boton no abre modal; lanza recalculo rapido del registro actual y termina llamando tambien a backend.
- Para esta auditoria, el boton del modal es `#recomputeRunBtn`.

## 2) Reglas de calculo actuales por campo

Referencia tecnica:
- Cada `*_error` es la cantidad de checks fallidos del campo.
- Si un campo tiene 2 checks, su error puede ser 0, 1 o 2.
- Si un campo tiene 1 check, su error puede ser 0 o 1.
- Las comparaciones son exactas (igualdad estricta de string no vacio).

| Error | Reglas actuales (resumen literal) | Rango |
|---|---|---|
| pos_error | 1) `pos_final` no vacio. 2) Si hay `pos_pdf`/`POS`, debe ser exactamente igual a `pos_final`; si PDF vacio, este check pasa. | 0..2 |
| pn_error | 1) `pn_final` no vacio. 2) Si hay `pn_pdf`/`PART NO.`, debe igualar exactamente `pn_final`; si PDF vacio, pasa. | 0..2 |
| designation_error | 1) `designation_final` no vacio. 2) Debe coincidir con `designation_pdf` o `designation_gesa`. Si ambos (PDF y GESA) estan vacios, el check 2 pasa. | 0..2 |
| model_type_error | Check unico: si `model_type_final` y PDF estan ambos vacios, pasa. Si PDF tiene valor, exige igualdad exacta con final. Si PDF vacio y final no vacio, pasa. | 0..1 |
| qty_error | Igual patron que MODEL/TYPE usando `qty_final` y `qty_pdf`/`QTY`. | 0..1 |
| units_error | Igual patron que MODEL/TYPE usando `units_final` y `units_pdf`/`UNITS`. | 0..1 |
| weight_error | Check unico: pasa si todos vacios (`weight_final`, `weight_pdf`, `weight_gesa` con unidades, `weight_gesa` raw). Si hay datos, exige que `weight_final` coincida exactamente con al menos una fuente (PDF o GESA). | 0..1 |
| fn_error | Igual patron que MODEL/TYPE usando `fn_final` y `fn_pdf`/`FN`. | 0..1 |
| measure_error | Check unico: pasa si `measure_final`/`measurement_final`, PDF y GESA estan todos vacios. Si hay datos, exige coincidencia exacta con PDF o GESA. | 0..1 |
| norma_error | Check unico: pasa si final, PDF y GESA estan vacios. Si hay datos, exige coincidencia exacta final==PDF o final==GESA. | 0..1 |
| bom_error | Igual patron que MODEL/TYPE usando `bom_final`/`BOM-No.` y `bom_pdf`/`BOM-No.`. | 0..1 |
| fg_fgs_error | Igual patron que MODEL/TYPE usando `fg_fgs_final` y `fg_fgs_pdf`/`FG/FGS`. | 0..1 |
| total_error | Suma de todos los `*_error` definidos en `FIELD_TO_ERROR_KEY` (12 campos). | 0..N |
| has_error | Booleano: `true` si `total_error > 0`, en caso contrario `false`. | bool |

### 2.1) Listado detallado de reglas por campo (motor backend persistente)

Referencia tecnica de formulas base:
- `isCompareMatch(a, b)` solo aprueba si ambos son no vacios y exactamente iguales.
- En varios campos, si el valor PDF esta vacio, el check de match se considera aprobado.
- El `*_error` de cada campo es el numero de checks fallidos de ese campo.

#### POS -> pos_error
- Check 1 (obligatorio): `pos_final != ''`.
- Check 2 (match con PDF):
  - si `pos_pdf/POS == ''` -> aprueba
  - si no esta vacio -> exige `pos_final == pos_pdf/POS`
- Formula: `pos_error = fail(check1) + fail(check2)`

#### PART NO. -> pn_error
- Check 1 (obligatorio): `pn_final != ''`.
- Check 2 (match con PDF):
  - si `pn_pdf/PART NO. == ''` -> aprueba
  - si no esta vacio -> exige `pn_final == pn_pdf/PART NO.`
- Formula: `pn_error = fail(check1) + fail(check2)`

#### DESIGNATION -> designation_error
- Check 1 (obligatorio): `designation_final != ''`.
- Check 2 (match PDF o GESA):
  - si `designation_pdf == ''` y `designation_gesa == ''` -> aprueba
  - en otro caso -> exige `designation_final == designation_pdf` o `designation_final == designation_gesa`
- Formula: `designation_error = fail(check1) + fail(check2)`

#### MODEL/TYPE -> model_type_error
- Check unico:
  - si `model_type_final == ''` y `model_type_pdf/MODEL/TYPE == ''` -> aprueba
  - si PDF no vacio -> exige igualdad exacta
  - si PDF vacio y final no vacio -> aprueba
- Formula: `model_type_error = fail(check_unico)`

#### QTY -> qty_error
- Mismo patron que MODEL/TYPE.
- Formula: `qty_error = fail(check_unico)`

#### UNITS -> units_error
- Mismo patron que MODEL/TYPE.
- Formula: `units_error = fail(check_unico)`

#### WEIGHT -> weight_error
- Check unico multi-fuente:
  - si todos vacios (`weight_final`, `weight_pdf`, `weight_gesa`, `weight_gesa_raw`) -> aprueba
  - en otro caso -> exige match exacto de `weight_final` con al menos una fuente:
    - `weight_pdf`, o
    - `weight_gesa` (con units), o
    - `weight_gesa_raw`
- Formula: `weight_error = fail(check_unico)`

#### FN -> fn_error
- Mismo patron que MODEL/TYPE.
- Formula: `fn_error = fail(check_unico)`

#### MEASUREMENT / STANDARD -> measure_error
- Check unico:
  - si `measure_final/measurement_final`, `measure_pdf`, `dimensions_gesa/measure_gesa` estan todos vacios -> aprueba
  - en otro caso -> exige match exacto final==PDF o final==GESA
- Formula: `measure_error = fail(check_unico)`

#### NORMA -> norma_error
- Check unico:
  - si `norma_final/norma`, `norma_pdf/norma_raw`, `norma_gesa/norma` estan todos vacios -> aprueba
  - en otro caso -> exige match exacto final==PDF o final==GESA
- Formula: `norma_error = fail(check_unico)`

#### BOM-No. -> bom_error
- Check unico:
  - si `bom_final/BOM-No.` y `bom_pdf/BOM-No.` estan ambos vacios -> aprueba
  - si PDF no vacio -> exige igualdad exacta
  - si PDF vacio y final no vacio -> aprueba
- Formula: `bom_error = fail(check_unico)`

#### FG/FGS -> fg_fgs_error
- Check unico:
  - si `fg_fgs_final` y `fg_fgs_pdf/FG/FGS` estan ambos vacios -> aprueba
  - si PDF no vacio -> exige igualdad exacta
  - si PDF vacio y final no vacio -> aprueba
- Formula: `fg_fgs_error = fail(check_unico)`

#### total_error
- Formula: suma de todos los errores de campo definidos:
  - `pos_error + pn_error + designation_error + model_type_error + qty_error + units_error + weight_error + fn_error + measure_error + fg_fgs_error + bom_error + norma_error`

#### has_error
- Formula booleana:
  - `has_error = (total_error > 0)`

## 3) Cobertura de alcance del endpoint

Endpoint: POST `/recompute-qa-errors`

Soportes confirmados:
- ID individual:
  - `scope = current`
  - con `file` valido (`engine_*.json`) y `id` puntual
  - llama `recomputeEngineErrors({ file, id, ... })`
- Libro completo:
  - `scope = book`
  - con `file` valido
  - backend fuerza `id = ''`
  - llama `recomputeEngineErrors({ file, id: '', ... })`
- Todos los libros:
  - `scope = all`
  - no usa `file`
  - `id` no permitido (valida y rechaza)
  - llama `recomputeAllEngineErrors(...)`

## 4) Resumen de arquitectura de ejecucion

1. Usuario pulsa ERRORES en modal (`#recomputeRunBtn`).
2. Frontend arma payload segun scope/UI.
3. POST `/recompute-qa-errors`.
4. Backend valida (`scope`, `file`, `id`, flags).
5. Backend ejecuta `recompute_engine_errors.js` sobre fila, libro o todos los libros.
6. Se actualizan `*_error`, `total_error`, `has_error` y se escribe JSON (con backup si hay cambios).
7. Frontend muestra resumen por tipos de error y top reglas.

## 5) Riesgos conocidos (sin cambiar logica)

1. Comparacion estricta de string: no hay normalizacion de trim/case/espacios en `normalizeCompareValue` (solo `String(value)`), lo que puede generar falsos positivos por formato.
2. `scope=current` en backend no obliga `id` no vacio. La UI si lo exige, pero una llamada externa sin `id` podria recalcular libro completo.
3. El titulo/subtitulo del modal describe pipeline amplio, pero el boton ERRORES solo recalcula errores (no importa PDF ni recalcula FINAL por si mismo).
4. El recuento de `total_error` depende solo de los 12 campos en `FIELD_TO_ERROR_KEY`; campos fuera de esa lista no impactan el total aunque existan checks en otros modulos.

## 6) Conclusiones operativas

- El boton correcto del modal para calcular errores QA es `recomputeRunBtn`.
- El endpoint correcto es `POST /recompute-qa-errors`.
- El modulo fuente de verdad para `*_error`, `total_error` y `has_error` es `recompute_engine_errors.js`.
- El endpoint soporta correctamente los 3 alcances requeridos: ID individual, libro, todos los libros.
