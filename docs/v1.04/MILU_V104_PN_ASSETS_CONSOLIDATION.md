# MILU_V104_PN_ASSETS_CONSOLIDATION

Fecha: 2026-06-04

## Regla de negocio

- Las fotos son escasas.
- Los esquemas existen para la mayoría.
- El contexto de esquema es de tabla/BOM/página y no solo de fila individual.
- La ficha WordPress por PN debe incluir todos los assets aportados por hermanos/copias.

## Regla de consolidación por PN

Para cada PN:

1. Recoger todas sus filas hermanas.
2. Acumular:
   - esquemas
   - esquemas_circulos
   - ruta_esquemas_pos
   - fotos
3. Deduplicar con orden estable:
   - engine
   - página
   - nombre de archivo
   - posición
4. Incluir todos los esquemas y esquemas_pos en la ficha final del PN.

## Métricas solicitadas

| Métrica | Valor |
|---|---:|
| Registros con esquema y sin esquema_pos | 4318 |
| PN con algún esquema_pos | 4968 |
| PN con esquema pero cero esquema_pos | 486 |
| PN cuyos hermanos sí aportan esquema_pos | 1639 |
| PN que mejorarían al consolidar assets por hermanos | 145 |
| esquemas_pos existentes en disco pero no enlazados | 3559 |
| PN con esquema asignado y POS no encontrado | 38 |

## Clasificación de errores (a-e)

Clasificación basada en señales disponibles en este snapshot.

| Clase | Definición | Casos |
|---|---|---:|
| a | POS no encontrado en ningún esquema | 81 |
| b | POS repetido varias veces en un esquema | 0 (sin evidencia automática) |
| c | esquema existe pero círculo no generado | 1563 |
| d | ruta_esquemas_pos vacío aunque imagen existe en disco | 2674 |
| e | esquema asignado incorrecto | 0 (sin evidencia automática en esta pasada) |

Nota de método:

- b y e dependen de información geométrica más fina; aquí se reporta solo lo verificable con campos actuales y presencia en disco.

## Lectura funcional

- La consolidación por PN tiene alto impacto: 1639 PN recuperan esquema_pos desde hermanos.
- El mayor problema real está en enlaces finales vacíos pese a evidencia en disco (clase d).
- Hay deuda relevante de generación de círculos (clase c).
