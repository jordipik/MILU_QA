# Imagenes Esquemas Pipeline

## Estado
- OFFICIAL: modelo conceptual, responsabilidades de campos, formatos, directorios, idempotencia.
- OFFICIAL / ACTIVE: orquestador `rebuild_assets_for_record.py`.
- LEGACY: flujos mezclados que unen esquema base + POS + sync JSON sin separacion por fases.

## Objetivo
Definir el pipeline oficial de assets visuales de MILU separando:
- esquemas generales (sin circulo POS)
- esquemas_pos (con POS marcado)

Este pipeline debe ser incremental, idempotente, reparable, reutilizable y no destructivo.

## Alcance
Aplica a:
- runtime (`engine_*.json`)
- recompute por pasos
- rebuild offline (enriquecimiento de assets)
- QA visual
- export WordPress

## FASE A - ESQUEMAS GENERALES (OFFICIAL)
Responsabilidad: resolver imagenes base de esquema sin circulo.

Campo de salida:
- `esquemas`

Flujo:
1. Cargar registro (`engine`, `id` o alcance por libro/todos).
2. Resolver esquemas esperados por pagina/caja.
3. Comprobar existencia fisica en `esquemas/`.
4. Sincronizar JSON (`esquemas`) si hay diferencia.
5. Generar solo archivos faltantes (o forzados).

Regla:
- Si el archivo existe y el JSON ya coincide, no hacer nada.

## FASE B - ESQUEMAS_POS (OFFICIAL)
Responsabilidad: detectar POS dentro de esquemas base y generar imagen con circulo rojo.

Campos de salida:
- `esquemas_circulos_all`
- `esquemas_circulos`
- `ruta_esquemas_pos`
- `exp_imagenes` (agregacion exportable, sin duplicados)

Flujo:
1. Partir de esquemas generales existentes.
2. Buscar POS visualmente.
3. Comprobar existencia fisica en `esquemas_pos_circulos/`.
4. Generar solo archivos faltantes (o forzados).
5. Sincronizar JSON POS.
6. Actualizar `exp_imagenes` con la ruta principal POS.

Regla:
- Si el archivo existe y el JSON ya coincide, no hacer nada.
- Si el archivo existe pero JSON esta vacio/roto, sincronizar JSON sin regenerar.

## Responsabilidad por campo
| Campo | Responsabilidad |
| --- | --- |
| `esquemas` | imagenes generales |
| `esquemas_circulos_all` | todos los matches POS |
| `esquemas_circulos` | match principal POS |
| `ruta_esquemas_pos` | URL principal del match principal |
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
- No editar manualmente estos directorios salvo tarea explicita.

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

Capacidades validadas:
- inferencia automatica de pagina de esquema por metadatos `FG/FGS` + `BOM-No.`
- traza de inferencia para debug y QA: `[AUTO] pagina esquema inferida por metadatos FG/BOM: <page>`
  - equivalente documental: `[AUTO] inferred schema page from FG/BOM metadata`
- deteccion POS robusta en tokens OCR concatenados

## Logging estandar por registro
- `[AUTO] pagina esquema inferida por metadatos FG/BOM: <page>`
- `[OK] esquema existente`
- `[SYNC] json esquemas actualizado`
- `[GEN] esquema generado`
- `[OK] esquema_pos existente`
- `[GEN] esquema_pos generado`
- `[SYNC] json POS actualizado`
- `[MISS] pos no encontrado`

## Regla OCR actualizada para POS concatenados
Antes:
- coincidencia exacta del token OCR con el POS objetivo.

Ahora:
- se admite submatch numerico valido cuando el token OCR contiene el POS completo y la deteccion es consistente en el clip del esquema.
- ejemplo validado: `170155` contiene `155` y se acepta como match para POS `155`.

## Caso real validado - registro 000245
Datos:
- engine: `12V4000M40A`
- registro: `RB-12V4000M40A-000245`

Resultado:
- esquema detectado correctamente sin offset manual
- POS `155` detectado correctamente
- output generado: `12V4000M40A-0045-01-155.webp`

Persistencia JSON validada en `engine_12V4000M40A.json`:
- `esquemas_circulos_all`
- `esquemas_circulos`
- `ruta_esquemas_pos`
- `exp_imagenes`

## Validacion operativa
Dry-run registro:
- `python rebuild_assets_for_record.py --engine 12V4000M40A --id RB-12V4000M40A-000245 --dry-run`
- resultado esperado: sin regeneracion innecesaria, idempotencia correcta.

Write registro:
- `python rebuild_assets_for_record.py --engine 12V4000M40A --id RB-12V4000M40A-000245 --write`
- resultado esperado: imagen generada cuando falta, JSON persistido correctamente.

## Relacion con export WordPress
- Export depende de assets correctos y rutas consistentes.
- `exp_imagenes` depende de la sincronizacion de assets.
- `ruta_esquemas_pos` habilita export de esquema_pos.
- Se puede reparar JSON de assets sin regenerar imagenes.

## Riesgos historicos (LEGACY)
- Logica mezclada de deteccion de esquema base + deteccion POS + sync JSON.
- Regeneracion innecesaria por no reutilizar imagenes existentes.
- Inconsistencia entre estado de archivo y estado JSON.
- Mezcla conceptual entre `esquemas` y `esquemas_pos`.

## Vision objetivo
Sistema incremental, reparable y desacoplado de logica legacy, preparado para:
- recompute parcial
- QA visual
- rebuild
- sincronizacion incremental
- export WordPress
- regeneracion masiva controlada
