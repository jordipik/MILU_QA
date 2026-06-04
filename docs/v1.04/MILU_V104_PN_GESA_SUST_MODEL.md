# MILU_V104_PN_GESA_SUST_MODEL

Fecha: 2026-06-04

## Objetivo

Definir tratamiento de GESA y SUST como datos únicos por PN, no por fila aislada.

## Regla

Para cada PN consolidado:

1. Consolidar una sola vez:
   - GESA
   - NSN
   - norma
   - sustituciones
   - new_pn
   - superseded list
2. Si hay varios valores:
   - conservar principal canónico por orden estable
   - registrar conflicto explícito
3. Nunca mezclar estados incompatibles sin marca de conflicto:
   - New y Superseded para el mismo PN

## Campos canónicos

- gesa_final
- nsn_final
- norma_final
- normalizado_final
- sust_status_final
- new_pn_final
- hierarchie_final

## Campos acumulativos de soporte

- subst_pnlist_final
- sust_superseded_list

## Política de conflicto

1. Campo único con conflicto:
   - principal canónico
   - lista de variantes ordenadas
   - bandera conflictiva
2. Campo acumulativo:
   - unión deduplicada con orden estable
