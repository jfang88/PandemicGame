# Local development

Use Node 24.22.1 from `.nvmrc` (`nvm install && nvm use`), the npm 11 release bundled with it, and Python 3.
From the repository root:

```sh
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npm run check:docs
npm run dev
```

Open http://127.0.0.1:5173. The home screen should say **Local Worker connected** and link to **Play a local game**, a hot-seat game in one browser.
The Vite same-origin proxy sends `/api/*` to the local Worker at 127.0.0.1:8787.
`GET /api/health` returns JSON with connectivity, build SHA and protocol version. `/api/missing` returns JSON 404,
never the SPA. Stop the development servers with Ctrl+C. No cloud account is needed.

`build` produces web assets and dry-runs the local Worker bundle; it does not deploy.
The development Worker verifies Firebase ID tokens for the placeholder project `local-placeholder-not-authenticated`, so it rejects room requests from a real sign-in. Use the loopback test entry below for local rooms.
The root `wrangler.jsonc` holds the named preview and production environments. Deploy only through the [deployment runbook](CLOUDFLARE.md).

Optional public Firebase settings are documented in [firebase.env.example](../config/firebase.env.example).
Without public web settings in the ignored `apps/web/.env.local`, the sign-in page reports that sign-in is unavailable.
Never put secrets in `VITE_` values.
Run `npx playwright install chromium` once, then `npm run test:smoke` with the
usual dev servers stopped for the T01 browser/Worker smoke check. It manages its
own servers on ports 5173/8787; the Worker inspector uses 9230. Linux CI installs
browser system dependencies with `npx playwright install --with-deps chromium`.
The browser suites `test:auth-smoke`, `test:connected-smoke`, `test:e2e` and `test:local-play` start their own servers with loopback test identities. See [TESTING.md](TESTING.md).

## Local room integration

`npm run test:integration` builds the web assets and runs the room suite inside workerd with SQLite-backed Durable Objects. It uses `@cloudflare/vitest-plugin` 1.6.0 with Vitest 4.1.12 and Wrangler 4.158.0. [Cloudflare Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)

For manual tests, stop the normal development servers and run `npm run dev:local-test`. This builds the SPA and starts the separate loopback-only Worker at port 8787. Send `x-pandemic-test-uid` with an opaque test user ID to create or read rooms. This header belongs only to the local-test entry. The normal Worker rejects it.

```sh
curl -H 'Content-Type: application/json' -H 'x-pandemic-test-uid: local-owner' \
  --data '{"roomId":"95bb1722-4b07-4bd1-aa3c-c688665555a7"}' http://127.0.0.1:8787/api/rooms
curl -H 'x-pandemic-test-uid: local-owner' \
  http://127.0.0.1:8787/api/rooms/95bb1722-4b07-4bd1-aa3c-c688665555a7
```

Dependency changes must regenerate the single root lockfile with `npm install`, then
pass `npm ci` and the checks above. Do not use force/legacy-peer-deps to conceal conflicts.
The browser smoke check in [T01 evidence](evidence/T01.md) covers the foundation screen and Worker connectivity.
