# Análisis: Filtros del RecomputeModal — MILU V1

**Fecha:** 2026-05-22  
**Archivos auditados:** `analista_02.html`, `js/analista-02.js`, `server.js`, `recompute_engine_errors.js`

---

## 1. Resumen ejecutivo

El RecomputeModal ya tiene una UI simplificada: solo dos controles visibles (`recomputeBookSelect` + `recomputeIdInput`). No hay selector de "alcance de errores" en la UI actual, lo que es correcto.

El problema real es que los cuatro botones tienen **comportamientos inconsistentes** respecto a estos dos filtros: algunos los respetan, algunos los ignoran silenciosamente, y uno los bloquea activamente aunque el backend podría soportarlos. Se detalla botón a botón más abajo.

El botón **ERRORES** es el más completo: respeta libro y ID, y deriva el `scope` internamente de forma correcta. El botón **ESTADOS** es el más problemático: su endpoint backend ignora todo filtro y siempre procesa todos los libros.

---

## 2. Estado actual de los controles de filtro

### HTML (`analista_02.html`, líneas 349-460)

| Control HTML | ID | Tipo | Visible | Valor por defecto |
|---|---|---|---|---|
| Selector de libro | `recomputeBookSelect` | `<select>` real | ✅ Sí | Motor del filtro principal, o `"all"` |
| ID puntual | `recomputeIdInput` | `<input type="search">` | ✅ Sí | Vacío |
| Flag updateRevision | `recomputeUpdateRevisionInput` | `<input type="checkbox" hidden>` | ❌ Oculto | `false` (siempre) |
| Flag forceRevision | `recomputeForceRevisionInput` | `<input type="checkbox" hidden>` | ❌ Oculto | `false` (siempre) |
| Botón PDF_AUTO | `recomputePdfRunBtn` | `<button hidden>` | ❌ Oculto | — |

**Notas:**
- `recomputeBookSelect` es un `<select>` real, poblado por `syncRecomputeBookSelect()` con "Todos los libros" + uno por cada motor cargado.
- Al abrir el modal, el select se pre-rellena con el motor activo en `engineFilterSelect` (filtro principal de la página), lo que es un buen default.
- El título del modal (`<h2>`) es `"Recalcular todos los libros"` — hardcodeado, no refleja el libro seleccionado.
- Los checkboxes ocultos (`updateRevision`, `forceRevision`) siempre valen `false` porque el usuario no puede marcarlos. Son un vestigio que condiciona silenciosamente el comportamiento de ERRORES.

---

## 3. Tabla botón → endpoint → filtros usados → comportamiento real

| Botón | Función JS | Endpoint | Lee `book` | Lee `id` | Envía `book` | Envía `id` | Scope soportado |
|---|---|---|---|---|---|---|---|
| **1 IMPORTAR PDF** | `runApplyBookPreviewToEngines()` | `POST /api/pdf-preview/apply-to-engine` | ✅ | ❌ Ignorado | ✅ como `engine` | ❌ No | Por libro o todos |
| **2 CÁLCULO FINAL** | `runBackendCalculateFinal()` | `POST /copy-pdf-to-final-all-books` | ✅ | ❌ Ignorado | ✅ como `file` | ❌ No | Por libro o todos |
| **3 ERRORES** | `runBackendRecompute()` | `POST /recompute-qa-errors` | ✅ | ✅ | ✅ como `scope`+`file` | ✅ | Todos / libro / ID puntual |
| **4 ESTADOS** | `runBackendRecalculateRevisionStatus()` | `POST /recalculate-revision-status` | ✅ (leer) | ✅ (leer) | ❌ Bloqueado | ❌ Bloqueado | Solo todos (hardcoded) |

### Detalle por botón

#### Botón 1 — IMPORTAR PDF (`recomputeCopyBookBtn`)

```
handler → runApplyBookPreviewToEngines(filters)
  filters.book → selectedModel (o '' si 'all')
  filters.id  → leído pero NUNCA incluido en el payload

payload enviado:
  { engine: selectedModel }   si hay libro seleccionado
  {}                          si book = 'all'
```

- El backend acepta solo `{ engine? }`. No existe soporte de `id` en este endpoint.
- Si el usuario rellena el campo ID esperando importar solo ese registro, el ID se ignora silenciosamente y se importa **todo el motor seleccionado**.
- El script Python subyacente (`apply_book_preview_to_engine.py` / `apply_all_book_previews.py`) no admite filtro por ID.

