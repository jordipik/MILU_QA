# Field Registry Completion Plan

Fecha: 2026-05-16

## A. Resumen ejecutivo

1. Lo ya implementado.
- Registry maestro disponible y operativo para aliases semanticos nuevo/legacy.
- Migracion no destructiva legacy -> normalized con preservacion opcional de _legacy.
- Integracion read-only de fieldAdapter en tabla compacta, PN Review, analisis qa_articulos y Export Preview.
- Auditoria de accesos legacy disponible con clasificacion de riesgo LOW/MEDIUM/HIGH/IGNORE.

2. Lo ya validado.
- 9/9 engines en comparador funcional OK.
- Suites npm run test:field-registry, npm run compare:normalized, npm run audit:field-adapter y npm test en verde.
- Regla de jerarquia New/Superseded reafirmada en capa de preview read-only.

3. Lo que sigue en legacy.
- Escritura backend y roundtrips de persistencia.
- Exportadores reales WordPress.
- Synthetic generation.
- SQLite mirror y analytics.

4. Riesgos activos.
- Divergencia semantica al migrar escritura.
- Impacto en exportabilidad real (New/Superseded) si se mezcla status legacy con jerarquia.
- Dependencia de campos legacy aun presentes en backend/synthetic/export.
- JSON clave ignorados por .gitignore (trazabilidad parcial en git).

## B. Mapa de fases pendientes

### FASE 1 — Cierre Read Compatibility

1. Objetivo.
- Cerrar lecturas LOW/MEDIUM pendientes en UI y utilidades de lectura sin tocar escritura.

2. Alcance.
- Reducir accesos directos visuales legacy donde no haya dependencia funcional de backend.
- Consolidar helpers adapter-first en modulos UI restantes de prioridad media.

3. Resultado esperado.
- Disminucion de MEDIUM y LOW en auditoria.
- Suite completa en verde sin cambios de comportamiento en persistencia/export real.

### FASE 2 — Export/Synthetic Semantic Audit

1. Objetivo.
- Auditar semantica real de exportadores/synthetic sin cambiar outputs finales.

2. Alcance.
- Revisar scripts de export y synthetic para mapear dependencias legacy criticas.
- Verificar New/Superseded contra reglas semanticas oficiales.
- Levantar matriz de equivalencia legacy vs semantico por campo clave.

3. Resultado esperado.
- Informe de gap semantico por modulo.
- Lista de cambios de bajo riesgo para fase de migracion real.

### FASE 3 — Exportadores reales

1. Objetivo.
- Migrar lectura interna de exportadores reales a helper semantico manteniendo outputs estables.

2. Alcance.
- Introducir helper adapter-first en rutas de export real.
- Ejecutar snapshots before/after y comparaciones de outputs.
- Aceptar solo diferencias esperadas documentadas.

3. Resultado esperado.
- Outputs equivalentes en PN, designation, QA, rutas e imagenes, salvo excepciones autorizadas.

### FASE 4 — Escritura compatible

1. Objetivo.
- Definir y aplicar write-compat seguro sin migracion masiva de golpe.

2. Alcance.
- Diseñar writeAdapter/setField para estrategia de escritura (legacy, normalized o dual-write).
- Proteger invariantes qa_revision_*.
- Probar endpoint acotado primero con pruebas de roundtrip.

3. Resultado esperado.
- Escritura compatible validada en superficie minima, con rollback simple.

### FASE 5 — SQLite / Analytics

1. Objetivo.
- Alinear mirror y analytics con nombres semanticos preservando dashboards actuales.

2. Alcance.
- Decidir fuente de mirror (legacy o normalized) con criterio reproducible.
- Adaptar consultas y vistas analiticas gradualmente.
- Comparar metricas before/after por vista critica.

3. Resultado esperado.
- Paridad funcional de metricas principales y contratos de endpoints analytics.

### FASE 6 — Limpieza legacy controlada

1. Objetivo.
- Definir y aplicar politica de deprecacion de campos legacy.

