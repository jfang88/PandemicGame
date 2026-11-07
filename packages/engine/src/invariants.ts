import { loadBoard } from './board';
import { validateSeed } from './random';
import { BOARD_VERSION, COLORS, ROLES, RULES_VERSION, type GameState } from './types';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Game invariant: ${message}`);
}
function integer(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
function sameCards(actual: readonly string[], expected: readonly string[], label: string): void {
  const expectedSet = new Set(expected);
  invariant(actual.length === expected.length && new Set(actual).size === expected.length
    && actual.every(card => expectedSet.has(card)), `${label} conservation`);
}
const ids = loadBoard().locations.map(location => location.id);

/** Check structural and conservation invariants at the command boundary. */
export function assertGameInvariants(state: GameState): void {
  invariant(state.schemaVersion === 1 && state.rulesVersion === RULES_VERSION
    && state.boardVersion === BOARD_VERSION, 'versions');
  validateSeed(state.rngState);
  invariant(state.players.length >= 2 && state.players.length <= 4, 'player count');
  for (const key of ['userId', 'seat', 'role'] as const) {
    invariant(new Set(state.players.map(player => player[key])).size === state.players.length, `unique ${key}`);
  }
  for (const player of state.players) {
    invariant(typeof player.userId === 'string' && player.userId.length >= 1 && player.userId.length <= 128, 'UID');
    invariant(integer(player.seat, 0, 3) && ROLES.includes(player.role) && ids.includes(player.locationId), 'player');
  }
  invariant(state.players.every((player, index) => index === 0 || state.players[index - 1]!.seat < player.seat), 'seat order');
  invariant(state.players.some(player => player.seat === state.activeSeat), 'active seat');
  invariant(integer(state.actionsRemaining, 0, 4), 'actions remaining');
  invariant(integer(state.outbreakCount, 0, 8) && integer(state.rateIndex, 0, 6), 'counters');
  invariant(Object.keys(state.cubes).length === 48 && ids.every(id => Object.hasOwn(state.cubes, id)), 'board locations');
  invariant(new Set(state.centers).size === state.centers.length && state.centers.length >= 1
    && state.centers.length <= 6 && state.centers.every(id => ids.includes(id)), 'centers');
  for (const color of COLORS) {
    let total = state.supply[color];
    invariant(integer(total, 0, 24) && typeof state.cured[color] === 'boolean', 'supply and cures');
    for (const id of ids) {
      const count = state.cubes[id]![color];
      invariant(integer(count, 0, 3), 'cube bounds');
      total += count;
    }
    invariant(total === 24, `cube conservation ${color}`);
  }
  sameCards([...state.infectionDeck, ...state.infectionDiscard], ids.map(id => `i:${id}`), 'infection cards');
  const playerCards = [...state.playerDeck, ...state.playerDiscard, ...state.players.flatMap(player => player.hand)];
  invariant(state.playerDiscard.every(card => card.startsWith('p:'))
    && state.players.every(player => player.hand.every(card => card.startsWith('p:'))), 'location-only hands/discard');
  sameCards(playerCards.filter(card => !card.startsWith('e:')), ids.map(id => `p:${id}`), 'player location cards');
  sameCards([...playerCards.filter(card => card.startsWith('e:')), ...state.resolvedEpidemics], ['e:1', 'e:2', 'e:3', 'e:4'], 'epidemics');
  invariant(['ACTIONS', 'DISCARD_REQUIRED', 'WON', 'LOST'].includes(state.phase), 'settled phase');
  invariant((state.phase === 'DISCARD_REQUIRED') === (state.continuation !== null), 'continuation phase');
  const overLimit = state.players.filter(player => player.hand.length > 7);
  if (state.continuation) {
    const { userId, resume } = state.continuation;
    invariant(overLimit.length === 1 && overLimit[0]?.userId === userId, 'pending discard owner');
    if (resume.phase === 'ACTIONS') {
      invariant(integer(resume.actionsRemaining, 1, 3) && resume.actionsRemaining === state.actionsRemaining, 'resume actions');
      invariant(overLimit[0].seat !== state.activeSeat, 'transfer recipient');
    } else {
      invariant(resume.phase === 'DRAW' && integer(resume.drawsRemaining, 0, 2) && state.actionsRemaining === 0, 'resume draw');
      invariant((overLimit[0].seat === state.activeSeat) === (resume.drawsRemaining < 2), 'draw discard owner');
    }
  } else {
    invariant(overLimit.length === 0, 'hand limit');
  }
  invariant((state.phase === 'WON' || state.phase === 'LOST') === (state.outcome !== null), 'outcome phase');
  invariant(COLORS.every(color => state.cured[color]) === (state.phase === 'WON'), 'fourth cure ends game');
  const loss = state.outcome?.kind === 'lost' ? state.outcome : null;
  invariant((state.outbreakCount === 8) === (loss?.reason === 'OUTBREAK_LIMIT'), 'outbreak limit ends game');
  if (state.phase === 'ACTIONS') invariant(state.actionsRemaining >= 1, 'action phase budget');
  if (state.phase === 'WON') invariant(state.outcome?.kind === 'won', 'win');
  if (state.phase === 'LOST') {
    invariant(loss && state.actionsRemaining === 0, 'loss');
    switch (loss.reason) {
      case 'OUTBREAK_LIMIT': break;
      case 'PLAYER_DECK_EMPTY': invariant(state.playerDeck.length === 0, 'empty player deck loss'); break;
      case 'CUBE_SUPPLY_EXHAUSTED':
        invariant(state.supply[loss.color] === 0 && ids.includes(loss.locationId)
          && state.cubes[loss.locationId]![loss.color] < 3, 'cube supply loss');
        break;
      default: invariant(false, 'loss reason');
    }
  }
}
