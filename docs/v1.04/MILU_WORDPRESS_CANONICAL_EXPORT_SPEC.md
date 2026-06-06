# MILU_WORDPRESS_CANONICAL_EXPORT_SPEC

STATUS: SOURCE OF TRUTH
VERSION: V1.04

## Purpose

This document defines the canonical WordPress CSV contract for MILU V1.04.
Implementation, tests, and QA validation must conform to this contract.

## Canonical Column Contract

The export MUST publish exactly 66 columns in this exact order.

### Core fields (1-30)

1. Id
2. fecha_version
3. POS
4. designation
5. engine
6. model_type
7. type
8. pn
9. nsn
10. GESA_NORM
11. GESA_NORMALIZADO
12. fg_code
13. fg_description
14. fg_code_description
15. weight
16. weight_txt
17. measurement
18. TIPOARTICULO
19. PAG
20. BOM_no
21. esquema_general
22. exp_motor
23. exp_categorias
24. atributo
25. SUST_TIPO
26. new_pn_relacionado
27. old_pn_relacionados
28. old_number_01
29. old_ruta_01
30. old_number_02
31. old_ruta_02
32. old_number_03
33. old_ruta_03
34. old_number_04
35. old_ruta_04
36. old_number_05
37. old_ruta_05
38. old_number_06
39. old_ruta_06
40. old_number_07
41. old_ruta_07
42. old_number_08
43. old_ruta_08
44. old_number_09
45. old_ruta_09
46. old_number_10
47. old_ruta_10
48. old_number_11
49. old_ruta_11
50. old_number_12
51. old_ruta_12
52. old_number_13
53. old_ruta_13
54. old_number_14
55. old_ruta_14
56. old_number_15
57. old_ruta_15
58. old_number_16
59. old_ruta_16
60. old_number_17
61. old_ruta_17
62. old_number_18
63. old_ruta_18
64. EN_EXCEL_SUSTITUCION
65. ruta_foto
66. exp_imagenes

## Field Dictionary

### Hierarchy field

- SUST_TIPO:
	- Source: `hierarchie_final` only.
	- No fallback: `sust_hierarchie` is not used for export derivation.
	- If `hierarchie_final` is empty, `SUST_TIPO` must be exported as empty string.

### Existing supersession fields

- old_pn_relacionados:
	- Source: subst_pnlist_final only.
	- No fallback: sust_superseded_list is not used for export derivation.
	- Format: comma-separated list.
	- Backward compatibility field, MUST remain present.

### New V1.04 old relation slots

- old_number_01 ... old_number_18:
	- Source: canonical old PN list derived from old_pn_relacionados and equivalent aliases.
	- Rule: stable order, deduplicated, max 18 entries.
	- If not enough values: remaining slots are empty strings.

- old_ruta_01 ... old_ruta_18:
	- Source: derived from corresponding old_number_N.
	- Rule in V1.04: `https://milu-naval.com/producto/` + old_number_N.
	- Normalization: replace `/` with `-` in the old_number_N token when building the URL slug.
	- If old_number_N is empty: old_ruta_N is empty.

## Consolidation Rules

- 1 PN = 1 output row.
- Rows with qa_revision_accion=Copia do not generate standalone rows.
- Copia rows contribute only to consolidated sibling fields.
- old slots are derived from principal/supersession sources and emitted in all output types (New and Superseded) to keep one shared contract.

## Export Invariants

1. Header count is exactly 66.
2. Header order is immutable unless this spec is updated.
3. Header casing is exact and case-sensitive.
4. old_pn_relacionados remains present.
5. old_number_N and old_ruta_N always exist for N=01..18.
6. old slots never exceed 18 populated entries.
7. old slot values are deduplicated with stable order.
8. Empty old slots are exported as empty strings.
9. Engine JSON files are not modified by this contract extension.
10. Endpoints are unchanged by this contract extension.

## Governance

- This document is the source of truth for export contract.
- Any column/order/semantic update requires:
	1. this spec update,
	2. fixture update (tests/fixtures/wordpress_export_columns_v104.json),
	3. contract test update.

## WordPress Asset URL Policy

Policy for POS assets exported to WordPress:

- POS image assets must use folder-by-model paths:
	- /wp-content/uploads/<MODEL>-POS/<filename>

Not allowed for POS exported assets:

- /wp-content/uploads/2026/01/
- /wp-content/uploads/2026/02/

Normalization rules:

1. Detect monthly URLs in image-related output fields.
2. Resolve target model from filename first.
3. If missing, resolve model from row context (engine_model, exp_motor, model_type, __engine_file).
4. Rebuild URL to /wp-content/uploads/<MODEL>-POS/<basename>.
5. Keep already-normalized /<MODEL>-POS/ URLs unchanged.
6. Normalize sin_imagen.jpeg to fixed global path: /wp-content/uploads/sin_imagen.jpeg.
7. If model cannot be resolved, keep original value and register warning URL_MODEL_NOT_FOUND.

## exp_imagenes Derivation Policy (V1.04)

`exp_imagenes` is a derived export field and must be built during export.

Canonical asset source fields (in this order):

1. filename_foto
2. esquemas_circulos
3. esquemas

Photo routing policy:

- `filename_foto` is always emitted to `/srv/htdocs/wp-content/uploads/2026/fotos/<filename>`.
- Model-based folder routing is not used for photos.

Deprecated as primary source:

- ruta_esquemas_pos
- exp_imagenes
- esquemas_circulos_all
- ruta_foto

Compatibility migration rule:

- `ruta_esquemas_pos` can be used only as fallback when canonical base sources provide no assets.
- `exp_imagenes` and `esquemas_circulos_all` must not be used as source input.

## Examples

Input:

- old_pn_relacionados = "200439016200, 635D01023/1, 0009976290"

Output:

- old_number_01 = "200439016200"
- old_ruta_01 = "200439016200"
- old_number_02 = "635D01023/1"
- old_ruta_02 = "635D01023/1"
- old_number_03 = "0009976290"
- old_ruta_03 = "0009976290"
- old_number_04 ... old_number_18 = ""
- old_ruta_04 ... old_ruta_18 = ""
