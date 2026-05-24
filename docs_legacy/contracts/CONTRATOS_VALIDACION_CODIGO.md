# Validación de contratos contra código

> **CONTRATO MILU — v1** · Fase: CONTRATOS + ESTABILIDAD · No modifica código ni datos.
>
> Informe de discrepancias entre los contratos formales ([CONTRATO_JSON_ENGINE](CONTRATO_JSON_ENGINE.md), [CONTRATO_REVISION_QA](CONTRATO_REVISION_QA.md), [CONTRATO_EXPORT_WORDPRESS](CONTRATO_EXPORT_WORDPRESS.md), [CONTRATO_IMAGENES_ESQUEMAS](CONTRATO_IMAGENES_ESQUEMAS.md), [CONTRATO_ENDPOINTS_CRITICOS](CONTRATO_ENDPOINTS_CRITICOS.md)) y el código actual.
>
> **Ninguna corrección de código se aplica en esta fase**. Solo detección y priorización.

## Severidades

- **🔴 alta** — la inconsistencia puede causar datos divergentes en disco o decisiones erróneas en export/UI.
- **🟡 media** — convivencia de variantes legacy; no rompe nada pero ensucia el modelo.
- **🟢 baja** — solo etiquetas UI o búsquedas tolerantes; sin impacto en datos.

## Tabla principal

