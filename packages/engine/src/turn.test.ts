import { describe, expect, it } from 'vitest';
import { applyCommand, assertGameInvariants, createGame, loadBoard,
  type EpidemicCardId, type GameState, type InfectionCardId, type LocationCardId, type PlayerCardId } from './index';

const locations = loadBoard().locations;
const epidemics: EpidemicCardId[] = ['e:1', 'e:2', 'e:3', 'e:4'];
const allInfections = locations.map(({ id }): InfectionCardId => `i:${id}`);
const pass = { type: 'PASS', payload: {} };

function fixture({
  playerDeck = ['p:A01', 'p:A02'],
  hand = [],
  infectionTop = [],
  infectionBottom = [],
  infectionDiscard = [],
  blue = {},
  rateIndex = 0,
  outbreakCount = 0,
}: {
  playerDeck?: PlayerCardId[];
  hand?: LocationCardId[];
  infectionTop?: InfectionCardId[];
  infectionBottom?: InfectionCardId[];
  infectionDiscard?: InfectionCardId[];
  blue?: Record<string, number>;
  rateIndex?: number;
  outbreakCount?: number;
} = {}): GameState {
  const base = createGame({ players: [
    { userId: 'first', seat: 0, role: 'scientist' },
    { userId: 'next', seat: 3, role: 'medic' },
  ] }, 1);
  const otherCards = allInfections.filter(card =>
    ![...infectionTop, ...infectionBottom, ...infectionDiscard].includes(card));
  const playerDiscard = locations.map(({ id }): LocationCardId => `p:${id}`)
    .filter(card => !playerDeck.includes(card) && !hand.includes(card));
  return {
    ...base, actionsRemaining: 1, rateIndex, outbreakCount, rngState: 1,
    playerDeck, playerDiscard, resolvedEpidemics: epidemics.filter(card => !playerDeck.includes(card)),
    players: [{ ...base.players[0]!, hand }, { ...base.players[1]!, hand: [] }],
    infectionDeck: [...infectionTop, ...otherCards, ...infectionBottom], infectionDiscard,
    cubes: Object.fromEntries(locations.map(({ id }) => [id, { blue: blue[id] ?? 0, red: 0, yellow: 0, black: 0 }])),
    supply: { blue: 24 - Object.values(blue).reduce((sum, cubes) => sum + cubes, 0), red: 24, yellow: 24, black: 24 },
  };
}

function freeze(value: unknown) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}

function resolve(state: GameState, command: unknown = pass) {
  assertGameInvariants(state);
  freeze(state);
  const before = JSON.stringify(state);
  const actor = state.players.find(player => player.seat === state.activeSeat)!;
  const result = applyCommand(state, actor.userId, command);
  if (!result.ok) throw new Error(result.error);
  expect(JSON.stringify(state)).toBe(before);
  expect(result).toEqual(applyCommand(state, actor.userId, command));
  assertGameInvariants(result.state);
  return result;
}

