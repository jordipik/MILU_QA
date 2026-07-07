# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

> **ARCHIVADO** — superseded.
>
> Superseded por [../10_plan_remediacion.md](../10_plan_remediacion.md) y el canónico [../PLAN_TRABAJO_MILU.md](../PLAN_TRABAJO_MILU.md).
>
> Movido a `docs/archived/` el 2026-05-12. Se conserva por trazabilidad. **No usar como fuente de verdad.**

---

# MILU PLAN MEJORA

## 1. Objetivo
Reducir riesgo tecnico y deuda estructural en MILU sin frenar operacion QA diaria ni romper contratos actuales.

## 2. Principios de ejecucion
- Cero cambios destructivos sobre datos productivos en fases iniciales.
- Compatibilidad hacia atras en endpoints y campos.
- Cambios pequenos, medibles y reversibles.
- Prioridad a estabilidad de persistencia y export.

## 3. Priorizacion

### Prioridad P0 (inmediata, 1-2 semanas)
1. Documentar contrato canonico revision (estado/accion) en codigo y docs.
2. Agregar smoke tests manuales estandarizados:
   - GET /health
   - GET/POST /qa_revision_sync.php
   - POST /save-json
   - POST /apply-revision-to-engines
   - POST /export/run-wordpress
3. Etiquetar scripts oficiales vs legacy en README central.
4. Crear checklist operativa diaria de QA/export.

Entregables P0:
- checklist_operativa.md
- matriz_endpoints_criticos.md
- tabla_scripts_oficiales.md

### Prioridad P1 (corto plazo, 2-4 semanas)
1. Modularizar backend en routers manteniendo mismas rutas publicas.
2. Extraer capa de IO JSON (lectura/escritura/lock/validacion) reutilizable.
3. Separar en frontend funciones de negocio de rendering en qa-milu/analista.
4. Centralizar helpers de comparacion PN y revision.

Entregables P1:
- server/routers/*
- server/services/json-store.js
- js/domain/revision-rules.js
- js/domain/pn-rules.js

### Prioridad P2 (medio plazo, 1-2 meses)
1. Definir schema JSON runtime versionado (v1 compat, v2 objetivo).
2. Validacion schema pre-export y pre-run de scripts criticos.
3. Introducir tests automatizados minimos (endpoint + reglas de negocio).
4. Mejorar rendimiento cliente con virtualizacion/estrategia incremental de render.

Entregables P2:
- schema/runtime-v1.json
- schema/runtime-v2.json
- tests/smoke/*
- benchmark carga/filtrado

### Prioridad P3 (evolutiva)
1. Reorganizacion de carpetas a apps/tools/data/legacy.
2. Consolidacion de UIs redundantes.
3. Observabilidad ligera (metricas de guardado/export/error rates).

## 4. Cambios recomendados primero
1. Aislar logica de persistencia y validacion en backend.
2. Aislar reglas de revision y PN en modulos de dominio compartidos.
3. Agregar validaciones de enum y payload en endpoints criticos.
4. Definir oficialmente pipeline de export unico.

## 5. Que NO tocaria todavia
1. No cambiar nombres de campos core en engine_*.json.
2. No mover archivos runtime sin wrappers de compatibilidad.
3. No eliminar scripts legacy sin inventario, etiqueta y reemplazo.
4. No redisenar UI completa antes de estabilizar capa de dominio.
5. No introducir BD relacional en esta fase (no es el cuello principal actual).

## 6. Riesgos del plan y mitigacion
- Riesgo: regresion en guardado JSON.
  Mitigacion: tests smoke + backup automatico previo.

- Riesgo: divergencia frontend/backend en reglas revision.
  Mitigacion: modulo canonico unico + fixtures compartidos.

- Riesgo: confusion por coexistencia transitoria de estructura vieja/nueva.
  Mitigacion: mapa de migracion y alias compatibles.

## 7. KPI sugeridos
- % operaciones /save-json exitosas.
- tiempo medio de carga inicial QA.
- tiempo medio de export run-wordpress.
- numero de incidencias por inconsistencia de revision.
- cobertura de tests smoke en endpoints P0.

## 8. Hoja de ruta resumida
- Semana 1-2: P0 completo, sin refactor profundo.
- Semana 3-6: P1 modularizacion backend + dominio frontend.
- Semana 7-10: P2 schema+tests+rendimiento.
- Semana 11+: P3 reorganizacion estructural y consolidacion final.

## 9. Criterio de finalizacion
Se considera completado cuando:
- Operacion QA/export diaria no tiene regresiones.
- Contratos de datos y endpoints quedan formalizados y testeados.
- El equipo puede mantener el sistema sin depender de conocimiento tacito.

