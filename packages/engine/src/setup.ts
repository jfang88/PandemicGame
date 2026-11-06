import { isRecord, loadBoard } from './board';
import { shuffle, validateSeed } from './random';
import { assertGameInvariants } from './invariants';
import { BOARD_VERSION, COLORS, ROLES, RULES_VERSION, type Color, type GameConfig,
  type GameState, type InfectionCardId, type LocationCardId, type PlayerCardId, type RosterPlayer } from './types';

export function validateRoster(players: unknown): RosterPlayer[] {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
    throw new TypeError('Expected 2–4 players');
  }
  const roster = players.map((player: unknown) => {
    if (!isRecord(player) || typeof player.userId !== 'string' || player.userId.length < 1 || player.userId.length > 128
      || typeof player.seat !== 'number' || !Number.isInteger(player.seat) || player.seat < 0 || player.seat > 3
      || !ROLES.includes(player.role as RosterPlayer['role'])) throw new TypeError('Invalid player');
    return { userId: player.userId, seat: player.seat, role: player.role as RosterPlayer['role'] };
  });
  for (const key of ['userId', 'seat', 'role'] as const) {
    if (new Set(roster.map(player => player[key])).size !== roster.length) throw new TypeError(`Duplicate ${key}`);
  }
  return roster.sort((a, b) => a.seat - b.seat);
}

export function createGame(config: GameConfig, seed: number): GameState {
  validateSeed(seed);
  if (!isRecord(config)
    || (config.rulesVersion !== undefined && config.rulesVersion !== RULES_VERSION)
    || (config.boardVersion !== undefined && config.boardVersion !== BOARD_VERSION)) {
    throw new TypeError('Unsupported game configuration');
  }
  const roster = validateRoster(config.players);
  const board = loadBoard(config.board);
  const cubes: Record<string, Record<Color, number>> = {};
  for (const location of board.locations) cubes[location.id] = { blue: 0, yellow: 0, red: 0, black: 0 };
  const supply = { blue: 24, yellow: 24, red: 24, black: 24 };
  const infected = shuffle(board.locations.map(location => `i:${location.id}` as InfectionCardId), seed);
  const infectionDiscard: InfectionCardId[] = [];
  for (const [index, card] of infected.items.slice(0, 9).entries()) {
    const location = board.locations.find(location => `i:${location.id}` === card)!;
    const count = 3 - Math.floor(index / 3);
    cubes[location.id]![location.color] = count;
    supply[location.color] -= count;
    infectionDiscard.unshift(card);
  }
  const dealt = shuffle(board.locations.map(location => `p:${location.id}` as LocationCardId), infected.state);
  const handSize = roster.length === 2 ? 4 : roster.length === 3 ? 3 : 2;
  const players = roster.map(player => ({ ...player, locationId: board.startLocation, hand: [] as LocationCardId[] }));
  let cursor = 0;
  for (let round = 0; round < handSize; round++) {
    for (const player of players) player.hand.push(dealt.items[cursor++]!);
  }
  const remaining = dealt.items.slice(cursor);
  const playerDeck: PlayerCardId[] = [];
  let rngState = dealt.state;
  cursor = 0;
  for (const epidemic of [1, 2, 3, 4] as const) {
    const size = Math.floor(remaining.length / 4) + (epidemic <= remaining.length % 4 ? 1 : 0);
    const pile: PlayerCardId[] = [...remaining.slice(cursor, cursor + size), `e:${epidemic}`];
    cursor += size;
    const shuffled = shuffle(pile, rngState);
    playerDeck.push(...shuffled.items);
    rngState = shuffled.state;
  }
  const state: GameState = {
    schemaVersion: 1, rulesVersion: RULES_VERSION, boardVersion: BOARD_VERSION,
    phase: 'ACTIONS', players, activeSeat: players[0]!.seat, actionsRemaining: 4,
    cubes, supply, centers: [board.startLocation],
    cured: Object.fromEntries(COLORS.map(color => [color, false])) as Record<Color, boolean>,
    outbreakCount: 0, rateIndex: 0, playerDeck, playerDiscard: [],
    infectionDeck: infected.items.slice(9), infectionDiscard, resolvedEpidemics: [],
    rngState, continuation: null, outcome: null,
  };
  assertGameInvariants(state);
  return state;
}
