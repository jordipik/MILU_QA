# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Contrato de export WordPress

> **CONTRATO MILU â€” v1** Â· Fase: CONTRATOS + ESTABILIDAD Â· No modifica cÃ³digo ni datos.
>
> Define el proceso oficial de export a WordPress. **QA-only**: la decisiÃ³n de exportar depende exclusivamente de la revisiÃ³n humana persistida en los `engine_*.json`.

## 1. Punto de entrada

| Acceso | Comando |
|---|---|
| CLI | `npm run export:wordpress` |
| HTTP | `POST /export/run-wordpress` (lanza el mismo script) |

Script: [scripts/export_wordpress_milu.js](../../scripts/export_wordpress_milu.js).

Definido en [package.json](../../package.json):
```json
"export:wordpress": "node scripts/export_wordpress_milu.js"
```

## 2. Fuente de datos

- Los **9 archivos `engine_*.json`** de la raÃ­z del repo.
- No hay base de datos. No se consulta a APIs externas.
- No se usa IA en este proceso (ver pipeline obsoleto archivado en [docs/archived/13_wordpress_export_ai_pipeline.md](../archived/13_wordpress_export_ai_pipeline.md)).

## 3. AgrupaciÃ³n

- Todas las filas se agrupan por **PN/SKU global** usando `pn_final` (fallback: `PART NO.`).
- Una entrada de export = un PN Ãºnico.
- Una fila puede aparecer en N engines; se mergean en una sola entrada.

## 4. Merge de campos al exportar

Para cada PN, se elige por frecuencia (`pickMostFrequent`) entre las fuentes disponibles:

| Campo export | Fuentes consideradas (orden) |
|---|---|
| `designation_final` | `designation_final` â†’ `designation_gesa` â†’ `designation_pdf` â†’ `DESIGNATION` |
| `measurement_final` / `measure_final` | `measure_final` â†’ `measurement_final` â†’ `dimensions_gesa` â†’ `MEASUREMENT / STANDARD` |
| `weight_final` | `weight_final` â†’ `weight_gesa` â†’ `WEIGHT` |

Referencia: [scripts/export_wordpress_milu.js L98-L115, L325-L326](../../scripts/export_wordpress_milu.js).

> **Nota de inconsistencia**: el export actual escribe **ambos** `measure_final` y `measurement_final` con el mismo valor. Documentado en [CONTRATO_JSON_ENGINE.md Â§11 I1](CONTRATO_JSON_ENGINE.md).

## 5. DecisiÃ³n por PN (QA-only)

Ver detalle completo en [CONTRATO_REVISION_QA.md Â§6](CONTRATO_REVISION_QA.md).

Resumen:

| CondiciÃ³n sobre filas del PN | DecisiÃ³n export |
|---|---|
| Hay â‰¥1 fila con `estado=ok && accion=importar` | `import` |
| Todas las filas con `estado=ok && accion=eliminar` | `discard` |
| Cualquier otro caso | `pending_review` |

**Reglas**:
- La decisiÃ³n depende **solo** de la revisiÃ³n QA humana. NingÃºn scoring automÃ¡tico ni IA.
- `qa_validated = true` solo si la decisiÃ³n es `import` o `discard`.

## 6. ClasificaciÃ³n New vs Superseded

Aplicada **solo a entradas con `decision = import`**.

| CondiciÃ³n | Lista de export |
|---|---|
| `sust_hierarchie === 'Superseded'` (al menos una fila del PN) | `superseded` |
| en cualquier otro caso | `new` |

**Reglas**:
- **`sust_hierarchie` es el ÃšNICO criterio oficial** ([scripts/export_wordpress_milu.js L244-L250](../../scripts/export_wordpress_milu.js)).
- **`sust_status = SI` NO decide Superseded**. Es solo una bandera informativa de presencia en la tabla SUST.
- `sust_superseded_list` es lista de referencia, no criterio.

## 7. Outputs (carpeta [data/05-wordpress/](../../data/05-wordpress/))

| Archivo | Contiene | Formato |
|---|---|---|
| `milu_wp_import.json` / `.csv` | PNs con `decision=import` clasificados como `new` | JSON + CSV |
| `milu_wp_superseded.json` / `.csv` | PNs con `decision=import` clasificados como `superseded` | JSON + CSV |
| `milu_wp_pending.json` / `.csv` *(o `milu_wp_pending_review.*`)* | PNs con `decision=pending_review` | JSON + CSV |
| `milu_wp_discarded.json` / `.csv` | PNs con `decision=discard` | JSON + CSV |
| `milu_wp_trace.json` | Trace por SKU con QA summary y razones | JSON |
| `milu_wp_export_report.json` *(a veces `milu_wp_export_summary.md`)* | Totales y metadatos del run | JSON / Markdown |

## 8. CSV â€” columnas mÃ­nimas

Headers oficiales ([scripts/export_wordpress_milu.js L360-L374](../../scripts/export_wordpress_milu.js)):

```
sku, designation_final, measurement_final, weight_final, decision, reason,
qa_validated, occurrences, engines, source_ids, source_pages, qa_summary_json,
import_decision, import_reason
```

## 9. Endpoints relacionados

| Endpoint | FunciÃ³n |
|---|---|
| `POST /export/run-wordpress` | Lanza el script. Devuelve `summary{import, pending, discard}`. |
| `GET /export/status` | Estado del Ãºltimo run + counts. |
| `GET /export/preview` | Vista previa unificada de los outputs. |
| `GET /export/wordpress-decisions` | Decisiones por SKU. |
| `GET /export/trace/:sku` | Trace de decisiÃ³n de un PN concreto. |
| `GET /export/files` | Lista archivos generados en `data/output/`. |
| `GET /export/file?folder=wordpress&name=<f>` | Preview de un archivo (hasta 512 KB). |
| `GET /export/download?folder=wordpress&name=<f>` | Descarga binaria. |

## 10. Endpoints legacy desactivados (responden 410 Gone)

`POST /export/run-synthetic`, `POST /export/run-ai-conflicts`, `POST /export/run-all`, `POST /apply-qa-checks-filter`.

No reactivar sin actualizar este contrato.

## 11. Invariantes

1. La decisiÃ³n por PN se basa **solo** en `qa_revision_estado` + `qa_revision_accion` agregados.
2. New/Superseded se decide **solo** por `sust_hierarchie`.
3. El export es **idempotente** sobre los `engine_*.json`: no los modifica.
4. Los outputs en `data/05-wordpress/` son **regenerables**; no editarlos a mano.

## 12. Riesgos / pendientes

- **R1**: `measure_final` + `measurement_final` se escriben ambos al output (duplicaciÃ³n).
- **R2**: Algunos PNs pueden tener filas con `sust_hierarchie` contradictorio entre engines. El export actual considera Superseded si **al menos una** fila lo indica; documentar criterio de empate si se replantea.
- **R3**: Si un PN aparece en `import` pero hay una fila `Superseded`, se exporta a `milu_wp_superseded.json`, no a `milu_wp_import.json`. Confirmar con producto.


