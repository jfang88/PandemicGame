import { DurableObject } from 'cloudflare:workers';
import { assertGameInvariants, BOARD_VERSION, RULES_VERSION, type GameState } from '@pandemic/engine';
import { projectRoom, type PublicRoomSnapshot, type RoomMember } from '@pandemic/protocol';
import type { Env } from './router';

const SCHEMA_VERSION = 1;
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

export class GameRoom extends DurableObject<Env> {
  private compatible = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.compatible = ctx.storage.transactionSync(() => {
        const sql = ctx.storage.sql;
        sql.exec('CREATE TABLE IF NOT EXISTS metadata (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL)');
        const metadata = sql.exec<{ version: number }>('SELECT version FROM metadata WHERE singleton = 1').toArray()[0];
        if (metadata) return metadata.version === SCHEMA_VERSION;
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
        sql.exec('INSERT INTO metadata (singleton, version) VALUES (1, ?)', SCHEMA_VERSION);
        return true;
      });
    });
  }

  private room(): RoomRow | undefined {
    return this.ctx.storage.sql.exec<RoomRow>(`SELECT roomId, schemaVersion, rulesVersion, boardVersion,
      revision, lifecycle, ownerUserId, gameJson FROM room WHERE singleton = 1`).toArray()[0];
  }

  private supports(room: RoomRow): boolean {
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
    const members = this.members();
    const game = room.gameJson === null ? null : JSON.parse(room.gameJson) as GameState;
    if (game && (game.schemaVersion !== SCHEMA_VERSION || game.rulesVersion !== RULES_VERSION || game.boardVersion !== BOARD_VERSION)) {
      return { code: 'ROOM_INCOMPATIBLE' };
    }
    return { snapshot: projectRoom({ roomId: room.roomId, schemaVersion: SCHEMA_VERSION,
      rulesVersion: RULES_VERSION, boardVersion: BOARD_VERSION, revision: room.revision,
      lifecycle: room.lifecycle, ownerUserId: room.ownerUserId, members, game, recentEvents: [] }) };
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
      const now = Date.now();
      const lifecycle = game.phase === 'WON' || game.phase === 'LOST' ? game.phase : 'RUNNING';
      this.ctx.storage.sql.exec(`UPDATE room SET gameJson = ?, lifecycle = ?, revision = revision + 1,
        lastMutationAt = ?, expiresAt = ? WHERE singleton = 1`, JSON.stringify(game), lifecycle,
      new Date(now).toISOString(), new Date(now + 30 * DAY_MS).toISOString());
    });
  }
}
