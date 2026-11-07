import { DurableObject } from 'cloudflare:workers';
import { apiError, isUserId, PROTOCOL_VERSION, type ErrorCode, type PublicRoomSnapshot } from '@pandemic/protocol';
import { chargeRoom } from './limits';
import { sha256 } from './command-hash';
import type { Env } from './router';

type Ticket = { userId: string; origin: string; expiresAt: number; authExpiresAt: number };
type Attachment = { userId: string; authExpiresAt: number; connectedAt: number };
const TICKET_TTL_MS = 60_000;
const SOCKETS_PER_USER = 2;
const SOCKETS_PER_ROOM = 8;

export function allowedSocketOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('origin');
  return origin && /^https?:\/\//.test(origin)
    && env.APP_ORIGINS?.split(',').some(value => value.trim() === origin) ? origin : null;
}

function socketError(code: ErrorCode, message: string): Response {
  const { body, status } = apiError(code, message, code === 'RATE_LIMITED');
  const headers = new Headers({ 'cache-control': 'no-store' });
  if (status === 429) headers.set('retry-after', '2');
  return Response.json(body, { status, headers });
}

function attachment(socket: WebSocket): Attachment | null {
  const data = socket.deserializeAttachment() as Partial<Attachment> | null;
  if (!data || !isUserId(data.userId) || typeof data.authExpiresAt !== 'number'
    || !Number.isSafeInteger(data.authExpiresAt) || typeof data.connectedAt !== 'number') return null;
  return { userId: data.userId, authExpiresAt: data.authExpiresAt, connectedAt: data.connectedAt };
}

function close(socket: WebSocket, code: number, reason: string): void {
  try { socket.close(code, reason); } catch { /* The peer may already have closed. */ }
}

function expire(socket: WebSocket): void {
  try { socket.send(JSON.stringify({ type: 'session_expired' })); } catch { /* Already disconnected. */ }
  close(socket, 1008, 'Session expired');
}

function sendSnapshot(socket: WebSocket, snapshot: PublicRoomSnapshot): void {
  socket.send(JSON.stringify({ type: 'snapshot', protocolVersion: PROTOCOL_VERSION,
    revision: snapshot.revision, state: snapshot }));
}

export abstract class RealtimeRoom extends DurableObject<Env> {
  protected abstract readonly compatible: boolean;
  protected abstract retentionDeadline(now: number): number;
  protected abstract expireRetention(now: number): boolean;
  abstract read(userId: string): { snapshot: PublicRoomSnapshot } | { code: ErrorCode };

