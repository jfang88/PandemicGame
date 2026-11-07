import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import type { CommandAcceptance, InviteAcceptance, PublicRoomSnapshot } from '@pandemic/protocol';
import { expect, it } from 'vitest';
import normalWorker, { type Env } from '../../apps/worker/src/index';
import type { GameRoom as LocalRoom } from '../../apps/worker/src/local-test';

const bindings = env as Env;
const worker = (exports as unknown as { default: Fetcher }).default;
const origin = 'http://127.0.0.1';
const owner = 'Firebase:Owner';
const guest = 'Firebase:Guest';

function call(path: string, userId: string, body?: unknown) {
  const headers = { 'x-pandemic-test-uid': userId, 'content-type': 'application/json' };
  return worker.fetch(new Request(origin + path, body === undefined ? { headers } :
    { method: 'POST', headers, body: JSON.stringify(body) }));
}

async function success<T>(response: Response): Promise<T> {
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return response.json() as Promise<T>;
}

async function rejects(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ error: { code } });
}

function command(expectedVersion: number, type: string, payload: object = {}) {
  return { commandId: crypto.randomUUID(), protocolVersion: 1, expectedVersion, type, payload };
}

async function createRoom() {
  const id = crypto.randomUUID();
  await success(await call('/api/rooms', owner, { roomId: id }));
  const path = `/api/rooms/${id}`;
  return {
    stub: bindings.GAME_ROOMS.getByName(id),
    snapshot: async (userId = owner) => success<PublicRoomSnapshot>(await call(path, userId)),
    read: (userId: string) => call(path, userId),
    rotate: (body: { commandId: string; expectedVersion: number }, userId = owner) => call(path + '/invite', userId, body),
    join: (userId: string, inviteSecret: string, commandId = crypto.randomUUID()) =>
      call(path + '/join', userId, { commandId, inviteSecret }),
    submit: (userId: string, body: ReturnType<typeof command>) => call(path + '/commands', userId, body),
  };
}

async function invite(room: Awaited<ReturnType<typeof createRoom>>, expectedVersion = 0) {
  return success<InviteAcceptance>(await room.rotate({ commandId: crypto.randomUUID(), expectedVersion }));
}

it('keeps private invite receipts owner-only and never reactivates an old invite on retry', async () => {
  const room = await createRoom();
  const first = { commandId: crypto.randomUUID(), expectedVersion: 0 };
  const original = await success<InviteAcceptance>(await room.rotate(first));
  expect(original.inviteSecret).toMatch(/^[0-9a-f]{32}$/);
  const joinId = crypto.randomUUID();
  await success(await room.join(guest, original.inviteSecret, joinId));
  await rejects(await room.rotate({ commandId: crypto.randomUUID(), expectedVersion: 2 }, guest), 403, 'NOT_OWNER');
  await rejects(await room.rotate(first, 'outsider'), 403, 'NOT_MEMBER');
  const current = await invite(room, 2);
  expect(current.inviteSecret).not.toBe(original.inviteSecret);
  await evictDurableObject(room.stub);
  expect(await success(await room.rotate(first))).toEqual({ ...original, duplicate: true });
  await rejects(await room.rotate({ ...first, expectedVersion: 3 }), 409, 'COMMAND_ID_REUSED');
  await rejects(await room.submit(owner, { ...command(3, 'SELECT_ROLE', { role: 'medic' }),
    commandId: first.commandId }), 409, 'COMMAND_ID_REUSED');
  await rejects(await room.join('outsider', original.inviteSecret), 403, 'INVALID_INVITE');
  const retriedJoin = await success<CommandAcceptance>(await room.join(guest, original.inviteSecret, joinId));
  expect(retriedJoin).toMatchObject({ duplicate: true, acceptedVersion: 2, snapshot: { revision: 3 } });
  const joined = await success<CommandAcceptance>(await room.join('new-member', current.inviteSecret));
  const wire = JSON.stringify(joined);
  expect(wire).not.toContain(original.inviteSecret);
  expect(wire).not.toContain(current.inviteSecret);
  expect(wire).not.toMatch(/inviteHash|privateResult|requestHash/);
  const stored = await runInDurableObject(room.stub, (_instance, ctx) => ({
    hash: ctx.storage.sql.exec<{ inviteHash: string }>('SELECT inviteHash FROM room').one().inviteHash,
    events: ctx.storage.sql.exec('SELECT eventJson FROM events').toArray(),
  }));
  expect(stored.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(stored.events)).not.toContain(current.inviteSecret);
});

