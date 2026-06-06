# MILU_WORDPRESS_DERIVED_ASSET_URLS_SPEC

Status: Approved for V1.04
Date: 2026-06-06

## Purpose

Define canonical derivation of `exp_imagenes` during WordPress export using base fields, not pre-derived engine JSON fields.

## Base vs Derived Fields

Base fields (canonical source for WordPress assets):
- filename_foto
- esquemas_circulos
- esquemas

Photo URL policy:
- `filename_foto` is always mapped to:
  `/srv/htdocs/wp-content/uploads/2026/fotos/<filename>`
- Photos do not use `/<MODEL>-POS/`.

Derived fields (deprecated as primary source):
- ruta_esquemas_pos
- exp_imagenes
- esquemas_circulos_all
- ruta_foto

Important:
- Deprecated fields are not removed from engine JSON in V1.04.
- Export logic must not depend on them as primary source.

## Derivation Order

`exp_imagenes` is built in this order:
1. filename_foto
2. esquemas_circulos
3. esquemas

Compatibility fallback:
- Use `ruta_esquemas_pos` only if the three base sources produce no assets.
- `exp_imagenes` and `esquemas_circulos_all` are ignored as source.

## URL Construction

For each candidate asset:

1. If value is absolute URL:
- Keep/normalize using `normalizeWordPressAssetUrl(...)`.

2. If value is filename:
- Infer model from filename first.
- Fallback to row context (`engine_model`, `exp_motor`, `model_type`, `__engine_file`, `engine`).
- Build URL:
  - `https://milu-naval.mystagingwebsite.com/wp-content/uploads/<MODEL>-POS/<filename>`

3. If model cannot be inferred:
- Keep original token.
- Emit warning `URL_MODEL_NOT_FOUND`.

Special case:
- `sin_imagen.jpeg` is always normalized to fixed global path:
  `https://milu-naval.mystagingwebsite.com/wp-content/uploads/sin_imagen.jpeg`.

## Consolidation by Siblings

Rules kept in V1.04:
- `Copia` does not create output rows.
- `Copia` contributes assets to sibling consolidation.
- Consolidation sources are base fields (plus fallback policy above).

## Dedupe, Ordering, Cap

- Dedupe key: normalized basename first, otherwise normalized URL.
- Sort: stable alphabetical.
- Cap: 10 assets in `exp_imagenes`.
- Fallback to `sin_imagen.jpeg` only when no real asset remains.

## Folder Policy

Current policy used by exporter for both circles and schema filenames:
- `/<MODEL>-POS/`

Pending governance note:
- Long-term destination policy for general schemas (`esquemas`) can be split later to a dedicated folder strategy if WordPress taxonomy requires it.

## Future cleanup (not executed in V1.04)

Candidate fields to remove after dependency audit:
- ruta_esquemas_pos
- exp_imagenes
- esquemas_circulos_all

Required prior audit artifact:
- `MILU_ASSET_DERIVED_FIELDS_DEPRECATION_AUDIT.md`
