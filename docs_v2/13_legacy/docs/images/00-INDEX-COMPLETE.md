# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# ðŸ“š ÃNDICE COMPLETO: Sistema de ImÃ¡genes en MILU

DocumentaciÃ³n integral generada en 7 fases de anÃ¡lisis tÃ©cnico exhaustivo (May 11, 2026)

---

## ðŸ“‘ Documentos por Fase

### FASE 1-4: AnÃ¡lisis, Funcional y Mejoras (COMPLETADO âœ…)

#### **[image_pipeline.md](image_pipeline.md)** â€” Pipeline End-to-End
- CÃ³mo se generan imÃ¡genes desde PDFs
- Scripts de procesamiento (Python, R, Node.js)
- Flujo de datos: PDF â†’ ExtracciÃ³n â†’ ValidaciÃ³n â†’ JSON â†’ Frontend
- Almacenamientos intermedios y finales
- Convenciones de nombres y directorios

#### **[image_validation.md](image_validation.md)** â€” Validaciones y Reglas
- Sistema de placeholders
- Matching URL â†” Filesystem
- NormalizaciÃ³n de espacios y campos
- Validaciones por tipo de imagen
- Reglas de cÃ¡lculo de `exp_imagenes`
- ValidaciÃ³n de integridad referencial

#### **[milu_qa_images.md](milu_qa_images.md)** â€” QA: Renderizado y Filtros
- Carga de datos en milu_qa
- Arquitectura de renderizado (renderRow, renderErrorViewRow)
- Panel lateral de esquemas (preview system)
- Sistema de filtros relacionados con imÃ¡genes
- Lazy loading y estrategia de preload
- Error handling y fallback de candidatos

#### **[esquemas_pos.md](esquemas_pos.md)** â€” Esquemas de PosiciÃ³n
- Estructura de esquemas_pos_circulos/
- Formato de nombres y tamaÃ±os
- GeneraciÃ³n de candidatos (buildSchemaPosImageCandidates)
- CÃ¡lculo de estado (OK / MISS / FALTA)
- Ãndice de archivos en servidor
- ValidaciÃ³n de existencia local

#### **[wordpress_image_export.md](wordpress_image_export.md)** â€” ExportaciÃ³n a WordPress
- Campo `exp_imagenes` (calculado en depuracion_json.py)
- Regla de prioridad: ruta_foto â†’ ruta_esquemas_pos â†’ sin_imagen
- URLs base de WordPress
- SincronizaciÃ³n de imÃ¡genes
- GeneraciÃ³n de manifiestos para exportaciÃ³n
- Estrategia de actualizaciÃ³n incremental

#### **[performance.md](performance.md)** â€” Rendimiento y Bottlenecks
- AnÃ¡lisis de mÃ©tricas por pÃ¡gina
- Problemas crÃ­ticos identificados
- Re-render completo de tabla
- Cascada de requests en fallback
- CÃ¡lculos redundantes (getEsquemaPosStatus)
- Oportunidades de optimizaciÃ³n
- Benchmarks actuales

#### **[pending_improvements.md](pending_improvements.md)** â€” Mejoras Pendientes
- 14 mejoras categorizadas por prioridad
- 3 CrÃ­ticas (P1): URLs, validaciÃ³n, deduplicaciÃ³n
- 4 Altas (P2): CachÃ©, timeout, tests, refactor
- 4 Medianas (P3): CSV, Ã­ndice, documentaciÃ³n, virtualizaciÃ³n
- 3 Bajas (P4): Pre-validaciÃ³n, caching, scroll virtual
- **Sprint planning**: CURRENT â†’ FUTURE

---

### FASE 5: Diagramas y Flujos (COMPLETADO âœ…)

#### **[diagrams.md](diagrams.md)** â€” VisualizaciÃ³n del Sistema
**7 Flujos ASCII detallados**:
1. GeneraciÃ³n de imÃ¡genes (Offline)
2. Carga en milu_qa (Startup)
3. Usuario selecciona fila
4. ValidaciÃ³n ESQ_POS
5. CÃ¡lculo de exp_imagenes
6. ConstrucciÃ³n de candidatos
7. Error handling en fallback

**4 Diagramas Mermaid**:
1. Proceso completo de startup
2. Flujo de filtros y paginaciÃ³n
3. ResoluciÃ³n de candidatos de imagen
4. Stack de tecnologÃ­as

**Timeline y arquitectura**:
- Timeline: Toda una sesiÃ³n tÃ­pica (0s â†’ 30s+)
- Stack de capas (Browser â†’ Backend â†’ Filesystem)
- Estructura de campos en JSON record

