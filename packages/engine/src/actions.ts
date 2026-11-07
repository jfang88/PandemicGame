import { isRecord, loadBoard } from './board';
import { resolveTurn, type TurnEvent } from './turn';
import { COLORS, type Color, type Continuation, type GameState, type LocationCardId, type PlayerState } from './types';

export type ActionCommand =
  | { readonly type: 'MOVE' | 'DIRECT_FLIGHT' | 'CHARTER_FLIGHT' | 'SHUTTLE'; readonly payload: { readonly destination: string } }
  | { readonly type: 'TREAT'; readonly payload: { readonly color: Color } }
  | { readonly type: 'GIVE_CARD'; readonly payload: { readonly recipientUserId: string; readonly cardId: LocationCardId } }
  | { readonly type: 'DISCOVER_CURE'; readonly payload: { readonly color: Color; readonly cardIds: readonly LocationCardId[] } }
  | { readonly type: 'DISCARD'; readonly payload: { readonly cardIds: readonly LocationCardId[] } }
  | { readonly type: 'BUILD_CENTER' | 'PASS'; readonly payload: Readonly<Record<string, never>> };
export type ActionError = 'BAD_REQUEST' | 'WRONG_TURN' | 'WRONG_PHASE' | 'GAME_FINISHED' | 'ILLEGAL_ACTION';
/** Explicit public facts only; never embed state, command objects, decks or RNG. */
export type ActionEvent =
  | TurnEvent
  | { readonly type: 'CARD_DISCARDED'; readonly userId: string; readonly cardId: LocationCardId }
  | { readonly type: 'CARD_GIVEN'; readonly userId: string; readonly recipientUserId: string; readonly cardId: LocationCardId }
  | { readonly type: 'CURE_DISCOVERED'; readonly userId: string; readonly color: Color }
  | { readonly type: 'PLAYER_MOVED'; readonly userId: string; readonly from: string; readonly to: string; readonly method: 'MOVE' | 'DIRECT_FLIGHT' | 'CHARTER_FLIGHT' | 'SHUTTLE' }
  | { readonly type: 'CUBES_TREATED'; readonly userId: string; readonly locationId: string; readonly color: Color; readonly count: number }
  | { readonly type: 'CENTER_BUILT'; readonly userId: string; readonly locationId: string }
  | { readonly type: 'ACTION_PASSED'; readonly userId: string }
  | { readonly type: 'ACTION_SPENT'; readonly userId: string; readonly actionsRemaining: number };
export type ActionResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly ActionEvent[] }
  | { readonly ok: false; readonly state: GameState; readonly events: readonly []; readonly error: ActionError };

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function isLocationCardId(value: unknown): value is LocationCardId {
  return typeof value === 'string' && value.startsWith('p:') && value.length === 5;
}
function isCardList(value: unknown): value is LocationCardId[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 48 && Array.from(value).every(isLocationCardId);
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
    case 'GIVE_CARD':
      return exactKeys(payload, ['recipientUserId', 'cardId']) && typeof payload.recipientUserId === 'string'
        && isLocationCardId(payload.cardId)
        ? { type: value.type, payload: { recipientUserId: payload.recipientUserId, cardId: payload.cardId } } : null;
    case 'DISCOVER_CURE':
      return exactKeys(payload, ['color', 'cardIds']) && COLORS.includes(payload.color as Color) && isCardList(payload.cardIds)
        ? { type: value.type, payload: { color: payload.color as Color, cardIds: payload.cardIds } } : null;
    case 'DISCARD':
      return exactKeys(payload, ['cardIds']) && isCardList(payload.cardIds)
        ? { type: value.type, payload: { cardIds: payload.cardIds } } : null;
    case 'BUILD_CENTER': case 'PASS':
      return exactKeys(payload, []) ? { type: value.type, payload: {} } : null;
    default: return null;
  }
}

function ownsDistinctCards(player: PlayerState, cards: readonly LocationCardId[]): boolean {
  return new Set(cards).size === cards.length && cards.every(card => player.hand.includes(card));
}

