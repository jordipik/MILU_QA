# MILU_SCHEMES_FINAL_STATUS

Fecha: 2026-06-05

## Referencias cruzadas

- [MILU_SYSTEM_AUDIT.md](MILU_SYSTEM_AUDIT.md)
- [MILU_V103_CLOSURE_REPORT.md](MILU_V103_CLOSURE_REPORT.md)

## Objetivo

Cerrar documentalmente Fase 9 sin cambios de logica.

## Componentes oficiales (declaracion)

### OFICIAL

- rebuild_schemes_by_bom.py
  - Endpoint principal bulk: POST /api/recompute-simple/rebuild-schemes-by-bom
  - Rol: generacion de esquema base.

- rebuild_schemes_circles_from_esquemas.py
  - Endpoint principal bulk: POST /api/recompute-simple/rebuild-schemes-circles-from-esquemas
  - Rol: generacion de esquemas POS desde esquema base.

## Caminos paralelos detectados y clasificacion

### LEGACY

- POST /api/recompute-simple/generate-missing-esquema-pos
  - Solapa con rebuild-schemes-circles-from-esquemas.

### EXPERIMENTAL

- POST /api/esquemas-pos/generate-one
  - Generacion puntual, util de diagnostico fino, no camino principal.

### MANUAL

- POST /api/esquemas/generate-one
  - Generacion single por ID; uso manual/correctivo.

### COMPLEMENTARIO (no reemplaza oficial)

- POST /api/recompute-simple/enrich-assets
  - Enriquecimiento de enlaces de assets; no sustituye la generacion oficial de esquemas.

## Estado final

- No se modifica ningun algoritmo de esquemas.
- No se alteran scripts oficiales.
- Queda explicitada una arquitectura oficial de dos motores (base + POS) y el resto se documenta por tipo de uso.

## Resultado

Fase 9 cerrada en alcance documental y de gobierno tecnico.