#### Botón 2 — CÁLCULO FINAL (`recomputeCalculateFinalBtn`)

```
handler → runBackendCalculateFinal(filters)
  filters.book → targetFile (resuelto por resolveEngineFileFromFilter())
  filters.id  → leído pero NUNCA incluido en el payload

payload enviado:
  { file: targetFile, backup: true }   si hay libro seleccionado
  { backup: true }                     si book = 'all'
```

- Backend `/copy-pdf-to-final-all-books` acepta `{ file?, files?, backup? }`. No existe soporte de `id`.
- Si el usuario rellena el campo ID, se ignora silenciosamente y se aplica `FINAL_FIELDS_V1` a todas las filas del archivo.

#### Botón 3 — ERRORES (`recomputeRunBtn`) ✅ Bien implementado

```
handler → runBackendRecompute(filters)
  filters.book → selectedModel
  filters.id  → id

lógica de scope:
  if (!selectedModel && id) → ERROR (bloquea con mensaje claro)
  scope = !selectedModel ? 'all' : (id ? 'current' : 'book')
  file = scope === 'all' ? '' : resolveEngineFileFromFilter(selectedModel)

payload enviado:
  { scope, dryRun: false, updateRevision: false*, forceRevision: false*, backup: true, file?, id? }
```

*`updateRevision` y `forceRevision` provienen de los checkboxes ocultos → siempre `false`.  
Esto significa que ERRORES **nunca actualiza `qa_revision_estado` ni `qa_revision_accion`**, aunque el backend lo soporta plenamente.

**Matriz de comportamiento de ERRORES:**

| `book` | `id` | Comportamiento real |
|---|---|---|
| `"all"` | vacío | Recalcula errores de **todos los libros** ✅ |
| Motor concreto | vacío | Recalcula errores del **libro seleccionado** ✅ |
| Motor concreto | ID informado | Recalcula errores del **ID dentro del libro** ✅ |
| `"all"` | ID informado | **Bloqueado** con mensaje de error claro ✅ |

Todos los casos del contrato objetivo están cubiertos y funcionan correctamente.

#### Botón 4 — ESTADOS (`recomputeRevisionStatusBtn`) ⚠️ Problemático

```
handler → runBackendRecalculateRevisionStatus(filters)
  filters.book → selectedModel
  filters.id  → id

lógica:
  if (selectedModel || id) → ERROR: "ESTADOS solo soporta 'Todos los libros'"
  → payload: {}  (siempre vacío)

backend /recalculate-revision-status:
  → ignora req.body completamente
  → itera TODOS los ENGINE_JSON_FILES
  → llama recomputeEngineErrors({ file, updateRevision: true }) por cada uno
```

- El frontend bloquea activamente si hay libro o ID seleccionado.
- El backend ignora el body y siempre procesa todos los libros.
- Tiene **redundancia** con ERRORES: hace exactamente lo mismo que ERRORES con `scope=all`, `updateRevision=true`, `forceRevision=false`.

---

## 4. Análisis de `recompute_engine_errors.js`

### Funciones exportadas

| Función | Parámetros clave | Alcance |
|---|---|---|
| `recomputeEngineErrors(opts)` | `file`, `id?`, `dryRun`, `updateRevision`, `forceRevision`, `backup` | Libro concreto, filas opcionales por ID |
| `recomputeAllEngineErrors(opts)` | `dryRun`, `updateRevision`, `forceRevision`, `backup` (NO `id`) | Todos los libros |

### Campos comparados y lógica de error

Los 12 campos auditados son:

| Campo de origen | Campo `*_error` calculado | Comparación |
|---|---|---|
| POS | `pos_error` | `pos_final` vs `pos_pdf` |
| PART NO. | `pn_error` | `pn_final` vs `pn_pdf` |
| DESIGNATION | `designation_error` | `designation_final` vs `designation_pdf` OR `designation_gesa` |
| MODEL/TYPE | `model_type_error` | `model_type_final` vs `model_type_pdf` (si pdf no vacío) |
| QTY | `qty_error` | `qty_final` vs `qty_pdf` (si pdf no vacío) |
| UNITS | `units_error` | `units_final` vs `units_pdf` (si pdf no vacío) |
| WEIGHT | `weight_error` | `weight_final` vs `weight_pdf` OR `weight_gesa` (con unidades) |
| FN | `fn_error` | `fn_final` vs `fn_pdf` (si pdf no vacío) |
| MEASUREMENT / STANDARD | `measure_error` | `measure_final` vs `measure_pdf` OR `dimensions_gesa` |
| FG/FGS | `fg_fgs_error` | `fg_fgs_final` vs `fg_fgs_pdf` (si pdf no vacío) |
| BOM-No. | `bom_error` | `bom_final` vs `bom_pdf` (si pdf no vacío) |
| NORMA | `norma_error` | `norma_final` vs `norma_pdf` OR `norma_gesa` |

