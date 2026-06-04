# MILU_V104_WORDPRESS_PN_UNIQUENESS_AUDIT

Fecha: 2026-06-05

## Alcance

Auditoria de export WordPress real usando:

- data/output/wordpress/milu_wp_new_import.csv
- data/output/wordpress/milu_wp_superseded.csv

No se modificaron datos ni scripts en esta fase.

## Volumen y unicidad

| Validacion | Valor |
|---|---:|
| filas new | 5501 |
| filas superseded | 3130 |
| filas totales | 8631 |
| PN unicos en export total | 8630 |
| filas duplicadas por PN | 1 |
| PN exportables no presentes | 0 |

Detalle de duplicado:

- PN: Z=KKN19/19-25.019
- aparece 2 veces en superseded por variacion de formato.

## Validaciones funcionales pedidas

1. Cuantas filas salen: 8631.
2. Cuantos PN unicos salen: 8630.
3. Cuantos PN salen duplicados: 1.
4. Cuantos PN exportables no salen: 0.
5. Cuantos PN salen como Importar: 5860 (inferido desde fuente engines para PN exportados).
6. Cuantos PN salen como Copia: 0 en CSV exportado; 5048 PN exportados tienen hermanos tipo Copia en origen.
7. PN con mas de una fila Importar: 0 en fuente; 1 duplicado de salida por normalizacion.
8. PN cuyas copias tienen assets no presentes en fila principal WordPress: 4810.
9. PN donde GESA/SUST se pierde por vivir en copia/no principal: 414.
10. PN donde esquemas/esquemas_pos se pierden por estar en hermanos no consolidados: 4810.

## Resultado esperado de esta fase

Valor perdido por exportar principal-only es alto y estructural:

- 4810 PN pierden assets.
- 414 PN pierden informacion GESA/SUST potencialmente relevante.

Conclusion:

- El problema no es solo duplicidad puntual; es perdida sistematica por no consolidar hermanos en una entidad unica por PN.
