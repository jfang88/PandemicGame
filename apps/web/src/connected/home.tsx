import { useEffect, useRef, useState } from 'react';
import { pastedInvitePath, type AuthAdapter } from '../auth/session';
import { recentRooms, rememberRoom, roomRequest } from './requests';

export function RoomHome({ auth, uid }: { auth: AuthAdapter; uid: string }) {
  const intent = useRef<string | null>(null);
  const generation = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    generation.current = controller;
    return () => controller.abort();
  }, []);

  async function create() {
    const signal = generation.current?.signal;
    if (!signal || pending) return;
    const roomId = intent.current ??= crypto.randomUUID();
    setPending(true);
    setError('');
    try {
      const response = await roomRequest(auth, uid, '/api/rooms', { roomId }, signal);
      if (response.status === 409) intent.current = null;
      if (!response.ok) throw new Error('Create failed');
      const body = await response.json() as { roomId?: string };
      if (signal.aborted) return;
      if (body.roomId !== roomId) throw new Error('Invalid room response');
      rememberRoom(uid, roomId);
      location.assign(`/rooms/${roomId}`);
    } catch {
      if (!signal.aborted) setError('Could not create a room. Try again.');
    } finally {
      if (!signal.aborted) setPending(false);
    }
  }

  const rooms = recentRooms(uid);
  return <section aria-labelledby="rooms-heading">
    <h2 id="rooms-heading">Private rooms</h2>
    <button type="button" disabled={pending} onClick={() => void create()}>{pending ? 'Creating room…' : 'Create room'}</button>
    <form onSubmit={event => {
      event.preventDefault();
      const path = pastedInvitePath(invite);
      if (path) location.assign(path);
      else setError('Paste a valid invite link for this site.');
    }}>
      <label>Paste an invite link <input value={invite} onChange={event => setInvite(event.target.value)} /></label>
      <button type="submit" disabled={pending || !invite.trim()}>Open invite</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {rooms.length > 0 && <><h3>Recent rooms</h3><ul>{rooms.map(id => <li key={id}>
      <a href={`/rooms/${id}`}>Room {id.slice(0, 8)}</a>
    </li>)}</ul></>}
  </section>;
}
