# Project Structure Map

## Top-Level Layout

### Runtime core
- `server.js`: Express backend for health, single-cell save and QA checks
- `qa_milu.html`: main QA application page
- `js/`: frontend ES modules
- `styles/qa_milu.css`: main UI styling
- `engine_*.json` (8 files): runtime datasets

### Runtime support assets
- `pdf/`: source PDF files displayed in viewer
- `esquemas/`: schema images by engine
- `esquemas_pos_circulos/`: position-circle images by engine
- `fotos_articulos/`, `fotos_motores/`: image assets

### Reference datasets
- `MILU_New_v506.json`: reference export for new parts
- `MILU_Superseded_v506.json`: reference export for superseded parts
- `product-export-*.json`: website export data used for matching flags
- `qa_synthetic_new.json`, `qa_synthetic_superseded.json`: generated synthetic exports

### Offline utilities (root scripts)
- `add_final_fields.py`
- `convert_excel_to_json.py`
- `generate_synthetic_exports.js`
- `estadisticas_articulos.py`
- `informe_estadisticas.py`
- `marcar_articulos_en_web.py`
- `pretty_print_all_json.py`

### Secondary/legacy views and artifacts
- `qa_lista_agrupada.html`: alternative grouped-list page
- `index.html`, `app.js`: legacy lightweight index view
- `dist/`: generated publish build artifacts
- `json_originales/`: backup originals of engine datasets
- `zz_old/`, `zz_copias/`: archived legacy material

## Frontend Module Map (`js/`)
- `qa-milu.js`: app bootstrap and orchestration
- `state.js`: shared global mutable state
- `data-loader.js`: fetch/load/save helpers and backend health check
- `qa-table.js`: filtering, sorting, pagination, row rendering, grouped mode
- `revision.js`: revision keying and row revision updates
- `helpers.js`: pure helper and validation logic
- `cell-editor.js`: inline cell editing
- `column-view.js`: column order/visibility modes and width persistence
- `pdf-viewer.js`: PDF.js rendering and selection highlights
- `schemas.js`: schema/position image resolution and rendering
- `pos-preload.js`: lazy preload queue for position images

## Backend and Node Script Map
- `server.js`: API layer + static serving
- `generate_synthetic_exports.js`: produces synthetic New/Superseded outputs

## Important File Categories to Treat as Generated or Output
Normally avoid editing unless task explicitly requires it:
- `dist/`
- `esquemas/`
- `esquemas_pos_circulos/`
- `json_originales/`
- `zz_old/`
- `fotos_articulos/`
- `fotos_motores/`

## Dependency Footprint
From `package.json`:
- `express`
- `cors`
- `body-parser`

NPM scripts:
- `generate:synthetic` -> `node generate_synthetic_exports.js`
