> **PROPUESTA — PENDIENTE DE VALIDAR**
>
> Propuesta de refactor del schema JSON de `engine_*.json`. Referenciada como DT-2 en [../PLAN_TRABAJO_MILU.md](../PLAN_TRABAJO_MILU.md). No implementada.
>
> Movido a `docs/proposals/` el 2026-05-12. **No representa el estado actual del código.**

---

# MILU JSON Schema Refactor Proposal

Fecha: 2026-05-05
Estado: Propuesta (sin cambios en pipeline ni en JSON existentes)

## 1) Diagnostico del estado actual

Resumen del analisis sobre JSON actuales del pipeline y legacy:

- Los `engine_*.json` son hoy la fuente runtime principal para QA y export QA-only.
- Existen datasets derivados con estructura distinta (`MILU_New_v506.json`, `MILU_Superseded_v506.json`, synthetic y outputs WordPress).
- Hay divergencia de naming para el mismo concepto (ej: `PART NO.`, `pn`, `pn_raw`, `pn_final`; `BOM-No.`, `BOM_no`, `bom_no`).
- Persisten campos historicos/legacy en datasets antiguos (`qa_index.json`, `df_116_bom.json` en `zz_old/`) y campos de soporte puntual de procesos (`*_pdf`, `depuracion_ts`, etc.) mezclados con campos de negocio.
- Hay tipos mezclados en campos clave en legacy (ej: `img_urls` string/array, `schema_urls` array/string, `ID` number/string).
- Muchos campos de media tienen alta tasa de vacio (`ruta_foto` especialmente), lo que sugiere moverlos a bloque opcional `media`.
- QA y export dependen de pocos campos estables (`qa_revision_estado`, `qa_revision_accion`, `pn`, designacion/peso/medida finales, trazabilidad de origen), pero actualmente conviven con gran cantidad de metadata heterogenea.

## 2) Listado de JSON encontrados y relevancia

### Runtime principal

- `engine_12V4000M40A.json` (2759 filas, 117 campos)
- `engine_12V4000M53.json` (6580 filas, 119 campos)
- `engine_12V4000M70.json` (5358 filas, 113 campos)
- `engine_16V4000M61.json` (4987 filas, 111 campos)
- `engine_16V4000M73.json` (12445 filas, 113 campos)
- `engine_16V4000M73L.json` (11128 filas, 112 campos)
- `engine_16V4000M90.json` (2851 filas, 113 campos)
- `engine_20V4000M93.json` (14643 filas, 113 campos)
- `engine_20V4000M93L.json` (7132 filas, 112 campos)

### Derivados / catalogos de referencia

- `MILU_New_v506.json` (3875 filas, 30 campos)
- `MILU_Superseded_v506.json` (2945 filas, 30 campos)
- `qa_synthetic_new.json` (5123 filas, 28 campos)
- `qa_synthetic_superseded.json` (638 filas, 29 campos)

### Export QA-only (WordPress)

- `data/output/wordpress/milu_wp_import.json` (3573 filas, 23 campos)
- `data/output/wordpress/milu_wp_superseded.json` (1890 filas, 23 campos)
- `data/output/wordpress/milu_wp_pending_review.json` (644 filas, 23 campos)
- `data/output/wordpress/milu_wp_discarded.json` (8 filas, 23 campos)

### Legacy (referencia historica)

- `zz_old/qa_index.json` (63914 filas, 62 campos)
- `zz_old/df_116_bom.json` (63914 filas, 69 campos)
- `zz_old/qa_web.html` y `zz_old/qa_articulos.html` consumen `qa_index.json` (no estan en runtime actual)

Nota sobre `qa_index.json` y `df_116_bom`:
- En el estado actual del repo, estan en `zz_old/` (legacy), no como fuente runtime actual.

## 3) Inventario de campos (resumen ejecutivo)

Se genero un inventario cuantitativo con:
- tipo detectado
- porcentaje de presencia
- numero de vacios
- ejemplos
- deteccion de duplicados probables
- senales legacy

