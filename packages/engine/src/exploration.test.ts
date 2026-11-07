import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { applyCommand, assertGameInvariants, createGame, listLegalActions, randomIndex, ROLES,
  type ActionCommand, type GameState } from './index';

const SEEDS = 100;
const COMMAND_CAP = 1000;
const PLAYER_COUNTS = [2, 3, 4] as const;
type TraceEntry = { actorId: string; command: ActionCommand };

function freeze(value: unknown) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}

function setup(playerCount: number, seed: number) {
  const seats = playerCount === 2 ? [0, 3] : playerCount === 3 ? [0, 2, 3] : [0, 1, 2, 3];
  return createGame({ players: seats.map((seat, index) => ({
    userId: `player-${seat}`, seat, role: ROLES[(index + seed - 1) % ROLES.length]!,
  })) }, seed);
}

function checkRejection(state: GameState, actorId: string, command: unknown) {
  const rejected = applyCommand(state, actorId, command);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.state, state);
  assert.equal(rejected.state.rngState, state.rngState);
  assert.equal(rejected.events.length, 0);
}

function explore(playerCount: number, seed: number) {
  const trace: TraceEntry[] = [];
  const expected: string[] = [];
  try {
    let state = setup(playerCount, seed);
    assertGameInvariants(state);
    let selectionRng = seed ^ 0x5a17c9e3;
    for (let step = 0; !state.outcome && step < COMMAND_CAP; step++) {
      freeze(state);
      const actorId = state.continuation?.userId ?? state.players.find(player => player.seat === state.activeSeat)!.userId;
      const actions = listLegalActions(state, actorId);
      assert.ok(actions.length > 0, 'nonterminal game has a legal action');
      const pick = randomIndex(selectionRng, actions.length);
      selectionRng = pick.state;
      const command = actions[pick.value]!;
      trace.push({ actorId, command });
      freeze(command);
      const wrongActor = state.players.find(player => player.userId !== actorId)!.userId;
      assert.equal(listLegalActions(state, wrongActor).length, 0);
      checkRejection(state, wrongActor, command);
      checkRejection(state, actorId, { ...command, unexpected: true });
      const result = applyCommand(state, actorId, command);
      assert.ok(result.ok, 'enumerated action accepted');
      assertGameInvariants(result.state);
      assert.notEqual(result.state, state);
      state = result.state;
      expected.push(JSON.stringify(result));
    }
    assert.ok(state.outcome, `timeout after ${COMMAND_CAP} commands`);
    freeze(state);
    const terminalActor = state.players.find(player => player.seat === state.activeSeat)!.userId;
    assert.equal(listLegalActions(state, terminalActor).length, 0);
    checkRejection(state, terminalActor, { type: 'PASS', payload: {} });

    let replay = setup(playerCount, seed);
    for (const [index, { actorId, command }] of trace.entries()) {
      const result = applyCommand(replay, actorId, command);
      assert.ok(JSON.stringify(result) === expected[index], `replay diverged at command ${index + 1}`);
      replay = result.state;
    }
    return { outcome: state.outcome.kind, commands: trace.length };
  } catch (error) {
    const data = { playerCount, seed, trace };
    const path = `test-results/t06-${playerCount}p-seed-${seed}.json`;
    console.error(`T06 failure trace ${path}: ${JSON.stringify(data)}`);
    try {
      mkdirSync('test-results', { recursive: true });
      writeFileSync(path, JSON.stringify(data, null, 2));
    } catch (writeError) {
      console.error('Could not write trace file', writeError);
    }
    throw new Error(`T06 ${playerCount} players, seed ${seed}, ${trace.length} commands`, { cause: error });
  }
}

it.each(PLAYER_COUNTS)('E24 explores and replays %s-player games', playerCount => {
  let wins = 0;
  let losses = 0;
  let commands = 0;
  let maxCommands = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const result = explore(playerCount, seed);
    if (result.outcome === 'won') wins++;
    else losses++;
    commands += result.commands;
    maxCommands = Math.max(maxCommands, result.commands);
  }
  expect(wins + losses).toBe(SEEDS);
  console.info(`E24 ${playerCount} players: ${SEEDS} seeds, ${commands} commands, max ${maxCommands}, ${wins} wins, ${losses} losses, 0 timeouts`);
}, 120_000);
