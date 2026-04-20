# Analista 02 Column Mapping

## Purpose
Document the exact field mapping used by the comparison table in `analista_02.html` (`RAW`, `GESA`, `SUST`, `FINAL`, `PDF`).

This file is the maintenance reference when mappings are changed in code.

## Source Of Truth In Code
- UI page: `analista_02.html`
- Mapping builder: `js/analista-02.js` in `buildComparisonRows(row)`
- Special resolvers used by mapping:
  - `getGesaPn(row)`
  - `getSustPn(row)`
  - `getGesaWeightWithUnits(row)`
- PDF extraction logic: `getPdfValueForRow(row, entry, pageText, pnAnchor)`

## Full Mapping Matrix

| Visible Field | RAW | GESA | SUST | FINAL | PDF resolution |
|---|---|---|---|---|---|
| POS | `row.POS` | `-` | `-` | `row.pos_final` | tries `FINAL`, then `GESA`, then `RAW` |
| PART NO. | `row["PART NO."]` | `getGesaPn(row)` | `getSustPn(row)` | `row.pn_final` | tries `FINAL`, then `GESA`, then `RAW` |
| DESIGNATION | `row.DESIGNATION` | `row.designation_gesa` | `-` | `row.designation_final` | tries `FINAL`, then `GESA`, then `RAW` |
| MODEL/TYPE | `row["MODEL/TYPE"]` | `-` | `-` | `row.model_final` | tries `FINAL`, then `GESA`, then `RAW` |
| QTY | `row.QTY` | `-` | `-` | `row.qty_final` | tries `FINAL`, then `GESA`, then `RAW` |
| UNITS | `row.UNITS` | `-` | `-` | `row.UNITS` | tries `FINAL`, then `GESA`, then `RAW` |
| WEIGHT | `row.WEIGHT` | `getGesaWeightWithUnits(row)` | `-` | `row.weight_final` | tries `FINAL`, then `GESA`, then `RAW` |
| FN | `row.FN` | `-` | `-` | `row.FN` | tries `FINAL`, then `GESA`, then `RAW` |
| MEASUREMENT / STANDARD | `row["MEASUREMENT / STANDARD"]` | `row.dimensions_gesa` | `-` | `row.measure_final` | tries `FINAL`, then `GESA`, then `RAW` |
| FG/FGS | `row["FG/FGS"]` | `-` | `-` | `row["FG/FGS"]` | tries `FINAL`, then `GESA`, then `RAW` |
| BOM-No. | `row["BOM-No."]` | `-` | `-` | `row["BOM-No."]` | special case: searches across full page |
| GESA | `-` | `row.gesa` | `-` | `row.gesa` | tries `FINAL`, then `GESA`, then `RAW` |
| NSN | `-` | `row.nsn` | `-` | `row.nsn` | tries `FINAL`, then `GESA`, then `RAW` |
| NORMALIZADO | `-` | `row.normalizado` | `-` | `row.normalizado` | tries `FINAL`, then `GESA`, then `RAW` |
| NORMA | `-` | `row.norma` | `-` | `row.norma` | tries `FINAL`, then `GESA`, then `RAW` |
| SUST_STATUS | `-` | `-` | `row.sust_status` | `row.sust_status` | tries `FINAL`, then `GESA`, then `RAW` |
| SUST | `-` | `-` | `row.sust` | `row.sust` | tries `FINAL`, then `GESA`, then `RAW` |
| HIERARCHI | `-` | `-` | `row.hierarchi ?? row.sust_hierarchie` | `row.hierarchi ?? row.sust_hierarchie` | tries `FINAL`, then `GESA`, then `RAW` |
| SUST_NEW_PART_NUMBER | `-` | `-` | `row.sust_new_part_number` | `row.sust_new_part_number` | tries `FINAL`, then `GESA`, then `RAW` |
| SUST_SUPERSEDED_LIST | `-` | `-` | `row.sust_superseded_list` | `row.sust_superseded_list` | tries `FINAL`, then `GESA`, then `RAW` |

## Persisted vs Derived Values

### Persisted (JSON field values)
- `row.POS`, `row.pos_final`
- `row["PART NO."]`, `row.pn_final`
- `row.DESIGNATION`, `row.designation_gesa`, `row.designation_final`
- `row["MODEL/TYPE"]`, `row.model_final`
- `row.QTY`, `row.qty_final`
- `row.UNITS`
- `row.WEIGHT`, `row.weight_final`
- `row.FN`
- `row["MEASUREMENT / STANDARD"]`, `row.measure_final`, `row.dimensions_gesa`
- `row["FG/FGS"]`
- `row["BOM-No."]`
- `row.gesa`, `row.nsn`, `row.normalizado`, `row.norma`
- `row.sust_status`, `row.sust`, `row.hierarchi`, `row.sust_hierarchie`, `row.sust_new_part_number`, `row.sust_superseded_list`

### Derived in UI
- `getGesaPn(row)`: if `row.gesa === "SI"`, returns `row.pn_final`, else empty.
- `getSustPn(row)`: same rule as `getGesaPn(row)`.
- `getGesaWeightWithUnits(row)`: combines `row.weight_gesa` and `row.units`.
- `PDF` column values: extracted from PDF text matching logic, not read from engine JSON.
- Empty/null display fallback: rendered as `-` by `txt(value, fallback = '-')`.

## Maintenance Checklist
When changing mapping behavior in `js/analista-02.js`, update this file in the same commit.

1. Update `buildComparisonRows(row)` and any helper resolvers.
2. Sync this matrix with the real code.
3. If PDF extraction strategy changes, update the `PDF resolution` column and notes.
4. Keep examples and field names exactly as in code to avoid drift.

## Last Updated
- 2026-04-20
