# Operations, costs and limits

## Cost model (planning baseline 2026-10-28, USD)

Cloudflare static-asset requests are free/unlimited under published pricing; Worker/API and Durable Object usage have separate limits. SQLite Durable Objects Free includes 100,000 requests/day, 13,000 GB-s/day compute, 5 million rows read/day, 100,000 written/day and 5 GB total stored data. These are per-account/service allowances, not per-room guarantees. Free-limit exhaustion causes errors. Workers Paid starts at $5/month plus usage.

Firebase Authentication Spark supplies Google and Microsoft social login at no cost within its published limits, without a linked billing account. Use only Authentication: no phone/SMS, enterprise SAML/OIDC, Firestore, Functions or paid Firebase services are required. Firebase's pricing/product documentation does not specify the weekly inactive-database pause that motivated this identity choice; do not describe this as an uptime SLA or guaranteed permanent free service.

Target $0/month for two occasional players (retain 2–4-player support). Workers Paid, if explicitly chosen after measurements, starts at $5/month plus usage; Firebase social login can remain on Spark. Do not enable Blaze, billing or unrelated products automatically. Domains/taxes are separate. Recheck SOURCES.md before purchase. Workers Free quota exhaustion should be handled as an unavailable response, not an instruction to upgrade billing.

For a planning example, one 300-command match might use 500–1,000 API requests and 1,500–6,000 row writes; measure actual implementation costs. Days between games consume saved-data storage and sparse cleanup work, not continuously running game compute. Test the Worker Free 10 ms CPU-per-invocation budget for token verification/routing as well as aggregate quotas; cache imported signing keys safely.

100 matches × 300 game commands ≈ 30,000 commands/month, before reads, joins, retries and sockets. Each command can write multiple rows (state, receipt, events). Measure actual writes, duration and bandwidth; do not equate command count to billed requests. Hibernating idle rooms is the main realtime cost safeguard.

## Initial application limits

| Limit | Default |
| --- | --- |
| Players | 2–4 started; maximum four lobby members |
| Sockets | 2/user, 8/room. Client frames over 4 KiB close with code 1009. |
| Socket tickets | 4 pending/user, 16 pending/room. Issuance uses 30/min/user/room with burst 8. |
| JSON command body | 16 KiB |
| Public snapshot | 64 KiB maximum encoded snapshot |
| History | Latest 30 events in snapshots. No history paging endpoint in the current API. |
| Commands | 30/min/user/room with burst 10 |
| Create room | 10 distinct IDs per verified UID in an hour-long window that starts with the first attempt |
| Join attempts | Approximate 20/min/verified UID per Cloudflare location |
| Create, join, room read and ticket IP protection | Approximate combined 120/min/client IP per Cloudflare location |
| Lobby retention | 7 days since accepted mutation |
| Running retention | 30 days since accepted gameplay mutation |
| Finished retention | 30 days since result |
| Expired tombstone | 30 additional days, then remove the expiry timestamp and keep only a retired-ID marker |

The SQLite room bucket refills one token every two seconds. New command attempts and invite rotations count, including stale and conflicting requests from members. Exact accepted retries reuse their receipts. An independent SQLite object per verified UID counts distinct create IDs atomically, including failed dispatches, and permits same-ID retries within its active window. The limiter stores a digest as the counter object's lookup key. Rate limit responses carry an integer `Retry-After` in seconds.

Cloudflare's native binding checks the IP before Firebase verification for create, join, room reads and socket ticket requests. Commands use the room bucket, and socket upgrades spend an already-issued ticket. A request for a room ID that was never created reads no storage tables and writes nothing. A second binding checks a digest of the verified UID for join. These counters are approximate and local to a Cloudflare location. The preview and production templates have separate binding IDs. Verify both bindings on the owned preview before relying on their enforcement. [Workers rate-limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

## Observability

The normal Worker emits a fixed event name, correlation ID, validated build SHA, operation category, HTTP status and elapsed time. It logs all 5xx responses and samples 5% of other errors and 1% of successes. The Worker omits application logs for WebSocket upgrades, and the template disables automatic invocation logs that can include ticket-bearing URLs. Keep that setting in both deployed environments. Use aggregate Worker and Durable Object metrics for invocation errors and usage. The application log duration measures elapsed time. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

During the authorized preview run, isolate a cold authenticated request window and a warm window that reuses Firebase certificate/key caches. Record the dashboard's CPU Time per execution quantiles and exceeded-CPU count for each window alongside request counts. Compare those observations with the 10 ms Workers Free limit. [CPU time metrics](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/#cpu-time-per-execution) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)

Configure usage notifications and reasonable CPU/request limits in the provider dashboard where supported. Notifications are not a hard spend cap. Alarm handler multiplexes cleanup and socket-auth expiry, rescheduling only to the next needed event. No recurring interval to keep rooms awake. No R2 needed for versioned small assets; consider it only for a later user-upload feature.

## Failure and support runbook

- Network loss: show reconnect banner; retry same command ID; fetch current state.
- Invalid/expired auth: refresh/login, keep safe local room path, never bypass verification.
- Write failure: return retryable error, state stays unchanged; same-ID retry is safe.
- Crash after commit: stored receipt answers retry; restart restores exact decks/phase.
- Provider outage or quota exhaustion: show unavailable status and retry guidance; do not invent lost/won results.
- Broken release: inspect sanitized logs; roll back to a build that can read the current storage version or deploy a forward fix. T16 upgrades room storage metadata to v6 while keeping the game snapshot schema at v1. Builds that only understand storage v5 reject v6 rooms. Rehearse a v6-compatible rollback with an existing room, including a pending discard and a retired room, before relying on rollback in preview.
- Account removal request: document how owner identifies and deletes affected retained room data before public launch. No global searchable player profile is required in MVP; keep data minimal.

## Release evidence

Record commit, environment URL, account plan, bindings isolation, OAuth providers tested, test command outcomes, schema/rules versions, 10-room performance measurements, idle-hibernation observations, recovery rehearsal and known limitations. Do not claim backups or uptime guarantees without tested provider configuration. The [release guide](RELEASE.md) lists the remaining owner checks and known issues.
