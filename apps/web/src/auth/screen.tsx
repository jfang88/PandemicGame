import { useEffect, useRef, useState } from 'react';
import { captureInvite, clearInvite, popupMessage, roomPath, safeReturnPath,
  type AuthAdapter, type AuthSession, type PendingInvite, type Provider } from './session';

export function AuthScreen({ auth }: { auth: AuthAdapter }) {
  const room = roomPath(location.pathname);
  const returnPath = safeReturnPath(new URLSearchParams(location.search).get('returnTo'));
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);
  const [invite, setInvite] = useState<PendingInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const capturedRoom = useRef<string | null>(null);
  const activeUid = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.observe(user => {
      activeUid.current = user?.uid ?? null;
      setSession(user);
    });
    return () => { activeUid.current = null; unsubscribe(); };
  }, [auth]);
  useEffect(() => {
    if (room?.kind === 'join' && capturedRoom.current !== room.id) {
      capturedRoom.current = room.id;
      setInvite(captureInvite(room.id));
    }
  }, [room?.kind, room?.id]);
  useEffect(() => {
    if (session && location.pathname === '/login' && returnPath) location.replace(returnPath);
  }, [session, returnPath]);
  useEffect(() => {
    if (!invite) return;
    const timeout = setTimeout(() => {
      clearInvite(invite);
      setInvite(null);
      setMessage('This invite expired. Ask the owner for a new one.');
    }, Math.max(0, invite.expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [invite]);

  async function signIn(provider: Provider) {
    setBusy(true);
    setMessage('');
    try { await auth.signIn(provider); } catch (error) { setMessage(popupMessage(error)); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    setMessage('');
    try { await auth.signOut(); } catch { setMessage('Sign-out failed. Try again.'); }
    finally { setBusy(false); }
  }

  async function join() {
    if (!session || !invite || invite.expiresAt <= Date.now()) return;
    const { uid } = session;
    setBusy(true);
    setMessage('');
    const body = JSON.stringify({ commandId: invite.commandId, inviteSecret: invite.secret });
    try {
      const submit = async (forceRefresh: boolean) => {
        const token = await auth.getIdToken(forceRefresh, uid);
        if (activeUid.current !== uid || invite.expiresAt <= Date.now()) throw new Error('Invite or session expired');
        return fetch(`/api/rooms/${invite.roomId}/join`, { method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body });
      };
      let response = await submit(false);
      if (response.status === 401) response = await submit(true);
      if (!response.ok) throw new Error('Join rejected');
      const receipt = await response.json() as { commandId?: string; snapshot?: { roomId?: string } };
      if (receipt.commandId !== invite.commandId || receipt.snapshot?.roomId !== invite.roomId) throw new Error('Invalid receipt');
      clearInvite(invite);
      setInvite(null);
      if (activeUid.current === uid) location.replace(`/rooms/${invite.roomId}`);
    } catch {
      if (activeUid.current === uid) setMessage('Could not join this room. Try again or ask the owner for a fresh invite.');
      else if (activeUid.current) setMessage('The account changed. Confirm the invite again to join with this account.');
    } finally {
      setBusy(false);
    }
  }

  function cancelInvite() {
    if (invite) clearInvite(invite);
    setInvite(null);
    location.replace('/');
  }

  return <main>
    <p className="eyebrow">PRIVATE CO-OP GAME</p>
    <h1>{room?.kind === 'join' ? 'Join a private room' : 'PandemicGame sign-in'}</h1>
    {session === undefined ? <p role="status">Checking your session…</p> : session ? <>
      <p role="status">Signed in.</p>
      {room?.kind === 'join' && (invite
        ? <button disabled={busy} onClick={() => void join()}>Join room</button>
        : <p>Open an invite link from the room owner to join.</p>)}
      <button disabled={busy} onClick={() => void signOut()}>Sign out</button>
    </> : <>
      <p>Choose a sign-in provider. Your account is used to identify you in private rooms.</p>
      <button disabled={busy} onClick={() => void signIn('google')}>Sign in with Google</button>
      <button disabled={busy} onClick={() => void signIn('microsoft')}>Sign in with Microsoft</button>
    </>}
    {room?.kind === 'join' && <button disabled={busy} onClick={cancelInvite}>Cancel invite</button>}
    {message && <p role="alert">{message}</p>}
    <p><a href="/">Back to PandemicGame</a></p>
  </main>;
}
