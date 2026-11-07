import type { ActionEvent } from '@pandemic/engine';
import { isUserId, type PublicRoomSnapshot } from '@pandemic/protocol';
import { GameRoom as BaseGameRoom } from './game-room';
import { route, type Env } from './router';

class LocalGameRoom extends BaseGameRoom {
  private nextFault: 'before-events' | 'before-receipt' | 'after-receipt' | 'after-commit' | null = null;

  /** Integration tests arm a fault through runInDurableObject, never an HTTP request. */
  protected failNextCommand(boundary: NonNullable<LocalGameRoom['nextFault']>): void {
    this.nextFault = boundary;
  }

  private failAt(boundary: NonNullable<LocalGameRoom['nextFault']>): void {
    if (this.nextFault !== boundary) return;
    this.nextFault = null;
    throw new Error('Injected command fault');
  }

  protected override recordEvents(events: readonly ActionEvent[], revision: number, timestamp: string): void {
    this.failAt('before-events');
    super.recordEvents(events, revision, timestamp);
  }

  protected override recordReceipt(userId: string, commandId: string, requestHash: string, revision: number): void {
    this.failAt('before-receipt');
    super.recordReceipt(userId, commandId, requestHash, revision);
    this.failAt('after-receipt');
  }

  protected override commandCommitted(snapshot: PublicRoomSnapshot): void {
    super.commandCommitted(snapshot);
    this.failAt('after-commit');
  }
}

export { LocalGameRoom as GameRoom };

/** Loopback Wrangler entry only. The normal Worker never imports this module. */
export default {
  fetch(request, env) {
    const hostname = new URL(request.url).hostname;
    const uid = request.headers.get('x-pandemic-test-uid');
    const loopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
    return route(request, env, loopback && isUserId(uid) ? uid : null);
  },
} satisfies ExportedHandler<Env>;
