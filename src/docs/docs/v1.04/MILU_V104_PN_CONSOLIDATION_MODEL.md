# MILU_V104_PN_CONSOLIDATION_MODEL

Fecha: 2026-06-05

## Objetivo

Definir el modelo canonico para construir una entidad unica por PN y exportar una sola ficha en WordPress.

Regla central:

- Cada PN sale una sola vez.
- Los hermanos/copias del mismo PN no compiten: acumulan informacion.

## Universo auditado

- Fuentes: 9 archivos engine_*.json.
- Registros totales: 69681.
- PN unicos reales normalizados: 5860.
- PN con una sola aparicion: 812.
- PN con varias apariciones: 5048.

## Normalizacion oficial de PN

Para agrupar registros hermanos:

1. Tomar pn_final; fallback PART NO.; fallback pn_raw/pn_excel/pn_pdf.
2. trim.
3. uppercase.
4. eliminar espacios internos multiples y separacion espuria.

Ejemplo: Z=KKN 19/19-25.019 y Z=KKN19/19-25.019 son el mismo PN.

## Entidad canonicamente consolidada por PN

### Identidad

Campos:

- pn_final
- designation_final
- model_type_final
- engine
- libros/paginas de aparicion
- IDs origen

Regla:

- pn_final es unico y obligatorio.
- designation_final usa valor canonico de principal + variantes si hay conflicto.
- model_type_final y engine se consolidan como lista unica ordenada.
- libros/paginas e IDs origen se consolidan como listas unicas ordenadas.

### GESA

Campos:

- gesa_final
- nsn_final
- norma_final
- normalizado_final
- weight_final
- measure_final

Regla:

- nsn_final, norma_final y normalizado_final se tratan como unicos por PN.
- Si hay mas de un valor: guardar canonico + variantes + bandera de conflicto.
- weight_final y measure_final se guardan canonicos y se retienen variantes trazables.

### SUST

Campos:

- sust_status_final
- new_pn_final
- subst_pnlist_final
- hierarchie_final

Regla:

- sust_status_final, new_pn_final y hierarchie_final se tratan como unicos por PN.
- subst_pnlist_final es acumulable (lista unica ordenada).
- Nunca mezclar New/Superseded sin conflicto explicito.

### BOM y FG

Campos:

- bom_final
- fg_fgs_final
- fg_code
- fg_description
- fg_code_description

Regla:

- Es informacion de contexto tabla/pagina/BOM: consolidar en listas unicas ordenadas.
- Mantener un valor principal para visualizacion resumida.

### Assets

Campos:

- filename_foto
- ruta_foto
- esquemas
- esquemas_circulos
- ruta_esquemas_pos

Regla:

- Acumular todos los assets de todos los hermanos.
- Deduplicar en orden estable: engine, pagina, nombre archivo, posicion.
- Nunca descartar assets por no estar en la fila principal.

### WordPress

Campos:

- exp_imagenes
- exp_categorias
- datos visibles/filtros

Regla:

- exp_imagenes = foto principal (si existe) + fotos adicionales + esquemas_pos unicos de todos los hermanos.
- fallback sin_imagen solo si no existe ningun asset real.
- exp_categorias = acumulacion unica de categorias derivadas de todos los hermanos.

## Politica de consolidacion por tipo de campo

Campos unicos por PN:

- pn_final
- nsn_final
- norma_final
- normalizado_final
- sust_status_final
- new_pn_final
- hierarchie_final

Campos acumulables:

- model_type_final
- engine
- libros/paginas
- IDs origen
- bom_final
- fg_fgs_final
- fg_code/fg_description/fg_code_description
- filename_foto/ruta_foto
- esquemas/esquemas_circulos/ruta_esquemas_pos
- exp_categorias

## Regla de conflicto

Cuando hay valores diferentes para el mismo PN:

1. No machacar valores sin criterio.
2. Si el dato es acumulable: lista unica ordenada.
3. Si el dato es unico: seleccionar canonico por orden estable de principal y conservar variantes conflictivas para auditoria.
- normalizado_final
- sust_status_final
- new_pn_final
- hierarchie_final

### Acumulables (lista única)

- engine
- libros/páginas
- IDs origen
- model_type_final
- subst_pnlist_final
- bom_final
- fg_fgs_final
- fg_code
- fg_description
- fg_code_description
- filename_foto
- ruta_foto
- esquemas
- esquemas_circulos
- ruta_esquemas_pos
- exp_imagenes
- exp_categorias

### Híbridos (canónico + variantes)

- designation_final
- weight_final
- measure_final

## Criterio de resolución

1. No machacar valores distintos sin criterio.
2. Acumular cuando el dominio es naturalmente múltiple.
3. Resolver a canónico cuando el dominio es único por PN.
4. Si hay conflicto en campo único:
   - conservar principal por orden estable;
   - registrar conflictos de soporte para QA.
