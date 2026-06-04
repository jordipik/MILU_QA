# MILU_V104_WORDPRESS_CONSOLIDATED_EXPORT_SPEC

Fecha: 2026-06-05

## Objetivo

Redefinir el export para que WordPress reciba una unica ficha consolidada por PN.

## Regla de export consolidado

1. Input: todos los engine_*.json.
2. Agrupacion: por PN normalizado.
3. Seleccion de principal: primera aparicion por orden estable (modelo/libro, source_page, pos, ID).
4. Estado: principal = ok/Importar; hermanos = ok/Copia.
5. Salida: una sola fila WordPress por PN normalizado.
6. Campos de fila: canonicos del principal cuando aplique.
7. GESA/SUST: consolidados por PN.
8. engines/libros/paginas: acumulados.
9. BOM/FG: acumulados cuando aportan contexto.
10. fotos: acumuladas y deduplicadas.
11. esquemas: acumulados y deduplicados.
12. esquemas_pos: acumulados y deduplicados.
13. categorias: acumuladas y deduplicadas.
14. exp_imagenes: foto principal si existe + fotos adicionales + esquemas_pos unicos de todos los hermanos.
15. fallback sin_imagen: solo si no hay nada mejor.
16. exp_categorias: acumular todas las categorias derivadas de todos los hermanos (model_type, fg_code, engine/libro cuando aplique).
17. Superseded: consolidar por PN, no por fila individual.

## Politica de conflicto

- Campo unico por PN con conflicto: conservar canonico + variantes conflictivas auditables.
- Campo acumulable: union unica ordenada.

## Validaciones obligatorias

1. PN unico en new y superseded.
2. cero duplicados por formato de PN.
3. assets de hermanos incluidos en la fila final.
4. GESA/SUST incluidos aunque esten en copia.
5. si hay esquema y POS encontrado, debe existir esquema_pos enlazado.

## KPI de aceptacion

- duplicados WordPress por PN = 0.
- perdida de assets por principal-only = 0.
- perdida de GESA/SUST por principal-only = 0.
- perdida de esquema_pos por no consolidar hermanos = 0.

## Notas de compatibilidad

- No cambia endpoints en esta fase de especificacion.
- Se conserva estructura de salida CSV/JSON ya consumida por UI, cambiando la logica de composicion por PN.
