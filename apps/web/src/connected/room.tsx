import { useEffect, useRef, useState } from 'react';
import { listLegalActions } from '../../../../packages/engine/src/legal-actions';
import { ROLES } from '../../../../packages/engine/src/types';
import type { PublicRoomSnapshot } from '../../../../packages/protocol/src/projection';
import { RoomTransport } from '../../../../packages/protocol/src/room-transport';
import type { AuthAdapter } from '../auth/session';
import { GameScreen } from '../local/play';
import type { GameView } from '../local/transport';
import { forgetRoom, rememberRoom, roomRequest } from './requests';
import '../local/style.css';

type Intent = Parameters<RoomTransport['submit']>[0];

function gameView(snapshot: PublicRoomSnapshot): GameView | null {
  const game = snapshot.game;
  if (!game) return null;
  const players = game.players.flatMap(player => {
    const role = snapshot.members.find(member => member.userId === player.userId)?.role;
    return role ? [{ ...player, role }] : [];
  });
  if (players.length !== game.players.length) return null;
  return { ...game, players, playerCardsRemaining: game.playerDeckCount,
    infectionCardsRemaining: game.infectionDeckCount, discardOwner: game.pendingDiscardUserId };
}

function RoomHistory({ snapshot }: { snapshot: PublicRoomSnapshot }) {
  return <section aria-labelledby="history-heading">
    <h2 id="history-heading">Recent room activity</h2>
    {snapshot.recentEvents.length ? <ol>{snapshot.recentEvents.slice(-30).map(({ revision, eventIndex, event, timestamp }) => {
      const member = 'userId' in event ? snapshot.members.find(item => item.userId === event.userId) : undefined;
      return <li key={revision + ':' + eventIndex}>
        {member ? member.displayName + ' · ' : ''}{event.type.toLowerCase().replaceAll('_', ' ')}
        {' · '}<time dateTime={timestamp}>{new Date(timestamp).toLocaleTimeString()}</time>
      </li>;
    })}</ol> : <p>No room activity yet.</p>}
  </section>;
}

