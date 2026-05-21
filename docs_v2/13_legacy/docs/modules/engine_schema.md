# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# DT-2: Esquema JSON formal para engine_*.json

## Estado

`IMPLEMENTADO` â€” 2026-05-13

## Ficheros producidos

| Fichero | DescripciÃ³n |
|---|---|
| `schemas/engine-record.schema.json` | Esquema JSON Schema draft-07, fuente formal de verdad |
| `scripts/validate-engine-schema.js` | Validador Node.js sin dependencias externas |
| `tests/smoke/engine-schema.test.js` | Test formal del esquema (8 casos) |

## Uso rÃ¡pido

```bash
# Validar todos los engines
npm run validate:schema

# Validar un engine concreto
node scripts/validate-engine-schema.js engine_12V4000M40A.json

# Validar con detalle de filas fallidas
node scripts/validate-engine-schema.js engine_12V4000M40A.json

# Solo resumen (para CI)
node scripts/validate-engine-schema.js --summary

# Ejecutar test formal
node --test tests/smoke/engine-schema.test.js
```

## Resultado actual

```
âœ“ engine_12V4000M40A.json     2759 registros  OK
âœ“ engine_12V4000M53.json      6580 registros  OK
âœ“ engine_12V4000M70.json      5358 registros  OK
âœ“ engine_16V4000M61.json      4987 registros  OK
âœ“ engine_16V4000M73.json     12445 registros  OK
âœ“ engine_16V4000M73L.json    11128 registros  OK
âœ“ engine_16V4000M90.json      2851 registros  OK
âœ“ engine_20V4000M93.json     14643 registros  OK
âœ“ engine_20V4000M93L.json     7132 registros  OK

Ficheros: 9 | Registros totales: 67883 | Errores schema: 0
```

---

## Estructura del esquema

### VersiÃ³n

`$id`: `https://milu.local/schemas/engine-record/v1.0`  
Draft: JSON Schema draft-07

Campo opcional `_schema_version` (string, pattern `\d+\.\d+`) para migraciones futuras.

### Campos required

| Campo | Tipo | DescripciÃ³n |
|---|---|---|
| `ID` | `string\|integer` | Identificador Ãºnico. Puede ser numÃ©rico o string numÃ©rico (legacy) |
| `engine_model` | `string` (enum) | Motor al que pertenece el registro |
| `has_error` | `boolean` | `true` si `total_error > 0` |
| `total_error` | `integer >= 0` | Suma de todos los contadores de error |
| `qa_revision_estado` | `string` (enum) | Estado de revisiÃ³n QA |
| `qa_revision_accion` | `string` (enum) | AcciÃ³n de revisiÃ³n QA |

### Grupos de campos

#### Datos BOM raw (source of truth: Excel/BOM)

| Campo | Tipo | Notas |
|---|---|---|
| `POS` | `string\|null` | PosiciÃ³n original |
| `PART NO.` | `string\|null` | Part number original |
| `DESIGNATION` | `string\|null` | DenominaciÃ³n original |
| `QTY` | `string\|null` | Cantidad |
| `UNITS` | `string\|null` | Unidades |
| `WEIGHT` | `string\|null` | Peso con unidades (ej. "15 G") |
| `FN` | `string\|null` | CÃ³digo funciÃ³n |
| `MEASUREMENT / STANDARD` | `string\|null` | Medida/norma BOM |
| `FG/FGS` | `string\|null` | CÃ³digo FG/FGS |
| `BOM-No.` | `string\|null` | NÃºmero BOM |
| `Source Page` | `number\|string\|null` | PÃ¡gina fuente (legacy: string) |
| `MODEL/TYPE` | `string\|null` | Modelo/tipo BOM |
| `engine_model` | `string` (enum) | Motor |
| `source_file` | `string\|null` | Fichero Excel fuente |

#### Campos derivados/finales (calculados por `depuracion_json.py` + `add_final_fields.py`)

| Campo | Tipo | Notas |
|---|---|---|
| `pn_raw` | `string\|null` | PN antes de normalizaciÃ³n |
| `pn_final` | `string\|null` | **Editable**. PN definitivo |
| `criterio_pn` | `string` (enum)\|null | Criterio de normalizaciÃ³n |
| `pos_final` | `number\|string\|null` | PosiciÃ³n normalizada |
| `designation_final` | `string\|null` | **Editable**. DenominaciÃ³n final |
| `measure_final` | `string\|null` | **Editable**. Medida final. Alias: `measurement_final` |
| `weight_final` | `string\|null` | **Editable**. Peso final |
| `norma_final` | `string\|null` | Norma final |
| `qty_final` | `string\|null` | Cantidad final |
| `qty_units_final` | `string\|null` | Unidades finales |
| `model_final` | `string\|null` | Modelo final |
| `MODEL/TYPE_final` | `string\|null` | Modelo/tipo final |
| `depuracion_ts` | `string (date-time)\|null` | Timestamp depuraciÃ³n |

