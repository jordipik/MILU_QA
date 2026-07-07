# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# DOCUMENTO CANÃ“NICO MILU â€” EXPORTACIÃ“N WORDPRESS

> **Estado**: CANÃ“NICO Â· Fuente Ãºnica de verdad para el export oficial QA-only.
> **Ãšltima actualizaciÃ³n**: 2026-05-12.
> **Fuentes consolidadas**: [14_wordpress_export_simplified.md](14_wordpress_export_simplified.md).
> **Complementaria**: [images/wordpress_image_export.md](images/wordpress_image_export.md).
>
> âš ï¸ Documento **superseded** (archivado): [archived/13_wordpress_export_ai_pipeline.md](archived/13_wordpress_export_ai_pipeline.md) â€” pipeline con IA, ya no oficial.

---

## 1. Regla fundamental

> **La decisiÃ³n final de exportaciÃ³n depende exclusivamente de QA humana.**
> No hay scoring ni decisiÃ³n automÃ¡tica por IA. La IA puede ayudar a explicar pendientes, pero **no decide**.

---

## 2. ClasificaciÃ³n New / Superseded (regla obligatoria)

La separaciÃ³n entre **New** y **Superseded** se basa en la jerarquÃ­a SUST final:

- **Superseded** si `sust_hierarchie === "Superseded"` o `hierarchie_final === "Superseded"`.
- **New** en cualquier otro caso (incluidos `"New"`, vacÃ­o, otros valores).

> **`sust_status === "SI"` NO determina por si solo si un registro se exporta como Superseded.**

FunciÃ³n canÃ³nica usada por el export oficial:

```javascript
function getExportType(row) {
      const h1 = String(row?.sust_hierarchie ?? '').trim();
      const h2 = String(row?.hierarchie_final ?? '').trim();
      return (h1 === 'Superseded' || h2 === 'Superseded') ? 'superseded' : 'new';
}
```

### 2.1 Reglas de registros sintÃ©ticos (solo salida WordPress)

- Base QA-only intacta: solo PN con `qa_revision_estado=ok` y `qa_revision_accion=importar`.
- Superseded real: entra siempre en export Superseded y no va al export New.
- Superseded sintÃ©tico desde lista:
   - Para cada New exportable se parsea `sust_superseded_list` y `subst_pnlist_final` por coma.
   - Si un PN listado ya existe en cualquier `engine_*.json`, no se genera duplicado sintÃ©tico.
   - Si no existe, se crea Superseded sintÃ©tico con:
      - `synthetic_source = "sust_superseded_list"`
      - `data_quality = "unknown_superseded"`
      - trazabilidad `synthetic_parent_id`, `synthetic_parent_pn`, `synthetic_parent_engine`.
- Caso huÃ©rfano Superseded real sin New real:
   - Se exporta igualmente el Superseded real.
   - Se crea New sintÃ©tico mÃ­nimo con:
      - `synthetic_source = "orphan_superseded_new"`
      - `data_quality = "unknown_new_from_superseded"`
      - trazabilidad `synthetic_child_id`, `synthetic_child_pn`, `synthetic_child_engine`.

Los sintÃ©ticos existen solo en salida de export y nunca se persisten en `engine_*.json`.

---

## 3. Entradas

- Los 9 ficheros `engine_*.json` del repo.

---

## 4. AgrupaciÃ³n

- Una fila exportable **por PN (SKU) global** a travÃ©s de los 9 motores y libros.

---

## 5. Reglas de decisiÃ³n

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

ImplementaciÃ³n: [scripts/export_wordpress_milu.js](../scripts/export_wordpress_milu.js).

---

## 7. Endpoints operativos

- `GET /export/files` â€” lista de outputs disponibles.
- `GET /export/file` â€” descarga un output concreto.
- `GET /export/download` â€” descarga empaquetada.
- `GET /export/status` â€” estado del Ãºltimo export.
- `POST /export/run-wordpress` â€” dispara el export oficial.
- `GET /pn-review/list`
- `GET /pn-review/:sku`
- `GET /pn-review/:sku/sources`
- `POST /pn-review/:sku/apply-decision`

---

## 8. PN Review

- URL autÃ³noma: `pn_review.html`.
- PestaÃ±a embebida en `analista_02.html` (`js/pn-review-embedded.js`).
- Objetivo: revisar PN Ãºnicos globales (no filas BOM individuales).
- Fuente de decisiÃ³n: **solo QA humana** (`qa_revision_estado` + `qa_revision_accion`).

Carga recomendada:

- Listado compacto: `GET /pn-review/list`.
- Detalle bajo demanda: `GET /pn-review/:sku`.
- Fuentes bajo demanda: `GET /pn-review/:sku/sources`.

### 8.1 AcciÃ³n masiva por PN

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

Carpeta principal: `data/05-wordpress/`.

Carpeta espejo de auditorÃ­a: `data/output/wordpress/`.

- `milu_wp_import.json`
- `milu_wp_import.csv`
- `milu_wp_discarded.csv`
- `milu_wp_pending_review.csv`
- `milu_wp_export_summary.md`
- `milu_wp_export_report.json`
- Opcional: `milu_wp_trace.json` (manifest de trazabilidad).

MÃ©tricas mÃ­nimas en `milu_wp_export_report.json`:

- `total_new_real`
- `total_new_synthetic`
- `total_superseded_real`
- `total_superseded_synthetic_from_list`
- `total_superseded_omitted_existing`
- `total_orphan_superseded_generated_new`
- `duplicates_avoided`

Detalle de outputs de imagen y manifest: [docs/images/wordpress_image_export.md](images/wordpress_image_export.md).

### 10.1 Regla oficial de exp_imagenes
Prioridad obligatoria:
1. `filename_foto`
2. `esquemas_circulos`
3. `esquemas` (solo si aun no hay ninguna imagen)
4. `sin_imagen.jpeg` (solo si sigue vacio)

Restriccion de fuentes para construir `exp_imagenes`:
- solo `filename_foto`, `esquemas_circulos`, `esquemas`
- no usar `ruta_esquemas_pos`
- no usar `esquemas_circulos_all`

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

La lÃ³gica compleja anterior (con IA) se conserva como referencia en:

- [legacy/export_complex_ai/](../legacy/export_complex_ai/)

Comandos legacy:

- `npm run legacy:ai:conflicts`
- `npm run legacy:export:review`
- `npm run legacy:generate:synthetic`

---

## Referencias

- CanÃ³nico vigente: [14_wordpress_export_simplified.md](14_wordpress_export_simplified.md)
- Obsoleto archivado: [archived/13_wordpress_export_ai_pipeline.md](archived/13_wordpress_export_ai_pipeline.md)
- ImÃ¡genes en export: [docs/images/wordpress_image_export.md](images/wordpress_image_export.md)
- Flujo PN Review: [FLUJO_DATOS_MILU.md â†’ secciÃ³n 4](FLUJO_DATOS_MILU.md)
- DecisiÃ³n QA: [QA_MILU.md â†’ secciÃ³n 2](QA_MILU.md)