2. Alcance.
- Clasificar campos a eliminar, mover a _legacy o mantener por auditoria.
- Actualizar schema y documentacion de contrato final.

3. Resultado esperado.
- Superficie legacy minimizada con trazabilidad de decisiones.

### FASE 7 — Corte final

1. Objetivo.
- Declarar formato oficial final y cerrar la transicion.

2. Alcance.
- Elegir formato canonico para engine_*.json.
- Regenerar exports y artefactos oficiales.
- Ejecutar suite completa + plan de rollback.

3. Resultado esperado.
- Refactorizacion cerrada con baseline reproducible y documentacion final.

## C. Riesgos principales

1. Escritura.
- Riesgo de desalinear estado guardado entre legacy y semantico.

2. Export WordPress.
- Riesgo de cambio silencioso en clasificacion o en campos esperados por consumidores externos.

3. Synthetic.
- Riesgo de contaminar reglas de negocio con campos legacy ambiguos.

4. status legacy.
- No debe considerarse source of truth de jerarquia ni exportabilidad.

5. sust_hierarchie vs status.
- Jerarquia debe gobernarse por hierarchie_final/sust_hierarchie, no por status.

6. exp_imagenes vs ruta_esquemas_pos.
- Riesgo de rutas inconsistentes si no se consolida prioridad semantica.

7. JSON ignorados por .gitignore.
- Riesgo de perder trazabilidad de artefactos JSON clave en PR/commit.

8. MODULE_TYPELESS_PACKAGE_JSON.
- Warning no bloqueante actual; riesgo de deuda tecnica si crece superficie ESM-test.

9. Cambios no relacionados en repositorio.
- Riesgo de mezclar entregas si no se mantiene staging selectivo por bloque.

## D. Reglas oficiales de datos MILU

1. Definiciones de familias de campos.
- *_excel: fuente original.
- *_pdf: extraccion PDF/OCR.
- *_gesa: enriquecimiento GESA.
- *_subst: enriquecimiento sustituciones.
- *_final: valor consolidado.
- *_error: validacion de consistencia.
- qa_revision_*: decision QA.

2. Reglas semanticas obligatorias.
- status legacy no es source of truth.
- hierarchie_final/sust_hierarchie gobierna Superseded.
- qa_revision_estado=ok y qa_revision_accion=importar gobierna exportabilidad.

## E. Criterios de aceptacion por fase

### FASE 1

1. Se puede tocar.
- Modulos UI read-only y helpers de lectura.

2. No se puede tocar.
- Endpoints de escritura, exportadores reales, synthetic, analytics, SQLite mirror.

3. Tests obligatorios.
- npm run test:field-registry
- npm run compare:normalized
- npm run audit:field-adapter
- npm test

4. Artefactos.
- Informe de auditoria actualizado.

5. OK.
- Reduccion medible de LOW/MEDIUM y 0 regresiones en suites.

6. Rollback.
- Revert por commit de modulos UI/helpers sin impacto en persistencia.

### FASE 2

1. Se puede tocar.
- Documentacion tecnica y scripts de auditoria/comparacion de export/synthetic.

2. No se puede tocar.
- Outputs reales productivos ni endpoints de escritura.

3. Tests obligatorios.
- Baseline de fase 1 + chequeos de consistencia de auditoria.

4. Artefactos.
- Matriz legacy vs semantico para export/synthetic.

5. OK.
- Riesgos mapeados y reglas de equivalencia aprobadas.

6. Rollback.
- Revert de scripts de auditoria sin impacto runtime.

### FASE 3

1. Se puede tocar.
- Exportadores reales en capa de lectura interna.

2. No se puede tocar.
- Escritura backend y analytics/sqlite.

3. Tests obligatorios.
- Baseline de fase 1 + comparacion before/after de exports.

4. Artefactos.
- Snapshots de export y diff semantico.

5. OK.
- Paridad de output salvo diferencias esperadas documentadas.

6. Rollback.
- Feature revert de helper semantico en export.

### FASE 4

1. Se puede tocar.
- Endpoint acotado de escritura y writeAdapter.

