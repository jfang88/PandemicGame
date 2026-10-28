# Implementation backlog

All tasks are **not started**. This build kit is not the application. Numeric order is safe; dependencies are authoritative. Change status to in review in the task PR, and done only after merge and gate evidence. If a provider setup is missing, record blocked rather than passed.

| Task | Dependencies | Status | Specification | GitHub issue |
| --- | --- | --- | --- | --- |
| T01: Workspace and CI foundation | — | not started | [Task prompt](docs/tasks/T01-workspace-and-ci-foundation.md) | [#1](https://github.com/jfang88/PandemicGame/issues/1) |
| T02: State types and deterministic setup | T01 | not started | [Task prompt](docs/tasks/T02-state-types-and-deterministic-setup.md) | [#2](https://github.com/jfang88/PandemicGame/issues/2) |
| T03: Movement treatment and construction | T02 | not started | [Task prompt](docs/tasks/T03-movement-treatment-and-construction.md) | [#3](https://github.com/jfang88/PandemicGame/issues/3) |
| T04: Sharing cures and discard continuations | T03 | not started | [Task prompt](docs/tasks/T04-sharing-cures-and-discard-continuations.md) | [#4](https://github.com/jfang88/PandemicGame/issues/4) |
| T05: Draw infection epidemics and losses | T04 | not started | [Task prompt](docs/tasks/T05-draw-infection-epidemics-and-losses.md) | [#5](https://github.com/jfang88/PandemicGame/issues/5) |
| T06: Engine invariants and independent rules review | T05 | not started | [Task prompt](docs/tasks/T06-engine-invariants-and-independent-rules-review.md) | [#6](https://github.com/jfang88/PandemicGame/issues/6) |
| T07: Room persistence and protocol schemas | T06 | not started | [Task prompt](docs/tasks/T07-room-persistence-and-protocol-schemas.md) | [#7](https://github.com/jfang88/PandemicGame/issues/7) |
| T08: Atomic command execution and retry safety | T07 | not started | [Task prompt](docs/tasks/T08-atomic-command-execution-and-retry-safety.md) | [#8](https://github.com/jfang88/PandemicGame/issues/8) |
| T09: Private lobby invites and membership | T08 | not started | [Task prompt](docs/tasks/T09-private-lobby-invites-and-membership.md) | [#9](https://github.com/jfang88/PandemicGame/issues/9) |
| T10: Hibernating realtime and reconnect | T09 | not started | [Task prompt](docs/tasks/T10-hibernating-realtime-and-reconnect.md) | [#10](https://github.com/jfang88/PandemicGame/issues/10) |
| T11: Microsoft Google auth and authorization | T10 | not started | [Task prompt](docs/tasks/T11-microsoft-google-auth-and-authorization.md) | [#11](https://github.com/jfang88/PandemicGame/issues/11) |
| T12: Local playable board interface | T06 | not started | [Task prompt](docs/tasks/T12-local-playable-board-interface.md) | [#12](https://github.com/jfang88/PandemicGame/issues/12) |
| T13: Connected lobby and multiplayer UI | T11, T12 | not started | [Task prompt](docs/tasks/T13-connected-lobby-and-multiplayer-ui.md) | [#13](https://github.com/jfang88/PandemicGame/issues/13) |
| T14: Durable resume retention and compatibility | T13 | not started | [Task prompt](docs/tasks/T14-durable-resume-retention-and-compatibility.md) | [#14](https://github.com/jfang88/PandemicGame/issues/14) |
| T15: Multiplayer browser regression suite | T14 | not started | [Task prompt](docs/tasks/T15-multiplayer-browser-regression-suite.md) | [#15](https://github.com/jfang88/PandemicGame/issues/15) |
| T16: Abuse controls observability and load | T15 | not started | [Task prompt](docs/tasks/T16-abuse-controls-observability-and-load.md) | [#16](https://github.com/jfang88/PandemicGame/issues/16) |
| T17: Cloudflare preview deployment pipeline | T16 | not started | [Task prompt](docs/tasks/T17-cloudflare-preview-deployment-pipeline.md) | [#17](https://github.com/jfang88/PandemicGame/issues/17) |
| T18: Release readiness and owner handoff | T17 | not started | [Task prompt](docs/tasks/T18-release-readiness-and-owner-handoff.md) | [#18](https://github.com/jfang88/PandemicGame/issues/18) |

## Gates

- T06: rules engine reviewed and deterministic.
- T08: real atomic persistence/retry tests pass.
- T11: verified identity and production-bypass tests pass.
- T15: independent-browser regression matrix passes.
- T17: actual Cloudflare preview and real OAuth evidence.
- T18: release evidence and owner handoff, not automatic production publishing.

Machine-readable task dependencies and acceptance criteria: [spec/tasks.json](spec/tasks.json).

## Architecture baseline

Use Cloudflare Workers Free + SQLite Durable Objects for the game and Firebase Authentication Spark for Google/Microsoft login. T11 and T17 specify the identity implementation/setup; all task IDs and dependencies are unchanged. No implementation tasks have started. Firebase UID is not a UUID, and the backend verifies Firebase ID tokens using fixed Google certificates. See [AUTH.md](docs/AUTH.md).
