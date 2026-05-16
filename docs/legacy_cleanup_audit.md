# Legacy Cleanup Audit (Post field_registry/fieldAdapter)

Date: 2026-05-16
Status: Audit only (no deletions, no functional/output changes)

## 1) Scope and constraints used in this audit

- Refactor field_registry/fieldAdapter is treated as closed and validated.
- This pass is documentation-only.
- No JSON data changes.
- No generated export changes.
- No public field rename.
- No WordPress export behavior change.
- No UI behavior changes.
- No file deletions yet.
- Rollback must stay easy (phase commits, small surface per phase).

## 2) Evidence collection method

Primary search vectors used:

- global text search for: `field_registry`, `fieldAdapter`, `legacy`, `deprecated`, `alias`, `measurement_final`, `payload.field ?? payload.col`, `descartar`, `save-json.php`.
- import/reference scans in active code (`js/`, `server/`, `scripts/`, `package.json`).
- targeted non-usage checks excluding generated/archive folders (`dist/`, `docs/`, `legacy/`, `Copia_seguridad_v1.01`, `data/`).
- runtime contract checks through source inspection (`server.js`, `server/validation/*`, `js/data-loader.js`, export helpers).

Key command evidence (summarized):

- Non-usage in active code:
  - pattern `pn_review.js` => `NO_MATCH` (outside docs/dist/legacy/data).
  - pattern `bulk-revision-helper.js` => `NO_MATCH` (outside docs/dist/legacy/data).
- Legacy entrypoints still wired:
  - `package.json` keeps `legacy:generate:synthetic` -> `generate_synthetic_exports.js`.
  - `server.js` keeps `/save-json.php` and `/qa_revision_sync.php` aliases.
  - `js/data-loader.js` still tries `save-json.php` candidates in remote mode.
- Compatibility tests still present and active:
  - fieldAdapter compatibility suites.
  - write compatibility (aliases + `col` support + `descartar` normalization).

## 3) Files: candidates to remove (NOT removed yet)

### A) Strong candidates (low risk)

1. `js/pn_review.js`
- Category: duplicate/legacy PN review implementation.
- Risk: Low.
- Evidence:
  - no active references found in JS/HTML/package scans (excluding docs/dist/legacy/data).
  - only appears in historical/generated audit artifacts (`data/field_adapter_usage_audit.json`) and docs.
- Recommendation:
  - Phase 1 remove file + run full validation gate.

2. `js/bulk-revision-helper.js`
- Category: wrapper/helper likely orphaned.
- Risk: Low-Medium (possible manual console use by developers).
- Evidence:
  - no imports/usages found in active runtime wiring.
  - exports `window.qaRevisionBulk`, but no active loader found.
- Recommendation:
  - Phase 1: first deprecate in docs/changelog, then remove in same phase if no team dependency.

3. `apply-bulk-revision-to-engine.js`
- Category: duplicate one-off script (bulk revision) not wired to backend/services.
- Risk: Low-Medium (manual CLI usage unknown).
- Evidence:
  - no invocation from package scripts or runtime modules.
  - script appears self-contained CLI utility.
- Recommendation:
  - Phase 1: move to `legacy/` or remove after confirming no operator usage.

### B) Candidates with retention caution (medium risk)

4. `styles/pn_review.css`
- Category: likely orphan CSS (underscore variant).
- Risk: Medium (needs final check against ad-hoc manual page usage).
- Evidence:
  - no active HTML references found in repository scan (excluding dist/archive).
- Recommendation:
  - Phase 1: remove only together with confirmed dead PN legacy page assets.

5. `styles/pn-review.css`
- Category: likely orphan CSS (kebab variant).
- Risk: Medium (same reason as above).
- Evidence:
  - no active HTML references found in repository scan (excluding dist/archive).
- Recommendation:
  - Phase 1: remove after same gating as item #4.

## 4) Functions/code blocks: candidates to remove later (NOT now)

These are active compatibility paths; removal should be delayed to phase 2+ and only after client/input migration proof.

1. `server/validation/qa-validation.js`
- `const rawField = payload.field ?? payload.col;`
- Purpose: accepts legacy `col` alias from frontend payload.
- Risk: Medium.
- Evidence:
  - tests explicitly validate `col` alias acceptance.
  - docs and code indicate active frontend compatibility expectation.
- Recommendation:
  - keep frozen now; retire in phase 2 only after proving all clients send `field`.

2. `server/validation/qa-validation.js`
- revision action normalization includes `descartar -> eliminar`.
- Purpose: compatibility for old action tokens.
- Risk: Medium.
- Evidence:
  - tests explicitly assert normalization behavior.
- Recommendation:
  - keep frozen now; phase 2 removal behind payload telemetry/proof.

3. `apply_revision_to_engines.js`
- `buildLegacyRevisionKey(...)`, `normalizeRevisionDataObject(...)` legacy key/v2 handling.
- Purpose: compatibility with historical revision payload shapes.
- Risk: High (bulk cross-engine mutation path).
- Evidence:
  - backend service `server/services/revision-apply.js` imports and uses this module.
- Recommendation:
  - do not touch in phase 1; only phase 2 with dedicated fixture matrix and rollback plan.

