export type Provider = 'google' | 'microsoft';

export interface AuthSession {
  readonly uid: string;
}

export interface AuthAdapter {
  observe(listener: (session: AuthSession | null) => void): () => void;
  signIn(provider: Provider): Promise<void>;
  signOut(): Promise<void>;
  getIdToken(forceRefresh: boolean, expectedUid: string): Promise<string>;
}

const ROOM_PATH = /^\/(rooms|join)\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;
const INVITE = /^[A-Za-z0-9_-]{1,128}$/;
const INVITE_KEY = 'pandemic:pending-invite';
const INVITE_TTL_MS = 10 * 60_000;

export function roomPath(path: string | null) {
  const match = path && ROOM_PATH.exec(path);
  return match ? { kind: match[1]!.toLowerCase(), id: match[2]!.toLowerCase() } : null;
}

export function safeReturnPath(path: string | null): string | null {
  const room = roomPath(path);
  return room ? `/${room.kind}/${room.id}` : null;
}

export function pastedInvitePath(value: string): string | null {
  try {
    const url = new URL(value.trim(), location.origin);
    const room = roomPath(url.pathname);
    const params = new URLSearchParams(url.hash.slice(1));
    const secret = params.get('invite');
    if (url.origin !== location.origin || room?.kind !== 'join' || params.size !== 1 || !secret || !INVITE.test(secret)) {
      return null;
    }
    return `/join/${room.id}#${new URLSearchParams({ invite: secret })}`;
  } catch { return null; }
}

export interface PendingInvite {
  readonly roomId: string;
  readonly secret: string;
  readonly commandId: string;
  readonly expiresAt: number;
}

function readStoredInvite(): PendingInvite | null {
  try {
    const text = sessionStorage.getItem(INVITE_KEY);
    if (!text) return null;
    const value = JSON.parse(text) as Partial<PendingInvite> | null;
    if (value && typeof value.roomId === 'string' && roomPath('/join/' + value.roomId)
      && typeof value.secret === 'string' && INVITE.test(value.secret)
      && typeof value.commandId === 'string' && roomPath('/join/' + value.commandId)
      && typeof value.expiresAt === 'number' && value.expiresAt > Date.now()
      && value.expiresAt <= Date.now() + INVITE_TTL_MS) return value as PendingInvite;
    sessionStorage.removeItem(INVITE_KEY);
  } catch { /* Storage can be unavailable in a restricted browser session. */ }
  return null;
}

export function clearInvite(invite: PendingInvite): void {
  try {
    if (readStoredInvite()?.commandId === invite.commandId) sessionStorage.removeItem(INVITE_KEY);
  } catch { /* In-memory state is cleared by the caller. */ }
}

export function captureInvite(roomId: string): PendingInvite | null {
  if (!location.hash) {
    const stored = readStoredInvite();
    return stored?.roomId === roomId ? stored : null;
  }
  const params = new URLSearchParams(location.hash.slice(1));
  history.replaceState(history.state, '', location.pathname + location.search);
  const secret = params.get('invite');
  if (params.size !== 1 || !secret || !INVITE.test(secret)) return null;
  const value = { roomId, secret, commandId: crypto.randomUUID(), expiresAt: Date.now() + INVITE_TTL_MS };
  try { sessionStorage.setItem(INVITE_KEY, JSON.stringify(value)); } catch { /* Popup flow can still use memory. */ }
  return value;
}

export function popupMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  switch (code) {
    case 'auth/popup-blocked': return 'Your browser blocked the sign-in window. Allow popups for this site and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'The sign-in window closed. Choose a provider to try again.';
    case 'auth/account-exists-with-different-credential': return 'This account uses another sign-in provider. Sign in with the provider you originally used.';
    case 'auth/unauthorized-domain': return 'This site is not authorized for sign-in. Contact the game owner.';
    default: return 'Sign-in failed. Check your connection and try again.';
  }
}
