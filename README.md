# PandemicGame — Cloudflare build kit

An original Pandemic-inspired cooperative browser game for **2–4 players per private room**. This repository currently contains the specification and coding-agent backlog, not a working game. The default implementation uses Cloudflare Workers, Static Assets, SQLite-backed Durable Objects, and Supabase Auth for Microsoft/Hotmail and Google login. No LLM runs during gameplay.

## Start coding

Give an agent this prompt:

```text
Work in jfang88/PandemicGame. Read AGENTS.md and docs/START_HERE.md.
Implement T01 from TASKS.md using prompts/IMPLEMENT_TASK.md.
Follow the task's acceptance criteria, run the relevant checks, and open
a pull request with the results. Do not start the next task or deploy.
```

After T01 merges, replace T01 with the next task whose dependencies are complete. Each task has its own copyable prompt and acceptance gate in [docs/tasks](docs/tasks). GitHub issues mirror these tasks; [TASKS.md](TASKS.md) is the dependency/status index.

## Read in this order

1. [Agent working agreement](AGENTS.md) and [start guide](docs/START_HERE.md).
2. [Product scope](docs/PRODUCT.md) and [explicit MVP rules](docs/RULES.md).
3. [Architecture](docs/ARCHITECTURE.md), [state model](docs/DATA_MODEL.md), and [network protocol](docs/PROTOCOL.md).
4. [Tasks](TASKS.md), [test scenarios](docs/ACCEPTANCE.md), and [test strategy](docs/TESTING.md).
5. [Cloudflare setup/deployment](docs/CLOUDFLARE.md), [login setup](docs/AUTH.md), and [operations/costs](docs/OPERATIONS.md).

## Hosting decision

| Responsibility | Service |
| --- | --- |
| UI, artwork, fonts | Workers Static Assets |
| HTTPS API and room routing | Cloudflare Worker |
| Multiplayer coordination | One Durable Object per room |
| Game state/history | SQLite storage inside that Durable Object |
| Microsoft/Google identities | Supabase Auth (external managed identity only) |
| CI | GitHub Actions, added by T01 and expanded by later tasks |

No D1, R2, Redis, VPS, Kubernetes, or Supabase game database is required for the MVP. Supabase is the only non-Cloudflare runtime dependency. A completely Cloudflare-only identity implementation is a separate future decision, not an instruction to write custom OAuth in this MVP.

Budget: target $0/month within free quotas for a prototype; approximately $5/month base with Workers Paid, or $30/month base with Workers Paid plus Supabase Pro. Usage, taxes and domains are additional. Supabase Free may pause after one inactive week. See dated sources in [docs/SOURCES.md](docs/SOURCES.md).

## Important defaults

- The proposed rules are an explicitly simplified, original variant, not an assertion of fidelity to the commercial game.
- Fictional 48-location board, four threats, four roles, one difficulty; [spec/board.v1.json](spec/board.v1.json) supplies the canonical graph.
- Friends join by authenticated invite link; play can pause indefinitely during disconnections, within the documented retention period.
- All hands are visible to room members; future deck order and random seed are secret.
- Current work is planning-only. Shell commands described for the application become available as their tasks are implemented.
- Do not upload credentials, tokens, copied commercial artwork or rulebook text. No software license has been selected by the owner yet.
