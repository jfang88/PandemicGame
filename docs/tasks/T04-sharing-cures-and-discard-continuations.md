# T04 — Sharing cures and discard continuations

Status: done. Dependencies: T03.

## Implementation evidence

- E09 covers a matching-location transfer, the Courier exception, ownership and co-location.
- E10 covers Scientist and ordinary cure payments, including duplicate, wrong-color and unowned cards, missing centers and repeat cures.
- E12 covers the seven-to-eight-card boundary, recipient-only discard, and resuming with one remaining action or two pending draws.
- E21 and E23 cover immediate victory on the fourth action with an empty player deck, terminal rejection and rejection without changing state or RNG.

Multi-card discards process IDs in payload order, placing each on top of the player discard. Authorized members can see hands and card events under the public projection contract in [DATA_MODEL.md](../DATA_MODEL.md). This task implements the engine events. Room snapshots and delivery are later work.

T05 connects automatic draw and infection resolution. Its resolver needs to read the pending draw count from the input continuation before a successful discard clears it.

## Read

- [docs/RULES.md](../../docs/RULES.md)
- [docs/DATA_MODEL.md](../../docs/DATA_MODEL.md)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Implement GIVE_CARD, DISCOVER_CURE, DISCARD; Scientist/Courier abilities; visible-hand policy.
- Represent DISCARD_REQUIRED and resume continuation explicitly, including recipient discarding after another player’s fourth action.
- Implement immediate fourth-cure victory and terminal command rejection.

## Acceptance gate

- E09/E10/E12/E21/E23 pass; duplicate card IDs, wrong recipient, wrong discarder and wrong phase rejected without cost.
- Discard leaves exactly seven and consumes no action; fourth cure ends before automatic turn resolution.

## Checks

- Unit tests around 7/8-card boundaries and all cure/transfer restrictions; typecheck.

## Copyable task prompt

```text
Implement T04 — Sharing cures and discard continuations in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T04-sharing-cures-and-discard-continuations.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
