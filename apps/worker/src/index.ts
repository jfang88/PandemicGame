import { route, type Env } from './router';

export { GameRoom } from './game-room';
export type { Env } from './router';

// Production authentication is added in T11. Until then, room routes fail closed.
export default {
  fetch(request, env) {
    return route(request, env);
  },
} satisfies ExportedHandler<Env>;