it('admits a repeated identity once and serializes the race for the final seat', async () => {
  const room = await createRoom();
  const { inviteSecret } = await invite(room);
  const repeated = await Promise.all([room.join(guest, inviteSecret), room.join(guest, inviteSecret)]);
  for (const response of repeated) {
    expect(await success(response)).toMatchObject({ acceptedVersion: 2 });
  }
  await success(await room.join('third', inviteSecret));
  const contenders = await Promise.all([room.join('fourth-a', inviteSecret), room.join('fourth-b', inviteSecret)]);
  expect(contenders.map(response => response.status).sort()).toEqual([200, 409]);
  await rejects(contenders.find(response => response.status === 409)!, 409, 'ROOM_FULL');
  const state = await room.snapshot();
  expect(state.revision).toBe(4);
  expect(state.members.map(member => member.seat)).toEqual([0, 1, 2, 3]);
  expect(state.members.filter(member => member.userId === guest)).toHaveLength(1);
});

it('serializes role choices and clears readiness on role change and membership changes', async () => {
  const room = await createRoom();
  const { inviteSecret } = await invite(room);
  await success(await room.join(guest, inviteSecret));
  const users = [owner, guest];
  const race = await Promise.all(users.map(userId => room.submit(userId, command(2, 'SELECT_ROLE', { role: 'medic' }))));
  expect(race.map(response => response.status).sort()).toEqual([200, 409]);
  const loser = users[race.findIndex(response => response.status === 409)]!;
  const winner = users.find(userId => userId !== loser)!;
  await rejects(race.find(response => response.status === 409)!, 409, 'STALE_VERSION');
  await rejects(await room.submit(loser, command(3, 'SELECT_ROLE', { role: 'medic' })), 409, 'ROLE_TAKEN');
  await rejects(await room.submit(loser, command(3, 'SET_READY', { ready: true })), 409, 'NOT_READY');
  await success(await room.submit(loser, command(3, 'SELECT_ROLE', { role: 'scientist' })));
  await success(await room.submit(winner, command(4, 'SET_READY', { ready: true })));
  await success(await room.submit(loser, command(5, 'SET_READY', { ready: true })));
  await success(await room.submit(loser, command(6, 'SELECT_ROLE', { role: 'courier' })));
  const changed = await room.snapshot();
  expect(changed.members.find(member => member.userId === loser)?.ready).toBe(false);
  expect(changed.members.find(member => member.userId === winner)?.ready).toBe(true);
  await success(await room.join('third', inviteSecret));
  expect((await room.snapshot()).members.every(member => !member.ready)).toBe(true);
});

async function readyRoom() {
  const room = await createRoom();
  const { inviteSecret } = await invite(room);
  await success(await room.join(guest, inviteSecret));
  await rejects(await room.submit(owner, command(2, 'START_GAME')), 409, 'NOT_READY');
  await rejects(await room.submit(guest, command(2, 'START_GAME')), 403, 'NOT_OWNER');
  await success(await room.submit(owner, command(2, 'SELECT_ROLE', { role: 'medic' })));
  await success(await room.submit(guest, command(3, 'SELECT_ROLE', { role: 'scientist' })));
  await success(await room.submit(owner, command(4, 'SET_READY', { ready: true })));
  await success(await room.submit(guest, command(5, 'SET_READY', { ready: true })));
  return { room, inviteSecret };
}

