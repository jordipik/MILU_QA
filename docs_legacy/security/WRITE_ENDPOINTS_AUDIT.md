# Write Endpoints Audit

Inventario de endpoints que escriben en disco o modifican persistencia derivada.

## Criterio

- `usa QA`: el endpoint modifica o consume campos de revision QA.
- `afecta exports`: el cambio puede alterar salida WordPress, PN Review o calculos derivados.
- `severidad`: impacto si un payload invalido pasa sin control.

| Endpoint | Metodo | Archivos afectados | Payload esperado | Validacion actual | Riesgos | Severidad | usa QA | afecta exports |
|---|---|---|---|---|---|---|---|---|
| `/save-json` | POST | un `engine_*.json` | `{file, id, field, value}` | file/id/field + whitelist + tipos basicos | escritura arbitraria si field no se limita | alta | Si | Si |
| `/save-json.php` | POST | un `engine_*.json` | alias de `/save-json` | misma validacion que `/save-json` | igual que `/save-json` | alta | Si | Si |
| `/apply-revision-to-engines` | POST | multiples `engine_*.json` | payload de revision v2/legacy | objeto JSON + validacion de payload base | escritura masiva no controlada | alta | Si | Si |
| `/pn-review/:sku/apply-decision` | POST | todos los `engine_*.json` con el PN | `{action}` o `{estado,accion}` | action/estado/accion canónicos | decision incorrecta propagada a todo el PN | alta | Si | Si |
| `/pn-review/:sku/apply-values` | POST | todos los `engine_*.json` con el PN | `{fields{...}}` | objeto `fields` + valores escalarizados | propagacion de campos inesperados | alta | Si | Si |
| `/pn-review/apply-siblings-bulk` | POST | multiples `engine_*.json` | `{items[]}` | array no vacio + limite + checks de PN/ID por item | bulk copy incorrecto | alta | Si | Si |
| `/pn-review/by-id/:id/apply-decision` | POST | un `engine_*.json` | `{action}` o `{estado,accion}` | action/estado/accion canónicos + lookup por ID | write puntual a fila incorrecta | alta | Si | Si |
| `/recompute-qa-errors` | POST | un `engine_*.json` | `{file, id?, dryRun?, updateRevision?, forceRevision?, backup?}` | file permitido + payload acotado | recomputo accidental sobre archivo no permitido | media | Si | Si |
| `/recompute-pdf-auto` | POST | un `engine_*.json` | `{file, id?, dryRun?, backup?}` | file permitido + payload acotado | escritura de campos PDF por payload invalido | alta | No | Si |
| `/qa_revision_sync.php` | POST | `qa_revision_server_data.json` | objeto revision sync | objeto no vacio + tamaño acotado | persistencia auxiliar corrupta | media | Si | No |
| `/audit-log` | POST | `qa_audit_log.json` | objeto auditoria | objeto no vacio + tamaño acotado | log corrupto o demasiado grande | media | Si | No |
| `/audit-log` | DELETE | `qa_audit_log.json` | sin payload | sin payload | borrado accidental del log | alta | Si | No |

## Observaciones

- `save-json.php` es un alias HTTP de compatibilidad; no tiene flujo de escritura independiente.
- Los endpoints PN Review escriben `qa_revision_estado`, `qa_revision_accion` y `qa_revision_updated_at`.
- `descartar` sigue siendo compatible a nivel de entrada y se normaliza a `eliminar`.
- `measurement_final` sigue aceptandose como alias legacy para `measure_final`.
- No se documenta SQLite write porque esta fase no migra persistencia.

## Estado Fase I (cierre BK-1)

- `/save-json`, `/save-json.php` y `/apply-revision-to-engines` quedan **validados funcionalmente** con cobertura HTTP real en `tests/security/write-validation.test.js` (16/16 OK).
- Respuesta de error garantizada en JSON en todos los caminos (validacion, error logico, error de IO). No se sirve HTML ni el PHP legacy.
- Roundtrip de `/save-json` verificado sobre `engine_12V4000M40A.json` (write + restore sin residuos, lock por archivo activo).
- `/apply-revision-to-engines` rechaza payload vacio/no-objeto/excedido y acepta `{revisions:{}}` como no-op no destructivo.
- Compatibilidad UI preservada: `qa_milu.html` envia `{file,id,col,value}` y el backend acepta `col` como alias de `field`.
