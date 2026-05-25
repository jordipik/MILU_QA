# DOCUMENTO CANÃ“NICO MILU â€” IMÃGENES Y ESQUEMAS

> **Estado**: CANÃ“NICO Â· Fuente Ãºnica de verdad para multimedia (imÃ¡genes + esquemas POS).
> **Ãšltima actualizaciÃ³n**: 2026-05-12.
> **Fuentes consolidadas**: [15_qa_imagenes.md](15_qa_imagenes.md), [AUDITORIA_IMAGENES_ESQUEMAS_MILU.md](AUDITORIA_IMAGENES_ESQUEMAS_MILU.md), [images/00-INDEX-COMPLETE.md](images/00-INDEX-COMPLETE.md) y resto de `images/*`.

---

## 1. Modelo de campos

Cada registro de `engine_*.json` puede llevar referencias multimedia:

- `ruta_foto` â€” foto del artÃ­culo.
- `ruta_esquemas_pos` â€” esquema de posiciÃ³n (POS).
- `exp_imagenes` â€” campo derivado final con prioridad:
  1. `ruta_foto`
  2. `ruta_esquemas_pos`
  3. `placeholder` (sin imagen real)

Recalculado en `depuracion_json.py`. Ver [FLUJO_DATOS_MILU.md â†’ secciÃ³n 6](FLUJO_DATOS_MILU.md).

---

## 2. Pipeline (alto nivel)

```
PDF (catÃ¡logos MTU)
   â”‚
   â”œâ”€â–º ExtracciÃ³n (pdfplumber / PyMuPDF) â”€â”€â–º fotos_articulos/, fotos_motores/
   â”‚
   â”œâ”€â–º DetecciÃ³n de esquemas POS â”€â”€â–º esquemas_pos_circulos/ (~50K archivos)
   â”‚
   â”œâ”€â–º Inventario + validaciÃ³n â”€â”€â–º data/output/image_inventory.json
   â”‚                              data/output/image_schema_audit.json
   â”‚
   â”œâ”€â–º Render en frontend (qa_imagenes.html, qa_milu.html)
   â”‚
   â””â”€â–º Export WordPress (milu_wp_*.json + milu_wp_trace.json)
```

Detalle: [docs/images/image_pipeline.md](images/image_pipeline.md), [docs/images/esquemas_pos.md](images/esquemas_pos.md).

---

## 3. Herramienta QA ImÃ¡genes (`qa_imagenes.html`)

Modo **solo lectura** para auditorÃ­a multimedia.

- PÃ¡gina: [qa_imagenes.html](../qa_imagenes.html).
- CSS: [css/qa_imagenes.css](../css/qa_imagenes.css).
- JS principal: [js/qa_imagenes.js](../js/qa_imagenes.js).
- MÃ³dulos:
  - [js/qa_imagenes_filters.js](../js/qa_imagenes_filters.js)
  - [js/qa_imagenes_table.js](../js/qa_imagenes_table.js)
  - [js/qa_imagenes_preview.js](../js/qa_imagenes_preview.js)
  - [js/qa_imagenes_stats.js](../js/qa_imagenes_stats.js)

### 3.1 Entradas (carga tolerante)

- `data/output/image_schema_audit.json`
- `data/output/image_inventory.json`
- `data/output/qa_index.json`
- `qa_index.json`, `version.json`
- Outputs de export: `data/05-wordpress/milu_wp_*.json`
- Refs histÃ³ricas: `MILU_New_v506.json`, `MILU_Superseded_v506.json`, `product-export-2026-03-29-11-07.json`

### 3.2 Estructura esperada

`image_schema_audit.json`:

- Claves: `generated_at`, `summary`, `wordpress_summary`, `qa_metrics`, `qa_index_info`, `records[]`, `unused_images[]`, `missing_images[]`, `broken_references[]`.
- `records[]`: `record_key`, `part_number`, `engine_model`, `libro`, `source_page`, `export_type`, `ruta_foto`, `ruta_esquemas_pos`, `image_status`, `schema_status`, `issues[]`, `reference_counts`.

`image_inventory.json`:

- Array con `filename`, `relative_path`, `extension`, `size_kb`, `modified_at`, `possible_type`, `engine_model`, `libro`, `pagina`, `is_used`.

### 3.3 Reglas de estado (UI)

- `state_status = ERROR` si hay `issues` con tokens `missing|broken|no_|empty`.
- `state_status = WARNING` si hay `issues` pero no crÃ­ticos.
- `state_status = OK` sin issues.

Badges visibles:

- `image_status = NO_IMAGE` â†’ rojo.
- `image_status = ONLY_PLACEHOLDER` â†’ naranja.
- `schema_status = NO_SCHEMA` â†’ rojo.
- Ruta con `sin_imagen|placeholder` â†’ flag placeholder.
- Issue con `broken` â†’ ruta rota.

### 3.4 Filtros

