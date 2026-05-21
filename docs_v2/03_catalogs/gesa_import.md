# GESA Import

## Objetivo
Documentar como se consumen datos GESA en MILU v1 para enriquecer y calcular campos finales.

## Inputs
- Campos GESA ya presentes en `engine_*.json`: `gesa`, `designation_gesa`, `dimensions_gesa`, `weight_gesa`, `nsn`, `norma`, `normalizado`, `units`.

## Outputs
- Campos `_final` resueltos con prioridad GESA en reglas concretas.

## Scripts implicados
- `copy_gesa_fields_to_final.py` (legacy conviviente).
- `depuracion_json.py` (proceso oficial offline).
- backend `POST /copy-pdf-to-final-all-books` (mapeo GESA/PDF).

## Endpoints implicados
- `POST /copy-pdf-to-final-all-books`.
- `POST /calculate-final-fields` (ejecuta `copy_gesa_fields_to_final.py`).

## Botones UI relacionados
- `recomputeCalculateFinalBtn`.

## Campos afectados
- `designation_final`, `measure_final`, `weight_final`, `nsn_final`, `normalizado_final`, `norma_final`.

## Flujo paso a paso
1. El sistema detecta si `gesa=SI` en cada fila.
2. Para campos mapeados a GESA, toma valor GESA cuando existe.
3. Para no mapeados o vacios en GESA, usa fallback PDF/base.
4. `depuracion_json.py` aplica limpieza adicional de espacios y normalizacion textual.

## Riesgos / problemas conocidos
- No se detecto en runtime un importador unico de `EXCEL_GESA*.json` dentro del repo actual.
- Existen varias rutas de calculo final; posibles diferencias en resultado si no se estandariza el proceso.

## TODO pendiente
- Publicar pipeline formal de carga de catalogo GESA desde origen externo a `engine_*.json`.

## Ejemplo real
- `copy_gesa_fields_to_final.py` copia a `_final` solo cuando `gesa=SI` y el valor origen no esta vacio.
