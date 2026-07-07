# MILU_V104_PN_CONSOLIDATION_EXECUTIVE_SUMMARY

Fecha: 2026-06-05

## Respuestas ejecutivas

1. Cuantos PN unicos reales hay:

- 5860.

2. Cuantos PN salen hoy en WordPress:

- 8630 PN unicos en 8631 filas (new + superseded).

3. Cuantos salen duplicados:

- 1 PN duplicado (Z=KKN19/19-25.019, por variacion de formato).

4. Cuantos pierden assets por tenerlos en hermanos:

- 4810 PN.

5. Cuantos tienen esquema pero no esquema_pos:

- 500 PN.

6. Cuantos podrian mejorar consolidando hermanos:

- 4810 PN mejorarian por assets.
- 1656 PN recuperarian esquema_pos desde hermanos cuando principal no lo tiene.

7. Que cambio tendria mas impacto inmediato:

- Export consolidado por PN normalizado, acumulando assets y esquema_pos de todos los hermanos.

8. Que tres acciones ejecutar primero:

1. Normalizar PN en salida final y garantizar unicidad por PN.
2. Consolidar exp_imagenes/ruta_esquemas_pos con aporte de todos los hermanos.
3. Consolidar GESA/SUST por PN y validar conflictos antes de escribir export.

## Diagnostico ejecutivo

- La regla de hermanos en engines esta correcta (0 PN con doble Importar, 0 sin Importar).
- La perdida de valor actual es estructural por export principal-only.
- El objetivo correcto no es llenar campos aislados: es una ficha unica y consolidada por PN en WordPress.

## Decision recomendada

Avanzar a implementacion del export consolidado por PN con validaciones obligatorias de:

- unicidad por PN,
- inclusion completa de assets de hermanos,
- inclusion de GESA/SUST aunque esten en copias.