export function ConnectedRoom({ auth, uid, roomId, signOut, signOutBusy, signOutError }: {
  auth: AuthAdapter; uid: string; roomId: string; signOut(): void; signOutBusy: boolean; signOutError: string;
}) {
  const path = `/api/rooms/${roomId}`;
  const transport = useRef<RoomTransport | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const accessEnded = useRef(false);
  const inviteIntent = useRef<{ commandId: string; expectedVersion: number } | null>(null);
  const inviteInput = useRef<HTMLInputElement | null>(null);
  const [snapshot, setSnapshot] = useState<PublicRoomSnapshot | null>(null);
  const [online, setOnline] = useState(false);
  const [ended, setEnded] = useState<'access-ended' | 'room-expired' | 'replaced' | 'session-expired' | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  function updateSnapshot(next: PublicRoomSnapshot) {
    setSnapshot(previous => !previous || next.revision > previous.revision ? next : previous);
  }

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const { signal } = controller;
    const client = new RoomTransport({ roomId, getIdToken: refresh => auth.getIdToken(refresh, uid),
      onChange: state => {
        if (signal.aborted) return;
        setOnline(state.online);
        setEnded(state.ended ?? null);
        if (state.ended === 'access-ended' || state.ended === 'room-expired') {
          accessEnded.current = true;
          setSnapshot(null);
          setInviteLink('');
          forgetRoom(uid, roomId);
        }
        if (state.snapshot) updateSnapshot(state.snapshot);
      },
    });
    transport.current = client;
    void (async () => {
      try {
        const response = await roomRequest(auth, uid, path, undefined, signal);
        if (signal.aborted) return;
        if (response.status === 410 || response.status === 404) {
          forgetRoom(uid, roomId);
          setEnded(response.status === 410 ? 'room-expired' : 'access-ended');
          return;
        }
        if (!response.ok) throw new Error('Room unavailable');
        const initial = await response.json() as PublicRoomSnapshot;
        if (signal.aborted) return;
        if (initial.roomId !== roomId || !initial.members.some(member => member.userId === uid)) {
          throw new Error('Room unavailable');
        }
        rememberRoom(uid, roomId);
        updateSnapshot(initial);
        client.start();
      } catch {
        if (!signal.aborted) setError('Could not open this private room. Check the invite or go back to your rooms.');
      }
    })();
    return () => { controller.abort(); client.stop(); };
  }, [auth, path, roomId, uid]);

  async function submit(intent: Intent) {
    const signal = lifetime.current?.signal;
    const client = transport.current;
    if (!signal || signal.aborted || !client || !snapshot || pending || !online) return;
    setError('');
    setPending(true);
    try {
      const result = await client.submit(intent, snapshot.revision);
      if (signal.aborted) return;
      if (!result.ok && !accessEnded.current) {
        setError(result.code === 'STALE_VERSION' ? 'The room changed. Choose an action again.' : result.message);
      } else if (result.ok && intent.type === 'LEAVE_LOBBY') {
        forgetRoom(uid, roomId);
        location.assign('/login');
      }
    } catch {
      if (!signal.aborted) setError('The room request failed. Try again after reconnecting.');
    } finally {
      if (!signal.aborted) setPending(false);
    }
  }

  async function rotateInvite() {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || !snapshot || pending || !online) return;
    const intent = inviteIntent.current ??= { commandId: crypto.randomUUID(), expectedVersion: snapshot.revision };
    setError('');
    setInviteLink('');
    setCopied(false);
    setPending(true);
    try {
      const response = await roomRequest(auth, uid, path + '/invite', intent, signal);
      const body = await response.json() as { commandId?: string; inviteSecret?: string; error?: { code?: string } };
      if (signal.aborted || accessEnded.current) return;
      if (!response.ok) {
        if (response.status < 500) inviteIntent.current = null;
        if (body.error?.code === 'STALE_VERSION') {
          const current = await roomRequest(auth, uid, path, undefined, signal);
          if (current.ok) {
            const latest = await current.json() as PublicRoomSnapshot;
            if (!signal.aborted && !accessEnded.current) updateSnapshot(latest);
          }
          if (!signal.aborted) setError('The room changed. Choose Create invite again.');
          return;
        }
        throw new Error('Invite request failed');
      }
      if (body.commandId !== intent.commandId || !body.inviteSecret) throw new Error('Invalid invite response');
      inviteIntent.current = null;
      const link = new URL(`/join/${roomId}`, location.origin);
      link.hash = new URLSearchParams({ invite: body.inviteSecret }).toString();
      setInviteLink(link.href);
    } catch {
      if (!signal.aborted) setError('Could not create an invite. Try again.');
    } finally {
      if (!signal.aborted) setPending(false);
    }
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); }
    catch { inviteInput.current?.select(); }
  }

  const canAct = online && !pending;
  const game = snapshot && gameView(snapshot);
  const banner = <header>
    <p>Signed in.</p>
    <p role="status">{online ? pending ? 'Submitting action…' : 'Connected to room'
      : ended === 'room-expired' ? 'This room expired.'
      : ended === 'access-ended' ? 'Your access to this room ended.'
      : ended === 'replaced' ? 'This connection was replaced. Reload to reconnect.'
      : ended === 'session-expired' ? 'Session expired. Reconnecting…' : 'Connecting to room… Actions unavailable.'}</p>
    <p><a href="/login">Your private rooms</a> · <button type="button" disabled={signOutBusy} onClick={signOut}>Sign out</button></p>
    {signOutError && <p role="alert">{signOutError}</p>}
  </header>;
  if (snapshot && game) {
    const choices = online ? listLegalActions({ ...game, continuation: game.discardOwner ? { userId: game.discardOwner } : null }, uid) : [];
    return <>{banner}<GameScreen game={game} choices={choices} error={error} disabled={pending} submit={intent => void submit(intent)} />
      <RoomHistory snapshot={snapshot} /></>;
  }

  const member = snapshot?.members.find(item => item.userId === uid);
  const owner = snapshot?.ownerUserId === uid;
  const ready = !!snapshot && snapshot.members.length >= 2 && snapshot.members.every(item => item.role && item.ready);
  return <main className="play-shell">
    {banner}
    <h1>Private room lobby</h1>
    {error && <p role="alert">{error}</p>}
    {snapshot && member && snapshot.lifecycle === 'LOBBY' && <>
      <h2>Players</h2>
      <ol>{snapshot.members.map(item => <li key={item.userId}>
        Seat {item.seat + 1} · {item.displayName}{item.userId === uid ? ' (you)' : ''}
        {item.userId === snapshot.ownerUserId ? ' · owner' : ''} · {item.role ?? 'no role'} · {item.ready ? 'ready' : 'not ready'}
      </li>)}</ol>
      <label>Choose role <select disabled={!canAct} value={member.role ?? ''} onChange={event => {
        const role = ROLES.find(value => value === event.target.value);
        if (role) void submit({ type: 'SELECT_ROLE', payload: { role } });
      }}>
        <option value="" disabled>Choose a role</option>
        {ROLES.map(role => <option key={role} disabled={snapshot.members.some(item => item.userId !== uid && item.role === role)}
          value={role}>{role}</option>)}
      </select></label>
      <button type="button" disabled={!canAct || !member.role} onClick={() => void submit({
        type: 'SET_READY', payload: { ready: !member.ready },
      })}>{member.ready ? 'Mark not ready' : 'Mark ready'}</button>
      {owner && <>
        <button type="button" disabled={!canAct} onClick={() => void rotateInvite()}>Create invite</button>
        {inviteLink && <div><label>Invite link <input ref={inviteInput} readOnly value={inviteLink} /></label>
          <button type="button" onClick={() => void copyInvite()}>{copied ? 'Copied' : 'Copy invite'}</button></div>}
        <button type="button" disabled={!canAct || !ready} onClick={() => void submit({ type: 'START_GAME', payload: {} })}>Start game</button>
        {!ready && <p>At least two players must select roles and be ready.</p>}
      </>}
      <button type="button" disabled={!canAct} onClick={() => void submit({ type: 'LEAVE_LOBBY', payload: {} })}>Leave room</button>
      <RoomHistory snapshot={snapshot} />
    </>}
  </main>;
}
