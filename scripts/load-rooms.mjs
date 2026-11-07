/* global window */
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, createServer } from 'vite';
import { unstable_dev } from 'wrangler';

const rooms = 10;
const seats = 4;
const roles = ['medic', 'scientist', 'builder', 'courier'];
const localPort = 5189;
const localOrigin = 'http://127.0.0.1:' + localPort;
const forbidden = ['rngState', 'seed', 'playerDeck', 'infectionDeck', 'inviteSecret', 'inviteHash', 'ticket',
  'requestHash', 'privateResult', 'idToken', 'accessToken', 'authorization', 'email', 'gameJson'];

class LoadFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function requireLoad(condition, code) {
  if (!condition) throw new LoadFailure(code);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? Math.round(sorted[Math.ceil(sorted.length * fraction) - 1] * 10) / 10 : null;
}

function containsPrivateKey(value) {
  return value !== null && typeof value === 'object' && Object.entries(value)
    .some(([key, child]) => forbidden.includes(key) || containsPrivateKey(child));
}

function reportLatency(values) {
  return { samples: values.length, p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95) };
}

async function previewTarget() {
  const url = new URL(process.env.PANDEMIC_LOAD_PREVIEW_ORIGIN ?? 'invalid:');
  requireLoad(url.protocol === 'https:' && url.pathname === '/' && url.href === url.origin + '/',
    'INVALID_PREVIEW_ORIGIN');
  const tokenFile = process.env.PANDEMIC_LOAD_TOKEN_FILE;
  requireLoad(tokenFile && (await stat(tokenFile)).size <= 512 * 1024, 'INVALID_PREVIEW_TOKEN_FILE');
  const tokens = JSON.parse(await readFile(tokenFile, 'utf8'));
  requireLoad(Array.isArray(tokens) && tokens.length === rooms * seats, 'EXPECTED_40_PREVIEW_TOKENS');
  const ids = new Set();
  const clients = tokens.map(token => {
    requireLoad(typeof token === 'string' && token.length <= 8192, 'INVALID_PREVIEW_TOKEN');
    const parts = token.split('.');
    requireLoad(parts.length === 3 && parts.every(part => /^[\w-]+$/.test(part)), 'INVALID_PREVIEW_TOKEN');
    const { sub, exp } = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    // The server still verifies each token. Claims here identify the expected public member and expiry.
    requireLoad(typeof sub === 'string' && sub.length > 0 && !ids.has(sub), 'EXPECTED_40_DISTINCT_IDENTITIES');
    requireLoad(Number.isSafeInteger(exp) && exp * 1000 > Date.now() + 20 * 60_000, 'PREVIEW_TOKEN_EXPIRING');
    ids.add(sub);
    return { uid: sub, headers: { authorization: 'Bearer ' + token } };
  });
  return { origin: url.origin, apiOrigin: url.origin, clients };
}

async function localTarget() {
  const web = fileURLToPath(new URL('../apps/web', import.meta.url));
  const entry = fileURLToPath(new URL('../apps/worker/src/local-test.ts', import.meta.url));
  const config = fileURLToPath(new URL('../apps/worker/wrangler.local-test.jsonc', import.meta.url));
  await build({ root: web, logLevel: 'silent' });
  const worker = await unstable_dev(entry, {
    config, ip: '127.0.0.1', port: 0, local: true, persist: false, inspect: false, logLevel: 'none',
    vars: { APP_ORIGINS: localOrigin, FIREBASE_PROJECT_ID: 'local-placeholder-not-authenticated' },
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
  });
  const clients = Array.from({ length: rooms * seats }, (_, index) => {
    const uid = 'load-user-' + index;
    return { uid, headers: { 'x-pandemic-test-uid': uid } };
  });
  try {
    const server = await createServer({ root: web, logLevel: 'silent', server: {
      host: '127.0.0.1', port: localPort, strictPort: true, proxy: {
        '/api': { target: 'http://127.0.0.1:' + worker.port, ws: true },
      },
    } });
    await server.listen();
    return { origin: localOrigin, apiOrigin: localOrigin, clients, worker, server };
  } catch (error) {
    await worker.stop();
    throw error;
  }
}

