import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { applyCommand, createGame, type GameState, type LocationCardId } from '@pandemic/engine';
import type { CommandEnvelope } from '@pandemic/protocol';
import { expect, it } from 'vitest';
import normalWorker, { type Env } from '../../apps/worker/src/index';
import type { GameRoom as LocalRoom } from '../../apps/worker/src/local-test';

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

function newGame(): GameState {
  return createGame({ players: [
    { userId: owner, role: 'medic', seat: 0 }, { userId: other, role: 'scientist', seat: 3 },
  ] }, 42);
}

function gameReadyToPause(): GameState {
  const state = newGame();
  const [a, b, c, draw] = state.playerDeck.filter((card): card is LocationCardId => card.startsWith('p:')).slice(0, 4);
  const hand = [a!, b!, c!];
  return {
    ...state, actionsRemaining: 1,
    players: [{ ...state.players[0]!, hand: [...state.players[0]!.hand, ...hand] }, state.players[1]!],
    playerDeck: [draw!, ...state.playerDeck.filter(card => card !== draw && !hand.some(id => id === card))],
  };
}

function gameWithPendingDiscard(): GameState {
  const result = applyCommand(gameReadyToPause(), owner, { type: 'PASS', payload: {} });
  if (!result.ok || result.state.phase !== 'DISCARD_REQUIRED') throw new Error('Expected a discard fixture');
  return result.state;
}

async function roomWithGame(game: GameState) {
  const roomId = crypto.randomUUID();
  expect((await create(roomId)).ok).toBe(true);
  const stub = bindings.GAME_ROOMS.getByName(roomId);
  await runInDurableObject(stub, (instance, ctx) => {
    ctx.storage.sql.exec("UPDATE members SET role = 'medic' WHERE userId = ?", owner);
    ctx.storage.sql.exec("INSERT INTO members VALUES (?, 3, 'Guest', 'scientist', 1, ?)", other, new Date().toISOString());
    ctx.storage.sql.exec('UPDATE room SET inviteHash = ?', 'hidden-invite-hash');
    return instance['persistGame'](game);
  });
  return { roomId, stub };
}

