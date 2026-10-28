# T01 — Workspace and CI foundation

Status: not started. Dependencies: none.

## Read

- [docs/START_HERE.md](../../docs/START_HERE.md)
- [docs/CLOUDFLARE.md](../../docs/CLOUDFLARE.md)

## Deliverables

- Create npm workspaces for web, worker, engine and protocol; strict TypeScript, compatible pinned dependencies, one lockfile, Node version pin and lint configuration.
- Create minimal real React screen, Worker health route and pure package smoke tests; no game or public deployment yet.
- Add root lint/typecheck/test:unit/build/check:docs scripts, local dev instructions, secret-safe ignore/example files, and PR GitHub Actions with read-only permissions. Document later test scripts as unavailable until their tasks.
- Reserve Firebase public frontend config and FIREBASE_PROJECT_ID Worker config only; do not add Firebase databases, Admin SDK credentials or paid Firebase services.

## Acceptance gate

- Fresh clone + npm ci + lint + typecheck + test:unit + build + check:docs pass.
- Local browser loads scaffold and health endpoint; no success-only script stubs or credentials.

## Checks

- Run all newly introduced scripts and record Node/package versions; validate build-kit Python script.

## Implementation boundaries

T01 supplies executable local scaffolding, not a playable game. Keep the engine pure and deterministic, the server authoritative, and future room mutations atomic/idempotent. Do not implement gameplay, room persistence, authentication, deployed test identities, or later-task protocol schemas.

Use an explicitly local Wrangler configuration for development and Worker bundle validation. Promotion of the deployment template to root `wrangler.jsonc`, named deployment environments, real provider checks and deployment workflows belong to T17. Do not copy a `GAME_ROOMS` binding or migration that references an unimplemented `GameRoom` class.

The task-specific deliverable above and CLOUDFLARE.md govern script availability: implement `dev`, `lint`, `typecheck`, `test:unit`, `build` and `check:docs` now. Although AGENTS.md lists all eventual root test commands together, `test:integration` is introduced by T07 and `test:e2e` by T15. Document them as unavailable; do not add success-only placeholders.

## Required file coverage

Paths below are implementation targets; filenames not prescribed by the build kit are suggested defaults.

| Area | Files or paths |
| --- | --- |
| Workspace | Root `package.json`, one `package-lock.json`, `.nvmrc`, shared strict TypeScript and lint configuration |
| Web | `apps/web/package.json`, TypeScript/Vite configuration, `index.html`, React entry and minimal screen |
| Worker | `apps/worker/package.json`, TypeScript configuration, `src/index.ts`, explicitly local Wrangler configuration |
| Pure packages | `packages/engine` and `packages/protocol`: manifests, TypeScript configuration, minimal exports and meaningful smoke tests |
| Tests | Unit-test configuration; document future `tests/integration` and `tests/e2e` without fake suites |
| CI | `.github/workflows/ci.yml` |
| Documentation | Local setup instructions, `TASKS.md`, this task's status and evidence |
| Configuration hygiene | `.gitignore`, public Firebase example and ignored local environment files |
| Existing validator | `scripts/validate_build_kit.py`, narrowly adjusted only if needed |

## Acceptance evidence checklist

The two acceptance bullets above remain authoritative and match `spec/tasks.json`. T01 has no numbered E/P/S/U/O acceptance IDs; identify evidence by the relevant T01 bullet rather than claiming later gates.

- From a fresh checkout of the implementation commit, run `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build` and `npm run check:docs`.
- Run `python3 scripts/validate_build_kit.py` explicitly and record Node, npm and installed dependency versions.
- Run every newly introduced script. Verify the real React screen in a local browser and the health endpoint through the web origin using the Vite API proxy.
- Suggested health contract: `GET /api/health` returns HTTP 200, `application/json` and `{"ok":true}`. Include a negative routing check: an unknown `/api/*` path returns JSON 404 rather than the SPA.
- Build must produce web assets and validate/bundle the Worker locally, without publishing it. Exercise meaningful positive/negative scaffold behavior; no silent no-test success.
- Record exact command outcomes and browser evidence. Distinguish failures, environmental blockers and suites not implemented.
- The existing validator recursively scans the repository. Check its behavior after dependency installation; if necessary, exclude dependency/generated directories while preserving all board, link, task dependency, provider and task-spec consistency assertions. Add a focused regression for any validator change.