**Reglas generales de cálculo:**
- Si `*_final` vacío: siempre error (excepto campos opcionales como MODEL/TYPE donde si ambos vacíos no hay error).
- Si referencia (`*_pdf` / `*_gesa`) vacía: no hay error aunque `*_final` tenga valor.
- `total_error` = suma de todos los `*_error`.
- `has_error` = `total_error > 0`.

**Campos de revisión (QA):**  
Solo se modifican si `updateRevision = true`. La función NO toca `qa_revision_estado` ni `qa_revision_accion` si `updateRevision = false` (que es siempre el caso para el botón ERRORES ya que el checkbox está oculto).

El botón ESTADOS provoca `updateRevision=true` indirectamente (vía `/recalculate-revision-status` que hardcodea `updateRevision: true` en su llamada interna a `recomputeEngineErrors`).

---

## 5. Problemas encontrados

### P1 — ID silenciosamente ignorado en IMPORTAR PDF y CÁLCULO FINAL
**Gravedad:** Media (confusión de usuario, no bug funcional)  
Los botones 1 y 2 leen `filters.id` del modal pero nunca lo usan. Si el usuario escribe un ID creyendo que restringirá el alcance, se aplica la operación a todo el motor (o a todos los motores).  
**Causa:** Los endpoints subyacentes no soportan filtro por ID (el script Python y la función `resolvePdfToFinalUpdatesForRow` operan fila a fila sin filtro externo). No es un bug del frontend, sino una limitación del backend.  
**Fix mínimo sugerido:** Deshabilitar o limpiar el campo ID cuando se pulse botón 1 o 2, o mostrar un aviso visible de que el ID no aplica a esos pasos.

### P2 — ESTADOS solo funciona con "Todos los libros"
**Gravedad:** Media  
El botón ESTADOS bloquea ejecución si hay libro o ID seleccionado. El endpoint no acepta filtros. Esto hace que el usuario deba siempre cambiar el selector a "Todos" para usar ESTADOS, lo cual es frustrante si acaba de calcular errores de un libro concreto.  
**Causa:** `/recalculate-revision-status` está implementado como "siempre todos". No hay rama de un solo libro.

### P3 — `updateRevision` nunca activo en ERRORES
**Gravedad:** Baja (es intencional por diseño, pero puede ser confuso)  
Los checkboxes `recomputeUpdateRevisionInput` y `recomputeForceRevisionInput` están ocultos y siempre en `false`. Por tanto, ERRORES recalcula `*_error`, `total_error` y `has_error`, **pero nunca actualiza `qa_revision_estado`/`qa_revision_accion`**. Eso queda exclusivamente en manos de ESTADOS.  
Esta separación es válida como diseño (ERRORES solo detecta, ESTADOS actualiza revisión), pero no está documentada en la UI ni en los `aria-label` de los artículos.

### P4 — Título del modal hardcodeado
**Gravedad:** Cosmética  
`<h2 id="recomputeModalTitle">Recalcular todos los libros</h2>` no cambia aunque el usuario seleccione un motor concreto.

### P5 — ESTADOS es redundante con ERRORES scope=all + updateRevision=true
**Gravedad:** Baja (complejidad innecesaria)  
`/recalculate-revision-status` hace internamente lo mismo que `/recompute-qa-errors` con `{ scope: 'all', updateRevision: true }`. Son dos rutas para la misma operación. Esto multiplica código de mantenimiento y crea confusión sobre cuál usar.

### P6 — Endpoint ESTADOS ignora `req.body` completamente
**Gravedad:** Baja  
No hay validación de body en `/recalculate-revision-status`. Cualquier payload es ignorado silenciosamente. No es un riesgo de seguridad (endpoint local-only) pero es inconsistente con el resto de endpoints.

---

## 6. Contrato objetivo de filtros

El contrato deseado para el RecomputeModal es:

