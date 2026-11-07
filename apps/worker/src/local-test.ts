import { apiError, isUserId, isUuid, type ErrorCode, type RoomEventData } from '@pandemic/protocol';
import { BROWSER_SEED, browserFixture, type BrowserScenario } from './browser-fixture';
import { GameRoom as BaseGameRoom, type ReceiptKind } from './game-room';
import { route, type Env } from './router';

class LocalGameRoom extends BaseGameRoom {
  private nextFault: 'before-events' | 'before-receipt' | 'after-receipt' | 'after-commit' | null = null;

  protected override initialGameSeed(): number {
    return BROWSER_SEED;
  }

  async installBrowserFixture(userId: string, scenario: BrowserScenario) {
    const result = this.read(userId);
    if ('code' in result) return result;
    if (result.snapshot.ownerUserId !== userId) return { code: 'NOT_OWNER' } as const;
    if (result.snapshot.lifecycle !== 'RUNNING') return { code: 'WRONG_PHASE' } as const;
    await this.persistGame(browserFixture(result.snapshot, scenario));
    await this.ctx.storage.sync();
    this.commandCommitted();
    return this.read(userId);
  }

  /** Integration tests arm a fault through runInDurableObject, never an HTTP request. */
  protected failNextCommand(boundary: NonNullable<LocalGameRoom['nextFault']>): void {
    this.nextFault = boundary;
  }

  private failAt(boundary: NonNullable<LocalGameRoom['nextFault']>): void {
    if (this.nextFault !== boundary) return;
    this.nextFault = null;
    throw new Error('Injected command fault');
  }

  protected override recordEvents(events: readonly RoomEventData[], revision: number, timestamp: string): void {
    this.failAt('before-events');
    super.recordEvents(events, revision, timestamp);
  }

  protected override recordReceipt(userId: string, commandId: string, requestHash: string, revision: number,
    kind?: ReceiptKind, privateResult?: string | null): void {
    this.failAt('before-receipt');
    super.recordReceipt(userId, commandId, requestHash, revision, kind, privateResult);
    this.failAt('after-receipt');
  }

  protected override commandCommitted(): void {
    super.commandCommitted();
    this.failAt('after-commit');
  }
}

export { LocalGameRoom as GameRoom };

function fixtureError(code: ErrorCode): Response {
  const { status, body } = apiError(code, 'Local fixture request failed.', false);
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

async function readScenario(request: Request): Promise<BrowserScenario | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 128) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    const body: unknown = JSON.parse(text + decoder.decode());
    if (typeof body !== 'object' || body === null || Object.keys(body).length !== 1 || !('scenario' in body)) return null;
    return body.scenario === 'win' || body.scenario === 'loss' ? body.scenario : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function installFixture(request: Request, env: Env, roomId: string, userId: string): Promise<Response> {
  if (!isUuid(roomId) || request.headers.get('content-type') !== 'application/json') return fixtureError('BAD_REQUEST');
  const scenario = await readScenario(request);
  if (!scenario) return fixtureError('BAD_REQUEST');
  try {
    const stub = env.GAME_ROOMS.getByName(roomId.toLowerCase()) as DurableObjectStub<LocalGameRoom>;
    const result = await stub.installBrowserFixture(userId, scenario);
    return 'code' in result ? fixtureError(result.code)
      : Response.json(result.snapshot, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return fixtureError('INTERNAL_ERROR');
  }
}

/** Loopback Wrangler entry only. The normal Worker never imports this module. */
export default {
  fetch(request, env) {
    const { hostname, pathname } = new URL(request.url);
    const uid = request.headers.get('x-pandemic-test-uid');
    const loopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
    const now = Date.now();
    const expiry = request.headers.get('x-pandemic-test-auth-expires-at');
    const authExpiresAt = expiry === null ? now + 3_600_000 : Number(expiry);
    const valid = Number.isSafeInteger(authExpiresAt) && authExpiresAt <= now + 3_600_000;
    const identity = loopback && isUserId(uid) && valid ? { userId: uid, authExpiresAt } : null;
    if (pathname.startsWith('/__test/')) {
      const roomId = /^\/__test\/rooms\/([^/]+)\/fixture$/.exec(pathname)?.[1];
      if (!loopback || request.method !== 'POST' || !roomId) return fixtureError('ROOM_NOT_FOUND');
      if (!identity) return fixtureError('UNAUTHENTICATED');
      if (authExpiresAt <= now) return fixtureError('TOKEN_EXPIRED');
      return installFixture(request, env, roomId, identity.userId);
    }
    return route(request, env, identity);
  },
} satisfies ExportedHandler<Env>;
