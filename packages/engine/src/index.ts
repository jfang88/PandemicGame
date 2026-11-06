/** Engine boundary: no I/O, clocks, or hidden random state. Rules begin in T02. */
export function normalizePlayerCount(count: number): 2 | 3 | 4 {
  if (!Number.isInteger(count) || count < 2 || count > 4) throw new RangeError('Expected 2–4 players');
  return count as 2 | 3 | 4;
}
