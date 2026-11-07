# Cloudflare deployment runbook

Use [Owner Cloud Setup](OWNER_CLOUD_SETUP.md) to configure the preview account,
Worker hostname, Firebase Spark project, and Google and Microsoft providers.
[Agent access](AGENT_ACCESS.md) covers the credential boundary. The deployment
pipeline can be verified locally. Live preview evidence depends on the owner's
Cloudflare, GitHub and Firebase configuration.

## Configuration

The root [Wrangler configuration](../wrangler.jsonc) uses the regular Worker
entry at `apps/worker/src/index.ts` and serves `apps/web/dist` through its
`ASSETS` binding. The SPA handles deep links. Requests to `/api` and `/api/*`
go to the Worker, including the WebSocket upgrade route. The Worker returns JSON
for unknown API routes.

The `preview` and `production` environments use separate Worker names, Durable
Object namespaces, edge rate-limit namespaces, and Firebase projects. Wrangler
registers `GameRoom` with `new_sqlite_classes` in migration `v1`, then
`CreateBudget` in migration `v2`. These tags identify Cloudflare class
migrations. Room storage metadata and the game snapshot have their own versions.

| GitHub environment variable | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase Web app `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Web app `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Web app `projectId` |
| `VITE_FIREBASE_APP_ID` | Firebase Web app `appId` |
| `FIREBASE_PROJECT_ID` | Same project ID as the Web app. The Worker uses this for Firebase JWT issuer and audience. |
| `APP_ORIGINS` | Exact HTTPS `workers.dev` origin for the selected Worker, with no path or trailing slash |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID for the deployment |

In **Settings → Secrets and variables → Actions → Variables**, register
`PANDEMIC_PREVIEW_FIREBASE_PROJECT_ID` as a repository variable. Add
`PANDEMIC_PRODUCTION_FIREBASE_PROJECT_ID` before production. Use distinct project IDs.
The verifier matches the selected environment to this registry and rejects a
shared project.

Set `CLOUDFLARE_API_TOKEN` as a secret on the matching GitHub environment.
Keep separate preview and production tokens. Leave this secret name unset at
repository and organization scope so GitHub cannot fall back to a broader token. Restrict each token to its intended
Worker where Cloudflare permissions allow. Keep the Entra client secret in
Firebase's Microsoft provider settings. The four `VITE_` values are public
browser configuration and are compiled into each environment's web build.

## Verify without deploying

Install the pinned dependencies from a reviewed checkout. Run validation for
the environment you plan to use.

```sh
npm ci
npm run validate:deployment -- preview
npm run validate:deployment -- production
```

Without live configuration, validation uses public fixtures. It checks the
selected Wrangler environment and Firebase configuration, builds the web
assets, checks their contents for deployment and test-identity boundaries, and
runs Wrangler's dry run. The dry run produces a bundle without deploying it.
Use `npm run dev` for local development and the separate loopback test entry for
browser and runtime fixtures.

## Deploy preview from GitHub Actions

1. In the canonical PandemicGame repository, protect `main` and restrict the
   GitHub `preview` environment to that branch. Add the environment variables
   and secret listed above, and register the preview Firebase project ID.
2. In **Actions → Deploy Cloudflare → Run workflow**, select branch `main`
   and set `target` to `preview`. Leave `release_sha` blank or enter the full
   SHA of the selected commit. The workflow checks the canonical
   repository ID and requires a protected `main` ref. It runs the shared
   PR checks before the deployment job gains access to environment credentials.
3. Check the deployment run for the selected commit SHA, environment, asset
   checks, and Wrangler dry run. The deploy job rebuilds for the selected
   Firebase project and uses the pinned Wrangler CLI. Environment-scoped
   concurrency serializes deployment runs for that target.
4. Open the deployed origin and confirm `/api/health` returns JSON with
   `ok`, `buildSha` and `protocolVersion`. Confirm the build SHA matches the
   reviewed commit. If a post-deployment smoke step fails, check the active
   Cloudflare version before retrying. Open a direct SPA deep link and an unknown `/api/*` path
   to check the SPA response and JSON 404, respectively.
5. Complete the preview checks in [TESTING.md](TESTING.md) and record the actual
   evidence. Cover Google and personal Hotmail or Outlook popups on Chromium
   and tablet Safari/WebKit, private room access, reconnect, durable save,
   idle hibernation, expiry, environment isolation, and the bounded load
   harness. Verify sanitized observability and record Worker Free CPU and
   request usage separately from latency. Use
   [the provider evidence sheet](evidence/T11.md#real-provider-staging-evidence-for-t17)
   for provider results.

Fork and contributor PR checks run without deployment credentials. The
workflow is manually dispatched from protected `main`. Live preview and
provider checks are pending until an authorized owner deployment runs.

## Owner-controlled local deployment

The owner can run the equivalent verifier and deployment from a reviewed
checkout with a clean working tree. Supply the real public environment settings
and Firebase project registry values listed above. Set
`BUILD_SHA` to the checkout's full reviewed commit SHA, and provide the scoped
`CLOUDFLARE_API_TOKEN` through the owner's local credential mechanism. Use
the selected environment's matching Cloudflare account ID. The verifier checks
that `BUILD_SHA` matches the checkout.

```sh
npm run deploy:preview
```

The local deploy command requires live settings and checks the same deployment
configuration and assets before running Wrangler. Keep credential values out
of the repository and shell history.

## Production and rollback

Production is a separate owner release after T18 evidence passes. Configure the
GitHub `production` environment with its own Firebase project, exact
`workers.dev` origin, and Cloudflare credential. In **Deploy Cloudflare**,
select protected `main`, set `target` to `production`, and enter the
selected, reviewed 40-character main commit SHA in `release_sha`. The
canonical repository owner must dispatch the workflow or rerun it. Apply any
available environment reviewer protections in repository settings.

For an explicitly authorized local production release, use the production
settings, set `PANDEMIC_PRODUCTION_CONFIRM_SHA` to the same full commit as
`BUILD_SHA`, and run `npm run deploy:production`. Record the released SHA,
Worker URL, migration tags and storage/rules versions. Recheck authentication,
room access and resume with ordinary accounts.

For recovery, select a previously verified Worker version that can read the
current room storage metadata and rules. Rehearse that rollback in preview
with existing rooms and a pending discard. If a previous build cannot read
the migrated storage, deploy a compatible forward fix. Preserve the existing
object namespaces and room data.
