# MILU V1.04 - WordPress Patch Validation

## Scope

This validation confirms the real patch applied to `scripts/export_wordpress_milu.js` against the canonical contract defined in `docs/v1.04/MILU_WORDPRESS_CANONICAL_EXPORT_SPEC.md`.

Constraints preserved:

- No changes to 30-column canonical header/order.
- No runtime endpoint changes.
- No writes to engine source JSON as part of this patch.
- No definitive export regeneration in this validation.

## Before vs After

| Rule | Before (gap audit) | After patch |
|---|---|---|
| Copia contributes to consolidated fields | PARCIAL | CUMPLE |
| PAG consolidated (Importar + Copia) | NO CUMPLE | CUMPLE |
| atributo consolidated (Importar + Copia) | NO CUMPLE | CUMPLE |
| Stable alphabetical dedupe for consolidated lists | NO CUMPLE | CUMPLE |
| engine consolidated from sibling set | PARCIAL | CUMPLE |
| model_type consolidated from sibling set | PARCIAL | CUMPLE |
| esquema_general consolidated from sibling set | PARCIAL | CUMPLE |
| exp_motor consolidated from sibling set | PARCIAL | CUMPLE |
| exp_categorias consolidated from sibling set | PARCIAL | CUMPLE |
| exp_imagenes consolidated, deduped, max 10, fallback when empty | PARCIAL | CUMPLE |
| Copia never generates standalone row | CUMPLE | CUMPLE |

## Implemented changes

- Added `joinUniqueSorted(values, maxItems)` for deterministic, alphabetical, case-insensitive dedupe.
- Added sibling-aware consolidation scope:
  - `isQaOkCopyRow(row)`
  - `hasImportableRow(rows)`
  - `getConsolidationRows(rows)`
- Updated merge behavior for canonical consolidated fields in `buildMergedRow(...)`:
  - `PAG`
  - `atributo`
  - `engine`
  - `model_type`
  - `esquema_general`
  - `exp_motor`
  - `exp_categorias`
  - `exp_imagenes`
- Updated `run(...)` to pass `consolidatedRows` while preserving principal-row source for non-consolidated fields.
- Updated `deriveExpCategorias(...)` and `mergeCsvField(...)` to use deterministic sorted dedupe.
- Updated `deriveExpImagenes(...)` to:
  - include sibling assets,
  - dedupe/sort,
  - cap to 10 values,
  - fallback to `sin_imagen` URL only when no real asset exists.

## Test evidence

Added `tests/wordpress-export-consolidation.test.js` with 10 tests covering:

1. PAG consolidation
2. atributo consolidation
3. engine consolidation
4. model_type consolidation
5. esquema_general consolidation
6. exp_motor consolidation
7. exp_categorias consolidation
8. exp_imagenes consolidation + max 10 + ordering
9. Copia contribution while principal fields remain principal-driven
10. Copia rows alone are never importable

Canonical header contract tests remain in `tests/wordpress-export-contract.test.js` unchanged in behavior.
