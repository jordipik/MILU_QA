# PLAN DE ACCION MILU - EJECUCION DETALLADA

## 0. Preparacion previa (antes de cualquier cambio)
1. **Crear rama de desarrollo**: `git checkout -b refactor/milu-stability-p0`
2. **Backup de datos vivos**: 
   - Copiar los 9 engine_*.json a carpeta backup: `backup/engine_*.json.$(date).backup`
   - Copiar qa_revision_server_data.json
   - Copiar qa_audit_log.json
3. **Documentar estado baseline**:
   - Ejecutar smoke tests manuales de endpoints criticos (endpoint /health).
   - Registrar respuesta de tiempo actual para carga de 67k filas en UI.
4. **Establecer equipo y comunicacion**: 
   - Designar quien ejecuta cada fase.
   - Definir ventana de cambios sin usuarios activos.

---

## FASE P0: Establecimiento de linea base y documentacion operativa
**Duracion estimada**: 1-2 semanas  
**Riesgo**: Bajo (sin cambios de codigo)  
**Criterio de exito**: Operativas documentadas y testeadas manualmente

### Tarea P0.1: Checklist operativa diaria QA/export
**Entregable**: docs/CHECKLIST_OPERATIVA_DIARIA.md

Contenido:
- Check pre-laboral de /health.
- Flujo QA minimo (cargar 1 engine, editar 1 registro, guardar, verificar persistencia).
- Flujo export minimo (run wordpress, verificar salidas).
- Check post-export de consistencia de revisiones en un engine aleatorio.

**Tareas concretas**:
```
1. Crear checklist.md en docs/
2. Agregar capturas de pantalla de UI esperada
3. Documentar tiempos esperados por cada paso
4. Validar checklist con ejecucion manual 3 veces exitosas
```

### Tarea P0.2: Matriz de endpoints criticos
**Entregable**: docs/MATRIZ_ENDPOINTS_CRITICOS.md

Contenido por endpoint:
- GET /health
- GET/POST /qa_revision_sync.php
- POST /save-json
- POST /apply-revision-to-engines
- POST /recompute-qa-errors (opcional)
- POST /export/run-wordpress
- GET /export/status

Para cada uno:
- Url exacta y metodo.
- Payload entrada esperado (schema).
- Salida esperada (success/error).
- Tiempo SLA esperado.
- Que pasa si falla.

**Tareas concretas**:
```
1. Extraer informacion de server.js comentando cada ruta en orden.
2. Crear ejemplos de payloads reales desde qa_milu.html y scripts.
3. Documentar contratos de respuesta exitosa vs error.
4. Hacer curl manual de cada uno y registrar salidas reales.
```

### Tarea P0.3: Tabla de scripts oficiales vs legacy
**Entregable**: docs/TABLA_SCRIPTS_OFICIALES.md

Contenido:
- Columnas: archivo | estatus (oficial/revisar/obsoleto) | entrada | salida | cuando usar | riesgos

Scripts a clasificar (120+ identificados en MILU_INVENTARIO_SCRIPTS.md):
- Oficiales = ejecutados en QA/export operativo diario.
- Revisar = funcionales pero con solapamiento/alcance ambiguo.
- Obsoleto = legacy congelado sin mantenimiento.

**Tareas concretas**:
```
1. Crear tabla con criterios claros.
2. Auditar MILU_INVENTARIO_SCRIPTS.md e insertar en tabla.
3. Validar con ejecucion de flujo operativo minimo.
4. Agregar advectencia clara en cada script legacy.
```

### Tarea P0.4: Verificacion de contratos de revision y campos core
**Entregable**: docs/CONTRATO_REVISION_FORMAL.md + docs/CONTRATO_CAMPOS_CORE.md

Contenido revision:
```
qa_revision_estado: enum {pendiente, ok}
qa_revision_accion: enum {importar, copia, revisar, eliminar}
qa_revision_updated_at: ISO8601 timestamp
```