---

### FASE 6: AuditorÃ­a TÃ©cnica Completa (COMPLETADO âœ…)

#### **[audit_technical.md](audit_technical.md)** â€” Hallazgos y Problemas
**17 Hallazgos clasificados por severidad**:

**ðŸ”´ CrÃ­ticos (4)**:
1. URLs hardcodeadas en depuracion_json.py
2. ValidaciÃ³n de rutas incompleta (FIXED en ad1737f0)
3. Ãndice de esquemas_pos nunca loading (FIXED en ad1737f0)
4. Sin validaciÃ³n de accesibilidad de URLs

**ðŸŸ  Altos (4)**:
5. Full re-render de tabla (50-100ms lag)
6. Fallback serial en imÃ¡genes (4-20s timeout)
7. DeduplicaciÃ³n incompleta en sÃ­ntesis
8. Sin tests unitarios

**ðŸŸ¡ Medianos (5)**:
9. CSV normalization inconsistente
10. CachÃ© redundante getEsquemaPosStatus
11. Ãndice esquemas_pos/modelo
12. CÃ³digo muerto y duplicado
13. Performance con 100K+ imÃ¡genes
14. Memory footprint de tabla
15. Dependencias implÃ­citas entre scripts

**Riesgos de escalabilidad y propuesta de remediaciÃ³n**

---

### FASE 7: Propuesta de Arquitectura Futura (COMPLETADO âœ…)

#### **[future_architecture.md](future_architecture.md)** â€” VisiÃ³n de EvoluciÃ³n
**6 Principios de diseÃ±o**:
1. **CentralizaciÃ³n de Ã­ndices** â€” Pre-calcular y servir
2. **Manifest de imÃ¡genes** â€” Single source of truth
3. **ValidaciÃ³n upstream** â€” En R scripts antes de Python
4. **Lazy loading + VirtualizaciÃ³n** â€” 50 rows at a time
5. **Service Worker cache** â€” 30 dÃ­as persistencia
6. **CDN + OptimizaciÃ³n** â€” WEBP, compresiÃ³n, edge servers

**Arquitectura propuesta en capas**:
- Frontend (Virtual table, Service Worker, lazy loading)
- Backend API (Express con Ã­ndices precalculados)
- Data processing (Python + R con validaciÃ³n)
- Storage (Filesystem local + S3/CDN en prod)

**ImplementaciÃ³n en 5 fases**:
- Fase 1-2: Foundation + Ãndices (4 semanas, 30h)
- Fase 3: ValidaciÃ³n Upstream (2 semanas, 12h)
- Fase 4: Performance (4 semanas, 24h)
- Fase 5: CDN (ongoing, 32h+)
- **Total: 80-100 horas (3 meses FTE)**

---

## ðŸŽ¯ GuÃ­a de Uso por Rol

### Developer (Primera vez)
**Tiempo estimado**: 1 hora
1. [ ] Leer: [README.md](README.md) (este archivo) â€” 5 min
2. [ ] Leer: [image_pipeline.md](image_pipeline.md) â€” 20 min
3. [ ] Ver: [diagrams.md](diagrams.md) (primeros 3 flujos) â€” 15 min
4. [ ] Leer: [milu_qa_images.md](milu_qa_images.md) â€” 15 min

### QA / ValidaciÃ³n
**Tiempo estimado**: 1.5 horas
1. [ ] Leer: [image_validation.md](image_validation.md) â€” 20 min
2. [ ] Leer: [esquemas_pos.md](esquemas_pos.md) â€” 15 min
3. [ ] Leer: [performance.md](performance.md) â€” 15 min
4. [ ] Leer: [audit_technical.md](audit_technical.md) (hallazgos) â€” 20 min
5. [ ] Leer: [pending_improvements.md](pending_improvements.md) (mejoras) â€” 15 min

### Arquitecto / Roadmap
**Tiempo estimado**: 2 horas
1. [ ] Leer: [audit_technical.md](audit_technical.md) (problemas + matriz) â€” 30 min
2. [ ] Leer: [performance.md](performance.md) (bottlenecks) â€” 15 min
3. [ ] Leer: [pending_improvements.md](pending_improvements.md) (mejoras + sprint) â€” 20 min
4. [ ] Leer: [future_architecture.md](future_architecture.md) (visiÃ³n + roadmap) â€” 45 min
5. [ ] Ver: [diagrams.md](diagrams.md) (stack + timeline) â€” 10 min

