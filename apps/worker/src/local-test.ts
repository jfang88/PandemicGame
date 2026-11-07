import { isUserId } from '@pandemic/protocol';
import { route, type Env } from './router';

export { GameRoom } from './game-room';

/** Loopback Wrangler entry only. The normal Worker never imports this module. */
export default {
  fetch(request, env) {
    const hostname = new URL(request.url).hostname;
    const uid = request.headers.get('x-pandemic-test-uid');
    const loopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
    return route(request, env, loopback && isUserId(uid) ? uid : null);
  },
} satisfies ExportedHandler<Env>;
