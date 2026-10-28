# T01 — Workspace and CI foundation

Status: not started. Dependencies: none.

## Read

- [docs/START_HERE.md](../../docs/START_HERE.md)
- [docs/CLOUDFLARE.md](../../docs/CLOUDFLARE.md)

## Deliverables

- Create npm workspaces for web, worker, engine and protocol; strict TypeScript, compatible pinned dependencies, one lockfile, Node version pin and lint configuration.
- Create minimal real React screen, Worker health route and pure package smoke tests; no game or public deployment yet.
- Add root lint/typecheck/test:unit/build/check:docs scripts, local dev instructions, secret-safe ignore/example files, and PR GitHub Actions with read-only permissions. Document later test scripts as unavailable until their tasks.
- Reserve Firebase public frontend config and FIREBASE_PROJECT_ID Worker config only; do not add Firebase databases, Admin SDK credentials or paid Firebase services.

## Acceptance gate

- Fresh clone + npm ci + lint + typecheck + test:unit + build + check:docs pass.
- Local browser loads scaffold and health endpoint; no success-only script stubs or credentials.

## Checks

- Run all newly introduced scripts and record Node/package versions; validate build-kit Python script.

## Copyable task prompt

```text
Implement T01 — Workspace and CI foundation in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T01-workspace-and-ci-foundation.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
