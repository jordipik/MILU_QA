# Imagenes Esquemas Pipeline

## Estado
- OFFICIAL: modelo conceptual, responsabilidades de campos, formatos, directorios, idempotencia.
- OFFICIAL / ACTIVE: orquestador `rebuild_assets_for_record.py` para sincronizacion/generacion incremental.
- LEGACY: flujos mezclados que unian descubrimiento de esquema + deteccion POS + sync JSON.

## Objetivo
Definir el pipeline oficial de imagenes de MILU separando:
- calculo de `esquemas` por BOM (fuente maestra)
- derivacion de circulos desde `esquemas + POS`

## Flujo oficial de imagenes
```text
PDF
 └─ BOM
      └─ bloque BOM continuo
            └─ esquemas
                  └─ POS
                        └─ esquemas_circulos
```

## Regla oficial para `esquemas`
- prioridad BOM por fila: `bom_final`, `BOM-No.`, `bom_pdf`.
- si BOM queda vacio: `esquemas = ""`.
- si BOM no existe en el mapa del PDF: `esquemas = ""`.
- los bloques BOM se forman por continuidad de paginas y firma BOM estable.
- no se parte un bloque por cantidad de esquemas.
- si un BOM aparece en paginas consecutivas, todas pertenecen al mismo bloque.

## FASE A - CALCULO DE ESQUEMAS POR BOM (OFFICIAL)
Responsabilidad: recalcular el campo `esquemas` por regla BOM.

Campo de salida:
- `esquemas`

Script de referencia:
- `rebuild_schemes_by_bom.py` (solo recalcula `esquemas`).

## FASE B - DERIVACION DE CIRCULOS DESDE ESQUEMAS + POS (OFFICIAL)
Responsabilidad: derivar campos de circulos usando `esquemas` ya resuelto.

Campos de salida:
- `esquemas_circulos_all`
- `esquemas_circulos`
- `ruta_esquemas_pos`
- `exp_imagenes` (opcional, segun flag)

Script de referencia:
- `rebuild_schemes_circles_from_esquemas.py`.

Regla clave:
- `esquemas_circulos*` y `ruta_esquemas_pos` son derivados de `esquemas + POS`.
- no determinan que esquemas pertenecen al registro.

## ASSETS runtime
Responsabilidad:
- consumir resultados previos (`esquemas` y derivados) y sincronizar enlaces/estado.
- no redefinir la regla de asignacion de `esquemas`.

Endpoint UI principal:
- `POST /api/recompute-simple/enrich-assets/start`

Estado/cancelacion de job:
- `GET /api/recompute-simple/enrich-assets/jobs/:jobId`
- `POST /api/recompute-simple/enrich-assets/jobs/:jobId/cancel`

Compatibilidad:
- `POST /api/recompute-simple/enrich-assets` queda como via sincronica.

## Responsabilidad por campo
| Campo | Responsabilidad |
| --- | --- |
| `esquemas` | fuente maestra calculada por BOM |
| `esquemas_circulos_all` | todos los matches POS derivados |
| `esquemas_circulos` | match principal POS derivado |
| `ruta_esquemas_pos` | URL principal derivada del match principal |
| `exp_imagenes` | agregacion exportable (foto + esquema_pos) |

## Formatos oficiales de nombre
- Esquema general: `BOOK-PAGE-XX.png`
  - Ejemplo: `12V4000M40A-0012-01.png`
- Esquema POS: `BOOK-PAGE-XX-POS.webp`
  - Ejemplo: `12V4000M40A-0012-01-80.webp`

## Directorios oficiales
- `esquemas/`
- `esquemas_pos_circulos/`

Regla operativa:
- no editar manualmente estos directorios salvo tarea explicita.

## Modo incremental por alcance (OFFICIAL / ACTIVE)
Script:
- `rebuild_assets_for_record.py`

Modos:
- registro: `python rebuild_assets_for_record.py --engine 12V4000M40A --id 1100400 --write`
- libro: `python rebuild_assets_for_record.py --engine 12V4000M40A --all-book --write`
- todos: `python rebuild_assets_for_record.py --all --write`

Flags:
- `--dry-run`
- `--write`
- `--force-regenerate`
- `--only-sync-json`

## Logging de referencia
- `rebuild_schemes_by_bom.py`: estados `MISS_NO_BOM`, `MISS_BOM_NOT_FOUND`, `MISS_NO_PAGE_FOR_GROUP`, `WARN_BOM_GROUP_BY_NEAREST_PAGE`, `OK`.
- `rebuild_schemes_circles_from_esquemas.py`: estados por derivacion de circulos y misses de POS/esquema.

## Relacion con export WordPress
- export depende de assets correctos y rutas consistentes.
- `exp_imagenes` depende de la sincronizacion de assets.
- `ruta_esquemas_pos` habilita export de esquema POS.
- se puede reparar JSON de assets sin regenerar imagenes.

## Riesgos historicos (LEGACY)
- logica mezclada de descubrimiento de esquema + deteccion POS + sync JSON.
- regeneracion innecesaria por no reutilizar imagenes existentes.
- inconsistencia entre estado de archivo y estado JSON.
- mezcla conceptual entre `esquemas` (fuente maestra) y campos derivados de circulos.
