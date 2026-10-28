# T04 — Sharing cures and discard continuations

Status: not started. Dependencies: T03.

## Read

- [docs/RULES.md](../../docs/RULES.md)
- [docs/DATA_MODEL.md](../../docs/DATA_MODEL.md)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Implement GIVE_CARD, DISCOVER_CURE, DISCARD; Scientist/Courier abilities; visible-hand policy.
- Represent DISCARD_REQUIRED and resume continuation explicitly, including recipient discarding after another player’s fourth action.
- Implement immediate fourth-cure victory and terminal command rejection.

## Acceptance gate

- E09/E10/E12/E21/E23 pass; duplicate card IDs, wrong recipient, wrong discarder and wrong phase rejected without cost.
- Discard leaves exactly seven and consumes no action; fourth cure ends before automatic turn resolution.

## Checks

- Unit tests around 7/8-card boundaries and all cure/transfer restrictions; typecheck.

## Copyable task prompt

```text
Implement T04 — Sharing cures and discard continuations in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T04-sharing-cures-and-discard-continuations.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
