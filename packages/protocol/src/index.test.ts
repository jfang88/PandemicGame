import { describe, expect, it } from 'vitest';
import { isHealthResponse } from './index';
describe('health protocol', () => {
  it('accepts the expected response', () => expect(isHealthResponse({ ok: true })).toBe(true));
  it.each([null, {}, { ok: false }, { ok: 'true' }, []])('rejects invalid response', value => expect(isHealthResponse(value)).toBe(false));
});
