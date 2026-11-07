/* global window, document, requestAnimationFrame */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { build, createServer } from 'vite';
import { unstable_dev } from 'wrangler';

const web = fileURLToPath(new URL('../apps/web', import.meta.url));
const workerEntry = fileURLToPath(new URL('../apps/worker/src/local-test.ts', import.meta.url));
const workerConfig = fileURLToPath(new URL('../apps/worker/wrangler.local-test.jsonc', import.meta.url));
const origin = 'http://127.0.0.1:5188';
const full = process.argv.includes('--full');
const artifactDir = 'test-results/connected-regression';
const roles = ['medic', 'scientist', 'builder', 'courier'];
let server;
let worker;
let browser;

try {
  process.env.NODE_ENV = 'production';
  await build({ root: web });
  process.env.NODE_ENV = 'development';
  worker = await unstable_dev(workerEntry, {
    config: workerConfig, ip: '127.0.0.1', port: 0, local: true, persist: false, inspect: false, logLevel: 'warn',
    vars: { APP_ORIGINS: origin, FIREBASE_PROJECT_ID: 'local-placeholder-not-authenticated' },
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
  });
  const workerOrigin = 'http://' + worker.address + ':' + worker.port;
  server = await createServer({ root: web,
    plugins: [{
      name: 'connected-browser-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          const path = new URL(request.url ?? '/', origin).pathname;
          if (!/^\/(login$|rooms\/|join\/)/.test(path)) { next(); return; }
          void vite.transformIndexHtml(path,
            '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/auth-fixture.tsx"></script></html>',
          ).then(html => {
            response.setHeader('content-type', 'text/html');
            response.end(html);
          }).catch(next);
        });
      },
    }],
    server: { host: '127.0.0.1', port: 5188, strictPort: true, proxy: { '/api': { target: workerOrigin, ws: true } } },
  });
  await server.listen();
  browser = await chromium.launch();

  async function identity(uid, intercept) {
    const context = await browser.newContext(full ? { viewport: { width: 768, height: 1024 }, hasTouch: true } : {});
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(15_000);
    const controls = { shortTicket: false, tickets: 0 };
    if (full) await context.addInitScript(() => {
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        constructor(...args) {
          super(...args);
          window.gameTestSocket = this;
          window.gameTestSessionExpired ??= false;
          this.snapshots = [];
          this.addEventListener('message', event => {
            const data = JSON.parse(event.data);
            if (data.type === 'session_expired') window.gameTestSessionExpired = true;
            if (data.type === 'snapshot' && event.isTrusted) {
              this.snapshots.push(event.data);
              if (this.snapshots.length > 2) this.snapshots.shift();
            }
          });
        }
      };
    });
    await context.addInitScript(userId => sessionStorage.setItem('firebase-local-popup-fixture', userId), uid);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(url => url.origin === origin && (url.pathname === '/api/rooms' || url.pathname.startsWith('/api/rooms/')), async route => {
      const request = route.request();
      const headers = { ...await request.allHeaders(), 'x-pandemic-test-uid': uid };
      if (request.method() === 'POST') headers.origin = origin;
      if (new URL(request.url()).pathname.endsWith('/ws-ticket')) {
        controls.tickets++;
        if (controls.shortTicket) {
          controls.shortTicket = false;
          headers['x-pandemic-test-auth-expires-at'] = String(Date.now() + 3000);
        }
      }
      if (intercept) await intercept(request, headers);
      await route.continue({ headers });
    });
    return { context, page, errors, controls, uid };
  }

  const connected = page => page.getByText('Connected to room', { exact: true }).waitFor();
  const turn = (page, seat) => page.getByRole('heading', { name: `Player ${seat}’s turn` });
  const actions = page => page.getByRole('combobox', { name: /^Action/ });
  async function pass(page) {
    await actions(page).selectOption('PASS');
    await page.getByRole('button', { name: 'Pass', exact: true }).click();
  }

  async function converge(clients, revision) {
    await Promise.all(clients.map(({ page }) =>
      page.locator(`[data-room-revision="${revision}"]`).waitFor({ timeout: 10_000 })));
  }

  async function accepted(client, path, act) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const [response] = await Promise.all([
        client.page.waitForResponse(response => response.request().method() === 'POST'
          && new URL(response.url()).pathname.endsWith(path), { timeout: 10_000 }),
        act(),
      ]);
      if (response.status() === 429) {
        const retryAfter = Number(response.headers()['retry-after']);
        assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 2);
        await delay(retryAfter * 1000 + 50);
        continue;
      }
      assert.equal(response.status(), 200);
      const body = await response.json();
      assert.equal(body.duplicate, false);
      return body;
    }
    throw new Error('Command did not recover after its bounded rate-limit wait');
  }

  async function fullMatch(clients, state, step) {
    let discarded = 0;
    const spectator = clients[1];
    for (let move = 0; move < 160; move++) {
      step.label = 'full match move ' + (move + 1);
      step.revision = state.revision;
      const { phase, activeSeat, pendingDiscardUserId } = state.game;
      if (phase === 'WON' || phase === 'LOST') {
        for (const { page } of clients) await page.getByRole('heading', {
          name: phase === 'WON' ? 'Containment achieved' : 'Containment failed',
        }).waitFor();
        return { moves: move, discarded, phase };
      }
      assert.ok(phase === 'ACTIONS' || phase === 'DISCARD_REQUIRED');
      const actor = phase === 'DISCARD_REQUIRED'
        ? clients.find(client => client.uid === pendingDiscardUserId) : clients[activeSeat];
      assert.ok(actor);

      if (phase === 'DISCARD_REQUIRED') {
        const dialog = actor.page.getByRole('dialog');
        await dialog.waitFor();
        assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)));
        for (const client of clients.filter(client => client !== actor)) {
          await client.page.getByRole('heading', { name: 'Play paused for discard' }).waitFor();
          assert.equal(await client.page.getByRole('dialog').count(), 0);
        }
        const result = await accepted(actor, '/commands', () => dialog.getByRole('button', { name: /^Discard / }).first().click());
        const events = result.snapshot.recentEvents.filter(entry => entry.revision === result.acceptedVersion)
          .map(entry => entry.event).filter(event => event.userId === actor.uid);
        const removed = events.filter(event => event.type === 'CARD_DISCARDED');
        const drawn = events.filter(event => event.type === 'PLAYER_CARD_DRAWN');
        const prior = state.game.players.find(player => player.userId === actor.uid).hand;
        const hand = result.snapshot.game.players.find(player => player.userId === actor.uid).hand;
        assert.equal(prior.length - removed.length, 7);
        assert.deepEqual(hand, [...prior.filter(card => !removed.some(event => event.cardId === card)),
          ...drawn.map(event => event.cardId)]);
        assert.equal(result.acceptedVersion, state.revision + 1);
        discarded++;
        state = result.snapshot;
        await converge(clients, state.revision);
        continue;
      }

      if (move === 0) {
        const page = actor.page;
        await page.getByRole('img', { name: '48-location containment grid' }).waitFor();
        await page.getByText('B Blue · Y Yellow · R Red · K Black · + Center · P Player').waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        const inspect = page.getByRole('combobox', { name: 'Inspect location' });
        await inspect.focus();
        await inspect.press('End');
        assert.equal(await inspect.inputValue(), 'F08');
        await page.getByText(/blue, .*yellow, .*red, .*black cubes/).waitFor();
      }

      const offline = move === 1 && clients.length === 2;
      if (offline) {
        await spectator.context.setOffline(true);
        await spectator.page.evaluate(() => window.gameTestSocket.close());
        await spectator.page.getByText(/Connecting to room/).waitFor();
      }
      const result = await accepted(actor, '/commands', async () => {
        if (move === 0) {
          await actions(actor.page).focus();
          await actions(actor.page).press('End');
          assert.equal(await actions(actor.page).inputValue(), 'PASS');
          await actor.page.getByRole('button', { name: 'Pass', exact: true }).press('Enter');
        } else await pass(actor.page);
      });
      assert.equal(result.acceptedVersion, state.revision + 1);
      state = result.snapshot;
      if (offline) {
        await converge(clients.filter(client => client !== spectator), state.revision);
        await converge([spectator], state.revision - 1);
        await spectator.context.setOffline(false);
        await spectator.page.reload();
        await connected(spectator.page);
      }
      await converge(clients, state.revision);

      if (move === 0 && clients.length === 2) {
        await spectator.page.waitForFunction(() => window.gameTestSocket?.snapshots.length === 2);
        await spectator.page.evaluate(async revision => {
          const socket = window.gameTestSocket;
          const [old, newest] = socket.snapshots;
          if (JSON.parse(old).revision >= revision || JSON.parse(newest).revision !== revision) {
            throw new Error('Expected consecutive live snapshot revisions');
          }
          for (const data of [newest, old]) socket.dispatchEvent(new MessageEvent('message', { data }));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }, state.revision);
        await converge([spectator], state.revision);
        await spectator.page.getByText('Actions phase · 3 actions left').waitFor();
      }
    }
    throw new Error('Match exceeded the move budget');
  }

  async function failureArtifacts(clients, count, step, error) {
    await mkdir(artifactDir, { recursive: true });
    const scenario = step.fixture ?? count;
    const line = String(error.stack).match(/test-connected-room\.mjs:(\d+):(\d+)/);
    await writeFile(`${artifactDir}/match-${scenario}.json`,
      JSON.stringify({ count, ...step, location: line?.[0], error: error.name }, null, 2));
    await Promise.allSettled(clients.map(({ page }, index) => page.screenshot({
      path: `${artifactDir}/match-${scenario}-seat-${index + 1}.png`,
      mask: [page.locator('input, .cards, dialog, .action-controls, [aria-labelledby="history-heading"], [role="alert"]')],
      timeout: 3000,
    })));
  }

  const scenarios = [2, 3, 4].map(count => ({ count }));
  if (full) scenarios.push({ count: 2, fixture: 'win' }, { count: 2, fixture: 'loss' });
  let totalDiscards = 0;
  for (const { count, fixture } of scenarios) {
    const clients = [];
    const step = { label: 'create lobby', revision: 0, ...(fixture ? { fixture } : {}) };
    if (full) console.log(`Running ${fixture ? 'near-terminal ' + fixture : count + '-player full match'}`);
    let overflow;
    let injectStale = false;
    let staleRequests = 0;
    try {
      for (let index = 0; index < count; index++) {
        clients.push(await identity(`player:${count}:${index}`, index === 1 && count === 2 ? async (request, headers) => {
          if (!injectStale || !request.url().endsWith('/commands')) return;
          staleRequests++;
          if (staleRequests !== 1) return;
          const body = request.postDataJSON();
          const rival = await fetch(workerOrigin + new URL(request.url()).pathname, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-pandemic-test-uid': headers['x-pandemic-test-uid'] },
            body: JSON.stringify({ ...body, commandId: randomUUID() }),
          });
          assert.equal(rival.status, 200);
          await rival.json();
        } : undefined));
      }
      const owner = clients[0].page;
      await owner.goto(origin + '/login');
      await owner.getByRole('button', { name: 'Create room', exact: true }).click();
      await owner.waitForURL('**/rooms/*');
      await connected(owner);
      await owner.getByRole('button', { name: 'Create invite' }).click();
      const link = owner.getByRole('textbox', { name: 'Invite link' });
      await link.waitFor();
      const invite = await link.inputValue();
      step.label = 'join lobby';
      for (const [index, { page }] of clients.slice(1).entries()) {
        if (index === 0) {
          await page.goto(origin + '/login');
          const input = page.getByRole('textbox', { name: 'Paste an invite link' });
          await input.fill('https://foreign.example/join/' + new URL(invite).pathname.split('/').at(-1) + '#invite=ignored');
          await page.getByRole('button', { name: 'Open invite' }).click();
          await page.getByRole('alert').filter({ hasText: /valid invite/ }).waitFor();
          await input.fill(invite);
          await page.getByRole('button', { name: 'Open invite' }).click();
        } else await page.goto(invite);
        if (full && count === 4 && index === 2) {
          step.label = 'race for the final seat';
          overflow = await identity('player:4:overflow');
          await overflow.page.goto(invite);
          const racers = [clients[3], overflow];
          const results = await Promise.all(racers.map(async ({ page: racer }) => {
            const [response] = await Promise.all([
              racer.waitForResponse(response => new URL(response.url()).pathname.endsWith('/join')
                && response.request().method() === 'POST'),
              racer.getByRole('button', { name: 'Join room' }).click(),
            ]);
            return response.status();
          }));
          assert.deepEqual([...results].sort(), [200, 409]);
          if (results[0] !== 200) [clients[3], overflow] = [overflow, clients[3]];
          await overflow.page.getByRole('alert').filter({ hasText: 'Could not join this room.' }).waitFor();
          await clients[3].page.waitForURL('**/rooms/*');
          await connected(clients[3].page);
          await overflow.context.close();
          overflow = undefined;
        } else {
          await page.getByRole('button', { name: 'Join room' }).click();
          await page.waitForURL('**/rooms/*');
          await connected(page);
        }
      }
      for (const { page } of clients) await page.getByText(new RegExp(`^Seat ${count} ·`)).waitFor();
      step.label = 'roles and readiness';
      for (const [index, client] of clients.entries()) {
        const { page } = client;
        const role = await accepted(client, '/commands', () => page.getByRole('combobox', { name: 'Choose role' }).selectOption(roles[index]));
        await converge(clients, role.acceptedVersion);
        const ready = await accepted(client, '/commands', () => page.getByRole('button', { name: 'Mark ready', exact: true }).click());
        await converge(clients, ready.acceptedVersion);
      }
      const start = await accepted(clients[0], '/commands', () => owner.getByRole('button', { name: 'Start game' }).click());
      await converge(clients, start.acceptedVersion);
      for (const { page } of clients) await turn(page, 1).waitFor();
      for (const { page } of clients.slice(1)) assert.equal(await actions(page).count(), 0);
      if (full) {
        if (fixture) {
          step.label = 'near-terminal ' + fixture;
          const path = new URL(owner.url()).pathname;
          const install = uid => fetch(workerOrigin + '/__test' + path + '/fixture', {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-pandemic-test-uid': uid },
            body: JSON.stringify({ scenario: fixture }),
          });
          const denied = await install(clients[1].uid);
          assert.equal(denied.status, 403);
          await denied.json();
          const response = await install(clients[0].uid);
          assert.equal(response.status, 200);
          const state = await response.json();
          assert.equal(state.revision, start.acceptedVersion + 1);
          await converge(clients, state.revision);
          const won = fixture === 'win';
          const result = await accepted(clients[0], '/commands', async () => {
            if (!won) return pass(owner);
            await actions(owner).selectOption('DISCOVER_CURE');
            await owner.getByRole('button', { name: 'Discover cure', exact: true }).click();
          });
          assert.equal(result.acceptedVersion, state.revision + 1);
          assert.equal(result.snapshot.game.phase, won ? 'WON' : 'LOST');
          if (!won) assert.equal(result.snapshot.game.outcome.reason, 'PLAYER_DECK_EMPTY');
          await converge(clients, result.acceptedVersion);
          for (const { page } of clients) {
            const heading = page.getByRole('heading', { name: won ? 'Containment achieved' : 'Containment failed' });
            await heading.waitFor();
            await page.waitForFunction(() => document.activeElement?.id === 'status-heading');
            assert.equal(await actions(page).count(), 0);
          }
          assert.deepEqual(clients.flatMap(client => client.errors), []);
          console.log(`PASS: near-terminal ${fixture} resolved through the browser and Worker`);
          continue;
        }
        if (count === 2) {
          step.label = 'expire and refresh a socket session';
          const guest = clients[1];
          guest.controls.shortTicket = true;
          const before = guest.controls.tickets;
          await guest.page.reload();
          await connected(guest.page);
          await Promise.all([
            guest.page.waitForFunction(() => window.gameTestSessionExpired === true),
            guest.page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/ws-ticket') && response.ok()),
          ]);
          await connected(guest.page);
          assert.ok(guest.controls.tickets >= before + 2);
          await converge([guest], start.acceptedVersion);
        }
        const outcome = await fullMatch(clients, start.snapshot, step);
        totalDiscards += outcome.discarded;
        assert.deepEqual(clients.flatMap(client => client.errors), []);
        console.log(`PASS: full ${count}-player match, ${outcome.moves} commands, ${outcome.discarded} discards, ${outcome.phase}`);
        continue;
      }
      for (let remaining = 3; remaining >= 0; remaining--) {
        await pass(owner);
        if (remaining > 0) await clients[1].page.getByText(new RegExp(`Actions phase · ${remaining} actions? left`)).waitFor();
      }
      for (const { page } of clients) await turn(page, 2).waitFor();
      const second = clients[1].page;
      await second.reload();
      await connected(second);
      await turn(second, 2).waitFor();
      await actions(second).waitFor();
      if (count === 2) {
        injectStale = true;
        await pass(second);
        await second.getByRole('alert').filter({ hasText: 'Choose an action again' }).waitFor();
        assert.equal(staleRequests, 1);
        await owner.getByText(/3 actions left/).waitFor();

        const roomPath = new URL(second.url()).pathname;
        await second.route(origin + '/api' + roomPath, route => route.fulfill({
          status: 410, json: { error: { code: 'ROOM_EXPIRED', message: 'Room expired.', retryable: false } },
        }));
        await second.reload();
        await second.getByRole('status').filter({ hasText: 'This room expired.' }).waitFor();
        await second.getByRole('link', { name: 'Your private rooms' }).click();
        await second.getByRole('button', { name: 'Create room', exact: true }).waitFor();
        assert.equal(await second.locator(`a[href="${roomPath}"]`).count(), 0);
      }
      assert.deepEqual(clients.flatMap(client => client.errors), []);
      console.log(`PASS: ${count} isolated browser identities joined, played a synchronized turn and retained their seat after reload`);
    } catch (error) {
      if (!full) throw error;
      await failureArtifacts(clients, count, step, error);
      throw new Error(`Browser regression failed for ${count} players during ${step.label}. See sanitized failure artifacts.`);
    } finally {
      await overflow?.context.close();
      await Promise.all(clients.map(client => client.context.close()));
    }
  }
  if (full) assert.ok(totalDiscards > 0, 'The full matches must exercise the mandatory discard dialog');
} finally {
  await browser?.close();
  await server?.close();
  await worker?.stop();
}
