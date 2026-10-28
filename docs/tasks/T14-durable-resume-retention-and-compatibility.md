# T14 — Durable resume retention and compatibility

Status: not started. Dependencies: T13.

## Read

- [docs/DATA_MODEL.md](../../docs/DATA_MODEL.md)
- [docs/OPERATIONS.md](../../docs/OPERATIONS.md)
- [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)

## Deliverables

- Finish unified alarm scheduler for auth expiry/ticket cleanup/room retention, with tombstones and final deletion.
- Add schema-version fixtures and migration handling; freeze incompatible rules and document compatible rollback.
- Ensure resumed discard phase, decks and active seat survive all supported restarts; recent-room expired UX.

## Acceptance gate

- P06/S04/O03 retention portions pass with fake time and real storage; reads do not extend expiry.
- Expired rooms cannot revive via join/create retry; unknown versions never silently reset state.

## Checks

- Runtime alarm/migration/restart tests; client expired-room tests.

## Copyable task prompt

```text
Implement T14 — Durable resume retention and compatibility in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T14-durable-resume-retention-and-compatibility.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
