# State and storage contract

## Versions

`protocolVersion: 1`, `schemaVersion: 1`, `rulesVersion: containment-v1`, `boardVersion: grid48-v1`. `revision` is a nonnegative integer, starting at 0 on creation and increasing once per accepted room mutation. A fresh room pins rules and board versions when started. Unknown versions produce a controlled incompatibility response, not best-effort mutation.

## Internal game snapshot

| Field | Meaning |
| --- | --- |
| phase | ACTIONS, DRAW, DISCARD_REQUIRED, INFECTION, WON, LOST |
| players | Stable userId, seat, role, locationId, ordered hand of card IDs |
| activeSeat, actionsRemaining | Current turn and 0–4 remaining actions |
| cubes | locationId → color → integer 0–3 |
| supply | color → integer 0–24 |
| centers | Set of location IDs, at most six |
| cured | Four color booleans |
| outbreakCount, rateIndex | 0–8 and 0–6 |
| playerDeck, playerDiscard | Ordered player cards, top at array index 0 |
| infectionDeck, infectionDiscard | Ordered infection cards, top at index 0; prepend discarded card |
| resolvedEpidemics | IDs of consumed epidemic cards |
| rngState | Internal uint32, nonzero seed/state |
| continuation | Pending hand-limit owner and resume phase/draw count/actions; null otherwise |
| outcome | null or won/lost reason and relevant color/location |

The setup wording “last drawn on top” means prepend to discard; shuffle consumes the stored array order. All multi-effect processing uses deterministic order. Card IDs: `p:A01`, `i:A01`, `e:1` through `e:4`. Stable board ordering is ascending location ID.

## Suggested SQLite tables

Names can be implemented as below; semantic constraints are mandatory.

- `room`: singleton primary key, schema/rules/board versions, revision, lifecycle, ownerUserId, createdAt, lastMutationAt, expiresAt, inviteHash, lobbyJson, gameJson (nullable before start).
- `members`: userId primary key, unique seat 0–3, displayName, role (nullable in lobby), ready, joinedAt. Unique non-null roles; max-four enforced in same join transaction. Membership changes also update lobby state atomically; avoid independently mutable duplicate player records.
- `commands`: primary key (userId, commandId), canonical request hash, accepted revision, resultJson, createdAt. Keep for full retained room lifetime, not a short TTL.
- `events`: primary key (revision, eventIndex), public semantic event JSON, timestamp. Do not include seed, unrevealed cards, tokens or invitation secrets.
- `socket_tickets`: hash primary key, userId, origin, expiresAt, authExpiresAt. Consume by transaction; delete expired entries.
- `metadata`: migration version and expired tombstone where needed.

Room lifecycle includes LOBBY, RUNNING, WON, LOST, EXPIRED; game phase is separate. Store readiness/lobby membership in one normalized authoritative representation; the JSON snapshot need not duplicate it before start. The engine's immutable roster at start references member userIds.

## Public projection

Allowlist public fields explicitly: versions, revision, lifecycle, sanitized member names/IDs/seats/roles/readiness, board cubes, supply, centers, cured flags, pawns, all hands, activeSeat, actionsRemaining, phase, pending-discard owner, deck counts, public discard cards, rate/outbreak counters, outcome, and bounded recent public events. Include ownerUserId for lobby UI.

Never include internal decks, rngState, inviteHash, socket tickets, command hashes, OAuth/provider data, raw emails or SQL records. Public means visible to authorized room members, not anonymous internet access. Full snapshot target <64 KiB; paginated history max 100 events/page, with latest 30 in snapshots.

## Migration and restart

Schema migration runs once on initialization using serialized startup and a transaction. Store old-version fixture snapshots and test upgrading. Never regenerate a deck on restart. Unknown rulesVersion freezes mutation with a clear upgrade-required response until a compatible engine is deployed. Deploy backward-compatible readers before new writers. Rolling back code does not roll back database writes; test compatibility before rollback and never delete a namespace to “fix” migration errors.

## Recovery scope

Persistence tests prove process/hibernation durability, not independent backup. Before production, document actual Cloudflare restore capabilities and rehearse a supported recovery path in preview. MVP accepts loss of casual game history if independent backups are not configured; do not promise disaster recovery. Public JSON export is a player-visible summary, not a complete hidden-state backup.

## Identity key contract

All stored `userId`, `ownerUserId` and recipient IDs are the verified Firebase token `sub` (Firebase UID): opaque case-sensitive nonempty strings of at most 128 characters, not UUIDs. Never derive authorization from email, display name or Microsoft/Google provider access tokens. Room IDs and command IDs remain UUIDs. Preview and production pin separate Firebase project IDs; no user migration is required because implementation has not started.
