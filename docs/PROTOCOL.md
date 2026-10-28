# HTTP and realtime contract v1

All non-health API endpoints require `Authorization: Bearer <Supabase access JWT>`, except the socket upgrade which requires a single-use room ticket. Enforce JSON Content-Type for JSON mutations and 16 KiB request-body limit. UTC timestamps are ISO strings; room/user/command IDs are opaque strings validated at the boundary. Reject unknown properties and unsupported enum values. No client-supplied userId is accepted as the acting identity.

## Routes

| Method / path | Request | Result / authority |
| --- | --- | --- |
| GET /api/health | None | Build SHA and protocol version only; no auth needed |
| POST /api/rooms | `{roomId}` UUID generated once per create attempt | Idempotently creates owned lobby, returns roomId/version; same owner retries succeed, different owner conflicts |
| POST /api/rooms/:id/invite | `{commandId,expectedVersion}` | Owner-only LOBBY; rotate invite, persist receipt, return raw invite secret to owner only |
| POST /api/rooms/:id/join | `{commandId,inviteSecret}` | Authenticated lobby admission, stable seat; max four; existing member returns membership without a second seat |
| GET /api/rooms/:id | None | Membership-only current public snapshot |
| POST /api/rooms/:id/commands | Command envelope | Accepted receipt/current snapshot or structured error |
| POST /api/rooms/:id/ws-ticket | None | Membership-only `{ticket,expiresAt}`; no-store; 60-second one-use ticket |
| GET /api/rooms/:id/ws?ticket=... | WebSocket upgrade | Origin-bound consume, current snapshot, then pushes |
| GET /api/rooms/:id/events?afterRevision=N&afterIndex=M | Cursor | Membership-only public events, max 100 and next cursor |

Invite URLs use `/join/:roomId#invite=<secret>`, keeping invite secrets out of request paths/server access logs. Client reads fragment, posts join after login, and clears the fragment after use; preserve it temporarily in sessionStorage across OAuth redirect, then clear it. Do not put invite secrets into provider redirect URLs. Room members cannot retrieve the current invite; owner rotates to obtain a new one. Duplicate rotate command must return the same invite via its private receipt, stored server-side as sensitive data and excluded from all public exports/logs. This is an explicit exception to receipts being public-result-only; protect it like a credential and erase it at expiry.

## Commands

Envelope: `{protocolVersion:1, commandId:<UUID>, expectedVersion:<integer>, type:<enum>, payload:<object>}`.

| Type | Payload |
| --- | --- |
| SELECT_ROLE | `{role: medic|scientist|builder|courier}` |
| SET_READY | `{ready:boolean}` |
| LEAVE_LOBBY | `{}` |
| START_GAME | `{}` owner only |
| MOVE, DIRECT_FLIGHT, CHARTER_FLIGHT, SHUTTLE | `{destination:locationId}` |
| TREAT | `{color}` |
| BUILD_CENTER, PASS | `{}` |
| GIVE_CARD | `{recipientUserId,cardId}` |
| DISCOVER_CURE | `{color,cardIds:string[]}` |
| DISCARD | `{cardIds:string[]}` |

Changing role clears actor's ready flag. Joining/leaving clears all remaining ready flags; rotating invites does not. Ready=true requires a selected unique role. Start requires 2–4 members, all ready, all roles selected and unique; roster freezes and engine setup runs atomically. No more than four members or duplicate selected roles can commit even under simultaneous joins/selections. Leave allowed only in lobby. Leaver retry may read its own leave receipt before membership check, but cannot obtain any room snapshot/history afterward.

Accepted HTTP 200: `{protocolVersion:1, commandId, acceptedVersion, duplicate:boolean, snapshot}`. Snapshot is the current public state, possibly newer than acceptedVersion for a retry. Rejected: `{error:{code,message,retryable}, currentVersion?}`; include a snapshot only when caller is an authorized member. Invalid commands do not increment version. Authentication and rate failures are not stored as accepted-command receipts.

| HTTP | Codes |
| --- | --- |
| 400 | BAD_REQUEST, PROTOCOL_UNSUPPORTED |
| 401 | UNAUTHENTICATED, TOKEN_EXPIRED, INVALID_TICKET |
| 403 | NOT_MEMBER, NOT_OWNER, INVALID_INVITE |
| 404 / 410 | ROOM_NOT_FOUND / ROOM_EXPIRED |
| 409 | STALE_VERSION, COMMAND_ID_REUSED, ROOM_FULL, ROOM_STARTED, ROLE_TAKEN, NOT_READY |
| 422 | ILLEGAL_ACTION, WRONG_TURN, WRONG_PHASE, GAME_FINISHED |
| 429 | RATE_LIMITED (Retry-After) |
| 500 / 503 | INTERNAL_ERROR, TEMPORARILY_UNAVAILABLE; no internal details |

Creation/join are exceptions to expectedVersion: check relevant uniqueness/capacity/idempotency atomically against current state. All other state mutations require a version. Auth failure reveals no room details. Nonmembers receive generic admission/access errors with no member names.

## Retry and consistency

Generate commandId once per user intent. On timeout or 5xx retry the identical envelope/ID with bounded exponential backoff. Never automatically rebuild an action against a new version: on STALE_VERSION, refresh and ask the player to choose again. If player explicitly reselects, use a new ID. Server deduplication compares canonical JSON including type/payload/protocol/expectedVersion, so whitespace/key order differences do not matter. Reused ID with altered content is rejected.

## Socket frames

Server frame `{type:'snapshot',protocolVersion:1,revision,state}` or `{type:'session_expired'}`. Presence may be `{type:'presence',userIds:[...]}` and does not change game revision or ready status. Treat it as advisory. Client sends no gameplay frames; reject oversized or unsupported frames. Client reconnects with jittered 0.5–30 second backoff, refreshes auth if necessary, obtains a new ticket, and receives snapshot. Disable command UI while offline; do not queue a sequence of stale moves. Handle multiple tabs and missing broadcasts through snapshot/version checks.
