# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# MILU Global Status Report

Fecha: 2026-05-16
Tipo: auditoria global sin cambios funcionales.

## Resumen ejecutivo

MILU esta en estado operativo y usable para trabajo interno local, con buena base de validacion smoke y capa analytics/read-only funcional. El principal riesgo no es una falla inmediata, sino la deuda acumulada de arquitectura (monolitos frontend/backend), compatibilidad legacy extendida y desalineacion parcial entre source JSON y mirror SQLite.

## Estado actual REAL

- Estable: SI (operacion local diaria)
- Usable: SI
- En pruebas: SI (suite smoke + validaciones activas)
- Produccion parcial: SI (publicacion posible con controles)
- Experimental: SI (fragmentos legacy/synthetic/documentales coexistiendo)

## QuÃ© ya estÃ¡ bien

1. Flujo principal BOM->QA->Export WordPress funciona.
2. Endpoints criticos de salud/version/catalogo y QA revision operativos.
3. Capa /db y /db/analytics read-only estable y probada.
4. Suite smoke y seguridad write en verde.
5. Compatibilidad legacy controlada via 410 o alias intencional.

## QuÃ© sigue frÃ¡gil

1. Monolitos frontend (qa-milu, analista-02) y backend (server.js) grandes.
2. Dependencia de aliases/fallbacks de campos en varios modulos.
3. Divergencia actual JSON vs SQLite mirror (-1 fila, -1 PN).
4. Sistema multimedia con alto volumen de referencias no resueltas.
5. Documentacion con partes desactualizadas sobre vistas retiradas.

## QuÃ© falta antes de pruebas reales ampliadas

1. Tests funcionales de reglas QA/PN/export (no solo smoke).
2. Entorno controlado para pruebas write masivas restaurables.
3. Paridad JSON-DB 100% para analitica confiable.
4. Matriz de calidad multimedia (faltantes/rotas/placeholders) como gate.

## QuÃ© falta antes de producciÃ³n estable

1. Modularizacion incremental de server.js y frontend QA.
2. Contrato de datos v2 (schema + deprecaciones) sin romper outputs actuales.
3. Hardening basico de seguridad para escenarios fuera de localhost.
4. Observabilidad minima (tiempos por endpoint, errores write, salud de export).

## Riesgos principales

| Riesgo | Severidad | Probabilidad | Nota |
|---|---|---|---|
| Regresiones por alto acoplamiento en monolitos | Alta | Alta | Cambios pequeÃ±os impactan Ã¡reas no previstas |
| Error de payload masivo en apply-revision-to-engines | Alta | Media | Validacion profunda aun limitada |
| Drift JSON vs mirror DB | Media | Media | ya hay delta cuantificado |
| Calidad media insuficiente para export | Alta | Alta | placeholders y referencias rotas elevadas |
| Confusion operativa por docs/rutas legacy | Media | Alta | onboarding y soporte mÃ¡s lentos |

## Estado por dominio

- Estado funcional core: Estable con deuda.
- Estado QA/revision: Operativo, fuerte en compatibilidad, con complejidad alta.
- Estado export: Operativo QA-only; legacy archivado pero presente.
- Estado imagenes/esquemas: Funcional para diagnostico, calidad de datos insuficiente.
- Estado performance: Aceptable en local, sensible al crecimiento de volumen.

## Prioridades recomendadas

### Corto plazo (1-3 semanas)

1. Resolver delta JSON vs SQLite mirror y aÃ±adir gate automatico db:validate.
2. Reducir alert() legacy en mÃ³dulos QA de mayor uso.
3. Alinear docs/rutas reales (retirar referencias a pn_review.html, qa_web, milu_qa).
4. AÃ±adir validacion semantica mÃ­nima para payload masivo de revisiones.

### Medio plazo (1-2 meses)

1. Modularizar server.js por dominios (qa, export, pn-review, audit).
2. Modularizar qa-milu/analista-02 por casos de uso.
3. Unificar capa adapter de campos (eliminar duplicacion pn-review vs embedded).
4. Incorporar tests funcionales de negocio y baseline de performance.

### Largo plazo (2-4 meses)

1. Definir contrato JSON v2 (bloques raw/final/qa/media) con deprecacion guiada.
2. Consolidar pipeline de media con reconciliacion automatica.
3. Evaluar arquitectura de persistencia complementaria para writes auditables.

## FASE SIGUIENTE RECOMENDADA

Fase propuesta: "Estabilizacion operativa y coherencia de datos"

Objetivo: bajar riesgo inmediato sin refactor masivo ni cambio de outputs.

Backlog priorizado:

1. Corregir y blindar paridad JSON<->SQLite (gate obligatorio).
2. Endurecer validacion de apply-revision-to-engines con schema operativo.
3. Limpiar referencias legacy/documentacion rota.
4. Plan de reducciÃ³n de alert() y normalizacion de notificaciones QA.
5. Dashboard de calidad media (faltantes/rotas/placeholders) para gate de export.

Criterio de salida de fase:

- db:validate en verde estable.
- smoke + security en verde.
- 0 referencias operativas a vistas retiradas.
- reporte de calidad media disponible por motor antes de export.

