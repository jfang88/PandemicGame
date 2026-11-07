import { PROTOCOL_VERSION, isUuid, type CommandEnvelope } from './commands';
import type { CommandReceipt, PublicRoomSnapshot } from './projection';

type Intent<T = CommandEnvelope> = T extends CommandEnvelope ? Pick<T, 'type' | 'payload'> : never;
type Socket = Pick<WebSocket, 'onclose' | 'onerror' | 'onmessage' | 'close'>;
type Failure = { ok: false; code: string; message: string };
type Submission = Failure | { ok: true; receipt: CommandReceipt };
type ConnectionEnd = 'access-ended' | 'replaced' | 'session-expired';
type State = { readonly online: boolean; readonly snapshot: PublicRoomSnapshot | null; readonly ended?: ConnectionEnd };

interface TransportOptions {
  readonly roomId: string;
  readonly getIdToken: (forceRefresh: boolean) => Promise<string>;
  readonly onChange: (state: State) => void;
  readonly origin?: string;
  readonly fetch?: typeof fetch;
  readonly openSocket?: (url: string) => Socket;
  readonly wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  readonly random?: () => number;
  readonly commandId?: () => string;
}

const REQUEST_TIMEOUT = 10_000;
const COMMAND_ATTEMPTS = 3;
const OFFLINE: Failure = { ok: false, code: 'OFFLINE', message: 'Reconnect before choosing an action.' };
const RETRY_EXHAUSTED: Failure = { ok: false, code: 'TEMPORARILY_UNAVAILABLE',
  message: 'The command result is unknown. Wait for the room to refresh.' };

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener('abort', done, { once: true });
  });
}