describe('automatic draw and infection', () => {
  it('E11 draws two, infects at the current rate and wraps occupied seats', () => {
    const base = fixture({ infectionTop: ['i:A01', 'i:A02', 'i:B01'], rateIndex: 3 });
    const state = { ...base, activeSeat: 3 };
    const result = resolve(state);
    expect(result.state.players[1]!.hand).toEqual(['p:A01', 'p:A02']);
    expect(result.state.infectionDiscard).toEqual(['i:B01', 'i:A02', 'i:A01']);
    expect(result.state).toMatchObject({ activeSeat: 0, actionsRemaining: 4, phase: 'ACTIONS', rngState: 1 });
    expect(result.events.filter(event => event.type === 'PLAYER_CARD_DRAWN').map(event => event.cardId))
      .toEqual(['p:A01', 'p:A02']);
  });

  it('E13 pauses after both over-limit draws and resumes exactly the remaining draws', () => {
    const base = fixture({ hand: ['p:B01', 'p:B02', 'p:B03', 'p:B04', 'p:B05', 'p:B06', 'p:B07'] });
    const first = resolve(base).state;
    expect(first.continuation).toEqual({ userId: 'first', resume: { phase: 'DRAW', drawsRemaining: 1 } });
    expect(first.playerDeck).toEqual(['p:A02']);
    const second = resolve(first, { type: 'DISCARD', payload: { cardIds: ['p:A01'] } }).state;
    expect(second.continuation).toEqual({ userId: 'first', resume: { phase: 'DRAW', drawsRemaining: 0 } });
    expect(second.playerDeck).toEqual([]);
    expect(second.infectionDeck).toEqual(base.infectionDeck);
    const third = resolve(second, { type: 'DISCARD', payload: { cardIds: ['p:A02'] } }).state;
    expect(third).toMatchObject({ activeSeat: 3, phase: 'ACTIONS', continuation: null });
    expect(third.infectionDeck).toEqual(base.infectionDeck.slice(2));
  });

  it('E14/E17 resolves two epidemics in order and resets visited for each normal infection', () => {
    const base = fixture({ playerDeck: ['e:1', 'e:2'], infectionBottom: ['i:A02', 'i:A01'] });
    const { state, events } = resolve(base);
    expect(events.filter(event => event.type === 'EPIDEMIC_DRAWN').map(event => event.cardId)).toEqual(['e:1', 'e:2']);
    expect(events.filter(event => event.type === 'OUTBREAK').map(event => event.locationId)).toEqual(['A02', 'A01', 'A01', 'A02']);
    expect(state).toMatchObject({ rateIndex: 2, outbreakCount: 4, activeSeat: 3, rngState: 1 });
    expect(state.infectionDiscard).toEqual(['i:A01', 'i:A02']);
    expect(state.infectionDeck).toEqual(base.infectionDeck.slice(0, -2));
    expect(state.supply.blue).toBe(12);
  });

  it('E15 uses one visited set per epidemic and intensifies the entire discard', () => {
    const base = fixture({ playerDeck: ['e:1', 'p:A01'], blue: { A01: 2 }, rateIndex: 2,
      infectionBottom: ['i:A01'], infectionDiscard: ['i:C01', 'i:D01'],
      hand: ['p:B01', 'p:B02', 'p:B03', 'p:B04', 'p:B05', 'p:B06', 'p:B07'],
    });
    const { state } = resolve(base);
    expect(state).toMatchObject({ phase: 'DISCARD_REQUIRED', rateIndex: 3, outbreakCount: 1, rngState: 67634689 });
    expect(['A01', 'A02', 'B01'].map(id => state.cubes[id]!.blue)).toEqual([3, 1, 1]);
    expect(state.supply.blue).toBe(19);
    expect(state.infectionDiscard).toEqual([]);
    expect(state.infectionDeck).toEqual(['i:C01', 'i:A01', 'i:D01', ...base.infectionDeck.slice(0, -1)]);
  });

  it('E16 traverses cyclic neighbors in stable order without adding fourth cubes', () => {
    const base = fixture({ infectionTop: ['i:A01', 'i:F08'], blue: { A01: 3, A02: 3, B01: 3, B02: 3 } });
    const { state, events } = resolve(base);
    expect(events.filter(event => event.type === 'OUTBREAK').map(event => event.locationId)).toEqual(['A01', 'A02', 'B02', 'B01']);
    expect(events.flatMap(event => event.type === 'CUBE_ADDED' && event.color === 'blue' ? [event.locationId] : []))
      .toEqual(['A03', 'C01', 'B03', 'C02']);
    expect(state.supply.blue).toBe(8);
  });

  it('E18 stops an epidemic at the outbreak cap and finalizes both cards', () => {
    const base = fixture({ playerDeck: ['e:1', 'p:A01'], blue: { A01: 3 }, outbreakCount: 7,
      infectionBottom: ['i:A01'], infectionDiscard: ['i:C01'],
    });
    const { state } = resolve(base);
    expect(state.outcome).toEqual({ kind: 'lost', reason: 'OUTBREAK_LIMIT' });
    expect(state.outbreakCount).toBe(8);
    expect(state.cubes).toEqual(base.cubes);
    expect(state.playerDeck).toEqual(['p:A01']);
    expect(state.resolvedEpidemics).toContain('e:1');
    expect(state.infectionDiscard).toEqual(['i:A01', 'i:C01']);
    expect(state.rngState).toBe(1);
  });

  it('E19 allows zero supply and loses at the next required addition', () => {
    const blue = { B01: 3, B02: 3, B03: 3, B04: 3, C01: 3, C02: 3, C03: 3, C04: 2 };
    const { state } = resolve(fixture({ blue, infectionTop: ['i:A01', 'i:A02', 'i:B01'] }));
    expect(state.outcome).toEqual({ kind: 'lost', reason: 'CUBE_SUPPLY_EXHAUSTED', color: 'blue', locationId: 'A02' });
    expect(state.cubes.A01!.blue).toBe(1);
    expect(state.cubes.A02!.blue).toBe(0);
    expect(state.supply.blue).toBe(0);
    expect(state.infectionDiscard).toEqual(['i:A02', 'i:A01']);
    expect(state.infectionDeck[0]).toBe('i:B01');
  });

  it('E20 resolves the last card before losing on the next required draw', () => {
    const base = fixture({ playerDeck: ['p:A01'] });
    const { state } = resolve(base);
    expect(state.outcome).toEqual({ kind: 'lost', reason: 'PLAYER_DECK_EMPTY' });
    expect(state.players[0]!.hand).toEqual(['p:A01']);
    expect(state.infectionDeck).toEqual(base.infectionDeck);
  });

  it('E22 infects cured locations even when the Medic is present', () => {
    const base = fixture({ infectionTop: ['i:A01', 'i:A02'] });
    const cured = { ...base.cured, blue: true };
    const { state } = resolve({ ...base, cured });
    expect(state.cubes.A01!.blue).toBe(1);
    expect(state.cubes.A02!.blue).toBe(1);
  });

  it('refills an empty infection deck deterministically for top and bottom draws', () => {
    const base = fixture({ infectionDiscard: allInfections });
    const normal = resolve(base).state;
    expect(normal.infectionDeck).toHaveLength(46);
    expect(normal.infectionDiscard).toHaveLength(2);
    expect(normal.rngState).not.toBe(1);
    const epidemic = resolve({ ...base, playerDeck: ['e:1', 'p:A01'],
      playerDiscard: ['p:A02', ...base.playerDiscard], resolvedEpidemics: ['e:2', 'e:3', 'e:4'],
    }).state;
    expect(epidemic.rateIndex).toBe(1);
    expect(epidemic.infectionDeck).toHaveLength(46);
    expect(epidemic.infectionDiscard).toHaveLength(2);
  });

  it('throws on missing infection cards without mutating the input snapshot', () => {
    const state = { ...fixture(), infectionDeck: [], infectionDiscard: [] };
    freeze(state);
    const before = JSON.stringify(state);
    expect(() => applyCommand(state, 'first', pass)).toThrow('no infection cards to draw');
    expect(JSON.stringify(state)).toBe(before);
  });
});
