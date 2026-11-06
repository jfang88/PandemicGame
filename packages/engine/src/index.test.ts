import { describe, expect, it } from 'vitest';
import { normalizePlayerCount } from './index';
describe('player-count boundary', () => {
  it.each([2, 3, 4] as const)('accepts %i players', count => { expect(normalizePlayerCount(count)).toBe(count); });
  it.each([0, 1, 5, 2.5, NaN, Infinity])('rejects invalid count %s', count => { expect(() => normalizePlayerCount(count)).toThrow(RangeError); });
});