> **Regla `measure_final`**: prioridad `dimensions_gesa` si existe; si no, usa `MEASUREMENT / STANDARD`.  
> NormalizaciÃ³n: colapsar espacios mÃºltiples (ej. `A  55   X  5` â†’ `A 55 X 5`).

#### Campos de error (calculados por `add_final_fields.py`)

| Campo | Tipo | Notas |
|---|---|---|
| `pos_error` | `integer >= 0` | Contador errores posiciÃ³n |
| `pn_error` | `integer >= 0` | Contador errores PN |
| `designation_error` | `integer >= 0` | Contador errores denominaciÃ³n |
| `weight_error` | `integer >= 0` | Contador errores peso |
| `measurement_error` | `integer >= 0` | Contador errores medida |
| `norma_error` | `integer >= 0` | Contador errores norma |
| `bom_error` | `integer >= 0` | Contador errores BOM |
| `total_error` | `integer >= 0` | Suma de todos |
| `has_error` | `boolean` | `true` si `total_error > 0` |

#### Campos QA/revisiÃ³n

| Campo | Tipo | Editable | Enum/Notas |
|---|---|---|---|
| `qa_revision_estado` | `string` | âœ… | `"ok"`, `"pendiente"` |
| `qa_revision_accion` | `string` | âœ… | `"importar"`, `"revisar"`, `"copia"`, `"eliminar"` |
| `qa_revision_updated_at` | `string (date-time)` | âœ… | ISO 8601 |
| `qa_revision_confianza` | `number 0-1\|null` | â€” | Score auto-revisiÃ³n |
| `qa_revision_motivo` | `string\|null` | â€” | Motivo auto-revisiÃ³n |
| `qa_revision_origen` | `string\|null` | â€” | `"auto"` u otro |
| `qa_revision_regla_aplicada` | `string\|null` | â€” | CÃ³digo de regla |
| `qa_revision_fecha` | `string (date-time)\|null` | â€” | Timestamp revisiÃ³n auto |

#### Campos catÃ¡logo GESA

| Campo | Tipo | Notas |
|---|---|---|
| `gesa` | `"SI"\|"NO"\|null` | Â¿Existe en GESA? |
| `designation_gesa` | `string\|null` | DenominaciÃ³n GESA |
| `nsn` | `string\|null` | NATO Stock Number |
| `normalizado` | `"SI"\|"NO"\|null` | Â¿ArtÃ­culo normalizado? |
| `dimensions_gesa` | `string\|null` | Dimensiones GESA (prioridad para `measure_final`) |
| `weight_gesa` | `number\|string\|null` | Peso GESA (puede ser numÃ©rico o string legacy) |
| `units` | `string\|null` | Unidades (ej. "KGM") |
| `existeix_gesa` | `boolean\|null` | Flag presencia en GESA |

#### Campos catÃ¡logo Sustituciones (SUST/MTU)

| Campo | Tipo | Notas |
|---|---|---|
| `existeix_sust_new` | `boolean\|null` | Â¿Existe como New PN? |
| `existeix_sust_old` | `boolean\|null` | Â¿Existe como Superseded PN? |
| `New Part Number` | `string\|null` | Nuevo PN MTU |
| `Superseded Part Number` | `string\|null` | PN supersedido MTU |
| `Hierarchie` | `"New"\|"Superseded"\|null` | â€” |
| `Replacement Type` | `"F"\|"I"\|null` | Tipo reemplazo MTU |
| `sust_status` | `string\|null` | `"SI"` o `""` |
| `sust_hierarchie` | `"New"\|"Superseded"\|null` | â€” |
| `sust_new_part_number` | `string\|null` | PN nuevo del SUST |
| `sust_superseded_list` | `string\|null` | Lista supersedidos (serializado) |
| `pn_new` | `string\|null` | Nuevo PN |
| `pn_recomendado` | `string\|null` | PN recomendado |

#### Campos de comparaciÃ³n PDF

Todos opcionales, pueden ser `null`. Sufijo `_pdf`.

