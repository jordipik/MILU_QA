# MILU — Diseño de la base de datos espejo SQLite

> **Estado**: Fase E.1 — Diseño v1.  
> **Naturaleza**: BD **espejo, regenerable y de solo lectura** respecto al runtime actual.  
> **Fuente de verdad**: los 9 archivos `engine_*.json` siguen siendo canónicos. SQLite no los reemplaza.

---

## 1. Objetivo

Disponer de una capa relacional auditable sobre los datos de MILU para:

- consultas analíticas rápidas (top PN, cobertura de imágenes, conteos QA, etc.);
- soporte a futuros refactors (vista unificada, joins, agregados);
- preparar una migración limpia a un motor mayor (PostgreSQL / Supabase) cuando proceda;
- detectar discrepancias entre lo que dicen los JSON y lo que se asume en la app.

La BD se construye **por regeneración** a partir de los JSON. No se actualiza in-place.

## 2. Qué problemas resuelve

| Problema actual | Cómo lo resuelve la BD espejo |
|---|---|
| Conteos y filtros recorren ~70k filas en JS en cada carga. | Índices y `COUNT(*)` en SQL en ms. |
| Validaciones cruzadas (mismo PN en varios engines) son costosas. | `JOIN` directo sobre `engine_rows`. |
| Sin trazabilidad de imports / reproducibilidad. | Tabla `import_runs` con metadatos por ejecución. |
| Difícil exportar subsets para análisis offline. | Consultas SQL ad-hoc. |

## 3. Qué NO resuelve todavía (intencionado)

- **No es fuente de verdad**. La UI no la lee.
- **No persiste QA**. `qa_reviews` es una copia derivada; los cambios siguen yendo a `qa_revision_server_data.json` y a los `engine_*.json` vía endpoints existentes.
- **No reemplaza el export a WordPress**. El pipeline oficial sigue partiendo de los JSON.
- **No verifica existencia física** de imágenes ni esquemas.
- **No es multiusuario**. Acceso single-writer, single-reader desde scripts locales.

## 4. Diagrama lógico

```
                    ┌────────────────┐
                    │   engines      │ 1
                    │ (un engine_*)  │
                    └───────┬────────┘
                            │
                            │ 1..N
                            ▼
   ┌────────────┐     ┌─────────────┐     ┌───────────────┐
   │ qa_reviews │◄────│ engine_rows │────►│  image_refs   │
   │ (1:1 lógico│ N:1 │ (una fila   │ 1:N │  (foto / esq) │
   │  por fila) │     │  del JSON)  │     └───────────────┘
   └────────────┘     └──────┬──────┘
                             │ N:1 (vía pn_final)
                             ▼
                      ┌─────────────┐
                      │ part_numbers│  (agregado por pn_final)
                      └─────────────┘

   ┌────────────────┐
   │  import_runs   │  (metadatos de cada regeneración)
   └────────────────┘
```

## 5. Tablas

### 5.1 `engines`

Un registro por `engine_*.json` cargado.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `engine_model` | TEXT NOT NULL UNIQUE | `12V4000M53`, etc. |
| `filename` | TEXT NOT NULL | `engine_12V4000M53.json` |
| `row_count` | INTEGER NOT NULL | Filas importadas. |
| `imported_at` | TEXT NOT NULL | ISO 8601. |

Índices: PK sobre `id`, UNIQUE sobre `engine_model`.

### 5.2 `engine_rows`

Una fila por entrada del JSON.

