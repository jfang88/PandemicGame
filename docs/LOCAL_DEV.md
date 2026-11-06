# T01 local scaffold (draft)

Use Node from .nvmrc, npm and Python 3. Run `npm install` to create the **required lockfile**, then `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm run check:docs`. No dependency installation or runtime verification has yet been completed on this branch; do not merge without a committed lockfile and green checks.

Run `npm run dev` and open http://127.0.0.1:5173. The Vite same-origin proxy sends /api/health to the local Worker at 127.0.0.1:8787. `GET /api/health` should yield JSON {"ok":true}; an unrecognized /api route should yield JSON 404. Confirm both in a browser/network tools before merging.

Optional public Firebase frontend settings are documented in config/firebase.env.example; local environment files are ignored. T01 has no authentication. Do not put secrets in VITE_ values. Integration tests start in T07, and E2E in T15, so neither command exists yet. No deployment is configured.

**Blockers remaining:** npm registry access, generation/commit of package-lock.json, verification of actual dependency compatibility and complete acceptance checks. GitHub Actions uses read-only permissions but its action tags need migration to verified full commit SHAs before merge.
