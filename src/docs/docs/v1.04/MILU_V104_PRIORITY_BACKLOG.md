# MILU_V104_PRIORITY_BACKLOG

Fecha: 2026-06-04

## Criterio

- P1 = afecta claramente a cobertura funcional, export o QA de forma directa.
- P2 = impacta, pero no bloquea toda la cadena.
- P3 = mejora futura o de refinamiento.

## Backlog priorizado

| Prioridad | Problema | Impacto usuario | Impacto WordPress | Impacto QA | Dificultad | Recomendacion |
|---|---|---|---|---|---|---|
| P1 | Model Type casi vacio | Muy alto | Alto | Medio | Media | Recuperar fuente de `MODEL/TYPE` y estabilizar su derivacion final. |
| P1 | Fotos muy bajas | Muy alto | Muy alto | Bajo | Media | Subir la tasa de `ruta_foto`/`filename_foto` y corregir rutas rotas. |
| P1 | Norma muy baja | Alto | Alto | Alto | Media | Consolidar `GESA_NORM` y `norma` en un unico flujo y hacerlo verificable. |
| P1 | FG/FGS incompleto | Alto | Alto | Medio | Media | Normalizar `fg_fgs_final` y su descripcion para todos los libros. |
| P1 | Export WordPress sin flag synthetic por fila | Medio | Muy alto | Bajo | Baja | Persistir un indicador de sinteticidad en el contrato de salida. |
| P2 | PN errores dominan QA | Alto | Medio | Alto | Media | Atacar el origen de `pn_error` antes de ampliar otros ajustes. |
| P2 | POS errores persistentes | Medio | Medio | Alto | Media | Revisar la resolucion de pagina/POS y las referencias de hermano. |
| P2 | Grupos de hermanos con demasiada reutilizacion | Medio | Bajo | Medio | Media | Introducir trazabilidad mas clara de origen real vs copia. |
| P2 | Cobertura de esquema POS desigual por libro | Medio | Medio | Bajo | Baja | Corregir los libros con mas huecos en `ruta_esquemas_pos`. |
| P3 | Cobertura completa estricta inexistente | Medio | Medio | Medio | Alta | Definir una ruta de maduracion por bloques para llegar a completitud real. |

## Impacto resumido

- El problema mas costoso hoy es la combinacion de Model Type, Fotos y Norma.
- La calidad WordPress depende directamente de esos tres huecos.
- QA necesita una reduccion clara de `pn_error` antes de escalar cualquier otra mejora.
