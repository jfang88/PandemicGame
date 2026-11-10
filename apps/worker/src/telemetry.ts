import { apiError } from '@pandemic/protocol';
import type { Env } from './router';

function operation(request: Request): string | null {
  const path = new URL(request.url).pathname;
  if (path === '/api/rooms' && request.method === 'POST') return 'create';
  // Ticket-bearing upgrade URLs are outside application telemetry.
  if (!path.startsWith('/api/rooms/') || path.endsWith('/ws')) return null;
  return /^\/api\/rooms\/[^/]+(?:\/(join|commands|invite|ws-ticket|events))?$/.exec(path)?.[1] ?? 'room';
}

export async function observeRequest(request: Request, env: Env, work: () => Promise<Response>): Promise<Response> {
  const route = operation(request);
  if (route === null) return work();
  const start = performance.now();
  let response: Response;
  try {
    response = await work();
  } catch {
    const { body, status } = apiError('TEMPORARILY_UNAVAILABLE', 'Room request temporarily unavailable.', true);
    response = Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
  }
  if (response.status >= 500 || Math.random() < (response.status >= 400 ? 0.05 : 0.01)) {
    const build = env.BUILD_SHA && /^[a-f0-9]{7,40}$/i.test(env.BUILD_SHA) ? env.BUILD_SHA : 'local';
    const ray = request.headers.get('cf-ray');
    const requestId = ray && /^[a-f0-9]{16,32}-[A-Z0-9]{3,5}$/.test(ray) ? ray : crypto.randomUUID();
    console.log({ event: 'room_request', requestId,
      build, route, status: response.status, durationMs: Math.round(performance.now() - start) });
  }
  return response;
}