  async issueSocketTicket(userId: string, origin: string, authExpiresAt: number): Promise<
    { ticket: string; expiresAt: string } | { code: ErrorCode; retryAfter?: number }
  > {
    if (!Number.isSafeInteger(authExpiresAt) || authExpiresAt <= Date.now()) return { code: 'TOKEN_EXPIRED' } as const;
    const ticket = Array.from(crypto.getRandomValues(new Uint8Array(32)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    const hash = await sha256(ticket);
    const result = this.ctx.storage.transactionSync(() => {
      const access = this.read(userId);
      if ('code' in access) return access;
      const now = Date.now();
      if (authExpiresAt <= now) return { code: 'TOKEN_EXPIRED' } as const;
      const sql = this.ctx.storage.sql;
      sql.exec('DELETE FROM socket_tickets WHERE expiresAt <= ?', now);
      const pending = sql.exec<{ room: number; user: number }>(
        'SELECT count(*) AS room, count(CASE WHEN userId = ? THEN 1 END) AS user FROM socket_tickets', userId,
      ).one();
      if (pending.user >= 4 || pending.room >= 16) return { code: 'RATE_LIMITED', retryAfter: 60 } as const;
      const limited = chargeRoom(sql, 'ticket:' + userId, now, 8);
      if (limited) return limited;
      const expiresAt = Math.min(authExpiresAt, now + TICKET_TTL_MS);
      this.ctx.storage.sql.exec(`INSERT INTO socket_tickets (hash, userId, origin, expiresAt, authExpiresAt)
        VALUES (?, ?, ?, ?, ?)`, hash, userId, origin, expiresAt, authExpiresAt);
      return { ticket, expiresAt: new Date(expiresAt).toISOString() };
    });
    if (!('code' in result)) await this.scheduleExpiry();
    return result;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const origin = allowedSocketOrigin(request, this.env);
    const tickets = url.searchParams.getAll('ticket');
    const ticket = tickets[0];
    if (!this.compatible || request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket'
      || !origin || url.searchParams.size !== 1 || tickets.length !== 1 || !ticket || !/^[0-9a-f]{64}$/.test(ticket)) {
      return socketError('INVALID_TICKET', 'Socket upgrade was denied.');
    }
    const hash = await sha256(ticket);
    const accepted = this.ctx.storage.transactionSync(() => {
      const row = this.ctx.storage.sql.exec<Ticket>(
        'SELECT userId, origin, expiresAt, authExpiresAt FROM socket_tickets WHERE hash = ?', hash,
      ).toArray()[0];
      const now = Date.now();
      if (!row || row.origin !== origin || row.expiresAt <= now || row.authExpiresAt <= now) return null;
      const access = this.read(row.userId);
      if ('code' in access) return null;
      this.ctx.storage.sql.exec('DELETE FROM socket_tickets WHERE hash = ?', hash);
      return { row, snapshot: access.snapshot };
    });
    if (!accepted) return socketError('INVALID_TICKET', 'Socket upgrade was denied.');
    const { row, snapshot } = accepted;
    const now = Date.now();
    if (row.authExpiresAt <= now) return socketError('INVALID_TICKET', 'Socket upgrade was denied.');
    const active = this.activeSockets(now);
    const owned = active.filter(connection => connection.data.userId === row.userId)
      .sort((left, right) => left.data.connectedAt - right.data.connectedAt);
    const replaced = owned.slice(0, Math.max(0, owned.length - SOCKETS_PER_USER + 1));
    if (active.length - replaced.length >= SOCKETS_PER_ROOM) {
      return socketError('RATE_LIMITED', 'The room has reached its socket limit.');
    }
    for (const connection of replaced) close(connection.socket, 1008, 'Connection replaced');
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const connectedAt = Math.max(now, ...active.map(({ data }) => data.connectedAt + 1));
    server.serializeAttachment({ userId: row.userId, authExpiresAt: row.authExpiresAt, connectedAt } satisfies Attachment);
    try {
      sendSnapshot(server, snapshot);
      await this.scheduleExpiry();
      return new Response(null, { status: 101, webSocket: client });
    } catch {
      close(server, 1011, 'Socket unavailable');
      return socketError('INTERNAL_ERROR', 'Socket upgrade failed.');
    }
  }

  private activeSockets(now: number): { socket: WebSocket; data: Attachment }[] {
    const active = [];
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const data = attachment(socket);
      if (!data) close(socket, 1008, 'Invalid session');
      else if (data.authExpiresAt <= now) expire(socket);
      else active.push({ socket, data });
    }
    return active;
  }

  protected scheduleExpiry(): Promise<void> {
    const now = Date.now();
    const { next } = this.ctx.storage.sql.exec<{ next: number | null }>(
      'SELECT MIN(expiresAt) AS next FROM socket_tickets',
    ).one();
    const deadline = this.activeSockets(now).reduce(
      (earliest, { data }) => Math.min(earliest, data.authExpiresAt), Math.min(next ?? Infinity, this.retentionDeadline(now)),
    );
    // Invoke the alarm operation before yielding so later calls cannot overwrite it with stale data.
    return Number.isFinite(deadline) ? this.ctx.storage.setAlarm(Math.max(now, deadline)) : this.ctx.storage.deleteAlarm();
  }

  async alarm(): Promise<void> {
    if (!this.compatible) return;
    const now = Date.now();
    const expired = this.expireRetention(now);
    this.ctx.storage.sql.exec('DELETE FROM socket_tickets WHERE expiresAt <= ?', now);
    if (expired) {
      for (const socket of this.ctx.getWebSockets()) close(socket, 1008, 'Room expired');
    }
    await this.scheduleExpiry();
  }

  protected commandCommitted(): void {
    // A later commit can finish before this hook runs. Read the newest snapshot for each live member.
    for (const { socket, data } of this.activeSockets(Date.now())) {
      const access = this.read(data.userId);
      if ('code' in access) {
        close(socket, 1008, access.code === 'ROOM_EXPIRED' ? 'Room expired' : 'Room access ended');
        continue;
      }
      if (data.authExpiresAt <= Date.now()) {
        expire(socket);
        continue;
      }
      try { sendSnapshot(socket, access.snapshot); } catch { close(socket, 1011, 'Snapshot delivery failed'); }
    }
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    const oversized = typeof message === 'string'
      ? message.length > 4096 || new TextEncoder().encode(message).byteLength > 4096
      : message.byteLength > 4096;
    if (oversized) close(socket, 1009, 'Socket frame too large');
    else close(socket, 1008, 'Use HTTPS for commands');
  }

  webSocketClose(socket: WebSocket): void {
    close(socket, 1000, 'Closed');
  }

  webSocketError(socket: WebSocket): void {
    close(socket, 1011, 'Socket unavailable');
  }
}
