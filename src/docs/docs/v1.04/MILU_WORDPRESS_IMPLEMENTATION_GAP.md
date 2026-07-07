# MILU_WORDPRESS_IMPLEMENTATION_GAP

Fecha: 2026-06-05

## Scope

Comparison between:
- Canonical spec: docs/v1.04/MILU_WORDPRESS_CANONICAL_EXPORT_SPEC.md
- Current implementation: scripts/export_wordpress_milu.js

No runtime code changed. No export regenerated.

## Overall Gap Summary

- Header contract: CUMPLE.
- Principal vs sibling consolidation split: PARCIAL.
- Alphabetical stable ordering for consolidated fields: NO CUMPLE.
- Scope exclusions for canonical New export: PARCIAL.
- Invariant "Copia never generates rows": CUMPLE (directly), but sibling contribution behavior is PARCIAL.

## Field-level Compliance

| Field | Status | Notes |
|---|---|---|
| Id | cumple | Built in buildMergedRow from source id aliases. |
| fecha_version | cumple | Built in buildMergedRow. |
| POS | cumple | Principal canonical value via getPos. |
| designation | cumple | Principal canonical value via getDesignation. |
| engine | parcial | Current logic uses dominant value; spec requires full sibling consolidation list. |
| model_type | parcial | Consolidated list exists, but ordering is insertion-based, not guaranteed alphabetical stable. |
| type | cumple | Principal canonical value. |
| pn | cumple | Canonical pn via getExportField aliases. |
| nsn | cumple | Principal canonical value. |
| GESA_NORM | cumple | Principal canonical value. |
| GESA_NORMALIZADO | cumple | Principal canonical value. |
| fg_code | cumple | Canonical from fg fields with normalization. |
| fg_description | cumple | Derived from catalog lookup. |
| fg_code_description | cumple | Derived concatenation. |
| weight | cumple | Principal canonical value via priority. |
| weight_txt | cumple | Principal canonical value with fallback to weight. |
| measurement | cumple | Principal canonical value via priority. |
| TIPOARTICULO | cumple | Principal canonical value. |
| PAG | no cumple | Current value is most-frequent single page, not consolidated sibling list. |
| BOM_no | cumple | Principal canonical value. |
| esquema_general | parcial | Reads schema_general only; does not fully aggregate sibling esquema context by rule. |
| exp_motor | parcial | Falls back to single engine dominant value; not full sibling list. |
| exp_categorias | parcial | Derived aggregation exists, but does not enforce canonical alphabetical ordering and may diverge semantically. |
| atributo | no cumple | Current behavior is principal-like pickMostFrequent; spec requires sibling consolidation. |
| SUST_TIPO | cumple | Principal hierarchy with alias support. |
| new_pn_relacionado | cumple | Principal canonical value from prioritized fields. |
| old_pn_relacionados | cumple | Principal canonical list with alias merge. |
| EN_EXCEL_SUSTITUCION | cumple | Principal canonical value. |
| ruta_foto | cumple | Principal canonical value with fallback. |
| exp_imagenes | parcial | Aggregation exists (filename_foto + ruta_esquemas_pos) but no explicit alphabetical sort and sibling asset guarantees are not fully enforced by invariant checks. |

## Rule-level Gap

### Rule: 1 PN = 1 row
- Status: CUMPLE.
- Current behavior groups by PN key and dedupes per PN.

### Rule: Copia never generates rows, only contributes
- Status: PARCIAL.
- Current behavior does not generate rows from Copia directly.
- However, when Importar exists, selectedRows uses ok/importar rows and Copia rows are generally excluded from merge input.

### Rule: Consolidated fields from all siblings
- Status: NO CUMPLE.
- Multiple consolidated targets (engine, PAG, exp_motor, atributo, schema context) are not guaranteed to include all sibling contributions.

### Rule: Dedupe + stable alphabetical order
- Status: NO CUMPLE.
- Current joinUnique preserves insertion order, not explicit alphabetical sort.

### Rule: Scope exclusions (Revisar/Error/Eliminar)
- Status: CUMPLE.
- Current decision flow keeps these out of import/superseded outputs.

### Rule: superseded excluded from canonical New
- Status: PARCIAL.
- Current implementation produces dedicated superseded output, but behavior is script-wide and not explicitly separated as a canonical New-only contract phase.

## Required follow-up after this audit

1. Implement principal-only and sibling-only split exactly as spec defines.
2. Enforce alphabetical stable ordering for all consolidated fields.
3. Ensure Copia contributions are included for consolidated fields while never producing rows.
4. Add invariant tests for sibling contribution guarantees (assets, pages, model_type, esquema).