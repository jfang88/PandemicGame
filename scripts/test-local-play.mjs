/* global document, window -- Playwright callbacks evaluate in the browser. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer } from 'vite';

const webRoot = fileURLToPath(new URL('../apps/web', import.meta.url));
let server;
let browser;

try {
  process.env.NODE_ENV = 'production';
  const output = await build({ root: webRoot, build: { write: false } });
  const files = (Array.isArray(output) ? output : [output]).flatMap(result => result.output);
  const publicText = files.map(file => file.type === 'chunk' ? file.code : String(file.source)).join('\n');
  assert(!files.some(file => file.fileName === 'local.html'));
  assert.doesNotMatch(publicText, /local\.html|local-fixture|\brngState\b|\bplayerDeck\b|Start a local game/);
  console.log('PASS: production output contains no local entry, fixture, deck or RNG graph');

  process.env.NODE_ENV = 'development';
  server = await createServer({ root: webRoot, server: { host: '127.0.0.1', port: 5186, strictPort: true } });
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [];
  page.setDefaultTimeout(10_000);
  page.on('pageerror', error => {
    errors.push(error.message);
    console.error(error.message);
  });
  page.on('response', response => {
    if (response.status() >= 400) console.error(response.status(), response.url());
  });
  await page.route('**/__local-fixture.html?scenario=*', async route => route.fulfill({
    contentType: 'text/html',
    body: await server.transformIndexHtml('/__local-fixture.html',
      '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T12 test</title><div id="root"></div><script type="module" src="/tests/local-fixture.tsx"></script></html>'),
  }));
  const origin = 'http://127.0.0.1:5186';
  const action = page.getByRole('combobox', { name: /^Action/ });
  const status = page.locator('#status-heading');
  const dialog = page.getByRole('dialog');
  const cardCount = seat => page.getByRole('article', { name: `Player ${seat}` });
  const playerDeckCount = () => page.getByText('Player cards', { exact: true }).locator('..').locator('dd').textContent();
  const canFit = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  async function chooseAction(value, label) {
    await action.selectOption(value);
    await page.getByRole('button', { name: label, exact: true }).press('Enter');
  }

  await page.goto(`${origin}/local.html`);
  await page.getByRole('combobox', { name: /^Players/ }).selectOption('4');
  assert.equal(await page.getByLabel(/Player [1-4] role/).count(), 4);
  await page.getByLabel('Player 2 role').selectOption('medic');
  assert(await page.getByRole('button', { name: 'Start game' }).isDisabled());
  await page.getByLabel('Player 2 role').selectOption('scientist');
  await page.getByRole('button', { name: 'Start game' }).press('Enter');
  await page.getByRole('heading', { name: 'Player 1’s turn' }).waitFor();
  assert.equal(await status.evaluate(el => el === document.activeElement), true);
  await page.getByRole('img', { name: '48-location containment grid' }).waitFor();
  await page.getByRole('combobox', { name: /^Inspect location/ }).focus();
  await page.keyboard.press('ArrowDown');
  await page.getByText('Blue Station A02 · No research center', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Move', exact: true }).press('Enter');
  await cardCount(1).getByText(/Blue Station A02/).waitFor();
  assert(await canFit());
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await canFit());
  await page.setViewportSize({ width: 1024, height: 768 });
  console.log('PASS: keyboard setup, duplicate role rejection, board inspection and movement at tablet and phone widths');

  await page.goto(`${origin}/__local-fixture.html?scenario=transfer`);
  const transferDeck = Number(await playerDeckCount());
  await chooseAction('GIVE_CARD', 'Give card');
  await page.getByRole('heading', { name: 'Player 2 must discard' }).waitFor();
  assert.equal(Number(await playerDeckCount()), transferDeck);
  const recipientDiscard = dialog.getByRole('button', { name: 'Discard Blue Station A01' });
  assert(await dialog.evaluate(el => el.contains(document.activeElement)));
  await page.keyboard.press('Escape');
  assert(await dialog.isVisible());
  await recipientDiscard.press('Enter');
  await page.getByRole('heading', { name: 'Player 2’s turn' }).waitFor();
  assert.equal(await status.evaluate(el => el === document.activeElement), true);
  assert.equal(Number(await playerDeckCount()), transferDeck - 2);
  await cardCount(2).getByText(/7 \/ 7 cards/).waitFor();
  console.log('PASS: E12 recipient discard blocks turn, then resumes both player draws');

  await page.goto(`${origin}/__local-fixture.html?scenario=draw`);
  const drawDeck = Number(await playerDeckCount());
  await chooseAction('PASS', 'Pass');
  await page.getByRole('heading', { name: 'Player 1 must discard' }).waitFor();
  assert.equal(Number(await playerDeckCount()), drawDeck - 1);
  await dialog.getByRole('button', { name: 'Discard Blue Station B01' }).press('Enter');
  await page.getByRole('heading', { name: 'Player 2’s turn' }).waitFor();
  assert.equal(Number(await playerDeckCount()), drawDeck - 2);
  assert.equal(await status.evaluate(el => el === document.activeElement), true);
  console.log('PASS: E13 active-player discard pauses after the first draw and resumes only one draw');

  await page.goto(`${origin}/__local-fixture.html?scenario=victory`);
  assert.equal(Number(await playerDeckCount()), 0);
  await chooseAction('DISCOVER_CURE', 'Discover cure');
  await page.getByRole('heading', { name: 'Containment achieved' }).waitFor();
  await page.getByText('All four diseases are cured.').waitFor();
  assert.equal(await action.count(), 0);
  console.log('PASS: E21 fourth cure reaches victory before a required draw from an empty deck');

  await page.goto(`${origin}/__local-fixture.html?scenario=full-match`);
  const terminal = page.getByRole('heading', { name: 'Containment failed' });
  for (let command = 0; command < 130 && !await terminal.isVisible(); command++) {
    if (await dialog.isVisible()) {
      await dialog.getByRole('button').first().press('Enter');
    } else {
      await chooseAction('PASS', 'Pass');
    }
  }
  await terminal.waitFor();
  assert(await page.getByRole('status').textContent());
  assert.equal(await action.count(), 0);
  await page.getByRole('button', { name: 'New local game' }).press('Enter');
  await page.getByRole('heading', { name: 'Start a local game' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: full seeded match from normal engine setup to terminal result through browser controls');
} finally {
  await browser?.close();
  await server?.close();
}
