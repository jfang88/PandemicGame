import { describe, expect, it } from 'vitest';
import { applyCommand, assertGameInvariants, createGame, listLegalActions, type ActionCommand, type ActionError,
  type GameState, type LocationCardId, type Role } from './index';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function fixture(role: Role = 'scientist', hand: LocationCardId[] = []): GameState {
  const state = createGame({ players: [
    { userId: 'actor', seat: 1, role },
    { userId: 'other', seat: 3, role: role === 'courier' ? 'scientist' : 'courier' },
  ] }, 1);
  const deck = [...state.playerDeck, ...state.players.flatMap(player => player.hand)].filter(card => !hand.includes(card as LocationCardId));
  const next = { ...state, playerDeck: deck, players: state.players.map((player, i) => ({ ...player, hand: i === 0 ? hand : [] })) };
  assertGameInvariants(next);
  return next;
}
function at(state: GameState, locationId: string): GameState {
  return { ...state, players: state.players.map((player, i) => i === 0 ? { ...player, locationId } : player) };
}
function cubes(state: GameState): GameState {
  const current = state.cubes.A01!;
  return { ...state, cubes: { ...state.cubes, A01: { ...current, blue: 3, red: 2 } },
    supply: { ...state.supply, blue: state.supply.blue + current.blue - 3, red: state.supply.red + current.red - 2 } };
}
function accept(state: GameState, command: ActionCommand, resolvesTurn = false) {
  assertGameInvariants(state);
  const input = freeze(state); const before = JSON.stringify(input);
  const result = applyCommand(input, 'actor', freeze(command));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(JSON.stringify(input)).toBe(before);
  expect(result.state).not.toBe(input);
  if (!resolvesTurn) {
    expect(result.state.actionsRemaining).toBe(state.actionsRemaining - 1);
    expect(result.state.rngState).toBe(state.rngState);
  }
  expect(result).toEqual(applyCommand(input, 'actor', command));
  assertGameInvariants(result.state);
  return result;
}
function reject(state: GameState, input: unknown, error: ActionError = 'ILLEGAL_ACTION', actor = 'actor') {
  const before = JSON.stringify(state); freeze(state); freeze(input);
  const result = applyCommand(state, actor, input);
  expect(result).toEqual({ ok: false, error, state, events: [] });
  expect(result.state).toBe(state);
  expect(JSON.stringify(state)).toBe(before);
}
const move = (destination: string): ActionCommand => ({ type: 'MOVE', payload: { destination } });
const give = (cardId: LocationCardId, recipientUserId = 'other'): ActionCommand =>
  ({ type: 'GIVE_CARD', payload: { cardId, recipientUserId } });
const discard = (...cardIds: LocationCardId[]): ActionCommand => ({ type: 'DISCARD', payload: { cardIds } });
const cureBlack = (...cardIds: LocationCardId[]): ActionCommand =>
  ({ type: 'DISCOVER_CURE', payload: { color: 'black', cardIds } });

describe('legal action enumeration', () => {
  it('lists each cure payment and all flight choices from a known hand', () => {
    const cards: LocationCardId[] = ['p:D05', 'p:D06', 'p:D07', 'p:D08', 'p:E05'];
    const state = { ...fixture('scientist', ['p:A01', ...cards]), centers: ['A01', 'B02'] };
    const actions = listLegalActions(state, 'actor');
    expect(actions.filter(action => action.type === 'DISCOVER_CURE')).toEqual([
      cureBlack('p:D05', 'p:D06', 'p:D07', 'p:D08'),
      cureBlack('p:D05', 'p:D06', 'p:D07', 'p:E05'),
      cureBlack('p:D05', 'p:D06', 'p:D08', 'p:E05'),
      cureBlack('p:D05', 'p:D07', 'p:D08', 'p:E05'),
      cureBlack('p:D06', 'p:D07', 'p:D08', 'p:E05'),
    ]);
    expect(actions.filter(action => action.type === 'CHARTER_FLIGHT')).toHaveLength(47);
    expect(actions.filter(action => action.type === 'DIRECT_FLIGHT')).toHaveLength(5);
    expect(actions.filter(action => action.type === 'SHUTTLE')).toEqual([{ type: 'SHUTTLE', payload: { destination: 'B02' } }]);
    expect(actions.filter(action => action.type === 'MOVE')).toEqual([move('A02'), move('B01')]);
    expect(actions.filter(action => action.type === 'GIVE_CARD')).toEqual([give('p:A01')]);
    expect(new Set(actions.map(action => JSON.stringify(action))).size).toBe(actions.length);
    expect(actions.every(action => applyCommand(state, 'actor', action).ok)).toBe(true);
  });

  it('lists each valid discard for the recipient during a transfer pause', () => {
    const state = accept(sharingFixture(2, 7), give('p:A01')).state;
    const choices = listLegalActions(state, 'other');
    expect(choices).toEqual(state.players[1]!.hand.map(card => discard(card)));
    expect(listLegalActions(state, 'actor')).toEqual([]);
    expect(choices.every(action => applyCommand(state, 'other', action).ok)).toBe(true);
  });

  it('lists only legal role-specific build and sharing choices', () => {
    const builder = at(fixture('builder'), 'B01');
    expect(listLegalActions(builder, 'actor')).toContainEqual({ type: 'BUILD_CENTER', payload: {} });
    expect(listLegalActions({ ...builder, centers: ['A01','A02','A03','A04','A05','A06'] }, 'actor'))
      .not.toContainEqual({ type: 'BUILD_CENTER', payload: {} });
    const courier = fixture('courier', ['p:B01', 'p:B02']);
    expect(listLegalActions(courier, 'actor').filter(action => action.type === 'GIVE_CARD'))
      .toEqual([give('p:B01'), give('p:B02')]);
    expect(listLegalActions(at(courier, 'A02'), 'actor').filter(action => action.type === 'GIVE_CARD')).toEqual([]);
  });
});

