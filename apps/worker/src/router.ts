import { apiError, isUuid, MAX_JSON_BYTES, parseCommandEnvelope, parseCreateRoom, parseJoinRoom, parseRotateInvite,
  PROTOCOL_VERSION, type ErrorCode } from '@pandemic/protocol';
import { sha256 } from './command-hash';
import type { CreateBudget, RateFailure } from './limits';
import type { GameRoom } from './game-room';
import { allowedSocketOrigin } from './realtime-room';

interface EdgeRateLimit {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  FIREBASE_PROJECT_ID: string;
  BUILD_SHA?: string;
  APP_ENV?: string;
  CREATE_BUDGETS?: DurableObjectNamespace<CreateBudget>;
  EDGE_ROOM_IP?: EdgeRateLimit;
  EDGE_ROOM_JOIN?: EdgeRateLimit;
  APP_ORIGINS?: string;
  GAME_ROOMS: DurableObjectNamespace<GameRoom>;
  ASSETS?: Fetcher;
}

/** Trusted server identity. Firebase's verified exp is converted to milliseconds in T11. */
export interface RequestIdentity {
  readonly userId: string;
  readonly authExpiresAt: number;
  readonly displayName?: string;
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
  TEMPORARILY_UNAVAILABLE: 'Room protection is temporarily unavailable.',
  RATE_LIMITED: 'Too many requests. Wait before trying again.',
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function reject(code: ErrorCode, message = messages[code] ?? 'Request failed.', currentVersion?: number, retryAfter?: number): Response {
  const { body, status } = apiError(code, message,
    code === 'INTERNAL_ERROR' || code === 'TEMPORARILY_UNAVAILABLE' || code === 'RATE_LIMITED', currentVersion);
  const response = json(body, status);
  if (code === 'RATE_LIMITED') response.headers.set('retry-after', String(retryAfter ?? 60));
  return response;
}

function rejectResult(result: { code: ErrorCode; currentVersion?: number; retryAfter?: number }): Response {
  return reject(result.code, undefined, result.currentVersion, result.retryAfter);
}

/** Create, join, room reads and ticket requests share one approximate per-IP budget. Commands use the room limiter. */
function edgeLimited(request: Request): boolean {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET') return /^\/api\/rooms\/[^/]+$/.test(path);
  return request.method === 'POST' && (path === '/api/rooms' || /^\/api\/rooms\/[^/]+\/(?:join|ws-ticket)$/.test(path));
}

export async function guardEdgeIp(request: Request, env: Env): Promise<Response | null> {
  if (!edgeLimited(request)) return null;
  if (!env.EDGE_ROOM_IP) return env.APP_ENV ? reject('TEMPORARILY_UNAVAILABLE') : null;
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip && !env.APP_ENV) return null;
  const key = ip && /^[0-9a-f:.]{1,45}$/i.test(ip) ? ip : 'unavailable';
  return (await env.EDGE_ROOM_IP.limit({ key })).success ? null : reject('RATE_LIMITED');
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

async function emptyBody(request: Request): Promise<boolean> {
  if (!request.body) return true;
  const reader = request.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return true;
      if (value.byteLength > 0) {
        await reader.cancel();
        return false;
      }
    }
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
}

export async function route(request: Request, env: Env,
  identity: RequestIdentity | { readonly code: 'UNAUTHENTICATED' | 'TOKEN_EXPIRED' } | null = null): Promise<Response> {
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
    if (!identity || 'code' in identity) return reject(identity?.code ?? 'UNAUTHENTICATED');
    const { userId, authExpiresAt, displayName } = identity;
    if (authExpiresAt <= Date.now()) return reject('TOKEN_EXPIRED');
    if (create) {
      const body = parseCreateRoom(await readJson(request));
      if (!body.ok) return reject(body.code);
      if (env.CREATE_BUDGETS) {
        const blocked: RateFailure | null = await env.CREATE_BUDGETS.getByName(await sha256(userId)).consume(body.value.roomId);
        if (blocked) return rejectResult(blocked);
      } else if (env.APP_ENV) return reject('TEMPORARILY_UNAVAILABLE');
      const result = await env.GAME_ROOMS.getByName(body.value.roomId).create(body.value.roomId, userId, displayName);
      return 'code' in result ? rejectResult(result) : json({ protocolVersion: PROTOCOL_VERSION, ...result });
    }
    const roomId = (roomMatch ?? mutation)?.[1];
    if (!isUuid(roomId)) return reject('BAD_REQUEST', 'Invalid room ID.');
    const stub = env.GAME_ROOMS.getByName(roomId.toLowerCase());
    if (mutation?.[2] === 'ws-ticket') {
      const origin = allowedSocketOrigin(request, env);
      if (!origin || !await emptyBody(request)) return reject('BAD_REQUEST');
      const result = await stub.issueSocketTicket(userId, origin, authExpiresAt);
      return 'code' in result ? rejectResult(result) : json(result);
    }
    if (mutation?.[2] === 'invite') {
      const body = parseRotateInvite(await readJson(request));
      if (!body.ok) return reject(body.code);
      const result = await stub.rotateInvite(userId, body.value.commandId, body.value.expectedVersion);
      return 'code' in result ? rejectResult(result) : json(result);
    }
    if (mutation?.[2] === 'join') {
      const body = parseJoinRoom(await readJson(request));
      if (!body.ok) return reject(body.code);
      if (env.EDGE_ROOM_JOIN) {
        if (!(await env.EDGE_ROOM_JOIN.limit({ key: await sha256(userId) })).success) return reject('RATE_LIMITED');
      } else if (env.APP_ENV) return reject('TEMPORARILY_UNAVAILABLE');
      const result = await stub.join(userId, body.value.commandId, body.value.inviteSecret, displayName);
      return 'code' in result ? rejectResult(result) : json(result);
    }
    if (mutation) {
      const body = parseCommandEnvelope(await readJson(request));
      if (!body.ok) return reject(body.code);
      const result = await stub.execute(userId, body.value);
      return 'code' in result ? rejectResult(result) : json(result);
    }
    const result = await stub.read(userId);
    return 'code' in result ? rejectResult(result) : json(result.snapshot);
  } catch {
    return reject('INTERNAL_ERROR');
  }
}
