# MILU_V104_PN_ASSETS_CONSOLIDATION

Fecha: 2026-06-05

## Regla de negocio

- Las fotos son escasas.
- Los esquemas son frecuentes.
- El contexto de esquema pertenece a BOM/tabla/pagina, no solo a la fila individual.
- La ficha WordPress consolidada por PN debe incluir todos los assets aportados por hermanos.

## Regla de consolidacion por PN

Para cada PN consolidado:

1. Reunir todos los hermanos/copias del PN.
2. Agrupar todos sus valores de:
   - esquemas
   - esquemas_circulos
   - ruta_esquemas_pos
   - fotos (filename_foto/ruta_foto)
3. Deduplicar manteniendo orden estable por:
   - engine
   - pagina
   - nombre de archivo
   - posicion
4. Incluir en WordPress todos los esquemas y esquemas_pos encontrados en cualquier hermano.
5. Si un registro tiene esquema pero no esquema_pos, registrar error funcional.

## Metricas solicitadas

| Metrica | Valor |
|---|---:|
| registros con esquema y sin esquema_pos | 4466 |
| PN con algun esquema_pos | 4947 |
| PN con esquema pero cero esquema_pos | 500 |
| PN cuyos hermanos si aportan esquema_pos | 1656 |
| PN que mejorarian consolidando assets por hermanos | 4810 |
| esquemas_pos existentes en disco pero no enlazados | 3683 |
| esquemas asignados pero POS no encontrado | 604 |

## Clasificacion funcional (a-e)

| Clase | Definicion | Casos |
|---|---|---:|
| a | POS no encontrado en ningun esquema | 604 |
| b | POS repetido varias veces en un esquema (ambiguous) | 12 |
| c | esquema existe pero circulo no generado | 1774 |
| d | ruta_esquemas_pos vacio aunque imagen existe en disco | 2674 |
| e | esquema asignado incorrecto (page-pn-pos-mismatch) | 10 |

## Reglas complementarias

1. Si un PN aparece en varios esquemas: incluir todos.
2. No asumir que aparece en todos los esquemas.
3. No eliminar esquemas solo porque el POS no aparezca en alguno.
4. Si el mismo POS aparece repetido en un esquema y el generador produce multiples ocurrencias, conservarlas.
5. Si el generador solo produce una ocurrencia, marcar caso ambiguo.

## Lectura funcional

- El mayor impacto esta en consolidacion por hermanos: 4810 PN recuperan assets que hoy se pierden en principal-only.
- Hay 1656 PN en los que el principal no tiene esquema_pos pero algun hermano si.
- La deuda mas grande de pipeline actual es la brecha entre esquema/circulo y enlace final ruta_esquemas_pos.
