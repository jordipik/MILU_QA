# Final Fields Logic

## Objetivo
Explicar reglas reales de calculo de campos `_final` en MILU v1.

## Inputs
- Campos base (`POS`, `PART NO.`, `DESIGNATION`, etc.).
- Campos `_pdf`.
- Campos GESA y SUST disponibles en engine.

## Outputs
- Campos finales consistentes para QA y export.

## Scripts implicados
- `POST /copy-pdf-to-final-all-books` (regla principal en backend).
- `copy_gesa_fields_to_final.py` (legacy conviviente).
- `depuracion_json.py` (proceso oficial offline de consistencia).

## Endpoints implicados
- `POST /copy-pdf-to-final-all-books`.
- `POST /calculate-final-fields`.

## Botones UI relacionados
- `recomputeCalculateFinalBtn`.

## Campos afectados
- `pos_final`, `pn_final`, `designation_final`, `model_type_final`, `qty_final`, `units_final`, `weight_final`, `fn_final`, `measure_final`, `fg_fgs_final`, `bom_final`, `nsn_final`, `normalizado_final`, `norma_final`, `sust_status_final`.

## Flujo paso a paso
1. Backend recorre filas de engines solicitados.
2. Para cada mapping PDF->FINAL, calcula valor resuelto:
   - Si `gesa=SI` y el campo esta mapeado a GESA, prioriza GESA.
   - Si no, usa valor `_pdf`.
3. Escribe solo cuando cambia el valor final normalizado.
4. Si `backup=true`, conserva copia de seguridad.
5. En proceso offline, `depuracion_json.py` refuerza reglas de normalizacion y limpieza.

## Riesgos / problemas conocidos
- Coexisten tres caminos de final fields, con posible desalineacion si se mezclan en la misma corrida.
- Campo legacy `measurement_final` aun aparece en algunos registros historicos.

## TODO pendiente
- Definir una unica ruta oficial para todos los entornos y desactivar rutas legacy.

## Ejemplo real
- En `server.js`, `resolvePdfToFinalUpdatesForRow(...)` implementa la decision por `gesa=SI` para campos mapeados.