async function createSocketPage(browser, origin) {
  const page = await browser.newPage();
  page.on('console', message => {
    const text = message.text();
    if (!text.includes('WebSocket connection')) return;
    const status = /response code: (\d{3})/i.exec(text)?.[1];
    const transport = /\bERR_[A-Z_]{3,32}\b/.exec(text)?.[0];
    const code = status ? 'SOCKET_BROWSER_HTTP_' + status : 'SOCKET_BROWSER_' + (transport ?? 'ERROR');
    errors[code] = (errors[code] ?? 0) + 1;
  });
  page.on('websocket', socket => socket.on('socketerror', message => {
    const status = /response code: (\d{3})/i.exec(message)?.[1];
    const transport = /\bERR_[A-Z_]{3,32}\b/.exec(message)?.[0];
    const code = status ? 'SOCKET_HTTP_' + status : 'SOCKET_TRANSPORT_' + (transport ?? 'ERROR');
    errors[code] = (errors[code] ?? 0) + 1;
  }));
  const health = await page.goto(origin + '/api/health');
  requireLoad(health?.ok(), 'BROWSER_HEALTH_FAILED');
  await page.evaluate(() => { window.loadGroups = new Map(); });
  return page;
}

async function openSockets(page, slot, roomId, urls, forbiddenKeys) {
  await page.evaluate(({ slot, roomId, urls, forbiddenKeys }) => {
    const group = { clients: [], failure: null, wake: null };
    window.loadGroups.set(slot, group);
    const hasPrivateKey = value => value !== null && typeof value === 'object' && Object.entries(value)
      .some(([key, child]) => forbiddenKeys.includes(key) || hasPrivateKey(child));
    for (const url of urls) {
      const socket = new WebSocket(url);
      const client = { socket, snapshot: null };
      group.clients.push(client);
      socket.addEventListener('message', ({ data }) => {
        try {
          const frame = JSON.parse(data);
          if (frame.type === 'snapshot') {
            const snapshot = frame.state;
            if (snapshot?.roomId !== roomId || snapshot.revision !== frame.revision || frame.protocolVersion !== 1
              || hasPrivateKey(frame) || (client.snapshot && snapshot.revision < client.snapshot.revision)) {
              group.failure ??= 'INVALID_SOCKET_SNAPSHOT';
            } else {
              client.snapshot = snapshot;
            }
          } else if (frame.type !== 'presence' || hasPrivateKey(frame)) {
            group.failure ??= 'INVALID_SOCKET_FRAME';
          }
        } catch {
          group.failure ??= 'INVALID_SOCKET_JSON';
        }
        group.wake?.();
      });
      function failed() {
        group.failure ??= 'SOCKET_CONNECTION_FAILED';
        group.wake?.();
      }
      socket.addEventListener('error', failed);
      socket.addEventListener('close', failed);
    }
  }, { slot, roomId, urls, forbiddenKeys });
}

async function converge(page, slot, expected) {
  const result = await page.evaluate(({ slot, revision, count }) => new Promise(resolve => {
    const group = window.loadGroups.get(slot);
    if (!group) { resolve({ failure: 'SOCKET_GROUP_MISSING' }); return; }
    const timeout = setTimeout(() => {
      group.wake = null;
      resolve({ failure: 'SOCKET_CONVERGENCE_TIMEOUT' });
    }, 6000);
    group.wake = () => {
      if (!group.failure && (group.clients.length !== count
        || group.clients.some(client => (client.snapshot?.revision ?? -1) < revision))) return;
      clearTimeout(timeout);
      group.wake = null;
      resolve(group.failure ? { failure: group.failure } : { snapshots: group.clients.map(client => client.snapshot) });
    };
    group.wake();
  }), { slot, revision: expected.revision, count: seats });
  requireLoad(!result.failure, result.failure);
  requireLoad(result.snapshots.every(snapshot => isDeepStrictEqual(snapshot, expected)), 'SOCKET_SNAPSHOT_DIVERGED');
}

async function closeSockets(page, slot) {
  await page.evaluate(slot => {
    const group = window.loadGroups.get(slot);
    if (!group) return;
    for (const client of group.clients) client.socket.close();
    window.loadGroups.delete(slot);
  }, slot);
}

function verifySnapshot(snapshot, roomId, clients) {
  requireLoad(snapshot?.roomId === roomId && snapshot.protocolVersion === 1
    && Number.isInteger(snapshot.revision) && snapshot.members.length === seats
    && snapshot.members.every((member, seat) => member.userId === clients[seat].uid && member.seat === seat)
    && snapshot.game?.players.length === seats
    && snapshot.game.players.every((player, seat) => player.userId === clients[seat].uid && player.seat === seat)
    && !containsPrivateKey(snapshot), 'PROJECTION_ISOLATION_FAILED');
}

