# Test strategy and release gates

## Layer 1: deterministic engine

Vitest unit tests for E01–E24. Freeze independent expected examples for setup/shuffle and outbreak order before relying on snapshots. Use fixture builders that conserve cards/cubes. Enumerate legal actions from real state for randomized tests; don't turn invalid-action rejection into a trivial fuzz “pass”. Run at least 100 seeds per 2/3/4 player mode with a 1,000-action cap. A timeout means investigate, not silently count as a win. Record seed and command list on failure for reproducibility.

Tests must establish negative behavior as well as happy paths. Separate rule assertions from implementation helpers so a shared bug cannot make both expected and actual values wrong. No DB, network, time or global randomness in this layer.

## Layer 2: Cloudflare boundaries

Use official Workers Vitest integration against workerd/Miniflare and real SQLite Durable Object storage. Verify actual transactions, migrations and restart behavior, not only an in-memory mock. P01–P08 and S01–S10 include concurrent requests with the same version, fault injection before commit, delivery loss after commit, member access, tickets and production-bypass rejection. Fault hooks exist only in local test harness/build.

Test Firebase Secure Token certificate retrieval using controlled RS256-signed tokens and key rotation; do not automate login to external providers in every CI run. Verify hibernation attachment behavior with runtime-supported tests and supplement with real staging checks where local emulation differs. State explicitly which evidence is local and which is deployed.

## Layer 3: browser tests

Playwright independent browser contexts (one context per identity, not tabs sharing storage). Matrix: 2, 3, 4 players; primary CI browser Chromium, Firefox/WebKit smoke where practical. Test invite/login return path, lobby capacity/readiness, legal and rejected actions, hand-limit UI, terminal outcome, refresh/offline/reconnect, two tabs for one identity, duplicate/stale snapshots and session expiry.

Local fixture creation is test-only and excluded from deployment. Pin test seed and use deterministic bounded action drivers; include visible interactions instead of sending every action directly through API. Use API setup helpers only to isolate scenarios. Capture failure screenshots/traces; ensure no production credentials in artifacts. Do not disable an assertion to hide a flaky test; isolate and fix race conditions.

## Layer 4: staging/release

Manual real Microsoft personal account + Google OAuth checks. Four real sessions across at least two devices/networks. Observe idle room hibernation and disconnect recovery; real runtime is authoritative. Run O02 bounded load only against owned preview, never third-party infrastructure. Suggested starting probe: 10 rooms, 40 sockets, 3,000 total legal commands, jittered intervals at least 2 seconds per room, stop if 5xx >1% or sustained p95 >3s. Record actual duration, CPU/storage usage, rates and latency distribution. Respect configured rate limits (alternate users/pace slower as needed); do not bypass them for headline results.

Rehearse compatible deployment/rollback and schema migration on stored fixtures. Confirm empty API errors cannot leak index.html, secrets are redacted, environment resources isolated, budget alerts configured where supported, and retention deletes data. Deployment is not done until smoke tests pass.

## CI gates

- Every PR: docs/board validation, lint, typecheck, unit and applicable integration suites, build.
- UI/multiplayer PRs: relevant Playwright suite plus full suite before release.
- T06: independent engine review against RULES.md.
- T08: transaction/retry fault tests mandatory.
- T11/T16: authorization and production-bypass tests mandatory.
- T18: all acceptance IDs traced to tests/manual evidence; unresolved required gates block release.

No coverage percentage alone establishes correctness. Missing suites are marked not implemented, never reported as passed. Build-kit delivery itself only validates documentation, task dependencies and board data; application/runtime tests start with implementation tasks.

## Firebase-specific release gate

S09/S10 cover fixed certificate URL, X.509 import, mandatory Firebase claims, non-UUID UID identity, cache max-age/rotation/fetch failure, and rejected unsigned Auth Emulator tokens. Check deployed bundles have no emulator env or bypass modules. U05 requires actual Cloudflare-hosted Firebase popup login with both Google and personal Microsoft in Chromium and tablet Safari/WebKit, plus blocked/cancelled-popup recovery. Real-provider checks belong to T17; mocked local tests cannot substitute. Measure token-verification CPU against Workers Free limits with realistic key-cache conditions.