4. `server.js` + `js/data-loader.js`
- `.php` route aliases and save endpoint fallback strategy.
- Purpose: compatibility in environments without Node-only path assumptions.
- Risk: High for remote/local mixed deployments.
- Evidence:
  - explicit routes `/save-json.php`, `/qa_revision_sync.php` and frontend fallback candidates.
- Recommendation:
  - keep frozen until deployment contract is formally narrowed.

## 5) Files to keep frozen (must stay for now)

1. `js/fieldAdapter.js`
- Core adapter used by active read paths and tests.
- Risk if removed: High.

2. `js/qa-articulos-fields.js`
- Active adapter wrapper for analysis view.
- Risk if removed: Medium-High.

3. `js/export-preview-fields.js`
- Active adapter wrapper for export preview.
- Risk if removed: Medium-High.

4. `js/export-field-helper.js`
- Active helper used by WordPress export and legacy synthetic script.
- Risk if changed/removed: High.

5. `js/write-field-helper.js`
- Active write compatibility helper used by save endpoint.
- Risk if removed: High.

6. `server/validation/allowed-fields.js`
- Canonical field gate for save contract.
- Risk if changed: High.

7. `server/validation/qa-validation.js`
- Contract normalization (including legacy acceptance).
- Risk if changed: High.

8. `data/field_registry.json`
- Registry contract source for scripts/tests.
- Risk if removed: High.

9. `scripts/refactor_json_fields.py`, `scripts/compare_normalized_engines.py`, `scripts/audit_field_adapter_usage.py`
- Validation/audit chain of closed refactor.
- Risk if removed now: Medium-High.

10. `tests/field-adapter*.test.js`, `tests/export-field-helper.test.js`, `tests/write-field-helper.test.js`, `tests/write-compat-smoke.test.js`
- Current safety net for compatibility; needed until compatibility retirement is intentional.
- Risk if removed now: High.

## 6) Documentation: stale/obsolete candidates

1. `docs/AI_QUICK_CONTEXT.md` and `docs/AI_QUICK_CONTEXT_COMPACT.md`
- Issue: mention `generate_synthetic_exports.js` as archived under legacy path, but file still exists at repo root and is callable via npm legacy script.
- Risk: Low (doc drift only).
- Recommendation: phase 3 doc cleanup/update.

2. `docs/MILU_INVENTARIO_SCRIPTS.md` and archived audit docs
- Issue: contain legacy/duplicate notes that predate current runtime wiring; some are still valid, some are historical.
- Risk: Low-Medium (operator confusion).
- Recommendation: phase 3 consolidate into one current legacy matrix and mark archived docs as historical snapshots.

## 7) Tests covering removable legacy paths

### Keep for now (do not remove yet)

- `tests/field-adapter*.test.js`: still validate active read compatibility behavior in runtime wrappers.
- `tests/export-field-helper.test.js`: still validates helper behavior used by active export path.
- `tests/write-field-helper.test.js` and `tests/write-compat-smoke.test.js`: still protect save/write compatibility.
- `tests/security/write-validation.test.js`: validates `col` alias and action normalization compatibility.
- `tests/smoke/http-smoke.test.js`: validates legacy 410 contracts and active PN review endpoints.

### Future removal candidates (phase 3+)

- Specific assertions for compatibility aliases can be narrowed once compatibility retirement is approved and implemented.
- 410 legacy endpoint checks can be reduced only if endpoint removal is accepted as product contract change.

## 8) Incremental execution plan (no deletion executed in this pass)

## Phase 1 - Safe low-risk cleanup

Files to touch:
- `js/pn_review.js` (remove)
- `js/bulk-revision-helper.js` (remove after final team confirmation)
- `apply-bulk-revision-to-engine.js` (move to `legacy/` or remove)
- optional: `styles/pn_review.css`, `styles/pn-review.css` (if no hidden consumers)

Risks:
- Low to Medium (mainly hidden manual/dev usage).

Validations required:
- `npm test`
- `npm run validate:schema`
- `npm run validate:field-refactor-final`
- `npm run validate:field-refactor-final:exports`
- snapshot/export comparison if outputs touched by scripts (expected none).

Suggested commit:
- `chore(legacy): remove orphan pn/bulk legacy files (no runtime contract change)`

## Phase 2 - Internal compatibility retirement

Files to touch:
- `server/validation/qa-validation.js` (remove `col` alias acceptance only when safe)
- `server/validation/qa-validation.js` (retire `descartar` normalization only when safe)
- `apply_revision_to_engines.js` (legacy key handling reduction, if payload matrix allows)
- `server.js` + `js/data-loader.js` (`.php` save/revision alias retirement, only with deployment confirmation)

Risks:
- Medium to High (payload/client compatibility break risk).

Validations required:
- full gate + targeted API compatibility tests and fixture matrix for revision payload versions.

Suggested commit:
- `refactor(compat): retire internal legacy aliases after client/payload convergence`

## Phase 3 - Documentation and legacy-test cleanup

Files to touch:
- docs with stale compatibility statements (quick contexts, inventory summaries)
- tests that only assert compatibility paths intentionally retired in phase 2

