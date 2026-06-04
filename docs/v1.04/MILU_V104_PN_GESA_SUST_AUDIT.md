# MILU_V104_PN_GESA_SUST_AUDIT

Fecha: 2026-06-05

## Alcance

Auditoria de conflictos GESA/SUST por PN normalizado sobre los 9 engine_*.json.

## Conflictos detectados

| Tipo de conflicto | PN afectados |
|---|---:|
| mismo PN con varios valores GESA | 0 |
| mismo PN con varios NSN | 0 |
| mismo PN con varias normas | 1 |
| mismo PN con sustituciones contradictorias | 0 |
| PN marcado New y Superseded a la vez | 0 |

## Detalle del conflicto real

PN:

- 700429244000

Valores de norma encontrados:

- 244 X 4 MMN429
- MMN429

Apariciones:

- 15 registros.

Interpretacion:

- Conflicto de normalizacion textual, no de semantica funcional.

## Conclusiones

- Bloque GESA/SUST muy estable en snapshot actual.
- Riesgo principal de perdida no es el conflicto interno, sino no consolidar hermanos cuando se exporta una sola fila.