function sharingFixture(actionsRemaining: number, handSize: number): GameState {
  const state = fixture('scientist', ['p:A01', 'p:B01']);
  const cards: LocationCardId[] = ['p:A02', 'p:A03', 'p:A04', 'p:A05', 'p:A06', 'p:A07', 'p:A08'];
  const hand = cards.slice(0, handSize);
  return { ...state, actionsRemaining,
    playerDeck: state.playerDeck.filter(card => !hand.some(id => id === card)),
    players: [state.players[0]!, { ...state.players[1]!, hand }],
  };
}

describe('E09/E12 card sharing and continuations', () => {
  it('transfers a matching card to reach seven with no discard pause', () => {
    const state = sharingFixture(4, 6);
    const result = accept(state, give('p:A01'));
    expect(result.state.phase).toBe('ACTIONS');
    expect(result.state.continuation).toBeNull();
    expect(result.state.players.map(player => player.hand)).toEqual([
      ['p:B01'], [...state.players[1]!.hand, 'p:A01'],
    ]);
    expect(result.events[0]).toEqual({ type: 'CARD_GIVEN', userId: 'actor', recipientUserId: 'other', cardId: 'p:A01' });
    expect(result.state.playerDiscard).toEqual([]);
  });

  it('enforces ownership, different co-located recipient and the Courier exception', () => {
    const state = sharingFixture(4, 6);
    reject(state, give('p:B01'));
    reject(state, give('p:A02'));
    reject(state, give('p:A01', 'actor'));
    reject(state, give('p:A01', 'unknown'));
    reject(state, discard('p:A01'), 'WRONG_PHASE');
    const courier = fixture('courier', ['p:B01']);
    expect(accept(courier, give('p:B01')).state.players[1]!.hand).toEqual(['p:B01']);
    reject(at(courier, 'A02'), give('p:B01'));
  });

  it.each([1, 2])('pauses for the recipient with %s action(s) left before sharing', actions => {
    const state = sharingFixture(actions, 7);
    const paused = accept(state, give('p:A01')).state;
    const resume = actions === 1 ? { phase: 'DRAW', drawsRemaining: 2 }
      : { phase: 'ACTIONS', actionsRemaining: 1 };
    expect(paused.phase).toBe('DISCARD_REQUIRED');
    expect(paused.continuation).toEqual({ userId: 'other', resume });
    expect(paused.players[1]!.hand).toHaveLength(8);
    reject(paused, discard('p:A01'), 'WRONG_TURN');
    reject(paused, move('A02'), 'WRONG_PHASE', 'other');
    reject(paused, discard(), 'BAD_REQUEST', 'other');
    reject(paused, discard('p:A01', 'p:A01'), 'ILLEGAL_ACTION', 'other');
    reject(paused, discard('p:A01', 'p:A02'), 'ILLEGAL_ACTION', 'other');
    reject(paused, discard('p:B01'), 'ILLEGAL_ACTION', 'other');
    const command = freeze(discard('p:A01'));
    const result = applyCommand(paused, 'other', command);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result).toEqual(applyCommand(paused, 'other', command));
    expect(result.state.players[1]).toEqual(state.players[1]);
    expect(result.state.playerDiscard).toEqual(['p:A01']);
    expect(result.state.continuation).toBeNull();
    expect(result.events.slice(0, 2)).toEqual([
      { type: 'CARD_DISCARDED', userId: 'other', cardId: 'p:A01' },
      { type: 'PHASE_CHANGED', phase: resume.phase },
    ]);
    if (actions === 1) {
      expect(result.state).toMatchObject({ phase: 'ACTIONS', activeSeat: 3, actionsRemaining: 4 });
      expect(result.state.playerDeck).toEqual(paused.playerDeck.slice(2));
    } else {
      expect(result.state).toEqual({ ...paused, phase: 'ACTIONS', continuation: null,
        players: [paused.players[0], state.players[1]], playerDiscard: ['p:A01'] });
    }
    assertGameInvariants(result.state);
  });
});

