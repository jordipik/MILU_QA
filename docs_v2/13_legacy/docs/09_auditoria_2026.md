# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# AuditorÃ­a Integral MILU â€” Mayo 2026

Documento de referencia con el diagnÃ³stico completo del proyecto realizado sobre la rama `feat/milu-auditoria-remediacion`.
Las cifras concretas (filas, completitud, tamaÃ±os) se obtuvieron directamente del repo en la fecha de la auditorÃ­a.

> Plan de remediaciÃ³n derivado: [10_plan_remediacion.md](10_plan_remediacion.md)
> Progreso ya aplicado en rama: [11_progreso_remediacion.md](11_progreso_remediacion.md)

---

## 1. Resumen Ejecutivo

MILU es una aplicaciÃ³n web local, monorepo, que mezcla:
- Un backend Express minimalista en [server.js](../server.js) que persiste en archivos JSON.
- Un frontend SPA basado en mÃ³dulos ES (`js/`) sobre [qa_milu.html](../qa_milu.html).
- Un pipeline offline en Python ([depuracion_json.py](../depuracion_json.py), [add_final_fields.py](../add_final_fields.py), etc.) que normaliza y recalcula los campos finales.
- 9 archivos `engine_*.json` que actÃºan como fuente de verdad de runtime (~215 MB en total, 67.882 filas).

El proyecto **funciona** y cumple su objetivo de QA, pero tiene deuda tÃ©cnica acumulada en cuatro frentes:

1. **Backend frÃ¡gil:** rutas duplicadas, archivos PHP en raÃ­z servidos como estÃ¡ticos, validaciÃ³n mÃ­nima.
2. **Datos masivos en memoria:** la SPA carga los 9 motores completos al iniciar.
3. **UX sobrecargada:** tabla de 54 columnas, 152 llamadas a `alert()`, controles densos.
4. **DocumentaciÃ³n desincronizada:** referencias a `8 motores` y al campo `measurement_final` ya retirado.

NingÃºn punto es bloqueante a corto plazo; todos son acumulativamente costosos de mantener.

---

## 2. DiagnÃ³stico por Ãreas

### 2.1 Backend / Servidor Express
- **Rutas duplicadas eliminadas:** existÃ­an tres `app.post('/recompute-pdf-auto', ...)` en [server.js](../server.js) que silenciosamente sobreescribÃ­an comportamiento; solo la Ãºltima quedaba activa.
- **Endpoint inexistente referenciado por la UI:** la UI llamaba a `/qa_revision_sync.php` y `/apply-revision-to-engines`. El primero caÃ­a en el static middleware y devolvÃ­a el archivo PHP fuente; el segundo daba 404.
- **Filtrado de PHP:** archivos `.php` en la raÃ­z se exponÃ­an como estÃ¡ticos. Riesgo bajo (no se ejecuta), pero filtra cÃ³digo fuente.
- **ValidaciÃ³n de payloads escasa:** `/save-json` y `/apply-revision-to-engines` aceptan campos sin esquema; un cliente malicioso local puede sobreescribir cualquier campo de cualquier motor por `ID`.
- **Sin tests automatizados:** `package.json` no define `scripts.test`; toda validaciÃ³n es manual.

### 2.2 Datos y Pipeline
- **9 motores reales** definidos en [engine_files.js](../engine_files.js): `12V4000M40A`, `12V4000M53`, `12V4000M70`, `16V4000M61`, `16V4000M73`, `16V4000M73L`, `16V4000M90`, `20V4000M93`, `20V4000M93L`. DocumentaciÃ³n previa decÃ­a 8.
- **Volumen:** 67.882 filas totales, ~215 MB en disco (todo se carga en cliente).
- **Completitud de campos finales** (medida sobre el conjunto):
  - `designation_final`: 98,16 %
  - `weight_final`: 90,83 %
  - `measure_final`: 64,56 % (campo mÃ¡s dÃ©bil)
  - `pn` ausente: 1.025 filas (1,5 %)
