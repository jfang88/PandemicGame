# Operations, costs and limits

## Cost model (planning baseline 2026-10-28, USD)

Cloudflare static-asset requests are free/unlimited under published pricing; Worker/API and Durable Object usage have separate limits. SQLite Durable Objects Free includes 100,000 requests/day, 13,000 GB-s/day compute, 5 million rows read/day, 100,000 written/day and 5 GB total stored data. These are per-account/service allowances, not per-room guarantees. Free-limit exhaustion causes errors. Workers Paid starts at $5/month plus usage.

Supabase Free includes social OAuth and 50,000 MAU but may pause projects after a week of inactivity; Pro starts at $25/month. Thus target $0 prototype, $5 base for paid Cloudflare with free auth, or $30 base for paid Cloudflare plus Pro auth. Domains, taxes, additional projects and overages are extra. Recheck SOURCES.md before purchase; this is not a quote or a hard cap.

100 matches × 300 game commands ≈ 30,000 commands/month, before reads, joins, retries and sockets. Each command can write multiple rows (state, receipt, events). Measure actual writes, duration and bandwidth; do not equate command count to billed requests. Hibernating idle rooms is the main realtime cost safeguard.

## Initial application limits

| Limit | Default |
| --- | --- |
| Players | 2–4 started; maximum four lobby members |
| Sockets | 2/user, 8/room |
| JSON command body | 16 KiB |
| Public snapshot | Target <64 KiB; investigate growth |
| History page | 100 events maximum |
| Commands | 30/min/user/room with burst 10 |
| Create room | 10/hour/user, additionally IP rate protection |
| Join attempts | 20/min/user, additionally IP rate protection |
| Lobby retention | 7 days since accepted mutation |
| Running retention | 30 days since accepted gameplay mutation |
| Finished retention | 30 days since result |
| Expired tombstone | 30 additional days, then delete all |

T16 implements room-local rate limits durably and account/edge-level create/join abuse controls with Cloudflare's currently supported facility. Verify its scope: approximate/per-location edge limits are abuse protection, not a globally exact quota. If a chosen rate-limit binding is unavailable on the account, document and test an alternative before deployment; never pretend a Worker-global Map is reliable. No all-room coordinator is needed for gameplay. Bound ticket creation and clean expired tickets.

## Observability

Structured logs: request correlation ID, build SHA, room ID (opaque), command type, revision, latency, error code. Exclude tokens, ticket URLs, invitation secrets, names/emails, cards and internal state. Track rejected commands, 5xx, reconnect counts, mutation latency, database write failures, rate limits, active-room estimates and Worker/DO usage. Sample successful requests; keep errors sufficient to diagnose without secret payloads.

Configure usage notifications and reasonable CPU/request limits in the provider dashboard where supported. Notifications are not a hard spend cap. Alarm handler multiplexes cleanup and socket-auth expiry, rescheduling only to the next needed event. No recurring interval to keep rooms awake. No R2 needed for versioned small assets; consider it only for a later user-upload feature.

## Failure and support runbook

- Network loss: show reconnect banner; retry same command ID; fetch current state.
- Invalid/expired auth: refresh/login, keep safe local room path, never bypass verification.
- Write failure: return retryable error, state stays unchanged; same-ID retry is safe.
- Crash after commit: stored receipt answers retry; restart restores exact decks/phase.
- Provider outage or quota exhaustion: show unavailable status and retry guidance; do not invent lost/won results.
- Broken release: inspect sanitized logs; rollback compatible code or deploy forward fix. Never reset rooms to clear an error.
- Account removal request: document how owner identifies and deletes affected retained room data before public launch. No global searchable player profile is required in MVP; keep data minimal.

## Release evidence

Record commit, environment URL, account plan, bindings isolation, OAuth providers tested, test command outcomes, schema/rules versions, 10-room performance measurements, idle-hibernation observations, recovery rehearsal and known limitations. Do not claim backups or uptime guarantees without tested provider configuration.
