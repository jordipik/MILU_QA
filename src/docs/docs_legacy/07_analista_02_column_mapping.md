# Analista 02 Column Mapping

## Purpose
Document the exact field mapping used by the comparison table in `analista_02.html` (`RAW`, `GESA`, `SUST`, `FINAL`, `PDF`, `ERR`).

This file is the maintenance reference when mappings are changed in code.

## Source Of Truth In Code
- UI page: `analista_02.html`
- Mapping builder: `js/analista-02.js` in `buildComparisonRows(row)`
- Special resolvers used by mapping:
  - `getGesaPn(row)`
  - `getSustPn(row)`
  - `getGesaWeightWithUnits(row)`
- PDF extraction logic: `getPdfValueForRow(row, entry, pageText, pnAnchor)`
- ERR source logic:
  - `FIELD_TO_ERROR_KEY`
  - `getStoredFieldErrorCount(row, fieldName)`
  - `renderComparisonTable(row)`

## Source Note (src vs dist)
- Canonical source for development is `js/analista-02.js`.
- Published mirror file is `dist/milu_publish/js/analista-02.js`.
- Any mapping/UI logic change applied in source should be propagated to dist in the same delivery to avoid behavior drift between local dev and published bundle.

## Full Mapping Matrix

| Visible Field | RAW | GESA | SUST | FINAL | PDF resolution | ERR source |
|---|---|---|---|---|---|---|
| POS | `row.POS` | `-` | `-` | `row.pos_final` | tries `FINAL`, then `GESA`, then `RAW` | `row.pos_error` |
| PART NO. | `row["PART NO."]` | `getGesaPn(row)` | `getSustPn(row)` | `row.pn_final` | tries `FINAL`, then `GESA`, then `RAW` | `row.pn_error` |
| DESIGNATION | `row.DESIGNATION` | `row.designation_gesa` | `-` | `row.designation_final` | tries `FINAL`, then `GESA`, then `RAW` | `row.designation_error` |
| MODEL/TYPE | `row["MODEL/TYPE"]` | `-` | `-` | `row["MODEL/TYPE"]` | tries `FINAL`, then `GESA`, then `RAW` | n/a |
| QTY | `row.QTY` | `-` | `-` | `row.qty_final` | tries `FINAL`, then `GESA`, then `RAW` | n/a |
| UNITS | `row.UNITS` | `-` | `-` | `row.UNITS` | tries `FINAL`, then `GESA`, then `RAW` | n/a |
| WEIGHT | `row.WEIGHT` | `getGesaWeightWithUnits(row)` | `-` | `row.weight_final` | tries `FINAL`, then `GESA`, then `RAW` | `row.weight_error` |
| FN | `row.FN` | `-` | `-` | `row.FN` | tries `FINAL`, then `GESA`, then `RAW` | n/a |
| MEASUREMENT / STANDARD | `row["MEASUREMENT / STANDARD"]` | `row.dimensions_gesa` | `-` | `row.measure_final` | tries `FINAL`, then `GESA`, then `RAW` | `row.measurement_error` |
| FG/FGS | `row["FG/FGS"]` | `-` | `-` | `row["FG/FGS"]` | tries `FINAL`, then `GESA`, then `RAW` | n/a |
| BOM-No. | `row["BOM-No."]` | `-` | `-` | `row["BOM-No."]` | special case: searches across full page | `row.bom_error` |
| GESA | `-` | `row.gesa` | `-` | `row.gesa` | tries `FINAL`, then `GESA`, then `RAW` | n/a |
| NSN | `-` | `row.nsn` | `-` | `row.nsn` | tries `FINAL`, then `GESA`, then `RAW` | n/a |
| NORMALIZADO | `-` | `row.normalizado` | `-` | `row.normalizado` | tries `FINAL`, then `GESA`, then `RAW` | n/a |
| NORMA | `-` | `row.norma` | `-` | `row.norma` | tries `FINAL`, then `GESA`, then `RAW` | `row.norma_error` |
| SUST_STATUS | `-` | `-` | `row.sust_status` | `row.sust_status` | tries `FINAL`, then `GESA`, then `RAW` | n/a |
| HIERARCHI | `-` | `-` | `row.hierarchi ?? row.sust_hierarchie` | `row.hierarchi ?? row.sust_hierarchie` | tries `FINAL`, then `GESA`, then `RAW` | n/a |
| SUST_NEW_PART_NUMBER | `-` | `-` | `row.sust_new_part_number` | `row.sust_new_part_number` | tries `FINAL`, then `GESA`, then `RAW` | n/a |
| SUST_SUPERSEDED_LIST | `-` | `-` | `row.sust_superseded_list` | `row.sust_superseded_list` | tries `FINAL`, then `GESA`, then `RAW` | n/a |

Notes:
- `ERR` is no longer computed in the table from live QA checks against PDF text.
- `ERR` is read from persisted JSON counters through `getStoredFieldErrorCount(...)`.
- `row.total_error` remains the total summary used elsewhere in UI state.

## Persisted vs Derived Values

### Persisted (JSON field values)
- `row.POS`, `row.pos_final`
- `row["PART NO."]`, `row.pn_final`
- `row.DESIGNATION`, `row.designation_gesa`, `row.designation_final`
- `row["MODEL/TYPE"]`
- `row.QTY`, `row.qty_final`
- `row.UNITS`
- `row.WEIGHT`, `row.weight_final`
- `row.FN`
- `row["MEASUREMENT / STANDARD"]`, `row.measure_final`, `row.dimensions_gesa`
- `row["FG/FGS"]`
- `row["BOM-No."]`
- `row.gesa`, `row.nsn`, `row.normalizado`, `row.norma`
- `row.sust_status`, `row.hierarchi`, `row.sust_hierarchie`, `row.sust_new_part_number`, `row.sust_superseded_list`
- persisted error counters: `row.pos_error`, `row.pn_error`, `row.designation_error`, `row.weight_error`, `row.measurement_error`, `row.norma_error`, `row.bom_error`, `row.total_error`

### Derived in UI
- `getGesaPn(row)`: if `row.gesa === "SI"`, returns `row.pn_final`, else empty.
- `getSustPn(row)`: if `row.sust_status === "SI"`, returns `row.pn_final`, else empty.
- `getGesaWeightWithUnits(row)`: combines `row.weight_gesa` and `row.units`.
- `PDF` column values: extracted from PDF text matching logic, not read from engine JSON.
- Empty/null display fallback: rendered as `-` by `txt(value, fallback = '-')`.
- `ERR` cell tooltip now reports persisted JSON count for that row field.

## Maintenance Checklist
When changing mapping behavior in `js/analista-02.js`, update this file in the same commit.

1. Update `buildComparisonRows(row)` and any helper resolvers.
2. Sync this matrix with the real code.
3. If PDF extraction strategy changes, update the `PDF resolution` column and notes.
4. If `ERR` source changes (persisted JSON vs live checks), update `ERR source` and notes.
5. Keep examples and field names exactly as in code to avoid drift.

## Last Updated
- 2026-04-20
