import { applyCommand, assertGameInvariants, BOARD_VERSION, RULES_VERSION, type GameState } from '@pandemic/engine';
import { projectRoom, PROTOCOL_VERSION, sanitizeDisplayName, type CommandAcceptance, type CommandEnvelope, type CommandReceipt,
  type ErrorCode, type InviteAcceptance, type PublicRoomSnapshot, type RoomEventData, type RoomMember } from '@pandemic/protocol';
import { commandHash, requestHash, sha256 } from './command-hash';
import { applyLobbyCommand, gameSeed, isLobbyCommand } from './lobby';
import { chargeRoom } from './limits';
import { RealtimeRoom } from './realtime-room';
import type { Env } from './router';

const SCHEMA_VERSION = 1;
const STORAGE_VERSION = 6;
const MAX_SNAPSHOT_BYTES = 64 * 1024;
const DAY_MS = 86_400_000;
const ABANDONED_RECEIPT_MS = 60_000;
type RoomRow = {
  roomId: string;
  schemaVersion: number;
  rulesVersion: string;
  boardVersion: string;
  revision: number;
  lifecycle: 'LOBBY' | 'RUNNING' | 'WON' | 'LOST' | 'EXPIRED';
  ownerUserId: string;
  expiresAt: string;
  inviteHash: string | null;
  gameJson: string | null;
};

type ReadResult = { readonly snapshot: PublicRoomSnapshot }
  | { readonly code: 'ROOM_NOT_FOUND' | 'ROOM_EXPIRED' | 'NOT_MEMBER' | 'ROOM_INCOMPATIBLE' | 'INTERNAL_ERROR' };
type CreateResult = { readonly roomId: string; readonly version: number }
  | { readonly code: 'ROOM_CONFLICT' | 'ROOM_EXPIRED' | 'ROOM_INCOMPATIBLE' };
export type ReceiptKind = 'command' | 'leave' | 'invite' | 'join';
type Receipt = { requestHash: string; acceptedRevision: number; kind: ReceiptKind; privateResult: string | null };
type EventRow = { revision: number; eventIndex: number; timestamp: string; eventJson: string };
type Failure = { readonly code: ErrorCode; readonly currentVersion?: number; readonly retryAfter?: number };
type Mutation<T> = Failure | { response: T; publish?: true };

function acceptance(commandId: string, acceptedVersion: number, duplicate: boolean): CommandReceipt {
  return { protocolVersion: PROTOCOL_VERSION, commandId, acceptedVersion, duplicate };
}