it('preserves the exact game, decks, RNG and pending discard across real Durable Object eviction', async () => {
  const game = gameWithPendingDiscard();
  const { roomId, stub } = await roomWithGame(game);
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

function pass(expectedVersion: number): CommandEnvelope {
  return { protocolVersion: 1, commandId: crypto.randomUUID(), expectedVersion, type: 'PASS', payload: {} };
}

function submit(roomId: string, command: unknown, uid = owner) {
  return request(`/api/rooms/${roomId}/commands`, uid, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(command) });
}

async function storedRows(stub: ReturnType<Env['GAME_ROOMS']['getByName']>) {
  return runInDurableObject(stub, (_instance, ctx) => ({
    room: ctx.storage.sql.exec('SELECT * FROM room').one(),
    commands: ctx.storage.sql.exec('SELECT * FROM commands ORDER BY acceptedRevision').toArray(),
    events: ctx.storage.sql.exec('SELECT * FROM events ORDER BY revision, eventIndex').toArray(),
  }));
}

it('deduplicates concurrent and restarted retries, retaining acceptance and returning the latest snapshot', async () => {
  const base = newGame();
  const card = 'p:A01';
  const players = base.players.map(player => ({ ...player, hand: player.hand.filter(id => id !== card) }));
  players[0]!.hand.push(card);
  const { roomId, stub } = await roomWithGame({ ...base, players, playerDeck: base.playerDeck.filter(id => id !== card) });
  const command = { ...pass(1), type: 'GIVE_CARD', payload: { recipientUserId: other, cardId: card } };
  const reordered = { payload: { cardId: card, recipientUserId: other }, type: 'GIVE_CARD',
    expectedVersion: 1, protocolVersion: 1, commandId: command.commandId.toUpperCase() };
  const responses = await Promise.all([submit(roomId, command), submit(roomId, reordered)]);
  expect(responses.map(response => response.status)).toEqual([200, 200]);
  const results = await Promise.all(responses.map(response => response.json()));
  expect(results).toEqual(expect.arrayContaining([
    expect.objectContaining({ commandId: command.commandId, acceptedVersion: 2, duplicate: false }),
    expect.objectContaining({ commandId: command.commandId, acceptedVersion: 2, duplicate: true }),
  ]));
  expect((await storedRows(stub)).commands).toHaveLength(1);
  expect((await submit(roomId, pass(2))).status).toBe(200);
  await evictDurableObject(stub);
  const rows = await storedRows(stub);
  const replay = await submit(roomId, reordered);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({
    commandId: command.commandId, acceptedVersion: 2, duplicate: true,
    snapshot: { revision: 3, game: { actionsRemaining: 2 }, recentEvents: [
      { revision: 2, eventIndex: 0, event: { type: 'CARD_GIVEN' } },
      { revision: 2, eventIndex: 1, event: { type: 'ACTION_SPENT' } },
      { revision: 3, eventIndex: 0, event: { type: 'ACTION_PASSED' } },
      { revision: 3, eventIndex: 1, event: { type: 'ACTION_SPENT' } },
    ] },
  });
  await error(await submit(roomId, { ...command, expectedVersion: 3 }), 409, 'COMMAND_ID_REUSED');
  await error(await submit(roomId, { ...command, payload: { ...command.payload, cardId: 'p:A02' } }), 409, 'COMMAND_ID_REUSED');
  await error(await submit(roomId, command, 'outsider'), 403, 'NOT_MEMBER');
  await error(await submit(roomId, { ...pass(3), commandId: command.commandId }, other), 422, 'WRONG_TURN');
  expect(await storedRows(stub)).toEqual(rows);
});

it('accepts only one of two different commands racing at the same revision', async () => {
  const { roomId, stub } = await roomWithGame(newGame());
  const responses = await Promise.all([submit(roomId, pass(1)), submit(roomId, pass(1))]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
  const stale = responses.find(response => response.status === 409)!;
  expect(await stale.json()).toMatchObject({ currentVersion: 2, error: { code: 'STALE_VERSION', retryable: false } });
  const rows = await storedRows(stub);
  expect(rows.room.revision).toBe(2);
  expect(rows.commands).toHaveLength(1);
  expect(rows.events).toHaveLength(2);
  await error(await submit(roomId, { ...pass(2), protocolVersion: 9 }), 400, 'PROTOCOL_UNSUPPORTED');
  await error(await submit(roomId, { ...pass(2), userId: other }), 400, 'BAD_REQUEST');
  await error(await submit(roomId, { ...pass(2), type: 'MOVE', payload: { destination: 'F08' } }), 422, 'ILLEGAL_ACTION');
  expect(await storedRows(stub)).toEqual(rows);
});

it.each(['before-events', 'before-receipt', 'after-receipt'] as const)('rolls back state, events and receipts on a fault %s', async boundary => {
  const { roomId, stub } = await roomWithGame(gameReadyToPause());
  const before = await storedRows(stub);
  const command = pass(1);
  await runInDurableObject(stub, instance => (instance as LocalRoom)['failNextCommand'](boundary));
  const failed = await submit(roomId, command);
  expect(failed.status).toBe(500);
  expect(await failed.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR', retryable: true } });
  expect(await storedRows(stub)).toEqual(before);
  const visible = await (await request(`/api/rooms/${roomId}`, owner)).json();
  expect(visible).toMatchObject({ revision: 1, game: { phase: 'ACTIONS', actionsRemaining: 1 }, recentEvents: [] });
  const retry = await submit(roomId, command);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toMatchObject({ acceptedVersion: 2, duplicate: false, snapshot: { revision: 2 } });
  expect((await storedRows(stub)).commands).toHaveLength(1);
});

it('persists terminal loss as an accepted command and serves its receipt after game end', async () => {
  const base = newGame();
  const locationCards = base.playerDeck.filter((card): card is LocationCardId => card.startsWith('p:'));
  const { roomId, stub } = await roomWithGame({ ...base, actionsRemaining: 1, playerDeck: [],
    playerDiscard: [...locationCards, ...base.playerDiscard], resolvedEpidemics: ['e:1', 'e:2', 'e:3', 'e:4'],
  });
  const command = pass(1);
  const accepted = await submit(roomId, command);
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toMatchObject({ acceptedVersion: 2, duplicate: false, snapshot: {
    lifecycle: 'LOST', game: { outcome: { kind: 'lost', reason: 'PLAYER_DECK_EMPTY' } },
  } });
  await evictDurableObject(stub);
  expect(await (await submit(roomId, command)).json()).toMatchObject({ acceptedVersion: 2, duplicate: true });
  await error(await submit(roomId, pass(2)), 422, 'GAME_FINISHED');
  expect((await storedRows(stub)).commands).toHaveLength(1);
});

it('recovers a committed command after a delivery failure and restart during discard', async () => {
  const base = gameReadyToPause();
  const { roomId, stub } = await roomWithGame(base);
  const command = pass(1);
  await runInDurableObject(stub, instance => (instance as LocalRoom)['failNextCommand']('after-commit'));
  const failed = await submit(roomId, command);
  expect(failed.status).toBe(500);
  expect(await failed.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR', retryable: true } });
  const expected = applyCommand(base, owner, { type: 'PASS', payload: {} });
  expect(expected.ok).toBe(true);
  await evictDurableObject(stub);
  const committed = await storedRows(stub);
  expect(committed.room.gameJson).toBe(JSON.stringify(expected.state));
  expect(committed.commands).toHaveLength(1);
  expect(committed.events).toHaveLength(expected.events.length);
  const retry = await submit(roomId, command);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toMatchObject({ duplicate: true, acceptedVersion: 2, snapshot: {
    revision: 2, game: { phase: 'DISCARD_REQUIRED', pendingDiscardUserId: owner },
  } });
  expect(await storedRows(stub)).toEqual(committed);
  const cardIds = [expected.state.players[0]!.hand.at(-1)!];
  const discard = { type: 'DISCARD', payload: { cardIds } } as const;
  const afterDiscard = applyCommand(expected.state, owner, discard);
  expect(afterDiscard.ok).toBe(true);
  const resumed = await submit(roomId, { ...pass(2), ...discard });
  expect(resumed.status).toBe(200);
  expect((await storedRows(stub)).room.gameJson).toBe(JSON.stringify(afterDiscard.state));
});

it('migrates a T07 v1 database without rebuilding the room or its decks', async () => {
  const { roomId, stub } = await roomWithGame(newGame());
  const original = await storedRows(stub);
  await runInDurableObject(stub, (_instance, ctx) => ctx.storage.transactionSync(() => {
    ctx.storage.sql.exec('DROP TABLE commands');
    ctx.storage.sql.exec('DROP TABLE events');
    ctx.storage.sql.exec('DROP TABLE retirement');
    ctx.storage.sql.exec('UPDATE metadata SET version = 1 WHERE singleton = 1');
  }));
  await evictDurableObject(stub);
  expect(await storedRows(stub)).toEqual(original);
  expect((await submit(roomId, pass(1))).status).toBe(200);
});

it('migrates T08 v2 receipts and still deduplicates the original command', async () => {
  const { roomId, stub } = await roomWithGame(newGame());
  const command = pass(1);
  expect((await submit(roomId, command)).status).toBe(200);
  await runInDurableObject(stub, (_instance, ctx) => ctx.storage.transactionSync(() => {
    ctx.storage.sql.exec(`CREATE TABLE commands_v2 (
      userId TEXT NOT NULL, commandId TEXT NOT NULL, requestHash TEXT NOT NULL,
      acceptedRevision INTEGER NOT NULL CHECK (acceptedRevision > 0), PRIMARY KEY (userId, commandId)
    )`);
    ctx.storage.sql.exec('INSERT INTO commands_v2 SELECT userId, commandId, requestHash, acceptedRevision FROM commands');
    ctx.storage.sql.exec('DROP TABLE commands');
    ctx.storage.sql.exec('ALTER TABLE commands_v2 RENAME TO commands');
    ctx.storage.sql.exec('DROP TABLE retirement');
    ctx.storage.sql.exec('UPDATE metadata SET version = 2 WHERE singleton = 1');
  }));
  await evictDurableObject(stub);
  const before = await storedRows(stub);
  const retry = await submit(roomId, command);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toMatchObject({ acceptedVersion: 2, duplicate: true, snapshot: { revision: 2 } });
  expect(await storedRows(stub)).toEqual(before);
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
    ctx.storage.sql.exec('DROP TABLE retirement');
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
  await error(await normalWorker.fetch(new Request(local + `/api/rooms/${roomId}/commands`, {
    ...options, body: JSON.stringify(pass(0)),
  }), bindings), 401, 'UNAUTHENTICATED');
  await error(await request(`/api/rooms/${roomId}`, owner), 404, 'ROOM_NOT_FOUND');
});

it('rearms v4 storage on eviction and retires an expired room without reviving old IDs', async () => {
  const roomId = crypto.randomUUID();
  expect((await create(roomId)).ok).toBe(true);
  const stub = bindings.GAME_ROOMS.getByName(roomId);
  const path = `/api/rooms/${roomId}`;
  const expiry = new Date(Date.now() + 86_400_000).toISOString();
  await runInDurableObject(stub, async (_instance, ctx) => {
    ctx.storage.sql.exec('UPDATE room SET expiresAt = ?', expiry);
    ctx.storage.sql.exec('DROP TABLE retirement');
    ctx.storage.sql.exec('UPDATE metadata SET version = 4');
    await ctx.storage.setAlarm(Date.parse(expiry) + 60_000);
  });
  await evictDurableObject(stub);
  expect((await request(path, owner)).ok).toBe(true);
  expect(await runInDurableObject(stub, (_instance, ctx) => ctx.storage.getAlarm())).toBe(Date.parse(expiry));
  expect((await create(roomId)).ok).toBe(true);
  expect(await runInDurableObject(stub, (_instance, ctx) =>
    ctx.storage.sql.exec<{ expiresAt: string }>('SELECT expiresAt FROM room').one().expiresAt)).toBe(expiry);

  await runInDurableObject(stub, (_instance, ctx) => {
    ctx.storage.sql.exec('UPDATE room SET expiresAt = ?, inviteHash = ?', new Date(Date.now() - 1).toISOString(), 'old-invite');
    ctx.storage.sql.exec("INSERT INTO commands VALUES (?, ?, 'request', 1, 'invite', 'private')", owner, crypto.randomUUID());
  });
  await error(await request(path, owner), 410, 'ROOM_EXPIRED');
  await error(await create(roomId), 410, 'ROOM_EXPIRED');
  const join = () => request(path + '/join', other, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ commandId: crypto.randomUUID(), inviteSecret: 'a'.repeat(32) }) });
  await error(await join(), 410, 'ROOM_EXPIRED');

  expect(await runDurableObjectAlarm(stub)).toBe(true);
  await evictDurableObject(stub);
  await error(await request(path, owner), 410, 'ROOM_EXPIRED');
  await error(await create(roomId), 410, 'ROOM_EXPIRED');
  await error(await join(), 410, 'ROOM_EXPIRED');
  const rows = await runInDurableObject(stub, (_instance, ctx) => ctx.storage.sql.exec(
    `SELECT (SELECT count(*) FROM room) AS rooms, (SELECT count(*) FROM members) AS members,
      (SELECT count(*) FROM commands) AS commands, (SELECT count(*) FROM events) AS events,
      (SELECT count(*) FROM socket_tickets) AS tickets`,
  ).one());
  expect(rows).toEqual({ rooms: 0, members: 0, commands: 0, events: 0, tickets: 0 });

  await runInDurableObject(stub, (_instance, ctx) => ctx.storage.sql.exec('UPDATE retirement SET untilMs = 1'));
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  await evictDurableObject(stub);
  await error(await request(path, owner), 404, 'ROOM_NOT_FOUND');
  await error(await join(), 404, 'ROOM_NOT_FOUND');
  await error(await create(roomId), 409, 'ROOM_CONFLICT');
  expect(await runInDurableObject(stub, (_instance, ctx) => ctx.storage.getAlarm())).toBeNull();
});

it('leaves the exact future-rules game intact when the retention alarm is due', async () => {
  const { roomId, stub } = await roomWithGame(gameWithPendingDiscard());
  await runInDurableObject(stub, (_instance, ctx) => {
    ctx.storage.sql.exec("UPDATE room SET gameJson = json_set(gameJson, '$.rulesVersion', 'future'), expiresAt = ?",
      new Date(Date.now() - 1).toISOString());
  });
  const before = await storedRows(stub);
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  await evictDurableObject(stub);
  expect(await storedRows(stub)).toEqual(before);
  expect((await request(`/api/rooms/${roomId}`, owner)).status).toBe(503);
  expect((await submit(roomId, pass(1))).status).toBe(503);
  expect(await runInDurableObject(stub, (_instance, ctx) => ctx.storage.getAlarm())).toBeNull();
});

it('keeps the browser fixture endpoint out of the normal Worker', async () => {
  const path = '/__test/rooms/' + crypto.randomUUID() + '/fixture';
  const response = await normalWorker.fetch(new Request(local + path, { method: 'POST',
    headers: { [identityHeader]: owner, 'content-type': 'application/json' },
    body: JSON.stringify({ scenario: 'win' }),
  }), { GAME_ROOMS: bindings.GAME_ROOMS, FIREBASE_PROJECT_ID: bindings.FIREBASE_PROJECT_ID });
  await error(response, 404, 'ROOM_NOT_FOUND');
});
