import { DurableObject } from 'cloudflare:workers';
import { applyCommand, assertGameInvariants, BOARD_VERSION, RULES_VERSION, type ActionEvent, type GameState } from '@pandemic/engine';
import { projectRoom, PROTOCOL_VERSION, type CommandAcceptance, type CommandEnvelope, type ErrorCode,
  type PublicRoomSnapshot, type RoomMember } from '@pandemic/protocol';
import { commandHash } from './command-hash';
import type { Env } from './router';

const SCHEMA_VERSION = 1;
const STORAGE_VERSION = 2;
const DAY_MS = 86_400_000;
type RoomRow = {
  roomId: string;
  schemaVersion: number;
  rulesVersion: string;
  boardVersion: string;
  revision: number;
  lifecycle: 'LOBBY' | 'RUNNING' | 'WON' | 'LOST' | 'EXPIRED';
  ownerUserId: string;
  gameJson: string | null;
};

type ReadResult = { readonly snapshot: PublicRoomSnapshot }
  | { readonly code: 'ROOM_NOT_FOUND' | 'ROOM_EXPIRED' | 'NOT_MEMBER' | 'ROOM_INCOMPATIBLE' };
type CreateResult = { readonly roomId: string; readonly version: number }
  | { readonly code: 'ROOM_CONFLICT' | 'ROOM_EXPIRED' | 'ROOM_INCOMPATIBLE' };
type Receipt = { requestHash: string; acceptedRevision: number };
type EventRow = { revision: number; eventIndex: number; timestamp: string; eventJson: string };
type CommandResult = CommandAcceptance | { readonly code: ErrorCode; readonly currentVersion?: number };

