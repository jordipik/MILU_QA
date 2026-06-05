# MILU_WORDPRESS_TEMPLATE_NEW_FIELDS

STATUS: V1.04

## Objetivo

Documentar los campos requeridos por la plantilla WordPress New para relaciones antiguas de PN.

## Campos de plantilla New

La plantilla New consume:

- old_number_01 ... old_number_18
- old_ruta_01 ... old_ruta_18

## Origen de datos

Los valores se derivan del bloque de relaciones antiguas del PN:

- old_pn_relacionados
- subst_pnlist_final
- sust_superseded_list

## Regla funcional

1. Se parsea la lista por comas.
2. Se limpian espacios.
3. Se deduplican valores manteniendo orden estable.
4. Se limita a 18 elementos.
5. old_number_N recibe el PN antiguo.
6. old_ruta_N se genera desde old_number_N con normalizacion de espacios para ruta.
7. Si faltan valores, los slots restantes quedan vacios.

## Comportamiento esperado en plantilla

- Maximo 18 relaciones antiguas visibles por registro.
- Los enlaces se construyen desde old_ruta_N.
- Si no hay suficientes relaciones, los placeholders restantes quedan vacios sin romper render.

## Compatibilidad

- old_pn_relacionados se mantiene para compatibilidad retroactiva.
- El contrato CSV compartido (New/Superseded) incluye siempre los 36 campos nuevos, incluso vacios.
