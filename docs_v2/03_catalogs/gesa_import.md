# GESA Import

## Objetivo
Documentar como se consumen datos GESA en MILU v1 para enriquecer y calcular campos finales.

## Inputs
- Campos GESA ya presentes en `engine_*.json`: `gesa`, `designation_gesa`, `dimensions_gesa`, `weight_gesa`, `nsn`, `norma`, `normalizado`, `units`.

## Outputs
- Campos `_final` resueltos con prioridad GESA en reglas concretas.

## Scripts implicados
- `scripts/update_gesa_fields_from_excel.js` (OFFICIAL OFFLINE, match exacto por PN).
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

## Pipeline de carga GESA a engines (OFFICIAL OFFLINE)
Fuente de verdad de catalogo:
- `EXCEL_GESA2026.json`

Destino:
- Todos los `engine_*.json` o un engine puntual con `--only`.

Script:
- `node scripts/update_gesa_fields_from_excel.js`

Regla de match:
1. Para cada registro engine, leer `pn_final`.
2. Normalizar `pn_final` y `PART NUMBER` como `String(value).trim()`.
3. Hacer match exacto `PART NUMBER == pn_final`.
4. No se convierte a numero para no perder ceros iniciales.

Campos permitidos de escritura en engine:
- `gesa`
- `designation_gesa`
- `nsn`
- `norma`
- `normalizado`
- `dimensions_gesa`
- `weight_gesa`
- `units`

Reglas de escritura:
1. Si hay match exacto:
	- `gesa = "SI"`
	- `designation_gesa <- "DESIGNATION (english)"`
	- `nsn <- "NATO-VERS.-NR"`
	- `norma <- "NORM"`
	- `normalizado = "SI"` si `NORM` tiene valor, si no `"NO"`
	- `dimensions_gesa <- "DIMENSIONS"`
	- `weight_gesa <- "UNIT WEIGHT"`
	- `units <- "UNIT OF WEIGHT"`
2. Si no hay match exacto:
	- `gesa = "NO"`
	- `designation_gesa`, `nsn`, `norma`, `dimensions_gesa`, `weight_gesa`, `units` a cadena vacia
	- `normalizado = "NO"`

Guardas de seguridad:
1. Dry-run por defecto (no escribe).
2. Escribe solo con `--write`.
3. Backup por archivo engine antes de escribir: `engine_*.json.backup-gesa-<timestamp>`.
4. Validacion de existencia de `EXCEL_GESA2026.json`.
5. Validacion de filas GESA con `PART NUMBER` y warning de duplicados.

Comandos operativos:
- Dry-run todos: `node scripts/update_gesa_fields_from_excel.js`
- Write todos: `node scripts/update_gesa_fields_from_excel.js --write`
- Dry-run un motor: `node scripts/update_gesa_fields_from_excel.js --only 12V4000M53`
- Write un motor: `node scripts/update_gesa_fields_from_excel.js --only 12V4000M53 --write`

Resumen que imprime el script:
- engines procesados
- registros escaneados
- matches GESA
- no encontrados
- registros modificados
- backups creados
- ejemplos de match y no-match

## Flujo paso a paso
1. La ruta oficial evalua por campo si existe valor GESA antes de su fallback.
2. `designation_final`, `measure_final`, `weight_final`, `nsn_final`, `normalizado_final` y `norma_final` consumen GESA segun FINAL_FIELDS_V1.
3. La decision no depende de `gesa=SI`; depende solo de si el valor origen existe y no esta vacio.
4. `depuracion_json.py` aplica limpieza adicional de espacios y normalizacion textual en el proceso offline.

## Riesgos / problemas conocidos
- La carga GESA desde Excel/JSON hacia engines es un proceso OFFLINE; no forma parte del runtime web.
- Existen varias rutas de calculo final; posibles diferencias en resultado si no se estandariza el proceso.

## TODO pendiente
- Definir trigger oficial (manual o task npm) previo al recalculo de campos finales.

## Ejemplo real
- `POST /copy-pdf-to-final-all-books` prioriza `designation_gesa` sobre `designation_pdf`, `dimensions_gesa` sobre `measure_pdf` y `weight_gesa + units` sobre `weight_pdf`.
