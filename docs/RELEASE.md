# Release guide and known issues

This guide is for the repository owner. It covers what was tested, the hosted checks that remain before release, and the production release steps. T18 did not deploy anything. Production remains an explicit owner action, and no coding agent has a Cloudflare, Firebase or GitHub environment credential.

## Release candidate

| Item | Value |
| --- | --- |
| Code tested | `main` at `21a54e0` (T17 merge) plus the T18 branch. T18 changes no application code. It updates documentation, the traceability validator, CI wiring and the `concurrently` development dependency. |
| Release commit | The `main` commit that the preview deployment verifies. Use that exact SHA as `release_sha` for production. |
| Protocol / game snapshot schema / storage metadata | 1 / 1 / 6 |
| Rules / board | `containment-v1` / `grid48-v1` |
| Cloudflare class migrations | `v1` (`GameRoom`), `v2` (`CreateBudget`), both SQLite-backed |
| Toolchain | Node 24.22.1, Wrangler 4.158.0, workerd 1.20261104.1, Firebase Web SDK 13.2.0, JOSE 6.2.15, Vite 8.3.6 |
| Plans | Cloudflare Workers Free and Firebase Authentication Spark. See [plan confirmation](evidence/T18.md#plan-and-billing-confirmation). |

The [traceability matrix](TRACEABILITY.md) lists all 52 acceptance IDs. 38 pass locally and need no hosted evidence. 12 pass locally but also need preview or manual evidence. U03 and U05 can only pass with the real providers on the preview. Release is blocked until those 14 rows pass.

## 1. Owner prerequisites

Complete these before the first preview dispatch. [Owner cloud setup](OWNER_CLOUD_SETUP.md) and the [deployment runbook](CLOUDFLARE.md) have the console steps.

- [ ] Protect `main` in **Settings → Branches**. On 2026-11-07 the GitHub API reported `main` as unprotected. The Deploy Cloudflare workflow refuses every dispatch until `main` is protected.
- [ ] Create the GitHub `preview` environment and restrict it to `main`. Add the public variables and the preview-only `CLOUDFLARE_API_TOKEN` secret. Register `PANDEMIC_PREVIEW_FIREBASE_PROJECT_ID` as a repository variable.
- [ ] Create the preview Firebase Spark project with Google and Microsoft providers. Add the exact preview `workers.dev` hostname as an authorized domain.
- [ ] Confirm the Cloudflare account is on Workers Free and that no paid plan or billing change was made.

## 2. Preview deployment and the T17 gate

1. Dispatch **Actions → Deploy Cloudflare** from `main` with `target` set to `preview`. The workflow runs every PR check, deploys, and then checks `/api/health`, the JSON 404, an SPA deep link and rejection of the local test identity.
2. Record the run link, Worker version ID, build SHA and preview origin on the [T17 evidence sheet](evidence/T17.md).
3. Complete each row on that sheet: provider sign-in in Chromium and tablet Safari, idle hibernation, namespace isolation, the owned-preview load run and the Cloudflare CPU quantiles.
4. Keep sanitized observations only. Do not record tokens, invite links, tickets or account identifiers.

## 3. Recovery rehearsal

O04 needs two preview deployments of compatible commits. The workflow always deploys the current `main` commit, so use two consecutive `main` commits. The second can be the commit that records T17 evidence.

1. Deploy commit A to preview. In the app, create a lobby with two members, and a two-player game that is paused for a discard. In the game, pass until a player draws over the hand limit.
2. Note each room's revision, lifecycle, the discard owner and that owner's hand.
3. Deploy commit B to preview. Confirm `/api/health` reports B, and that both rooms show the same revision and state.
4. Roll back to A's version. Use the Worker's **Deployments** page in the Cloudflare dashboard, or run `npx wrangler rollback <version-id> --env preview` with the owner's preview credential. Confirm `/api/health` reports A. Resolve the discard and make one lobby change.
5. Roll forward to B's version and confirm both rooms keep A's writes. Make one more move.
6. Record the version IDs, revisions and results in the [T18 evidence report](evidence/T18.md#local-recovery-rehearsal).

Cloudflare rollback limits:

- A rollback cannot cross a Durable Object class migration.
- It can select only the 100 most recent versions.
- It does not change stored data.

Every deployment of this repository already contains migrations `v1` and `v2`. A storage-v5 build was never deployed, so the incompatible downgrade cannot be selected in preview. The local rehearsal shows that a storage-v5 build refuses storage-v6 rooms with `503 ROOM_INCOMPATIBLE` and leaves them unchanged. If a future release raises the storage version, roll back only to a version that reads it, or deploy a forward fix. See [Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

## 4. Four-session playtest

Run this on the preview after the T17 provider rows pass. It complements the scripted matches, which measure synchronization and legality, not balance.

- Use four separate accounts: at least one Google account and one personal Hotmail or Outlook account.
- Use at least two devices on two networks, including one tablet running Safari.
- Create a room and share the invite. Have each player join, pick a role and ready up, then start.
- Play to a win or loss, or for at least three full rounds.
- Cover a discard, a reload mid-turn, and a device going offline for one to two minutes during another player's turn.
- Include a 15-minute idle pause with the room open, then continue without reloading.

Record a row for each session:

| Date | Preview origin and build SHA | Devices, browsers and providers | Outcome and final revision | Converged after each move | Problems observed |
| --- | --- | --- | --- | --- | --- |
| Pending | | | | | |

## 5. Operational limits, alerts and backups

- **Limits.** T18 checked the [operations limits table](OPERATIONS.md#initial-application-limits) against the Worker constants and both Wrangler environments. Every value matches.
- **Usage alerts.** No Workers or Durable Objects usage notification has been confirmed for the Free plan. Cloudflare budget alerts apply to pay-as-you-go accounts. On Workers Free, a request over a daily limit fails until 00:00 UTC rather than adding a charge. Open **Notifications** in the Cloudflare dashboard, enable any Workers or Durable Objects alert it offers, and record which ones exist. Until then, check **Workers & Pages → Usage** weekly during early play. Firebase Spark has no billing account.
- **Backups.** The application has no backup or export. Cloudflare documents 30-day point-in-time recovery for SQLite Durable Objects through the storage API. The app exposes no restore path, local development does not support it, and its availability on Workers Free is unverified. A restore would need a reviewed code change. Do not describe room data as backed up. Retention deletes rooms after 7 or 30 days anyway.

## 6. Production release

Production needs all of the following first:

- Every row in the [traceability matrix](TRACEABILITY.md) shows `Pass`, and `npm run check:docs` passes.
- The T17 and T18 evidence is recorded.
- No critical or high issue is open.
- The owner explicitly decides to publish.

1. Create the production Firebase project, Microsoft app registration and authorized domain. Create the GitHub `production` environment with its own credential, and register `PANDEMIC_PRODUCTION_FIREBASE_PROJECT_ID`.
2. As the repository owner, dispatch **Deploy Cloudflare** from `main` with `target` set to `production`. Set `release_sha` to the full verified SHA.
3. The workflow repeats the automatic smoke checks. Then sign in with Google and with a personal Microsoft account. Create a room, invite a second account, join, reload and resume.
4. Record the SHA, Worker URL, version ID, migration tags, storage and rules versions, and the smoke results.

Use section 3 for production rollback. Preserve the Durable Object namespaces.

## Known issues

| ID | Severity | Issue | Mitigation or follow-up |
| --- | --- | --- | --- |
| K1 | Fixed | Reading or requesting a ticket for an unknown room ID created a permanent empty room object with its schema, and those routes had no edge throttle. | A room object now creates its schema only in `create`. Room reads and ticket requests share the per-IP edge limit with create and join. The owned-preview load profile paces them. |
| K2 | Medium | Workers Free daily limits apply to every `/api/*` request, including unauthenticated health checks. A `workers.dev` origin has no zone firewall, so heavy traffic can make the game unavailable until 00:00 UTC. | Inherent to the chosen free plan. Watch usage. A custom domain with zone rate limiting or Workers Paid would require an explicit owner decision. |
| K3 | High (not shipped) | `npm audit` reports `@grpc/grpc-js` advisories through `firebase` → `@firebase/firestore`. Firebase 13.2.0 is the latest release and still pins `~1.9.0`. | The app imports only `firebase/app` and `firebase/auth`. The built web and Worker bundles contain no gRPC code. Recheck when Firebase updates. |
| K4 | Moderate (dev only) | `minimatch` in `typescript-eslint`. The latest release has no fix. | Used only by lint. Recheck on dependency updates. |
| K5 | Low | npm 11.19 warns that install scripts for `workerd`, `esbuild`, `protobufjs` and `@firebase/util` are not covered by an `allowScripts` policy. All checks pass with the warning. | Review whether to approve these scripts before a future npm release changes the default. |
| K6 | Low | [PROTOCOL.md](PROTOCOL.md) lists an event paging route that the Worker does not implement. Snapshots carry the latest 30 events. | The route is marked not implemented. Add it only with a protocol change. |
| K7 | Low | No tooling finds or deletes a user's rooms on request. Rooms are keyed by room ID. | Retention removes data after 7–30 days. Define the removal process before a public launch, as [OPERATIONS.md](OPERATIONS.md#failure-and-support-runbook) requires. |
| K8 | Info | Balance is unassessed. The scripted drivers and random exploration end in losses, and wins are verified only with near-terminal fixtures. | Record the four-session playtest observations. A balance change needs a new rules version. |
| K9 | Info | `apps/worker/wrangler.local*.jsonc` are loopback development configurations. A manual `wrangler deploy` of the local-test configuration would publish its fixtures, though its test identity accepts only loopback hostnames. | Deploy only through the reviewed workflow or `npm run deploy:*`, which use the root `wrangler.jsonc` environments. |
