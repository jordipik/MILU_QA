# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

> **ARCHIVADO** — superseded.
>
> Superseded por [../09_auditoria_2026.md](../09_auditoria_2026.md). Se conserva como referencia histórica.
>
> Movido a `docs/archived/` el 2026-05-12. Se conserva por trazabilidad. **No usar como fuente de verdad.**

---

# MILU AUDITORIA TECNICA

## 1. Alcance de auditoria
Revision exhaustiva de:
- Backend Node/Express
- Frontend QA principal y analista
- Pipeline Python/Node de depuracion, compare PDF y export
- Modelo de datos JSON y persistencia
- Estructura de carpetas y deuda de legacy

No se realizaron cambios funcionales en codigo ni datos productivos durante esta auditoria.

## 2. Hallazgos criticos (prioridad alta)

### C1. Monolito en server.js
Impacto:
- Alto riesgo de regresion al tocar endpoints.
- Dificultad de pruebas unitarias por acoplamiento.

Evidencia:
- Mismo archivo concentra salud, engines, guardado, revisiones, export, PN review y auditoria.

Recomendacion:
- Partir en routers por dominio sin alterar contratos HTTP.

### C2. Acoplamiento UI-negocio en modulos grandes
Impacto:
- Dificultad para cambios seguros en filtros/tabla/export.
- Posibles regressions de re-render y estado.

Evidencia:
- js/qa-milu.js y js/analista-02.js contienen mezcla de rendering, reglas, side effects y fetch.

Recomendacion:
- Extraer servicios de negocio y mantener controladores de UI livianos.

### C3. Deuda de duplicados legacy activos en repo
Impacto:
- Riesgo operativo de ejecutar script equivocado.
- Confusion en onboarding.

Evidencia:
- coexistencia de pn-review.js / pn_review.js
- export legacy synthetic vs export WordPress oficial
- scripts historicos en raiz

Recomendacion:
- Marcar oficialmente activos vs legacy y mover obsoletos a arbol legacy.

### C4. Ausencia de esquema formal versionado para JSON runtime
Impacto:
- Cambios de campo pueden romper frontend/export sin deteccion temprana.

Evidencia:
- 120 campos coexistentes, varios semanticamente cercanos.

Recomendacion:
- Definir schema versionado + validacion pre-export.

## 3. Hallazgos importantes (prioridad media)

### M1. Contratos de revision parcialmente distribuidos
- Normalizacion central existe, pero reglas todavia aparecen en multiples capas.
- Riesgo de divergencia entre UI y export.

### M2. Campos sparse con semantica incierta
- FN/fn_final, MODEL/TYPE_final, ruta_foto y varios sust_*_pdf muy incompletos.
- Requiere politica de obligatoriedad por uso real.

### M3. Falta de suite formal de pruebas
- No hay test automatizado integral de endpoints/flujo export.
- Validacion actual muy manual.

### M4. Rendimiento potencialmente limitado en cliente
- Carga y render de 67k+ filas en contexto browser.
- Dependencia de filtros/client-side intensivos.

## 4. Hallazgos menores (prioridad baja)
- Naming mixto espanol/ingles en algunos campos y scripts.
- Multiples paginas HTML con funciones parecidas.
- Documentacion existente util pero no siempre sincronizada con estado actual.

## 5. Fortalezas
- Flujo end-to-end funcional local sin dependencia de BD.
- Persistencia transparente en JSON, facil de inspeccionar.
- Herramientas de QA robustas para correccion por registro y por PN.
- Export WordPress QA-only con trazabilidad por SKU.

## 6. Riesgos operativos inmediatos
1. Cambios directos en server.js sin encapsulacion.
2. Refactors de revision sin alinear export y frontend.
3. Limpieza agresiva de carpetas legacy sin inventario previo.
4. Reescritura de schema sin capa de compatibilidad.

## 7. Recomendaciones priorizadas
1. Congelar contratos HTTP y enums de revision.
2. Introducir tests smoke de endpoints criticos.
3. Modularizar backend por routers sin cambiar rutas.
4. Declarar scripts oficiales y etiquetar legacy.
5. Definir schema JSON runtime con version.

## 8. Criterios de exito para siguiente etapa
- Sin regresiones en /save-json, /qa_revision_sync.php y /export/run-wordpress.
- Consistencia de revision entre UI, persistencia y export.
- Tiempos de carga y filtrado aceptables en QA diario.
- Documentacion unica y actualizada para onboarding.