describe('E10/E21 cure costs and immediate victory', () => {
  const black: LocationCardId[] = ['p:D05', 'p:D06', 'p:D07', 'p:D08', 'p:E05'];

  it.each(['scientist', 'medic'] as const)('%s pays the exact matching-card cost', role => {
    const required = role === 'scientist' ? 4 : 5;
    const payment = black.slice(0, required);
    const state = fixture(role, [...black, 'p:D04']);
    const result = accept(state, cureBlack(...payment));
    expect(result.state.cured.black).toBe(true);
    expect(result.state.playerDiscard).toEqual([...payment].reverse());
    expect(result.state.players[0]!.hand).toEqual([...black.slice(required), 'p:D04']);
    expect(result.events).toContainEqual({ type: 'CURE_DISCOVERED', userId: 'actor', color: 'black' });
    reject(state, cureBlack(...black.slice(0, required === 4 ? 5 : 4)));
    reject(state, cureBlack(...payment.slice(1), payment[1]!));
    reject(state, cureBlack(...payment.slice(1), 'p:D04'));
    reject(state, cureBlack(...payment.slice(1), 'p:F08'));
    reject(at(state, 'A02'), cureBlack(...payment));
    reject({ ...state, cured: { ...state.cured, black: true } }, cureBlack(...payment));
  });

  it('wins on the fourth action without drawing from an empty deck', () => {
    const payment = black.slice(0, 4);
    const base = fixture('scientist', payment);
    const state: GameState = { ...base, actionsRemaining: 1, playerDeck: [],
      cured: { blue: true, yellow: true, red: true, black: false },
      resolvedEpidemics: ['e:1', 'e:2', 'e:3', 'e:4'],
      playerDiscard: base.playerDeck.filter((card): card is LocationCardId => card.startsWith('p:')),
    };
    const result = accept(state, cureBlack(...payment));
    expect(result.state.phase).toBe('WON');
    expect(result.state.outcome).toEqual({ kind: 'won' });
    expect(result.state.activeSeat).toBe(state.activeSeat);
    expect(result.state.playerDeck).toEqual([]);
    expect(result.state.infectionDeck).toBe(state.infectionDeck);
    expect(result.events.at(-1)).toEqual({ type: 'PHASE_CHANGED', phase: 'WON' });
    reject(result.state, discard('p:A01'), 'GAME_FINISHED', 'other');
  });
});

describe('E03 movement', () => {
  it('moves one edge for one action, then rejects nonadjacent A04', () => {
    const start = fixture();
    const result = accept(start, move('A02'));
    expect(result.state.players[0]!.locationId).toBe('A02');
    expect(result.state.playerDiscard).toEqual([]);
    expect(result.events).toEqual([
      { type: 'PLAYER_MOVED', userId: 'actor', from: 'A01', to: 'A02', method: 'MOVE' },
      { type: 'ACTION_SPENT', userId: 'actor', actionsRemaining: 3 },
    ]);
    reject(result.state, move('A04'));
  });
  it.each(['A01','F08','UNKNOWN'])('rejects destination %s', destination => reject(fixture(), move(destination)));
  it('has no passive Medic effect on entry into a cured infected location', () => {
    const state = at({ ...cubes(fixture('medic')), cured: { blue: true, yellow: false, red: false, black: false } }, 'A02');
    const next = accept(state, move('A01')).state;
    expect(next.cubes).toEqual(state.cubes);
    expect(next.supply).toEqual(state.supply);
  });
});

