# T06 — Engine invariants and independent rules review

Status: not started. Dependencies: T05.

## Read

- [docs/RULES.md](../../docs/RULES.md)
- [docs/TESTING.md](../../docs/TESTING.md)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)
- [prompts/REVIEW_TASK.md](../../prompts/REVIEW_TASK.md)

## Deliverables

- Add legal-action enumeration and randomized legal-sequence harness with saved failing seed/trace.
- Run independent review against rules, add missing regression cases, document provisional balance and unsupported features.
- Produce engine gate report in docs/evidence/T06.md without claiming gameplay balance from random tests.

## Acceptance gate

- All E01–E24 pass; at least 100 seeds per 2/3/4 mode, bounded 1000-action exploration with explicit timeout reporting.
- Replay yields identical results; invalid actions preserve state and RNG; no unresolved blocking rules defects.

## Checks

- Full engine unit suite, randomized harness, lint/typecheck; independent review evidence.

## Copyable task prompt

```text
Implement T06 — Engine invariants and independent rules review in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T06-engine-invariants-and-independent-rules-review.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