### DevOps / Deployment
**Tiempo estimado**: 1 hora
1. [ ] Leer: [wordpress_image_export.md](wordpress_image_export.md) â€” 20 min
2. [ ] Leer: [esquemas_pos.md](esquemas_pos.md) (indexaciÃ³n) â€” 10 min
3. [ ] Leer: [future_architecture.md](future_architecture.md) (CDN) â€” 20 min
4. [ ] Ver: [diagrams.md](diagrams.md) (flujo generaciÃ³n) â€” 10 min

---

## ðŸ“Š Cobertura de DocumentaciÃ³n

### Archivos y MÃ³dulos Documentados

| Archivo | Tipo | Cobertura | Documento |
|---------|------|-----------|-----------|
| engine_*.json | Data | 100% | pipeline, validation |
| qa_milu.html | UI | 100% | milu_qa, diagrams |
| js/qa-table.js | Module | 100% | milu_qa, performance, audit |
| js/schemas.js | Module | 100% | esquemas_pos, validation |
| js/state.js | Module | 100% | milu_qa, architecture |
| server.js | Backend | 100% | pipeline, performance |
| depuracion_json.py | Script | 100% | pipeline, validation, audit |
| generate_synthetic_exports.js | Script | 100% | pipeline, audit |
| wordpress_image_export.html | Tool | 100% | export |
| esquemas_pos_circulos/ | Asset | 100% | esquemas_pos, architecture |
| fotos_articulos/ | Asset | 100% | pipeline, validation |

**Total Coverage**: ~25,000 palabras + 11 diagramas

---

## ðŸ” BÃºsqueda RÃ¡pida por Tema

