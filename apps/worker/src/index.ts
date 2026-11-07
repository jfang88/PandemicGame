import { guardEdgeIp, route, type Env } from './router';
import { observeRequest } from './telemetry';
import { createFirebaseVerifier } from './firebase-auth';

export { CreateBudget } from './limits';
export { GameRoom } from './game-room';
export type { Env } from './router';

let verifier: { projectId: string; verify: ReturnType<typeof createFirebaseVerifier> } | undefined;

export default {
  fetch(request, env) {
    return observeRequest(request, env, async () => {
      const blocked = await guardEdgeIp(request, env);
      if (blocked) return blocked;
      const { pathname } = new URL(request.url);
      const authorization = request.headers.get('authorization');
      const roomApi = pathname === '/api/rooms' || pathname.startsWith('/api/rooms/');
      const upgrade = request.method === 'GET' && pathname.endsWith('/ws');
      if (!authorization || !roomApi || upgrade) return route(request, env);
      const projectId = env.FIREBASE_PROJECT_ID;
      if (!verifier || verifier.projectId !== projectId) verifier = { projectId, verify: createFirebaseVerifier({ projectId }) };
      return route(request, env, await verifier.verify(authorization));
    });
  },
} satisfies ExportedHandler<Env>;
