# WordPress Export Simplified (QA-only)

## Objetivo
Definir el flujo oficial de exportacion WordPress en MILU, sin scoring ni decision automatica por IA.

## Regla fundamental
La decision final de exportacion depende solo de QA humana.

- IA/reglas auxiliares pueden ayudar a explicar pendientes.
- IA no decide automaticamente import/discard.

## Clasificación New / Superseded (REGLA OBLIGATORIA)

La separación entre registros **New** y **Superseded** se basa **exclusivamente** en:

- **Superseded**: `sust_hierarchie === "Superseded"`
- **New**: todos los registros que NO tengan `sust_hierarchie === "Superseded"`

**IMPORTANTE:** `sust_status === "SI"` **NO** determina si un registro se exporta como Superseded.
`sust_status` solo indica que el PN aparece en relaciones SUST (Excel de sustituciones).
Un registro con `sust_status = "SI"` y `sust_hierarchie = "New"` va a **New**.

Función canónica implementada en todos los módulos de exportación:

```javascript
function getExportType(row) {
    return String(row?.sust_hierarchie ?? '').trim() === 'Superseded' ? 'superseded' : 'new';
}
```

## Entradas
- 9 archivos `engine_*.json` del repo.

## Agrupacion oficial
- Global por PN (SKU) en todos los motores/libros.
- Una fila exportable por PN.

## Reglas de decision oficiales
1. Si un PN tiene al menos una fila con:
   - `qa_revision_estado = ok`
   - `qa_revision_accion = importar`
   entonces `decision = import`.
2. Si todas las filas del PN tienen:
   - `qa_revision_estado = ok`
   - `qa_revision_accion = eliminar`
   entonces `decision = discard`.
3. Cualquier otro caso:
   - `decision = pending_review`.

## Script oficial
- `npm run export:wordpress`

## Endpoints operativos
- `GET /export/files`
- `GET /export/file`
- `GET /export/download`
- `GET /export/status`
- `POST /export/run-wordpress`
- `GET /pn-review/list`
- `GET /pn-review/:sku`
- `GET /pn-review/:sku/sources`
- `POST /pn-review/:sku/apply-decision`

## Pantalla PN Review
- URL: `pn_review.html`
- Objetivo: revisar PN unicos globales (no filas BOM individuales).
- Fuente de decision: solo QA humana (`qa_revision_estado` + `qa_revision_accion`).
- Carga recomendada:
   - listado compacto inicial con `GET /pn-review/list`
   - detalle bajo demanda con `GET /pn-review/:sku`
   - fuentes bajo demanda con `GET /pn-review/:sku/sources`

## Accion masiva por PN
Endpoint: `POST /pn-review/:sku/apply-decision`

Payload:

```json
{
   "estado": "ok",
   "accion": "importar"
}
```

`accion` permitidas:
- `importar`
- `eliminar`
- `revisar`

Efecto:
- actualiza todas las apariciones del PN en los 9 `engine_*.json`
- solo modifica:
   - `qa_revision_estado`
   - `qa_revision_accion`
   - `qa_revision_updated_at`

Respuesta:
- `rows_updated`
- `files_touched`
- `errors`

## Validaciones auxiliares de PN Review
Estas validaciones ayudan a revisar, pero no deciden exportacion:

- `has_pn`
- `has_designation`
- `has_image`
- `has_measure`
- `has_weight`
- `has_sust`
- `has_conflicts`
- `conflict_codes`

## Endpoints legacy (desactivados)
- `POST /export/run-synthetic`
- `POST /export/run-ai-conflicts`
- `POST /export/run-all`
- `GET /pn/list`
- `GET /pn/:sku`
- `GET /pn/:sku/sources`

## Outputs oficiales
Carpeta: `data/output/wordpress/`

- `milu_wp_import.csv`
- `milu_wp_discarded.csv`
- `milu_wp_pending_review.csv`
- `milu_wp_import.json`
- `milu_wp_export_summary.md`

Opcional:
- `milu_wp_trace.json`

## Legacy archivado
La logica compleja anterior se mantiene solo como referencia en:
- `legacy/export_complex_ai/`

Comandos legacy:
- `npm run legacy:ai:conflicts`
- `npm run legacy:export:review`
- `npm run legacy:generate:synthetic`