/** Pure command boundary. Automatic effects finish before a snapshot is returned. */
export function applyCommand(state: GameState, actorId: string, input: unknown): ActionResult {
  const action = applyPlayerCommand(state, actorId, input);
  if (!action.ok || action.state.phase !== 'DRAW') return action;
  const resume = state.continuation?.resume;
  const draws = resume?.phase === 'DRAW' ? resume.drawsRemaining : 2;
  const turn = resolveTurn(action.state, draws);
  return { ok: true, state: turn.state, events: [...action.events, ...turn.events] };
}

function applyPlayerCommand(state: GameState, actorId: string, input: unknown): ActionResult {
  const reject = (error: ActionError): ActionResult => ({ ok: false, error, state, events: [] });
  if (state.phase === 'WON' || state.phase === 'LOST') return reject('GAME_FINISHED');
  if (state.phase === 'DISCARD_REQUIRED') {
    const continuation = state.continuation;
    const discarder = state.players.find(player => player.userId === actorId);
    if (!continuation) return reject('WRONG_PHASE');
    if (!discarder || continuation.userId !== actorId) return reject('WRONG_TURN');
    const command = parseCommand(input);
    if (!command) return reject('BAD_REQUEST');
    if (command.type !== 'DISCARD') return reject('WRONG_PHASE');
    const { cardIds } = command.payload;
    if (discarder.hand.length - cardIds.length !== 7 || !ownsDistinctCards(discarder, cardIds)) {
      return reject('ILLEGAL_ACTION');
    }
    const { phase } = continuation.resume;
    return {
      ok: true,
      state: {
        ...state, phase, continuation: null,
        actionsRemaining: phase === 'ACTIONS' ? continuation.resume.actionsRemaining : 0,
        players: state.players.map(player => player === discarder
          ? { ...player, hand: player.hand.filter(card => !cardIds.includes(card)) } : player),
        playerDiscard: [...cardIds].reverse().concat(state.playerDiscard),
      },
      events: [...cardIds.map(cardId => ({ type: 'CARD_DISCARDED' as const, userId: actorId, cardId })),
        { type: 'PHASE_CHANGED', phase }],
    };
  }
  if (state.phase !== 'ACTIONS') return reject('WRONG_PHASE');
  const actor = state.players.find(player => player.userId === actorId);
  if (!actor || actor.seat !== state.activeSeat) return reject('WRONG_TURN');
  if (!Number.isInteger(state.actionsRemaining) || state.actionsRemaining < 1 || state.actionsRemaining > 4) return reject('ILLEGAL_ACTION');
  const command = parseCommand(input);
  if (!command) return reject('BAD_REQUEST');
  const board = loadBoard();
  const location = board.locations.find(location => location.id === actor.locationId);
  if (!location) throw new Error('Game invariant: actor location');
  let spentCards: readonly LocationCardId[] = [];
  let transfer: { recipient: PlayerState; cardId: LocationCardId } | undefined;
  let cure: Color | undefined;
  let destination: string | undefined;
  let treated: { color: Color; count: number } | undefined;
  let build = false;
  switch (command.type) {
    case 'MOVE': case 'DIRECT_FLIGHT': case 'CHARTER_FLIGHT': case 'SHUTTLE': {
      destination = command.payload.destination;
      if (destination === actor.locationId || !board.locations.some(location => location.id === destination)) return reject('ILLEGAL_ACTION');
      if (command.type === 'MOVE' && !location.neighbors.includes(destination)) return reject('ILLEGAL_ACTION');
      if (command.type === 'SHUTTLE' && (!state.centers.includes(actor.locationId) || !state.centers.includes(destination))) return reject('ILLEGAL_ACTION');
      if (command.type === 'DIRECT_FLIGHT') spentCards = [`p:${destination}`];
      if (command.type === 'CHARTER_FLIGHT') spentCards = [`p:${actor.locationId}`];
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
      if (actor.role !== 'builder') spentCards = [`p:${actor.locationId}`];
      break;
    case 'GIVE_CARD': {
      const { recipientUserId, cardId } = command.payload;
      const recipient = state.players.find(player => player.userId === recipientUserId);
      if (!recipient || recipient === actor || recipient.locationId !== actor.locationId
        || !actor.hand.includes(cardId) || (actor.role !== 'courier' && cardId !== `p:${actor.locationId}`)) {
        return reject('ILLEGAL_ACTION');
      }
      transfer = { recipient, cardId };
      break;
    }
    case 'DISCOVER_CURE': {
      const { color, cardIds } = command.payload;
      const required = actor.role === 'scientist' ? 4 : 5;
      if (!state.centers.includes(actor.locationId) || state.cured[color] || cardIds.length !== required
        || !cardIds.every(card => board.locations.some(location => location.color === color && card === `p:${location.id}`))) {
        return reject('ILLEGAL_ACTION');
      }
      spentCards = cardIds;
      cure = color;
      break;
    }
    case 'DISCARD': return reject('WRONG_PHASE');
    case 'PASS': break;
  }
  if (!ownsDistinctCards(actor, spentCards)) return reject('ILLEGAL_ACTION');

  // Construct a candidate only after all legality/cost checks have passed.
  const events: ActionEvent[] = [];
  for (const cardId of spentCards) events.push({ type: 'CARD_DISCARDED', userId: actorId, cardId });
  if (transfer) events.push({ type: 'CARD_GIVEN', userId: actorId, recipientUserId: transfer.recipient.userId, cardId: transfer.cardId });
  if (cure) events.push({ type: 'CURE_DISCOVERED', userId: actorId, color: cure });
  if (destination && (command.type === 'MOVE' || command.type === 'DIRECT_FLIGHT' || command.type === 'CHARTER_FLIGHT' || command.type === 'SHUTTLE')) {
    events.push({ type: 'PLAYER_MOVED', userId: actorId, from: actor.locationId, to: destination, method: command.type });
  }
  if (treated) events.push({ type: 'CUBES_TREATED', userId: actorId, locationId: actor.locationId, ...treated });
  if (build) events.push({ type: 'CENTER_BUILT', userId: actorId, locationId: actor.locationId });
  if (command.type === 'PASS') events.push({ type: 'ACTION_PASSED', userId: actorId });
  const actionsRemaining = state.actionsRemaining - 1;
  const resume: Continuation['resume'] = actionsRemaining === 0
    ? { phase: 'DRAW', drawsRemaining: 2 } : { phase: 'ACTIONS', actionsRemaining };
  const continuation = transfer && transfer.recipient.hand.length >= 7
    ? { userId: transfer.recipient.userId, resume } : null;
  const cured = cure ? { ...state.cured, [cure]: true } : state.cured;
  const won = cure !== undefined && COLORS.every(color => cured[color]);
  const phase = won ? 'WON' : continuation ? 'DISCARD_REQUIRED' : resume.phase;
  const next: GameState = {
    ...state, actionsRemaining, phase,
    cured, continuation, outcome: won ? { kind: 'won' } : state.outcome,
    players: state.players.map(player => {
      if (transfer && player === transfer.recipient) return { ...player, hand: [...player.hand, transfer.cardId] };
      if (player !== actor) return player;
      return { ...player, locationId: destination ?? player.locationId,
        hand: transfer || spentCards.length
          ? player.hand.filter(card => card !== transfer?.cardId && !spentCards.includes(card)) : player.hand };
    }),
    playerDiscard: spentCards.length ? [...spentCards].reverse().concat(state.playerDiscard) : state.playerDiscard,
    centers: build ? [...state.centers, actor.locationId] : state.centers,
    cubes: treated ? { ...state.cubes, [actor.locationId]: {
      ...state.cubes[actor.locationId]!, [treated.color]: state.cubes[actor.locationId]![treated.color] - treated.count,
    } } : state.cubes,
    supply: treated ? { ...state.supply, [treated.color]: state.supply[treated.color] + treated.count } : state.supply,
  };
  events.push({ type: 'ACTION_SPENT', userId: actorId, actionsRemaining });
  if (phase !== 'ACTIONS') events.push({ type: 'PHASE_CHANGED', phase });
  return { ok: true, state: next, events };
}
