# T18 — Release readiness and owner handoff

Status: not started. Dependencies: T17.

## Read

- [docs/TESTING.md](../../docs/TESTING.md)
- [docs/OPERATIONS.md](../../docs/OPERATIONS.md)
- [docs/CLOUDFLARE.md](../../docs/CLOUDFLARE.md)
- [prompts/REVIEW_TASK.md](../../prompts/REVIEW_TASK.md)

## Deliverables

- Complete acceptance traceability report, independent final review and four-session manual playtest.
- Rehearse compatible update/recovery in preview; verify operational limits, usage alerts and documented backup limitations.
- Prepare owner release instructions, known issues and tested commit; trigger production only if owner explicitly authorizes that deployment.

## Acceptance gate

- All required E/P/S/U/O criteria have passing evidence; no critical/high defects unresolved; O04 recovery rehearsal recorded.
- Fresh-contributor setup works; owner can deploy the tested commit and verify it. Do not claim production deployment without actual result.
- Confirm Cloudflare Free + Firebase Spark deployment choice and provider/browser checks; no billing upgrade was silently enabled.

## Checks

- Full checks plus manual staging matrix and review; post-deploy smoke only if production is authorized.

## Copyable task prompt

```text
Implement T18 — Release readiness and owner handoff in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T18-release-readiness-and-owner-handoff.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
