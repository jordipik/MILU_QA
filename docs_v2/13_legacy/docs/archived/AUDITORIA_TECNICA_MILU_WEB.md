# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

> **ARCHIVADO** — superseded.
>
> Superseded por [../09_auditoria_2026.md](../09_auditoria_2026.md). Se conserva como referencia histórica.
>
> Movido a `docs/archived/` el 2026-05-12. Se conserva por trazabilidad. **No usar como fuente de verdad.**

---

# AUDITORIA TECNICA MILU WEB

Fecha: 2026-05-06
Alcance: auditoria tecnica completa sin cambios funcionales.

## 1. Resumen ejecutivo

Estado general: el proyecto esta operativo y funcional, pero tiene deuda tecnica concentrada en tres zonas:

- Concentracion excesiva de logica en frontend principal y backend monolitico.
- Convivencia de convenciones antiguas y nuevas en QA (normalizacion y semantica de estados/acciones).
- Riesgo de divergencia por codigo duplicado, rutas legacy y scripts alternativos de pipeline.

Riesgos prioritarios:

- Riesgo alto: servidor demasiado grande con responsabilidades mezcladas y persistencia JSON distribuida en muchos endpoints.
- Riesgo alto: reglas de revision y export repartidas en frontend, backend y scripts con mapeos implicitos.
- Riesgo medio: crecimiento de rendimiento en tabla QA (render completo, muchos listeners, multiples vistas y paneles).
- Riesgo medio: coexistencia de modulos legacy/duplicados (especialmente flujos PN review antiguos y scripts legacy export).

## 2. Estado actual del proyecto

Situacion actual:

