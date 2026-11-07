import { createRoot } from 'react-dom/client';
import {
  assertGameInvariants, createGame, loadBoard, type GameState, type LocationCardId, type PlayerCardId,
} from '../../../packages/engine/src/index';
import { LocalGame } from '../src/local/local-play';
import { createLocalTransport } from '../src/local/transport';
import '../src/local/style.css';

const fixture = new URLSearchParams(location.search).get('scenario');
const initial = createGame({ players: [
  { userId: 'local-0', seat: 0, role: 'medic' },
  { userId: 'local-1', seat: 1, role: 'scientist' },
] }, 1);

const seven = ['p:A02', 'p:A03', 'p:A04', 'p:A05', 'p:A06', 'p:A07', 'p:A08'] as const;
const matchingBlack = ['p:D05', 'p:D06', 'p:D07', 'p:D08', 'p:E05'] as const;
const hands: readonly (readonly LocationCardId[])[] =
  fixture === 'transfer' ? [['p:A01'], seven] : fixture === 'victory' ? [matchingBlack, []] : [seven, ['p:A01']];
const draws: readonly PlayerCardId[] = fixture === 'transfer' ? ['p:B01', 'p:B02'] : ['p:B01', 'e:1'];
const remaining = loadBoard().locations.map(({ id }): LocationCardId => `p:${id}`)
  .filter(card => !hands.some(hand => hand.includes(card)));
const epidemics = ['e:1', 'e:2', 'e:3', 'e:4'] as const;
const emptyCubes = Object.fromEntries(Object.keys(initial.cubes).map(id => [id, { blue: 0, yellow: 0, red: 0, black: 0 }]));
const scenario: GameState = fixture === 'full-match' ? initial : {
  ...initial,
  actionsRemaining: 1,
  players: initial.players.map((player, index) => ({ ...player, hand: hands[index]! })),
  playerDeck: fixture === 'victory' ? [] : [...draws, ...remaining.filter(card => !draws.includes(card)),
    ...epidemics.filter(card => !draws.includes(card))],
  playerDiscard: fixture === 'victory' ? remaining : [],
  resolvedEpidemics: fixture === 'victory' ? epidemics : [],
  cured: fixture === 'victory' ? { blue: true, yellow: true, red: true, black: false } : initial.cured,
  cubes: emptyCubes,
  supply: { blue: 24, yellow: 24, red: 24, black: 24 },
};
assertGameInvariants(scenario);

if (import.meta.env.DEV) {
  const transport = createLocalTransport(scenario);
  createRoot(document.getElementById('root')!).render(<LocalGame transport={transport}
    onRestart={() => location.assign('/local.html')} />);
}
