import { apiError, isUuid, MAX_JSON_BYTES, parseCommandEnvelope, parseCreateRoom, parseJoinRoom, parseRotateInvite,
  PROTOCOL_VERSION, type ErrorCode } from '@pandemic/protocol';
import type { GameRoom } from './game-room';
import { allowedSocketOrigin } from './realtime-room';

export interface Env {
  FIREBASE_PROJECT_ID: string;
  BUILD_SHA?: string;
  APP_ORIGINS?: string;
  GAME_ROOMS: DurableObjectNamespace<GameRoom>;
  ASSETS?: Fetcher;
}

/** Trusted server identity. Firebase's verified exp is converted to milliseconds in T11. */
export interface RequestIdentity {
  readonly userId: string;
  readonly authExpiresAt: number;
}

const messages: Partial<Record<ErrorCode, string>> = {
  BAD_REQUEST: 'Send a valid JSON request.',
  UNAUTHENTICATED: 'Authentication required.',
  TOKEN_EXPIRED: 'The session expired.',
  INVALID_TICKET: 'Socket upgrade was denied.',
  NOT_MEMBER: 'Room access denied.',
  NOT_OWNER: 'Only the room owner can do that.',
  INVALID_INVITE: 'The invite is invalid.',
  ROOM_NOT_FOUND: 'Room not found.',
  ROOM_EXPIRED: 'Room expired.',
  ROOM_CONFLICT: 'Room ID is unavailable.',
  ROOM_FULL: 'The room is full.',
  ROOM_STARTED: 'The game has already started.',
  ROLE_TAKEN: 'That role is already selected.',
  NOT_READY: 'Players must select roles and be ready before starting.',
  ROOM_INCOMPATIBLE: 'Room data version is unsupported.',
  PROTOCOL_UNSUPPORTED: 'Command protocol version is unsupported.',
  STALE_VERSION: 'Refresh the room and choose an action again.',
  COMMAND_ID_REUSED: 'Command ID has already been used for a different request.',
  INTERNAL_ERROR: 'Room request failed.',
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function reject(code: ErrorCode, message = messages[code] ?? 'Request failed.', currentVersion?: number): Response {
  const { body, status } = apiError(code, message, code === 'INTERNAL_ERROR' || code === 'TEMPORARILY_UNAVAILABLE', currentVersion);
  return json(body, status);
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  const declaredLength = request.headers.get('content-length');
  if (contentType !== 'application/json' || !request.body
    || (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_JSON_BYTES))) return null;

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode()) as unknown;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function route(request: Request, env: Env, identity: RequestIdentity | null = null): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/health' && request.method === 'GET') {
    return json({ ok: true, buildSha: env.BUILD_SHA ?? 'local', protocolVersion: PROTOCOL_VERSION });
  }
  if (pathname !== '/api' && !pathname.startsWith('/api/')) {
    return env.ASSETS ? env.ASSETS.fetch(request) : reject('ROOM_NOT_FOUND', 'Route not found.');
  }
  const create = pathname === '/api/rooms' && request.method === 'POST';
  const roomMatch = request.method === 'GET' ? /^\/api\/rooms\/([^/]+)$/.exec(pathname) : null;
  const mutation = request.method === 'POST' ? /^\/api\/rooms\/([^/]+)\/(commands|invite|join|ws-ticket)$/.exec(pathname) : null;
  const socket = request.method === 'GET' ? /^\/api\/rooms\/([^/]+)\/ws$/.exec(pathname) : null;
  if (!create && !roomMatch && !mutation && !socket) return reject('ROOM_NOT_FOUND', 'Route not found.');
  try {
    if (socket) {
      const roomId = socket[1];
      if (!isUuid(roomId) || !allowedSocketOrigin(request, env)) return reject('INVALID_TICKET');
      return await env.GAME_ROOMS.getByName(roomId.toLowerCase()).fetch(request);
    }
    if (!identity) return reject('UNAUTHENTICATED');
    const { userId, authExpiresAt } = identity;
    if (authExpiresAt <= Date.now()) return reject('TOKEN_EXPIRED');
    if (create) {
      const body = parseCreateRoom(await readJson(request));
      if (!body.ok) return reject(body.code);
      const result = await env.GAME_ROOMS.getByName(body.value.roomId).create(body.value.roomId, userId);
      return 'code' in result ? reject(result.code) : json({ protocolVersion: PROTOCOL_VERSION, ...result });
    }
    const roomId = (roomMatch ?? mutation)?.[1];
    if (!isUuid(roomId)) return reject('BAD_REQUEST', 'Invalid room ID.');
    const stub = env.GAME_ROOMS.getByName(roomId.toLowerCase());
    if (mutation?.[2] === 'ws-ticket') {
      const origin = allowedSocketOrigin(request, env);
      if (!origin || request.body) return reject('BAD_REQUEST');
      const result = await stub.issueSocketTicket(userId, origin, authExpiresAt);
      return 'code' in result ? reject(result.code) : json(result);
    }
    if (mutation?.[2] === 'invite') {
      const body = parseRotateInvite(await readJson(request));
      if (!body.ok) return reject(body.code);
      const result = await stub.rotateInvite(userId, body.value.commandId, body.value.expectedVersion);
      return 'code' in result ? reject(result.code, undefined, result.currentVersion) : json(result);
    }
    if (mutation?.[2] === 'join') {
      const body = parseJoinRoom(await readJson(request));
      if (!body.ok) return reject(body.code);
      const result = await stub.join(userId, body.value.commandId, body.value.inviteSecret);
      return 'code' in result ? reject(result.code, undefined, result.currentVersion) : json(result);
    }
    if (mutation) {
      const body = parseCommandEnvelope(await readJson(request));
      if (!body.ok) return reject(body.code);
      const result = await stub.execute(userId, body.value);
      return 'code' in result ? reject(result.code, undefined, result.currentVersion) : json(result);
    }
    const result = await stub.read(userId);
    return 'code' in result ? reject(result.code) : json(result.snapshot);
  } catch {
    return reject('INTERNAL_ERROR');
  }
}
