# Implementation backlog

T01 is **done**: [PR #22](https://github.com/jfang88/PandemicGame/pull/22) merged and
[its final CI run](https://github.com/jfang88/PandemicGame/actions/runs/42205990830) passed.
T02 is **done**: [PR #23](https://github.com/jfang88/PandemicGame/pull/23) merged with passing CI.
T03 is **done**. [PR #24](https://github.com/jfang88/PandemicGame/pull/24) merged with [passing CI](https://github.com/jfang88/PandemicGame/actions/runs/42334094921).
T04 is **done**. [PR #25](https://github.com/jfang88/PandemicGame/pull/25) merged with [passing CI](https://github.com/jfang88/PandemicGame/actions/runs/42356430404).
T05 is **done**. [PR #26](https://github.com/jfang88/PandemicGame/pull/26) merged with [passing CI](https://github.com/jfang88/PandemicGame/actions/runs/42357187273).
T06 is **done**. [PR #27](https://github.com/jfang88/PandemicGame/pull/27) merged with [passing CI](https://github.com/jfang88/PandemicGame/actions/runs/42357783401). See the [engine gate report](docs/evidence/T06.md).
T07 and T12 are **done**. [PR #28](https://github.com/jfang88/PandemicGame/pull/28) and [PR #29](https://github.com/jfang88/PandemicGame/pull/29) merged with passing CI.
T08 is **done**. [PR #30](https://github.com/jfang88/PandemicGame/pull/30) merged with [passing CI](https://github.com/jfang88/PandemicGame/actions/runs/42360365821).
T09 is **done**. [PR #31](https://github.com/jfang88/PandemicGame/pull/31) merged with [passing CI](https://github.com/jfang88/PandemicGame/actions/runs/42361399463).
T10 is **done**. [PR #32](https://github.com/jfang88/PandemicGame/pull/32) merged with [passing CI](https://github.com/jfang88/PandemicGame/actions/runs/42363792477).
T11 is **done**. [PR #33](https://github.com/jfang88/PandemicGame/pull/33) merged. See the [Firebase authentication gate report](docs/evidence/T11.md).
T13 is **done**. [PR #35](https://github.com/jfang88/PandemicGame/pull/35) merged with [passing CI](https://github.com/jfang88/PandemicGame/actions/runs/42367516174). See the [connected lobby gate report](docs/evidence/T13.md).
T14 is **done**. [PR #36](https://github.com/jfang88/PandemicGame/pull/36) merged with [passing CI](https://github.com/jfang88/PandemicGame/actions/runs/42368631518). See the [retention and compatibility gate report](docs/evidence/T14.md).
T15 is **done**. [PR #37](https://github.com/jfang88/PandemicGame/pull/37) merged with [passing CI](https://github.com/jfang88/PandemicGame/actions/runs/42370046993). See the [browser regression gate report](docs/evidence/T15.md).
T16 is **done**. [PR #38](https://github.com/jfang88/PandemicGame/pull/38) merged with [passing CI](https://github.com/jfang88/PandemicGame/actions/runs/42371812776). See the [abuse controls and load gate report](docs/evidence/T16.md).
T17 pipeline code merged in [PR #39](https://github.com/jfang88/PandemicGame/pull/39) with [passing CI](https://github.com/jfang88/PandemicGame/actions/runs/42373412427). Its live preview gate is pending an owner deployment. See the [preview deployment evidence sheet](docs/evidence/T17.md).
T18 is **in review**. Its hosted gates remain pending. See the [release guide](docs/RELEASE.md), the [traceability matrix](docs/TRACEABILITY.md) and the [release readiness report](docs/evidence/T18.md).
Merge reviewed work before starting its dependents.

| Task | Dependencies | Status | Specification | GitHub issue |
| --- | --- | --- | --- | --- |
| T01: Workspace and CI foundation | — | done | [Task prompt](docs/tasks/T01-workspace-and-ci-foundation.md) | [#1](https://github.com/jfang88/PandemicGame/issues/1) |
| T02: State types and deterministic setup | T01 | done | [Task prompt](docs/tasks/T02-state-types-and-deterministic-setup.md) | [#2](https://github.com/jfang88/PandemicGame/issues/2) |
| T03: Movement treatment and construction | T02 | done | [Task prompt](docs/tasks/T03-movement-treatment-and-construction.md) | [#3](https://github.com/jfang88/PandemicGame/issues/3) |
| T04: Sharing cures and discard continuations | T03 | done | [Task prompt](docs/tasks/T04-sharing-cures-and-discard-continuations.md) | [#4](https://github.com/jfang88/PandemicGame/issues/4) |
| T05: Draw infection epidemics and losses | T04 | done | [Task prompt](docs/tasks/T05-draw-infection-epidemics-and-losses.md) | [#5](https://github.com/jfang88/PandemicGame/issues/5) |
| T06: Engine invariants and independent rules review | T05 | done | [Task prompt](docs/tasks/T06-engine-invariants-and-independent-rules-review.md) | [#6](https://github.com/jfang88/PandemicGame/issues/6) |
| T07: Room persistence and protocol schemas | T06 | done | [Task prompt](docs/tasks/T07-room-persistence-and-protocol-schemas.md) | [#7](https://github.com/jfang88/PandemicGame/issues/7) |
| T08: Atomic command execution and retry safety | T07 | done | [Task prompt](docs/tasks/T08-atomic-command-execution-and-retry-safety.md) | [#8](https://github.com/jfang88/PandemicGame/issues/8) |
| T09: Private lobby invites and membership | T08 | done | [Task prompt](docs/tasks/T09-private-lobby-invites-and-membership.md) | [#9](https://github.com/jfang88/PandemicGame/issues/9) |
| T10: Hibernating realtime and reconnect | T09 | done | [Task prompt](docs/tasks/T10-hibernating-realtime-and-reconnect.md) | [#10](https://github.com/jfang88/PandemicGame/issues/10) |
| T11: Microsoft Google auth and authorization | T10 | done | [Task prompt](docs/tasks/T11-microsoft-google-auth-and-authorization.md) | [#11](https://github.com/jfang88/PandemicGame/issues/11) |
| T12: Local playable board interface | T06 | done | [Task prompt](docs/tasks/T12-local-playable-board-interface.md) | [#12](https://github.com/jfang88/PandemicGame/issues/12) |
| T13: Connected lobby and multiplayer UI | T11, T12 | done | [Task prompt](docs/tasks/T13-connected-lobby-and-multiplayer-ui.md) | [#13](https://github.com/jfang88/PandemicGame/issues/13) |
| T14: Durable resume retention and compatibility | T13 | done | [Task prompt](docs/tasks/T14-durable-resume-retention-and-compatibility.md) | [#14](https://github.com/jfang88/PandemicGame/issues/14) |
| T15: Multiplayer browser regression suite | T14 | done | [Task prompt](docs/tasks/T15-multiplayer-browser-regression-suite.md) | [#15](https://github.com/jfang88/PandemicGame/issues/15) |
| T16: Abuse controls observability and load | T15 | done | [Task prompt](docs/tasks/T16-abuse-controls-observability-and-load.md) | [#16](https://github.com/jfang88/PandemicGame/issues/16) |
| T17: Cloudflare preview deployment pipeline | T16 | preview pending | [Task prompt](docs/tasks/T17-cloudflare-preview-deployment-pipeline.md) | [#17](https://github.com/jfang88/PandemicGame/issues/17) |
| T18: Release readiness and owner handoff | T17 | in review | [Task prompt](docs/tasks/T18-release-readiness-and-owner-handoff.md) | [#18](https://github.com/jfang88/PandemicGame/issues/18) |

## Gates

- T06: rules engine reviewed and deterministic.
- T08: real atomic persistence/retry tests pass.
- T11: verified identity and production-bypass tests pass.
- T15: independent-browser regression matrix passes.
- T17: actual Cloudflare preview and real OAuth evidence.
- T18: release evidence and owner handoff, not automatic production publishing.

Machine-readable task dependencies and acceptance criteria: [spec/tasks.json](spec/tasks.json).

## Architecture baseline

Use Cloudflare Workers Free + SQLite Durable Objects for the game and Firebase Authentication Spark for Google/Microsoft login. T11 and T17 specify the identity implementation and setup. Firebase UID is opaque, and the backend verifies Firebase ID tokens using fixed Google certificates. See [AUTH.md](docs/AUTH.md).
