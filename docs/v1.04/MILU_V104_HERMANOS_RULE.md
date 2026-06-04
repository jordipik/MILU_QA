# MILU_V104_HERMANOS_RULE

Fecha: 2026-06-04

## Objetivo

Definir una regla determinista y estable de hermanos para consolidación por PN.

## Regla oficial

Para cada PN normalizado:

1. Ordenar apariciones por criterio estable:
   - engine o libro
   - source_page
   - pos
   - ID
2. Primera aparición:
   - qa_revision_estado = ok
   - qa_revision_accion = Importar
3. Resto de apariciones:
   - qa_revision_estado = ok
   - qa_revision_accion = Copia

## Invariantes obligatorias

Nunca debe existir:

- más de un Importar para el mismo PN
- cero Importar para un PN exportable
- Copia sin Importar principal
- PN duplicado en salida WordPress

## Validación real del estado actual

Sobre 5860 PN únicos:

- PN con más de un Importar: 0
- PN exportables sin Importar: 0
- PN con Copia sin Importar principal: 0

Conclusión:

- La lógica de marcado de hermanos en engines cumple la regla determinista base.
- El problema principal se desplaza al plano de export WordPress (unicidad por PN y consolidación de valor).