| # | Regla contractual | Severidad | Archivo(s) donde se cumple | Archivo(s) donde se contradice | Propuesta de corrección | Tocar ahora |
|---|---|---|---|---|---|---|
| C1 | `measure_final` es canónico; `measurement_final` está obsoleto | 🟡 media | Lectura prioriza `measure_final` con fallback en casi todo el código:<br>[js/qa-table.js#L153](../../js/qa-table.js)<br>[js/qa-checks.js#L180](../../js/qa-checks.js)<br>[js/pdf-viewer.js#L747](../../js/pdf-viewer.js)<br>[js/qa-milu.js#L1331](../../js/qa-milu.js)<br>[js/export-wordpress.js#L428](../../js/export-wordpress.js)<br>[recompute_engine_errors.js#L122](../../recompute_engine_errors.js)<br>[server.js#L137,L280](../../server.js) | El export escribe **ambos** campos en el output con valor idéntico: [scripts/export_wordpress_milu.js#L326](../../scripts/export_wordpress_milu.js) (campo `measurement_final`), [#L104,L216](../../scripts/export_wordpress_milu.js).<br>CSV headers incluyen `measurement_final` en [#L366](../../scripts/export_wordpress_milu.js).<br>El refactor v2 mantiene fallback: [scripts/refactor_engine_schema_v2.js#L81](../../scripts/refactor_engine_schema_v2.js). | (1) Dejar `measure_final` como único canónico en outputs nuevos. (2) Mantener lectura tolerante a `measurement_final` durante el periodo de transición. (3) Eliminar la doble escritura en el export. (4) Limpiar `measurement_final` de `engine_*.json` en la próxima ejecución de [depuracion_json.py](../../depuracion_json.py). | **NO** — requiere migración de filas existentes y revisión del export. |
| C2 | `wheight_final` NO existe / está prohibido | 🟢 baja | Confirmado: no aparece en `engine_*.json` reales. Tampoco lo usa el runtime. | Única mención: lista de campos del auditor offline [scripts/dev/audit_json_fields.py#L83](../../scripts/dev/audit_json_fields.py) (defensivo). | Mantener mención solo como detector de regresión histórica. | **NO** — innecesario. |
| C3 | `descartar` nunca se persiste; mapea a `(estado=ok, accion=eliminar)` | 🟢 baja | Normalizador centralizado:<br>[js/revision.js#L98,L112](../../js/revision.js)<br>Decisión API: [server.js#L1191-L1210](../../server.js)<br>Respuesta de status (read-only): [server.js#L1206,L1395](../../server.js) (`'ok\|eliminar': 'descartar'` solo traduce hacia la UI). | UI utiliza `'descartar'` como `action` en payloads y como label visible:<br>[js/pn-review.js#L112,L384](../../js/pn-review.js) → llama a `applyDecision(detail, 'descartar')`. Esto es **correcto** (es el verbo de acción, no el valor persistido); el servidor lo traduce.<br>Build distribuido: [dist/milu_publish/js/pn-review.js](../../dist/milu_publish/js/pn-review.js) (espejo). | Documentar explícitamente que `'descartar'` es **verbo de acción API** y no valor de campo. Considerar renombrar el verbo a `'eliminar'` para alinear UI ↔ persistencia. | **NO** — el contrato lo declara expresamente y el código respeta la regla. Renombrar requeriría tocar UI y API juntas. |
| C4 | `qa_errors` y `qa_errors_active` **NO se persisten** | 🟢 baja (cumple) | `stripLegacyQaFields()` borra ambos al guardar:<br>[server.js#L605-L620](../../server.js)<br>[apply_revision_to_engines.js#L73](../../apply_revision_to_engines.js)<br>[recompute_engine_errors.js#L212](../../recompute_engine_errors.js) | Filas históricas en `engine_*.json` aún pueden contener residuos hasta el próximo guardado. | Ejecutar [depuracion_json.py](../../depuracion_json.py) o un script de barrido para eliminar de disco. | **NO** — se limpia naturalmente al ir guardando. |
| C5 | `*_error` y `has_error` son derivados — decisión pendiente sobre si se persisten | 🟡 media | Se calculan en [recompute_engine_errors.js](../../recompute_engine_errors.js) y `/recompute-qa-errors`. | Persisten en disco mezclados con campos canónicos. No hay normalizador que los strippe sistemáticamente. | Decidir: o se mantienen como persistidos (y se documentan en CONTRATO_JSON_ENGINE) o se incluyen en `stripLegacyQaFields`. | **NO** — necesita decisión de producto. |
| C6 | `sust_hierarchie` es ÚNICO criterio New/Superseded | 🟢 baja (cumple) | [scripts/export_wordpress_milu.js#L244-L250](../../scripts/export_wordpress_milu.js). | — | — | **NO**. |
| C7 | `sust_status = SI` NO decide Superseded | 🟢 baja (cumple) | El export no lo usa para clasificar. | — | — | **NO**. |
| C8 | Decisión por PN basada solo en QA humana | 🟢 baja (cumple) | [scripts/export_wordpress_milu.js#L134-L181](../../scripts/export_wordpress_milu.js). | — | — | **NO**. |
| C9 | `qa_revision_estado ∈ {ok, pendiente}` y `qa_revision_accion ∈ {importar, revisar, eliminar, copia}` | 🟢 baja (cumple) | Normalizadores [js/revision.js#L92-L112](../../js/revision.js). Aplicado en `/save-json`, `/apply-revision-to-engines`, `/pn-review/*/apply-decision`. | El export todavía considera variantes históricas (`"en revision"`, `"en revisión"`) en [scripts/export_wordpress_milu.js#L134-L165](../../scripts/export_wordpress_milu.js). | Mantener compatibilidad de lectura; documentar como deuda. | **NO**. |
| C10 | `exp_imagenes` es la fuente canónica de imágenes; `ruta_foto` es fallback | 🟢 baja (cumple) | [server.js#L163-L168](../../server.js) (`parseImagesFromValue` + `uniq`). | — | — | **NO**. |
| C11 | `qa_imagenes.html` es solo lectura | 🟢 baja (cumple) | No invoca `/save-json` ni `/apply-revision-to-engines`. | — | — | **NO**. |
| C12 | Endpoints `/pn/*` legacy deben responder 410 | 🟢 baja (cumple) | Verificado en `server.js` (responden `{ok:false, legacy:true}`). | — | — | **NO**. |
| C13 | `qa_revision_sync.php` debe servir JSON, no el archivo PHP | 🟢 baja (cumple) | Ruta Express registrada antes del static middleware. | Si en algún despliegue se invierte el orden, el static serviría el archivo crudo. | Test smoke automatizado: `GET /qa_revision_sync.php` ha de devolver `Content-Type: application/json`. | **NO** — añadir como test futuro. |
| C14 | El export es idempotente sobre `engine_*.json` (no los modifica) | 🟢 baja (cumple) | [scripts/export_wordpress_milu.js](../../scripts/export_wordpress_milu.js) solo lee engines y escribe en `data/output/wordpress/`. | — | — | **NO**. |
| C15 | `/save-json` debería tener lista blanca de campos editables | 🟡 media | Acepta cualquier campo. | [server.js](../../server.js) `/save-json` no filtra campos permitidos. | Añadir lista blanca + validación de tipos en una fase posterior. | **NO** — fase 2 (smoke + payload validation). |
| C16 | Build `dist/milu_publish/` duplica todo el código | 🟢 baja | Es un artefacto de empaquetado. | Contiene copias de `js/*` con las mismas (in)consistencias. | No editar a mano; regenerar cuando se haga refactor. | **NO**. |
| C17 | Doble escritura de `measurement_final` y `measure_final` en outputs CSV/JSON del export | 🟡 media | — | [scripts/export_wordpress_milu.js#L325-L326](../../scripts/export_wordpress_milu.js) (objeto export) y [#L366](../../scripts/export_wordpress_milu.js) (header CSV). | Mantener solo `measure_final` en outputs nuevos cuando se haga refactor del script. | **NO** — riesgo de romper consumidores externos. |
| C18 | Datos legacy en `legacy/export_complex_ai/` no deben influir | 🟢 baja | Carpeta archivada. | Aparece en algunas búsquedas globales (`'descartar'`): [legacy/export_complex_ai/scripts/*](../../legacy/export_complex_ai/scripts/). | Ignorar. | **NO**. |

## Resumen ejecutivo

- **Cumple plenamente**: C2, C3, C4, C6–C14, C18 (13 reglas).
- **Convivencia documentada**: C1, C5, C17 (variantes `measurement_final`, `*_error`, doble write en export).
- **Mejoras pendientes (sin urgencia)**: C13 (test smoke PHP route), C15 (lista blanca en `/save-json`).
- **Nada bloqueante**.

## Lista priorizada de correcciones futuras

| Prioridad | Acción | Riesgo si se hace |
|---|---|---|
| P1 | Test smoke automatizado para los endpoints críticos (C13 y otros). | Bajo. Solo lectura. |
| P2 | Validación de payloads en `/save-json` y `/apply-revision-to-engines` (C15). Empezar por whitelist de campos. | Bajo, si se mantiene fallback "permitir todo" mientras se itera. |
| P3 | Decidir status de `*_error` / `has_error`: persistidos o derivados (C5). | Medio. Afecta a lecturas en UI. |
| P4 | Plan de migración de `measurement_final` → `measure_final` (C1, C17). | Medio-alto. Tocar export + filas existentes + clientes downstream. |
| P5 | Renombrar verbo API `'descartar'` → `'eliminar'` para alinear UI y persistencia (C3). | Bajo en backend, medio en UI. |

## Reglas de oro tras esta validación

1. **Nada que persista en `engine_*.json` debe llamarse `measurement_final` en código nuevo** — usar `measure_final`.
2. **`'descartar'` solo como `action` en API**; jamás como valor de `qa_revision_accion`.
3. **`qa_errors` y `qa_errors_active` nunca se leen de disco**: siempre se recalculan.
4. **`sust_hierarchie`** decide New/Superseded; `sust_status` solo informa.
5. **Cualquier nuevo endpoint** que escriba en disco debe respetar [CONTRATO_REVISION_QA §7](CONTRATO_REVISION_QA.md) y aparecer en [CONTRATO_ENDPOINTS_CRITICOS](CONTRATO_ENDPOINTS_CRITICOS.md).

## Riesgos generales (no actuar aún)

- **G1**: Los `dist/milu_publish/js/*` divergirán si se modifica solo `js/*`. Decidir si `dist/` es parte del repo activo.
- **G2**: La carpeta `data/output/wordpress/` se sobrescribe en cada export. Consumidores externos deben pull antes del próximo run.
- **G3**: `/audit-log` rota a 10.000 entradas. Si se necesita histórico largo, hay que archivar antes.
- **G4**: Sin tests automatizados, cualquier refactor sobre los puntos C1/C5/C15 requiere validación funcional manual.

## Siguiente fase recomendada

1. **Tests smoke** de los endpoints (basados en [CONTRATO_ENDPOINTS_CRITICOS](CONTRATO_ENDPOINTS_CRITICOS.md)).
2. **Validador de payload** en `/save-json` con whitelist de campos basada en [CONTRATO_JSON_ENGINE](CONTRATO_JSON_ENGINE.md).
3. **Validador de filas** sobre `engine_*.json`: comprobar invariantes (`qa_revision_estado` válido, no `descartar` persistido, etc.). Solo reporte, no modificación.
