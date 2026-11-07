import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { applyCommand, createGame, type GameState, type LocationCardId } from '@pandemic/engine';
import { expect, it } from 'vitest';
import normalWorker, { type Env } from '../../apps/worker/src/index';

const bindings = env as Env;
const worker = (exports as unknown as { default: Fetcher }).default;
const local = 'http://127.0.0.1';
const identityHeader = 'x-pandemic-test-uid';
const owner = "Firebase|Owner'; DROP TABLE room;--";
const other = 'Firebase:Guest';

function request(path: string, uid?: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (uid !== undefined) headers.set(identityHeader, uid);
  return worker.fetch(new Request(local + path, { ...options, headers }));
}

function create(roomId: string, uid = owner) {
  return request('/api/rooms', uid, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roomId }) });
}

async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ error: { code, message: expect.any(String), retryable: false } });
}

it('creates one SQLite lobby under concurrent retries and checks membership with opaque UIDs', async () => {
  const roomId = crypto.randomUUID();
  const retries = await Promise.all([create(roomId), create(roomId.toUpperCase()), create(roomId)]);
  for (const response of retries) {
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ protocolVersion: 1, roomId, version: 0 });
  }
  await error(await create(roomId, other), 409, 'ROOM_CONFLICT');
  const read = await request(`/api/rooms/${roomId}`, owner);
  expect(read.status).toBe(200);
  expect(await read.json()).toMatchObject({ roomId, ownerUserId: owner, lifecycle: 'LOBBY', revision: 0,
    schemaVersion: 1, protocolVersion: 1, members: [{ userId: owner, seat: 0, role: null, ready: false }], game: null });
  await error(await request(`/api/rooms/${roomId}`, owner.toLowerCase()), 403, 'NOT_MEMBER');
  await error(await request(`/api/rooms/${roomId}`), 401, 'UNAUTHENTICATED');
  await error(await request(`/api/rooms/${crypto.randomUUID()}`, owner), 404, 'ROOM_NOT_FOUND');
});

it('rejects malformed, oversized and spoofed creates before creating a room', async () => {
  const roomId = crypto.randomUUID();
  for (const [body, contentType] of [
    ['{', 'application/json'],
    [JSON.stringify({ roomId, userId: other }), 'application/json'],
    [JSON.stringify({ roomId }) + ' '.repeat(16 * 1024), 'application/json'],
    [JSON.stringify({ roomId }), 'text/plain'],
  ] as const) {
    await error(await request('/api/rooms', owner, { method: 'POST', body, headers: { 'content-type': contentType } }),
      400, 'BAD_REQUEST');
  }
  const streamingBody = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(JSON.stringify({ roomId })));
      controller.enqueue(encoder.encode(' '.repeat(16 * 1024)));
      controller.close();
    },
  });
  await error(await request('/api/rooms', owner, {
    method: 'POST', body: streamingBody, headers: { 'content-type': 'application/json' },
  }), 400, 'BAD_REQUEST');
  await error(await request('/api/rooms/not-a-uuid', owner), 400, 'BAD_REQUEST');
  await error(await request(`/api/rooms/${roomId}`, owner), 404, 'ROOM_NOT_FOUND');
});

function gameWithPendingDiscard(): GameState {
  const state = createGame({ players: [
    { userId: owner, role: 'medic', seat: 0 }, { userId: other, role: 'scientist', seat: 3 },
  ] }, 42);
  const [a, b, c, draw] = state.playerDeck.filter((card): card is LocationCardId => card.startsWith('p:')).slice(0, 4);
  const hand = [a!, b!, c!];
  const result = applyCommand({
    ...state, actionsRemaining: 1,
    players: [{ ...state.players[0]!, hand: [...state.players[0]!.hand, ...hand] }, state.players[1]!],
    playerDeck: [draw!, ...state.playerDeck.filter(card => card !== draw && !hand.some(id => id === card))],
  }, owner, { type: 'PASS', payload: {} });
  if (!result.ok || result.state.phase !== 'DISCARD_REQUIRED') throw new Error('Expected a discard fixture');
  return result.state;
}

