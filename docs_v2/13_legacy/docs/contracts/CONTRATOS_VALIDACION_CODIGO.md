# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# ValidaciÃ³n de contratos contra cÃ³digo

> **CONTRATO MILU â€” v1** Â· Fase: CONTRATOS + ESTABILIDAD Â· No modifica cÃ³digo ni datos.
>
> Informe de discrepancias entre los contratos formales ([CONTRATO_JSON_ENGINE](CONTRATO_JSON_ENGINE.md), [CONTRATO_REVISION_QA](CONTRATO_REVISION_QA.md), [CONTRATO_EXPORT_WORDPRESS](CONTRATO_EXPORT_WORDPRESS.md), [CONTRATO_IMAGENES_ESQUEMAS](CONTRATO_IMAGENES_ESQUEMAS.md), [CONTRATO_ENDPOINTS_CRITICOS](CONTRATO_ENDPOINTS_CRITICOS.md)) y el cÃ³digo actual.
>
> **Ninguna correcciÃ³n de cÃ³digo se aplica en esta fase**. Solo detecciÃ³n y priorizaciÃ³n.

## Severidades

- **ðŸ”´ alta** â€” la inconsistencia puede causar datos divergentes en disco o decisiones errÃ³neas en export/UI.
- **ðŸŸ¡ media** â€” convivencia de variantes legacy; no rompe nada pero ensucia el modelo.
- **ðŸŸ¢ baja** â€” solo etiquetas UI o bÃºsquedas tolerantes; sin impacto en datos.

## Tabla principal