| Columna | Tipo | Origen |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `engine_id` | INTEGER NOT NULL → engines.id | FK lógica. |
| `source_json_file` | TEXT NOT NULL | Para trazabilidad. |
| `source_row_id` | TEXT | Campo `ID` original (puede ser numérico o string). |
| `pn_final` | TEXT | `pn_final` o fallback `PART NO.` / `pn_raw`. |
| `part_no_raw` | TEXT | Campo `PART NO.` original. |
| `pos` | TEXT | `POS`. |
| `libro` | TEXT | `libro` / `LIBRO` si existe. |
| `source_page` | TEXT | `source_page` / `PAGINA`. |
| `designation_final` | TEXT | `designation_final` o `DESIGNATION`. |
| `measure_final` | TEXT | `measure_final` (canónico). |
| `weight_final` | TEXT | `weight_final` (canónico). |
| `sust_status` | TEXT | Crudo desde JSON. |
| `sust_hierarchie` | TEXT | `New` / `Superseded` / vacío. |
| `qa_revision_estado` | TEXT | `ok` / `pendiente` / vacío. |
| `qa_revision_accion` | TEXT | Según contrato. |
| `qa_revision_updated_at` | TEXT | ISO si presente. |
| `exp_imagenes` | TEXT | Crudo. |
| `ruta_foto` | TEXT | Crudo. |
| `ruta_esquemas_pos` | TEXT | Crudo. |
| `raw_json` | TEXT NOT NULL | JSON completo de la fila (auditoría). |

Índices:
- `idx_engine_rows_engine` (`engine_id`)
- `idx_engine_rows_pn` (`pn_final`)
- `idx_engine_rows_estado` (`qa_revision_estado`)
- `idx_engine_rows_accion` (`qa_revision_accion`)
- `idx_engine_rows_sust` (`sust_hierarchie`)

### 5.3 `part_numbers`

Agregado por `pn_final`. Útil para vistas globales sin escanear `engine_rows`.

| Columna | Tipo | Cálculo |
|---|---|---|
| `id` | INTEGER PK | |
| `pn_final` | TEXT NOT NULL UNIQUE | |
| `occurrences` | INTEGER | `COUNT(*)` |
| `engines_count` | INTEGER | `COUNT(DISTINCT engine_id)` |
| `has_gesa` | INTEGER 0/1 | true si alguna fila tiene `pn_gesa` no vacío. |
| `has_sust` | INTEGER 0/1 | true si alguna fila tiene `sust_hierarchie` no vacío. |
| `has_image` | INTEGER 0/1 | true si alguna fila tiene `ruta_foto` o `exp_imagenes` no placeholder. |
| `has_schema` | INTEGER 0/1 | true si alguna fila tiene `ruta_esquemas_pos` no vacío. |
| `qa_decision` | TEXT | Acción QA dominante (modo): mejor `importar` > `revisar` > `eliminar` > `copia` > vacío. Indicativo. |
| `export_type` | TEXT | `new` / `superseded` / `mixed` / `none` según `sust_hierarchie` agregado. |

Índices: UNIQUE `pn_final`, `idx_pn_qa` (`qa_decision`), `idx_pn_export` (`export_type`).

### 5.4 `qa_reviews`

Espejo del estado QA por fila. Permite cruzar contra `qa_revision_server_data.json` en una iteración futura.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER PK | |
| `engine_row_id` | INTEGER NOT NULL → engine_rows.id | |
| `qa_revision_estado` | TEXT | Copia. |
| `qa_revision_accion` | TEXT | Copia. |
| `qa_revision_updated_at` | TEXT | Copia. |
| `source` | TEXT | `engine_json` (en esta fase). Futuro: `revision_sync`. |

Índices: `idx_qa_row` (`engine_row_id`), `idx_qa_estado` (`qa_revision_estado`), `idx_qa_accion` (`qa_revision_accion`).

### 5.5 `image_refs`

Una fila por referencia de imagen / esquema asociada a una fila del engine.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER PK | |
| `engine_row_id` | INTEGER NOT NULL → engine_rows.id | |
| `kind` | TEXT NOT NULL | `foto`, `esquema`, `exp_imagenes`. |
| `value` | TEXT | Ruta o identificador crudo. |
| `is_placeholder` | INTEGER 0/1 | true si coincide con patrón `sin_imagen` / `placeholder`. |

Índices: `idx_img_row` (`engine_row_id`), `idx_img_kind` (`kind`), `idx_img_placeholder` (`is_placeholder`).

