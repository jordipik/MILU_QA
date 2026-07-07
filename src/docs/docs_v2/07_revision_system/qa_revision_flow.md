# QA Revision Flow

## Objetivo
Consolidar el flujo real de estados/acciones de revision y su persistencia.

## Endpoints activos
- `GET /qa_revision_sync.php`: lee snapshot de revision.
- `POST /qa_revision_sync.php`: persiste snapshot normalizado en `qa_revision_server_data.json`.
- `POST /apply-revision-to-engines`: aplica revisiones a engines.
- `POST /api/recompute-simple/update-states`: recalcula estado/accion por engine/ID usando `scripts/update_revision_states.js`.
- `POST /recalculate-revision-status`: recalculo global coexistente (usa recompute errors con `updateRevision=true`).

## Regla base de estados
Desde `scripts/update_revision_states.js`:
- Si `fn_final == KE` -> `qa_revision_estado=ok`, `qa_revision_accion=eliminar`
- Si hay errores -> `qa_revision_estado=pendiente`, `qa_revision_accion=revisar`
- Si no hay errores -> `qa_revision_estado=ok`, `qa_revision_accion=importar`

## Relacion con ERRORES
`POST /recompute-qa-errors` puede actualizar QA cuando se ejecuta con `updateRevision=true`.
En `recompute_simple`, ERRORES se lanza con `updateRevision=false`, dejando ESTADOS como paso separado.

## Persistencia
- Snapshot remoto/local: `qa_revision_server_data.json`.
- Aplicacion final a registros: `/apply-revision-to-engines`.

## Nota operativa
Existen dos rutas para recalcular estados (`/api/recompute-simple/update-states` y `/recalculate-revision-status`).
En DOC V2 se toma como referencia principal la de recompute simple, por control de engine/ID.
