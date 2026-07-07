# WordPress Export Images Audit

Fecha: 2026-06-06

## Objetivo
Auditar el cambio de logica de `exp_imagenes` en el export WordPress para simplificar la salida y eliminar dependencia funcional de campos legacy.

## Logica anterior
En `scripts/export_wordpress_milu.js`, `exp_imagenes` agregaba (en este orden) y deduplicaba por basename:

1. `filename_foto`
2. `esquemas_circulos`
3. `esquemas`

Resultado: cuando existian `esquemas_circulos` y `esquemas`, se exportaban ambas imagenes (POS + base).

## Logica nueva (oficial)
Prioridad implementada en `scripts/export_wordpress_milu.js`:

1. `filename_foto`
2. `esquemas_circulos`
3. `esquemas` (solo si aun no se ha anadido ninguna imagen)
4. `sin_imagen.jpeg` (solo si sigue vacio)

Restriccion de fuentes para `exp_imagenes`:

- solo `filename_foto`, `esquemas_circulos`, `esquemas`
- no usar `ruta_esquemas_pos`
- no usar `esquemas_circulos_all`
- no usar `exp_imagenes` previo

## Validacion funcional (casos requeridos)
Validado con ejecucion directa de `buildExpImagenesFromBaseAssets`:

- Caso A (foto + POS + esquema): salida = foto + POS (sin esquema base)
- Caso B (POS + esquema): salida = POS (sin esquema base)
- Caso C (solo esquema): salida = esquema base
- Caso D (sin imagenes): salida = `sin_imagen.jpeg`

## Impacto cuantitativo (muestra real)
Fuente analizada: `data/05-wordpress/milu_wp_import.json`

- Total registros analizados: 5501
- Registros afectados por el cambio de regla: 4983

Distribucion observada en la muestra actual:

- Caso A (foto + POS + esquema): 66
- Caso B (POS + esquema): 4917
- Caso C (solo esquema): 110
- Caso D (sin imagenes): 408

Nota: los registros afectados se concentran en A/B porque la logica anterior incluia esquema base junto con POS.

## Ejemplos reales antes/despues

1) ID `RB-12V4000M40A-001989` (PN `135M27020/1`)

- Antes:
  - `.../12V4000M40A-0301-01-240.webp`
  - `.../12V4000M40A-0301-01.webp`
- Despues:
  - `.../12V4000M40A-0301-01-240.webp`

2) ID `RB-12V4000M53-000732` (PN `136M55056/1`)

- Antes:
  - `.../12V4000M53-0110-01-360.webp`
  - `.../12V4000M53-0110-01.webp`
  - `.../12V4000M53-0110-02.webp`
- Despues:
  - `.../12V4000M53-0110-01-360.webp`

3) ID `RB-12V4000M40A-002051` (PN `400X230X111`)

- Antes:
  - `.../12V4000M40A-0319-01-55.webp`
  - `.../12V4000M40A-0319-01.webp`
- Despues:
  - `.../12V4000M40A-0319-01-55.webp`

## Confirmaciones finales

- `exp_imagenes` ya no requiere `ruta_esquemas_pos`.
- `exp_imagenes` ya no requiere `esquemas_circulos_all`.
- La salida siempre tiene al menos una imagen exportada:
  - foto, o
  - POS, o
  - esquema base, o
  - `sin_imagen.jpeg`.
