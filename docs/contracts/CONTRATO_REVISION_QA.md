# Contrato de revisión QA

> **CONTRATO MILU — v1** · Fase: CONTRATOS + ESTABILIDAD · No modifica código ni datos.
>
> Reglas oficiales del flujo de revisión humana QA: estados, acciones, decisión por PN, endpoints autorizados.

## 1. Modelo persistido

Por cada fila de `engine_*.json`:

| Campo persistido | Valores oficiales |
|---|---|
| `qa_revision_estado` | `ok` · `pendiente` |
| `qa_revision_accion` | `importar` · `revisar` · `eliminar` · `copia` |
| `qa_revision_updated_at` | ISO 8601 |

**Nada más** se considera contrato. Otros `qa_revision_*` (motivo, confianza, origen, regla_aplicada) son trazabilidad opcional.

## 2. Significado

### `qa_revision_estado`

| Valor | Significado |
|---|---|
| `pendiente` | La fila aún no ha sido revisada o necesita re-revisión humana. |
| `ok` | La fila ha sido validada por QA y su decisión es definitiva. |

### `qa_revision_accion`

| Valor | Significado |
|---|---|
| `importar` | La fila debe entrar al export (WordPress / catálogo). |
| `revisar` | Mantener visible para revisión adicional; no exportar todavía. |
| `eliminar` | Descartar definitivamente; no exportar. |
| `copia` | Fila duplicada/hermana de otra ya tratada; no exportar como entrada independiente. |

## 3. Combinaciones canónicas

| `estado` | `accion` | Significado de negocio |
|---|---|---|
| `pendiente` | `revisar` | Caso típico previo a decisión. |
| `pendiente` | `importar` | (válido pero raro: marcado para importar pero aún sin validar) |
| `ok` | `importar` | **Decisión final**: exportar. |
| `ok` | `eliminar` | **Decisión final**: descartar (equivalente a "descartar" en UI). |
| `ok` | `copia` | Decisión final: es duplicado, no exportar como nuevo. |
| `ok` | `revisar` | Permitido pero ambiguo; tratar como pendiente lógico. |

## 4. Mapeo histórico → canónico

[js/revision.js L92-L112](../../js/revision.js) normaliza inputs antiguos:

### Estado

| Input histórico | → Normalizado |
|---|---|
| `ok`, `revisado` | `ok` |
| `descartado` | `ok` |
| `en revisión`, `en revision`, `copia` | `pendiente` |
| vacío / null | `pendiente` |

### Acción

| Input histórico | → Normalizado |
|---|---|
| `importar`, `mantener` | `importar` |
| `revisar`, `actualizar`, `sustituir` | `revisar` |
| `eliminar`, `descartar` | `eliminar` |
| `copia` | `copia` |
| vacío / null | `importar` |

## 5. Regla "descartar"

- **La UI puede mostrar "descartar"** como etiqueta humana.
- **El valor persistido nunca es `descartar`**. Se traduce SIEMPRE a `(estado=ok, accion=eliminar)`.
- Cualquier uso de `"descartar"` como valor en disco es **legacy**; debe normalizarse en la siguiente lectura.
- API `POST /pn-review/:sku/apply-decision` acepta `action: 'descartar'` y lo traduce internamente ([server.js L1191-L1210](../../server.js)).

## 6. Decisión por PN (agregada)

Implementada en [scripts/export_wordpress_milu.js L134-L181](../../scripts/export_wordpress_milu.js).

Para cada PN (`pn_final`), agrupando todas las filas de los 9 engines:

```
count_ok_importar  = filas con estado=ok    && accion=importar
count_ok_eliminar  = filas con estado=ok    && accion=eliminar
count_pending      = filas con estado ∈ {pendiente, "en revision", "en revisión"}
count_review_action = filas con accion=revisar
```

**Decisión final por PN**:

| Condición | Decisión | `qa_validated` |
|---|---|---|
| `count_ok_importar > 0` | `import` | `true` |
| todas las filas: `estado=ok && accion=eliminar` | `discard` | `true` |
| cualquier otro caso | `pending_review` | `false` |

Razones expuestas en el trace: `qa_ok_importar_found`, `qa_all_ok_eliminar`, `qa_pending_or_mixed`.

## 7. Endpoints autorizados a modificar revisión

Solo estos endpoints pueden tocar campos `qa_revision_*` en disco:

| Endpoint | Granularidad | Notas |
|---|---|---|
| `POST /save-json` | 1 campo × 1 fila | Modificación puntual desde UI. |
| `POST /apply-revision-to-engines` | bulk | Aplica un payload de revisión a múltiples engines ([apply_revision_to_engines.js](../../apply_revision_to_engines.js)). |
| `POST /pn-review/:sku/apply-decision` | todas las filas de un PN | Decisión agregada (`validar` / `revisar` / `descartar`). |
| `POST /pn-review/by-id/:id/apply-decision` | 1 fila | Decisión sobre una fila concreta. |
| `POST /pn-review/apply-siblings-bulk` | filas hermanas | Marca como `copia` filas hermanas. |
| `POST /qa_revision_sync.php` | persistencia auxiliar | Escribe en [qa_revision_server_data.json](../../qa_revision_server_data.json), NO toca `engine_*.json` directamente. |

Cualquier otro endpoint que necesite modificar revisión debe documentarse en este contrato y respetar las normalizaciones.

## 8. Endpoints solo de lectura de revisión

`GET /qa_revision_sync.php`, `GET /pn-review/list`, `GET /pn-review/:sku`, `GET /pn-review/:sku/sources`, `GET /audit-log`.

## 9. Invariantes

1. Tras cualquier escritura, `qa_revision_estado ∈ {ok, pendiente}` y `qa_revision_accion ∈ {importar, revisar, eliminar, copia}`.
2. `descartar` nunca se persiste como valor de `qa_revision_accion`.
3. `qa_revision_updated_at` se actualiza cada vez que cambia `qa_revision_estado` o `qa_revision_accion`.
4. `qa_errors` y `qa_errors_active` **NO son parte del contrato QA** (son derivados; ver [CONTRATO_JSON_ENGINE.md §8](CONTRATO_JSON_ENGINE.md)).

## 10. Riesgos / pendientes (no resolver aún)

- **R1**: La UI muestra "descartar"; cualquier comparación literal en código debe usar `accion === 'eliminar'`, no `'descartar'`.
- **R2**: Migración pendiente de filas legacy con `accion === 'descartar'`. Se normalizan en lectura pero no se reescriben masivamente.
- **R3**: Algunas reglas de export tratan `estado` con strings antiguos (`"en revision"`, `"en revisión"`). Mantener compatibilidad hasta limpiar.

## 11. Fase I - compatibilidad controlada en escritura

- Las escrituras seguras de la fase I deben aceptar `descartar` en entrada y persistir `eliminar`.
- `measurement_final` puede seguir entrando como alias de `measure_final` en payloads legacy.
- `qa_revision_estado` queda restringido a `ok|pendiente` en las nuevas validaciones de escritura.