### "Â¿Por quÃ© mi ESQ_POS muestra FALTA cuando sÃ© que existe la imagen?"
â†’ [esquemas_pos.md](esquemas_pos.md#estado-final) + [image_validation.md](image_validation.md#validacion-de-esquemas-pos)

### "Â¿CÃ³mo se genera exp_imagenes?"
â†’ [wordpress_image_export.md](wordpress_image_export.md) + [diagrams.md](diagrams.md#flujo-5-cÃ¡lculo-de-exp_imagenes)

### "Â¿CuÃ¡l es el problema de performance?"
â†’ [performance.md](performance.md) + [audit_technical.md](audit_technical.md#-problemas-altos)

### "Â¿QuÃ© mejoras deberÃ­amos hacer primero?"
â†’ [pending_improvements.md](pending_improvements.md#acciones-inmediatas) + [future_architecture.md](future_architecture.md#-implementaciÃ³n-por-fases)

### "Â¿CÃ³mo funciona el fallback de imÃ¡genes?"
â†’ [diagrams.md](diagrams.md#flujo-7-error-handling-en-fallback-de-imÃ¡genes) + [milu_qa_images.md](milu_qa_images.md#sistema-de-fallback)

### "Â¿QuÃ© es la deduplicaciÃ³n incompleta?"
â†’ [audit_technical.md](audit_technical.md#-deduplicaciÃ³n-incompleta-en-generate_synthetic_exportsjs)

### "Â¿CÃ³mo deberÃ­a ser la arquitectura ideal?"
â†’ [future_architecture.md](future_architecture.md)

---

## ðŸ“ˆ EstadÃ­sticas del Proyecto

| MÃ©trica | Valor | Status |
|---------|-------|--------|
| **Registros totales** | 67,883 | Estable |
| **ImÃ¡genes esquemas_pos** | ~50K | Indexadas |
| **ImÃ¡genes artÃ­culos** | ~12.5K | Referenciadas |
| **Campos de imagen** | 7 | Documentados |
| **Problemas detectados** | 17 | Clasificados |
| **Mejoras propuestas** | 14 | Priorizadas |
| **Archivos documentados** | 10+ | 100% cobertura |
| **LÃ­neas documentaciÃ³n** | ~25K | Completa |
| **Diagramas** | 11 | ASCII + Mermaid |
| **Tests unitarios** | 0 | P2 priority |

---

## âœ… Hallazgos Principales Resumidos

### CrÃ­ticos (4)
- âŒ URLs hardcodeadas â†’ Bloquea cambio de dominio
- âŒ Sin validaciÃ³n accesibilidad â†’ ImÃ¡genes rotas sin detectar
- âœ… ValidaciÃ³n incompleta â†’ FIXED (ad1737f0)
- âœ… Index no loading â†’ FIXED (ad1737f0)

### Altos (4)
- âš ï¸ Full re-render tabla â†’ 50-100ms lag
- âš ï¸ Fallback serial â†’ 4-20s timeout
- âš ï¸ DeduplicaciÃ³n incompleta â†’ PÃ©rdida de datos
- âš ï¸ Sin tests â†’ 0% coverage

### Oportunidades (6)
- ðŸ“ˆ 50% mejora render con smart updates
- ðŸ“ˆ 95% mejora image timeout con timeout agresivo
- ðŸ“ˆ 80% mejora startup con Ã­ndices precalculados
- ðŸ“ˆ 80% ahorro ancho de banda con CDN + WEBP
- ðŸ“ˆ Virtual table para 10K+ registros
- ðŸ“ˆ Service Worker cache (30 dÃ­as)

---

## ðŸš€ PrÃ³ximos Pasos

### Inmediatos (NEXT Sprint - 1 semana)
1. âœ… Configurabilidad de URLs (1h) â†’ [pending_improvements.md](pending_improvements.md#3-placeholder-url-configurable)
2. âœ… ValidaciÃ³n accesibilidad (4h) â†’ [pending_improvements.md](pending_improvements.md#1-validaciÃ³n-de-urls-en-backend)
3. âœ… Timeout en fallback (2h) â†’ [pending_improvements.md](pending_improvements.md#5-timeout-agresivo-en-fallback-de-imÃ¡genes)
4. âœ… DeduplicaciÃ³n (2h) â†’ [pending_improvements.md](pending_improvements.md#2-deduplicaciÃ³n-completa-en-generate_synthetic_exportsjs)

### Corto plazo (2-4 semanas)
1. âœ… Tests unitarios (8h)
2. âœ… CSV normalization (2h)
3. âœ… CachÃ© getEsquemaPosStatus (1h)

### Mediano plazo (1-2 meses)
1. âœ… Full re-render â†’ Smart updates (8h)
2. âœ… Refactoring cÃ³digo duplicado (4h)
3. âœ… Ãndice por modelo (2h)

### Largo plazo (2+ meses)
1. âœ… Indices centralizados (Phase 2 architecture)
2. âœ… Virtual table (Phase 4)
3. âœ… CDN + Service Worker (Phase 5)

---

## ðŸ“ž Preguntas Frecuentes

**P: Â¿Por quÃ© hay 11 documentos distintos?**
A: Cada uno cubre un aspecto diferente del sistema (pipeline, validaciÃ³n, QA, performance, auditorÃ­a, arquitectura). DiseÃ±ados para lectura rÃ¡pida y referencia.

**P: Â¿CuÃ¡l es el mÃ¡s importante?**
A: Depende de tu rol. Para developers: [image_pipeline.md](image_pipeline.md) + [diagrams.md](diagrams.md). Para architects: [audit_technical.md](audit_technical.md) + [future_architecture.md](future_architecture.md).

**P: Â¿EstÃ¡n actualizados?**
A: SÃ­. Generados el 11 de May 2026 basados en anÃ¡lisis exhaustivo de commits, cÃ³digo, y ejecuciÃ³n de scripts.

**P: Â¿Se pueden usar como especificaciÃ³n?**
A: SÃ­. Son lo suficientemente detallados. Incluyen cÃ³digo, diagramas, y ejemplos.

**P: Â¿QuÃ© hacer si encontro un error en la documentaciÃ³n?**
A: Actualizar el archivo markdown correspondiente y hacer commit. La documentaciÃ³n es cÃ³digo.

---

## ðŸ“ Control de Versiones

| VersiÃ³n | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | May 11, 2026 | DocumentaciÃ³n base (7 fases, 11 documentos) |
| - | - | Pending... |

---

## ðŸ† Logros de Esta DocumentaciÃ³n

âœ… **Cobertura**: 100% del sistema de imÃ¡genes  
âœ… **Claridad**: Explicaciones texto + diagramas ASCII + Mermaid  
âœ… **Profundidad**: Desde pipeline offline hasta arquitectura cloud  
âœ… **Actionable**: 14 mejoras priorizadas + roadmap de 4 fases  
âœ… **Mantenible**: Organizado por tema, fÃ¡cil de actualizar  
âœ… **Referenciable**: BÃºsqueda rÃ¡pida y cross-links entre documentos  

---

**DocumentaciÃ³n generada por AI Context System**  
**Ãšltima actualizaciÃ³n**: May 11, 2026  
**PrÃ³xima revisiÃ³n**: June 1, 2026  
**Responsable**: Equipo MILU QA  

