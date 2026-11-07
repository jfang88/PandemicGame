import { tokenBeforeDeadline } from '../../../../packages/protocol/src/room-transport';
import type { AuthAdapter } from '../auth/session';

export async function roomRequest(auth: AuthAdapter, uid: string, path: string, body?: object, signal?: AbortSignal) {
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  const send = async (refresh: boolean) => {
    const token = await tokenBeforeDeadline(() => auth.getIdToken(refresh, uid), deadline);
    deadline.throwIfAborted();
    return fetch(path, { signal: deadline,
      headers: { authorization: 'Bearer ' + token, ...(encoded ? { 'content-type': 'application/json' } : {}) },
      ...(encoded ? { method: 'POST', body: encoded } : {}),
    });
  };
  const response = await send(false);
  return response.status === 401 ? send(true) : response;
}

const RECENT_LIMIT = 10;
const roomIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const recentKey = (uid: string) => 'pandemic:recent:' + uid;

export function recentRooms(uid: string): string[] {
  try {
    const rooms: unknown = JSON.parse(localStorage.getItem(recentKey(uid)) ?? '[]');
    return Array.isArray(rooms) ? rooms.filter((id): id is string => typeof id === 'string' && roomIdPattern.test(id))
      .slice(0, RECENT_LIMIT) : [];
  } catch { return []; }
}

export function rememberRoom(uid: string, id: string): void {
  try {
    localStorage.setItem(recentKey(uid), JSON.stringify([id, ...recentRooms(uid).filter(room => room !== id)].slice(0, RECENT_LIMIT)));
  } catch { /* Private storage can be unavailable. */ }
}

export function forgetRoom(uid: string, id: string): void {
  try { localStorage.setItem(recentKey(uid), JSON.stringify(recentRooms(uid).filter(room => room !== id))); }
  catch { /* Private storage can be unavailable. */ }
}
