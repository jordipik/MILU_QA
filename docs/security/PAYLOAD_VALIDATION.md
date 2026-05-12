# Payload Validation and Write Safety

## Objetivo

Proteger los endpoints de escritura del backend MILU sin romper el comportamiento valido actual ni cambiar el flujo operativo.

## Alcance

Esta fase introduce validacion explicita para:

- `/save-json`
- `/save-json.php`
- `/apply-revision-to-engines`
- `/pn-review/:sku/apply-decision`
- `/pn-review/:sku/apply-values`
- `/pn-review/apply-siblings-bulk`
- `/pn-review/by-id/:id/apply-decision`
- `/recompute-qa-errors`
- `/recompute-pdf-auto`
- `/audit-log`
- `/qa_revision_sync.php`

## Whitelist editable

### Campos QA editables

- `qa_revision_estado`
- `qa_revision_accion`
- `qa_revision_updated_at`

### Campos operativos editables

- `designation_final`
- `measure_final`
- `weight_final`
- `pn_final`
- `exp_imagenes`

### Campos prohibidos o solo lectura

- `raw_json`
- `source_json_file`
- `engine_model`
- `ID`
- campos internos de auditoria
- cualquier campo que termine en `_error`
- `qa_errors`
- `qa_errors_active`

## Compatibilidad legacy

Se mantiene compatibilidad razonable con payloads historicos:

- `descartar` se acepta y se normaliza a `eliminar`.
- `measurement_final` se acepta como alias de `measure_final`.
- Valores antiguos de revision pueden seguir entrando mientras se normalicen a los contratos canónicos.

## Payloads validos

- `save-json` con `file`, `id`, `field`, `value` escalar y campo editable.
- `pn-review/:sku/apply-decision` con `action` en `validar|revisar|descartar`.
- `pn-review/:sku/apply-values` con `fields` objeto y valores escalares.
- `apply-revision-to-engines` con payload de revision estructurado.

## Payloads bloqueados

- Campos no permitidos.
- `raw_json`, `engine_model`, `ID` y campos internos.
- Arrays u objetos inesperados donde se espera escalar.
- Payloads vacios.
- Payloads demasiado grandes.
- `qa_revision_estado` fuera de `ok|pendiente`.
- `qa_revision_accion` fuera de `importar|revisar|eliminar|copia`.

## Respuesta de error estandar

```json
{
  "ok": false,
  "error": "VALIDATION_ERROR",
  "code": "FIELD_NOT_ALLOWED",
  "field": "xxx",
  "message": "..."
}
```

## Estrategia futura

- Expandir validaciones por endpoint sin cambiar contratos publicos.
- Mover reglas comunes a pruebas funcionales cuando exista entorno throwaway.
- Considerar validacion de schema mas formal en una fase posterior.

## Riesgos pendientes

- Payloads legacy muy amplios pueden seguir pasando si no caen en la whitelist de bloqueo.
- El contrato de `apply-revision-to-engines` aun depende del formato de revision historico y de v2.
- `audit-log` sigue siendo un flujo auxiliar, no un sistema de auditoria completo.
