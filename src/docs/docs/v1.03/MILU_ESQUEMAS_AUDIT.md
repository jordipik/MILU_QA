# MILU_ESQUEMAS_AUDIT

FASE 4.8 — Auditoria funcional de dominio ESQUEMAS.

Comparados:

- `POST /api/recompute-simple/rebuild-schemes-by-bom`
- `POST /api/recompute-simple/enrich-assets`
- `POST /api/esquemas/generate-one`
- `POST /api/recompute-simple/rebuild-schemes-circles-from-esquemas`

## Metodologia

1. Lectura de implementaciones en `server.js` y scripts Python invocados.
2. Ejecucion real en caso puntual:
   - `engine=12V4000M53`
   - `id=RB-12V4000M53-000732`
   - `dryRun=true`

## Resultados por endpoint

## A) `/api/recompute-simple/rebuild-schemes-by-bom`

Script backend:

- `rebuild_schemes_by_bom.py`

Payload ejecutado:

```json
{"engine":"12V4000M53","id":"RB-12V4000M53-000732","dryRun":true,"forceRegenerate":false}
```

Resultado clave:

- `records_processed=1`
- `records_changed=0`
- `schemes_found=2`
- `schemes_generated=0`
- `records_warn_nearest_group=1`

Responsabilidad real:

- Resolver/generar esquemas base por BOM en `esquemas/`.
- En `dryRun`, valida disponibilidad y matching sin escribir.

## B) `/api/recompute-simple/enrich-assets`

Script backend:

- `rebuild_assets_for_record.py`

Payload ejecutado:

```json
{"engine":"12V4000M53","id":"RB-12V4000M53-000732","dryRun":true,"backup":false}
```

Resultado clave:

- `recordsProcessed=1`
- `schemasLinked=2`
- `schemaPosLinked=1`
- `updatedRows=0`
- `dryRun=true`
- `backupApplied=false` (aunque `backupRequested` exista)

Dependencia observada en reporte:

- Usa PDF manual en `pdf/03-Libros_Marcos_modificados_a_mano/12V4000M53_clean_marcos_mod.pdf`.

Responsabilidad real:

- Enriquecer links de assets en engine (fotos/esquemas/esquema_pos), no generar esquema base como objetivo primario.

## C) `/api/esquemas/generate-one`

Script backend:

- `generate_esquema_pos.py` (nombre historico, uso real para esquema general)

Payload ejecutado:

```json
{
  "engine":"12V4000M53",
  "id":"RB-12V4000M53-000732",
  "pdf":"pdf/12V4000M53.pdf",
  "outDir":"esquemas",
  "dryRun":true,
  "writeImages":false,
  "overwrite":false,
  "pageOffset":-1,
  "dpi":200,
  "format":"png",
  "quality":90
}
```

Resultado clave:

- `ok=true`
- `report.status=generated`
- `report.filename=12V4000M53-0110-01.png`
- `report.reason=dry-run, no se escribio imagen`

Responsabilidad real:

- Generacion puntual (single ID) de esquema base, util para correccion fina o debug de un registro.

## D) `/api/recompute-simple/rebuild-schemes-circles-from-esquemas`

Script backend:

- `rebuild_schemes_circles_from_esquemas.py`

Payload ejecutado:

```json
{
  "engine":"12V4000M53",
  "id":"RB-12V4000M53-000732",
  "dryRun":true,
  "forceRegenerate":false,
  "useManualOverrides":true,
  "overridesJson":"rebuild_schemes_circles_manual_overrides.json"
}
```

Resultado clave:

- `ok=true`
- `totals_by_status={"OK_PARTIAL":1}`
- `dryRun=true`
- `useManualOverrides=true`

Responsabilidad real:

- Generar/actualizar esquemas POS (circulos) a partir de esquemas base.
- Consumir overrides manuales para forzar posiciones.

## Solapamientos reales

1. `rebuild-schemes-by-bom` y `generate-one`:
- Solapamiento funcional parcial (ambos generan esquema base).
- Diferencia legitima de escala: bulk vs single.

2. `enrich-assets` y `rebuild-schemes-by-bom`:
- Solapan en "tocar activos visuales", pero no en objetivo:
- `rebuild-schemes-by-bom` genera base.
- `enrich-assets` enlaza/normaliza referencias en JSON.

3. `rebuild-schemes-circles-from-esquemas` depende de output de base:
- Sin esquema base disponible, el POS no puede cerrar correctamente.

## Dependencias ocultas detectadas

1. Dependencia de PDF manual en carpeta `pdf/03-Libros_Marcos_modificados_a_mano` para algunos flujos de assets.
2. Dependencia de `rebuild_schemes_circles_manual_overrides.json` en POS para correcciones manuales.
3. Nombre engañoso del script `generate_esquema_pos.py` cuando se usa para esquema general (`/api/esquemas/generate-one`).

## Mapa de responsabilidades reales

- Fuente base de esquema (bulk): `/api/recompute-simple/rebuild-schemes-by-bom`.
- Fuente base de esquema (single): `/api/esquemas/generate-one`.
- Fuente POS desde base: `/api/recompute-simple/rebuild-schemes-circles-from-esquemas`.
- Enlace/normalizacion de assets en engine: `/api/recompute-simple/enrich-assets`.

## Veredicto

1. Los cuatro endpoints funcionan en prueba real (dryRun).
2. No son duplicados totales; hay solapamiento de superficie, pero responsabilidades distintas.
3. La deuda principal es de claridad de nombres y orquestacion (orden de pipeline), no de fallo funcional.
4. Para FASE 5 no hay bloqueo funcional; para FASE 9 conviene fusionar variantes POS y simplificar naming/entrypoints.