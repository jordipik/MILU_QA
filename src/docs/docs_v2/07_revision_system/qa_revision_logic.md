# QA Revision Logic

## Objetivo
Definir logica real de estado/accion de revision QA en MILU v1.

## Inputs
- Resultado de errores (`total_error`, `has_error`).
- Estado previo `qa_revision_estado`, `qa_revision_accion`.

## Outputs
- Valores actualizados de revision por registro.

## Scripts implicados
- `recompute_engine_errors.js` (actualizacion QA opcional).
- `server/services/revision-sync` y `server/services/revision-apply`.

## Endpoints implicados
- `POST /recalculate-revision-status`
- `GET/POST /qa_revision_sync.php`
- `POST /apply-revision-to-engines`

## Botones UI relacionados
- `recomputeRevisionStatusBtn`.
- Edicion manual de estado/accion en tablas QA/analista.

## Campos afectados
- `qa_revision_estado`, `qa_revision_accion`, `qa_revision_updated_at`.

## Flujo paso a paso
1. Sin errores -> `ok/importar`.
2. Con errores -> `pendiente/revisar` (salvo casos protegidos manuales).
3. Registros de ruido/footer -> `ok/eliminar`.
4. Sincronizacion remota de snapshot con `/qa_revision_sync.php`.
5. Aplicacion masiva de decisiones con `/apply-revision-to-engines`.

## Riesgos / problemas conocidos
- Coexisten decisiones automaticas y manuales; requiere gobernanza clara para no sobrescribir revisiones humanas.

## TODO pendiente
- Auditar trazabilidad completa de quien cambia revision y por que.

## Ejemplo real
- En engines actuales existen casos `qa_revision_estado=ok` con `qa_revision_accion=importar`, que habilitan export.