Contenido campos core (que nunca cambian):
```
ID, engine_model, Source Page, POS, PART NO., pn_final
DESIGNATION, designation_final, measure_final, weight_final
qa_revision_estado, qa_revision_accion
total_error, has_error
```

**Tareas concretas**:
```
1. Extraer valores canonicos de js/revision.js.
2. Confirmar distribucion real en 9 engines (ya auditada).
3. Documentar formato esperado para cada campo.
4. Agregar validacion de schema en pre-export (sin romper).
```

### Tarea P0.5: Baseline de metricas operativas
**Entregable**: docs/METRICAS_BASELINE.md

Metricas a registrar:
- Tiempo de carga inicial de qa_milu en navegador (vacio + 67k filas).
- Tiempo de filtro masivo (estado=ok + accion=importar).
- Tiempo de guardado puntual /save-json en JSON.
- Tiempo de ejecucion export/run-wordpress completo.
- Tasa de exito de /qa_revision_sync.php (100%?).
- Numero de cambios pendientes sin persistencia (0?).

**Tareas concretas**:
```
1. Ejecutar 5 veces cada operacion y registrar tiempos.
2. Documentar hardware/navegador/condiciones.
3. Establecer SLA objetivo para cada metrica.
4. Crear script de benchmark automatico para futuras comparativas.
```

---

## FASE P1: Modularizacion backend y separacion de dominios
**Duracion estimada**: 2-4 semanas  
**Riesgo**: Medio (cambios backend pero sin cambios de rutas publicas)  
**Criterio de exito**: Operacion sin regresion, tests smoke automatizados pasan

### Tarea P1.1: Extraer capa de IO JSON reutilizable
**Entregable**: server/services/json-store.js

Objetivo: Centralizar lectura/escritura/validacion/lock de engine files.

**Contenido**:
```javascript
// server/services/json-store.js
- JsonStore clase
  - constructor(engineFile)
  - async load() - carga desde disco
  - async save(data) - escritura con lock
  - async updateById(id, field, value) - puntual
  - validate(data) - validacion basica
  - async transaction(callback) - operacion atomica
```

**Tareas concretas**:
```
1. Crear archivo server/services/json-store.js.
2. Implementar metodos basicos sin cambiar logica de server.js.
3. Crear tests manuales: carga, guardado, lock concurrencia.
4. Reemplazar logicas de guardado en /save-json para usar json-store.
5. Validar sin regresion en flujo qa_milu + export.
```

**Riesgos mitigados**:
- Usa transacciones para evitar corrupcion por concurrencia.
- Mantiene compatibilidad con payloads actuales.
- Capa reversible si hay problemas.

### Tarea P1.2: Extraer servicio de reglas de revision
**Entregable**: server/services/revision-rules.js + versión frontend js/domain/revision-rules.js

Objetivo: Centralizar logica de estado/accion para reutilizar backend/frontend/export.

**Contenido**:
```javascript
// server/services/revision-rules.js + js/domain/revision-rules.js
- normalizeEstado(value) -> 'pendiente' | 'ok'
- normalizeAccion(value) -> 'importar' | 'copia' | 'revisar' | 'eliminar'
- isValidRevision(estado, accion) -> boolean
- getDefaultAction(estado) -> string
- comparePairRevision(r1, r2) -> boolean (iguales?)
- isLegacyRevision(estado, accion) -> boolean
```

**Tareas concretas**:
```
1. Extraer logica actual de js/revision.js a modulo compartido.
2. Implementar en Node y en ESM.
3. Usar en /save-json, /apply-revision-to-engines, /qa_revision_sync.php.
4. Usar en scripts/export_wordpress_milu.js.
5. Tests: normalizar valores legacy, validar enums, comparar pares.
6. Sin cambios en UI hasta que se estabilize.
```

