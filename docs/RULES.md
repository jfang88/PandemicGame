# Cooperative containment — authoritative MVP rules v1

These are deliberately simplified defaults for an original Pandemic-inspired game, not a reproduction of the commercial rules. Implement exactly these rules; balance is provisional until playtests. `rulesVersion = containment-v1`, `boardVersion = grid48-v1`.

## Board and pieces

Canonical graph: ../spec/board.v1.json. 48 fictional locations on a 6×8 grid. Orthogonal edges only, no wrapping. Four colors (blue, yellow, red, black), 12 home locations each. Any color may occupy any location. Maximum three cubes of each color per location; 24 cubes per color in supply. Six research centers total. Start center and all pawns at A01. Centers and cured flags are public.

Each location has exactly one player card and one infection card, in separate decks. Four uniquely identified epidemic cards are added to the player deck. No event cards. Cards have stable IDs; infection/player cards for the same location are distinct objects.

## Players and setup

2–4 players occupy stable seats in join order; each chooses a unique role before ready. First occupied seat starts; subsequent turns follow ascending occupied seat order cyclically. Starting hands: 4 cards each for 2 players, 3 each for 3 players, 2 each for 4 players. Hand limit 7. All hands are visible to all room members.

Setup order is normative:

1. Initialize board, supplies, one center at A01, outbreak count 0, infection-rate index 0, all diseases uncured.
2. Shuffle infection cards; remove the first nine, infecting the first three with 3 home-color cubes each, next three with 2, next three with 1. Put them into infection discard in draw order (last drawn on top).
3. Shuffle the 48 player location cards. Deal starting hands round-robin by seat, one card at a time from the top.
4. Partition remaining cards from the top into four contiguous piles, sizes differing by at most one; earlier piles receive the extra cards. Add one unique epidemic to each pile, shuffle each pile in order, concatenate pile 1 through 4 as the player deck, first element on top.
5. Enter ACTIONS for the first seat with four actions remaining.

All shuffle calls consume one persistent deterministic RNG stream. Use uint32 xorshift32: `x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x = x >>> 0`, with nonzero initial seed, and Fisher–Yates from last index down. For an index in [0,bound), let domain = 4294967295, limit = floor(domain / bound) * bound, and u = nextUint32() - 1; reject u >= limit and otherwise return u % bound. This accounts for xorshift32 excluding zero. Seed 1 must produce first outputs 270369, 67634689, 2647435461, 307599695, 2398689233. Freeze additional shuffle vectors before implementation changes. Production seed comes from cryptographic server randomness and is never client-selected or revealed. Xorshift is for reproducibility, not security; never use it for room/invite/ticket IDs.

## Roles

| Role | Exact effect |
| --- | --- |
| Medic | TREAT removes all cubes of the chosen color at the current location, whether cured or not. No passive removal or infection prevention. |
| Scientist | DISCOVER_CURE requires four matching location cards instead of five. |
| Builder | BUILD_CENTER costs one action but no location card. All other build restrictions still apply. |
| Courier | GIVE_CARD may give any location card while co-located; other roles may give only the card matching their current location. |

## Actions

Only the active player acts in ACTIONS. Each legal action below costs one action. Validate all costs/targets before mutating; invalid commands consume nothing.

| Command | Legality and effect |
| --- | --- |
| MOVE | Move to a directly connected different location; no card cost. |
| DIRECT_FLIGHT | Discard destination's player card from own hand; move there. Destination must differ. |
| CHARTER_FLIGHT | Discard current location's player card; move to any different location. |
| SHUTTLE | Move between different locations each containing a center; no card cost. |
| TREAT | Choose a color with at least one cube at current location. Remove one cube, or all of that color if cured or actor is Medic; return cubes to supply. |
| BUILD_CENTER | Current location lacks a center and fewer than six exist. Discard current-location card unless Builder. Add center. At cap, reject; relocating centers is not supported. |
| GIVE_CARD | Give one owned location card to a different co-located player, with the role restriction above. Recipient consent is not required for this cooperative variant. Taking cards is not supported. |
| DISCOVER_CURE | At a center, discard exactly five distinct owned location cards of the chosen color (four as Scientist). Color must be uncured. Set cured. |
| PASS | Spend one action without another effect. |

