# MILU_WORDPRESS_DERIVED_ASSET_URLS_AUDIT

Date: 2026-06-06
Scope: V1.04 WordPress export migration from derived JSON asset fields to base asset fields.

## Objective

Validate impact of deriving `exp_imagenes` from base fields instead of relying on pre-derived fields in engine JSON.

Method A (legacy source mix):
- filename_foto
- ruta_esquemas_pos
- exp_imagenes

Method B (new base-first method):
- filename_foto
- esquemas_circulos
- esquemas
- compatibility fallback: ruta_esquemas_pos only when base fields provide no assets

Deprecated as primary source:
- ruta_esquemas_pos
- exp_imagenes
- esquemas_circulos_all

## Metrics

### Export invariants

- Total rows baseline: 8631
- Total rows candidate dry-run: 8631
- PN unique candidate: 8631
- Duplicate PN candidate: 0

### Asset coverage by PN

- PN with assets (baseline): 6113
- PN with assets (candidate): 8062
- PN gain assets: 4989
- PN loss assets (by basename diff): 3073

### Loss analysis

- Hard loss (PN had assets before and now has zero): 0
- Soft swap (some basenames replaced, PN still has assets): 3073

Interpretation:
- There is no real loss that leaves a PN without assets.
- Most losses are swaps caused by source-priority migration and cap-10 ordering.

### URL quality

- Assets not convertible to URL: 0
- Assets with undetectable model: 0
- `exp_imagenes` monthly URLs: 0
- `exp_imagenes` monthly non-fallback URLs: 0
- `exp_imagenes` model POS folder hits: 50443

Interpretation:
- No monthly URLs remain in `exp_imagenes`.
- Assets are normalized to `/<MODEL>-POS/` including `sin_imagen` fallback.

### General schema policy pending signal

- Rows with `esquemas` present in engine data: 66439

This confirms high usage of `esquemas`, but destination policy for general schema assets remains a governance decision.

## Samples

Gain sample:
- PN `000000000360` adds `12V4000M40A-0208-01-70.webp`, `12V4000M40A-0208-01.webp`, `12V4000M70-0222-01.webp`.

Soft-swap sample:
- PN `000000000359` replaces old basenames from `16V4000M61` with base-derived set including `12V4000M40A-0229-02-1425.webp`.

## Acceptance decision

Accepted for V1.04 with migration caveat:
- PASS: no hard-loss PN, no duplicate PN, contract rows unchanged, model inference warnings 0.
- PASS: no real monthly asset URL leakage (non-fallback monthly = 0).
- NOTE: soft swaps exist by design while deprecating derived fields as primary source.

## Future follow-up

Before deleting derived JSON fields, run:
- `MILU_ASSET_DERIVED_FIELDS_DEPRECATION_AUDIT.md`

Coverage to include:
1. Writers of `ruta_esquemas_pos`, `exp_imagenes`, `esquemas_circulos_all`.
2. Readers in scripts and UIs.
3. External process dependencies.
4. Rebuild guarantee from base fields.
