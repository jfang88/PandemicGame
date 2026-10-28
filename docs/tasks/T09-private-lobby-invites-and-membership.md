# T09 — Private lobby invites and membership

Status: not started. Dependencies: T08.

## Read

- [docs/PRODUCT.md](../../docs/PRODUCT.md)
- [docs/PROTOCOL.md](../../docs/PROTOCOL.md)
- [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Implement idempotent room creation, cryptographic invites/rotation, authenticated-identity admission abstraction, stable seats and unique roles.
- Implement readiness, owner-only start, owner transfer on lobby leave, roster freeze and membership authorization.
- Handle private invite receipts, leaving-player retry exception and logical missing rooms without leaking data.

## Acceptance gate

- P07/P08/S02/S08 pass against local test identities; max-four and role races atomic.
- Start requires 2–4 ready unique roles; started game rejects joining/leaving; disconnect is not leave.

## Checks

- Room integration tests, schema tests, negative admission/access tests.

## Copyable task prompt

```text
Implement T09 — Private lobby invites and membership in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T09-private-lobby-invites-and-membership.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
