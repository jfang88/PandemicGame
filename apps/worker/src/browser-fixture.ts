import { createGame, loadBoard, type GameState, type LocationCardId } from '@pandemic/engine';
import type { PublicRoomSnapshot } from '@pandemic/protocol';

export type BrowserScenario = 'win' | 'loss';

export const BROWSER_SEED = 1;

/** Fixed, invariant-valid starting positions for the loopback browser suite. */
export function browserFixture(snapshot: PublicRoomSnapshot, scenario: BrowserScenario): GameState {
  const players = snapshot.members.map(({ userId, seat, role }) => {
    if (!role) throw new Error('Started room member has no role');
    return { userId, seat, role };
  });
  const base = createGame({ players }, BROWSER_SEED);
  const owner = base.players.find(player => player.userId === snapshot.ownerUserId)!;
  const ready = { ...base, activeSeat: owner.seat, actionsRemaining: 1 };
  if (scenario === 'loss') {
    return {
      ...ready,
      playerDeck: [],
      playerDiscard: base.playerDeck.filter((card): card is LocationCardId => card.startsWith('p:')),
      resolvedEpidemics: ['e:1', 'e:2', 'e:3', 'e:4'],
    };
  }

  const locations = loadBoard().locations;
  const hand = locations.filter(location => location.color === 'blue')
    .slice(0, owner.role === 'scientist' ? 4 : 5)
    .map(({ id }): LocationCardId => `p:${id}`);
  const otherCards = locations.map(({ id }): LocationCardId => `p:${id}`).filter(card => !hand.includes(card));
  return {
    ...ready,
    players: base.players.map(player => ({ ...player, hand: player === owner ? hand : [] })),
    playerDeck: [...otherCards, 'e:1', 'e:2', 'e:3', 'e:4'],
    cured: { blue: false, yellow: true, red: true, black: true },
  };
}
