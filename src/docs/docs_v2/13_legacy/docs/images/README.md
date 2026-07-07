# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Sistema de ImÃ¡genes y Esquemas en MILU

DocumentaciÃ³n tÃ©cnica completa del pipeline de imÃ¡genes, esquemas de posiciÃ³n y validaciÃ³n visual en la aplicaciÃ³n MILU QA.

## ðŸ“‘ Ãndice de DocumentaciÃ³n

### 1. **[image_pipeline.md](image_pipeline.md)** â€” Pipeline End-to-End
   - CÃ³mo se generan imÃ¡genes desde PDFs
   - Scripts de procesamiento (Python, R, Node.js)
   - Flujo de datos: PDF â†’ ExtracciÃ³n â†’ ValidaciÃ³n â†’ JSON â†’ Frontend
   - Almacenamientos intermedios y finales
   - Convenciones de nombres y directorios

### 2. **[image_validation.md](image_validation.md)** â€” Validaciones y Reglas
   - Sistema de placeholders
   - Matching URL â†” Filesystem
   - NormalizaciÃ³n de espacios y campos
   - Validaciones por tipo de imagen
   - Reglas de cÃ¡lculo de `exp_imagenes`
   - ValidaciÃ³n de integridad referencial

### 3. **[milu_qa_images.md](milu_qa_images.md)** â€” QA: Renderizado y Filtros
   - Carga de datos en milu_qa
   - Arquitectura de renderizado (renderRow, renderErrorViewRow)
   - Panel lateral de esquemas (preview system)
   - Sistema de filtros relacionados con imÃ¡genes
   - Lazy loading y estrategia de preload
   - Error handling y fallback de candidatos

### 4. **[esquemas_pos.md](esquemas_pos.md)** â€” Esquemas de PosiciÃ³n
   - Estructura de esquemas_pos_circulos/
   - Formato de nombres y tamaÃ±os
   - GeneraciÃ³n de candidatos (buildSchemaPosImageCandidates)
   - CÃ¡lculo de estado (OK / MISS / FALTA)
   - Ãndice de archivos en servidor
   - ValidaciÃ³n de existencia local

### 5. **[pdf_rectangles_detection.md](pdf_rectangles_detection.md)** â€” DetecciÃ³n de RectÃ¡ngulos en PDF
   - Proceso real implementado hoy para localizar esquemas en PDFs
   - Uso de PyMuPDF y rectÃ¡ngulos de imÃ¡genes embebidas
   - HeurÃ­sticas de agrupaciÃ³n y expansiÃ³n con etiquetas cortas
   - Limitaciones actuales y diferencia frente a una detecciÃ³n por color

### 6. **[wordpress_image_export.md](wordpress_image_export.md)** â€” ExportaciÃ³n a WordPress
   - Campo `exp_imagenes` (calculado en depuracion_json.py)
   - Regla oficial de prioridad: filename_foto â†’ esquemas_circulos â†’ esquemas (fallback) â†’ sin_imagen
   - `exp_imagenes` no depende de `ruta_esquemas_pos` ni de `esquemas_circulos_all`
   - URLs base de WordPress
   - SincronizaciÃ³n de imÃ¡genes
   - GeneraciÃ³n de manifiestos para exportaciÃ³n
   - Estrategia de actualizaciÃ³n incremental

### 7. **[performance.md](performance.md)** â€” Rendimiento y Bottlenecks
   - AnÃ¡lisis de mÃ©tricas por pÃ¡gina
   - Problemas crÃ­ticos identificados
   - Re-render completo de tabla
   - Cascada de requests en fallback
   - CÃ¡lculos redundantes (getEsquemaPosStatus)
   - Oportunidades de optimizaciÃ³n
   - Benchmarks actuales

### 8. **[pending_improvements.md](pending_improvements.md)** â€” Mejoras Pendientes
   - Deuda tÃ©cnica identificada
   - Refactoring recomendado
   - Mejoras de rendimiento
   - Tests unitarios faltantes
   - Limpieza de cÃ³digo legacy
   - Plan de implementaciÃ³n por prioridad

---

## ðŸŽ¯ GuÃ­a de Inicio RÃ¡pido

**Â¿Necesitas...?**