- **Renombrado pendiente:** `measurement_final` fue sustituido por `measure_final` en [depuracion_json.py](../depuracion_json.py#L346) y [add_final_fields.py](../add_final_fields.py#L275). El nombre antiguo todavÃ­a aparece en varios docs y en lecturas de fallback (`row.measure_final ?? row.measurement_final`).
- **Hardcoding de rutas:** [depuracion_json.py](../depuracion_json.py#L12) fija `base_dir = Path(r"c:\Users\jordi\source\repos\milu")`, lo que rompe portabilidad.
- **Backups en raÃ­z:** `engine_*.json.backup`, `*.pre_id_fix_backup` mezclados con datos vivos. DifÃ­cil distinguir vigente vs histÃ³rico.

### 2.3 Frontend
- **Estado global mutable:** [js/state.js](../js/state.js) expone un objeto compartido por todos los mÃ³dulos; los re-render son fÃ¡ciles de provocar accidentalmente.
- **Tabla de 54 columnas:** `colspan="54"` en [qa_milu.html](../qa_milu.html#L296). Imposible de usar sin `column-view` reducido.
- **152 `alert(...)`** distribuidos por los mÃ³dulos JS, bloquean el flujo de QA.
- **Carga inicial pesada:** `loadPartitionedEngineData()` baja los 9 motores en paralelo antes de pintar nada; sin paginaciÃ³n ni virtualizaciÃ³n, el render de tabla con miles de filas depende del filtro inicial.
- **Sin tipado / sin lint configurado** en `package.json`.

### 2.4 UX / UI
- Filtros densos en cabecera y panel lateral, varios duplicados entre la tabla principal y `analista_02`.
- Acciones crÃ­ticas (eliminar revisiÃ³n, recalcular) sin confirmaciÃ³n tipada.
- Mezcla de etiquetas en espaÃ±ol/inglÃ©s en columnas y formularios.
- Botones rÃ¡pidos `V / ? / X / OK / Clear` no estÃ¡n documentados in situ; su mapping vive sÃ³lo en [js/qa-milu.js](../js/qa-milu.js).

### 2.5 Rendimiento
- **Cliente:** todo en memoria. Sin virtualizaciÃ³n; el browser sostiene >67k filas hidratadas.
- **Servidor:** Express sin compresiÃ³n activada, sin cachÃ© de JSON, sin streaming. Cada lectura abre y parsea el archivo entero del motor afectado.
- **Pipeline Python:** secuencial; cada ejecuciÃ³n reescribe los 9 motores (sin diff incremental).

### 2.6 SEO / accesibilidad
- App pensada como herramienta interna; aun asÃ­, el HTML carece de `<meta description>`, jerarquÃ­a de `h1/h2` consistente y atributos `aria-*` en los controles principales.
- No es objetivo del proyecto, pero conviene mejorar accesibilidad bÃ¡sica para uso interno.

### 2.7 Arquitectura
- Monorepo sin separaciÃ³n clara de responsabilidades:
  - Backend Node, frontend ES modules y scripts Python conviven en la raÃ­z.
  - `dist/`, `esquemas/`, `fotos_*` y JSON crudos comparten directorio con los `engine_*.json` activos.
- No hay capa de servicios (`services/`, `domain/`); la lÃ³gica de negocio vive en mÃ³dulos JS grandes (`qa-milu.js`, `qa-table.js`, `revision.js`).
- No hay versionado de los datos: cada cambio sobrescribe el JSON.

### 2.8 DocumentaciÃ³n
- `docs/` es bastante completa pero contiene referencias desactualizadas:
  - [02_data_flow.md](02_data_flow.md) menciona "8 engine_*.json" (corregido en esta auditorÃ­a).
  - [03_data_models.md](03_data_models.md) listaba `measurement_final` como campo final (corregido).
  - [00_overview.md](00_overview.md) y [AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md) repetÃ­an el "8 motores" (corregido).
- README principal del repo se actualizÃ³ en commit `742ca003` (8â†’9, nuevos endpoints).

### 2.9 Incoherencias detectadas
| # | Incoherencia | Estado |
|---|--------------|--------|
| 1 | Triple definiciÃ³n de `/recompute-pdf-auto` | Resuelto en `742ca003` |
| 2 | UI llama a `/qa_revision_sync.php` no implementado en Express | Resuelto en `742ca003` |
| 3 | UI llama a `/apply-revision-to-engines` inexistente | Resuelto en `742ca003` |
| 4 | Docs hablan de 8 motores; runtime tiene 9 | Resuelto en esta auditorÃ­a |
| 5 | `measurement_final` documentado, runtime usa `measure_final` | Resuelto en esta auditorÃ­a |
| 6 | `analista_02.js` usa `descartar`; UI principal usa `eliminar` | Pendiente |
| 7 | Path absoluto hardcoded en `depuracion_json.py` | Pendiente |
| 8 | Archivos `.php` servidos como estÃ¡ticos | Resuelto en `742ca003` (handlers explÃ­citos) |

---

## 3. Lista de Problemas Priorizada

### CrÃ­ticos (impacto funcional o de seguridad)
- C1. ValidaciÃ³n insuficiente en endpoints de escritura.
- C2. Carga completa de 215 MB en cliente bloquea cualquier escalado de datos.
- C3. Ausencia total de tests; cualquier refactor es de alto riesgo.

### Altos (mantenibilidad)
- A1. Tabla con 54 columnas y `column-view` como Ãºnica vÃ­a de uso real.
- A2. 152 `alert()` que bloquean el flujo de QA.
- A3. Path absoluto en pipeline Python.
- A4. Mezcla de backups y datos vivos en raÃ­z.

### Medios (consistencia)
- M1. Inconsistencia `descartar` vs `eliminar` entre analista_02 y UI principal.
- M2. Nombres de columnas y etiquetas mezclando idiomas.
- M3. Falta de un esquema (`schema.json`) para validar `engine_*.json`.

### Bajos (cosmÃ©tico)
- B1. Falta de `meta` SEO/accesibilidad.
- B2. Sin lint ni formatter configurado.
- B3. DocumentaciÃ³n dispersa entre `README.md`, `docs/` y `memories/repo/`.

---

## 4. MÃ©tricas Verificadas

- Filas totales: **67.882**
- Filas sin `pn`: **1.025**
- `designation_final` no vacÃ­o: **98,16 %**
- `weight_final` no vacÃ­o: **90,83 %**
- `measure_final` no vacÃ­o: **64,56 %**
- Engines: **9** (`engine_files.js`)
- TamaÃ±o aproximado en disco: **~215 MB** (suma de los 9 JSON activos)
- Llamadas `alert(` en `js/`: **152**
- Columnas en tabla principal: **54** (`colspan="54"` en [qa_milu.html](../qa_milu.html#L296))

---

## 5. ConclusiÃ³n

El proyecto estÃ¡ en un punto donde una iteraciÃ³n de remediaciÃ³n moderada (sin reescribir nada) puede:
- Reducir riesgo (validaciÃ³n + tests mÃ­nimos).
- Mejorar UX (suprimir `alert`, modo "vista compacta" por defecto).
- Estabilizar el pipeline (path configurable, snapshots versionados).
- Alinear documentaciÃ³n con cÃ³digo.

El plan concreto vive en [10_plan_remediacion.md](10_plan_remediacion.md).

