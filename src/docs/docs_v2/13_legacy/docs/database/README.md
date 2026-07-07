# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# MILU â€” Base de datos espejo SQLite

> **Estado**: Fase E (v1) + Fase F (capa de lectura HTTP).  
> **Naturaleza**: BD **espejo, regenerable y de solo lectura** respecto al runtime actual.  
> **La fuente de verdad sigue siendo los 9 `engine_*.json`.** SQLite no los reemplaza.

---

## Documentos

- [SQLITE_MIRROR_DESIGN.md](SQLITE_MIRROR_DESIGN.md) â€” diseÃ±o completo: objetivos, tablas, Ã­ndices, riesgos, plan de migraciÃ³n.
- [DB_READ_LAYER.md](DB_READ_LAYER.md) â€” capa HTTP read-only `/db/*` (Fase F).
- [DB_ANALYTICS_LAYER.md](DB_ANALYTICS_LAYER.md) â€” capa analytics + diagnÃ³stico `/db/analytics/*` y pÃ¡ginas `analytics_*.html` (Fase G).

## Artefactos

| Archivo | PropÃ³sito |
|---|---|
| [scripts/db/import_engines_to_sqlite.js](../../scripts/db/import_engines_to_sqlite.js) | Lee los 9 `engine_*.json` y regenera `data/db/milu_mirror.sqlite`. |
| [scripts/db/validate_sqlite_mirror.js](../../scripts/db/validate_sqlite_mirror.js) | Compara conteos JSON â†” BD y emite informe. |
| [scripts/db/sqlite_sample_queries.js](../../scripts/db/sqlite_sample_queries.js) | Ejecuta consultas de ejemplo y genera markdown. |

## Requisito

La capa SQLite necesita la dependencia [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3).

```powershell
npm install --save-dev better-sqlite3
```

Es la Ãºnica dependencia aÃ±adida por la Fase E. Se compila nativa la primera vez (requiere toolchain de C++ si Node no usa prebuilt).

## Comandos

```powershell
# 1. Generar/regenerar la BD desde los JSON
npm run db:import

# 2. Validar paridad con los JSON
npm run db:validate

# 3. Ejecutar consultas de ejemplo
npm run db:queries
```

Todos los scripts son seguros: **no modifican ningÃºn `engine_*.json`**.

## Salida

- BD: [data/db/milu_mirror.sqlite](../../data/db/milu_mirror.sqlite) (regenerable; puede borrarse y volverse a crear).
- Informes:
  - [data/output/validation/sqlite_mirror_validation.json](../../data/output/validation/sqlite_mirror_validation.json)
  - [data/output/validation/sqlite_mirror_validation.md](../../data/output/validation/sqlite_mirror_validation.md)
  - [data/output/validation/sqlite_sample_queries.md](../../data/output/validation/sqlite_sample_queries.md)

## Tablas

Detalle completo en [SQLITE_MIRROR_DESIGN.md Â§5](SQLITE_MIRROR_DESIGN.md#5-tablas).

| Tabla | Origen | RegeneraciÃ³n |
|---|---|---|
| `engines` | Uno por `engine_*.json` cargado. | DROP + CREATE en cada `db:import`. |
| `engine_rows` | Una fila por entrada del JSON. | DROP + CREATE en cada `db:import`. |
| `part_numbers` | Agregado por `pn_final`. | DROP + CREATE en cada `db:import`. |
| `qa_reviews` | Espejo del QA persistido en la fila (`source='engine_json'`). | DROP + CREATE en cada `db:import`. |
| `image_refs` | Referencias `foto` / `esquema` / `exp_imagenes`. | DROP + CREATE en cada `db:import`. |
| `import_runs` | HistÃ³rico de ejecuciones. | **Append-only** (no se borra). |

## Campos: persistidos vs derivados

| Tipo | Ejemplos | Origen |
|---|---|---|
| **Persistidos** (columnas) | `pn_final`, `qa_revision_estado`, `qa_revision_accion`, `sust_hierarchie`, `ruta_foto`, `ruta_esquemas_pos`, `raw_json`. | Copia directa del JSON. |
| **Derivados** (calculados en SQL) | `part_numbers.has_image`, `part_numbers.qa_decision`, `part_numbers.export_type`, `image_refs.is_placeholder`. | Calculados a partir de `engine_rows`. |
| **No proyectados** (solo en `raw_json`) | `measurement_final`, `wheight_final`, `qa_errors`, `qa_errors_active`, campos legacy `*_error`. | Disponibles vÃ­a `json_extract(raw_json, ...)`. |

## Limitaciones (Fase E)

- No se usa para servir requests. La UI sigue leyendo los JSON.
- No se sincroniza automÃ¡ticamente: tras un `/save-json` o `/apply-revision-to-engines`, hay que volver a ejecutar `npm run db:import` para refrescarla.
- No verifica existencia fÃ­sica de imÃ¡genes ni esquemas.
- No cruza con `qa_revision_server_data.json` (futura iteraciÃ³n).
- Single-writer: solo el importador escribe. Lectores son scripts locales.

## Antes de usar SQLite como fuente de verdad

1. `npm run db:validate` debe pasar con `ok: true` de forma sostenida tras cambios reales en JSON.
2. Migrar `/engines` y `/pn-review/list` a lectura desde BD bajo feature flag, validando paridad por request.
3. Mover persistencia QA a la BD con WAL y backups regulares.
4. AÃ±adir endpoint de export a JSON para no perder el formato canÃ³nico actual.
5. Evaluar motor objetivo (SQLite vs PostgreSQL/Supabase) segÃºn necesidades de concurrencia.

Plan completo en [SQLITE_MIRROR_DESIGN.md Â§9](SQLITE_MIRROR_DESIGN.md#9-plan-de-migraciÃ³n-futura-no-fase-e).

## Reglas de oro

- **No editar** `data/db/milu_mirror.sqlite` a mano.
- **No commitear** la BD generada (debe entrar en `.gitignore` si aÃºn no lo estÃ¡).
- **Regenerar** siempre desde JSON antes de cualquier anÃ¡lisis serio.
- **Si JSON y BD divergen â†’ la verdad estÃ¡ en JSON.**

