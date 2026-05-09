# README MILU GLOBAL

## 1. Objetivo del proyecto
MILU es una herramienta local para transformar datos de recambios MTU desde PDFs/BOM hacia datasets QA y salidas listas para importacion en WordPress.

Flujo funcional principal:
PDF/BOM -> extraccion -> limpieza/depuracion -> enriquecimiento GESA/SUST -> engine_*.json -> QA web -> export WordPress.

## 2. Arquitectura actual (verificada)
- Frontend principal: qa_milu.html + js/qa-milu.js.
- Frontend analista: analista_02.html + js/analista-02.js.
- Backend local: server.js (Express, puerto 3000).
- Persistencia: archivos JSON en disco (sin BD).
- Datos runtime: 9 archivos engine_*.json (67,883 filas auditadas).
- Export oficial: scripts/export_wordpress_milu.js + data/output/wordpress.

## 3. Componentes clave
- Estado global UI: js/state.js.
- Carga de datos: js/data-loader.js.
- Reglas revision: js/revision.js.
- Tabla QA: js/qa-table.js.
- QA checks: js/qa-checks.js.
- Compare PDF: scripts/qa_pdf_compare.js.
- Recompute QA errors: recompute_engine_errors.js.

## 4. Endpoints principales (backend)
- GET /health
- GET/POST /qa_revision_sync.php
- POST /save-json y /save-json.php
- POST /apply-revision-to-engines
- POST /recompute-qa-errors
- POST /recompute-pdf-auto
- GET /engines
- GET /export/status, /export/preview, /export/file, /export/download
- POST /export/run-wordpress
- GET /pn-review/list, /pn-review/:sku, /pn-review/:sku/sources
- POST /pn-review/* (decision, values, siblings bulk)
- GET/POST/DELETE /audit-log

## 5. Modelo de persistencia
No hay base de datos relacional. Se persiste en:
- engine_*.json: datos operativos y revisiones.
- qa_revision_server_data.json: payload de sync revision.
- qa_audit_log.json: auditoria de cambios.
- data/output/wordpress/*: salidas de export.

## 6. Estado tecnico resumido
Fortalezas:
- Pipeline funcional end-to-end.
- Persistencia simple y transparente (JSON).
- Herramientas de QA completas en UI.
- Export WordPress QA-only activo.

Debilidades:
- server.js monolitico (muchos dominios en un solo archivo).
- qa-milu.js y analista-02.js muy grandes y con logica mezclada UI+negocio.
- Coexistencia de codigo legacy/duplicado (pn_review.js, scripts legacy export).
- Documentacion extensa pero parcialmente desactualizada en algunos docs historicos.

## 7. Comandos operativos habituales
- npm install
- node server.js
- Ejecutar localhost.bat
- npm run qa:pdf-compare
- npm run qa:pdf-compare:write
- npm run qa:recompute-errors
- npm run export:wordpress

## 8. Reglas de trabajo para este repo
- No tocar dist/, json_originales/, zz_old/, zz_copias/, fotos_*, esquemas_* salvo tarea explicita.
- Diagnostico de persistencia por capas: /health -> endpoint HTTP -> payload frontend -> escritura en disco.
- Priorizar contrato canonico de revision: qa_revision_estado + qa_revision_accion.

## 9. Que debe leer alguien nuevo primero
1. docs/MILU_PIPELINE_COMPLETO.md
2. docs/MILU_ESTRUCTURA_CARPETAS.md
3. docs/MILU_FRONTEND_BACKEND.md
4. docs/MILU_MODELO_DATOS_JSON.md
5. docs/MILU_PLAN_MEJORA.md
