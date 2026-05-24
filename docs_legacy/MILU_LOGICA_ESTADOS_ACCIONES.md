# MILU LOGICA ESTADOS ACCIONES

## 1. Modelo actual canonico
Campos:
- qa_revision_estado
- qa_revision_accion

Estados canonicos:
- pendiente
- ok

Acciones canonicas:
- importar
- copia
- revisar
- eliminar

## 2. Normalizacion historica
En js/revision.js se mantiene mapeo legacy -> canonico:

Estado (legacy -> nuevo):
- pendiente, pendiente_web -> pendiente
- aprobado, ok, importado -> ok

Accion (legacy -> nuevo):
- importar -> importar
- copiado, copia -> copia
- revisar, revisar_web -> revisar
- eliminar, descartado -> eliminar

Cualquier valor desconocido cae a defaults operativos:
- estado -> pendiente
- accion -> revisar

## 3. Distribucion actual en datos
(67,883 filas)

qa_revision_estado:
- ok: 64,837
- pendiente: 3,046

qa_revision_accion:
- copia: 56,432
- importar: 8,145
- revisar: 3,093
- eliminar: 213

Lectura:
- El sistema esta dominado por accion copia.
- Los pendientes son minoria relativa pero clave para QA diario.

## 4. Reglas funcionales observadas

### En UI
- Selects de qa_milu y modal shell exponen valores canonicos.
- Filtros de tabla permiten segmentacion por estado/accion.
- Cambios de revision se persisten por /save-json.

### En export WordPress
Decision por PN basada en resumen de filas QA:
- Si existe al menos una fila ok+importar -> import.
- Si no hay import y existe pendiente/revisar -> pending_review.
- Si no hay import ni pending y existe ok+eliminar -> discard.

### En acciones bulk
- Existen helpers para aplicar revision a hermanos por PN.
- En flujo actual se propaga especialmente en contexto copia.

## 5. Riesgos actuales
- Ambiguedad semantica de copia en comparacion con importar.
- Legacy values todavia posibles en datasets antiguos (requiere normalizacion continua).
- Parte de la logica de negocio vive en frontend, parte en scripts de export.

## 6. Propuesta de contrato formal

### Enum recomendado
- estado: pendiente | ok
- accion: importar | copia | revisar | eliminar

### Invariantes
1. Si estado=pendiente, accion recomendada por defecto revisar.
2. Si accion=importar/eliminar, estado debe terminar en ok para export final.
3. Si accion=copia, debe existir trazabilidad de PN origen o contexto de propagacion.
4. updated_at debe registrarse al cambiar estado/accion.

### Validaciones servidor recomendadas
- Rechazar valores fuera de enum.
- Rechazar cambios vacios cuando se envia revision.
- Registrar diffs en audit-log.

## 7. Casos de borde que deben cubrirse
- Registros sin pn_final pero con PART NO.
- Registros con error flags y estado ok/importar.
- Migracion de revisiones legacy pendientes_web/revisar_web.
- Conflicto de tabs simultaneas escribiendo revision.

## 8. Recomendacion operativa inmediata
- Consolidar todas las comparaciones de estado/accion en helpers unicos.
- Evitar strings hardcoded dispersos fuera de revision.js y export rules.
- Agregar reporte diario por combinacion estado+accion+engine_model.
