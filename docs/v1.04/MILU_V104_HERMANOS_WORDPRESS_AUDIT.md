# MILU_V104_HERMANOS_WORDPRESS_AUDIT

Fecha: 2026-06-04

## Alcance

Auditoría conjunta de hermanos en engines y riesgo de duplicidad en WordPress.

## Métricas globales

| Métrica | Valor |
|---|---:|
| Total PN únicos | 5860 |
| PN con una sola aparición | 812 |
| PN con varios hermanos | 5048 |
| PN con más de un Importar | 0 |
| PN sin Importar siendo exportable | 0 |
| PN con copias mal marcadas | 0 |
| PN que saldrían duplicados en WordPress actual | 1 |

## Hallazgo de duplicado real en WordPress

PN normalizado duplicado detectado:

- Z=KKN19/19-25.019

Filas detectadas en salida:

- milu_wp_superseded.csv: `Z=KKN 19/19-25.019`
- milu_wp_superseded.csv: `Z=KKN19/19-25.019`

Causa funcional:

- Variación de formato en PN no normalizado en salida final.

Impacto:

- Rompe la regla de una sola ficha por PN.

## Lectura

- La capa de hermanos en engines está estable.
- El riesgo funcional de duplicado aparece en la exportación por falta de normalización estricta en la última milla.