Artefactos de auditoria recomendados (generados por script auxiliar):
- `docs/archived/MILU_JSON_FIELD_AUDIT_REPORT.md`
- `docs/archived/MILU_JSON_FIELD_AUDIT_REPORT.csv`

### 3.1 Campos conflictivos solicitados

| Campo | Tipo detectado | Presencia | Vacios (ejemplo base) | Ejemplos | Duplicado probable | Legacy | Uso principal sugerido |
|---|---|---:|---:|---|---|---|---|
| `PART NO.` | string/null | 100% en engines y `df_116_bom` | 1025/67883 (engines) | `70042500158`, `0049976736` | `pn`, `pn_raw`, `pn_final`, `part_no` | Parcial | QA, import, SUST, WordPress |
| `pn` | string/null | 100% en `qa_index`, 100% en New/Sup/WP | 1013/63914 (`qa_index`), 0/3875 (New) | `0049976736` | `PART NO.`, `pn_raw`, `pn_final` | No | Intercambio/export |
| `pn_raw` | string/null | 100% en engines y `df_116_bom` | 1025/67883 (engines) | `70042500158` | `PART NO.`, `pn` | No | Trazabilidad origen |
| `pn_clean` | no detectado en datasets auditados actuales | n/a | n/a | n/a | `pn_final` (conceptual) | Si (candidato) | Normalizacion puntual |
| `pn_final` | string/null | 100% en engines y `df_116_bom` | 1982/67883 (engines) | `0049976736` | `pn`, `PART NO.` | No | Canonico recomendado |
| `esquemas` | string/null | 100% engines/`df_116_bom` | 8334/67883 (engines) | `12V4000M40A-0012-01.png` | `schema_urls` | Parcial | Media/schema |
| `esquemas_circulos` | string/null | 100% engines/`df_116_bom` | 21236/67883 (engines) | `...-50.webp` | `ruta_esquemas_pos` | Parcial | Media/schema |
| `ruta_esquemas_pos` | string/null | 100% engines/`qa_index`/`df_116_bom` | 21236/67883 (engines) | URL webp | `esquemas_circulos`, `schema_urls` | No | Media/schema publish |
| `ruta_foto` | string/null | 100% en casi todos | 66751/67883 (engines) | URL jpg/jpeg | `img_urls`, `exp_imagenes` | No | Media |
| `img_urls` | string/array | 100% en `qa_index` | 17032/63914 | URL, lista URLs | `ruta_foto`, `exp_imagenes` | Si (legacy) | Media agregada |
| `schema_urls` | array/string | 100% en `qa_index` | 3007/63914 | lista URLs | `ruta_esquemas_pos` | Si (legacy) | Media schema agregada |
| `revision_estado` | no detectado literal | n/a | n/a | n/a | `qa_revision_estado` | Si | QA |
| `revision_accion` | no detectado literal | n/a | n/a | n/a | `qa_revision_accion` | Si | QA |
| `qa_revision_estado` | string | 100% engines + WP | 0 | `ok`, `pendiente`, `revisado` | `revision_estado` | No | QA/export decision |
| `qa_revision_accion` | string | 100% engines + WP | 0 | `importar`, `revisar`, `eliminar`, `mantener` | `revision_accion` | No | QA/export decision |
| `import_action` | no detectado literal | n/a | n/a | n/a | `qa_revision_accion` | Si (si aparece en otros procesos) | Import flow |
| `import_status` | no detectado literal | n/a | n/a | n/a | `qa_revision_estado` | Si (si aparece en otros procesos) | Import flow |
| `designation_gesa` | string/null | 100% engines/legacy | 10319/67883 (engines) | `VALVE DRAIN` | `DESIGNATION`, `designation_final` | No | GESA/QA |
| `dimensions_gesa` | string/null | 100% engines/legacy | 25893/67883 (engines) | `M 8 X 16` | `MEASUREMENT / STANDARD`, `measure_final` | No | GESA/QA/export |
| `weight_gesa` | number/null (engines), string/null (`qa_index`) | 100% engines/legacy | 10319/67883 (engines) | `0.165`, `1.302` | `WEIGHT`, `weight_final` | No | GESA/QA/export |
| `sust_status` | string/null | 100% engines/legacy | 40605/67883 (engines) | `NEW`, `SUPERSEDED` | `sust_hierarchie` | No | SUST |
| `sust_hierarchie` | string/null | 100% engines/legacy | 40605/67883 (engines) | `New`, `Superseded` | `Hierarchie` | Parcial (nombre) | SUST/export |
| `sust_new_part_number` | string/null | 100% engines/legacy | 40605/67883 (engines) | `0049976736` | `New Part Number`, `pn_new` | No | SUST/export |
| `sust_superseded_list` | string/null | 100% engines/legacy | 47194/67883 (engines) | lista PN | `old_pn_relacionados` | No | SUST/export |

