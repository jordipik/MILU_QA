# GESA Import

## Objetivo
Documentar como se consumen datos GESA en MILU v1 para enriquecer y calcular campos finales.

## Inputs
- Campos GESA ya presentes en `engine_*.json`: `gesa`, `designation_gesa`, `dimensions_gesa`, `weight_gesa`, `nsn`, `norma`, `normalizado`, `units`.

## Outputs
- Campos `_final` resueltos con prioridad GESA en reglas concretas.

## Scripts implicados
- `copy_gesa_fields_to_final.py` (LEGACY).
- `depuracion_json.py` (proceso oficial offline).
- backend OFFICIAL `POST /copy-pdf-to-final-all-books` (mapeo FINAL_FIELDS_V1).

## Endpoints implicados
- OFFICIAL: `POST /copy-pdf-to-final-all-books`.
- LEGACY: `POST /calculate-final-fields` (ejecuta `copy_gesa_fields_to_final.py`).

## Botones UI relacionados
- `recomputeCalculateFinalBtn`.

## Campos afectados
- `designation_final`, `measure_final`, `weight_final`, `nsn_final`, `normalizado_final`, `norma_final`.

## Flujo paso a paso
1. La ruta oficial evalua por campo si existe valor GESA antes de su fallback.
2. `designation_final`, `measure_final`, `weight_final`, `nsn_final`, `normalizado_final` y `norma_final` consumen GESA segun FINAL_FIELDS_V1.
3. La decision no depende de `gesa=SI`; depende solo de si el valor origen existe y no esta vacio.
4. `depuracion_json.py` aplica limpieza adicional de espacios y normalizacion textual en el proceso offline.

## Riesgos / problemas conocidos
- No se detecto en runtime un importador unico de `EXCEL_GESA*.json` dentro del repo actual.
- Existen varias rutas de calculo final; posibles diferencias en resultado si no se estandariza el proceso.

## TODO pendiente
- Publicar pipeline formal de carga de catalogo GESA desde origen externo a `engine_*.json`.

## Ejemplo real
- `POST /copy-pdf-to-final-all-books` prioriza `designation_gesa` sobre `designation_pdf`, `dimensions_gesa` sobre `measure_pdf` y `weight_gesa + units` sobre `weight_pdf`.
