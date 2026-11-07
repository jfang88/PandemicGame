import { afterEach, expect, it, vi } from 'vitest';
import { RoomTransport } from './room-transport';

const roomId = '6bf6c615-d4f0-49ee-a252-a904a8fd9142';
const firstId = '23633dee-547c-4e7a-ac9a-77580f4c69a8';
const nextId = '4d4fe6d4-f0f9-4a8e-82c1-aa4e4b2022ca';
const pass = { type: 'PASS', payload: {} } as const;

function snapshot(revision: number) {
  return { protocolVersion: 1, roomId, revision, members: [], recentEvents: [] };
}

class TestSocket {
  onclose: WebSocket['onclose'] = null;
  onerror: WebSocket['onerror'] = null;
  onmessage: WebSocket['onmessage'] = null;
  close = vi.fn();

  receive(value: unknown) {
    this.onmessage?.call(this as unknown as WebSocket, new MessageEvent('message', { data: JSON.stringify(value) }));
  }

  snapshot(revision: number) {
    this.receive({ type: 'snapshot', protocolVersion: 1, revision, state: snapshot(revision) });
  }

  disconnect(reason: string) {
    this.onclose?.call(this as unknown as WebSocket, { reason } as CloseEvent);
  }
}

const transports: RoomTransport[] = [];
afterEach(() => { transports.splice(0).forEach(transport => transport.stop()); });

function fixture(onCommand?: (request: RequestInit, attempt: number) => Promise<Response> | Response,
  onTicket?: (attempt: number) => Response, onToken?: (attempt: number) => Promise<string>) {
  const sockets: TestSocket[] = [];
  const urls: string[] = [];
  const requests: RequestInit[] = [];
  const delays: number[] = [];
  const states: (number | undefined)[] = [];
  const tokens: boolean[] = [];
  let ticketRequests = 0;
  let snapshotRequests = 0;
  const ids = [firstId, nextId];
  const transport = new RoomTransport({
    roomId, origin: 'https://game.example',
    getIdToken: async forceRefresh => { tokens.push(forceRefresh); return onToken?.(tokens.length) ?? 'token'; },
    onChange: state => states.push(state.snapshot?.revision),
    openSocket: url => {
      urls.push(url);
      const socket = new TestSocket();
      sockets.push(socket);
      return socket;
    },
    fetch: async (input, init) => {
      const path = String(input);
      if (path.endsWith('/ws-ticket')) {
        ticketRequests++;
        return onTicket?.(ticketRequests) ?? Response.json({ ticket: ticketRequests.toString(16).padStart(64, '0') });
      }
      if (path.endsWith('/commands')) {
        requests.push(init!);
        return onCommand!(init!, requests.length);
      }
      snapshotRequests++;
      return Response.json(snapshot(5));
    },
    commandId: () => ids.shift()!,
    wait: async milliseconds => {
      delays.push(milliseconds);
      await new Promise(resolve => setTimeout(resolve, 0));
    },
    random: () => 0.75,
  });
  transports.push(transport);
  transport.start();
  return { transport, requests, sockets, urls, delays, states, tokens, getSnapshotRequests: () => snapshotRequests };
}

it('retries a lost acknowledgement with identical ID and version and ignores older snapshots', async () => {
  const client = fixture((_request, attempt) => {
    if (attempt === 1) throw new DOMException('Timed out', 'TimeoutError');
    if (attempt === 2) return Response.json({}, { status: 503 });
    client.sockets[0]!.snapshot(4);
    return Response.json({ protocolVersion: 1, commandId: firstId, acceptedVersion: 3, duplicate: true, snapshot: snapshot(3) });
  });
  await vi.waitFor(() => expect(client.sockets).toHaveLength(1));
  const socket = client.sockets[0]!;
  socket.snapshot(2);
  socket.snapshot(1);
  socket.snapshot(2);
  expect(client.states).toEqual([2]);
  expect(await client.transport.submit(pass)).toMatchObject({ ok: true, receipt: { commandId: firstId, duplicate: true } });
  expect(client.requests).toHaveLength(3);
  expect(new Set(client.requests.map(request => request.body)).size).toBe(1);
  expect(JSON.parse(client.requests[0]!.body as string)).toMatchObject({ commandId: firstId, expectedVersion: 2 });
  expect(client.transport.getState()).toMatchObject({ online: true, snapshot: { revision: 4 } });
});