### 5.6 `import_runs`

Metadatos por ejecución del importador.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INTEGER PK | |
| `started_at` | TEXT NOT NULL | |
| `finished_at` | TEXT | |
| `source` | TEXT NOT NULL | `engine_json_v1`. |
| `total_files` | INTEGER | |
| `total_rows` | INTEGER | |
| `status` | TEXT | `ok` / `partial` / `error`. |
| `notes` | TEXT | Mensajes / errores resumidos. |

## 6. Criterios de normalización

- **3NF razonable**, no estricta: mantenemos `raw_json` para no perder ningún campo que la UI consume hoy.
- Campos canónicos del contrato se proyectan en columnas (filtros e índices rápidos).
- Campos legacy (`measurement_final`, `wheight_final`, `qa_errors*`) **no** se proyectan en columnas: si están en disco, quedan visibles a través de `raw_json`, pero no se promueven.
- `qa_reviews` se mantiene en tabla aparte porque su origen real es múltiple (`engine_*.json` + `qa_revision_server_data.json`); hoy solo se rellena con el primero.
- `image_refs` denormaliza imágenes para poder hacer `GROUP BY kind` y `WHERE is_placeholder = 0` sin recorrer texto.
- `part_numbers` es **estrictamente derivado**: se reconstruye en cada `db:import`. Cualquier divergencia se considera bug del importador.

## 7. Estrategia de regeneración

- Cada `npm run db:import`:
  1. abre `data/db/milu_mirror.sqlite` (lo crea si no existe);
  2. **DROP + CREATE** sobre las 5 tablas espejo (`engines`, `engine_rows`, `part_numbers`, `qa_reviews`, `image_refs`);
  3. `import_runs` se **conserva** (append-only) para histórico de ejecuciones;
  4. inserta dentro de una única transacción;
  5. ejecuta `VACUUM` y `ANALYZE` al final;
  6. registra fila final en `import_runs`.

- La BD es siempre **derivable**: si se corrompe, se borra el archivo y se vuelve a ejecutar.

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Divergencia BD ↔ JSON tras un guardado vía `/save-json`. | `db:validate` se ejecuta a demanda; la BD no se considera fresca entre imports. |
| `pn_final` con caracteres especiales / vacíos. | Fallback documentado en `engine_rows.pn_final`. Filas sin PN siguen en BD y `part_numbers` no las agrega. |
| Tamaño de `raw_json`. | Aceptable (~70k filas). `VACUUM` final. |
| Concurrencia con escrituras manuales del repo. | Single-writer: solo el script importador. Lectores son scripts de análisis. |
| Lock-in a `better-sqlite3`. | API encapsulada en `scripts/db/`; la migración a `node:sqlite` o a PG se haría en un único módulo. |

## 9. Plan de migración futura (no Fase E)

1. **Fase F (propuesta)**: añadir lectura paralela en endpoints `/engines` y `/pn-review/list` (feature flag `MILU_USE_SQLITE_READ=1`). Comparar resultados con JSON en runtime.
2. **Fase G (propuesta)**: mover persistencia QA de `qa_revision_server_data.json` a `qa_reviews` con WAL y backups; añadir endpoint de export a JSON para conservar el formato actual.
3. **Fase H (propuesta)**: evaluar migración a PostgreSQL / Supabase si se necesita acceso multiusuario o remoto. El esquema actual es compatible (`INTEGER` → `BIGINT`, `TEXT` → `TEXT`).
4. En cada fase: `db:validate` debe seguir pasando; cualquier regresión bloquea el avance.

## 10. Compromisos de esta fase

- ✅ Crear `data/db/milu_mirror.sqlite` desde cero a partir de los JSON.
- ✅ Validar paridad de conteos JSON ↔ BD.
- ✅ Publicar consultas de ejemplo.
- ❌ No tocar `server.js`.
- ❌ No tocar `engine_*.json`.
- ❌ No tocar la UI.
- ❌ No usar la BD para servir requests.
