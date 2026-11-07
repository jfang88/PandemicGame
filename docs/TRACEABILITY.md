# Release traceability matrix

This matrix traces every acceptance ID in [ACCEPTANCE.md](ACCEPTANCE.md) to the checks that verify it. `npm run check:docs` enforces four things. Every acceptance ID appears exactly once. Each cited file exists and contains the quoted test title or assertion text. Each status uses the vocabulary below. An ID that needs hosted evidence is marked `Pass` only when its hosted cell links a GitHub Actions run.

Local results come from the [T18 fresh-contributor run](evidence/T18.md#fresh-contributor-run). Hosted and manual results are recorded on the [T17 preview evidence sheet](evidence/T17.md) and in the [release guide](RELEASE.md).

| Status | Meaning |
| --- | --- |
| Pass | The local checks cover the whole requirement. No hosted evidence is needed. |
| Local pass; hosted pending | The local checks pass. The requirement also needs evidence from the deployed preview or a manual session. |
| Hosted pending | Only the deployed preview or a manual session can verify the requirement. Local checks cover part of the behavior. |

## Engine

| ID | Local evidence | Check | Hosted or manual evidence | Status |
| --- | --- | --- | --- | --- |
| E01 | `packages/engine/src/setup.test.ts` “E01/E02 canonical setup” | `test:unit` | Not required | Pass |
| E02 | `packages/engine/src/setup.test.ts` “E02 deterministic random stream”; `packages/engine/src/exploration.test.ts` “E24 explores and replays” | `test:unit` | Not required | Pass |
| E03 | `packages/engine/src/actions.test.ts` “E03 movement” | `test:unit` | Not required | Pass |
| E04 | `packages/engine/src/actions.test.ts` “E04 flights and card costs” | `test:unit` | Not required | Pass |
| E05 | `packages/engine/src/actions.test.ts` “E05 shuttle” | `test:unit` | Not required | Pass |
| E06 | `packages/engine/src/actions.test.ts` “E06/E07 treatment” | `test:unit` | Not required | Pass |
| E07 | `packages/engine/src/actions.test.ts` “E06/E07 treatment” | `test:unit` | Not required | Pass |
| E08 | `packages/engine/src/actions.test.ts` “E08 construction” | `test:unit` | Not required | Pass |
| E09 | `packages/engine/src/actions.test.ts` “E09/E12 card sharing and continuations” | `test:unit` | Not required | Pass |
| E10 | `packages/engine/src/actions.test.ts` “E10/E21 cure costs and immediate victory” | `test:unit` | Not required | Pass |
| E11 | `packages/engine/src/turn.test.ts` “E11 draws two, infects at the current rate” | `test:unit` | Not required | Pass |
| E12 | `packages/engine/src/actions.test.ts` “E09/E12 card sharing and continuations”; `scripts/test-local-play.mjs` “E12 recipient discard blocks turn” | `test:unit`, `test:local-play` | Not required | Pass |
| E13 | `packages/engine/src/turn.test.ts` “E13 pauses after both over-limit draws”; `scripts/test-local-play.mjs` “E13 active-player discard pauses after the first draw” | `test:unit`, `test:local-play` | Not required | Pass |
| E14 | `packages/engine/src/turn.test.ts` “E14/E17 resolves two epidemics in order” | `test:unit` | Not required | Pass |
| E15 | `packages/engine/src/turn.test.ts` “E15 uses one visited set per epidemic” | `test:unit` | Not required | Pass |
| E16 | `packages/engine/src/turn.test.ts` “E16 traverses cyclic neighbors in stable order” | `test:unit` | Not required | Pass |
| E17 | `packages/engine/src/turn.test.ts` “E14/E17 resolves two epidemics in order” | `test:unit` | Not required | Pass |
| E18 | `packages/engine/src/turn.test.ts` “E18 stops an epidemic at the outbreak cap” | `test:unit` | Not required | Pass |
| E19 | `packages/engine/src/turn.test.ts` “E19 allows zero supply and loses at the next required addition” | `test:unit` | Not required | Pass |
| E20 | `packages/engine/src/turn.test.ts` “E20 resolves the last card before losing on the next required draw” | `test:unit` | Not required | Pass |
| E21 | `packages/engine/src/actions.test.ts` “E10/E21 cure costs and immediate victory”; `scripts/test-local-play.mjs` “E21 fourth cure reaches victory” | `test:unit`, `test:local-play` | Not required | Pass |
| E22 | `packages/engine/src/turn.test.ts` “E22 infects cured locations even when the Medic is present” | `test:unit` | Not required | Pass |
| E23 | `packages/engine/src/actions.test.ts` “E23 validation and fourth-action boundary” | `test:unit` | Not required | Pass |
| E24 | `packages/engine/src/exploration.test.ts` “E24 explores and replays” | `test:unit` | Not required | Pass |

## Persistence, protocol and security

| ID | Local evidence | Check | Hosted or manual evidence | Status |
| --- | --- | --- | --- | --- |
| P01 | `tests/integration/rooms.test.ts` “deduplicates concurrent and restarted retries” | `test:integration` | Not required | Pass |
| P02 | `tests/integration/rooms.test.ts` “409, 'COMMAND_ID_REUSED'”; `tests/integration/lobby.test.ts` “409, 'COMMAND_ID_REUSED'” | `test:integration` | Not required | Pass |
| P03 | `tests/integration/rooms.test.ts` “accepts only one of two different commands racing at the same revision” | `test:integration` | Not required | Pass |
| P04 | `tests/integration/rooms.test.ts` “rolls back state, events and receipts on a fault” | `test:integration` | Not required | Pass |
| P05 | `tests/integration/rooms.test.ts` “recovers a committed command after a delivery failure and restart during discard”; `packages/protocol/src/room-transport.test.ts` “retries a lost acknowledgement with identical ID and version” | `test:integration`, `test:unit` | Not required | Pass |
| P06 | `tests/integration/rooms.test.ts` “preserves the exact game, decks, RNG and pending discard across real Durable Object eviction”; `tests/integration/realtime.test.ts` “rehydrates socket identity after eviction” | `test:integration` | Real hibernation with live sockets in preview: [T17 O03 row](evidence/T17.md) | Local pass; hosted pending |
| P07 | `tests/integration/lobby.test.ts` “admits a repeated identity once and serializes the race for the final seat”; `tests/integration/lobby.test.ts` “serializes role choices” | `test:integration` | Not required | Pass |
| P08 | `tests/integration/lobby.test.ts` “transfers ownership and gives a departed member only the exact leave receipt”; `scripts/test-connected-room.mjs` “spectator.context.setOffline(true)” | `test:integration`, `test:e2e` | Not required | Pass |
| S01 | `tests/integration/firebase-auth.test.ts` “rejects forged, unsigned, algorithm-confused and type-confused tokens”; `tests/integration/firebase-auth.test.ts` “verifies RS256 and exact Firebase claims” | `test:integration` | Not required | Pass |
| S02 | `tests/integration/firebase-auth.test.ts` “authorizes the normal Worker only by signed UID”; `tests/integration/lobby.test.ts` “keeps missing joins logical and rejects spoofed identities”; `tests/integration/rooms.test.ts` “leaves no storage for requests to an unknown room”; `scripts/load-rooms.mjs` “CROSS_ROOM_READ_FAILED” | `test:integration`, `test:load` | Not required | Pass |
| S03 | `tests/integration/realtime.test.ts` “binds persisted tickets to the room and origin and consumes each once across eviction”; `tests/integration/realtime.test.ts` “rejects expired tickets” | `test:integration` | Not required | Pass |
| S04 | `tests/integration/realtime.test.ts` “expires an idle attachment through its alarm and reconnects the same UID with a new ticket” | `test:integration` | Not required | Pass |
| S05 | `packages/protocol/src/projection.test.ts` “allowlists nested projection fields and bounds recent events”; `tests/integration/rooms.test.ts` “sanitizes logged failures”; `scripts/deploy-cloudflare.mjs` “The web build contains a forbidden deployment marker.” | `test:unit`, `test:integration`, `validate:deployment` | Not required | Pass |
| S06 | `tests/integration/rooms.test.ts` “rejects the local identity on a remote hostname and in the normal Worker entry”; `scripts/check-worker-test-isolation.mjs` “Normal Worker must exclude local identities”; `scripts/deploy-cloudflare.mjs` “The normal Worker did not reject the local test identity.” | `test:integration`, `validate:deployment` | Post-deployment smoke on the preview origin: [T17 live routing row](evidence/T17.md) | Local pass; hosted pending |
| S07 | `tests/integration/rooms.test.ts` “rejects malformed, oversized and spoofed creates”; `tests/integration/rooms.test.ts` “enforces the hourly create budget”; `tests/integration/rooms.test.ts` “limits durable command attempts”; `tests/integration/rooms.test.ts` “charges room reads and ticket requests to the edge IP budget”; `tests/integration/realtime.test.ts` “bounds pending tickets and rejects an oversized socket message” | `test:integration` | Edge rate-limit bindings on the real preview: [T17 O02 row](evidence/T17.md) | Local pass; hosted pending |
| S08 | `tests/integration/lobby.test.ts` “never reactivates an old invite on retry”; `tests/integration/lobby.test.ts` “starts once with a ready roster, freezes membership” | `test:integration` | Not required | Pass |
| S09 | `tests/integration/firebase-auth.test.ts` “verifies RS256 and exact Firebase claims while keeping UID opaque”; `tests/integration/firebase-auth.test.ts` “rejects forged, unsigned, algorithm-confused” | `test:integration` | Wrong-project rejection and project isolation in preview: [T17 Firebase row](evidence/T17.md) | Local pass; hosted pending |
| S10 | `tests/integration/firebase-auth.test.ts` “coalesces certificate fetches, rotates keys”; `tests/integration/firebase-auth.test.ts` “keeps a known key through a refresh outage”; `tests/integration/firebase-auth.test.ts` “fails closed on invalid cache responses” | `test:integration` | Real Google certificate endpoint and CPU on the preview: [T17 CPU row](evidence/T17.md) | Local pass; hosted pending |

## End-to-end and operations

| ID | Local evidence | Check | Hosted or manual evidence | Status |
| --- | --- | --- | --- | --- |
| U01 | `scripts/test-connected-room.mjs` “-player match, ”; `scripts/test-connected-room.mjs` “near-terminal” | `test:e2e` | Four-session manual playtest on the preview: [release playtest](RELEASE.md#4-four-session-playtest) | Local pass; hosted pending |
| U02 | `packages/protocol/src/room-transport.test.ts` “ignores older snapshots”; `packages/protocol/src/room-transport.test.ts` “refreshes stale state without rebasing the old command”; `scripts/test-connected-room.mjs` “session_expired” | `test:unit`, `test:e2e`, `test:connected-smoke` | Real network loss across devices during the playtest: [release playtest](RELEASE.md#4-four-session-playtest) | Local pass; hosted pending |
| U03 | `scripts/test-auth-popup.mjs` “blocked-popup and collision recovery, Microsoft sign-in and logout”; `scripts/test-auth-popup.mjs` “Google sign-in resumes only a validated local room path” | `test:auth-smoke` | Personal Hotmail or Outlook and Google sign-in on the preview: [T11 provider sheet](evidence/T11.md#real-provider-staging-evidence-for-t17) | Hosted pending |
| U04 | `scripts/test-connected-room.mjs` “viewport: { width: 768, height: 1024 }”; `scripts/test-local-play.mjs` “keyboard setup, duplicate role rejection, board inspection and movement at tablet and phone widths” | `test:e2e`, `test:local-play` | Not required | Pass |
| O01 | `tests/integration/rooms.test.ts` “serves SPA navigation and JSON API misses through the real local asset binding”; `scripts/deploy-cloudflare.mjs` “The API fallback did not return the expected JSON 404.” | `test:integration`, `test:smoke` | Post-deployment smoke on the preview origin: [T17 live routing row](evidence/T17.md) | Local pass; hosted pending |
| O02 | `scripts/load-rooms.mjs` “--owned-preview”; `scripts/load-rooms.mjs` “PROJECTION_ISOLATION_FAILED” | `test:load` | 10 rooms × 4 clients × 300 commands on the preview: [T17 O02 row](evidence/T17.md) | Local pass; hosted pending |
| O03 | `tests/integration/rooms.test.ts` “retires an expired room without reviving old IDs”; `tests/integration/realtime.test.ts` “retires an idle room, revokes its live sockets” | `test:integration` | Idle hibernation observed on the preview: [T17 O03 row](evidence/T17.md) | Local pass; hosted pending |
| O04 | `tests/integration/rooms.test.ts` “rejects unknown room and storage versions without rewriting them”; `tests/integration/rooms.test.ts` “migrates a T07 v1 database without rebuilding the room” | `test:integration`, [local rehearsal](evidence/T18.md#local-recovery-rehearsal) | Deploy, roll back and roll forward on the preview: [release rehearsal](RELEASE.md#3-recovery-rehearsal) | Local pass; hosted pending |
| O05 | `scripts/deployment-policy.test.mjs` “live targets use their registered Firebase projects and reject a shared project”; `scripts/validate_build_kit.py` “Share no preview/production limiter namespaces”; `.github/workflows/deploy-cloudflare.yml` “Require the canonical repository and protected main” | `deployment-policy`, `check:docs` | Separate Workers, namespaces and Firebase projects on the account: [T17 O05 row](evidence/T17.md) | Local pass; hosted pending |
| U05 | `scripts/test-auth-popup.mjs` “invite survives reload, refresh preserves the join intent”; `scripts/test-auth-popup.mjs` “configured production auth build excludes local identities” | `test:auth-smoke` | Firebase popup on the Cloudflare origin in Chromium and tablet Safari: [T11 provider sheet](evidence/T11.md#real-provider-staging-evidence-for-t17) | Hosted pending |