### 3.2 Duplicados probables por nombre

Detectados por normalizacion de nombre de campo:

- `BOM-No.` / `BOM_no` / `bom_no`
- `DESIGNATION` / `designation`
- `FG/FGS` / `fg_fgs`
- `ID` / `Id`
- `MODEL/TYPE` / `model_type`
- `POS` / `pos`
- `QTY` / `qty`
- `Source Page` / `source_page`
- `UNITS` / `units`
- `WEIGHT` / `weight`

## 4) Propuesta de estructura canonica v2

Objetivo: separar identidad, origen, negocio, QA y metadata tecnica en bloques estables.

```json
{
  "id": {},
  "source": {},
  "engine": {},
  "bom": {},
  "pn": {},
  "gesa": {},
  "sust": {},
  "media": {},
  "import": {},
  "qa": {},
  "meta": {}
}
```

### 4.1 Esquema propuesto por bloque

```json
{
  "id": {
    "record_id": "string",
    "engine_file": "string",
    "legacy_row_id": "string|null"
  },
  "source": {
    "book_set": "string|null",
    "engine_model": "string",
    "source_page": "string|null",
    "source_pos": "string|null",
    "source_part_no": "string|null",
    "source_designation": "string|null",
    "source_weight": "string|null",
    "source_measurement_standard": "string|null"
  },
  "engine": {
    "engine_family": "string|null",
    "engine_model": "string",
    "model_type": "string|null"
  },
  "bom": {
    "bom_no": "string|null",
    "pos": "string|null",
    "qty": "string|null",
    "units": "string|null"
  },
  "pn": {
    "part_no_raw": "string|null",
    "part_no_normalized": "string|null",
    "part_no_final": "string|null"
  },
  "gesa": {
    "flag": "string|null",
    "designation": "string|null",
    "dimensions": "string|null",
    "weight": "number|string|null",
    "norm": "string|null",
    "normalized": "string|null"
  },
  "sust": {
    "status": "string|null",
    "hierarchy": "string|null",
    "new_part_number": "string|null",
    "superseded_list": "string|null"
  },
  "media": {
    "photo_url": "string|null",
    "image_urls": ["string"],
    "schema_urls": ["string"],
    "schema_pos_urls": ["string"],
    "schema_circle_urls": ["string"]
  },
  "import": {
    "decision": "string|null",
    "status": "string|null",
    "target_dataset": "string|null"
  },
  "qa": {
    "revision_estado": "string",
    "revision_accion": "string",
    "errors": {
      "pos": "number",
      "pn": "number",
      "designation": "number",
      "weight": "number",
      "measurement": "number",
      "norma": "number",
      "bom": "number",
      "total": "number"
    },
    "has_error": "boolean"
  },
  "meta": {
    "created_at": "string|null",
    "updated_at": "string|null",
    "depuracion_ts": "string|null",
    "schema_version": "string"
  }
}
```

## 5) Tabla de equivalencias campo_actual -> bloque_nuevo.campo_nuevo -> accion

