# MILU_V104_HERMANOS_WORDPRESS_AUDIT

Fecha: 2026-06-05

## Alcance

Auditoria de regla de hermanos y su reflejo en export WordPress, sin modificar datos.

## Metricas solicitadas

| Metrica | Valor |
|---|---:|
| total PN unicos | 5860 |
| PN con una sola aparicion | 812 |
| PN con varios hermanos | 5048 |
| PN con mas de un Importar | 0 |
| PN sin Importar | 0 |
| PN con copias mal marcadas | 0 |
| PN que salen duplicados en WordPress | 1 |

## Duplicado detectado en WordPress

PN normalizado duplicado:

- Z=KKN19/19-25.019

Ubicacion:

- data/output/wordpress/milu_wp_superseded.csv contiene 2 filas para ese PN (una con espacio interno y otra sin espacio).

Causa:

- Normalizacion de PN no aplicada de forma estricta en la ultima milla del export.

## Propuesta de correccion (sin escritura en esta fase)

1. Normalizar PN antes de dedupe final de new y superseded.
2. Aplicar unicidad por PN normalizado en salida.
3. Mantener traza de merge de filas para auditoria.

## Conclusiones

- La regla Importar/Copia por PN en engines cumple.
- El unico incumplimiento funcional observado esta en la unicidad final WordPress.
