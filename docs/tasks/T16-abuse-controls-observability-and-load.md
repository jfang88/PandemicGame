# T16 — Abuse controls observability and load

Status: not started. Dependencies: T15.

## Read

- [docs/OPERATIONS.md](../../docs/OPERATIONS.md)
- [docs/TESTING.md](../../docs/TESTING.md)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Implement bounded request/socket/history sizes, durable room rate limiting and supported edge create/join abuse controls.
- Add sanitized structured logs/metrics and bounded 10-room load harness; document actual rate-limit semantics.
- Audit security boundaries and asset bundles with independent review; resolve blockers.

## Acceptance gate

- S05–S07 pass; no secret payloads in logs/traces; limits return useful 429 with Retry-After.
- O02 harness runs locally and is ready for owned preview; performance claims remain pending measured staging results.
- Measure Worker Free token-verification CPU with certificate/key caching; do not assert $0 compatibility solely from low traffic.

## Checks

- Limit/security integration tests, bundle scan, local bounded load, independent review report.

## Copyable task prompt

```text
Implement T16 — Abuse controls observability and load in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T16-abuse-controls-observability-and-load.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
