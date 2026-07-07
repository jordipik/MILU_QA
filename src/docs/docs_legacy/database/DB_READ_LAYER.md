# MILU — Capa de lectura HTTP sobre BD espejo (Fase F)

> **Estado**: Fase F (v1).
> **Naturaleza**: Capa HTTP **solo lectura** sobre la BD espejo SQLite creada en Fase E.
> **La fuente de verdad sigue siendo los 9 [`engine_*.json`](../../) en runtime.** Esta capa NO los sustituye.

---

## Qué es

La Fase F añade un router Express montado en `/db` que sirve **consultas read-only**
contra el espejo SQLite en [data/db/milu_mirror.sqlite](../../data/db/milu_mirror.sqlite).

- No abre la BD en escritura. Se aplica `PRAGMA query_only = ON`.
- No escribe en ningún `engine_*.json`.
- No interfiere con los endpoints existentes (`/save-json`, `/apply-revision-to-engines`,
  `/qa_revision_sync.php`, `/pn-review/*`, `/export/*`, etc.).
- Si la BD o el driver `better-sqlite3` no están disponibles, los endpoints devuelven
  un error JSON estructurado con `ok: false` y un `source: "sqlite_mirror"` claro.

## Artefactos

| Archivo | Propósito |
|---|---|
| [server/services/sqlite-mirror-read.js](../../server/services/sqlite-mirror-read.js) | Servicio: abre la BD en modo read-only y expone funciones de consulta. |
| [server/routers/db-read-router.js](../../server/routers/db-read-router.js) | Router Express montado en `/db`. |
| [tests/smoke/db-read-smoke.test.js](../../tests/smoke/db-read-smoke.test.js) | Tests HTTP que validan los endpoints contra `localhost:3000`. |

Integración en [server.js](../../server.js): un solo bloque `try/catch` que monta el
router justo después de `cors()` + `bodyParser` y **antes** del `express.static(__dirname)`,
para que `/db/*` responda JSON y no se confunda con servir ficheros estáticos.

## Endpoints