## Local prerequisites

- Git, GitHub CLI authenticated for repository/PR access, Python 3, a browser, Node/npm and an OS supported by the selected Wrangler/workerd release.
- Choose a supported Node LTS compatible with current Vite and Wrangler; pin it in `.nvmrc` and CI. Verify exact dependency versions against current official documentation, commit the lockfile and use `npm ci` in CI.
- Use project-local pinned Wrangler through npm scripts, not a globally floating CLI. Verify Workers Vitest integration compatibility with the chosen Vitest version before introducing the runtime suite.
- Cloudflare account credentials, Firebase projects and Microsoft/Google provider setup do not block T01. The scaffold must run with placeholder public configuration.
- Reserve only the public `VITE_FIREBASE_*` fields in the existing example and Worker `FIREBASE_PROJECT_ID`. Do not provision accounts, request secrets, enable paid services or add auth bypasses.

## Copyable task prompt

```text
Implement only T01 — Workspace and CI foundation in jfang88/PandemicGame,
addressing issue #1.

Read docs/START_HERE.md, AGENTS.md, TASKS.md, this complete task file,
prompts/IMPLEMENT_TASK.md, docs/CLOUDFLARE.md, docs/ARCHITECTURE.md,
docs/TESTING.md, both config examples, scripts/validate_build_kit.py,
.github/pull_request_template.md and the T01 entry in spec/tasks.json.
Read only relevant additional code/specs as needed.

Recheck current main, issue #1 and existing PRs before writing.
T01 has no dependencies. If it is already implemented or underway,
report that rather than duplicating work.

Use branch agent/T01-workspace-and-ci-foundation and one writer.
Briefly state your approach, then implement this task's deliverables,
file coverage and acceptance evidence checklist. Resolve the eventual
test-script list using this task's explicit scope: integration is T07,
e2e is T15; document both as unavailable now.

Keep strict TypeScript, React/Vite, npm workspaces, pure packages and
the Cloudflare architecture. Select compatible versions from current
official docs, pin the Node version and commit one root lockfile.
Use an explicitly local Wrangler config and a same-origin Vite API proxy.
Do not implement GameRoom, gameplay, auth or later-task features.

Add PR checks with contents: read, npm ci, dependency caching,
lint/typecheck/unit/build/docs validation and verified pinned actions.
Do not add deployment credentials, pull_request_target or auto-deployment.

Keep example values public/placeholders and local secrets ignored.
Preserve all existing build-kit validator assertions; narrowly exclude
dependency/generated trees if needed after npm ci.

Run all introduced scripts and the fresh-checkout acceptance sequence.
Record versions, actual commands/results and local browser evidence.
Never claim missing suites or environmental blockers passed.
After two unsuccessful repair attempts, stop and use
prompts/DEBUG_HANDOFF.md.

Update TASKS.md and this task file to "in review" with implementation
evidence; keep the backlog introduction consistent without changing
later task statuses. Commit the scoped change and open one PR using
the repository template, with "Closes #1", changed files, acceptance
coverage and limitations. If checks are blocked, use a draft PR and
identify the blockers.

Do not mark done, merge, deploy, alter accounts/billing, or start T02
or any later task.
```

## Low-cost coding-agent launch

These commands are for a future implementation run, not evidence that T01 has been implemented. Use an installed, authenticated Codex CLI and a supported Node environment. GPT-6 Luna is the low-cost focused-coding example verified on 2026-10-28; confirm availability for the account at execution time. See [official model guidance](https://learn.chatgpt.com/docs/models).

```bash
gh auth status
gh repo clone jfang88/PandemicGame
cd PandemicGame
git switch main
git pull --ff-only
gh issue view 1
gh pr list --state all
git switch -c agent/T01-workspace-and-ci-foundation
codex --version
codex -m gpt-6-luna
```

Paste the task prompt above into the interactive session. Keep normal permission controls enabled. If a checkout or task branch already exists, inspect and reuse it rather than overwriting work.

After the agent creates the workspace and lockfile, its acceptance run includes:

```bash
nvm install
nvm use
node --version
npm --version
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run check:docs
python3 scripts/validate_build_kit.py
npm run dev
```

The `nvm` commands assume nvm is installed; otherwise use the same pinned Node version through the local version manager. The final command remains running for the local browser check. A successful implementation ends with one tested T01 PR in review, not a deployment or the next task.