it('preserves the exact game, decks, RNG and pending discard across real Durable Object eviction', async () => {
  const roomId = crypto.randomUUID();
  expect((await create(roomId)).ok).toBe(true);
  const stub = bindings.GAME_ROOMS.getByName(roomId);
  const game = gameWithPendingDiscard();
  await runInDurableObject(stub, (instance, ctx) => {
    ctx.storage.sql.exec("UPDATE members SET role = 'medic' WHERE userId = ?", owner);
    ctx.storage.sql.exec("INSERT INTO members VALUES (?, 3, 'Guest', 'scientist', 1, ?)", other, new Date().toISOString());
    ctx.storage.sql.exec('UPDATE room SET inviteHash = ?', 'hidden-invite-hash');
    instance['persistGame'](game);
  });
  const snapshot = await (await request(`/api/rooms/${roomId}`, owner)).json();
  await evictDurableObject(stub);
  const persisted = await runInDurableObject(stub, (_instance, ctx) =>
    ctx.storage.sql.exec<{ gameJson: string }>('SELECT gameJson FROM room').one().gameJson);
  expect(persisted).toBe(JSON.stringify(game));
  expect(await (await request(`/api/rooms/${roomId}`, other)).json()).toEqual(snapshot);
  expect(snapshot).toMatchObject({ revision: 1, lifecycle: 'RUNNING', game: {
    phase: 'DISCARD_REQUIRED', pendingDiscardUserId: owner, playerDeckCount: game.playerDeck.length,
  } });
  expect(JSON.stringify(snapshot)).not.toMatch(/hidden-invite-hash|"rngState"|"playerDeck"|"infectionDeck"|"drawsRemaining"/);
});

it('rejects unknown room and storage versions without rewriting them', async () => {
  const roomId = crypto.randomUUID();
  expect((await create(roomId)).ok).toBe(true);
  const stub = bindings.GAME_ROOMS.getByName(roomId);
  await runInDurableObject(stub, (_instance, ctx) => {
    ctx.storage.sql.exec('UPDATE room SET schemaVersion = ?', 99);
  });
  await error(await request(`/api/rooms/${roomId}`, owner), 503, 'ROOM_INCOMPATIBLE');
  await error(await request(`/api/rooms/${roomId}`, other), 403, 'NOT_MEMBER');
  await runInDurableObject(stub, (_instance, ctx) => {
    ctx.storage.sql.exec('UPDATE metadata SET version = ?', 99);
  });
  await evictDurableObject(stub);
  await error(await request(`/api/rooms/${roomId}`, owner), 503, 'ROOM_INCOMPATIBLE');
  await error(await request(`/api/rooms/${roomId}`, other), 403, 'NOT_MEMBER');
  await error(await create(roomId, other), 409, 'ROOM_CONFLICT');
  expect(await runInDurableObject(stub, (_instance, ctx) =>
    ctx.storage.sql.exec<{ version: number }>('SELECT version FROM metadata').one().version)).toBe(99);
});

it('serves SPA navigation and JSON API misses through the real local asset binding', async () => {
  const headers = { accept: 'text/html', 'sec-fetch-mode': 'navigate' };
  const deepLink = await request('/join/sample-deep-link', undefined, { headers });
  expect(deepLink.status).toBe(200);
  expect(deepLink.headers.get('content-type')).toContain('text/html');
  expect(await deepLink.text()).toContain('<div id="root"></div>');
  for (const path of ['/api', '/api/missing']) {
    const response = await request(path, undefined, { headers });
    expect(response.headers.get('content-type')).toContain('application/json');
    await error(response, 404, 'ROOM_NOT_FOUND');
  }
});

it('rejects the local identity on a remote hostname and in the normal Worker entry', async () => {
  const roomId = crypto.randomUUID();
  const options = { method: 'POST', headers: { [identityHeader]: owner, 'content-type': 'application/json' },
    body: JSON.stringify({ roomId }) };
  await error(await worker.fetch('https://example.com/api/rooms', options), 401, 'UNAUTHENTICATED');
  await error(await normalWorker.fetch(new Request(local + '/api/rooms', options), bindings), 401, 'UNAUTHENTICATED');
  await error(await request(`/api/rooms/${roomId}`, owner), 404, 'ROOM_NOT_FOUND');
});