| campo_actual | bloque_nuevo.campo_nuevo | accion |
|---|---|---|
| `ID` | `id.record_id` | renombrar |
| `engine_model` | `engine.engine_model` | mover |
| `book_set` | `source.book_set` | mover |
| `Source Page` | `source.source_page` | renombrar |
| `BOM-No.` | `bom.bom_no` | renombrar |
| `POS` | `bom.pos` | mover |
| `QTY` | `bom.qty` | mover |
| `UNITS` / `units` | `bom.units` | fusionar |
| `PART NO.` | `pn.part_no_raw` | mover |
| `pn_raw` | `pn.part_no_raw` | fusionar |
| `pn_final` | `pn.part_no_final` | renombrar |
| `pn` | `pn.part_no_final` | fusionar |
| `pn_clean` | `pn.part_no_normalized` | calcular |
| `DESIGNATION` | `source.source_designation` | mover |
| `designation_gesa` | `gesa.designation` | mover |
| `designation_final` | `pn.designation_final` (o `gesa/designation` segun decision) | revisar manualmente |
| `MEASUREMENT / STANDARD` | `source.source_measurement_standard` | mover |
| `dimensions_gesa` | `gesa.dimensions` | mover |
| `measure_final` / `measurement_final` | `pn.measurement_final` | fusionar |
| `WEIGHT` | `source.source_weight` | mover |
| `weight_gesa` | `gesa.weight` | mover |
| `weight_final` | `pn.weight_final` | mover |
| `norma` | `gesa.norm` | mover |
| `normalizado` | `gesa.normalized` | mover |
| `gesa` | `gesa.flag` | renombrar |
| `sust_status` | `sust.status` | renombrar |
| `sust_hierarchie` | `sust.hierarchy` | renombrar |
| `Hierarchie` | `sust.hierarchy` | fusionar |
| `sust_new_part_number` | `sust.new_part_number` | renombrar |
| `New Part Number` | `sust.new_part_number` | fusionar |
| `sust_superseded_list` | `sust.superseded_list` | renombrar |
| `ruta_foto` | `media.photo_url` | renombrar |
| `img_urls` | `media.image_urls` | renombrar |
| `schema_urls` | `media.schema_urls` | renombrar |
| `ruta_esquemas_pos` | `media.schema_pos_urls` | renombrar |
| `esquemas_circulos` | `media.schema_circle_urls` | renombrar |
| `qa_revision_estado` | `qa.revision_estado` | mover |
| `qa_revision_accion` | `qa.revision_accion` | mover |
| `revision_estado` | `qa.revision_estado` | fusionar |
| `revision_accion` | `qa.revision_accion` | fusionar |
| `import_action` | `import.decision` | mover |
| `import_status` | `import.status` | mover |
| `depuracion_ts` | `meta.depuracion_ts` | mover |
| `*_pdf` | `meta.pdf_auto.*` | mover |
| `qa_errors` / `qa_errors_active` | `qa.errors` (si se decide persistir) | revisar manualmente |

## 6) Campos candidatos a eliminar (post-validacion)

No eliminar en fase actual. Candidatos para retiro en fase final tras equivalencia 1:1:

- Alias duplicados de naming: `BOM_no`, `bom_no`, `model_type` duplicado de `MODEL/TYPE`, etc.
- Campos legacy de vistas antiguas: `img_urls`/`schema_urls` si `media.*` ya cubre y consumidores migrados.
- Campos de proceso temporal sin uso runtime: `*_pdf` (si quedan solo como evidencia de QA puntual), `detalle_cambio` (si se traslada a log dedicado).
- Campos tipograficos/historicos: `sust_hierarchie` (sustituido por `sust.hierarchy`).

## 7) Campos obligatorios minimos (v2)

Minimo para QA + export sin perdida funcional:

