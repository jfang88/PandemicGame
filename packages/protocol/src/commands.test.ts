import { describe, expect, it } from 'vitest';
import { apiError, isUserId, parseCommandEnvelope, parseCreateRoom, parseJoinRoom, parseRotateInvite } from './index';

const commandId = 'e58b581e-3631-420f-9ea6-4fd9fb6545cf';
const envelope = { protocolVersion: 1, commandId, expectedVersion: 0 };

describe('strict v1 command schemas', () => {
  it.each([
    ['SELECT_ROLE', { role: 'courier' }], ['SET_READY', { ready: false }],
    ['LEAVE_LOBBY', {}], ['START_GAME', {}], ['PASS', {}], ['BUILD_CENTER', {}],
    ['MOVE', { destination: 'A02' }], ['DIRECT_FLIGHT', { destination: 'F08' }],
    ['CHARTER_FLIGHT', { destination: 'D01' }], ['SHUTTLE', { destination: 'A01' }],
    ['TREAT', { color: 'yellow' }], ['GIVE_CARD', { recipientUserId: 'Firebase|User:Case', cardId: 'p:A01' }],
    ['DISCOVER_CURE', { color: 'red', cardIds: ['p:C01'] }], ['DISCARD', { cardIds: ['p:F08'] }],
  ])('accepts %s wire shape', (type, payload) => {
    const value = { ...envelope, type, payload };
    expect(parseCommandEnvelope(value)).toEqual({ ok: true, value });
  });

  it.each([
    { type: 'PASS', payload: {}, userId: 'spoof' },
    { type: 'PASS', payload: [], expectedVersion: 1 },
    { type: 'MOVE', payload: { destination: 'Z01' } },
    { type: 'SELECT_ROLE', payload: { role: 'dispatcher' } },
    { type: 'TREAT', payload: { color: 'orange' } },
    { type: 'SET_READY', payload: { ready: 'true' } },
    { type: 'DISCARD', payload: { cardIds: ['e:1'] } },
    { type: 'DISCARD', payload: { cardIds: [] } },
    { type: 'GIVE_CARD', payload: { recipientUserId: '', cardId: 'p:A01' } },
    { type: 'GIVE_CARD', payload: { recipientUserId: 'x'.repeat(129), cardId: 'p:A01' } },
    { type: 'PASS', payload: {}, expectedVersion: -1 },
    { type: 'PASS', payload: {}, expectedVersion: 1.5 },
    { type: 'PASS', payload: {}, expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
    { type: 'PASS', payload: {}, commandId: 'Firebase|User:Case' },
    { type: 'PASS', payload: { hidden: true } },
    { type: 'UNKNOWN', payload: {} },
  ])('rejects malformed or extra fields %#', value => {
    expect(parseCommandEnvelope({ ...envelope, ...value })).toEqual({ ok: false, code: 'BAD_REQUEST' });
  });

  it('separates incompatible versions from malformed envelopes', () => {
    const value = { ...envelope, type: 'PASS', payload: {} };
    expect(parseCommandEnvelope({ ...value, protocolVersion: 2 })).toEqual({ ok: false, code: 'PROTOCOL_UNSUPPORTED' });
    expect(parseCommandEnvelope({ ...value, protocolVersion: '1' })).toEqual({ ok: false, code: 'BAD_REQUEST' });
  });

  it('canonicalizes UUIDs without changing opaque member identities', () => {
    expect(isUserId('Case敏感' + 'x'.repeat(122))).toBe(true);
    expect(isUserId('x'.repeat(129))).toBe(false);
    expect(parseCreateRoom({ roomId: commandId.toUpperCase() })).toEqual({ ok: true, value: { roomId: commandId } });
    expect(parseCreateRoom({ roomId: commandId, ownerUserId: 'spoof' })).toEqual({ ok: false, code: 'BAD_REQUEST' });
    expect(parseRotateInvite({ commandId, expectedVersion: 5 })).toEqual({ ok: true, value: { commandId, expectedVersion: 5 } });
    expect(parseJoinRoom({ commandId, inviteSecret: 'Url-Safe_Value' })).toEqual({ ok: true, value: { commandId, inviteSecret: 'Url-Safe_Value' } });
    expect(parseJoinRoom({ commandId, inviteSecret: '../unsafe' })).toEqual({ ok: false, code: 'BAD_REQUEST' });
  });

  it('builds an error envelope with the current version only when supplied', () => {
    expect(apiError('STALE_VERSION', 'Refresh.', false, 0)).toEqual({
      status: 409, body: { error: { code: 'STALE_VERSION', message: 'Refresh.', retryable: false }, currentVersion: 0 },
    });
    expect(apiError('UNAUTHENTICATED', 'Sign in.').body).not.toHaveProperty('currentVersion');
  });
});