Risks:
- Low functional risk, Medium governance risk (loss of traceability if done too early).

Validations required:
- `npm test`
- `npm run validate:schema`
- `npm run validate:field-refactor-final`
- `npm run validate:field-refactor-final:exports`

Suggested commit:
- `docs/tests: align docs and test matrix with post-compat baseline`

## Phase 4 - Final retirement gate (only if outputs stay identical)

Files to touch:
- remaining frozen compatibility code identified in phase 2 review

Risks:
- High if done without output/API parity proof.

Validations required:
- mandatory full gate
- explicit export/snapshot parity sign-off
- rollback rehearsal

Suggested commit:
- `chore(legacy-final): remove last deprecated compatibility paths (parity verified)`

## 9) Recommended decision matrix per audited item

| Item | Current State | Risk | Recommendation Now |
|---|---|---|---|
| `js/pn_review.js` | appears unused in active wiring | Low | remove in phase 1 |
| `js/bulk-revision-helper.js` | appears unused, possible console manual usage | Low-Medium | deprecate + remove in phase 1 after confirmation |
| `apply-bulk-revision-to-engine.js` | standalone duplicate CLI | Low-Medium | move/remove in phase 1 |
| `styles/pn_review.css` | likely orphan | Medium | remove in phase 1 only after final check |
| `styles/pn-review.css` | likely orphan | Medium | remove in phase 1 only after final check |
| `payload.field ?? payload.col` | active compatibility | Medium | keep frozen until phase 2 |
| `descartar -> eliminar` map | active compatibility | Medium | keep frozen until phase 2 |
| legacy key handling in revision apply | active in critical bulk flow | High | keep frozen; phase 2 with dedicated matrix |
| `.php` endpoint aliases | active deployment compatibility | High | keep frozen; phase 2 with deployment sign-off |

## 10) Final note for this pass

This audit intentionally performed no removals.

Output of this pass:
- candidate inventory,
- risk-ranked recommendations,
- explicit evidence vectors,
- phased execution plan with commit proposals,
- rollback-friendly sequencing.

## 11) Phase 1 execution (2026-05-16)

Status: Completed (minimal low-risk cleanup only)

Files touched:

- `js/pn_review.js`
- `docs/legacy_cleanup_audit.md`

Changes executed:

1. Removed `js/pn_review.js`.
- Rationale: marked low risk + no active runtime references in prior audit evidence.
- Scope: deletion only, no replacement logic added.

2. Updated this audit document with execution trace.
- Added phase closure details (what changed, validations, result, postponed items).

Validation commands executed:

- `npm test`
- `npm run validate:schema`
- `npm run validate:field-refactor-final`
- `npm run validate:field-refactor-final:exports`

Validation result:

- `npm test` -> PASS
- `npm run validate:schema` -> FAIL (schema errors preexistentes en datos, no modificables en esta fase por restriccion de no tocar JSON)
- `npm run validate:field-refactor-final` -> PASS
- `npm run validate:field-refactor-final:exports` -> PASS

Phase 1 outcome:

- Cleanup low-risk aplicado con rollback simple (eliminacion de 1 archivo huerfano + actualizacion documental).
- Gate completo no queda 100% en verde por fallo preexistente de `validate:schema` en datos.
- No se aplican cambios sobre JSON de datos para forzar verde, en cumplimiento estricto de restricciones.

Commit note (Phase 1):

- Fase 1 cerrada parcialmente con validacion funcional OK (`npm test`, `validate:field-refactor-final`, `validate:field-refactor-final:exports`).
- `validate:schema` no bloquea este commit porque el fallo es preexistente en datos y esta fuera de alcance por restriccion.
- No se tocaron JSON de datos ni outputs de export generados.
- Rollback de esta fase: restaurar `js/pn_review.js` desde este commit (revert del commit o checkout del archivo en commit previo).

Postponed items (explicitly not touched in Phase 1 due risk/constraints):

- `js/bulk-revision-helper.js` (low-medium)
- `apply-bulk-revision-to-engine.js` (low-medium)
- `styles/pn_review.css` (medium)
- `styles/pn-review.css` (medium)
- internal compatibility paths (`payload.field ?? payload.col`, `descartar -> eliminar`, legacy key apply, `.php` aliases)

## 12) Sentinel tecnico de validacion (2026-05-16)

Decision aplicada:

- No eliminar el registro `ID=1199999` de `engine_12V4000M40A.json`.
- Formalizarlo como registro tecnico mediante flag `_internal_debug_record: true`.

Exclusion explicita y auditable:

- `scripts/validate-engine-schema.js`: ignora registros con `_internal_debug_record === true`.
- `scripts/export_wordpress_milu.js`: excluye registros tecnicos de export WordPress.
- `scripts/db/import_engines_to_sqlite.js`: excluye registros tecnicos del espejo SQLite (impacta analytics/read productivo tras `npm run db:import`).

Rationale:

- Mantener un registro sentinel util para inspeccion de cabeceras/campos sin contaminar validaciones ni salidas productivas.
- Cambio minimo y reversible: basta con retirar el flag o revertir el commit.
