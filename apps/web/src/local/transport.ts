import {
  applyCommand, createGame, listLegalActions,
  type ActionCommand, type GameState, type Role,
} from '../../../../packages/engine/src/index';

export type GameView = ReturnType<typeof projectGame>;

function projectGame(state: GameState) {
  return {
    players: state.players.map(({ userId, seat, role, locationId, hand }) => ({
      userId, seat, role, locationId, hand,
    })),
    activeSeat: state.activeSeat,
    actionsRemaining: state.actionsRemaining,
    phase: state.phase,
    cubes: state.cubes,
    supply: state.supply,
    centers: state.centers,
    cured: state.cured,
    outbreakCount: state.outbreakCount,
    rateIndex: state.rateIndex,
    playerCardsRemaining: state.playerDeck.length,
    infectionCardsRemaining: state.infectionDeck.length,
    discardOwner: state.continuation?.userId ?? null,
    outcome: state.outcome,
  };
}

export interface LocalGameTransport {
  read(): { game: GameView; choices: readonly ActionCommand[] };
  submit(command: ActionCommand): { ok: true } | { ok: false; error: string };
}

export function createLocalTransport(initial: GameState): LocalGameTransport {
  let state = initial;
  function actorId() {
    return state.continuation?.userId ?? state.players.find(player => player.seat === state.activeSeat)!.userId;
  }

  return {
    read: () => ({ game: projectGame(state), choices: listLegalActions(state, actorId()) }),
    submit(command) {
      const result = applyCommand(state, actorId(), command);
      if (!result.ok) return { ok: false, error: result.error };
      state = result.state;
      return { ok: true };
    },
  };
}

export function startLocalGame(roles: readonly Role[]) {
  let seed = 0;
  while (seed === 0) seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  return createLocalTransport(createGame({
    players: roles.map((role, seat) => ({ role, seat, userId: `local-${seat}` })),
  }, seed));
}
