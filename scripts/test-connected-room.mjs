import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { build, createServer } from 'vite';
import { unstable_dev } from 'wrangler';

const web = fileURLToPath(new URL('../apps/web', import.meta.url));
const workerEntry = fileURLToPath(new URL('../apps/worker/src/local-test.ts', import.meta.url));
const workerConfig = fileURLToPath(new URL('../apps/worker/wrangler.local-test.jsonc', import.meta.url));
const origin = 'http://127.0.0.1:5188';
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
            '<!doctype html><html lang="en"><meta charset="utf-8"><div id="root"></div><script type="module" src="/tests/auth-fixture.tsx"></script></html>',
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
    const context = await browser.newContext();
    await context.addInitScript(userId => sessionStorage.setItem('firebase-local-popup-fixture', userId), uid);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(url => url.origin === origin && (url.pathname === '/api/rooms' || url.pathname.startsWith('/api/rooms/')), async route => {
      const request = route.request();
      const headers = { ...await request.allHeaders(), 'x-pandemic-test-uid': uid };
      if (request.method() === 'POST') headers.origin = origin;
      if (intercept) await intercept(request, headers);
      await route.continue({ headers });
    });
    return { context, page, errors };
  }

  const connected = page => page.getByText('Connected to room', { exact: true }).waitFor();
  const turn = (page, seat) => page.getByRole('heading', { name: `Player ${seat}’s turn` });
  const actions = page => page.getByRole('combobox', { name: /^Action/ });
  async function pass(page) {
    await actions(page).selectOption('PASS');
    await page.getByRole('button', { name: 'Pass', exact: true }).click();
  }

  for (const count of [2, 3, 4]) {
    const clients = [];
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
        await page.getByRole('button', { name: 'Join room' }).click();
        await page.waitForURL('**/rooms/*');
        await connected(page);
      }
      for (const { page } of clients) await page.getByText(new RegExp(`^Seat ${count} ·`)).waitFor();
      for (const [index, { page }] of clients.entries()) {
        await page.getByRole('combobox', { name: 'Choose role' }).selectOption(roles[index]);
        await page.getByRole('button', { name: 'Mark ready', exact: true }).click();
        await page.getByRole('button', { name: 'Mark not ready', exact: true }).waitFor();
      }
      await owner.getByRole('button', { name: 'Start game' }).click();
      for (const { page } of clients) await turn(page, 1).waitFor();
      for (const { page } of clients.slice(1)) assert.equal(await actions(page).count(), 0);
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
    } finally {
      await Promise.all(clients.map(client => client.context.close()));
    }
  }
} finally {
  await browser?.close();
  await server?.close();
  await worker?.stop();
}
