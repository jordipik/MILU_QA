# MILU_V104_HERMANOS_RULE

Fecha: 2026-06-05

## Regla oficial determinista de hermanos

Para cada PN normalizado:

1. Orden estable de apariciones:
   - modelo/libro
   - source_page
   - pos
   - ID
2. Primera aparicion:
   - qa_revision_estado = ok
   - qa_revision_accion = Importar
3. Resto de apariciones:
   - qa_revision_estado = ok
   - qa_revision_accion = Copia

## Invariantes obligatorias

Nunca debe haber:

1. Dos Importar para el mismo PN.
2. Cero Importar para un PN exportable.
3. Copia sin Importar principal.
4. PN duplicado en WordPress.

## Validacion de snapshot actual

Base auditada: 5860 PN unicos.

- PN con mas de un Importar: 0.
- PN sin Importar: 0.
- PN con Copia sin Importar principal: 0.

Lectura:

- La regla de hermanos en engines esta sana.
- La deuda funcional principal no esta en el marcado Importar/Copia interno, sino en la consolidacion de la salida WordPress por PN.
