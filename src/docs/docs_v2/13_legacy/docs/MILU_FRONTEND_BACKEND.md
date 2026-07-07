# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# MILU FRONTEND BACKEND

## 1. Arquitectura runtime

### Frontend
- Stack: HTML + CSS + JS ES modules.
- Pagina principal: qa_milu.html.
- Orquestador: js/qa-milu.js.
- Estado compartido: js/state.js.
- Render tabla: js/qa-table.js.
- Reglas revision: js/revision.js.
- Analista: analista_02.html + js/analista-02.js.

### Backend
- Stack: Node.js + Express (CommonJS).
- Entrypoint: server.js.
- Puerto local: 3000.
- Persistencia en disco JSON (sin BD).

## 2. Flujo frontend (qa_milu)
1. Carga datos de 9 engines via js/data-loader.js.
2. Normaliza estado/accion y claves de revision.
3. Construye filtros, stats y tabla paginada.
4. Ediciones por celda o formulario lateral.
5. Persistencia remota por /save-json.
6. Sincronia de revision por /qa_revision_sync.php y/o local cache.
7. Export preview y ejecucion por /export/*.

## 3. Flujo frontend (analista_02)
1. Seleccion de registro por errores/filtros.
2. Visualizacion de campos RAW/GESA/SUST/FINAL/PDF_AUTO.
3. Acciones de correccion por registro.
4. Recompute posterior por endpoint dedicado.
5. Integracion con PN review embebido para decisiones por SKU.

## 4. Endpoints backend (mapa operativo)

### Salud/version
- GET /health
- GET /version

### Datos engines
- GET /engines
- GET /api/engine-files
- GET /api/engine-data/:engineFile

### Persistencia puntual y revision
- POST /save-json
- POST /save-json.php
- GET/POST /qa_revision_sync.php
- POST /apply-revision-to-engines
- POST /recompute-qa-errors
- POST /recompute-pdf-auto

### Export
- GET /export/status
- GET /export/preview
- GET /export/file
- GET /export/download
- POST /export/run-wordpress

### PN review
- GET /pn-review/list
- GET /pn-review/:sku
- GET /pn-review/:sku/sources
- GET /pn-review/:sku/values
- POST /pn-review/:sku/decision
- POST /pn-review/:sku/values
- POST /pn-review/:sku/propagate-siblings
- POST /pn-review/:sku/apply-siblings

### Auditoria
- GET /audit-log
- POST /audit-log
- DELETE /audit-log

## 5. Contratos y compatibilidad
- El frontend principal usa endpoints con sufijo .php por compatibilidad historica.
- En local Express debe responder /qa_revision_sync.php y /save-json.php antes del static middleware.
- Existen scripts PHP standalone para hostings sin Node (qa_revision_sync.php, save-json.php).

## 6. Riesgos tecnicos de arquitectura
- server.js concentra demasiados dominios (persistencia, export, PN, auditoria, static).
- Falta de capa de servicios/repositorios clara.
- Larga superficie de estado global en cliente (state.js + modulos grandes).
- Re-render costoso en algunas rutas de UI y potenciales regresiones por acoplamiento.

## 7. Fortalezas actuales
- Arquitectura simple de desplegar localmente.
- Persistencia transparente y auditable por archivos.
- Flujos QA y export funcionales sin dependencias externas complejas.
- Endpoints de salud/version para diagnostico rapido.

## 8. Recomendaciones sin romper runtime
1. Modularizar server.js por routers: health, data, revision, export, pn-review, audit.
2. Introducir capa de IO JSON compartida con locks y validaciones unificadas.
3. Reducir acoplamiento de js/qa-milu.js separando controller UI y reglas negocio.
4. Definir contrato de tipos para payloads (JSDoc o TypeScript progresivo).
5. Mantener wrappers de compatibilidad .php durante transicion.

