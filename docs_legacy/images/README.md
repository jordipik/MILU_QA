# Sistema de Imágenes y Esquemas en MILU

Documentación técnica completa del pipeline de imágenes, esquemas de posición y validación visual en la aplicación MILU QA.

## 📑 Índice de Documentación

### 1. **[image_pipeline.md](image_pipeline.md)** — Pipeline End-to-End
   - Cómo se generan imágenes desde PDFs
   - Scripts de procesamiento (Python, R, Node.js)
   - Flujo de datos: PDF → Extracción → Validación → JSON → Frontend
   - Almacenamientos intermedios y finales
   - Convenciones de nombres y directorios

### 2. **[image_validation.md](image_validation.md)** — Validaciones y Reglas
   - Sistema de placeholders
   - Matching URL ↔ Filesystem
   - Normalización de espacios y campos
   - Validaciones por tipo de imagen
   - Reglas de cálculo de `exp_imagenes`
   - Validación de integridad referencial

### 3. **[milu_qa_images.md](milu_qa_images.md)** — QA: Renderizado y Filtros
   - Carga de datos en milu_qa
   - Arquitectura de renderizado (renderRow, renderErrorViewRow)
   - Panel lateral de esquemas (preview system)
   - Sistema de filtros relacionados con imágenes
   - Lazy loading y estrategia de preload
   - Error handling y fallback de candidatos

### 4. **[esquemas_pos.md](esquemas_pos.md)** — Esquemas de Posición
   - Estructura de esquemas_pos_circulos/
   - Formato de nombres y tamaños
   - Generación de candidatos (buildSchemaPosImageCandidates)
   - Cálculo de estado (OK / MISS / FALTA)
   - Índice de archivos en servidor
   - Validación de existencia local

### 5. **[pdf_rectangles_detection.md](pdf_rectangles_detection.md)** — Detección de Rectángulos en PDF
   - Proceso real implementado hoy para localizar esquemas en PDFs
   - Uso de PyMuPDF y rectángulos de imágenes embebidas
   - Heurísticas de agrupación y expansión con etiquetas cortas
   - Limitaciones actuales y diferencia frente a una detección por color

### 6. **[wordpress_image_export.md](wordpress_image_export.md)** — Exportación a WordPress
   - Campo `exp_imagenes` (calculado en depuracion_json.py)
   - Regla de prioridad: ruta_foto → ruta_esquemas_pos → sin_imagen
   - URLs base de WordPress
   - Sincronización de imágenes
   - Generación de manifiestos para exportación
   - Estrategia de actualización incremental

### 7. **[performance.md](performance.md)** — Rendimiento y Bottlenecks
   - Análisis de métricas por página
   - Problemas críticos identificados
   - Re-render completo de tabla
   - Cascada de requests en fallback
   - Cálculos redundantes (getEsquemaPosStatus)
   - Oportunidades de optimización
   - Benchmarks actuales

### 8. **[pending_improvements.md](pending_improvements.md)** — Mejoras Pendientes
   - Deuda técnica identificada
   - Refactoring recomendado
   - Mejoras de rendimiento
   - Tests unitarios faltantes
   - Limpieza de código legacy
   - Plan de implementación por prioridad

---

## 🎯 Guía de Inicio Rápido

**¿Necesitas...?**

- **Entender cómo se generan imágenes**: Lee [image_pipeline.md](image_pipeline.md)
- **Entender cómo se detectan rectángulos de esquemas en PDFs**: Lee [pdf_rectangles_detection.md](pdf_rectangles_detection.md)
- **Debuggear "MISS" o "FALTA" badges**: Lee [esquemas_pos.md](esquemas_pos.md) + [image_validation.md](image_validation.md)
- **Entender cómo milu_qa renderiza**: Lee [milu_qa_images.md](milu_qa_images.md)
- **Optimizar rendimiento**: Lee [performance.md](performance.md)
- **Planificar mejoras**: Lee [pending_improvements.md](pending_improvements.md)
- **Exportar a WordPress**: Lee [wordpress_image_export.md](wordpress_image_export.md)

---

## 📊 Estado del Sistema (May 11, 2026)

| Aspecto | Estado | Notas |
|---------|--------|-------|
| **Pipeline Generación** | ✅ Funcional | 9 engine_*.json, ~67K items |
| **Validación de Imágenes** | ⚠️ Parcial | Sin tests, algunas reglas inconsistentes |
| **milu_qa Rendering** | ✅ Funcional | ESQ_POS column recientemente agregada |
| **Esquemas POS** | ✅ Funcional | ~50K archivos indexados |
| **Rendimiento** | ⚠️ Crítico | Re-render completo en filtros, cascada de requests |
| **Tests** | ❌ Inexistentes | 0 tests en últimos 30 commits |
| **Documentación** | ⚠️ Incompleta | Este documento es la referencia oficial ahora |

---

## 🔴 Hallazgos Críticos

1. **measurement_final FALTA en JSONs** — Ejecutar `python depuracion_json.py` (30 min)
2. **Re-render completo de tabla** — Afecta UX en filtros (ver [performance.md](performance.md))
3. **Sin tests unitarios** — Especialmente commit 7f3b62a0 (2K líneas sin validación)
4. **Cascada de requests en fallback** — Hasta 5s+ de timeout en imágenes perdidas
5. **Repo bloat** — PDFs +320 MB, mover a .gitignore

---

## 📈 Estadísticas del Sistema

- **Archivos de imagen en servidor**: ~50K (esquemas_pos_circulos/)
- **Registros en engine_*.json**: 67,883
- **Imágenes por registro**: 0-5 (promedio 2)
- **Campos de imagen por record**: 7 (ruta_foto, esquemas, esquemas_circulos, exp_imagenes, etc.)
- **Tiempo renderizado tabla**: 50-100ms (50 filas)
- **Tiempo preload esquemas**: 100-200ms
- **Memory footprint**: ~15-20 MB por 50 filas

---

## 🔗 Referencias Externas

- **Código Principal**:
  - [server.js](../../server.js#L1912) — Endpoint `/api/esquemas-pos-index`
  - [js/schemas.js](../../js/schemas.js) — Core image resolution
  - [js/qa-table.js](../../js/qa-table.js) — Rendering and filtering
  - [js/state.js](../../js/state.js) — Global state
  - [depuracion_json.py](../../depuracion_json.py) — Data normalization

- **Archivos HTML**:
  - [qa_milu.html](../../qa_milu.html) — Interfaz QA
  - [qa_imagenes.html](../../qa_imagenes.html) — Herramienta de auditoría de imágenes

- **Datos**:
  - `engine_*.json` (9 archivos) — Datos principales
  - `esquemas_pos_circulos/` — ~50K archivos de esquemas
  - `qa_revision_server_data.json` — Revisiones de QA

---

## ✍️ Notas de Mantenimiento

- Este documento fue generado el **11 de May de 2026** basado en auditoría exhaustiva
- Última actualización importante: commit `ad1737f0` (ESQ_POS column)
- Próximas acciones urgentes: Ver [pending_improvements.md](pending_improvements.md#acciones-inmediatas)

---

## 📧 Contacto y Contribución

Al modificar el sistema de imágenes:
1. Actualiza la documentación correspondiente
2. Añade tests unitarios (especialmente para validaciones)
3. Documenta en [pending_improvements.md](pending_improvements.md) si introduces deuda técnica temporal
4. Valida que no haya regresiones en milu_qa

---

**Última actualización**: May 11, 2026  
**Responsable**: AI Context System  
**Estado**: Revisión completa pendiente (Phase 6)