**Riesgos mitigados**:
- Centraliza fuente de verdad de revision.
- Evita divergencia UI/backend.
- Facilita cambios futuros de enum.

### Tarea P1.3: Extraer servicio de reglas de PN
**Entregable**: server/services/pn-rules.js + js/domain/pn-rules.js

Objetivo: Centralizar normalizacion y comparacion de PN.

**Contenido**:
```javascript
// server/services/pn-rules.js + js/domain/pn-rules.js
- normalizePn(pnString) -> string (trim, collapse espacios, uppercase)
- comparePn(a, b) -> boolean (ignora espacios/mayusculas)
- getPnCanonical(row) -> pn_final | PART NO | null (prioridad)
- isPnValid(pn) -> boolean (longitud minima, caracteres validos)
- getPnSources(row) -> [pn_final, PART NO, pn_raw, ...]
- consolidatePnByEngine(engineData) -> Map<pn -> ids> (agregacion)
```

**Tareas concretas**:
```
1. Extraer logica de normalizacion de depuracion_json.py y js/analista-02.js.
2. Implementar en Node y ESM.
3. Usar en export_wordpress_milu.js para decision por PN.
4. Usar en pn-review endpoints.
5. Tests: normalizar variantes, comparar duplicados, detectar conflictos.
```

**Riesgos mitigados**:
- Unifica logica de PN distribuida.
- Facilita futuros cambios de normalizacion sin afectar UI directamente.

