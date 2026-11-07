import { describe, expect, it } from 'vitest';
import { assertGameInvariants, COLORS, createGame, loadBoard, nextUint32, randomIndex,
  ROLES, shuffle, type GameConfig, type GameState, type RosterPlayer } from './index';

function roster(count: number): RosterPlayer[] {
  return ROLES.slice(0, count).map((role, seat) => ({ role, seat, userId: `firebase-user:${seat}` }));
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const infectionDraws = {
  1: ['A02', 'C06', 'B06', 'D06', 'D01', 'F03', 'E04', 'E08', 'E07'],
  42: ['D03', 'B04', 'C02', 'B07', 'F08', 'E04', 'A02', 'A04', 'C06'],
};
// Independently derived with integer-mask Python reference; not snapshots of this engine.
const vectors = [
  { seed: 1, count: 2, hands: [['D01','C02','A04','E07'],['E01','D05','F08','E06']], epidemics: [4,21,31,42], rng: 1696915948 },
  { seed: 1, count: 3, hands: [['D01','D05','E07'],['E01','A04','E06'],['C02','F08','F06']], epidemics: [4,21,31,38], rng: 1740906088 },
  { seed: 1, count: 4, hands: [['D01','A04'],['E01','F08'],['C02','E07'],['D05','E06']], epidemics: [4,21,31,42], rng: 1696915948 },
  { seed: 42, count: 2, hands: [['B02','C04','C05','D04'],['E01','D03','C08','B03']], epidemics: [7,18,31,33], rng: 1140579860 },
  { seed: 42, count: 3, hands: [['B02','D03','D04'],['E01','C05','B03'],['C04','C08','A03']], epidemics: [7,18,31,37], rng: 2273023565 },
  { seed: 42, count: 4, hands: [['B02','C05'],['E01','C08'],['C04','D04'],['D03','B03']], epidemics: [7,18,31,33], rng: 1140579860 },
] as const;

describe('E02 deterministic random stream', () => {
  it('matches the specified xorshift32 vector', () => {
    let state = 1;
    const actual = Array.from({ length: 10 }, () => (state = nextUint32(state)));
    expect(actual).toEqual([270369,67634689,2647435461,307599695,2398689233,745495504,632435482,435756210,2005365029,2916098932]);
  });
  it.each([
    [1, [5,0,2,1,6,7,9,4,3,8], 2005365029],
    [42, [9,7,0,4,3,8,5,2,6,1], 3120216979],
  ] as const)('matches independent shuffle seed %i', (seed, expected, state) => {
    const input = freeze([0,1,2,3,4,5,6,7,8,9]);
    expect(shuffle(input, seed)).toEqual({ items: expected, state });
    expect(input).toEqual([0,1,2,3,4,5,6,7,8,9]);
  });
  it('rejects out-of-domain draws before modulo and advances the stream', () => {
    expect(randomIndex(67634689, 2147483648)).toEqual({ value: 307599694, state: 307599695 });
    expect(randomIndex(1, 1)).toEqual({ value: 0, state: 270369 });
  });
  it.each([0, -1, 1.5, NaN, Infinity, 4294967296])('rejects invalid seed %s in every entry point', seed => {
    expect(() => nextUint32(seed)).toThrow();
    expect(() => randomIndex(seed, 2)).toThrow();
    expect(() => shuffle([], seed)).toThrow();
    expect(() => createGame({ players: roster(2) }, seed)).toThrow();
  });
  it.each([0, -1, 1.5, NaN, Infinity, 4294967296])('rejects invalid bound %s', bound => {
    expect(() => randomIndex(1, bound)).toThrow();
  });
  it('empty/singleton shuffles copy input without consuming RNG', () => {
    expect(shuffle([], 42)).toEqual({ items: [], state: 42 });
    expect(shuffle(['only'], 42)).toEqual({ items: ['only'], state: 42 });
  });
});

describe('E01/E02 canonical setup', () => {
  it.each(vectors)('matches frozen seed $seed / $count player setup', vector => {
    const config = freeze({ players: roster(vector.count), board: loadBoard() });
    const before = JSON.stringify(config);
    const state = createGame(config, vector.seed);
    expect(state).toEqual(createGame(config, vector.seed));
    expect(JSON.stringify(config)).toBe(before);
    expect(state.players.map(player => player.hand)).toEqual(vector.hands.map(hand => hand.map(id => `p:${id}`)));
    expect(state.infectionDiscard).toEqual([...infectionDraws[vector.seed]].reverse().map(id => `i:${id}`));
    expect(state.playerDeck.flatMap((card, index) => card.startsWith('e:') ? [index] : [])).toEqual(vector.epidemics);
    expect(state.rngState).toBe(vector.rng);
    expect(state.supply).toEqual(vector.seed === 1
      ? { blue: 21, yellow: 18, red: 19, black: 20 }
      : { blue: 16, yellow: 21, red: 19, black: 22 });
    expect(state).toMatchObject({ schemaVersion: 1, rulesVersion: 'containment-v1', boardVersion: 'grid48-v1',
      phase: 'ACTIONS', activeSeat: 0, actionsRemaining: 4, centers: ['A01'],
      cured: { blue: false, yellow: false, red: false, black: false }, outbreakCount: 0, rateIndex: 0,
      continuation: null, outcome: null, playerDiscard: [], resolvedEpidemics: [] });
    expect(state.players.every(player => player.locationId === 'A01')).toBe(true);
    for (const [index, id] of infectionDraws[vector.seed].entries()) {
      const color = config.board.locations.find(location => location.id === id)!.color;
      expect(state.cubes[id]![color]).toBe(3 - Math.floor(index / 3));
    }
    expect(state.infectionDeck).toHaveLength(39);
    expect(state.infectionDiscard).toHaveLength(9);
    expect(Object.values(state.cubes).flatMap(counts => COLORS.map(color => counts[color])).reduce((a,b) => a+b, 0)).toBe(18);
    expect(() => assertGameInvariants(state)).not.toThrow();
  });
  it('preserves sparse seats, opaque UID and ascending seat deal regardless of input array order', () => {
    const players = freeze([{ userId: 'CaseSensitive:UID', seat: 3, role: 'scientist' },
      { userId: 'casesensitive:uid', seat: 1, role: 'medic' }] as const);
    const state = createGame({ players }, 1);
    expect(state.activeSeat).toBe(1);
    expect(state.players.map(player => player.seat)).toEqual([1, 3]);
    expect(state.players[0]!.hand).toEqual(['p:D01','p:C02','p:A04','p:E07']);
    expect(state.players[0]!.userId).toBe('casesensitive:uid');
    expect(players[0].seat).toBe(3);
  });
  it('freezes the complete independently derived seed1 player deck', () => {
    expect(createGame({ players: roster(2) }, 1).playerDeck).toEqual([
      'p:F07','p:F04','p:B06','p:B04','e:1','p:D03','p:C06','p:F06','p:A05','p:F05','p:C01',
      'p:C08','p:D06','p:F02','p:B02','p:E02','p:D02','p:B05','p:D04','p:B01','p:F03','e:2',
      'p:A03','p:A07','p:A01','p:E08','p:A08','p:C05','p:A02','p:D08','p:E03','e:3','p:A06',
      'p:C07','p:F01','p:C03','p:E05','p:E04','p:D07','p:B03','p:B08','p:B07','e:4','p:C04',
    ]);
  });
  it('does not share mutable state between games or with the input roster', () => {
    const players = roster(2);
    const first = createGame({ players }, 1);
    const second = createGame({ players }, 1);
    expect(first.players[0]).not.toBe(players[0]);
    expect(first.players[0]!.hand).not.toBe(second.players[0]!.hand);
    expect(first.cubes.A01).not.toBe(second.cubes.A01);
    expect(first.playerDeck).not.toBe(second.playerDeck);
  });
  it('partitions 3-player remaining deck into 11,11,11,10 cards with one epidemic per pile', () => {
    const state = createGame({ players: roster(3) }, 1);
    for (const [index, offset] of [0,11,22,33].entries()) {
      const cards = state.playerDeck.slice(offset, offset + (index === 3 ? 10 : 11));
      expect(cards.filter(card => card.startsWith('e:'))).toEqual([`e:${index + 1}`]);
    }
  });
  it('conserves cards and cubes across 100 seeds per player count plus max uint32', () => {
    for (const count of [2, 3, 4]) for (const seed of [...Array.from({ length: 100 }, (_, i) => i+1), 0xffffffff]) {
      const state = createGame({ players: roster(count) }, seed);
      assertGameInvariants(state);
      expect(state.players.map(player => player.hand.length)).toEqual(Array(count).fill(count === 2 ? 4 : count === 3 ? 3 : 2));
    }
  });
});

describe('invalid setup and invariant failures', () => {
  it.each([
    [], roster(1), [...roster(4), roster(2)[0]],
    [{ ...roster(2)[0], seat: -1 }, roster(2)[1]],
    [{ ...roster(2)[0], seat: 4 }, roster(2)[1]],
    [{ ...roster(2)[0], seat: 0.5 }, roster(2)[1]],
    [{ ...roster(2)[0], userId: '' }, roster(2)[1]],
    [{ ...roster(2)[0], userId: 'x'.repeat(129) }, roster(2)[1]],
    [{ ...roster(2)[0], role: 'unknown' }, roster(2)[1]],
    [roster(2)[0], { ...roster(2)[1], seat: 0 }],
    [roster(2)[0], { ...roster(2)[1], role: 'medic' }],
    [roster(2)[0], { ...roster(2)[1], userId: 'firebase-user:0' }],
    [null, null],
  ].map(players => ({ players })))('rejects malformed roster %#', ({ players }) => {
    expect(() => createGame({ players } as GameConfig, 1)).toThrow();
  });
  it.each([null, {}, { players: roster(2), rulesVersion: 'unknown' }, { players: roster(2), boardVersion: 'unknown' }])('rejects config %#', config => {
    expect(() => createGame(config as GameConfig, 1)).toThrow();
  });
  it('detects corrupted snapshots instead of silently repairing them', () => {
    const state = createGame({ players: roster(2) }, 1);
    const broken: GameState[] = [
      { ...state, supply: { ...state.supply, blue: state.supply.blue + 1 } },
      { ...state, playerDeck: state.playerDeck.slice(1) },
      { ...state, infectionDeck: [...state.infectionDeck, state.infectionDeck[0]!] },
      { ...state, centers: ['A01', 'A01'] },
      { ...state, activeSeat: 3 },
      { ...state, actionsRemaining: 0 },
      { ...state, resolvedEpidemics: ['e:1'] },
      { ...state, phase: 'DISCARD_REQUIRED' },
    ];
    for (const value of broken) expect(() => assertGameInvariants(value)).toThrow();
  });
});

describe('canonical board validation', () => {
  it('owns its data and canonicalizes arrays without modifying input', () => {
    const board = loadBoard();
    const reordered = freeze({ ...board, locations: [...board.locations].reverse().map(location => ({ ...location, neighbors: [...location.neighbors].reverse() })) });
    expect(loadBoard(reordered)).toEqual(board);
    expect(loadBoard()).not.toBe(board);
    expect(loadBoard().locations[0]!.neighbors).not.toBe(board.locations[0]!.neighbors);
  });
  it('rejects missing, duplicate, changed or disconnected graph/config data', () => {
    const board = loadBoard();
    const first = board.locations[0]!;
    const invalid = [null, {}, { ...board, startLocation: 'A02' }, { ...board, width: -1 },
      { ...board, locations: board.locations.slice(1) },
      ...[{ ...first, id: 'BAD' }, { ...first, color: 'green' }, { ...first, neighbors: [] },
        { ...first, neighbors: ['A02', 'A02'] }, { ...first, neighbors: ['A01', 'B01'] }, board.locations[1]!]
        .map(location => ({ ...board, locations: [location, ...board.locations.slice(1)] })),
    ];
    for (const value of invalid) {
      expect(() => loadBoard(value)).toThrow();
      expect(() => createGame({ players: roster(2), board: value }, 1)).toThrow();
    }
  });
});
