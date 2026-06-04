# MILU_WORDPRESS_CANONICAL_EXPORT_SPEC

STATUS: SOURCE OF TRUTH
VERSION: V1.04

## Purpose

This document is the official functional contract for WordPress export in MILU.
From V1.04 onward, expected behavior is defined here first.
Code must implement this specification.

Any future export change must update this document.

## Canonical Column Contract

The export MUST publish exactly these 30 columns in this exact order:

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
28. EN_EXCEL_SUSTITUCION
29. ruta_foto
30. exp_imagenes

## WordPress Field Dictionary

Notes:
- Generator references are for current implementation mapping in scripts/export_wordpress_milu.js.
- Line references are approximate and may shift after refactors.
- Mandatory means mandatory in schema, not necessarily non-empty in every row.

| Field | Type | Example | Generator (file:line) | Source in engine_*.json | Principal/Hermanos | Consolidation rule | Fallback | Mandatory |
|---|---|---|---|---|---|---|---|---|
| Id | string | RB-12V4000M40A-001989 | buildMergedRow (~498) | ID, rebuild_legacy_engine_id | Principal | Canonical single value | Most frequent non-empty | Yes |
| fecha_version | string | 20260131.2339 | buildMergedRow (~498) | fecha_version | Principal | Canonical single value | Most frequent | Yes |
| POS | string | 240 | buildMergedRow/getPos (~498/~297) | POS, pos_final | Principal | Canonical single value | Most frequent | Yes |
| designation | string | UNION | buildMergedRow/getDesignation (~498/~299) | designation_final, designation_gesa, DESIGNATION | Principal | Canonical single value | Most frequent by priority | Yes |
| engine | string list | 12V4000M40A | buildMergedRow/getEngineName (~498/~293) | engine_model, model, engine, __engine_file | Hermanos | Unique sorted list from all siblings | If empty, derive from file | Yes |
| model_type | string list | 12VM40A, 16VM61 | buildMergedRow/deriveModelTypeToken (~498/~214) | model_type_final plus engine/model derivation | Hermanos | Unique sorted list from all siblings | Derived token from engine/model | Yes |
| type | string |  | buildMergedRow (~498) | type | Principal | Canonical single value | Most frequent | Yes |
| pn | string | 135M27020/1 | buildMergedRow/getPn (~498/~272) | pn_final, PART NO., pn_excel, pn, sku | Principal | Canonical PN (normalized grouping key) | Alias resolution via getExportField | Yes |
| nsn | string | 5365123031710 | buildMergedRow (~498) | nsn | Principal | Canonical single value | Most frequent | Yes |
| GESA_NORM | string | ISO4017 | buildMergedRow (~498) | GESA_NORM | Principal | Canonical single value | Most frequent | Yes |
| GESA_NORMALIZADO | string | SI | buildMergedRow (~498) | GESA_NORMALIZADO | Principal | Canonical single value | Most frequent | Yes |
| fg_code | string | 233 | buildMergedRow/extractPrimaryFgCode (~498/~206) | fg_code, fg_fgs_final, FG/FGS | Principal | Canonical single value | normalizeFgCode | Yes |
| fg_description | string | BASE SKID WITH MOUNTS | buildMergedRow/lookupFgDescriptionByCodeAndModel (~498/~202) | EXCEL_FG-FGS.json + code/model | Principal | Canonical single value | Catalog lookup | Yes |
| fg_code_description | string | 233 BASE SKID WITH MOUNTS | buildMergedRow (~498) | Derived from fg_code + fg_description | Principal | Canonical derived value | Join code + description | Yes |
| weight | string | 0.051 KGM | buildMergedRow/getWeight (~498/~301) | weight_final, weight_gesa, WEIGHT | Principal | Canonical single value | Most frequent by priority | Yes |
| weight_txt | string | 0.051 KGM | buildMergedRow (~498) | weight_txt | Principal | Canonical single value | weight when weight_txt missing | Yes |
| measurement | string | M 18 X 1,5 | buildMergedRow/getMeasurement (~498/~299) | measure_final, measurement_final, dimensions_gesa, MEASUREMENT / STANDARD | Principal | Canonical single value | Most frequent by priority | Yes |
| TIPOARTICULO | string | piezas | buildMergedRow (~498) | TIPOARTICULO | Principal | Canonical single value | Most frequent | Yes |
| PAG | string list | 12V4000M40A-0231, 16V4000M61-0220 | buildMergedRow/getSourcePage (~498/~295) | PAG, Source Page, rebuild_source_page | Hermanos | Unique sorted list from all siblings | Source Page fallback when PAG missing | Yes |
| BOM_no | string | XS526230.00022 | buildMergedRow (~498) | BOM_no, BOM-No. | Principal | Canonical single value | Most frequent | Yes |
| esquema_general | string list | 12V4000M40A-0231-01.webp | buildMergedRow (~498) | esquema_general, esquemas | Hermanos | Unique sorted list from all siblings | Empty when none | Yes |
| exp_motor | string list | 12V4000M40A, 16V4000M61 | buildMergedRow (~498) | exp_motor and/or engine-derived | Hermanos | Unique sorted list from all siblings | engine list fallback | Yes |
| exp_categorias | string list | 12VM40A-233, 16VM61-233 | deriveExpCategorias/buildMergedRow (~237/~498) | model_type + fg_code derived from siblings | Hermanos | Unique sorted list from all siblings | Empty when no model/code | Yes |
| atributo | string list | Accesories | buildMergedRow (~498) | atributo | Hermanos | Unique sorted list from all siblings | Empty when none | Yes |
| SUST_TIPO | string | New | getHierarchy/buildMergedRow (~291/~498) | hierarchie_final, sust_hierarchie, SUST_TIPO | Principal | Canonical single value | Default New if missing | Yes |
| new_pn_relacionado | string | 000910018001 | getNewPartNumber/buildMergedRow (~279/~498) | new_pn_final, sust_new_part_number, New Part Number | Principal | Canonical single value | Most frequent by priority | Yes |
| old_pn_relacionados | string list | 0009979530, 000N03038/1 | getSupersededListValue/buildMergedRow (~284/~498) | subst_pnlist_final, sust_superseded_list | Principal | Canonical list from principal | Merge csv aliases | Yes |
| EN_EXCEL_SUSTITUCION | string | SI | buildMergedRow (~498) | EN_EXCEL_SUSTITUCION | Principal | Canonical single value | Most frequent | Yes |
| ruta_foto | string | https://.../0000530926.jpeg | buildMergedRow (~498) | ruta_foto, filename_foto | Principal | Canonical single value | filename_foto fallback | Yes |
| exp_imagenes | string list | https://.../12V4000M40A-0229-02-1425.webp | deriveExpImagenes/buildMergedRow (~248/~498) | filename_foto, ruta_esquemas_pos, esquemas context | Hermanos | Unique sorted list of all PN assets | synthetic fallback sin_imagen only when needed | Yes |

