# Agent working agreement

## Purpose and authority

Build the 2–4-player game specified here for Cloudflare. Read docs/START_HERE.md first. User instructions take precedence; otherwise RULES.md is authoritative for gameplay, PROTOCOL.md for wire behavior, and DATA_MODEL.md for persisted state. Task files define scope and acceptance. Record contradictions rather than silently changing rules. Cosmetic choices can be made autonomously.

## Work size and cost

- Implement one ready task per branch/PR: `agent/Txx-short-description`.
- Read the task, referenced specs, relevant code and tests; do not repeatedly ingest the entire repository.
- Use a cheap coding model for routine implementation. Escalate after two unsuccessful repair attempts with prompts/DEBUG_HANDOFF.md. Use a stronger reviewer for rules, transaction, auth and release gates.
- Keep a single writer per task. Do not add frameworks, services or unrelated refactors to solve a small task.
- Do not claim tests passed without running them. Report environmental blockers separately from failures.

## Non-negotiable implementation constraints

- TypeScript strict mode; React/Vite UI, pure rules package, shared validated protocol, Worker and SQLite Durable Objects.
- Server owns identity, state, random seed, shuffled decks, legality and victory/defeat. No client-state overwrites.
- Pure engine receives deterministic RNG state and returns new state/events; no network, DB, clock or ambient randomness.
- All mutation validation, version checking, deduplication and state/event/receipt writes must form one atomic room transaction. No external awaits within the transaction.
- Persist before acknowledging/broadcasting. Discard uncommitted in-memory candidates on failure.
- Use the hibernation WebSocket API. Reconstruct identity attachments and room state after hibernation. No always-running heartbeat timer.
- Use explicit public projections; never serialize the internal state directly to clients or logs.
- Never put Firebase service-account private keys, OAuth client secrets, deployment tokens or test authentication bypasses in frontend assets.
- Local test authentication is a separate local-only entry point/configuration. Production must reject its tokens; preview uses real authentication.
- Parameterize SQL; cap inputs, room creation, sockets and command rates. Do not log tokens, invite secrets, tickets, hands or future decks.
- Never force-push main, delete unrelated work, deploy automatically from untrusted PRs, or change billing/account settings as part of a coding task.

## Validation and delivery

T01 establishes root scripts: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm run build`, `npm run check:docs`. Until an applicable test suite exists, explicitly report it as not implemented; never add success-only stubs or silent no-test passes.

After each task: run relevant checks; include exact command outcomes, acceptance IDs, limitations and changed files in the PR; update TASKS.md and the task file to `in review` with evidence. Mark `done` only once merged and its gate is met. Reference the mirrored issue with `Closes #N` when implementing it. Keep tasks blocked by missing credentials open.

Dependency versions must be chosen from current official documentation, pinned by package-lock.json, and installed with `npm ci` in CI. Verify Cloudflare test-runner compatibility; do not guess current package versions from these planning documents.

## Definition of done

The scoped feature works through its real boundary; meaningful positive and negative tests pass; docs match behavior; no secrets or skipped acceptance tests; required CI passes. Deployment tasks additionally need recorded staging checks and a documented recovery path. A rendered screen or a mocked success response alone is not completion.

## Firebase identity constraints

Use Firebase Authentication Spark and the Web SDK popup flow specified in docs/AUTH.md. Verify RS256 Firebase ID tokens with fixed Google X.509 certificates and configured project claims; never authorize by an unverified decoded token. Treat UID as opaque, not UUID. Do not add Firebase databases/functions, service-account keys, phone auth, Blaze billing, a custom OAuth code-exchange callback, or deployed Firebase Auth Emulator bypasses. No user migration is needed before coding.
