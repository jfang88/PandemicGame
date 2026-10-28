# Acceptance scenarios

These are independent test oracles, not implementation-derived snapshots. T02–T06 turn rules scenarios into named engine tests; later tasks cover boundaries. Fixture helpers may construct valid near-terminal states, but must preserve all relevant card/cube invariants. Never expose fixture injection routes in deployed builds.

## Engine

| ID | Given / when | Required result |
| --- | --- | --- |
| E01 | Setup with 2, 3 or 4 players | Hands 4/3/2 each; 18 cubes placed; 9 infection discards; 4 epidemics; first seat 4 actions |
| E02 | Same seed, roles and commands twice | Identical states/events; unchanged inputs; frozen RNG test vectors |
| E03 | A01 actor moves to A02, then attempts A04 | First succeeds and costs 1; nonadjacent attempt changes nothing |
| E04 | Flight with and without the required owned card | Correct move/discard/cost or unchanged illegal-action error |
| E05 | Shuttle endpoints lack either center | Rejected; both centers allows move with no card spent |
| E06 | Location has 3 blue; ordinary actor treats uncured blue | Becomes 2; supply gains 1; costs 1 |
| E07 | Same location treated by Medic or after blue cure | Becomes 0; supply gains 3; costs 1; no passive Medic effects |
| E08 | Builder builds without matching card; seventh center attempted | First legal if capacity permits; seventh rejected without cost |
| E09 | Co-located ordinary player gives matching-location card | Transfer/cost; nonmatching rejected; Courier can give any owned location card |
| E10 | At center, ordinary/Scientist cures with 5/4 distinct matching cards | Correct discard and cure; duplicates, wrong color, missing center rejected |
| E11 | Fourth action is PASS with safe arranged decks | Exactly 2 sequential player draws and rate-count infections; next seat gets 4 actions |
| E12 | Fourth action transfer makes recipient's hand 8 | DISCARD_REQUIRED for recipient, not active actor; only valid discard to exactly 7 resumes DRAW |
| E13 | First player draw makes hand 8 | Pause before second draw; valid discard resumes remaining one draw, not two |
| E14 | Same-turn player draws are two epidemics | Each increases rate and completes bottom infect/intensify in order |
| E15 | Epidemic bottom target has 2 cubes and no neighboring overflow | Three additions yield target at 3, one outbreak, one same-color cube per neighbor; no repeated outbreak |
| E16 | Cycle A01→A02→B02→B01→A01 at 3 blue each, infect A01 | Each of those locations outbreaks at most once in chain; no infinite recursion or fourth cube |
| E17 | Separate infection cards hit same full location in separate chains | Location may outbreak in each chain; visited set does not leak across cards |
| E18 | Outbreak count 7 and full target infected | LOST OUTBREAK_LIMIT at 8; no later draws/spread processed |
| E19 | Supply 1 then a required cube addition, then another required addition | First may reach 0 safely; second loses CUBE_SUPPLY_EXHAUSTED |
| E20 | Only one player card left at required two-card draw | First resolves, then lose when second is required; emptying deck alone is not loss |
| E21 | Fourth cure discovered using fourth action | WON immediately, no player draw or infection even if deck empty |
| E22 | Cured color is infected, including at Medic location | Cubes still added; no eradication/prevention in v1 |
| E23 | Wrong actor, wrong phase, terminal game or malformed command | Rejected with state, version and RNG unchanged |
| E24 | Randomized legal sequences across seeds and player counts | Cube/card conservation, ranges, unique cards, valid active seat and deterministic replay hold |

## Persistence, protocol and security

| ID | Given / when | Required result |
| --- | --- | --- |
| P01 | Same command submitted twice, including after restart | One revision/effect; duplicate receipt returned |
| P02 | Same ID with changed payload or expectedVersion | COMMAND_ID_REUSED; no mutation |
| P03 | Two legal commands race at same revision | Exactly one accepted; other STALE_VERSION; no lost update |
| P04 | Fault between state write and event/receipt write | Entire transaction rolls back; retry applies once |
| P05 | Commit succeeds but acknowledgment/broadcast fails | Retry returns stored acceptance; current snapshot converges |
| P06 | Object restarts during a discard pause or hibernates with sockets | Same decks/RNG/continuation; sockets recover correct identities and receive updates |
| P07 | Concurrent joins for final seat or same role selections | At most four unique members, one role holder; no duplicate seats |
| P08 | Owner leaves lobby / player disconnects while running | Owner transfers in lobby; disconnect changes neither seat nor turn |
| S01 | Missing/forged/expired/wrong-project JWT | 401; no room state or mutation |
| S02 | Authenticated nonmember guesses room ID | Cannot read snapshot/events, get socket ticket or issue command |
| S03 | Reused/expired/wrong-room/wrong-origin socket ticket | Rejected; one-use consumption survives hibernation |
| S04 | Idle socket's JWT expires with no game traffic | Alarm closes access; refresh+new ticket restores connection |
| S05 | Inspect every snapshot, event, error and browser asset | No future deck, seed, invite hash, OAuth secret or test signing key |
| S06 | Test identity headers/tokens/flags sent to preview/production artifact | Rejected; no deployable bypass |
| S07 | Oversized request, excessive creates/joins/commands, unsafe display name | Bounded rejection/rate limit; text escaped; no server/HTML injection |
| S08 | Old invite after rotation / nonowner rotate / late join | Rejected; owner duplicate rotation can recover same result privately |

## End-to-end and operations

| ID | Given / when | Required result |
| --- | --- | --- |
| U01 | 2/3/4 isolated browser contexts play | Complete legal match to terminal state; versions converge after every move |
| U02 | Browser refresh, offline interval, delayed/duplicated update | No accepted action lost/duplicated; older snapshots ignored |
| U03 | Hotmail/Outlook personal account and Google staging login | Both reach lobby; OAuth cancel/error gives useful retry screen |
| U04 | Tablet layout, keyboard controls, color-independent labels | Board/actions usable; focus remains sensible after updates |
| O01 | Built SPA deep link and unknown /api route | HTML app for SPA; JSON 404 for API, never HTML fallback |
| O02 | 10 rooms × 4 clients, 300 legal commands/room with 2s+ per-room jittered pacing | No cross-room leakage/divergence; record p50/p95/error rate, target warm p95 <1s |
| O03 | Idle connected rooms and then expiry/retention alarm | Hibernation observed in staging; expiry and cleanup behave as configured |
| O04 | Deploy new compatible version then recover previous version in preview | Existing rooms retain state; incompatible schema rollback blocked/documented |
| O05 | Preview versus production configuration | Independent namespaces and identities; no untrusted-PR secrets/deploy |

U01 can use deterministic local fixture seeds/near-terminal scenarios for reliable coverage, but also run at least one full setup-to-terminal match for each player count. Record manual cooperative playtest observations separately from scripted bots; legal randomized play is not a balance assessment.
