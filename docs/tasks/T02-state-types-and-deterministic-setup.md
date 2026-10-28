# T02 — State types and deterministic setup

Status: not started. Dependencies: T01.

## Read

- [docs/RULES.md](../../docs/RULES.md)
- [docs/DATA_MODEL.md](../../docs/DATA_MODEL.md)
- [spec/board.v1.json](../../spec/board.v1.json)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Implement versioned engine state/types, canonical board loader, card IDs and validated setup for 2–4 unique players/roles.
- Implement specified deterministic RNG and shuffle with independently reviewed frozen vectors; inject seed, never ambient randomness.
- Implement setup sequence, card distribution, deck partitioning and invariant helpers.

## Acceptance gate

- E01/E02 pass for all player counts; graph/config invalidity rejected; setup never mutates caller input.
- Cube/card counts and exact initial phase/action count correct; zero seed rejected or explicitly normalized identically in all paths.

## Checks

- Unit tests with fixed vectors, setup seeds and invalid roster/config cases; typecheck.

## Copyable task prompt

```text
Implement T02 — State types and deterministic setup in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T02-state-types-and-deterministic-setup.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
