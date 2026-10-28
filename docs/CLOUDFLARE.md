# Cloudflare implementation and deployment runbook

This is a target runbook. T01 creates executable scripts; T17 validates configuration against its pinned Wrangler version. No account resources have been provisioned by this planning commit.

## Accounts and local prerequisites

Owner: Cloudflare account with Workers and SQLite Durable Objects available; Supabase project; Microsoft and Google OAuth apps (AUTH.md). A custom domain is optional: use the Worker-provided HTTPS URL first. Paid-plan upgrade is optional and an owner billing decision.

Agent: choose a supported Node LTS compatible with current Vite/Wrangler, pin it in .nvmrc and CI, create npm workspaces and package-lock.json. Do not install a globally floating CLI. Use the locally pinned Wrangler through npm scripts. Cloudflare's Workers Vitest integration should match the pinned Vitest version.

## Required root scripts after their tasks

| Script | Contract |
| --- | --- |
| npm run dev | Local web+Worker, same-origin API via Vite proxy; persistent local DO storage |
| npm run dev:local-test | Explicit loopback-only test identity entry point; never a deploy target |
| npm run lint / typecheck | Whole workspace static checks |
| npm run test:unit | Pure engine/protocol tests |
| npm run test:integration | Worker/DO tests in Cloudflare runtime |
| npm run test:e2e | Playwright using local test identity configuration |
| npm run build | Web assets plus deployable Worker validation/bundle |
| npm run check:docs | Internal links, board integrity and task dependency validation |
| npm run deploy:preview | Build then Wrangler deploy --env preview |
| npm run deploy:production | Build then Wrangler deploy --env production; owner-triggered release only |

Use `npm ci`, then checks, then build. Avoid test scripts that succeed when no tests exist. Explain which scripts T01 has established and which are introduced later.

## Wrangler configuration shape

See [../config/wrangler.example.jsonc](../config/wrangler.example.jsonc). It is a non-executable template, not a deployed configuration. T17 copies/adapts it to root `wrangler.jsonc`, substitutes project URLs/keys through appropriate configuration, runs Wrangler validation, and documents exact commands.

- Worker entry `apps/worker/src/index.ts` exports the default fetch handler and named `GameRoom` class.
- Static build output `apps/web/dist`, ASSETS binding, SPA fallback.
- `run_worker_first: ["/api/*"]` sends API/upgrade requests to Worker; Worker explicitly returns JSON 404 for unknown `/api` routes rather than ASSETS fallback.
- `GAME_ROOMS` binding points to GameRoom. Initial migration uses `new_sqlite_classes`, not legacy KV `new_classes`.
- Repeat non-inherited bindings/variables in named environments. Preview and production deploy as different Worker names and object namespaces. Never point preview at production storage.
- Pin compatibility_date deliberately and test before advancing it. Do not enable Node compatibility unless a dependency demonstrably needs it.
- Prefer Web Platform APIs supported by Workers. No filesystem/process dependence in server code.

## Configuration inventory

| Name | Where | Secret? |
| --- | --- | --- |
| CLOUDFLARE_ACCOUNT_ID | CI environment / local deployment context | Identifier, not a credential |
| CLOUDFLARE_API_TOKEN | GitHub environment secret | Yes; scoped only to deployment needs for this account |
| SUPABASE_URL | Worker vars and frontend VITE_SUPABASE_URL | Public project URL |
| SUPABASE_PUBLISHABLE_KEY | Frontend VITE_SUPABASE_PUBLISHABLE_KEY | Public publishable key only |
| SUPABASE_JWT_ISSUER / SUPABASE_JWT_AUDIENCE | Worker vars | Public; issuer is pinned project's /auth/v1; audience authenticated |
| ALLOWED_ORIGIN | Worker vars | Exact deployed origin |
| APP_ENV | Worker vars | preview or production; test bypass never accepted |
| Microsoft/Google client secrets | Supabase provider dashboard only | Yes; never in repository, frontend or Worker |

Use asymmetric Supabase JWT signing keys and project JWKS URL `/auth/v1/.well-known/jwks.json`. Validate actual issuer/audience against a real staging token. Do not silently accept arbitrary Supabase projects. No Supabase service-role key is needed by this architecture. .dev.vars and .env.local stay ignored; commit placeholder examples only. Build-time VITE variables must be rebuilt for each environment, not assumed to follow Wrangler vars.

## Preview deployment

1. Configure real preview identity project and callback allowlists. Use a stable preview Worker URL, not an unbounded OAuth wildcard.
2. Authenticate locally with Wrangler login, or supply scoped account/token credentials to the trusted CI environment. Never print tokens in logs.
3. Run the full applicable tests, production-artifact bypass scan and build.
4. Run deploy:preview. Record resulting URL, commit SHA, Worker name, migration tag and rules/schema versions.
5. Test direct SPA deep links and JSON API 404s, both providers, private room access, four users, reconnect, durable save, and expiry. See TESTING.md.
6. Verify observability redacts authorization, ticket query strings and invitation secrets. Inspect hibernation/cost behavior over an idle interval.

## GitHub Actions target

T01: PR checks with contents:read, npm ci, cached dependencies, lint/typecheck/unit/build and docs validation. T07 adds Worker integration; T15 adds Playwright and failure traces with short retention and no auth tokens. Use pinned action versions/commit SHAs verified against upstream at implementation time.

T17: workflow_dispatch with preview or production input, trusted main-branch commits only, explicit environment name, minimal permissions, deployment concurrency per environment, timeout, full checks before deploy. Production uses GitHub environment protection if available and configured; do not claim it is enabled without inspecting settings. Do not use pull_request_target to run contributor code with secrets. Fork PR CI never receives deployment credentials.

## Production and rollback

Owner triggers production after T18 evidence passes. Confirm production OAuth redirects and independent secrets/bindings, then deploy the tested commit. Perform smoke tests with normal accounts. Record release SHA/URL and schema version. Rollback uses the previous known-good Worker version only if it can read current schema/rules; otherwise use a forward fix. Do not revert storage migrations by deleting objects. Test recovery in preview before release, including hibernating rooms and ongoing games across an update.