function inviteMatches(expected: string | null, actual: string): boolean {
  if (!expected || expected.length !== actual.length) return false;
  let different = 0;
  for (let index = 0; index < actual.length; index++) {
    different |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return different === 0;
}

export class GameRoom extends RealtimeRoom {
  protected compatible = false;
  /** False until a room is created here, so requests for unknown IDs leave no storage behind. */
  protected initialized = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.initialized = ctx.storage.sql.exec(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'metadata'",
      ).toArray().length > 0;
      if (!this.initialized) {
        this.compatible = true;
        return;
      }
      this.compatible = ctx.storage.transactionSync(() => this.migrateStorage());
      if (this.compatible) {
        const alarm = await ctx.storage.getAlarm();
        if (alarm === null || this.retentionDeadline(Date.now()) < alarm) await this.scheduleExpiry();
      }
    });
  }

  /** Call inside a transaction. Creates or upgrades the schema and reports whether this build can read it. */
  private migrateStorage(): boolean {
    const sql = this.ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS metadata (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL)');
    const metadata = sql.exec<{ version: number }>('SELECT version FROM metadata WHERE singleton = 1').toArray()[0];
    if (metadata?.version === STORAGE_VERSION) return true;
    if (metadata && ![1, 2, 3, 4, 5].includes(metadata.version)) return false;
    if (!metadata || metadata.version < 4) this.migrateLegacyStorage(metadata?.version);
    sql.exec('CREATE TABLE IF NOT EXISTS retirement (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), untilMs INTEGER)');
    sql.exec('CREATE TABLE IF NOT EXISTS room_limits (scope TEXT PRIMARY KEY NOT NULL, readyAt INTEGER NOT NULL)');
    sql.exec('CREATE INDEX IF NOT EXISTS room_limits_expiry ON room_limits (readyAt)');
    sql.exec(`INSERT INTO metadata (singleton, version) VALUES (1, ?)
      ON CONFLICT (singleton) DO UPDATE SET version = excluded.version`, STORAGE_VERSION);
    return true;
  }

  private migrateLegacyStorage(version: number | undefined): void {
    const sql = this.ctx.storage.sql;
    if (version === undefined) {
      sql.exec(`CREATE TABLE room (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        roomId TEXT NOT NULL, schemaVersion INTEGER NOT NULL, rulesVersion TEXT NOT NULL, boardVersion TEXT NOT NULL,
        revision INTEGER NOT NULL CHECK (revision >= 0),
        lifecycle TEXT NOT NULL CHECK (lifecycle IN ('LOBBY', 'RUNNING', 'WON', 'LOST', 'EXPIRED')),
        ownerUserId TEXT NOT NULL, createdAt TEXT NOT NULL, lastMutationAt TEXT NOT NULL, expiresAt TEXT NOT NULL,
        inviteHash TEXT, gameJson TEXT
      )`);
      sql.exec(`CREATE TABLE members (
        userId TEXT PRIMARY KEY NOT NULL, seat INTEGER UNIQUE NOT NULL CHECK (seat BETWEEN 0 AND 3),
        displayName TEXT NOT NULL, role TEXT UNIQUE CHECK (role IN ('medic', 'scientist', 'builder', 'courier')),
        ready INTEGER NOT NULL CHECK (ready IN (0, 1)), joinedAt TEXT NOT NULL
      )`);
    }
    if (version === undefined || version === 1) {
      sql.exec(`CREATE TABLE commands (
        userId TEXT NOT NULL, commandId TEXT NOT NULL, requestHash TEXT NOT NULL,
        acceptedRevision INTEGER NOT NULL CHECK (acceptedRevision > 0),
        PRIMARY KEY (userId, commandId)
      )`);
      sql.exec(`CREATE TABLE events (
        revision INTEGER NOT NULL CHECK (revision > 0), eventIndex INTEGER NOT NULL CHECK (eventIndex >= 0),
        eventJson TEXT NOT NULL, timestamp TEXT NOT NULL, PRIMARY KEY (revision, eventIndex)
      )`);
    }
    if (version !== 3) {
      sql.exec("ALTER TABLE commands ADD COLUMN kind TEXT NOT NULL DEFAULT 'command' CHECK (kind IN ('command','leave','invite','join'))");
      sql.exec('ALTER TABLE commands ADD COLUMN privateResult TEXT');
    }
    sql.exec(`CREATE TABLE IF NOT EXISTS socket_tickets (
      hash TEXT PRIMARY KEY NOT NULL, userId TEXT NOT NULL, origin TEXT NOT NULL,
      expiresAt INTEGER NOT NULL, authExpiresAt INTEGER NOT NULL
    )`);
    sql.exec('CREATE INDEX IF NOT EXISTS socket_tickets_expiry ON socket_tickets (expiresAt)');
  }

  private retirement(): { untilMs: number | null } | undefined {
    if (!this.initialized) return undefined;
    return this.ctx.storage.sql.exec<{ untilMs: number | null }>(
      'SELECT untilMs FROM retirement WHERE singleton = 1',
    ).toArray()[0];
  }

  private missingRoom(): 'ROOM_EXPIRED' | 'ROOM_NOT_FOUND' {
    const until = this.retirement()?.untilMs;
    return until != null && until > Date.now() ? 'ROOM_EXPIRED' : 'ROOM_NOT_FOUND';
  }

  private expired(room: RoomRow, now = Date.now()): boolean {
    return room.lifecycle === 'EXPIRED' || Date.parse(room.expiresAt) <= now;
  }

  protected retentionDeadline(now: number): number {
    const room = this.room();
    if (!room) return this.retirement()?.untilMs ?? Infinity;
    const deadline = Date.parse(room.expiresAt);
    if (!this.supports(room) || !Number.isFinite(deadline)) return Infinity;
    // A future game schema must stay intact for a compatible release to recover it.
    if (deadline <= now && !this.supportsStoredGame(room)) return Infinity;
    return deadline;
  }

  private supportsStoredGame(room: RoomRow): boolean {
    try {
      const game = this.loadGame(room);
      return !game || this.supports(game);
    } catch {
      return false;
    }
  }

  protected expireRetention(now: number): boolean {
    if (!this.initialized) return false;
    return this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      const room = this.room();
      if (!room) {
        sql.exec('UPDATE retirement SET untilMs = NULL WHERE untilMs <= ?', now);
        return false;
      }
      const deadline = this.retentionDeadline(now);
      if (deadline > now) return false;
      const until = deadline + 30 * DAY_MS;
      sql.exec('INSERT INTO retirement (singleton, untilMs) VALUES (1, ?)', until > now ? until : null);
      sql.exec('DELETE FROM socket_tickets');
      sql.exec('DELETE FROM room_limits');
      sql.exec('DELETE FROM commands');
      sql.exec('DELETE FROM events');
      sql.exec('DELETE FROM members');
      sql.exec('DELETE FROM room');
      return true;
    });
  }

  private room(): RoomRow | undefined {
    if (!this.initialized) return undefined;
    return this.ctx.storage.sql.exec<RoomRow>(`SELECT roomId, schemaVersion, rulesVersion, boardVersion,
      revision, lifecycle, ownerUserId, expiresAt, inviteHash, gameJson FROM room WHERE singleton = 1`).toArray()[0];
  }

  private supports(room: Pick<RoomRow, 'schemaVersion' | 'rulesVersion' | 'boardVersion'>): boolean {
    return room.schemaVersion === SCHEMA_VERSION && room.rulesVersion === RULES_VERSION && room.boardVersion === BOARD_VERSION;
  }

  private hasMember(userId: string): boolean {
    return this.ctx.storage.sql.exec('SELECT 1 FROM members WHERE userId = ?', userId).toArray().length > 0;
  }

  private mayReportIncompatibility(userId: string): boolean {
    try {
      // A future schema may no longer expose this membership layout. Deny by default.
      return this.hasMember(userId);
    } catch {
      return false;
    }
  }

  async create(roomId: string, ownerUserId: string, displayName = 'Player'): Promise<CreateResult> {
    if (!this.compatible) return { code: this.mayReportIncompatibility(ownerUserId) ? 'ROOM_INCOMPATIBLE' : 'ROOM_CONFLICT' };
    const initializing = !this.initialized;
    const result = this.ctx.storage.transactionSync<CreateResult>(() => {
      if (initializing) this.migrateStorage();
      const existing = this.room();
      if (existing) {
        if (existing.ownerUserId !== ownerUserId) return { code: 'ROOM_CONFLICT' };
        if (!this.supports(existing) || !this.supportsStoredGame(existing)) return { code: 'ROOM_INCOMPATIBLE' };
        if (this.expired(existing)) return { code: 'ROOM_EXPIRED' };
        return { roomId: existing.roomId, version: existing.revision };
      }
      const retired = this.retirement();
      if (retired) return { code: retired.untilMs != null && retired.untilMs > Date.now() ? 'ROOM_EXPIRED' : 'ROOM_CONFLICT' };
      const now = Date.now();
      const timestamp = new Date(now).toISOString();
      const sql = this.ctx.storage.sql;
      sql.exec(`INSERT INTO room
        (singleton, roomId, schemaVersion, rulesVersion, boardVersion, revision, lifecycle,
          ownerUserId, createdAt, lastMutationAt, expiresAt)
        VALUES (1, ?, ?, ?, ?, 0, 'LOBBY', ?, ?, ?, ?)`,
      roomId, SCHEMA_VERSION, RULES_VERSION, BOARD_VERSION, ownerUserId, timestamp, timestamp,
      new Date(now + 7 * DAY_MS).toISOString());
      sql.exec(`INSERT INTO members (userId, seat, displayName, role, ready, joinedAt)
        VALUES (?, 0, ?, NULL, 0, ?)`, ownerUserId, sanitizeDisplayName(displayName), timestamp);
      return { roomId, version: 0 };
    });
    // The schema committed with the room, so later requests may read it.
    this.initialized = true;
    if (!('code' in result)) await this.scheduleExpiry();
    return result;
  }

  read(userId: string): ReadResult {
    if (!this.compatible) return { code: this.mayReportIncompatibility(userId) ? 'ROOM_INCOMPATIBLE' : 'NOT_MEMBER' };
    const room = this.room();
    if (!room) return { code: this.missingRoom() };
    if (!this.hasMember(userId)) return { code: 'NOT_MEMBER' };
    if (!this.supports(room)) return { code: 'ROOM_INCOMPATIBLE' };
    try {
      const game = this.loadGame(room);
      if (game && !this.supports(game)) return { code: 'ROOM_INCOMPATIBLE' };
      if (this.expired(room)) return { code: 'ROOM_EXPIRED' };
      return { snapshot: this.snapshot(room, game) };
    } catch {
      return { code: 'INTERNAL_ERROR' };
    }
  }

  private loadGame(room: RoomRow): GameState | null {
    return room.gameJson === null ? null : JSON.parse(room.gameJson) as GameState;
  }

  private snapshot(room: RoomRow, game: GameState | null): PublicRoomSnapshot {
    const recentEvents = this.ctx.storage.sql.exec<EventRow>(
      'SELECT revision, eventIndex, timestamp, eventJson FROM events ORDER BY revision DESC, eventIndex DESC LIMIT 30',
    ).toArray().reverse().map(({ eventJson, ...metadata }) => ({ ...metadata, event: JSON.parse(eventJson) as RoomEventData }));
    const snapshot = projectRoom({ roomId: room.roomId, schemaVersion: SCHEMA_VERSION,
      rulesVersion: RULES_VERSION, boardVersion: BOARD_VERSION, revision: room.revision,
      lifecycle: room.lifecycle, ownerUserId: room.ownerUserId, members: this.members(), game, recentEvents });
    if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > MAX_SNAPSHOT_BYTES) {
      throw new Error('Public snapshot exceeds its size limit');
    }
    return snapshot;
  }

  private async commit<T>(mutate: () => Mutation<T>): Promise<T | Failure> {
    try {
      const result = this.ctx.storage.transactionSync(mutate);
      if ('code' in result) return result;
      await this.scheduleExpiry();
      await this.ctx.storage.sync();
      if (result.publish) await this.commandCommitted();
      return result.response;
    } catch {
      // A delivery error may occur after commit. The client retries with the same ID.
      return { code: 'INTERNAL_ERROR' };
    }
  }

  async execute(userId: string, command: CommandEnvelope): Promise<CommandAcceptance | CommandReceipt | Failure> {
    const hash = await commandHash(command);
    const seed = command.type === 'START_GAME' ? this.initialGameSeed() : undefined;
    return this.commit(() => this.executeTransaction(userId, command, hash, seed));
  }

  protected initialGameSeed(): number {
    return gameSeed();
  }

  private receipt(userId: string, commandId: string): Receipt | undefined {
    return this.ctx.storage.sql.exec<Receipt>(
      'SELECT requestHash, acceptedRevision, kind, privateResult FROM commands WHERE userId = ? AND commandId = ?',
      userId, commandId,
    ).toArray()[0];
  }

  private executeTransaction(userId: string, command: CommandEnvelope, hash: string,
    seed: number | undefined): Mutation<CommandAcceptance | CommandReceipt> {
    if (!this.compatible) return { code: this.mayReportIncompatibility(userId) ? 'ROOM_INCOMPATIBLE' : 'NOT_MEMBER' };
    const room = this.room();
    if (!room) return { code: this.missingRoom() };
    const now = Date.now();
    const { commandId, expectedVersion, type, payload } = command;
    if (!this.hasMember(userId)) {
      if (type === 'LEAVE_LOBBY' && this.supports(room)
        && Date.parse(room.expiresAt) > now) {
        const leave = this.receipt(userId, commandId);
        if (leave?.kind === 'leave' && leave.requestHash === hash) {
          return { response: acceptance(commandId, leave.acceptedRevision, true) };
        }
      }
      return { code: 'NOT_MEMBER' };
    }
    if (!this.supports(room)) return { code: 'ROOM_INCOMPATIBLE' };
    const game = this.loadGame(room);
    if (game && !this.supports(game)) return { code: 'ROOM_INCOMPATIBLE' };
    if (this.expired(room, now)) return { code: 'ROOM_EXPIRED' };

    const sql = this.ctx.storage.sql;
    const receipt = this.receipt(userId, commandId);
    if (receipt && receipt.kind === (type === 'LEAVE_LOBBY' ? 'leave' : 'command') && receipt.requestHash === hash) {
      const recorded = acceptance(commandId, receipt.acceptedRevision, true);
      return { response: receipt.kind === 'leave' ? recorded : { ...recorded, snapshot: this.snapshot(room, game) } };
    }
    const limited = chargeRoom(this.ctx.storage.sql, 'command:' + userId, now, 10);
    if (limited) return limited;
    if (receipt) return { code: 'COMMAND_ID_REUSED' };
    if (expectedVersion !== room.revision) return { code: 'STALE_VERSION', currentVersion: room.revision };
    const timestamp = new Date(now).toISOString();
    const revision = room.revision + 1;
    if (isLobbyCommand(command)) {
      if (room.lifecycle !== 'LOBBY') return { code: 'ROOM_STARTED' };
      const mutation = applyLobbyCommand(sql, this.members(), room.ownerUserId, userId, command, seed);
      if ('code' in mutation) return mutation;
      const ownerUserId = mutation.ownerUserId ?? room.ownerUserId;
      const lifecycle = mutation.game ? this.writeGame(mutation.game, revision, now)
        : this.writeLobby(room, revision, now, ownerUserId, mutation.abandoned);
      if (mutation.abandoned) sql.exec("UPDATE commands SET privateResult = NULL WHERE kind = 'invite'");
      this.recordEvents([mutation.event], revision, timestamp);
      const leave = type === 'LEAVE_LOBBY';
      this.recordReceipt(userId, commandId, hash, revision, leave ? 'leave' : 'command');
      const recorded = acceptance(commandId, revision, false);
      if (leave) return { response: recorded, publish: true };
      const snapshot = this.snapshot({ ...room, revision, lifecycle, ownerUserId }, mutation.game ?? null);
      return { response: { ...recorded, snapshot }, publish: true };
    }
    if (!game) return { code: 'WRONG_PHASE' };
    const transition = applyCommand(game, userId, { type, payload });
    if (!transition.ok) return { code: transition.error };

    assertGameInvariants(transition.state);
    const lifecycle = this.writeGame(transition.state, revision, now);
    this.recordEvents(transition.events, revision, timestamp);
    this.recordReceipt(userId, commandId, hash, revision);
    const snapshot = this.snapshot({ ...room, revision, lifecycle }, transition.state);
    return { response: { ...acceptance(commandId, revision, false), snapshot }, publish: true };
  }

  async rotateInvite(userId: string, commandId: string, expectedVersion: number): Promise<InviteAcceptance | Failure> {
    const inviteSecret = Array.from(crypto.getRandomValues(new Uint8Array(16)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    const [hash, inviteHash] = await Promise.all([
      requestHash({ type: 'ROTATE_INVITE', protocolVersion: PROTOCOL_VERSION, expectedVersion }),
      sha256(inviteSecret),
    ]);
    return this.commit(() => {
      if (!this.compatible) return { code: this.mayReportIncompatibility(userId) ? 'ROOM_INCOMPATIBLE' : 'NOT_MEMBER' };
      const room = this.room();
      if (!room) return { code: this.missingRoom() };
      const now = Date.now();
      if (!this.hasMember(userId)) return { code: 'NOT_MEMBER' };
      if (!this.supports(room)) return { code: 'ROOM_INCOMPATIBLE' };
      if (this.expired(room, now)) return { code: 'ROOM_EXPIRED' };
      if (room.ownerUserId !== userId) return { code: 'NOT_OWNER' };
      const receipt = this.receipt(userId, commandId);
      if (receipt?.kind === 'invite' && receipt.requestHash === hash) {
        if (!receipt.privateResult) return { code: 'INTERNAL_ERROR' };
        return { response: { ...acceptance(commandId, receipt.acceptedRevision, true), inviteSecret: receipt.privateResult } };
      }
      const limited = chargeRoom(this.ctx.storage.sql, 'command:' + userId, now, 10);
      if (limited) return limited;
      if (receipt) return { code: 'COMMAND_ID_REUSED' };
      if (expectedVersion !== room.revision) return { code: 'STALE_VERSION', currentVersion: room.revision };
      if (room.lifecycle !== 'LOBBY') return { code: 'ROOM_STARTED' };
      const revision = room.revision + 1;
      this.writeLobby(room, revision, now, room.ownerUserId, false, inviteHash);
      this.recordEvents([{ type: 'INVITE_ROTATED', userId }], revision, new Date(now).toISOString());
      this.recordReceipt(userId, commandId, hash, revision, 'invite', inviteSecret);
      return { response: { ...acceptance(commandId, revision, false), inviteSecret }, publish: true };
    });
  }

  async join(userId: string, commandId: string, inviteSecret: string, displayName = 'Player'): Promise<CommandAcceptance | Failure> {
    const [hash, inviteHash] = await Promise.all([
      requestHash({ type: 'JOIN_ROOM', protocolVersion: PROTOCOL_VERSION, inviteSecret }),
      sha256(inviteSecret),
    ]);
    return this.commit(() => {
      if (!this.compatible) return { code: this.mayReportIncompatibility(userId) ? 'ROOM_INCOMPATIBLE' : 'INVALID_INVITE' };
      const room = this.room();
      if (!room) return { code: this.missingRoom() };
      const now = Date.now();
      const isMember = this.hasMember(userId);
      if (!this.supports(room)) return { code: isMember ? 'ROOM_INCOMPATIBLE' : 'INVALID_INVITE' };
      if (this.expired(room, now)) return { code: 'ROOM_EXPIRED' };
      const receipt = this.receipt(userId, commandId);
      if (receipt) {
        if (!isMember) return { code: 'NOT_MEMBER' };
        if (receipt.kind !== 'join' || receipt.requestHash !== hash) return { code: 'COMMAND_ID_REUSED' };
        const game = this.loadGame(room);
        if (game && !this.supports(game)) return { code: 'ROOM_INCOMPATIBLE' };
        return { response: { ...acceptance(commandId, receipt.acceptedRevision, true), snapshot: this.snapshot(room, game) } };
      }
      if (!inviteMatches(room.inviteHash, inviteHash)) return { code: 'INVALID_INVITE' };
      if (room.lifecycle !== 'LOBBY') return { code: 'ROOM_STARTED' };
      if (isMember) {
        this.recordReceipt(userId, commandId, hash, room.revision, 'join');
        return { response: { ...acceptance(commandId, room.revision, false), snapshot: this.snapshot(room, null) } };
      }
      const members = this.members();
      const seat = [0, 1, 2, 3].find(candidate => !members.some(member => member.seat === candidate));
      if (seat === undefined) return { code: 'ROOM_FULL' };
      const timestamp = new Date(now).toISOString();
      const revision = room.revision + 1;
      const sql = this.ctx.storage.sql;
      sql.exec(`INSERT INTO members (userId, seat, displayName, role, ready, joinedAt)
        VALUES (?, ?, ?, NULL, 0, ?)`, userId, seat, sanitizeDisplayName(displayName), timestamp);
      sql.exec('UPDATE members SET ready = 0');
      this.writeLobby(room, revision, now, room.ownerUserId);
      this.recordEvents([{ type: 'MEMBER_JOINED', userId }], revision, timestamp);
      this.recordReceipt(userId, commandId, hash, revision, 'join');
      const snapshot = this.snapshot({ ...room, revision }, null);
      return { response: { ...acceptance(commandId, revision, false), snapshot }, publish: true };
    });
  }

  protected recordEvents(events: readonly RoomEventData[], revision: number, timestamp: string): void {
    events.forEach((event, eventIndex) => this.ctx.storage.sql.exec(
      'INSERT INTO events (revision, eventIndex, eventJson, timestamp) VALUES (?, ?, ?, ?)',
      revision, eventIndex, JSON.stringify(event), timestamp,
    ));
  }

  protected recordReceipt(userId: string, commandId: string, requestHash: string, revision: number,
    kind: ReceiptKind = 'command', privateResult: string | null = null): void {
    this.ctx.storage.sql.exec(`INSERT INTO commands (userId, commandId, requestHash, acceptedRevision, kind, privateResult)
      VALUES (?, ?, ?, ?, ?, ?)`, userId, commandId, requestHash, revision, kind, privateResult);
  }

  private writeLobby(room: RoomRow, revision: number, now: number, ownerUserId: string,
    abandoned = false, inviteHash = room.inviteHash): RoomRow['lifecycle'] {
    const lifecycle = abandoned ? 'EXPIRED' : 'LOBBY';
    this.ctx.storage.sql.exec(`UPDATE room SET ownerUserId = ?, lifecycle = ?, inviteHash = ?, revision = ?,
      lastMutationAt = ?, expiresAt = ? WHERE singleton = 1`, ownerUserId, lifecycle, abandoned ? null : inviteHash,
    revision, new Date(now).toISOString(), new Date(now + (abandoned ? ABANDONED_RECEIPT_MS : 7 * DAY_MS)).toISOString());
    return lifecycle;
  }

  private writeGame(game: GameState, revision: number, now: number): RoomRow['lifecycle'] {
    const lifecycle = game.phase === 'WON' || game.phase === 'LOST' ? game.phase : 'RUNNING';
    this.ctx.storage.sql.exec(`UPDATE room SET gameJson = ?, lifecycle = ?, revision = ?,
      lastMutationAt = ?, expiresAt = ? WHERE singleton = 1`, JSON.stringify(game), lifecycle, revision,
    new Date(now).toISOString(), new Date(now + 30 * DAY_MS).toISOString());
    return lifecycle;
  }

  private members(): RoomMember[] {
    return this.ctx.storage.sql.exec<Omit<RoomMember, 'ready'> & { ready: number }>(
      'SELECT userId, seat, displayName, role, ready FROM members ORDER BY seat',
    ).toArray().map(({ ready, ...member }) => ({ ...member, ready: ready === 1 }));
  }

  /** Trusted room code only. There is no HTTP endpoint for submitting a snapshot. */
  protected async persistGame(game: GameState): Promise<void> {
    assertGameInvariants(game);
    this.ctx.storage.transactionSync(() => {
      const room = this.compatible && this.room();
      if (!room || !this.supports(room) || this.expired(room)) throw new Error('Room data is unavailable');
      const members = this.members();
      if (members.length !== game.players.length || members.some((member, index) => {
        const player = game.players[index]!;
        return member.userId !== player.userId || member.seat !== player.seat || member.role !== player.role;
      })) throw new Error('Game roster differs from room membership');
      this.writeGame(game, room.revision + 1, Date.now());
    });
    await this.scheduleExpiry();
  }
}
