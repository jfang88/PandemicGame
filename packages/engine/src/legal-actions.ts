import type { ActionCommand } from './actions';
import { loadBoard } from './board';
import { COLORS, type GameState, type LocationCardId } from './types';

const board = loadBoard().locations;
const locations = new Map(board.map(location => [location.id, location]));

function* cardChoices(cards: readonly LocationCardId[], count: number): Generator<LocationCardId[]> {
  if (count === 0) {
    yield [];
    return;
  }
  for (let index = 0; index <= cards.length - count; index++) {
    for (const rest of cardChoices(cards.slice(index + 1), count - 1)) {
      yield [cards[index]!, ...rest];
    }
  }
}

/** Enumerate each legal choice once for the given actor, using hand order for card payments. */
export function listLegalActions(state: GameState, actorId: string): readonly ActionCommand[] {
  const actor = state.players.find(player => player.userId === actorId);
  if (!actor) return [];
  if (state.phase === 'DISCARD_REQUIRED') {
    if (state.continuation?.userId !== actorId || actor.hand.length <= 7) return [];
    return Array.from(cardChoices(actor.hand, actor.hand.length - 7), cardIds =>
      ({ type: 'DISCARD', payload: { cardIds } }));
  }
  if (state.phase !== 'ACTIONS' || actor.seat !== state.activeSeat || state.actionsRemaining < 1) return [];

  const { locationId, hand, role } = actor;
  const here = locations.get(locationId)!;
  const atCenter = state.centers.includes(locationId);
  const hasHereCard = hand.includes(`p:${locationId}`);
  const actions: ActionCommand[] = [{ type: 'PASS', payload: {} }];
  for (const destination of here.neighbors) actions.push({ type: 'MOVE', payload: { destination } });
  for (const { id: destination } of board) {
    if (destination === locationId) continue;
    if (hand.includes(`p:${destination}`)) actions.push({ type: 'DIRECT_FLIGHT', payload: { destination } });
    if (hasHereCard) actions.push({ type: 'CHARTER_FLIGHT', payload: { destination } });
    if (atCenter && state.centers.includes(destination)) actions.push({ type: 'SHUTTLE', payload: { destination } });
  }
  if (!atCenter && state.centers.length < 6 && (hasHereCard || role === 'builder')) {
    actions.push({ type: 'BUILD_CENTER', payload: {} });
  }
  for (const color of COLORS) {
    if (state.cubes[locationId]![color] > 0) actions.push({ type: 'TREAT', payload: { color } });
    if (!atCenter || state.cured[color]) continue;
    const matching = hand.filter(card => locations.get(card.slice(2))?.color === color);
    for (const cardIds of cardChoices(matching, role === 'scientist' ? 4 : 5)) {
      actions.push({ type: 'DISCOVER_CURE', payload: { color, cardIds } });
    }
  }
  for (const recipient of state.players) {
    if (recipient === actor || recipient.locationId !== locationId) continue;
    for (const cardId of hand) {
      if (role === 'courier' || cardId === `p:${locationId}`) {
        actions.push({ type: 'GIVE_CARD', payload: { recipientUserId: recipient.userId, cardId } });
      }
    }
  }
  return actions;
}