- `id.record_id`
- `id.engine_file`
- `engine.engine_model`
- `bom.pos`
- `pn.part_no_final`
- `pn.designation_final` (o equivalente final definido)
- `pn.measurement_final`
- `pn.weight_final`
- `qa.revision_estado`
- `qa.revision_accion`
- `qa.has_error`
- `meta.schema_version`

## 8) Campos opcionales (v2)

- Todo `media.*` (alta tasa de vacio en `ruta_foto` y variantes)
- `gesa.*` cuando no aplica fila GESA
- `sust.*` cuando no hay relacion de sustitucion
- `import.*` para flujos de publicacion
- `meta.pdf_auto.*` y metadata de trazas de procesos auxiliares

## 9) Riesgos de compatibilidad

- Consumidores legacy esperan claves planas exactas (`PART NO.`, `BOM-No.`, `qa_revision_*`).
- Pages legacy (`qa_web`, `qa_articulos`) dependen de `qa_index.json` plano.
- Export scripts actuales mezclan columnas historicas y nuevas; un corte abrupto rompe CSV/JSON de salida.
- Tipos mezclados (`array|string`) en legacy pueden romper comparaciones si no se normaliza al migrar.
- Doble mantenimiento temporal (legacy + v2) puede introducir drift si no se valida equivalencia automaticamente.

## 10) Plan de migracion por fases (propuesto, no ejecutado)

### Fase 1 - Generar v2 en paralelo

Crear en paralelo sin tocar readers actuales:

- `qa_index_v2.json`
- `import_records_v2.json`
- `new_records_v2.json`
- `superseded_records_v2.json`

Acciones:
- Generador de transformacion legacy -> v2.
- `meta.schema_version = "2.0.0"`.
- Reporte de diferencias por conteo y claves obligatorias.

### Fase 2 - Lectura dual en QA

- Adaptar readers para aceptar legacy o v2 (feature flag).
- Mantener payload de escritura legacy mientras se valida.
- Instrumentar logs de fallback cuando falte bloque/campo v2.

### Fase 3 - Validacion de equivalencia

- Comparar legacy vs v2 por PN/ID.
- Validar paridad en:
  - conteo de registros
  - decisiones QA (`estado/accion`)
  - decisiones de export (`import/pending/discarded/superseded`)
  - campos de negocio finales (pn/designation/weight/measurement)

### Fase 4 - Retiro controlado de legacy

- Congelar aliases legacy como solo lectura.
- Eliminar campos redundantes por lotes pequeños.
- Mantener ventana de rollback por version de schema.

## 11) Estrategia de transicion propuesta (sin ejecutar)

- No cambiar pipeline actual hasta tener reportes de equivalencia estables.
- Implementar transformador puro y determinista (sin side effects).
- Ejecutar validacion automatica por lote antes de cualquier cambio de lectores.
- Migrar consumidores en este orden:
  1. procesos offline de auditoria
  2. export QA-only
  3. UI QA principal
  4. legacy pages (si se mantienen)

## 12) Conclusiones

- La refactorizacion es viable sin ruptura si se hace con modo dual (legacy + v2) por fases.
- El mayor beneficio inmediato es separar claramente identidad, origen, negocio, QA y media.
- Los campos mas conflictivos ya estan identificados con metrica de presencia/tipo/vacios para priorizar decisiones.
- No se realizaron cambios en HTML, pipeline ni JSON existentes; solo auditoria y propuesta.

## 13) Script auxiliar de auditoria (propuesto, no ejecutado automatico)

Script creado:
- `scripts/dev/audit_json_fields.py`

Salida por defecto al ejecutarlo manualmente:
- `docs/archived/MILU_JSON_FIELD_AUDIT_REPORT.md`
- `docs/archived/MILU_JSON_FIELD_AUDIT_REPORT.csv`

Ejemplos de uso:

```bash
python scripts/dev/audit_json_fields.py
python scripts/dev/audit_json_fields.py --include-glob "data/output/**/*.json"
python scripts/dev/audit_json_fields.py --only-files --file zz_old/qa_index.json --file zz_old/df_116_bom.json
```
