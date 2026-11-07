import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import normalWorker, { type Env } from '../../apps/worker/src/index';

const bindings = env as Env;
const worker = (exports as unknown as { default: Fetcher }).default;
const host = 'http://127.0.0.1:8787';
const alternateOrigin = 'http://127.0.0.1:5173';
const userId = 'firebase:stable-owner';

async function room() {
  const id = crypto.randomUUID();
  const path = `/api/rooms/${id}`;
  const create = await worker.fetch(host + '/api/rooms', {
    method: 'POST', headers: { 'x-pandemic-test-uid': userId, 'content-type': 'application/json' },
    body: JSON.stringify({ roomId: id }),
  });
  expect(create.status).toBe(200);
  return { path, stub: bindings.GAME_ROOMS.getByName(id) };
}

function ticket(path: string, options: { uid?: string; origin?: string; expiry?: number } = {}) {
  return worker.fetch(host + path + '/ws-ticket', { method: 'POST', headers: {
    origin: options.origin ?? host,
    'x-pandemic-test-uid': options.uid ?? userId,
    ...(options.expiry === undefined ? {} : { 'x-pandemic-test-auth-expires-at': String(options.expiry) }),
  } });
}

async function issue(path: string, expiry?: number) {
  const response = await ticket(path, expiry === undefined ? {} : { expiry });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return response.json() as Promise<{ ticket: string; expiresAt: string }>;
}

function upgrade(path: string, value: string, origin = host) {
  return worker.fetch(host + path + '/ws?ticket=' + value, { headers: { origin, upgrade: 'websocket' } });
}

function frame(socket: WebSocket) {
  return new Promise<unknown>(resolve => socket.addEventListener('message', event => {
    resolve(JSON.parse(event.data as string) as unknown);
  }, { once: true }));
}

function closed(socket: WebSocket) {
  return new Promise<CloseEvent>(resolve => socket.addEventListener('close', resolve, { once: true }));
}

async function open(path: string, value: string) {
  const response = await upgrade(path, value);
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  const initial = frame(socket);
  socket.accept();
  const message = await initial;
  expect(message).toMatchObject({ type: 'snapshot', protocolVersion: 1, state: { ownerUserId: userId } });
  expect(JSON.stringify(message)).not.toMatch(/"authExpiresAt"|"ticket"|"rngState"|"inviteHash"/);
  return socket;
}

function command(path: string, expectedVersion: number, type: string, payload: object = {}) {
  return worker.fetch(host + path + '/commands', { method: 'POST',
    headers: { 'x-pandemic-test-uid': userId, 'content-type': 'application/json' },
    body: JSON.stringify({ protocolVersion: 1, commandId: crypto.randomUUID(), expectedVersion, type, payload }),
  });
}

it('binds persisted tickets to the room and origin and consumes each once across eviction', async () => {
  const first = await room();
  const second = await room();
  expect((await ticket(first.path, { uid: 'nonmember' })).status).toBe(403);
  expect((await ticket(first.path, { origin: 'https://other.example' })).status).toBe(400);
  const issued = await issue(first.path);
  expect(issued.ticket).toMatch(/^[0-9a-f]{64}$/);
  const stored = await runInDurableObject(first.stub, (_instance, ctx) =>
    ctx.storage.sql.exec<{ hash: string }>('SELECT hash FROM socket_tickets').one().hash);
  expect(stored).not.toBe(issued.ticket);
  for (const response of [await upgrade(first.path, issued.ticket, alternateOrigin), await upgrade(second.path, issued.ticket)]) {
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_TICKET' } });
  }
  await evictDurableObject(first.stub);
  const responses = await Promise.all([1, 2].map(async () => {
    const response = await upgrade(first.path, issued.ticket);
    response.webSocket?.accept();
    return response;
  }));
  expect(responses.map(response => response.status).sort()).toEqual([101, 401]);
  expect(await responses.find(response => response.status === 401)!.json()).toMatchObject({ error: { code: 'INVALID_TICKET' } });
  const socket = responses.find(response => response.status === 101)!.webSocket!;
  await evictDurableObject(first.stub);
  expect((await upgrade(first.path, issued.ticket)).status).toBe(401);
  socket.close();
}, 12_000);