function pickCommand(game, locations) {
  if (game.phase === 'DISCARD_REQUIRED') {
    const player = game.players.find(({ userId }) => userId === game.pendingDiscardUserId);
    requireLoad(player?.hand.length > 7, 'INVALID_DISCARD_STATE');
    return { seat: player.seat, type: 'DISCARD', payload: { cardIds: player.hand.slice(7) } };
  }
  requireLoad(game.phase === 'ACTIONS', 'INVALID_GAME_PHASE');
  const player = game.players.find(({ seat }) => seat === game.activeSeat);
  const cubes = game.cubes[player.locationId];
  const color = Object.keys(cubes).find(color => cubes[color] > 0);
  if (color) return { seat: player.seat, type: 'TREAT', payload: { color } };
  const destination = locations.get(player.locationId).neighbors.find(id => Object.values(game.cubes[id]).some(Boolean));
  if (destination) return { seat: player.seat, type: 'MOVE', payload: { destination } };
  return { seat: player.seat, type: 'PASS', payload: {} };
}

const commandTimes = [];
const convergenceTimes = [];
const errors = {};
const began = performance.now();
const controller = new AbortController();
const initialSockets = Promise.withResolvers();
controller.signal.addEventListener('abort', () => initialSockets.resolve(false), { once: true });
const preview = process.argv.length === 3 && process.argv[2] === '--owned-preview';
const commandsPerRoom = preview ? 300 : 8;
const deadline = setTimeout(() => controller.abort(), preview ? 25 * 60_000 : 120_000);
let target;
let browser;
let roomsCreated = 0;
let slotsReady = 0;
let setupTail = Promise.resolve();
let lastSetup = 0;