## Consolidation Rules

Core rule:
- 1 PN = 1 WordPress row.

Behavior:
- Rows marked ok/Copia NEVER generate rows.
- Rows marked ok/Copia ONLY contribute information to consolidated fields.

### Principal-only fields

These fields come only from the principal row (qa_revision_estado=ok and qa_revision_accion=Importar):
- POS
- designation
- pn
- nsn
- GESA_NORM
- GESA_NORMALIZADO
- weight
- weight_txt
- measurement
- BOM_no
- SUST_TIPO
- new_pn_relacionado
- old_pn_relacionados
- EN_EXCEL_SUSTITUCION
- ruta_foto

### Sibling-consolidated fields

These fields are accumulated from all siblings in the PN group:
- model_type
- engine
- PAG
- esquema_general
- exp_motor
- exp_categorias
- atributo
- exp_imagenes

Mandatory consolidation rules for these fields:
- Deduplication required.
- Stable alphabetical ordering required.
- No repeated values.
- Traceability retained (source ids/pages available in audit metadata).

## Export Invariants

1. A PN appears only once.
2. There is never more than one row for the same PN.
3. Sibling rows never generate rows.
4. Sibling rows only contribute data.
5. exp_imagenes contains all unique PN assets.
6. If any sibling has esquema_pos, WordPress row must contain it.
7. If any sibling has esquema, WordPress row must contain it.
8. If any sibling has model_type, WordPress row must contain it.
9. If any sibling has page, WordPress row must contain it.
10. Column contract is immutable unless this spec is updated.

## Export Scope

Included in canonical New export:
- qa_revision_estado = ok
- qa_revision_accion = Importar

Excluded from direct row generation:
- qa_revision_accion = Copia (contributes consolidation only)
- hierarchie_final = superseded (except dedicated superseded export)
- Revisar rows
- Error rows
- Eliminar rows

## Governance

This document is the official source of truth.
Any change in columns, order, semantics, or invariants MUST update this document first.
