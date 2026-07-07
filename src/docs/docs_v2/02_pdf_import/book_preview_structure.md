# Book Preview Structure

## Objetivo
Definir la estructura real de `book_preview_<MODEL>.json` consumida por los scripts de apply.

## Contrato de paridad Overlay vs Extraccion
- `book_preview_<MODEL>.json` es la fuente oficial de datos PDF para el pipeline runtime.
- El overlay PDF es una ayuda de revision y diagnostico, no el artefacto oficial de datos.
- La paridad requerida es semantica, no de implementacion: overlay y extraccion pueden calcular por rutas distintas, pero deben converger en las mismas reglas de split.
- Reglas que deben mantenerse alineadas:
	1. `POS + PN + DESIGNATION`
	2. `PN + DESIGNATION`
	3. `DESIGNATION` que empieza por `PN`
	4. `DESIGNATION` que empieza por `POS + PN`
- Si una regla se corrige solo en overlay, el usuario vera bien la tabla pero `book_preview` seguira mal.
- Si una regla se corrige solo en extraccion, `book_preview` estara bien pero la revision humana seguira viendo columnas confusas.

## Inputs
- Salida de `extractWholeBook` en `js/import-pdf.js`.

## Outputs
- JSON con metadata de ejecucion y array de paginas/filas.

## Limites de responsabilidad
- `book_preview_<MODEL>.json` describe extraccion PDF (`*_pdf`).
- No define `esquemas`.
- No define `esquemas_circulos*` ni `ruta_esquemas_pos`.
- Esos campos se calculan/desarrollan en etapas posteriores del pipeline de imagenes.

## Scripts implicados
- `js/import-pdf.js`.
- `js/pdf-viewer.js` como referencia visual que debe mantener paridad de reglas.
- `js/analista-02.js` como flujo paralelo que debe producir la misma reparacion.
- `apply_book_preview_to_engine.py`.

## Endpoints implicados
- No requiere endpoint para generarse (se descarga localmente).

## Botones UI relacionados
- `extractBookBtn`.
- `extractAllBooksBtn`.

## Campos afectados
- Nivel raiz (real):
	- `book`
	- `generated_at`
	- `pages_total`
	- `range_from`
	- `range_to`
	- `pages_processed`
	- `pages_with_rows`
	- `rows_total`
	- `warnings_total`
	- `cancelled`
	- `pages[]`
- Nivel pagina:
	- `source_page`
	- `rows_count`
	- `rows_with_pn`
	- `warnings_count`
	- `rows[]`
- Nivel fila:
	- `source_page`, `row_index`
	- `pos_pdf`, `pn_pdf`, `designation_pdf`, `model_type_pdf`, `qty_pdf`, `units_pdf`, `weight_pdf`, `fn_pdf`, `measure_pdf`, `norma_pdf`, `bom_pdf`, `fg_fgs_pdf`
	- `confidence`
	- `warnings[]`

## Flujo paso a paso
1. Cada pagina agrega un bloque a `pages[]`.
2. Cada fila detectada guarda valores normalizados por columna PDF.
3. La normalizacion downstream puede reparar fusiones de columnas heredadas del parser visual si la fila llega con `designation_pdf` contaminado por `PN` o por `POS + PN`.
3. `downloadJsonPreview` emite archivo `book_preview_<MODEL>.json`.
4. Scripts Python iteran `preview.pages[].rows[]` para match con engine.

## Ejemplo de forma
```json
{
	"book": "12V4000M40A",
	"generated_at": "2026-05-24T10:00:00.000Z",
	"pages_total": 120,
	"range_from": 1,
	"range_to": 120,
	"pages_processed": 120,
	"pages_with_rows": 87,
	"rows_total": 1845,
	"warnings_total": 213,
	"cancelled": false,
	"pages": [
		{
			"source_page": 13,
			"rows_count": 18,
			"rows_with_pn": 18,
			"warnings_count": 2,
			"rows": [
				{
					"source_page": 13,
					"row_index": 1,
					"pos_pdf": "0010",
					"pn_pdf": "X123",
					"designation_pdf": "...",
					"model_type_pdf": "...",
					"qty_pdf": "1",
					"units_pdf": "pc",
					"weight_pdf": "0.1",
					"fn_pdf": "A",
					"measure_pdf": "A 55 X 5",
					"norma_pdf": "DIN",
					"bom_pdf": "B123",
					"fg_fgs_pdf": "FG-FGS",
					"confidence": 0.82,
					"warnings": ["low-confidence"]
				}
			]
		}
	]
}
```

## Riesgos / problemas conocidos
- Si `pos_pdf` falta, la fila no puede hacer match fiable con engine.
- La ausencia de `pos_pdf` puede venir de una fusion visual previa, no necesariamente de falta real en el PDF.
- `confidence` bajo no bloquea exportacion del preview; requiere QA posterior.

## Casos reales documentados
- `12V4000M53`, pagina `803`: se reparo una fusion `PN + DESIGNATION`.
- `12V4000M53`, pagina `669`: se reparo una fusion `POS + PN + DESIGNATION`.

Ejemplo validado en pagina `669`:
- `7250 -> X59450700011 -> BRACKET WIRING HARNESS`
- `8400 -> X59650700018 -> RETAINER F. WIRING HARNESS`
- `8570 -> X54750700009 -> CABLE CLAMP`
- `8800 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9350 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9450 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9660 -> X59450700011 -> BRACKET WIRING HARNESS`
- `9700 -> X59450700011 -> BRACKET WIRING HARNESS`

Validacion:
- ya no quedan filas de ese patron con `pos_pdf` vacio
- `unresolvedCount = 0`

## Regla documental oficial
- `book_preview_<MODEL>.json` es el artefacto puente oficial entre extraccion PDF y enrichment de `engine_<MODEL>.json`.
- El apply oficial solo consume `book_preview_<MODEL>.json` a traves de `POST /api/pdf-preview/apply-to-engine`.

## TODO pendiente
- Versionar schema JSON explicito de `book_preview`.

## Ejemplo real
- El script Python espera estructura `pages -> rows` y consume `source_page`, `pos_pdf`, `pn_pdf` para el matching.
