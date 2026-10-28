# Product scope — MVP v1

## Player journey

Sign in with Microsoft or Google → create a private room → share invite → 2–4 players choose unique roles and ready up → owner starts → cooperate turn by turn → win or lose → view action history → optionally create a new room for a rematch.

Room owner is the creator and has lobby start/rotate-invite authority only, not a privileged gameplay role. Owner may leave a lobby; ownership transfers to the lowest occupied seat. Joining is disabled after start. Seats remain reserved during disconnects. No live-game replacement, kicking, turn timer, spectator, public room directory or automatic turn skipping in MVP.

## UI surfaces

- Firebase popup sign-in with useful provider error, blocked/cancelled popup and retry states.
- Home: create room, paste invite URL; locally remembered recent room links (not a global room listing).
- Lobby: seats, sanitized display names, role selection, ready status, invite copy, start disabled with explanation.
- Game: responsive SVG board, all player locations, threat markers plus non-color symbols, research centers, all hands, role help, active-player/phase banner, remaining actions, supplies, outbreak counter and deck counts.
- Context actions show costs and legality explanations. Pending commands disable repeat clicks; authoritative server results control the display.
- Hand-limit modal blocks normal play for everyone and clearly identifies who must discard.
- Recent action log; reconnect banner; retry/auth-expired/room-expired states; terminal result screen with reason.

## Acceptance targets

2, 3 and 4 distinct users can finish matches across internet connections. A refresh or lost connection never loses an accepted action. Four browsers converge to the same public version. Warm staging command-to-visible-update target: p95 below 1 second under the documented 10-room load; measure, do not assume. Initial priority is desktop/tablet (1024px+), with usable smaller-screen controls and a scrollable/pannable board. Keyboard actions and text labels must work without relying on color alone.

## Out of scope

Official Pandemic assets/text or exact rules parity, AI players, matchmaking, chat/voice/video, accounts/password storage, payments, rankings, event cards, expansions, undo, replay UI, custom maps and native apps. Internal action history exists for diagnostics but is not a public replay service.

## Success definition

A fresh contributor can clone, install, run and test locally; an owner can configure accounts and deploy from the runbook; four invited users can play a complete saved game. Performance and balance claims require recorded measurements/playtests.

## Deployment baseline

Primary expected use is two people playing occasionally. Keep the original 2–4-player requirement, with Cloudflare Free and Firebase Authentication Spark as defaults. Use Microsoft personal accounts and Google social login; no enterprise SSO subscription. No Firebase database or paid login subscription is required for this scope.
