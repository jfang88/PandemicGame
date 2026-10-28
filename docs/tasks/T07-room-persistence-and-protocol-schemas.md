# T07 — Room persistence and protocol schemas

Status: not started. Dependencies: T06.

## Read

- [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- [docs/DATA_MODEL.md](../../docs/DATA_MODEL.md)
- [docs/PROTOCOL.md](../../docs/PROTOCOL.md)
- [docs/CLOUDFLARE.md](../../docs/CLOUDFLARE.md)

## Deliverables

- Implement shared strict runtime schemas, public projection and API error envelope.
- Implement GameRoom SQLite schema/migration, logical create/read and current snapshot persistence; separate local test entry point.
- Add real Cloudflare runtime integration suite and root test:integration script. Local-only until real auth is complete.

## Acceptance gate

- State survives re-instantiation with identical decks/RNG; public projection excludes all secret fields.
- Unknown schema/protocol versions fail clearly; SQL parameters and API body validation work; O01 routes testable locally.

## Checks

- Workerd/SQLite integration tests and projection leakage tests; unit/typecheck/build.

## Copyable task prompt

```text
Implement T07 — Room persistence and protocol schemas in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T07-room-persistence-and-protocol-schemas.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
