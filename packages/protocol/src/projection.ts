import { loadBoard, type ActionEvent, type ColorMap, type GameState, type Outcome, type Role } from '@pandemic/engine';
import { PROTOCOL_VERSION } from './commands';

export interface RoomMember {
  readonly userId: string;
  readonly seat: number;
  readonly displayName: string;
  readonly role: Role | null;
  readonly ready: boolean;
}

export interface RoomEvent {
  readonly revision: number;
  readonly eventIndex: number;
  readonly timestamp: string;
  readonly event: ActionEvent;
}

export interface RoomProjectionSource {
  readonly roomId: string;
  readonly schemaVersion: 1;
  readonly rulesVersion: GameState['rulesVersion'];
  readonly boardVersion: GameState['boardVersion'];
  readonly revision: number;
  readonly lifecycle: 'LOBBY' | 'RUNNING' | 'WON' | 'LOST' | 'EXPIRED';
  readonly ownerUserId: string;
  readonly members: readonly RoomMember[];
  readonly game: GameState | null;
  readonly recentEvents: readonly RoomEvent[];
}

const locationIds = loadBoard().locations.map(location => location.id);

export function sanitizeDisplayName(name: string): string {
  return Array.from(name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()).slice(0, 64).join('') || 'Player';
}

function colors<T>({ blue, yellow, red, black }: ColorMap<T>): ColorMap<T> {
  return { blue, yellow, red, black };
}

function publicOutcome(outcome: Outcome | null): Outcome | null {
  if (!outcome) return null;
  if (outcome.kind === 'won') return { kind: 'won' };
  if (outcome.reason === 'CUBE_SUPPLY_EXHAUSTED') {
    return { kind: 'lost', reason: outcome.reason, color: outcome.color, locationId: outcome.locationId };
  }
  return { kind: 'lost', reason: outcome.reason };
}

function publicEvent(event: ActionEvent): ActionEvent {
  const { type } = event;
  switch (type) {
    case 'CARD_DISCARDED': case 'PLAYER_CARD_DRAWN':
      return { type, userId: event.userId, cardId: event.cardId };
    case 'CARD_GIVEN':
      return { type, userId: event.userId, recipientUserId: event.recipientUserId, cardId: event.cardId };
    case 'CURE_DISCOVERED':
      return { type, userId: event.userId, color: event.color };
    case 'PLAYER_MOVED':
      return { type, userId: event.userId, from: event.from, to: event.to, method: event.method };
    case 'CUBES_TREATED':
      return { type, userId: event.userId, locationId: event.locationId, color: event.color, count: event.count };
    case 'CENTER_BUILT':
      return { type, userId: event.userId, locationId: event.locationId };
    case 'ACTION_PASSED':
      return { type, userId: event.userId };
    case 'ACTION_SPENT':
      return { type, userId: event.userId, actionsRemaining: event.actionsRemaining };
    case 'EPIDEMIC_DRAWN':
      return { type, cardId: event.cardId, rateIndex: event.rateIndex };
    case 'CUBE_ADDED': case 'OUTBREAK':
      return { type, locationId: event.locationId, color: event.color };
    case 'TURN_STARTED':
      return { type, userId: event.userId, seat: event.seat };
    case 'PHASE_CHANGED':
      return { type, phase: event.phase };
  }
}

/** Only call after membership authorization. Keep internal objects out of the wire shape. */
export function projectRoom(source: RoomProjectionSource) {
  const game = source.game;
  return {
    protocolVersion: PROTOCOL_VERSION,
    schemaVersion: source.schemaVersion,
    rulesVersion: source.rulesVersion,
    boardVersion: source.boardVersion,
    roomId: source.roomId,
    revision: source.revision,
    lifecycle: source.lifecycle,
    ownerUserId: source.ownerUserId,
    members: source.members.map(({ userId, seat, displayName, role, ready }) =>
      ({ userId, seat, displayName: sanitizeDisplayName(displayName), role, ready })),
    recentEvents: source.recentEvents.slice(-30).map(({ revision, eventIndex, timestamp, event }) =>
      ({ revision, eventIndex, timestamp, event: publicEvent(event) })),
    game: game && {
      phase: game.phase,
      players: game.players.map(({ userId, seat, locationId, hand }) =>
        ({ userId, seat, locationId, hand: [...hand] })),
      activeSeat: game.activeSeat,
      actionsRemaining: game.actionsRemaining,
      cubes: Object.fromEntries(locationIds.map(id => [id, colors(game.cubes[id]!)])),
      supply: colors(game.supply),
      centers: [...game.centers],
      cured: colors(game.cured),
      pendingDiscardUserId: game.continuation?.userId ?? null,
      playerDeckCount: game.playerDeck.length,
      infectionDeckCount: game.infectionDeck.length,
      playerDiscard: [...game.playerDiscard],
      infectionDiscard: [...game.infectionDiscard],
      resolvedEpidemics: [...game.resolvedEpidemics],
      rateIndex: game.rateIndex,
      outbreakCount: game.outbreakCount,
      outcome: publicOutcome(game.outcome),
    },
  };
}

export type PublicRoomSnapshot = ReturnType<typeof projectRoom>;

export interface CommandAcceptance {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly commandId: string;
  readonly acceptedVersion: number;
  readonly duplicate: boolean;
  readonly snapshot: PublicRoomSnapshot;
}
