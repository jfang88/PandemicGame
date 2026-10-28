# T11 — Microsoft Google auth and authorization

Status: not started. Dependencies: T10.

## Read

- [docs/AUTH.md](../../docs/AUTH.md)
- [docs/PROTOCOL.md](../../docs/PROTOCOL.md)
- [docs/CLOUDFLARE.md](../../docs/CLOUDFLARE.md)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Implement Supabase PKCE login/callback/logout, safe room return path and short-lived invite fragment handling.
- Implement Worker JWT verifier with fixed JWKS issuer/audience/algorithm/expiry and rotation handling; derive actor from sub.
- Ensure preview/production has no test identity entry point or signing keys; add setup templates and provider-check evidence sheet.

## Acceptance gate

- S01/S02/S05/S06 pass; no email-based authorization or open redirect; token refresh retries preserve command ID.
- T11 completes on automated auth/code gates; track U03 real-provider verification explicitly under T17. Missing account credentials block T17 external checks and production release, not the local T11 implementation.

## Checks

- JWT negative/rotation tests, production-artifact bypass test, callback unit/browser smoke; real OAuth staging evidence at T17.

## Copyable task prompt

```text
Implement T11 — Microsoft Google auth and authorization in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T11-microsoft-google-auth-and-authorization.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
