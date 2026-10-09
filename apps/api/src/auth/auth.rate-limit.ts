import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, like, lt, sql } from 'drizzle-orm';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { authRateLimits } from '../database/schema.js';
import { AuthError, unavailable } from './auth.errors.js';

export function rateLimitKey(scope: string, value: string): string {
  const identity = scope.endsWith('address') ? createHash('sha256').update(value).digest('hex').slice(0, 32) : value;
  return `wrapper:${scope}:${identity}`;
}

@Injectable()
export class AuthRateLimiter {
  private nextCleanup = 0;

  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  async consume(key: string, { limit, windowMs }: { limit: number; windowMs: number }): Promise<void> {
    const now = Date.now();
    let row: { count: number; lastRequest: number };
    try {
      // Phase 1 reuses Better Auth's table with isolated wrapper: keys; last_request is the fixed window start.
      const expired = sql`${authRateLimits.lastRequest} <= ${now - windowMs}`;
      [row] = await this.db.insert(authRateLimits).values({ id: randomUUID(), key, count: 1, lastRequest: now })
        .onConflictDoUpdate({ target: authRateLimits.key, set: {
          count: sql`case when ${expired} then 1 else ${authRateLimits.count} + 1 end`,
          lastRequest: sql`case when ${expired} then ${now} else ${authRateLimits.lastRequest} end`,
        } }).returning({ count: authRateLimits.count, lastRequest: authRateLimits.lastRequest });
      if (now >= this.nextCleanup) {
        this.nextCleanup = now + 60_000;
        // One hour is the longest wrapper window. Cleanup never touches native limiter rows.
        await this.db.delete(authRateLimits).where(and(like(authRateLimits.key, 'wrapper:%'), lt(authRateLimits.lastRequest, now - 3_600_000)));
      }
    } catch (cause) { throw unavailable('rate-limit', cause); }
    if (row.count > limit) throw new AuthError(429, 'RATE_LIMITED', 'Too many attempts. Try again later.', {
      retryAfter: Math.max(1, Math.ceil((row.lastRequest + windowMs - now) / 1000)),
    });
  }
}
