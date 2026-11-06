const DOMAIN = 0xffffffff;
export function validateSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 1 || seed > DOMAIN) {
    throw new RangeError('Seed must be a nonzero uint32');
  }
}
export function nextUint32(state: number): number {
  validateSeed(state);
  let x = state;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}
/** Rejection sampling over xorshift32's nonzero domain. Returns the advanced stream. */
export function randomIndex(state: number, bound: number): { value: number; state: number } {
  validateSeed(state);
  if (!Number.isInteger(bound) || bound < 1 || bound > DOMAIN) {
    throw new RangeError('Bound must be an integer from 1 through 4294967295');
  }
  const limit = Math.floor(DOMAIN / bound) * bound;
  let next = state;
  for (;;) {
    next = nextUint32(next);
    const u = next - 1;
    if (u < limit) return { value: u % bound, state: next };
  }
}
export function shuffle<T>(items: readonly T[], state: number): { items: T[]; state: number } {
  validateSeed(state);
  const result = [...items];
  let next = state;
  for (let i = result.length - 1; i > 0; i--) {
    const draw = randomIndex(next, i + 1);
    next = draw.state;
    [result[i], result[draw.value]] = [result[draw.value]!, result[i]!];
  }
  return { items: result, state: next };
}
