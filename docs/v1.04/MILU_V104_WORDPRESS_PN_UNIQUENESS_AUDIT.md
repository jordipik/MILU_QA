# MILU_V104_WORDPRESS_PN_UNIQUENESS_AUDIT

Fecha: 2026-06-04

## Alcance

Auditoría del export WordPress actual en:

- data/05-wordpress/milu_wp_import.csv
- data/05-wordpress/milu_wp_superseded.csv

## Volumen y unicidad

| Validación | Valor |
|---|---:|
| Filas totales exportadas | 8631 |
| Filas import | 5501 |
| Filas superseded | 3130 |
| PN únicos exportados | 8630 |
| PN duplicados en export | 1 |
| PN exportables en engines no exportados | 0 |

## Estados funcionales respecto a engines

| Validación | Valor |
|---|---:|
| PN con al menos un Importar en engines y presentes en WordPress | 5860 |
| PN con fuente tipo Copia en engines y presentes en WordPress | 5048 |
| PN con más de una fila en WordPress | 1 |

## Pérdida de valor por no consolidar hermanos

Comparación funcional entre valor potencial por consolidación de hermanos y valor visible en fila WordPress actual.

| Pérdida detectada | PN afectados |
|---|---:|
| Assets presentes en hermanos pero ausentes en fila WordPress principal | 1744 |
| GESA/SUST presentes en hermanos pero ausentes en fila WordPress principal | 62 |
| esquema_pos presente en hermanos pero ausente en fila WordPress principal | 1637 |

## Conclusión de fase

- El export actual cumple volumen, pero no unicidad perfecta por PN.
- La principal deuda funcional es la pérdida de información de hermanos en assets y esquema_pos.
- El rediseño debe ser por entidad PN consolidada, no por fila individual marcada Importar.
