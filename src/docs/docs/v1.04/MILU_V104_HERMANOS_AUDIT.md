# MILU_V104_HERMANOS_AUDIT

Fecha: 2026-06-04

## Alcance

Auditoria de hermanos sobre los 9 `engine_*.json`.

Definicion usada:

- Registros copia: cualquier fila con `copia_de_id` o `copia_de_pn` no vacios.
- Registros origen: cualquier fila referenciada por esas claves en el universo de los 9 libros.

## Resumen global

| Metricas | Valor |
|---|---:|
| Registros copia | 62984 |
| Registros origen | 68032 |
| Referencias origen por ID | 5048 |
| Referencias origen por PN | 5048 |
| Orphan refs por ID | 0 |
| Orphan refs por PN | 0 |

## Copias por libro

| Libro | Copias |
|---|---:|
| engine_20V4000M93.json | 14248 |
| engine_16V4000M73.json | 12027 |
| engine_16V4000M73L.json | 11328 |
| engine_20V4000M93L.json | 6759 |
| engine_12V4000M53.json | 5273 |
| engine_12V4000M70.json | 4953 |
| engine_16V4000M61.json | 4922 |
| engine_16V4000M90.json | 2662 |
| engine_12V4000M40A.json | 812 |

## Grupos con mas reutilizacion

Los grupos estan ordenados por numero de copias y numero de IDs origen distintos.

| PN origen | Copias | IDs origen distintos |
|---|---:|---:|
| 007349008002 | 763 | 763 |
| 000125010524 | 631 | 631 |
| 007603014102 | 619 | 619 |
| 000125008427 | 586 | 586 |
| 700327010000 | 474 | 474 |
| 304017008081 | 438 | 438 |
| 000000003021 | 410 | 410 |
| 304032008014 | 384 | 384 |
| 000125013012 | 372 | 372 |
| 007349010002 | 364 | 364 |

## Duplicados anomalo por PN

Los PN siguientes aparecen repetidos con muchos IDs distintos en el universo completo:

| PN | Ocurrencias | IDs distintos |
|---|---:|---:|
| 007349008002 | 763 | 763 |
| 000125010524 | 631 | 631 |
| 007603014102 | 619 | 619 |
| 000125008427 | 586 | 586 |
| 700327010000 | 474 | 474 |
| 304017008081 | 438 | 438 |
| 000000003021 | 410 | 410 |
| 304032008014 | 384 | 384 |
| 000125013012 | 372 | 372 |
| 007349010002 | 364 | 364 |

## Lectura funcional

- No hay huertos huérfanos globales: todas las referencias copia encuentran origen en el universo actual.
- El problema no es falta de grupo, sino exceso de reutilizacion y multiplicacion de origenes para los mismos PN.
- Los grupos mas sensibles son precisamente los PN mas masivos y mas compartidos entre libros.