async function request(client, path, method = 'GET', body, expected = 200) {
  const response = await fetch(target.apiOrigin + path, {
    method, redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    headers: { ...client.headers, origin: target.origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => { throw new LoadFailure('HTTP_NETWORK_FAILURE'); });
  requireLoad(response.status === expected, 'UNEXPECTED_HTTP_' + response.status);
  return response.json().catch(() => { throw new LoadFailure('INVALID_HTTP_RESPONSE'); });
}

function setupRequest(client, path, body, method = 'POST', expected = 200) {
  if (!preview) return request(client, path, method, body, expected);
  // Pace create, join, room read and ticket attempts from one IP at <= 90 per minute.
  // They share the preview's 120 per minute edge IP limit.
  const result = setupTail.then(async () => {
    await sleep(Math.max(0, lastSetup + 700 - performance.now()), undefined, { signal: controller.signal });
    lastSetup = performance.now();
    return request(client, path, method, body, expected);
  });
  setupTail = result.catch(() => {});
  return result;
}

function submit(client, path, expectedVersion, type, payload) {
  return request(client, path + '/commands', 'POST', {
    protocolVersion: 1, commandId: randomUUID(), expectedVersion, type, payload,
  });
}

async function startRoom(slot, clients, outsider, page) {
  const roomId = randomUUID();
  const path = '/api/rooms/' + roomId;
  const [owner, ...guests] = clients;
  const created = await setupRequest(owner, '/api/rooms', { roomId });
  requireLoad(created.roomId === roomId && created.version === 0, 'INVALID_CREATE_RESPONSE');
  roomsCreated++;
  const invite = await request(owner, path + '/invite', 'POST', { commandId: randomUUID(), expectedVersion: created.version });
  let revision = invite.acceptedVersion;
  for (const guest of guests) {
    const joined = await setupRequest(guest, path + '/join', { commandId: randomUUID(), inviteSecret: invite.inviteSecret });
    requireLoad(joined.acceptedVersion === ++revision && !joined.duplicate, 'JOIN_REVISION_MISMATCH');
  }
  for (let seat = 0; seat < seats; seat++) {
    const client = clients[seat];
    for (const [type, payload] of [['SELECT_ROLE', { role: roles[seat] }], ['SET_READY', { ready: true }]]) {
      const accepted = await submit(client, path, revision, type, payload);
      requireLoad(accepted.acceptedVersion === ++revision && !accepted.duplicate, 'LOBBY_REVISION_MISMATCH');
    }
  }
  const started = await submit(owner, path, revision, 'START_GAME', {});
  requireLoad(started.acceptedVersion === ++revision && started.snapshot.revision === revision
    && started.snapshot.lifecycle === 'RUNNING', 'START_REVISION_MISMATCH');
  verifySnapshot(started.snapshot, roomId, clients);
  const denied = await setupRequest(outsider, path, undefined, 'GET', 403);
  requireLoad(denied.error?.code === 'NOT_MEMBER' && !denied.snapshot && !containsPrivateKey(denied), 'CROSS_ROOM_READ_FAILED');
  const urls = await Promise.all(clients.map(async client => {
    const { ticket } = await setupRequest(client, path + '/ws-ticket');
    requireLoad(typeof ticket === 'string' && /^[0-9a-f]{64}$/.test(ticket), 'INVALID_SOCKET_TICKET');
    const url = new URL(path + '/ws', target.apiOrigin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', ticket);
    return url.href;
  }));
  await openSockets(page, slot, roomId, urls, forbidden);
  await converge(page, slot, started.snapshot);
  return { roomId, path, snapshot: started.snapshot };
}

async function playSlot(slot, page, locations) {
  const group = target.clients.slice(slot * seats, (slot + 1) * seats);
  const outsider = target.clients[((slot + 1) % rooms) * seats];
  let clients = group;
  let room = await startRoom(slot, clients, outsider, page);
  if (++slotsReady === rooms) initialSockets.resolve(true);
  requireLoad(await initialSockets.promise, 'INITIAL_SOCKET_SETUP_FAILED');
  let generations = 1;
  for (let count = 0; count < commandsPerRoom; count++) {
    if (preview) await sleep(2000 + Math.random() * 400, undefined, { signal: controller.signal });
    if (room.snapshot.lifecycle !== 'RUNNING') {
      requireLoad(preview && generations < 40, 'ROOM_GENERATION_BUDGET_EXHAUSTED');
      await closeSockets(page, slot);
      // Alternate ownership so a single preview identity never creates more than ten rooms.
      const first = generations++ % seats;
      clients = [...group.slice(first), ...group.slice(0, first)];
      room = await startRoom(slot, clients, outsider, page);
    }
    const { seat, type, payload } = pickCommand(room.snapshot.game, locations);
    const started = performance.now();
    const accepted = await submit(clients[seat], room.path, room.snapshot.revision, type, payload);
    commandTimes.push(performance.now() - started);
    requireLoad(!accepted.duplicate && accepted.acceptedVersion === room.snapshot.revision + 1
      && accepted.snapshot.revision === accepted.acceptedVersion, 'COMMAND_REVISION_MISMATCH');
    verifySnapshot(accepted.snapshot, room.roomId, clients);
    await converge(page, slot, accepted.snapshot);
    convergenceTimes.push(performance.now() - started);
    room.snapshot = accepted.snapshot;
    if (preview && convergenceTimes.length % 50 === 0 && convergenceTimes.length >= 100) {
      requireLoad(percentile(convergenceTimes.slice(-50), 0.95) <= 3000
        || percentile(convergenceTimes.slice(-100, -50), 0.95) <= 3000, 'SUSTAINED_CONVERGENCE_LATENCY');
    }
  }
  await closeSockets(page, slot);
}

try {
  requireLoad(process.argv.length === 2 || preview, 'INVALID_ARGUMENTS');
  try {
    target = await (preview ? previewTarget() : localTarget());
  } catch (error) {
    if (error instanceof LoadFailure) throw error;
    throw new LoadFailure(preview ? 'PREVIEW_TARGET_SETUP_FAILED' : 'LOCAL_WORKER_SETUP_FAILED');
  }
  browser = await chromium.launch();
  const page = await createSocketPage(browser, target.origin);
  const board = JSON.parse(await readFile(new URL('../spec/board.v1.json', import.meta.url), 'utf8'));
  const locations = new Map(board.locations.map(location => [location.id, location]));
  const results = await Promise.allSettled(Array.from({ length: rooms }, (_, slot) => playSlot(slot, page, locations)
    .catch(error => {
      if (!controller.signal.aborted) {
        const code = error instanceof LoadFailure ? error.code : 'ROOM_EXECUTION_FAILED';
        errors[code] = (errors[code] ?? 0) + 1;
        controller.abort();
      }
      throw error;
    })));
  requireLoad(results.every(result => result.status === 'fulfilled')
    && commandTimes.length === rooms * commandsPerRoom && convergenceTimes.length === commandTimes.length, 'LOAD_INCOMPLETE');
} catch (error) {
  const code = error instanceof LoadFailure ? error.code : 'HARNESS_RUNTIME_FAILURE';
  errors[code] = (errors[code] ?? 0) + 1;
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  await browser?.close().catch(() => {});
  await target?.server?.close().catch(() => {});
  await target?.worker?.stop().catch(() => {});
  console.log(JSON.stringify({
    mode: preview ? 'owned-preview' : 'local', roomSlots: rooms, clientIdentities: rooms * seats,
    roomsCreated, commandsPerSlot: commandsPerRoom, durationMs: Math.round(performance.now() - began),
    commandLatency: reportLatency(commandTimes), convergenceLatency: reportLatency(convergenceTimes), errors,
  }));
}