`pos_pdf`, `pn_pdf`, `designation_pdf`, `qty_pdf`, `units_pdf`, `bom_pdf`,  
`normalizado_pdf`, `sust_new_part_number_pdf`, `weight_pdf`, `measure_pdf`,  
`norma_pdf`, `fn_pdf`, `gesa_pdf`, `model_type_pdf`, `sust_superseded_list_pdf`

> **Nota legacy**: `normalizado_pdf` y `gesa_pdf` pueden tener valor `"No"` (minÃºscula) en datos legacy.

#### Campos imagen/esquema

| Campo | Tipo | Notas |
|---|---|---|
| `filename_foto` | `string\|null` | Nombre fichero foto |
| `ruta_foto` | `string\|null` | Ruta relativa foto |
| `exp_imagenes` | `string\|null` | **Editable**. JSON serializado de exportaciÃ³n |
| `esquemas` | `string\|null` | Esquemas elÃ©ctricos (serializado) |
| `esquemas_circulos` | `string\|null` | CÃ­rculos activos (serializado) |
| `esquemas_circulos_all` | `string\|null` | Todos los cÃ­rculos (serializado) |
| `ruta_esquemas_pos` | `string\|null` | Rutas por posiciÃ³n (serializado) |

#### Campos calculados adicionales

| Campo | Tipo | Notas |
|---|---|---|
| `status` | `string` (enum)\|null | Estado catÃ¡logo: `EMPTY`, `NOISE`, `OK_GESA`, `OK_SUST_NEW`, `OK_SUST_OLD`, `REVISAR` |
| `fg_code` | `number\|null` | CÃ³digo numÃ©rico FG |
| `fgs_description` | `string\|null` | DescripciÃ³n FGS |
| `fgs_code_description` | `string\|null` | FG+FGS combinado |
| `precio` | `number\|null` | Precio de referencia |
| `book_set` | `string` (enum)\|null | Set de libros (= `engine_model`) |
| `detalle_cambio` | `string\|null` | Detalle del cambio de PN |

---

## Campos legacy / deprecated

| Campo | Estado | Notas |
|---|---|---|
| `fn_final` | Legacy | Solo valores `"EM"` o `"xxxxx"`. Puede no aparecer |
| `fg_fgs_pdf` | Legacy | Solo en algunos engines |
| `sust_status_pdf` | Legacy | Solo en algunos engines |
| `atributo2` | Legacy | Valor observado: `"Actualizados"` |
| `qa_errors` | **Deprecated** | Eliminado por `stripLegacyQaFields()` en apply-revision |
| `qa_errors_active` | **Deprecated** | Idem |

---

## Aliases de campo

| Alias | Campo canÃ³nico | GestiÃ³n |
|---|---|---|
| `measurement_final` | `measure_final` | `FIELD_ALIASES` en `server/validation/allowed-fields.js` |

---

## Campos editables vÃ­a `/save-json`

Solo estos campos pueden ser modificados por el endpoint de ediciÃ³n puntual:

| Campo | Grupo |
|---|---|
| `qa_revision_estado` | QA |
| `qa_revision_accion` | QA |
| `qa_revision_updated_at` | QA |
| `designation_final` | Operacional |
| `measure_final` | Operacional |
| `weight_final` | Operacional |
| `pn_final` | Operacional |
| `exp_imagenes` | Operacional |

Campos prohibidos (inmutables): `engine_model`, `id`, `raw_json`, `source_json_file`, y todos los `*_error`.

---

## Notas de compatibilidad

1. **`ID` puede ser string o integer**: legacy contiene IDs numÃ©ricos como strings. El validador acepta ambos.
2. **`weight_gesa` puede ser number o string**: datos GESA incluyen pesos numÃ©ricos (kg) y strings legacy.
3. **`pos_final` puede ser number, string o null**: algunos engines tienen posiciones como strings.
4. **`Source Page` puede ser number o string**: legacy inconsistente.
5. **`qa_revision_updated_at` no es required**: registros pre-revisiÃ³n no tienen este campo.
6. **`additionalProperties: true`**: el esquema no rechaza campos extra para no bloquear evoluciÃ³n futura.

---

## IntegraciÃ³n futura

- **Snapshots (DT-3)**: el esquema sirve de base para validar snapshots antes de merge.  
- **CI estricto (DT-4+)**: cuando todos los engines sean conformes, activar validaciÃ³n en `npm run check`.  
- **Python tooling**: `depuracion_json.py` y `add_final_fields.py` pueden incorporar validaciÃ³n opcional usando el mismo esquema (vÃ­a `jsonschema` o validaciÃ³n manual).

