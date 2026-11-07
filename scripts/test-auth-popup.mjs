/* global window -- Playwright evaluates this callback in Chromium. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer } from 'vite';

const root = fileURLToPath(new URL('../apps/web', import.meta.url));
const origin = 'http://127.0.0.1:5187';
const roomId = '22b01521-cbef-48b4-9c2c-248dc5d901ee';
const invite = 'private-invite-fixture';
const storageKey = 'pandemic:pending-invite';
let server;
let browser;

async function verifyConfiguredBuild() {
  const values = {
    NODE_ENV: 'production',
    VITE_FIREBASE_API_KEY: 'public-browser-build-fixture',
    VITE_FIREBASE_AUTH_DOMAIN: 'fixture-project.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'fixture-project',
    VITE_FIREBASE_APP_ID: '1:123456789:web:fixture',
  };
  const previous = Object.keys(values).map(key => [key, process.env[key]]);
  Object.assign(process.env, values);
  try {
    const result = await build({ root, build: { write: false } });
    const files = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
    const output = files.map(file => file.type === 'chunk' ? file.code : String(file.source)).join('\n');
    assert.match(output, /microsoft\.com/);
    assert.doesNotMatch(output, /firebase-local-popup-fixture|mock-refreshed-token|x-pandemic-test-uid|gameTestSocket|__test\/rooms|FIREBASE_AUTH_EMULATOR_HOST|PandemicGame local test|BEGIN PRIVATE KEY|local\.html|local-fixture|\brngState\b|\bplayerDeck\b/);
    console.log('PASS: configured production auth build excludes local identities, fixtures and emulator settings');
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

try {
  await verifyConfiguredBuild();
  server = await createServer({ root, server: { host: '127.0.0.1', port: 5187, strictPort: true } });
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(url => url.origin === origin && /^\/api\/rooms\/[^/]+$/.test(url.pathname),
    route => route.fulfill({ status: 403, json: { error: { code: 'NOT_MEMBER' } } }));
  await page.route(url => url.origin === origin && /^\/(login$|rooms\/|join\/)/.test(url.pathname),
    async route => route.fulfill({
      contentType: 'text/html',
      body: await server.transformIndexHtml('/login', '<!doctype html><html lang="en"><meta charset="utf-8"><div id="root"></div><script type="module" src="/tests/auth-fixture.tsx"></script></html>'),
    }));
  const login = provider => page.getByRole('button', { name: 'Sign in with ' + provider }).press('Enter');
  const signOut = () => page.getByRole('button', { name: 'Sign out' }).click();

  await page.goto(origin + '/login?test=recovery&returnTo=' + encodeURIComponent('//untrusted.example/rooms/' + roomId));
  assert.equal(await page.getByRole('button', { name: 'Sign in with Google' }).count(), 0);
  await login('Google');
  await page.getByRole('alert').filter({ hasText: /blocked/ }).waitFor();
  await login('Microsoft');
  await page.getByRole('alert').filter({ hasText: /originally used/ }).waitFor();
  await login('Microsoft');
  await page.getByText('Signed in.', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).origin, origin);
  assert.equal(new URL(page.url()).pathname, '/login');
  await signOut();
  await page.getByRole('button', { name: 'Sign in with Google' }).waitFor();
  await page.goto(origin + '/login?test=closed');
  await login('Google');
  await page.getByRole('alert').filter({ hasText: /window closed/ }).waitFor();
  console.log('PASS: initialized popup UI, blocked-popup and collision recovery, Microsoft sign-in and logout');

  await page.goto(origin + '/login?returnTo=' + encodeURIComponent('/rooms/' + roomId));
  await login('Google');
  await page.waitForURL(origin + '/rooms/' + roomId);
  await page.getByText('Signed in.', { exact: true }).waitFor();
  console.log('PASS: Google sign-in resumes only a validated local room path');

  const attempts = [];
  let switchAccount = false;
  await page.route('**/api/health', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/rooms/' + roomId + '/join', async route => {
    const request = route.request();
    attempts.push({ body: request.postData(), authorization: request.headers()['authorization'], url: request.url() });
    if (switchAccount) {
      await page.evaluate(() => window.dispatchEvent(new Event('firebase-fixture-switch')));
      return route.fulfill({ status: 401, json: { error: { code: 'TOKEN_EXPIRED' } } });
    }
    if (attempts.length === 1) return route.fulfill({ status: 401, json: { error: { code: 'TOKEN_EXPIRED' } } });
    return route.fulfill({ status: 200, json: { commandId: request.postDataJSON().commandId, snapshot: { roomId } } });
  });
  await page.goto(origin + '/join/' + roomId + '#invite=' + invite);
  await page.getByRole('button', { name: 'Join room' }).waitFor();
  assert.equal(new URL(page.url()).hash, '');
  assert.match(await page.evaluate(key => sessionStorage.getItem(key), storageKey), /private-invite-fixture/);
  await page.reload();
  await page.getByRole('button', { name: 'Join room' }).click();
  await page.waitForURL(origin + '/rooms/' + roomId);
  assert.deepEqual(attempts.map(attempt => attempt.authorization), ['Bearer mock-initial-token', 'Bearer mock-refreshed-token']);
  assert.equal(attempts[0].body, attempts[1].body);
  assert(!attempts.some(attempt => attempt.url.includes(invite)));
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), storageKey), null);
  switchAccount = true;
  await page.goto(origin + '/join/' + roomId + '#invite=' + invite);
  await page.getByRole('button', { name: 'Join room' }).click();
  await page.getByRole('alert').filter({ hasText: /account changed/ }).waitFor();
  assert.equal(attempts.length, 3);
  assert.equal(new URL(page.url()).pathname, '/join/' + roomId);
  await page.getByRole('button', { name: 'Cancel invite' }).click();
  await page.waitForURL(origin + '/');
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), storageKey), null);
  assert.deepEqual(errors, []);
  console.log('PASS: invite survives reload, refresh preserves the join intent, account switch stops retry, and join or cancel clears it');
} finally {
  await browser?.close();
  await server?.close();
}
