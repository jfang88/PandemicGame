import { BOARD_VERSION, createGame, RULES_VERSION } from '@pandemic/engine';
import { expect, it } from 'vitest';
import { projectRoom, type RoomEvent } from './index';

it('allowlists nested projection fields and bounds recent events', () => {
  const roster = [{ userId: 'Owner', seat: 0, role: 'medic' }, { userId: 'Guest', seat: 3, role: 'scientist' }] as const;
  const state = createGame({ players: roster }, 42);
  const hidden = 'SECRET-MARKER';
  const event = { type: 'ACTION_PASSED', userId: 'Owner', token: hidden } as const;
  const recentEvents: RoomEvent[] = Array.from({ length: 35 }, (_, eventIndex) => ({
    revision: 2, eventIndex, timestamp: '2026-01-01T00:00:00.000Z', event, receiptHash: hidden,
  }));
  const source = {
    roomId: 'test', schemaVersion: 1, rulesVersion: RULES_VERSION, boardVersion: BOARD_VERSION,
    revision: 2, lifecycle: 'RUNNING', ownerUserId: 'Owner',
    members: roster.map(member => ({ ...member, displayName: '  Alice\u202e  ', ready: true, email: hidden })),
    inviteHash: hidden, recentEvents, game: {
      ...state, snapshotSecret: hidden,
      players: state.players.map(player => ({ ...player, accessToken: hidden })),
      cubes: { ...state.cubes, A01: { ...state.cubes.A01!, secret: hidden },
        extra: { ...state.cubes.A01!, secret: hidden } },
      supply: { ...state.supply, private: hidden },
    },
  } as const;
  const snapshot = projectRoom(source);
  const encoded = JSON.stringify(snapshot);
  expect(encoded).not.toContain(hidden);
  expect(snapshot.game).not.toHaveProperty('rngState');
  expect(snapshot.game).not.toHaveProperty('playerDeck');
  expect(snapshot.game).not.toHaveProperty('infectionDeck');
  expect(snapshot.game?.players[1]?.hand).toEqual(state.players[1]?.hand);
  expect(snapshot.game?.playerDeckCount).toBe(state.playerDeck.length);
  expect(snapshot.game?.infectionDeckCount).toBe(state.infectionDeck.length);
  expect(snapshot.members[0]?.displayName).toBe('Alice');
  expect(snapshot.recentEvents).toHaveLength(30);
  expect(snapshot.recentEvents[0]?.eventIndex).toBe(5);
  expect(new TextEncoder().encode(encoded).length).toBeLessThan(64 * 1024);
});
