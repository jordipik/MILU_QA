# DOCUMENTO CANÓNICO MILU — IMÁGENES Y ESQUEMAS

> **Estado**: CANÓNICO · Fuente única de verdad para multimedia (imágenes + esquemas POS).
> **Última actualización**: 2026-05-12.
> **Fuentes consolidadas**: [15_qa_imagenes.md](15_qa_imagenes.md), [AUDITORIA_IMAGENES_ESQUEMAS_MILU.md](AUDITORIA_IMAGENES_ESQUEMAS_MILU.md), [images/00-INDEX-COMPLETE.md](images/00-INDEX-COMPLETE.md) y resto de `images/*`.

---

## 1. Modelo de campos

Cada registro de `engine_*.json` puede llevar referencias multimedia:

- `ruta_foto` — foto del artículo.
- `ruta_esquemas_pos` — esquema de posición (POS).
- `exp_imagenes` — campo derivado final con prioridad:
  1. `ruta_foto`
  2. `ruta_esquemas_pos`
  3. `placeholder` (sin imagen real)

Recalculado en `depuracion_json.py`. Ver [FLUJO_DATOS_MILU.md → sección 6](FLUJO_DATOS_MILU.md).

---

## 2. Pipeline (alto nivel)

```
PDF (catálogos MTU)
   │
   ├─► Extracción (pdfplumber / PyMuPDF) ──► fotos_articulos/, fotos_motores/
   │
   ├─► Detección de esquemas POS ──► esquemas_pos_circulos/ (~50K archivos)
   │
   ├─► Inventario + validación ──► data/output/image_inventory.json
   │                              data/output/image_schema_audit.json
   │
   ├─► Render en frontend (qa_imagenes.html, qa_milu.html)
   │
   └─► Export WordPress (milu_wp_*.json + milu_wp_trace.json)
```

Detalle: [docs/images/image_pipeline.md](images/image_pipeline.md), [docs/images/esquemas_pos.md](images/esquemas_pos.md).

---

## 3. Herramienta QA Imágenes (`qa_imagenes.html`)

Modo **solo lectura** para auditoría multimedia.

- Página: [qa_imagenes.html](../qa_imagenes.html).
- CSS: [css/qa_imagenes.css](../css/qa_imagenes.css).
- JS principal: [js/qa_imagenes.js](../js/qa_imagenes.js).
- Módulos:
  - [js/qa_imagenes_filters.js](../js/qa_imagenes_filters.js)
  - [js/qa_imagenes_table.js](../js/qa_imagenes_table.js)
  - [js/qa_imagenes_preview.js](../js/qa_imagenes_preview.js)
  - [js/qa_imagenes_stats.js](../js/qa_imagenes_stats.js)

### 3.1 Entradas (carga tolerante)

- `data/output/image_schema_audit.json`
- `data/output/image_inventory.json`
- `data/output/qa_index.json`
- `qa_index.json`, `version.json`
- Outputs de export: `data/output/wordpress/milu_wp_*.json`
- Refs históricas: `MILU_New_v506.json`, `MILU_Superseded_v506.json`, `product-export-2026-03-29-11-07.json`

### 3.2 Estructura esperada

`image_schema_audit.json`:

- Claves: `generated_at`, `summary`, `wordpress_summary`, `qa_metrics`, `qa_index_info`, `records[]`, `unused_images[]`, `missing_images[]`, `broken_references[]`.
- `records[]`: `record_key`, `part_number`, `engine_model`, `libro`, `source_page`, `export_type`, `ruta_foto`, `ruta_esquemas_pos`, `image_status`, `schema_status`, `issues[]`, `reference_counts`.

`image_inventory.json`:

- Array con `filename`, `relative_path`, `extension`, `size_kb`, `modified_at`, `possible_type`, `engine_model`, `libro`, `pagina`, `is_used`.

### 3.3 Reglas de estado (UI)

- `state_status = ERROR` si hay `issues` con tokens `missing|broken|no_|empty`.
- `state_status = WARNING` si hay `issues` pero no críticos.
- `state_status = OK` sin issues.

Badges visibles:

- `image_status = NO_IMAGE` → rojo.
- `image_status = ONLY_PLACEHOLDER` → naranja.
- `schema_status = NO_SCHEMA` → rojo.
- Ruta con `sin_imagen|placeholder` → flag placeholder.
- Issue con `broken` → ruta rota.