export class GameRoom extends DurableObject<Env> {
  private compatible = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.compatible = ctx.storage.transactionSync(() => {
        const sql = ctx.storage.sql;
        sql.exec('CREATE TABLE IF NOT EXISTS metadata (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL)');
        const metadata = sql.exec<{ version: number }>('SELECT version FROM metadata WHERE singleton = 1').toArray()[0];
        if (metadata?.version === STORAGE_VERSION) return true;
        if (metadata && metadata.version !== 1) return false;
        if (!metadata) {
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
        sql.exec(`CREATE TABLE commands (
          userId TEXT NOT NULL, commandId TEXT NOT NULL, requestHash TEXT NOT NULL,
          acceptedRevision INTEGER NOT NULL CHECK (acceptedRevision > 0),
          PRIMARY KEY (userId, commandId)
        )`);
        sql.exec(`CREATE TABLE events (
          revision INTEGER NOT NULL CHECK (revision > 0), eventIndex INTEGER NOT NULL CHECK (eventIndex >= 0),
          eventJson TEXT NOT NULL, timestamp TEXT NOT NULL, PRIMARY KEY (revision, eventIndex)
        )`);
        sql.exec(`INSERT INTO metadata (singleton, version) VALUES (1, ?)
          ON CONFLICT (singleton) DO UPDATE SET version = excluded.version`, STORAGE_VERSION);
        return true;
      });
    });
  }

  private room(): RoomRow | undefined {
    return this.ctx.storage.sql.exec<RoomRow>(`SELECT roomId, schemaVersion, rulesVersion, boardVersion,
      revision, lifecycle, ownerUserId, gameJson FROM room WHERE singleton = 1`).toArray()[0];
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

  create(roomId: string, ownerUserId: string): CreateResult {
    if (!this.compatible) return { code: this.mayReportIncompatibility(ownerUserId) ? 'ROOM_INCOMPATIBLE' : 'ROOM_CONFLICT' };
    return this.ctx.storage.transactionSync(() => {
      const existing = this.room();
      if (existing) {
        if (existing.ownerUserId !== ownerUserId) return { code: 'ROOM_CONFLICT' };
        if (!this.supports(existing)) return { code: 'ROOM_INCOMPATIBLE' };
        if (existing.lifecycle === 'EXPIRED') return { code: 'ROOM_EXPIRED' };
        return { roomId: existing.roomId, version: existing.revision };
      }
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
        VALUES (?, 0, 'Player', NULL, 0, ?)`, ownerUserId, timestamp);
      return { roomId, version: 0 };
    });
  }

  read(userId: string): ReadResult {
    if (!this.compatible) return { code: this.mayReportIncompatibility(userId) ? 'ROOM_INCOMPATIBLE' : 'NOT_MEMBER' };
    const room = this.room();
    if (!room) return { code: 'ROOM_NOT_FOUND' };
    if (!this.hasMember(userId)) return { code: 'NOT_MEMBER' };
    if (!this.supports(room)) return { code: 'ROOM_INCOMPATIBLE' };
    if (room.lifecycle === 'EXPIRED') return { code: 'ROOM_EXPIRED' };
    const game = this.loadGame(room);
    if (game && !this.supports(game)) return { code: 'ROOM_INCOMPATIBLE' };
    return { snapshot: this.snapshot(room, game) };
  }

  private loadGame(room: RoomRow): GameState | null {
    return room.gameJson === null ? null : JSON.parse(room.gameJson) as GameState;
  }

  private snapshot(room: RoomRow, game: GameState | null): PublicRoomSnapshot {
    const recentEvents = this.ctx.storage.sql.exec<EventRow>(
      'SELECT revision, eventIndex, timestamp, eventJson FROM events ORDER BY revision DESC, eventIndex DESC LIMIT 30',
    ).toArray().reverse().map(({ eventJson, ...metadata }) => ({ ...metadata, event: JSON.parse(eventJson) as ActionEvent }));
    return projectRoom({ roomId: room.roomId, schemaVersion: SCHEMA_VERSION,
      rulesVersion: RULES_VERSION, boardVersion: BOARD_VERSION, revision: room.revision,
      lifecycle: room.lifecycle, ownerUserId: room.ownerUserId, members: this.members(), game, recentEvents });
  }

  async execute(userId: string, command: CommandEnvelope): Promise<CommandResult> {
    try {
      // The asynchronous hash completes before any authoritative read.
      const requestHash = await commandHash(command);
      const result = this.ctx.storage.transactionSync(() => this.executeTransaction(userId, command, requestHash));
      if (!('code' in result)) {
        await this.ctx.storage.sync();
        if (!result.duplicate) await this.commandCommitted(result.snapshot);
      }
      return result;
    } catch {
      // A delivery error may occur after commit. The client retries with the same ID.
      return { code: 'INTERNAL_ERROR' };
    }
  }

  private executeTransaction(userId: string, command: CommandEnvelope, requestHash: string): CommandResult {
    if (!this.compatible) return { code: this.mayReportIncompatibility(userId) ? 'ROOM_INCOMPATIBLE' : 'NOT_MEMBER' };
    const room = this.room();
    if (!room) return { code: 'ROOM_NOT_FOUND' };
    if (!this.hasMember(userId)) return { code: 'NOT_MEMBER' };
    if (!this.supports(room)) return { code: 'ROOM_INCOMPATIBLE' };
    if (room.lifecycle === 'EXPIRED') return { code: 'ROOM_EXPIRED' };
    const game = this.loadGame(room);
    if (game && !this.supports(game)) return { code: 'ROOM_INCOMPATIBLE' };

    const { commandId, expectedVersion, type, payload } = command;
    const sql = this.ctx.storage.sql;
    const receipt = sql.exec<Receipt>(
      'SELECT requestHash, acceptedRevision FROM commands WHERE userId = ? AND commandId = ?', userId, commandId,
    ).toArray()[0];
    if (receipt) {
      if (receipt.requestHash !== requestHash) return { code: 'COMMAND_ID_REUSED' };
      return { protocolVersion: PROTOCOL_VERSION, commandId, acceptedVersion: receipt.acceptedRevision,
        duplicate: true, snapshot: this.snapshot(room, game) };
    }
    if (expectedVersion !== room.revision) return { code: 'STALE_VERSION', currentVersion: room.revision };
    if (!game || type === 'SELECT_ROLE' || type === 'SET_READY' || type === 'LEAVE_LOBBY' || type === 'START_GAME') {
      return { code: 'WRONG_PHASE' };
    }
    const transition = applyCommand(game, userId, { type, payload });
    if (!transition.ok) return { code: transition.error };

    assertGameInvariants(transition.state);
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const revision = room.revision + 1;
    const lifecycle = this.writeGame(transition.state, revision, now);
    this.recordEvents(transition.events, revision, timestamp);
    this.recordReceipt(userId, commandId, requestHash, revision);
    return { protocolVersion: PROTOCOL_VERSION, commandId, acceptedVersion: revision, duplicate: false,
      snapshot: this.snapshot({ ...room, revision, lifecycle }, transition.state) };
  }

  protected recordEvents(events: readonly ActionEvent[], revision: number, timestamp: string): void {
    events.forEach((event, eventIndex) => this.ctx.storage.sql.exec(
      'INSERT INTO events (revision, eventIndex, eventJson, timestamp) VALUES (?, ?, ?, ?)',
      revision, eventIndex, JSON.stringify(event), timestamp,
    ));
  }

  protected recordReceipt(userId: string, commandId: string, requestHash: string, revision: number): void {
    this.ctx.storage.sql.exec('INSERT INTO commands (userId, commandId, requestHash, acceptedRevision) VALUES (?, ?, ?, ?)',
      userId, commandId, requestHash, revision);
  }

  protected commandCommitted(snapshot: PublicRoomSnapshot): void | Promise<void> {
    // T10 will deliver the committed public snapshot to connected room members.
    void snapshot;
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
  protected persistGame(game: GameState): void {
    assertGameInvariants(game);
    this.ctx.storage.transactionSync(() => {
      const room = this.compatible && this.room();
      if (!room || !this.supports(room) || room.lifecycle === 'EXPIRED') throw new Error('Room data is unavailable');
      const members = this.members();
      if (members.length !== game.players.length || members.some((member, index) => {
        const player = game.players[index]!;
        return member.userId !== player.userId || member.seat !== player.seat || member.role !== player.role;
      })) throw new Error('Game roster differs from room membership');
      this.writeGame(game, room.revision + 1, Date.now());
    });
  }
}
