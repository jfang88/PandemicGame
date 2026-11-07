# Local development

Use Node 24.22.1 from `.nvmrc` (`nvm install && nvm use`), npm 11.9.0 and Python 3.
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

Open http://127.0.0.1:5173. The React foundation screen should say **Local Worker connected**.
The Vite same-origin proxy sends `/api/*` to the local Worker at 127.0.0.1:8787.
`GET /api/health` returns JSON with connectivity, build SHA and protocol version. `/api/missing` returns JSON 404,
never the SPA. Stop the development servers with Ctrl+C. No cloud account is needed.

`build` produces web assets and dry-runs the local Worker bundle; it does not deploy.
The normal Worker has a SQLite room binding and rejects room requests until Firebase verification is implemented.
The root deployment configuration remains a template until T17.

Optional public Firebase settings are documented in [firebase.env.example](../config/firebase.env.example).
T01 has no authentication and needs no environment file. Later, public web settings go
in ignored `apps/web/.env.local`; never put secrets in `VITE_` values.
Run `npx playwright install chromium` once, then `npm run test:smoke` with the
usual dev servers stopped for the T01 browser/Worker smoke check. It manages its
own servers on ports 5173/8787; the Worker inspector uses 9230. Linux CI installs
browser system dependencies with `npx playwright install --with-deps chromium`.
Multiplayer E2E tests start in T15.

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
