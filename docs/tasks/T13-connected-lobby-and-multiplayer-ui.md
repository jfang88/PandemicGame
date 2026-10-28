# T13 — Connected lobby and multiplayer UI

Status: not started. Dependencies: T11, T12.

## Read

- [docs/PRODUCT.md](../../docs/PRODUCT.md)
- [docs/PROTOCOL.md](../../docs/PROTOCOL.md)
- [docs/AUTH.md](../../docs/AUTH.md)

## Deliverables

- Connect login/home/invite/lobby/role/readiness/start screens to authenticated API.
- Swap local adapter for network transport in deployed app; render server snapshots and pending/rejected actions.
- Add private recent-room links, safe error states, connection/session banners and bounded public history.

## Acceptance gate

- 2/3/4 separate identities join and play synchronized turns; nonactive players cannot act.
- Stale-version rejection refreshes state without silently reissuing move; refresh returns to existing seat.

## Checks

- UI integration tests plus initial independent-browser smoke; lint/typecheck/build.

## Copyable task prompt

```text
Implement T13 — Connected lobby and multiplayer UI in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T13-connected-lobby-and-multiplayer-ui.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
