// T01 only: real browser + local Worker boundary, not the T15 multiplayer suite.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const server = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  detached: process.platform !== 'win32',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
});
let browser;
try {
  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('Development server exited before readiness');
    try {
      const response = await fetch('http://127.0.0.1:5173/api/health', { signal: AbortSignal.timeout(1000) });
      ready = response.ok && (await response.json()).ok === true;
      if (ready) break;
    } catch { /* Servers may still be starting; bounded retry. */ }
    await delay(250);
  }
  assert.ok(ready, 'Local Worker must become ready within 90 seconds');
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('heading', { name: 'PandemicGame' }).waitFor();
  await page.getByText('Local Worker connected', { exact: true }).waitFor();
  for (const [path, method, status, body] of [
    ['/api/health', 'GET', 200, { ok: true, buildSha: 'local', protocolVersion: 1 }],
    ['/api/missing', 'GET', 404, { error: { code: 'ROOM_NOT_FOUND', message: 'Route not found.', retryable: false } }],
    ['/api/health', 'POST', 404, { error: { code: 'ROOM_NOT_FOUND', message: 'Route not found.', retryable: false } }],
  ]) {
    const response = await page.request.fetch(`http://127.0.0.1:5173${path}`, { method });
    assert.equal(response.status(), status);
    assert.match(response.headers()['content-type'], /application\/json/);
    assert.deepEqual(await response.json(), body);
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log('PASS: T01 rendered UI, proxied health, JSON 404 and rejected method');
} finally {
  await browser?.close();
  if (process.platform === 'win32') server.kill('SIGTERM');
  else {
    try { process.kill(-server.pid, 'SIGTERM'); } catch (error) {
      if (error.code !== 'ESRCH') {
        console.error('Server cleanup failed', error);
        process.exitCode = 1;
      }
    }
  }
}
