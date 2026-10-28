# T03 — Movement treatment and construction

Status: not started. Dependencies: T02.

## Read

- [docs/RULES.md](../../docs/RULES.md)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Implement MOVE, DIRECT_FLIGHT, CHARTER_FLIGHT, SHUTTLE, TREAT, BUILD_CENTER and PASS in pure engine.
- Centralize actor/phase/action validation and deterministic public events; implement Medic/Builder exact effects.
- Return unchanged state on invalid command; no mutation of passed input. Automatic end-turn resolver is connected in T05.

## Acceptance gate

- E03–E08 and relevant E23 cases pass; all card/action/supply costs exact.
- No fourth cube, seventh center, passive Medic effect or accidental self-flight allowed.

## Checks

- Positive/negative unit tests for each command, immutable-input checks, typecheck.

## Copyable task prompt

```text
Implement T03 — Movement treatment and construction in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T03-movement-treatment-and-construction.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
