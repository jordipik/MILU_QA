# MILU_V104_DATA_COVERAGE

Fecha: 2026-06-04

## Alcance

Auditoria de cobertura real sobre los 9 `engine_*.json` del repositorio.

Definicion usada para `completo`:

- Un registro solo se marca como completo si cubre todos los bloques funcionales pedidos.
- `GESA` se mide como bloque amplio: `gesa`, `designation_gesa`, `nsn`, `norma`, `normalizado`, `dimensions_gesa` o `weight_gesa`.
- `Esquemas POS` se mide con `ruta_esquemas_pos` o `exp_imagenes`.

## Resumen global

| Metricas | Valor |
|---|---:|
| Registros totales | 69681 |
| Registros completos | 0 |
| Registros incompletos | 69681 |
| Cobertura completa | 0.00% |

## Cobertura global por bloque

| Bloque | Registros con cobertura | Cobertura |
|---|---:|---:|
| PN | 68844 | 98.80% |
| Designation | 69681 | 100.00% |
| Model Type | 8016 | 11.50% |
| Qty | 69672 | 99.99% |
| Units | 69681 | 100.00% |
| Weight | 66066 | 94.81% |
| BOM | 69681 | 100.00% |
| FG/FGS | 42733 | 61.33% |
| GESA | 69681 | 100.00% |
| NSN | 55265 | 79.31% |
| Norma | 33860 | 48.59% |
| Sustituciones | 69681 | 100.00% |
| Fotos | 1182 | 1.70% |
| Esquemas | 66439 | 95.35% |
| Esquemas POS | 62182 | 89.24% |

## Ranking por libro

Ordenado por `avg_field_pct` de mayor a menor. Todos los libros tienen `complete_pct = 0.00%` bajo esta definicion estricta.

| Libro | Total | Completos | Cobertura media | Ranking |
|---|---:|---:|---:|---:|
| engine_16V4000M73.json | 12694 | 0 | 80.36% | 1 |
| engine_20V4000M93.json | 14807 | 0 | 80.18% | 2 |
| engine_16V4000M90.json | 2850 | 0 | 79.75% | 3 |
| engine_20V4000M93L.json | 7167 | 0 | 79.48% | 4 |
| engine_12V4000M70.json | 5607 | 0 | 79.37% | 5 |
| engine_12V4000M53.json | 6707 | 0 | 79.02% | 6 |
| engine_16V4000M73L.json | 11735 | 0 | 76.85% | 7 |
| engine_16V4000M61.json | 5348 | 0 | 75.56% | 8 |
| engine_12V4000M40A.json | 2766 | 0 | 72.00% | 9 |

## Lectura funcional

- La base esta muy bien en PN, Qty, Units, BOM y Esquemas.
- Los cuellos de botella reales son Model Type, Norma, FG/FGS y Fotos.
- No existe ningun registro que cumpla todo el contrato funcional completo a la vez.
- El peor libro por cobertura media es `engine_12V4000M40A.json`.