### 3.4 Filtros

- Search global: PN, rutas, estado, issues.
- Rápidos por grupos: imágenes, esquemas, exportación, estado.
- Técnicos: `engine_model`, `libro`, `source_page`, `part_number`.
- Persistencia en `localStorage` (`qa_imagenes_filters_v1`).

### 3.5 KPIs (clicables → aplican filtro)

- Total exportables.
- Con imagen real.
- Solo placeholder.
- Sin imagen.
- Con esquema.
- Sin esquema.
- Rutas rotas.
- Imágenes huérfanas.
- Imágenes no usadas.
- Exportables con error.
- Con foto + esquema.
- Solo esquema.
- Solo foto.

### 3.6 Tabla

- Virtualizada por viewport.
- Orden por columna.
- Selección múltiple.
- Export CSV de la vista.
- Render incremental por overscan.

### 3.7 Tabs secundarias

- Artículos.
- Inventario imágenes.
- Rutas rotas.
- Placeholders.
- Sin esquema.
- Imágenes huérfanas.
- Estadísticas.

### 3.8 Panel diagnóstico (por registro)

- Producto (imagen + estado).
- Esquema (preview + estado).
- WordPress (ruta + validación).
- Local (detección por inventory).
- Inventario (filename, size, ext, modified).
- Diagnóstico (issues + recomendación).

---

## 4. Esquemas de posición (POS)

- ~50 000 archivos en `esquemas_pos_circulos/` organizados por motor / página / posición / tamaño.
- Índice runtime de candidatos **sin persistencia** (se reconstruye en cada arranque).
- Spec detallada: [docs/images/esquemas_pos.md](images/esquemas_pos.md).

---

## 5. Validación de imágenes

Reglas y badges: [docs/images/image_validation.md](images/image_validation.md).

---

## 6. Performance

Análisis de rendimiento de render y carga: [docs/images/performance.md](images/performance.md).

---

## 7. Integración con export WordPress

El export integra URLs y metadata de imagen en `milu_wp_*.json`. El manifest de trazabilidad multimedia va en `milu_wp_trace.json`. Detalle:

- [docs/images/wordpress_image_export.md](images/wordpress_image_export.md)
- [WORDPRESS_EXPORT_MILU.md → sección 10](WORDPRESS_EXPORT_MILU.md)

---

## 8. Hallazgos críticos (auditoría 2026-05)

De [AUDITORIA_IMAGENES_ESQUEMAS_MILU.md](AUDITORIA_IMAGENES_ESQUEMAS_MILU.md):

- 1 576 filas sin `measure_final` (≈ 2.3 %).
- 18 868 registros con `exp_imagenes` solo placeholder.
- 14 249 referencias rotas detectadas.
- Bloat de repo por PDFs: +320 MB.

Propuestas y mejoras pendientes: [proposals/images_pending_improvements.md](proposals/images_pending_improvements.md), [proposals/images_future_architecture.md](proposals/images_future_architecture.md) (**PENDIENTE DE VALIDAR**).

---

## 9. Seguridad

- Modo solo lectura.
- Sin endpoints de escritura para QA Imágenes.
- Acciones bulk en preview (deshabilitadas).

---

## 10. Futuras mejoras (propuestas)

- Persistencia de presets de filtros en backend.
- Column resize real por drag.
- Validación activa de URLs WordPress.
- Acciones bulk con confirmación y auditoría.
- Integración directa con la página de revisión QA y PDF.

---

## Referencias

- Canónico tool: [15_qa_imagenes.md](15_qa_imagenes.md)
- Canónico auditoría: [AUDITORIA_IMAGENES_ESQUEMAS_MILU.md](AUDITORIA_IMAGENES_ESQUEMAS_MILU.md)
- Índice imágenes: [docs/images/00-INDEX-COMPLETE.md](images/00-INDEX-COMPLETE.md)
- Pipeline: [docs/images/image_pipeline.md](images/image_pipeline.md)
- Diagramas: [docs/images/diagrams.md](images/diagrams.md)
- Validación: [docs/images/image_validation.md](images/image_validation.md)
- Esquemas POS: [docs/images/esquemas_pos.md](images/esquemas_pos.md)
- Performance: [docs/images/performance.md](images/performance.md)
- Export WordPress de imágenes: [docs/images/wordpress_image_export.md](images/wordpress_image_export.md)
