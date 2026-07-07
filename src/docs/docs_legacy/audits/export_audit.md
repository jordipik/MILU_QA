# Auditoria Export WordPress

Fecha: 2026-05-16
Scope: scripts/export_wordpress_milu.js, js/export-wordpress.js, /export/*, reglas New/Superseded/Pending.

## Estado actual

- Flujo oficial activo: POST /export/run-wordpress -> scripts/export_wordpress_milu.js.
- Legacy de export complejo: archivado y desactivado por endpoints 410.
- UI de revisión export: export_wordpress.html + js/export-wordpress.js.

## Reglas reales actuales

1. Decision por QA:
- Si existe al menos una fila OK+Importar en PN -> import.
- Si todas son OK+Eliminar -> discard.
- Resto -> pending_review.

2. New/Superseded:
- getExportType() usa sust_hierarchie == Superseded para clasificar superseded; lo demas es new.
- sust_status NO decide tipo de export.

3. Agrupacion:
- Global por PN (across motores).
- Merge de campos por frecuencia/seleccion de mejor candidato.

## Validaciones realizadas

- Endpoints /export/status, /export/files, /export/file, /export/download operativos.
- /export/run-synthetic, /export/run-ai-conflicts, /export/run-all bloqueados (410).
- Smoke analytics/export y runtime en verde.

## Hallazgos y deuda

| Hallazgo | Gravedad | Impacto |
|---|---|---|
| Coexistencia de nombres output legacy (milu_wp_pending.json vs milu_wp_pending_review.json) | Media | Complejidad de consumo y fallback |
| Lógica de merge extensa en generate_synthetic_exports.js (root) fuera del flujo oficial | Media | Confusion sobre cual pipeline manda |
| Dependencia de QA fields para decision final sin validacion de negocio adicional | Baja | Puede exportar datos incompletos si QA acepta |
| Fuertes fallback por campo entre fuentes raw/final | Media | Riesgo de inconsistencia por PN |

## Deduplicacion e integridad

- El pipeline agrupa por PN y evita duplicados directos por SKU en output principal.
- Persisten riesgos de divergencia semantica cuando un PN tiene conflicto de designation/measure/weight entre motores.

## Imagenes/esquemas/campos vacios

- Export puede incluir registros con cobertura parcial de media si QA decide importar.
- Riesgo actual: referencias de ruta no verificadas contra filesystem en pipeline de export (se delega a QA/analytics).

## Diferencias con logica historica

- Se abandono decision automatica por IA/scoring (legacy/export_complex_ai).
- Se formalizo QA-only decision para import/discard/pending.

## Recomendaciones

1. Unificar naming de outputs pendientes en un solo archivo canonico.
2. Añadir reporte de calidad export (completitud por campo requerido WP) previo a run-wordpress.
3. Consolidar y documentar deprecacion de generate_synthetic_exports.js root vs legacy/export_complex_ai.
4. Añadir snapshot compare obligatorio antes de publicar output.
