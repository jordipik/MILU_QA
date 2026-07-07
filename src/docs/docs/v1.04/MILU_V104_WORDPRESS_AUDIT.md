# MILU_V104_WORDPRESS_AUDIT

Fecha: 2026-06-04

## Alcance

Auditoria del export WordPress ya generado en `data/05-wordpress`.

Fuentes usadas:

- `data/05-wordpress/milu_wp_export_summary.md`
- `data/05-wordpress/milu_wp_import.csv`
- `data/05-wordpress/milu_wp_superseded.csv`

## Contrato exportado

El CSV actual exporta 30 columnas y el encabezado coincide con el contrato esperado:

`Id, fecha_version, POS, designation, engine, model_type, type, pn, nsn, GESA_NORM, GESA_NORMALIZADO, fg_code, fg_description, fg_code_description, weight, weight_txt, measurement, TIPOARTICULO, PAG, BOM_no, esquema_general, exp_motor, exp_categorias, atributo, SUST_TIPO, new_pn_relacionado, old_pn_relacionados, EN_EXCEL_SUSTITUCION, ruta_foto, exp_imagenes`

## Resumen del export

| Fuente | Filas |
|---|---:|
| milu_wp_import.csv | 5501 |
| milu_wp_superseded.csv | 3130 |
| Total exportable | 8631 |

El resumen oficial del export indica ademas:

| Metricas | Valor |
|---|---:|
| New | 5501 |
| Superseded | 3130 |
| New sinteticos | 454 |
| Superseded sinteticos desde lista | 2409 |
| Superseded omitidos por existir en JSON | 267 |
| Duplicados evitados | 92 |

## Cobertura funcional en export

| Archivo | Imagen | Categoria | FG | BOM | Model type | Incompletos |
|---|---:|---:|---:|---:|---:|---:|
| milu_wp_import.csv | 3238 | 2812 | 2828 | 5501 | 5429 | 3839 |
| milu_wp_superseded.csv | 2858 | 2108 | 2121 | 3130 | 3103 | 1165 |

## Inconsistencias detectadas

- El export actual no persiste una columna de marcador synthetic por fila; la sinteticidad solo aparece en `milu_wp_export_summary.md`.
- `milu_wp_import.csv` tiene una cobertura incompleta fuerte en imagenes y categorias.
- `milu_wp_superseded.csv` esta mejor, pero sigue arrastrando huecos de categoria y modelo.
- La suma de exportables coincide con el resumen oficial, pero la calidad funcional por fila sigue siendo desigual.

## Ejemplos de filas incompletas

- `135M27020/1` sin imagen, sin categoria y sin `model_type`.
- `136M52010/1` sin imagen, sin categoria y sin `model_type`.
- `137M13001/1` sin imagen, sin categoria y sin `model_type`.
- `000000000359` sin imagen y sin categoria.
- `000000000360` sin imagen y sin categoria.

## Lectura funcional

- El export WordPress funciona y el volumen global cuadra con la traza oficial.
- La debilidad principal es de cobertura de fila, no de volumen.
- El dato synthetic existe en el resumen, pero no en el contrato de fila final.
