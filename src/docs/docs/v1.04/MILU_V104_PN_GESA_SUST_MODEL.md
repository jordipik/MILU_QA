# MILU_V104_PN_GESA_SUST_MODEL

Fecha: 2026-06-05

## Objetivo

Tratar GESA y SUST como datos de entidad PN (unicos por PN), no como datos aislados por aparicion.

## Regla funcional

Para cada PN:

1. Consolidar una sola vez:
   - GESA
   - NSN
   - norma
   - sustituciones
   - new_pn
   - superseded/subst list
2. Elegir canonico por orden estable de principal para campos unicos.
3. Cuando haya conflicto, no pisar: conservar variante y marcar conflicto.

## Campos unicos por PN

- gesa_final
- nsn_final
- norma_final
- normalizado_final
- sust_status_final
- new_pn_final
- hierarchie_final

## Campos acumulativos por PN

- subst_pnlist_final
- sust_superseded_list

## Politica de conflicto

1. Si campo unico tiene mas de un valor:
   - valor canonico del principal
   - lista de variantes distintas
   - flag de conflicto para auditoria
2. Si campo acumulativo tiene multiples valores:
   - union deduplicada y ordenada
3. Conflicto critico:
   - mismo PN con estado New y Superseded a la vez

## Resultado esperado en WordPress consolidado

- GESA/SUST no se pierden aunque vivan en una copia.
- Se evita inconsistencia por escoger una sola fila sin consolidar hermanos.
