# T12 — Local playable board interface

Status: done ([PR #29](https://github.com/jfang88/PandemicGame/pull/29)). Dependencies: T06.

## Read

- [docs/PRODUCT.md](../../docs/PRODUCT.md)
- [docs/RULES.md](../../docs/RULES.md)
- [spec/board.v1.json](../../spec/board.v1.json)
- [docs/ACCEPTANCE.md](../../docs/ACCEPTANCE.md)

## Deliverables

- Implement responsive SVG board, role/pawn/card panels, threats/centers/supplies, phase/action indicators and legal action controls.
- Use engine through a local transport adapter for hot-seat development; same view components later use network adapter.
- Implement discard interruption and terminal result; original visual assets and keyboard/non-color labels.

## Acceptance gate

- A complete local game can reach terminal result through UI; E12/E13 hand-limit interactions visible and correct.
- U04 checks pass; no hidden deck/seed exposed through production UI module imports.

## Checks

- Component interaction tests, production build inspection and manual keyboard/tablet walkthrough.

## Run locally

Run `npm run dev -w @pandemic/web` from the repository root and open
http://127.0.0.1:5173/local.html. The development foundation screen also links
to this page. Choose two to four different roles and share one screen.
**Inspect location** shows text details for each board location. Select a legal
action and its target or payment, then press the action button. Local games stay
in memory and reset on refresh.

## Review evidence

- `node scripts/test-local-play.mjs` passed in Chromium after installing the
  browser with Playwright. The test verified a complete seeded setup-to-loss
  match, fourth-cure victory before an empty-deck draw (E21), recipient-owned
  transfer discard before both draws (E12), and active-player discard before the
  remaining draw (E13).
- U04 passed in the browser at 1024 and 390 pixels, including keyboard setup,
  movement and inspection, labeled disease counts, modal focus, Escape during a
  mandatory discard, and focus restoration after discarding. A separate
  keyboard-only walkthrough reached the board and confirmed visible focus and
  readable text labels in the 1024-pixel layout.
- The production output contains no local entry, local fixture, player deck,
  or RNG module. The shared view accepts public state and legal choices from an
  adapter. The development adapter alone owns the internal engine snapshot.
- Clean `npm ci`, ESLint, four workspace typechecks, 146 unit tests, the Vite
  production build, Wrangler dry-run build, and the build-kit validator passed.
  The docs regression invokes `python3`, which resolves to a Windows Store
  alias in this environment. Linux PR CI runs that regression.
- Multiplayer and browser persistence remain later task gates.

## Copyable task prompt

```text
Implement T12 — Local playable board interface in jfang88/PandemicGame.
Read AGENTS.md, TASKS.md and docs/tasks/T12-local-playable-board-interface.md.
Use prompts/IMPLEMENT_TASK.md. Verify dependencies are merged, then
complete only this task and its acceptance tests. Preserve the specified
Cloudflare architecture and RULES.md semantics. Report actual check
results, update task status to in review, and open a scoped PR referencing
the mirrored task issue. Do not deploy or proceed to another task.
For T17, the scoped preview deployment is allowed when credentials and
authorization are available; production remains a separate owner action.
```