describe('E04 flights and card costs', () => {
  it.each(['DIRECT_FLIGHT','CHARTER_FLIGHT'] as const)('%s discards exactly its required card', type => {
    const card = type === 'DIRECT_FLIGHT' ? 'p:F08' : 'p:A01';
    const state = fixture('scientist', [card, 'p:B02']);
    const result = accept(state, { type, payload: { destination: 'F08' } });
    expect(result.state.players[0]!.locationId).toBe('F08');
    expect(result.state.players[0]!.hand).toEqual(['p:B02']);
    expect(result.state.playerDiscard).toEqual([card]);
    expect(result.events).toEqual([
      { type: 'CARD_DISCARDED', userId: 'actor', cardId: card },
      { type: 'PLAYER_MOVED', userId: 'actor', from: 'A01', to: 'F08', method: type },
      { type: 'ACTION_SPENT', userId: 'actor', actionsRemaining: 3 },
    ]);
  });
  it.each(['DIRECT_FLIGHT','CHARTER_FLIGHT'] as const)('%s rejects absent, wrong, self and unknown destinations without costs', type => {
    reject(fixture(), { type, payload: { destination: 'F08' } });
    reject(fixture('scientist', [type === 'DIRECT_FLIGHT' ? 'p:A01' : 'p:F08']), { type, payload: { destination: 'F08' } });
    reject(fixture('scientist', ['p:A01']), { type, payload: { destination: 'A01' } });
    reject(fixture('scientist', ['p:A01']), { type, payload: { destination: 'UNKNOWN' } });
  });
  it('prepends successive discarded cards in deterministic order', () => {
    const state = fixture('scientist', ['p:F08','p:A01']);
    const first = accept(state, { type: 'DIRECT_FLIGHT', payload: { destination: 'F08' } }).state;
    const second = accept(first, { type: 'DIRECT_FLIGHT', payload: { destination: 'A01' } }).state;
    expect(second.playerDiscard).toEqual(['p:A01','p:F08']);
  });
});

describe('E05 shuttle', () => {
  it('requires centers at both different endpoints and spends no card', () => {
    const state = { ...fixture('scientist', ['p:F08']), centers: ['A01','F08'] };
    const next = accept(state, { type: 'SHUTTLE', payload: { destination: 'F08' } }).state;
    expect(next.players[0]!.locationId).toBe('F08');
    expect(next.players[0]!.hand).toEqual(['p:F08']);
    expect(next.playerDiscard).toEqual([]);
    for (const centers of [['A01'], ['F08'], ['B01']]) reject({ ...state, centers }, { type: 'SHUTTLE', payload: { destination: 'F08' } });
    reject(state, { type: 'SHUTTLE', payload: { destination: 'A01' } });
    reject(state, { type: 'SHUTTLE', payload: { destination: 'UNKNOWN' } });
  });
});

describe('E06/E07 treatment', () => {
  it.each([
    { role: 'scientist' as Role, cured: false, removed: 1 },
    { role: 'medic' as Role, cured: false, removed: 3 },
    { role: 'scientist' as Role, cured: true, removed: 3 },
    { role: 'medic' as Role, cured: true, removed: 3 },
  ])('treats blue as $role cured=$cured', ({ role, cured, removed }) => {
    const base = cubes(fixture(role)); const state = { ...base, cured: { ...base.cured, blue: cured } };
    const result = accept(state, { type: 'TREAT', payload: { color: 'blue' } });
    expect(result.state.cubes.A01!.blue).toBe(3 - removed);
    expect(result.state.cubes.A01!.red).toBe(2);
    expect(result.state.supply.blue).toBe(state.supply.blue + removed);
    expect(result.events[0]).toEqual({ type: 'CUBES_TREATED', userId: 'actor', locationId: 'A01', color: 'blue', count: removed });
  });
  it('treats a non-home color and rejects absent cubes', () => {
    const state = cubes(fixture());
    const next = accept(state, { type: 'TREAT', payload: { color: 'red' } }).state;
    expect(next.cubes.A01!.red).toBe(1);
    expect(next.supply.red).toBe(state.supply.red + 1);
    reject(state, { type: 'TREAT', payload: { color: 'yellow' } });
  });
});

