import { DurableObject } from 'cloudflare:workers';
import type { Env } from './router';

const HOUR_MS = 3_600_000;
const CREATE_LIMIT = 10;
const REFILL_MS = 2_000;

export type RateFailure = { readonly code: 'RATE_LIMITED'; readonly retryAfter: number };

function blocked(waitMs: number): RateFailure {
  return { code: 'RATE_LIMITED', retryAfter: Math.max(1, Math.ceil(waitMs / 1000)) };
}

/** Call inside the room transaction after checking membership and exact retries. */
export function chargeRoom(sql: SqlStorage, scope: string, now: number, burst: number): RateFailure | null {
  sql.exec('DELETE FROM room_limits WHERE readyAt <= ?', now);
  const prior = sql.exec<{ readyAt: number }>('SELECT readyAt FROM room_limits WHERE scope = ?', scope).toArray()[0];
  const readyAt = Math.max(now, prior?.readyAt ?? now);
  const wait = readyAt - now - (burst - 1) * REFILL_MS;
  if (wait > 0) return blocked(wait);
  sql.exec(`INSERT INTO room_limits (scope, readyAt) VALUES (?, ?)
    ON CONFLICT (scope) DO UPDATE SET readyAt = excluded.readyAt`, scope, readyAt + REFILL_MS);
  return null;
}

/** One counter object per verified UID, isolated from game room storage. */
export class CreateBudget extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS budget (roomId TEXT PRIMARY KEY NOT NULL, endsAt INTEGER NOT NULL)');
  }

  async consume(roomId: string): Promise<RateFailure | null> {
    const { failure, endsAt } = this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      const sql = this.ctx.storage.sql;
      sql.exec('DELETE FROM budget WHERE endsAt <= ?', now);
      const { used, end } = sql.exec<{ used: number; end: number | null }>(
        'SELECT count(*) AS used, min(endsAt) AS end FROM budget',
      ).one();
      const endsAt = end ?? now + HOUR_MS;
      const retry = sql.exec('SELECT 1 FROM budget WHERE roomId = ?', roomId).toArray().length > 0;
      if (retry) return { failure: null, endsAt };
      if (used >= CREATE_LIMIT) return { failure: blocked(endsAt - now), endsAt };
      sql.exec('INSERT INTO budget (roomId, endsAt) VALUES (?, ?)', roomId, endsAt);
      return { failure: null, endsAt };
    });
    if (!failure) await this.ctx.storage.setAlarm(endsAt);
    return failure;
  }

  async alarm(): Promise<void> {
    const sql = this.ctx.storage.sql;
    sql.exec('DELETE FROM budget WHERE endsAt <= ?', Date.now());
    const next = sql.exec<{ endsAt: number }>('SELECT endsAt FROM budget ORDER BY endsAt LIMIT 1').toArray()[0];
    if (next) await this.ctx.storage.setAlarm(next.endsAt);
  }
}
