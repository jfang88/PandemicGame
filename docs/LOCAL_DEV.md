# Local development

Use Node 24.22.1 from `.nvmrc` (`nvm install && nvm use`), npm 11.9.0 and Python 3.
From the repository root:

```sh
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run check:docs
npm run dev
```

Open http://127.0.0.1:5173. The React foundation screen should say **Local Worker connected**.
The Vite same-origin proxy sends `/api/*` to the local Worker at 127.0.0.1:8787.
`GET /api/health` returns JSON `{"ok":true}`; `/api/missing` returns JSON 404,
never the SPA. Stop the development servers with Ctrl+C. No cloud account is needed.

`build` produces web assets and dry-runs the local Worker bundle; it does not deploy.
`apps/worker/wrangler.local.jsonc` has no room bindings or migrations.
The root deployment configuration remains a template until T17.

Optional public Firebase settings are documented in [firebase.env.example](../config/firebase.env.example).
T01 has no authentication and needs no environment file. Later, public web settings go
in ignored `apps/web/.env.local`; never put secrets in `VITE_` values.
Run `npx playwright install chromium` once, then `npm run test:smoke` with the
usual dev servers stopped for the T01 browser/Worker smoke check. It manages its
own servers on ports 5173/8787; the Worker inspector uses 9230. Linux CI installs
browser system dependencies with `npx playwright install --with-deps chromium`.
Integration tests start in T07 and multiplayer E2E tests in T15; neither script exists yet.

Dependency changes must regenerate the single root lockfile with `npm install`, then
pass `npm ci` and the checks above. Do not use force/legacy-peer-deps to conceal conflicts.
Vitest 4.1.12 matches the current Cloudflare Workers pool peer range (`^4.1.0`);
T07 must recheck compatibility when adding that pool. The browser smoke check in
[T01 evidence](evidence/T01.md) is not the later multiplayer E2E suite.