```
Filtros visibles:
  - recomputeBookSelect: "Todos los libros" | <motor concreto>
  - recomputeIdInput:    vacío | <ID puntual>

Reglas:
  - book=todos + id=vacío   → operar sobre todos los libros
  - book=motor + id=vacío   → operar sobre ese motor
  - book=motor + id=valor   → operar solo sobre ese ID dentro del motor
  - book=todos + id=valor   → BLOQUEAR con error claro (solo aplicable a ERRORES)

Por botón:
  - IMPORTAR PDF:   book respetado, id no aplica (mostrar aviso o deshabilitar campo)
  - CÁLCULO FINAL:  book respetado, id no aplica (ídem)
  - ERRORES:        book + id respetados completamente ✅ (ya cumple)
  - ESTADOS:        debería respetar book al menos; ID es un plus
```

---

## 7. Cambios mínimos recomendados

Los siguientes cambios son de bajo riesgo y mejoran la claridad sin refactorizar el pipeline:

### C1 — Aclarar que ID no aplica a botones 1 y 2
**Complejidad:** muy baja  
Añadir en la descripción (`a2-step-desc`) de los pasos 1 y 2 una nota explícita: "El campo ID puntual no aplica a este paso."  
O alternativamente, en `runApplyBookPreviewToEngines` y `runBackendCalculateFinal`, emitir un `console.warn` si `filters.id` está relleno y no se usa.

### C2 — Dar soporte de libro a ESTADOS
**Complejidad:** media  
Modificar `/recalculate-revision-status` para que acepte `{ file? }` y solo procese ese motor, o (más limpio) eliminar el endpoint ESTADOS y redirigir el botón a `/recompute-qa-errors` con `{ scope, file, updateRevision: true }`.  
Esto también resuelve P2 y P5 de un solo golpe.

### C3 — Actualizar título del modal dinámicamente
**Complejidad:** muy baja  
En el listener `change` de `recomputeBookSelect` (ya existe, línea ~3418), actualizar también el `<h2>` con el motor seleccionado o "Todos los libros".

### C4 — Eliminar o exponer los checkboxes ocultos
**Complejidad:** baja  
Si `updateRevision` y `forceRevision` siempre son `false` para ERRORES, el código que los lee es ruido innecesario. Eliminarlos del código de `runBackendRecompute`, hardcodeando `false`. O, si se quiere exponer la opción de "también actualizar estado de revisión" al ejecutar ERRORES, convertir el checkbox en visible.

---

## 8. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Al unificar ESTADOS y ERRORES, comportamiento de `forceRevision` puede cambiar | Baja | Medio | Mantener `forceRevision: false` como default; solo exponer si hay caso de uso claro |
| Cambiar ESTADOS para soportar filtro de libro puede afectar flujos que dependen del "todos" | Baja | Bajo | Mantener retrocompatibilidad: si `file` vacío → todos |
| Eliminar los checkboxes ocultos puede romper tests unitarios futuros que los referencien | Baja | Bajo | Limpiar referencias antes de eliminar |
| El ID vacío en botones 1/2 ya no da feedback → usuario puede confundirse | Bajo | Bajo | Añadir `console.warn` de diagnóstico al menos |

---

## 9. Pruebas manuales sugeridas

Abrir `http://localhost:3000/analista_02.html` → Botón "Rec." → Modal.

| # | Escenario | Pasos | Resultado esperado |
|---|---|---|---|
| M1 | ERRORES · todos | `book=Todos`, `id=vacío`, pulsar ERRORES | Recalcula todos los libros, resumen muestra N libros |
| M2 | ERRORES · libro | `book=12V4000M40A`, `id=vacío`, pulsar ERRORES | Solo procesa engine_12V4000M40A.json |
| M3 | ERRORES · ID puntual | `book=12V4000M40A`, `id=<ID válido>`, pulsar ERRORES | Solo recalcula ese registro |
| M4 | ERRORES · ID sin libro | `book=Todos`, `id=<cualquier>`, pulsar ERRORES | Error claro: "selecciona un libro concreto" |
| M5 | ERRORES · ID inexistente | `book=12V4000M40A`, `id=XYZNOTFOUND`, pulsar ERRORES | HTTP 404 con mensaje claro |
| M6 | IMPORTAR PDF · con ID | `book=12V4000M40A`, `id=<ID válido>`, pulsar IMPORTAR PDF | Aplica a todo el motor (ID ignorado); verificar en consola que no hay error |
| M7 | CÁLCULO FINAL · libro | `book=12V4000M40A`, `id=vacío`, pulsar CÁLCULO FINAL | Solo aplica FINAL_FIELDS_V1 al engine seleccionado |
| M8 | ESTADOS · con libro | `book=12V4000M40A`, `id=vacío`, pulsar ESTADOS | Error: "solo soporta Todos los libros" (comportamiento actual documentado) |
| M9 | ESTADOS · todos | `book=Todos`, `id=vacío`, pulsar ESTADOS | Procesa todos, devuelve totalRecords y changedRecords |
| M10 | Apertura modal | Motor `16V4000M73` seleccionado en filtro principal, abrir modal | `recomputeBookSelect` pre-rellena a `16V4000M73` |

