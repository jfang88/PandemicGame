# T10 — Hibernating realtime and reconnect

Status: not started. Dependencies: T09.

## Read

- [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- [docs/PROTOCOL.md](../../docs/PROTOCOL.md)
- [docs/TESTING.md](../../docs/TESTING.md)

## Deliverables

- Implement one-use persisted room socket tickets, origin checks, hibernation sockets and durable connection attachments.
- Broadcast member-only snapshots after commits; enforce socket caps, auth expiry and cleanup scheduling.
- Implement client transport module with stable command IDs, current snapshot reconciliation and bounded retry/reconnect.

## Acceptance gate

- P05/P06/S03/S04 and transport portions U02 pass locally; no always-running JS timers on server.
- Commands remain HTTPS-only; lost updates recovered by snapshot; expired idle sockets lose access.
- Socket auth expiry derives from verified Firebase ID-token exp, and refreshed reconnect retains user UID.

## Checks

- Cloudflare socket integration tests, client transport unit tests, hibernation staging checks explicitly pending T17.

## Copyable task prompt

```text
Implement T10 — Hibernating realtime and reconnect in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T10-hibernating-realtime-and-reconnect.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
