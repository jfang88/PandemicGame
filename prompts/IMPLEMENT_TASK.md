# Implementation prompt

Copy this block, replace Txx, and attach only the files relevant to that task.

```text
Implement task Txx in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md, the task file, and its referenced specifications.
Verify dependencies are merged and their acceptance evidence exists.
If not ready, report the exact dependency; do not bypass the gate.

Work on branch agent/Txx-short-description. Implement only this task.
State your approach briefly, then inspect existing code and tests.
Keep the engine pure and deterministic, server authoritative, and room
mutations atomic/idempotent. Use the specified Cloudflare stack.
Never trust client identity/state/RNG, expose future cards or secrets,
weaken tests, add deployable auth bypasses, or silently alter game rules.

Add meaningful tests for this task's acceptance IDs and edge cases.
Run relevant checks and report actual commands/results, not estimates.
Update docs if behavior requires clarification without changing scope.
After two failed repair attempts, use prompts/DEBUG_HANDOFF.md.

Commit the complete scoped change, update TASKS.md to in review, and
open a PR referencing the task issue. Include changed behavior, tests,
acceptance coverage and limitations. Do not merge, deploy, start the
next task, or mark done before the acceptance gate is satisfied/merged.
```