---

## 10. Pruebas automáticas sugeridas

```js
// recompute_engine_errors.test.js (Jest / Node)

describe('recomputeEngineErrors', () => {
  it('scope=all → procesa todos los motores y no acepta id', () => {
    expect(() => recomputeAllEngineErrors({ id: 'X' })).toThrow(/no admite ID/);
  });

  it('scope=book → procesa solo el archivo indicado', () => {
    const result = recomputeEngineErrors({ file: 'engine_12V4000M40A.json', dryRun: true });
    expect(result.file).toBe('engine_12V4000M40A.json');
    expect(typeof result.scanned).toBe('number');
  });

  it('scope=current → solo recalcula el ID indicado', () => {
    const result = recomputeEngineErrors({ file: 'engine_12V4000M40A.json', id: '<ID_REAL>', dryRun: true });
    expect(result.mode).toBe('single-id');
    expect(result.scanned).toBe(1);
  });

  it('ID inexistente → lanza error descriptivo', () => {
    expect(() =>
      recomputeEngineErrors({ file: 'engine_12V4000M40A.json', id: 'XYZNOTFOUND', dryRun: true })
    ).toThrow(/no se encontro ningun registro/i);
  });

  it('updateRevision=false → no modifica qa_revision_estado', () => {
    // dryRun=true → no escribe disco; verificar que applyToRow no asigna qa_revision_*
    const row = { ID: 'TEST', total_error: 1, qa_revision_estado: 'ok' };
    // applyToRow no es exportada; este test requiere exponer la función o testear via recomputeEngineErrors
  });
});

// Endpoint tests (supertest + server.js)

describe('POST /recompute-qa-errors', () => {
  it('scope=all + id → 400', async () => {
    const res = await request(app).post('/recompute-qa-errors')
      .send({ scope: 'all', id: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('scope=book sin file → 400', async () => {
    const res = await request(app).post('/recompute-qa-errors')
      .send({ scope: 'book' });
    expect(res.status).toBe(400);
  });
});
```

---

## Apéndice: Mapa de llamadas completo

```
[recomputeBookSelect + recomputeIdInput]
        │
        ▼ getRecomputeModalFilters() → { book, id }
        │
        ├─► [Btn 1 IMPORTAR PDF]
        │       runApplyBookPreviewToEngines(filters)
        │       book → engine (o todos)
        │       id  → IGNORADO
        │       POST /api/pdf-preview/apply-to-engine
        │         └─► python apply_book_preview_to_engine.py / apply_all_book_previews.py
        │
        ├─► [Btn 2 CÁLCULO FINAL]
        │       runBackendCalculateFinal(filters)
        │       book → file (o todos)
        │       id  → IGNORADO
        │       POST /copy-pdf-to-final-all-books
        │         └─► resolvePdfToFinalUpdatesForRow() × filas
        │
        ├─► [Btn 3 ERRORES]  ← filtros completos ✅
        │       runBackendRecompute(filters)
        │       book → scope + file
        │       id  → id (si book concreto)
        │       POST /recompute-qa-errors
        │         ├─ scope=all   → recomputeAllEngineErrors()
        │         └─ scope!=all  → recomputeEngineErrors({ file, id })
        │
        └─► [Btn 4 ESTADOS]  ← filtros bloqueados ⚠️
                runBackendRecalculateRevisionStatus(filters)
                book → solo verifica que sea 'all', si no bloquea
                id  → solo verifica que sea '', si no bloquea
                POST /recalculate-revision-status
                  └─► recomputeEngineErrors({ file, updateRevision: true }) × todos los libros
```