### Tarea P1.4: Separar routers por dominio sin cambiar rutas publicas
**Entregable**: server/routers/*.js (health, data, revision, export, pn-review, audit)

Objetivo: Modularizar server.js sin cambiar contratos HTTP.

**Estructura propuesta**:
```
server/
  routers/
    health.js        -> GET /health, /version
    data.js          -> GET /engines, /api/engine-*
    revision.js      -> POST /save-json, /qa_revision_sync.php, /apply-revision-to-engines
    export.js        -> POST /export/run-wordpress, GET /export/*
    pn-review.js     -> GET/POST /pn-review/*
    audit.js         -> GET/POST/DELETE /audit-log
```

**Tareas concretas**:
```
1. Crear carpeta server/routers.
2. Extraer cada dominio a su router, importando json-store y rules.
3. Mantener mismas rutas, metodos, payloads.
4. Reemplazar en server.js llamadas a app.get/post por app.use('/path', router).
5. Tests smoke de cada router sin cambios visibl en UI/export.
6. Validar tiempos de respuesta vs baseline.
```

**Riesgos mitigados**:
- Cambios pequeños e incrementales.
- Reversible si hay regresion.
- Facilita future testing y mantenimiento.

### Tarea P1.5: Agregar validaciones de schema en endpoints criticos
**Entregable**: server/middleware/validate-payload.js

Objetivo: Rechazar payloads invalidos antes de procesar.

**Contenido**:
```javascript
// server/middleware/validate-payload.js
- validateRevision(req, res, next) -> valida estado/accion en /save-json
- validateId(req, res, next) -> valida ID existe en engine
- validateField(req, res, next) -> valida field name contra whitelist
- validateExport(req, res, next) -> valida flags de export
```

**Tareas concretas**:
```
1. Crear middleware en server/middleware/validate-payload.js.
2. Usar en routers de revision y export.
3. Rechazar con 400 payloads invalidos.
4. Registrar en audit-log intento invalido.
5. Tests: enviar payloads malformados, verificar rechazo.
```

**Riesgos mitigados**:
- Previene corrupcion de datos por payload invalido.
- Detecta bugs de UI temprano.

---

## FASE P2: Esquema formal, tests automatizados y optimizacion
**Duracion estimada**: 1-2 meses  
**Riesgo**: Medio-Bajo (tests y observabilidad, sin cambios data)  
**Criterio de exito**: Suite de smoke tests automatizada, schema versionado publicado

### Tarea P2.1: Definir y validar schema JSON runtime v1
**Entregable**: schema/runtime-v1.json + schema/runtime-v1-strict.json

Objetivo: Documentar y validar formato actual con herramienta formal.

**Contenido schema**:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MILU Engine Runtime v1",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["ID", "engine_model", "PART NO.", "POS"],
    "properties": {
      "ID": { "type": "string" },
      "engine_model": { "type": "string", "enum": ["12V4000M40A", ...] },
      "PART NO.": { "type": ["string", "null"] },
      "pn_final": { "type": ["string", "null"] },
      "qa_revision_estado": { "type": "string", "enum": ["pendiente", "ok"] },
      "qa_revision_accion": { "type": "string", "enum": ["importar", "copia", "revisar", "eliminar"] },
      ...
    }
  }
}
```

**Tareas concretas**:
```
1. Crear schema/runtime-v1.json basado en MILU_MODELO_DATOS_JSON.md.
2. Validar 9 engines actuales contra schema estricto.
3. Documentar campos obligatorios vs opcionales.
4. Crear schema/runtime-v1-strict.json para pre-export (validacion completa).
5. Tests: cargar cada engine, validar contra schema, reportar excepciones.
```

**Riesgos mitigados**:
- Detecta corrupcion de datos pre-export.
- Facilita cambios de schema futuro (roadmap a v2).

### Tarea P2.2: Suite de smoke tests automatizados
**Entregable**: tests/smoke/*.test.js (ejecutable con npm test o equivalente)

Objetivo: Cobertura minima de endpoints y flujos criticos.

**Test cases**:
```
1. Salud
   - GET /health retorna {ok: true}
   - GET /version retorna version valida

2. Carga datos
   - GET /engines retorna array de 9 engines
   - Carga QA en navegador, 67k+ filas sin error

3. Guardado puntual
   - POST /save-json actualiza campo en engine file
   - Cambio persistido en disco
   - Campo actualizado es visible en GET /engines

4. Revision
   - POST /save-json con estado/accion validos
   - POST /qa_revision_sync.php persiste en qa_revision_server_data.json
   - Revision consultada es la esperada

5. Export
   - POST /export/run-wordpress ejecuta sin error
   - Archivos generados en data/output/wordpress/
   - Trazabilidad de SKU es consistente

6. Error handling
   - POST /save-json con payload invalido retorna 400
   - POST con file no permitido retorna 400
   - Cambios invalidos no persisten
```

**Tareas concretas**:
```
1. Crear tests/smoke/ con framework minimo (Jest o node assertions).
2. Implementar cada test case.
3. Agregar npm script "npm run test:smoke".
4. Ejecutar antes de cada deploy/merge.
5. Documentar como agregar nuevos tests.
```

**Riesgos mitigados**:
- Detecta regresion post-cambio automaticamente.
- Facilita CI/CD futuro.

### Tarea P2.3: Optimizacion de rendimiento cliente
**Entregable**: js/optimizations/incremental-load.js + documentacion

Objetivo: Mejorar tiempo de carga y filtrado de 67k filas.

**Optimizaciones propuestas**:
```
1. Virtualizacion de tabla (mostrar solo filas visibles).
2. Paginacion servidor-side para export/search.
3. Cache de filtros comunes en localStorage.
4. Lazy load de imagenes/esquemas.
5. Compresor de estado global (pako ya usado, validar).
```

**Tareas concretas**:
```
1. Medir baseline de carga + filtrado actual.
2. Implementar virtualizacion incrementalmente (cambio visual minimo).
3. Agregar paginacion a endpoints GET /engines si es necesario.
4. Tests: comparar tiempos vs P0 baseline.
5. Objetivo: reducir tiempo de carga inicial a < 2 seg, filtrado < 500ms.
```

**Riesgos mitigados**:
- Mejora UX operativo sin romper funcionalidad.
- Datos manejables en navegadores lentos.

### Tarea P2.4: Observabilidad ligera (metricas y logs)
**Entregable**: server/services/metrics.js + client logs basicos

Objetivo: Detectar anomalias operativas sin overhead.

**Metricas a rastrear**:
```
Backend:
- Numero de /save-json exitosos por hora
- Numero de /save-json fallidos por motivo
- Tiempo promedio de guardado
- Numero de conflictos de concurrencia (locks)
- Tasa de exito de /export/run-wordpress

Frontend:
- Tiempo de carga inicial
- Numero de cambios sin guardar (dirty rows)
- Numero de errores de persistencia reportados por usuario
```

**Tareas concretas**:
```
1. Crear server/services/metrics.js con contadores simples.
2. Agregar logs a endpoints criticos (inicio/fin + timing).
3. Exportar metricas a /metrics endpoint (promedio simple).
4. Agregar console.log en UI de operaciones criticas.
5. Documentar como leer metricas y diagnosticar problemas.
```

**Riesgos mitigados**:
- Deteccion temprana de anomalias operativas.
- Facilita debugging de issues de persistencia/export.

---

## FASE P3: Reorganizacion estructural y consolidacion final
**Duracion estimada**: 4-8 semanas (evolutiva, paralela a operacion)  
**Riesgo**: Bajo si P0/P1/P2 completados (cambios estructurales sin cambios logica)  
**Criterio de exito**: Estructura profesional sin romper operacion

### Tarea P3.1: Mover legacy a arbol congelado
**Entregable**: legacy/ actualizado, referencias actualizadas

Objetivo: Despejar raiz y evitar confusion.

**Scripts a congelar**:
- generate_synthetic_exports.js -> legacy/
- app.js -> legacy/
- analysis.js -> legacy/
- debug.js -> legacy/
- legacy/export_complex_ai/* ya está bien ubicado

**Tareas concretas**:
```
1. Crear legacy/README.md explicando que esta ahi y por que.
2. Mover scripts obsoletos.
3. Crear wrappers/aliases en raiz si algo es llamado externamente.
4. Actualizar documentacion de scripts oficiales.
5. Validar no hay referencias rotas en operacion.
```

### Tarea P3.2: Reorganizar carpetas a estructura profesional
**Entregable**: apps/, tools/, data/, legacy/ finales

Estructura propuesta:
```
apps/web/
  html activos (qa_milu.html, analista_02.html, ...)
  js/ -> modulos frontend
  styles/ -> CSS
  
apps/server/
  server.js (punto entrada)
  routers/
  services/
  middleware/
  
tools/pipeline/
  depuracion_json.py
  importar_json.py
  scripts/*.js (export, pdf-compare, etc)
  
tools/extraction/
  extraccion_de_pdf_a_excel/
  
tools/dev/
  audit_json_fields.py
  compare_measurements.py
  etc (utilidades no runtime)
  
data/
  runtime/ -> engine_*.json + qa_revision_server_data.json (vivos)
  output/ -> export, wordpress, etc (generados)
  backup/ -> snapshots de seguridad
  
docs/ -> documentacion (ya bien organizada)
legacy/ -> codigo congelado

```

**Tareas concretas**:
```
1. Crear estructura sin mover nada aun.
2. Crear wrappers/aliases para rutasOctales esperadas por server.js y HTML.
3. Mover incrementalmente sin romper operacion.
4. Mantener compatibilidad con rutas antiguas durante transicion (6 meses?).
5. Actualizar docs/ con nuevas rutas y cambios de directorio.
```

**Riesgos mitigados**:
- Migracion reversible con wrappers.
- Evita breaking changes abruptos.

### Tarea P3.3: Consolidacion de UIs redundantes
**Entregable**: HTML consolidadas y eliminadas

Objetivo: Una sola UI principal, paneles especializados opcionales.

**Analisis de overlap**:
- qa_milu.html (principal) vs export_wordpress.html (panel export embebido actualmente).
- analista_02.html (oficial) vs qa_analista_registro.html (legacy).

**Tareas concretas**:
```
1. Documentar flujos de cada HTML.
2. Consolidar export_wordpress.html como pestaña en qa_milu.html si no está.
3. Deprecar qa_analista_registro.html a favor de analista_02.html.
4. Mantener wrappers redireccionadores durante transicion (6 meses).
5. Validar no hay usuarios de HTML deprecadas.
```

---

## CRONOGRAMA SUGERIDO

```
Semana 1-2:     P0 completo (documentacion + baselines sin cambios)
Semana 3-4:     P1.1 + P1.2 (capa IO + revision rules)
Semana 5-6:     P1.3 + P1.4 (PN rules + modularizacion routers)
Semana 7-8:     P1.5 + P2.1 (validaciones + schema v1)
Semana 9-10:    P2.2 + P2.3 (tests smoke + optimizacion)
Semana 11:      P2.4 (observabilidad)
Semana 12+:     P3 (reorganizacion estructural, paralela a operacion)

TOTAL: ~3 meses para P0+P1+P2, P3 evolutiva.
```

---

## CRITERIOS DE EXITO POR FASE

### P0
- [x] Documentacion completa y validada manualmente.
- [x] Metricas baseline registradas.
- [x] Checklist operativa ejecutada exitosa 3+ veces.

### P1
- [x] Sin regresion en /save-json, /qa_revision_sync.php, /export/run-wordpress.
- [x] Codigo refactorizado pero contratos HTTP identicos.
- [x] Tests smoke manuales de cada router pasan.

### P2
- [x] Suite automatizada de tests smoke ejecuta sin fallos.
- [x] Schema v1 documenta 100% del modelo actual.
- [x] Rendimiento cliente mejora >= 20% (tiempo carga + filtrado).
- [x] Metricas de operacion disponibles en /metrics.

### P3
- [x] Estructura nueva es transparente para usuarios operativos.
- [x] Wrappers/aliases funcionan sin cambios de URLs operativas.
- [x] Documentacion actualizada para nuevas rutas.

---

## RIESGOS GLOBALES Y MITIGACION

| Riesgo | Severidad | Mitigacion |
|--------|-----------|-----------|
| Regresion en persistencia | Alta | Tests P0.5 baseline, smoke tests P2.2 automatizados, backup de datos |
| Divergencia revision UI/backend | Media | Modulo unico revision (P1.2) reutilizado en 3+ lugares |
| Confusion por coexistencia legacy/nuevo | Media | Documentacion clara, wrappers, etiquetado, README por carpeta |
| Downtime operativo | Media | Cambios en desarrollo, testing exhaustivo pre-merge, ventanas sin usuarios |
| Overhead de mantenimiento | Baja | Documentacion comprehensiva, tests automatizados reducen mantenimiento futuro |

---

## ENTREGABLES FINALES

### Por fase:
**P0**: 5 documentos operativos (checklist, matriz endpoints, tabla scripts, contratos, metricas).  
**P1**: Codigo refactorizado, modulos de servicio, routers separados, validaciones.  
**P2**: Tests automatizados, schema v1, optimizacion rendimiento, observabilidad.  
**P3**: Estructura profesional, wrappers compatibles, documentacion actualizada.

### Transversal:
- Rama estable de desarrollo con cambios incrementales.
- Backups de datos en cada fase.
- Documentacion actualizada constantemente.
- Sin romper contratos operativos hasta P3 (y con wrappers incluso ah).

---

## SIGUIENTE PASO INMEDIATO

**Recomendacion**: Comenzar por **P0.1 (Checklist operativa)** esta semana.  
- Es bajo riesgo.
- Establece linea base sin tomar riesgos.
- Da confianza al equipo antes de refactores mayores.
- No bloquea nada, prepara todo.

Una vez P0 sea operativo (todos los documentos listos y validados), proceder a P1.1 (capa IO JSON).
