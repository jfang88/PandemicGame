# T12 — Local playable board interface

Status: not started. Dependencies: T06.

## Read

- [docs/PRODUCT.md](../../docs/PRODUCT.md)
- [docs/RULES.md](../../docs/RULES.md)
- [spec/board.v1.json](../../spec/board.v1.json)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Implement responsive SVG board, role/pawn/card panels, threats/centers/supplies, phase/action indicators and legal action controls.
- Use engine through a local transport adapter for hot-seat development; same view components later use network adapter.
- Implement discard interruption and terminal result; original visual assets and keyboard/non-color labels.

## Acceptance gate

- A complete local game can reach terminal result through UI; E12/E13 hand-limit interactions visible and correct.
- U04 checks pass; no hidden deck/seed exposed through production UI module imports.

## Checks

- Component interaction tests, production build inspection and manual keyboard/tablet walkthrough.

## Copyable task prompt

```text
Implement T12 — Local playable board interface in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T12-local-playable-board-interface.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
