# Start here

## What is ready

This build kit makes the default product, rules, architecture, protocol, task order and test gates concrete. It includes the T01 local React/Worker foundation. Gameplay, authentication and public deployment are not implemented. See [local development](LOCAL_DEV.md) and [T01 verification](evidence/T01.md).

## Owner account creation and secure automation

Follow [owner onboarding and coding-agent deployment access](AGENT_ACCESS.md) for step-by-step Cloudflare/Firebase registration, Google/Hotmail setup, Cloudflare token scopes, GitHub secrets, separate preview/production privileges, and safe ChatGPT/Claude workflows. This is preparatory documentation; no provider resources are claimed to exist.

## Owner setup versus agent work

An agent can complete T01–T10 and most auth/backend code locally without account secrets. The owner supplies Cloudflare account access through secure credentials, a Firebase Spark project, and Microsoft OAuth registration/Google provider configuration before real-provider staging tests. See AUTH.md and CLOUDFLARE.md. Never paste secrets into an issue or prompt.

## Execution sequence

1. Start T01. Use one branch/PR per task and the prompt inside its task file.
2. Merge passing tasks, then choose the next dependency-ready task in TASKS.md. Numeric order is a safe default.
3. Review engine behavior at T06, persistence at T08, authentication at T11, and release readiness at T18 with prompts/REVIEW_TASK.md.
4. Do not start public deployment before authorization and production-bypass tests pass.
5. T18 prepares a release and evidence; publishing production is a deliberate owner-triggered workflow.

No agents are required to run in parallel. If the owner later chooses parallel work, use separate worktrees/branches and assign disjoint ready tasks. Shared protocol changes require coordination.

## Target layout created by T01

| Path | Responsibility |
| --- | --- |
| apps/web | React/Vite UI; no server secrets |
| apps/worker | Worker router, auth, room Durable Object |
| packages/engine | Pure rules, state transitions, deterministic RNG |
| packages/protocol | Runtime request/response schemas and types |
| tests/integration | Cloudflare runtime/storage/auth boundary tests |
| tests/e2e | Playwright independent user contexts |
| spec | Versioned board data and acceptance fixture inputs |
| docs/tasks | Small agent-ready task specifications |

Use npm workspaces and a single lockfile. Prefer explicit names and a small dependency set. Avoid Next.js/SSR because this game needs a static client and a Worker API, not server-rendered pages.

## Change control

The rules in RULES.md are selected defaults so work can begin immediately. Future balance changes get a new rulesVersion and fixtures; never silently alter an ongoing room. Storage schema migrations are separate from rules versions. Update affected task and test contracts together.

## Selected low-cost identity design

Firebase Authentication Spark is the sole login provider. All game hosting/storage stays on Cloudflare Free initially. Two infrequent players are the capacity baseline; 2–4-player support remains required. Task IDs and dependencies are stable, and T01 is complete, T02 deterministic setup is in review, and T03–T18 remain not started. There are no existing users/data to migrate. See AUTH.md before T11 and CLOUDFLARE.md before T17.
