# T15 — Multiplayer browser regression suite

Status: not started. Dependencies: T14.

## Read

- [docs/TESTING.md](../../docs/TESTING.md)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Add Playwright contexts for 2/3/4 identities and root test:e2e; CI browser setup and sanitized failure artifacts.
- Test full games plus near-terminal wins/losses, hand limit, lobby race, offline refresh, duplicate update and expired session.
- Keep fixtures/test identity endpoints only in local harness; map acceptance IDs to named tests.
- Cover S09/S10/U05 Firebase claim/cache and popup/emulator cases with local test adapters; reserve actual OAuth/browser evidence for T17.

## Acceptance gate

- U01/U02/U04 repeatably pass; at least one full setup-to-terminal run per player count.
- No shared-context fake multiplayer, skipped required assertions or test-only deployed routes.

## Checks

- Full e2e suite repeated to diagnose flakes, integration/unit suites, production artifact check.

## Copyable task prompt

```text
Implement T15 — Multiplayer browser regression suite in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T15-multiplayer-browser-regression-suite.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