- **Entender cÃ³mo se generan imÃ¡genes**: Lee [image_pipeline.md](image_pipeline.md)
- **Entender cÃ³mo se detectan rectÃ¡ngulos de esquemas en PDFs**: Lee [pdf_rectangles_detection.md](pdf_rectangles_detection.md)
- **Debuggear "MISS" o "FALTA" badges**: Lee [esquemas_pos.md](esquemas_pos.md) + [image_validation.md](image_validation.md)
- **Entender cÃ³mo milu_qa renderiza**: Lee [milu_qa_images.md](milu_qa_images.md)
- **Optimizar rendimiento**: Lee [performance.md](performance.md)
- **Planificar mejoras**: Lee [pending_improvements.md](pending_improvements.md)
- **Exportar a WordPress**: Lee [wordpress_image_export.md](wordpress_image_export.md)

---

## ðŸ“Š Estado del Sistema (May 11, 2026)

| Aspecto | Estado | Notas |
|---------|--------|-------|
| **Pipeline GeneraciÃ³n** | âœ… Funcional | 9 engine_*.json, ~67K items |
| **ValidaciÃ³n de ImÃ¡genes** | âš ï¸ Parcial | Sin tests, algunas reglas inconsistentes |
| **milu_qa Rendering** | âœ… Funcional | ESQ_POS column recientemente agregada |
| **Esquemas POS** | âœ… Funcional | ~50K archivos indexados |
| **Rendimiento** | âš ï¸ CrÃ­tico | Re-render completo en filtros, cascada de requests |
| **Tests** | âŒ Inexistentes | 0 tests en Ãºltimos 30 commits |
| **DocumentaciÃ³n** | âš ï¸ Incompleta | Este documento es la referencia oficial ahora |

---

## ðŸ”´ Hallazgos CrÃ­ticos

1. **measurement_final FALTA en JSONs** â€” Ejecutar `python depuracion_json.py` (30 min)
2. **Re-render completo de tabla** â€” Afecta UX en filtros (ver [performance.md](performance.md))
3. **Sin tests unitarios** â€” Especialmente commit 7f3b62a0 (2K lÃ­neas sin validaciÃ³n)
4. **Cascada de requests en fallback** â€” Hasta 5s+ de timeout en imÃ¡genes perdidas
5. **Repo bloat** â€” PDFs +320 MB, mover a .gitignore

---

## ðŸ“ˆ EstadÃ­sticas del Sistema

- **Archivos de imagen en servidor**: ~50K (esquemas_pos_circulos/)
- **Registros en engine_*.json**: 67,883
- **ImÃ¡genes por registro**: 0-5 (promedio 2)
- **Campos de imagen por record**: 7 (ruta_foto, esquemas, esquemas_circulos, exp_imagenes, etc.)
- **Tiempo renderizado tabla**: 50-100ms (50 filas)
- **Tiempo preload esquemas**: 100-200ms
- **Memory footprint**: ~15-20 MB por 50 filas

---

## ðŸ”— Referencias Externas

- **CÃ³digo Principal**:
  - [server.js](../../server.js#L1912) â€” Endpoint `/api/esquemas-pos-index`
  - [js/schemas.js](../../js/schemas.js) â€” Core image resolution
  - [js/qa-table.js](../../js/qa-table.js) â€” Rendering and filtering
  - [js/state.js](../../js/state.js) â€” Global state
  - [depuracion_json.py](../../depuracion_json.py) â€” Data normalization

- **Archivos HTML**:
  - [qa_milu.html](../../qa_milu.html) â€” Interfaz QA
  - [qa_imagenes.html](../../qa_imagenes.html) â€” Herramienta de auditorÃ­a de imÃ¡genes

- **Datos**:
  - `engine_*.json` (9 archivos) â€” Datos principales
  - `esquemas_pos_circulos/` â€” ~50K archivos de esquemas
  - `qa_revision_server_data.json` â€” Revisiones de QA

---

## âœï¸ Notas de Mantenimiento

- Este documento fue generado el **11 de May de 2026** basado en auditorÃ­a exhaustiva
- Ãšltima actualizaciÃ³n importante: commit `ad1737f0` (ESQ_POS column)
- PrÃ³ximas acciones urgentes: Ver [pending_improvements.md](pending_improvements.md#acciones-inmediatas)

---

## ðŸ“§ Contacto y ContribuciÃ³n

Al modificar el sistema de imÃ¡genes:
1. Actualiza la documentaciÃ³n correspondiente
2. AÃ±ade tests unitarios (especialmente para validaciones)
3. Documenta en [pending_improvements.md](pending_improvements.md) si introduces deuda tÃ©cnica temporal
4. Valida que no haya regresiones en milu_qa

---

**Ãšltima actualizaciÃ³n**: May 11, 2026  
**Responsable**: AI Context System  
**Estado**: RevisiÃ³n completa pendiente (Phase 6)