describe('E08 construction', () => {
  it('ordinary player discards current location card', () => {
    const state = at(fixture('scientist', ['p:B01','p:B02']), 'B01');
    const result = accept(state, { type: 'BUILD_CENTER', payload: {} });
    expect(result.state.centers).toEqual(['A01','B01']);
    expect(result.state.players[0]!.hand).toEqual(['p:B02']);
    expect(result.state.playerDiscard).toEqual(['p:B01']);
    expect(result.events[1]).toEqual({ type: 'CENTER_BUILT', userId: 'actor', locationId: 'B01' });
    reject(at(fixture(), 'B01'), { type: 'BUILD_CENTER', payload: {} });
    reject(at(fixture('scientist', ['p:B02']), 'B01'), { type: 'BUILD_CENTER', payload: {} });
  });
  it('Builder costs no card even when holding the matching card', () => {
    for (const hand of [[], ['p:B01']] as LocationCardId[][]) {
      const state = at(fixture('builder', hand), 'B01');
      const next = accept(state, { type: 'BUILD_CENTER', payload: {} }).state;
      expect(next.players[0]!.hand).toEqual(hand);
      expect(next.playerDiscard).toEqual([]);
    }
  });
  it.each(['scientist','builder'] as const)('rejects existing/seventh centers for %s but accepts the sixth', role => {
    reject(fixture(role, ['p:A01']), { type: 'BUILD_CENTER', payload: {} });
    const state = { ...at(fixture(role, ['p:B01']), 'B01'), centers: ['A01','A02','A03','A04','A05'] };
    const sixth = accept(state, { type: 'BUILD_CENTER', payload: {} }).state;
    expect(sixth.centers).toHaveLength(6);
    const seventh = at({ ...fixture(role, ['p:C01']), centers: sixth.centers }, 'C01');
    reject(seventh, { type: 'BUILD_CENTER', payload: {} });
  });
});

describe('E23 validation and fourth-action boundary', () => {
  it('PASS spends one action only', () => {
    const state = fixture(); const result = accept(state, { type: 'PASS', payload: {} });
    expect(result.state).toEqual({ ...state, actionsRemaining: 3 });
    expect(result.events).toEqual([{ type: 'ACTION_PASSED', userId: 'actor' }, { type: 'ACTION_SPENT', userId: 'actor', actionsRemaining: 3 }]);
  });
  it.each(['MOVE','DIRECT_FLIGHT','CHARTER_FLIGHT','SHUTTLE','TREAT','BUILD_CENTER','PASS'] as const)('fourth %s resolves the turn', type => {
    let state = { ...cubes(fixture('builder', ['p:A01','p:A02'])), actionsRemaining: 1 };
    if (type === 'SHUTTLE') state = { ...state, centers: ['A01','A02'] };
    if (type === 'BUILD_CENTER') state = at(state, 'B01');
    const command: ActionCommand = type === 'TREAT' ? { type, payload: { color: 'blue' } }
      : type === 'PASS' || type === 'BUILD_CENTER' ? { type, payload: {} }
      : { type, payload: { destination: 'A02' } };
    const result = accept(state, command, true);
    expect(result.state).toMatchObject({ phase: 'ACTIONS', activeSeat: 3, actionsRemaining: 4 });
    expect(result.state.playerDeck).toEqual(state.playerDeck.slice(2));
    expect(result.events).toContainEqual({ type: 'ACTION_SPENT', userId: 'actor', actionsRemaining: 0 });
    expect(result.events).toContainEqual({ type: 'PHASE_CHANGED', phase: 'DRAW' });
    reject(result.state, { type: 'PASS', payload: {} }, 'WRONG_TURN');
  });
  it.each(['other','unknown'])('rejects wrong actor %s', actor => reject(fixture(), move('A02'), 'WRONG_TURN', actor));
  it.each(['DRAW','INFECTION','DISCARD_REQUIRED','WON','LOST'] as const)('rejects phase %s', phase => {
    reject({ ...fixture(), phase }, move('A02'), phase === 'WON' || phase === 'LOST' ? 'GAME_FINISHED' : 'WRONG_PHASE');
  });
  it.each([0,-1,5,NaN,1.5])('rejects invalid action budget %s', actionsRemaining => reject({ ...fixture(), actionsRemaining }, move('A02')));
  it.each([null, [], {}, { type: 'NOPE', payload: {} }, { type: 'MOVE' },
    { type: 'MOVE', payload: null }, { type: 'MOVE', payload: { destination: 42 } },
    { type: 'MOVE', payload: { destination: 'A02', extra: true } },
    { type: 'MOVE', payload: { destination: 'A02' }, userId: 'other' },
    { type: 'TREAT', payload: { color: 'green' } }, { type: 'PASS', payload: { extra: 1 } },
    { type: 'BUILD_CENTER', payload: { locationId: 'B01' } },
  ].map(command => ({ command })))('rejects malformed command %#', ({ command }) => reject(fixture(), command, 'BAD_REQUEST'));
});