- Backend Express local en [server.js](server.js).
- Frontend principal en [qa_milu.html](qa_milu.html) y modulo de entrada [js/qa-milu.js](js/qa-milu.js).
- Estado compartido global en [js/state.js](js/state.js).
- Persistencia principal en 9 archivos engine_*.json definidos en [engine_files.js](engine_files.js) y [js/data-loader.js](js/data-loader.js).
- Revisiones sincronizables via [qa_revision_server_data.json](qa_revision_server_data.json) y endpoint [server.js](server.js#L706).
- Export WordPress activo en [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js) y UI de soporte en [js/export-wordpress.js](js/export-wordpress.js).

Observacion: existe base documental amplia en [docs/](docs), pero parte del codigo ha evolucionado mas rapido que la documentacion y hay conceptos mezclados entre pipeline actual y pipeline legacy.

## 3. Mapa de arquitectura

### 3.1 Estructura general de carpetas

- Core runtime web:
  - [qa_milu.html](qa_milu.html)
  - [js/](js)
  - [styles/](styles)
  - [server.js](server.js)
  - [engine_*.json](engine_12V4000M40A.json)
- Runtime QA/analista adicional:
  - [analista_02.html](analista_02.html)
  - [qa_analista_registro.html](qa_analista_registro.html)
  - [pn_review.html](pn_review.html)
- Export/Pipeline:
  - [scripts/](scripts)
  - [data/output/](data/output)
- Carpetas de salida o historico (no tocar salvo necesidad):
  - [dist/](dist)
  - [esquemas/](esquemas)
  - [esquemas_pos_circulos/](esquemas_pos_circulos)
  - [json_originales/](json_originales)
  - [zz_old/](zz_old)
  - [fotos_articulos/](fotos_articulos)
  - [fotos_motores/](fotos_motores)

### 3.2 Mapa archivo-responsabilidad-uso-estado

| Archivo | Responsabilidad actual | Quien lo usa | Estado |
|---|---|---|---|
| [qa_milu.html](qa_milu.html) | Shell principal QA, tabla, filtros, panel derecho, modales | Usuarios QA + js principal | Activo |
| [js/qa-milu.js](js/qa-milu.js) | Orquestacion principal UI, eventos, guardado, modales, export preview | qa_milu.html | Activo, sobredimensionado |
| [js/qa-table.js](js/qa-table.js) | Render tabla, filtros, stats, paginacion, seleccion | qa-milu.js | Activo |
| [js/revision.js](js/revision.js) | Normalizacion estado/accion, guardado revision, PN copy targets | qa-milu.js, qa-table.js, analista | Activo con legado coexistente |
| [js/data-loader.js](js/data-loader.js) | Carga engine files, health/save backend, carga incremental | qa-milu.js, topbar.js | Activo |
| [js/state.js](js/state.js) | Estado global compartido | casi todos los modulos JS | Activo (global mutable) |
| [js/revision-sync.js](js/revision-sync.js) | Sync localStorage entre pestañas | qa-milu.js | Activo, pequeno |
| [js/cell-editor.js](js/cell-editor.js) | Edicion inline y persistencia | qa-milu.js | Activo parcial |
| [js/bulk-revision-helper.js](js/bulk-revision-helper.js) | Helper bulk por PN y API global window | no referenciado por entrada principal | Dudoso/legacy |
| [js/pn-review.js](js/pn-review.js) | UI PN review principal | pn_review.html | Activo |
| [js/pn-review-embedded.js](js/pn-review-embedded.js) | PN review embebido para analista | analista_02 | Activo |
| [js/pn_review.js](js/pn_review.js) | Implementacion antigua PN review | no referenciado en flujo principal actual | Legacy/duplicado |
| [js/export-wordpress.js](js/export-wordpress.js) | UI export WordPress desde frontend | export_wordpress.html | Activo |
| [js/topbar.js](js/topbar.js) | Topbar y estado backend | paginas principales | Activo |
| [js/schemas.js](js/schemas.js) | Resolucion de imagenes/esquemas y panel de posicion | qa-milu.js | Activo |
| [server.js](server.js) | Backend Express, endpoints QA, export, audit, PN review | Frontends + scripts | Activo, monolitico |
| [engine_files.js](engine_files.js) | Fuente oficial de 9 engine files | server/scripts | Activo |
| [apply_revision_to_engines.js](apply_revision_to_engines.js) | Aplicacion masiva de revisiones | endpoint /apply-revision-to-engines | Activo |
| [recompute_engine_errors.js](recompute_engine_errors.js) | Recalculo de errores y estado QA en JSON | endpoint /recompute-qa-errors y CLI | Activo |
| [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js) | Export QA-only New/Superseded/Pending/Discarded + trace | server y npm scripts | Activo |
| [scripts/qa_pdf_compare.js](scripts/qa_pdf_compare.js) | Lectura PDF y escritura campos _pdf | server y npm scripts | Activo |
| [scripts/prepare-pages-dist.js](scripts/prepare-pages-dist.js) | Build de dist para pages/publicacion | npm pages:* | Activo |
| [generate_synthetic_exports.js](generate_synthetic_exports.js) | Export synthetic legacy | npm script legacy:generate:synthetic | Legacy |

## 4. Flujo frontend

Flujo principal observado:

1. [qa_milu.html](qa_milu.html) carga [js/qa-milu.js](js/qa-milu.js).
2. [js/qa-milu.js](js/qa-milu.js) inicializa estado, listeners, paneles y carga datos via [js/data-loader.js](js/data-loader.js).
3. Se asignan claves de revision y se normaliza revision con [js/revision.js](js/revision.js).
4. Tabla se renderiza en [js/qa-table.js](js/qa-table.js).
5. Cambios de revision/celdas guardan por [js/data-loader.js](js/data-loader.js) hacia /save-json.
6. Seleccion de fila sincroniza PDF, esquema y formulario lateral.

Hallazgos frontend relevantes:

- [js/qa-milu.js](js/qa-milu.js) tiene demasiadas responsabilidades: carga, UI, persistencia, export preview, modales, shortcuts, undo/redo.
- Hay alta densidad de listeners y coordinacion por eventos del documento; riesgo de regresiones en cambios pequeños.
- [js/revision.js](js/revision.js) contiene mapeos legacy->nuevo con defaults agresivos (por ejemplo vacio a importar), lo que puede ocultar estados ambiguos.
- Existe helper duplicado/no integrado para bulk [js/bulk-revision-helper.js](js/bulk-revision-helper.js).
- Existe implementacion antigua [js/pn_review.js](js/pn_review.js) coexistiendo con [js/pn-review.js](js/pn-review.js).

## 5. Flujo backend

Flujo principal observado:

- Express en [server.js](server.js) con endpoints QA, export, audit, PN review y compatibilidad .php local.
- Persistencia directa en JSON de disco (engine files y revision sync/audit).
- Mecanismos de lock:
  - lock por archivo en /save-json.
  - lock global para ejecucion de export.

Endpoints clave activos:

- /health ([server.js](server.js#L1904))
- /save-json y /save-json.php ([server.js](server.js#L2031))
- /apply-revision-to-engines ([server.js](server.js#L730))
- /qa_revision_sync.php GET/POST ([server.js](server.js#L706))

Endpoints activos adicionales (alto acoplamiento):

- /recompute-qa-errors
- /recompute-pdf-auto
- /export/*
- /pn-review/*
- /audit-log
- /engines

Hallazgos backend relevantes:

- [server.js](server.js) concentra demasiada logica de negocio y orquestacion.
- Persistencia atomica desigual: algunas rutas usan rename temporal, otras write directo.
- Validaciones de enum QA limitadas en backend (se aceptan valores no canonicos en varios caminos).
- Backup antes de escribir no uniforme entre endpoints.
- Riesgo de drift semantico entre rutas PN review (por SKU, por ID, siblings bulk) y save directo de celdas.

## 6. Flujo de datos

### 6.1 Carga

- Fuente principal: 9 engine_*.json via [js/data-loader.js](js/data-loader.js).
- Catalogo incremental opcional via /engines.
- Normalizacion por fila (engine_model, revision values).

### 6.2 Guardado

- Cambios unitarios de celda/revision: /save-json -> escribe en engine file.
- Cambios masivos de revision: /apply-revision-to-engines.
- Sync revision externa: /qa_revision_sync.php -> [qa_revision_server_data.json](qa_revision_server_data.json).
- Auditoria de cambios: /audit-log -> [qa_audit_log.json](qa_audit_log.json).

### 6.3 Riesgos de integridad

- Concurrencia mitigada parcialmente (lock por archivo en save-json), no uniformemente en todo endpoint que escribe.
- Mapeos automaticos de revision en frontend pueden persistir valores sin confirmacion de semantica real del analista.
- Multiples rutas que alteran qa_revision_* y campos finales aumentan superficie de conflicto.

## 7. Flujo QA

Regla operacional detectada (estado canonico nuevo):

- Estado: pendiente | ok
- Accion: importar | copia | revisar | eliminar

Puntos observados:

- [js/revision.js](js/revision.js) normaliza desde variantes antiguas (revisado, mantener, descartar, etc).
- Tabla principal y panel lateral trabajan con valores canonicos nuevos.
- PN review en backend usa decision mapping validar/revisar/descartar -> ok/importar, pendiente/revisar, ok/eliminar.
- Export WordPress se decide por combinacion QA por PN agrupado.

Ambiguedades detectadas:

- Coexistencia de vocabulario historico y nuevo en varios modulos/scripts.
- Defaults de normalizacion pueden forzar importar o pendiente sin distinguir no decidido vs vacio legacy.
- La nueva accion copia esta integrada, pero el significado exacto en todos los exportadores no esta centralizado en un unico contrato formal.

## 8. Flujo export WordPress

Flujo actual:

1. [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js) agrupa por PN y evalua QA.
2. Genera JSON y CSV en data/05-wordpress.
3. [server.js](server.js) expone estado, preview, file, download, trace.
4. UI en [js/export-wordpress.js](js/export-wordpress.js) y panel export embebido en [js/qa-milu.js](js/qa-milu.js).

Reglas activas actuales (implementadas):

- Si hay ok/importar en PN: import (new o superseded segun campos sust).
- Si no hay import y hay pendiente/revisar: pending_review.
- Si no hay import ni pending/revisar y hay ok/eliminar: discard.

Riesgo:

- Hay dos experiencias UI de export (pagina dedicada y panel embebido), ambas con posibilidad de divergencia de comportamiento a futuro.

## 9. FASE 1 - Mapa general del proyecto (diagnostico)

### 9.1 Dependencias entre modulos

- [js/qa-milu.js](js/qa-milu.js) depende de casi todo: state, table, revision, loader, checks, column-view, cell-editor, pdf-viewer, schemas, change-control.
- [js/qa-table.js](js/qa-table.js) depende de state + helpers + revision + schemas.
- [js/revision.js](js/revision.js) depende de state + saveCellToServer.
- [server.js](server.js) depende de engine_files + recompute + qa_pdf_compare + apply_revision + export_wordpress_milu.

Conclusiones:

- Frontend con dependencia estrella en qa-milu.
- Backend con dependencia estrella en server.js.
- Oportunidad clara de modularizacion por dominios: revision, export, pn-review, auditoria, data loading.

## 10. FASE 2 - Revision frontend (hallazgos)

### 10.1 Variables globales y estado duplicado

- Estado global unico en [js/state.js](js/state.js), pero con mezcla de dominios en una sola estructura (tabla, pdf, export, audit, revision, QA checks).
- Riesgo: acoplamiento y efectos colaterales cuando cambia un modulo.

### 10.2 Funciones repetidas o mezclas UI-negocio

- Reglas de negocio (mapeo revision/export) mezcladas en UI principal [js/qa-milu.js](js/qa-milu.js).
- Llamadas de persistencia y transformaciones de negocio dentro de handlers de eventos UI.

### 10.3 Codigo muerto/no usado o dudoso

- [js/bulk-revision-helper.js](js/bulk-revision-helper.js): sin evidencia de integracion en entrada principal actual.
- [js/pn_review.js](js/pn_review.js): implementacion antigua coexistente con [js/pn-review.js](js/pn-review.js).

### 10.4 Eventos duplicados/re-render

- Alto numero de listeners en [js/qa-milu.js](js/qa-milu.js), incluidos bindings sobre tbody y errorViewTbody para flujos paralelos.
- Render principal de tabla sigue siendo de bloque completo en muchos escenarios; existe refresh puntual por fila, pero no es la ruta dominante.

### 10.5 Inconsistencias de nombres

Verificadas:

- coexistencia historica de terminos revision y qa_revision.
- coexistencia de variantes Import/Importar y mapping mantener -> importar.
- coexistencia de Supersede/Superseded en naming de campos/reglas legacy.
- coexistencia de descartar/eliminar en algunos flujos historicos.

Estado actual recomendado: mantener solo contrato canonico qa_revision_estado + qa_revision_accion en interfaces y persistencia.

### 10.6 Riesgos con allData y filteredData

- allData es mutable y compartido; filteredData se recalcula con frecuencia.
- Riesgo de inconsistencia si un modulo asume inmutabilidad o orden estable.
- Sugerencia: capa de selectors puros y comando de mutacion centralizado.

## 11. FASE 3 - Revision backend (hallazgos)

### 11.1 Endpoints grandes o duplicados

- [server.js](server.js) contiene demasiados dominios en un solo archivo.
- Rutas legacy coexistentes en 410 y rutas activas de mismo dominio (ejemplo export y pn).

### 11.2 Validaciones y errores

- Validacion de payload correcta en presencia/estructura basica, pero insuficiente para enums QA y constraints de negocio.
- Manejo de errores heterogeneo: algunos devuelven detalle rico, otros mensaje generico.

### 11.3 Escritura concurrente y backups

- /save-json usa lock por archivo, positivo.
- Otras rutas con escritura en lote no siempre usan mismo lock local por archivo.
- Backups presentes en scripts CLI/recompute, no homogeneos en todos endpoints.

### 11.4 Riesgos por endpoint critico

- /save-json: riesgo medio por validacion limitada de campo/valor y write directo.
- /qa_revision_sync.php: riesgo medio por aceptar payload flexible y normalizacion amplia.
- /apply-revision-to-engines: riesgo alto por alcance masivo inter-archivo y matching por varias claves legacy.

## 12. FASE 4 - Revision modelo de datos

Inventario detectado: 120 campos en 67,883 filas (9 engine files).

### 12.1 Tabla de campos clave (operacionales)

| Campo | Uso actual | Fuente | Editable | Calculado | Necesario export | Recomendacion |
|---|---|---|---|---|---|---|
| ID | identificador fila | origen engine | no | no | si | mantener |
| engine_model | libro/motor para UI y trazabilidad | carga runtime | no | semi | si | mantener |
| Source Page | localizacion PDF | origen | no | no | si | mantener |
| POS / pos_final | posicion original/final | PDF + normalizacion | si (final) | si (final) | si | mantener y separar claramente raw/final |
| PART NO. / pn_raw / pn_final | PN original, raw y final | PDF/GESA/depuracion | si (final) | si | si | mantener y documentar prioridad |
| DESIGNATION / designation_gesa / designation_final | descripcion origen y final | PDF/GESA/depuracion | si (final) | si | si | mantener |
| WEIGHT / weight_gesa / weight_final | peso origen y final | PDF/GESA/depuracion | si (final) | si | si | mantener |
| MEASUREMENT / STANDARD / dimensions_gesa / measure_final | medida origen y final | PDF/GESA/depuracion | si (final) | si | si | mantener |
| norma / norma_final | norma tecnica | origen + depuracion | si (final) | si | si | mantener |
| sust_status / sust_hierarchie / sust_new_part_number / sust_superseded_list | sustitucion/superseded | origen + depuracion | si | semi | si | mantener y normalizar enums |
| qa_revision_estado | estado QA | humano/frontend/backend | si | no | si | mantener canonico |
| qa_revision_accion | accion QA | humano/frontend/backend | si | no | si | mantener canonico |
| qa_revision_updated_at | trazabilidad minima | runtime | no | si | no | mantener |
| pos_error,pn_error,...,total_error,has_error | checks QA | recompute/depuracion | no | si | no (directo) | mantener como calculado |
| *_pdf (pn_pdf, designation_pdf, etc.) | snapshot comparacion PDF | qa_pdf_compare | no | si | no | mantener como tecnico |
| detalle_cambio, depuracion_ts | trazabilidad de proceso | depuracion | no | si | no | mantener |
| exp_imagenes, ruta_foto, filename_foto | media export | origen/normalizacion | si | semi | si | mantener |
| campos SAP/legacy (Date, Cause, MTU, Seq no, Product Hierarchy, etc.) | historico y trazabilidad | import origen | no | no | parcial | revisar y acotar |

### 12.2 Campos duplicados o equivalentes (ejemplos)

- measurement_final y measure_final (coexistencia historica).
- MODEL/TYPE_final y model_final.
- UNITS y units + qty_units_final.
- PART NO. y pn_raw y pn_final.

### 12.3 Campos candidatos a normalizacion fuerte

- qa_revision_* (enum cerrado).
- sust_hierarchie / sust_status (diccionario controlado).
- medida/peso con formato unico (espacios, unidades).

### 12.4 Campos potencialmente legacy o de bajo valor operativo

- DD/DTNA (vacío), fn_final casi vacío, sust_status_pdf casi vacío, fg_fgs_pdf muy bajo uso.
- columnas de import antiguo en ingles/lotes historicos (Cause, Denomination(...), Replacement Type, Valid From Date, etc.) deben pasar a bloque de metadatos legacy o excluirse del runtime principal.

## 13. FASE 5 - Revision de logica QA

### 13.1 Reglas detectadas

- Error por campo y total_error calculados por [recompute_engine_errors.js](recompute_engine_errors.js) y tambien en depuracion.
- Decision de export por PN se basa en combinacion de qa_revision_estado/accion en [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js).
- Accion Copia ya considerada en UI/PN review y conteo QA, pero requiere consolidacion de semantica final para export y reporting.

### 13.2 Divergencias potenciales frontend-backend

- Frontend aplica normalizaciones agresivas y defaults; backend no siempre valida enum canonico antes de persistir.
- Multiples rutas para aplicar decision PN (sku, id, siblings bulk) pueden divergir en corner cases.

### 13.3 Reglas ambiguas o duplicadas

- No sobrescribir decisiones manuales: existe parcialmente en recompute, no como contrato transversal formal.
- Part Number global y hermanos por PN: existe logica en frontend y backend, pero no en un unico servicio comun.

## 14. FASE 6 - Codigo obsoleto / legacy detectado

| Archivo | Fragmento o funcion | Motivo | Riesgo al eliminar | Recomendacion |
|---|---|---|---|---|
| [js/bulk-revision-helper.js](js/bulk-revision-helper.js) | objeto global window.qaRevisionBulk | no integrado en flujo principal actual | medio (uso manual por consola) | marcar como experimental y deprecable |
| [js/pn_review.js](js/pn_review.js) | implementacion PN review antigua | coexistencia con [js/pn-review.js](js/pn-review.js) | medio | congelar y retirar tras verificacion de no uso |
| [generate_synthetic_exports.js](generate_synthetic_exports.js) | pipeline synthetic antiguo | package.json lo etiqueta como legacy | bajo/medio | mover a carpeta legacy con README |
| [server.js](server.js) | endpoints legacy 410 y aliases antiguos | conviven con flujo actual | bajo | mantener transitorio pero documentar fin de vida |
| [dist/milu_publish/js/*](dist/milu_publish/js/qa-milu.js) | copias build de codigo fuente | salida de build, no fuente editable | alto si se toca manualmente | excluir de mantenimiento funcional directo |

## 15. Problemas encontrados

Prioridad alta:

- Monolitos: [js/qa-milu.js](js/qa-milu.js) y [server.js](server.js).
- Contrato QA distribuido y parcialmente implcito entre frontend/backend/export.
- Coexistencia de naming y semantics legacy en revision y sustituciones.

Prioridad media:

- Render y eventos de tabla con coste creciente.
- Falta de validacion estricta de enum QA en backend.
- Persistencia JSON con estrategia de lock/backups no uniforme en todas rutas.

Prioridad baja:

- Archivos duplicados/historicos aun presentes en runtime tree.
- Documentacion no siempre sincronizada con cambios recientes.

## 16. Riesgos tecnicos

- Riesgo funcional: decisiones QA inconsistentes en export final.
- Riesgo operativo: corrupcion parcial por escrituras simultaneas fuera de lock unificado.
- Riesgo mantenimiento: cambios pequeños en qa-milu/server con impacto transversal no evidente.
- Riesgo rendimiento: tablas grandes y re-render amplio en equipos lentos.

## 17. Mejoras recomendadas

- Contrato unico de revision QA (enum, transiciones validas, mapping legacy centralizado).
- Servicio backend por dominio: revision, export, pn-review, audit, engines.
- Selector layer en frontend para desacoplar estado global mutable.
- Plan de deprecacion formal para scripts y modulos legacy identificados.

## 18. FASE 7 - Plan de trabajo por fases

### FASE A - Seguridad y diagnostico

| Tarea | Prioridad | Riesgo | Archivos | Beneficio | Orden |
|---|---|---|---|---|---|
| Validacion estricta de payload y enums QA en backend | alta | bajo | [server.js](server.js) | evita estados invalidos | 1 |
| Unificar lock + escritura atomica en endpoints que modifican engine_* | alta | medio | [server.js](server.js), [apply_revision_to_engines.js](apply_revision_to_engines.js) | integridad de datos | 2 |
| Politica de backup uniforme antes de cambios masivos | alta | bajo | backend/scripts | rollback seguro | 3 |
| Logs estructurados por endpoint y cambio | media | bajo | [server.js](server.js) | trazabilidad | 4 |
| Set minimo de pruebas manuales por endpoint clave | alta | bajo | docs + runtime | deteccion temprana | 5 |

### FASE B - Limpieza sin riesgo

| Tarea | Prioridad | Riesgo | Archivos | Beneficio | Orden |
|---|---|---|---|---|---|
| Inventario final de modulos no usados y marcado deprecated | media | bajo | [js/bulk-revision-helper.js](js/bulk-revision-helper.js), [js/pn_review.js](js/pn_review.js) | reduce ruido | 1 |
| Normalizar naming visible en UI y docs (estado/accion) | media | bajo | html/js/docs | menos ambiguedad | 2 |
| Documentar contrato QA y contrato export | alta | bajo | [docs/](docs) | alineacion equipo | 3 |

### FASE C - Refactor moderado

| Tarea | Prioridad | Riesgo | Archivos | Beneficio | Orden |
|---|---|---|---|---|---|
| Extraer servicios backend por dominio desde server.js | alta | medio | [server.js](server.js) + nuevos modulos | mantenibilidad | 1 |
| Extraer capa de dominio en frontend (revision/export/pn) | alta | medio | [js/qa-milu.js](js/qa-milu.js) | menor acoplamiento | 2 |
| Centralizar normalizacion PN y QA en util comun | alta | medio | js + server + scripts | coherencia transversal | 3 |

### FASE D - Mejoras funcionales

| Tarea | Prioridad | Riesgo | Archivos | Beneficio | Orden |
|---|---|---|---|---|---|
| Consolidar accion Copia por PN global con regla formal no destructiva | alta | medio | revision/pn-review/backend | consistencia QA | 1 |
| Panel visual de cambios antes de export | media | medio | qa-milu/export | menos errores humanos | 2 |
| Validacion previa a export (hard checks) | alta | medio | export scripts/backend | calidad salida | 3 |

### FASE E - Mejoras estructurales

| Tarea | Prioridad | Riesgo | Archivos | Beneficio | Orden |
|---|---|---|---|---|---|
| Evaluar migracion de persistencia a SQLite (fase futura) | media | alto | backend + scripts | concurrencia y consultas | 1 |
| Suite automatica minima (API + reglas QA) | alta | medio | repo | regresiones controladas | 2 |
| Separar datos runtime y output de forma estricta | media | bajo | estructura repo | higiene operativa | 3 |

## 19. Checklist de validacion

Checklist minimo previo a aprobar refactor:

- GET /health responde OK.
- GET y POST /qa_revision_sync.php funcionan en local.
- POST /save-json valida enum y persiste correctamente.
- POST /apply-revision-to-engines aplica solo cambios esperados y registra resumen.
- Export WordPress genera new/superseded/pending/discarded con conteos consistentes.
- PN review por SKU e ID mantienen coherencia con tabla principal.
- No se rompe navegacion QA (tabla, seleccion, modal, panel lateral, PDF).

## 20. Preguntas abiertas para decidir contigo

1. Quieres que el contrato QA canonico sea estricto y rechace cualquier valor fuera de pendiente/ok + importar/copia/revisar/eliminar en backend?
2. Priorizamos primero modularizar server.js o qa-milu.js?
3. Mantenemos temporalmente [js/pn_review.js](js/pn_review.js) y [js/bulk-revision-helper.js](js/bulk-revision-helper.js) como compatibilidad o los marcamos para retiro inmediato tras validacion?
4. La accion Copia debe bloquear export directo o solo actuar como marcador de agrupacion?
5. Quieres que en la siguiente fase preparemos una prueba de concepto de capa de servicio backend (sin cambiar comportamiento) para que apruebes estructura antes del refactor real?

---

## Anexo A - Cobertura del modelo de datos (inventario completo)

Se auditaron 120 campos distintos sobre 67,883 filas de los 9 engine_*.json.

Clasificacion global:

- Campos nucleares runtime QA/export: ID, Source Page, POS/pos_final, PART NO./pn_*, designation_*, weight_*, measure_*, norma_*, sust_*, qa_revision_*, total_error/has_error.
- Campos tecnicos de comparacion PDF: *_pdf.
- Campos historicos/legacy de import de origen: Date, Cause, Denomination..., Product Hierarchy, Replacement Type, Valid From Date, etc.

Recomendacion de gestion:

- Mantener: nucleares y tecnicos activos.
- Revisar/normalizar: duplicados semanticos (measure_final/measurement_final, model_final/MODEL/TYPE_final, etc).
- Candidatos a aislamiento legacy: campos historicos de bajo uso operativo en UI/export.


