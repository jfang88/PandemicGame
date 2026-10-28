# T17 — Cloudflare preview deployment pipeline

Status: not started. Dependencies: T16.

## Read

- [docs/CLOUDFLARE.md](../../docs/CLOUDFLARE.md)
- [docs/AUTH.md](../../docs/AUTH.md)
- [docs/OPERATIONS.md](../../docs/OPERATIONS.md)
- [docs/SOURCES.md](../../docs/SOURCES.md)

## Deliverables

- Validate/promote Wrangler template, environment bindings/migrations and build-time auth vars against pinned current tools.
- Add trusted-main manual preview/production deployment workflow with scoped secrets and environment concurrency; no PR auto-deploy.
- With owner-provided credentials, deploy preview and run OAuth, hibernation, namespace isolation, routing and load checks; document observed URLs and versions.

## Acceptance gate

- O01/O02/O03/O05 and U03 pass in actual preview; no claimed pass when account setup missing.
- Published preview uses real auth, independent resources, no test bypass, and durable state. Production remains untriggered.

## Checks

- Full CI, Wrangler validation, actual preview smoke/load, personal Microsoft + Google login and idle observation.

## Copyable task prompt

```text
Implement T17 — Cloudflare preview deployment pipeline in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T17-cloudflare-preview-deployment-pipeline.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
