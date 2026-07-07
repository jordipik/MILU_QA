# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Reset seguro del detector de columnas PDF

## Objetivo
Aislar completamente la lÃ³gica experimental reciente de detecciÃ³n de columnas en `analista_02.html` para volver a una base mÃ­nima y estable del visor PDF.

## LÃ³gica desactivada o retirada
- Se desactiva por flag interno en `js/pdf-viewer.js` toda la ruta experimental de:
  - detecciÃ³n de columnas por header anchors
  - overlays de columnas (`column-region`, `column-label`, `column-token`)
  - overlays de parser tabular (`pdf-table-debug-*`)
  - overlays de header debug (`pdf-header-debug-*`)
- El modo `pn-line` ya no intenta inferir columnas, cabeceras ni asignaciones de tokens.
- Las APIs pÃºblicas se mantienen por compatibilidad, pero quedan en modo no operativo:
  - `getPdfExperimentalColumnTexts()` devuelve `status: "disabled"`
  - `enablePdfTableDebug()` limpia overlay y fuerza debug desactivado
  - `setPdfTableParserDebugEnabled()` queda como wrapper compatible sin reactivar nada
  - `setPdfHeaderDebugMode()` ya no activa overlays
  - `getPdfHeaderDetection()` devuelve `null`
- En `js/analista-02.js` se elimina el cableado de UI que reactivaba la lÃ³gica experimental.
- En `analista_02.html` se retiran los controles visibles de:
  - `Detectar columnas`
  - `Debug Tabla`
  - `Headers Only`
  - `Recalcular Tabla`
  - selector de modo de columnas
  - panel de logs de detecciÃ³n de cabecera

## Archivos tocados
- `js/pdf-viewer.js`
- `js/analista-02.js`
- `analista_02.html`
- `docs/pdf_column_detector_reset.md`

## Archivos revisados pero no modificados
- `js/pdf-table-parser.js`
- `js/state.js`
- `styles/pdf_shared.css`
- `styles/analista_02.css`

## QuÃ© queda funcionando
- Carga normal del visor PDF en `analista_02.html`.
- BÃºsqueda de `pn_final` para el registro activo.
- Marcado azul de la lÃ­nea donde aparece `pn_final`.
- ConservaciÃ³n de los resaltados estables ya existentes del visor, incluido el resaltado verde cuando la coincidencia exacta ya estaba soportada por el flujo normal.
- Caja de "Textos azules" con acciones de cargar/copiar, usando solo los highlights de lÃ­nea activos.
- Comparativa Excel/GESA/SUBST/PDF/Final sin cambios funcionales fuera del reset del detector experimental.

## QuÃ© se deja preparado para una nueva implementaciÃ³n desde cero
- Las APIs viejas no se borran del todo, para evitar roturas por imports o llamadas residuales.
- El punto estable para un nuevo detector queda separado del flujo mÃ­nimo actual:
  - selecciÃ³n PDF estable
  - extracciÃ³n de `textItems`
  - render de highlights estables
  - overlay experimental actualmente anulado
- El nuevo trabajo puede reintroducir un detector nuevo sin depender del cÃ³digo visual experimental anterior.

## Validaciones ejecutadas
- `npm run check`
  - `lint`: OK
  - `npm test`: OK
  - `test:smoke`: OK
  - `test:db-read`: OK
  - `test:db-analytics`: OK
  - `tests/smoke/engine-schema.test.js`: OK
  - `tests/smoke/python-lib.test.js`: OK
  - `tests/smoke/python-exporters-smoke.test.js`: OK
- ComprobaciÃ³n manual en navegador sobre `http://localhost:3000/analista_02.html`
  - en una carga fresca ya no aparecen los controles de columnas/debug retirados
  - al activar `Marcar lÃ­nea PN en PDF` se observan highlights de lÃ­nea (`lineHighlights: 8`, `pnHighlights: 1`, `redRows: 1`)
  - no aparecen overlays de columnas ni debug (`columnRegions: 0`, `columnLabels: 0`, `columnTokens: 0`, `tableDebug: 0`, `headerDebug: 0`)

## Riesgos abiertos
- Siguen existiendo utilidades y estilos antiguos en el repositorio para parser/debug PDF, pero quedan fuera del flujo principal.
- Si alguna pestaÃ±a vieja del navegador mantiene recursos cacheados, puede seguir mostrando controles antiguos hasta recargar.
- `pdf-table-parser.js` queda sin uso activo en este flujo; conviene tratarlo como legado temporal hasta la nueva implementaciÃ³n.

