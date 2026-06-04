# MILU_V104_PN_CONSOLIDATION_EXECUTIVE_SUMMARY

Fecha: 2026-06-04

## Respuestas directas

1. ¿Cuántos PN únicos reales hay?

- 5860

2. ¿Cuántos PN salen hoy en WordPress?

- 8630 PN únicos en 8631 filas (import + superseded).

3. ¿Cuántos salen duplicados?

- 1 PN duplicado por variación de formato.

4. ¿Cuántos pierden assets por tenerlos en hermanos?

- 1744 PN.

5. ¿Cuántos tienen esquema pero no esquema_pos?

- 486 PN.

6. ¿Cuántos podrían mejorar consolidando hermanos?

- 1639 PN mejorarían recuperando esquema_pos desde hermanos.
- 145 PN mejorarían al menos un asset completo desde hermanos.

7. ¿Qué cambio tendría más impacto inmediato?

- Consolidar assets y esquema_pos por PN en una única ficha WordPress.

8. ¿Qué tres acciones ejecutar primero?

1. Normalizar PN en export final y bloquear duplicados por formato.
2. Consolidar ruta_esquemas_pos y exp_imagenes con aporte de hermanos.
3. Consolidar GESA/SUST por PN con validación de conflictos antes de salida.

## Diagnóstico ejecutivo

- La regla de hermanos en engines está funcionalmente sana.
- El mayor problema no está en el marcado Importar/Copia, sino en la pérdida de valor al exportar por fila sin consolidación.
- El rediseño por entidad PN única tiene impacto inmediato y medible en calidad WordPress.

## Decisión recomendada

- Avanzar a implementación de export consolidado por PN con validaciones obligatorias de unicidad y de no pérdida de información entre hermanos.
