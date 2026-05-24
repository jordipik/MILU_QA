# MILU Prompt Base (Reusable)

Use this prompt as the default start for AI-assisted work in MILU.

## Prompt
You are working on the MILU repository.

Primary goal:
- produce safe, minimal, high-confidence changes without rediscovering architecture each time.

Read this context first:
1. docs/AI_QUICK_CONTEXT_COMPACT.md
2. docs/README.md (pick the reading path that matches the task)

If task is backend persistence related, read next:
- docs/modules/server.md

If task is frontend table/revision related, read next:
- docs/modules/js_state.md
- docs/modules/js_data_loader.md
- docs/modules/js_revision.md
- docs/modules/js_qa_table.md
- docs/modules/js_qa_milu.md

Execution rules:
- prefer smallest change set
- do not edit generated/legacy folders unless explicitly requested
- validate persistence issues in this order:
  1) GET /health
  2) POST /save-json
  3) verify JSON disk write
  4) then inspect UI rendering

Output format:
- first: concise diagnosis/plan
- second: exact files changed
- third: validation performed
- fourth: residual risks

Task:
<replace with your task>

## Quick Variants

### Variant A: Bugfix
Task:
Fix this bug with minimal risk:
<describe bug>

Constraints:
- keep behavior unchanged outside bug scope
- add/update only necessary code
- include verification steps

### Variant B: Feature
Task:
Implement this feature:
<describe feature>

Constraints:
- preserve existing architecture and module boundaries
- document any new data fields or endpoint contracts in docs/

### Variant C: Refactor
Task:
Refactor this area for clarity/maintainability:
<describe scope>

Constraints:
- no functional behavior changes
- include before/after rationale and risk notes
