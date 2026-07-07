# Auditoria Legacy y Deuda Tecnica

Fecha: 2026-05-16

## Inventario legacy principal

- legacy/php/qa_revision_sync.php
- legacy/php/save-json.php
- legacy/export_complex_ai/scripts/*
- generate_synthetic_exports.js (root, flujo legacy disponible por comando legacy)
- rutas backend legacy 410 (/pn/*, /export/run-synthetic, /export/run-ai-conflicts, /export/run-all)
- referencias documentales a vistas retiradas (pn_review.html, milu_qa, qa_web, qa_articulos)

## Clasificacion requerida

### ELIMINABLE (cuando se cierre compatibilidad de publicacion)

- Referencias docs a vistas inexistentes.
- Scripts utility redundantes no usados en pipeline oficial (segun validacion funcional).

### CONGELADO

- Endpoints 410 legacy en server.js.
- legacy/export_complex_ai/* como archivo historico.
- Alias /save-json.php y /qa_revision_sync.php para compatibilidad.

### NECESITA MIGRACION

- Modulos frontend legacy grandes con fallbacks duplicados (analista-02.js, qa-analista-registro.js, pn-review*.js).
- Compatibilidad alias de campos dispersa fuera de adapter unico.
- Documentacion no alineada con runtime real.

### CRITICO MANTENER

- Compatibilidad de rutas .php en backend local/publicacion mientras exista cliente legado.
- Whitelist y validaciones de write endpoints.
- Flujo oficial depuracion_json.py + export_wordpress_milu.js.

## Deuda tecnica detectada

| Deuda | Severidad | Detalle |
|---|---|---|
| Monolitos JS QA | Alta | Alto costo de cambio y debug |
| server.js concentrado | Alta | Acoplamiento transversal de rutas/logica |
| Alias/fallback de campos distribuidos | Alta | Riesgo de divergencia por modulo |
| Documentacion parcialmente desactualizada | Media | Errores operativos y de onboarding |
| Legacy artifacts en raiz/historico | Media | Ruido y confusión del flujo oficial |

## TODO/FIXME

- No se encontraron marcadores explicitos TODO/FIXME/HACK en codigo activo (busqueda estricta).
- La deuda existe, pero no esta formalmente anotada en fuente.

## Recomendacion de gestion legacy

1. Mantener legacy congelado con contrato de salida definido (no eliminar ad-hoc).
2. Priorizar migracion de capas activas antes de eliminar compatibilidad.
3. Registrar matriz de deprecacion con fechas y criterios de retiro.
