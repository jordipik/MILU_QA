# MILU_V104_ASSETS_AUDIT

Fecha: 2026-06-04

## Alcance

Auditoria de assets sobre los 9 `engine_*.json`.

Definiciones usadas:

- Foto: `filename_foto` o `ruta_foto`.
- Esquema: `esquemas`, `esquemas_circulos` o `esquemas_circulos_all`.
- Esquema POS: `ruta_esquemas_pos` o `exp_imagenes`.

## Resumen global

| Asset | Con asset | Sin asset | Cobertura |
|---|---:|---:|---:|
| Fotos | 1182 | 68499 | 1.70% |
| Esquemas | 66439 | 3242 | 95.35% |
| Esquemas POS | 62182 | 7499 | 89.24% |
| Sin ninguno de los 3 | 3181 | n/a | 4.56% |

## Cobertura por libro

| Libro | Fotos | Fotos % | Esquemas | Esquemas % | Esquemas POS | Esquemas POS % | Sin ninguno |
|---|---:|---:|---:|---:|---:|---:|---:|
| engine_12V4000M40A.json | 44 | 1.59% | 2757 | 99.67% | 0 | 0.00% | 9 |
| engine_12V4000M53.json | 116 | 1.73% | 5826 | 86.86% | 5670 | 84.54% | 840 |
| engine_12V4000M70.json | 108 | 1.93% | 5348 | 95.38% | 5328 | 95.02% | 259 |
| engine_16V4000M61.json | 88 | 1.65% | 4986 | 93.23% | 4958 | 92.71% | 362 |
| engine_16V4000M73.json | 220 | 1.73% | 12438 | 97.98% | 12044 | 94.88% | 256 |
| engine_16V4000M73L.json | 181 | 1.54% | 10857 | 92.52% | 10581 | 90.17% | 870 |
| engine_16V4000M90.json | 47 | 1.65% | 2815 | 98.77% | 2793 | 98.00% | 35 |
| engine_20V4000M93.json | 282 | 1.90% | 14395 | 97.22% | 13957 | 94.26% | 400 |
| engine_20V4000M93L.json | 96 | 1.34% | 7017 | 97.91% | 6851 | 95.59% | 150 |

## Libros con peor cobertura de assets

Ordenados por registros sin ninguno de los 3 assets.

| Libro | Sin ninguno |
|---|---:|
| engine_16V4000M73L.json | 870 |
| engine_12V4000M53.json | 840 |
| engine_20V4000M93.json | 400 |
| engine_16V4000M61.json | 362 |
| engine_12V4000M70.json | 259 |
| engine_16V4000M73.json | 256 |
| engine_20V4000M93L.json | 150 |
| engine_16V4000M90.json | 35 |
| engine_12V4000M40A.json | 9 |

## Paginas con mas fallos

| Pagina | Fallos |
|---|---:|
| 252 | 225 |
| 253 | 193 |
| 238 | 163 |
| 1394 | 163 |
| 41 | 161 |
| 332 | 159 |
| 602 | 157 |
| 319 | 155 |
| 343 | 150 |
| 318 | 145 |

## Patrones repetitivos

| Patron | Registros |
|---|---:|
| sin_foto\|con_esquema\|con_esquema_pos | 61009 |
| sin_foto\|con_esquema\|sin_esquema_pos | 4274 |
| sin_foto\|sin_esquema\|sin_esquema_pos | 3181 |
| con_foto\|con_esquema\|sin_esquema_pos | 44 |
| sin_foto\|sin_esquema\|con_esquema_pos | 35 |
| con_foto\|sin_esquema\|con_esquema_pos | 26 |

## Lectura funcional

- El problema de assets es casi entero de fotos; esquemas y esquemas POS estan bastante mejor cubiertos.
- Los fallos se concentran en pocas paginas y en un patron repetitivo muy claro: ausencia de foto con esquema presente.
- `engine_16V4000M73L.json` y `engine_12V4000M53.json` concentran la mayor carga de registros sin ningun asset util.
