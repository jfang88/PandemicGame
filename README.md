# PandemicGame — Cloudflare build kit

An original Pandemic-inspired cooperative browser game for **2–4 players per private room**. This repository contains the rules engine, the Worker and room backend, the React client, Firebase sign-in, the test suites and a manual deployment workflow. Tasks T01–T16 are done. T17's deployment pipeline is merged and T18 prepared the release. Both wait on an owner-run Cloudflare preview, and nothing is deployed yet. See [local development](docs/LOCAL_DEV.md) to run it and the [release guide](docs/RELEASE.md) for the remaining owner steps. The default implementation uses Cloudflare Workers, Static Assets, SQLite-backed Durable Objects, and Firebase Authentication for Microsoft/Hotmail and Google login. No LLM runs during gameplay.

## Release status

The [release guide](docs/RELEASE.md) lists the tested commit, the owner prerequisites, the preview and recovery checks, the playtest script, production steps and known issues. The [traceability matrix](docs/TRACEABILITY.md) maps every acceptance ID to its evidence, and `npm run check:docs` keeps it accurate. Each task has its own copyable prompt and acceptance gate in [docs/tasks](docs/tasks). GitHub issues mirror these tasks; [TASKS.md](TASKS.md) is the dependency/status index. Follow-up work uses one branch and pull request per change with [the implementation prompt](prompts/IMPLEMENT_TASK.md).

## Read in this order

1. [Agent working agreement](AGENTS.md) and [start guide](docs/START_HERE.md).
2. [Product scope](docs/PRODUCT.md) and [explicit MVP rules](docs/RULES.md).
3. [Architecture](docs/ARCHITECTURE.md), [state model](docs/DATA_MODEL.md), and [network protocol](docs/PROTOCOL.md).
4. [Tasks](TASKS.md), [test scenarios](docs/ACCEPTANCE.md), and [test strategy](docs/TESTING.md).
5. [Cloudflare setup/deployment](docs/CLOUDFLARE.md), [login setup](docs/AUTH.md), and [operations/costs](docs/OPERATIONS.md).

## Set up cloud accounts and agent deployment

Before staging or releasing the game, follow [owner setup and secure ChatGPT/Claude agent access](docs/AGENT_ACCESS.md). It explains Cloudflare/Firebase signup, Google and Hotmail providers, which identifiers are public, how to store scoped Cloudflare deployment tokens in GitHub environments, and why PR coding agents never receive production credentials. Setup instructions do not mean accounts or cloud resources have been provisioned.

## Hosting decision

| Responsibility | Service |
| --- | --- |
| UI, artwork, fonts | Workers Static Assets |
| HTTPS API and room routing | Cloudflare Worker |
| Multiplayer coordination | One Durable Object per room |
| Game state/history | SQLite storage inside that Durable Object |
| Microsoft/Google identities | Firebase Authentication (external managed identity only) |
| CI | GitHub Actions, added by T01 and expanded by later tasks |

No D1, R2, Redis, VPS, Kubernetes, Firestore or Firebase Realtime Database is required for the MVP. Firebase supplies managed identity only; all game assets, API and saved state remain on Cloudflare. Do not build custom OAuth or deploy game functions on Firebase.

Budget: target **$0/month for occasional two-player use**, using Cloudflare Workers Free and Firebase Authentication Spark. Keep support for 2–4 players per room. No paid subscription or billing account is required for the selected Firebase social-login use. If measured Worker limits later require an upgrade, Workers Paid starts at approximately $5/month plus usage; do not upgrade automatically. Firebase Authentication does not document a seven-day inactivity pause for this service; this is not a perpetual availability guarantee. See dated sources in [docs/SOURCES.md](docs/SOURCES.md).

## Important defaults

- The proposed rules are an explicitly simplified, original variant, not an assertion of fidelity to the commercial game.
- Fictional 48-location board, four threats, four roles, one difficulty; [spec/board.v1.json](spec/board.v1.json) supplies the canonical graph.
- Friends join by authenticated invite link; play can pause indefinitely during disconnections, within the documented retention period.
- All hands are visible to room members; future deck order and random seed are secret.
- Local development runs the hot-seat game and the loopback multiplayer test entry without cloud accounts. [TESTING.md](docs/TESTING.md) lists every suite.
- Do not upload credentials, tokens, copied commercial artwork or rulebook text. No software license has been selected by the owner yet.