| # | Regla contractual | Severidad | Archivo(s) donde se cumple | Archivo(s) donde se contradice | Propuesta de correcciÃ³n | Tocar ahora |
|---|---|---|---|---|---|---|
| C1 | `measure_final` es canÃ³nico; `measurement_final` estÃ¡ obsoleto | ðŸŸ¡ media | Lectura prioriza `measure_final` con fallback en casi todo el cÃ³digo:<br>[js/qa-table.js#L153](../../js/qa-table.js)<br>[js/qa-checks.js#L180](../../js/qa-checks.js)<br>[js/pdf-viewer.js#L747](../../js/pdf-viewer.js)<br>[js/qa-milu.js#L1331](../../js/qa-milu.js)<br>[js/export-wordpress.js#L428](../../js/export-wordpress.js)<br>[recompute_engine_errors.js#L122](../../recompute_engine_errors.js)<br>[server.js#L137,L280](../../server.js) | El export escribe **ambos** campos en el output con valor idÃ©ntico: [scripts/export_wordpress_milu.js#L326](../../scripts/export_wordpress_milu.js) (campo `measurement_final`), [#L104,L216](../../scripts/export_wordpress_milu.js).<br>CSV headers incluyen `measurement_final` en [#L366](../../scripts/export_wordpress_milu.js).<br>El refactor v2 mantiene fallback: [scripts/refactor_engine_schema_v2.js#L81](../../scripts/refactor_engine_schema_v2.js). | (1) Dejar `measure_final` como Ãºnico canÃ³nico en outputs nuevos. (2) Mantener lectura tolerante a `measurement_final` durante el periodo de transiciÃ³n. (3) Eliminar la doble escritura en el export. (4) Limpiar `measurement_final` de `engine_*.json` en la prÃ³xima ejecuciÃ³n de [depuracion_json.py](../../depuracion_json.py). | **NO** â€” requiere migraciÃ³n de filas existentes y revisiÃ³n del export. |
| C2 | `wheight_final` NO existe / estÃ¡ prohibido | ðŸŸ¢ baja | Confirmado: no aparece en `engine_*.json` reales. Tampoco lo usa el runtime. | Ãšnica menciÃ³n: lista de campos del auditor offline [scripts/dev/audit_json_fields.py#L83](../../scripts/dev/audit_json_fields.py) (defensivo). | Mantener menciÃ³n solo como detector de regresiÃ³n histÃ³rica. | **NO** â€” innecesario. |
| C3 | `descartar` nunca se persiste; mapea a `(estado=ok, accion=eliminar)` | ðŸŸ¢ baja | Normalizador centralizado:<br>[js/revision.js#L98,L112](../../js/revision.js)<br>DecisiÃ³n API: [server.js#L1191-L1210](../../server.js)<br>Respuesta de status (read-only): [server.js#L1206,L1395](../../server.js) (`'ok\|eliminar': 'descartar'` solo traduce hacia la UI). | UI utiliza `'descartar'` como `action` en payloads y como label visible:<br>[js/pn-review.js#L112,L384](../../js/pn-review.js) â†’ llama a `applyDecision(detail, 'descartar')`. Esto es **correcto** (es el verbo de acciÃ³n, no el valor persistido); el servidor lo traduce.<br>Build distribuido: [dist/milu_publish/js/pn-review.js](../../dist/milu_publish/js/pn-review.js) (espejo). | Documentar explÃ­citamente que `'descartar'` es **verbo de acciÃ³n API** y no valor de campo. Considerar renombrar el verbo a `'eliminar'` para alinear UI â†” persistencia. | **NO** â€” el contrato lo declara expresamente y el cÃ³digo respeta la regla. Renombrar requerirÃ­a tocar UI y API juntas. |
| C4 | `qa_errors` y `qa_errors_active` **NO se persisten** | ðŸŸ¢ baja (cumple) | `stripLegacyQaFields()` borra ambos al guardar:<br>[server.js#L605-L620](../../server.js)<br>[apply_revision_to_engines.js#L73](../../apply_revision_to_engines.js)<br>[recompute_engine_errors.js#L212](../../recompute_engine_errors.js) | Filas histÃ³ricas en `engine_*.json` aÃºn pueden contener residuos hasta el prÃ³ximo guardado. | Ejecutar [depuracion_json.py](../../depuracion_json.py) o un script de barrido para eliminar de disco. | **NO** â€” se limpia naturalmente al ir guardando. |
| C5 | `*_error` y `has_error` son derivados â€” decisiÃ³n pendiente sobre si se persisten | ðŸŸ¡ media | Se calculan en [recompute_engine_errors.js](../../recompute_engine_errors.js) y `/recompute-qa-errors`. | Persisten en disco mezclados con campos canÃ³nicos. No hay normalizador que los strippe sistemÃ¡ticamente. | Decidir: o se mantienen como persistidos (y se documentan en CONTRATO_JSON_ENGINE) o se incluyen en `stripLegacyQaFields`. | **NO** â€” necesita decisiÃ³n de producto. |
| C6 | `sust_hierarchie` es ÃšNICO criterio New/Superseded | ðŸŸ¢ baja (cumple) | [scripts/export_wordpress_milu.js#L244-L250](../../scripts/export_wordpress_milu.js). | â€” | â€” | **NO**. |
| C7 | `sust_status = SI` NO decide Superseded | ðŸŸ¢ baja (cumple) | El export no lo usa para clasificar. | â€” | â€” | **NO**. |
| C8 | DecisiÃ³n por PN basada solo en QA humana | ðŸŸ¢ baja (cumple) | [scripts/export_wordpress_milu.js#L134-L181](../../scripts/export_wordpress_milu.js). | â€” | â€” | **NO**. |
| C9 | `qa_revision_estado âˆˆ {ok, pendiente}` y `qa_revision_accion âˆˆ {importar, revisar, eliminar, copia}` | ðŸŸ¢ baja (cumple) | Normalizadores [js/revision.js#L92-L112](../../js/revision.js). Aplicado en `/save-json`, `/apply-revision-to-engines`, `/pn-review/*/apply-decision`. | El export todavÃ­a considera variantes histÃ³ricas (`"en revision"`, `"en revisiÃ³n"`) en [scripts/export_wordpress_milu.js#L134-L165](../../scripts/export_wordpress_milu.js). | Mantener compatibilidad de lectura; documentar como deuda. | **NO**. |
| C10 | `exp_imagenes` es la fuente canÃ³nica de imÃ¡genes; `ruta_foto` es fallback | ðŸŸ¢ baja (cumple) | [server.js#L163-L168](../../server.js) (`parseImagesFromValue` + `uniq`). | â€” | â€” | **NO**. |
| C11 | `qa_imagenes.html` es solo lectura | ðŸŸ¢ baja (cumple) | No invoca `/save-json` ni `/apply-revision-to-engines`. | â€” | â€” | **NO**. |
| C12 | Endpoints `/pn/*` legacy deben responder 410 | ðŸŸ¢ baja (cumple) | Verificado en `server.js` (responden `{ok:false, legacy:true}`). | â€” | â€” | **NO**. |
| C13 | `qa_revision_sync.php` debe servir JSON, no el archivo PHP | ðŸŸ¢ baja (cumple) | Ruta Express registrada antes del static middleware. | Si en algÃºn despliegue se invierte el orden, el static servirÃ­a el archivo crudo. | Test smoke automatizado: `GET /qa_revision_sync.php` ha de devolver `Content-Type: application/json`. | **NO** â€” aÃ±adir como test futuro. |
| C14 | El export es idempotente sobre `engine_*.json` (no los modifica) | ðŸŸ¢ baja (cumple) | [scripts/export_wordpress_milu.js](../../scripts/export_wordpress_milu.js) solo lee engines y escribe en `data/output/wordpress/`. | â€” | â€” | **NO**. |
| C15 | `/save-json` deberÃ­a tener lista blanca de campos editables | ðŸŸ¡ media | Acepta cualquier campo. | [server.js](../../server.js) `/save-json` no filtra campos permitidos. | AÃ±adir lista blanca + validaciÃ³n de tipos en una fase posterior. | **NO** â€” fase 2 (smoke + payload validation). |
| C16 | Build `dist/milu_publish/` duplica todo el cÃ³digo | ðŸŸ¢ baja | Es un artefacto de empaquetado. | Contiene copias de `js/*` con las mismas (in)consistencias. | No editar a mano; regenerar cuando se haga refactor. | **NO**. |
| C17 | Doble escritura de `measurement_final` y `measure_final` en outputs CSV/JSON del export | ðŸŸ¡ media | â€” | [scripts/export_wordpress_milu.js#L325-L326](../../scripts/export_wordpress_milu.js) (objeto export) y [#L366](../../scripts/export_wordpress_milu.js) (header CSV). | Mantener solo `measure_final` en outputs nuevos cuando se haga refactor del script. | **NO** â€” riesgo de romper consumidores externos. |
| C18 | Datos legacy en `legacy/export_complex_ai/` no deben influir | ðŸŸ¢ baja | Carpeta archivada. | Aparece en algunas bÃºsquedas globales (`'descartar'`): [legacy/export_complex_ai/scripts/*](../../legacy/export_complex_ai/scripts/). | Ignorar. | **NO**. |

## Resumen ejecutivo

- **Cumple plenamente**: C2, C3, C4, C6â€“C14, C18 (13 reglas).
- **Convivencia documentada**: C1, C5, C17 (variantes `measurement_final`, `*_error`, doble write en export).
- **Mejoras pendientes (sin urgencia)**: C13 (test smoke PHP route), C15 (lista blanca en `/save-json`).
- **Nada bloqueante**.

## Lista priorizada de correcciones futuras

| Prioridad | AcciÃ³n | Riesgo si se hace |
|---|---|---|
| P1 | Test smoke automatizado para los endpoints crÃ­ticos (C13 y otros). | Bajo. Solo lectura. |
| P2 | ValidaciÃ³n de payloads en `/save-json` y `/apply-revision-to-engines` (C15). Empezar por whitelist de campos. | Bajo, si se mantiene fallback "permitir todo" mientras se itera. |
| P3 | Decidir status de `*_error` / `has_error`: persistidos o derivados (C5). | Medio. Afecta a lecturas en UI. |
| P4 | Plan de migraciÃ³n de `measurement_final` â†’ `measure_final` (C1, C17). | Medio-alto. Tocar export + filas existentes + clientes downstream. |
| P5 | Renombrar verbo API `'descartar'` â†’ `'eliminar'` para alinear UI y persistencia (C3). | Bajo en backend, medio en UI. |

## Reglas de oro tras esta validaciÃ³n

1. **Nada que persista en `engine_*.json` debe llamarse `measurement_final` en cÃ³digo nuevo** â€” usar `measure_final`.
2. **`'descartar'` solo como `action` en API**; jamÃ¡s como valor de `qa_revision_accion`.
3. **`qa_errors` y `qa_errors_active` nunca se leen de disco**: siempre se recalculan.
4. **`sust_hierarchie`** decide New/Superseded; `sust_status` solo informa.
5. **Cualquier nuevo endpoint** que escriba en disco debe respetar [CONTRATO_REVISION_QA Â§7](CONTRATO_REVISION_QA.md) y aparecer en [CONTRATO_ENDPOINTS_CRITICOS](CONTRATO_ENDPOINTS_CRITICOS.md).

## Riesgos generales (no actuar aÃºn)

- **G1**: Los `dist/milu_publish/js/*` divergirÃ¡n si se modifica solo `js/*`. Decidir si `dist/` es parte del repo activo.
- **G2**: La carpeta `data/output/wordpress/` se sobrescribe en cada export. Consumidores externos deben pull antes del prÃ³ximo run.
- **G3**: `/audit-log` rota a 10.000 entradas. Si se necesita histÃ³rico largo, hay que archivar antes.
- **G4**: Sin tests automatizados, cualquier refactor sobre los puntos C1/C5/C15 requiere validaciÃ³n funcional manual.

## Siguiente fase recomendada

1. **Tests smoke** de los endpoints (basados en [CONTRATO_ENDPOINTS_CRITICOS](CONTRATO_ENDPOINTS_CRITICOS.md)).
2. **Validador de payload** en `/save-json` con whitelist de campos basada en [CONTRATO_JSON_ENGINE](CONTRATO_JSON_ENGINE.md).
3. **Validador de filas** sobre `engine_*.json`: comprobar invariantes (`qa_revision_estado` vÃ¡lido, no `descartar` persistido, etc.). Solo reporte, no modificaciÃ³n.