- Search global: PN, rutas, estado, issues.
- RÃ¡pidos por grupos: imÃ¡genes, esquemas, exportaciÃ³n, estado.
- TÃ©cnicos: `engine_model`, `libro`, `source_page`, `part_number`.
- Persistencia en `localStorage` (`qa_imagenes_filters_v1`).

### 3.5 KPIs (clicables â†’ aplican filtro)

- Total exportables.
- Con imagen real.
- Solo placeholder.
- Sin imagen.
- Con esquema.
- Sin esquema.
- Rutas rotas.
- ImÃ¡genes huÃ©rfanas.
- ImÃ¡genes no usadas.
- Exportables con error.
- Con foto + esquema.
- Solo esquema.
- Solo foto.

### 3.6 Tabla

- Virtualizada por viewport.
- Orden por columna.
- SelecciÃ³n mÃºltiple.
- Export CSV de la vista.
- Render incremental por overscan.

### 3.7 Tabs secundarias

- ArtÃ­culos.
- Inventario imÃ¡genes.
- Rutas rotas.
- Placeholders.
- Sin esquema.
- ImÃ¡genes huÃ©rfanas.
- EstadÃ­sticas.

### 3.8 Panel diagnÃ³stico (por registro)

- Producto (imagen + estado).
- Esquema (preview + estado).
- WordPress (ruta + validaciÃ³n).
- Local (detecciÃ³n por inventory).
- Inventario (filename, size, ext, modified).
- DiagnÃ³stico (issues + recomendaciÃ³n).

---

## 4. Esquemas de posiciÃ³n (POS)

- ~50 000 archivos en `esquemas_pos_circulos/` organizados por motor / pÃ¡gina / posiciÃ³n / tamaÃ±o.
- Ãndice runtime de candidatos **sin persistencia** (se reconstruye en cada arranque).
- Spec detallada: [docs/images/esquemas_pos.md](images/esquemas_pos.md).

---

## 5. ValidaciÃ³n de imÃ¡genes

Reglas y badges: [docs/images/image_validation.md](images/image_validation.md).

---

## 6. Performance

AnÃ¡lisis de rendimiento de render y carga: [docs/images/performance.md](images/performance.md).

---

## 7. IntegraciÃ³n con export WordPress

El export integra URLs y metadata de imagen en `milu_wp_*.json`. El manifest de trazabilidad multimedia va en `milu_wp_trace.json`. Detalle:

- [docs/images/wordpress_image_export.md](images/wordpress_image_export.md)
- [WORDPRESS_EXPORT_MILU.md â†’ secciÃ³n 10](WORDPRESS_EXPORT_MILU.md)

---

## 8. Hallazgos crÃ­ticos (auditorÃ­a 2026-05)

De [AUDITORIA_IMAGENES_ESQUEMAS_MILU.md](AUDITORIA_IMAGENES_ESQUEMAS_MILU.md):

- 1 576 filas sin `measure_final` (â‰ˆ 2.3 %).
- 18 868 registros con `exp_imagenes` solo placeholder.
- 14 249 referencias rotas detectadas.
- Bloat de repo por PDFs: +320 MB.

Propuestas y mejoras pendientes: [proposals/images_pending_improvements.md](proposals/images_pending_improvements.md), [proposals/images_future_architecture.md](proposals/images_future_architecture.md) (**PENDIENTE DE VALIDAR**).

---

## 9. Seguridad

- Modo solo lectura.
- Sin endpoints de escritura para QA ImÃ¡genes.
- Acciones bulk en preview (deshabilitadas).

---

## 10. Futuras mejoras (propuestas)

- Persistencia de presets de filtros en backend.
- Column resize real por drag.
- ValidaciÃ³n activa de URLs WordPress.
- Acciones bulk con confirmaciÃ³n y auditorÃ­a.
- IntegraciÃ³n directa con la pÃ¡gina de revisiÃ³n QA y PDF.

---

## Referencias

- CanÃ³nico tool: [15_qa_imagenes.md](15_qa_imagenes.md)
- CanÃ³nico auditorÃ­a: [AUDITORIA_IMAGENES_ESQUEMAS_MILU.md](AUDITORIA_IMAGENES_ESQUEMAS_MILU.md)
- Ãndice imÃ¡genes: [docs/images/00-INDEX-COMPLETE.md](images/00-INDEX-COMPLETE.md)
- Pipeline: [docs/images/image_pipeline.md](images/image_pipeline.md)
- Diagramas: [docs/images/diagrams.md](images/diagrams.md)
- ValidaciÃ³n: [docs/images/image_validation.md](images/image_validation.md)
- Esquemas POS: [docs/images/esquemas_pos.md](images/esquemas_pos.md)
- Performance: [docs/images/performance.md](images/performance.md)
- Export WordPress de imÃ¡genes: [docs/images/wordpress_image_export.md](images/wordpress_image_export.md)

