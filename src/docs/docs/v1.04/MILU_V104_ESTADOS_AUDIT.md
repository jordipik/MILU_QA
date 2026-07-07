# MILU_V104_ESTADOS_AUDIT

Fecha: 2026-06-04

## Alcance

Auditoria de `qa_revision_estado`, `qa_revision_accion`, `has_error` y `total_error` sobre los 9 `engine_*.json`.

## Distribucion global

| Estado / accion | Registros |
|---|---:|
| ok / copia | 62984 |
| ok / importar | 5860 |
| ok / eliminar | 722 |
| pendiente / revisar | 115 |

## Registros bloqueados para importacion

| Metricas | Valor |
|---|---:|
| Registros bloqueados | 63821 |
| Registros importables | 5860 |

## Top errores activos

| Error | Registros con valor > 0 |
|---|---:|
| pn_error | 837 |
| pos_error | 87 |

El resto de campos de error se quedan en cero o sin actividad visible en este snapshot.

## Distribucion por libro

| Libro | ok/importar | ok/copia | ok/eliminar | pendiente/revisar | Bloqueados |
|---|---:|---:|---:|---:|---:|
| engine_12V4000M40A.json | 1908 | 812 | 46 | 0 | 858 |
| engine_12V4000M53.json | 1381 | 5273 | 37 | 16 | 5326 |
| engine_12V4000M70.json | 628 | 4953 | 16 | 10 | 4979 |
| engine_16V4000M61.json | 267 | 4922 | 157 | 2 | 5081 |
| engine_16V4000M73.json | 633 | 12027 | 11 | 23 | 12061 |
| engine_16V4000M73L.json | 153 | 11328 | 246 | 8 | 11582 |
| engine_16V4000M90.json | 168 | 2662 | 17 | 3 | 2682 |
| engine_20V4000M93.json | 397 | 14248 | 140 | 22 | 14410 |
| engine_20V4000M93L.json | 325 | 6759 | 52 | 31 | 6842 |

## Lectura funcional

- El estado dominante es `ok / copia`; el flujo exportable real `ok / importar` es minoritario.
- `pn_error` concentra la mayor parte de la senal de error.
- La cola de bloqueo es enorme comparada con el subconjunto importable, asi que cualquier mejora de QA debe atacar primero el error de PN y la revision de POS.