No automatic eradication or prevention: cured colors still infect normally. Cures improve treatment. Discovering the fourth cure immediately wins; do not draw/infect afterward.

## Turn state machine

`LOBBY → ACTIONS → DRAW → INFECTION → ACTIONS … → WON/LOST`.

`DISCARD_REQUIRED` interrupts ACTIONS or DRAW whenever a hand exceeds 7. Store the continuation explicitly. Only that hand's owner may issue DISCARD (a nonempty list of unique owned player-card IDs that leaves exactly 7). Discard costs no action. No other gameplay action is permitted during this phase. For a transfer on the fourth action, resume DRAW after discarding. For other transfers, resume ACTIONS with the already-decremented action count.

After the fourth action, automatically draw two player cards sequentially. Before each draw, if empty, lose immediately (`PLAYER_DECK_EMPTY`). A location card enters the active hand; if it exceeds 7, pause before the next draw or infection. An epidemic resolves completely immediately, enters a separate resolved-epidemic list, then the pending draw continues. Two epidemics in the same turn both resolve. DRAW and INFECTION otherwise advance server-side without client commands.

After both draws and all discards, draw infection cards equal to rate `[2,2,2,3,3,4,4][rateIndex]`. Each infects its home location with one home-color cube, then enters infection discard. Resolve each completely before the next. If infection deck is empty before a required draw, shuffle infection discard into a new deck and clear discard; if both empty, throw invariant failure and rollback, not an invented gameplay loss. After infection finishes, next player gets four actions.

## Epidemics

Increment rateIndex by one, capped at 6. Remove the bottom infection card (if deck empty, refill from discard as above). Attempt three sequential additions of its home color at its location, sharing one outbreak-visited set for these additions and all their cascades. Put that infection card in discard. If still alive, shuffle the entire infection discard, place it atop the remaining infection deck, and clear discard. This explicit three-addition variant may differ from other games' epidemic rules; do not substitute remembered rules.

## Infection and outbreaks

To add one cube: if target has fewer than 3 of that color, take one from supply and add it. If supply is 0 when a cube is required, immediately lose (`CUBE_SUPPLY_EXHAUSTED`, with color). Reaching supply 0 itself is allowed.

If target already has 3: if it already outbroke in this chain, do nothing; otherwise mark visited, increment outbreak counter, and if counter reaches 8 immediately lose (`OUTBREAK_LIMIT`) before spreading further. Otherwise recursively attempt one cube of the same color at each neighbor in ascending location-ID order. Each normal infection card starts a new visited set. An epidemic uses one set as defined above. Never add a fourth cube at a location. Stop all remaining automatic processing immediately on loss.

## Terminal precedence, invariants and omissions

Fourth cure wins within that action. Infection losses stop on the first failing operation in deterministic processing order. No later effect overrides a terminal state. No gameplay commands are accepted after WON/LOST. A terminal losing command is an accepted state transition, not an API validation error.

Conserve 24 cubes per color across board+supply, and 48 location player cards across deck+hands+discard. Infection cards total 48 across deck+discard except a transient resolving card inside one atomic operation; epidemic cards total 4 across player deck+resolved list. Never persist a half-resolved automatic phase except explicit hand-limit continuations. Disconnection never changes turn order or automatically passes. No undo, early-end-turn command, event cards, research-center relocation or automatic eradication.

When an infection or epidemic causes loss, finalize the already-drawn card into its appropriate discard/resolved list before returning the terminal snapshot. Do not process further cards/effects. Terminal states must still conserve cards; the resolver must not leave a transient removed card unrepresented.