it('rejects expired tickets and never takes test identity from the normal Worker', async () => {
  const { path, stub } = await room();
  const issued = await issue(path);
  await runInDurableObject(stub, (_instance, ctx) => ctx.storage.sql.exec('UPDATE socket_tickets SET expiresAt = 0'));
  expect((await upgrade(path, issued.ticket)).status).toBe(401);
  await runDurableObjectAlarm(stub);
  expect(await runInDurableObject(stub, (_instance, ctx) =>
    ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM socket_tickets').one().count)).toBe(0);
  expect((await ticket(path, { expiry: Date.now() - 100 })).status).toBe(401);
  const normal = await normalWorker.fetch(new Request(host + path + '/ws-ticket', {
    method: 'POST', headers: { origin: host, 'x-pandemic-test-uid': userId,
      'x-pandemic-test-auth-expires-at': String(Date.now() + 60_000) },
  }), bindings);
  expect(normal.status).toBe(401);
});

it('accepts an empty streamed ticket request and rejects a nonempty body', async () => {
  const { path } = await room();
  const headers = { origin: host, 'x-pandemic-test-uid': userId };
  const empty = new ReadableStream<Uint8Array>({ start: controller => controller.close() });
  const accepted = await worker.fetch(host + path + '/ws-ticket', { method: 'POST', headers, body: empty });
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toMatchObject({ ticket: expect.any(String) });
  const rejected = await worker.fetch(host + path + '/ws-ticket', { method: 'POST', headers, body: '{}' });
  expect(rejected.status).toBe(400);
});

it('migrates an existing v3 room before issuing realtime tickets', async () => {
  const { path, stub } = await room();
  expect((await command(path, 0, 'SELECT_ROLE', { role: 'medic' })).status).toBe(200);
  await runInDurableObject(stub, (_instance, ctx) => ctx.storage.transactionSync(() => {
    ctx.storage.sql.exec('DROP TABLE socket_tickets');
    ctx.storage.sql.exec('UPDATE metadata SET version = 3 WHERE singleton = 1');
  }));
  await evictDurableObject(stub);
  const issued = await issue(path);
  const socket = await open(path, issued.ticket);
  expect(await runInDurableObject(stub, (_instance, ctx) => ctx.storage.sql.exec(
    'SELECT revision FROM room WHERE singleton = 1',
  ).one())).toEqual({ revision: 1 });
  socket.close();
});

it('rehydrates socket identity after eviction, pushes committed state and revokes a departing member', async () => {
  const { path, stub } = await room();
  const socket = await open(path, (await issue(path)).ticket);
  await evictDurableObject(stub);
  const update = frame(socket);
  expect((await command(path, 0, 'SELECT_ROLE', { role: 'medic' })).status).toBe(200);
  expect(await update).toMatchObject({ type: 'snapshot', revision: 1, state: {
    members: [{ userId, role: 'medic' }],
  } });
  const end = closed(socket);
  const spare = await issue(path);
  expect((await command(path, 1, 'LEAVE_LOBBY')).status).toBe(200);
  expect((await end).code).toBe(1008);
  expect((await upgrade(path, spare.ticket)).status).toBe(401);
});

it('expires an idle attachment through its alarm and reconnects the same UID with a new ticket', async () => {
  const { path, stub } = await room();
  const deadline = Date.now() + 2500;
  const issued = await issue(path, deadline);
  expect(Date.parse(issued.expiresAt)).toBe(deadline);
  const socket = await open(path, issued.ticket);
  const alarm = await runInDurableObject(stub, (_instance, ctx) => ctx.storage.getAlarm());
  expect(alarm).toBe(deadline);
  const expiry = frame(socket);
  const end = closed(socket);
  await evictDurableObject(stub);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, deadline - Date.now() + 20)));
  await runDurableObjectAlarm(stub);
  expect(await expiry).toEqual({ type: 'session_expired' });
  expect((await end).code).toBe(1008);
  const fresh = await open(path, (await issue(path)).ticket);
  fresh.close();
}, 15_000);

it('replaces the oldest socket for a member and rejects gameplay frames without a mutation', async () => {
  const { path } = await room();
  const first = await open(path, (await issue(path)).ticket);
  const firstClosed = closed(first);
  const second = await open(path, (await issue(path)).ticket);
  const third = await open(path, (await issue(path)).ticket);
  expect((await firstClosed).reason).toBe('Connection replaced');
  const secondClosed = closed(second);
  second.send(JSON.stringify({ type: 'PASS', payload: {} }));
  expect((await secondClosed).reason).toBe('Use HTTPS for commands');
  const response = await worker.fetch(host + path, { headers: { 'x-pandemic-test-uid': userId } });
  expect(await response.json()).toMatchObject({ revision: 0, recentEvents: [] });
  third.close();
});

it('keeps at most eight sockets across four members during concurrent replacement', async () => {
  const { path, stub } = await room();
  const response = await worker.fetch(host + path + '/invite', { method: 'POST',
    headers: { 'x-pandemic-test-uid': userId, 'content-type': 'application/json' },
    body: JSON.stringify({ commandId: crypto.randomUUID(), expectedVersion: 0 }),
  });
  expect(response.ok).toBe(true);
  const { inviteSecret } = await response.json() as { inviteSecret: string };
  const guests = ['guest-one', 'guest-two', 'guest-three'];
  for (const uid of guests) {
    const joined = await worker.fetch(host + path + '/join', { method: 'POST',
      headers: { 'x-pandemic-test-uid': uid, 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: crypto.randomUUID(), inviteSecret }),
    });
    expect(joined.ok).toBe(true);
    await joined.json();
  }
  async function connect(uid: string) {
    const issued = await ticket(path, { uid });
    expect(issued.ok).toBe(true);
    const { ticket: value } = await issued.json() as { ticket: string };
    return open(path, value);
  }
  const all = [];
  for (const uid of [userId, ...guests]) {
    all.push(await connect(uid), await connect(uid));
  }
  const replaced = [closed(all[0]!), closed(all[1]!)];
  all.push(...await Promise.all([connect(userId), connect(userId)]));
  expect((await Promise.all(replaced)).map(event => event.reason)).toEqual(['Connection replaced', 'Connection replaced']);
  const active = await runInDurableObject(stub, (_instance, ctx) =>
    ctx.getWebSockets().filter(socket => socket.readyState === WebSocket.OPEN).length);
  expect(active).toBe(8);
  for (const socket of all) socket.close();
}, 15_000);
