# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Contrato de revisiÃ³n QA

> **CONTRATO MILU â€” v1** Â· Fase: CONTRATOS + ESTABILIDAD Â· No modifica cÃ³digo ni datos.
>
> Reglas oficiales del flujo de revisiÃ³n humana QA: estados, acciones, decisiÃ³n por PN, endpoints autorizados.

## 1. Modelo persistido

Por cada fila de `engine_*.json`:

| Campo persistido | Valores oficiales |
|---|---|
| `qa_revision_estado` | `ok` Â· `pendiente` |
| `qa_revision_accion` | `importar` Â· `revisar` Â· `eliminar` Â· `copia` |
| `qa_revision_updated_at` | ISO 8601 |

**Nada mÃ¡s** se considera contrato. Otros `qa_revision_*` (motivo, confianza, origen, regla_aplicada) son trazabilidad opcional.

## 2. Significado

### `qa_revision_estado`

| Valor | Significado |
|---|---|
| `pendiente` | La fila aÃºn no ha sido revisada o necesita re-revisiÃ³n humana. |
| `ok` | La fila ha sido validada por QA y su decisiÃ³n es definitiva. |

### `qa_revision_accion`

| Valor | Significado |
|---|---|
| `importar` | La fila debe entrar al export (WordPress / catÃ¡logo). |
| `revisar` | Mantener visible para revisiÃ³n adicional; no exportar todavÃ­a. |
| `eliminar` | Descartar definitivamente; no exportar. |
| `copia` | Fila duplicada/hermana de otra ya tratada; no exportar como entrada independiente. |

## 3. Combinaciones canÃ³nicas

| `estado` | `accion` | Significado de negocio |
|---|---|---|
| `pendiente` | `revisar` | Caso tÃ­pico previo a decisiÃ³n. |
| `pendiente` | `importar` | (vÃ¡lido pero raro: marcado para importar pero aÃºn sin validar) |
| `ok` | `importar` | **DecisiÃ³n final**: exportar. |
| `ok` | `eliminar` | **DecisiÃ³n final**: descartar (equivalente a "descartar" en UI). |
| `ok` | `copia` | DecisiÃ³n final: es duplicado, no exportar como nuevo. |
| `ok` | `revisar` | Permitido pero ambiguo; tratar como pendiente lÃ³gico. |

## 4. Mapeo histÃ³rico â†’ canÃ³nico

[js/revision.js L92-L112](../../js/revision.js) normaliza inputs antiguos:

### Estado

| Input histÃ³rico | â†’ Normalizado |
|---|---|
| `ok`, `revisado` | `ok` |
| `descartado` | `ok` |
| `en revisiÃ³n`, `en revision`, `copia` | `pendiente` |
| vacÃ­o / null | `pendiente` |

### AcciÃ³n

| Input histÃ³rico | â†’ Normalizado |
|---|---|
| `importar`, `mantener` | `importar` |
| `revisar`, `actualizar`, `sustituir` | `revisar` |
| `eliminar`, `descartar` | `eliminar` |
| `copia` | `copia` |
| vacÃ­o / null | `importar` |

## 5. Regla "descartar"

- **La UI puede mostrar "descartar"** como etiqueta humana.
- **El valor persistido nunca es `descartar`**. Se traduce SIEMPRE a `(estado=ok, accion=eliminar)`.
- Cualquier uso de `"descartar"` como valor en disco es **legacy**; debe normalizarse en la siguiente lectura.
- API `POST /pn-review/:sku/apply-decision` acepta `action: 'descartar'` y lo traduce internamente ([server.js L1191-L1210](../../server.js)).

## 6. DecisiÃ³n por PN (agregada)

Implementada en [scripts/export_wordpress_milu.js L134-L181](../../scripts/export_wordpress_milu.js).

Para cada PN (`pn_final`), agrupando todas las filas de los 9 engines:

```
count_ok_importar  = filas con estado=ok    && accion=importar
count_ok_eliminar  = filas con estado=ok    && accion=eliminar
count_pending      = filas con estado âˆˆ {pendiente, "en revision", "en revisiÃ³n"}
count_review_action = filas con accion=revisar
```

**DecisiÃ³n final por PN**:

| CondiciÃ³n | DecisiÃ³n | `qa_validated` |
|---|---|---|
| `count_ok_importar > 0` | `import` | `true` |
| todas las filas: `estado=ok && accion=eliminar` | `discard` | `true` |
| cualquier otro caso | `pending_review` | `false` |

Razones expuestas en el trace: `qa_ok_importar_found`, `qa_all_ok_eliminar`, `qa_pending_or_mixed`.

## 7. Endpoints autorizados a modificar revisiÃ³n

Solo estos endpoints pueden tocar campos `qa_revision_*` en disco:

| Endpoint | Granularidad | Notas |
|---|---|---|
| `POST /save-json` | 1 campo Ã— 1 fila | ModificaciÃ³n puntual desde UI. |
| `POST /apply-revision-to-engines` | bulk | Aplica un payload de revisiÃ³n a mÃºltiples engines ([apply_revision_to_engines.js](../../apply_revision_to_engines.js)). |
| `POST /pn-review/:sku/apply-decision` | todas las filas de un PN | DecisiÃ³n agregada (`validar` / `revisar` / `descartar`). |
| `POST /pn-review/by-id/:id/apply-decision` | 1 fila | DecisiÃ³n sobre una fila concreta. |
| `POST /pn-review/apply-siblings-bulk` | filas hermanas | Marca como `copia` filas hermanas. |
| `POST /qa_revision_sync.php` | persistencia auxiliar | Escribe en [qa_revision_server_data.json](../../qa_revision_server_data.json), NO toca `engine_*.json` directamente. |

Cualquier otro endpoint que necesite modificar revisiÃ³n debe documentarse en este contrato y respetar las normalizaciones.

## 8. Endpoints solo de lectura de revisiÃ³n

`GET /qa_revision_sync.php`, `GET /pn-review/list`, `GET /pn-review/:sku`, `GET /pn-review/:sku/sources`, `GET /audit-log`.

## 9. Invariantes

1. Tras cualquier escritura, `qa_revision_estado âˆˆ {ok, pendiente}` y `qa_revision_accion âˆˆ {importar, revisar, eliminar, copia}`.
2. `descartar` nunca se persiste como valor de `qa_revision_accion`.
3. `qa_revision_updated_at` se actualiza cada vez que cambia `qa_revision_estado` o `qa_revision_accion`.
4. `qa_errors` y `qa_errors_active` **NO son parte del contrato QA** (son derivados; ver [CONTRATO_JSON_ENGINE.md Â§8](CONTRATO_JSON_ENGINE.md)).

## 10. Riesgos / pendientes (no resolver aÃºn)

- **R1**: La UI muestra "descartar"; cualquier comparaciÃ³n literal en cÃ³digo debe usar `accion === 'eliminar'`, no `'descartar'`.
- **R2**: MigraciÃ³n pendiente de filas legacy con `accion === 'descartar'`. Se normalizan en lectura pero no se reescriben masivamente.
- **R3**: Algunas reglas de export tratan `estado` con strings antiguos (`"en revision"`, `"en revisiÃ³n"`). Mantener compatibilidad hasta limpiar.

## 11. Fase I - compatibilidad controlada en escritura

- Las escrituras seguras de la fase I deben aceptar `descartar` en entrada y persistir `eliminar`.
- `measurement_final` puede seguir entrando como alias de `measure_final` en payloads legacy.
- `qa_revision_estado` queda restringido a `ok|pendiente` en las nuevas validaciones de escritura.

