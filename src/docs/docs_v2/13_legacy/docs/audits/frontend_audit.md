# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Auditoria Frontend QA

Fecha: 2026-05-16
Alcance: qa_milu.html, analista_02.html, qa_imagenes.html, export_wordpress.html, analytics_*.html, modulos js asociados.

## Resumen

Estado general: USABLE con deuda tecnica significativa en los modulos QA legacy.

Evidencia cuantitativa:

- js/qa-milu.js: 4,218 lineas, 84 listeners, 23 alerts.
- js/analista-02.js: 3,877 lineas, 33 listeners, 60 alerts.
- js/qa-analista-registro.js: 888 lineas, 11 listeners, 18 alerts.
- js/qa-table.js: virtualizacion activa (VIRTUAL_MIN_ROWS=120) + paginacion.

## Problemas encontrados

| Problema | Gravedad | Impacto | Prioridad | Recomendacion | Riesgo de cambio |
|---|---|---|---|---|---|
| Modulos monoliticos (qa-milu.js, analista-02.js) | Alta | Mantenibilidad, defectos por efecto colateral | Alta | Extraer por dominios (filtros, guardado, modal, bulk) sin cambiar UX | Medio |
| Uso masivo de alert() en flujo QA legacy | Alta | UX bloqueante, peor productividad, manejo de errores inconsistente | Alta | Migrar alert() a showToast/modal gradualmente por modulo | Bajo |
| Duplicacion de reglas fallback de campos en pn-review.js y pn-review-embedded.js | Media | Divergencia funcional futura | Alta | Consolidar adaptador unico de lectura de campo | Medio |
| Dependencia fuerte de estado global mutable (state.js) | Alta | Re-render y bugs de sincronizacion | Alta | Encapsular mutaciones criticas + eventos de estado | Medio |
| Tabla principal extremadamente densa (54 columnas) | Media | Curva UX alta, errores de operacion | Media | Mantener vista compacta por defecto y presets orientados a tarea | Bajo |
| Referencias a vistas inexistentes (qa_web, milu_qa, pn_review.html) en docs/acciones utilitarias | Media | Confusion operativa | Media | Alinear rotulado y enlaces con rutas reales | Bajo |
| Filtros y acciones masivas en multiples zonas | Media | Riesgo de inconsistencia de estado | Media | Definir una capa unica de comandos QA | Medio |
| Varias dependencias implicitas a backend local (localhost:3000 fallback) | Media | Comportamiento variable en hosting estatico | Media | Estrategia unificada de resolucion de API base | Bajo |
| Codificacion de strings con caracteres rotos en algunas vistas | Baja | Calidad visual/documental | Baja | Revisar encoding UTF-8 en archivos heredados | Bajo |

## Codigo duplicado / listeners / funciones muertas

- Duplicacion funcional clara entre pn-review.js y pn-review-embedded.js (fallbacks, formateo, fetch PN review).
- listeners muy concentrados en qa-milu.js y analista-02.js (117 entre ambos).
- No se detectaron TODO/FIXME/HACK explicitos en codigo activo (0 marcadores estrictos), deuda no anotada formalmente.

## Estados no controlados y dependencias implicitas

- state.js expone estado compartido mutable a todos los modulos.
- Flujos bulk y PN copy actualizan backend + memoria con multiples puntos de entrada.
- En analista-02.js existe fallback de modo bulk y modo por-PN, con varias rutas de error.

## Render/performance

- Punto favorable: qa-table.js ya implementa virtualizacion + overscan + paginacion auto.
- Riesgo: costo inicial sigue alto por carga total de motores si no se usa incremental load.
- qa_imagenes usa tabla virtual propia, bien encaminado para datasets grandes.

## Columnas legacy / inconsistencias

- Persisten columnas de alto acoplamiento historico en qa_milu (campos crudos + finales + pdf + auxiliares).
- Inconsistencia naming entre referencias antiguas (measurement_final) y campo actual (measure_final).

## Componentes reutilizables posibles

- Adaptador de lectura de campos (fieldAdapter + fallbacks).
- Command bus para acciones QA masivas y persistencia.
- Shared API client con retries y mapeo de errores.
- Shared status/notification layer (toast + confirm typed) para todos los modulos.

## Flujo UX

Fortalezas:

- Herramienta potente para operaciÃ³n experta.
- Presencia de confirmacion tipada en acciones criticas.
- Integracion con auditoria y analytics.

Debilidades:

- Exceso de controles en una sola vista.
- Mensajeria heterogenea entre paginas (toast vs alert vs estados inline).
- Rutas antiguas mencionadas en documentaciÃ³n y utilidades de QA imagenes.

