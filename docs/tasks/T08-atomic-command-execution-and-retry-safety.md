# T08 — Atomic command execution and retry safety

Status: not started. Dependencies: T07.

## Read

- [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- [docs/PROTOCOL.md](../../docs/PROTOCOL.md)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Implement command processing transaction: membership, receipt/hash, revision, engine transition, state/events/receipt writes.
- Return stored acceptance for exact retries; stale/reused-ID errors; commit before acknowledgment and broadcast hooks.
- Introduce local-only fault injection at transaction and post-commit boundaries, never a deployed API.

## Acceptance gate

- P01–P06 pass for transaction/restart portions, including raced same-version actions and failure between writes.
- Duplicate after restart changes state once; error candidate never leaks into authoritative cache.

## Checks

- Runtime race/fault/restart integration tests; full engine and protocol suites; review atomic boundary.

## Copyable task prompt

```text
Implement T08 — Atomic command execution and retry safety in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T08-atomic-command-execution-and-retry-safety.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
