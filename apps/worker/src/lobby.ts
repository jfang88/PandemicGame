import { createGame, type GameState } from '@pandemic/engine';
import type { CommandEnvelope, ErrorCode, RoomEventData, RoomMember } from '@pandemic/protocol';

export function isLobbyCommand(command: CommandEnvelope): boolean {
  return command.type === 'SELECT_ROLE' || command.type === 'SET_READY'
    || command.type === 'LEAVE_LOBBY' || command.type === 'START_GAME';
}

export function gameSeed(): number {
  const bytes = new Uint32Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0] === 0);
  return bytes[0]!;
}

type LobbyResult = { code: ErrorCode } | {
  event: RoomEventData;
  game?: GameState;
  ownerUserId?: string;
  abandoned?: boolean;
};

/** Called only inside the room's mutation transaction, after membership and revision checks. */
export function applyLobbyCommand(sql: SqlStorage, members: readonly RoomMember[], ownerUserId: string,
  userId: string, command: CommandEnvelope, seed: number | undefined): LobbyResult {
  const actor = members.find(member => member.userId === userId)!;
  switch (command.type) {
    case 'SELECT_ROLE': {
      const { role } = command.payload;
      if (members.some(member => member.userId !== userId && member.role === role)) return { code: 'ROLE_TAKEN' };
      if (actor.role !== role) sql.exec('UPDATE members SET role = ?, ready = 0 WHERE userId = ?', role, userId);
      return { event: { type: 'ROLE_SELECTED', userId, role } };
    }
    case 'SET_READY': {
      const { ready } = command.payload;
      if (ready && !actor.role) return { code: 'NOT_READY' };
      sql.exec('UPDATE members SET ready = ? WHERE userId = ?', Number(ready), userId);
      return { event: { type: 'READY_CHANGED', userId, ready } };
    }
    case 'LEAVE_LOBBY': {
      const remaining = members.filter(member => member.userId !== userId);
      sql.exec('DELETE FROM members WHERE userId = ?', userId);
      sql.exec('UPDATE members SET ready = 0');
      return { event: { type: 'MEMBER_LEFT', userId }, abandoned: remaining.length === 0,
        ownerUserId: userId === ownerUserId ? remaining[0]?.userId ?? ownerUserId : ownerUserId };
    }
    case 'START_GAME': {
      if (userId !== ownerUserId) return { code: 'NOT_OWNER' };
      if (members.length < 2 || members.some(member => !member.ready || !member.role)) return { code: 'NOT_READY' };
      const players = members.map(({ userId, role, seat }) => ({ userId, role: role!, seat }));
      return { event: { type: 'GAME_STARTED', userId }, game: createGame({ players }, seed!) };
    }
    default:
      return { code: 'WRONG_PHASE' };
  }
}
