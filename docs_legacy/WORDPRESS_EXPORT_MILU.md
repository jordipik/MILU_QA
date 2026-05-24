# DOCUMENTO CANÓNICO MILU — EXPORTACIÓN WORDPRESS

> **Estado**: CANÓNICO · Fuente única de verdad para el export oficial QA-only.
> **Última actualización**: 2026-05-12.
> **Fuentes consolidadas**: [14_wordpress_export_simplified.md](14_wordpress_export_simplified.md).
> **Complementaria**: [images/wordpress_image_export.md](images/wordpress_image_export.md).
>
> ⚠️ Documento **superseded** (archivado): [archived/13_wordpress_export_ai_pipeline.md](archived/13_wordpress_export_ai_pipeline.md) — pipeline con IA, ya no oficial.

---

## 1. Regla fundamental

> **La decisión final de exportación depende exclusivamente de QA humana.**
> No hay scoring ni decisión automática por IA. La IA puede ayudar a explicar pendientes, pero **no decide**.

---

## 2. Clasificación New / Superseded (regla obligatoria)

La separación entre **New** y **Superseded** se basa **exclusivamente** en `sust_hierarchie`:

- **Superseded** si `sust_hierarchie === "Superseded"`.
- **New** en cualquier otro caso (incluidos `"New"`, vacío, otros valores).

> **`sust_status === "SI"` NO determina si un registro se exporta como Superseded.** Solo indica que el PN aparece en relaciones SUST del Excel de sustituciones. Un registro con `sust_status = "SI"` y `sust_hierarchie = "New"` va a **New**.

Función canónica usada por todos los módulos de exportación:

```javascript
function getExportType(row) {
    return String(row?.sust_hierarchie ?? '').trim() === 'Superseded' ? 'superseded' : 'new';
}
```

---

## 3. Entradas

- Los 9 ficheros `engine_*.json` del repo.

---

## 4. Agrupación

- Una fila exportable **por PN (SKU) global** a través de los 9 motores y libros.

---

## 5. Reglas de decisión

Sobre el conjunto de filas que comparten PN:

1. `decision = import` si **alguna** fila cumple:
   - `qa_revision_estado = ok`
   - `qa_revision_accion = importar`
2. `decision = discard` si **todas** las filas cumplen:
   - `qa_revision_estado = ok`
   - `qa_revision_accion = eliminar`
3. `decision = pending_review` en cualquier otro caso.

---

## 6. Script oficial

```sh
npm run export:wordpress
```

Implementación: [scripts/export_wordpress_milu.js](../scripts/export_wordpress_milu.js).

---

## 7. Endpoints operativos

- `GET /export/files` — lista de outputs disponibles.
- `GET /export/file` — descarga un output concreto.
- `GET /export/download` — descarga empaquetada.
- `GET /export/status` — estado del último export.
- `POST /export/run-wordpress` — dispara el export oficial.
- `GET /pn-review/list`
- `GET /pn-review/:sku`
- `GET /pn-review/:sku/sources`
- `POST /pn-review/:sku/apply-decision`

---

## 8. PN Review

- URL autónoma: `pn_review.html`.
- Pestaña embebida en `analista_02.html` (`js/pn-review-embedded.js`).
- Objetivo: revisar PN únicos globales (no filas BOM individuales).
- Fuente de decisión: **solo QA humana** (`qa_revision_estado` + `qa_revision_accion`).

Carga recomendada:

- Listado compacto: `GET /pn-review/list`.
- Detalle bajo demanda: `GET /pn-review/:sku`.
- Fuentes bajo demanda: `GET /pn-review/:sku/sources`.

### 8.1 Acción masiva por PN

```
POST /pn-review/:sku/apply-decision
```

Payload:

```json
{
  "estado": "ok",
  "accion": "importar"
}
```

`accion` permitidas: `importar`, `eliminar`, `revisar`.

Efecto:

- Actualiza **todas** las apariciones del PN en los 9 `engine_*.json`.
- Solo modifica `qa_revision_estado`, `qa_revision_accion`, `qa_revision_updated_at`.

Respuesta: `{ ok, sku, decision_applied, rows_updated, files_touched, errors }`.

---

## 9. Validaciones auxiliares (no deciden export)

- `has_pn`
- `has_designation`
- `has_image`
- `has_measure`
- `has_weight`
- `has_sust`
- `has_conflicts`
- `conflict_codes`

---

## 10. Outputs oficiales

Carpeta: `data/output/wordpress/`.

- `milu_wp_import.json`
- `milu_wp_import.csv`
- `milu_wp_discarded.csv`
- `milu_wp_pending_review.csv`
- `milu_wp_export_summary.md`
- Opcional: `milu_wp_trace.json` (manifest de trazabilidad).

Detalle de outputs de imagen y manifest: [docs/images/wordpress_image_export.md](images/wordpress_image_export.md).

---

## 11. Endpoints legacy (desactivados)

- `POST /export/run-synthetic`
- `POST /export/run-ai-conflicts`
- `POST /export/run-all`
- `GET /pn/list`
- `GET /pn/:sku`
- `GET /pn/:sku/sources`

---

## 12. Legacy archivado

La lógica compleja anterior (con IA) se conserva como referencia en:

- [legacy/export_complex_ai/](../legacy/export_complex_ai/)

Comandos legacy:

- `npm run legacy:ai:conflicts`
- `npm run legacy:export:review`
- `npm run legacy:generate:synthetic`

---

## Referencias

- Canónico vigente: [14_wordpress_export_simplified.md](14_wordpress_export_simplified.md)
- Obsoleto archivado: [archived/13_wordpress_export_ai_pipeline.md](archived/13_wordpress_export_ai_pipeline.md)
- Imágenes en export: [docs/images/wordpress_image_export.md](images/wordpress_image_export.md)
- Flujo PN Review: [FLUJO_DATOS_MILU.md → sección 4](FLUJO_DATOS_MILU.md)
- Decisión QA: [QA_MILU.md → sección 2](QA_MILU.md)
