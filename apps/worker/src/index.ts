export interface Env { FIREBASE_PROJECT_ID: string }
export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json; charset=utf-8' } });
  },
} satisfies ExportedHandler<Env>;