it('starts once with a ready roster, freezes membership and replays the original start', async () => {
  const { room, inviteSecret } = await readyRoom();
  const start = command(6, 'START_GAME');
  const started = await success<CommandAcceptance>(await room.submit(owner, start));
  expect(started).toMatchObject({ acceptedVersion: 7, duplicate: false,
    snapshot: { lifecycle: 'RUNNING', game: { phase: 'ACTIONS', activeSeat: 0, actionsRemaining: 4 } } });
  expect(started.snapshot.game?.players.map(player => [player.userId, player.seat, player.hand.length]))
    .toEqual([[owner, 0, 4], [guest, 1, 4]]);
  await evictDurableObject(room.stub);
  expect(await success(await room.submit(owner, start))).toEqual({ ...started, duplicate: true });
  await rejects(await room.join('late', inviteSecret), 409, 'ROOM_STARTED');
  await rejects(await room.submit(guest, command(7, 'LEAVE_LOBBY')), 409, 'ROOM_STARTED');
  expect(await room.snapshot()).toEqual(started.snapshot);
});

it('transfers ownership and gives a departed member only the exact leave receipt after eviction', async () => {
  const { room } = await readyRoom();
  const leave = command(6, 'LEAVE_LOBBY');
  const first = await success(await room.submit(owner, leave));
  expect(first).toEqual({ protocolVersion: 1, commandId: leave.commandId, acceptedVersion: 7, duplicate: false });
  await evictDurableObject(room.stub);
  expect(await success(await room.submit(owner, leave))).toEqual({
    protocolVersion: 1, commandId: leave.commandId, acceptedVersion: 7, duplicate: true,
  });
  await rejects(await room.submit(owner, { ...leave, expectedVersion: 7 }), 403, 'NOT_MEMBER');
  await rejects(await room.read(owner), 403, 'NOT_MEMBER');
  await rejects(await room.rotate({ commandId: crypto.randomUUID(), expectedVersion: 7 }, owner), 403, 'NOT_MEMBER');
  const lobby = await room.snapshot(guest);
  expect(lobby).toMatchObject({ ownerUserId: guest, revision: 7,
    members: [{ userId: guest, seat: 1, role: 'scientist', ready: false }] });
  const last = command(7, 'LEAVE_LOBBY');
  await runInDurableObject(room.stub, instance => (instance as LocalRoom)['failNextCommand']('after-commit'));
  await rejects(await room.submit(guest, last), 500, 'INTERNAL_ERROR');
  await evictDurableObject(room.stub);
  expect(await success(await room.submit(guest, last))).toMatchObject({ duplicate: true, acceptedVersion: 8 });
  const expired = await runInDurableObject(room.stub, (_instance, ctx) => ({
    row: ctx.storage.sql.exec('SELECT lifecycle, inviteHash FROM room').one(),
    inviteReceipts: ctx.storage.sql.exec("SELECT privateResult FROM commands WHERE kind = 'invite'").toArray(),
  }));
  expect(expired.row).toEqual({ lifecycle: 'EXPIRED', inviteHash: null });
  expect(expired.inviteReceipts).toEqual([{ privateResult: null }]);
});

it('serializes owner leave versus game start at the same revision', async () => {
  const { room } = await readyRoom();
  const [left, started] = await Promise.all([
    room.submit(owner, command(6, 'LEAVE_LOBBY')), room.submit(owner, command(6, 'START_GAME')),
  ]);
  expect([left, started].filter(response => response.status === 200)).toHaveLength(1);
  const snapshot = await room.snapshot(guest);
  expect(snapshot.revision).toBe(7);
  if (left.ok) {
    await rejects(started, 403, 'NOT_MEMBER');
    expect(snapshot).toMatchObject({ lifecycle: 'LOBBY', ownerUserId: guest });
  } else {
    await rejects(left, 409, 'STALE_VERSION');
    expect(snapshot).toMatchObject({ lifecycle: 'RUNNING', ownerUserId: owner });
  }
});

it('keeps missing joins logical and rejects spoofed identities in the normal Worker', async () => {
  const id = crypto.randomUUID();
  const path = `/api/rooms/${id}/join`;
  const body = { commandId: crypto.randomUUID(), inviteSecret: 'bogus' };
  await rejects(await call(path, guest, body), 404, 'ROOM_NOT_FOUND');
  const created = await success(await call('/api/rooms', owner, { roomId: id }));
  expect(created).toMatchObject({ roomId: id, version: 0 });
  await rejects(await normalWorker.fetch(new Request(origin + path, {
    method: 'POST', headers: { 'x-pandemic-test-uid': guest, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), bindings), 401, 'UNAUTHENTICATED');
});