it('refreshes stale state without rebasing the old command and blocks new commands while offline', async () => {
  const client = fixture((_request, attempt) => attempt === 1
    ? Response.json({ error: { code: 'STALE_VERSION', message: 'Refresh.' } }, { status: 409 })
    : Response.json({ protocolVersion: 1, commandId: nextId, acceptedVersion: 6, duplicate: false, snapshot: snapshot(6) }));
  await vi.waitFor(() => expect(client.sockets).toHaveLength(1));
  expect(await client.transport.submit(pass)).toMatchObject({ ok: false, code: 'OFFLINE' });
  client.sockets[0]!.snapshot(2);
  expect(await client.transport.submit(pass)).toMatchObject({ ok: false, code: 'STALE_VERSION' });
  expect(client.getSnapshotRequests()).toBe(1);
  expect(client.requests).toHaveLength(1);
  expect(await client.transport.submit(pass)).toMatchObject({ ok: true });
  expect(JSON.parse(client.requests[1]!.body as string)).toMatchObject({ commandId: nextId, expectedVersion: 5 });
  client.sockets[0]!.receive({ type: 'session_expired' });
  expect(await client.transport.submit(pass)).toMatchObject({ ok: false, code: 'OFFLINE' });
  expect(client.requests).toHaveLength(2);
  await vi.waitFor(() => expect(client.sockets).toHaveLength(2));
  expect(client.tokens.at(-1)).toBe(true);
  expect(client.urls[1]).not.toBe(client.urls[0]);
  expect(client.urls[1]).toMatch(/^wss:\/\/game\.example\/api\/rooms\//);
  client.sockets[1]!.snapshot(5);
  expect(client.transport.getState()).toMatchObject({ online: true, snapshot: { revision: 6 } });
});

it('bounds reconnect backoff and refreshes identity after ticket authorization fails', async () => {
  const client = fixture(undefined, attempt => Response.json({}, { status: attempt === 1 ? 401 : 503 }));
  await vi.waitFor(() => expect(client.delays.length).toBeGreaterThanOrEqual(8));
  client.transport.stop();
  expect(client.tokens.slice(0, 2)).toEqual([false, true]);
  expect(client.delays[0]).toBe(875);
  expect(Math.max(...client.delays)).toBeLessThanOrEqual(30_000);
  expect(client.sockets).toHaveLength(0);
});

it('recovers a leave receipt when socket access ends before the HTTP acknowledgement', async () => {
  const client = fixture(() => {
    client.sockets[0]!.disconnect('Room access ended');
    return Response.json({ protocolVersion: 1, commandId: firstId, acceptedVersion: 3, duplicate: false });
  });
  await vi.waitFor(() => expect(client.sockets).toHaveLength(1));
  client.sockets[0]!.snapshot(2);
  expect(await client.transport.submit({ type: 'LEAVE_LOBBY', payload: {} }))
    .toMatchObject({ ok: true, receipt: { commandId: firstId, acceptedVersion: 3 } });
  expect(client.transport.getState().online).toBe(false);
  expect(client.transport.getState()).toMatchObject({ ended: 'access-ended', snapshot: null });
});

it('does not submit an intent against a revision newer than the rendered room', async () => {
  const client = fixture();
  await vi.waitFor(() => expect(client.sockets).toHaveLength(1));
  client.sockets[0]!.snapshot(4);
  expect(await client.transport.submit(pass, 3)).toMatchObject({ ok: false, code: 'STALE_VERSION' });
  expect(client.requests).toHaveLength(0);
});

it('force-refreshes a rejected token once and submits the same command envelope', async () => {
  const client = fixture((_request, attempt) => attempt === 1
    ? Response.json({ error: { code: 'TOKEN_EXPIRED', message: 'Expired.' } }, { status: 401 })
    : Response.json({ protocolVersion: 1, commandId: firstId, acceptedVersion: 3, duplicate: true, snapshot: snapshot(3) }));
  await vi.waitFor(() => expect(client.sockets).toHaveLength(1));
  client.sockets[0]!.snapshot(2);
  expect(await client.transport.submit(pass)).toMatchObject({ ok: true, receipt: { commandId: firstId } });
  expect(client.tokens).toEqual([false, false, true]);
  expect(client.requests).toHaveLength(2);
  expect(client.requests[1]!.body).toBe(client.requests[0]!.body);
});

it('cancels a stalled token request on stop and allows a new submission after restart', async () => {
  const client = fixture(() => Response.json({
    protocolVersion: 1, commandId: nextId, acceptedVersion: 3, duplicate: false, snapshot: snapshot(3),
  }), undefined, attempt => attempt === 2 ? new Promise(() => undefined) : Promise.resolve('token'));
  await vi.waitFor(() => expect(client.sockets).toHaveLength(1));
  client.sockets[0]!.snapshot(2);
  const pending = client.transport.submit(pass);
  await vi.waitFor(() => expect(client.tokens).toHaveLength(2));
  client.transport.stop();
  expect(await pending).toMatchObject({ ok: false, code: 'OFFLINE' });
  client.transport.start();
  await vi.waitFor(() => expect(client.sockets).toHaveLength(2));
  client.sockets[1]!.snapshot(2);
  expect(await client.transport.submit(pass)).toMatchObject({ ok: true, receipt: { commandId: nextId } });
});
