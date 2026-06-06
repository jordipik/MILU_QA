# Final Fields V1

## Estado
- Endpoint oficial actual: `POST /copy-pdf-to-final-all-books`
- Endpoint legacy coexistente: `POST /calculate-final-fields`

## Regla general
`server.js` aplica `FINAL_FIELDS_V1_MAPPINGS_BACKEND` por fila y por campo final.

## Prioridad real por campo (auditada)
- `pos_final` -> `pos_pdf` / `POS`
- `pn_final` -> `pn_pdf` / `PART NO.`
- `designation_final` -> `designation_gesa` / `designation_pdf`
- `model_type_final` -> `model_type_pdf` / `MODEL/TYPE`
- `qty_final` -> `qty_pdf` / `QTY`
- `units_final` -> `units_pdf` / `UNITS`
- `weight_final` -> `weight_gesa + units` / `weight_pdf`
- `fn_final` -> `fn_pdf`
- `measure_final` -> `dimensions_gesa` / `measure_pdf`
- `norma_final` -> `norma` / `norma_pdf`
- `fg_fgs_final` -> `fg_fgs_pdf` / `FG/FGS`
- `bom_final` -> `bom_pdf` / `BOM-No.`
- `nsn_final` -> `nsn`
- `normalizado_final` -> `normalizado`

## Campos adicionales del mapping backend
- `gesa_final` <- `gesa`
- `sust_status_final` <- `sust_status`
- `hierarchie_final` <- `sust_hierarchie`
- `new_pn_final` <- `sust_new_part_number`
- `subst_pnlist_final` <- `sust_superseded_list`

## Detalles especiales implementados
- `designation_final`: si GESA y PDF son equivalentes por normalizacion de espacios, conserva valor PDF.
- `weight_final`: prioriza `weight_gesa + units`.
- Solo escribe cuando cambia el valor final efectivo.
- Si `backup=true`, crea backup timestamp antes de escribir.

## Legacy
`POST /calculate-final-fields` ejecuta `copy_gesa_fields_to_final.py` y responde con `legacy: true`.
No es la ruta oficial para documentar FINAL_FIELDS_V1 runtime.

## Alcance respecto a exp_imagenes
- `FINAL_FIELDS_V1` no calcula `exp_imagenes`.
- `exp_imagenes` se construye en export WordPress con prioridad oficial:
	1. `filename_foto`
	2. `esquemas_circulos`
	3. `esquemas` (solo fallback)
	4. `sin_imagen.jpeg` (fallback final)
- Para esa construccion no se usan `ruta_esquemas_pos` ni `esquemas_circulos_all`.
