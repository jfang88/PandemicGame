/** Engine boundary: no I/O, clocks, or hidden random state. Setup and state contracts are implemented below. */
export function normalizePlayerCount(count: number): 2 | 3 | 4 {
  if (!Number.isInteger(count) || count < 2 || count > 4) throw new RangeError('Expected 2–4 players');
  return count as 2 | 3 | 4;
}

export * from './types';
export { loadBoard } from './board';
export { nextUint32, randomIndex, shuffle } from './random';
export { createGame } from './setup';
export { assertGameInvariants } from './invariants';
export { applyCommand } from './actions';
export type { ActionCommand, ActionError, ActionEvent, ActionResult } from './actions';
