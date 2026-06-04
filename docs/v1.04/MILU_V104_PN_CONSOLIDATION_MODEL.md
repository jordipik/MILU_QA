# MILU_V104_PN_CONSOLIDATION_MODEL

Fecha: 2026-06-04

## Objetivo

Definir el modelo canónico de entidad única por PN para WordPress.

Principio central:

- Un PN normalizado debe producir una sola ficha funcional.
- Los registros hermanos no compiten entre sí; aportan información acumulada.

## Normalización de PN

Regla de normalización usada en esta fase:

1. Tomar `pn_final`; si no existe, usar `PART NO.`; luego `pn`; luego `sku`.
2. Convertir a mayúsculas.
3. Eliminar espacios internos y externos.

Ejemplo:

- `Z=KKN 19/19-25.019` y `Z=KKN19/19-25.019` quedan en el mismo PN normalizado.

## Universo real medido

- Registros totales en engines: 69681
- PN únicos reales normalizados: 5860
- PN con una sola aparición: 812
- PN con varias apariciones (hermanos/copias): 5048

## Modelo canónico por bloque

### 1) Identidad

Campos base:

- pn_final
- designation_final
- model_type_final
- engine
- libros y páginas de aparición
- IDs origen

Regla:

- `pn_final`: valor único obligatorio de la entidad.
- `designation_final`: valor canónico principal + lista de variantes si hay discrepancias.
- `model_type_final`: lista acumulada única ordenada.
- `engine`: lista acumulada única ordenada.
- libros/páginas: lista acumulada única ordenada.
- IDs origen: lista acumulada única ordenada.

### 2) GESA

Campos:

- gesa_final
- nsn_final
- norma_final
- normalizado_final
- weight_final
- measure_final

Regla:

- Si el campo es semánticamente único por PN (NSN, norma, normalizado):
  - mantener valor canónico si hay un único valor;
  - si hay conflicto, mantener valor principal + lista de conflicto documentada.
- `weight_final` y `measure_final`:
  - mantener valor canónico principal;
  - conservar variantes en metadata de conflicto.

### 3) SUST

Campos:

- sust_status_final
- new_pn_final
- subst_pnlist_final
- hierarchie_final

Regla:

- `new_pn_final` y `hierarchie_final`: únicos canónicos por PN.
- `subst_pnlist_final`: lista acumulada única ordenada.
- En conflicto New/Superseded para el mismo PN, marcar inconsistencia funcional.

### 4) BOM y FG

Campos:

- bom_final
- fg_fgs_final
- fg_code
- fg_description
- fg_code_description

Regla:

- `bom_final`, `fg_code`, `fg_description`, `fg_code_description`: acumulables por contexto (tabla/página/modelo).
- Conservar lista única ordenada, más valor principal para vista resumida.

### 5) Assets

Campos:

- filename_foto
- ruta_foto
- esquemas
- esquemas_circulos
- ruta_esquemas_pos

Regla:

- Todos acumulables.
- Dedupe estable por: engine, página, archivo, posición.
- Nunca perder esquema o esquema_pos por estar en una copia.

### 6) WordPress

Campos:

- exp_imagenes
- exp_categorias
- datos visibles y filtros

Regla:

- `exp_imagenes`: acumulación de fotos y esquemas_pos deduplicados.
- `exp_categorias`: acumulación de model_type + fg_code + contexto engine/libro cuando aplique.

## Tipos de campo en consolidación

### Canónicos (único por PN)

- pn_final
- nsn_final
- norma_final
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