export function tokenBeforeDeadline(getToken: () => Promise<string>, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    void Promise.resolve().then(getToken).then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', aborted));
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function revision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseSnapshot(value: unknown, roomId: string): PublicRoomSnapshot | null {
  const data = record(value);
  if (!data || data.protocolVersion !== PROTOCOL_VERSION || data.roomId !== roomId || !revision(data.revision)
    || !Array.isArray(data.members) || !Array.isArray(data.recentEvents)) return null;
  return value as PublicRoomSnapshot;
}

function errorFrom(body: unknown): Failure {
  const error = record(record(body)?.error);
  return error && typeof error.code === 'string' && typeof error.message === 'string'
    ? { ok: false, code: error.code, message: error.message }
    : { ok: false, code: 'INTERNAL_ERROR', message: 'The room request failed.' };
}

/** Same-origin room transport. T13 owns the connected UI and supplies Firebase's token callback. */
export class RoomTransport {
  private readonly endpoint: string;
  private readonly roomId: string;
  private readonly fetchRequest: typeof fetch;
  private readonly open: (url: string) => Socket;
  private readonly pause: NonNullable<TransportOptions['wait']>;
  private controller: AbortController | null = null;
  private forceRefresh = false;
  private submission: AbortController | null = null;
  private state: State = { online: false, snapshot: null };

  constructor(private readonly options: TransportOptions) {
    if (!isUuid(options.roomId)) throw new Error('Invalid room ID');
    this.roomId = options.roomId.toLowerCase();
    this.endpoint = new URL(`/api/rooms/${this.roomId}`, options.origin ?? location.origin).href;
    this.fetchRequest = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.open = options.openSocket ?? (url => new WebSocket(url));
    this.pause = options.wait ?? wait;
  }

  getState(): State { return this.state; }

  start(): void {
    if (this.controller) return;
    const controller = new AbortController();
    this.controller = controller;
    if (this.state.ended) this.update(false, undefined, null);
    void this.reconnect(controller.signal).catch(() => {
      if (this.controller === controller) this.stop();
    });
  }

  stop(): void {
    this.stopConnection();
    this.submission?.abort();
    this.submission = null;
  }

  private stopConnection(reason?: ConnectionEnd): void {
    const controller = this.controller;
    this.controller = null;
    controller?.abort();
    this.update(false, undefined, reason);
  }

  private update(online: boolean, snapshot?: PublicRoomSnapshot, reason?: ConnectionEnd | null): void {
    const current = this.state.snapshot;
    const ended = online || reason === null ? undefined : reason ?? this.state.ended;
    const latest = ended === 'access-ended' ? null
      : snapshot && (!current || snapshot.revision > current.revision) ? snapshot : current;
    if (online === this.state.online && latest === current && ended === this.state.ended) return;
    this.state = { online, snapshot: latest, ...(ended ? { ended } : {}) };
    this.options.onChange(this.state);
  }

  private async request(path: string, signal: AbortSignal, forceRefresh: boolean, init: RequestInit = {}) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT)]);
    const token = await tokenBeforeDeadline(() => this.options.getIdToken(forceRefresh), deadline);
    const headers = new Headers(init.headers);
    headers.set('authorization', 'Bearer ' + token);
    return this.fetchRequest(this.endpoint + path, { ...init, headers, signal: deadline });
  }

  private async reconnect(signal: AbortSignal): Promise<void> {
    let failures = 0;
    while (!signal.aborted) {
      try {
        const response = await this.request('/ws-ticket', signal, this.forceRefresh, { method: 'POST' });
        if (signal.aborted) return;
        this.forceRefresh = response.status === 401;
        if (!response.ok) throw new Error('Socket ticket request failed');
        const body = record(await response.json());
        if (typeof body?.ticket !== 'string' || !/^[0-9a-f]{64}$/.test(body.ticket)) throw new Error('Invalid socket ticket');
        if (signal.aborted) return;
        const url = new URL(this.endpoint + '/ws');
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('ticket', body.ticket);
        await this.listen(this.open(url.href), signal, () => { failures = 0; });
      } catch {
        if (!signal.aborted) this.update(false);
      }
      if (signal.aborted) return;
      const base = Math.min(15_000, 500 * 2 ** Math.min(failures++, 5));
      const jitter = (this.options.random ?? Math.random)();
      await this.pause(Math.min(30_000, Math.round(base * (1 + jitter))), signal);
    }
  }

  private listen(socket: Socket, signal: AbortSignal, connected: () => void): Promise<void> {
    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(deadline);
        signal.removeEventListener('abort', finish);
        socket.onclose = socket.onerror = socket.onmessage = null;
        socket.close();
        if (!signal.aborted) this.update(false);
        resolve();
      };
      const deadline = setTimeout(finish, REQUEST_TIMEOUT);
      signal.addEventListener('abort', finish, { once: true });
      socket.onclose = event => {
        if (event.reason === 'Connection replaced') this.stopConnection('replaced');
        else if (event.reason === 'Room access ended') this.stopConnection('access-ended');
        else {
          if (event.reason === 'Session expired') this.forceRefresh = true;
          finish();
        }
      };
      socket.onerror = finish;
      socket.onmessage = event => {
        if (signal.aborted || typeof event.data !== 'string') return;
        let message: Record<string, unknown> | null;
        try { message = record(JSON.parse(event.data)); } catch { return; }
        if (message?.type === 'session_expired') {
          this.forceRefresh = true;
          finish();
          this.update(false, undefined, 'session-expired');
          return;
        }
        if (message?.type !== 'snapshot' || message.protocolVersion !== PROTOCOL_VERSION) return;
        const snapshot = parseSnapshot(message.state, this.roomId);
        if (snapshot && snapshot.revision === message.revision) {
          clearTimeout(deadline);
          connected();
          this.update(true, snapshot);
        }
      };
    });
  }

  async submit(intent: Intent, renderedRevision?: number): Promise<Submission> {
    const connection = this.controller;
    const { online, snapshot } = this.state;
    if (!connection || connection.signal.aborted || !online || !snapshot) return OFFLINE;
    if (renderedRevision !== undefined && renderedRevision !== snapshot.revision) {
      return { ok: false, code: 'STALE_VERSION', message: 'The room changed. Choose an action again.' };
    }
    if (this.submission) return { ok: false, code: 'BUSY', message: 'A command is still being submitted.' };
    const commandId = (this.options.commandId ?? (() => crypto.randomUUID()))();
    const body = JSON.stringify({ protocolVersion: PROTOCOL_VERSION, commandId,
      expectedVersion: snapshot.revision, type: intent.type, payload: intent.payload });
    const submission = new AbortController();
    const { signal } = submission;
    this.submission = submission;
    let refreshed = false;
    let forceRefresh = false;
    try {
      for (let attempt = 0; attempt < COMMAND_ATTEMPTS; attempt++) {
        if (signal.aborted) return OFFLINE;
        try {
          const response = await this.request('/commands', signal, forceRefresh,
            { method: 'POST', headers: { 'content-type': 'application/json' }, body });
          forceRefresh = false;
          if (signal.aborted) return OFFLINE;
          if (response.status === 401 && !refreshed && attempt + 1 < COMMAND_ATTEMPTS) {
            refreshed = true;
            forceRefresh = true;
            continue;
          }
          if (response.status < 500) {
            const value: unknown = await response.json().catch(() => null);
            if (signal.aborted) return OFFLINE;
            if (!response.ok) {
              const failure = errorFrom(value);
              if (failure.code === 'STALE_VERSION') await this.refreshSnapshot(signal);
              return failure;
            }
            const ack = record(value);
            const latest = parseSnapshot(ack?.snapshot, this.roomId);
            if (!ack || ack.protocolVersion !== PROTOCOL_VERSION || ack.commandId !== commandId
              || !revision(ack.acceptedVersion) || typeof ack.duplicate !== 'boolean'
              || (latest ? latest.revision < ack.acceptedVersion : intent.type !== 'LEAVE_LOBBY')) {
              throw new Error('Invalid command receipt');
            }
            if (latest) this.update(this.state.online, latest);
            else this.stopConnection();
            return { ok: true, receipt: { protocolVersion: PROTOCOL_VERSION, commandId,
              acceptedVersion: ack.acceptedVersion, duplicate: ack.duplicate } };
          }
        } catch {
          if (signal.aborted) return OFFLINE;
        }
        if (attempt + 1 < COMMAND_ATTEMPTS) await this.pause(500 * 2 ** attempt, signal);
      }
      await this.refreshSnapshot(signal);
      return RETRY_EXHAUSTED;
    } finally {
      if (this.submission === submission) this.submission = null;
    }
  }

  private async refreshSnapshot(signal: AbortSignal): Promise<void> {
    try {
      const response = await this.request('', signal, false);
      if (!response.ok) return;
      const snapshot = parseSnapshot(await response.json(), this.roomId);
      if (snapshot && !signal.aborted) this.update(this.state.online, snapshot);
    } catch { /* The next socket snapshot can recover the state. */ }
  }
}
