# T05 — Draw infection epidemics and losses

Status: done. Dependencies: T04.

## Implementation evidence

- E11 covers sequential draws, rate-based infection and rotation across occupied seats.
- E13 covers both over-limit draw pauses and exact resumption with one or zero remaining draws. E12 remains covered for a fourth-action transfer and E21 for immediate victory.
- E14–E17 use independent expected outcomes for consecutive epidemics, bottom draws, intensification, cyclic traversal and per-card outbreak tracking.
- E18–E20 cover each loss, first-failure ordering and card conservation. E22 covers infection of a cured color at the Medic's location.

The engine returns a completed turn, a pending discard or a terminal outcome. A missing infection deck and discard raises an invariant error without mutating the command input. An independent source review found no blocking rules defects. T06 owns the randomized engine gate.

## Read

- [docs/RULES.md](../../docs/RULES.md)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Implement automatic DRAW/INFECTION progression and turn rotation; pause/resume on each drawn-card hand limit.
- Implement deterministic outbreak chains, supply checks, infection deck refill, epidemic bottom draws/intensify and two-epidemic turns.
- Implement loss reasons and deterministic first-terminal precedence; automatic effects resolve within one engine transition.

## Acceptance gate

- E11/E13–E22 pass, including cycle and epidemic visited-set scope.
- No persisted mid-infection state; only explicit hand-limit continuation interrupts automatic resolution.

## Checks

- Unit scenarios for each loss, loop propagation order, bottom/top deck semantics and pending draw counts.

## Copyable task prompt

```text
Implement T05 — Draw infection epidemics and losses in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T05-draw-infection-epidemics-and-losses.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
