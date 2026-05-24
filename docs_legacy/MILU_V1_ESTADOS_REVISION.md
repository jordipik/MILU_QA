# MILU V1 - Boton 4 ESTADOS

## Que hace
El boton 4 ESTADOS recalcula automaticamente `qa_revision_estado` y `qa_revision_accion` en los `engine_*.json` en funcion de los errores QA (`total_error`) y de la excepcion `fn_final = KE`.

## Reglas aplicadas
1. Sin errores (`total_error <= 0`):
   - `qa_revision_estado = "ok"`
   - `qa_revision_accion = "importar"`
2. Con errores (`total_error > 0`):
   - `qa_revision_estado = "pendiente"`
   - `qa_revision_accion = "revisar"`
3. Excepcion prioritaria KE (case-insensitive y tolerante a espacios en `fn_final`):
   - `qa_revision_estado = "ok"`
   - `qa_revision_accion = "eliminar"`

La regla KE tiene prioridad sobre cualquier error.

## Endpoint
`POST /api/recompute-simple/update-states`

Body esperado:

```json
{
  "engine": "12V4000M40A" | "ALL",
  "id": "" | "..."
}
```

Notas:
- `engine = "ALL"` no admite `id`.
- Si se informa `id`, se aplica sobre un solo libro.
- Se genera backup antes de escribir.

## Script
`scripts/update_revision_states.js`

Opciones CLI:

```bash
node scripts/update_revision_states.js --engine=12V4000M40A
node scripts/update_revision_states.js --engine=12V4000M40A --id=12345
node scripts/update_revision_states.js --engine=ALL
```

## Ejemplo de resumen

```json
{
  "ok": true,
  "enginesProcessed": 1,
  "recordsProcessed": 2336,
  "updated": 1578,
  "importar": 712,
  "eliminar": 46,
  "revisar": 1578,
  "unchanged": 758,
  "errors": []
}
```

## Advertencia
Los estados se recalculan automaticamente segun errores (`total_error`) y la regla KE. Cualquier ajuste manual previo en `qa_revision_estado` o `qa_revision_accion` puede sobrescribirse al ejecutar ESTADOS.
