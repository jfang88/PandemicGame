import { apiError, isUuid, MAX_JSON_BYTES, parseCreateRoom, PROTOCOL_VERSION, type ErrorCode } from '@pandemic/protocol';
import type { GameRoom } from './game-room';

export interface Env {
  FIREBASE_PROJECT_ID: string;
  BUILD_SHA?: string;
  GAME_ROOMS: DurableObjectNamespace<GameRoom>;
  ASSETS?: Fetcher;
}

const messages: Partial<Record<ErrorCode, string>> = {
  BAD_REQUEST: 'Send a valid JSON request.',
  UNAUTHENTICATED: 'Authentication required.',
  NOT_MEMBER: 'Room access denied.',
  ROOM_NOT_FOUND: 'Room not found.',
  ROOM_EXPIRED: 'Room expired.',
  ROOM_CONFLICT: 'Room ID is unavailable.',
  ROOM_INCOMPATIBLE: 'Room data version is unsupported.',
  INTERNAL_ERROR: 'Room request failed.',
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function reject(code: ErrorCode, message = messages[code] ?? 'Request failed.'): Response {
  const { body, status } = apiError(code, message);
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

export async function route(request: Request, env: Env, userId: string | null = null): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/health' && request.method === 'GET') {
    return json({ ok: true, buildSha: env.BUILD_SHA ?? 'local', protocolVersion: PROTOCOL_VERSION });
  }
  if (pathname !== '/api' && !pathname.startsWith('/api/')) {
    return env.ASSETS ? env.ASSETS.fetch(request) : reject('ROOM_NOT_FOUND', 'Route not found.');
  }
  const create = pathname === '/api/rooms' && request.method === 'POST';
  const roomMatch = request.method === 'GET' && /^\/api\/rooms\/([^/]+)$/.exec(pathname);
  if (!create && !roomMatch) return reject('ROOM_NOT_FOUND', 'Route not found.');
  if (!userId) return reject('UNAUTHENTICATED');
  try {
    if (create) {
      const body = parseCreateRoom(await readJson(request));
      if (!body.ok) return reject(body.code);
      const result = await env.GAME_ROOMS.getByName(body.value.roomId).create(body.value.roomId, userId);
      return 'code' in result ? reject(result.code) : json({ protocolVersion: PROTOCOL_VERSION, ...result });
    }
    const roomId = roomMatch && roomMatch[1];
    if (!isUuid(roomId)) return reject('BAD_REQUEST', 'Invalid room ID.');
    const result = await env.GAME_ROOMS.getByName(roomId.toLowerCase()).read(userId);
    return 'code' in result ? reject(result.code) : json(result.snapshot);
  } catch {
    return reject('INTERNAL_ERROR');
  }
}