2. No se puede tocar.
- Migracion masiva de todos los endpoints de golpe.

3. Tests obligatorios.
- Baseline de fase 1 + write roundtrip suite.

4. Artefactos.
- Reporte de roundtrip legacy/semantico.

5. OK.
- Escritura consistente en endpoint piloto con invariantes QA preservadas.

6. Rollback.
- Desactivar endpoint piloto y volver a ruta legacy.

### FASE 5

1. Se puede tocar.
- Scripts de mirror y endpoints analytics.

2. No se puede tocar.
- Contratos publicos sin versionar ni comunicar.

3. Tests obligatorios.
- npm run test:db-read
- npm run test:db-analytics
- npm test

4. Artefactos.
- Comparativa de metricas before/after.

5. OK.
- Dashboards y endpoints con metricas equivalentes.

6. Rollback.
- Volver a fuente de mirror anterior.

### FASE 6

1. Se puede tocar.
- Schema, politica de campos y pipeline de depuracion.

2. No se puede tocar.
- Eliminaciones sin politica de deprecacion aprobada.

3. Tests obligatorios.
- Baseline completa + validacion de schema.

4. Artefactos.
- Politica de deprecacion y changelog de campos.

5. OK.
- Legacy reducido con trazabilidad total de decisiones.

6. Rollback.
- Restaurar snapshot de schema/campos previos.

### FASE 7

1. Se puede tocar.
- Documentacion final, pipelines oficiales y scripts de release.

2. No se puede tocar.
- Cortes sin rollback definido y probado.

3. Tests obligatorios.
- Suite completa proyecto + comparativas de export/mirror.

4. Artefactos.
- Baseline final de release y plan de rollback firmado.

5. OK.
- Formato final oficial publicado y reproducible.

6. Rollback.
- Vuelta al baseline de pre-corte.

## F. Comandos de validacion estandar

1. Comandos obligatorios actuales.
- npm run test:field-registry
- npm run compare:normalized
- npm run audit:field-adapter
- npm test

2. Comandos propuestos para fases siguientes.
- npm run compare:export
- npm run snapshot:export
- npm run test:write-compat

3. Nota.
- Los comandos propuestos son objetivos de pipeline; no se implementan en esta fase de planificacion.

## G. Orden recomendado de ejecucion

1. Documentar plan.
2. Cerrar LOW/MEDIUM restantes.
3. Auditar export/synthetic.
4. Simular export semantico.
5. Adaptar export real con snapshot.
6. Disenar escritura compatible.
7. Adaptar endpoint acotado.
8. Adaptar SQLite/analytics.
9. Limpieza legacy.
10. Corte final.

## H. Decision sobre JSON versionados

1. Estado actual.
- JSON de control clave (field_registry y summaries) estan ignorados por .gitignore de *.json.

2. Recomendacion principal.
- Mantener JSON de salida como artefactos generados fuera de git principal.
- Versionar reportes markdown derivados para trazabilidad humana.

3. Alternativa controlada.
- Si se requiere versionado JSON, usar commit separado con git add -f solo para rutas explicitas y con politica de retencion.

4. Recomendacion por tipo.
- field_registry.json: versionarlo de forma explicita en commit de contrato, preferiblemente levantando excepcion especifica en .gitignore.
- normalized/*.normalized.json: tratarlos como generados salvo decision formal contraria.
- compare summaries JSON: mover su consumo documental a docs/artifacts o mantenerlos fuera de git y versionar solo MD.

## I. Plan de commits sugerido

1. docs plan.
2. read compatibility cleanup.
3. export audit.
4. export semantic helper.
5. export real migration.
6. write compatibility.
7. analytics/sqlite.
8. legacy cleanup.

## Anexo — Alcance actual confirmado

1. Integrado read-only.
- tabla compacta MILU QA.
- PN Review.
- qa_articulos/analisis.
- Export Preview.

2. No migrado todavia.
- Escritura completa.
- Exportadores reales productivos.
- Synthetic productivo.
- SQLite/analytics completos.