Todos los endpoints **GET**. Respuestas son JSON con `ok: true|false` y `source: "sqlite_mirror"`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/db/status` | Estado de la BD: ruta, tamaño, fecha de modificación, último import. |
| GET | `/db/summary` | Conteos globales: engines, total_rows, unique_pn, qa_reviews, image_refs, import_runs. |
| GET | `/db/engines` | Lista de los 9 motores con su `rows_count`. |
| GET | `/db/qa-summary` | Agregados de QA por `estado` y por `accion`. |
| GET | `/db/images-summary` | Totales de imágenes/esquemas/placeholders y desglose por `kind` (`image_refs`). |
| GET | `/db/export-candidates-summary` | Agregados por `export_type`, por `qa_decision` e importables. |
| GET | `/db/search?q=<texto>&limit=<n>` | Búsqueda LIKE en `part_numbers.pn_final`. `q` ≥ 2 chars, `limit` 1..500 (default 50). |
| GET | `/db/pn/:sku` | Detalle de un PN: agregados + hasta 500 filas en `engine_rows`. |
| (otros) | (cualquier método/ruta bajo `/db` no listada) | 405 `METHOD_NOT_ALLOWED`. |

### Ejemplo: `GET /db/status`

```json
{
  "ok": true,
  "source": "sqlite_mirror",
  "db_path": "data\\db\\milu_mirror.sqlite",
  "size_bytes": 310030336,
  "modified_at": "2026-05-12T20:51:13.844Z",
  "driver_available": true,
  "last_import": {
    "id": 1,
    "started_at": "2026-05-12T20:50:59.139Z",
    "finished_at": "2026-05-12T20:51:13.830Z",
    "total_files": 9,
    "total_rows": 67883,
    "status": "ok"
  }
}
```

### Ejemplo: `GET /db/summary`

```json
{
  "ok": true,
  "source": "sqlite_mirror",
  "engines": 9,
  "total_rows": 67883,
  "unique_pn": 5893,
  "qa_reviews": 0,
  "image_refs": 0,
  "import_runs": 1
}
```

### Ejemplo: `GET /db/search?q=05&limit=10`

```json
{
  "ok": true,
  "source": "sqlite_mirror",
  "q": "05",
  "limit": 10,
  "count": 10,
  "rows": [
    { "pn_final": "0050xxxxxxx", "total_rows": 2, "engines_with_pn": 1 }
  ]
}
```

### Formato de error

```json
{
  "ok": false,
  "source": "sqlite_mirror",
  "error": "DB_NOT_FOUND",
  "message": "data/db/milu_mirror.sqlite no existe. Ejecuta npm run db:import."
}
```

Códigos posibles de `error`:

| `error` | HTTP | Causa |
|---|---|---|
| `DB_NOT_FOUND` | 503 | El fichero `data/db/milu_mirror.sqlite` no existe. |
| `DRIVER_NOT_AVAILABLE` | 503 | `better-sqlite3` no se pudo cargar (no instalado o nativo no compila). |
| `INVALID_SKU` | 400 | El path param `:sku` está vacío o tiene formato inválido. |
| `QUERY_TOO_SHORT` | 400 | El parámetro `q` de `/db/search` tiene menos de 2 caracteres. |
| `METHOD_NOT_ALLOWED` | 405 | Método HTTP distinto de GET, o ruta `/db/*` no expuesta. |
| (genérico) | 500 | Error inesperado en la consulta SQL. |

## Qué NO permite la capa

- **No** ejecuta SQL arbitrario suministrado por el cliente.
- **No** escribe en la BD (`query_only = ON`).
- **No** modifica ningún `engine_*.json`.
- **No** abre rutas POST/PUT/DELETE.
- **No** expone rutas alternativas: cualquier método ≠ GET o ruta no documentada
  responde 405.

## Cómo regenerar la BD

```powershell
npm run db:import      # crea/recrea data/db/milu_mirror.sqlite desde los 9 engine_*.json
npm run db:validate    # valida paridad JSON ↔ BD (ok=true)
npm run db:queries     # consultas de ejemplo (informe en data/output/validation/)
```

Ver [docs/database/README.md](README.md) y [docs/database/SQLITE_MIRROR_DESIGN.md](SQLITE_MIRROR_DESIGN.md).

## Cómo validar paridad JSON ↔ BD

`npm run db:validate` produce:

- [data/output/validation/sqlite_mirror_validation.json](../../data/output/validation/sqlite_mirror_validation.json)
- [data/output/validation/sqlite_mirror_validation.md](../../data/output/validation/sqlite_mirror_validation.md)

Si `ok=false`, los endpoints `/db/*` pueden seguir respondiendo pero los conteos
no serán equivalentes a los JSON de runtime. **Regenerar antes de fiarse**.

## Cómo ejecutar los tests

Con el servidor levantado (`node server.js`) en `http://localhost:3000`:

```powershell
npm run test:db-read     # solo los smoke tests de la capa /db (10 tests)
npm run test:smoke       # smoke HTTP general (11 tests)
npm run test:all-smoke   # ambos
```

Variables opcionales:
- `MILU_BASE_URL` (default `http://localhost:3000`)
- `MILU_SMOKE_TIMEOUT_MS` (default `10000`)

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| BD desincronizada con los JSON. | `npm run db:validate` antes de cualquier uso "serio"; los endpoints exponen `last_import` en `/db/status`. |
| Driver nativo no disponible en otra máquina. | `getDbStatus()` y todos los endpoints devuelven `DRIVER_NOT_AVAILABLE` con 503; el resto del servidor sigue funcionando. |
| BD corrupta o esquema cambiado. | Cada consulta está en `safe()` que captura excepciones y devuelve `ok:false`. |
| SQL injection vía path `:sku` o query `q`. | Toda consulta usa parámetros de `better-sqlite3` (`?` + valor); `LIKE` con `ESCAPE '\\'` y los `%`/`_` escapados. |
| Conflicto con `/save-json` u otros endpoints. | El router solo expone rutas bajo `/db`; los demás endpoints quedan intactos. |

## Siguiente fase sugerida

**Fase G — Capa de operaciones SQL avanzadas (read-only)**:

- Endpoints específicos para análisis cruzado (`/db/cross-engine`, `/db/duplicates`,
  `/db/missing-images`) construidos sobre las mismas funciones puras del servicio.
- Cliente UI opcional (página interna `/db.html`) que use estos endpoints en lugar de
  recorrer JSON en memoria.
- Eventual sustitución del recorrido en runtime de los `engine_*.json` cuando se haya
  validado paridad continua durante varias semanas.
