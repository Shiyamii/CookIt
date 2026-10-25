import { eq, lt, sql } from 'drizzle-orm';
import type { Database } from '../../db';
import { rateLimits } from './rate-limit.schema';

export type RateLimitRepository = {
  /** Counts one hit for `key` in a fixed window; returns the count and when the window ends. */
  hit(key: string, windowSeconds: number): Promise<{ count: number; resetAt: Date }>;
  /** Takes one hit back (a request that turned out not to count). */
  refund(key: string): Promise<void>;
  deleteOlderThan(date: Date): Promise<void>;
  deleteAll(): Promise<void>;
};

export function createRateLimitRepository(db: Database): RateLimitRepository {
  return {
    async hit(key, windowSeconds) {
      // One atomic upsert: concurrent requests cannot both read the old count.
      const expired = sql`${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds})`;
      const [row] = await db
        .insert(rateLimits)
        .values({ key, count: 1, windowStart: sql`now()` })
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: {
            count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
            windowStart: sql`case when ${expired} then now() else ${rateLimits.windowStart} end`,
          },
        })
        .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
      const windowStart = row?.windowStart ?? new Date();
      return {
        count: row?.count ?? 1,
        resetAt: new Date(windowStart.getTime() + windowSeconds * 1000),
      };
    },

    async refund(key) {
      await db
        .update(rateLimits)
        .set({ count: sql`greatest(${rateLimits.count} - 1, 0)` })
        .where(eq(rateLimits.key, key));
    },

    async deleteAll() {
      await db.delete(rateLimits);
    },

    async deleteOlderThan(date) {
      await db.delete(rateLimits).where(lt(rateLimits.windowStart, date));
    },
  };
}
