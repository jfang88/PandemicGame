# T11 — Microsoft Google auth and authorization

Status: not started. Dependencies: T10.

## Read

- [docs/AUTH.md](../../docs/AUTH.md)
- [docs/PROTOCOL.md](../../docs/PROTOCOL.md)
- [docs/CLOUDFLARE.md](../../docs/CLOUDFLARE.md)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Implement Firebase Web SDK Google/Microsoft popup login/logout, auth initialization, safe room return path, token refresh and short-lived invite fragment handling on the Spark plan.
- Implement a Workers-compatible RS256 Firebase ID-token verifier using Google Secure Token X.509 certificates, pinned project issuer/audience and required time claims; derive opaque non-UUID actor UID from sub. Cache/import keys and test rotation/fetch failure.
- Exclude local test keys and Firebase Auth Emulator bypasses from preview/production. Add public-config templates, popup/collision recovery UI and real-provider-check evidence sheet. No Admin SDK service account or Firebase game database.

## Acceptance gate

- S01/S02/S05/S06/S09/S10 pass; no email-based authorization or open redirect; refresh retries preserve command ID.
- T11 completes on automated auth/code gates; track U03/U05 real-provider/browser verification explicitly under T17. Missing account credentials block T17 external checks and production release, not local T11 implementation.

## Checks

- Firebase-shaped JWT negative/rotation/cache tests, non-UUID UID test, production/emulator bypass test, popup browser smoke; actual Google/Hotmail staging evidence at T17.

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
