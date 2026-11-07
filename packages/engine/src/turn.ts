import { loadBoard } from './board';
import { shuffle } from './random';
import type { BoardLocation, Color, EpidemicCardId, GameState, InfectionCardId, LocationCardId, Outcome, Phase } from './types';

const INFECTION_RATES = [2, 2, 2, 3, 3, 4, 4] as const;
type Loss = Extract<Outcome, { kind: 'lost' }>;

export type TurnEvent =
  | { readonly type: 'PLAYER_CARD_DRAWN'; readonly userId: string; readonly cardId: LocationCardId }
  | { readonly type: 'EPIDEMIC_DRAWN'; readonly cardId: EpidemicCardId; readonly rateIndex: number }
  | { readonly type: 'CUBE_ADDED'; readonly locationId: string; readonly color: Color }
  | { readonly type: 'OUTBREAK'; readonly locationId: string; readonly color: Color }
  | { readonly type: 'TURN_STARTED'; readonly userId: string; readonly seat: number }
  | { readonly type: 'PHASE_CHANGED'; readonly phase: Phase };

export function resolveTurn(initial: GameState, drawsRemaining: number) {
  const board = new Map(loadBoard().locations.map(location => [location.id, location]));
  const active = initial.players.find(player => player.seat === initial.activeSeat)!;
  const events: TurnEvent[] = [];
  let state = initial;

  function lose(outcome: Loss) {
    state = { ...state, phase: 'LOST', outcome };
    events.push({ type: 'PHASE_CHANGED', phase: 'LOST' });
  }

  function addCube(location: BoardLocation, color: Color, visited: Set<string>) {
    const cubes = state.cubes[location.id]!;
    if (cubes[color] < 3) {
      if (state.supply[color] === 0) {
        lose({ kind: 'lost', reason: 'CUBE_SUPPLY_EXHAUSTED', color, locationId: location.id });
        return;
      }
      state = { ...state,
        cubes: { ...state.cubes, [location.id]: { ...cubes, [color]: cubes[color] + 1 } },
        supply: { ...state.supply, [color]: state.supply[color] - 1 },
      };
      events.push({ type: 'CUBE_ADDED', locationId: location.id, color });
      return;
    }
    if (visited.has(location.id)) return;
    visited.add(location.id);
    state = { ...state, outbreakCount: state.outbreakCount + 1 };
    events.push({ type: 'OUTBREAK', locationId: location.id, color });
    if (state.outbreakCount === 8) {
      lose({ kind: 'lost', reason: 'OUTBREAK_LIMIT' });
      return;
    }
    for (const neighbor of location.neighbors) {
      if (state.outcome) break;
      addCube(board.get(neighbor)!, color, visited);
    }
  }

  function infect(fromBottom: boolean) {
    if (state.infectionDeck.length === 0) {
      if (state.infectionDiscard.length === 0) throw new Error('Game invariant: no infection cards to draw');
      const refill = shuffle(state.infectionDiscard, state.rngState);
      state = { ...state, infectionDeck: refill.items, infectionDiscard: [], rngState: refill.state };
    }
    const index = fromBottom ? state.infectionDeck.length - 1 : 0;
    const card: InfectionCardId = state.infectionDeck[index]!;
    const location = board.get(card.slice(2))!;
    state = { ...state,
      infectionDeck: fromBottom ? state.infectionDeck.slice(0, -1) : state.infectionDeck.slice(1),
      infectionDiscard: [card, ...state.infectionDiscard],
    };
    const visited = new Set<string>();
    const attempts = fromBottom ? 3 : 1;
    for (let attempt = 0; attempt < attempts && !state.outcome; attempt++) {
      addCube(location, location.color, visited);
    }
  }

  for (let remaining = drawsRemaining; remaining > 0; remaining--) {
    const [card, ...playerDeck] = state.playerDeck;
    if (!card) {
      lose({ kind: 'lost', reason: 'PLAYER_DECK_EMPTY' });
      return { state, events };
    }
    state = { ...state, playerDeck };
    if (card === 'e:1' || card === 'e:2' || card === 'e:3' || card === 'e:4') {
      state = { ...state, rateIndex: Math.min(state.rateIndex + 1, 6),
        resolvedEpidemics: [...state.resolvedEpidemics, card] };
      events.push({ type: 'EPIDEMIC_DRAWN', cardId: card, rateIndex: state.rateIndex });
      infect(true);
      if (!state.outcome) {
        const intensified = shuffle(state.infectionDiscard, state.rngState);
        state = { ...state, infectionDeck: [...intensified.items, ...state.infectionDeck],
          infectionDiscard: [], rngState: intensified.state };
      }
      if (state.outcome) return { state, events };
      continue;
    }
    const player = state.players.find(player => player.seat === active.seat)!;
    const hand = [...player.hand, card];
    state = { ...state, players: state.players.map(member => member === player ? { ...member, hand } : member) };
    events.push({ type: 'PLAYER_CARD_DRAWN', userId: player.userId, cardId: card });
    if (hand.length > 7) {
      state = { ...state, phase: 'DISCARD_REQUIRED', continuation: {
        userId: player.userId, resume: { phase: 'DRAW', drawsRemaining: remaining - 1 },
      } };
      events.push({ type: 'PHASE_CHANGED', phase: 'DISCARD_REQUIRED' });
      return { state, events };
    }
  }

  state = { ...state, phase: 'INFECTION' };
  events.push({ type: 'PHASE_CHANGED', phase: 'INFECTION' });
  for (let count = 0; count < INFECTION_RATES[state.rateIndex]!; count++) {
    infect(false);
    if (state.outcome) return { state, events };
  }
  const next = state.players.find(player => player.seat > active.seat) ?? state.players[0]!;
  state = { ...state, phase: 'ACTIONS', activeSeat: next.seat, actionsRemaining: 4 };
  events.push({ type: 'PHASE_CHANGED', phase: 'ACTIONS' },
    { type: 'TURN_STARTED', userId: next.userId, seat: next.seat });
  return { state, events };
}
