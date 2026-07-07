# Module: js/column-view.js

## Purpose
Control table column order/visibility modes and persist column width/view preferences.

## Inputs
- Current `state.columnView` (`qa`, `focus`, `pdf`).
- Header/body DOM rows.

## Outputs
- Reordered and hidden/shown columns in header/filter/body rows.
- Saved view/width preferences in localStorage.

## Dependencies
- `state`
- DOM APIs + localStorage

## Core Logic
- Define predefined index orders for `focus` and `pdf` modes.
- Normalize order to include all columns exactly once.
- Apply ordering and visibility row by row.
- Track and restore user column widths.

## Special Cases / Risks
- Index-based column ordering assumes stable table schema.
- New columns must be reflected in predefined order arrays when needed.
