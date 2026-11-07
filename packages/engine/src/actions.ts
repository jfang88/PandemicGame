import { isRecord, loadBoard } from './board';
import { COLORS, type Color, type GameState, type LocationCardId } from './types';

export type ActionCommand =
  | { readonly type: 'MOVE' | 'DIRECT_FLIGHT' | 'CHARTER_FLIGHT' | 'SHUTTLE'; readonly payload: { readonly destination: string } }
  | { readonly type: 'TREAT'; readonly payload: { readonly color: Color } }
  | { readonly type: 'BUILD_CENTER' | 'PASS'; readonly payload: Readonly<Record<string, never>> };
export type ActionError = 'BAD_REQUEST' | 'WRONG_TURN' | 'WRONG_PHASE' | 'GAME_FINISHED' | 'ILLEGAL_ACTION';
/** Explicit public facts only; never embed state, command objects, decks or RNG. */
export type ActionEvent =
  | { readonly type: 'CARD_DISCARDED'; readonly userId: string; readonly cardId: LocationCardId }
  | { readonly type: 'PLAYER_MOVED'; readonly userId: string; readonly from: string; readonly to: string; readonly method: 'MOVE' | 'DIRECT_FLIGHT' | 'CHARTER_FLIGHT' | 'SHUTTLE' }
  | { readonly type: 'CUBES_TREATED'; readonly userId: string; readonly locationId: string; readonly color: Color; readonly count: number }
  | { readonly type: 'CENTER_BUILT'; readonly userId: string; readonly locationId: string }
  | { readonly type: 'ACTION_PASSED'; readonly userId: string }
  | { readonly type: 'ACTION_SPENT'; readonly userId: string; readonly actionsRemaining: number }
  | { readonly type: 'PHASE_CHANGED'; readonly phase: 'DRAW' };
export type ActionResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly ActionEvent[] }
  | { readonly ok: false; readonly state: GameState; readonly events: readonly []; readonly error: ActionError };

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function parseCommand(value: unknown): ActionCommand | null {
  if (!isRecord(value) || !exactKeys(value, ['type', 'payload']) || !isRecord(value.payload)) return null;
  const payload = value.payload;
  switch (value.type) {
    case 'MOVE': case 'DIRECT_FLIGHT': case 'CHARTER_FLIGHT': case 'SHUTTLE':
      return exactKeys(payload, ['destination']) && typeof payload.destination === 'string'
        ? { type: value.type, payload: { destination: payload.destination } } : null;
    case 'TREAT':
      return exactKeys(payload, ['color']) && COLORS.includes(payload.color as Color)
        ? { type: value.type, payload: { color: payload.color as Color } } : null;
    case 'BUILD_CENTER': case 'PASS':
      return exactKeys(payload, []) ? { type: value.type, payload: {} } : null;
    default: return null;
  }
}

/** Pure T03 action boundary. T05 will resolve DRAW automatically before persistence. */
export function applyCommand(state: GameState, actorId: string, input: unknown): ActionResult {
  const reject = (error: ActionError): ActionResult => ({ ok: false, error, state, events: [] });
  if (state.phase === 'WON' || state.phase === 'LOST') return reject('GAME_FINISHED');
  if (state.phase !== 'ACTIONS') return reject('WRONG_PHASE');
  const actor = state.players.find(player => player.userId === actorId);
  if (!actor || actor.seat !== state.activeSeat) return reject('WRONG_TURN');
  if (!Number.isInteger(state.actionsRemaining) || state.actionsRemaining < 1 || state.actionsRemaining > 4) return reject('ILLEGAL_ACTION');
  const command = parseCommand(input);
  if (!command) return reject('BAD_REQUEST');
  const board = loadBoard();
  const location = board.locations.find(location => location.id === actor.locationId);
  if (!location) throw new Error('Game invariant: actor location');
  let spentCard: LocationCardId | undefined;
  let destination: string | undefined;
  let treated: { color: Color; count: number } | undefined;
  let build = false;
  switch (command.type) {
    case 'MOVE': case 'DIRECT_FLIGHT': case 'CHARTER_FLIGHT': case 'SHUTTLE': {
      destination = command.payload.destination;
      if (destination === actor.locationId || !board.locations.some(location => location.id === destination)) return reject('ILLEGAL_ACTION');
      if (command.type === 'MOVE' && !location.neighbors.includes(destination)) return reject('ILLEGAL_ACTION');
      if (command.type === 'SHUTTLE' && (!state.centers.includes(actor.locationId) || !state.centers.includes(destination))) return reject('ILLEGAL_ACTION');
      if (command.type === 'DIRECT_FLIGHT') spentCard = `p:${destination}`;
      if (command.type === 'CHARTER_FLIGHT') spentCard = `p:${actor.locationId}`;
      break;
    }
    case 'TREAT': {
      const color = command.payload.color;
      const count = state.cubes[actor.locationId]![color];
      if (count < 1) return reject('ILLEGAL_ACTION');
      treated = { color, count: actor.role === 'medic' || state.cured[color] ? count : 1 };
      break;
    }
    case 'BUILD_CENTER':
      if (state.centers.includes(actor.locationId) || state.centers.length >= 6) return reject('ILLEGAL_ACTION');
      build = true;
      if (actor.role !== 'builder') spentCard = `p:${actor.locationId}`;
      break;
    case 'PASS': break;
  }
  if (spentCard && !actor.hand.includes(spentCard)) return reject('ILLEGAL_ACTION');

  // Construct a candidate only after all legality/cost checks have passed.
  const events: ActionEvent[] = [];
  if (spentCard) events.push({ type: 'CARD_DISCARDED', userId: actorId, cardId: spentCard });
  if (destination && (command.type === 'MOVE' || command.type === 'DIRECT_FLIGHT' || command.type === 'CHARTER_FLIGHT' || command.type === 'SHUTTLE')) {
    events.push({ type: 'PLAYER_MOVED', userId: actorId, from: actor.locationId, to: destination, method: command.type });
  }
  if (treated) events.push({ type: 'CUBES_TREATED', userId: actorId, locationId: actor.locationId, ...treated });
  if (build) events.push({ type: 'CENTER_BUILT', userId: actorId, locationId: actor.locationId });
  if (command.type === 'PASS') events.push({ type: 'ACTION_PASSED', userId: actorId });
  const actionsRemaining = state.actionsRemaining - 1;
  const next: GameState = {
    ...state, actionsRemaining, phase: actionsRemaining === 0 ? 'DRAW' : 'ACTIONS',
    players: state.players.map(player => player === actor ? { ...player,
      locationId: destination ?? player.locationId,
      hand: spentCard ? player.hand.filter(card => card !== spentCard) : player.hand,
    } : player),
    playerDiscard: spentCard ? [spentCard, ...state.playerDiscard] : state.playerDiscard,
    centers: build ? [...state.centers, actor.locationId] : state.centers,
    cubes: treated ? { ...state.cubes, [actor.locationId]: {
      ...state.cubes[actor.locationId]!, [treated.color]: state.cubes[actor.locationId]![treated.color] - treated.count,
    } } : state.cubes,
    supply: treated ? { ...state.supply, [treated.color]: state.supply[treated.color] + treated.count } : state.supply,
  };
  events.push({ type: 'ACTION_SPENT', userId: actorId, actionsRemaining });
  if (actionsRemaining === 0) events.push({ type: 'PHASE_CHANGED', phase: 'DRAW' });
  return { ok: true, state: next, events };
}
